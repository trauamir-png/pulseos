-- Site-based users & granular permissions -- Phase 1 foundation.
--
-- Adds: profiles (1:1 shadow of auth.users, carries the global `is_admin`
-- flag), site_memberships (which sites a user is assigned to), and a
-- normalized permission_definitions / membership_permissions pair (chosen
-- over a JSONB permission blob so future RLS policies can check a single
-- permission with a plain indexed `exists()`, and so a typo'd permission key
-- can never be inserted -- see the audit report for the full rationale).
--
-- This migration is purely additive: no existing table's shape changes
-- except `columns` gaining one nullable column. Nothing here changes any
-- existing RLS policy or application behavior -- the broad
-- `to authenticated using (true)` policies from prior migrations are left
-- exactly as they are. That tightening is a deliberate later phase, done
-- only after the application-layer checks added on top of this schema have
-- been proven out (see the audit report's rollout phases).

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  active boolean not null default true,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- site_memberships: one row per (user, site). Permissions for that
-- membership live in membership_permissions below -- there is no `role`
-- column here. Role presets (Owner/Editor/Writer) are a UI-only convenience
-- applied client-side when creating a user; the database only ever stores
-- and checks the resulting explicit permission set.
-- ---------------------------------------------------------------------------
create table if not exists site_memberships (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, user_id)
);

create index if not exists site_memberships_user_idx on site_memberships (user_id);
create index if not exists site_memberships_site_idx on site_memberships (site_id);

-- ---------------------------------------------------------------------------
-- permission_definitions: the centralized, stable list of permission keys.
-- Mirrored in code at lib/auth/permission-definitions.ts -- that file is the
-- source of truth application code imports from; this table exists so the
-- database can enforce (via FK) that membership_permissions never contains a
-- key that isn't a real, known permission, and so a future checkbox UI can
-- be built by querying this table directly.
-- ---------------------------------------------------------------------------
create table if not exists permission_definitions (
  key text primary key,
  category text not null,
  label text not null,
  description text,
  sort_order int not null default 0
);

insert into permission_definitions (key, category, label, sort_order) values
  ('analytics.dashboard.view', 'Website / Analytics', 'View Dashboard', 10),
  ('analytics.realtime.view', 'Website / Analytics', 'View Realtime', 20),
  ('analytics.pages.view', 'Website / Analytics', 'View Pages', 30),
  ('analytics.sources.view', 'Website / Analytics', 'View Sources', 40),
  ('analytics.events.view', 'Website / Analytics', 'View Events', 50),
  ('podcast.overview.view', 'Podcast', 'View Podcast Overview', 60),
  ('podcast.episodes.view', 'Podcast', 'View Podcast Episodes / Analytics', 70),
  ('content.columns.view', 'Content', 'View Columns', 80),
  ('content.columns.create', 'Content', 'Create Columns', 90),
  ('content.columns.edit_own', 'Content', 'Edit Own Columns', 100),
  ('content.columns.edit_all', 'Content', 'Edit All Columns', 110),
  ('content.columns.publish', 'Content', 'Publish Columns', 120),
  ('content.columns.schedule', 'Content', 'Schedule Columns', 130),
  ('content.columns.delete', 'Content', 'Delete Columns', 140),
  ('content.authors.manage', 'Content', 'Manage Authors', 150),
  ('content.categories.manage', 'Content', 'Manage Categories', 160),
  ('content.media.manage', 'Content', 'Manage Media', 170),
  ('content.banners.manage', 'Content', 'Manage Banners', 180),
  ('chat.writers.access', 'Collaboration', 'Access Writers Chat', 190),
  ('site.users.manage', 'Administration', 'Manage Users & Permissions for this site', 200),
  ('site.settings.manage', 'Administration', 'Manage Site Settings', 210)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- membership_permissions: which permission keys a given membership grants.
-- ---------------------------------------------------------------------------
create table if not exists membership_permissions (
  membership_id uuid not null references site_memberships (id) on delete cascade,
  permission_key text not null references permission_definitions (key) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (membership_id, permission_key)
);

create index if not exists membership_permissions_key_idx on membership_permissions (permission_key);

-- ---------------------------------------------------------------------------
-- columns.created_by: the authenticated PulseOS user who owns/created the
-- CMS record. Deliberately separate from author_id (the public byline shown
-- on the website, unrelated to who is logged in). Nullable + `on delete set
-- null` mirrors the existing featured_image_id/og_image_id pattern on this
-- same table -- a departing user shouldn't block deleting their profile, and
-- a column with no known creator is a valid state (falls back to
-- edit_all-permission users).
-- ---------------------------------------------------------------------------
alter table columns add column if not exists created_by uuid references profiles (id) on delete set null;

-- Backfill: every column that exists today was authored through the single
-- current admin account, so attribute existing rows to the bootstrapped
-- Admin profile rather than leaving them ambiguously null.
update columns
set created_by = (select id from profiles where is_admin = true order by created_at asc limit 1)
where created_by is null
  and exists (select 1 from profiles where is_admin = true);

-- ---------------------------------------------------------------------------
-- Authorization functions.
--
-- security invoker (the default, stated explicitly) -- these run with the
-- calling user's own privileges and RLS, not elevated ones. That's safe and
-- sufficient here because every policy below already lets a user read their
-- own profile / own memberships / own membership_permissions rows, which is
-- all these functions ever need for auth.uid(). No SECURITY DEFINER
-- privilege boundary is introduced anywhere in this migration.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce((select p.is_admin from profiles p where p.id = p_user_id and p.active), false);
$$;

create or replace function public.has_permission(p_site_id uuid, p_permission text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    public.is_admin(auth.uid())
    or exists (
      select 1
      from site_memberships sm
      join membership_permissions mp on mp.membership_id = sm.id
      where sm.user_id = auth.uid()
        and sm.site_id = p_site_id
        and sm.active = true
        and mp.permission_key = p_permission
    );
$$;

create or replace function public.permissions_for_site(p_site_id uuid)
returns setof text
language sql
stable
security invoker
set search_path = public
as $$
  select pd.key from permission_definitions pd where public.is_admin(auth.uid())
  union
  select mp.permission_key
  from site_memberships sm
  join membership_permissions mp on mp.membership_id = sm.id
  where sm.user_id = auth.uid() and sm.site_id = p_site_id and sm.active = true;
$$;

create or replace function public.accessible_site_ids()
returns setof uuid
language sql
stable
security invoker
set search_path = public
as $$
  select id from sites where public.is_admin(auth.uid())
  union
  select sm.site_id from site_memberships sm where sm.user_id = auth.uid() and sm.active = true;
$$;

grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.has_permission(uuid, text) to authenticated;
grant execute on function public.permissions_for_site(uuid) to authenticated;
grant execute on function public.accessible_site_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS -- deliberately restrictive from the start on these NEW tables. Unlike
-- every earlier migration's `to authenticated using (true)` convention, a
-- normal authenticated user gets read access to their own rows only, and NO
-- write policy at all -- every insert/update/delete on these four tables
-- goes through the service-role key (i.e. a future admin-only Server
-- Action), never directly from an authenticated client session. This is
-- what makes self-escalation ("set my own is_admin", "grant myself a
-- permission") impossible at the database layer, not just hidden in the UI.
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table site_memberships enable row level security;
alter table permission_definitions enable row level security;
alter table membership_permissions enable row level security;

create policy "read own or admin reads all profiles" on profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()));

create policy "read own or admin reads all memberships" on site_memberships
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

create policy "authenticated read permission_definitions" on permission_definitions
  for select to authenticated
  using (true);

create policy "read own or admin reads all membership_permissions" on membership_permissions
  for select to authenticated
  using (
    public.is_admin(auth.uid())
    or exists (
      select 1 from site_memberships sm
      where sm.id = membership_permissions.membership_id and sm.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Admin bootstrap: the current single account (identified by its Supabase
-- Auth login email) becomes the first Admin. Written as a dynamic lookup by
-- email rather than a hardcoded UUID so this migration is portable and
-- doesn't require knowing the auth.users id ahead of time.
-- ---------------------------------------------------------------------------
insert into profiles (id, display_name, is_admin)
select id, 'Amir Trau', true
from auth.users
where email = 'trauamir@gmail.com'
on conflict (id) do update set is_admin = true;
