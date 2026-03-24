"use client";

import { useState } from "react";
import Link from "next/link";
import { JobHistory } from "@/app/components/JobHistory";
import { JobTracker } from "@/app/components/JobTracker";

export default function JobsPage() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0A0A0A" }}>
      {/* Top bar */}
      <header style={{ borderBottom: "1px solid #2a2a2a" }}>
        <div className="flex items-center justify-between" style={{ padding: "0 40px", height: "56px" }}>
          <Link href="/" className="flex items-center gap-2" style={{ textDecoration: "none" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "16px", fontWeight: 700, color: "#10B981" }}>
              &gt;
            </span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "14px", fontWeight: 500, color: "#FAFAFA" }}>
              clip_agent
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "12px",
              color: "#10B981",
              border: "1px solid #2a2a2a",
              padding: "8px 16px",
              textDecoration: "none",
            }}
          >
            [+ new_clip]
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex flex-col" style={{ padding: "40px" }}>
        {/* Page header */}
        <div className="animate-entrance delay-0" style={{ marginBottom: "32px" }}>
          <h1 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "28px", fontWeight: 700, color: "#FAFAFA" }}>
            // past_jobs
          </h1>
          <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "13px", color: "#6B7280", marginTop: "8px" }}>
            view and track your previous clip jobs.
          </p>
        </div>

        {/* Two-column layout — always visible */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-5 overflow-hidden" style={{ gap: "32px" }}>
          {/* Job list — scrollable */}
          <div className="md:col-span-3 overflow-y-auto" style={{ maxHeight: "calc(100vh - 180px)" }}>
            <div
              className="animate-entrance delay-1 overflow-hidden"
              style={{ border: "1px solid #2a2a2a" }}
            >
              {/* Table header */}
              <div
                className="flex items-center justify-between sticky top-0 z-10"
                style={{
                  padding: "12px 20px",
                  borderBottom: "1px solid #2a2a2a",
                  background: "#0F0F0F",
                }}
              >
                <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "#6B7280" }}>
                  // all_jobs
                </p>
              </div>
              {/* List */}
              <div>
                <JobHistory onSelectJob={setSelectedJobId} activeJobId={selectedJobId} />
              </div>
            </div>
          </div>

          {/* Detail panel — sticky */}
          <div className="hidden md:block md:col-span-2 self-start" style={{ position: "sticky", top: "40px" }}>
            {selectedJobId ? (
              <div className="animate-entrance delay-0">
                <div className="flex items-center justify-between" style={{ marginBottom: "16px" }}>
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "14px", fontWeight: 700, color: "#FAFAFA" }}>
                    // job_details
                  </p>
                  <button
                    onClick={() => setSelectedJobId(null)}
                    className="flex items-center gap-1 transition-colors"
                    style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "#6B7280", background: "none", border: "none", cursor: "pointer" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#FAFAFA"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "#6B7280"; }}
                  >
                    [x] close
                  </button>
                </div>
                <JobTracker jobId={selectedJobId} />
              </div>
            ) : (
              <div
                className="animate-entrance delay-1 flex items-center justify-center"
                style={{
                  border: "1px solid #2a2a2a",
                  height: "100%",
                  minHeight: "400px",
                }}
              >
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "13px", color: "#4B5563" }}>
                  select a job to view details
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
