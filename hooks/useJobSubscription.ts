"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Job } from "@/lib/pipeline/types";

interface JobSubscriptionState {
  job: Job | null;
  error: string | null;
  loading: boolean;
}

/** Poll interval in ms — used as a fallback when Realtime is slow or unavailable */
const POLL_INTERVAL = 3000;

/**
 * Subscribes to a job via Supabase Realtime + polling fallback.
 * Ensures the UI always reflects the latest pipeline state.
 */
export function useJobSubscription(jobId: string | null): JobSubscriptionState {
  const [state, setState] = useState<{ id: string | null } & JobSubscriptionState>({
    id: jobId,
    job: null,
    error: null,
    loading: true,
  });

  // Track if the job is in a terminal state to stop polling
  const isTerminalRef = useRef(false);

  // Reset when jobId changes
  if (state.id !== jobId) {
    isTerminalRef.current = false;
    setState({ id: jobId, job: null, error: null, loading: true });
  }

  const updateJob = useCallback(
    (newJob: Job) => {
      isTerminalRef.current = newJob.status === "done" || newJob.status === "failed";
      setState((prev) =>
        prev.id === jobId ? { ...prev, job: newJob, error: null, loading: false } : prev
      );
    },
    [jobId]
  );

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    try {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", jobId)
        .single();

      if (error) {
        setState((prev) =>
          prev.id === jobId
            ? { ...prev, error: `Failed to load job: ${error.message}`, loading: false }
            : prev
        );
        return;
      }
      if (data) {
        updateJob(data as Job);
      }
    } catch (err) {
      setState((prev) =>
        prev.id === jobId
          ? { ...prev, error: `Connection error: ${err instanceof Error ? err.message : String(err)}`, loading: false }
          : prev
      );
    }
  }, [jobId, updateJob]);

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;

    // Initial fetch
    fetchJob();

    // Realtime subscription
    const channel = supabase
      .channel(`job-${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "jobs",
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          if (!cancelled) {
            updateJob(payload.new as Job);
          }
        }
      )
      .subscribe();

    // Polling fallback — keeps UI in sync even if Realtime misses events
    const pollTimer = setInterval(() => {
      if (!cancelled && !isTerminalRef.current) {
        fetchJob();
      }
    }, POLL_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
      supabase.removeChannel(channel);
    };
  }, [jobId, fetchJob, updateJob]);

  return { job: state.job, error: state.error, loading: state.loading };
}
