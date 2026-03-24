const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { getVideoId, isValidYoutubeUrl } = require("./ytUtils.cjs");

const isCI = process.env.CI === "true";

function parseIsoDuration(iso) {
  const match = String(iso || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (
    (parseInt(match[1] || "0") * 3600) +
    (parseInt(match[2] || "0") * 60) +
    parseInt(match[3] || "0")
  );
}

async function getMetadataWithApi(videoId) {
  // Load .env if Next.js hasn't loaded it yet (e.g. CLI scripts)
  if (!process.env.YOUTUBE_API_KEY) {
    try {
      const envPath = path.resolve(process.cwd(), ".env");
      for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
        if (line.startsWith("YOUTUBE_API_KEY=")) {
          process.env.YOUTUBE_API_KEY = line.slice("YOUTUBE_API_KEY=".length).trim();
        }
      }
    } catch (_) {}
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;

  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube API: ${res.status} ${res.statusText}`);

  const json = await res.json();
  const item = json.items?.[0];
  if (!item) throw new Error(`YouTube API: video not found (${videoId})`);

  return {
    videoId,
    title: item.snippet?.title || "Untitled",
    channel: item.snippet?.channelTitle || null,
    durationSeconds: parseIsoDuration(item.contentDetails?.duration),
  };
}

async function fetchTranscript(videoId, url) {
  // Tier 1: youtube-transcript npm package
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
    console.warn("youtube-transcript failed:", err.message);

    // Tier 2: yt-dlp VTT subtitles
    try {
      return fetchTranscriptWithYtDlp(url, videoId);
    } catch (ytdlpErr) {
      console.warn("yt-dlp subtitles failed:", ytdlpErr.message);

      // Tier 3: Download audio → Whisper transcription
      try {
        return await fetchTranscriptWithWhisper(url, videoId);
      } catch (whisperErr) {
        console.warn("Whisper transcription failed:", whisperErr.message);
        throw new Error(
          `No transcript available. Tried: youtube-transcript (${err.message}), ` +
          `yt-dlp subtitles (${ytdlpErr.message}), Whisper (${whisperErr.message})`
        );
      }
    }
  }
}

async function fetchTranscriptWithWhisper(url, videoId) {
  console.log("Downloading audio for Whisper transcription...");
  const audioDir = path.join(process.cwd(), "tmp");
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
  }

  const audioPath = path.join(audioDir, `${videoId}-whisper.mp3`);
  execSync(
    `yt-dlp -x --audio-format mp3 -o "${audioPath}" "${url}"`,
    { stdio: "pipe" }
  );

  if (!fs.existsSync(audioPath)) {
    throw new Error("yt-dlp failed to download audio");
  }

  try {
    const { transcribeWithWhisper } = require("./llm.cjs");
    console.log("Transcribing with Whisper...");
    const transcript = await transcribeWithWhisper(audioPath);
    return transcript;
  } finally {
    // Clean up audio file
    try { fs.unlinkSync(audioPath); } catch (_) {}
  }
}

function fetchTranscriptWithYtDlp(url, videoId) {
  const outDir = path.join(process.cwd(), "tmp", "subs");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const template = path.join(outDir, "%(id)s.%(ext)s");
  const cmd =
    `yt-dlp --skip-download --write-auto-subs --sub-format vtt --sub-langs en ` +
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
  const cmd = `yt-dlp -j --no-download "${url}"`;
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

  // Tier 1: YouTube Data API v3 (no bot detection)
  let meta = null;
  try {
    meta = await getMetadataWithApi(videoId);
    if (meta) console.log("Metadata fetched via YouTube Data API");
  } catch (apiErr) {
    console.warn("YouTube API failed, falling back to yt-dlp:", apiErr.message);
  }

  // Tier 2: yt-dlp (fallback)
  if (!meta) {
    try {
      execSync("which yt-dlp", { stdio: "pipe" });
    } catch (_) {
      throw new Error(
        "yt-dlp is required but not found on PATH. Install it with: brew install yt-dlp"
      );
    }

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
  parseIsoDuration,
};
