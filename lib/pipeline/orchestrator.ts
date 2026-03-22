import type { Job, PipelineStep, StepDetail, StepHandler, StepOutput } from "./types";
import { STEP_ORDER } from "./types";
import { requireScript } from "./require-cjs";
import { ingest } from "./steps/ingest";
import { moments } from "./steps/moments";
import { clip } from "./steps/clip";
import { publish } from "./steps/publish";

const HANDLERS: Record<string, StepHandler> = { ingest, moments, clip, publish };

function db() {
  return requireScript("db.cjs") as {
    getJobById: (id: string) => Promise<Job>;
    updateJob: (id: string, patch: Record<string, unknown>) => Promise<Job>;
  };
}

function now() {
  return new Date().toISOString();
}

async function appendStepDetail(jobId: string, detail: StepDetail) {
  const job = await db().getJobById(jobId);
  const details: StepDetail[] = Array.isArray(job.step_details) ? job.step_details : [];
  details.push(detail);
  await db().updateJob(jobId, { step_details: details });
}

async function completeStepDetail(jobId: string, step: PipelineStep, summary: string) {
  const job = await db().getJobById(jobId);
  const details: StepDetail[] = Array.isArray(job.step_details) ? job.step_details : [];
  const idx = details.findLastIndex((d) => d.step === step && d.status === "active");
  if (idx >= 0) {
    details[idx] = { ...details[idx], status: "completed", completedAt: now(), summary };
  }
  await db().updateJob(jobId, { step_details: details });
}

async function failStepDetail(jobId: string, step: PipelineStep, errorMsg: string) {
  const job = await db().getJobById(jobId);
  const details: StepDetail[] = Array.isArray(job.step_details) ? job.step_details : [];
  const idx = details.findLastIndex((d) => d.step === step && d.status === "active");
  if (idx >= 0) {
    details[idx] = { ...details[idx], status: "failed", completedAt: now(), error: errorMsg };
  }
  await db().updateJob(jobId, { step_details: details });
}

export async function runPipeline(jobId: string): Promise<void> {
  let job = await db().getJobById(jobId);

  // If job is pending, initialize it for the pipeline
  if (job.status === "pending") {
    job = await db().updateJob(jobId, { step: "ingest", status: "ingesting" });
  }

  while (job.step !== "done") {
    const handler = HANDLERS[job.step];
    if (!handler) {
      throw new Error(`No handler for step: ${job.step}`);
    }

    // Update step column + append active detail in one write so the UI reflects progress immediately
    {
      const freshJob = await db().getJobById(jobId);
      const details: StepDetail[] = Array.isArray(freshJob.step_details) ? freshJob.step_details : [];
      details.push({ step: job.step, status: "active", startedAt: now() });
      await db().updateJob(jobId, { step: job.step, step_details: details });
    }

    try {
      const accumulated: StepOutput = (job.step_output as StepOutput) ?? {};
      const result = await handler(job, accumulated);
      const currentIdx = STEP_ORDER.indexOf(job.step);
      const nextStep = STEP_ORDER[currentIdx + 1] as PipelineStep;

      await completeStepDetail(jobId, job.step, result.summary);

      const patch: Record<string, unknown> = {
        step: nextStep,
        step_output: { ...accumulated, ...result.data },
      };
      if (nextStep === "done") {
        patch.status = "done";
      }

      job = await db().updateJob(jobId, patch);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await failStepDetail(jobId, job.step, message);
      await db().updateJob(jobId, { status: "failed", error: message });
      throw err;
    }
  }
}
