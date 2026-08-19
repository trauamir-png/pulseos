-- Chat message deletion -- adds DELETE authorization to chat_messages and
-- makes the chat_messages_public projection + Hakol's Realtime feed follow.
--
-- "Editor" investigation (see lib/auth/permission-definitions.ts and
-- 0012_site_permissions.sql): PulseOS has no stored Editor role or `role`
-- column anywhere -- role presets (owner/editor/writer) are a UI-only
-- convenience that pre-checks a bundle of checkboxes when a membership is
-- created; the database only ever stores/checks the resulting granular
-- membership_permissions rows via has_permission(site_id, key). So this
-- migration does not invent a new authorization mechanism -- it adds one new
-- granular permission key, exactly the same way chat.writers.access itself
-- was added in 0016 for this same feature, and wires it into the existing
-- "editor" preset in permission-definitions.ts. Global Admin needs no
-- special-case: has_permission() already short-circuits true for is_admin()
-- regardless of which permission key is asked about, same as every other
-- permission check in this codebase.
insert into permission_definitions (key, category, label, sort_order) values
  ('chat.messages.delete_any', 'Collaboration', 'Delete Any Chat Message', 195)
on conflict (key) do nothing;

-- Own message (writer, currently holding chat.writers.access) OR any message
-- on a site where the caller holds chat.messages.delete_any (Editor preset,
-- or Admin via has_permission's built-in is_admin bypass). Anon has no
-- policy at all here (RLS denies by default), and authenticated users who
-- match neither branch are denied too.
create policy "writers delete own; delete_any deletes any" on chat_messages
  for delete to authenticated
  using (
    (sender_id = auth.uid() and public.has_permission(site_id, 'chat.writers.access'))
    or public.has_permission(site_id, 'chat.messages.delete_any')
  );

-- chat_messages_public.id already has `references chat_messages(id) on
-- delete cascade` (0016), so deleting a chat_messages row automatically
-- deletes its public projection row -- no new trigger needed for Part 4.

-- Postgres only includes primary-key columns in a DELETE's WAL "old record"
-- under the default REPLICA IDENTITY, so a plain DELETE on
-- chat_messages_public would arrive at Realtime subscribers with just `id`
-- -- not site_id -- and a `site_id=eq.<uuid>` postgres_changes filter can't
-- match a payload that doesn't carry site_id. REPLICA IDENTITY FULL makes
-- Postgres log the entire old row on DELETE, so the filter (and the
-- client's own site check) keeps working exactly like it does for INSERT,
-- without exposing anything beyond what this table already exposes to anon.
alter table chat_messages_public replica identity full;
