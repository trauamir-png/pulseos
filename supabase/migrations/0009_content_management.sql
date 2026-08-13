-- Content Management V1: Columns, Authors, Categories, Media Library, Banners.
-- New, toggleable module (like podcast_analytics) so PulseOS becomes a real
-- CMS for external sites without any code change or deploy on their end.
-- No existing table is modified. Everything here is additive.

-- ---------------------------------------------------------------------------
-- Registers the module for every existing site, inactive by default -- same
-- pattern as podcast_analytics in 0003, but via a select so it covers every
-- site that exists by the time this runs, not just the one seed site.
-- ---------------------------------------------------------------------------
insert into site_modules (site_id, module_key, active)
select id, 'content_management', false from sites
on conflict (site_id, module_key) do nothing;

-- ---------------------------------------------------------------------------
-- media_assets: Supabase Storage-backed library, shared by Column featured
-- images, Author profile images, and Banner images. No FK dependencies on
-- other new tables, so it's created first.
-- ---------------------------------------------------------------------------
create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  original_filename text not null,
  alt_text text,
  title text,
  mime_type text not null,
  size_bytes int not null,
  width int,
  height int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_assets_site_idx on media_assets (site_id, created_at desc);

-- ---------------------------------------------------------------------------
-- authors
-- ---------------------------------------------------------------------------
create table if not exists authors (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  name text not null,
  slug text not null,
  profile_image_id uuid references media_assets (id) on delete set null,
  short_bio text,
  full_bio text,
  email text,
  social_links jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, slug)
);

create index if not exists authors_site_idx on authors (site_id);

-- ---------------------------------------------------------------------------
-- categories: one per Column in V1 (no many-to-many).
-- ---------------------------------------------------------------------------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, slug)
);

create index if not exists categories_site_order_idx on categories (site_id, display_order);

-- ---------------------------------------------------------------------------
-- columns: the content entity for this module. Deliberately not named
-- "articles" -- a distinct entity per spec, though structurally similar.
-- author_id/category_id are `references ... ` with the Postgres default of
-- `on delete restrict`, so the DB itself blocks deleting an Author/Category
-- that's still linked to a Column -- the app layer checks this first (via
-- countColumnsByAuthor/countColumnsByCategory) to show a clear message
-- instead of a raw FK violation, but the DB constraint is the real backstop.
-- ---------------------------------------------------------------------------
create table if not exists columns (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  title text not null,
  subtitle text,
  slug text not null,
  body text not null default '',
  featured_image_id uuid references media_assets (id) on delete set null,
  author_id uuid not null references authors (id),
  category_id uuid not null references categories (id),
  tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published')),
  published_at timestamptz,
  scheduled_at timestamptz,
  seo_title text,
  meta_description text,
  og_image_id uuid references media_assets (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, slug),
  check (status <> 'scheduled' or scheduled_at is not null)
);

create index if not exists columns_site_status_published_idx on columns (site_id, status, published_at desc);
create index if not exists columns_site_category_idx on columns (site_id, category_id);
create index if not exists columns_site_author_idx on columns (site_id, author_id);

-- ---------------------------------------------------------------------------
-- banners: placement is a pure data contract -- the external site asks "what
-- should I show in slot X" and gets back whatever's active for that
-- placement. No layout is hardcoded here.
-- ---------------------------------------------------------------------------
create table if not exists banners (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  internal_name text not null,
  desktop_image_id uuid not null references media_assets (id),
  mobile_image_id uuid references media_assets (id),
  title text,
  subtitle text,
  cta_text text,
  destination_url text,
  placement text not null check (placement in ('home_hero', 'home_secondary', 'columns_top', 'column_top', 'column_bottom')),
  active boolean not null default true,
  start_at timestamptz,
  end_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists banners_site_placement_idx on banners (site_id, placement, active);

-- ---------------------------------------------------------------------------
-- Row Level Security -- authenticated (PulseOS admin dashboard).
-- Same house convention as every other table: broad `to authenticated
-- using(true)`, all four operations from the start (0003 shipped select-only
-- for podcasts/episodes and needed a follow-up migration -- not repeating
-- that here).
-- ---------------------------------------------------------------------------
alter table media_assets enable row level security;
alter table authors enable row level security;
alter table categories enable row level security;
alter table columns enable row level security;
alter table banners enable row level security;

create policy "authenticated read media_assets" on media_assets for select to authenticated using (true);
create policy "authenticated insert media_assets" on media_assets for insert to authenticated with check (true);
create policy "authenticated update media_assets" on media_assets for update to authenticated using (true) with check (true);
create policy "authenticated delete media_assets" on media_assets for delete to authenticated using (true);

create policy "authenticated read authors" on authors for select to authenticated using (true);
create policy "authenticated insert authors" on authors for insert to authenticated with check (true);
create policy "authenticated update authors" on authors for update to authenticated using (true) with check (true);
create policy "authenticated delete authors" on authors for delete to authenticated using (true);

create policy "authenticated read categories" on categories for select to authenticated using (true);
create policy "authenticated insert categories" on categories for insert to authenticated with check (true);
create policy "authenticated update categories" on categories for update to authenticated using (true) with check (true);
create policy "authenticated delete categories" on categories for delete to authenticated using (true);

create policy "authenticated read columns" on columns for select to authenticated using (true);
create policy "authenticated insert columns" on columns for insert to authenticated with check (true);
create policy "authenticated update columns" on columns for update to authenticated using (true) with check (true);
create policy "authenticated delete columns" on columns for delete to authenticated using (true);

create policy "authenticated read banners" on banners for select to authenticated using (true);
create policy "authenticated insert banners" on banners for insert to authenticated with check (true);
create policy "authenticated update banners" on banners for update to authenticated using (true) with check (true);
create policy "authenticated delete banners" on banners for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Row Level Security -- anon (the public Content API for external sites).
-- Unlike every other table in this database, this is a genuine security
-- boundary: the caller here is truly unauthenticated. Narrow, defense-in-
-- depth policies so a bug in a route handler's own filters still can't leak
-- a draft, an inactive row, or a not-yet-scheduled banner. Site isolation
-- itself is NOT expressed here (every table has many sites) -- routes still
-- filter by site_id explicitly after resolving site_key -> site_id.
-- ---------------------------------------------------------------------------
create policy "anon read published columns" on columns for select to anon
  using (status = 'published' or (status = 'scheduled' and scheduled_at <= now()));

create policy "anon read active authors" on authors for select to anon using (active = true);

create policy "anon read active categories" on categories for select to anon using (active = true);

create policy "anon read active banners" on banners for select to anon
  using (active = true and (start_at is null or start_at <= now()) and (end_at is null or end_at >= now()));

-- Harmless to expose broadly: the underlying Storage object is already
-- public-read regardless of this table, so this just lets the public API
-- resolve image URLs without a service-role escape hatch.
create policy "anon read media_assets" on media_assets for select to anon using (true);

-- ---------------------------------------------------------------------------
-- Storage: single public-read bucket for all Content Management images.
-- Public because featured/author/banner images are inherently public
-- marketing assets displayed via plain <img> on an external static site --
-- signed URLs would be actively wrong here. Writes restricted to
-- `authenticated`; there's no per-site login in this app (single shared
-- admin), so path-prefix RLS wouldn't add real protection -- media_assets.
-- site_id is the actual site-scoping mechanism the management UI relies on.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('content-media', 'content-media', true)
on conflict (id) do nothing;

create policy "authenticated manage content-media" on storage.objects for all to authenticated
  using (bucket_id = 'content-media')
  with check (bucket_id = 'content-media');
