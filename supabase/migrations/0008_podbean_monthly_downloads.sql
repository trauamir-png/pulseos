-- Adds monthly-bucket download history, mirroring the pattern already used
-- by podbean_dimension_stats for countries/platforms/sources.
--
-- Why this is needed: testing the real Podbean API (not documentation --
-- live calls) showed that podcastStats/stats with period=d (true daily
-- downloads) only works for a trailing window of ~90 days ending TODAY --
-- never for a window positioned earlier in history, no matter how narrow.
-- So a full 24-month daily download backfill is not possible; only the
-- trailing ~90 days can ever have real daily numbers. Everything older than
-- that can still be recovered, but only as one-call-per-month totals via
-- period=m (confirmed working for any month within the last 24 months).
--
-- This is purely additive: the existing podbean_podcast_daily_downloads and
-- podbean_episode_daily_downloads tables are untouched and keep storing true
-- daily rows for the trailing window (extended by one more day every night
-- going forward, same as before). These new tables hold the coarser
-- monthly totals for history older than that window can reach.

create table if not exists podbean_podcast_monthly_downloads (
  podcast_id uuid not null references podcasts (id) on delete cascade,
  month_start date not null,
  downloads int not null,
  synced_at timestamptz not null default now(),
  primary key (podcast_id, month_start)
);

create table if not exists podbean_episode_monthly_downloads (
  episode_id uuid not null references episodes (id) on delete cascade,
  podcast_id uuid not null references podcasts (id) on delete cascade,
  month_start date not null,
  downloads int not null,
  synced_at timestamptz not null default now(),
  primary key (episode_id, month_start)
);

create index if not exists podbean_episode_monthly_downloads_podcast_idx on podbean_episode_monthly_downloads (podcast_id, month_start desc);

alter table podbean_podcast_monthly_downloads enable row level security;
alter table podbean_episode_monthly_downloads enable row level security;

create policy "authenticated read podbean_podcast_monthly_downloads" on podbean_podcast_monthly_downloads for select to authenticated using (true);
create policy "authenticated read podbean_episode_monthly_downloads" on podbean_episode_monthly_downloads for select to authenticated using (true);
