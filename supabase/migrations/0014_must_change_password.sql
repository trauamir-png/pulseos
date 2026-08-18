-- Adds the first-login "must change temporary password" flag to profiles.
-- Defaults to false so every existing row -- including the Admin account and
-- everyone who already completed onboarding -- is left untouched with zero
-- backfill needed. Only the temp-password user-creation flow ever writes
-- true; the change-password flow is the only thing that ever clears it.
alter table profiles
  add column if not exists must_change_password boolean not null default false;
