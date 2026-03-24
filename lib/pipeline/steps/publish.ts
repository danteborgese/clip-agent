import type { StepHandler } from "../types";
import { requireScript } from "../require-cjs";

export const publish: StepHandler = async (job, accumulated, onSubstep) => {
  const { generateTags } = requireScript("llm.cjs");
  const { createNotionClipPage } = requireScript("notion.cjs");
  const { updateJob } = requireScript("db.cjs");

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

  await onSubstep?.("Generating tags...");
  let tags: string[] = [];
  try {
    tags = await generateTags({
      instruction: job.instruction,
      metadata,
      candidates,
    });
  } catch {
    tags = [];
  }

  await onSubstep?.("Creating Notion page...");
  const notionPageId = await createNotionClipPage({
    title: bestCandidate.title,
    description: bestCandidate.description,
    sourceUrl: job.url,
    clipUrl,
    metadata,
    candidates,
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
