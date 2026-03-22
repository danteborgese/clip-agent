import type { StepHandler } from "../types";
import { requireScript } from "../require-cjs";

const MAX_SOURCE_DURATION_SECONDS = 5 * 3600; // 5 hours

export const ingest: StepHandler = async (job) => {
  const { fetchYoutubeMetadataAndTranscript } = requireScript("youtube.cjs");
  const { updateJob } = requireScript("db.cjs");

  const { metadata, transcript } = await fetchYoutubeMetadataAndTranscript(job.url);

  if (
    metadata &&
    typeof metadata.durationSeconds === "number" &&
    metadata.durationSeconds > MAX_SOURCE_DURATION_SECONDS
  ) {
    throw new Error(
      `Source video is too long (${metadata.durationSeconds}s). Max is ${MAX_SOURCE_DURATION_SECONDS}s.`
    );
  }

  await updateJob(job.id, { metadata, status: "ingesting" });

  const segmentCount = Array.isArray(transcript) ? transcript.length : 0;

  return {
    data: { metadata, transcript },
    summary: `Fetched ${segmentCount} transcript segments (${metadata?.title ?? "unknown"})`,
  };
};
