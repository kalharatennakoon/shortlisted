-- Lets a signed-in user permanently delete their own account.
-- The browser (anon key) cannot delete auth users directly, so this runs with the function
-- owner's rights (security definer) but only ever touches the caller's own row (auth.uid()).
-- applications.user_id has ON DELETE CASCADE, so all their applications go with it.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  delete from public.applications where user_id = uid;  -- explicit, in case the FK changes later
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
