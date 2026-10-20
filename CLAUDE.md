# Shortlisted — project guide for Claude

A multi-user job application tracker, modeled on Kalhara's Notion page **Jobs → Application Tracker**.
Users sign up, log in, and track their own applications on a status board and in a table.

## Name
The app is called **Shortlisted** (one word, spelled in full with the "e"). It was "Job Tracker" until October 2026,
then "Shortlistd" (no "e") for about a week, then Shortlisted. Use it for anything a person reads: the UI, page title
and link-preview tags, manifest, reminder emails, calendar events, docs.
The GitHub repo is `kalharatennakoon/shortlisted` (renamed from `shortlistd`, before that `job-tracker`), so the site is
at `https://kalharatennakoon.github.io/shortlisted/`. That address is repeated in Supabase's Site URL / Redirect URLs,
the reminders function's `APP_URL` secret, the canonical + Open Graph URLs in `index.html`, `SHORTLISTED_URL` in the
`strongcv` repo (`src/lib/handoff.ts`) and `LIVE_URL` in `desktop/main.js` (installed desktop apps open it, so
changing it means a new installer and everyone reinstalling); change them together.
GitHub Pages does not redirect the old `/shortlistd/` or `/job-tracker/` addresses.
These still carry the old name on purpose; don't rename them without Kalhara asking:
- The pg_cron job `job-tracker-reminders` (already scheduled) and the calendar event UID suffix `@job-tracker`
  (changing it would duplicate events people have already added).
- Applied migrations (the comment in the first one).
The wordmark and the logo are baked into `public/og-image.png` (three places) and the navbar of nine screenshots in
`public/landing/`: the eight view screenshots and `m-insights.webp`. When the logo went black they were patched in
place (old tile painted out, new one drawn over it) rather than retaken.

## Stack
- **Frontend:** Vite + React 19 + TypeScript, plain CSS (`src/index.css`): light-only, white background, Inter font, design tokens at the top
- **Routing:** `react-router-dom` with `HashRouter`, because GitHub Pages has no server-side rewrites
- **Auth + database:** Supabase (email/password auth, Postgres). The browser talks to Supabase directly with the anon key.
- **Hosting:** GitHub Pages, deployed by `.github/workflows/deploy.yml` on every push to `main`
- **Desktop app:** Electron (`desktop/`, its own `package.json`), a window onto the live site. See "Desktop app" below.

There is no custom backend, only two small Supabase Edge Functions (`reminders`, `job-link`). Row Level Security is the
only thing protecting user data.
Every new table **must** have RLS enabled and policies scoped to `auth.uid()`.

## Auth notes
- `flowType: 'pkce'` is required: Supabase then returns with `?code=` (query), not `#access_token=` (hash), so it
  doesn't collide with HashRouter. The library exchanges the code and strips it from the URL.
- PKCE links (reset, confirm) only work in the browser that requested them; `lib/auth.tsx` shows a friendly error otherwise.
- Redirects go to `appUrl()` (origin + path). Supabase must allow it: Site URL = the Pages URL; Redirect URLs =
  `https://kalharatennakoon.github.io/shortlisted/**` and `http://localhost:5173/**`.
- OAuth buttons render only for providers enabled in Supabase (read from the public `/auth/v1/settings`).
  Google is set up; GitHub just needs enabling in Supabase.
- Sign-up confirmation: `emailRedirectTo` is `appUrl()?confirmed=1`. `lib/auth.tsx` sees the marker once at load,
  lets the library exchange the code, signs out locally, cleans the URL and shows "Your email is confirmed. Please
  sign in." Works even if the link is opened in another browser (the email is confirmed server-side before redirect).
  Supabase Redirect URLs must include `https://kalharatennakoon.github.io/shortlisted/**` or the marker is dropped.
- Keep side effects (URL cleanup) out of React state updaters; StrictMode runs them twice in dev.
- The library can clear the stored session without an event (failed background refresh). AuthProvider re-checks on
  tab focus/visibility and listens for `reportSessionLost()` (lib/sessionLost.ts); either signs out locally and shows
  "Your session expired. Please sign in again." Auth calls that can hit AuthSessionMissingError should report it.
  **Only a login that is really gone counts:** once the access token has run out (an hour in the background),
  `getSession()` tries to renew it and answers `session: null` with a *retryable* error when there is no connection,
  while the stored login is untouched. The re-check must leave that alone (`isAuthRetryableFetchError`); signing out
  on it logged people out of the desktop app whenever they came back before the Wi-Fi did. Kalhara doesn't want
  people signed out automatically: sign out only when the server has refused the login or the stored one is gone.
- `supabase` client is a globalThis singleton so dev hot-reload never creates a second client racing token refresh.
- Links that come back later (sign-up confirmation, reset, OAuth) use `returnUrl()`, not `appUrl()`: it adds the
  `?desktop=1` marker when the desktop app asked (see "Desktop app").

## Routing & landing
- `#/` shows the Tracker when signed in and the Landing page when signed out. If there is a message to show
  (auth notice, email-link error, account-deleted flag), signed-out `#/` redirects to `#/login` so it isn't lost.
- Landing images live in `public/landing/`, loaded via `import.meta.env.BASE_URL`. Retake them when the UI changes noticeably:
  - `board|table|calendar|stats.webp`: desktop views, 1600×1091 (captured at a 1320×900 viewport).
  - `m-board|m-table|m-calendar|m-stats.webp`: phone screens, 804×1624 (402×812 viewport at 2x), scrolled so the view itself
    is at the top under the navbar.
  - `insights.webp` (1600×598) and `m-insights.webp` (740×1562): the Stats funnel + platform panels, desktop and stacked.
  - `iphone.webp` (880×1808): the iPhone 17 Pro frame only (Dynamic Island, status bar, buttons) with a **transparent
    screen**; the phone screenshots sit in a window behind it (`.lp-phone-screen`, percentages match the cut-out).
    `og-image.png` still has its own baked-in device + screenshot.
  - Sample data in screenshots and on the page is fictional and deliberately spans fields (nursing, teaching, finance,
    engineering, hospitality, design, IT). Keep it that way: Kalhara doesn't want it to look IT-only.
- Feature tiles: eight on a 6-column grid (wide 4 + 2, 2 + wide 4, wide 4 + 2, then two `half` tiles 3 + 3). The
  "Check your CV" tile carries the "New in v3" tag (`isNew`; the label is in `Tile`) and a static preview (`.lp-cv`,
  built on `.lp-mail`); the calendar and email tiles keep their previews (`.lp-calmock`, `.lp-mail`). At the next
  version, move the tag to what is new then and change the label. `APP_VERSION` in `lib/config.ts` is 3.0.
- Landing classes are prefixed `lp-`. Motion is deliberate, not scattered: one page-load rise in the hero, the view tour
  (tab progress line is the timer: its `animationend` shows the next view; pauses on hover/off-screen, stops on click,
  Pause/Play button), the roles ticker, and the application card moving through the stages. All of it stops under
  `prefers-reduced-motion`, and the tour/journey only run while on screen (`useInView`).
- **Blank page after a release:** each deploy replaces `assets/` (new file names), and a page kept from before it
  (cached up to ten minutes, in a browser or the desktop app) points at files that are gone: a white screen.
  A small script at the top of `index.html` reloads once, fresh, when a file under `assets/` fails to load
  (sessionStorage timestamp, so never a loop), and the desktop app always fetches the page itself fresh
  (`loadSite`, `Cache-Control: no-cache`). Kalhara saw it on the first in-app update, October 2026.
- Link previews: Open Graph + Twitter tags in `index.html` point at the absolute URL of `public/og-image.png`
  (1200×630). Update the image and tags together, and re-scrape with LinkedIn's Post Inspector after changing them.

## Desktop app (Windows and Mac)
`desktop/` is an Electron app that loads the live site, so it is always the current version; an installer is only
rebuilt when `desktop/` changes. Kalhara asked for downloadable `.exe` and `.dmg` files (October 2026); an installable
web app (PWA) was the alternative considered earlier. `desktop/README.md` has the commands.
- The page knows it is in the app by `window.shortlistedDesktop` (`desktop/preload.js`, typed in `lib/desktop.ts`:
  `desktop`, `isDesktop`). Everything desktop-specific in `src/` hangs off those two; without the bridge the site
  behaves exactly as before.
- **What differs in the app:** signed out, `#/` goes to the sign-in page (no landing page, no Home link); links to
  other sites, `mailto:` and "open document" go to the person's browser or mail app; the app's own pages opened in a
  new tab ("Manage documents") get a second app window; `.ics` files are saved to Downloads and opened; other
  downloads get a "Save as" window; "Check my CV" opens the hand-off link directly (no blank tab to fill).
- **Sign-in from the app.** Google blocks sign-in inside an app's own window, and email links open in the browser,
  not the app. So the app asks Supabase to return to `…/shortlisted/?desktop=1`; that page, in the browser, is
  `pages/DesktopReturn.tsx` ("go back to the app"), which opens `shortlisted://auth?code=…`; the installed app is
  registered for `shortlisted://` links and finishes with `exchangeCodeForSession` (`lib/auth.tsx`). The browser page
  must never use the code itself: the PKCE secret is in the app, and a code works once (`desktopReturn` in
  `lib/desktop.ts` strips it from the address before the Supabase client exists). A sign-up confirmation carries
  `?confirmed=1&desktop=1` and only says "go back and sign in". Nothing new is needed in Supabase: the existing
  `…/shortlisted/**` Redirect URL covers the marker.
- `desktop/main.js` only ever shows pages under the site's address (`isAppUrl`; the host serves Kalhara's other sites
  too, so the path counts) plus its bundled `offline.html`. It passes only the code from a `shortlisted://` link to
  the page, never text to display. Keep `contextIsolation`/`sandbox` on and the bridge small.
- **Installers:** `.github/workflows/desktop.yml` builds `Shortlisted.dmg` (macOS runner, universal, ad-hoc signed)
  and `Shortlisted-Setup.exe` (Windows runner) when `desktop/` changes: on a pull request as run artifacts to try, on
  `main` as the `desktop-latest` release, after which it starts the Pages deploy. The repo is private, so releases
  aren't public: `deploy.yml` copies the release into the site at `/downloads/` and sets `VITE_DESKTOP_VERSION`.
  The landing page's download card (`DesktopApp` in `Landing.tsx`) and the footer link only render when that is set.
- **Not signed** with paid certificates (Kalhara is keeping the app free for now), so Windows SmartScreen and macOS
  Gatekeeper warn on first open; the download card's "Installing it for the first time" explains both. No Windows or
  Apple logos on the buttons (same reasoning as the calendar buttons).
- **Updates (from 1.0.3): in the app, from Profile & settings → "Desktop app"** (`components/DesktopAppCard.tsx`;
  Kalhara asked for check / download with progress / install and reopen, October 2026). The work is in `main.js`
  ("updates of the app itself"): it reads `downloads/latest.json` (version, and per system the file, size and
  SHA-256, written by `desktop.yml`), downloads the installer to a temp folder and checks size and checksum.
  Mac: mounts the `.dmg` out of sight, copies the app beside the old one, `codesign --verify`, swaps the two and
  relaunches (the old copy is removed at the next start); if the app's folder isn't writable or it runs from the
  `.dmg`, it opens the `.dmg` in Finder instead. Windows: runs the setup with `--updated /S --force-run`, which
  closes the app, installs and reopens it. The page can only send `check`/`download`/`cancel`/`install`; the
  address and checksum never come from it. macOS's own updater (Squirrel) isn't used: it needs a signed app.
  After an update the app opens on the page it was started from (`reopen.json` in userData). The updater deletes
  with `original-fs`: Electron's `fs` treats `.asar` files as folders, and the first cleanup left the old app's
  `app.asar` behind. That leftover then blocked the next swap (1.0.4 → 1.0.5 fell back to the manual install,
  and the app went missing from Applications), so the hidden copies now get a new name each time
  (`.Shortlisted-old-<time>.app`), a failed install removes its staged copy, and every start removes any leftovers.
  Copies before 1.0.3 have no `update` on the bridge: the page downloads the installer itself
  (`downloadInstaller`: progress bar, size + SHA-256 from `latest.json`) and then hands the finished file to "Save
  as". Not a plain link: those copies save under the final name with no progress, and a `.dmg` opened before it
  had finished said "disk image is corrupted" (Kalhara hit this updating 1.0.2 → 1.0.3).
- **No update notice anywhere else:** updates live only in that card (Kalhara removed the footer's "Update the
  desktop app" link, October 2026). Versions compare as older, never just different (`isNewerVersion` in
  `lib/desktop.ts`, repeated in `main.js`): the first version compared with `!==`, and a freshly installed 1.0.1
  was told to update because its window still had the copy of the site that offered 1.0.0. The card reads the
  published version live (`latest.json`, `version.txt` via `latestDesktopVersion`), never the one built into the page.
- **Releases:** each version keeps its own GitHub release, `desktop-v<version>` (from 1.0.3; Kalhara wants old
  ones kept); `desktop-latest` is replaced each time and is what `deploy.yml` serves from `/downloads/`.
- Two version numbers on purpose: `APP_VERSION` (the site, "v3.0") and the app's own `version` (only bumped when
  `desktop/` changes). Inside the app the footer shows both ("v3.0 · Desktop app 1.0.2"); Kalhara chose that over
  renumbering the app or locking the two together (October 2026).
- Icons: `scripts/make-icons.py` (Pillow) draws them from the logo's measurements: `desktop/build/icon.png` and
  `icon.icns` for the Mac (tile and shadow on a 1024px canvas), `icon.ico` for Windows (the tile fills the square,
  each size drawn at its own size). Colours and size are settings at its top; don't edit the image files by hand.
  The Mac tile is 742px, 10% smaller than Apple's 824px template: Kalhara found the standard size a bit large in
  the Dock (October 2026). `desktop/offline.html` has the logo written out as SVG. An installed copy only gets a
  new icon from a new installer (bump `version`), and macOS can keep showing the old one until the Dock restarts.

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
| `next_time` | (new) | time of the next step, optional; null = all day. Postgres returns `HH:MM:SS`, use `timeKey()` |
| `contact_email` | (new) | recruiter / hiring contact, optional; the "To" of email drafts |
| `posting_checked_on` | (new) | date the user last opened the job posting; null = never |
| `posting_closed` | (new) | boolean, default false: the posting has been taken down |
| `user_id` | (owner) | uuid → auth.users, defaults to `auth.uid()` |

Stages of an application live in their own table, `public.application_stages` (see "Timeline" below).

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

Posting check (migration `20261002000000_posting_check.sql`): set by hand in the form ("Still open today" / "Posting closed").
The two fields are optional in `Application` and only sent when set, so the app keeps working if the code is deployed
before the migration is applied; changing the job URL resets them. A user suggested this on X; automatic checking was
ruled out (no backend, and job sites block bots), and Kalhara chose not to add a "Saved" stage before Applied.

Email drafts and add to calendar (migration `20261002120000_next_time_contact.sql`):
- No backend and no sending: `lib/emailTemplates.ts` builds a follow-up / thank-you / check-in draft and the dialog opens it
  in Gmail (`mail.google.com/mail/?view=cm`), the device's mail app (`mailto:`) or copies it. The mail-app button leaves the
  dialog open, because a computer with no mail app set up does nothing on a `mailto:` link.
- Using a draft saves the "To" address as `contact_email` and, if ticked, plans a "Follow up" step 7 days out
  (`REPLY_CHECK_DAYS`) so the application leaves the "no reply" list. The signature is the profile's display name + LinkedIn.
- `lib/calendarLinks.ts` turns a dated next step into one event: a Google Calendar template link (local time + `ctz`) or an
  .ics file (UTC, 1-hour reminder when timed; all-day when there is no time). The UID includes the date, so a second
  interview is a second event. Nothing is synced: Kalhara chose buttons only; a private subscribe-able feed was the other
  option and would need an Edge Function + a token table.
- `next_time` and `contact_email` follow the posting-check rule: optional in `Application`, only sent when set (the form
  drops them when empty on a row that doesn't have the column; `clearTime()` in Tracker). `errorMessage` turns PostgREST's
  PGRST204 (unknown column) into a readable message.
- The time is picked with `components/TimePicker.tsx`, not `<input type="time">` (Kalhara found the browser pop-up dated):
  a button styled like the inputs plus a panel with an hour grid, 5-minute steps and AM/PM. It follows the device's
  12/24-hour setting (24 hours: a 0-23 grid, no AM/PM), saves on every tap, and closes on Done, Escape or an outside click.
- Reminder emails show the time on Today and Tomorrow steps ("2:30 PM · Interview: …"; overdue steps don't, as in the
  app). `digest.ts` has its own `timeKey`/`fmtTime`: always the 12-hour clock with AM/PM, because an email can't follow
  the reader's device. `index.ts` selects `next_time` and retries without it on Postgres error 42703 (column missing).
  The function has to be **redeployed** after any change to those two files (see its README).

Check my CV (hand-off to StrongCV, Kalhara's other app at `https://strongcv.vercel.app/`; no schema change):
- StrongCV was "CV Analyzer LK" until October 2026 (repo `cv-analyzer-lk`, site `cv-analyzer-lk.vercel.app`). Its name and
  address are `CV_ANALYZER_NAME` and `CV_ANALYZER_URL` in `lib/cvCheck.ts`; those identifiers and `VITE_CV_ANALYZER_URL`
  describe what the tool does, so they kept their names.
- The chip at the foot of the form's Documents section opens `components/CvCheckDialog.tsx`: which CV (attached ones
  first, then the rest of the library; only kind CV, PDF/DOCX/TXT, up to 4 MB, which are StrongCV's limits), the
  role and the job link. "Open" makes a signed link to the CV that lasts `CV_LINK_SECONDS` (5 minutes) and opens the
  other site in a new tab. Role, link and CV come from the form as it is, saved or not.
- Everything goes in the URL **fragment** (`#from=shortlisted&position=…&jobUrl=…&cv=…&cvName=…`, built by
  `lib/cvCheck.ts`), never the query string: fragments aren't sent to servers, so the CV link stays out of Vercel's
  logs. The receiving end is `src/lib/handoff.ts` in the `strongcv` repo, which only accepts a CV link to a
  Supabase Storage signed URL for the `documents` bucket; change the parameter names in both repos together.
  It accepts `from=shortlisted` and the earlier `from=shortlistd`, so a tab still running the old copy keeps working.
- The new tab is opened inside the click (pop-up blockers), its `opener` is cleared before it is pointed at the other
  site, and a blocked tab falls back to a plain link. StrongCV only fills its form in; the person presses Analyse.
- This is the one place a document leaves the app, so the privacy page has a "Checking your CV" section. Keep it accurate.

Quick add from a job link (function `supabase/functions/job-link/`, see its README; no schema change):
- "Start from a link" at the top of a **new** application (`components/QuickAdd.tsx`; not shown when editing). Pasting a
  link starts it; a typed one needs "Fill in" or Enter (caught there, so it never saves the form). The answer fills
  Role, Company, Platform and the Job posting link; location, closing date and job type go into Notes as lines
  ("Location: …"), because there are no columns for them.
- The browser can't read other sites, so `lib/jobLink.ts` calls the `job-link` Edge Function, which opens the posting's
  public page once. `extract.ts` (pure, tested with `node --test supabase/functions/job-link/extract.test.ts`) reads, best
  first: schema.org JobPosting data (JSON-LD), then the page title with a few patterns ("Acme hiring Nurse in Kandy |
  LinkedIn", "Role at Company - Place | Site", "Role | Acme Careers"), then, when the site refused, the words in the link
  itself (".../role-at-company-123"), which the form reports as a guess.
- **Sites say no, and that is fine.** LinkedIn refuses most automated visits, Indeed and Glassdoor all of them, and
  topjobs.lk ads are images. The function answers 200 with a `problem` (blocked / gone / unreachable / unreadable)
  and the form keeps the link and says so plainly. Don't try to get round a refusal: one request, a User-Agent that says
  it is Shortlisted, no cookies, no retries, no pretending to be a browser, no private or sign-in-only endpoints.
- `fillForm` never overwrites what a person typed: a field is filled when it is empty or still holds what quick add put
  there last time (so a second link replaces the first one's details). Notes are added to, not replaced.
- The function fetches an address chosen by whoever is signed in, so it only takes http(s) links to public hosts on the
  standard port, checks every redirect and what the name resolves to (`isPublicHost`, `isPublicIPv4/6`), reads at most
  1.5 MB for 9 seconds, allows 12 links a minute per user, and only ever returns five short fields, never the page.
  Keep all of that if it changes.
- LinkedIn links copied from a search or "recommended" page (`?currentJobId=…`) are turned into the job's own page, and
  tracking parameters are dropped (`cleanLink`); the tidied link is what gets saved.
- If the site is deployed before the function (or the function is down), the form says quick add can't be reached and
  still keeps the link. The function has to be **deployed**, and redeployed after any change to its two files.
- The pasted link leaves the browser, so the privacy page has a "Starting from a job link" section. Keep it accurate.

Already added (no schema change, `lib/duplicates.ts`, `components/DuplicateNote.tsx`):
- A **new** application that repeats one in the list gets a warning with "Open it" and "Keep both". Two ways to match:
  the same posting (`postingKey`: ignores http/https, `www.`, a trailing slash, parameter order and tracking; a
  LinkedIn job is known by its number, so a search-page link matches the job's own page) or the same role at the
  same company (letters and digits only, any case). Never shown when editing, and never a block: applying again
  to the same place is normal.
- A pasted link is checked **before** the posting is read (`findExisting` on `QuickAdd`), so nothing is fetched or
  filled in for a job that is already there; "Add it again" carries on and quietens the warning for that application.
- "Open it" swaps the open form to the other application. `Tracker` bumps `formKey` to start the form afresh; don't
  key the form by application id (a failed document attach switches new → edit and must keep the form's state).
- `TRACKING` in `lib/duplicates.ts` repeats the list in `supabase/functions/job-link/extract.ts`; change them together.

Timeline (migration `20261009000000_application_stages.sql`, `lib/stages.ts`, `components/Timeline.tsx`):
- `public.application_stages`: one row per stage of an application after someone replied (title in the person's own
  words, `stage_date`, optional `stage_time`, `outcome` enum Waiting / Passed / Not selected, notes ≤ 2,000). RLS: own
  rows only, and a stage can only hang off the caller's own application (insert and update). Stages cascade from
  their application, which also covers account deletion. `STAGE_OUTCOMES` in `types.ts` must match the enum.
- What a stage shows is worked out, not stored (`stageState`): no result + dated ahead = "Coming up", no result +
  past = "Waiting to hear", else Passed / Not selected.
- **A stage is stored the moment "Save stage" is pressed**, not when the application is saved (Kalhara asked for this
  after stages were lost: the first version saved them with the form, so closing it without Save dropped them). For
  an application that exists, `Timeline` gets a `store` (`onStageSave` / `onStageRemove` from `Tracker`) and every
  save or removal goes to the database there and then; the form's own Save and Cancel don't touch the timeline. A
  **new** application has nowhere to store them yet, so its stages wait in the form and go in once it is created
  (`onSave(input, documentIds, stages)`); the section says which of the two is happening.
- **Nothing deletes a stage as a side effect.** `saveStages` is one upsert (ids are made in the browser, so a retry
  can't add a stage twice) and never removes; `removeStage` removes the one stage the person chose, after an inline
  "Remove this stage?". Don't bring back "make the stored list match the form's list": the form can be opened before
  the timeline has loaded, and a diff against a list it never saw deletes real data. For the same reason the form takes
  in a timeline, and attached documents, that arrive after it opened (`initialStages` undefined → array;
  `lateDocIds`) instead of treating "not loaded yet" as "none".
- One stage is edited at a time, in a copy: Cancel or Escape throws the copy away, Enter saves the stage (both are
  caught so they never save or close the application). A stage with no name is asked for one, never dropped. Saving
  the application while a stage is open is held back with a message (`stagePending`), so an edit can't be lost.
- **Next step vs timeline.** The next step is the one thing coming up (reminders, calendar, Up next); the timeline is
  the record. They are joined in two places so nothing is typed twice: "Done" in Up next moves an Interview,
  Assessment or Call into the timeline (`stageFromStep`; not a Follow up, and not when that day already has a
  stage), and a stage dated ahead has "Set as next step" (`stepFromStage`) when no step is planned. Reminder emails
  still come only from the next step; the `reminders` function doesn't read stages.
- The section also points out when the status has fallen behind (`suggestedStatus`: Applied → Interviewed once a
  stage has happened; → Rejected after "Not selected"). It suggests; it never changes the status by itself.
- Cards and rows show a small count (`StageBadge`, lists from the `StageLists` context, like `DocBadge`). The CSV
  export gets a last column "Timeline" (text, one stage per line); import leaves it alone ("Ignored column").
- If the code is deployed before the migration, `listStages()` fails, `stages` stays `null` in `Tracker`, and the
  section, the badges and the Up next hand-over simply aren't there. Suggested stage names are deliberately not
  IT-only ("Assessment", "Panel interview"); keep them that way.

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
  lib/cvCheck.ts       Pure: StrongCV hand-off (cvChoices, cvProblem, unreadableCvs, handoffUrl) + its address and limits
  lib/reminders.ts     Reminder settings (get/save), sendTestEmail + unsubscribe via supabase.functions.invoke('reminders')
  lib/account.ts       deleteMyAccount(): delete Storage files, then rpc; one-time 'account deleted' notice
  lib/config.ts        Owner name, contact email (kalharatennakoonmck@gmail.com; also the SMTP sender), APP_VERSION, privacy date,
                       DESKTOP_VERSION (null until an installer is published) + DESKTOP_DOWNLOADS
  lib/desktop.ts       Desktop app bridge (`desktop`, `isDesktop`) and `desktopReturn`: a link the app asked for,
                       opened in a browser
  lib/emailTemplates.ts  Pure: EMAIL_TEMPLATES, defaultTemplate (thank-you once interviewed), buildEmail, isEmail,
                       mailtoUrl (CRLF line breaks), gmailUrl
  lib/calendarLinks.ts Pure: eventFor(app) -> CalendarEvent, googleCalendarUrl, icsFile (RFC 5545: escaping, 75-byte
                       folding), icsFileName, eventWhen, downloadIcs
  lib/dates.ts         Local YYYY-MM-DD helpers (todayKey, addDays, daysBetween, timeKey -> 'HH:MM'). Never use toISOString for "today"
  lib/duplicates.ts    Pure: postingKey (one string per posting, however the link was copied), findDuplicate (same link, or
                       same role + company), findByLink
  lib/stages.ts        Timeline: stageState, sortStages, stageFromStep / stepFromStage (the bridge to Next step),
                       suggestedStatus, stagesAsText (CSV), then the data calls listStages, saveStages (one upsert,
                       never deletes), removeStage (one stage)
  lib/stageLists.ts    React context: application id -> its timeline (for board/table badges)
  lib/jobLink.ts       Quick add: asLink, readJobLink (calls the `job-link` function), fillForm (what goes into the form,
                       never over typed values), fillNote (the sentence under the link box), platformFor, notesFor
  lib/posting.ts       Job posting check (manual, no automatic fetching): postingUrl (http(s) only, never `javascript:`),
                       postingState (none/closed/unchecked/due after 7 days/checked), postingSummary
  lib/nextSteps.ts     Up-next logic: plannedSteps (overdue first, then by time), urgency/labels (stepLabel adds the time),
                       stepTime, needsFollowUp (Applied 14+ days, nothing planned)
  lib/format.ts        fmtDate, fmtTime, statusClass
  lib/errors.ts        errorMessage(e): Supabase errors are plain objects, not Error; always use this for messages
  lib/profile.ts       Profile in auth user_metadata (display_name, target_role, location, linkedin_url; NOT Google's
                       full_name, which Google overwrites each login), changePassword (verifies current pw first)
  lib/stats.ts         Pure stat helpers (summary, by status, response by platform, per week, date ranges via inRange/weeksFor,
                       funnel, bestPlatform (min 3 apps), weekStreak, busiestWeek)
  pages/Landing.tsx    Public home page for signed-out visitors: hero + Showcase (tour of the four views in a browser
                       frame and phone), roles Ticker, Journey (a card moving Applied → Accepted), feature tiles,
                       stats, privacy, CTA
  pages/Login.tsx      Sign in / sign up / forgot password; OAuth buttons; `?mode=signup` opens sign-up; Home link
  pages/DesktopReturn.tsx  "Go back to the Shortlisted app": shown in a browser instead of the site (see "Desktop app")
  pages/Profile.tsx    #/profile: hero, Basic details, Password (Google-only accounts see a note), Delete account
  pages/Unsubscribe.tsx  #/unsubscribe?token=… from reminder emails; needs a click (link scanners), works signed out
  pages/Privacy.tsx    Plain-language privacy page (#/privacy, works signed in or out)
  pages/ResetPassword.tsx  Set a new password after a reset link (shown when recovery is true)
  pages/Tracker.tsx    Page shell: views (board/table/calendar/stats), search, optimistic moveTo (reverts on error)
  components/Board.tsx  Kanban board on @dnd-kit/core: DragOverlay (tilted lift), drop slot at landing index,
                       mouse (6px to start), touch (press-and-hold 180ms), keyboard (Space, arrows jump columns).
                       Column header tinted by status with count + "+" (onNew(status) opens the form in that status)
  components/AppTable.tsx  Table view: sortable headers (asc → desc → original order; empty values last),
                       sticky header under the navbar, count footer. Rows open on click or Enter
  components/Badges.tsx  NextBadge + StatusPill + PostingLink (opens job_url; stops click/Enter reaching the card) +
                       PostingBadge ("Posting closed"), shared by board, table and the follow-up list
  components/CalendarView.tsx  Month calendar by Applied On: month summary, 3 items per day then "+N more" (expands the
                       day), today highlighted (dots + agenda list on mobile)
  components/StatsView.tsx  Stats tab: range switch (30 days / 90 days / All time, by Applied On; undated rows only in
                       All time), KPI tiles (sparkline, response ring, delta vs previous period), weekly columns with
                       avg line, hiring funnel, status split bar + legend, platform bars, Highlights. Table toggle per chart
  components/QuickAdd.tsx  "Start from a link" panel at the top of a new application (see "Quick add from a job link").
                       Not a <form>; catches Enter; drops a slow answer when a newer link has been pasted
  components/DuplicateNote.tsx  "You've already added this posting": the matching application, Open it / Keep both
  components/Timeline.tsx  Timeline section of the form: stages oldest first joined by a line, one edited at a time in a
                       copy ("Save stage" stores it straight away for an existing application), remove with a
                       confirm, suggested names, "Set as next step", status hint
  components/StageBadge.tsx  Timeline icon + count on board cards and table rows
  components/ApplicationForm.tsx  Add/edit/delete modal, one `.form-section` panel per group: The job, Your application,
                       Next step (date + TimePicker + quick dates, add-to-calendar chips), Timeline, Job posting, Contact
                       (email + Draft email), Documents, Notes. onSave gets (input, documentIds, stages); Tracker saves
                       the app then syncs links (and a new application's stages). The email dialog is rendered outside
                       the <form> so it can't submit it
  components/TimePicker.tsx  Custom time field + panel (see "Email drafts and add to calendar"). Holds several buttons:
                       never wrap it in a <label>, pass `labelledBy`
  components/EmailDialog.tsx  Email draft: template switch (edits kept per template), To, Subject, Message, reminder
                       checkbox, Open in Gmail / mail app / Copy. Portalled, `.modal-top` (opens over the form), not a <form>
  components/AddToCalendar.tsx  CalendarButtons (Google Calendar link + .ics download; `chips` for the form) and the
                       default export CalendarDialog used from Up next
  components/AttachedDocuments.tsx  Documents section (`.form-section`) in the form: attached list, pick from library, upload new;
                       `children` go at its foot (the "Check my CV" chip)
  components/CvCheckDialog.tsx  "Check your CV": CV picker, role, job link, Open StrongCV. Portalled, `.modal-top`, not a <form>
  components/DocumentUpload.tsx  Upload button + inline confirm (name, kind). Not a <form>: it sits inside the app form
  components/DocBadge.tsx  Paperclip + count on board cards and table rows
  pages/Documents.tsx  #/documents library: upload, open, download, rename/change type, delete (inline confirm),
                       "Sent with" list. Linked from the account menu and the form
  components/ImportExportDialog.tsx  Import (pick/drop CSV → review counts, preview, warnings → import) + export
                       CSV + template download. Portalled. Tracker reloads the list after an import
  components/UpNext.tsx  "Up next" strip above board/table/calendar: per step an email (Follow up) or add-to-calendar
                       (everything else) shortcut + Done; follow-up nudges (Draft email / Follow up today / Mark no response)
  components/AppShell.tsx  Signed-in frame: navbar (logo → home, AccountMenu) + main + Footer. Publishes the navbar
                       height as the --nav-h CSS variable (ResizeObserver) for sticky elements
  components/AccountMenu.tsx  Avatar menu (display name): Profile & settings, Privacy, Sign out
  components/RemindersCard.tsx  Profile card: on/off switch, send hour, Monday follow-ups, time zone, test email
  components/DeleteAccountDialog.tsx  Typed-DELETE confirm; opened from the Profile page
  components/PasswordInput.tsx  Password field with show/hide eye toggle (use for every password input)
  components/Footer.tsx  Full footer (brand + tagline, Product / Privacy / Get in touch columns, © + Built by <name> in
                       Sri Lanka + version) on landing + privacy; `compact` slim bar inside AppShell. No portfolio link
  components/Icons.tsx  Inline SVG icons + Logo (SVG, unique gradient ids via useId)
supabase/functions/    Edge Functions, deployed by hand (each has a README): `reminders` (email digest) and `job-link`
                       (quick add: index.ts fetches the posting safely, extract.ts reads it, extract.test.ts)
supabase/migrations/   SQL migrations, run in order
scripts/make-icons.py  Draws every icon that is a picture file (desktop icons, site PNG icons) from one set of settings
desktop/               The Windows and Mac app: main.js (window, links, sign-in links, downloads), preload.js (bridge),
                       offline.html, build/ (icons), package.json (version + installer settings)
```

## Commands
- `npm run dev`: local dev server (needs `.env`, see `.env.example`)
- `npm run build`: type-check and build to `dist/`
- `npm run lint`: oxlint
- `node --test supabase/functions/job-link/extract.test.ts`: tests for reading job postings (Node 22.18 or newer)
- In `desktop/`: `npm start` (the app, showing the live site; `SHORTLISTED_URL=http://localhost:5173/ npm start` for
  the local one), `npm run build:mac` / `build:win` (installers into `desktop/dist/`; a `.dmg` needs a Mac)

## Conventions
- Schema changes go in a **new** timestamped file in `supabase/migrations/`. Never edit an applied migration.
- Keep data access in `src/lib/`; components shouldn't call `supabase.from(...)` directly.
- Never commit `.env` or the Supabase **service_role** key. Only the anon key goes to the browser and to GitHub secrets.
- `vite.config.ts` reads `VITE_BASE` so assets resolve under `/<repo-name>/` on Pages.

## UI
- Light theme only (Kalhara asked for a white background); don't reintroduce `prefers-color-scheme` dark styles.
- `html, body` use `overflow-x: clip`, not `hidden`: hidden turns body into a scroll container and silently breaks
  every `position: sticky` (navbar, table header).
- The Stats badge is `.stat-chip` (`button.chip` is the form's). Kalhara doesn't want company icons/monograms on cards or rows.
- No horizontal scrolling anywhere: the board is a grid of 6 columns, 3 under 1180px, stacked under 700px.
  Table hides Company/Platform/Priority under 860px (company shows under the role instead).
- Status colours live in `.status-*` classes as `--st-bg/--st-fg/--st-dot`; always shown with a text label.
- Don't wrap an input in a <label> that also contains another button (e.g. "Forgot password?"): label clicks
  activate the first labelable element. Use <label htmlFor> + a `.field` div instead.
- Board columns show the first 5 cards (`COLUMN_LIMIT` in Board.tsx) then "Show N more" / "Show less", per column.
  A card dragged into the hidden part shows its drop slot at the foot of the visible list.
- Board cards: Enter opens, Space picks up. Clicks within 250ms of a drop are ignored (mouseup click). Don't add
  sortable-within-column without a position column in the DB; cards are ordered by the list order.
- Icons are inline SVGs in `components/Icons.tsx` (no icon library).
- Logo = stacked kanban cards with a check: **black tile, white cards, black tick** everywhere (Kalhara's choice,
  October 2026; it was a blue→violet tile before). The interface's own accent stays blue. The artwork is written out
  as SVG in `Logo` (Icons.tsx), `public/favicon.svg` and `desktop/offline.html`, and drawn by `scripts/make-icons.py`
  into `public/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` and the desktop icons; change the SVGs and the
  script's settings together, then run the script. `public/manifest.webmanifest` makes the site installable to a
  phone home screen.

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
- [x] Posting check: open the saved job URL from cards/rows, record "still open" / "posting closed" and the date checked
- [x] Follow-up email templates (follow-up, thank-you, check-in) opened in the user's own mail, plus a contact email
- [x] Add to calendar for next steps (Google Calendar link, .ics file), with an optional time
- [x] Time in reminder emails
- [x] "Check my CV" button that hands the CV, role and job link to StrongCV
- [x] Desktop app for Windows and Mac (Electron window onto the site, installers built by GitHub Actions)
- [x] Quick add: paste a job posting's link and the form is filled in from it (Edge Function `job-link`)
- [x] "You've already added this posting" warning (same link, or same role at the same company)
- [x] Timeline per application: each stage with its date, result and notes (table `application_stages`)
- [ ] Signed installers (Apple Developer Program + a Windows certificate) so the first-open warnings go away
- [ ] Private calendar feed to subscribe to (needs an Edge Function)
- [ ] Contacts / recruiter per application (name, LinkedIn, last contacted; only the email exists so far)
- [x] Password reset flow and Google sign-in (GitHub button ready once enabled in Supabase)
- [ ] Tests (Vitest + React Testing Library)
