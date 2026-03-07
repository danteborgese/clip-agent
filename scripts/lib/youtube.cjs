const { execSync } = require("child_process");

function getVideoId(url) {
  const match = url.match(/(?:v=|\/embed\/|\/v\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function isValidYoutubeUrl(url) {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url) && getVideoId(url);
}

async function fetchTranscript(videoId) {
  const mod = await import("youtube-transcript");
  const { YoutubeTranscript } = mod;
  const entries = await YoutubeTranscript.fetchTranscript(videoId);

  return entries.map((e) => ({
    start_seconds: e.offset / 1000,
    end_seconds: (e.offset + e.duration) / 1000,
    text: e.text,
  }));
}

function getMetadataWithYtDlp(url) {
  const out = execSync(`yt-dlp -j --no-download "${url}"`, { encoding: "utf-8" });
  const data = JSON.parse(out);
  return {
    videoId: data.id,
    title: data.title || "Untitled",
    channel: data.uploader || data.channel || null,
    durationSeconds: typeof data.duration === "number" ? data.duration : 0,
  };
}

async function getMetadataWithYtdl(url) {
  const ytdl = require("ytdl-core");
  const info = await ytdl.getInfo(url);
  return {
    videoId: info.videoDetails.videoId,
    title: info.videoDetails.title,
    channel: info.videoDetails.author?.name || null,
    durationSeconds: Number(info.videoDetails.lengthSeconds || 0),
  };
}

async function fetchYoutubeMetadataAndTranscript(url) {
  if (!isValidYoutubeUrl(url)) {
    throw new Error("Invalid YouTube URL");
  }

  const videoId = getVideoId(url);
  let meta;

  try {
    execSync("which yt-dlp", { stdio: "pipe" });
    meta = getMetadataWithYtDlp(url);
  } catch (_) {
    meta = await getMetadataWithYtdl(url);
  }

  let transcript = [];
  try {
    transcript = await fetchTranscript(meta.videoId);
  } catch (err) {
    throw new Error(
      `Failed to fetch YouTube transcript (videoId=${meta.videoId}). The video may not have captions.`
    );
  }

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
