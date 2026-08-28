-- Status Snapshot ("תמונת מצב") -- a short headline+summary update shown in a
-- section directly below the main logo on the public site. Only the newest
-- published item is ever consumed publicly (see the public API route); older
-- updates are kept as history, never deleted on publish.
--
-- Structurally mirrors stand_media (0015_stand_media.sql): broad
-- `to authenticated using(true)` RLS for the PulseOS dashboard's own CRUD,
-- plus a narrow `to anon` SELECT-only policy that is the real security
-- boundary for "drafts must never be publicly exposed." Lives under the
-- existing content_management module -- no new module registration needed.

create table if not exists status_snapshots (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  headline text not null,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists status_snapshots_site_status_idx on status_snapshots (site_id, status);
create index if not exists status_snapshots_site_published_idx on status_snapshots (site_id, published_at desc);

alter table status_snapshots enable row level security;

create policy "authenticated select status_snapshots" on status_snapshots for select to authenticated using (true);
create policy "authenticated insert status_snapshots" on status_snapshots for insert to authenticated with check (true);
create policy "authenticated update status_snapshots" on status_snapshots for update to authenticated using (true) with check (true);
create policy "authenticated delete status_snapshots" on status_snapshots for delete to authenticated using (true);

-- The actual public-visibility boundary: only published items are readable
-- by the anon role the public Content API queries through. Site isolation
-- itself is NOT expressed here (every table has many sites) -- the route
-- still filters by site_id explicitly after resolving site_key -> site_id.
create policy "anon read published status_snapshots" on status_snapshots for select to anon using (status = 'published');

-- ---------------------------------------------------------------------------
-- New permission keys, mirrored in lib/auth/permission-definitions.ts.
-- Deliberately NOT added to any writer preset -- Status Snapshot management
-- is not granted automatically to the Writer role.
-- ---------------------------------------------------------------------------
insert into permission_definitions (key, category, label, sort_order) values
  ('content.status_snapshots.view', 'Content', 'View Status Snapshot', 187),
  ('content.status_snapshots.manage', 'Content', 'Manage Status Snapshot', 188)
on conflict (key) do nothing;
