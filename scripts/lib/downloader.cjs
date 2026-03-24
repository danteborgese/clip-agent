const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");
const { getVideoId, isValidYoutubeUrl } = require("./ytUtils.cjs");

// Track active download processes by job ID for cancellation
const activeDownloads = new Map();

async function downloadWithYtDlp(url, onProgress, jobId) {
  const id = getVideoId(url);
  const outDir = path.join(process.cwd(), "tmp");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outPath = path.join(outDir, `${id}.mp4`);

  console.log("yt-dlp download start", { url, id, outPath });

  const args = [
    "-f", "bv*[vcodec^=avc1][height<=720]+ba[acodec^=mp4a]/b[vcodec^=avc1][acodec^=mp4a]/b[ext=mp4]",
    "--merge-output-format", "mp4",
    "--newline",
    "-o", outPath,
    url
  ];

  await new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });

    // Register for cancellation
    if (jobId) {
      activeDownloads.set(jobId, proc);
    }

    let lastReportedBucket = -1;
    let lastPct = -1;
    let downloadPhase = 0;
    const progressRe = /\[download\]\s+(\d+(?:\.\d+)?)%/;
    // Chain async onProgress calls so DB writes don't race
    let progressChain = Promise.resolve();

    function handleLine(line) {
      const match = progressRe.exec(line);
      if (match && onProgress) {
        const pct = parseFloat(match[1]);
        // Detect new download phase (audio after video) by a large drop in %
        if (lastPct > 50 && pct < 10) {
          downloadPhase++;
          lastReportedBucket = -1;
        }
        lastPct = pct;
        const bucket = Math.floor(pct / 10) * 10;
        if (bucket > lastReportedBucket) {
          lastReportedBucket = bucket;
          // Phase 0 (video): 0–49%, Phase 1 (audio): 50–99%
          // Cap at 99 so 100% is only emitted on successful close
          const val = downloadPhase === 0
            ? Math.min(Math.round(pct * 0.5), 49)
            : Math.min(50 + Math.round(pct * 0.5), 99);
          progressChain = progressChain.then(() => {
            try { return Promise.resolve(onProgress(val)); } catch { return; }
          });
        }
      }
    }

    let stdoutBuf = "";
    proc.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      stdoutBuf += text;
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() || "";
      for (const line of lines) handleLine(line);
    });

    let stderrBuf = "";
    proc.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      process.stderr.write(text);
      stderrBuf += text;
      const lines = stderrBuf.split("\n");
      stderrBuf = lines.pop() || "";
      for (const line of lines) handleLine(line);
    });

    proc.on("close", (code) => {
      if (jobId) activeDownloads.delete(jobId);
      if (stdoutBuf) handleLine(stdoutBuf);
      if (stderrBuf) handleLine(stderrBuf);
      // Emit 100% only on successful exit so UI never jumps to 100% mid-download
      const finish = code === 0 && onProgress
        ? progressChain.then(() => { try { return Promise.resolve(onProgress(100)); } catch { return; } })
        : progressChain;
      finish.then(() => resolve(code)).catch(() => resolve(code));
    });

    proc.on("error", (err) => {
      if (jobId) activeDownloads.delete(jobId);
      reject(err);
    });
  });

  if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
    throw new Error("yt-dlp did not produce a valid file");
  }
  console.log("yt-dlp download complete", {
    url,
    id,
    outPath,
    sizeBytes: fs.statSync(outPath).size,
  });
  return outPath;
}

function killDownload(jobId) {
  const proc = activeDownloads.get(jobId);
  if (proc && !proc.killed) {
    proc.kill("SIGTERM");
    activeDownloads.delete(jobId);
    console.log("yt-dlp download killed for job", jobId);
  }
}

const isCI = process.env.CI === "true";

async function downloadYoutubeVideo(url, onProgress, jobId) {
  if (!isValidYoutubeUrl(url)) {
    throw new Error("Invalid YouTube URL");
  }

  let useYtDlp = false;
  try {
    execSync("which yt-dlp", { stdio: "pipe" });
    useYtDlp = true;
  } catch (_) {}

  if (!useYtDlp) {
    throw new Error(
      "yt-dlp is required but not found on PATH. Install it with: brew install yt-dlp"
    );
  }

  try {
    return await downloadWithYtDlp(url, onProgress, jobId);
  } catch (err) {
    if (isCI) {
      throw new Error(
        "YouTube blocked the request (common from GitHub Actions). Run locally with: JOB_ID=<job-id> npm run run-job"
      );
    }
    throw err;
  }
}

module.exports = {
  downloadYoutubeVideo,
  killDownload,
};
