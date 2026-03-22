import { createClient } from "@supabase/supabase-js";

import { parseYoutubeVideoId } from "@/lib/youtube/parseVideoId";

export type CreateClipJobInput = {
  url: string;
  instruction: string;
};

export type CreateClipJobResult =
  | { ok: true; jobId: string }
  | { ok: false; error: string; status: number };

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

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return { ok: false, error: "Supabase is not configured on the server", status: 500 };
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("jobs")
    .insert({ url, instruction, status: "pending" })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Failed to insert job", error);
    return { ok: false, error: "Failed to create job", status: 500 };
  }

  const jobId = data.id as string;
  console.log("STEP 1 – job created", { jobId, url, instruction });

  return { ok: true, jobId };
}
