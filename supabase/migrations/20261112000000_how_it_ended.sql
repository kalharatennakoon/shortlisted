-- How an application ended: when one is marked Rejected, the person can say (optionally) where it stopped, why, and
-- who ended it. Over time this shows patterns ("most of mine end at the assessment") that a status alone can't.
--
-- All four columns are optional and only make sense while the status is Rejected; the app only shows and counts
-- them then. They are kept (not cleared) if the status changes back, so nothing typed in is lost.
-- Existing rows are unaffected; the table's RLS policies already cover new columns, and delete_my_account()
-- removes them with the application.

-- Where it stopped. Fixed steps, not the timeline's free-text titles, so they can be counted.
create type ended_stage as enum ('Application', 'Screening', 'Assessment', 'Interview', 'Final round', 'Offer');

-- Why. The first seven are the employer's reasons; 'Another offer' and 'Took too long' are the person's own
-- (when they withdrew); 'Salary', 'Location' and 'Other' fit either side.
create type ended_reason as enum (
  'Experience', 'Skills', 'Salary', 'Position filled', 'Location', 'Test or interview', 'No reason given',
  'Another offer', 'Took too long', 'Other'
);

-- Who ended it: the employer turned the person down, or the person withdrew.
create type ended_by as enum ('Employer', 'Me');

alter table public.applications
  add column if not exists ended_stage  ended_stage,
  add column if not exists ended_reason ended_reason,
  add column if not exists ended_by     ended_by,
  add column if not exists ended_note   text check (ended_note is null or char_length(ended_note) <= 1000);
