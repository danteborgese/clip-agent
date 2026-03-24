import { describe, it, expect } from "vitest";
import { loadFixture, overlapRatio, iou } from "./helpers";
import { EVAL_CASES } from "./eval-cases";

const { generateCandidates } = require("../../scripts/lib/llm.cjs");

const hasApiKey = !!process.env.OPENAI_API_KEY;

describe.skipIf(!hasApiKey)("moment detection accuracy", () => {
  for (const evalCase of EVAL_CASES) {
    it(`${evalCase.id}: finds expected clip`, async () => {
      const fixture = loadFixture(evalCase.fixtureFile);
      const { metadata, transcript } = fixture;

      const candidates = await generateCandidates({
        transcript,
        instruction: evalCase.instruction,
        metadata,
      });

      expect(candidates.length).toBeGreaterThan(0);

      const sorted = [...candidates].sort(
        (a, b) => (b.score ?? 0) - (a.score ?? 0)
      );
      const top = sorted[0];

      const expected = {
        start: evalCase.expectedStart,
        end: evalCase.expectedEnd,
      };

      const ratio = overlapRatio(top, expected);
      const iouScore = iou(top, expected);
      const startDiff = Math.abs(top.start_seconds - expected.start);

      console.log(`\n--- ${evalCase.id} ---`);
      console.log(
        `Expected: ${expected.start}s - ${expected.end}s (${expected.end - expected.start}s)`
      );
      console.log(
        `Got:      ${top.start_seconds.toFixed(1)}s - ${top.end_seconds.toFixed(1)}s (${(top.end_seconds - top.start_seconds).toFixed(1)}s)`
      );
      console.log(`Overlap ratio: ${(ratio * 100).toFixed(1)}%`);
      console.log(`IoU: ${(iouScore * 100).toFixed(1)}%`);
      console.log(`Start diff: ${startDiff.toFixed(1)}s`);
      console.log(`Score: ${top.score}`);
      console.log(`Title: ${top.title}`);

      const minOverlap = evalCase.minOverlap ?? 0.5;
      expect(ratio).toBeGreaterThanOrEqual(minOverlap);
      expect(startDiff).toBeLessThanOrEqual(evalCase.toleranceSeconds);
    });
  }
});
