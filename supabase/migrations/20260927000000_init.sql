-- Job Tracker: initial schema
-- Mirrors the Notion "Jobs / Application Tracker" database.
-- Each row belongs to exactly one auth user; Row Level Security enforces isolation.

create type application_status as enum (
  'Applied', 'Interviewed', 'Offered', 'Accepted', 'Rejected', 'No Response'
);

create type application_priority as enum ('Low', 'Medium', 'High');

create type application_platform as enum ('Email', 'Company Website', 'LinkedIn', 'Other');

create table public.applications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,                 -- role / position title (Notion "Name")
  company     text,
  applied_on  date,
  platform    application_platform,
  priority    application_priority,
  status      application_status not null default 'Applied',
  job_url     text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index applications_user_id_idx on public.applications (user_id);
create index applications_user_status_idx on public.applications (user_id, status);

-- keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- Row Level Security: users only ever see and change their own rows
alter table public.applications enable row level security;

create policy "Users can read own applications"
  on public.applications for select
  using (auth.uid() = user_id);

create policy "Users can insert own applications"
  on public.applications for insert
  with check (auth.uid() = user_id);

create policy "Users can update own applications"
  on public.applications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own applications"
  on public.applications for delete
  using (auth.uid() = user_id);
