#!/usr/bin/env npx tsx
/**
 * Background worker: continuously polls for pending jobs and runs them.
 * Used by the Render background worker service.
 */

import * as path from "path";
import * as fs from "fs";

// Load .env.local if it exists (local dev)
const envLocal = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocal)) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv").config({ path: envLocal });
}

import { runPipeline } from "../lib/pipeline/orchestrator";
import { requireScript } from "../lib/pipeline/require-cjs";

const POLL_INTERVAL_MS = 5_000; // 5 seconds between polls
const IDLE_INTERVAL_MS = 15_000; // 15 seconds when no jobs found

async function claimAndRun(): Promise<boolean> {
  const { supabase } = requireScript("supabaseClient.cjs");

  const { data: rows, error } = await supabase
    .from("jobs")
    .select("id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    console.error("[worker] Failed to fetch pending jobs:", error.message);
    return false;
  }

  if (!rows || rows.length === 0) {
    return false;
  }

  const jobId = rows[0].id;

  // Claim atomically
  const { data: claimed, error: claimErr } = await supabase
    .from("jobs")
    .update({ status: "ingesting", step: "ingest", updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (claimErr || !claimed) {
    console.log("[worker] Could not claim job (race condition).");
    return false;
  }

  console.log(`[worker] Running job ${jobId}...`);
  try {
    await runPipeline(jobId);
    console.log(`[worker] Job ${jobId} completed.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Job ${jobId} failed:`, msg);
    try {
      await supabase
        .from("jobs")
        .update({
          status: "failed",
          error: msg,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    } catch {
      // ignore DB errors during failure recording
    }
  }

  return true;
}

async function loop() {
  console.log("[worker] Starting poll loop...");

  while (true) {
    try {
      const didWork = await claimAndRun();
      const delay = didWork ? POLL_INTERVAL_MS : IDLE_INTERVAL_MS;
      await new Promise((r) => setTimeout(r, delay));
    } catch (err) {
      console.error("[worker] Unexpected error in poll loop:", err);
      await new Promise((r) => setTimeout(r, IDLE_INTERVAL_MS));
    }
  }
}

loop();
