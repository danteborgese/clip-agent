const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { buildYtDlpCookieArgs, getVideoId, isValidYoutubeUrl } = require("./ytUtils.cjs");

const isCI = process.env.CI === "true";

async function fetchTranscript(videoId, url) {
  try {
    const mod = await import("youtube-transcript/dist/youtube-transcript.esm.js");
    const YoutubeTranscript = mod.YoutubeTranscript || mod.default?.YoutubeTranscript;
    const entries = await YoutubeTranscript.fetchTranscript(videoId);

    return entries.map((e) => ({
      start_seconds: e.offset / 1000,
      end_seconds: (e.offset + e.duration) / 1000,
      text: e.text,
    }));
  } catch (err) {
    try {
      return fetchTranscriptWithYtDlp(url, videoId);
    } catch (fallbackErr) {
      throw err;
    }
  }
}

function fetchTranscriptWithYtDlp(url, videoId) {
  const cookieArgs = buildYtDlpCookieArgs();
  const outDir = path.join(process.cwd(), "tmp", "subs");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const template = path.join(outDir, "%(id)s.%(ext)s");
  const cmd =
    `yt-dlp ${cookieArgs ? `${cookieArgs} ` : ""}` +
    `--skip-download --write-auto-subs --sub-format vtt --sub-langs en ` +
    `-o "${template}" "${url}"`;

  execSync(cmd, { stdio: "ignore" });

  const files = fs.readdirSync(outDir);
  const vttFile = files.find((f) => f.startsWith(videoId) && f.endsWith(".vtt"));
  if (!vttFile) {
    throw new Error("yt-dlp did not produce a VTT subtitles file");
  }

  const fullPath = path.join(outDir, vttFile);
  const vttText = fs.readFileSync(fullPath, "utf8");

  return parseVttToTranscript(vttText);
}

function parseTimestampToSeconds(ts) {
  const parts = ts.split(":");
  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (parts.length === 3) {
    hours = Number(parts[0]) || 0;
    minutes = Number(parts[1]) || 0;
    seconds = Number(parts[2].replace(",", ".") || 0);
  } else if (parts.length === 2) {
    minutes = Number(parts[0]) || 0;
    seconds = Number(parts[1].replace(",", ".") || 0);
  } else {
    seconds = Number(ts.replace(",", ".") || 0);
  }

  return hours * 3600 + minutes * 60 + seconds;
}

function parseVttToTranscript(vttText) {
  const lines = vttText.split(/\r?\n/);
  const segments = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      if (current && current.text.trim()) {
        segments.push(current);
      }
      current = null;
      continue;
    }

    const arrowIdx = line.indexOf("-->");
    if (arrowIdx !== -1) {
      const [startRaw, endRaw] = line.split("-->").map((s) => s.trim());
      const start = parseTimestampToSeconds(startRaw);
      const end = parseTimestampToSeconds(endRaw.split(" ")[0]);
      current = { start_seconds: start, end_seconds: end, text: "" };
      continue;
    }

    if (current) {
      current.text = current.text ? `${current.text} ${line}` : line;
    }
  }

  if (current && current.text.trim()) {
    segments.push(current);
  }

  return segments;
}

function getMetadataWithYtDlp(url) {
  const cookieArgs = buildYtDlpCookieArgs();
  const cmd = `yt-dlp ${cookieArgs ? `${cookieArgs} ` : ""}-j --no-download "${url}"`;
  const out = execSync(cmd, { encoding: "utf-8" });
  const data = JSON.parse(out);
  return {
    videoId: data.id,
    title: data.title || "Untitled",
    channel: data.uploader || data.channel || null,
    durationSeconds: typeof data.duration === "number" ? data.duration : 0,
  };
}

async function fetchYoutubeMetadataAndTranscript(url) {
  if (!isValidYoutubeUrl(url)) {
    throw new Error("Invalid YouTube URL");
  }

  const videoId = getVideoId(url);

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

  let meta;
  try {
    meta = getMetadataWithYtDlp(url);
  } catch (err) {
    if (isCI) {
      throw new Error(
        "YouTube blocked the request (common from GitHub Actions). Run locally with: JOB_ID=<job-id> npm run run-job"
      );
    }
    throw err;
  }

  const transcript = await fetchTranscript(meta.videoId, url);

  const metadata = {
    platform: "youtube",
    videoId: meta.videoId,
    title: meta.title,
    channel: meta.channel,
    durationSeconds: meta.durationSeconds,
    url,
  };

  return { metadata, transcript };
}

module.exports = {
  fetchYoutubeMetadataAndTranscript,
};
