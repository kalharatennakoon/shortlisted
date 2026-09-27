-- Documents per application: a personal library of files (CVs, cover letters, ...) that can be attached
-- to any number of applications. Files live in a PRIVATE Storage bucket under <user id>/<document id>/<file>;
-- rows here hold the metadata. Everything is scoped to auth.uid() by RLS.

create type document_kind as enum ('CV', 'Cover letter', 'Portfolio', 'Certificate', 'Other');

create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 200),  -- display name, editable
  kind          document_kind not null default 'Other',
  file_name     text not null,                                              -- original file name
  storage_path  text not null unique,
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 5242880),
  mime_type     text,
  created_at    timestamptz not null default now(),
  -- the file must sit in the owner's folder
  constraint documents_path_in_own_folder check (split_part(storage_path, '/', 1) = user_id::text)
);
create index documents_user_idx on public.documents (user_id, created_at desc);

create table public.application_documents (
  application_id uuid not null references public.applications (id) on delete cascade,
  document_id    uuid not null references public.documents (id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (application_id, document_id)
);
create index application_documents_doc_idx on public.application_documents (document_id);
create index application_documents_user_idx on public.application_documents (user_id);

-- Per-user limit (keeps the free Storage tier safe). SECURITY DEFINER so policies can count without RLS recursion.
create or replace function public.my_document_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.documents where user_id = auth.uid();
$$;
revoke all on function public.my_document_count() from public, anon;
grant execute on function public.my_document_count() to authenticated;

-- ---------- RLS: documents ----------
alter table public.documents enable row level security;

create policy "documents: select own" on public.documents
  for select to authenticated using (auth.uid() = user_id);
create policy "documents: insert own, within limit" on public.documents
  for insert to authenticated
  with check (auth.uid() = user_id and public.my_document_count() < 30);
create policy "documents: update own" on public.documents
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "documents: delete own" on public.documents
  for delete to authenticated using (auth.uid() = user_id);

-- Only name and kind are editable after upload
revoke update on public.documents from authenticated;
grant update (name, kind) on public.documents to authenticated;

-- ---------- RLS: application_documents ----------
alter table public.application_documents enable row level security;

create policy "application_documents: select own" on public.application_documents
  for select to authenticated using (auth.uid() = user_id);
-- both sides of the link must belong to the caller
create policy "application_documents: insert own" on public.application_documents
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.applications a where a.id = application_id and a.user_id = auth.uid())
    and exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid())
  );
create policy "application_documents: delete own" on public.application_documents
  for delete to authenticated using (auth.uid() = user_id);

-- ---------- Storage bucket (private, 5 MB per file, document/image types only) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 5242880,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
    'text/plain',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Users can only touch objects in their own folder: documents/<their user id>/...
create policy "documents bucket: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "documents bucket: upload own, within limit" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.my_document_count() < 30
  );
create policy "documents bucket: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Account deletion ----------
-- delete_my_account() now also removes document rows explicitly (they cascade from auth.users too).
-- The files themselves are removed by the browser through the Storage API before this runs
-- (src/lib/account.ts), because Supabase doesn't allow deleting storage objects with SQL.

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
  delete from public.application_documents where user_id = uid;
  delete from public.documents where user_id = uid;
  delete from public.applications where user_id = uid;  -- explicit, in case the FK changes later
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
