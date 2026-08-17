import { describe, expect, it } from "vitest";
import { PERMISSION_CATALOG, PERMISSION_KEYS, ROLE_PRESETS, isPermissionKey } from "@/lib/auth/permission-definitions";

describe("permission definitions", () => {
  it("has no duplicate keys", () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
  });

  it("catalog covers exactly the same set of keys as PERMISSION_KEYS -- no extra, none missing", () => {
    const catalogKeys = PERMISSION_CATALOG.map((entry) => entry.key);
    expect(new Set(catalogKeys)).toEqual(new Set(PERMISSION_KEYS));
    expect(catalogKeys.length).toBe(PERMISSION_KEYS.length);
  });

  it("every role preset only references real, known permission keys", () => {
    for (const [role, keys] of Object.entries(ROLE_PRESETS)) {
      for (const key of keys) {
        expect(isPermissionKey(key), `${role} preset references unknown key "${key}"`).toBe(true);
      }
    }
  });

  it("owner preset grants everything; writer preset stays content-only", () => {
    expect(new Set(ROLE_PRESETS.owner)).toEqual(new Set(PERMISSION_KEYS));
    for (const key of ROLE_PRESETS.writer) {
      expect(key.startsWith("content.columns.") || key.startsWith("chat.")).toBe(true);
    }
  });

  it("isPermissionKey rejects unknown strings, including near-misses", () => {
    expect(isPermissionKey("content.columns.view")).toBe(true);
    expect(isPermissionKey("content.columns.view_all")).toBe(false);
    expect(isPermissionKey("is_admin")).toBe(false);
    expect(isPermissionKey("")).toBe(false);
  });
});
