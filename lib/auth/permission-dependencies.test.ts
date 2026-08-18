import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";
import { resolvePermissionClosure, SENSITIVE_PERMISSIONS } from "@/lib/auth/permission-dependencies";

/**
 * Phase 3 spec Section 12 (Option A -- auto-require prerequisites). Asserts
 * the closure only ever adds the narrow, documented prerequisite -- never a
 * broad, unrelated permission -- and is idempotent/order-independent.
 */

describe("resolvePermissionClosure", () => {
  it("adds content.columns.view when a columns management permission is selected without it", () => {
    const result = resolvePermissionClosure([PERMISSIONS.CONTENT_COLUMNS_CREATE]);
    expect(result.has(PERMISSIONS.CONTENT_COLUMNS_VIEW)).toBe(true);
    expect(result.has(PERMISSIONS.CONTENT_COLUMNS_CREATE)).toBe(true);
  });

  it("adds podcast.overview.view when podcast.episodes.view is selected", () => {
    const result = resolvePermissionClosure([PERMISSIONS.PODCAST_EPISODES_VIEW]);
    expect(result.has(PERMISSIONS.PODCAST_OVERVIEW_VIEW)).toBe(true);
  });

  it("does not add any permission for a key with no declared dependency", () => {
    const result = resolvePermissionClosure([PERMISSIONS.ANALYTICS_DASHBOARD_VIEW]);
    expect([...result]).toEqual([PERMISSIONS.ANALYTICS_DASHBOARD_VIEW]);
  });

  it("never introduces a permission outside the requested key's own narrow prerequisite", () => {
    const result = resolvePermissionClosure([PERMISSIONS.CONTENT_COLUMNS_DELETE]);
    expect([...result].sort()).toEqual([PERMISSIONS.CONTENT_COLUMNS_DELETE, PERMISSIONS.CONTENT_COLUMNS_VIEW].sort());
  });

  it("is a no-op when the prerequisite is already present", () => {
    const result = resolvePermissionClosure([PERMISSIONS.CONTENT_COLUMNS_VIEW, PERMISSIONS.CONTENT_COLUMNS_PUBLISH]);
    expect([...result].sort()).toEqual([PERMISSIONS.CONTENT_COLUMNS_PUBLISH, PERMISSIONS.CONTENT_COLUMNS_VIEW].sort());
  });
});

describe("SENSITIVE_PERMISSIONS", () => {
  it("flags site.users.manage as sensitive, informationally -- this must never gate anything by itself", () => {
    expect(SENSITIVE_PERMISSIONS.has(PERMISSIONS.SITE_USERS_MANAGE)).toBe(true);
    expect(SENSITIVE_PERMISSIONS.has(PERMISSIONS.CONTENT_COLUMNS_VIEW)).toBe(false);
  });
});
