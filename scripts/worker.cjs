#!/usr/bin/env node

// Simple worker that polls Supabase for pending jobs and runs process-job for each.
// Usage: from the clip-agent folder:
//   npm run worker

const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

// Load .env.local BEFORE creating the Supabase client
const envLocal = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocal)) {
  try {
    require("dotenv").config({ path: envLocal });
  } catch {
    // dotenv optional
  }
}

const { supabase } = require("./lib/supabaseClient.cjs");

const POLL_INTERVAL_MS = 5000;

async function claimPendingJob() {
  const { data: rows, error } = await supabase
    .from("jobs")
    .select("id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    console.error("Worker: failed to fetch pending jobs", error);
    return null;
  }
  if (!rows || rows.length === 0) return null;

  const id = rows[0].id;

  // Claim atomically so the job is not pending if the child exits before process-job updates DB.
  const { data: updated, error: updError } = await supabase
    .from("jobs")
    .update({ status: "ingesting", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (updError) {
    console.error("Worker: failed to claim job", updError);
    return null;
  }
  if (!updated) {
    return null;
  }
  return id;
}

async function runJob(jobId) {
  return new Promise((resolve) => {
    console.log(`Worker: starting job ${jobId}`);
    const child = spawn(process.execPath, ["scripts/process-job.cjs"], {
      env: { ...process.env, JOB_ID: jobId },
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      console.log(`Worker: job ${jobId} finished with code ${code}`);
      resolve();
    });
  });
}

async function loop() {
  console.log(
    "Worker: polling for pending jobs (Ctrl+C to stop). Interval:",
    POLL_INTERVAL_MS,
    "ms"
  );
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const jobId = await claimPendingJob();
      if (jobId) {
        await runJob(jobId);
        continue; // immediately look for next job
      }
    } catch (err) {
      console.error("Worker loop error:", err);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

loop().catch((err) => {
  console.error("Worker fatal error:", err);
  process.exit(1);
});

