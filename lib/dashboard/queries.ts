import type { SupabaseClient } from "@supabase/supabase-js";
import { eachDayOfInterval, eachHourOfInterval } from "date-fns";
import { toZonedTime, fromZonedTime, format } from "date-fns-tz";
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
  const [{ data: sessionRows }, pageViewsCount, eventsCount, { data: conversionRows }] = await Promise.all([
    supabase
      .from("sessions")
      .select("visitor_hash")
      .eq("site_id", siteId)
      .gte("started_at", from.toISOString())
      .lte("started_at", to.toISOString())
      .limit(50000),
    supabase
      .from("page_views")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .gte("occurred_at", from.toISOString())
      .lte("occurred_at", to.toISOString()),
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .gte("occurred_at", from.toISOString())
      .lte("occurred_at", to.toISOString()),
    supabase
      .from("events")
      .select("session_id")
      .eq("site_id", siteId)
      .eq("is_conversion", true)
      .gte("occurred_at", from.toISOString())
      .lte("occurred_at", to.toISOString())
      .limit(50000),
  ]);

  const sessions = sessionRows ?? [];
  const visitors = new Set(sessions.map((s) => s.visitor_hash)).size;
  const conversions = new Set((conversionRows ?? []).map((r) => r.session_id)).size;

  return {
    visitors,
    sessions: sessions.length,
    pageViews: pageViewsCount.count ?? 0,
    events: eventsCount.count ?? 0,
    conversions,
    conversionRate: sessions.length > 0 ? (conversions / sessions.length) * 100 : 0,
  };
}

export type TimeseriesMetric = "visitors" | "sessions" | "pageviews";

interface Bucket {
  key: string;
  label: string;
  start: Date;
  end: Date;
}

function buildBuckets(from: Date, to: Date, timezone: string, granularity: "hour" | "day"): Bucket[] {
  const zonedFrom = toZonedTime(from, timezone);
  const zonedTo = toZonedTime(to, timezone);
  const points = granularity === "hour" ? eachHourOfInterval({ start: zonedFrom, end: zonedTo }) : eachDayOfInterval({ start: zonedFrom, end: zonedTo });

  return points.map((point) => {
    const start = fromZonedTime(point, timezone);
    const end = new Date(start.getTime() + (granularity === "hour" ? 3_600_000 : 86_400_000) - 1);
    return {
      key: start.toISOString(),
      label: format(point, granularity === "hour" ? "HH:mm" : "MMM d", { timeZone: timezone }),
      start,
      end,
    };
  });
}

export async function getTimeseries(
  supabase: Supa,
  siteId: string,
  from: Date,
  to: Date,
  timezone: string,
  granularity: "hour" | "day",
  metric: TimeseriesMetric,
): Promise<Array<{ label: string; value: number }>> {
  const buckets = buildBuckets(from, to, timezone, granularity);

  if (metric === "pageviews") {
    const { data } = await supabase
      .from("page_views")
      .select("occurred_at")
      .eq("site_id", siteId)
      .gte("occurred_at", from.toISOString())
      .lte("occurred_at", to.toISOString())
      .limit(100000);

    return countIntoBuckets(buckets, (data ?? []).map((r) => new Date(r.occurred_at)));
  }

  const { data } = await supabase
    .from("sessions")
    .select("started_at, visitor_hash")
    .eq("site_id", siteId)
    .gte("started_at", from.toISOString())
    .lte("started_at", to.toISOString())
    .limit(100000);

  const rows = data ?? [];

  if (metric === "sessions") {
    return countIntoBuckets(buckets, rows.map((r) => new Date(r.started_at)));
  }

  // visitors: unique visitor_hash per bucket
  return buckets.map((bucket) => {
    const set = new Set<string>();
    for (const row of rows) {
      const t = new Date(row.started_at);
      if (t >= bucket.start && t <= bucket.end) set.add(row.visitor_hash);
    }
    return { label: bucket.label, value: set.size };
  });
}

function countIntoBuckets(buckets: Bucket[], timestamps: Date[]): Array<{ label: string; value: number }> {
  return buckets.map((bucket) => ({
    label: bucket.label,
    value: timestamps.filter((t) => t >= bucket.start && t <= bucket.end).length,
  }));
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
  const [{ data: sessionRows }, { data: pageViewRows }, { data: conversionRows }] = await Promise.all([
    supabase
      .from("sessions")
      .select("traffic_source, visitor_hash")
      .eq("site_id", siteId)
      .gte("started_at", from.toISOString())
      .lte("started_at", to.toISOString())
      .limit(50000),
    supabase
      .from("page_views")
      .select("traffic_source")
      .eq("site_id", siteId)
      .gte("occurred_at", from.toISOString())
      .lte("occurred_at", to.toISOString())
      .limit(100000),
    supabase
      .from("events")
      .select("traffic_source, session_id")
      .eq("site_id", siteId)
      .eq("is_conversion", true)
      .gte("occurred_at", from.toISOString())
      .lte("occurred_at", to.toISOString())
      .limit(50000),
  ]);

  const bySource = new Map<string, { visitors: Set<string>; sessions: number; pageViews: number; conversions: Set<string> }>();

  function bucket(source: string) {
    if (!bySource.has(source)) bySource.set(source, { visitors: new Set(), sessions: 0, pageViews: 0, conversions: new Set() });
    return bySource.get(source)!;
  }

  for (const row of sessionRows ?? []) {
    const b = bucket(row.traffic_source);
    b.sessions += 1;
    b.visitors.add(row.visitor_hash);
  }
  for (const row of pageViewRows ?? []) {
    bucket(row.traffic_source).pageViews += 1;
  }
  for (const row of conversionRows ?? []) {
    bucket(row.traffic_source).conversions.add(row.session_id);
  }

  return Array.from(bySource.entries())
    .map(([source, v]) => ({
      source,
      visitors: v.visitors.size,
      sessions: v.sessions,
      pageViews: v.pageViews,
      conversions: v.conversions.size,
      conversionRate: v.sessions > 0 ? (v.conversions.size / v.sessions) * 100 : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions);
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
  const { data } = await supabase
    .from("page_views")
    .select("pathname, visitor_hash, session_id, is_landing, occurred_at")
    .eq("site_id", siteId)
    .gte("occurred_at", from.toISOString())
    .lte("occurred_at", to.toISOString())
    .order("session_id", { ascending: true })
    .order("occurred_at", { ascending: true })
    .limit(100000);

  const rows = data ?? [];

  const byPath = new Map<string, { views: number; visitors: Set<string>; entrances: number; exits: number; engagementTotal: number; engagementCount: number }>();

  function bucket(path: string) {
    if (!byPath.has(path)) byPath.set(path, { views: 0, visitors: new Set(), entrances: 0, exits: 0, engagementTotal: 0, engagementCount: 0 });
    return byPath.get(path)!;
  }

  // group by session to compute exits + engagement (time to next page view in the same session)
  const bySession = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = bySession.get(row.session_id) ?? [];
    list.push(row);
    bySession.set(row.session_id, list);
  }

  for (const row of rows) {
    const b = bucket(row.pathname);
    b.views += 1;
    b.visitors.add(row.visitor_hash);
    if (row.is_landing) b.entrances += 1;
  }

  for (const sessionRows of bySession.values()) {
    const last = sessionRows[sessionRows.length - 1];
    bucket(last.pathname).exits += 1;

    for (let i = 0; i < sessionRows.length - 1; i++) {
      const current = sessionRows[i];
      const next = sessionRows[i + 1];
      const deltaSeconds = (new Date(next.occurred_at).getTime() - new Date(current.occurred_at).getTime()) / 1000;
      if (deltaSeconds > 0 && deltaSeconds <= 1800) {
        const b = bucket(current.pathname);
        b.engagementTotal += deltaSeconds;
        b.engagementCount += 1;
      }
    }
  }

  return Array.from(byPath.entries())
    .map(([pathname, v]) => ({
      pathname,
      views: v.views,
      uniqueVisitors: v.visitors.size,
      entrances: v.entrances,
      exits: v.exits,
      avgEngagementSeconds: v.engagementCount > 0 ? Math.round(v.engagementTotal / v.engagementCount) : null,
    }))
    .sort((a, b) => b.views - a.views);
}

export const ONLINE_THRESHOLD_MS = 90_000;

export interface RealtimeSnapshot {
  onlineNow: number;
  currentPages: Array<{ pathname: string; count: number }>;
  sources: Array<{ source: string; count: number }>;
  recentPageViews: Array<{ pathname: string; trafficSource: string; occurredAt: string }>;
  recentEvents: Array<{ eventName: string; pathname: string | null; trafficSource: string; occurredAt: string }>;
}

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
  const { data } = await supabase
    .from("events")
    .select("event_name, visitor_hash, is_conversion")
    .eq("site_id", siteId)
    .gte("occurred_at", from.toISOString())
    .lte("occurred_at", to.toISOString())
    .limit(100000);

  const byName = new Map<string, { count: number; visitors: Set<string>; conversions: number }>();

  for (const row of data ?? []) {
    if (!byName.has(row.event_name)) byName.set(row.event_name, { count: 0, visitors: new Set(), conversions: 0 });
    const b = byName.get(row.event_name)!;
    b.count += 1;
    b.visitors.add(row.visitor_hash);
    if (row.is_conversion) b.conversions += 1;
  }

  return Array.from(byName.entries())
    .map(([eventName, v]) => ({ eventName, count: v.count, uniqueVisitors: v.visitors.size, conversions: v.conversions }))
    .sort((a, b) => b.count - a.count);
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
  const { data } = await supabase
    .from("events")
    .select("occurred_at, pathname, traffic_source, properties")
    .eq("site_id", siteId)
    .eq("event_name", eventName)
    .gte("occurred_at", from.toISOString())
    .lte("occurred_at", to.toISOString())
    .order("occurred_at", { ascending: false })
    .limit(20000);

  const rows = data ?? [];
  const buckets = buildBuckets(from, to, timezone, granularity);
  const timeseries = countIntoBuckets(buckets, rows.map((r) => new Date(r.occurred_at)));

  const pageCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  for (const row of rows) {
    const path = row.pathname || "(unknown)";
    pageCounts.set(path, (pageCounts.get(path) ?? 0) + 1);
    sourceCounts.set(row.traffic_source, (sourceCounts.get(row.traffic_source) ?? 0) + 1);
  }

  return {
    timeseries,
    topPages: Array.from(pageCounts.entries())
      .map(([pathname, count]) => ({ pathname, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    topSources: Array.from(sourceCounts.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    recentProperties: rows
      .filter((r) => r.properties && Object.keys(r.properties).length > 0)
      .slice(0, 10)
      .map((r) => ({ properties: r.properties, occurredAt: r.occurred_at })),
  };
}
