export interface EvalCase {
  id: string;
  fixtureFile: string;
  instruction: string;
  expectedStart: number;
  expectedEnd: number;
  toleranceSeconds: number;
  /** Minimum acceptable overlap ratio (IoU) */
  minOverlap?: number;
  /** Tags to verify appear in the clip content */
  expectedContentKeywords?: string[];
}

export const EVAL_CASES: EvalCase[] = [
  {
    id: "elon-industrialist",
    fixtureFile: "qBVe3M2g_SA",
    instruction:
      "Clip the part where he talks about Elon being an old-school industrialist.",
    expectedStart: 5907,
    expectedEnd: 5988,
    toleranceSeconds: 45,
    minOverlap: 0.5,
    expectedContentKeywords: ["elon", "industrialist"],
  },
];
