# Job Tracker — project guide for Claude

A multi-user job application tracker, modeled on Kalhara's Notion page **Jobs → Application Tracker**.
Users sign up, log in, and track their own applications on a status board and in a table.

## Stack
- **Frontend:** Vite + React 19 + TypeScript, plain CSS (`src/index.css`): light-only, white background, Inter font, design tokens at the top
- **Routing:** `react-router-dom` with `HashRouter`, because GitHub Pages has no server-side rewrites
- **Auth + database:** Supabase (email/password auth, Postgres). The browser talks to Supabase directly with the anon key.
- **Hosting:** GitHub Pages, deployed by `.github/workflows/deploy.yml` on every push to `main`

There is no custom backend. Row Level Security is the only thing protecting user data.
Every new table **must** have RLS enabled and policies scoped to `auth.uid()`.

## Auth notes
- `flowType: 'pkce'` is required: Supabase then returns with `?code=` (query), not `#access_token=` (hash), so it
  doesn't collide with HashRouter. The library exchanges the code and strips it from the URL.
- PKCE links (reset, confirm) only work in the browser that requested them; `lib/auth.tsx` shows a friendly error otherwise.
- Redirects go to `appUrl()` (origin + path). Supabase must allow it: Site URL = the Pages URL; Redirect URLs =
  `https://kalharatennakoon.github.io/job-tracker/**` and `http://localhost:5173/**`.
- OAuth buttons render only for providers enabled in Supabase (read from the public `/auth/v1/settings`).
  Google is set up; GitHub just needs enabling in Supabase.
- Sign-up confirmation: `emailRedirectTo` is `appUrl()?confirmed=1`. `lib/auth.tsx` sees the marker once at load,
  lets the library exchange the code, signs out locally, cleans the URL and shows "Your email is confirmed. Please
  sign in." Works even if the link is opened in another browser (the email is confirmed server-side before redirect).
  Supabase Redirect URLs must include `https://kalharatennakoon.github.io/job-tracker/**` or the marker is dropped.
- Keep side effects (URL cleanup) out of React state updaters; StrictMode runs them twice in dev.

## Privacy & account deletion
- The repo is (or is about to be) private: GitHub Pro keeps Pages public. Don't link to the repo from the app; contact is by email.
- `public.delete_my_account()` (migration `20260927170000`) is SECURITY DEFINER, deletes only `auth.uid()`'s
  applications and auth user; executable by `authenticated` only. Keep the privacy page accurate if data
  handling changes (new tables, analytics, third parties), and bump `PRIVACY_UPDATED` in `lib/config.ts`.
- Dialogs opened from inside the navbar must be portalled to `document.body` (the bar's backdrop-filter
  creates a containing block that traps `position: fixed`).

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
| `next_step` | (new) | enum: Interview, Follow up, Assessment, Call, Other |
| `next_date` | (new) | date; form requires both or neither |
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
  lib/account.ts       deleteMyAccount() via rpc + one-time 'account deleted' notice
  lib/config.ts        Owner name, contact email (jobtracker.app.lk@gmail.com), APP_VERSION, privacy date
  lib/dates.ts         Local YYYY-MM-DD helpers (todayKey, addDays, daysBetween). Never use toISOString for "today"
  lib/nextSteps.ts     Up-next logic: plannedSteps (overdue first), urgency/labels, needsFollowUp (Applied 14+ days, nothing planned)
  lib/format.ts        fmtDate, statusClass
  lib/errors.ts        errorMessage(e): Supabase errors are plain objects, not Error; always use this for messages
  lib/stats.ts         Pure stat helpers (summary, by status, response by platform, per week)
  pages/Login.tsx      Sign in / sign up / forgot password; OAuth buttons for enabled providers
  pages/Privacy.tsx    Plain-language privacy page (#/privacy, works signed in or out)
  pages/ResetPassword.tsx  Set a new password after a reset link (shown when recovery is true)
  pages/Tracker.tsx    Page shell: views (board/table/calendar/stats), search, optimistic moveTo (reverts on error)
  components/Board.tsx  Kanban board on @dnd-kit/core: DragOverlay (tilted lift), drop slot at landing index,
                       mouse (6px to start), touch (press-and-hold 180ms), keyboard (Space, arrows jump columns)
  components/Badges.tsx  NextBadge + StatusPill (shared by board and table)
  components/CalendarView.tsx  Month calendar by Applied On (dots + agenda list on mobile)
  components/StatsView.tsx  Stats tab: stat tiles + weekly columns + bar lists, each with a table toggle
  components/ApplicationForm.tsx  Add/edit/delete modal (incl. next step + quick dates)
  components/UpNext.tsx  "Up next" strip above board/table/calendar: Done, follow-up nudges (Follow up today / Mark no response)
  components/AccountMenu.tsx  Avatar menu: Privacy, Sign out, Delete account (typed DELETE confirm)
  components/PasswordInput.tsx  Password field with show/hide eye toggle (use for every password input)
  components/Footer.tsx  Site footer (logo, v{APP_VERSION}, Privacy, Contact, Built by <name>, no link) on tracker + privacy pages
  components/Icons.tsx  Inline SVG icons + Logo (SVG, unique gradient ids via useId)
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

## UI
- Light theme only (Kalhara asked for a white background); don't reintroduce `prefers-color-scheme` dark styles.
- No horizontal scrolling anywhere: the board is a grid of 6 columns, 3 under 1180px, stacked under 700px.
  Table hides Company/Platform/Priority under 860px (company shows under the role instead).
- Status colours live in `.status-*` classes as `--st-bg/--st-fg/--st-dot`; always shown with a text label.
- Don't wrap an input in a <label> that also contains another button (e.g. "Forgot password?"): label clicks
  activate the first labelable element. Use <label htmlFor> + a `.field` div instead.
- Board cards: Enter opens, Space picks up. Clicks within 250ms of a drop are ignored (mouseup click). Don't add
  sortable-within-column without a position column in the DB; cards are ordered by the list order.
- Icons are inline SVGs in `components/Icons.tsx` (no icon library).
- Logo = stacked kanban cards with a check on a blue→violet tile (Kalhara chose it). The same artwork lives in
  `Logo` (Icons.tsx), `public/favicon.svg`, `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`;
  change them together. `public/manifest.webmanifest` makes the site installable to a phone home screen.

## Charts
- Hand-built HTML/CSS, no chart library. One series per chart in `--series-1` (light `#2a78d6`, dark `#3987e5`, both validated for contrast on the app surfaces).
- "Response rate" = share with status Interviewed, Offered, Accepted or Rejected (any reply counts). Defined in `lib/stats.ts`.
- Every chart has a hover tooltip and a "Show table" fallback; keep both when adding charts.

## Roadmap (ideas to build next)
- [x] Calendar view by Applied On (matches the Notion calendar view)
- [x] One-off import of Kalhara's Notion rows (SQL run in Supabase, kept out of the repo)
- [ ] Import from Notion CSV export (self-serve, for other users)
- [x] Next steps: interview/follow-up dates, Up next strip, card badges, calendar, follow-up nudges (v1, in-app only)
- [ ] Email reminders for next steps (needs a scheduled Supabase Edge Function)
- [x] Dashboard stats (applications per week, response rate by platform)
- [x] Privacy page, sign-up privacy note, self-serve account deletion
- [ ] Contacts / recruiter per application
- [x] Password reset flow and Google sign-in (GitHub button ready once enabled in Supabase)
- [ ] Tests (Vitest + React Testing Library)
