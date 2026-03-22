"use server";

import { createClipJob } from "@/lib/jobs/createClipJob";

export type ClipJobFormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; jobId: string };

export async function createClipJobAction(
  _prevState: ClipJobFormState,
  formData: FormData
): Promise<ClipJobFormState> {
  const url = String(formData.get("url") ?? "");
  const instruction = String(formData.get("instruction") ?? "");

  const result = await createClipJob({ url, instruction });

  if (!result.ok) {
    return { status: "error", message: result.error };
  }

  return { status: "success", jobId: result.jobId };
}
