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

function getVideoId(url) {
  const match = url.match(/(?:v=|\/embed\/|\/v\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function isValidYoutubeUrl(url) {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url) && getVideoId(url);
}

module.exports = {
  buildYtDlpCookieArgs,
  getVideoId,
  isValidYoutubeUrl,
};
