#!/usr/bin/env npx tsx
/**
 * CLI: Claim and run the next pending job.
 * Usage: npx tsx scripts/run-pending.ts
 */

import * as path from "path";
import * as fs from "fs";

// Load .env.local
const envLocal = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocal)) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv").config({ path: envLocal });
}

import { runPipeline } from "../lib/pipeline/orchestrator";
import { requireScript } from "../lib/pipeline/require-cjs";

async function main() {
  const { supabase } = requireScript("supabaseClient.cjs");

  // Find oldest pending job
  const { data: rows, error } = await supabase
    .from("jobs")
    .select("id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    console.error("Failed to fetch pending jobs:", error);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log("No pending jobs found.");
    return;
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
    console.log("Could not claim job (race condition or already claimed).");
    return;
  }

  console.log(`Claimed and running job ${jobId}...`);
  try {
    await runPipeline(jobId);
    console.log(`Job ${jobId} completed successfully.`);
  } catch (err) {
    console.error(`Job ${jobId} failed:`, err);
    process.exit(1);
  }
}

main();
