#!/usr/bin/env node

const path = require("path");
const fs = require("fs");
const envLocal = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocal)) {
  try {
    require("dotenv").config({ path: envLocal });
  } catch (_) {
    // dotenv not installed; rely on env vars being set
  }
}

const { getJobById, updateJob, insertCandidatesForJob } = require("./lib/db.cjs");
const { fetchYoutubeMetadataAndTranscript } = require("./lib/youtube.cjs");
const { generateCandidates, generateTags } = require("./lib/llm.cjs");
const { downloadYoutubeVideo } = require("./lib/downloader.cjs");
const { trimVideoSegment } = require("./lib/ffmpeg.cjs");
const { uploadFileToDrive } = require("./lib/googleDrive.cjs");
const { createNotionClipPage } = require("./lib/notion.cjs");
const { buildSentencesFromTranscript } = require("./lib/transcriptUtils.cjs");

// Safety limits
// Allow long podcasts (up to 5 hours), but cap individual clips to 12 minutes.
const MAX_SOURCE_DURATION_SECONDS = 5 * 3600; // 5 hours
const MAX_CLIP_DURATION_SECONDS = 12 * 60; // 12 minutes per clip

async function main() {
  const jobId = process.env.JOB_ID;
  if (!jobId) {
    console.error("JOB_ID env var is required");
    process.exit(1);
  }

  try {
    let job = await getJobById(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    job = await updateJob(jobId, { status: "ingesting" });
    const { metadata, transcript } = await fetchYoutubeMetadataAndTranscript(job.url);

    if (
      metadata &&
      typeof metadata.durationSeconds === "number" &&
      metadata.durationSeconds > MAX_SOURCE_DURATION_SECONDS
    ) {
      throw new Error(
        `Source video is too long (${metadata.durationSeconds}s). Max supported duration is ${MAX_SOURCE_DURATION_SECONDS}s.`
      );
    }

    job = await updateJob(jobId, { metadata });

    // STEP 2 – ingest complete
    console.log("STEP 2 – ingest complete", {
      jobId,
      url: job.url,
      durationSeconds: metadata?.durationSeconds,
      transcriptSegments: Array.isArray(transcript) ? transcript.length : 0,
      title: metadata?.title,
      channel: metadata?.channel,
    });

    job = await updateJob(jobId, { status: "moments" });
    const candidates = await generateCandidates({
      transcript,
      instruction: job.instruction,
      metadata,
    });
    const storedCandidates = await insertCandidatesForJob(jobId, candidates);
    const best = selectBestCandidate(storedCandidates);
    job = await updateJob(jobId, { selected_candidate_id: best.id });

    // STEP 6 – best candidate selected
    console.log("STEP 6 – best candidate selected", {
      jobId,
      totalCandidates: storedCandidates.length,
      best: {
        id: best.id,
        start_seconds: best.start_seconds,
        end_seconds: best.end_seconds,
        score: best.score,
        title: best.title,
      },
    });

    job = await updateJob(jobId, { status: "clipping" });
    const sourcePath = await downloadYoutubeVideo(job.url);

    let start = Math.max(0, Number(best.start_seconds) || 0);
    let rawEnd = Number(best.end_seconds) || start + MAX_CLIP_DURATION_SECONDS;
    let end = Math.min(rawEnd, start + MAX_CLIP_DURATION_SECONDS);

    // STEP 7 – initial times
    console.log("STEP 7 – initial times", {
      jobId,
      start,
      rawEnd,
      cappedEnd: end,
    });

    ({ start, end } = tryOverrideWithKeywordWindow({
      start,
      end,
      transcript,
      instruction: job.instruction,
    }));

    // Snap start/end to nearest transcript segment boundaries for cleaner cuts.
    ({ start, end } = snapToTranscriptBounds(start, end, transcript));

    // Re-apply max duration cap after snapping.
    rawEnd = start + MAX_CLIP_DURATION_SECONDS;
    end = Math.min(end, rawEnd);

    // STEP 7 – snapped times
    console.log("STEP 7 – snapped times", {
      jobId,
      snappedStart: start,
      snappedEnd: end,
    });

    const clipDurationSeconds = Math.max(0, end - start);

    const clipPath = await trimVideoSegment(sourcePath, start, end);

    // STEP 9 – trim complete
    console.log("STEP 9 – trim complete", {
      jobId,
      sourcePath,
      clipPath,
      start,
      end,
      durationSeconds: clipDurationSeconds,
    });

    let clipSizeBytes = null;
    try {
      const stats = fs.statSync(clipPath);
      clipSizeBytes = typeof stats.size === "number" ? stats.size : null;
    } catch (_) {
      clipSizeBytes = null;
    }

    const { fileId, link } = await uploadFileToDrive(clipPath, best.title);

    // Clean up local files once upload has succeeded.
    try {
      if (fs.existsSync(sourcePath)) fs.unlinkSync(sourcePath);
      if (fs.existsSync(clipPath)) fs.unlinkSync(clipPath);
    } catch (_) {
      // Ignore cleanup errors.
    }

    job = await updateJob(jobId, {
      drive_file_id: fileId,
      drive_link: link,
    });

    const notionCandidates = storedCandidates.map((c) => ({
      start_seconds: Number(c.start_seconds),
      end_seconds: Number(c.end_seconds),
      title: c.title,
      description: c.description,
      reason: c.reason,
      score: typeof c.score === "number" ? c.score : null,
    }));

    let tags = [];
    try {
      tags = await generateTags({
        instruction: job.instruction,
        metadata,
        candidates: notionCandidates,
      });
    } catch (_) {
      tags = [];
    }

    job = await updateJob(jobId, { status: "notion" });
    const notionPageId = await createNotionClipPage({
      title: best.title,
      description: best.description,
      sourceUrl: job.url,
      driveLink: link,
      metadata,
      candidates: notionCandidates,
      tags,
      clipDurationSeconds,
      fileSizeBytes: clipSizeBytes,
    });

    await updateJob(jobId, { notion_page_id: notionPageId, status: "done" });

    // STEP 10 – job marked done
    console.log("STEP 10 – job marked done", { jobId, notionPageId });
  } catch (err) {
    console.error("Job failed:", err);
    await updateJob(jobId, {
      status: "failed",
      error: err && err.message ? String(err.message) : String(err),
    });
    process.exit(1);
  }
}

function selectBestCandidate(candidates) {
  if (!candidates || candidates.length === 0) {
    throw new Error("No candidate moments generated for this job");
  }
  const sorted = [...candidates].sort((a, b) => {
    const scoreA = typeof a.score === "number" ? a.score : 0;
    const scoreB = typeof b.score === "number" ? b.score : 0;
    return scoreB - scoreA;
  });
  return sorted[0];
}

function extractQuotedPhrases(text) {
  const phrases = [];
  const str = String(text || "");
  const regex = /["']([^"']+)["']/g;
  let match;
  while ((match = regex.exec(str)) !== null) {
    const phrase = match[1].trim();
    if (phrase) phrases.push(phrase);
  }
  return phrases;
}

const NUMBER_WORDS_LOCAL = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
};

const DIGIT_TO_WORD_LOCAL = Object.entries(NUMBER_WORDS_LOCAL).reduce(
  (acc, [word, digit]) => {
    acc[digit] = word;
    return acc;
  },
  {}
);

function tryOverrideWithKeywordWindow({ start, end, transcript, instruction }) {
  if (!Array.isArray(transcript) || !transcript.length || !instruction) {
    return { start, end };
  }

  const sentences = buildSentencesFromTranscript(transcript);
  if (!Array.isArray(sentences) || !sentences.length) {
    return { start, end };
  }

  // 1) If the user explicitly quoted a phrase, try to anchor on that phrase.
  const quoted = extractQuotedPhrases(instruction);
  if (quoted.length > 0) {
    const phrase = quoted[0].toLowerCase();
    const base = phrase.replace(/-/g, " ").replace(/\s+/g, " ").trim();
    const parts = base.split(" ").filter(Boolean);

    const phraseTokens = [];
    for (const p of parts) {
      phraseTokens.push(p);
      if (NUMBER_WORDS_LOCAL[p]) {
        phraseTokens.push(NUMBER_WORDS_LOCAL[p]);
      }
      if (DIGIT_TO_WORD_LOCAL[p]) {
        phraseTokens.push(DIGIT_TO_WORD_LOCAL[p]);
      }
    }

    const uniqueTokens = Array.from(new Set(phraseTokens));

    let bestSentence = null;
    let bestHits = 0;

    for (const s of sentences) {
      const norm = String(s.text || "")
        .toLowerCase()
        .replace(/-/g, " ")
        .replace(/\s+/g, " ");
      let hits = 0;
      for (const tok of uniqueTokens) {
        if (tok && norm.includes(tok)) hits += 1;
      }
      if (hits > bestHits) {
        bestHits = hits;
        bestSentence = s;
      }
    }

    const minRequired = Math.max(1, Math.floor(uniqueTokens.length * 0.6));
    if (bestSentence && bestHits >= minRequired) {
      const windowStart = Math.max(0, bestSentence.start_seconds - 10);
      const windowEnd = Math.max(
        bestSentence.end_seconds + 20,
        windowStart + 25
      );
      return {
        start: windowStart,
        end: Math.min(windowEnd, windowStart + MAX_CLIP_DURATION_SECONDS),
      };
    }
  }

  const allWords = String(instruction || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const STOPWORDS = new Set([
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "when",
    "where",
    "what",
    "about",
    "clip",
    "part",
    "talks",
    "talking",
    "says",
  ]);

  const content = Array.from(
    new Set(allWords.filter((w) => w.length >= 4 && !STOPWORDS.has(w)))
  );

  if (!content.length) {
    return { start, end };
  }

  const requiredCount = content.length >= 2 ? 2 : 1;

  const matching = [];
  for (const s of sentences) {
    const lower = String(s.text || "").toLowerCase().replace(/-/g, " ");
    let count = 0;
    for (const w of content) {
      if (lower.includes(w)) {
        count += 1;
      }
    }
    if (count >= requiredCount) {
      matching.push(s);
    }
  }

  if (!matching.length) {
    return { start, end };
  }

  const originalCenter = (start + end) / 2;
  let bestSentence = matching[0];
  let bestDist = Math.abs(
    ((matching[0].start_seconds + matching[0].end_seconds) / 2) - originalCenter
  );

  for (let i = 1; i < matching.length; i++) {
    const s = matching[i];
    const center = (s.start_seconds + s.end_seconds) / 2;
    const dist = Math.abs(center - originalCenter);
    if (dist < bestDist) {
      bestSentence = s;
      bestDist = dist;
    }
  }

  const windowStart = Math.max(0, bestSentence.start_seconds - 15);
  const windowEnd = Math.max(
    bestSentence.end_seconds + 20,
    windowStart + 30
  );

  return {
    start: windowStart,
    end: Math.min(windowEnd, windowStart + MAX_CLIP_DURATION_SECONDS),
  };
}

function snapToTranscriptBounds(start, end, transcript) {
  if (!Array.isArray(transcript) || transcript.length === 0) {
    return { start, end };
  }

  const sentences = buildSentencesFromTranscript(transcript);

  if (Array.isArray(sentences) && sentences.length > 0) {
    let snappedStart = start;
    let snappedEnd = end;

    // Snap start to the start of the sentence that contains it, or the next sentence.
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i];
      if (s.start_seconds <= start && s.end_seconds >= start) {
        snappedStart = s.start_seconds;
        break;
      }
      if (s.start_seconds > start) {
        snappedStart = s.start_seconds;
        break;
      }
    }

    // Snap end to the end of the sentence that contains it, or the previous sentence.
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i];
      if (s.start_seconds <= end && s.end_seconds >= end) {
        snappedEnd = s.end_seconds;
        break;
      }
      if (s.start_seconds > end) {
        snappedEnd = s.end_seconds;
        break;
      }
    }

    if (snappedEnd <= snappedStart) {
      snappedEnd = snappedStart + 5; // ensure a minimal positive duration
    }

    return { start: snappedStart, end: snappedEnd };
  }

  // Fallback to raw transcript segments if sentence grouping failed.
  let snappedStart = start;
  let snappedEnd = end;

  for (let i = 0; i < transcript.length; i++) {
    const seg = transcript[i];
    if (seg.start_seconds <= start && seg.end_seconds >= start) {
      snappedStart = seg.start_seconds;
      break;
    }
    if (seg.start_seconds > start) {
      snappedStart = seg.start_seconds;
      break;
    }
  }

  for (let i = 0; i < transcript.length; i++) {
    const seg = transcript[i];
    if (seg.start_seconds <= end && seg.end_seconds >= end) {
      snappedEnd = seg.end_seconds;
      break;
    }
    if (seg.start_seconds > end) {
      snappedEnd = seg.end_seconds;
      break;
    }
  }

  if (snappedEnd <= snappedStart) {
    snappedEnd = snappedStart + 5;
  }

  return { start: snappedStart, end: snappedEnd };
}

main().catch((err) => {
  console.error("Unexpected error in process-job:", err);
  process.exit(1);
});
