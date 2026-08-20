-- Panelist profile photos.
--
-- profiles.avatar_url is the source of truth (nullable, additive -- every
-- existing row gets NULL, exactly like must_change_password in 0014). Not a
-- media_assets FK like authors.profile_image_id: media_assets.site_id is
-- NOT NULL (0009_content_management.sql), and a profile avatar belongs to
-- the person, not to any one site -- forcing a site_id onto it would be
-- wrong for a user with memberships on multiple sites, or none. The
-- content-media Storage bucket is still reused (no new bucket): uploads go
-- through the service-role client only (see app/(dashboard)/account/actions.ts),
-- the same pattern profiles writes already use everywhere in this codebase
-- (0012_site_permissions.sql: no INSERT/UPDATE policy for `authenticated` on
-- profiles at all), so no new Storage policy is needed either.
alter table profiles add column if not exists avatar_url text;

-- chat_messages_public.avatar_url is a denormalized snapshot, same as
-- display_name already is -- populated by publish_chat_message() below at
-- send time. Historical messages are kept current (not frozen to whatever
-- avatar existed when sent) via the sync trigger further down, so a
-- panelist's already-published messages pick up their new photo instead of
-- staying pinned to the old one.
alter table chat_messages_public add column if not exists avatar_url text;

create or replace function public.publish_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into chat_messages_public (id, site_id, display_name, avatar_url, body, created_at)
  select new.id, new.site_id, p.display_name, p.avatar_url, new.body, new.created_at
  from profiles p
  where p.id = new.sender_id;
  return new;
end;
$$;

-- Propagates a changed avatar to every historical public chat row for that
-- user, across every site -- joining through chat_messages (private,
-- sender_id-bearing) inside this SECURITY DEFINER function only. sender_id
-- itself is never added to chat_messages_public and never returned to any
-- caller; this join happens entirely server-side, the same privilege
-- boundary publish_chat_message() already relies on.
create or replace function public.sync_chat_avatar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update chat_messages_public pub
  set avatar_url = new.avatar_url
  from chat_messages cm
  where cm.id = pub.id
    and cm.sender_id = new.id;
  return new;
end;
$$;

create trigger profiles_sync_chat_avatar
  after update of avatar_url on profiles
  for each row
  when (old.avatar_url is distinct from new.avatar_url)
  execute function public.sync_chat_avatar();

-- Realtime compatibility: chat_messages_public was added to the
-- supabase_realtime publication with no WITH (publish = ...) restriction in
-- 0016_chat_messages.sql, so UPDATE events (fired by the trigger above) are
-- already included alongside INSERT/DELETE -- no publication change needed.
-- REPLICA IDENTITY FULL was already set in 0017_chat_message_delete.sql and
-- applies to every operation on the table, so UPDATE payloads carry the full
-- row (including site_id, needed for the site_id=eq.<uuid> Realtime filter)
-- exactly like INSERT/DELETE payloads already do.
