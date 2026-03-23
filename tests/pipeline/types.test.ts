import { describe, it, expect } from "vitest";
import { STEP_ORDER } from "@/lib/pipeline/types";
import type { PipelineStep, Job, StepDetail, StepResult } from "@/lib/pipeline/types";

describe("Pipeline Types", () => {
  describe("STEP_ORDER", () => {
    it("has 5 steps in the correct order", () => {
      expect(STEP_ORDER).toEqual(["ingest", "moments", "clip", "publish", "done"]);
    });

    it("starts with ingest and ends with done", () => {
      expect(STEP_ORDER[0]).toBe("ingest");
      expect(STEP_ORDER[STEP_ORDER.length - 1]).toBe("done");
    });

    it("has no duplicate steps", () => {
      const unique = new Set(STEP_ORDER);
      expect(unique.size).toBe(STEP_ORDER.length);
    });
  });

  describe("Type contracts", () => {
    it("PipelineStep matches STEP_ORDER values", () => {
      const steps: PipelineStep[] = ["ingest", "moments", "clip", "publish", "done"];
      expect(steps).toEqual(STEP_ORDER);
    });

    it("Job interface has required fields", () => {
      const job: Job = {
        id: "test-id",
        url: "https://youtube.com/watch?v=test",
        instruction: "clip the intro",
        status: "pending",
        step: "ingest",
        step_output: {},
        step_details: [],
        platform: "youtube",
        metadata: null,
        selected_candidate_id: null,
        clip_storage_path: null,
        clip_url: null,
        notion_page_id: null,
        error: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };
      expect(job.id).toBe("test-id");
      expect(job.step).toBe("ingest");
    });

    it("StepDetail tracks step lifecycle", () => {
      const active: StepDetail = {
        step: "ingest",
        status: "active",
        startedAt: "2024-01-01T00:00:00Z",
      };
      expect(active.status).toBe("active");
      expect(active.completedAt).toBeUndefined();

      const completed: StepDetail = {
        ...active,
        status: "completed",
        completedAt: "2024-01-01T00:01:00Z",
        summary: "Fetched 100 segments",
      };
      expect(completed.status).toBe("completed");
      expect(completed.summary).toBeDefined();

      const failed: StepDetail = {
        ...active,
        status: "failed",
        completedAt: "2024-01-01T00:01:00Z",
        error: "Video too long",
      };
      expect(failed.status).toBe("failed");
      expect(failed.error).toBeDefined();
    });

    it("StepResult has data and summary", () => {
      const result: StepResult = {
        data: { metadata: { title: "Test" }, transcript: [] },
        summary: "Fetched 0 transcript segments",
      };
      expect(result.data).toBeDefined();
      expect(result.summary).toContain("transcript");
    });
  });
});
