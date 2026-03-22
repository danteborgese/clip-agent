export type PipelineStep = "ingest" | "moments" | "clip" | "publish" | "done";

export const STEP_ORDER: PipelineStep[] = [
  "ingest",
  "moments",
  "clip",
  "publish",
  "done",
];

export interface Job {
  id: string;
  url: string;
  instruction: string;
  status: string;
  step: PipelineStep;
  step_output: StepOutput;
  step_details: StepDetail[];
  platform: string;
  metadata: Record<string, unknown> | null;
  selected_candidate_id: string | null;
  clip_storage_path: string | null;
  clip_url: string | null;
  notion_page_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export type StepOutput = Record<string, unknown>;

export interface StepDetail {
  step: PipelineStep;
  status: "active" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  summary?: string;
  error?: string;
}

export interface StepResult {
  data: Record<string, unknown>;
  summary: string;
}

export type StepHandler = (
  job: Job,
  accumulated: StepOutput
) => Promise<StepResult>;
