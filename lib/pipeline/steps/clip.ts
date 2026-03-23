import * as fs from "fs";
import type { StepHandler } from "../types";
import { requireScript } from "../require-cjs";

const MAX_CLIP_DURATION_SECONDS = 12 * 60; // 12 minutes

export const clip: StepHandler = async (job, accumulated) => {
  const { downloadYoutubeVideo } = requireScript("downloader.cjs");
  const { trimVideoSegment } = requireScript("ffmpeg.cjs");
  const { uploadClipToStorage } = requireScript("supabaseStorage.cjs");
  const { buildSentencesFromTranscript } = requireScript("transcriptUtils.cjs");
  const { updateJob } = requireScript("db.cjs");

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

  const sourcePath = await downloadYoutubeVideo(job.url);

  let start = Math.max(0, Number(best.start_seconds) || 0);
  const rawEnd = Number(best.end_seconds) || start + MAX_CLIP_DURATION_SECONDS;
  let end = Math.min(rawEnd, start + MAX_CLIP_DURATION_SECONDS);

  ({ start, end } = tryOverrideWithKeywordWindow({
    start,
    end,
    transcript,
    instruction: job.instruction,
    buildSentencesFromTranscript,
  }));

  ({ start, end } = snapToTranscriptBounds(start, end, transcript, buildSentencesFromTranscript));

  end = Math.min(end, start + MAX_CLIP_DURATION_SECONDS);

  const clipDuration = Math.max(0, end - start);
  const clipPath = await trimVideoSegment(sourcePath, start, end);

  let clipSizeBytes: number | null = null;
  try {
    clipSizeBytes = fs.statSync(clipPath).size;
  } catch {
    clipSizeBytes = null;
  }

  const { storagePath, publicUrl } = await uploadClipToStorage(clipPath, job.id, best.title);

  // Cleanup temp files
  for (const p of [sourcePath, clipPath]) {
    try { fs.unlinkSync(p); } catch { /* ignore */ }
  }

  await updateJob(job.id, { clip_storage_path: storagePath, clip_url: publicUrl });

  return {
    data: {
      clipStoragePath: storagePath,
      clipUrl: publicUrl,
      clipDuration,
      fileSize: clipSizeBytes,
    },
    summary: `Clipped ${clipDuration.toFixed(0)}s, uploaded to storage`,
  };
};

// --- Helper functions ---

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
