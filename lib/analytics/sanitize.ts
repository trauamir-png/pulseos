const ALLOWED_QUERY_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "fbclid",
  "ref",
  "source",
]);

/** Drops everything except a small allowlist of known, non-sensitive tracking params. */
export function sanitizeQueryParams(search: string): Record<string, string> {
  const params = new URLSearchParams(search);
  const result: Record<string, string> = {};

  for (const [key, value] of params.entries()) {
    if (ALLOWED_QUERY_PARAMS.has(key.toLowerCase()) && value.length <= 512) {
      result[key.toLowerCase()] = value;
    }
  }

  return result;
}

/** Strips query/hash and caps length so we never store unbounded or sensitive URLs. */
export function sanitizePathname(pathname: string): string {
  const trimmed = pathname.split("?")[0].split("#")[0];
  return trimmed.slice(0, 512) || "/";
}

export function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
