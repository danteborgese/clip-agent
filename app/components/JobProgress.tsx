"use client";

import { PIPELINE_STEPS } from "@/lib/pipeline-steps";
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
  if (status === "done" || currentStep === "done") return 100;
  if (status === "failed") {
    const idx = STEP_ORDER.indexOf(currentStep);
    return Math.round((idx / TOTAL_STEPS) * 100);
  }
  const idx = STEP_ORDER.indexOf(currentStep);
  return Math.round(((idx + 0.5) / TOTAL_STEPS) * 100);
}

export function JobProgress({ currentStep, status, stepDetails }: JobProgressProps) {
  const currentIdx = STEP_ORDER.indexOf(currentStep);
  const progress = getProgress(currentStep, status);
  const isDone = status === "done" || currentStep === "done";
  const isFailed = status === "failed";

  const detailMap = new Map<string, StepDetail>();
  for (const d of stepDetails) {
    detailMap.set(d.step, d);
  }

  return (
    <div className="py-1">
      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span
            className="text-[10px] uppercase tracking-[0.1em]"
            style={{
              fontFamily: "var(--font-mono)",
              color: isFailed ? "#900" : "var(--text-muted)",
            }}
          >
            {isFailed ? "Failed" : isDone ? "Complete" : `Step ${currentIdx + 1}/${TOTAL_STEPS}`}
          </span>
          <span
            className="text-[10px] tabular-nums"
            style={{
              fontFamily: "var(--font-mono)",
              color: isFailed ? "#900" : "var(--text-muted)",
            }}
          >
            {progress}%
          </span>
        </div>
        <div className="w-full h-1 rounded-full bg-[#E5E5E5] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${progress}%`,
              background: isFailed ? "#C00" : "#000",
            }}
          />
        </div>
      </div>

      {/* Steps */}
      {PIPELINE_STEPS.filter((s) => s.key !== "done").map((stepCfg, idx) => {
        const detail = detailMap.get(stepCfg.key);
        let stepStatus: "completed" | "active" | "upcoming" | "failed";

        if (status === "failed" && detail?.status === "failed") {
          stepStatus = "failed";
        } else if (status === "failed" && idx < currentIdx) {
          stepStatus = "completed";
        } else if (status === "failed") {
          stepStatus = "upcoming";
        } else if (currentStep === "done" || idx < currentIdx) {
          stepStatus = "completed";
        } else if (idx === currentIdx) {
          stepStatus = "active";
        } else {
          stepStatus = "upcoming";
        }

        return (
          <StepItem
            key={stepCfg.key}
            label={stepCfg.label}
            description={stepCfg.description}
            status={stepStatus}
            summary={detail?.summary}
            error={detail?.error}
            isLast={idx === PIPELINE_STEPS.length - 2}
          />
        );
      })}
    </div>
  );
}
