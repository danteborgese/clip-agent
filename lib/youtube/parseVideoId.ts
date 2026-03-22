/** YouTube video IDs are always 11 characters from this alphabet. */
const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Returns the canonical 11-char video id, or null if the URL is not a valid watch/embed/shorts URL.
 * Rejects query values like `v=abc123extra` (wrong length).
 */
export function parseYoutubeVideoId(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "youtu.be") {
    const seg = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return VIDEO_ID.test(seg) ? seg : null;
  }

  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "music.youtube.com") {
    return null;
  }

  const path = url.pathname;

  if (path === "/watch" || path.startsWith("/watch/")) {
    const v = url.searchParams.get("v");
    return v && VIDEO_ID.test(v) ? v : null;
  }

  const shorts = path.match(/^\/shorts\/([a-zA-Z0-9_-]+)(?:\/|$)/);
  if (shorts?.[1] && VIDEO_ID.test(shorts[1])) {
    return shorts[1];
  }

  const embed = path.match(/^\/embed\/([a-zA-Z0-9_-]+)(?:\/|$)/);
  if (embed?.[1] && VIDEO_ID.test(embed[1])) {
    return embed[1];
  }

  const vPath = path.match(/^\/v\/([a-zA-Z0-9_-]+)(?:\/|$)/);
  if (vPath?.[1] && VIDEO_ID.test(vPath[1])) {
    return vPath[1];
  }

  return null;
}
