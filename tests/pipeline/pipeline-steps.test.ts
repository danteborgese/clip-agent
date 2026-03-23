import { describe, it, expect } from "vitest";
import { PIPELINE_STEPS } from "@/lib/pipeline/steps-config";
import { STEP_ORDER } from "@/lib/pipeline/types";

describe("Pipeline Steps Config", () => {
  it("has a config entry for every step in STEP_ORDER", () => {
    const configKeys = PIPELINE_STEPS.map((s) => s.key);
    expect(configKeys).toEqual(STEP_ORDER);
  });

  it("each step has a non-empty label and description", () => {
    for (const step of PIPELINE_STEPS) {
      expect(step.label.length).toBeGreaterThan(0);
      expect(step.description.length).toBeGreaterThan(0);
    }
  });

  it("has 5 steps matching the pipeline order", () => {
    expect(PIPELINE_STEPS).toHaveLength(5);
    expect(PIPELINE_STEPS[0].key).toBe("ingest");
    expect(PIPELINE_STEPS[1].key).toBe("moments");
    expect(PIPELINE_STEPS[2].key).toBe("clip");
    expect(PIPELINE_STEPS[3].key).toBe("publish");
    expect(PIPELINE_STEPS[4].key).toBe("done");
  });

  it("done step is labeled 'Complete'", () => {
    const done = PIPELINE_STEPS.find((s) => s.key === "done");
    expect(done?.label).toBe("Complete");
  });
});
