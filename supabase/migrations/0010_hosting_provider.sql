-- Podcast hosting provider.
--
-- Problem: podcasts.rss_url already works for any RSS host (that part is
-- provider-independent, see lib/rss/parse.ts), but two other things
-- silently assumed every podcast was hosted on Podbean:
--   1. The dashboard UI (episodes table, episode detail, podcast overview)
--      always rendered Podbean-branded columns/sections, regardless of
--      whether that podcast actually has a Podbean connection.
--   2. The nightly cron (app/api/cron/podbean-sync) looped over *every*
--      active podcast and called Podbean's account-scoped GET /podcast on
--      each one -- since that endpoint returns "the" podcast tied to the
--      OAuth app (not a specific feed), running it against a podcast that
--      was never meant to be Podbean-connected would silently overwrite
--      that podcast's podbean_podcast_id with the wrong show's identity.
--
-- Fix: an explicit, stored hosting_provider per podcast, so both the UI and
-- the cron can ask "is this podcast actually on Podbean?" instead of
-- assuming yes for all of them.
alter table podcasts add column if not exists hosting_provider text;

-- Backfill existing rows from their rss_url hostname, using the same
-- hostname table as lib/rss/hosting-provider.ts's detectHostingProvider().
update podcasts
set hosting_provider = case
  when rss_url ilike '%podbean.com%' then 'podbean'
  when rss_url ilike '%anchor.fm%' or rss_url ilike '%spotifycreators%' or rss_url ilike '%spotifyforpodcasters%' then 'spotify_for_podcasters'
  when rss_url ilike '%buzzsprout.com%' then 'buzzsprout'
  when rss_url ilike '%libsyn.com%' then 'libsyn'
  when rss_url ilike '%captivate.fm%' then 'captivate'
  when rss_url ilike '%transistor.fm%' then 'transistor'
  when rss_url ilike '%simplecast.com%' then 'simplecast'
  when rss_url is not null then 'other'
  else null
end
where hosting_provider is null;

-- Belt-and-suspenders: a podcast that already has a podbean_podcast_id
-- mapped (from a prior Podbean OAuth sync) is Podbean, regardless of what
-- its rss_url hostname parsed to.
update podcasts set hosting_provider = 'podbean' where podbean_podcast_id is not null and hosting_provider is distinct from 'podbean';
