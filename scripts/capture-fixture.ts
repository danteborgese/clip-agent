import path from "path";
import fs from "fs";

const { fetchYoutubeMetadataAndTranscript } = require("./lib/youtube.cjs");
const { getVideoId } = require("./lib/ytUtils.cjs");

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: npm run capture-fixture -- <youtube-url>");
    process.exit(1);
  }

  const videoId = getVideoId(url);
  console.log(`Capturing fixture for ${videoId}...`);

  const { metadata, transcript } = await fetchYoutubeMetadataAndTranscript(url);

  const fixture = {
    videoId,
    url,
    capturedAt: new Date().toISOString(),
    metadata,
    transcript,
  };

  const fixturesDir = path.resolve(__dirname, "..", "tests", "fixtures");
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  const outPath = path.join(fixturesDir, `${videoId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2));
  console.log(`Saved fixture to ${outPath}`);
  console.log(`  Transcript segments: ${transcript.length}`);
  console.log(`  Duration: ${metadata.durationSeconds}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
