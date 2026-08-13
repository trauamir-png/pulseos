import { getPodbeanAccessToken, PodbeanAuthError } from "@/lib/podbean/token";

/**
 * Server-side only. Thin authenticated GET wrapper for Podbean's REST API.
 * Read-only by design (this module has no POST/DELETE helpers) -- it must
 * stay that way until PulseOS explicitly needs to write to Podbean.
 */

const API_BASE = "https://api.podbean.com/v1";
const REQUEST_TIMEOUT_MS = 15_000;

export class PodbeanApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
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

  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: string; error_description?: string; msg?: string };
      detail = body.error_description || body.error || body.msg || "";
    } catch {
      // ignore body parse failure
    }
    throw new PodbeanApiError(`Podbean API error on ${path} (HTTP ${response.status})${detail ? `: ${detail}` : "."}`, response.status);
  }

  return (await response.json()) as T;
}
