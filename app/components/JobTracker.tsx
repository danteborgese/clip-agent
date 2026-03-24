"use client";

import { useState } from "react";
import Link from "next/link";
import { useJobSubscription } from "@/hooks/useJobSubscription";
import { JobProgress } from "./JobProgress";
import type { PipelineStep, StepDetail } from "@/lib/pipeline/types";

interface JobTrackerProps {
  jobId: string;
  onNewClip?: () => void;
  onRetry?: (url: string, instruction: string) => void;
}

export function JobTracker({ jobId, onNewClip, onRetry }: JobTrackerProps) {
  const { job, error, loading } = useJobSubscription(jobId);
  const [cancelling, setCancelling] = useState(false);

  // Loading state
  if (loading && !job) {
    return (
      <div
        className="animate-entrance delay-0"
        style={{ border: "1px solid #2a2a2a", padding: "20px" }}
      >
        <div className="flex items-center gap-2">
          <div className="animate-pulse" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10B981" }} />
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "#6B7280" }}>
            loading...
          </p>
        </div>
      </div>
    );
  }

  // Fetch error (no job data at all)
  if (error && !job) {
    return (
      <div
        className="animate-entrance delay-0"
        style={{ background: "#1A0A0A", border: "1px solid #3D1515", padding: "20px" }}
      >
        <div className="flex items-start gap-3">
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", fontWeight: 700, color: "#EF4444", flexShrink: 0 }}>
            [!]
          </span>
          <div>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", fontWeight: 500, color: "#EF4444" }}>
              pipeline_error
            </p>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#9B4444", marginTop: "4px" }}>
              {error}
            </p>
          </div>
        </div>
        {onNewClip && (
          <button
            onClick={onNewClip}
            className="btn-primary w-full flex items-center justify-center"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "13px",
              fontWeight: 500,
              background: "transparent",
              color: "#EF4444",
              border: "1px solid #EF4444",
              height: "40px",
              marginTop: "16px",
            }}
          >
            $ try_again
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
  const isCancelled = job.status === "cancelled";
  const isNeedsReview = job.status === "needs_review";
  const isTerminal = isDone || isFailed || isCancelled || isNeedsReview;

  const headerText = isDone
    ? "// complete"
    : isFailed
    ? "// failed"
    : isCancelled
    ? "// cancelled"
    : isNeedsReview
    ? "// needs review"
    : "// processing";

  const statusColor = isDone
    ? "#10B981"
    : isFailed || isCancelled
    ? "#EF4444"
    : isNeedsReview
    ? "#F59E0B"
    : "#F59E0B";

  const statusLabel = isDone
    ? "[done]"
    : isFailed
    ? "[error]"
    : isCancelled
    ? "[cancelled]"
    : isNeedsReview
    ? "[review]"
    : `[${step}]`;

  return (
    <div
      className="animate-entrance delay-0"
      style={{ border: "1px solid #2a2a2a", padding: "20px" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: "16px" }}>
        <h2
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "20px",
            fontWeight: 700,
            color: "#FAFAFA",
          }}
        >
          {headerText}
        </h2>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "11px",
            color: statusColor,
            border: `1px solid ${isFailed || isCancelled ? "#3D1515" : isNeedsReview ? "#3D3515" : "#2a2a2a"}`,
            padding: "4px 10px",
          }}
        >
          {statusLabel}
        </span>
      </div>

      <JobProgress currentStep={step} status={job.status} stepDetails={stepDetails} />

      {/* Confidence indicator */}
      {job.confidence != null && isTerminal && (
        <ConfidenceBar confidence={job.confidence} signals={job.confidence_signals} />
      )}

      {/* Needs review warning */}
      {isNeedsReview && (
        <div
          className="flex items-start gap-3"
          style={{
            background: "#1A1A0A",
            border: "1px solid #3D3515",
            padding: "16px 20px",
            marginTop: "12px",
          }}
        >
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", fontWeight: 700, color: "#F59E0B", flexShrink: 0 }}>
            [?]
          </span>
          <div>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", fontWeight: 500, color: "#F59E0B" }}>
              low_confidence
            </p>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "12px", color: "#9B9B44", marginTop: "4px", lineHeight: 1.5 }}>
              This clip may not accurately match the instruction. Review the clip before publishing.
            </p>
          </div>
        </div>
      )}

      {/* View clip link — show for both done and needs_review */}
      {(isDone || isNeedsReview) && job.clip_url && (
        <Link
          href={`/clips/${job.id}`}
          className="btn-primary w-full flex items-center justify-center"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "13px",
            fontWeight: 500,
            background: isNeedsReview ? "#F59E0B" : "#10B981",
            color: "#0A0A0A",
            height: "48px",
            marginTop: "12px",
            textDecoration: "none",
          }}
        >
          {isNeedsReview ? "$ review_clip" : "$ view_clip"}
        </Link>
      )}

      {/* Cancel button */}
      {!isTerminal && (
        <button
          onClick={async () => {
            setCancelling(true);
            try {
              await fetch(`/api/clip-jobs/${jobId}/cancel`, { method: "POST" });
            } catch {
              setCancelling(false);
            }
          }}
          disabled={cancelling}
          className="btn-primary w-full flex items-center justify-center"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "13px",
            fontWeight: 500,
            background: "transparent",
            color: cancelling ? "#4B5563" : "#EF4444",
            border: `1px solid ${cancelling ? "#2a2a2a" : "#EF4444"}`,
            height: "40px",
            marginTop: "12px",
            cursor: cancelling ? "not-allowed" : "pointer",
          }}
        >
          {cancelling ? "$ cancelling..." : "$ cancel"}
        </button>
      )}

      {/* Pipeline error */}
      {isFailed && job.error && (
        <div
          className="flex items-start gap-3"
          style={{
            background: "#1A0A0A",
            border: "1px solid #3D1515",
            padding: "16px 20px",
            marginTop: "12px",
          }}
        >
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", fontWeight: 700, color: "#EF4444", flexShrink: 0 }}>
            [!]
          </span>
          <div>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", fontWeight: 500, color: "#EF4444" }}>
              pipeline_error
            </p>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "12px", color: "#9B4444", marginTop: "4px", lineHeight: 1.5 }}>
              {job.error}
            </p>
          </div>
        </div>
      )}

      {/* Try again — retry with same inputs */}
      {(isFailed || isCancelled) && onRetry && job.url && job.instruction && (
        <button
          onClick={() => onRetry(job.url, job.instruction)}
          className="btn-primary w-full flex items-center justify-center"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "13px",
            fontWeight: 500,
            background: "transparent",
            color: "#EF4444",
            border: "1px solid #EF4444",
            height: "40px",
            marginTop: "16px",
          }}
        >
          $ try_again
        </button>
      )}

      {/* New clip — start fresh */}
      {isTerminal && onNewClip && !(isFailed || isCancelled) && (
        <button
          onClick={onNewClip}
          className="btn-primary w-full flex items-center justify-center"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "13px",
            fontWeight: 500,
            background: "transparent",
            color: "#FAFAFA",
            border: "1px solid #2a2a2a",
            height: "40px",
            marginTop: "16px",
          }}
        >
          $ new_clip
        </button>
      )}
    </div>
  );
}

function ConfidenceBar({
  confidence,
  signals,
}: {
  confidence: number;
  signals?: { name: string; value: number }[] | null;
}) {
  const pct = Math.round(confidence * 100);
  const color =
    confidence >= 0.7 ? "#10B981" : confidence >= 0.4 ? "#F59E0B" : "#EF4444";
  const [expanded, setExpanded] = useState(false);

  const signalLabels: Record<string, string> = {
    score_gap: "Score gap",
    llm_confidence: "LLM confidence",
    semantic_similarity: "Semantic match",
    transcript_quality: "Transcript quality",
  };

  return (
    <div style={{ marginTop: "12px" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "10px 0",
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "11px",
            color: "#4B5563",
            flexShrink: 0,
          }}
        >
          confidence
        </span>
        <div
          className="flex-1 overflow-hidden"
          style={{ height: "4px", background: "#1F1F1F" }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: color,
              transition: "width 0.5s ease-out",
            }}
          />
        </div>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "11px",
            color,
            flexShrink: 0,
            minWidth: "32px",
            textAlign: "right",
          }}
        >
          {pct}%
        </span>
      </button>

      {expanded && signals && signals.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            paddingLeft: "12px",
            paddingBottom: "8px",
            borderLeft: "1px solid #2a2a2a",
            marginLeft: "4px",
          }}
        >
          {signals.map((s) => {
            const sPct = Math.round(s.value * 100);
            const sColor =
              s.value >= 0.7 ? "#10B981" : s.value >= 0.4 ? "#F59E0B" : "#EF4444";
            return (
              <div
                key={s.name}
                className="flex items-center gap-2"
              >
                <span
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: "10px",
                    color: "#4B5563",
                    width: "110px",
                    flexShrink: 0,
                  }}
                >
                  {signalLabels[s.name] ?? s.name}
                </span>
                <div
                  className="flex-1 overflow-hidden"
                  style={{ height: "2px", background: "#1F1F1F" }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${sPct}%`,
                      background: sColor,
                    }}
                  />
                </div>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "10px",
                    color: sColor,
                    minWidth: "28px",
                    textAlign: "right",
                  }}
                >
                  {sPct}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
