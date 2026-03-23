const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { buildYtDlpCookieArgs, getVideoId, isValidYoutubeUrl } = require("./ytUtils.cjs");

async function downloadWithYtDlp(url) {
  const id = getVideoId(url);
  const outDir = path.join(process.cwd(), "tmp");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outPath = path.join(outDir, `${id}.mp4`);
  const cookieArgs = buildYtDlpCookieArgs();
  try {
    console.log("yt-dlp download start", { url, id, outPath });
    const cmd =
      `yt-dlp ${cookieArgs ? `${cookieArgs} ` : ""}-f "bv*[vcodec^=avc1][height<=720]+ba[acodec^=mp4a]/b[vcodec^=avc1][acodec^=mp4a]/b[ext=mp4]" ` +
      `--merge-output-format mp4 -o "${outPath}" "${url}"`;
    execSync(cmd, { stdio: "inherit" });
  } catch (_) {}
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

  if (!useYtDlp) {
    throw new Error(
      "yt-dlp is required but not found on PATH. Install it with: brew install yt-dlp"
    );
  }

  try {
    return await downloadWithYtDlp(url);
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
};
