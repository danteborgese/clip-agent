# Clip Agent — pipeline & testing

How a job moves from the inbox through `process-job`, plus **checklists** to track manual testing. Log labels **STEP 1**, **STEP 2**, **STEP 6**, etc. match `console.log` in the code.

---

## 1. Overview

| Stage | Where | Output |
|-------|--------|--------|
| **Inbox** | Next.js + Supabase | Row in `jobs` with `status: pending`, log **STEP 1 – job created** |
| **Trigger** | You, Actions, or `worker` | `JOB_ID=… npm run process-job` (or equivalent) |
| **Processor** | `scripts/process-job.cjs` | Drive file, Notion page, `status: done` |

---

## 2. Inbox — create the job

Happens in `lib/jobs/createClipJob.ts` (form action or `POST /api/clip-jobs`).

1. Validate non-empty `url` and `instruction`.
2. Validate YouTube URL → 11-char video id (`lib/youtube/parseVideoId.ts`).
3. Insert into `jobs` (`status: pending`).
4. **STEP 1 – job created** — log `{ jobId, url, instruction }`.

**Submission notes**

- **Server Action (form):** POST to `/` often returns **200** when the action finishes; use returned state or UI message for success vs error.
- **`POST /api/clip-jobs`:** uses HTTP status (**201** ok, **400** validation, etc.).

Optional: `GITHUB_TOKEN` / `GITHUB_OWNER` / `GITHUB_REPO` in `.env.example` are for optional future auto-dispatch of Actions; processing can still be started manually.

### Checklist — inbox

Use this before you run `process-job`.

- [x] **STEP 1 – job created** — Submit a valid URL + instruction; confirm Supabase row exists, `pending`, and server log shows STEP 1 with correct `jobId` / `url` / `instruction`.
- [ ] Invalid URL rejected — form or API returns a clear error; no row (or no success path).
- [ ] `POST /api/clip-jobs` — **201** + `jobId` on success; **400** on bad input (optional if you only use the form).

---

## 3. Trigger processing

Until something runs the processor, the job stays **`pending`**.

| Method | Command / action |
|--------|------------------|
| **Local one-off** | `JOB_ID=<uuid> npm run process-job` (loads `.env.local` if present) |
| **Worker** | `npm run worker` — claims `pending`, runs `process-job` per job |
| **GitHub Actions** | Workflow **Process Clip Job** → `workflow_dispatch` → input `job_id` |

If YouTube blocks CI IPs, run locally with the same secrets as Actions.

### Checklist — trigger

- [ ] **Local:** `JOB_ID` set; process starts and connects to Supabase (no immediate exit).
- [ ] **Actions:** workflow runs with repo secrets (optional).
- [ ] **Worker:** picks up a `pending` job when no other runner has claimed it (optional).

---

## 4. Processor — `scripts/process-job.cjs`

**Status order on success:**  
`pending` → `ingesting` → `moments` → `clipping` → `notion` → `done`  

On failure: `failed` + `error` message.

Below, steps are grouped by **phase**. Use the checklist to record what you have exercised end-to-end.

### Phase A — Ingest

| Step | What happens | Code |
|------|----------------|------|
| A1 | Load job by `JOB_ID`. Missing / not found → error. | `process-job.cjs` |
| A2 | Set status **`ingesting`**. | `updateJob` |
| A3 | Fetch YouTube **metadata + transcript**. | `scripts/lib/youtube.cjs` |
| A4 | **Duration guard** — if duration over **5 hours**, fail. | `process-job.cjs` |
| A5 | **STEP 2 – ingest complete** — log duration, transcript segment count, title, channel; store **metadata** on the job row. | logs + DB |

### Phase B — Moments (LLM)

| Step | What happens | Code |
|------|----------------|------|
| B1 | Set status **`moments`**. | `updateJob` |
| B2 | **LLM:** candidate moments from transcript + instruction; **insert** rows into **`candidates`**; select **highest score**. | `scripts/lib/llm.cjs`, `db.cjs` |
| B3 | **STEP 6 – best candidate selected** — log window, title, score, etc. | logs |

### Phase C — Clipping

| Step | What happens | Code |
|------|----------------|------|
| C1 | Set status **`clipping`**. | `updateJob` |
| C2 | **Download** source video. | `scripts/lib/downloader.cjs` |
| C3 | **Trim window** — start/end from best candidate, **max ~12 min**, optional keyword/quote refinement, **snap** to transcript sentences. | `transcriptUtils.cjs`, helpers in `process-job.cjs` |
| C4 | **STEP 7** — log **initial** and **snapped** times. | logs |
| C5 | **FFmpeg** trim. | `scripts/lib/ffmpeg.cjs` |
| C6 | **STEP 9 – trim complete** — log paths and duration. | logs |

### Phase D — Publish

| Step | What happens | Code |
|------|----------------|------|
| D1 | **Upload** clip to **Google Drive**; save `drive_file_id` / `drive_link`; delete local temp files. | `scripts/lib/googleDrive.cjs` |
| D2 | **Tags** (optional LLM) — on failure, empty tags. | `llm.cjs` |
| D3 | Set status **`notion`**. | `updateJob` |
| D4 | **Create Notion** Clips page (title, description, source URL, Drive link, candidates, tags, duration, file size). | `scripts/lib/notion.cjs` |
| D5 | Set **`notion_page_id`**, status **`done`**. | `updateJob` |
| D6 | **STEP 10 – job marked done** — log `jobId`, `notion_page_id`. | logs |

---

## 5. Checklist — processor (test each step)

Check a row when you have run a real job and verified the step (logs, DB, Drive, or Notion as appropriate).  
*Progress: processor **A1** (load job) tested.*

- [x] **A1** — Load job; confirm error if `JOB_ID` missing or job not in DB.
- [ ] **A2** — After start, job status is **`ingesting`**.
- [ ] **A3** — Metadata + transcript fetched (no throw); transcript non-empty for a normal video.
- [ ] **A4** — *(Optional)* Very long source fails with duration error, or skip if impractical.
- [ ] **A5** — **STEP 2** appears in logs; **`metadata`** on job row looks correct.
- [ ] **B1** — Status **`moments`** before LLM candidates.
- [ ] **B2** — **`candidates`** table has rows; best candidate matches highest score.
- [ ] **B3** — **STEP 6** log matches selected window and title.
- [ ] **C1** — Status **`clipping`** before download.
- [ ] **C2** — Download completes (local file path in logs / no download error).
- [ ] **C3** — Trim window reasonable; snap behavior OK if you vary instruction/keywords.
- [ ] **C4** — **STEP 7** shows initial and snapped times.
- [ ] **C5** — FFmpeg produces a clip file.
- [ ] **C6** — **STEP 9** logs clip path and duration.
- [ ] **D1** — File in Drive; job row has **`drive_link`**; temps cleaned up.
- [ ] **D2** — Tags present or empty fallback without failing the job.
- [ ] **D3** — Status **`notion`** before Notion create.
- [ ] **D4** — Notion page exists with expected fields and links.
- [ ] **D5** — **`notion_page_id`** set; status **`done`**.
- [ ] **D6** — **STEP 10** logged with correct ids.

**Failure path (optional)**

- [ ] Forced error (e.g. bad `JOB_ID` mid-pipeline if you can simulate) → status **`failed`**, **`error`** populated.

---

## 6. After the pipeline

- Review **Drive** + **Notion** (e.g. **Needs approval** in your workflow).
- Publishing to X / Shorts is outside this automation.

---

## 7. Related files

| Area | Files |
|------|--------|
| Form + action | `app/page.tsx`, `app/actions/clip-jobs.ts` |
| Create job + URL validation | `lib/jobs/createClipJob.ts`, `lib/youtube/parseVideoId.ts` |
| HTTP API | `app/api/clip-jobs/route.ts` |
| Worker | `scripts/worker.cjs` |
| Processor | `scripts/process-job.cjs` |
| CI | `.github/workflows/process-clip-job.yml` |
| Schema | `supabase/schema.sql` |
