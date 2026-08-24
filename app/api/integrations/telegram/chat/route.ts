import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSiteId } from "@/lib/content/public-api";
import { processTelegramUpdate, type TelegramUpdate } from "@/lib/integrations/telegram-chat";

export const runtime = "nodejs";

/**
 * V1 is Hakol-specific by design (same as HAKOL_FAN_VOTING_INTEGRATION_SECRET
 * in app/api/integrations/hakol/fan-voting/route.ts) -- no site-selection env
 * var was provisioned for this integration. sites.domain is unreliable for
 * identifying "the Hakol site" (inconsistently formatted, points at a Vercel
 * preview URL, not the real custom domain -- confirmed by read-only
 * inspection), so this reuses the same proven site_key Hakol's own
 * siteConfig.pulseosSiteKey and the fan-voting integration already resolve
 * through, via the existing resolveSiteId() helper.
 */
const HAKOL_SITE_KEY = "3257cbd1738913ca9af35220f14eba35";

const telegramMessageSchema = z.object({
  message_id: z.number(),
  chat: z.object({ id: z.number() }),
  from: z.object({ id: z.number(), is_bot: z.boolean().optional() }).optional(),
  text: z.string().optional(),
});

const telegramUpdateSchema = z
  .object({
    update_id: z.number(),
    message: telegramMessageSchema.optional(),
  })
  .passthrough();

/**
 * Server-to-server only, verified via Telegram's own
 * X-Telegram-Bot-Api-Secret-Token header against TELEGRAM_WEBHOOK_SECRET --
 * same shared-secret + timingSafeEqual convention as
 * app/api/integrations/hakol/fan-voting/route.ts's isAuthorized(). Never
 * logs or echoes back either the expected or provided value.
 */
export function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return false;
  const provided = request.headers.get("x-telegram-bot-api-secret-token");
  if (!provided) return false;
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Telegram retries on anything other than a 2xx response, and
 * processTelegramUpdate() is already race-safe against duplicate delivery --
 * so every outcome here, including a rejected/ignored one, is reported back
 * as 200. Only a genuine server-side problem (bad config, DB error) returns
 * non-2xx, which is the one case where a Telegram retry is actually useful.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const expectedChatIdRaw = process.env.TELEGRAM_CHAT_ID;
  const expectedChatId = expectedChatIdRaw ? Number(expectedChatIdRaw) : NaN;
  if (!expectedChatIdRaw || !Number.isFinite(expectedChatId)) {
    console.error("telegram webhook: TELEGRAM_CHAT_ID is missing or not a valid number");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = telegramUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const siteId = await resolveSiteId(HAKOL_SITE_KEY);
  if (!siteId) {
    console.error("telegram webhook: Hakol site could not be resolved");
    return NextResponse.json({ error: "site_not_found" }, { status: 500 });
  }

  const admin = createAdminClient();

  try {
    const result = await processTelegramUpdate(admin, parsed.data as TelegramUpdate, { expectedChatId, siteId });
    if (result.outcome === "ignored") {
      console.info(`telegram webhook: ignored (${result.reason})`);
    }
    return NextResponse.json({ ok: true, outcome: result.outcome }, { status: 200 });
  } catch (error) {
    console.error("telegram webhook: failed to process update", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
