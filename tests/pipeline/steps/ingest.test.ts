import { describe, it, expect, beforeEach } from "vitest";
import { cjsMocks } from "../../setup";
import type { Job, StepOutput } from "@/lib/pipeline/types";
import { ingest } from "@/lib/pipeline/steps/ingest";

const mockFetchYoutube = cjsMocks["youtube.cjs"].fetchYoutubeMetadataAndTranscript;
const mockUpdateJob = cjsMocks["db.cjs"].updateJob;

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    url: "https://youtube.com/watch?v=abc123",
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
    ...overrides,
  };
}

describe("ingest step", () => {
  beforeEach(() => {
    mockFetchYoutube.mockReset();
    mockUpdateJob.mockReset().mockResolvedValue({});
  });

  it("returns metadata and transcript on success", async () => {
    const mockMetadata = {
      videoId: "abc123",
      title: "Test Video",
      channel: "Test Channel",
      durationSeconds: 600,
    };
    const mockTranscript = [
      { start_seconds: 0, end_seconds: 5, text: "Hello world" },
      { start_seconds: 5, end_seconds: 10, text: "This is a test" },
    ];

    mockFetchYoutube.mockResolvedValue({ metadata: mockMetadata, transcript: mockTranscript });

    const result = await ingest(makeJob(), {} as StepOutput);

    expect(result.data.metadata).toEqual(mockMetadata);
    expect(result.data.transcript).toEqual(mockTranscript);
    expect(result.summary).toContain("2 transcript segments");
    expect(result.summary).toContain("Test Video");
  });

  it("calls fetchYoutubeMetadataAndTranscript with the job URL", async () => {
    mockFetchYoutube.mockResolvedValue({ metadata: { durationSeconds: 60 }, transcript: [] });

    await ingest(makeJob({ url: "https://youtube.com/watch?v=xyz" }), {} as StepOutput);

    expect(mockFetchYoutube).toHaveBeenCalledWith("https://youtube.com/watch?v=xyz");
  });

  it("persists metadata to the job row via updateJob", async () => {
    const meta = { title: "Saved", durationSeconds: 120 };
    mockFetchYoutube.mockResolvedValue({ metadata: meta, transcript: [] });

    await ingest(makeJob(), {} as StepOutput);

    expect(mockUpdateJob).toHaveBeenCalledWith("job-1", { metadata: meta, status: "ingesting" });
  });

  it("throws if video exceeds 5 hours", async () => {
    mockFetchYoutube.mockResolvedValue({
      metadata: { durationSeconds: 5 * 3600 + 1 },
      transcript: [],
    });

    await expect(ingest(makeJob(), {} as StepOutput)).rejects.toThrow("Source video is too long");
  });

  it("accepts a video exactly at the 5-hour limit", async () => {
    mockFetchYoutube.mockResolvedValue({
      metadata: { durationSeconds: 5 * 3600 },
      transcript: [],
    });

    const result = await ingest(makeJob(), {} as StepOutput);
    expect(result.data.metadata).toBeDefined();
  });

  it("handles null durationSeconds gracefully", async () => {
    mockFetchYoutube.mockResolvedValue({
      metadata: { title: "No Duration" },
      transcript: [{ start_seconds: 0, end_seconds: 5, text: "hi" }],
    });

    const result = await ingest(makeJob(), {} as StepOutput);
    expect(result.summary).toContain("1 transcript segments");
  });

  it("handles empty transcript", async () => {
    mockFetchYoutube.mockResolvedValue({
      metadata: { title: "Empty" },
      transcript: [],
    });

    const result = await ingest(makeJob(), {} as StepOutput);
    expect(result.summary).toContain("0 transcript segments");
  });
});
