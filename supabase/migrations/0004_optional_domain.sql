-- Domain becomes optional on sites: podcast-only sites don't have a web
-- domain to track. Web Analytics still requires a domain -- enforced in the
-- application layer (toggleSiteModule), not the database, since that check
-- needs to read site_modules alongside sites.
--
-- The existing unique index on lower(domain) is untouched: Postgres unique
-- indexes never treat NULL as equal to NULL, so any number of domain-less
-- sites can coexist.

alter table sites alter column domain drop not null;
