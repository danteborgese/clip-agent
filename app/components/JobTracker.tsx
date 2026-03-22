"use client";

import { useJobSubscription } from "@/hooks/useJobSubscription";
import { JobProgress } from "./JobProgress";
import type { PipelineStep, StepDetail } from "@/lib/pipeline/types";

interface JobTrackerProps {
  jobId: string;
  onNewClip?: () => void;
}

export function JobTracker({ jobId, onNewClip }: JobTrackerProps) {
  const { job, error, loading } = useJobSubscription(jobId);

  // Loading state
  if (loading && !job) {
    return (
      <div className="animate-entrance delay-0 rounded-lg border border-[var(--border)] bg-white p-5">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
          <p className="text-xs text-[var(--text-muted)]" style={{ fontFamily: "var(--font-mono)" }}>
            Loading...
          </p>
        </div>
      </div>
    );
  }

  // Fetch error (no job data at all)
  if (error && !job) {
    return (
      <div className="animate-entrance delay-0 rounded-lg border border-[#ECC] bg-[#FEE] p-5">
        <div className="flex items-start gap-2.5">
          <svg className="w-4 h-4 mt-0.5 shrink-0 text-[#900]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            <p className="text-xs font-medium text-[#900]" style={{ fontFamily: "var(--font-mono)" }}>
              Something went wrong
            </p>
            <p className="text-[11px] text-[#900]/70 mt-1" style={{ fontFamily: "var(--font-sans)" }}>
              {error}
            </p>
          </div>
        </div>
        {onNewClip && (
          <button
            onClick={onNewClip}
            className="btn-primary mt-4 w-full h-10 rounded text-xs font-medium text-white bg-black flex items-center justify-center gap-1.5"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Try Again
          </button>
        )}
      </div>
    );
  }

  if (!job) return null;

  const step = (job.step ?? "ingest") as PipelineStep;
  const stepDetails: StepDetail[] = Array.isArray(job.step_details) ? job.step_details : [];
  const isDone = job.status === "done";
  const isFailed = job.status === "failed";
  const isTerminal = isDone || isFailed;

  return (
    <div className="animate-entrance delay-0 rounded-lg border border-[var(--border)] bg-white p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2
          className="text-xs font-bold uppercase tracking-[0.1em] text-black"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {isDone ? "Complete" : isFailed ? "Failed" : "Processing"}
        </h2>
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded border"
          style={{
            fontFamily: "var(--font-mono)",
            background: isDone ? "#f0f0f0" : isFailed ? "#fee" : "transparent",
            color: isDone ? "#000" : isFailed ? "#900" : "var(--text-muted)",
            borderColor: isDone ? "#ddd" : isFailed ? "#ecc" : "var(--border)",
          }}
        >
          {isDone ? "done" : isFailed ? "error" : step}
        </span>
      </div>

      <JobProgress currentStep={step} status={job.status} stepDetails={stepDetails} />

      {/* Clip download link */}
      {isDone && job.clip_url && (
        <a
          href={job.clip_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-black hover:opacity-60 transition-opacity"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download Clip →
        </a>
      )}

      {/* Pipeline error */}
      {isFailed && job.error && (
        <div className="mt-3 rounded-lg px-3 py-2 text-xs bg-[#FEE] border border-[#ECC] text-[#900]">
          {job.error}
        </div>
      )}

      {/* New clip button */}
      {isTerminal && onNewClip && (
        <button
          onClick={onNewClip}
          className="btn-primary mt-4 w-full h-10 rounded text-xs font-medium text-white bg-black flex items-center justify-center gap-1.5"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {isFailed ? "Try Again" : "New Clip"}
        </button>
      )}
    </div>
  );
}
