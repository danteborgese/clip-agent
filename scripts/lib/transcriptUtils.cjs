function buildSentencesFromTranscript(transcript) {
  if (!Array.isArray(transcript) || transcript.length === 0) {
    return [];
  }

  const sentences = [];
  let current = null;
  const SENTENCE_END_RE = /[.!?]["')\]]*\s*$/;

  for (const seg of transcript) {
    if (!seg) continue;

    const start = Number(seg.start_seconds);
    const end = Number(seg.end_seconds);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

    const text = typeof seg.text === "string" ? seg.text : "";

    if (!current) {
      current = {
        index: sentences.length,
        start_seconds: start,
        end_seconds: end,
        text,
      };
    } else {
      current.end_seconds = end;
      current.text = current.text ? `${current.text} ${text}` : text;
    }

    const trimmed = text.trim();
    if (trimmed && SENTENCE_END_RE.test(trimmed)) {
      sentences.push(current);
      current = null;
    }
  }

  if (current) {
    sentences.push(current);
  }

  for (let i = 0; i < sentences.length; i++) {
    sentences[i].index = i;
  }

  return sentences;
}

module.exports = {
  buildSentencesFromTranscript,
};

