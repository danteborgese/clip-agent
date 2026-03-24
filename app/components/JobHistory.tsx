"use client";

import { useJobHistory } from "@/hooks/useJobHistory";

interface JobHistoryProps {
  onSelectJob: (jobId: string) => void;
  activeJobId?: string | null;
}

export function JobHistory({ onSelectJob, activeJobId }: JobHistoryProps) {
  const { jobs } = useJobHistory(10);

  if (jobs.length === 0) {
    return (
      <div className="text-center" style={{ padding: "32px 16px" }}>
        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "#6B7280" }}>
          no jobs yet.
        </p>
      </div>
    );
  }

  return (
    <>
      {jobs.map((job) => {
        const isSelected = activeJobId === job.id;
        return (
          <button
            key={job.id}
            onClick={() => onSelectJob(job.id)}
            className="w-full text-left transition-colors duration-100"
            style={{
              padding: "16px 20px",
              background: isSelected ? "#1F1F1F" : "transparent",
              borderBottom: "1px solid #2a2a2a",
              borderLeft: isSelected ? "2px solid #10B981" : "2px solid transparent",
            }}
            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#1F1F1F"; }}
            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p
                  className="truncate"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "#FAFAFA",
                  }}
                >
                  {(job.metadata as { title?: string })?.title ??
                    job.instruction.slice(0, 60) + (job.instruction.length > 60 ? "..." : "")}
                </p>
                <p
                  className="truncate"
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: "11px",
                    color: "#4B5563",
                    marginTop: "4px",
                  }}
                >
                  {new Date(job.created_at).toLocaleDateString()} · {job.instruction.slice(0, 60)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {job.confidence != null && (
                  <ConfidencePill confidence={job.confidence} />
                )}
                <StatusBadge status={job.status} />
              </div>
            </div>
          </button>
        );
      })}
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    done: "#10B981",
    failed: "#EF4444",
    pending: "#6B7280",
    cancelled: "#6B7280",
    needs_review: "#F59E0B",
  };
  const borders: Record<string, string> = {
    failed: "#3D1515",
    needs_review: "#3D3515",
  };
  const color = colors[status] ?? "#6B7280";
  const borderColor = borders[status] ?? "#2a2a2a";

  return (
    <span
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "11px",
        color,
        border: `1px solid ${borderColor}`,
        padding: "2px 8px",
        background: "transparent",
      }}
    >
      [{status === "needs_review" ? "review" : status}]
    </span>
  );
}

function ConfidencePill({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    confidence >= 0.7 ? "#10B981" : confidence >= 0.4 ? "#F59E0B" : "#EF4444";

  return (
    <span
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "10px",
        color,
        opacity: 0.8,
      }}
    >
      {pct}%
    </span>
  );
}
