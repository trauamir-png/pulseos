-- Corrects the Admin bootstrap in 0012_site_permissions.sql, which used the
-- wrong email (trauamir@gmail.com -- the Claude Code account email from
-- system context, not the Supabase Auth login email). The real auth.users
-- row for this project uses amirtrau100@gmail.com. Because the lookup in
-- 0012 matched zero rows, no `profiles` row was created and this migration's
-- effect was silently a no-op -- nothing else was affected: no existing RLS
-- policy changed, and the account's actual login/access was never at risk.
--
-- Idempotent: safe to run even after the equivalent fix has already been
-- applied directly (e.g. via a one-off REST call with the service-role key).
insert into profiles (id, display_name, is_admin)
select id, 'Amir Trau', true
from auth.users
where email = 'amirtrau100@gmail.com'
on conflict (id) do update set is_admin = true;

-- Re-run the created_by backfill now that an Admin profile actually exists
-- (0012's backfill also silently did nothing, for the same reason).
update columns
set created_by = (select id from profiles where is_admin = true order by created_at asc limit 1)
where created_by is null
  and exists (select 1 from profiles where is_admin = true);
