import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Supa = SupabaseClient<Database>;

export interface Summary {
  visitors: number;
  sessions: number;
  pageViews: number;
  events: number;
  conversions: number;
  conversionRate: number;
}

export async function getSummary(supabase: Supa, siteId: string, from: Date, to: Date): Promise<Summary> {
  const { data, error } = await supabase.rpc("get_analytics_summary", {
    p_site_id: siteId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) throw error;

  return (
    data ?? {
      visitors: 0,
      sessions: 0,
      pageViews: 0,
      events: 0,
      conversions: 0,
      conversionRate: 0,
    }
  );
}

export type TimeseriesMetric = "visitors" | "sessions" | "pageviews";

export async function getTimeseries(
  supabase: Supa,
  siteId: string,
  from: Date,
  to: Date,
  timezone: string,
  granularity: "hour" | "day",
  metric: TimeseriesMetric,
): Promise<Array<{ label: string; value: number }>> {
  const { data, error } = await supabase.rpc("get_analytics_timeseries", {
    p_site_id: siteId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_timezone: timezone,
    p_granularity: granularity,
    p_metric: metric,
  });
  if (error) throw error;
  return data ?? [];
}

export interface SourceRow {
  source: string;
  visitors: number;
  sessions: number;
  pageViews: number;
  conversions: number;
  conversionRate: number;
}

export async function getSourcesBreakdown(supabase: Supa, siteId: string, from: Date, to: Date): Promise<SourceRow[]> {
  const { data, error } = await supabase.rpc("get_analytics_sources", {
    p_site_id: siteId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) throw error;
  return data ?? [];
}

export interface PageRow {
  pathname: string;
  views: number;
  uniqueVisitors: number;
  entrances: number;
  exits: number;
  avgEngagementSeconds: number | null;
}

export async function getPagesBreakdown(supabase: Supa, siteId: string, from: Date, to: Date): Promise<PageRow[]> {
  const { data, error } = await supabase.rpc("get_analytics_pages", {
    p_site_id: siteId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) throw error;
  return data ?? [];
}

export const ONLINE_THRESHOLD_MS = 90_000;

export interface RealtimeSnapshot {
  onlineNow: number;
  currentPages: Array<{ pathname: string; count: number }>;
  sources: Array<{ source: string; count: number }>;
  recentPageViews: Array<{ pathname: string; trafficSource: string; occurredAt: string }>;
  recentEvents: Array<{ eventName: string; pathname: string | null; trafficSource: string; occurredAt: string }>;
}

// Left as a raw-row fetch, not an RPC: the query window is the trailing 90
// seconds (ONLINE_THRESHOLD_MS) only, so hitting the 1000-row PostgREST cap
// here would require ~11+ concurrent sessions/sec sustained on one site --
// far past this project's current traffic, and revisit if that ever changes.
export async function getRealtimeSnapshot(supabase: Supa, siteId: string): Promise<RealtimeSnapshot> {
  const cutoff = new Date(Date.now() - ONLINE_THRESHOLD_MS).toISOString();

  const [{ data: activeSessions }, { data: recentPageViews }, { data: recentEvents }] = await Promise.all([
    supabase
      .from("sessions")
      .select("current_pathname, traffic_source")
      .eq("site_id", siteId)
      .eq("is_bot", false)
      .gte("last_seen_at", cutoff)
      .limit(2000),
    supabase
      .from("page_views")
      .select("pathname, traffic_source, occurred_at")
      .eq("site_id", siteId)
      .order("occurred_at", { ascending: false })
      .limit(20),
    supabase
      .from("events")
      .select("event_name, pathname, traffic_source, occurred_at")
      .eq("site_id", siteId)
      .order("occurred_at", { ascending: false })
      .limit(20),
  ]);

  const sessions = activeSessions ?? [];

  const pageCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  for (const s of sessions) {
    const path = s.current_pathname || "/";
    pageCounts.set(path, (pageCounts.get(path) ?? 0) + 1);
    sourceCounts.set(s.traffic_source, (sourceCounts.get(s.traffic_source) ?? 0) + 1);
  }

  return {
    onlineNow: sessions.length,
    currentPages: Array.from(pageCounts.entries())
      .map(([pathname, count]) => ({ pathname, count }))
      .sort((a, b) => b.count - a.count),
    sources: Array.from(sourceCounts.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count),
    recentPageViews: (recentPageViews ?? []).map((r) => ({
      pathname: r.pathname,
      trafficSource: r.traffic_source,
      occurredAt: r.occurred_at,
    })),
    recentEvents: (recentEvents ?? []).map((r) => ({
      eventName: r.event_name,
      pathname: r.pathname,
      trafficSource: r.traffic_source,
      occurredAt: r.occurred_at,
    })),
  };
}

export interface EventRow {
  eventName: string;
  count: number;
  uniqueVisitors: number;
  conversions: number;
}

export async function getEventsBreakdown(supabase: Supa, siteId: string, from: Date, to: Date): Promise<EventRow[]> {
  const { data, error } = await supabase.rpc("get_analytics_events", {
    p_site_id: siteId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) throw error;
  return data ?? [];
}

export interface EventDetail {
  timeseries: Array<{ label: string; value: number }>;
  topPages: Array<{ pathname: string; count: number }>;
  topSources: Array<{ source: string; count: number }>;
  recentProperties: Array<{ properties: Record<string, unknown>; occurredAt: string }>;
}

export async function getEventDetail(
  supabase: Supa,
  siteId: string,
  eventName: string,
  from: Date,
  to: Date,
  timezone: string,
  granularity: "hour" | "day",
): Promise<EventDetail> {
  const { data, error } = await supabase.rpc("get_analytics_event_detail", {
    p_site_id: siteId,
    p_event_name: eventName,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_timezone: timezone,
    p_granularity: granularity,
  });
  if (error) throw error;

  return (
    data ?? {
      timeseries: [],
      topPages: [],
      topSources: [],
      recentProperties: [],
    }
  );
}
