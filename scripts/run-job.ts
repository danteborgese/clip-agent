#!/usr/bin/env npx tsx
/**
 * CLI: Run or resume a specific job by ID.
 * Usage: JOB_ID=<uuid> npx tsx scripts/run-job.ts
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

async function main() {
  const jobId = process.env.JOB_ID;
  if (!jobId) {
    console.error("JOB_ID env var is required");
    process.exit(1);
  }

  console.log(`Running pipeline for job ${jobId}...`);
  try {
    await runPipeline(jobId);
    console.log(`Job ${jobId} completed successfully.`);
  } catch (err) {
    console.error(`Job ${jobId} failed:`, err);
    process.exit(1);
  }
}

main();
