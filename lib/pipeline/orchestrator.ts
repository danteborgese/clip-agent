import type { Job, PipelineStep, StepDetail, StepHandler, StepOutput } from "./types";
import { STEP_ORDER } from "./types";
import { requireScript } from "./require-cjs";
import { ingest } from "./steps/ingest";
import { moments } from "./steps/moments";
import { clip } from "./steps/clip";
import { publish } from "./steps/publish";

const HANDLERS: Record<string, StepHandler> = { ingest, moments, clip, publish };

const STEP_STATUS: Record<string, string> = {
  ingest: "ingesting",
  moments: "moments",
  clip: "clipping",
  publish: "notion",
};

function db() {
  return requireScript("db.cjs") as {
    getJobById: (id: string) => Promise<Job>;
    updateJob: (id: string, patch: Record<string, unknown>) => Promise<Job>;
  };
}

function now() {
  return new Date().toISOString();
}

async function updateStepDetails(jobId: string, mutate: (details: StepDetail[]) => void) {
  const job = await db().getJobById(jobId);
  const details: StepDetail[] = Array.isArray(job.step_details) ? job.step_details : [];
  mutate(details);
  await db().updateJob(jobId, { step_details: details });
}

// Keys that are kept in-memory between steps but NOT persisted to the DB
// (too large for JSONB column and cause statement timeouts)
const TRANSIENT_KEYS = ["transcriptEmbeddings"];

export async function runPipeline(jobId: string): Promise<void> {
  let job = await db().getJobById(jobId);
  // In-memory store for large transient data that shouldn't hit the DB
  const transient: Record<string, unknown> = {};

  // If job is pending, initialize it for the pipeline
  if (job.status === "pending") {
    job = await db().updateJob(jobId, { step: "ingest", status: "ingesting" });
  }

  while (job.step !== "done") {
    // Check for cancellation before starting next step
    job = await db().getJobById(jobId);
    if (job.status === "cancelled") {
      await updateStepDetails(jobId, (details) => {
        const idx = details.findLastIndex((d) => d.status === "active");
        if (idx >= 0) {
          details[idx] = { ...details[idx], status: "failed", completedAt: now(), error: "Job cancelled" };
        }
      });
      return;
    }

    const handler = HANDLERS[job.step];
    if (!handler) {
      throw new Error(`No handler for step: ${job.step}`);
    }

    // Set status + append active detail in one write
    await updateStepDetails(jobId, (details) => {
      details.push({ step: job.step, status: "active", startedAt: now() });
    });
    await db().updateJob(jobId, { step: job.step, status: STEP_STATUS[job.step] ?? job.step });

    try {
      // Merge persisted step_output with in-memory transient data
      const accumulated: StepOutput = { ...(job.step_output as StepOutput) ?? {}, ...transient };
      const onSubstep = async (summary: string) => {
        await updateStepDetails(jobId, (details) => {
          details.push({ step: job.step, status: "active", startedAt: now(), summary });
        });
      };
      const result = await handler(job, accumulated, onSubstep);
      const currentIdx = STEP_ORDER.indexOf(job.step);
      const nextStep = STEP_ORDER[currentIdx + 1] as PipelineStep;

      await updateStepDetails(jobId, (details) => {
        const idx = details.findLastIndex((d) => d.step === job.step && d.status === "active");
        if (idx >= 0) {
          details[idx] = { ...details[idx], status: "completed", completedAt: now(), summary: result.summary };
        }
      });

      const mergedOutput: Record<string, unknown> = { ...(job.step_output as StepOutput) ?? {}, ...result.data };

      // Separate transient keys: keep in memory, strip from DB payload
      for (const key of TRANSIENT_KEYS) {
        if (key in mergedOutput) {
          transient[key] = mergedOutput[key];
          delete mergedOutput[key];
        }
      }

      const patch: Record<string, unknown> = {
        step: nextStep,
        step_output: mergedOutput,
      };
      if (nextStep === "done") {
        patch.status = "done";
      }

      job = await db().updateJob(jobId, patch);
    } catch (err) {
      // If job was cancelled while a step was running, exit gracefully
      const latest = await db().getJobById(jobId);
      if (latest.status === "cancelled") {
        await updateStepDetails(jobId, (details) => {
          const idx = details.findLastIndex((d) => d.step === job.step && d.status === "active");
          if (idx >= 0) {
            details[idx] = { ...details[idx], status: "failed", completedAt: now(), error: "Job cancelled" };
          }
        });
        return;
      }

      const message = err instanceof Error ? err.message : String(err);
      await updateStepDetails(jobId, (details) => {
        const idx = details.findLastIndex((d) => d.step === job.step && d.status === "active");
        if (idx >= 0) {
          details[idx] = { ...details[idx], status: "failed", completedAt: now(), error: message };
        }
      });
      await db().updateJob(jobId, { status: "failed", error: message });
      throw err;
    }
  }
}
