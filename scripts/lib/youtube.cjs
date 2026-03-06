const ytdl = require("ytdl-core");

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

async function fetchYoutubeMetadataAndTranscript(url) {
  if (!ytdl.validateURL(url)) {
    throw new Error("Invalid YouTube URL");
  }

  const info = await ytdl.getInfo(url);
  const videoId = info.videoDetails.videoId;
  const title = info.videoDetails.title;
  const channel = info.videoDetails.author?.name || null;
  const durationSeconds = Number(info.videoDetails.lengthSeconds || 0);

  let transcript = [];
  try {
    transcript = await fetchTranscript(videoId);
  } catch (err) {
    throw new Error(
      `Failed to fetch YouTube transcript (videoId=${videoId}). The video may not have captions.`
    );
  }

  const metadata = {
    platform: "youtube",
    videoId,
    title,
    channel,
    durationSeconds,
    url,
  };

  return { metadata, transcript };
}

module.exports = {
  fetchYoutubeMetadataAndTranscript,
};
