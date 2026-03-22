import { describe, it, expect, vi, beforeEach } from "vitest";
import { cjsMocks } from "../../setup";
import type { Job, StepOutput } from "@/lib/pipeline/types";

const mockDownload = cjsMocks["downloader.cjs"].downloadYoutubeVideo;
const mockTrim = cjsMocks["ffmpeg.cjs"].trimVideoSegment;
const mockUploadStorage = cjsMocks["supabaseStorage.cjs"].uploadClipToStorage;
const mockBuildSentences = cjsMocks["transcriptUtils.cjs"].buildSentencesFromTranscript;
const mockUpdateJob = cjsMocks["db.cjs"].updateJob;

// Mock fs so we don't touch real filesystem
vi.mock("fs", () => ({
  statSync: () => ({ size: 1024000 }),
  existsSync: () => false,
  unlinkSync: vi.fn(),
  default: {
    statSync: () => ({ size: 1024000 }),
    existsSync: () => false,
    unlinkSync: vi.fn(),
  },
}));

import { clip } from "@/lib/pipeline/steps/clip";

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    url: "https://youtube.com/watch?v=test",
    instruction: "clip the intro",
    status: "moments",
    step: "clip",
    step_output: {},
    step_details: [],
    platform: "youtube",
    metadata: null,
    selected_candidate_id: "c-1",
    clip_storage_path: null,
    clip_url: null,
    notion_page_id: null,
    error: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

const defaultAccumulated: StepOutput = {
  metadata: { title: "Test" },
  transcript: [
    { start_seconds: 0, end_seconds: 30, text: "Hello world" },
    { start_seconds: 30, end_seconds: 60, text: "This is the main content" },
  ],
  bestCandidate: { id: "c-1", start_seconds: 10, end_seconds: 50, title: "Best Clip", score: 9 },
  candidates: [],
};

describe("clip step", () => {
  beforeEach(() => {
    mockDownload.mockReset().mockResolvedValue("/tmp/source.mp4");
    mockTrim.mockReset().mockResolvedValue("/tmp/clip-out.mp4");
    mockUploadStorage.mockReset().mockResolvedValue({ storagePath: "clips/test.mp4", publicUrl: "https://storage.test/clip.mp4" });
    mockBuildSentences.mockReset().mockReturnValue([
      { start_seconds: 0, end_seconds: 30, text: "Hello world" },
      { start_seconds: 30, end_seconds: 60, text: "This is the main content" },
    ]);
    mockUpdateJob.mockReset().mockResolvedValue({});
  });

  it("downloads video, trims, and uploads", async () => {
    const result = await clip(makeJob(), defaultAccumulated);

    expect(mockDownload).toHaveBeenCalledWith("https://youtube.com/watch?v=test");
    expect(mockTrim).toHaveBeenCalled();
    expect(result.data.clipDuration).toBeGreaterThan(0);
    expect(result.data.fileSize).toBe(1024000);
  });

  it("caps clip duration to 12 minutes", async () => {
    const accumulated: StepOutput = {
      ...defaultAccumulated,
      bestCandidate: { id: "c-1", start_seconds: 0, end_seconds: 900, title: "Long Clip", score: 8 },
    };
    mockBuildSentences.mockReturnValue([]);

    await clip(makeJob({ instruction: "" }), accumulated);

    const trimEnd = mockTrim.mock.calls[0][2];
    expect(trimEnd).toBeLessThanOrEqual(720);
  });

  it("returns summary with clip duration", async () => {
    mockBuildSentences.mockReturnValue([]);
    const result = await clip(makeJob({ instruction: "" }), defaultAccumulated);

    expect(result.summary).toMatch(/Clipped \d+s/);
  });

  it("handles zero start_seconds gracefully", async () => {
    const accumulated: StepOutput = {
      ...defaultAccumulated,
      bestCandidate: { id: "c-1", start_seconds: 0, end_seconds: 30, title: "Start", score: 8 },
    };
    mockBuildSentences.mockReturnValue([]);

    const result = await clip(makeJob({ instruction: "" }), accumulated);
    expect(result.data.clipDuration).toBeGreaterThanOrEqual(0);
  });

  it("handles missing end_seconds with default cap", async () => {
    const accumulated: StepOutput = {
      ...defaultAccumulated,
      bestCandidate: { id: "c-1", start_seconds: 100, end_seconds: undefined, title: "No End", score: 5 },
    };
    mockBuildSentences.mockReturnValue([]);

    const result = await clip(makeJob({ instruction: "" }), accumulated);
    expect(result.data.clipDuration).toBeLessThanOrEqual(720);
  });
});
