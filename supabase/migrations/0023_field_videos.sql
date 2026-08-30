-- Field Videos ("סרטונים מהשטח - הקול מהיציע") -- TikTok video content for
-- the homepage's "Videos from the field" section, whose "View all" button
-- already links out to https://www.tiktok.com/@hakol.mehayeziya. This is a
-- deliberately separate table from stand_media ("מדיה מהיציע") -- same shape,
-- different homepage section, kept fully independent so neither can leak
-- into or be mistaken for the other.
--
-- Structurally mirrors stand_media (0015_stand_media.sql): broad
-- `to authenticated using(true)` RLS for the PulseOS dashboard's own CRUD,
-- plus a narrow `to anon` SELECT-only policy that is the real security
-- boundary for "drafts must never be publicly exposed." Lives under the
-- existing content_management module -- no new module registration needed.
--
-- Unlike stand_media, `caption` is nullable: the spec for this content type
-- explicitly calls the title/caption field optional.

create table if not exists field_videos (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  tiktok_url text not null,
  caption text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists field_videos_site_status_idx on field_videos (site_id, status);
create index if not exists field_videos_site_sort_idx on field_videos (site_id, sort_order);

alter table field_videos enable row level security;

create policy "authenticated select field_videos" on field_videos for select to authenticated using (true);
create policy "authenticated insert field_videos" on field_videos for insert to authenticated with check (true);
create policy "authenticated update field_videos" on field_videos for update to authenticated using (true) with check (true);
create policy "authenticated delete field_videos" on field_videos for delete to authenticated using (true);

-- The actual public-visibility boundary: only published items are readable
-- by the anon role the public Content API queries through. Site isolation
-- itself is NOT expressed here (every table has many sites) -- the route
-- still filters by site_id explicitly after resolving site_key -> site_id.
create policy "anon read published field_videos" on field_videos for select to anon using (status = 'published');

-- ---------------------------------------------------------------------------
-- New permission keys, mirrored in lib/auth/permission-definitions.ts.
-- Deliberately NOT added to any writer preset -- Field Videos management is
-- not granted automatically to the Writer role.
-- ---------------------------------------------------------------------------
insert into permission_definitions (key, category, label, sort_order) values
  ('content.field_videos.view', 'Content', 'View Field Videos', 189),
  ('content.field_videos.manage', 'Content', 'Manage Field Videos', 190)
on conflict (key) do nothing;
