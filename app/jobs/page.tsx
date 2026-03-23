"use client";

import { useState } from "react";
import Link from "next/link";
import { VideoIcon } from "@/app/components/VideoIcon";
import { JobHistory } from "@/app/components/JobHistory";
import { JobTracker } from "@/app/components/JobTracker";

export default function JobsPage() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Top bar */}
      <header className="border-b border-[var(--border)] bg-white">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-7 h-7 bg-black rounded flex items-center justify-center">
              <VideoIcon size={14} color="white" />
            </div>
            <span
              className="text-xs font-bold tracking-tight text-black"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Clip Agent
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-black transition-colors h-8 px-3 rounded border border-[var(--border)] hover:border-[#BBB] bg-white"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New clip
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Page header */}
        <div className="animate-entrance delay-0 mb-6">
          <h1
            className="text-xl font-bold text-black tracking-tight"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Past Jobs
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1" style={{ fontFamily: "var(--font-sans)" }}>
            View and track your previous clip jobs.
          </p>
        </div>

        {/* Two-column layout when a job is selected */}
        <div className={selectedJobId ? "grid grid-cols-1 md:grid-cols-5 gap-6" : ""}>
          {/* Job list — card container */}
          <div className={selectedJobId ? "md:col-span-3" : ""}>
            <div className="animate-entrance delay-1 rounded-lg border border-[var(--border)] bg-white overflow-hidden">
              {/* Table header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                <p
                  className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  All jobs
                </p>
              </div>
              {/* List */}
              <div className="divide-y divide-[var(--border)]">
                <JobHistory onSelectJob={setSelectedJobId} />
              </div>
            </div>
          </div>

          {/* Detail panel */}
          {selectedJobId && (
            <div className="md:col-span-2">
              <div className="animate-entrance delay-0 sticky top-8">
                <div className="flex items-center justify-between mb-3">
                  <p
                    className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Job details
                  </p>
                  <button
                    onClick={() => setSelectedJobId(null)}
                    className="text-[10px] text-[var(--text-muted)] hover:text-black transition-colors flex items-center gap-1"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    Close
                  </button>
                </div>
                <JobTracker jobId={selectedJobId} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
