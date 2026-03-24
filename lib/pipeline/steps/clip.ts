import * as fs from "fs";
import type { StepHandler } from "../types";
import { requireScript } from "../require-cjs";

const MAX_CLIP_DURATION_SECONDS = 12 * 60; // 12 minutes

export const clip: StepHandler = async (job, accumulated, onSubstep) => {
  const { downloadYoutubeVideo } = requireScript("downloader.cjs");
  const { trimVideoSegment } = requireScript("ffmpeg.cjs");
  const { uploadClipToStorage } = requireScript("supabaseStorage.cjs");
  const { buildSentencesFromTranscript } = requireScript("transcriptUtils.cjs");
  const { updateJob } = requireScript("db.cjs");
  const llm = requireScript("llm.cjs");
  const findSemanticMatch = typeof llm.findSemanticMatch === "function" ? llm.findSemanticMatch : null;

  const best = accumulated.bestCandidate as {
    id: string;
    start_seconds: number;
    end_seconds: number;
    title: string;
    score?: number;
  };
  const transcript = accumulated.transcript as Array<{
    start_seconds: number;
    end_seconds: number;
    text: string;
  }>;
  const transcriptEmbeddings = accumulated.transcriptEmbeddings as Array<{
    start_seconds: number;
    end_seconds: number;
    embedding: number[];
  }> | null;
  const confidence = accumulated.confidence as number | null;

  let sourcePath: string;
  const isUpload = job.platform === "upload";

  if (isUpload) {
    // Direct upload — file is already local
    await onSubstep?.("Using uploaded video file...");
    sourcePath = job.url; // url field stores the local file path for uploads
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Uploaded video file not found: ${sourcePath}`);
    }
  } else {
    // YouTube — download the video
    await onSubstep?.("Downloading source video...");
    const onProgress = onSubstep
      ? (pct: number) => onSubstep(`Downloading source video... ${Math.round(pct)}%`)
      : undefined;
    sourcePath = await downloadYoutubeVideo(job.url, onProgress, job.id);
  }

  let start = Math.max(0, Number(best.start_seconds) || 0);
  const rawEnd = Number(best.end_seconds) || start + MAX_CLIP_DURATION_SECONDS;
  let end = Math.min(rawEnd, start + MAX_CLIP_DURATION_SECONDS);

  // Improvement #3: Try semantic matching first, fall back to keyword matching
  let usedSemantic = false;
  if (transcriptEmbeddings) {
    try {
      const match = await findSemanticMatch(job.instruction, transcriptEmbeddings);
      if (match && match.similarity > 0.4) {
        // Use semantic match to refine the window around the LLM-selected range
        const semanticCenter = (match.start_seconds + match.end_seconds) / 2;
        const llmCenter = (start + end) / 2;
        const llmDuration = end - start;

        // If semantic match is within reasonable range of LLM selection, use it to refine
        if (Math.abs(semanticCenter - llmCenter) < llmDuration * 2) {
          const refinedStart = Math.max(0, match.start_seconds - 15);
          const refinedEnd = match.end_seconds + 20;
          // Blend: keep LLM's broader range but anchor around semantic match
          start = Math.min(start, refinedStart);
          end = Math.max(end, Math.min(refinedEnd, start + MAX_CLIP_DURATION_SECONDS));
          usedSemantic = true;
        }
      }
    } catch {
      // Fall through to keyword matching
    }
  }

  if (!usedSemantic) {
    ({ start, end } = tryOverrideWithKeywordWindow({
      start,
      end,
      transcript,
      instruction: job.instruction,
      buildSentencesFromTranscript,
    }));
  }

  ({ start, end } = snapToTranscriptBounds(start, end, transcript, buildSentencesFromTranscript));

  end = Math.min(end, start + MAX_CLIP_DURATION_SECONDS);

  const clipDuration = Math.max(0, end - start);
  await onSubstep?.(`Trimming ${clipDuration.toFixed(0)}s clip...`);
  const clipPath = await trimVideoSegment(sourcePath, start, end);

  let clipSizeBytes: number | null = null;
  try {
    clipSizeBytes = fs.statSync(clipPath).size;
  } catch {
    clipSizeBytes = null;
  }

  // Improvement #8: Multi-modal clip verification
  let visionScore: number | null = null;
  try {
    visionScore = await verifyClipWithVision(clipPath, job.instruction);
    if (visionScore !== null) {
      await onSubstep?.(`Vision verification score: ${visionScore}/5`);
    }
  } catch {
    // Non-critical, continue without vision check
  }

  await onSubstep?.("Uploading clip to storage...");
  const { storagePath, publicUrl } = await uploadClipToStorage(clipPath, job.id, best.title);

  // Cleanup temp files (always delete clip, delete source for uploads too)
  for (const p of [sourcePath, clipPath]) {
    try { fs.unlinkSync(p); } catch { /* ignore */ }
  }

  // Extract transcript sentences that fall within the clip time range
  const sentences = buildSentencesFromTranscript(transcript);
  const clipTranscript = sentences
    .filter((s: { start_seconds: number; end_seconds: number }) =>
      s.start_seconds >= start && s.end_seconds <= end
    )
    .map((s: { start_seconds: number; end_seconds: number; text: string }) => ({
      start_seconds: +(s.start_seconds - start).toFixed(1),
      end_seconds: +(s.end_seconds - start).toFixed(1),
      text: s.text,
    }));

  // Improvement #6: Check confidence + vision for needs_review status
  const needsReview =
    (confidence !== null && confidence < 0.6) ||
    (visionScore !== null && visionScore <= 2);

  if (needsReview) {
    await updateJob(job.id, {
      clip_storage_path: storagePath,
      clip_url: publicUrl,
      clip_transcript: clipTranscript,
      status: "needs_review",
    });
  } else {
    await updateJob(job.id, {
      clip_storage_path: storagePath,
      clip_url: publicUrl,
      clip_transcript: clipTranscript,
    });
  }

  return {
    data: {
      clipStoragePath: storagePath,
      clipUrl: publicUrl,
      clipDuration,
      fileSize: clipSizeBytes,
      visionScore,
      needsReview,
      usedSemanticMatching: usedSemantic,
    },
    summary: `Clipped ${clipDuration.toFixed(0)}s, uploaded to storage${needsReview ? " (flagged for review)" : ""}`,
  };
};

// --- Multi-modal verification (Improvement #8) ---

async function verifyClipWithVision(
  clipPath: string,
  instruction: string
): Promise<number | null> {
  const OpenAI = require("openai");
  const { execSync } = require("child_process");
  const path = require("path");

  const client = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;
  if (!client) return null;

  // Extract 3 keyframes
  const framesDir = path.join(process.cwd(), "tmp", "frames");
  if (!fs.existsSync(framesDir)) {
    fs.mkdirSync(framesDir, { recursive: true });
  }

  const baseName = path.basename(clipPath, path.extname(clipPath));
  try {
    execSync(
      `ffmpeg -i "${clipPath}" -vf "select=not(mod(n\\,90)),scale=480:-1" -frames:v 3 -q:v 5 "${framesDir}/${baseName}_%02d.jpg" -y 2>/dev/null`,
      { stdio: "pipe" }
    );
  } catch {
    return null;
  }

  const frameFiles = fs
    .readdirSync(framesDir)
    .filter((f: string) => f.startsWith(baseName) && f.endsWith(".jpg"))
    .sort()
    .slice(0, 3);

  if (frameFiles.length === 0) return null;

  const imageContent = frameFiles.map((f: string) => {
    const data = fs.readFileSync(path.join(framesDir, f));
    return {
      type: "image_url" as const,
      image_url: {
        url: `data:image/jpeg;base64,${data.toString("base64")}`,
      },
    };
  });

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1",
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content:
            "You verify video clips match user instructions. Rate 1-5 how well the visual content matches. Return JSON: {\"score\": N, \"reason\": \"...\"}",
        },
        {
          role: "user",
          content: [
            {
              type: "text" as const,
              text: `Instruction: "${instruction}"\n\nDo these frames from the clip match the instruction?`,
            },
            ...imageContent,
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    return typeof parsed.score === "number" ? parsed.score : null;
  } catch {
    return null;
  } finally {
    // Cleanup frames
    for (const f of frameFiles) {
      try { fs.unlinkSync(path.join(framesDir, f)); } catch { /* ignore */ }
    }
  }
}

// --- Helper functions (keyword fallback) ---

const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12",
};
const DIGIT_TO_WORD: Record<string, string> = Object.fromEntries(
  Object.entries(NUMBER_WORDS).map(([w, d]) => [d, w])
);

function extractQuotedPhrases(text: string): string[] {
  const phrases: string[] = [];
  const regex = /["']([^"']+)["']/g;
  let match;
  while ((match = regex.exec(String(text || ""))) !== null) {
    const phrase = match[1].trim();
    if (phrase) phrases.push(phrase);
  }
  return phrases;
}

interface TranscriptSegment {
  start_seconds: number;
  end_seconds: number;
  text: string;
}

function tryOverrideWithKeywordWindow({
  start,
  end,
  transcript,
  instruction,
  buildSentencesFromTranscript,
}: {
  start: number;
  end: number;
  transcript: TranscriptSegment[];
  instruction: string;
  buildSentencesFromTranscript: (t: TranscriptSegment[]) => TranscriptSegment[];
}): { start: number; end: number } {
  if (!Array.isArray(transcript) || !transcript.length || !instruction) {
    return { start, end };
  }

  const sentences = buildSentencesFromTranscript(transcript);
  if (!Array.isArray(sentences) || !sentences.length) {
    return { start, end };
  }

  // Try quoted phrase matching first
  const quoted = extractQuotedPhrases(instruction);
  if (quoted.length > 0) {
    const phrase = quoted[0].toLowerCase();
    const base = phrase.replace(/-/g, " ").replace(/\s+/g, " ").trim();
    const parts = base.split(" ").filter(Boolean);

    const phraseTokens: string[] = [];
    for (const p of parts) {
      phraseTokens.push(p);
      if (NUMBER_WORDS[p]) phraseTokens.push(NUMBER_WORDS[p]);
      if (DIGIT_TO_WORD[p]) phraseTokens.push(DIGIT_TO_WORD[p]);
    }
    const uniqueTokens = Array.from(new Set(phraseTokens));

    let bestSentence: TranscriptSegment | null = null;
    let bestHits = 0;

    for (const s of sentences) {
      const norm = String(s.text || "").toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ");
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
      const windowEnd = Math.max(bestSentence.end_seconds + 20, windowStart + 25);
      return {
        start: windowStart,
        end: Math.min(windowEnd, windowStart + MAX_CLIP_DURATION_SECONDS),
      };
    }
  }

  // Fall back to content-word matching
  const allWords = String(instruction || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const STOPWORDS = new Set([
    "the", "and", "for", "with", "this", "that", "when", "where",
    "what", "about", "clip", "part", "talks", "talking", "says",
  ]);
  const content = Array.from(new Set(allWords.filter((w) => w.length >= 4 && !STOPWORDS.has(w))));
  if (!content.length) return { start, end };

  const requiredCount = content.length >= 2 ? 2 : 1;
  const matching: TranscriptSegment[] = [];
  for (const s of sentences) {
    const lower = String(s.text || "").toLowerCase().replace(/-/g, " ");
    let count = 0;
    for (const w of content) {
      if (lower.includes(w)) count += 1;
    }
    if (count >= requiredCount) matching.push(s);
  }

  if (!matching.length) return { start, end };

  const originalCenter = (start + end) / 2;
  let bestSentence = matching[0];
  let bestDist = Math.abs((matching[0].start_seconds + matching[0].end_seconds) / 2 - originalCenter);

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
  const windowEnd = Math.max(bestSentence.end_seconds + 20, windowStart + 30);
  return {
    start: windowStart,
    end: Math.min(windowEnd, windowStart + MAX_CLIP_DURATION_SECONDS),
  };
}

function snapToTranscriptBounds(
  start: number,
  end: number,
  transcript: TranscriptSegment[],
  buildSentences: (t: TranscriptSegment[]) => TranscriptSegment[]
): { start: number; end: number } {
  if (!Array.isArray(transcript) || transcript.length === 0) {
    return { start, end };
  }

  const sentences = buildSentences(transcript);
  const segments = Array.isArray(sentences) && sentences.length > 0 ? sentences : transcript;

  let snappedStart = start;
  let snappedEnd = end;

  for (const s of segments) {
    if (s.start_seconds <= start && s.end_seconds >= start) {
      snappedStart = s.start_seconds;
      break;
    }
    if (s.start_seconds > start) {
      snappedStart = s.start_seconds;
      break;
    }
  }

  let prev: TranscriptSegment | null = null;
  for (const s of segments) {
    if (s.start_seconds <= end && s.end_seconds >= end) {
      snappedEnd = s.end_seconds;
      break;
    }
    if (s.start_seconds > end) {
      snappedEnd = prev ? prev.end_seconds : end;
      break;
    }
    prev = s;
  }

  if (snappedEnd <= snappedStart) {
    snappedEnd = snappedStart + 5;
  }

  return { start: snappedStart, end: snappedEnd };
}
