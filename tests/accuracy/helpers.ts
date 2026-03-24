import fs from "fs";
import path from "path";

export function loadFixture(videoId: string) {
  const fixturePath = path.resolve(
    __dirname,
    "..",
    "fixtures",
    `${videoId}.json`
  );
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture not found: ${fixturePath}`);
  }
  return JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
}

export function overlapSeconds(
  a: { start: number; end: number },
  b: { start: number; end: number }
): number {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return Math.max(0, end - start);
}

export function overlapRatio(
  candidate: { start_seconds: number; end_seconds: number },
  expected: { start: number; end: number }
): number {
  const expectedDuration = expected.end - expected.start;
  if (expectedDuration <= 0) return 0;

  const overlap = overlapSeconds(
    { start: candidate.start_seconds, end: candidate.end_seconds },
    expected
  );
  return overlap / expectedDuration;
}

/**
 * Intersection over Union — stricter metric than simple overlap ratio.
 * Penalizes clips that are too long (low precision) or too short (low recall).
 */
export function iou(
  candidate: { start_seconds: number; end_seconds: number },
  expected: { start: number; end: number }
): number {
  const overlap = overlapSeconds(
    { start: candidate.start_seconds, end: candidate.end_seconds },
    expected
  );
  const union =
    candidate.end_seconds -
    candidate.start_seconds +
    (expected.end - expected.start) -
    overlap;
  return union <= 0 ? 0 : overlap / union;
}

/**
 * Check if the clip transcript contains expected keywords.
 */
export function contentMatch(
  clipText: string,
  keywords: string[]
): { matched: string[]; missed: string[]; ratio: number } {
  const lower = clipText.toLowerCase();
  const matched = keywords.filter((k) => lower.includes(k.toLowerCase()));
  const missed = keywords.filter((k) => !lower.includes(k.toLowerCase()));
  return {
    matched,
    missed,
    ratio: keywords.length > 0 ? matched.length / keywords.length : 1,
  };
}
