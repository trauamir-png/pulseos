import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getEventDetail, getEventsBreakdown, getPagesBreakdown, getSourcesBreakdown, getSummary, getTimeseries } from "@/lib/dashboard/queries";

/**
 * These are unit tests of the queries.ts -> RPC wrapper contract against a
 * mocked Supabase client: correct RPC name/args, correct pass-through of the
 * DB's result, and safe defaults when the DB returns nothing. They are NOT
 * integration tests of the aggregation SQL itself in
 * supabase/migrations/0025_dashboard_analytics_aggregation_rpcs.sql -- this
 * repo has no linked local Postgres/Supabase instance to run those against
 * (see lib/auth/permissions.test.ts for the same limitation). The actual
 * row-cap fix (Sessions/Visitors no longer truncated at 1000 rows, 7-day
 * Visitors >= Yesterday Visitors) must be verified against Production,
 * read-only, once the migration has actually been applied there.
 *
 * What this file *does* prove at the TS layer: none of these functions call
 * `.from(...)` on sessions/page_views/events anymore -- the exact anti-pattern
 * (fetch raw rows, then count/dedupe in JS, silently truncated by PostgREST's
 * 1000-row cap) that caused the bug is gone from this module. Every aggregate
 * goes through `.rpc(...)` instead, which returns one bounded jsonb value.
 */

type RpcHandler = (name: string, args?: Record<string, unknown>) => { data: unknown; error: unknown };

function fakeSupabase(rpc: RpcHandler) {
  return {
    rpc: async (name: string, args?: Record<string, unknown>) => rpc(name, args),
    from: () => {
      throw new Error("must not fetch raw rows for an aggregate metric -- this is exactly the bug being fixed");
    },
  } as unknown as SupabaseClient<Database>;
}

const from = new Date("2026-08-25T00:00:00.000Z");
const to = new Date("2026-08-31T23:59:59.999Z");

describe("getSummary", () => {
  it("calls get_analytics_summary with the site id and ISO range, and returns the DB's result unchanged", async () => {
    const dbResult = { visitors: 365, sessions: 1977, pageViews: 2220, events: 640, conversions: 12, conversionRate: 0.6 };
    const supabase = fakeSupabase((name, args) => {
      expect(name).toBe("get_analytics_summary");
      expect(args).toEqual({ p_site_id: "site-a", p_from: from.toISOString(), p_to: to.toISOString() });
      return { data: dbResult, error: null };
    });

    expect(await getSummary(supabase, "site-a", from, to)).toEqual(dbResult);
  });

  it("a range's Sessions count is not capped at 1000 -- the DB's exact count passes through untouched", async () => {
    // Regression guard for the original bug: 1977 real sessions must read as
    // 1977, not silently as 1000 (the PostgREST max-rows cap that a raw
    // `.select().limit()` fetch used to hit).
    const supabase = fakeSupabase(() => ({
      data: { visitors: 300, sessions: 1977, pageViews: 0, events: 0, conversions: 0, conversionRate: 0 },
      error: null,
    }));

    const summary = await getSummary(supabase, "site-a", from, to);
    expect(summary.sessions).toBe(1977);
    expect(summary.sessions).not.toBe(1000);
  });

  it("returns a zeroed summary for a zero-data range, matching the DB's own coalesced zero result", async () => {
    const zero = { visitors: 0, sessions: 0, pageViews: 0, events: 0, conversions: 0, conversionRate: 0 };
    const supabase = fakeSupabase(() => ({ data: zero, error: null }));
    expect(await getSummary(supabase, "site-a", from, to)).toEqual(zero);
  });

  it("throws when the RPC errors, rather than silently rendering a misleading zero dashboard", async () => {
    const supabase = fakeSupabase(() => ({ data: null, error: { message: "boom" } }));
    await expect(getSummary(supabase, "site-a", from, to)).rejects.toBeTruthy();
  });
});

describe("getTimeseries", () => {
  it("calls get_analytics_timeseries with timezone/granularity/metric and returns the DB's bucket array unchanged", async () => {
    const buckets = [
      { label: "Aug 25", value: 40 },
      { label: "Aug 26", value: 55 },
    ];
    const supabase = fakeSupabase((name, args) => {
      expect(name).toBe("get_analytics_timeseries");
      expect(args).toEqual({
        p_site_id: "site-a",
        p_from: from.toISOString(),
        p_to: to.toISOString(),
        p_timezone: "Asia/Jerusalem",
        p_granularity: "day",
        p_metric: "visitors",
      });
      return { data: buckets, error: null };
    });

    expect(await getTimeseries(supabase, "site-a", from, to, "Asia/Jerusalem", "day", "visitors")).toEqual(buckets);
  });

  it("returns an empty array (not an exception) when the DB returns no buckets", async () => {
    const supabase = fakeSupabase(() => ({ data: null, error: null }));
    expect(await getTimeseries(supabase, "site-a", from, to, "UTC", "hour", "sessions")).toEqual([]);
  });
});

describe("getSourcesBreakdown / getPagesBreakdown / getEventsBreakdown", () => {
  it("getSourcesBreakdown passes the DB's per-source aggregation through unchanged", async () => {
    const rows = [{ source: "google", visitors: 10, sessions: 12, pageViews: 30, conversions: 2, conversionRate: 16.6 }];
    const supabase = fakeSupabase((name) => {
      expect(name).toBe("get_analytics_sources");
      return { data: rows, error: null };
    });
    expect(await getSourcesBreakdown(supabase, "site-a", from, to)).toEqual(rows);
  });

  it("getPagesBreakdown passes the DB's per-page aggregation through unchanged, including a null engagement value", async () => {
    const rows = [{ pathname: "/", views: 100, uniqueVisitors: 80, entrances: 60, exits: 40, avgEngagementSeconds: null }];
    const supabase = fakeSupabase((name) => {
      expect(name).toBe("get_analytics_pages");
      return { data: rows, error: null };
    });
    expect(await getPagesBreakdown(supabase, "site-a", from, to)).toEqual(rows);
  });

  it("getEventsBreakdown passes the DB's per-event aggregation through unchanged", async () => {
    const rows = [{ eventName: "podcast_play", count: 500, uniqueVisitors: 200, conversions: 5 }];
    const supabase = fakeSupabase((name) => {
      expect(name).toBe("get_analytics_events");
      return { data: rows, error: null };
    });
    expect(await getEventsBreakdown(supabase, "site-a", from, to)).toEqual(rows);
  });

  it("all three return an empty array for a zero-data range", async () => {
    const supabase = fakeSupabase(() => ({ data: [], error: null }));
    expect(await getSourcesBreakdown(supabase, "site-a", from, to)).toEqual([]);
    expect(await getPagesBreakdown(supabase, "site-a", from, to)).toEqual([]);
    expect(await getEventsBreakdown(supabase, "site-a", from, to)).toEqual([]);
  });
});

describe("getEventDetail", () => {
  it("calls get_analytics_event_detail with the event name and range, and returns the DB's object unchanged", async () => {
    const detail = {
      timeseries: [{ label: "12:00", value: 3 }],
      topPages: [{ pathname: "/episodes/1", count: 3 }],
      topSources: [{ source: "direct", count: 3 }],
      recentProperties: [{ properties: { platform: "spotify" }, occurredAt: to.toISOString() }],
    };
    const supabase = fakeSupabase((name, args) => {
      expect(name).toBe("get_analytics_event_detail");
      expect(args).toEqual({
        p_site_id: "site-a",
        p_event_name: "spotify_click",
        p_from: from.toISOString(),
        p_to: to.toISOString(),
        p_timezone: "Asia/Jerusalem",
        p_granularity: "hour",
      });
      return { data: detail, error: null };
    });

    expect(await getEventDetail(supabase, "site-a", "spotify_click", from, to, "Asia/Jerusalem", "hour")).toEqual(detail);
  });

  it("returns zeroed/empty defaults for a zero-data range", async () => {
    const supabase = fakeSupabase(() => ({ data: null, error: null }));
    expect(await getEventDetail(supabase, "site-a", "spotify_click", from, to, "UTC", "day")).toEqual({
      timeseries: [],
      topPages: [],
      topSources: [],
      recentProperties: [],
    });
  });
});
