/**
 * Server-side only. Fetches and caches a Podbean OAuth2 client_credentials
 * access token in memory (per server process), refreshing shortly before
 * expiry. Never import this from a Client Component.
 */

const TOKEN_URL = "https://api.podbean.com/v1/oauth/token";
const EXPIRY_SAFETY_MARGIN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;

export class PodbeanAuthError extends Error {}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cached: CachedToken | null = null;
let inFlight: Promise<string> | null = null;

interface TokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
}

async function requestNewToken(): Promise<CachedToken> {
  const clientId = process.env.PODBEAN_CLIENT_ID;
  const clientSecret = process.env.PODBEAN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new PodbeanAuthError("Podbean credentials are not configured (PODBEAN_CLIENT_ID / PODBEAN_CLIENT_SECRET).");
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "PulseOS/1.0",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new PodbeanAuthError("Podbean token request timed out.");
    }
    throw new PodbeanAuthError("Couldn't reach Podbean's token endpoint.");
  }

  if (!response.ok) {
    // Podbean's error body (error / error_description) never echoes back credentials, safe to surface.
    let detail = "";
    try {
      const body = (await response.json()) as { error?: string; error_description?: string };
      detail = body.error_description || body.error || "";
    } catch {
      // ignore body parse failure
    }
    throw new PodbeanAuthError(`Podbean token request failed (HTTP ${response.status})${detail ? `: ${detail}` : "."}`);
  }

  const data = (await response.json()) as TokenResponse;
  if (!data.access_token || !data.expires_in) {
    throw new PodbeanAuthError("Podbean token response was missing expected fields.");
  }

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

/** Returns a valid access token, reusing the cached one until shortly before it expires. */
export async function getPodbeanAccessToken(): Promise<string> {
  if (cached && cached.expiresAt - EXPIRY_SAFETY_MARGIN_MS > Date.now()) {
    return cached.accessToken;
  }

  // Coalesce concurrent callers into a single token request.
  if (!inFlight) {
    inFlight = requestNewToken()
      .then((token) => {
        cached = token;
        return token.accessToken;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}
