import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeVisitorHash, getDailySalt } from "@/lib/analytics/visitor-hash";
import { isBotUserAgent } from "@/lib/analytics/bot";
import { classifyTrafficSource } from "@/lib/analytics/traffic-source";
import { parseUserAgent } from "@/lib/analytics/user-agent";
import { sanitizePathname, sanitizeQueryParams, extractDomain } from "@/lib/analytics/sanitize";
import { isRateLimited } from "@/lib/analytics/rate-limit";

export const runtime = "nodejs";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const payloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("pageview"),
    site: z.string().min(1),
    sessionId: z.string().uuid().optional(),
    url: z.string().min(1).max(2048),
    pathname: z.string().min(1).max(512),
    title: z.string().max(300).optional(),
    referrer: z.string().max(2048).optional(),
    search: z.string().max(1024).optional(),
  }),
  z.object({
    type: z.literal("heartbeat"),
    site: z.string().min(1),
    sessionId: z.string().uuid().optional(),
    pathname: z.string().min(1).max(512),
  }),
  z.object({
    type: z.literal("event"),
    site: z.string().min(1),
    sessionId: z.string().uuid().optional(),
    eventName: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_.-]+$/),
    properties: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
    pathname: z.string().max(512).optional(),
  }),
]);

function corsHeaders(origin: string | null) {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", origin ?? "*");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Vary", "Origin");
  return headers;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const userAgent = request.headers.get("user-agent");
  if (isBotUserAgent(userAgent)) {
    return new NextResponse(null, { status: 204, headers });
  }

  let rawBody: unknown;
  try {
    const text = await request.text();
    rawBody = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers });
  }

  const parsed = payloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400, headers });
  }

  const body = parsed.data;
  const supabase = createAdminClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id, timezone, active")
    .eq("site_key", body.site)
    .maybeSingle();

  if (!site || !site.active) {
    return NextResponse.json({ error: "unknown_site" }, { status: 403, headers });
  }

  if (await isRateLimited(supabase, site.id)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "0.0.0.0";
  const salt = await getDailySalt(supabase);
  const visitorHash = computeVisitorHash(salt, site.id, ip, userAgent ?? "");

  const now = new Date();
  const currentPathname = body.type === "pageview" ? sanitizePathname(body.pathname) : body.pathname ? sanitizePathname(body.pathname) : null;
  let sessionId = body.sessionId ?? null;
  let session: { id: string; last_seen_at: string; traffic_source: string } | null = null;

  if (sessionId) {
    const { data: existing } = await supabase
      .from("sessions")
      .select("id, last_seen_at, traffic_source")
      .eq("id", sessionId)
      .eq("site_id", site.id)
      .maybeSingle();

    if (existing && now.getTime() - new Date(existing.last_seen_at).getTime() <= SESSION_TIMEOUT_MS) {
      session = existing;
    }
  }

  let isNewSession = false;

  if (!session) {
    isNewSession = true;
    const { deviceType, browser, os } = parseUserAgent(userAgent);

    let referrerRaw: string | null = null;
    let utm = { source: null as string | null, medium: null as string | null, campaign: null as string | null, content: null as string | null, term: null as string | null };
    let entryPathname: string | null = null;

    if (body.type === "pageview") {
      referrerRaw = body.referrer || null;
      entryPathname = sanitizePathname(body.pathname);
      const params = sanitizeQueryParams(body.search ?? "");
      utm = {
        source: params.utm_source ?? null,
        medium: params.utm_medium ?? null,
        campaign: params.utm_campaign ?? null,
        content: params.utm_content ?? null,
        term: params.utm_term ?? null,
      };
    } else if (body.type === "event" || body.type === "heartbeat") {
      entryPathname = body.pathname ? sanitizePathname(body.pathname) : null;
    }

    const referrerDomain = extractDomain(referrerRaw);
    const ownDomain = extractDomain(body.type === "pageview" ? body.url : null);
    const isSelfReferral = referrerDomain && ownDomain && referrerDomain === ownDomain;
    const trafficSource = classifyTrafficSource({
      utmSource: utm.source,
      utmMedium: utm.medium,
      referrerDomain: isSelfReferral ? null : referrerDomain,
    });

    const { data: created, error: createError } = await supabase
      .from("sessions")
      .insert({
        site_id: site.id,
        visitor_hash: visitorHash,
        started_at: now.toISOString(),
        last_seen_at: now.toISOString(),
        entry_pathname: entryPathname,
        current_pathname: currentPathname ?? entryPathname,
        referrer_raw: referrerRaw,
        referrer_domain: isSelfReferral ? null : referrerDomain,
        utm_source: utm.source,
        utm_medium: utm.medium,
        utm_campaign: utm.campaign,
        utm_content: utm.content,
        utm_term: utm.term,
        traffic_source: trafficSource,
        device_type: deviceType,
        browser,
        os,
        is_bot: false,
      })
      .select("id, last_seen_at, traffic_source")
      .single();

    if (createError || !created) {
      return NextResponse.json({ error: "session_create_failed" }, { status: 500, headers });
    }

    session = created;
    sessionId = created.id;
  } else {
    await supabase
      .from("sessions")
      .update({ last_seen_at: now.toISOString(), current_pathname: currentPathname ?? undefined })
      .eq("id", session.id);
  }

  if (!session) {
    return NextResponse.json({ error: "session_unavailable" }, { status: 500, headers });
  }

  if (body.type === "pageview") {
    const params = sanitizeQueryParams(body.search ?? "");
    await supabase.from("page_views").insert({
      site_id: site.id,
      session_id: session.id,
      visitor_hash: visitorHash,
      url: body.url.slice(0, 2048),
      pathname: sanitizePathname(body.pathname),
      page_title: body.title?.slice(0, 300) ?? null,
      referrer_raw: body.referrer || null,
      query_params: params,
      utm_source: params.utm_source ?? null,
      utm_medium: params.utm_medium ?? null,
      utm_campaign: params.utm_campaign ?? null,
      utm_content: params.utm_content ?? null,
      utm_term: params.utm_term ?? null,
      traffic_source: session.traffic_source,
      is_landing: isNewSession,
      occurred_at: now.toISOString(),
    });
  } else if (body.type === "event") {
    const { data: conversionRow } = await supabase
      .from("site_conversion_events")
      .select("event_name")
      .eq("site_id", site.id)
      .eq("event_name", body.eventName)
      .maybeSingle();

    await supabase.from("events").insert({
      site_id: site.id,
      session_id: session.id,
      visitor_hash: visitorHash,
      event_name: body.eventName,
      properties: body.properties ?? {},
      pathname: body.pathname ? sanitizePathname(body.pathname) : null,
      traffic_source: session.traffic_source,
      is_conversion: Boolean(conversionRow),
      occurred_at: now.toISOString(),
    });
  }
  // heartbeat: session.last_seen_at update above is enough.

  return NextResponse.json({ sessionId }, { status: 200, headers });
}
