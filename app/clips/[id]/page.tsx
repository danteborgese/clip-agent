"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import type { Job } from "@/lib/pipeline/types";

interface TranscriptSegment {
  start_seconds: number;
  end_seconds: number;
  text: string;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ClipViewer() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error: err } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", id)
        .single();
      if (err) {
        setError(err.message);
      } else {
        setJob(data as Job);
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0A0A0A" }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "#6B7280" }}>
          loading...
        </p>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0A0A0A" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "#EF4444" }}>
            {error ?? "Job not found"}
          </p>
          <Link
            href="/"
            style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "#6B7280", marginTop: "12px", display: "inline-block" }}
          >
            &lt;&lt; back
          </Link>
        </div>
      </div>
    );
  }

  const transcript: TranscriptSegment[] = Array.isArray(job.clip_transcript)
    ? job.clip_transcript
    : [];
  const metadata = job.metadata as Record<string, string> | null;
  const title = metadata?.title ?? "Untitled";
  const stepOutput = (job.step_output ?? {}) as Record<string, unknown>;
  const transcriptSource = stepOutput.transcriptSource as string | undefined;
  const isNeedsReview = job.status === "needs_review";

  return (
    <div className="min-h-screen" style={{ background: "#0A0A0A" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 24px" }}>
        {/* Back nav */}
        <Link
          href="/"
          className="inline-flex items-center transition-colors"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            color: "#6B7280",
            textDecoration: "none",
            marginBottom: "24px",
            display: "inline-block",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#10B981"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#6B7280"; }}
        >
          &lt;&lt; back
        </Link>

        {/* Header */}
        <div style={{ marginBottom: "24px" }}>
          <div className="flex items-center gap-3">
            <h1
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "20px",
                fontWeight: 700,
                color: "#FAFAFA",
              }}
            >
              // clip_viewer
            </h1>
            {isNeedsReview && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "#F59E0B",
                  border: "1px solid #3D3515",
                  padding: "2px 8px",
                }}
              >
                [needs review]
              </span>
            )}
          </div>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "13px",
              color: "#6B7280",
              marginTop: "4px",
            }}
          >
            {title}
          </p>
        </div>

        {/* Needs review banner */}
        {isNeedsReview && (
          <div
            style={{
              background: "#1A1A0A",
              border: "1px solid #3D3515",
              padding: "12px 16px",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "#F59E0B", fontWeight: 700 }}>
              [?]
            </span>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "12px", color: "#9B9B44", lineHeight: 1.5 }}>
              Low confidence clip. Review to confirm it matches your instruction.
            </p>
          </div>
        )}

        {/* Video player */}
        {job.clip_url && (
          <div
            style={{
              border: "1px solid #2a2a2a",
              background: "#000",
              marginBottom: "24px",
            }}
          >
            <video
              src={job.clip_url}
              controls
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              style={{ width: "100%", display: "block" }}
            />
          </div>
        )}

        {/* Metadata bar: confidence + transcript source */}
        {(job.confidence != null || transcriptSource) && (
          <div
            className="flex items-center gap-4 flex-wrap"
            style={{
              border: "1px solid #2a2a2a",
              padding: "10px 20px",
              marginBottom: "24px",
            }}
          >
            {job.confidence != null && (
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#4B5563" }}>
                  confidence
                </span>
                <ConfidenceDot confidence={job.confidence} />
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    color: confidenceColor(job.confidence),
                  }}
                >
                  {Math.round(job.confidence * 100)}%
                </span>
              </div>
            )}
            {transcriptSource && (
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#4B5563" }}>
                  transcript
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    color: transcriptSource === "whisper" ? "#10B981" : "#6B7280",
                  }}
                >
                  [{transcriptSource}]
                </span>
              </div>
            )}
            {job.confidence_signals && job.confidence_signals.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                {job.confidence_signals.map((s) => (
                  <span
                    key={s.name}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "10px",
                      color: "#4B5563",
                    }}
                  >
                    {formatSignalName(s.name)}: {Math.round(s.value * 100)}%
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Instruction */}
        <div
          style={{
            border: "1px solid #2a2a2a",
            padding: "16px 20px",
            marginBottom: "24px",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              color: "#4B5563",
              marginBottom: "6px",
            }}
          >
            instruction
          </p>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "13px",
              color: "#FAFAFA",
              lineHeight: 1.5,
            }}
          >
            {job.instruction}
          </p>
        </div>

        {/* Transcript */}
        {transcript.length > 0 && (
          <div style={{ border: "1px solid #2a2a2a" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #2a2a2a" }}>
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "#4B5563",
                }}
              >
                transcript
              </p>
            </div>
            <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: "2px" }}>
              {transcript.map((seg, i) => {
                const isActive =
                  currentTime >= seg.start_seconds &&
                  currentTime < seg.end_seconds;
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: "12px",
                      padding: "6px 8px",
                      borderRadius: "2px",
                      background: isActive ? "#1a2e1a" : "transparent",
                      transition: "background 0.2s",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        color: isActive ? "#10B981" : "#4B5563",
                        flexShrink: 0,
                        width: "48px",
                        paddingTop: "1px",
                        transition: "color 0.2s",
                      }}
                    >
                      {formatTime(seg.start_seconds)}
                    </span>
                    <p
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: "13px",
                        color: isActive ? "#FAFAFA" : "#9CA3AF",
                        lineHeight: 1.5,
                        transition: "color 0.2s",
                      }}
                    >
                      {seg.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {transcript.length === 0 && (
          <div
            style={{
              border: "1px solid #2a2a2a",
              padding: "24px 20px",
              textAlign: "center",
            }}
          >
            <p style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "#4B5563" }}>
              No transcript available for this clip.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function confidenceColor(c: number): string {
  return c >= 0.7 ? "#10B981" : c >= 0.4 ? "#F59E0B" : "#EF4444";
}

function ConfidenceDot({ confidence }: { confidence: number }) {
  return (
    <div
      style={{
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: confidenceColor(confidence),
      }}
    />
  );
}

function formatSignalName(name: string): string {
  const labels: Record<string, string> = {
    score_gap: "gap",
    llm_confidence: "llm",
    semantic_similarity: "semantic",
    transcript_quality: "transcript",
  };
  return labels[name] ?? name;
}
