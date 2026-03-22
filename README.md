# Clip Agent

Turn a single media link (YouTube for now) + a natural-language instruction into a ready-to-publish clip: trimmed video in Google Drive and a Notion Clips entry with status **Needs approval**.

## Setup

1. **Supabase** – Create a project and run `supabase/schema.sql` in the SQL editor.
2. **GitHub** – Create a new repo (e.g. `clip-agent`), push this code, then add Actions secrets:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
   - `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_DRIVE_FOLDER_ID`
   - `NOTION_TOKEN`, `NOTION_CLIPS_DB_ID`
3. **Notion** – Create a “Clips” database with columns: Name (title), Description (rich text), Status (status), Source URL (url), Clip URL (url), Attribution (rich text). Share the database with your integration.
4. **Local / deploy** – Copy `.env.example` to `.env.local`, fill in values. For auto-dispatch from the inbox, set `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`.

## Run locally

- Inbox (form + API): `npm run dev` → http://localhost:3001
- Worker runs in GitHub Actions when you submit a job (or trigger the workflow manually with a `job_id`).

**If the GitHub Action fails with "YouTube blocked the request"** (common from data-center IPs), run the job on your machine instead. Set the same env vars (e.g. in `.env.local` or export them), then:

```bash
cd clip-agent
JOB_ID=<paste-the-job-id-from-the-form> npm run process-job
```

Use the job ID returned when you submitted the form (e.g. `8c444484-9c92-4c37-8d77-af40058f98bb`).

## Push to a new GitHub repo

The `clip-agent` folder is meant to live in its own GitHub repo. Your personal-website repo ignores it via `.gitignore`.

1. Create a new empty repo on GitHub (e.g. `danteborgese/clip-agent`).
2. Copy the `clip-agent` folder somewhere (e.g. your Desktop or `~/Projects`) so it’s no longer inside the personal-website repo—or open it in place and run:

```bash
cd clip-agent
git init
git add .
git commit -m "Initial clip-agent"
git remote add origin https://github.com/YOUR_USERNAME/clip-agent.git
git branch -M main
git push -u origin main
```

3. In that repo’s **Settings → Secrets and variables → Actions**, add the secrets listed in Setup.

## Flow

1. Submit URL + instruction via the web form (or `POST /api/clip-jobs`).
2. A job is created in Supabase and the `process-clip-job` workflow is dispatched.
3. The workflow: ingest transcript → LLM picks moments → download + trim → upload to Drive → create Notion page.
4. You approve in Notion; publish (X / YouTube Shorts) is a separate step later.
