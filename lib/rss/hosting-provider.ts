/**
 * The only hosting_provider values PulseOS knows about. Keep in sync with
 * migration 0011's CHECK constraint -- this list and the DB constraint must
 * always agree, or a value the UI can produce could be rejected at write
 * time (or worse, the DB could accept a value the UI never offers).
 */
export const HOSTING_PROVIDER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "spotify_for_podcasters", label: "Spotify for Creators" },
  { value: "podbean", label: "Podbean" },
  { value: "buzzsprout", label: "Buzzsprout" },
  { value: "libsyn", label: "Libsyn" },
  { value: "captivate", label: "Captivate" },
  { value: "transistor", label: "Transistor" },
  { value: "simplecast", label: "Simplecast" },
  { value: "other", label: "Other" },
];

export function hostingProviderLabel(value: string | null): string {
  if (!value) return "Not set";
  return HOSTING_PROVIDER_OPTIONS.find((o) => o.value === value)?.label ?? "Other";
}

const HOST_PATTERNS: Array<{ provider: string; test: (host: string) => boolean }> = [
  { provider: "podbean", test: (h) => h.includes("podbean.com") },
  { provider: "spotify_for_podcasters", test: (h) => h.includes("anchor.fm") || h.includes("spotifycreators") || h.includes("spotifyforpodcasters") },
  { provider: "buzzsprout", test: (h) => h.includes("buzzsprout.com") },
  { provider: "libsyn", test: (h) => h.includes("libsyn.com") },
  { provider: "captivate", test: (h) => h.includes("captivate.fm") },
  { provider: "transistor", test: (h) => h.includes("transistor.fm") },
  { provider: "simplecast", test: (h) => h.includes("simplecast.com") },
];

/**
 * Best-effort hosting provider guess from an RSS feed URL's hostname. Used
 * only to decide which provider-specific hosting analytics UI/sync to show
 * (see hosting_provider column, migration 0010) -- never affects whether the
 * feed itself can be parsed, since lib/rss/parse.ts works with any
 * standard-RSS host regardless of this classification.
 */
export function detectHostingProvider(rssUrl: string): string | null {
  let host: string;
  try {
    host = new URL(rssUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const { provider, test } of HOST_PATTERNS) {
    if (test(host)) return provider;
  }
  return "other";
}
