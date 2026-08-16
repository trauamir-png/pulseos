-- Restricts podcasts.hosting_provider to the fixed set of values the UI can
-- ever produce (see lib/rss/hosting-provider.ts's HOSTING_PROVIDER_OPTIONS),
-- so a typo or ad-hoc value (e.g. "Spotify", "anchor") can never be written
-- and silently fail to match the UI's provider-aware conditionals.
alter table public.podcasts
  add constraint podcasts_hosting_provider_check
  check (
    hosting_provider is null
    or hosting_provider in (
      'spotify_for_podcasters',
      'podbean',
      'buzzsprout',
      'libsyn',
      'captivate',
      'transistor',
      'simplecast',
      'other'
    )
  );
