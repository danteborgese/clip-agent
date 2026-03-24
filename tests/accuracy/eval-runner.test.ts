import { describe, it, expect } from "vitest";
import { loadFixture, overlapRatio, iou, contentMatch } from "./helpers";
import { EVAL_CASES } from "./eval-cases";

const { generateCandidates } = require("../../scripts/lib/llm.cjs");
const { buildSentencesFromTranscript } = require("../../scripts/lib/transcriptUtils.cjs");

const hasApiKey = !!process.env.OPENAI_API_KEY;

describe.skipIf(!hasApiKey)("eval runner", () => {
  it("runs all eval cases and reports metrics", async () => {
    const results = [];

    for (const evalCase of EVAL_CASES) {
      const fixture = loadFixture(evalCase.fixtureFile);
      const { metadata, transcript } = fixture;

      const candidates = await generateCandidates({
        transcript,
        instruction: evalCase.instruction,
        metadata,
      });

      const sorted = [...candidates].sort(
        (a, b) => (b.score ?? 0) - (a.score ?? 0)
      );
      const top = sorted[0];

      const expected = {
        start: evalCase.expectedStart,
        end: evalCase.expectedEnd,
      };

      const ratio = top ? overlapRatio(top, expected) : 0;
      const iouScore = top ? iou(top, expected) : 0;
      const startDiff = top
        ? Math.abs(top.start_seconds - expected.start)
        : Infinity;
      const duration = top ? top.end_seconds - top.start_seconds : 0;

      // Content keyword matching
      let contentResult = { matched: [] as string[], missed: [] as string[], ratio: 1 };
      if (evalCase.expectedContentKeywords && top) {
        const sentences = buildSentencesFromTranscript(transcript);
        const clipSentences = sentences.filter(
          (s: { start_seconds: number; end_seconds: number }) =>
            s.start_seconds >= top.start_seconds && s.end_seconds <= top.end_seconds
        );
        const clipText = clipSentences.map((s: { text: string }) => s.text).join(" ");
        contentResult = contentMatch(clipText, evalCase.expectedContentKeywords);
      }

      const minOverlap = evalCase.minOverlap ?? 0.5;

      results.push({
        id: evalCase.id,
        overlapRatio: ratio,
        iou: iouScore,
        startDiff,
        duration,
        contentMatchRatio: contentResult.ratio,
        missedKeywords: contentResult.missed,
        pass:
          ratio >= minOverlap &&
          startDiff <= evalCase.toleranceSeconds &&
          contentResult.ratio >= 0.5,
      });
    }

    console.log("\n=== Eval Results ===");
    console.log(
      `${"ID".padEnd(25)} ${"Status".padEnd(6)} ${"Overlap".padEnd(10)} ${"IoU".padEnd(10)} ${"StartΔ".padEnd(10)} ${"Duration".padEnd(10)} ${"Content".padEnd(10)}`
    );
    console.log("-".repeat(81));

    for (const r of results) {
      const status = r.pass ? "PASS" : "FAIL";
      console.log(
        `${r.id.padEnd(25)} ${status.padEnd(6)} ${(r.overlapRatio * 100).toFixed(1).padStart(5)}%    ${(r.iou * 100).toFixed(1).padStart(5)}%    ${r.startDiff.toFixed(1).padStart(6)}s   ${r.duration.toFixed(0).padStart(6)}s   ${(r.contentMatchRatio * 100).toFixed(0).padStart(5)}%`
      );
      if (r.missedKeywords.length > 0) {
        console.log(`  Missed keywords: ${r.missedKeywords.join(", ")}`);
      }
    }

    const passCount = results.filter((r) => r.pass).length;
    const avgOverlap =
      results.reduce((sum, r) => sum + r.overlapRatio, 0) / results.length;
    const avgIou =
      results.reduce((sum, r) => sum + r.iou, 0) / results.length;

    console.log(`\n${passCount}/${results.length} cases passed`);
    console.log(`Mean overlap: ${(avgOverlap * 100).toFixed(1)}%`);
    console.log(`Mean IoU: ${(avgIou * 100).toFixed(1)}%`);

    expect(passCount).toBe(results.length);
  });
});
