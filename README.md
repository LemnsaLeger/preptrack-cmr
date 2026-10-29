# PrepTrack CMR

A small, offline-first academic deadline tracker for university students in Cameroon.
React + Vite, TailwindCSS, IndexedDB (local-first), Supabase (optional accounts + cloud backup), PWA.

## Quick start (no Supabase needed)

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + UI tests
npm run build      # production build in dist/
npm run preview    # serve dist/ locally (service worker is active here, not in `dev`)
```

Without Supabase credentials the app runs as a fully working **guest / device-only** app: deadlines are
stored in IndexedDB. The account dialog tells the user cloud sync isn't configured.

## Connect Supabase (optional cloud sync)

1. Create a project at <https://supabase.com>.
2. SQL Editor → run the migration files in `supabase/migrations/` in order:
  - `20261009000000_create_deadlines.sql`
  - `20261014000000_create_schedules.sql` (this adds the schedules table used by the scheduler feature)
   (table, constraints, indexes, Row Level Security).
3. Authentication → Providers → Email: enabled. Decide whether "Confirm email" is on
   (the app handles both; with confirmation on, new users must click the emailed link before signing in).
4. Authentication → URL Configuration: set **Site URL** to your deployed URL.
5. Copy `.env.example` to `.env` in the project root and fill the values:

  - `VITE_SUPABASE_URL`: your Supabase project URL (looks like `https://<project-ref>.supabase.co`)
  - `VITE_SUPABASE_ANON_KEY`: the anon (publishable) API key from Project Settings → API → Project API keys

  Example command (Windows PowerShell):

  ```powershell
  copy .env.example .env
  notepad .env   # paste your values and save
  ```

  Important: Do NOT commit `.env` to source control. The app uses only the anon key in-browser; if you add server-side code that needs the `service_role` key, keep that in a server-only secret store (do not add it to `.env` in the client repo).
6. Rebuild (`npm run build`). Vite inlines these values at build time.

## Deploy (static hosting)

Deploy the `dist/` folder to any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages at a domain root).
Set the `VITE_SUPABASE_*` variables in the host's build settings (Vercel/Netlify/Cloudflare all expose a place to set `VITE_`-prefixed build-time env vars). Serve over **HTTPS** (required for
service workers and install prompts). The app expects to be served from the site root (`/`).

Local development: Vite will read a `.env` file at the project root for env vars. After adding `.env`, restart the dev server.

Applying migrations remotely vs locally:

- Dashboard SQL Editor: open Supabase → SQL → paste each migration and run. This is simplest for quick testing.
- Supabase CLI (recommended for reproducible deployments): install `supabase` CLI, authenticate, then run `supabase db remote commit` / `supabase db push` depending on your workflow. See https://supabase.com/docs/guides/cli for details.

If you have any trouble applying the SQL files, paste the SQL here and I can help adjust it for the dashboard or provide a CLI command sequence.

## How it works

| Concern | Approach |
| --- | --- |
| Save | Validate → write to IndexedDB → UI updates only after the write commits → background sync. A failed local write shows an error and keeps the form values. |
| Sync | `src/lib/sync.js`. Client-generated UUIDs make uploads idempotent upserts. Last write wins by `updated_at`. Records stay "pending" until the cloud confirms. Deletes are tombstones until confirmed. |
| Retry | Foreground only (no Background Sync dependency): on app open, when the browser comes back online, when the tab regains focus, and every 30 s while changes are pending/failed. |
| Guest → account | After sign-in, the account dialog offers "Upload to my account". Guest rows are uploaded, read back, and only then re-assigned locally. A failed or partial upload leaves guest data untouched. |
| Privacy on shared devices | Local records are tagged with their owner. Signing out first tries to sync, warns if anything is unsynced, then removes that account's local cache. Signing in as a different user also purges any other account's cache. |
| Server security | RLS: users can only select/insert/update/delete rows where `user_id = auth.uid()`. `anon` has no table access. Only the public anon key is used in the browser. |
| Offline reopening | `sw.js` is generated at build time with the full list of built files, so the app shell is cached on first visit. Supabase requests are never intercepted. |

## Behaviour notes and limits

- **Editing an overdue deadline** is allowed without changing its date; a *changed* date must be in the future.
- **Storage is not guaranteed.** Browsers can evict site data (low disk space, "clear site data", some private modes).
  The app reports when IndexedDB is unavailable or a write fails. Signing in and syncing is the backup.
- **Cloud pull** fetches all of a user's deadlines in one request (Supabase returns up to 1,000 rows by default).
  That is far above realistic use for this app; add pagination if it ever matters.
- **Clock skew:** conflict resolution compares client timestamps. A badly wrong phone clock can cause a stale edit to win.
- **Email + password only.** Google / phone sign-in shown in the Stitch mock would need provider setup in Supabase and is not implemented.
- **Time zone:** due times are entered and shown in the device's local time zone and stored as UTC.

## Project structure

```
src/
  components/  DeadlineCard, QuickAddDeadline, ConfirmDialog, AccountModal, SyncStatus, Dialog, Icon, Logo
  pages/       Dashboard
  hooks/       useDeadlines (local-first store + sync loop), useAuth, useNow
  lib/         db.js (IndexedDB), sync.js, supabase.js
  utils/       deadlineUtils.js (validation, countdowns, grouping)
sw.template.js         service worker source (build injects the precache list)
supabase/migrations/   SQL schema + RLS
public/                manifest, icons
```

## Public auth + email reminders

This app supports:
- Email + password sign up with a required username
- Deadline creation and schedule setup by signed-in users
- Email reminders via Resend
- Daily reminder jobs via Vercel cron/serverless route

### Required setup

1. Supabase project
   - Enable Email auth
   - Run the SQL migration files in `supabase/migrations/` in order
   - Keep the project URL and anon key for the browser
   - Create a service role key for server-side API functions and store it in Vercel as a secret

2. Vercel project
   - Add the frontend env values:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
   - Add server env values in Vercel Project Settings → Environment Variables:
     - `SUPABASE_URL`
     - `SUPABASE_SERVICE_ROLE_KEY`
     - `RESEND_API_KEY`
     - `RESEND_FROM_EMAIL`

3. Resend
   - Create a verified sender address
   - Put that email in `RESEND_FROM_EMAIL`
   - Example: `noreply@yourdomain.com`

### Daily reminder flow

- When a user signs up, their `username` is stored in the `profiles` table.
- When a deadline/schedule is created, the app can enqueue a reminder event in Supabase.
- A Vercel cron job should call `/api/send-reminders` at a regular interval (for example every 10 minutes).
- The worker checks `reminder_events` where `status = 'pending'` and `scheduled_for <= now + 10 minutes`, then sends an email with Resend.

### Example cron setup

Add a Vercel cron configuration,
for example:

```json
{
  "crons": [
    {
      "path": "/api/send-reminders",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

### Notes

- This is the public-friendly version that uses email rather than SMS.
- Real SMS delivery needs a paid provider such as Twilio or a mobile messaging partner.
