import type { StepHandler } from "../types";
import { requireScript } from "../require-cjs";

export const moments: StepHandler = async (job, accumulated) => {
  const { generateCandidates } = requireScript("llm.cjs");
  const { insertCandidatesForJob, updateJob } = requireScript("db.cjs");

  const transcript = accumulated.transcript as Array<{
    start_seconds: number;
    end_seconds: number;
    text: string;
  }>;
  const metadata = accumulated.metadata as Record<string, unknown>;

  await updateJob(job.id, { status: "moments" });

  const candidates = await generateCandidates({
    transcript,
    instruction: job.instruction,
    metadata,
  });

  const storedCandidates = await insertCandidatesForJob(job.id, candidates);

  const best = [...storedCandidates].sort((a: { score?: number }, b: { score?: number }) => {
    const sa = typeof a.score === "number" ? a.score : 0;
    const sb = typeof b.score === "number" ? b.score : 0;
    return sb - sa;
  })[0];

  if (!best) {
    throw new Error("No candidate moments generated for this job");
  }

  await updateJob(job.id, { selected_candidate_id: best.id });

  return {
    data: {
      candidates: storedCandidates,
      selectedCandidateId: best.id,
      bestCandidate: best,
    },
    summary: `Generated ${storedCandidates.length} candidates, selected "${best.title}" (score: ${best.score})`,
  };
};
