const OpenAI = require("openai");
const { z } = require("zod");

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const candidateSchema = z.object({
  start_seconds: z.number().nonnegative(),
  end_seconds: z.number().positive(),
  title: z.string(),
  description: z.string(),
  reason: z.string(),
  score: z.number().optional(),
});

const responseSchema = z.object({
  candidates: z.array(candidateSchema).min(1).max(10),
});

async function generateCandidates({ transcript, instruction, metadata }) {
  if (!client) {
    throw new Error("OPENAI_API_KEY is not set; cannot generate candidates");
  }

  const limitedTranscript = transcript.slice(0, 800);
  const transcriptText = limitedTranscript
    .map((s) => `[${s.start_seconds.toFixed(1)}-${s.end_seconds.toFixed(1)}] ${s.text}`)
    .join("\n");

  const system = `
You are a clip-finding assistant for a creator brand.
Themes: mental models, personal growth, systems, creator business.
Return 3–10 high-signal candidate moments from a transcript that match the themes and the user's instruction.
Output strictly as JSON matching this schema:
{
  "candidates": [
    {
      "start_seconds": number,
      "end_seconds": number,
      "title": string,
      "description": string,
      "reason": string,
      "score": number
    }
  ]
}
Do not include any extra keys or commentary.
`;

  const user = `
Instruction: ${instruction}
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

  const raw = completion.choices[0]?.message?.content || "{}";
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error("LLM returned invalid JSON for candidates");
  }

  const validated = responseSchema.parse(parsed);
  return validated.candidates;
}

module.exports = {
  generateCandidates,
};
