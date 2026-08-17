import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PRESETS, type PermissionKey } from "@/lib/auth/permission-definitions";
import { WEB_ANALYTICS_ITEMS, PODCAST_ANALYTICS_ITEMS, CONTENT_ITEMS, GLOBAL_ITEMS, canSeeNavItem } from "@/components/sidebar";

/**
 * Phase 2 spec Section 14 "Sidebar" requirement: simulate permission sets and
 * assert exactly which nav items a non-Admin user would see. These test the
 * same pure data/logic the Sidebar component renders from (no jsdom/RTL in
 * this repo -- see vitest.config.ts -- so this is a data-level simulation,
 * not a rendered-DOM test).
 */

describe("sidebar nav item -> permission mapping", () => {
  it("matches the Phase 2 spec's exact mapping table", () => {
    const byHref = (items: { href: string; permission: PermissionKey }[], href: string) =>
      items.find((i) => i.href === href)?.permission;

    expect(byHref(WEB_ANALYTICS_ITEMS, "/")).toBe(PERMISSIONS.ANALYTICS_DASHBOARD_VIEW);
    expect(byHref(WEB_ANALYTICS_ITEMS, "/realtime")).toBe(PERMISSIONS.ANALYTICS_REALTIME_VIEW);
    expect(byHref(WEB_ANALYTICS_ITEMS, "/pages")).toBe(PERMISSIONS.ANALYTICS_PAGES_VIEW);
    expect(byHref(WEB_ANALYTICS_ITEMS, "/sources")).toBe(PERMISSIONS.ANALYTICS_SOURCES_VIEW);
    expect(byHref(WEB_ANALYTICS_ITEMS, "/events")).toBe(PERMISSIONS.ANALYTICS_EVENTS_VIEW);

    expect(byHref(PODCAST_ANALYTICS_ITEMS, "/podcast")).toBe(PERMISSIONS.PODCAST_OVERVIEW_VIEW);
    expect(byHref(PODCAST_ANALYTICS_ITEMS, "/podcast/episodes")).toBe(PERMISSIONS.PODCAST_EPISODES_VIEW);

    expect(byHref(CONTENT_ITEMS, "/content/columns")).toBe(PERMISSIONS.CONTENT_COLUMNS_VIEW);
    expect(byHref(CONTENT_ITEMS, "/content/banners")).toBe(PERMISSIONS.CONTENT_BANNERS_MANAGE);
    expect(byHref(CONTENT_ITEMS, "/content/media")).toBe(PERMISSIONS.CONTENT_MEDIA_MANAGE);
    expect(byHref(CONTENT_ITEMS, "/content/authors")).toBe(PERMISSIONS.CONTENT_AUTHORS_MANAGE);
    expect(byHref(CONTENT_ITEMS, "/content/categories")).toBe(PERMISSIONS.CONTENT_CATEGORIES_MANAGE);

    // Sites/Settings are Admin-only, not permission-gated -- no `permission` field at all.
    expect(GLOBAL_ITEMS.map((i) => i.href)).toEqual(["/sites", "/settings"]);
  });

  it("does not include Writers Chat or Users & Permissions -- neither exists in the sidebar yet", () => {
    const allHrefs = [...WEB_ANALYTICS_ITEMS, ...PODCAST_ANALYTICS_ITEMS, ...CONTENT_ITEMS, ...GLOBAL_ITEMS].map((i) => i.href);
    expect(allHrefs.some((h) => h.includes("chat"))).toBe(false);
    expect(allHrefs.some((h) => h.includes("users"))).toBe(false);
  });
});

describe("canSeeNavItem", () => {
  it("Admin sees every item regardless of granted permissions", () => {
    const noPermissions = new Set<PermissionKey>();
    for (const item of [...WEB_ANALYTICS_ITEMS, ...PODCAST_ANALYTICS_ITEMS, ...CONTENT_ITEMS]) {
      expect(canSeeNavItem(true, noPermissions, item)).toBe(true);
    }
  });

  it("a non-Admin with zero permissions sees nothing", () => {
    const noPermissions = new Set<PermissionKey>();
    for (const item of [...WEB_ANALYTICS_ITEMS, ...PODCAST_ANALYTICS_ITEMS, ...CONTENT_ITEMS]) {
      expect(canSeeNavItem(false, noPermissions, item)).toBe(false);
    }
  });

  it("spec example: a Writer permission set surfaces only Columns, and none of Analytics/Podcast/other Content items", () => {
    // Spec Section 14's exact example set: content.columns.view,
    // content.columns.create, content.columns.edit_own, chat.writers.access
    // (the last has no nav item at all -- Writers Chat doesn't exist yet).
    const writerPermissions = new Set<PermissionKey>(ROLE_PRESETS.writer);
    expect([...writerPermissions]).toEqual([
      PERMISSIONS.CONTENT_COLUMNS_VIEW,
      PERMISSIONS.CONTENT_COLUMNS_CREATE,
      PERMISSIONS.CONTENT_COLUMNS_EDIT_OWN,
      PERMISSIONS.CHAT_WRITERS_ACCESS,
    ]);

    const visibleWebAnalytics = WEB_ANALYTICS_ITEMS.filter((item) => canSeeNavItem(false, writerPermissions, item));
    const visiblePodcast = PODCAST_ANALYTICS_ITEMS.filter((item) => canSeeNavItem(false, writerPermissions, item));
    const visibleContent = CONTENT_ITEMS.filter((item) => canSeeNavItem(false, writerPermissions, item));

    expect(visibleWebAnalytics).toEqual([]);
    expect(visiblePodcast).toEqual([]);
    expect(visibleContent.map((i) => i.href)).toEqual(["/content/columns"]);

    // Sites/Settings are gated on isAdmin directly in the Sidebar component,
    // never on a permission -- a Writer (isAdmin = false) never sees them.
  });

  it("a permission granted for one module does not leak visibility into another module's items", () => {
    const analyticsOnly = new Set<PermissionKey>([PERMISSIONS.ANALYTICS_DASHBOARD_VIEW]);
    expect(canSeeNavItem(false, analyticsOnly, WEB_ANALYTICS_ITEMS[0])).toBe(true);
    for (const item of [...PODCAST_ANALYTICS_ITEMS, ...CONTENT_ITEMS]) {
      expect(canSeeNavItem(false, analyticsOnly, item)).toBe(false);
    }
  });
});
