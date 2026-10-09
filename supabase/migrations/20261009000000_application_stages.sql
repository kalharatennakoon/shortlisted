-- Timeline: the stages an application goes through after someone replies (phone screen, first interview,
-- assessment, final interview…), each with its own date, an optional time, how it went, and notes.
-- One row per stage. Before this an application only had a status and a single next step, so a second
-- interview overwrote the first and the history was lost.
--
-- Rows belong to one user and one of that user's applications; RLS enforces both. Stages go when their
-- application goes (on delete cascade), which also covers delete_my_account(): it deletes the applications.

create type stage_outcome as enum ('Waiting', 'Passed', 'Not selected');

create table public.application_stages (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title          text not null check (char_length(title) between 1 and 80),   -- "Phone screen", "Panel interview"…
  stage_date     date not null,                                               -- local to the user, like next_date
  stage_time     time,                                                        -- null = no particular time
  outcome        stage_outcome not null default 'Waiting',
  notes          text check (notes is null or char_length(notes) <= 2000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index application_stages_application_idx on public.application_stages (application_id, stage_date);
create index application_stages_user_idx on public.application_stages (user_id);

create trigger application_stages_set_updated_at
  before update on public.application_stages
  for each row execute function public.set_updated_at();

-- ---------- RLS ----------
alter table public.application_stages enable row level security;

create policy "application_stages: select own" on public.application_stages
  for select to authenticated using (auth.uid() = user_id);

-- A stage can only be attached to an application of the caller's own
create policy "application_stages: insert own" on public.application_stages
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.applications a where a.id = application_id and a.user_id = auth.uid())
  );

create policy "application_stages: update own" on public.application_stages
  for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.applications a where a.id = application_id and a.user_id = auth.uid())
  );

create policy "application_stages: delete own" on public.application_stages
  for delete to authenticated using (auth.uid() = user_id);
