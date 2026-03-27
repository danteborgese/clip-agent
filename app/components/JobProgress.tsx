"use client";

import { PIPELINE_STEPS } from "@/lib/pipeline/steps-config";
import type { PipelineStep, StepDetail } from "@/lib/pipeline/types";
import { STEP_ORDER } from "@/lib/pipeline/types";
import { StepItem } from "./StepItem";

interface JobProgressProps {
  currentStep: PipelineStep;
  status: string;
  stepDetails: StepDetail[];
}

const TOTAL_STEPS = PIPELINE_STEPS.filter((s) => s.key !== "done").length;

function getProgress(currentStep: PipelineStep, status: string): number {
  if (status === "done" || status === "needs_review" || currentStep === "done") return 100;
  if (status === "failed") {
    const idx = STEP_ORDER.indexOf(currentStep);
    return Math.round((idx / TOTAL_STEPS) * 100);
  }
  const idx = STEP_ORDER.indexOf(currentStep);
  return Math.round(((idx + 0.5) / TOTAL_STEPS) * 100);
}

export function JobProgress({ currentStep, status, stepDetails }: JobProgressProps) {
  console.log("[JobProgress] render", { currentStep, status, stepDetailsCount: stepDetails.length, stepDetails });
  const currentIdx = STEP_ORDER.indexOf(currentStep);
  const progress = getProgress(currentStep, status);
  const isDone = status === "done" || status === "needs_review" || currentStep === "done";
  const isFailed = status === "failed";
  const isCancelled = status === "cancelled";
  const isNeedsReview = status === "needs_review";

  // Last detail per step (for final summary/error)
  const detailMap = new Map<string, StepDetail>();
  // All substep summaries per step
  const substepMap = new Map<string, string[]>();
  for (const d of stepDetails) {
    detailMap.set(d.step, d);
    if (d.summary) {
      const list = substepMap.get(d.step) ?? [];
      list.push(d.summary);
      substepMap.set(d.step, list);
    }
  }

  return (
    <div style={{ padding: "4px 0" }}>
      {/* Progress bar */}
      <div style={{ marginBottom: "16px" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: "8px" }}>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "11px",
              color: isFailed || isCancelled ? "#EF4444" : "#6B7280",
            }}
          >
            {isFailed
              ? `failed at step ${currentIdx + 1}/${TOTAL_STEPS}`
              : isCancelled
              ? `cancelled at step ${currentIdx + 1}/${TOTAL_STEPS}`
              : isNeedsReview
              ? "complete — needs review"
              : isDone
              ? "complete"
              : `step ${currentIdx + 1}/${TOTAL_STEPS}`}
          </span>
        </div>
        <div
          className="w-full overflow-hidden"
          style={{ height: "4px", background: "#1F1F1F" }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background: isFailed || isCancelled ? "#EF4444" : isNeedsReview ? "#F59E0B" : "#10B981",
              transition: "width 0.7s ease-out",
            }}
          />
        </div>
      </div>

      {/* Steps */}
      {PIPELINE_STEPS.filter((s) => s.key !== "done").map((stepCfg, idx) => {
        const detail = detailMap.get(stepCfg.key);
        let stepStatus: "completed" | "active" | "upcoming" | "failed";

        const isFailedOrCancelled = status === "failed" || status === "cancelled";
        if (isFailedOrCancelled && detail?.status === "failed") {
          stepStatus = "failed";
        } else if (isFailedOrCancelled && idx < currentIdx) {
          stepStatus = "completed";
        } else if (isFailedOrCancelled) {
          stepStatus = "upcoming";
        } else if (currentStep === "done" || idx < currentIdx) {
          stepStatus = "completed";
        } else if (idx === currentIdx) {
          stepStatus = "active";
        } else {
          stepStatus = "upcoming";
        }

        const substeps = substepMap.get(stepCfg.key) ?? [];
        // For completed steps, show only the final summary (last entry)
        // For active steps, show all substep messages as progress
        const displaySubsteps = stepStatus === "active" ? substeps : [];

        return (
          <StepItem
            key={stepCfg.key}
            label={stepCfg.label}
            description={stepCfg.description}
            status={stepStatus}
            summary={detail?.summary}
            error={detail?.error}
            substeps={displaySubsteps}
            isLast={idx === PIPELINE_STEPS.length - 2}
          />
        );
      })}
    </div>
  );
}
