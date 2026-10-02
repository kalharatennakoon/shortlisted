-- Next-step time and contact email.
--   next_time:     time of day for the next step (interview at 14:30). Null = all day. Local to the user, like next_date.
--   contact_email: recruiter / hiring contact for the application, used to fill in follow-up emails.
-- Both are optional and set by hand in the app. Existing rows are unaffected; RLS policies on the table already
-- cover new columns.

alter table public.applications
  add column if not exists next_time time,
  add column if not exists contact_email text
    constraint applications_contact_email_len check (contact_email is null or char_length(contact_email) <= 254);
