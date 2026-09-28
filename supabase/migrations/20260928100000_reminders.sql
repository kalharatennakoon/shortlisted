-- Email reminders: a daily digest of next steps, sent by the `reminders` Edge Function
-- (supabase/functions/reminders), which pg_cron calls every hour. See supabase/functions/reminders/README.md.

create table public.reminder_settings (
  user_id            uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  enabled            boolean not null default true,
  send_hour          smallint not null default 7 check (send_hour between 0 and 23),  -- local hour
  time_zone          text not null default 'Asia/Colombo' check (char_length(time_zone) between 1 and 64),
  include_follow_ups boolean not null default true,  -- Mondays: "Applied 14+ days ago, no reply" list
  unsubscribe_token  uuid not null default gen_random_uuid() unique,
  last_sent_on       date,          -- local date of the last digest run for this user (set by the function)
  last_test_at       timestamptz,   -- rate limit for "Send a test email"
  updated_at         timestamptz not null default now()
);

alter table public.reminder_settings enable row level security;

create policy "reminder_settings: select own" on public.reminder_settings
  for select to authenticated using (auth.uid() = user_id);
create policy "reminder_settings: insert own" on public.reminder_settings
  for insert to authenticated with check (auth.uid() = user_id);
create policy "reminder_settings: update own" on public.reminder_settings
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Users may only set their preferences; the token and bookkeeping columns belong to the function (service role).
revoke insert, update on public.reminder_settings from authenticated;
grant insert (enabled, send_hour, time_zone, include_follow_ups) on public.reminder_settings to authenticated;
grant update (enabled, send_hour, time_zone, include_follow_ups, updated_at) on public.reminder_settings to authenticated;

-- Who to consider on this run, with their email address (auth.users isn't reachable through the API).
-- Service role only: the Edge Function calls it.
create or replace function public.reminder_recipients()
returns table (
  user_id uuid,
  email text,
  time_zone text,
  send_hour smallint,
  include_follow_ups boolean,
  unsubscribe_token uuid,
  last_sent_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.user_id, u.email::text, s.time_zone, s.send_hour, s.include_follow_ups, s.unsubscribe_token, s.last_sent_on
  from public.reminder_settings s
  join auth.users u on u.id = s.user_id
  where s.enabled and u.email is not null and u.email_confirmed_at is not null;
$$;
revoke all on function public.reminder_recipients() from public, anon, authenticated;
grant execute on function public.reminder_recipients() to service_role;
