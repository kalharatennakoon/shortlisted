-- Next steps: what to do next for an application, and when (interview, follow-up, …).
-- Both are optional. Existing rows are unaffected; RLS policies on the table already cover new columns.

create type next_step_type as enum ('Interview', 'Follow up', 'Assessment', 'Call', 'Other');

alter table public.applications
  add column next_step next_step_type,
  add column next_date date;

-- "Up next" lists a user's upcoming steps by date
create index applications_user_next_date_idx
  on public.applications (user_id, next_date)
  where next_date is not null;
