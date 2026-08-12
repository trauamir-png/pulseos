-- sites had RLS enabled with select/insert/update policies but no delete
-- policy. Result: an authenticated DELETE on sites silently matched zero
-- rows -- no error, no rows returned -- so the app believed the delete
-- succeeded while the row (and its cascaded children) were never removed.
--
-- Only `sites` needs this: every other table scoped to a site is deleted
-- exclusively via ON DELETE CASCADE from `sites`, and a cascade triggered by
-- a foreign key constraint runs as an internal Postgres action, not a
-- direct DELETE from the app role -- it isn't subject to the child table's
-- own RLS policies.

create policy "authenticated delete sites" on sites for delete to authenticated using (true);
