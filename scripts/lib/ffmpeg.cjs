const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");

async function trimVideoSegment(sourcePath, startSeconds, endSeconds) {
  if (typeof startSeconds !== "number" || typeof endSeconds !== "number") {
    throw new Error("startSeconds and endSeconds must be numbers");
  }
  if (endSeconds <= startSeconds) {
    throw new Error("endSeconds must be greater than startSeconds");
  }

  const outDir = path.join(process.cwd(), "tmp");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const base = path.basename(sourcePath, path.extname(sourcePath));
  const outPath = path.join(
    outDir,
    `${base}-clip-${Math.round(startSeconds)}-${Math.round(endSeconds)}.mp4`
  );

  const duration = endSeconds - startSeconds;

  await new Promise((resolve, reject) => {
    ffmpeg(sourcePath)
      .setStartTime(startSeconds)
      .setDuration(duration)
      .outputOptions(["-c copy"])
      .on("error", reject)
      .on("end", resolve)
      .save(outPath);
  });

  return outPath;
}

module.exports = {
  trimVideoSegment,
};
