-- Fan Match Voting: for every finished Maccabi match, fans vote for
-- מצטיין המשחק (win/draw) or מאכזב המשחק (loss). Mirrors match_panel_picks'
-- architecture deliberately (see 0019_match_panel_picks.sql): `home_score`/
-- `away_score` are stored exactly as displayed on the source site together
-- with `is_home`, and the vote type/label is never stored here -- it's always
-- derived at read time from is_home/home_score/away_score/is_final via the
-- same lib/content/match-result.ts used by match_panel_picks (win/draw ->
-- "best", loss -> "disappointing"; same mapping, reused, not reinvented).
--
-- `external_fixture_id` is not a foreign key, for the same reason as
-- match_panel_picks: PulseOS has no fixtures table of its own.
create table if not exists match_fan_polls (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  external_fixture_id text not null,
  match_date date not null,
  opponent_name text not null,
  competition text,
  is_home boolean not null,
  home_score smallint,
  away_score smallint,
  is_final boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  opened_at timestamptz,
  closed_at timestamptz,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, external_fixture_id)
);

create index if not exists match_fan_polls_site_date_idx on match_fan_polls (site_id, match_date desc);

alter table match_fan_polls enable row level security;

create policy "authenticated select match_fan_polls" on match_fan_polls for select to authenticated using (true);
create policy "authenticated insert match_fan_polls" on match_fan_polls for insert to authenticated with check (true);
create policy "authenticated update match_fan_polls" on match_fan_polls for update to authenticated using (true) with check (true);
create policy "authenticated delete match_fan_polls" on match_fan_polls for delete to authenticated using (true);

-- Public visibility boundary: a draft poll (candidates still being assembled,
-- result not yet final) is never readable by anon -- only once a manager has
-- opened it (or it's since closed) does it become discoverable at all. The
-- public GET route (app/api/content/fan-voting/route.ts) reads through this
-- policy with a session-less anon client, so this policy is a real
-- enforcement boundary, not just defense-in-depth.
create policy "anon read open or closed match_fan_polls" on match_fan_polls for select to anon
  using (status in ('open', 'closed'));

-- Candidate snapshot: intentionally denormalized/frozen at the time a poll is
-- opened (see PHASE 4 of the spec this migration implements) -- a later
-- change to a player's name/image/slug elsewhere must never alter an
-- already-open or historical poll. One candidate per player per poll.
create table if not exists match_fan_poll_candidates (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references match_fan_polls (id) on delete cascade,
  player_id text not null,
  slug text,
  player_name text not null,
  profile_url text,
  image_url text,
  shirt_number smallint,
  starter boolean not null default false,
  entered_as_substitute boolean not null default false,
  entry_minute smallint,
  created_at timestamptz not null default now(),
  unique (poll_id, player_id),
  unique (id, poll_id)
);

create index if not exists match_fan_poll_candidates_poll_idx on match_fan_poll_candidates (poll_id);

alter table match_fan_poll_candidates enable row level security;

create policy "authenticated select match_fan_poll_candidates" on match_fan_poll_candidates for select to authenticated using (true);
create policy "authenticated insert match_fan_poll_candidates" on match_fan_poll_candidates for insert to authenticated with check (true);
create policy "authenticated update match_fan_poll_candidates" on match_fan_poll_candidates for update to authenticated using (true) with check (true);
create policy "authenticated delete match_fan_poll_candidates" on match_fan_poll_candidates for delete to authenticated using (true);

create policy "anon read open or closed match_fan_poll_candidates" on match_fan_poll_candidates for select to anon
  using (exists (select 1 from match_fan_polls p where p.id = poll_id and p.status in ('open', 'closed')));

-- Anonymous fan votes. `voter_hash` is a one-way HMAC of an opaque token
-- Hakol's public site generates/keeps in a first-party cookie -- never the
-- raw token, never an IP address, never any fingerprint. One row per
-- (poll_id, voter_hash): a vote change updates this same row (candidate_id +
-- updated_at), it never inserts a second row -- see lib/content/fan-vote-submit.ts.
--
-- Deliberately stricter than match_fan_polls/match_fan_poll_candidates above:
-- NO anon or authenticated policies at all. Raw votes must never be readable
-- by anon (nothing about who voted for whom is public), and dashboard
-- "inspect results" also never reads this table directly -- everything goes
-- through the match_fan_poll_results(...) aggregation function below, which
-- only the service-role key can call. Only that service-role key (used
-- exclusively by trusted server-side routes, never the browser) can read or
-- write this table at all.
create table if not exists match_fan_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references match_fan_polls (id) on delete cascade,
  candidate_id uuid not null,
  voter_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (poll_id, voter_hash),
  foreign key (candidate_id, poll_id) references match_fan_poll_candidates (id, poll_id) on delete cascade
);

create index if not exists match_fan_votes_poll_candidate_idx on match_fan_votes (poll_id, candidate_id);

alter table match_fan_votes enable row level security;

-- Server-side vote aggregation, mirroring increment_rate_limit's precedent
-- (supabase/migrations/0002_rate_limit_fn.sql): a security definer function
-- granted only to service_role, so percentage/vote-count math always happens
-- in the database, never by fetching raw vote rows into the browser or into
-- application code.
create or replace function match_fan_poll_results(p_poll_id uuid)
returns table (candidate_id uuid, vote_count bigint)
language sql
security definer
set search_path = public
as $$
  select candidate_id, count(*)::bigint as vote_count
  from match_fan_votes
  where poll_id = p_poll_id
  group by candidate_id;
$$;

revoke all on function match_fan_poll_results(uuid) from public;
grant execute on function match_fan_poll_results(uuid) to service_role;

insert into permission_definitions (key, category, label, sort_order) values
  ('content.match_voting.view', 'Content', 'View Fan Match Voting', 185),
  ('content.match_voting.manage', 'Content', 'Manage Fan Match Voting', 186)
on conflict (key) do nothing;
