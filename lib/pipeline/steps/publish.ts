import type { StepHandler } from "../types";
import { requireScript } from "../require-cjs";

export const publish: StepHandler = async (job, accumulated) => {
  const { generateTags } = requireScript("llm.cjs");
  const { createNotionClipPage } = requireScript("notion.cjs");
  const { updateJob } = requireScript("db.cjs");

  await updateJob(job.id, { status: "notion" });

  const metadata = accumulated.metadata as Record<string, unknown>;
  const candidates = accumulated.candidates as Array<{
    start_seconds: number;
    end_seconds: number;
    title: string;
    description: string;
    reason: string;
    score?: number;
  }>;
  const bestCandidate = accumulated.bestCandidate as {
    title: string;
    description: string;
  };
  const clipUrl = accumulated.clipUrl as string;
  const clipDuration = accumulated.clipDuration as number;
  const fileSize = accumulated.fileSize as number | null;

  const notionCandidates = candidates.map((c) => ({
    start_seconds: Number(c.start_seconds),
    end_seconds: Number(c.end_seconds),
    title: c.title,
    description: c.description,
    reason: c.reason,
    score: typeof c.score === "number" ? c.score : null,
  }));

  let tags: string[] = [];
  try {
    tags = await generateTags({
      instruction: job.instruction,
      metadata,
      candidates: notionCandidates,
    });
  } catch {
    tags = [];
  }

  const notionPageId = await createNotionClipPage({
    title: bestCandidate.title,
    description: bestCandidate.description,
    sourceUrl: job.url,
    clipUrl,
    metadata,
    candidates: notionCandidates,
    tags,
    clipDurationSeconds: clipDuration,
    fileSizeBytes: fileSize,
  });

  await updateJob(job.id, { notion_page_id: notionPageId });

  return {
    data: { notionPageId },
    summary: `Published to Notion`,
  };
};
