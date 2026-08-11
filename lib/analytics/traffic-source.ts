export interface TrafficSourceInput {
  utmSource?: string | null;
  utmMedium?: string | null;
  referrerDomain?: string | null;
}

const REFERRAL_DOMAIN_MAP: Array<{ pattern: RegExp; source: string }> = [
  { pattern: /(^|\.)google\./i, source: "google" },
  { pattern: /(^|\.)bing\.com$/i, source: "bing" },
  { pattern: /(^|\.)duckduckgo\.com$/i, source: "duckduckgo" },
  { pattern: /(^|\.)instagram\.com$/i, source: "instagram" },
  { pattern: /(^|\.)facebook\.com$/i, source: "facebook" },
  { pattern: /(^|\.)fb\.com$/i, source: "facebook" },
  { pattern: /(^|\.)(x|twitter)\.com$/i, source: "twitter" },
  { pattern: /t\.co$/i, source: "twitter" },
  { pattern: /(^|\.)linkedin\.com$/i, source: "linkedin" },
  { pattern: /lnkd\.in$/i, source: "linkedin" },
  { pattern: /(^|\.)youtube\.com$/i, source: "youtube" },
  { pattern: /youtu\.be$/i, source: "youtube" },
  { pattern: /(^|\.)tiktok\.com$/i, source: "tiktok" },
  { pattern: /(^|\.)whatsapp\.com$/i, source: "whatsapp" },
  { pattern: /wa\.me$/i, source: "whatsapp" },
  { pattern: /(^|\.)reddit\.com$/i, source: "reddit" },
];

const KNOWN_SOURCES = new Set([
  "google",
  "bing",
  "duckduckgo",
  "instagram",
  "facebook",
  "twitter",
  "linkedin",
  "youtube",
  "tiktok",
  "whatsapp",
  "reddit",
  "direct",
  "other",
]);

/**
 * Normalizes traffic into a known bucket. UTM parameters win over referrer
 * inference when present (explicit beats guessed); the raw referrer/UTM
 * values are stored separately so nothing is lost.
 */
export function classifyTrafficSource({ utmSource, utmMedium, referrerDomain }: TrafficSourceInput): string {
  if (utmSource) {
    const normalized = utmSource.trim().toLowerCase();
    if (KNOWN_SOURCES.has(normalized)) return normalized;
    if (utmMedium?.toLowerCase() === "cpc" || utmMedium?.toLowerCase() === "paid") return normalized;
    return normalized || "other";
  }

  if (!referrerDomain) return "direct";

  for (const { pattern, source } of REFERRAL_DOMAIN_MAP) {
    if (pattern.test(referrerDomain)) return source;
  }

  return "referral";
}
