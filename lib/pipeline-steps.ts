import type { PipelineStep } from "./pipeline/types";

export interface StepConfig {
  key: PipelineStep;
  label: string;
  description: string;
}

export const PIPELINE_STEPS: StepConfig[] = [
  {
    key: "ingest",
    label: "Ingesting",
    description: "Fetching video metadata and transcript",
  },
  {
    key: "moments",
    label: "Finding Moments",
    description: "LLM generating and scoring clip candidates",
  },
  {
    key: "clip",
    label: "Clipping Video",
    description: "Downloading, trimming, and uploading clip",
  },
  {
    key: "publish",
    label: "Publishing",
    description: "Generating tags and creating Notion page",
  },
  {
    key: "done",
    label: "Complete",
    description: "Job finished successfully",
  },
];
