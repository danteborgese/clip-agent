import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline/orchestrator";

export const maxDuration = 300; // 5 minute timeout for long-running pipelines

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
  }

  try {
    await runPipeline(id);
    return NextResponse.json({ ok: true, jobId: id, status: "done" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Pipeline failed for job ${id}:`, message);
    return NextResponse.json({ ok: false, jobId: id, error: message }, { status: 500 });
  }
}
