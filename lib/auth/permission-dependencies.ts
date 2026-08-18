import { PERMISSIONS, type PermissionKey } from "@/lib/auth/permission-definitions";

/**
 * Permission prerequisites (Phase 3 spec Section 12, Option A -- auto-require
 * rather than warn-before-save). Each entry means "granting the key also
 * requires granting every permission in its list." Deliberately narrow: only
 * the exact view permission a management action needs, never a broader
 * unrelated grant.
 */
const PERMISSION_DEPENDENCIES: Partial<Record<PermissionKey, PermissionKey[]>> = {
  [PERMISSIONS.CONTENT_COLUMNS_CREATE]: [PERMISSIONS.CONTENT_COLUMNS_VIEW],
  [PERMISSIONS.CONTENT_COLUMNS_EDIT_OWN]: [PERMISSIONS.CONTENT_COLUMNS_VIEW],
  [PERMISSIONS.CONTENT_COLUMNS_EDIT_ALL]: [PERMISSIONS.CONTENT_COLUMNS_VIEW],
  [PERMISSIONS.CONTENT_COLUMNS_PUBLISH]: [PERMISSIONS.CONTENT_COLUMNS_VIEW],
  [PERMISSIONS.CONTENT_COLUMNS_SCHEDULE]: [PERMISSIONS.CONTENT_COLUMNS_VIEW],
  [PERMISSIONS.CONTENT_COLUMNS_DELETE]: [PERMISSIONS.CONTENT_COLUMNS_VIEW],
  [PERMISSIONS.PODCAST_EPISODES_VIEW]: [PERMISSIONS.PODCAST_OVERVIEW_VIEW],
};

/** Permissions flagged for a "sensitive" UI treatment (Section 12) -- informational only, never gates anything. */
export const SENSITIVE_PERMISSIONS: ReadonlySet<PermissionKey> = new Set([PERMISSIONS.SITE_USERS_MANAGE]);

/**
 * Expands a selected permission set to include every prerequisite,
 * transitively. Used both client-side (auto-check the dependency's box) and
 * server-side in the Server Action right before writing membership_permissions,
 * so the stored set is always self-consistent regardless of what the client sent.
 */
export function resolvePermissionClosure(keys: Iterable<PermissionKey>): Set<PermissionKey> {
  const result = new Set<PermissionKey>(keys);
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of [...result]) {
      const deps = PERMISSION_DEPENDENCIES[key];
      if (!deps) continue;
      for (const dep of deps) {
        if (!result.has(dep)) {
          result.add(dep);
          changed = true;
        }
      }
    }
  }
  return result;
}
