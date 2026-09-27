# Job Tracker — project guide for Claude

A multi-user job application tracker, modeled on Kalhara's Notion page **Jobs → Application Tracker**.
Users sign up, log in, and track their own applications on a status board and in a table.

## Stack
- **Frontend:** Vite + React 19 + TypeScript, plain CSS (`src/index.css`, Notion-like look, light and dark)
- **Routing:** `react-router-dom` with `HashRouter`, because GitHub Pages has no server-side rewrites
- **Auth + database:** Supabase (email/password auth, Postgres). The browser talks to Supabase directly with the anon key.
- **Hosting:** GitHub Pages, deployed by `.github/workflows/deploy.yml` on every push to `main`

There is no custom backend. Row Level Security is the only thing protecting user data.
Every new table **must** have RLS enabled and policies scoped to `auth.uid()`.

## Auth notes
- `flowType: 'pkce'` is required: Supabase then returns with `?code=` (query), not `#access_token=` (hash), so it
  doesn't collide with HashRouter. The library exchanges the code and strips it from the URL.
- PKCE links (reset, confirm) only work in the browser that requested them; `lib/auth.tsx` shows a friendly error otherwise.
- Redirects go to `appUrl()` (origin + path). Supabase must allow it: Site URL = the Pages URL, plus `http://localhost:5173/**`.
- OAuth buttons render only for providers enabled in Supabase (read from the public `/auth/v1/settings`).
  Google is set up; GitHub just needs enabling in Supabase.
- Keep side effects (URL cleanup) out of React state updaters; StrictMode runs them twice in dev.

## Data model (mirrors the Notion database)
Table `public.applications`, defined in `supabase/migrations/`:

| Column | Notion property | Type |
|---|---|---|
| `name` | Name (title), the role | text, required |
| `company` | Company | text |
| `applied_on` | Applied On | date |
| `platform` | Platform | enum: Email, Company Website, LinkedIn, Other |
| `priority` | Priority | enum: Low, Medium, High |
| `status` | Status | enum: Applied, Interviewed, Offered, Accepted, Rejected, No Response |
| `job_url`, `notes` | (new, not in Notion) | text |
| `user_id` | (owner) | uuid → auth.users, defaults to `auth.uid()` |

Notion status groups: To-do = Applied, Interviewed · In progress = Offered · Complete = Accepted, Rejected, No Response.
Notion views: a **board grouped by Status** (shows Name, Company, Applied On) and a **calendar by Applied On**.

The enum values in SQL and the constants in `src/lib/types.ts` must match exactly. When you change one, change the other.

## Layout
```
src/
  lib/supabase.ts      Supabase client (PKCE flow), appUrl(), enabledOAuthProviders()
  lib/auth.tsx         AuthProvider + useAuth(): session, recovery flag, email-link errors
  lib/types.ts         Application type + enum constants
  lib/applications.ts  CRUD calls against the applications table
  lib/stats.ts         Pure stat helpers (summary, by status, response by platform, per week)
  pages/Login.tsx      Sign in / sign up / forgot password; OAuth buttons for enabled providers
  pages/ResetPassword.tsx  Set a new password after a reset link (shown when recovery is true)
  pages/Tracker.tsx    Board (drag between status columns), table and calendar views, search
  components/CalendarView.tsx  Month calendar by Applied On (dots + agenda list on mobile)
  components/StatsView.tsx  Stats tab: stat tiles + weekly columns + bar lists, each with a table toggle
  components/ApplicationForm.tsx  Add/edit/delete modal
supabase/migrations/   SQL migrations, run in order
```

## Commands
- `npm run dev`: local dev server (needs `.env`, see `.env.example`)
- `npm run build`: type-check and build to `dist/`
- `npm run lint`: oxlint

## Conventions
- Schema changes go in a **new** timestamped file in `supabase/migrations/`. Never edit an applied migration.
- Keep data access in `src/lib/`; components shouldn't call `supabase.from(...)` directly.
- Never commit `.env` or the Supabase **service_role** key. Only the anon key goes to the browser and to GitHub secrets.
- `vite.config.ts` reads `VITE_BASE` so assets resolve under `/<repo-name>/` on Pages.

## Charts
- Hand-built HTML/CSS, no chart library. One series per chart in `--series-1` (light `#2a78d6`, dark `#3987e5`, both validated for contrast on the app surfaces).
- "Response rate" = share with status Interviewed, Offered, Accepted or Rejected (any reply counts). Defined in `lib/stats.ts`.
- Every chart has a hover tooltip and a "Show table" fallback; keep both when adding charts.

## Roadmap (ideas to build next)
- [x] Calendar view by Applied On (matches the Notion calendar view)
- [x] One-off import of Kalhara's Notion rows (SQL run in Supabase, kept out of the repo)
- [ ] Import from Notion CSV export (self-serve, for other users)
- [ ] Interview dates and follow-up reminders
- [x] Dashboard stats (applications per week, response rate by platform)
- [ ] Contacts / recruiter per application
- [x] Password reset flow and Google sign-in (GitHub button ready once enabled in Supabase)
- [ ] Tests (Vitest + React Testing Library)
