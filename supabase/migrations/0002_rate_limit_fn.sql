-- Atomic upsert-and-increment for the per-site, per-minute rate limit counter.
-- SECURITY DEFINER so it runs with the function owner's privileges regardless
-- of caller (only ever called by the service-role ingestion client anyway).
create or replace function increment_rate_limit(p_site_id uuid, p_minute_bucket timestamptz)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into rate_limit_counters (site_id, minute_bucket, request_count)
  values (p_site_id, p_minute_bucket, 1)
  on conflict (site_id, minute_bucket)
  do update set request_count = rate_limit_counters.request_count + 1
  returning request_count into v_count;

  return v_count;
end;
$$;

revoke all on function increment_rate_limit(uuid, timestamptz) from public;
grant execute on function increment_rate_limit(uuid, timestamptz) to service_role;
