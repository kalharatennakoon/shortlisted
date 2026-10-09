# `job-link` Edge Function

Quick add: the app sends a job posting's link, this opens the posting's public page once and answers with the role,
company, location, closing date and job type it finds. The app is `src/lib/jobLink.ts` and
`src/components/QuickAdd.tsx` ("Start from a link" at the top of a new application).

- `index.ts`: HTTP handler. Checks the sign-in, the link and the rate limit, fetches the page safely, answers.
- `extract.ts`: pure logic (no imports): tidy the link, read the page, guess from the link. Testable with Node.
- `extract.test.ts`: `node --test supabase/functions/job-link/extract.test.ts` from the repo root (Node 22.18+).

## Setup (one time, and again after changing either file)

Deploy it the same way as `reminders`:

- **CLI** (from the repo root): `npx supabase login`, then
  `npx supabase functions deploy job-link --project-ref <PROJECT_REF> --no-verify-jwt`
- **Dashboard:** Edge Functions → Deploy a new function → Via editor. Name it `job-link`. Paste `index.ts`, add a
  second file `extract.ts` and paste that too (not the test file). Deploy. Then in the function's
  **Details/Settings**, turn **off** "Verify JWT with legacy secret" / "Enforce JWT verification".

No new secrets. It uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (provided automatically) to check who is
calling, and `APP_URL` if set (already there for `reminders`) in the name it gives to job sites.

**Test:** in the app, New application → paste a link to a posting on a company's careers page.
Edge Functions → `job-link` → Logs shows one line per link: the site and how it went
(`job-link example.com: page`, `job-link linkedin.com: link (blocked)`). Never the link or the user.

## What it answers

`200 { url, host, kind, source, problem, job }`

| Field | Meaning |
|---|---|
| `url` | The link, tidied: tracking parameters dropped, a LinkedIn search link turned into the job's own page |
| `kind` | `linkedin`, `board` (a job site), `employer` (company site or its hiring system), `unknown`. Becomes the Platform |
| `source` | `page` read from the posting · `link` guessed from the words in the link · `none` |
| `problem` | `null`, or `blocked`, `gone`, `unreachable`, `unreadable` |
| `job` | `{ role, company, location, closes (YYYY-MM-DD), type }`, each a short line or `null` |

`400` not a usable link · `401` not signed in · `429` more than 12 links in a minute.

## Notes

- **JWT verification is off** to match `reminders`, so both functions are deployed the same way. It doesn't open
  anything up: the function verifies the caller's token itself and does nothing for anyone signed out.
- **Many job sites refuse automated visits.** LinkedIn turns most away (status 999 or a sign-in page), Indeed and
  Glassdoor all of them, and topjobs.lk shows the advert as an image with nothing to read. That is expected: the
  answer says `blocked` or `unreadable` and the app keeps the link. Company careers pages and the common hiring
  systems (Greenhouse, Lever, Workday, Workable, Ashby and others) publish job data and work well.
- **It stays polite.** One request per pasted link, a User-Agent that says it is Shortlisted, no cookies, no retries.
  Don't make it pretend to be a browser or use a site's private endpoints to get past a refusal.
- **It fetches an address someone else chose**, which is the risky part of a function like this. Kept safe by:
  signed-in users only; http(s) only, standard port only; no private, local or internal addresses, checked on the
  name, on what the name resolves to (where the platform allows the lookup), and again at every redirect; at most
  1.5 MB read and 9 seconds waited; only the five short fields above are returned, never the page.
- **The rate limit lives in memory**, per running copy of the function, so it is a brake rather than an exact count.
  Enough for now; use a table if the app grows.
- **Adding a site:** most need nothing. If a site's title has an unusual shape, add a case to `fromTitle` in
  `extract.ts` with a test. Job boards go in `JOB_BOARDS` (so their name is never taken for the employer) and
  hiring systems in `ATS`.
