"use client";

type StepStatus = "completed" | "active" | "upcoming" | "failed";

interface StepItemProps {
  label: string;
  description: string;
  status: StepStatus;
  summary?: string;
  error?: string;
  substeps?: string[];
  isLast?: boolean;
}

export function StepItem({ label, description, status, summary, error, substeps, isLast }: StepItemProps) {
  return (
    <div className="flex" style={{ gap: "16px" }}>
      {/* Connector */}
      <div style={{ width: "16px", flexShrink: 0, position: "relative", alignSelf: "stretch" }}>
        {/* Vertical line — full height of the row */}
        {!isLast && (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: "50%",
              width: "2px",
              transform: "translateX(-50%)",
              background: lineColor(status),
              transition: "all 0.3s",
            }}
          />
        )}
        {/* Dot — sits on top of the line */}
        {status === "active" ? (
          <div
            className="animate-spin"
            style={{
              position: "relative",
              zIndex: 1,
              width: "12px",
              height: "12px",
              margin: "3px auto 0",
              borderRadius: "50%",
              border: "2px solid #292524",
              borderTopColor: "#F59E0B",
            }}
          />
        ) : (
          <div
            style={{
              position: "relative",
              zIndex: 1,
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              margin: "4px auto 0",
              background: dotColor(status),
              transition: "all 0.3s",
            }}
          />
        )}
      </div>

      {/* Content */}
      <div style={{ paddingBottom: "16px", minWidth: 0 }}>
        <p
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "13px",
            fontWeight: 500,
            color: labelColor(status),
            transition: "color 0.3s",
          }}
        >
          {label}
        </p>
        <p
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "12px",
            color: "#6B7280",
            marginTop: "4px",
          }}
        >
          {status === "failed" && error ? error : summary ?? description}
        </p>
        {substeps && substeps.length > 0 && (
          <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "3px" }}>
            {substeps.map((text, i) => (
              <p
                key={i}
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: "11px",
                  color: i === substeps.length - 1 ? "#F59E0B" : "#4B5563",
                  paddingLeft: "8px",
                  borderLeft: "1px solid #2a2a2a",
                }}
              >
                {text}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function dotColor(status: StepStatus): string {
  switch (status) {
    case "completed": return "#10B981";
    case "active": return "#F59E0B";
    case "failed": return "#EF4444";
    case "upcoming": return "#6B7280";
  }
}

function lineColor(status: StepStatus): string {
  switch (status) {
    case "completed": return "#10B981";
    case "failed": return "#EF4444";
    default: return "#2a2a2a";
  }
}

function labelColor(status: StepStatus): string {
  switch (status) {
    case "completed": return "#10B981";
    case "active": return "#F59E0B";
    case "failed": return "#EF4444";
    case "upcoming": return "#6B7280";
  }
}
