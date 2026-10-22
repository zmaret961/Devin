-- Home Operations & Emergency Command Center: initial schema.
-- Every table is owned by a user (auth.users) and protected by row-level
-- security so a signed-in user can only ever read or write their own rows.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, created automatically on sign-up
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  seeded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- properties
-- ---------------------------------------------------------------------------
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nickname text not null default 'My home',
  address text not null default '',
  zip_code text not null default '' check (zip_code = '' or zip_code ~ '^\d{5}(-\d{4})?$'),
  year_built integer check (year_built is null or year_built between 1600 and 2100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index properties_user_id_idx on public.properties (user_id);

-- ---------------------------------------------------------------------------
-- assets (appliances and home systems)
-- ---------------------------------------------------------------------------
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  name text not null default '',
  brand text not null default '',
  model_number text not null default '',
  serial_number text not null default '',
  category text not null default 'Other' check (category in (
    'HVAC', 'Furnace', 'Water Heater', 'Refrigerator', 'Dishwasher', 'Washer', 'Dryer',
    'Oven/Range', 'Microwave', 'Sump Pump', 'Water Softener', 'Electrical Panel',
    'Generator', 'Garage Door', 'Roof', 'Other'
  )),
  install_date date,
  warranty_expiration date,
  location_in_house text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assets_user_id_idx on public.assets (user_id);
create index assets_property_id_idx on public.assets (property_id);

-- ---------------------------------------------------------------------------
-- maintenance_tasks
-- ---------------------------------------------------------------------------
create table public.maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  title text not null check (length(trim(title)) > 0),
  season text not null check (season in ('Fall', 'Winter', 'Spring', 'Summer')),
  due_date date not null,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'complete')),
  description text not null default '',
  completed_at timestamptz,
  -- Identifies a task created from the built-in seasonal checklist so seeding is idempotent.
  seed_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, seed_key)
);
create index maintenance_tasks_user_due_idx on public.maintenance_tasks (user_id, due_date);

-- ---------------------------------------------------------------------------
-- emergency_contacts
-- ---------------------------------------------------------------------------
create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null default 'other' check (type in (
    'plumber', 'electrician', 'hvac', 'gas_utility', 'electric_utility', 'water_utility',
    'insurance', 'roofer', 'restoration', 'neighbor', 'other'
  )),
  name text not null default '',
  phone text not null default '',
  notes text not null default '',
  sort_order integer not null default 0,
  seed_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, seed_key)
);
create index emergency_contacts_user_id_idx on public.emergency_contacts (user_id);

-- ---------------------------------------------------------------------------
-- documents (metadata for files in the `home-documents` storage bucket)
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  asset_id uuid references public.assets (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  type text not null default 'other' check (type in ('manual', 'insurance', 'warranty', 'receipt', 'other')),
  storage_path text not null unique,
  mime_type text not null default '',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  created_at timestamptz not null default now(),
  -- Files live under "<user id>/..." so the storage policies below can scope them.
  check (split_part(storage_path, '/', 1) = user_id::text)
);
create index documents_user_id_idx on public.documents (user_id);
create index documents_asset_id_idx on public.documents (asset_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger properties_updated_at before update on public.properties
  for each row execute function public.set_updated_at();
create trigger assets_updated_at before update on public.assets
  for each row execute function public.set_updated_at();
create trigger maintenance_tasks_updated_at before update on public.maintenance_tasks
  for each row execute function public.set_updated_at();
create trigger emergency_contacts_updated_at before update on public.emergency_contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- `(select auth.uid())` is evaluated once per statement (Supabase's
-- recommended form for RLS performance).
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.assets enable row level security;
alter table public.maintenance_tasks enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.documents enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles: insert own" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));

create policy "properties: read own" on public.properties
  for select to authenticated using (user_id = (select auth.uid()));
create policy "properties: insert own" on public.properties
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "properties: update own" on public.properties
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "properties: delete own" on public.properties
  for delete to authenticated using (user_id = (select auth.uid()));

-- Child rows may only point at a property/asset the same user owns.
create policy "assets: read own" on public.assets
  for select to authenticated using (user_id = (select auth.uid()));
create policy "assets: insert own" on public.assets
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and (property_id is null or exists (
      select 1 from public.properties p where p.id = property_id and p.user_id = (select auth.uid())))
  );
create policy "assets: update own" on public.assets
  for update to authenticated using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid())
    and (property_id is null or exists (
      select 1 from public.properties p where p.id = property_id and p.user_id = (select auth.uid())))
  );
create policy "assets: delete own" on public.assets
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "maintenance_tasks: read own" on public.maintenance_tasks
  for select to authenticated using (user_id = (select auth.uid()));
create policy "maintenance_tasks: insert own" on public.maintenance_tasks
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and (property_id is null or exists (
      select 1 from public.properties p where p.id = property_id and p.user_id = (select auth.uid())))
  );
create policy "maintenance_tasks: update own" on public.maintenance_tasks
  for update to authenticated using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid())
    and (property_id is null or exists (
      select 1 from public.properties p where p.id = property_id and p.user_id = (select auth.uid())))
  );
create policy "maintenance_tasks: delete own" on public.maintenance_tasks
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "emergency_contacts: read own" on public.emergency_contacts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "emergency_contacts: insert own" on public.emergency_contacts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "emergency_contacts: update own" on public.emergency_contacts
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "emergency_contacts: delete own" on public.emergency_contacts
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "documents: read own" on public.documents
  for select to authenticated using (user_id = (select auth.uid()));
create policy "documents: insert own" on public.documents
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and (asset_id is null or exists (
      select 1 from public.assets a where a.id = asset_id and a.user_id = (select auth.uid())))
  );
create policy "documents: update own" on public.documents
  for update to authenticated using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid())
    and (asset_id is null or exists (
      select 1 from public.assets a where a.id = asset_id and a.user_id = (select auth.uid())))
  );
create policy "documents: delete own" on public.documents
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage: private bucket for manuals / insurance PDFs, scoped per user.
-- Object keys are "<user id>/<asset id or 'general'>/<uuid>-<file name>".
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'home-documents',
  'home-documents',
  false,
  26214400, -- 25 MB
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

create policy "home-documents: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'home-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "home-documents: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'home-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "home-documents: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'home-documents' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'home-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "home-documents: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'home-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
