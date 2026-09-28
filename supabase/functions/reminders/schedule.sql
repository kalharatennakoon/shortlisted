-- Schedules the reminders function. Run ONCE in the SQL Editor, after:
--   1. Database -> Extensions: enable pg_cron and pg_net
--   2. the function is deployed and its CRON_SECRET secret is set
-- Replace <PROJECT_REF> (Project Settings -> General -> Project ID) and <CRON_SECRET> (the same value as the secret).
-- Not a migration: it contains a secret, so the filled-in version must never be committed.
--
-- Runs at minute 1 and 31 of every hour, so zones with a :30 offset (like Sri Lanka, UTC+05:30) get their
-- email at about hh:01 local time and whole-hour zones at about hh:01 or hh:31.

select cron.schedule(
  'job-tracker-reminders',
  '1,31 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := jsonb_build_object('action', 'run'),
    timeout_milliseconds := 60000
  );
  $$
);

-- Useful afterwards:
--   select * from cron.job;                                                     -- is it scheduled?
--   select status, start_time from cron.job_run_details order by start_time desc limit 10;
--   select status_code, content from net._http_response order by created desc limit 10;  -- function replies
--   select cron.unschedule('job-tracker-reminders');                            -- stop it
