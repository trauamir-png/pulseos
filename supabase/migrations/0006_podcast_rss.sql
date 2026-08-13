-- Podcast RSS Import & Sync.
--
-- 1. New columns needed to store what an RSS feed provides that the existing
--    schema doesn't already have a home for. Everything else (rss_url,
--    website_url, episode_number, audio_url, page_url, spotify/apple/
--    youtube_url) already existed from Podcast Analytics V1 and is reused
--    as-is.
alter table podcasts add column if not exists language text;
alter table podcasts add column if not exists author text;
alter table podcasts add column if not exists rss_last_synced_at timestamptz;
alter table podcasts add column if not exists rss_last_sync_status text;
alter table podcasts add column if not exists rss_last_error text;

alter table episodes add column if not exists rss_guid text;
alter table episodes add column if not exists season_number int;
alter table episodes add column if not exists explicit boolean;

-- 2. De-dup guard: one row per (podcast, rss_guid). The app always computes
--    a value for rss_guid -- the feed's own <guid> when present, otherwise a
--    stable fallback (enclosure URL, or title+date) -- so this index is what
--    makes "Connect" and "Sync RSS" idempotent: re-importing the same feed
--    updates existing rows instead of creating duplicates.
create unique index if not exists episodes_podcast_guid_idx on episodes (podcast_id, rss_guid) where rss_guid is not null;

-- 3. podcasts/episodes had RLS enabled with only a `select` policy (0003).
--    Same silent-failure shape already fixed for `sites` in 0005: an
--    authenticated insert/update with no matching policy fails silently
--    (0 rows, no error) instead of erroring, so Connect/Sync would look
--    successful while writing nothing. Read access is unchanged.
create policy "authenticated insert podcasts" on podcasts for insert to authenticated with check (true);
create policy "authenticated update podcasts" on podcasts for update to authenticated using (true) with check (true);
create policy "authenticated insert episodes" on episodes for insert to authenticated with check (true);
create policy "authenticated update episodes" on episodes for update to authenticated using (true) with check (true);
