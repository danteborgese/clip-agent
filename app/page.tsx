"use client";

import { useState } from "react";
import Link from "next/link";
import { HeroPanel } from "@/app/components/HeroPanel";
import { FormHeader } from "@/app/components/FormHeader";
import { SubmitForm } from "@/app/components/SubmitForm";
import { JobTracker } from "@/app/components/JobTracker";

export default function Home() {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  return (
    <div className="flex min-h-screen w-full">
      <HeroPanel />

      <div className="w-full md:w-1/2 flex flex-col items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-lg">
          {/* Card container */}
          <div className="animate-entrance delay-0 rounded-xl border border-[var(--border)] bg-white p-8 sm:p-10">
            <FormHeader />

            {!activeJobId && (
              <SubmitForm onJobCreated={setActiveJobId} />
            )}

            {activeJobId && (
              <div className="animate-entrance delay-0">
                <JobTracker
                  jobId={activeJobId}
                  onNewClip={() => setActiveJobId(null)}
                />
              </div>
            )}
          </div>

          {/* Nav to past jobs — outside the card */}
          <div className="mt-5 px-1">
            <Link
              href="/jobs"
              className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-black transition-colors"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              View past jobs
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
