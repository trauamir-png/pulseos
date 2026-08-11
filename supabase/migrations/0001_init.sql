-- PulseOS V1 schema: multi-site web analytics.
-- Every analytics table carries site_id so the model scales to many sites from day one.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- sites: tenancy root
-- ---------------------------------------------------------------------------
create table if not exists sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text not null,
  site_key text not null unique default encode(gen_random_bytes(16), 'hex'),
  timezone text not null default 'UTC',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists sites_domain_idx on sites (lower(domain));

-- ---------------------------------------------------------------------------
-- site_conversion_events: which event_names count as a "conversion" per site.
-- Kept as data (not hardcoded) so a future Settings UI can manage it.
-- ---------------------------------------------------------------------------
create table if not exists site_conversion_events (
  site_id uuid not null references sites (id) on delete cascade,
  event_name text not null,
  created_at timestamptz not null default now(),
  primary key (site_id, event_name)
);

-- ---------------------------------------------------------------------------
-- daily_salts: one random salt per UTC day, used to derive visitor_hash.
-- Never exposed to clients. Rotating daily means the same person crossing a
-- day boundary is counted as two anonymous visitors -- an intentional
-- privacy/accuracy trade-off (no persistent cross-session identifier at all).
-- ---------------------------------------------------------------------------
create table if not exists daily_salts (
  day date primary key,
  salt text not null default encode(gen_random_bytes(32), 'hex')
);

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  visitor_hash text not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  entry_pathname text,
  referrer_raw text,
  referrer_domain text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  traffic_source text not null default 'direct',
  device_type text,
  browser text,
  os text,
  current_pathname text,
  is_bot boolean not null default false
);

create index if not exists sessions_site_started_idx on sessions (site_id, started_at desc);
create index if not exists sessions_site_last_seen_idx on sessions (site_id, last_seen_at desc);
create index if not exists sessions_site_visitor_idx on sessions (site_id, visitor_hash);
create index if not exists sessions_site_source_idx on sessions (site_id, traffic_source);

-- ---------------------------------------------------------------------------
-- page_views
-- traffic_source is denormalized from the parent session at insert time so
-- the Sources/Pages dashboards can group without joining sessions.
-- ---------------------------------------------------------------------------
create table if not exists page_views (
  id bigint generated always as identity primary key,
  site_id uuid not null references sites (id) on delete cascade,
  session_id uuid not null references sessions (id) on delete cascade,
  visitor_hash text not null,
  url text not null,
  pathname text not null,
  page_title text,
  referrer_raw text,
  query_params jsonb not null default '{}'::jsonb,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  traffic_source text not null default 'direct',
  is_landing boolean not null default false,
  occurred_at timestamptz not null default now()
);

create index if not exists page_views_site_time_idx on page_views (site_id, occurred_at desc);
create index if not exists page_views_session_time_idx on page_views (session_id, occurred_at);
create index if not exists page_views_site_path_idx on page_views (site_id, pathname);

-- ---------------------------------------------------------------------------
-- events: generic, extensible event tracking (not hardcoded to specific names)
-- ---------------------------------------------------------------------------
create table if not exists events (
  id bigint generated always as identity primary key,
  site_id uuid not null references sites (id) on delete cascade,
  session_id uuid not null references sessions (id) on delete cascade,
  visitor_hash text not null,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  pathname text,
  traffic_source text not null default 'direct',
  is_conversion boolean not null default false,
  occurred_at timestamptz not null default now()
);

create index if not exists events_site_time_idx on events (site_id, occurred_at desc);
create index if not exists events_site_name_idx on events (site_id, event_name);
create index if not exists events_site_conversion_idx on events (site_id, is_conversion) where is_conversion;

-- ---------------------------------------------------------------------------
-- rate_limit_counters: cheap DB-backed throttle for the ingestion endpoint.
-- No external service required.
-- ---------------------------------------------------------------------------
create table if not exists rate_limit_counters (
  site_id uuid not null references sites (id) on delete cascade,
  minute_bucket timestamptz not null,
  request_count int not null default 0,
  primary key (site_id, minute_bucket)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Ingestion API routes use the service_role key (bypasses RLS entirely).
-- The dashboard uses the authenticated user's session; V1 has a single
-- admin, so any authenticated user may read everything and manage sites /
-- conversion event config. daily_salts and rate_limit_counters get RLS
-- enabled with zero policies -- i.e. denied to anon/authenticated, reachable
-- only via the service role.
-- ---------------------------------------------------------------------------
alter table sites enable row level security;
alter table site_conversion_events enable row level security;
alter table sessions enable row level security;
alter table page_views enable row level security;
alter table events enable row level security;
alter table daily_salts enable row level security;
alter table rate_limit_counters enable row level security;

create policy "authenticated read sites" on sites for select to authenticated using (true);
create policy "authenticated manage sites" on sites for insert to authenticated with check (true);
create policy "authenticated update sites" on sites for update to authenticated using (true) with check (true);

create policy "authenticated read conversion events" on site_conversion_events for select to authenticated using (true);
create policy "authenticated manage conversion events" on site_conversion_events for insert to authenticated with check (true);
create policy "authenticated delete conversion events" on site_conversion_events for delete to authenticated using (true);

create policy "authenticated read sessions" on sessions for select to authenticated using (true);
create policy "authenticated read page_views" on page_views for select to authenticated using (true);
create policy "authenticated read events" on events for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Seed: Amir Trau site (fixed id/site_key so the tracker snippet + docs can
-- reference a stable value before the dashboard is used to create sites).
-- ---------------------------------------------------------------------------
insert into sites (id, name, domain, site_key, timezone, active)
values (
  '12361f89-f7d2-4569-933c-23101867a9ec',
  'Amir Trau',
  'amirtrau.co.il',
  'e2ab0420706c6f25f49b8decc2940b3f',
  'Asia/Jerusalem',
  true
)
on conflict (id) do nothing;

insert into site_conversion_events (site_id, event_name)
values ('12361f89-f7d2-4569-933c-23101867a9ec', 'contact_form_submit')
on conflict (site_id, event_name) do nothing;
