-- Panel Pick: the podcast panel's Best Player / Disappointing Player
-- selection for a specific Maccabi match. `home_score`/`away_score` are
-- stored exactly as displayed on the source site (home team's score, away
-- team's score) together with `is_home`, rather than pre-mapped into a
-- "Maccabi score" -- the win/loss/draw derivation (lib/content/match-result.ts)
-- does that mapping itself from these three fields, so display order can
-- never be misread as the result. `pickType`/label are deliberately never
-- stored here; they're always derived at read time from is_home/home_score/
-- away_score/is_final.
--
-- `external_fixture_id` is not a foreign key: PulseOS has no fixtures table
-- of its own -- Hakol scrapes fixtures live from maccabi-tlv.co.il with its
-- own slug as an id. This column carries that same slug (entered by the
-- editor) so a future public API consumer can join on it directly instead of
-- fuzzy-matching by date/opponent/score text.
create table if not exists match_panel_picks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  external_fixture_id text not null,
  match_date date not null,
  opponent_name text not null,
  competition text,
  is_home boolean not null,
  home_score smallint,
  away_score smallint,
  is_final boolean not null default true,
  player_name text not null,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, external_fixture_id)
);

create index if not exists match_panel_picks_site_date_idx on match_panel_picks (site_id, match_date desc);

alter table match_panel_picks enable row level security;

create policy "authenticated select match_panel_picks" on match_panel_picks for select to authenticated using (true);
create policy "authenticated insert match_panel_picks" on match_panel_picks for insert to authenticated with check (true);
create policy "authenticated update match_panel_picks" on match_panel_picks for update to authenticated using (true) with check (true);
create policy "authenticated delete match_panel_picks" on match_panel_picks for delete to authenticated using (true);

-- Public visibility boundary: only finished matches with both scores
-- recorded are readable by anon, so a not-yet-final row can never be
-- published prematurely even if the app layer has a bug.
create policy "anon read final match_panel_picks" on match_panel_picks for select to anon
  using (is_final = true and home_score is not null and away_score is not null);

insert into permission_definitions (key, category, label, sort_order) values
  ('content.match_panel_picks.view', 'Content', 'View Panel Picks', 183),
  ('content.match_panel_picks.manage', 'Content', 'Manage Panel Picks', 184)
on conflict (key) do nothing;
