-- Posting check: the day the user last opened the saved job posting (job_url), and whether it has been taken down.
-- Both are set by hand in the app; nothing checks the URL automatically.
-- Existing rows are unaffected; RLS policies on the table already cover new columns.

alter table public.applications
  add column if not exists posting_checked_on date,
  add column if not exists posting_closed boolean not null default false;
