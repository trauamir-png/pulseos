import { notFound } from "next/navigation";
import type { SiteRecord } from "@/lib/dashboard/site";

/** Known module keys. New modules just need a row in `site_modules` -- nothing here is exhaustive by design. */
export const MODULE_KEYS = ["web_analytics", "podcast_analytics", "content_management"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export function hasModule(site: SiteRecord | null, key: ModuleKey): boolean {
  return site?.modules.includes(key) ?? false;
}

/** Use at the top of any module-gated page so a direct URL hit 404s cleanly when the module is off. */
export function requireModule(site: SiteRecord | null, key: ModuleKey): asserts site is SiteRecord {
  if (!hasModule(site, key)) notFound();
}
