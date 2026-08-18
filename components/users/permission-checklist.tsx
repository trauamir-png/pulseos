"use client";

import { PERMISSION_CATALOG, ROLE_PRESETS, type PermissionKey } from "@/lib/auth/permission-definitions";
import { SENSITIVE_PERMISSIONS, resolvePermissionClosure } from "@/lib/auth/permission-dependencies";

const PRESETS: { key: keyof typeof ROLE_PRESETS; label: string }[] = [
  { key: "owner", label: "Full Site Access" },
  { key: "editor", label: "Editor" },
  { key: "writer", label: "Writer" },
];

const CATEGORY_ORDER = [...new Set(PERMISSION_CATALOG.map((p) => p.category))];

/**
 * The New/Edit User checklist -- iterates PERMISSION_CATALOG directly (the
 * one source of truth) rather than a second hardcoded list. Presets only
 * pre-check ROLE_PRESETS' boxes; the resulting Set the parent form submits is
 * always the explicit checkbox state, never a stored "role."
 */
export function PermissionChecklist({
  selected,
  onChange,
  disabled,
}: {
  selected: ReadonlySet<PermissionKey>;
  onChange: (next: Set<PermissionKey>) => void;
  disabled?: boolean;
}) {
  function toggle(key: PermissionKey, checked: boolean) {
    const next = new Set(selected);
    if (checked) {
      // Option A (Phase 3 spec Section 12): auto-require prerequisites, visibly, in the checkbox state itself.
      for (const dep of resolvePermissionClosure([key])) next.add(dep);
    } else {
      next.delete(key);
    }
    onChange(next);
  }

  function applyPreset(key: keyof typeof ROLE_PRESETS) {
    onChange(new Set(ROLE_PRESETS[key]));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-[var(--muted)]">Presets:</span>
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            disabled={disabled}
            onClick={() => applyPreset(preset.key)}
            className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-60"
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(new Set())}
          className="text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-60"
        >
          Clear
        </button>
      </div>

      {CATEGORY_ORDER.map((category) => (
        <div key={category}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{category}</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {PERMISSION_CATALOG.filter((p) => p.category === category).map((perm) => (
              <label key={perm.key} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-[var(--foreground)] hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selected.has(perm.key)}
                  disabled={disabled}
                  onChange={(e) => toggle(perm.key, e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--border)]"
                />
                {perm.label}
                {SENSITIVE_PERMISSIONS.has(perm.key) && (
                  <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Sensitive</span>
                )}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
