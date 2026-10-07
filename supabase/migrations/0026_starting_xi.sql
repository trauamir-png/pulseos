-- "בחירת ה-11" (Starting XI fan voting) -- a PulseOS-side read model fed by a
-- one-way webhook push from hakol-mehayatzia (see
-- app/api/integrations/hakol/starting-xi/route.ts). Mirrors match_fan_polls'
-- parent/child shape (0020_match_fan_voting.sql) deliberately: one snapshot
-- row per fixture, one child row per player. Unlike match_fan_polls there is
-- no PulseOS-side lifecycle -- open/closed/unavailable is decided entirely by
-- Hakol's own voting window and sent as `voting_status` on every push -- and
-- no dashboard-side mutation at all. This is a pure read model: only a SELECT
-- policy exists for `authenticated`; every write comes from the webhook's
-- service-role client, which bypasses RLS.
--
-- Deliberately never stores voter_token, cookies, or any device/browser
-- identifier -- only the already-aggregated counts/percentages Hakol computed
-- from its own hakol-staging submissions table, which PulseOS never reads
-- directly.
create table if not exists starting_xi_snapshots (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  external_fixture_id text not null,
  opponent_name text not null,
  kickoff_at timestamptz not null,
  lock_at timestamptz not null,
  voting_status text not null default 'unavailable' check (voting_status in ('open', 'closed', 'unavailable')),
  total_submissions integer not null default 0 check (total_submissions >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, external_fixture_id)
);

create index if not exists starting_xi_snapshots_site_kickoff_idx on starting_xi_snapshots (site_id, kickoff_at desc);

alter table starting_xi_snapshots enable row level security;

create policy "authenticated select starting_xi_snapshots" on starting_xi_snapshots for select to authenticated using (true);

-- Per-player result row. Never deleted on a re-push (see the route) -- a
-- player who drops out of the current squad between pushes keeps their
-- historical row, with is_current_squad flipped to false by Hakol's own
-- payload, rather than being purged. One row per player per snapshot.
create table if not exists starting_xi_player_results (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references starting_xi_snapshots (id) on delete cascade,
  player_id text not null,
  name text not null,
  shirt_number smallint,
  position text,
  image_url text,
  selection_count integer not null default 0 check (selection_count >= 0),
  selection_percentage numeric not null default 0 check (selection_percentage >= 0 and selection_percentage <= 100),
  is_current_squad boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (snapshot_id, player_id)
);

create index if not exists starting_xi_player_results_snapshot_idx on starting_xi_player_results (snapshot_id);

alter table starting_xi_player_results enable row level security;

create policy "authenticated select starting_xi_player_results" on starting_xi_player_results for select to authenticated using (true);

insert into permission_definitions (key, category, label, sort_order) values
  ('content.starting_xi.view', 'Content', 'View Starting XI', 191)
on conflict (key) do nothing;
