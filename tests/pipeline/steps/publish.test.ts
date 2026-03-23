import { describe, it, expect, beforeEach } from "vitest";
import { cjsMocks } from "../../setup";
import type { Job, StepOutput } from "@/lib/pipeline/types";
import { publish } from "@/lib/pipeline/steps/publish";

const mockGenerateTags = cjsMocks["llm.cjs"].generateTags;
const mockCreateNotionPage = cjsMocks["notion.cjs"].createNotionClipPage;
const mockUpdateJob = cjsMocks["db.cjs"].updateJob;

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    url: "https://youtube.com/watch?v=test",
    instruction: "clip about AI",
    status: "clipping",
    step: "publish",
    step_output: {},
    step_details: [],
    platform: "youtube",
    metadata: null,
    selected_candidate_id: "c-1",
    clip_storage_path: "job-1/clip.mp4",
    clip_url: "https://storage.test/clip.mp4",
    notion_page_id: null,
    error: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

const defaultAccumulated: StepOutput = {
  metadata: { title: "Test Video", channel: "Test Channel" },
  transcript: [],
  candidates: [
    { start_seconds: 10, end_seconds: 50, title: "AI Talk", description: "About AI", reason: "Main topic", score: 9 },
    { start_seconds: 60, end_seconds: 90, title: "Intro", description: "Opening", reason: "Start", score: 5 },
  ],
  bestCandidate: { title: "AI Talk", description: "About AI" },
  clipUrl: "https://storage.test/clip.mp4",
  clipDuration: 40,
  fileSize: 2048000,
};

describe("publish step", () => {
  beforeEach(() => {
    mockGenerateTags.mockReset().mockResolvedValue(["AI", "Technology", "Discussion"]);
    mockCreateNotionPage.mockReset().mockResolvedValue("notion-page-123");
    mockUpdateJob.mockReset().mockResolvedValue({});
  });

  it("creates a Notion page and returns notionPageId", async () => {
    const result = await publish(makeJob(), defaultAccumulated);

    expect(result.data.notionPageId).toBe("notion-page-123");
    expect(result.summary).toBe("Published to Notion");
  });

  it("generates tags from instruction and metadata", async () => {
    await publish(makeJob({ instruction: "find the AI discussion" }), defaultAccumulated);

    expect(mockGenerateTags).toHaveBeenCalledWith({
      instruction: "find the AI discussion",
      metadata: { title: "Test Video", channel: "Test Channel" },
      candidates: expect.any(Array),
    });
  });

  it("updates job with notion_page_id", async () => {
    await publish(makeJob(), defaultAccumulated);

    expect(mockUpdateJob).toHaveBeenCalledWith("job-1", { notion_page_id: "notion-page-123" });
  });

  it("does not set status directly — orchestrator owns status transitions", async () => {
    await publish(makeJob(), defaultAccumulated);

    // Only call should be notion_page_id update, not status
    const statusCalls = mockUpdateJob.mock.calls.filter(
      ([, patch]: [string, Record<string, unknown>]) => "status" in patch
    );
    expect(statusCalls).toHaveLength(0);
  });

  it("continues with empty tags if generateTags throws", async () => {
    mockGenerateTags.mockRejectedValue(new Error("LLM error"));

    const result = await publish(makeJob(), defaultAccumulated);

    expect(result.data.notionPageId).toBe("notion-page-123");

    const notionCall = mockCreateNotionPage.mock.calls[0][0];
    expect(notionCall.tags).toEqual([]);
  });

  it("passes candidates through to Notion without remapping", async () => {
    const accumulated: StepOutput = {
      ...defaultAccumulated,
      candidates: [
        { start_seconds: 0, end_seconds: 30, title: "A", description: "d", reason: "r", score: undefined },
      ],
    };

    await publish(makeJob(), accumulated);

    const notionCall = mockCreateNotionPage.mock.calls[0][0];
    expect(notionCall.candidates[0].score).toBeUndefined();
  });

  it("handles null fileSize gracefully", async () => {
    const accumulated: StepOutput = { ...defaultAccumulated, fileSize: null };

    await publish(makeJob(), accumulated);

    const notionCall = mockCreateNotionPage.mock.calls[0][0];
    expect(notionCall.fileSizeBytes).toBeNull();
  });
});
