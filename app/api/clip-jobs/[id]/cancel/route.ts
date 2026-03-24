import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScript } from "@/lib/pipeline/require-cjs";

const paramsSchema = z.object({
  id: z.string().uuid("Job ID must be a valid UUID"),
});

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = paramsSchema.safeParse(await params);

  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
  }

  const { id } = result.data;
  const { getJobById, updateJob } = requireScript("db.cjs");
  const { killDownload } = requireScript("downloader.cjs");

  try {
    const job = await getJobById(id);

    if (["done", "failed", "cancelled"].includes(job.status)) {
      return NextResponse.json(
        { error: `Cannot cancel job with status: ${job.status}` },
        { status: 400 }
      );
    }

    await updateJob(id, { status: "cancelled" });

    // Kill any running yt-dlp process
    try {
      killDownload(id);
    } catch {
      // Process may not be running — that's fine
    }

    return NextResponse.json({ ok: true, jobId: id, status: "cancelled" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Cancel failed for job ${id}:`, message);
    return NextResponse.json({ ok: false, jobId: id, error: message }, { status: 500 });
  }
}
