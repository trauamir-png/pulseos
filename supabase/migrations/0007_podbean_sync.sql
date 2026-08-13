-- Podbean Analytics Sync: storage for data pulled from the Podbean API.
-- Fully additive and fully separate from PulseOS's own web-player-measured
-- podcast_events / listen tracking (0003). Podbean numbers (downloads,
-- listeners, engagement) must never be merged into or displayed as
-- Web Player listens -- they are a distinct, clearly-labeled data source.
--
-- All writes to these tables happen server-side via the service-role client
-- (nightly cron + backfill routes), so there are no authenticated
-- insert/update policies -- only read, mirroring how podcast_events is
-- written exclusively by /api/collect.

-- ---------------------------------------------------------------------------
-- 1. Identity links: Podbean's own IDs, stored once resolved. Never guessed --
--    podbean_podcast_id comes from GET /podcast, podbean_episode_id comes
--    from matching GET /episodes' media_url/permalink_url against our own
--    audio_url/page_url (verified to match exactly on real data).
-- ---------------------------------------------------------------------------
alter table podcasts add column if not exists podbean_podcast_id text;
alter table podcasts add column if not exists podbean_last_synced_at timestamptz;
alter table podcasts add column if not exists podbean_last_sync_status text;
alter table podcasts add column if not exists podbean_last_error text;

alter table episodes add column if not exists podbean_episode_id text;
create unique index if not exists episodes_podbean_episode_idx on episodes (podcast_id, podbean_episode_id) where podbean_episode_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Daily download snapshots (podcastStats/stats). One real API call per
--    episode covers up to a 90-day window and returns one count per day --
--    so these are genuine daily history, not derived totals. Primary key on
--    (id, stat_date) makes nightly re-sync of the trailing catch-up window
--    idempotent: re-fetching the same day overwrites that day's row instead
--    of duplicating it.
-- ---------------------------------------------------------------------------
create table if not exists podbean_podcast_daily_downloads (
  podcast_id uuid not null references podcasts (id) on delete cascade,
  stat_date date not null,
  downloads int not null,
  synced_at timestamptz not null default now(),
  primary key (podcast_id, stat_date)
);

create table if not exists podbean_episode_daily_downloads (
  episode_id uuid not null references episodes (id) on delete cascade,
  podcast_id uuid not null references podcasts (id) on delete cascade,
  stat_date date not null,
  downloads int not null,
  synced_at timestamptz not null default now(),
  primary key (episode_id, stat_date)
);

create index if not exists podbean_episode_daily_downloads_podcast_idx on podbean_episode_daily_downloads (podcast_id, stat_date desc);

-- ---------------------------------------------------------------------------
-- 3. Countries / platforms / sources. Podbean's own API returns one
--    aggregate total per call, never a per-day breakdown -- confirmed live,
--    not assumed. So "daily" here means one call per single day (start=end),
--    used going forward from nightly sync; older history (per the approved
--    backfill plan) is stored as coarser one-call-per-month buckets instead
--    of ~2,190 individual day calls. granularity records which kind a row
--    is so the dashboard can tell real daily history apart from a monthly
--    approximation.
-- ---------------------------------------------------------------------------
create table if not exists podbean_dimension_stats (
  id bigint generated always as identity primary key,
  podcast_id uuid not null references podcasts (id) on delete cascade,
  dimension text not null check (dimension in ('country', 'platform', 'source')),
  dimension_key text not null,
  granularity text not null check (granularity in ('day', 'month')),
  bucket_start date not null,
  downloads int not null,
  synced_at timestamptz not null default now()
);

create unique index if not exists podbean_dimension_stats_unique_idx
  on podbean_dimension_stats (podcast_id, dimension, dimension_key, granularity, bucket_start);
create index if not exists podbean_dimension_stats_lookup_idx
  on podbean_dimension_stats (podcast_id, dimension, bucket_start desc);

-- ---------------------------------------------------------------------------
-- 4. Episode engagement (engagementStats/stats). This endpoint has no
--    date-range parameter -- it only returns a cumulative snapshot
--    ('all_time', 'this_month', or 'last_month'), so there is no historical
--    time series to backfill from Podbean's side. What we can do is start
--    capturing a dated snapshot every night going forward, building our own
--    trend over time. stat_date is the day the snapshot was taken.
-- ---------------------------------------------------------------------------
create table if not exists podbean_episode_engagement_daily (
  episode_id uuid not null references episodes (id) on delete cascade,
  podcast_id uuid not null references podcasts (id) on delete cascade,
  stat_date date not null,
  listeners int not null,
  engaged_listeners int not null,
  average_consumption_rate numeric,
  average_consumption_time_seconds int,
  synced_at timestamptz not null default now(),
  primary key (episode_id, stat_date)
);

-- ---------------------------------------------------------------------------
-- RLS: dashboard reads only. All writes go through the service-role client.
-- ---------------------------------------------------------------------------
alter table podbean_podcast_daily_downloads enable row level security;
alter table podbean_episode_daily_downloads enable row level security;
alter table podbean_dimension_stats enable row level security;
alter table podbean_episode_engagement_daily enable row level security;

create policy "authenticated read podbean_podcast_daily_downloads" on podbean_podcast_daily_downloads for select to authenticated using (true);
create policy "authenticated read podbean_episode_daily_downloads" on podbean_episode_daily_downloads for select to authenticated using (true);
create policy "authenticated read podbean_dimension_stats" on podbean_dimension_stats for select to authenticated using (true);
create policy "authenticated read podbean_episode_engagement_daily" on podbean_episode_engagement_daily for select to authenticated using (true);
