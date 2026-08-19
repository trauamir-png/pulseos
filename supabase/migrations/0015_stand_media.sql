-- Stand Media ("מדיה מהיציע") -- TikTok video content, distinct from the
-- media_assets image library. A photographer/content creator publishes
-- supporter/stands clips to TikTok; the Admin pastes the video URL here and
-- publishes it, and the public website renders it via the Public Content API.
--
-- Structurally mirrors banners/columns from 0009_content_management.sql:
-- broad `to authenticated using(true)` RLS for the PulseOS dashboard's own
-- CRUD, plus a narrow `to anon` SELECT-only policy that is the real security
-- boundary for "drafts must never be publicly exposed." Lives under the
-- existing content_management module -- no new module registration needed.

create table if not exists stand_media (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  tiktok_url text not null,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stand_media_site_status_idx on stand_media (site_id, status);
create index if not exists stand_media_site_sort_idx on stand_media (site_id, sort_order);

alter table stand_media enable row level security;

create policy "authenticated select stand_media" on stand_media for select to authenticated using (true);
create policy "authenticated insert stand_media" on stand_media for insert to authenticated with check (true);
create policy "authenticated update stand_media" on stand_media for update to authenticated using (true) with check (true);
create policy "authenticated delete stand_media" on stand_media for delete to authenticated using (true);

-- The actual public-visibility boundary: only published items are readable
-- by the anon role the public Content API queries through. Site isolation
-- itself is NOT expressed here (every table has many sites) -- routes still
-- filter by site_id explicitly after resolving site_key -> site_id.
create policy "anon read published stand_media" on stand_media for select to anon using (status = 'published');

-- ---------------------------------------------------------------------------
-- New permission keys, mirrored in lib/auth/permission-definitions.ts.
-- Deliberately NOT added to any writer preset -- Stand Media management is
-- not granted automatically to the Writer role.
-- ---------------------------------------------------------------------------
insert into permission_definitions (key, category, label, sort_order) values
  ('content.stand_media.view', 'Content', 'View Stand Media', 181),
  ('content.stand_media.manage', 'Content', 'Manage Stand Media', 182)
on conflict (key) do nothing;
