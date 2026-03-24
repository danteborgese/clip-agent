function getVideoId(url) {
  const match = url.match(/(?:v=|\/embed\/|\/v\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function isValidYoutubeUrl(url) {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url) && getVideoId(url);
}

module.exports = {
  getVideoId,
  isValidYoutubeUrl,
};
