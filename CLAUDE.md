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
- The library can clear the stored session without an event (failed background refresh). AuthProvider re-checks on
  tab focus/visibility and listens for `reportSessionLost()` (lib/sessionLost.ts); either signs out locally and shows
  "Your session expired. Please sign in again." Auth calls that can hit AuthSessionMissingError should report it.
- `supabase` client is a globalThis singleton so dev hot-reload never creates a second client racing token refresh.

## Routing & landing
- `#/` shows the Tracker when signed in and the Landing page when signed out. If there is a message to show
  (auth notice, email-link error, account-deleted flag), signed-out `#/` redirects to `#/login` so it isn't lost.
- Landing screenshots live in `public/landing/*.webp` (board 1600×1111, stats 1600×1111), loaded via
  `import.meta.env.BASE_URL`. `iphone.webp` (880×1808, transparent) is the whole device: an iPhone 17 Pro frame
  (402×874pt screen, Dynamic Island, status bar, Action/volume/side buttons, Camera Control) around a 402×812
  screenshot. The same device image is used in `og-image.png`. Retake them when the UI changes noticeably.
- Link previews: Open Graph + Twitter tags in `index.html` point at the absolute URL of `public/og-image.png`
  (1200×630). Update the image and tags together, and re-scrape with LinkedIn's Post Inspector after changing them.

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

Documents (migration `20260928000000_documents.sql`, not in Notion):
- `public.documents`: the user's library (name, kind enum CV / Cover letter / Portfolio / Certificate / Other,
  file_name, storage_path, size_bytes ≤ 5 MB, mime_type). Only `name` and `kind` are updatable (column grant).
- `public.application_documents`: link table (application_id, document_id), cascades from both sides. Insert
  policy checks both the application and the document belong to `auth.uid()`.
- Files: **private** Storage bucket `documents`, key `<user id>/<document id>/<safe name>`; storage.objects
  policies allow only the owner's folder. Bucket enforces 5 MB and the allowed MIME types.
- Limit 30 documents per user (`my_document_count()`, security definer, used by both insert policies).
- Opening = 60-second signed URL (never public URLs). Deleting a doc removes the row then the file; deleting an
  application only removes links (the document stays in the library, it may be used elsewhere).
- Account deletion: `lib/account.ts` removes the user's files via the Storage API **before** calling
  `delete_my_account()` (Supabase blocks deleting storage objects from SQL); it stops if that fails.

Email reminders (migration `20260928100000_reminders.sql`, function `supabase/functions/reminders/`, see its README):
- `public.reminder_settings` (one row per user, opt-in): enabled, send_hour (local), time_zone (from the browser),
  include_follow_ups, unsubscribe_token, last_sent_on, last_test_at. Users can only write the four preference columns.
- `reminder_recipients()` (security definer, service_role only) joins auth.users for the email address.
- pg_cron calls the function at :01 and :31 every hour (`schedule.sql`, run by hand; holds the CRON_SECRET).
- Digest rules live in `functions/reminders/digest.ts` and must stay in line with `src/lib/nextSteps.ts`.

Notion status groups: To-do = Applied, Interviewed · In progress = Offered · Complete = Accepted, Rejected, No Response.
Notion views: a **board grouped by Status** (shows Name, Company, Applied On) and a **calendar by Applied On**.

The enum values in SQL and the constants in `src/lib/types.ts` must match exactly. When you change one, change the other.

## Layout
```
src/
  lib/supabase.ts      Supabase client (PKCE flow), appUrl(), enabledOAuthProviders()
  lib/auth.tsx         AuthProvider + useAuth(): session, recovery flag, email-link errors
  lib/types.ts         Application type + enum constants
  lib/applications.ts  CRUD calls against the applications table (+ createApplications: chunked bulk insert)
  lib/csv.ts           RFC 4180 parse (BOM, quoted newlines, ';' auto-detect) / toCsv (BOM, CRLF, formula-injection guard)
  lib/importExport.ts  Pure CSV <-> Application mapping: loose header aliases, case-insensitive enums + aliases,
                       dates (ISO, Notion "September 12, 2026", d/m/y day-first when ambiguous), duplicate flag
                       (same role+company+applied date), per-row warnings/errors, 2,000-row cap
  lib/documents.ts     Document library: upload (validate, upload file, insert row, clean up on failure), list, links,
                       setApplicationDocuments(diff), open/download via signed URL, delete, guessKind(file name)
  lib/docCounts.ts     React context: application id -> attached document count (for board/table badges)
  lib/reminders.ts     Reminder settings (get/save), sendTestEmail + unsubscribe via supabase.functions.invoke('reminders')
  lib/account.ts       deleteMyAccount(): delete Storage files, then rpc; one-time 'account deleted' notice
  lib/config.ts        Owner name, contact email (jobtracker.app.lk@gmail.com), APP_VERSION, privacy date
  lib/dates.ts         Local YYYY-MM-DD helpers (todayKey, addDays, daysBetween). Never use toISOString for "today"
  lib/nextSteps.ts     Up-next logic: plannedSteps (overdue first), urgency/labels, needsFollowUp (Applied 14+ days, nothing planned)
  lib/format.ts        fmtDate, statusClass
  lib/errors.ts        errorMessage(e): Supabase errors are plain objects, not Error; always use this for messages
  lib/profile.ts       Profile in auth user_metadata (display_name, target_role, location, linkedin_url; NOT Google's
                       full_name, which Google overwrites each login), changePassword (verifies current pw first)
  lib/stats.ts         Pure stat helpers (summary, by status, response by platform, per week, date ranges via inRange/weeksFor,
                       funnel, bestPlatform (min 3 apps), weekStreak, busiestWeek)
  pages/Landing.tsx    Public home page for signed-out visitors (hero, features, stats, privacy, CTA)
  pages/Login.tsx      Sign in / sign up / forgot password; OAuth buttons; `?mode=signup` opens sign-up; Home link
  pages/Profile.tsx    #/profile: hero, Basic details, Password (Google-only accounts see a note), Delete account
  pages/Unsubscribe.tsx  #/unsubscribe?token=… from reminder emails; needs a click (link scanners), works signed out
  pages/Privacy.tsx    Plain-language privacy page (#/privacy, works signed in or out)
  pages/ResetPassword.tsx  Set a new password after a reset link (shown when recovery is true)
  pages/Tracker.tsx    Page shell: views (board/table/calendar/stats), search, optimistic moveTo (reverts on error)
  components/Board.tsx  Kanban board on @dnd-kit/core: DragOverlay (tilted lift), drop slot at landing index,
                       mouse (6px to start), touch (press-and-hold 180ms), keyboard (Space, arrows jump columns)
  components/Badges.tsx  NextBadge + StatusPill (shared by board and table)
  components/CalendarView.tsx  Month calendar by Applied On (dots + agenda list on mobile)
  components/StatsView.tsx  Stats tab: range switch (30 days / 90 days / All time, by Applied On; undated rows only in
                       All time), KPI tiles (sparkline, response ring, delta vs previous period), weekly columns with
                       avg line, hiring funnel, status split bar + legend, platform bars, Highlights. Table toggle per chart
  components/ApplicationForm.tsx  Add/edit/delete modal (incl. next step + quick dates, documents). onSave gets
                       (input, documentIds); Tracker saves the app then syncs links
  components/AttachedDocuments.tsx  Documents fieldset in the form: attached list, pick from library, upload new
  components/DocumentUpload.tsx  Upload button + inline confirm (name, kind). Not a <form>: it sits inside the app form
  components/DocBadge.tsx  Paperclip + count on board cards and table rows
  pages/Documents.tsx  #/documents library: upload, open, download, rename/change type, delete (inline confirm),
                       "Sent with" list. Linked from the account menu and the form
  components/ImportExportDialog.tsx  Import (pick/drop CSV → review counts, preview, warnings → import) + export
                       CSV + template download. Portalled. Tracker reloads the list after an import
  components/UpNext.tsx  "Up next" strip above board/table/calendar: Done, follow-up nudges (Follow up today / Mark no response)
  components/AppShell.tsx  Signed-in frame: navbar (logo → home, AccountMenu) + main + Footer
  components/AccountMenu.tsx  Avatar menu (display name): Profile & settings, Privacy, Sign out
  components/RemindersCard.tsx  Profile card: on/off switch, send hour, Monday follow-ups, time zone, test email
  components/DeleteAccountDialog.tsx  Typed-DELETE confirm; opened from the Profile page
  components/PasswordInput.tsx  Password field with show/hide eye toggle (use for every password input)
  components/Footer.tsx  Full footer (brand + tagline, Product / Privacy / Get in touch columns, © + Built by <name> in
                       Sri Lanka + version) on landing + privacy; `compact` slim bar inside AppShell. No portfolio link
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
- Exception to one series: the status split bar uses the `.status-*` colours, always with its labelled legend.
- Bars grow in with a CSS animation; `prefers-reduced-motion` turns it off. Keep that for new charts.

## Roadmap (ideas to build next)
- [x] Calendar view by Applied On (matches the Notion calendar view)
- [x] One-off import of Kalhara's Notion rows (SQL run in Supabase, kept out of the repo)
- [x] CSV import (Notion, Excel, Google Sheets) and CSV export, self-serve, no schema change
- [x] Next steps: interview/follow-up dates, Up next strip, card badges, calendar, follow-up nudges (v1, in-app only)
- [x] Email reminders for next steps (opt-in daily digest, Edge Function + pg_cron, Gmail SMTP)
- [x] Dashboard stats (applications per week, response rate by platform)
- [x] Privacy page, sign-up privacy note, self-serve account deletion
- [x] Profile page (basic details, change password, delete account)
- [x] Documents per application (library of CVs/cover letters, attach to many applications)
- [ ] Contacts / recruiter per application
- [x] Password reset flow and Google sign-in (GitHub button ready once enabled in Supabase)
- [ ] Tests (Vitest + React Testing Library)
