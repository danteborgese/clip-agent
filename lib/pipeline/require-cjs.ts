// Static require map so Next.js/Vercel can trace these files at build time.
// Wrapped in lambdas to keep them lazy (avoid eager side effects).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MODULES: Record<string, () => any> = {
  "db.cjs": () => require("../../scripts/lib/db.cjs"),
  "downloader.cjs": () => require("../../scripts/lib/downloader.cjs"),
  "ffmpeg.cjs": () => require("../../scripts/lib/ffmpeg.cjs"),
  "llm.cjs": () => require("../../scripts/lib/llm.cjs"),
  "notion.cjs": () => require("../../scripts/lib/notion.cjs"),
  "supabaseClient.cjs": () => require("../../scripts/lib/supabaseClient.cjs"),
  "supabaseStorage.cjs": () =>
    require("../../scripts/lib/supabaseStorage.cjs"),
  "transcriptUtils.cjs": () =>
    require("../../scripts/lib/transcriptUtils.cjs"),
  "youtube.cjs": () => require("../../scripts/lib/youtube.cjs"),
  "ytUtils.cjs": () => require("../../scripts/lib/ytUtils.cjs"),
};

export function requireScript(filename: string) {
  const loader = MODULES[filename];
  if (!loader) throw new Error(`Unknown script module: ${filename}`);
  return loader();
}
