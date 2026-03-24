const MAX_SEGMENTS_PER_SENTENCE = 20;

function buildSentencesFromTranscript(transcript) {
  if (!Array.isArray(transcript) || transcript.length === 0) {
    return [];
  }

  const sentences = [];
  let current = null;
  let segmentCount = 0;
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
      segmentCount = 1;
    } else {
      current.end_seconds = end;
      current.text = current.text ? `${current.text} ${text}` : text;
      segmentCount++;
    }

    const trimmed = text.trim();
    const isSentenceEnd = trimmed && SENTENCE_END_RE.test(trimmed);
    const isTooLong = segmentCount >= MAX_SEGMENTS_PER_SENTENCE;

    if (isSentenceEnd || isTooLong) {
      sentences.push(current);
      current = null;
      segmentCount = 0;
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
