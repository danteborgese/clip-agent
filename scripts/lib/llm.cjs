const OpenAI = require("openai");
const { z } = require("zod");
const { buildSentencesFromTranscript } = require("./transcriptUtils.cjs");

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const MAX_CLIP_DURATION_SECONDS = 12 * 60; // 12 minutes

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
  candidates: z
    .array(
      z.object({
        start_seconds: z.number().nonnegative(),
        end_seconds: z.number().positive(),
        title: z.string(),
        description: z.string(),
        reason: z.string(),
        score: z.number().optional(),
      })
    )
    .max(10),
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
      penalty = ((duration - 150) / 150) * 1.5;
    } else if (duration <= 600) {
      penalty = 2 + ((duration - 300) / 300) * 1;
    } else {
      penalty = 4;
    }

    const adjusted = Math.max(0, baseScore - penalty);
    return { ...c, score: adjusted };
  });
}

function formatSentencesForPrompt(sentences) {
  return sentences
    .map(
      (s) =>
        `[idx=${s.index}, ${s.start_seconds.toFixed(1)}-${s.end_seconds.toFixed(1)}] ${s.text}`
    )
    .join("\n");
}

async function generateCandidates({ transcript, instruction, metadata }) {
  if (!client) {
    throw new Error("OPENAI_API_KEY is not set; cannot generate candidates");
  }

  const sentences = Array.isArray(transcript)
    ? buildSentencesFromTranscript(transcript)
    : [];

  if (!sentences.length) {
    throw new Error("No transcript sentences available for moment detection");
  }

  console.log("generateCandidates input:", {
    instruction,
    sentenceCount: sentences.length,
    metadataTitle: metadata?.title,
    metadataChannel: metadata?.channel,
  });

  const transcriptText = formatSentencesForPrompt(sentences);

  const system = `You are a clip-finding assistant. You are given the full transcript of a video as numbered sentences.
Find 1-5 clip candidates that best match the user's instruction.
Each candidate should be a contiguous range of sentences that captures a complete thought or discussion.
Rules:
- STRONGLY prefer durations between 45 and 150 seconds. This is the ideal clip length.
- Clips over 180 seconds should be rare and only used when the topic truly requires it.
- Never exceed 720 seconds (12 minutes).
- Start right before the specific topic begins and end shortly after it concludes. Be precise — don't include unrelated tangents before or after.
- Focus on the SPECIFIC topic mentioned in the instruction, not the broader discussion around it.
- Return the best matches, scored 1-10. Give higher scores to clips that are focused and concise.
Return JSON: {"candidates": [{ "start_sentence_index": N, "end_sentence_index": N, "title": "...", "description": "...", "reason": "...", "score": N }]}`;

  const user = `Instruction: ${instruction}
Title: ${metadata?.title || "Untitled"}
Channel: ${metadata?.channel || "Unknown"}
Duration: ${metadata?.durationSeconds || "unknown"} seconds

Transcript:
${transcriptText}`;

  const completion = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0,
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

  const validated = sentenceRangeResponseSchema.parse(
    Array.isArray(parsed.candidates)
      ? parsed
      : { candidates: parsed.candidates || [] }
  );

  const sentenceCandidates = validated.candidates || [];

  if (!sentenceCandidates.length) {
    throw new Error(
      "The AI found no matching moments. Try a clearer instruction or a different video."
    );
  }

  // Pass 2: Refine top 3 candidates in parallel with GPT-4.1
  const sorted = [...sentenceCandidates].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0)
  );
  const topK = sorted.slice(0, 3);
  let finalSentenceCandidates = sorted;

  try {
    const refinedResults = await Promise.all(
      topK.map((candidate) =>
        runPass2(client, candidate, sentences, instruction, metadata).catch(
          (err) => {
            console.warn(
              `Pass 2 refinement failed for candidate idx ${candidate.start_sentence_index}:`,
              err.message
            );
            return null;
          }
        )
      )
    );

    const refinedCandidates = refinedResults.filter(Boolean);
    if (refinedCandidates.length > 0) {
      for (let i = 0; i < refinedCandidates.length; i++) {
        const original = topK[i];
        const refined = refinedResults[i];
        if (refined) {
          console.log(`Pass 2 refined #${i + 1}:`, {
            before: `idx ${original.start_sentence_index}-${original.end_sentence_index}`,
            after: `idx ${refined.start_sentence_index}-${refined.end_sentence_index}`,
          });
        }
      }
      // Merge refined candidates with remaining unrefined ones
      const refinedSet = new Set(
        refinedCandidates.map((r) => `${r.start_sentence_index}-${r.end_sentence_index}`)
      );
      const remaining = sorted.slice(topK.length).filter(
        (c) => !refinedSet.has(`${c.start_sentence_index}-${c.end_sentence_index}`)
      );
      finalSentenceCandidates = [...refinedCandidates, ...remaining];
    }
  } catch (err) {
    console.warn("Pass 2 refinement failed, using pass 1 results:", err.message);
  }

  const timeCandidates = convertSentenceCandidatesToTimeCandidates(
    finalSentenceCandidates,
    sentences
  );

  const scored = applyDurationPreferenceToCandidates(timeCandidates);
  const out = responseSchema.parse({ candidates: scored }).candidates || [];

  if (!out.length) {
    throw new Error(
      "The AI found no matching moments. Try a clearer instruction or a different video."
    );
  }

  return out;
}

async function runPass2(client, topCandidate, sentences, instruction, metadata) {
  const BUFFER = 25;
  const windowStart = Math.max(0, topCandidate.start_sentence_index - BUFFER);
  const windowEnd = Math.min(
    sentences.length - 1,
    topCandidate.end_sentence_index + BUFFER
  );

  // Extract subset and re-index for clean 0..N indices
  const subset = sentences.slice(windowStart, windowEnd + 1).map((s, i) => ({
    ...s,
    index: i,
  }));

  const subsetText = formatSentencesForPrompt(subset);

  const system = `You are a clip boundary refinement assistant. You have been given a section of a video transcript that contains the topic of interest.
Your job is to find the PRECISE start and end sentence indices for a tightly focused clip.
Rules:
- The clip MUST be between 45 and 150 seconds. Only exceed 150 seconds if the specific topic absolutely requires it.
- Start at the EXACT moment the specific topic begins — not the general discussion leading up to it.
- End right when the specific topic concludes — do not include tangential follow-up discussion.
- Be aggressive about trimming. A shorter, focused clip is always better than a long, rambling one.
- Return exactly 1 candidate.
Return JSON: {"candidates": [{ "start_sentence_index": N, "end_sentence_index": N, "title": "...", "description": "...", "reason": "...", "score": N }]}`;

  const user = `Instruction: ${instruction}
Title: ${metadata?.title || "Untitled"}
Channel: ${metadata?.channel || "Unknown"}

Transcript section (${subset.length} sentences):
${subsetText}`;

  const system2 = system + `\nAlso include a "confidence" field (0.0-1.0) representing how confident you are that this clip precisely matches the instruction.
Return JSON: {"candidates": [{ "start_sentence_index": N, "end_sentence_index": N, "title": "...", "description": "...", "reason": "...", "score": N, "confidence": 0.0-1.0 }]}`;

  const completion = await client.chat.completions.create({
    model: "gpt-4.1",
    temperature: 0,
    messages: [
      { role: "system", content: system2 },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  });

  let raw = completion.choices[0]?.message?.content || "{}";
  raw = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const validated = sentenceRangeResponseSchema.parse(
    Array.isArray(parsed.candidates)
      ? parsed
      : { candidates: parsed.candidates || [] }
  );

  const refined = validated.candidates?.[0];
  if (!refined) return null;

  // Map local indices back to global
  return {
    ...refined,
    confidence: parsed.candidates?.[0]?.confidence ?? null,
    start_sentence_index: windowStart + refined.start_sentence_index,
    end_sentence_index: windowStart + refined.end_sentence_index,
  };
}

function convertSentenceCandidatesToTimeCandidates(candidates, sentences) {
  const out = [];

  for (const c of candidates) {
    let startIndex = c.start_sentence_index;
    let endIndex = c.end_sentence_index;

    if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex)) {
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
      continue;
    }

    let startSeconds = Number(startSentence.start_seconds);
    let endSeconds = Number(endSentence.end_seconds);
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
      continue;
    }

    if (endSeconds <= startSeconds) {
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

// --- Tag generation (unchanged) ---

const STOPWORDS = new Set([
  "the", "and", "for", "with", "this", "that", "when",
  "where", "what", "about", "clip", "part", "talks", "talking", "says",
]);

function extractInstructionKeywords(instruction) {
  const allWords = String(instruction || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const keywords = Array.from(
    new Set(allWords.filter((w) => w.length >= 4 && !STOPWORDS.has(w)))
  ).slice(0, 8);

  return { keywords };
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

// --- Embedding-based semantic similarity ---

async function getEmbeddings(texts) {
  if (!client) {
    throw new Error("OPENAI_API_KEY is not set; cannot compute embeddings");
  }
  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });
  return response.data.map((d) => d.embedding);
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Build sliding window embeddings over transcript sentences.
 * Returns array of { windowStart, windowEnd, start_seconds, end_seconds, embedding }
 */
async function buildTranscriptEmbeddings(sentences, windowSize = 4) {
  if (!sentences.length) return [];

  const windows = [];
  for (let i = 0; i <= sentences.length - 1; i++) {
    const end = Math.min(i + windowSize, sentences.length);
    const windowSentences = sentences.slice(i, end);
    const text = windowSentences.map((s) => s.text).join(" ");
    windows.push({
      windowStart: i,
      windowEnd: end - 1,
      start_seconds: windowSentences[0].start_seconds,
      end_seconds: windowSentences[windowSentences.length - 1].end_seconds,
      text,
    });
  }

  // Batch embed in groups of 100
  const allEmbeddings = [];
  const BATCH_SIZE = 100;
  for (let i = 0; i < windows.length; i += BATCH_SIZE) {
    const batch = windows.slice(i, i + BATCH_SIZE);
    const embeddings = await getEmbeddings(batch.map((w) => w.text));
    allEmbeddings.push(...embeddings);
  }

  return windows.map((w, i) => ({
    windowStart: w.windowStart,
    windowEnd: w.windowEnd,
    start_seconds: w.start_seconds,
    end_seconds: w.end_seconds,
    embedding: allEmbeddings[i],
  }));
}

/**
 * Find the transcript window most semantically similar to the instruction.
 * Returns { start_seconds, end_seconds, similarity } or null.
 */
async function findSemanticMatch(instruction, transcriptEmbeddings) {
  if (!transcriptEmbeddings.length) return null;

  const [instructionEmbedding] = await getEmbeddings([instruction]);

  let best = null;
  let bestSim = -1;

  for (const window of transcriptEmbeddings) {
    const sim = cosineSimilarity(instructionEmbedding, window.embedding);
    if (sim > bestSim) {
      bestSim = sim;
      best = window;
    }
  }

  if (!best) return null;

  return {
    start_seconds: best.start_seconds,
    end_seconds: best.end_seconds,
    similarity: bestSim,
    windowStart: best.windowStart,
    windowEnd: best.windowEnd,
  };
}

// --- LLM-based transcript segmentation (Improvement #5) ---

async function segmentTranscriptWithLLM(rawTranscript) {
  if (!client) {
    throw new Error("OPENAI_API_KEY is not set; cannot segment transcript");
  }

  if (!Array.isArray(rawTranscript) || rawTranscript.length === 0) {
    return rawTranscript;
  }

  // Build raw text with timestamp markers for re-alignment
  const markedText = rawTranscript
    .map((seg, i) => `<seg_${i}>${seg.text}`)
    .join(" ");

  // Process in chunks to stay within token limits
  const CHUNK_SIZE = 200; // segments per chunk
  const allSegmented = [];

  for (let i = 0; i < rawTranscript.length; i += CHUNK_SIZE) {
    const chunkSegments = rawTranscript.slice(i, i + CHUNK_SIZE);
    const chunkText = chunkSegments.map((s) => s.text).join(" ");

    const system = `You are a transcript segmentation assistant. Split the following spoken transcript into complete, grammatically correct sentences. The transcript may lack punctuation or have incorrect punctuation.
Rules:
- Each output sentence should be a complete thought
- Preserve all original words exactly — do not add, remove, or change any words
- Add appropriate punctuation (periods, question marks, exclamation marks)
- Return JSON: {"sentences": ["sentence1", "sentence2", ...]}`;

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0,
      messages: [
        { role: "system", content: system },
        { role: "user", content: chunkText },
      ],
      response_format: { type: "json_object" },
    });

    let raw = completion.choices[0]?.message?.content || "{}";
    raw = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.sentences)) {
        allSegmented.push(
          ...parsed.sentences.map((text) => ({ text, chunkOffset: i }))
        );
      }
    } catch {
      // Fallback: keep original segments for this chunk
      for (const seg of chunkSegments) {
        allSegmented.push({ text: seg.text, chunkOffset: i });
      }
    }
  }

  // Re-align segmented sentences to timestamps using fuzzy text matching
  return alignSegmentedToTimestamps(allSegmented, rawTranscript);
}

function alignSegmentedToTimestamps(segmented, rawTranscript) {
  const result = [];
  let rawIdx = 0;
  let rawCharPos = 0;
  const rawTexts = rawTranscript.map((s) => (s.text || "").toLowerCase().trim());
  const rawJoined = rawTexts.join(" ");

  for (let i = 0; i < segmented.length; i++) {
    const sentText = (segmented[i].text || "").toLowerCase().trim();
    if (!sentText) continue;

    // Find where this sentence starts in the raw joined text
    const searchFrom = rawCharPos;
    const foundPos = rawJoined.indexOf(sentText.slice(0, 20), searchFrom);
    const startPos = foundPos >= 0 ? foundPos : rawCharPos;

    // Find end position
    const endPos = startPos + sentText.length;

    // Map character positions back to raw segment indices
    let charCount = 0;
    let startSegIdx = 0;
    let endSegIdx = 0;

    for (let j = 0; j < rawTexts.length; j++) {
      const segLen = rawTexts[j].length + 1; // +1 for join space
      if (charCount + segLen > startPos && startSegIdx === 0 && j > 0) {
        startSegIdx = j;
      } else if (charCount <= startPos) {
        startSegIdx = j;
      }
      if (charCount + segLen >= endPos) {
        endSegIdx = j;
        break;
      }
      charCount += segLen;
    }

    if (endSegIdx < startSegIdx) endSegIdx = startSegIdx;
    if (endSegIdx >= rawTranscript.length) endSegIdx = rawTranscript.length - 1;

    result.push({
      index: i,
      start_seconds: rawTranscript[startSegIdx].start_seconds,
      end_seconds: rawTranscript[endSegIdx].end_seconds,
      text: segmented[i].text,
    });

    rawCharPos = endPos;
  }

  return result;
}

// --- Confidence scoring (Improvement #6) ---

function computeConfidenceScore({
  candidates,
  bestCandidate,
  semanticSimilarity,
  transcriptQuality,
}) {
  const signals = [];

  // Signal 1: Score gap between #1 and #2 candidate (higher gap = more confident)
  if (candidates && candidates.length >= 2) {
    const sorted = [...candidates].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const gap = (sorted[0].score ?? 0) - (sorted[1].score ?? 0);
    const gapSignal = Math.min(gap / 5, 1); // Normalize: 5-point gap = max confidence
    signals.push({ name: "score_gap", value: gapSignal, weight: 0.2 });
  }

  // Signal 2: LLM self-reported confidence from Pass 2
  if (bestCandidate?.confidence != null) {
    signals.push({
      name: "llm_confidence",
      value: Number(bestCandidate.confidence) || 0,
      weight: 0.3,
    });
  }

  // Signal 3: Semantic similarity between instruction and clip content
  if (semanticSimilarity != null) {
    signals.push({
      name: "semantic_similarity",
      value: Math.max(0, Math.min(1, semanticSimilarity)),
      weight: 0.3,
    });
  }

  // Signal 4: Transcript quality (segment density, average length)
  if (transcriptQuality != null) {
    signals.push({
      name: "transcript_quality",
      value: Math.max(0, Math.min(1, transcriptQuality)),
      weight: 0.2,
    });
  }

  if (signals.length === 0) return null;

  // Weighted average, redistributing weight from missing signals
  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  const score = signals.reduce(
    (sum, s) => sum + (s.value * s.weight) / totalWeight,
    0
  );

  return {
    score: Math.round(score * 100) / 100,
    signals: signals.map((s) => ({
      name: s.name,
      value: Math.round(s.value * 100) / 100,
    })),
  };
}

/**
 * Assess transcript quality based on segment statistics.
 * Returns 0.0-1.0.
 */
function assessTranscriptQuality(transcript) {
  if (!Array.isArray(transcript) || transcript.length === 0) return 0;

  const texts = transcript.map((s) => (s.text || "").trim()).filter(Boolean);
  if (texts.length === 0) return 0;

  const avgLen = texts.reduce((sum, t) => sum + t.length, 0) / texts.length;
  const hasPunctuation =
    texts.filter((t) => /[.!?]/.test(t)).length / texts.length;

  // More segments = generally better coverage
  const densityScore = Math.min(texts.length / 100, 1);
  // Average length 20-80 chars is ideal
  const lengthScore = avgLen < 5 ? 0.2 : avgLen < 20 ? 0.5 : avgLen <= 80 ? 1 : 0.7;
  // Punctuation presence suggests manual/better captions
  const punctScore = hasPunctuation;

  return densityScore * 0.3 + lengthScore * 0.3 + punctScore * 0.4;
}

// --- Whisper transcription (Improvement #7) ---

async function transcribeWithWhisper(audioPath) {
  if (!client) {
    throw new Error("OPENAI_API_KEY is not set; cannot transcribe with Whisper");
  }

  const fs = require("fs");
  const fileSize = fs.statSync(audioPath).size;
  const MAX_WHISPER_SIZE = 25 * 1024 * 1024; // 25MB

  if (fileSize > MAX_WHISPER_SIZE) {
    // Split and transcribe in chunks
    return await transcribeChunked(audioPath);
  }

  const response = await client.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });

  return (response.segments || []).map((seg) => ({
    start_seconds: seg.start,
    end_seconds: seg.end,
    text: seg.text.trim(),
  }));
}

async function transcribeChunked(audioPath) {
  const { execSync } = require("child_process");
  const path = require("path");
  const fs = require("fs");

  const outDir = path.join(process.cwd(), "tmp", "whisper-chunks");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Split into 10-minute chunks
  const chunkDuration = 600;
  execSync(
    `ffmpeg -i "${audioPath}" -f segment -segment_time ${chunkDuration} -c copy "${outDir}/chunk_%03d.mp3" -y 2>/dev/null`,
    { stdio: "pipe" }
  );

  const chunks = fs
    .readdirSync(outDir)
    .filter((f) => f.startsWith("chunk_") && f.endsWith(".mp3"))
    .sort();

  const allSegments = [];
  let timeOffset = 0;

  for (const chunkFile of chunks) {
    const chunkPath = path.join(outDir, chunkFile);
    const response = await client.audio.transcriptions.create({
      file: fs.createReadStream(chunkPath),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    for (const seg of response.segments || []) {
      allSegments.push({
        start_seconds: seg.start + timeOffset,
        end_seconds: seg.end + timeOffset,
        text: seg.text.trim(),
      });
    }

    timeOffset += chunkDuration;
    try { fs.unlinkSync(chunkPath); } catch { /* ignore */ }
  }

  try { fs.rmdirSync(outDir); } catch { /* ignore */ }
  return allSegments;
}

module.exports = {
  generateCandidates,
  generateTags,
  getEmbeddings,
  cosineSimilarity,
  buildTranscriptEmbeddings,
  findSemanticMatch,
  segmentTranscriptWithLLM,
  computeConfidenceScore,
  assessTranscriptQuality,
  transcribeWithWhisper,
};
