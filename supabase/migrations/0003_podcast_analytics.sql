-- Podcast Analytics V1: separate, toggleable module alongside Web Analytics.
-- No existing table is modified. Everything here is additive.

-- ---------------------------------------------------------------------------
-- site_modules: which analytics modules are active per site.
-- Mirrors the site_conversion_events pattern (config-as-data, not hardcoded).
-- ---------------------------------------------------------------------------
create table if not exists site_modules (
  site_id uuid not null references sites (id) on delete cascade,
  module_key text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (site_id, module_key)
);

alter table site_modules enable row level security;

create policy "authenticated read site_modules" on site_modules for select to authenticated using (true);
create policy "authenticated manage site_modules" on site_modules for insert to authenticated with check (true);
create policy "authenticated update site_modules" on site_modules for update to authenticated using (true) with check (true);

-- Existing site: web_analytics on, podcast_analytics off.
insert into site_modules (site_id, module_key, active)
values
  ('12361f89-f7d2-4569-933c-23101867a9ec', 'web_analytics', true),
  ('12361f89-f7d2-4569-933c-23101867a9ec', 'podcast_analytics', false)
on conflict (site_id, module_key) do nothing;

-- ---------------------------------------------------------------------------
-- podcasts: not hardcoded to a single site. A site can host zero or more.
-- ---------------------------------------------------------------------------
create table if not exists podcasts (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  name text not null,
  description text,
  artwork_url text,
  website_url text,
  rss_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists podcasts_site_idx on podcasts (site_id);

alter table podcasts enable row level security;
create policy "authenticated read podcasts" on podcasts for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- episodes: platform links are all optional -- an episode need not exist
-- everywhere (Spotify/Apple/YouTube/audio file are independent).
-- ---------------------------------------------------------------------------
create table if not exists episodes (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid not null references podcasts (id) on delete cascade,
  title text not null,
  episode_number int,
  description text,
  published_at timestamptz,
  duration_seconds int,
  artwork_url text,
  page_url text,
  audio_url text,
  spotify_url text,
  apple_podcasts_url text,
  youtube_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists episodes_podcast_idx on episodes (podcast_id);
create index if not exists episodes_podcast_published_idx on episodes (podcast_id, published_at desc);

alter table episodes enable row level security;
create policy "authenticated read episodes" on episodes for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- podcast_events: generic, extensible event tracking for podcast listening
-- activity. Kept fully separate from the web `events` table so Web Analytics
-- is never touched by podcast traffic. event_name is free text (not an enum)
-- so new event types never require a migration -- same philosophy as
-- `events.event_name`. session_id links back to the existing web `sessions`
-- table so a listen inherits traffic_source/device/referrer for free;
-- traffic_source is also denormalized here (same pattern as page_views/events)
-- so Sources breakdowns don't need a join.
-- ---------------------------------------------------------------------------
create table if not exists podcast_events (
  id bigint generated always as identity primary key,
  site_id uuid not null references sites (id) on delete cascade,
  podcast_id uuid not null references podcasts (id) on delete cascade,
  episode_id uuid references episodes (id) on delete cascade,
  session_id uuid not null references sessions (id) on delete cascade,
  visitor_hash text not null,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  traffic_source text not null default 'direct',
  occurred_at timestamptz not null default now()
);

create index if not exists podcast_events_site_time_idx on podcast_events (site_id, occurred_at desc);
create index if not exists podcast_events_podcast_time_idx on podcast_events (podcast_id, occurred_at desc);
create index if not exists podcast_events_episode_time_idx on podcast_events (episode_id, occurred_at desc);
create index if not exists podcast_events_episode_name_idx on podcast_events (episode_id, event_name);

alter table podcast_events enable row level security;
create policy "authenticated read podcast_events" on podcast_events for select to authenticated using (true);
