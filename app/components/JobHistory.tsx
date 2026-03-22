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
      <div className="px-4 py-8 text-center">
        <p
          className="text-xs text-[var(--text-muted)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          No jobs yet.
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
            className="w-full text-left px-4 py-3 transition-colors duration-100 hover:bg-[#F5F5F5]"
            style={{
              background: isSelected ? "#F5F5F5" : "transparent",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p
                  className="text-sm font-medium text-black truncate"
                  style={{ fontFamily: "var(--font-sans)" }}
                >
                  {(job.metadata as { title?: string })?.title ??
                    job.instruction.slice(0, 60) + (job.instruction.length > 60 ? "..." : "")}
                </p>
                <p
                  className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate"
                  style={{ fontFamily: "var(--font-sans)" }}
                >
                  {new Date(job.created_at).toLocaleDateString()} · {job.instruction.slice(0, 60)}
                </p>
              </div>
              <StatusBadge status={job.status} />
            </div>
          </button>
        );
      })}
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    done: { bg: "#f0f0f0", color: "#000", border: "#ddd" },
    failed: { bg: "#fee", color: "#900", border: "#ecc" },
    pending: { bg: "transparent", color: "#999", border: "#e5e5e5" },
  };
  const s = styles[status] ?? { bg: "transparent", color: "#666", border: "#ddd" };

  return (
    <span
      className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
      style={{
        fontFamily: "var(--font-mono)",
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
      }}
    >
      {status}
    </span>
  );
}
