import type { StepHandler } from "../types";
import { requireScript } from "../require-cjs";

export const moments: StepHandler = async (job, accumulated, onSubstep) => {
  const llm = requireScript("llm.cjs");
  const { generateCandidates } = llm;
  const findSemanticMatch = typeof llm.findSemanticMatch === "function" ? llm.findSemanticMatch : null;
  const computeConfidenceScore = typeof llm.computeConfidenceScore === "function" ? llm.computeConfidenceScore : null;
  const assessTranscriptQuality = typeof llm.assessTranscriptQuality === "function" ? llm.assessTranscriptQuality : null;
  const { insertCandidatesForJob, updateJob } = requireScript("db.cjs");

  const transcript = accumulated.transcript as Array<{
    start_seconds: number;
    end_seconds: number;
    text: string;
  }>;
  const metadata = accumulated.metadata as Record<string, unknown>;
  const transcriptEmbeddings = accumulated.transcriptEmbeddings as Array<{
    start_seconds: number;
    end_seconds: number;
    embedding: number[];
    similarity?: number;
  }> | null;
  const transcriptQuality = (accumulated.transcriptQuality as number) ?? null;

  await onSubstep?.("Scanning transcript for matching moments...");

  const candidates = await generateCandidates({
    transcript,
    instruction: job.instruction,
    metadata,
  });

  await onSubstep?.(`Found ${candidates.length} candidates, selecting best match...`);

  const storedCandidates = await insertCandidatesForJob(job.id, candidates);

  const best = [...storedCandidates].sort(
    (a: { score?: number }, b: { score?: number }) => (b.score ?? 0) - (a.score ?? 0)
  )[0];

  if (!best) {
    throw new Error("No candidate moments generated for this job");
  }

  // Improvement #6: Compute confidence score (graceful degradation)
  let semanticSimilarity: number | null = null;
  if (findSemanticMatch && transcriptEmbeddings) {
    try {
      const match = await findSemanticMatch(job.instruction, transcriptEmbeddings);
      semanticSimilarity = match?.similarity ?? null;
    } catch {
      // Non-critical
    }
  }

  let confidence: { score: number; signals: { name: string; value: number }[] } | null = null;
  if (computeConfidenceScore) {
    const tq = transcriptQuality ?? (assessTranscriptQuality ? assessTranscriptQuality(transcript) : 0.8);
    confidence = computeConfidenceScore({
      candidates: storedCandidates,
      bestCandidate: best,
      semanticSimilarity,
      transcriptQuality: tq,
    });
  }

  await updateJob(job.id, {
    selected_candidate_id: best.id,
    ...(confidence
      ? {
          confidence: confidence.score,
          confidence_signals: confidence.signals,
        }
      : {}),
  });

  return {
    data: {
      candidates: storedCandidates,
      selectedCandidateId: best.id,
      bestCandidate: best,
      confidence: confidence?.score ?? null,
      confidenceSignals: confidence?.signals ?? null,
      semanticSimilarity,
    },
    summary: `Generated ${storedCandidates.length} candidates, selected "${best.title}" (score: ${best.score}${confidence ? `, confidence: ${confidence.score}` : ""})`,
  };
};
