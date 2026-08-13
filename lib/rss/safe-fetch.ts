import dns from "node:dns/promises";
import { Agent, fetch as undiciFetch } from "undici";
import isPrivateIp from "private-ip";

/**
 * Server-side fetch for user-supplied RSS URLs, hardened against SSRF.
 *
 * - protocol allowlist (http/https only -- blocks file:, data:, etc.)
 * - hostname is resolved to IPs *before* connecting, and every IP is checked
 *   against private/loopback/link-local/reserved ranges (blocks localhost,
 *   10.x/172.16.x/192.168.x, 169.254.169.254 cloud metadata, etc.)
 * - the resolved IPs are pinned into the request via a custom Agent
 *   `connect.lookup`, so the actual TCP connection can't resolve to a
 *   different (unvalidated) address than the one we checked -- this closes
 *   the DNS-rebinding gap that a naive "check then fetch" would leave open.
 * - IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1, or its compressed
 *   form ::ffff:7f00:1 that the URL parser produces for a bracketed literal)
 *   are unwrapped and re-checked as plain IPv4 -- private-ip's published
 *   advisory (GHSA-9h3q-32c7-r533) is exactly this compressed-form gap, and
 *   this unwrap step closes it independent of that library.
 * - redirects are followed manually, one hop at a time, so every hop is
 *   re-validated the same way as the original URL (bounded to 5 hops).
 * - the response body is capped and the whole request is time-bounded.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_REDIRECTS = 5;
const MAX_BYTES = 15 * 1024 * 1024; // 15MB -- generous for an RSS/XML feed, bounded.
const TIMEOUT_MS = 20_000;

export class SafeFetchError extends Error {}

function unwrapMappedV4(address: string): string | null {
  const lower = address.toLowerCase();
  let m = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (m) return m[1];
  m = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (m) {
    const hi = parseInt(m[1], 16);
    const lo = parseInt(m[2], 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }
  return null;
}

function isBlockedAddress(address: string): boolean {
  const mapped = unwrapMappedV4(address);
  return isPrivateIp(mapped ?? address) === true;
}

async function resolveAndValidate(hostname: string): Promise<{ address: string; family: number }[]> {
  if (hostname === "localhost") {
    throw new SafeFetchError("This URL points to a private or internal address and can't be used.");
  }

  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SafeFetchError("Couldn't resolve that hostname. Check the URL and try again.");
  }

  if (records.length === 0) {
    throw new SafeFetchError("Couldn't resolve that hostname. Check the URL and try again.");
  }

  for (const record of records) {
    if (isBlockedAddress(record.address)) {
      throw new SafeFetchError("This URL points to a private or internal address and can't be used.");
    }
  }

  return records;
}

function validateUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError("Enter a valid http:// or https:// URL.");
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new SafeFetchError("Only http:// and https:// URLs are supported.");
  }
  return url;
}

/** Fetches a URL's body as text, validating and pinning the destination at every redirect hop. */
export async function safeFetchText(inputUrl: string): Promise<string> {
  let currentUrl = validateUrl(inputUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const resolved = await resolveAndValidate(currentUrl.hostname);

    const dispatcher = new Agent({
      connect: {
        lookup(_hostname, options, callback) {
          const family = options.family;
          const matching = family ? resolved.filter((r) => r.family === family) : resolved;
          const pool = matching.length > 0 ? matching : resolved;
          callback(null, pool.map((r) => ({ address: r.address, family: r.family as 4 | 6 })));
        },
      },
    });

    let response;
    try {
      response = await undiciFetch(currentUrl, {
        dispatcher,
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "user-agent": "PulseOS-RSS/1.0" },
      });
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") {
        throw new SafeFetchError("The URL took too long to respond. Try again or check the address.");
      }
      throw new SafeFetchError("Couldn't reach that URL. Check the address and try again.");
    }

    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      if (hop === MAX_REDIRECTS) {
        throw new SafeFetchError("This URL redirects too many times.");
      }
      const location = response.headers.get("location")!;
      try {
        currentUrl = validateUrl(new URL(location, currentUrl).toString());
      } catch {
        throw new SafeFetchError("This URL redirected to an invalid address.");
      }
      continue;
    }

    if (!response.ok) {
      throw new SafeFetchError(`The URL responded with an error (HTTP ${response.status}).`);
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_BYTES) {
      throw new SafeFetchError("The response from that URL is too large to import.");
    }

    if (!response.body) return "";

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel().catch(() => {});
        throw new SafeFetchError("The response from that URL is too large to import.");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf-8");
  }

  throw new SafeFetchError("This URL redirects too many times.");
}
