const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const YT_DLP_COOKIES_FILE = process.env.YT_DLP_COOKIES_FILE;
const YT_DLP_COOKIES_FROM_BROWSER = process.env.YT_DLP_COOKIES_FROM_BROWSER;

function buildYtDlpCookieArgs() {
  const args = [];
  if (YT_DLP_COOKIES_FROM_BROWSER) {
    args.push(`--cookies-from-browser "${YT_DLP_COOKIES_FROM_BROWSER}"`);
  }
  if (YT_DLP_COOKIES_FILE) {
    args.push(`--cookies "${YT_DLP_COOKIES_FILE}"`);
  }
  return args.join(" ");
}

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
  const cookieArgs = buildYtDlpCookieArgs();
  try {
    // STEP 8 – yt-dlp download start
    console.log("STEP 8 – yt-dlp download start", { url, id, outPath, cookieArgs });
    const cmd =
      // Prefer H.264 video (avc1) + AAC audio (mp4a), max 720p, for good
      // compatibility with QuickTime and smaller file sizes.
      `yt-dlp ${cookieArgs ? `${cookieArgs} ` : ""}-f "bv*[vcodec^=avc1][height<=720]+ba[acodec^=mp4a]/b[vcodec^=avc1][acodec^=mp4a]/b[ext=mp4]" ` +
      `--merge-output-format mp4 -o "${outPath}" "${url}"`;
    execSync(cmd, { stdio: "inherit" });
  } catch (_) {}
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
    throw new Error("yt-dlp did not produce a valid file");
  }
  // STEP 8 – yt-dlp download complete
  console.log("STEP 8 – yt-dlp download complete", {
    url,
    id,
    outPath,
    sizeBytes: fs.statSync(outPath).size,
  });
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

const isCI = process.env.CI === "true";

async function downloadYoutubeVideo(url) {
  if (!isValidYoutubeUrl(url)) {
    throw new Error("Invalid YouTube URL");
  }

  let useYtDlp = false;
  try {
    execSync("which yt-dlp", { stdio: "pipe" });
    useYtDlp = true;
  } catch (_) {}

  if (useYtDlp) {
    try {
      return await downloadWithYtDlp(url);
    } catch (err) {
      if (isCI) {
        throw new Error(
          "YouTube blocked the request (common from GitHub Actions). Run locally with: JOB_ID=<job-id> npm run process-job"
        );
      }
      throw err;
    }
  }

  if (isCI) {
    throw new Error(
      "yt-dlp not found in CI. Run the job locally with: JOB_ID=<job-id> npm run process-job"
    );
  }

  return await downloadWithYtdl(url);
}

module.exports = {
  downloadYoutubeVideo,
};
