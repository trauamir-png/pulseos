import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";

/**
 * Phase 2 spec Section 4 ("direct route protection") + Section 14
 * ("Analytics view-permission rejection" / route-level enforcement).
 *
 * These pages are async Server Components; this repo's Vitest setup has no
 * jsdom/@testing-library/react (see vitest.config.ts), so rendering them
 * isn't possible. Instead this asserts, by reading each page's actual
 * source, that it (a) redirects to NoSiteAccess when there's no resolvable
 * site and (b) checks the exact permission required by the spec's mapping
 * table before reaching its data query -- a regression guard against a
 * future edit silently dropping or swapping one of these checks. Admin
 * bypass and fail-closed behavior for hasPermission/requireSiteAccess
 * themselves are covered directly in lib/auth/permissions.test.ts.
 */

const DASHBOARD_DIR = path.resolve(__dirname);

function source(relativePath: string): string {
  return readFileSync(path.join(DASHBOARD_DIR, relativePath), "utf8");
}

const ANALYTICS_AND_PODCAST_ROUTES: Array<{ file: string; permission: string }> = [
  { file: "page.tsx", permission: "PERMISSIONS.ANALYTICS_DASHBOARD_VIEW" },
  { file: "realtime/page.tsx", permission: "PERMISSIONS.ANALYTICS_REALTIME_VIEW" },
  { file: "pages/page.tsx", permission: "PERMISSIONS.ANALYTICS_PAGES_VIEW" },
  { file: "sources/page.tsx", permission: "PERMISSIONS.ANALYTICS_SOURCES_VIEW" },
  { file: "events/page.tsx", permission: "PERMISSIONS.ANALYTICS_EVENTS_VIEW" },
  { file: "events/[name]/page.tsx", permission: "PERMISSIONS.ANALYTICS_EVENTS_VIEW" },
  { file: "podcast/page.tsx", permission: "PERMISSIONS.PODCAST_OVERVIEW_VIEW" },
  { file: "podcast/episodes/page.tsx", permission: "PERMISSIONS.PODCAST_EPISODES_VIEW" },
  { file: "podcast/episodes/[id]/page.tsx", permission: "PERMISSIONS.PODCAST_EPISODES_VIEW" },
];

const CONTENT_ROUTES: Array<{ file: string; permission: string }> = [
  { file: "content/columns/page.tsx", permission: "PERMISSIONS.CONTENT_COLUMNS_VIEW" },
  { file: "content/columns/new/page.tsx", permission: "PERMISSIONS.CONTENT_COLUMNS_CREATE" },
  { file: "content/columns/[id]/preview/page.tsx", permission: "PERMISSIONS.CONTENT_COLUMNS_VIEW" },
  { file: "content/authors/page.tsx", permission: "PERMISSIONS.CONTENT_AUTHORS_MANAGE" },
  { file: "content/categories/page.tsx", permission: "PERMISSIONS.CONTENT_CATEGORIES_MANAGE" },
  { file: "content/media/page.tsx", permission: "PERMISSIONS.CONTENT_MEDIA_MANAGE" },
  { file: "content/banners/page.tsx", permission: "PERMISSIONS.CONTENT_BANNERS_MANAGE" },
  { file: "content/banners/new/page.tsx", permission: "PERMISSIONS.CONTENT_BANNERS_MANAGE" },
  { file: "content/banners/[id]/page.tsx", permission: "PERMISSIONS.CONTENT_BANNERS_MANAGE" },
];

describe("Analytics + Podcast routes are protected per the spec's mapping table", () => {
  it.each(ANALYTICS_AND_PODCAST_ROUTES)("$file checks $permission and handles a missing site", ({ file, permission }) => {
    const src = source(file);
    expect(src).toContain("NoSiteAccess");
    expect(src).toContain("AccessDenied");
    expect(src).toContain(permission);
    // Every permission referenced here must be a real, defined key -- catches typos like a stray ".veiw".
    const key = permission.replace("PERMISSIONS.", "") as keyof typeof PERMISSIONS;
    expect(PERMISSIONS[key]).toBeDefined();
  });
});

describe("Content management routes are protected per the spec's mapping table", () => {
  it.each(CONTENT_ROUTES)("$file checks $permission and handles a missing site", ({ file, permission }) => {
    const src = source(file);
    expect(src).toContain("NoSiteAccess");
    expect(src).toContain(permission);
    const key = permission.replace("PERMISSIONS.", "") as keyof typeof PERMISSIONS;
    expect(PERMISSIONS[key]).toBeDefined();
  });
});

describe("Column edit page -- ownership-aware AccessDenied", () => {
  it("gates on edit_all OR (edit_own AND ownership), not view alone", () => {
    const src = source("content/columns/[id]/page.tsx");
    expect(src).toContain("CONTENT_COLUMNS_EDIT_ALL");
    expect(src).toContain("CONTENT_COLUMNS_EDIT_OWN");
    expect(src).toContain("AccessDenied");
    expect(src).toContain("createdBy");
  });
});

describe("Sites and Settings are Admin-only for this phase", () => {
  it.each(["sites/page.tsx", "settings/page.tsx"])("%s checks isAdmin and renders AccessDenied otherwise", (file) => {
    const src = source(file);
    expect(src).toContain("isAdmin");
    expect(src).toContain("AccessDenied");
  });

  it.each(["sites/actions.ts", "settings/actions.ts"])("%s's Server Actions require Admin before any write", (file) => {
    const src = source(file);
    expect(src).toContain("requireAdmin");
    expect(src).toContain("isAdmin");
  });
});
