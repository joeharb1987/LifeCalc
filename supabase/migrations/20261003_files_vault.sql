-- Files vault: private household finance files with a one-off AI summary.
-- Only members of a household (via household_members) can see, add, change or delete its files.

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  storage_path text not null unique,
  original_name text not null,
  mime_type text,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  sha256 text not null,
  uploaded_at timestamptz not null default now(),
  as_at_date date,
  file_type text not null default 'other' check (file_type in ('statement', 'investment', 'bill', 'payslip', 'other')),
  summary text,
  extracted_text text,
  linked_item_id text,     -- id of a budget line inside households.data.items (nullable)
  linked_asset_id text,    -- id of an asset inside households.data.assets (nullable)
  ai_note text,
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  error text,
  unique (household_id, sha256)   -- the same file can't be uploaded twice
);
create index if not exists files_household_asat_idx on public.files (household_id, as_at_date desc nulls last, uploaded_at desc);

alter table public.files enable row level security;

create policy "members read files" on public.files
  for select to authenticated using (private.is_household_member(household_id));
create policy "members add files" on public.files
  for insert to authenticated with check (private.is_household_member(household_id) and uploaded_by = (select auth.uid()));
create policy "members edit files" on public.files
  for update to authenticated using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy "members delete files" on public.files
  for delete to authenticated using (private.is_household_member(household_id));

-- Private bucket; objects live at <household_id>/<uuid>-<name>. No public URLs (signed URLs only).
insert into storage.buckets (id, name, public, file_size_limit)
values ('household-files', 'household-files', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

-- Folder name must be a household the user belongs to.
create or replace function private.file_folder_ok(object_name text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare h uuid;
begin
  begin h := (storage.foldername(object_name))[1]::uuid; exception when others then return false; end;
  return private.is_household_member(h);
end;
$$;
grant execute on function private.file_folder_ok(text) to authenticated;

create policy "members read household files" on storage.objects
  for select to authenticated using (bucket_id = 'household-files' and private.file_folder_ok(name));
create policy "members upload household files" on storage.objects
  for insert to authenticated with check (bucket_id = 'household-files' and private.file_folder_ok(name));
create policy "members delete household files" on storage.objects
  for delete to authenticated using (bucket_id = 'household-files' and private.file_folder_ok(name));
