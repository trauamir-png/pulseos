"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  addSiteAssignment,
  removeSiteAssignment,
  setSiteMembershipPermissions,
  setUserActive,
  updateUserDisplayName,
} from "@/app/(dashboard)/users/actions";
import { PermissionChecklist } from "./permission-checklist";
import type { SiteRecord } from "@/lib/dashboard/site";
import type { PermissionKey } from "@/lib/auth/permission-definitions";

/** Admin-only profile fields: display name and the global active/disabled toggle. */
export function ProfilePanel({
  userId,
  displayName,
  active,
  isAdmin,
  canEdit,
}: {
  userId: string;
  displayName: string;
  active: boolean;
  isAdmin: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [confirmingDisable, setConfirmingDisable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function saveName() {
    if (name.trim() === displayName) return;
    setError(null);
    startTransition(async () => {
      try {
        await updateUserDisplayName(userId, name);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save name.");
      }
    });
  }

  function toggleActive() {
    setError(null);
    startTransition(async () => {
      try {
        await setUserActive(userId, !active);
        setConfirmingDisable(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update user.");
      }
    });
  }

  if (!canEdit) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <p className="text-sm font-medium text-[var(--foreground)]">{displayName}</p>
        <span className={`mt-1 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${active ? "bg-green-50 text-green-700" : "bg-gray-100 text-[var(--muted)]"}`}>
          {active ? "Active" : "Disabled"}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>
        {isAdmin && <span className="mb-2.5 rounded-full bg-[var(--accent-soft)] px-2 py-1 text-xs font-semibold text-[var(--accent)]">Admin</span>}
      </div>

      {error && <p className="text-sm text-[var(--negative)]">{error}</p>}

      <div className="flex items-center gap-3 border-t border-[var(--border)] pt-3">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${active ? "bg-green-50 text-green-700" : "bg-gray-100 text-[var(--muted)]"}`}>
          {active ? "Active" : "Disabled"}
        </span>
        {!confirmingDisable ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => (active ? setConfirmingDisable(true) : toggleActive())}
            className="text-sm font-medium text-[var(--negative)] hover:underline disabled:opacity-60"
          >
            {active ? "Disable user" : "Reactivate user"}
          </button>
        ) : (
          <span className="flex items-center gap-2 text-sm">
            Disable this user? They will lose access to every site immediately.
            <button disabled={pending} onClick={toggleActive} className="font-medium text-[var(--negative)] hover:underline disabled:opacity-60">
              Confirm
            </button>
            <button onClick={() => setConfirmingDisable(false)} className="font-medium text-[var(--muted)] hover:text-[var(--foreground)]">
              Cancel
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

/** One site's membership card -- editing this site's permissions never touches any other site's row. */
export function SiteMembershipCard({
  userId,
  siteId,
  siteName,
  initialPermissions,
}: {
  userId: string;
  siteId: string;
  siteName: string;
  initialPermissions: PermissionKey[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<PermissionKey>>(new Set(initialPermissions));
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = selected.size !== initialPermissions.length || initialPermissions.some((p) => !selected.has(p));

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await setSiteMembershipPermissions(userId, siteId, [...selected]);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save permissions.");
      }
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      try {
        await removeSiteAssignment(userId, siteId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to remove site access.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">{siteName}</h3>
        {!confirmingRemove ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmingRemove(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--negative)] hover:underline disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove access
          </button>
        ) : (
          <span className="flex items-center gap-2 text-xs">
            Remove access to {siteName}?
            <button disabled={pending} onClick={remove} className="font-medium text-[var(--negative)] hover:underline disabled:opacity-60">
              Confirm
            </button>
            <button onClick={() => setConfirmingRemove(false)} className="font-medium text-[var(--muted)] hover:text-[var(--foreground)]">
              Cancel
            </button>
          </span>
        )}
      </div>

      <PermissionChecklist selected={selected} onChange={setSelected} disabled={pending} />

      {error && <p className="mt-3 text-sm text-[var(--negative)]">{error}</p>}

      <button
        type="button"
        disabled={pending || !dirty}
        onClick={save}
        className="mt-4 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save permissions"}
      </button>
    </div>
  );
}

/** Assigns this user to a site they don't currently have access to -- only offered for sites the current actor may manage. */
export function AddSiteForm({ userId, availableSites }: { userId: string; availableSites: SiteRecord[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [siteId, setSiteId] = useState(availableSites[0]?.id ?? "");
  const [selected, setSelected] = useState<Set<PermissionKey>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (availableSites.length === 0) return null;

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await addSiteAssignment(userId, siteId, [...selected]);
        setOpen(false);
        setSelected(new Set());
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add site access.");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        + Add site access
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="mb-3">
        <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Site</label>
        <select
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
        >
          {availableSites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <PermissionChecklist selected={selected} onChange={setSelected} disabled={pending} />

      {error && <p className="mt-3 text-sm text-[var(--negative)]">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add site access"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
