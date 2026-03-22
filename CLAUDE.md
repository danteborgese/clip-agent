# Clip Agent

YouTube URL + instruction → LLM-detected clip → Supabase Storage + Notion page.

## Commands

```bash
npm run dev            # Next.js dev server
npm run build          # Production build
npm run lint           # ESLint
npm run lint:fix       # ESLint autofix
npm run run-job        # Run a specific job: JOB_ID=<uuid> npm run run-job
npm run run-pending    # Claim and run the next pending job
```

## Architecture

- **`app/`** — Next.js 16 frontend (React 19, TypeScript, Tailwind 4). Form UI + real-time job tracker + API routes.
- **`app/components/`** — SubmitForm, JobTracker, JobProgress, StepItem, JobHistory.
- **`hooks/`** — `useJobSubscription` (Supabase Realtime), `useJobHistory`.
- **`lib/pipeline/`** — Step-machine orchestrator. `orchestrator.ts` runs the loop; `steps/` has `ingest.ts`, `moments.ts`, `clip.ts`, `publish.ts`.
- **`lib/`** — Shared TypeScript utilities (job creation, YouTube URL parsing, Supabase client, pipeline step config).
- **`scripts/`** — CLI entry points (`run-job.ts`, `run-pending.ts`). `scripts/lib/` has CommonJS modules for youtube, llm, downloader, ffmpeg, supabaseStorage, notion, db.
- **`supabase/`** — PostgreSQL schema + migration (`add-step-columns.sql`).

## Pipeline (Step Machine)

Supabase `step` column drives progression: `ingest → moments → clip → publish → done`.

Each step is an isolated, resumable handler. If the process crashes, re-running with the same job ID resumes from the failed step.

1. **Ingest** — Fetch YouTube metadata + transcript
2. **Moments** — LLM generates candidates, scores, selects best
3. **Clip** — Download video, refine time window, FFmpeg trim, upload to Supabase Storage
4. **Publish** — Generate tags, create Notion page

### How jobs are triggered

- `createClipJob()` inserts the row then fire-and-forget calls `runPipeline(jobId)` directly
- The API route (`POST /api/clip-jobs/{id}/run`) can also trigger the pipeline for a given job ID
- For CLI: `JOB_ID=xxx npm run run-job`
- For stuck jobs: `npm run run-pending`

## Code Conventions

- `app/`, `lib/`, `hooks/` use **TypeScript** (strict mode, `@/*` path alias)
- `scripts/lib/` uses **CommonJS** (`.cjs` extension, `require()`)
- Pipeline step handlers import CJS modules via `require()`
- Styling with **Tailwind CSS 4**
- Input validation with **Zod** (API routes)

## Environment

Copy `.env.example` to `.env.local` and fill in:

| Variable | Required | Purpose |
|----------|----------|---------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase URL (browser client) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key (browser client) |
| `OPENAI_API_KEY` | Yes | OpenAI API (moment detection + tagging) |
| `SUPABASE_CLIPS_BUCKET` | Yes | Supabase Storage bucket for clip uploads |
| `NOTION_TOKEN` | Yes | Notion integration token |
| `NOTION_CLIPS_DB_ID` | Yes | Notion Clips database ID |

## Supabase Setup

- Enable Realtime replication for the `jobs` table
- Add RLS SELECT policy for anon reads
- The `step`, `step_output`, `step_details` columns are included in the base schema

## Limits

- Max source video: 5 hours
- Max clip duration: 12 minutes
- Node >= 20.9.0
- Requires `ffmpeg` and `yt-dlp` on PATH for processing
