import { describe, it, expect, vi, beforeEach } from "vitest";
import { cjsMocks } from "../setup";
import type { Job, StepDetail } from "@/lib/pipeline/types";

// ─── In-memory job store ─────────────────────────────────────────────────────

let mockJobStore: Record<string, Job> = {};

// Wire up db.cjs mocks to use the in-memory store
const mockGetJobById = cjsMocks["db.cjs"].getJobById;
const mockUpdateJob = cjsMocks["db.cjs"].updateJob;

function wireDbMocks() {
  mockGetJobById.mockImplementation(async (id: string) => {
    const job = mockJobStore[id];
    if (!job) throw new Error(`Job ${id} not found`);
    return { ...job };
  });

  mockUpdateJob.mockImplementation(async (id: string, patch: Record<string, unknown>) => {
    if (!mockJobStore[id]) throw new Error(`Job ${id} not found`);
    mockJobStore[id] = { ...mockJobStore[id], ...patch } as Job;
    return { ...mockJobStore[id] };
  });
}

// ─── Mock step handlers ──────────────────────────────────────────────────────

const mockIngest = vi.fn();
const mockMoments = vi.fn();
const mockClip = vi.fn();
const mockPublish = vi.fn();

vi.mock("@/lib/pipeline/steps/ingest", () => ({ ingest: (...args: unknown[]) => mockIngest(...args) }));
vi.mock("@/lib/pipeline/steps/moments", () => ({ moments: (...args: unknown[]) => mockMoments(...args) }));
vi.mock("@/lib/pipeline/steps/clip", () => ({ clip: (...args: unknown[]) => mockClip(...args) }));
vi.mock("@/lib/pipeline/steps/publish", () => ({ publish: (...args: unknown[]) => mockPublish(...args) }));

import { runPipeline } from "@/lib/pipeline/orchestrator";

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    url: "https://youtube.com/watch?v=test",
    instruction: "clip the intro",
    status: "pending",
    step: "ingest" as const,
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
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJobStore = {};
    wireDbMocks();
  });

  it("runs all 4 steps to completion for a pending job", async () => {
    mockJobStore["job-1"] = makeJob();

    mockIngest.mockResolvedValue({ data: { metadata: {}, transcript: [] }, summary: "Ingested" });
    mockMoments.mockResolvedValue({ data: { candidates: [], bestCandidate: {} }, summary: "Found moments" });
    mockClip.mockResolvedValue({ data: { clipUrl: "https://storage.test/test" }, summary: "Clipped" });
    mockPublish.mockResolvedValue({ data: { notionPageId: "page-1" }, summary: "Published" });

    await runPipeline("job-1");

    expect(mockIngest).toHaveBeenCalledOnce();
    expect(mockMoments).toHaveBeenCalledOnce();
    expect(mockClip).toHaveBeenCalledOnce();
    expect(mockPublish).toHaveBeenCalledOnce();

    expect(mockJobStore["job-1"].step).toBe("done");
    expect(mockJobStore["job-1"].status).toBe("done");
  });

  it("accumulates step_output across steps", async () => {
    mockJobStore["job-1"] = makeJob();

    mockIngest.mockResolvedValue({ data: { metadata: { title: "Test" }, transcript: [{ text: "hi" }] }, summary: "ok" });
    mockMoments.mockImplementation(async (_job: unknown, accumulated: Record<string, unknown>) => {
      expect(accumulated.metadata).toEqual({ title: "Test" });
      expect(accumulated.transcript).toEqual([{ text: "hi" }]);
      return { data: { bestCandidate: { id: "c-1" } }, summary: "ok" };
    });
    mockClip.mockImplementation(async (_job: unknown, accumulated: Record<string, unknown>) => {
      expect(accumulated.metadata).toEqual({ title: "Test" });
      expect(accumulated.bestCandidate).toEqual({ id: "c-1" });
      return { data: { clipUrl: "link" }, summary: "ok" };
    });
    mockPublish.mockImplementation(async (_job: unknown, accumulated: Record<string, unknown>) => {
      expect(accumulated.clipUrl).toBe("link");
      return { data: { notionPageId: "np-1" }, summary: "ok" };
    });

    await runPipeline("job-1");
  });

  it("marks job as failed when a step throws", async () => {
    mockJobStore["job-1"] = makeJob();

    mockIngest.mockRejectedValue(new Error("Video too long"));

    await expect(runPipeline("job-1")).rejects.toThrow("Video too long");

    expect(mockJobStore["job-1"].status).toBe("failed");
    expect(mockJobStore["job-1"].error).toBe("Video too long");
    expect(mockMoments).not.toHaveBeenCalled();
    expect(mockClip).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("records step_details for each step", async () => {
    mockJobStore["job-1"] = makeJob();

    mockIngest.mockResolvedValue({ data: {}, summary: "Ingested 50 segments" });
    mockMoments.mockResolvedValue({ data: {}, summary: "Found 5 candidates" });
    mockClip.mockResolvedValue({ data: {}, summary: "Clipped 60s" });
    mockPublish.mockResolvedValue({ data: {}, summary: "Published to Notion" });

    await runPipeline("job-1");

    const details: StepDetail[] = mockJobStore["job-1"].step_details;
    const completedSteps = details.filter((d) => d.status === "completed");
    expect(completedSteps.length).toBe(4);

    const steps = completedSteps.map((d) => d.step);
    expect(steps).toContain("ingest");
    expect(steps).toContain("moments");
    expect(steps).toContain("clip");
    expect(steps).toContain("publish");
  });

  it("records failed step in step_details on error", async () => {
    mockJobStore["job-1"] = makeJob();

    mockIngest.mockResolvedValue({ data: {}, summary: "ok" });
    mockMoments.mockRejectedValue(new Error("LLM timeout"));

    await expect(runPipeline("job-1")).rejects.toThrow("LLM timeout");

    const details: StepDetail[] = mockJobStore["job-1"].step_details;
    const failedDetail = details.find((d) => d.status === "failed");
    expect(failedDetail).toBeDefined();
    expect(failedDetail?.step).toBe("moments");
    expect(failedDetail?.error).toBe("LLM timeout");
  });

  it("resumes from a mid-pipeline step", async () => {
    mockJobStore["job-1"] = makeJob({
      status: "ingesting",
      step: "moments",
      step_output: { metadata: { title: "Prev" }, transcript: [] },
      step_details: [{ step: "ingest", status: "completed", startedAt: "2024-01-01T00:00:00Z", completedAt: "2024-01-01T00:01:00Z", summary: "done" }],
    });

    mockMoments.mockResolvedValue({ data: { bestCandidate: {} }, summary: "ok" });
    mockClip.mockResolvedValue({ data: { clipUrl: "link" }, summary: "ok" });
    mockPublish.mockResolvedValue({ data: { notionPageId: "p-1" }, summary: "ok" });

    await runPipeline("job-1");

    expect(mockIngest).not.toHaveBeenCalled();
    expect(mockMoments).toHaveBeenCalledOnce();
    expect(mockClip).toHaveBeenCalledOnce();
    expect(mockPublish).toHaveBeenCalledOnce();

    expect(mockJobStore["job-1"].step).toBe("done");
    expect(mockJobStore["job-1"].status).toBe("done");
  });

  it("does nothing for an already-done job", async () => {
    mockJobStore["job-1"] = makeJob({ status: "done", step: "done" });

    await runPipeline("job-1");

    expect(mockIngest).not.toHaveBeenCalled();
    expect(mockMoments).not.toHaveBeenCalled();
    expect(mockClip).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("transitions pending job to ingesting before running", async () => {
    mockJobStore["job-1"] = makeJob({ status: "pending", step: "ingest" });

    mockIngest.mockResolvedValue({ data: {}, summary: "ok" });
    mockMoments.mockResolvedValue({ data: {}, summary: "ok" });
    mockClip.mockResolvedValue({ data: {}, summary: "ok" });
    mockPublish.mockResolvedValue({ data: {}, summary: "ok" });

    await runPipeline("job-1");

    expect(mockJobStore["job-1"].status).toBe("done");
  });
});
