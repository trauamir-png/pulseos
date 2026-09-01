-- Fixes silent analytics truncation: this hosted Supabase project enforces a
-- PostgREST `max-rows` cap of 1000 on every row-returning REST query,
-- regardless of any client-requested `.limit(n)`. lib/dashboard/queries.ts
-- previously fetched raw sessions/page_views/events rows into Next.js and
-- counted/deduped them with JS Set/Map -- once a site passed 1000 rows in a
-- range, every aggregate (Sessions, Visitors, per-source/page/event
-- breakdowns, timeseries buckets) silently read from an arbitrary 1000-row
-- sample instead of the true data, with no error surfaced anywhere. Empirically
-- confirmed against production: a range with 1977 real sessions returned
-- exactly 1000 rows from `.select("visitor_hash").limit(50000)`, and the same
-- 1000 with no `.limit()` at all.
--
-- Fix: move every count/DISTINCT/GROUP BY into Postgres. `{count: "exact",
-- head: true}` requests (Page Views total, Events total) were already
-- immune to the cap -- they return a header count, not a row body -- and are
-- left unchanged. Each function here returns a single `jsonb` value (one
-- object or one array of already-aggregated rows), never a raw per-row
-- SETOF/TABLE result, so the API response itself can never hit the same
-- row-count cap again even at 100,000+ underlying sessions/page views.
--
-- Visitors semantics are unchanged: visitor_hash already rotates one identity
-- per site-local calendar day (see lib/analytics/visitor-hash.ts), so a plain
-- COUNT(DISTINCT visitor_hash) over any range is exactly the existing
-- daily-unique-visitor model, computed correctly instead of over a truncated
-- sample.
--
-- security invoker (not definer): sessions/page_views/events RLS already
-- grants blanket `to authenticated using (true)` read access (0001_init.sql)
-- -- all real site-scoping and permission gating happens in application code
-- (requireSiteAccess/hasPermission) before these ever get called, exactly as
-- it does today for the raw-row queries these replace. Running as invoker
-- introduces no new privilege boundary and no new security surface.

create or replace function public.get_analytics_summary(
  p_site_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with sess as (
    select count(*) as sessions, count(distinct visitor_hash) as visitors
    from sessions
    where site_id = p_site_id and started_at >= p_from and started_at <= p_to
  ),
  pv as (
    select count(*) as page_views
    from page_views
    where site_id = p_site_id and occurred_at >= p_from and occurred_at <= p_to
  ),
  ev as (
    select count(*) as events
    from events
    where site_id = p_site_id and occurred_at >= p_from and occurred_at <= p_to
  ),
  conv as (
    select count(distinct session_id) as conversions
    from events
    where site_id = p_site_id and is_conversion = true
      and occurred_at >= p_from and occurred_at <= p_to
  )
  select jsonb_build_object(
    'visitors', sess.visitors,
    'sessions', sess.sessions,
    'pageViews', pv.page_views,
    'events', ev.events,
    'conversions', conv.conversions,
    'conversionRate', case when sess.sessions > 0 then (conv.conversions::numeric / sess.sessions) * 100 else 0 end
  )
  from sess, pv, ev, conv;
$$;

-- p_granularity: 'hour' | 'day'. p_metric: 'visitors' | 'sessions' | 'pageviews'.
-- Buckets are built in the site's local wall-clock time (p_timezone, an IANA
-- name) via `AT TIME ZONE`, matching the previous date-fns-tz
-- toZonedTime/fromZonedTime bucketing exactly, then aggregated with a single
-- GROUP BY per source table (not a per-bucket correlated scan) so cost stays
-- O(rows) rather than O(buckets * rows).
create or replace function public.get_analytics_timeseries(
  p_site_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_timezone text,
  p_granularity text,
  p_metric text
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with step as (
    select case p_granularity when 'hour' then interval '1 hour' else interval '1 day' end as v
  ),
  buckets as (
    select gs as local_bucket,
      case p_granularity when 'hour' then to_char(gs, 'HH24:MI') else to_char(gs, 'FMMon FMDD') end as label
    from generate_series(
      date_trunc(p_granularity, p_from at time zone p_timezone),
      date_trunc(p_granularity, p_to at time zone p_timezone),
      (select v from step)
    ) as gs
  ),
  sess_bucketed as (
    select date_trunc(p_granularity, started_at at time zone p_timezone) as local_bucket, visitor_hash
    from sessions
    where site_id = p_site_id and started_at >= p_from and started_at <= p_to
  ),
  sess_agg as (
    select local_bucket, count(*) as sessions_count, count(distinct visitor_hash) as visitors_count
    from sess_bucketed
    group by local_bucket
  ),
  pv_agg as (
    select date_trunc(p_granularity, occurred_at at time zone p_timezone) as local_bucket, count(*) as pv_count
    from page_views
    where site_id = p_site_id and occurred_at >= p_from and occurred_at <= p_to
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'label', b.label,
      'value', case p_metric
        when 'pageviews' then coalesce(pa.pv_count, 0)
        when 'sessions' then coalesce(sa.sessions_count, 0)
        else coalesce(sa.visitors_count, 0)
      end
    ) order by b.local_bucket), '[]'::jsonb)
  from buckets b
  left join sess_agg sa on sa.local_bucket = b.local_bucket
  left join pv_agg pa on pa.local_bucket = b.local_bucket;
$$;

-- Union of traffic_source across all three tables (each filtered by its own
-- timestamp column, matching the previous JS behavior of seeding the map
-- from whichever of sessions/page_views/conversions mentioned a source).
create or replace function public.get_analytics_sources(
  p_site_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with sess_agg as (
    select traffic_source, count(*) as sessions, count(distinct visitor_hash) as visitors
    from sessions
    where site_id = p_site_id and started_at >= p_from and started_at <= p_to
    group by traffic_source
  ),
  pv_agg as (
    select traffic_source, count(*) as page_views
    from page_views
    where site_id = p_site_id and occurred_at >= p_from and occurred_at <= p_to
    group by traffic_source
  ),
  conv_agg as (
    select traffic_source, count(distinct session_id) as conversions
    from events
    where site_id = p_site_id and is_conversion = true
      and occurred_at >= p_from and occurred_at <= p_to
    group by traffic_source
  ),
  all_sources as (
    select traffic_source from sess_agg
    union
    select traffic_source from pv_agg
    union
    select traffic_source from conv_agg
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'source', s.traffic_source,
      'visitors', coalesce(sa.visitors, 0),
      'sessions', coalesce(sa.sessions, 0),
      'pageViews', coalesce(pa.page_views, 0),
      'conversions', coalesce(ca.conversions, 0),
      'conversionRate', case when coalesce(sa.sessions, 0) > 0 then (coalesce(ca.conversions, 0)::numeric / sa.sessions) * 100 else 0 end
    ) order by coalesce(sa.sessions, 0) desc), '[]'::jsonb)
  from all_sources s
  left join sess_agg sa on sa.traffic_source = s.traffic_source
  left join pv_agg pa on pa.traffic_source = s.traffic_source
  left join conv_agg ca on ca.traffic_source = s.traffic_source;
$$;

-- Entrances/exits/engagement reproduce the previous per-session, in-window
-- computation exactly: "exits" is the last page_view per session within
-- [p_from, p_to] (not the session's true last-ever view), and engagement is
-- the gap to the *next* page_view in the same session, attributed to the
-- earlier page, counted only when 0 < gap <= 1800s -- identical bounds to
-- the previous JS reduction.
create or replace function public.get_analytics_pages(
  p_site_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with pv as (
    select
      pathname,
      visitor_hash,
      session_id,
      is_landing,
      occurred_at,
      lead(occurred_at) over (partition by session_id order by occurred_at) as next_occurred_at,
      row_number() over (partition by session_id order by occurred_at desc) as rn_desc
    from page_views
    where site_id = p_site_id and occurred_at >= p_from and occurred_at <= p_to
  ),
  engagement as (
    select pathname, extract(epoch from (next_occurred_at - occurred_at)) as delta_seconds
    from pv
    where next_occurred_at is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'pathname', agg.pathname,
      'views', agg.views,
      'uniqueVisitors', agg.unique_visitors,
      'entrances', agg.entrances,
      'exits', agg.exits,
      'avgEngagementSeconds', agg.avg_engagement_seconds
    ) order by agg.views desc), '[]'::jsonb)
  from (
    select
      pv.pathname,
      count(*) as views,
      count(distinct pv.visitor_hash) as unique_visitors,
      count(*) filter (where pv.is_landing) as entrances,
      count(*) filter (where pv.rn_desc = 1) as exits,
      (
        select round(avg(e.delta_seconds)::numeric)::int
        from engagement e
        where e.pathname = pv.pathname and e.delta_seconds > 0 and e.delta_seconds <= 1800
      ) as avg_engagement_seconds
    from pv
    group by pv.pathname
  ) agg;
$$;

create or replace function public.get_analytics_events(
  p_site_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'eventName', event_name,
      'count', cnt,
      'uniqueVisitors', unique_visitors,
      'conversions', conversions
    ) order by cnt desc), '[]'::jsonb)
  from (
    select
      event_name,
      count(*) as cnt,
      count(distinct visitor_hash) as unique_visitors,
      count(*) filter (where is_conversion) as conversions
    from events
    where site_id = p_site_id and occurred_at >= p_from and occurred_at <= p_to
    group by event_name
  ) t;
$$;

-- Single JSON object carrying all four pieces of one event's detail view.
-- topPages/topSources keep the existing top-10 cutoff (already present in
-- the previous JS .slice(0, 10) -- not a new truncation introduced here).
create or replace function public.get_analytics_event_detail(
  p_site_id uuid,
  p_event_name text,
  p_from timestamptz,
  p_to timestamptz,
  p_timezone text,
  p_granularity text
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with ev as (
    select occurred_at, pathname, traffic_source, properties
    from events
    where site_id = p_site_id and event_name = p_event_name
      and occurred_at >= p_from and occurred_at <= p_to
  ),
  step as (
    select case p_granularity when 'hour' then interval '1 hour' else interval '1 day' end as v
  ),
  bucket_counts as (
    select date_trunc(p_granularity, occurred_at at time zone p_timezone) as local_bucket, count(*) as cnt
    from ev
    group by 1
  ),
  buckets as (
    select gs as local_bucket,
      case p_granularity when 'hour' then to_char(gs, 'HH24:MI') else to_char(gs, 'FMMon FMDD') end as label
    from generate_series(
      date_trunc(p_granularity, p_from at time zone p_timezone),
      date_trunc(p_granularity, p_to at time zone p_timezone),
      (select v from step)
    ) as gs
  ),
  timeseries as (
    select coalesce(jsonb_agg(jsonb_build_object('label', b.label, 'value', coalesce(bc.cnt, 0)) order by b.local_bucket), '[]'::jsonb) as v
    from buckets b
    left join bucket_counts bc on bc.local_bucket = b.local_bucket
  ),
  top_pages as (
    select coalesce(jsonb_agg(jsonb_build_object('pathname', pathname, 'count', cnt) order by cnt desc), '[]'::jsonb) as v
    from (
      select coalesce(pathname, '(unknown)') as pathname, count(*) as cnt
      from ev group by 1 order by cnt desc limit 10
    ) t
  ),
  top_sources as (
    select coalesce(jsonb_agg(jsonb_build_object('source', traffic_source, 'count', cnt) order by cnt desc), '[]'::jsonb) as v
    from (
      select traffic_source, count(*) as cnt
      from ev group by 1 order by cnt desc limit 10
    ) t
  ),
  recent_props as (
    select coalesce(jsonb_agg(jsonb_build_object('properties', properties, 'occurredAt', occurred_at) order by occurred_at desc), '[]'::jsonb) as v
    from (
      select properties, occurred_at
      from ev
      where properties is not null and properties <> '{}'::jsonb
      order by occurred_at desc
      limit 10
    ) t
  )
  select jsonb_build_object(
    'timeseries', (select v from timeseries),
    'topPages', (select v from top_pages),
    'topSources', (select v from top_sources),
    'recentProperties', (select v from recent_props)
  );
$$;

-- Postgres grants EXECUTE on every new function to PUBLIC by default; revoke
-- that explicitly so only the dashboard's own authenticated role can call
-- these, rather than relying on RLS alone to make an anon call harmless.
revoke execute on function public.get_analytics_summary(uuid, timestamptz, timestamptz) from public;
revoke execute on function public.get_analytics_timeseries(uuid, timestamptz, timestamptz, text, text, text) from public;
revoke execute on function public.get_analytics_sources(uuid, timestamptz, timestamptz) from public;
revoke execute on function public.get_analytics_pages(uuid, timestamptz, timestamptz) from public;
revoke execute on function public.get_analytics_events(uuid, timestamptz, timestamptz) from public;
revoke execute on function public.get_analytics_event_detail(uuid, text, timestamptz, timestamptz, text, text) from public;

grant execute on function public.get_analytics_summary(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.get_analytics_timeseries(uuid, timestamptz, timestamptz, text, text, text) to authenticated;
grant execute on function public.get_analytics_sources(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.get_analytics_pages(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.get_analytics_events(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.get_analytics_event_detail(uuid, text, timestamptz, timestamptz, text, text) to authenticated;
