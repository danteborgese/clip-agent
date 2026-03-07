const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Match YouTube video ID from common URL forms
function getVideoId(url) {
  const match = url.match(/(?:v=|\/embed\/|\/v\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function isValidYoutubeUrl(url) {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url) && getVideoId(url);
}

async function downloadWithYtDlp(url) {
  const id = getVideoId(url);
  const outDir = path.join(process.cwd(), "tmp");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outPath = path.join(outDir, `${id}.mp4`);
  execSync(
    `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 -o "${outPath}" "${url}"`,
    { stdio: "inherit" }
  );
  return outPath;
}

async function downloadWithYtdl(url) {
  const ytdl = require("ytdl-core");
  if (!ytdl.validateURL(url)) throw new Error("Invalid YouTube URL");
  const id = ytdl.getURLVideoID(url);
  const outDir = path.join(process.cwd(), "tmp");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outPath = path.join(outDir, `${id}.mp4`);
  const stream = ytdl(url, { quality: "highest", filter: "audioandvideo" });
  await new Promise((resolve, reject) => {
    const write = fs.createWriteStream(outPath);
    stream.pipe(write);
    stream.on("error", reject);
    write.on("finish", resolve);
    write.on("error", reject);
  });
  return outPath;
}

async function downloadYoutubeVideo(url) {
  if (!isValidYoutubeUrl(url)) {
    throw new Error("Invalid YouTube URL");
  }

  try {
    execSync("which yt-dlp", { stdio: "pipe" });
    return await downloadWithYtDlp(url);
  } catch (_) {
    return await downloadWithYtdl(url);
  }
}

module.exports = {
  downloadYoutubeVideo,
};
