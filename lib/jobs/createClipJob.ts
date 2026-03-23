import { parseYoutubeVideoId } from "@/lib/youtube/parseVideoId";
import { runPipeline } from "@/lib/pipeline/orchestrator";
import { requireScript } from "@/lib/pipeline/require-cjs";

export type CreateClipJobInput = {
  url: string;
  instruction: string;
};

export type CreateClipJobResult =
  | { ok: true; jobId: string }
  | { ok: false; error: string; status: number };

function getSupabase() {
  const { supabase } = requireScript("supabaseClient.cjs");
  return supabase;
}

export async function createClipJob(input: CreateClipJobInput): Promise<CreateClipJobResult> {
  const url = input.url.trim();
  const instruction = input.instruction.trim();

  if (!url || !instruction) {
    return { ok: false, error: "Both url and instruction are required", status: 400 };
  }

  if (!parseYoutubeVideoId(url)) {
    return {
      ok: false,
      error: "Enter a valid YouTube video URL (watch, youtu.be, Shorts, or embed link).",
      status: 400,
    };
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("jobs")
    .insert({ url, instruction, status: "pending", step: "ingest" })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Failed to insert job", error);
    return { ok: false, error: "Failed to create job", status: 500 };
  }

  const jobId = data.id as string;
  console.log("Job created", { jobId, url, instruction });

  // Fire-and-forget: run pipeline in background
  try {
    runPipeline(jobId).catch(async (err) => {
      console.error(`Pipeline failed for job ${jobId}:`, err);
      try {
        await supabase
          .from("jobs")
          .update({
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      } catch {
        // Last resort — ignore DB errors during failure recording
      }
    });
  } catch (err) {
    console.error(`Pipeline launch failed for job ${jobId}:`, err);
  }

  return { ok: true, jobId };
}
