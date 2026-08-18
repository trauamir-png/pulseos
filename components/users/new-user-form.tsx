"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOrInviteUser } from "@/app/(dashboard)/users/actions";
import { PermissionChecklist } from "./permission-checklist";
import type { SiteRecord } from "@/lib/dashboard/site";
import type { PermissionKey } from "@/lib/auth/permission-definitions";

export function NewUserForm({ sites }: { sites: SiteRecord[] }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedSiteIds, setSelectedSiteIds] = useState<Set<string>>(new Set());
  const [permissionsBySite, setPermissionsBySite] = useState<Record<string, Set<PermissionKey>>>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ tempPassword: string | null; reusedExistingAccount: boolean; email: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleSite(siteId: string) {
    setSelectedSiteIds((prev) => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (selectedSiteIds.size === 0) {
      setError("Select at least one site.");
      return;
    }
    const assignments = [...selectedSiteIds].map((siteId) => ({
      siteId,
      permissions: [...(permissionsBySite[siteId] ?? new Set<PermissionKey>())],
    }));
    startTransition(async () => {
      try {
        const res = await createOrInviteUser({ displayName, email, assignments });
        setResult({ tempPassword: res.tempPassword, reusedExistingAccount: res.reusedExistingAccount, email });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create user.");
      }
    });
  }

  if (result) {
    return (
      <div className="space-y-3 rounded-xl border border-green-200 bg-green-50 p-5">
        <h2 className="text-sm font-semibold text-green-900">User created</h2>
        {result.reusedExistingAccount ? (
          <p className="text-sm text-green-800">
            {result.email} already had a PulseOS login — their existing account was linked to the new site access below. No new
            password was generated.
          </p>
        ) : (
          <>
            <p className="text-sm text-green-800">
              Share this temporary password with {result.email} directly — it will not be shown again. They can sign in
              immediately and should change it afterward.
            </p>
            <code className="block rounded-lg bg-white px-3 py-2 font-mono text-sm text-[var(--foreground)]">{result.tempPassword}</code>
          </>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => router.push("/users")}
            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            Back to Users
          </button>
          <button
            onClick={() => {
              setResult(null);
              setDisplayName("");
              setEmail("");
              setSelectedSiteIds(new Set());
              setPermissionsBySite({});
            }}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-gray-50"
          >
            Add another user
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Name</label>
          <input
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Email</label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-[var(--foreground)]">Site access</p>
        <div className="space-y-3">
          {sites.map((site) => {
            const isSelected = selectedSiteIds.has(site.id);
            return (
              <div key={site.id} className="rounded-lg border border-[var(--border)] p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSite(site.id)}
                    className="h-4 w-4 rounded border-[var(--border)]"
                  />
                  {site.name}
                </label>
                {isSelected && (
                  <div className="mt-3 border-t border-[var(--border)] pt-3">
                    <PermissionChecklist
                      selected={permissionsBySite[site.id] ?? new Set()}
                      onChange={(next) => setPermissionsBySite((prev) => ({ ...prev, [site.id]: next }))}
                    />
                  </div>
                )}
              </div>
            );
          })}
          {sites.length === 0 && <p className="text-sm text-[var(--muted)]">No sites available to assign.</p>}
        </div>
      </div>

      {error && <p className="text-sm text-[var(--negative)]">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create user"}
      </button>
    </form>
  );
}
