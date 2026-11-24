-- daily_salts previously rotated on a single global UTC calendar day, so a
-- visitor who opened the site at 23:50 and again at 00:10 local time (still
-- the same UTC day) was counted once, even though it was a new local day for
-- them -- and conversely two different sites in different timezones shared
-- the same UTC-day salt even though "today" started at different instants
-- for each. Widening the key to (day, timezone) lets each site's salt roll
-- over on ITS configured IANA timezone's local midnight (see
-- lib/analytics/visitor-hash.ts), while still sharing one salt across sites
-- that happen to use the same timezone.
--
-- Existing rows are backfilled as timezone 'UTC' -- accurate, since every
-- salt issued so far *was* a UTC-day salt -- so no historical salt or the
-- visitor_hash values already derived from it are reinterpreted or lost.
alter table daily_salts add column if not exists timezone text not null default 'UTC';

alter table daily_salts drop constraint if exists daily_salts_pkey;
alter table daily_salts add primary key (day, timezone);
