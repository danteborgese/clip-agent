const OpenAI = require("openai");
const { z } = require("zod");
const { buildSentencesFromTranscript } = require("./transcriptUtils.cjs");

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const MAX_CLIP_DURATION_SECONDS = 12 * 60; // 12 minutes

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "when",
  "where",
  "what",
  "about",
  "clip",
  "part",
  "talks",
  "talking",
  "says",
]);

const NUMBER_WORDS = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
};

const DIGIT_TO_WORD = Object.entries(NUMBER_WORDS).reduce((acc, [word, digit]) => {
  acc[digit] = word;
  return acc;
}, {});

const candidateSchema = z.object({
  start_seconds: z.number().nonnegative(),
  end_seconds: z.number().positive(),
  title: z.string(),
  description: z.string(),
  reason: z.string(),
  score: z.number().optional(),
});

const sentenceRangeCandidateSchema = z.object({
  start_sentence_index: z.number().int().nonnegative(),
  end_sentence_index: z.number().int().nonnegative(),
  title: z.string(),
  description: z.string(),
  reason: z.string(),
  score: z.number().optional(),
});

const sentenceRangeResponseSchema = z.object({
  candidates: z.array(sentenceRangeCandidateSchema).max(10),
});

const responseSchema = z.object({
  candidates: z.array(candidateSchema).max(10),
});

const tagsResponseSchema = z.object({
  tags: z.array(z.string().min(1)).max(12),
});

function applyDurationPreferenceToCandidates(candidates) {
  return candidates.map((c) => {
    const start = Number(c.start_seconds);
    const end = Number(c.end_seconds);
    let baseScore =
      typeof c.score === "number" && !Number.isNaN(c.score) ? c.score : 7;

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return { ...c, score: baseScore };
    }

    const duration = end - start;
    let penalty = 0;

    if (duration < 30) {
      penalty = 3;
    } else if (duration < 45) {
      penalty = 1.5;
    } else if (duration <= 150) {
      penalty = 0;
    } else if (duration <= 300) {
      penalty = ((duration - 150) / 150) * 1.5; // up to ~1.5
    } else if (duration <= 600) {
      penalty = 2 + ((duration - 300) / 300) * 1; // 2–3
    } else {
      penalty = 4; // heavily down-rank near-12-minute chunks
    }

    const adjusted = Math.max(0, baseScore - penalty);
    return { ...c, score: adjusted };
  });
}

async function generateCandidates({ transcript, instruction, metadata }) {
  if (!client) {
    throw new Error("OPENAI_API_KEY is not set; cannot generate candidates");
  }

  const sentences = Array.isArray(transcript)
    ? buildSentencesFromTranscript(transcript)
    : [];

  const { keywords, keywordVariants } = extractInstructionKeywords(instruction);
  const digitPhrases = extractDigitLeadingPhrases(instruction);

  // Debug: see how the instruction is interpreted for candidate generation
  console.log("generateCandidates input:", {
    instruction,
    keywords,
    digitPhrases,
    sentenceCount: sentences.length,
    metadataTitle: metadata?.title,
    metadataChannel: metadata?.channel,
  });

  let timeCandidates = [];

  if (sentences.length && (keywords.length || digitPhrases.length)) {
    let hitSentenceIndices = [];

    if (digitPhrases.length) {
      const phraseHits = findPhraseHitSentenceIndices(sentences, digitPhrases);
      if (phraseHits.length) {
        hitSentenceIndices = phraseHits;
      }
    }

    if (!hitSentenceIndices.length && keywords.length) {
      hitSentenceIndices = findKeywordHitSentenceIndices(
        sentences,
        keywords,
        keywordVariants
      );
    }

    // Debug: which sentences were identified as hits
    console.log("generateCandidates hits:", {
      hitSentenceIndices,
      hitCount: hitSentenceIndices.length,
    });

    if (hitSentenceIndices.length) {
      const neighborhoods = buildNeighborhoods(sentences, hitSentenceIndices, {
        preSentences: 8,
        postSentences: 8,
      });
      const topNeighborhoods = selectTopNeighborhoods(neighborhoods, 4);

      // Debug: how we grouped hits into neighborhoods
      console.log("generateCandidates neighborhoods:", {
        totalNeighborhoods: neighborhoods.length,
        topNeighborhoods: topNeighborhoods.map((n) => ({
          startIndex: n.startIndex,
          endIndex: n.endIndex,
          hitCount: n.hitCount,
          durationSeconds: n.durationSeconds,
        })),
      });

      let sentenceRangeCandidates = [];
      for (const neighborhood of topNeighborhoods) {
        // eslint-disable-next-line no-await-in-loop
        const locals = await generateSentenceRangeCandidatesForNeighborhood({
          sentences,
          neighborhood,
          instruction,
          keywords,
          keywordVariants,
          metadata,
        });
        sentenceRangeCandidates.push(...locals);
      }

      const deduped = dedupeSentenceRangeCandidates(sentenceRangeCandidates);
      const filtered = filterSentenceRangeCandidatesByKeywordHits(
        deduped,
        sentences,
        keywords,
        keywordVariants
      );
      const limited = limitSentenceRangeCandidates(filtered, 10);
      timeCandidates = convertSentenceCandidatesToTimeCandidates(
        limited,
        sentences
      );
    }
  }

  if (!timeCandidates.length) {
    return generateCandidatesFromTranscriptSimple({
      transcript,
      instruction,
      metadata,
    });
  }

  const scored = applyDurationPreferenceToCandidates(timeCandidates);
  const validated = responseSchema.parse({ candidates: scored });
  const out = validated.candidates || [];
  if (out.length === 0) {
    throw new Error(
      "The AI found no matching moments. Try a clearer instruction or a different video."
    );
  }
  return out;
}

async function generateCandidatesFromTranscriptSimple({ transcript, instruction, metadata }) {
  if (!client) {
    throw new Error("OPENAI_API_KEY is not set; cannot generate candidates");
  }

  const { keywords, keywordVariants } = extractInstructionKeywords(instruction);

  // Debug: see how the instruction is interpreted in the simple fallback path
  console.log("generateCandidatesFromTranscriptSimple input:", {
    instruction,
    keywords,
    metadataTitle: metadata?.title,
    metadataChannel: metadata?.channel,
  });

  // Build a 12-minute (720s) window around segments that contain instruction keywords.
  const WINDOW_HALF_SECONDS = 6 * 60; // +/- 6 minutes around each hit
  let focusedTranscript = transcript;

  if (transcript && transcript.length && keywords.length) {
    const hitCenters = transcript
      .filter((s) => {
        const lower = String(s.text || "").toLowerCase().replace(/-/g, "");
        return keywords.some((k) => {
          const vars = keywordVariants.get(k) || [k];
          return vars.some((v) => lower.includes(v));
        });
      })
      .map((s) => (s.start_seconds + s.end_seconds) / 2);

    if (hitCenters.length > 0) {
      const minCenter = Math.min(...hitCenters);
      const maxCenter = Math.max(...hitCenters);
      const windowStart = Math.max(0, minCenter - WINDOW_HALF_SECONDS);
      const windowEnd = maxCenter + WINDOW_HALF_SECONDS;

      focusedTranscript = transcript.filter(
        (s) =>
          s.end_seconds >= windowStart &&
          s.start_seconds <= windowEnd
      );
    }
  }

  if (!focusedTranscript || focusedTranscript.length === 0) {
    focusedTranscript = transcript;
  }

  const limitedTranscript = focusedTranscript.slice(0, 800);
  const transcriptText = limitedTranscript
    .map((s) => `[${s.start_seconds.toFixed(1)}-${s.end_seconds.toFixed(1)}] ${s.text}`)
    .join("\n");

  const system = `
You are a clip-finding assistant for a creator brand. Themes: mental models, personal growth, systems, creator business.
Your task: return 1–10 candidate clip moments from the transcript. Each candidate must have start_seconds, end_seconds (use timestamps from the transcript), title, description, reason, and score (1–10).
Rules: Match the user's instruction when possible. If nothing matches well, return the 1–3 most interesting or on-theme moments from the transcript. You MUST return at least one candidate; never return an empty array.
Output only valid JSON with a single key "candidates" (array of objects). No markdown, no extra keys, no commentary.
Example: {"candidates":[{"start_seconds":120.5,"end_seconds":145.2,"title":"...","description":"...","reason":"...","score":8}]}
`;

  const user = `
Instruction: ${instruction}
Instruction keywords (focus on these when picking moments): ${keywords.join(", ") || "none"}
Title: ${metadata?.title || "Untitled"}
Channel: ${metadata?.channel || "Unknown"}
Duration seconds: ${metadata?.durationSeconds || "unknown"}

Transcript segments:
${transcriptText}
`;

  const completion = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  });

  let raw = completion.choices[0]?.message?.content || "{}";
  raw = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error("LLM returned invalid JSON for candidates");
  }

  let candidates = [];
  if (Array.isArray(parsed.candidates)) {
    candidates = parsed.candidates;
  } else if (Array.isArray(parsed)) {
    candidates = parsed;
  }

  const scored = applyDurationPreferenceToCandidates(candidates);
  const validated = responseSchema.parse({ candidates: scored });
  const out = validated.candidates || [];
  if (out.length === 0) {
    throw new Error(
      "The AI found no matching moments. Try a clearer instruction or a different video."
    );
  }
  return out;
}

async function generateTags({ instruction, metadata, candidates }) {
  if (!client) {
    throw new Error("OPENAI_API_KEY is not set; cannot generate tags");
  }

  const { keywords } = extractInstructionKeywords(instruction);
  const top = Array.isArray(candidates) ? [...candidates].slice(0, 3) : [];

  const system = `
You are a tagging assistant for a creator brand. Themes: mental models, personal growth, systems, and creator business.
Given a short description of a clip request and 1–3 candidate clips (title, description, why-it-works), return 3–10 concise keyword-style tags.
Tags should:
- Reflect brand themes (e.g. "mental models", "creator business", "productivity", "personal growth", "systems thinking") when relevant.
- Include important nouns or short phrases from the instruction and candidates (e.g. "flywheel", "limiting factors", "second brain").
- Be short (1–3 words), no hashtags, no emojis.
Output ONLY valid JSON of the shape: {"tags":["tag1","tag2",...]} with unique strings.
`;

  const lines = [];
  lines.push(`Instruction: ${instruction}`);
  lines.push(`Instruction keywords: ${keywords.join(", ") || "none"}`);
  if (metadata?.title) {
    lines.push(`Video title: ${metadata.title}`);
  }
  if (metadata?.channel) {
    lines.push(`Channel: ${metadata.channel}`);
  }
  if (top.length) {
    lines.push("");
    lines.push("Top candidate clips:");
    top.forEach((c, idx) => {
      lines.push(
        `#${idx + 1} Title: ${c.title || ""}\nDescription: ${
          c.description || ""
        }\nReason: ${c.reason || ""}`
      );
    });
  }

  const user = lines.join("\n");

  const completion = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  });

  let raw = completion.choices[0]?.message?.content || "{}";
  raw = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    parsed = {};
  }

  let tags = [];
  try {
    const validated = tagsResponseSchema.parse({
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    });
    tags = validated.tags || [];
  } catch (_) {
    tags = [];
  }

  if (!tags.length) {
    const base = new Set();
    [
      "mental models",
      "personal growth",
      "systems thinking",
      "creator business",
      "productivity",
    ].forEach((t) => base.add(t));
    keywords.forEach((k) => base.add(k));
    tags = Array.from(base).slice(0, 8);
  }

  return tags;
}

function extractInstructionKeywords(instruction) {
  const allWords = String(instruction || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const keywords = Array.from(
    new Set(allWords.filter((w) => w.length >= 4 && !STOPWORDS.has(w)))
  ).slice(0, 8);

  const keywordVariants = new Map();
  for (const k of keywords) {
    keywordVariants.set(k, buildKeywordVariants(k));
  }

  return { keywords, keywordVariants };
}

function buildKeywordVariants(k) {
  const variants = new Set();
  const base = k.replace(/-/g, "");
  variants.add(k);
  variants.add(base);

  const numberDigit = NUMBER_WORDS[base];
  if (numberDigit) {
    variants.add(numberDigit);
  }

  if (base.endsWith("s")) {
    variants.add(base.slice(0, -1));
  } else {
    variants.add(base + "s");
  }
  if (base.endsWith("es")) {
    variants.add(base.slice(0, -2));
  }

   // Simple stemming to group related forms like "creative", "creativity",
   // "creatives", "creator" under a shared root.
  let stem = base.replace(
    /(ing|ers|er|ies|ied|ness|ment|ments|ation|ations|ality|alities|ity|ities|able|ables|ful|fulness|less|lessly)$/i,
    ""
  );
  if (stem.length >= 4) {
    variants.add(stem);
  }

  return Array.from(variants).filter(Boolean);
}

function findKeywordHitSentenceIndices(sentences, keywords, keywordVariants) {
  const hits = new Set();

  for (const sentence of sentences) {
    const lower = String(sentence.text || "").toLowerCase().replace(/-/g, "");

    for (const k of keywords) {
      const vars = keywordVariants.get(k) || [k];
      if (vars.some((v) => lower.includes(v))) {
        hits.add(sentence.index);
        break;
      }
    }
  }

  return Array.from(hits).sort((a, b) => a - b);
}

function buildNeighborhoods(sentences, hitIndices, options) {
  const preSentences = options?.preSentences ?? 8;
  const postSentences = options?.postSentences ?? 8;

  if (!hitIndices.length || !sentences.length) return [];

  const n = sentences.length;
  const rawRanges = hitIndices.map((idx) => ({
    startIndex: Math.max(0, idx - preSentences),
    endIndex: Math.min(n - 1, idx + postSentences),
  }));

  rawRanges.sort((a, b) => a.startIndex - b.startIndex);

  const merged = [];
  for (const range of rawRanges) {
    const last = merged[merged.length - 1];
    if (!last || range.startIndex > last.endIndex + 1) {
      merged.push({ ...range });
    } else {
      last.endIndex = Math.max(last.endIndex, range.endIndex);
    }
  }

  return merged.map((range) => {
    const first = sentences[range.startIndex];
    const last = sentences[range.endIndex];
    const hitsInRange = hitIndices.filter(
      (i) => i >= range.startIndex && i <= range.endIndex
    );
    const durationSeconds =
      Number(last?.end_seconds || 0) - Number(first?.start_seconds || 0);

    return {
      ...range,
      hitCount: hitsInRange.length,
      durationSeconds,
    };
  });
}

function selectTopNeighborhoods(neighborhoods, maxCount) {
  const sorted = [...neighborhoods].sort((a, b) => {
    if (b.hitCount !== a.hitCount) {
      return b.hitCount - a.hitCount;
    }
    return a.durationSeconds - b.durationSeconds;
  });
  return sorted.slice(0, maxCount);
}

async function generateSentenceRangeCandidatesForNeighborhood({
  sentences,
  neighborhood,
  instruction,
  keywords,
  keywordVariants,
  metadata,
}) {
  const { startIndex, endIndex } = neighborhood;
  const subset = sentences.slice(startIndex, endIndex + 1);
  if (!subset.length) return [];

  // Debug: show a sample of full sentences in this neighborhood
  console.log("generateSentenceRange neighborhood sample:", {
    startIndex,
    endIndex,
    sample: subset.slice(0, 5).map((s) => ({
      index: s.index,
      start_seconds: s.start_seconds,
      end_seconds: s.end_seconds,
      text: s.text,
    })),
  });

  const transcriptText = subset
    .map((s) => {
      const lower = String(s.text || "").toLowerCase().replace(/-/g, "");
      const isHit = keywords.some((k) => {
        const vars = keywordVariants.get(k) || [k];
        return vars.some((v) => lower.includes(v));
      });
      const hitTag = isHit ? " [HIT]" : "";
      return `[sent_idx=${s.index}, ${s.start_seconds.toFixed(
        1
      )}-${s.end_seconds.toFixed(1)}]${hitTag} ${s.text}`;
    })
    .join("\n");

  const system = `
You are a clip-finding assistant for a creator brand. Themes: mental models, personal growth, systems, creator business.
You are given a contiguous block of transcript sentences from a long-form video.
Select 0–3 of the best clip candidates from this neighborhood that:
- Focus on the key ideas from the user's instruction and keywords.
- Include at least one mention of any instruction keyword (including simple variants).
- Emphasize segments where the concept is defined, explained, or illustrated with concrete examples, not just mentioned in passing.
- Are contiguous ranges of whole sentences (no mid-sentence cuts).
- Prefer durations between 45 and 150 seconds, and never exceed 720 seconds (12 minutes).
- Prefer clips where most of the sentences are marked [HIT] and whose center timestamp is close to the densest cluster of [HIT] sentences in this neighborhood, rather than long stretches of non-HIT context.
Return JSON with a single key "candidates" whose value is an array of objects.
Each candidate must include: start_sentence_index, end_sentence_index, title, description, reason, and score (1–10, where higher is better).
Use the GLOBAL sentence indices shown as sent_idx=... when filling start_sentence_index and end_sentence_index.
If nothing in this neighborhood makes for a good clip, return {"candidates": []}.
`;

  const user = `
Instruction: ${instruction}
Instruction keywords (focus on these when picking moments): ${keywords.join(", ") || "none"}
Title: ${metadata?.title || "Untitled"}
Channel: ${metadata?.channel || "Unknown"}
Duration seconds: ${metadata?.durationSeconds || "unknown"}

Transcript sentences (global indices):
${transcriptText}
`;

  const completion = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  });

  let raw = completion.choices[0]?.message?.content || "{}";
  raw = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error("LLM returned invalid JSON for neighborhood candidates");
  }

  const validated = sentenceRangeResponseSchema.parse(
    Array.isArray(parsed.candidates) ? parsed : { candidates: parsed.candidates || [] }
  );

  return validated.candidates || [];
}

function dedupeSentenceRangeCandidates(candidates) {
  const seen = new Set();
  const out = [];

  for (const c of candidates) {
    const start = c.start_sentence_index;
    const end = c.end_sentence_index;
    const key = `${start}-${end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }

  return out;
}

function filterSentenceRangeCandidatesByKeywordHits(
  candidates,
  sentences,
  keywords,
  keywordVariants
) {
  if (!Array.isArray(candidates) || !candidates.length) return [];
  if (!Array.isArray(sentences) || !sentences.length) return candidates;
  if (!keywords.length) return candidates;

  return candidates.filter((c) => {
    const startIndex = Math.max(0, Number(c.start_sentence_index) || 0);
    const endIndex = Math.min(
      sentences.length - 1,
      Number(c.end_sentence_index) || startIndex
    );
    for (let i = startIndex; i <= endIndex; i++) {
      const sentence = sentences[i];
      const lower = String(sentence.text || "").toLowerCase().replace(/-/g, "");
      for (const k of keywords) {
        const vars = keywordVariants.get(k) || [k];
        if (vars.some((v) => lower.includes(v))) {
          return true;
        }
      }
    }
    return false;
  });
}

function extractDigitLeadingPhrases(instruction) {
  const text = String(instruction || "").toLowerCase();
  const phrases = new Set();
  const regex = /\b(\d+\s+[a-z]{3,}(?:\s+[a-z]{3,}){0,3})\b/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const phrase = match[1].trim().replace(/\s+/g, " ");
    if (phrase.length >= 5) {
      phrases.add(phrase);
    }
  }
  return Array.from(phrases);
}

function findPhraseHitSentenceIndices(sentences, phrases) {
  if (!Array.isArray(sentences) || !sentences.length) return [];
  if (!Array.isArray(phrases) || !phrases.length) return [];

  const indices = new Set();

  const phraseVariants = [];
  for (const p of phrases) {
    const base = p.toLowerCase().replace(/\s+/g, " ").trim();
    if (!base) continue;

    const parts = base.split(" ");
    const first = parts[0];
    const rest = parts.slice(1).join(" ");

    phraseVariants.push(base);

    if (DIGIT_TO_WORD[first]) {
      phraseVariants.push(`${DIGIT_TO_WORD[first]} ${rest}`.trim());
    }
  }

  const normalizedVariants = phraseVariants
    .map((v) => v.replace(/-/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const sentence of sentences) {
    const idx = sentence.index;
    const lower = String(sentence.text || "").toLowerCase();
    const normalized = lower.replace(/-/g, " ").replace(/\s+/g, " ");

    for (const pv of normalizedVariants) {
      if (normalized.includes(pv)) {
        indices.add(idx);
        break;
      }
    }
  }

  return Array.from(indices).sort((a, b) => a - b);
}

function limitSentenceRangeCandidates(candidates, maxCount) {
  const sorted = [...candidates].sort((a, b) => {
    const scoreA = typeof a.score === "number" ? a.score : 0;
    const scoreB = typeof b.score === "number" ? b.score : 0;
    return scoreB - scoreA;
  });
  return sorted.slice(0, maxCount);
}

function convertSentenceCandidatesToTimeCandidates(candidates, sentences) {
  const out = [];

  for (const c of candidates) {
    let startIndex = c.start_sentence_index;
    let endIndex = c.end_sentence_index;

    if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex)) {
      // eslint-disable-next-line no-continue
      continue;
    }

    if (startIndex > endIndex) {
      const tmp = startIndex;
      startIndex = endIndex;
      endIndex = tmp;
    }

    const startSentence = sentences[startIndex];
    const endSentence = sentences[endIndex];
    if (!startSentence || !endSentence) {
      // eslint-disable-next-line no-continue
      continue;
    }

    let startSeconds = Number(startSentence.start_seconds);
    let endSeconds = Number(endSentence.end_seconds);
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
      // eslint-disable-next-line no-continue
      continue;
    }

    if (endSeconds <= startSeconds) {
      // eslint-disable-next-line no-continue
      continue;
    }

    if (endSeconds - startSeconds > MAX_CLIP_DURATION_SECONDS) {
      endSeconds = startSeconds + MAX_CLIP_DURATION_SECONDS;
    }

    out.push({
      start_seconds: startSeconds,
      end_seconds: endSeconds,
      title: c.title,
      description: c.description,
      reason: c.reason,
      score: typeof c.score === "number" ? c.score : undefined,
    });
  }

  return out;
}

module.exports = {
  generateCandidates,
  generateTags,
};
