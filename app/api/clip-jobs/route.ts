import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_OWNER = process.env.GITHUB_OWNER;

type JobInsert = {
  url: string;
  instruction: string;
  status: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = String(body.url || "").trim();
    const instruction = String(body.instruction || "").trim();

    if (!url || !instruction) {
      return NextResponse.json(
        { error: "Both url and instruction are required" },
        { status: 400 }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Supabase is not configured on the server" },
        { status: 500 }
      );
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const insert: JobInsert = {
      url,
      instruction,
      status: "pending",
    };

    const { data, error } = await supabase
      .from("jobs")
      .insert(insert)
      .select("id")
      .single();

    if (error || !data) {
      console.error("Failed to insert job", error);
      return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
    }

    const jobId = data.id as string;

    if (GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO) {
      const workflow = "process-clip-job.yml";
      const urlApi = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${workflow}/dispatches`;
      const res = await fetch(urlApi, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: { job_id: jobId },
        }),
      });

      if (!res.ok) {
        console.error("Failed to dispatch GitHub workflow", await res.text());
      }
    }

    return NextResponse.json({ jobId, status: "queued" }, { status: 201 });
  } catch (err) {
    console.error("Error in /api/clip-jobs", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
