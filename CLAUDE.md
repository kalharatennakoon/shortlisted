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
  lib/supabase.ts      Supabase client (reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
  lib/auth.tsx         AuthProvider + useAuth() session hook
  lib/types.ts         Application type + enum constants
  lib/applications.ts  CRUD calls against the applications table
  pages/Login.tsx      Sign in / sign up
  pages/Tracker.tsx    Board (drag between status columns) + table views, search
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

## Roadmap (ideas to build next)
- [ ] Calendar view by Applied On (matches the Notion calendar view)
- [ ] Import from Notion CSV export
- [ ] Interview dates and follow-up reminders
- [ ] Dashboard stats (applications per week, response rate by platform)
- [ ] Contacts / recruiter per application
- [ ] Password reset flow and OAuth (Google/GitHub) sign-in
- [ ] Tests (Vitest + React Testing Library)
