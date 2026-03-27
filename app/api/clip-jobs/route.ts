import { NextRequest, NextResponse } from "next/server";

import { createClipJob } from "@/lib/jobs/createClipJob";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = String(body.url || "");
    const instruction = String(body.instruction || "");
    console.log("[API /api/clip-jobs] POST", { url, instruction: instruction.slice(0, 80) });

    const result = await createClipJob({ inputMode: "url", url, instruction });
    console.log("[API /api/clip-jobs] createClipJob result:", result);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ jobId: result.jobId, status: "queued" }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error in /api/clip-jobs", err);
    return NextResponse.json(
      { error: process.env.NODE_ENV === "development" ? message : "Unexpected error" },
      { status: 500 }
    );
  }
}
