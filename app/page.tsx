"use client";

import { useState } from "react";
import Link from "next/link";
import { HeroPanel } from "@/app/components/HeroPanel";
import { FormHeader } from "@/app/components/FormHeader";
import { SubmitForm } from "@/app/components/SubmitForm";
import { JobTracker } from "@/app/components/JobTracker";

export default function Home() {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [retryInputs, setRetryInputs] = useState<{ url: string; instruction: string } | null>(null);

  console.log("[Home] render", { activeJobId, hasRetryInputs: !!retryInputs });

  return (
    <div className="flex min-h-screen w-full" style={{ background: "#0A0A0A" }}>
      <HeroPanel />

      <div className="w-full md:w-1/2 flex flex-col items-center justify-center" style={{ padding: "48px 60px" }}>
        <div className="w-full max-w-lg">
          <div className="animate-entrance delay-0">
            <FormHeader />

            {!activeJobId && (
              <SubmitForm
                key={retryInputs ? `retry-${Date.now()}` : "fresh"}
                onJobCreated={(id) => {
                  console.log("[Home] onJobCreated", id);
                  setRetryInputs(null);
                  setActiveJobId(id);
                }}
                defaultUrl={retryInputs?.url}
                defaultInstruction={retryInputs?.instruction}
              />
            )}

            {activeJobId && (
              <div className="animate-entrance delay-0">
                <JobTracker
                  jobId={activeJobId}
                  onNewClip={() => {
                    setRetryInputs(null);
                    setActiveJobId(null);
                  }}
                  onRetry={(url, instruction) => {
                    setRetryInputs({ url, instruction });
                    setActiveJobId(null);
                  }}
                />
              </div>
            )}
          </div>

          {/* Nav to past jobs */}
          <div style={{ marginTop: "20px" }}>
            <Link
              href="/jobs"
              className="inline-flex items-center transition-colors"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "12px",
                color: "#6B7280",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#10B981"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#6B7280"; }}
            >
              view_past_jobs &gt;&gt;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
