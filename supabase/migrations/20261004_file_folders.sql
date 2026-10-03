-- Files vault folders: custom household folders (e.g. "Bank statements", "Payslips"). One level, no nesting.
-- A file sits in at most one folder; deleting a folder leaves its files unfiled.

create table if not exists public.file_folders (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  icon text not null default 'folder',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists file_folders_name_idx on public.file_folders (household_id, lower(btrim(name)));

alter table public.file_folders enable row level security;
create policy "members read folders" on public.file_folders
  for select to authenticated using (private.is_household_member(household_id));
create policy "members add folders" on public.file_folders
  for insert to authenticated with check (private.is_household_member(household_id));
create policy "members edit folders" on public.file_folders
  for update to authenticated using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy "members delete folders" on public.file_folders
  for delete to authenticated using (private.is_household_member(household_id));

alter table public.files add column if not exists folder_id uuid references public.file_folders (id) on delete set null;
create index if not exists files_folder_idx on public.files (folder_id);

-- A file's folder must belong to the same household.
create or replace function private.file_folder_same_household()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.folder_id is not null and not exists (
    select 1 from public.file_folders f where f.id = new.folder_id and f.household_id = new.household_id
  ) then
    raise exception 'Folder belongs to another household' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger files_folder_household before insert or update of folder_id, household_id on public.files
  for each row execute function private.file_folder_same_household();
