"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

interface JobSummary {
  id: string;
  url: string;
  instruction: string;
  status: string;
  step: string;
  created_at: string;
  metadata: { title?: string } | null;
  confidence: number | null;
}

export function useJobHistory(limit = 10) {
  const [jobs, setJobs] = useState<JobSummary[]>([]);

  useEffect(() => {
    console.log("[useJobHistory] fetching jobs, limit:", limit);
    supabase
      .from("jobs")
      .select("id, url, instruction, status, step, created_at, metadata, confidence")
      .order("created_at", { ascending: false })
      .limit(limit)
      .then(({ data }) => {
        console.log("[useJobHistory] fetched", data?.length ?? 0, "jobs");
        if (data) setJobs(data as JobSummary[]);
      });
  }, [limit]);

  const refresh = () => {
    supabase
      .from("jobs")
      .select("id, url, instruction, status, step, created_at, metadata, confidence")
      .order("created_at", { ascending: false })
      .limit(limit)
      .then(({ data }) => {
        if (data) setJobs(data as JobSummary[]);
      });
  };

  return { jobs, refresh };
}
