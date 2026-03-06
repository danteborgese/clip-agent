const fs = require("fs");
const path = require("path");
const ytdl = require("ytdl-core");

async function downloadYoutubeVideo(url) {
  if (!ytdl.validateURL(url)) {
    throw new Error("Invalid YouTube URL");
  }

  const id = ytdl.getURLVideoID(url);
  const outDir = path.join(process.cwd(), "tmp");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outPath = path.join(outDir, `${id}.mp4`);

  const stream = ytdl(url, {
    quality: "highest",
    filter: "audioandvideo",
  });

  await new Promise((resolve, reject) => {
    const write = fs.createWriteStream(outPath);
    stream.pipe(write);
    stream.on("error", reject);
    write.on("finish", resolve);
    write.on("error", reject);
  });

  return outPath;
}

module.exports = {
  downloadYoutubeVideo,
};
