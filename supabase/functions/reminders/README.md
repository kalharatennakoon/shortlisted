# `reminders` Edge Function

Daily email digest of next steps (overdue, today, tomorrow; plus "no reply after 14 days" on Mondays).
Opt-in per user in Profile → Email reminders (table `public.reminder_settings`, migration `20260928100000_reminders.sql`).

- `index.ts`: HTTP handler (`run` from cron, `test` from the app, `unsubscribe` from the email/app). Sends via Gmail SMTP on port 465.
- `digest.ts`: pure logic + email HTML/text (no imports, testable with Node). Mirrors `src/lib/nextSteps.ts`.
- `schedule.sql`: the pg_cron job (run once, with placeholders filled in; never commit the filled-in copy).

## Setup (one time)

1. **SQL:** run `supabase/migrations/20260928100000_reminders.sql` in the SQL Editor.
2. **Deploy the function** (either way):
   - Dashboard: Edge Functions → Deploy a new function → Via editor. Name it `reminders`. Paste `index.ts`, add a
     second file `digest.ts` and paste that too. Deploy. Then in the function's **Details/Settings**, turn **off**
     "Verify JWT with legacy secret" / "Enforce JWT verification".
   - CLI (from the repo root): `npx supabase login`, then
     `npx supabase functions deploy reminders --project-ref <PROJECT_REF> --no-verify-jwt`
3. **Secrets** (Edge Functions → Secrets):
   | Name | Value |
   |---|---|
   | `SMTP_USER` | `jobtracker.app.lk@gmail.com` |
   | `SMTP_PASS` | a Gmail **app password** for that account (the one already used for Supabase Auth SMTP works) |
   | `CRON_SECRET` | a long random string (e.g. `openssl rand -hex 24`) |
   | `APP_URL` | `https://kalharatennakoon.github.io/shortlistd/` |
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.
4. **Schedule:** enable `pg_cron` and `pg_net` (Database → Extensions), then run `schedule.sql` with
   `<PROJECT_REF>` and `<CRON_SECRET>` filled in.
5. **Test:** in the app, Profile → Email reminders → **Send a test email**.

## Notes
- JWT verification is off because unsubscribe must work signed out. Each action checks its own auth:
  `run` needs the `x-cron-secret` header, `test` verifies the user's JWT, `unsubscribe` needs the random token.
- Supabase Edge Functions block outbound ports 25 and 587, hence Gmail on 465 (implicit TLS).
- Gmail allows ~500 recipients/day on a normal account. Fine for now; switch to a provider (Resend, Brevo) with a
  custom domain if the app grows.
- A user is handled once per local day, on the first run at or after their chosen hour (`isDue`).
  `last_sent_on` is set even when there was nothing to send; a failed send leaves it, so the next run retries.
- Edge Functions can't serve HTML pages on the default domain, so the email's unsubscribe link opens the app
  (`#/unsubscribe?token=…`), which calls the function. The `List-Unsubscribe` header points at the function directly
  for Gmail/Outlook one-click unsubscribe.
