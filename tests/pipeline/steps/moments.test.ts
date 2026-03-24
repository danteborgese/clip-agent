import { describe, it, expect, beforeEach } from "vitest";
import { cjsMocks } from "../../setup";
import type { Job, StepOutput } from "@/lib/pipeline/types";
import { moments } from "@/lib/pipeline/steps/moments";

const mockGenerateCandidates = cjsMocks["llm.cjs"].generateCandidates;
const mockInsertCandidates = cjsMocks["db.cjs"].insertCandidatesForJob;
const mockUpdateJob = cjsMocks["db.cjs"].updateJob;
const mockFindSemanticMatch = cjsMocks["llm.cjs"].findSemanticMatch;
const mockComputeConfidenceScore = cjsMocks["llm.cjs"].computeConfidenceScore;
const mockAssessTranscriptQuality = cjsMocks["llm.cjs"].assessTranscriptQuality;

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    url: "https://youtube.com/watch?v=test",
    instruction: "clip when he talks about AI",
    status: "ingesting",
    step: "moments",
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

const sampleTranscript = [
  { start_seconds: 0, end_seconds: 30, text: "Welcome to the show" },
  { start_seconds: 30, end_seconds: 60, text: "Today we talk about AI" },
];

const sampleCandidates = [
  { id: "c-1", start_seconds: 0, end_seconds: 30, title: "Intro", description: "Opening", reason: "Good intro", score: 7 },
  { id: "c-2", start_seconds: 30, end_seconds: 60, title: "AI Discussion", description: "AI talk", reason: "Main topic", score: 9 },
  { id: "c-3", start_seconds: 10, end_seconds: 50, title: "Overlap", description: "Mixed", reason: "Ok", score: 5 },
];

describe("moments step", () => {
  beforeEach(() => {
    mockGenerateCandidates.mockReset();
    mockInsertCandidates.mockReset();
    mockUpdateJob.mockReset().mockResolvedValue({});
    mockFindSemanticMatch.mockReset().mockResolvedValue(null);
    mockComputeConfidenceScore.mockReset().mockReturnValue(null);
    mockAssessTranscriptQuality.mockReset().mockReturnValue(0.8);
  });

  it("generates candidates and selects the highest scored", async () => {
    mockGenerateCandidates.mockResolvedValue(sampleCandidates);
    mockInsertCandidates.mockResolvedValue(sampleCandidates);

    const accumulated: StepOutput = { metadata: { title: "Test" }, transcript: sampleTranscript };
    const result = await moments(makeJob(), accumulated);

    expect(result.data.candidates).toEqual(sampleCandidates);
    expect(result.data.selectedCandidateId).toBe("c-2");
    expect(result.data.bestCandidate).toEqual(sampleCandidates[1]);
    expect(result.summary).toContain("3 candidates");
    expect(result.summary).toContain("AI Discussion");
  });

  it("passes transcript and instruction to generateCandidates", async () => {
    mockGenerateCandidates.mockResolvedValue([sampleCandidates[0]]);
    mockInsertCandidates.mockResolvedValue([sampleCandidates[0]]);

    const accumulated: StepOutput = { metadata: { title: "Test" }, transcript: sampleTranscript };
    await moments(makeJob({ instruction: "find the AI part" }), accumulated);

    expect(mockGenerateCandidates).toHaveBeenCalledWith({
      transcript: sampleTranscript,
      instruction: "find the AI part",
      metadata: { title: "Test" },
    });
  });

  it("saves candidates to DB via insertCandidatesForJob", async () => {
    mockGenerateCandidates.mockResolvedValue(sampleCandidates);
    mockInsertCandidates.mockResolvedValue(sampleCandidates);

    await moments(makeJob(), { metadata: {}, transcript: [] } as StepOutput);

    expect(mockInsertCandidates).toHaveBeenCalledWith("job-1", sampleCandidates);
  });

  it("updates job with selected_candidate_id", async () => {
    mockGenerateCandidates.mockResolvedValue(sampleCandidates);
    mockInsertCandidates.mockResolvedValue(sampleCandidates);

    await moments(makeJob(), { metadata: {}, transcript: [] } as StepOutput);

    expect(mockUpdateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ selected_candidate_id: "c-2" }));
  });

  it("throws when no candidates are generated", async () => {
    mockGenerateCandidates.mockResolvedValue([]);
    mockInsertCandidates.mockResolvedValue([]);

    await expect(
      moments(makeJob(), { metadata: {}, transcript: sampleTranscript } as StepOutput)
    ).rejects.toThrow("No candidate moments generated");
  });

  it("handles candidates with missing/null scores", async () => {
    const candidates = [
      { id: "c-1", start_seconds: 0, end_seconds: 30, title: "A", description: "", reason: "", score: null },
      { id: "c-2", start_seconds: 10, end_seconds: 40, title: "B", description: "", reason: "", score: 3 },
    ];
    mockGenerateCandidates.mockResolvedValue(candidates);
    mockInsertCandidates.mockResolvedValue(candidates);

    const result = await moments(makeJob(), { metadata: {}, transcript: [] } as StepOutput);

    expect(result.data.selectedCandidateId).toBe("c-2");
  });

  it("selects first candidate when all scores are equal", async () => {
    const candidates = [
      { id: "c-1", start_seconds: 0, end_seconds: 30, title: "First", description: "", reason: "", score: 5 },
      { id: "c-2", start_seconds: 10, end_seconds: 40, title: "Second", description: "", reason: "", score: 5 },
    ];
    mockGenerateCandidates.mockResolvedValue(candidates);
    mockInsertCandidates.mockResolvedValue(candidates);

    const result = await moments(makeJob(), { metadata: {}, transcript: [] } as StepOutput);

    expect(result.data.selectedCandidateId).toBe("c-1");
  });

  it("includes confidence when computeConfidenceScore returns a result", async () => {
    mockGenerateCandidates.mockResolvedValue(sampleCandidates);
    mockInsertCandidates.mockResolvedValue(sampleCandidates);
    mockComputeConfidenceScore.mockReturnValue({
      score: 0.75,
      signals: [{ name: "score_gap", value: 0.4 }],
    });

    const result = await moments(makeJob(), { metadata: {}, transcript: sampleTranscript } as StepOutput);

    expect(result.data.confidence).toBe(0.75);
    expect(result.data.confidenceSignals).toEqual([{ name: "score_gap", value: 0.4 }]);
    expect(mockUpdateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({
      confidence: 0.75,
      confidence_signals: [{ name: "score_gap", value: 0.4 }],
    }));
  });

  it("returns null confidence when computeConfidenceScore returns null", async () => {
    mockGenerateCandidates.mockResolvedValue([sampleCandidates[0]]);
    mockInsertCandidates.mockResolvedValue([sampleCandidates[0]]);
    mockComputeConfidenceScore.mockReturnValue(null);

    const result = await moments(makeJob(), { metadata: {}, transcript: [] } as StepOutput);

    expect(result.data.confidence).toBeNull();
  });

  it("uses semantic match when embeddings are available", async () => {
    mockGenerateCandidates.mockResolvedValue(sampleCandidates);
    mockInsertCandidates.mockResolvedValue(sampleCandidates);
    mockFindSemanticMatch.mockResolvedValue({ similarity: 0.85 });
    mockComputeConfidenceScore.mockReturnValue({ score: 0.8, signals: [] });

    const embeddings = [{ start_seconds: 0, end_seconds: 30, embedding: [0.1] }];
    const accumulated: StepOutput = {
      metadata: {},
      transcript: sampleTranscript,
      transcriptEmbeddings: embeddings,
    };

    const result = await moments(makeJob(), accumulated);

    expect(mockFindSemanticMatch).toHaveBeenCalledWith("clip when he talks about AI", embeddings);
    expect(result.data.semanticSimilarity).toBe(0.85);
  });
});
