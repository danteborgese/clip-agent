import { parseYoutubeVideoId } from "@/lib/youtube/parseVideoId";
import { requireScript } from "@/lib/pipeline/require-cjs";

export type CreateClipJobInput =
  | { inputMode: "url"; url: string; instruction: string }
  | { inputMode: "upload"; instruction: string; videoFilePath: string; videoFileName: string };

export type CreateClipJobResult =
  | { ok: true; jobId: string }
  | { ok: false; error: string; status: number };

function getSupabase() {
  const { supabase } = requireScript("supabaseClient.cjs");
  return supabase;
}

export async function createClipJob(input: CreateClipJobInput): Promise<CreateClipJobResult> {
  const instruction = input.instruction.trim();

  if (!instruction) {
    return { ok: false, error: "Instruction is required", status: 400 };
  }

  let url: string;
  let platform: string;
  let metadata: Record<string, unknown> | null = null;

  if (input.inputMode === "url") {
    url = (input.url ?? "").trim();
    if (!url) {
      return { ok: false, error: "URL is required", status: 400 };
    }
    if (!parseYoutubeVideoId(url)) {
      return {
        ok: false,
        error: "Enter a valid YouTube video URL (watch, youtu.be, Shorts, or embed link).",
        status: 400,
      };
    }
    platform = "youtube";
  } else {
    // Upload mode — store the local file path as the "url" field
    url = input.videoFilePath;
    platform = "upload";
    metadata = { title: input.videoFileName, source: "direct_upload" };
  }

  const supabase = getSupabase();

  const row: Record<string, unknown> = {
    url,
    instruction,
    status: "pending",
    step: "ingest",
    platform,
  };
  if (metadata) {
    row.metadata = metadata;
  }

  const { data, error } = await supabase
    .from("jobs")
    .insert(row)
    .select("id")
    .single();

  if (error || !data) {
    console.error("Failed to insert job", error);
    return { ok: false, error: "Failed to create job", status: 500 };
  }

  const jobId = data.id as string;
  console.log("Job created", { jobId, url, instruction });

  return { ok: true, jobId };
}
