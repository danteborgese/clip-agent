"use server";

import { createClipJob } from "@/lib/jobs/createClipJob";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export type ClipJobFormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; jobId: string };

export async function createClipJobAction(
  _prevState: ClipJobFormState,
  formData: FormData
): Promise<ClipJobFormState> {
  const inputMode = String(formData.get("input_mode") ?? "url");
  const instruction = String(formData.get("instruction") ?? "");
  console.log("[createClipJobAction] called", { inputMode, instruction: instruction.slice(0, 80) });

  if (inputMode === "upload") {
    const file = formData.get("video_file") as File | null;
    if (!file || file.size === 0) {
      return { status: "error", message: "Please upload a video file." };
    }

    // Save uploaded file to tmp/
    const tmpDir = path.join(process.cwd(), "tmp", "uploads");
    await mkdir(tmpDir, { recursive: true });
    const ext = path.extname(file.name) || ".mp4";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const filePath = path.join(tmpDir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    console.log("[createClipJobAction] upload mode — saved file to", filePath, "size:", file.size);
    const result = await createClipJob({
      instruction,
      inputMode: "upload",
      videoFilePath: filePath,
      videoFileName: file.name,
    });

    console.log("[createClipJobAction] createClipJob result:", result);
    if (!result.ok) {
      return { status: "error", message: result.error };
    }
    return { status: "success", jobId: result.jobId };
  }

  // URL mode (YouTube)
  const url = String(formData.get("url") ?? "");
  console.log("[createClipJobAction] url mode —", url);
  const result = await createClipJob({ url, instruction, inputMode: "url" });

  console.log("[createClipJobAction] createClipJob result:", result);
  if (!result.ok) {
    return { status: "error", message: result.error };
  }
  return { status: "success", jobId: result.jobId };
}
