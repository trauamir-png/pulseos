-- Panelists chat -- V1.
--
-- Model: PulseOS users holding chat.writers.access for a site (or Admin)
-- write messages from PulseOS. The site's public website is read-only and
-- anonymous -- it never authenticates, and it must never see anything from
-- chat_messages directly.
--
-- Two tables, not one:
--
--   chat_messages         -- source of truth. Readable/writable only by
--                             writers+Admin for that site, same has_permission
--                             gate used everywhere else in this codebase.
--
--   chat_messages_public  -- a denormalized projection containing only the
--                             four fields that are safe for an anonymous
--                             visitor to see (id, site_id, display_name,
--                             body, created_at). Populated solely by the
--                             trigger below; open SELECT to anon.
--
-- Why bother with a second table instead of a "public" RLS policy or a view
-- on chat_messages itself: this feature needs Realtime, and Supabase
-- Realtime's postgres_changes payload is decoded straight from the
-- write-ahead log rather than through a privilege-aware query -- it is not
-- guaranteed to respect column-level restrictions, and it does not support
-- subscribing to views at all. An anon Realtime subscription against
-- chat_messages could therefore leak sender_id regardless of what any SELECT
-- policy said. Publishing a table that physically contains only public
-- columns removes the possibility of that leak rather than relying on a
-- policy to prevent it.

-- ---------------------------------------------------------------------------
-- chat_messages
-- ---------------------------------------------------------------------------
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  sender_id uuid not null references profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) > 0 and char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_site_created_idx on chat_messages (site_id, created_at desc);
create index if not exists chat_messages_sender_idx on chat_messages (sender_id);

alter table chat_messages enable row level security;

create policy "writers and admin read site chat" on chat_messages
  for select to authenticated
  using (public.has_permission(site_id, 'chat.writers.access'));

-- sender_id = auth.uid() is enforced here, not just chosen by the app layer,
-- so a client can never post as another user even by calling the client SDK
-- directly instead of going through the Server Action.
create policy "writers and admin send site chat" on chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.has_permission(site_id, 'chat.writers.access')
  );

-- No update/delete policy: V1 has no edit/delete UI, and RLS denies by
-- default when no policy grants an operation.

-- ---------------------------------------------------------------------------
-- chat_messages_public
-- ---------------------------------------------------------------------------
create table if not exists chat_messages_public (
  id uuid primary key references chat_messages (id) on delete cascade,
  site_id uuid not null references sites (id) on delete cascade,
  display_name text not null,
  body text not null,
  created_at timestamptz not null
);

create index if not exists chat_messages_public_site_created_idx on chat_messages_public (site_id, created_at desc);

alter table chat_messages_public enable row level security;

create policy "anyone reads public chat" on chat_messages_public
  for select to anon, authenticated
  using (true);

-- Deliberately no insert/update/delete policy for anon or authenticated --
-- the only writer is the security definer trigger below. This is the one
-- security definer in this codebase's chat feature (everywhere else follows
-- the security invoker convention from 0012_site_permissions.sql); it exists
-- only so this table can accept zero direct client writes from any role.
create or replace function public.publish_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into chat_messages_public (id, site_id, display_name, body, created_at)
  select new.id, new.site_id, p.display_name, new.body, new.created_at
  from profiles p
  where p.id = new.sender_id;
  return new;
end;
$$;

create trigger chat_messages_publish
  after insert on chat_messages
  for each row execute function public.publish_chat_message();

-- ---------------------------------------------------------------------------
-- Realtime -- publish only the public-safe projection. chat_messages itself
-- is never added to this publication.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table chat_messages_public;
