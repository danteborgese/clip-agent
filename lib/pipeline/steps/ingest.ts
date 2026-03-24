import type { StepHandler } from "../types";
import { requireScript } from "../require-cjs";

const MAX_SOURCE_DURATION_SECONDS = 5 * 3600; // 5 hours
// Only use Whisper for videos under 30 minutes (cost control)
const WHISPER_MAX_DURATION_SECONDS = 30 * 60;

export const ingest: StepHandler = async (job, _accumulated, onSubstep) => {
  const { updateJob } = requireScript("db.cjs");
  const { buildSentencesFromTranscript } = requireScript("transcriptUtils.cjs");

  // Import AI enhancement functions — these are optional enhancements
  const llm = requireScript("llm.cjs");
  const buildTranscriptEmbeddings = typeof llm.buildTranscriptEmbeddings === "function"
    ? llm.buildTranscriptEmbeddings : null;
  const segmentTranscriptWithLLM = typeof llm.segmentTranscriptWithLLM === "function"
    ? llm.segmentTranscriptWithLLM : null;
  const assessTranscriptQuality = typeof llm.assessTranscriptQuality === "function"
    ? llm.assessTranscriptQuality : null;
  const transcribeWithWhisper = typeof llm.transcribeWithWhisper === "function"
    ? llm.transcribeWithWhisper : null;

  let metadata: Record<string, unknown>;
  let finalTranscript: Array<{ start_seconds: number; end_seconds: number; text: string }>;
  let transcriptSource: string;

  const isUpload = job.platform === "upload";

  if (isUpload) {
    // --- Direct upload path ---
    await onSubstep?.("Processing uploaded video...");

    const { execSync } = await import("child_process");
    const path = await import("path");

    // Extract duration from the uploaded file using ffprobe
    let durationSeconds = 0;
    try {
      const out = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${job.url}"`,
        { encoding: "utf-8" }
      );
      durationSeconds = Math.round(parseFloat(out.trim()) || 0);
    } catch {
      console.warn("Could not extract duration from video file");
    }

    const fileName = job.metadata?.title ?? path.basename(job.url);
    metadata = {
      title: fileName,
      durationSeconds,
      platform: "upload",
      source: "direct_upload",
    };

    if (durationSeconds > MAX_SOURCE_DURATION_SECONDS) {
      throw new Error(
        `Source video is too long (${durationSeconds}s). Max is ${MAX_SOURCE_DURATION_SECONDS}s.`
      );
    }

    // Transcribe with Whisper (only option for uploaded files)
    if (!transcribeWithWhisper) {
      throw new Error("Whisper transcription is required for uploaded videos but OPENAI_API_KEY is not set.");
    }

    // Extract audio from uploaded video
    await onSubstep?.("Extracting audio for transcription...");
    const { existsSync, unlinkSync, mkdirSync } = await import("fs");
    const tmpDir = path.join(process.cwd(), "tmp");
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

    const audioPath = path.join(tmpDir, `${job.id}-audio.mp3`);
    execSync(
      `ffmpeg -i "${job.url}" -vn -acodec libmp3lame -q:a 4 "${audioPath}" -y 2>/dev/null`,
      { stdio: "pipe" }
    );

    if (!existsSync(audioPath)) {
      throw new Error("Failed to extract audio from uploaded video");
    }

    await onSubstep?.("Transcribing audio with Whisper...");
    try {
      finalTranscript = await transcribeWithWhisper(audioPath);
      transcriptSource = "whisper";
    } finally {
      try { unlinkSync(audioPath); } catch { /* ignore */ }
    }

    if (!finalTranscript || finalTranscript.length === 0) {
      throw new Error("Whisper transcription returned no results");
    }
  } else {
    // --- YouTube URL path ---
    const { fetchYoutubeMetadataAndTranscript } = requireScript("youtube.cjs");

    await onSubstep?.("Fetching video metadata and transcript...");
    const result = await fetchYoutubeMetadataAndTranscript(job.url);
    metadata = result.metadata;
    finalTranscript = result.transcript;
    transcriptSource = "youtube";

    if (
      metadata &&
      typeof metadata.durationSeconds === "number" &&
      metadata.durationSeconds > MAX_SOURCE_DURATION_SECONDS
    ) {
      throw new Error(
        `Source video is too long (${metadata.durationSeconds}s). Max is ${MAX_SOURCE_DURATION_SECONDS}s.`
      );
    }

    // Assess transcript quality to decide if enhancements are needed
    const quality = assessTranscriptQuality ? assessTranscriptQuality(finalTranscript) : 0.8;

    // Whisper enhancement for low-quality auto-captions
    if (
      transcribeWithWhisper &&
      quality < 0.5 &&
      metadata?.durationSeconds &&
      (metadata.durationSeconds as number) <= WHISPER_MAX_DURATION_SECONDS
    ) {
      try {
        await onSubstep?.("Low quality captions detected, transcribing with Whisper...");
        const { execSync } = await import("child_process");
        const { existsSync, unlinkSync } = await import("fs");
        const path = await import("path");

        const audioPath = path.join(process.cwd(), "tmp", `${job.id}-audio.mp3`);
        execSync(
          `yt-dlp -x --audio-format mp3 -o "${audioPath}" "${job.url}"`,
          { stdio: "pipe" }
        );

        if (existsSync(audioPath)) {
          const whisperTranscript = await transcribeWithWhisper(audioPath);
          if (whisperTranscript.length > 0) {
            finalTranscript = whisperTranscript;
            transcriptSource = "whisper";
          }
          try { unlinkSync(audioPath); } catch { /* ignore */ }
        }
      } catch (err) {
        console.warn("Whisper transcription failed, falling back to YouTube captions:", err);
      }
    }
  }

  const quality = assessTranscriptQuality ? assessTranscriptQuality(finalTranscript) : 0.8;

  // LLM-based transcript segmentation for better sentence boundaries
  let segmentedTranscript = null;
  if (segmentTranscriptWithLLM && transcriptSource !== "whisper" && quality < 0.7) {
    try {
      await onSubstep?.("Improving transcript segmentation...");
      segmentedTranscript = await segmentTranscriptWithLLM(finalTranscript);
    } catch (err) {
      console.warn("LLM segmentation failed, using regex fallback:", err);
    }
  }

  // Build sentence-level view for downstream steps
  const sentences = segmentedTranscript || buildSentencesFromTranscript(finalTranscript);

  // Pre-compute semantic embeddings for transcript windows
  let transcriptEmbeddings = null;
  if (buildTranscriptEmbeddings) {
    try {
      await onSubstep?.("Computing semantic embeddings...");
      transcriptEmbeddings = await buildTranscriptEmbeddings(sentences);
    } catch (err) {
      console.warn("Embedding computation failed, will fall back to keyword matching:", err);
    }
  }

  await updateJob(job.id, { metadata });

  const segmentCount = Array.isArray(finalTranscript) ? finalTranscript.length : 0;

  return {
    data: {
      metadata,
      transcript: finalTranscript,
      segmentedTranscript,
      transcriptEmbeddings,
      transcriptSource,
      transcriptQuality: quality,
    },
    summary: `Fetched ${segmentCount} transcript segments via ${transcriptSource} (${metadata?.title ?? "unknown"})`,
  };
};
