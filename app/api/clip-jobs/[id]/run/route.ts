import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runPipeline } from "@/lib/pipeline/orchestrator";

const paramsSchema = z.object({
  id: z.string().uuid("Job ID must be a valid UUID"),
});

export const maxDuration = 300; // 5 minute timeout for long-running pipelines

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = paramsSchema.safeParse(await params);

  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
  }

  const { id } = result.data;

  try {
    await runPipeline(id);
    return NextResponse.json({ ok: true, jobId: id, status: "done" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Pipeline failed for job ${id}:`, message);
    return NextResponse.json({ ok: false, jobId: id, error: message }, { status: 500 });
  }
}
