import { getPodbeanAccessToken, PodbeanAuthError } from "@/lib/podbean/token";

/**
 * Server-side only. Thin authenticated GET wrapper for Podbean's REST API.
 * Read-only by design (this module has no POST/DELETE helpers) -- it must
 * stay that way until PulseOS explicitly needs to write to Podbean.
 */

const API_BASE = "https://api.podbean.com/v1";
const REQUEST_TIMEOUT_MS = 15_000;

// Podbean occasionally 429s calls from Vercel's shared egress IPs even when
// our own call volume is well within any per-account budget (confirmed live:
// the exact same request succeeds instantly from a non-Vercel IP). That's a
// transient, infrastructure-level condition worth a few short retries, not
// an immediate failure -- but only for genuinely transient statuses. Auth
// and validation errors (400/401/403/...) are never retried here: retrying
// those would just repeat the same failure.
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const MAX_RETRY_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 8_000;
// Caps how long we'll ever honor a server-supplied Retry-After, so a single
// call can't blow past the Vercel function's own request budget.
const MAX_HONORED_RETRY_AFTER_MS = 10_000;

export class PodbeanApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parses a Retry-After header (seconds, or an HTTP-date) into a millisecond delay. Returns null if absent/unparseable. */
function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now();
    if (delta > 0) return delta;
  }
  return null;
}

/** Exponential backoff with jitter, capped, used when the server gives no Retry-After. */
function backoffMs(attempt: number): number {
  const exp = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (attempt - 1));
  return exp + Math.random() * exp * 0.5;
}

/** GETs a Podbean API path with the given query params, retrying once on a stale-token 401. */
export async function podbeanGet<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T> {
  return doGet<T>(path, params, /* allowRetry */ true);
}

async function doGet<T>(path: string, params: Record<string, string | undefined>, allowRetry: boolean): Promise<T> {
  let accessToken: string;
  try {
    accessToken = await getPodbeanAccessToken();
  } catch (e) {
    throw e instanceof PodbeanAuthError ? e : new PodbeanAuthError("Couldn't obtain a Podbean access token.");
  }

  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  url.searchParams.set("access_token", accessToken);

  let transientAttempt = 0;

  while (true) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": "PulseOS/1.0" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") {
        throw new PodbeanApiError(`Podbean request to ${path} timed out.`);
      }
      throw new PodbeanApiError(`Couldn't reach Podbean's API (${path}).`);
    }

    if (response.status === 401 && allowRetry) {
      // Token may have just expired server-side; force one retry with a fresh token.
      return doGet<T>(path, params, /* allowRetry */ false);
    }

    if (RETRYABLE_STATUSES.has(response.status) && transientAttempt < MAX_RETRY_ATTEMPTS) {
      transientAttempt++;
      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      const waitMs = retryAfterMs !== null ? Math.min(retryAfterMs, MAX_HONORED_RETRY_AFTER_MS) : backoffMs(transientAttempt);
      console.warn(
        `[podbean] ${path} received HTTP ${response.status}, retry ${transientAttempt}/${MAX_RETRY_ATTEMPTS}, waiting ${Math.round(waitMs / 1000)}s` +
          (retryAfterMs !== null ? " (Retry-After)" : " (backoff)"),
      );
      await sleep(waitMs);
      continue;
    }

    if (!response.ok) {
      let detail = "";
      try {
        const body = (await response.json()) as { error?: string; error_description?: string; msg?: string };
        detail = body.error_description || body.error || body.msg || "";
      } catch {
        // ignore body parse failure
      }
      if (transientAttempt > 0) {
        console.warn(`[podbean] ${path} exhausted retries (${transientAttempt}/${MAX_RETRY_ATTEMPTS}), giving up with HTTP ${response.status}`);
      }
      throw new PodbeanApiError(`Podbean API error on ${path} (HTTP ${response.status})${detail ? `: ${detail}` : "."}`, response.status);
    }

    if (transientAttempt > 0) {
      console.info(`[podbean] ${path} retry succeeded after ${transientAttempt} attempt(s)`);
    }
    return (await response.json()) as T;
  }
}
