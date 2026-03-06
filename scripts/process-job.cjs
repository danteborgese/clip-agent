#!/usr/bin/env node

const { getJobById, updateJob, insertCandidatesForJob } = require("./lib/db.cjs");
const { fetchYoutubeMetadataAndTranscript } = require("./lib/youtube.cjs");
const { generateCandidates } = require("./lib/llm.cjs");
const { downloadYoutubeVideo } = require("./lib/downloader.cjs");
const { trimVideoSegment } = require("./lib/ffmpeg.cjs");
const { uploadFileToDrive } = require("./lib/googleDrive.cjs");
const { createNotionClipPage } = require("./lib/notion.cjs");

async function main() {
  const jobId = process.env.JOB_ID;
  if (!jobId) {
    console.error("JOB_ID env var is required");
    process.exit(1);
  }

  let job = await getJobById(jobId);
  if (!job) {
    console.error(`Job ${jobId} not found`);
    process.exit(1);
  }

  try {
    job = await updateJob(jobId, { status: "ingesting" });
    const { metadata, transcript } = await fetchYoutubeMetadataAndTranscript(job.url);
    job = await updateJob(jobId, { metadata });

    job = await updateJob(jobId, { status: "moments" });
    const candidates = await generateCandidates({
      transcript,
      instruction: job.instruction,
      metadata,
    });
    const storedCandidates = await insertCandidatesForJob(jobId, candidates);
    const best = selectBestCandidate(storedCandidates);
    job = await updateJob(jobId, { selected_candidate_id: best.id });

    job = await updateJob(jobId, { status: "clipping" });
    const sourcePath = await downloadYoutubeVideo(job.url);
    const clipPath = await trimVideoSegment(sourcePath, best.start_seconds, best.end_seconds);
    const { fileId, link } = await uploadFileToDrive(clipPath, best.title);
    job = await updateJob(jobId, {
      drive_file_id: fileId,
      drive_link: link,
    });

    job = await updateJob(jobId, { status: "notion" });
    const notionPageId = await createNotionClipPage({
      title: best.title,
      description: best.description,
      sourceUrl: job.url,
      driveLink: link,
      metadata,
    });

    await updateJob(jobId, { notion_page_id: notionPageId, status: "done" });
    console.log(`Job ${jobId} finished successfully.`);
  } catch (err) {
    console.error("Job failed:", err);
    await updateJob(jobId, {
      status: "failed",
      error: err && err.message ? String(err.message) : String(err),
    });
    process.exit(1);
  }
}

function selectBestCandidate(candidates) {
  if (!candidates || candidates.length === 0) {
    throw new Error("No candidate moments generated for this job");
  }
  const sorted = [...candidates].sort((a, b) => {
    const scoreA = typeof a.score === "number" ? a.score : 0;
    const scoreB = typeof b.score === "number" ? b.score : 0;
    return scoreB - scoreA;
  });
  return sorted[0];
}

main().catch((err) => {
  console.error("Unexpected error in process-job:", err);
  process.exit(1);
});
