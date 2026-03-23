"use client";

type StepStatus = "completed" | "active" | "upcoming" | "failed";

interface StepItemProps {
  label: string;
  description: string;
  status: StepStatus;
  summary?: string;
  error?: string;
  isLast?: boolean;
}

export function StepItem({ label, description, status, summary, error, isLast }: StepItemProps) {
  return (
    <div className="flex gap-3">
      {/* Connector + icon */}
      <div className="flex flex-col items-center">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all duration-300"
          style={iconStyle(status)}
        >
          {status === "completed" && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline className="check-draw" points="20 6 9 17 4 12" />
            </svg>
          )}
          {status === "active" && (
            <svg className="step-spinner" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="#DDD" strokeWidth="2" />
              <path
                d="M8 2a6 6 0 0 1 6 6"
                stroke="#000"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          )}
          {status === "failed" && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )}
          {status === "upcoming" && (
            <div className="w-1.5 h-1.5 rounded-full bg-[#CCC]" />
          )}
        </div>
        {!isLast && (
          <div
            className="w-px flex-1 min-h-[20px] transition-all duration-300"
            style={{
              background: status === "completed" ? "#000" : status === "failed" ? "#C00" : "#E5E5E5",
            }}
          />
        )}
      </div>

      {/* Content */}
      <div className="pb-4 pt-1 min-w-0">
        <p
          className="text-xs font-medium transition-colors duration-300"
          style={{
            fontFamily: "var(--font-mono)",
            color:
              status === "active" ? "#000"
              : status === "completed" ? "#000"
              : status === "failed" ? "#900"
              : "#BBB",
          }}
        >
          {label}
        </p>
        <p
          className="text-[11px] mt-0.5"
          style={{
            fontFamily: "var(--font-sans)",
            color: status === "upcoming" ? "#CCC" : "#999",
          }}
        >
          {status === "failed" && error ? error : summary ?? description}
        </p>
      </div>
    </div>
  );
}

function iconStyle(status: StepStatus): React.CSSProperties {
  switch (status) {
    case "completed":
      return { background: "#000", color: "#FFF" };
    case "active":
      return { background: "#FFF", border: "none" };
    case "failed":
      return { background: "#FEE", color: "#900", border: "1px solid #ECC" };
    case "upcoming":
      return { background: "#F5F5F5", color: "#CCC", border: "1px solid #E5E5E5" };
  }
}
