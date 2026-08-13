"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Copy, Plus, Trash2 } from "lucide-react";
import { createSite, toggleSiteActive, toggleSiteModule, setSiteDomain, deleteSite } from "@/app/(dashboard)/sites/actions";
import { MODULE_KEYS } from "@/lib/dashboard/modules";
import type { SiteRecord } from "@/lib/dashboard/site";

export function NewSiteForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createSite(formData);
        formRef.current?.reset();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create site.");
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
      >
        <Plus className="h-4 w-4" />
        New site
      </button>
    );
  }

  return (
    <form ref={formRef} action={handleSubmit} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
      <h2 className="text-sm font-semibold text-[var(--foreground)]">New site</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Name</label>
          <input
            name="name"
            required
            placeholder="Amir Trau"
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Domain (optional)</label>
          <input
            name="domain"
            placeholder="example.com — leave empty for podcast-only"
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Timezone</label>
          <input
            name="timezone"
            defaultValue="Asia/Jerusalem"
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>
      </div>
      {error && <p className="text-sm text-[var(--negative)]">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create site"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function CopySnippetButton({ snippet }: { snippet: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(snippet);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-gray-50"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy snippet"}
    </button>
  );
}

export function ActiveToggle({ siteId, active }: { siteId: string; active: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => toggleSiteActive(siteId, !active))}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition disabled:opacity-60 ${
        active ? "bg-green-50 text-green-700" : "bg-gray-100 text-[var(--muted)]"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </button>
  );
}

const MODULE_LABELS: Record<string, string> = {
  web_analytics: "Web Analytics",
  podcast_analytics: "Podcast Analytics",
  content_management: "Content Management",
};

export function ModulesEditor({ siteId, activeModules, hasDomain }: { siteId: string; activeModules: string[]; hasDomain: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle(key: string, nextActive: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        await toggleSiteModule(siteId, key, nextActive);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update module.");
      }
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {MODULE_KEYS.map((key) => {
          const active = activeModules.includes(key);
          const blocked = key === "web_analytics" && !active && !hasDomain;
          return (
            <button
              key={key}
              disabled={pending || blocked}
              title={blocked ? "Add a domain to this site before enabling Web Analytics." : undefined}
              onClick={() => handleToggle(key, !active)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:opacity-60 ${
                active
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--border)] bg-white text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {MODULE_LABELS[key] ?? key} · {active ? "On" : "Off"}
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-[var(--negative)]">{error}</p>}
    </div>
  );
}

export function AddDomainForm({ siteId }: { siteId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    const domain = String(formData.get("domain") || "");
    startTransition(async () => {
      try {
        await setSiteDomain(siteId, domain);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add domain.");
      }
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs font-medium text-[var(--accent)] hover:underline">
        + Add domain
      </button>
    );
  }

  return (
    <form action={handleSubmit} className="flex items-center gap-2">
      <input
        name="domain"
        autoFocus
        placeholder="example.com"
        className="rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)]">
        Cancel
      </button>
      {error && <p className="text-xs text-[var(--negative)]">{error}</p>}
    </form>
  );
}

export function DeleteSiteButton({
  siteId,
  siteName,
  onDeleted,
}: {
  siteId: string;
  siteName: string;
  onDeleted: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--negative)] hover:underline"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete site
      </button>
      {open && (
        <DeleteSiteDialog
          siteId={siteId}
          siteName={siteName}
          onClose={() => setOpen(false)}
          onDeleted={(name) => {
            setOpen(false);
            onDeleted(name);
          }}
        />
      )}
    </>
  );
}

function DeleteSiteDialog({
  siteId,
  siteName,
  onClose,
  onDeleted,
}: {
  siteId: string;
  siteName: string;
  onClose: () => void;
  onDeleted: (name: string) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const matches = typed === siteName;

  function handleDelete() {
    if (!matches) return;
    setError(null);
    startTransition(async () => {
      try {
        const { name } = await deleteSite(siteId, typed);

        // If the deleted site was the one selected in the URL, drop it so
        // the Topbar/Sidebar fall back to another site instead of pointing
        // at an id that no longer exists.
        if (searchParams.get("site") === siteId) {
          const params = new URLSearchParams(searchParams.toString());
          params.delete("site");
          const query = params.toString();
          router.replace(query ? `/sites?${query}` : "/sites");
        }

        // revalidatePath("/sites") in the server action only marks the route
        // stale; router.refresh() is what actually forces this route's
        // Server Components -- including the shared layout that feeds the
        // Topbar/Sidebar site list -- to refetch now, without a manual reload.
        router.refresh();
        onDeleted(name);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete site.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-24" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-[var(--foreground)]">Delete site</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          This permanently deletes <span className="font-semibold text-[var(--foreground)]">{siteName}</span> and all
          of its data — sessions, page views, events, podcasts, episodes, listening activity, and module settings.
          This cannot be undone.
        </p>
        <label className="mb-1.5 mt-4 block text-xs font-medium text-[var(--foreground)]">
          Type &quot;{siteName}&quot; to confirm
        </label>
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={siteName}
          className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--negative)] focus:ring-1 focus:ring-[var(--negative)]"
        />
        {error && <p className="mt-2 text-xs text-[var(--negative)]">{error}</p>}
        <div className="mt-4 flex items-center gap-2">
          <button
            disabled={!matches || pending}
            onClick={handleDelete}
            className="rounded-lg bg-[var(--negative)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Deleting…" : "Delete site"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function SitesList({ sites, appUrl }: { sites: SiteRecord[]; appUrl: string }) {
  const [deletedName, setDeletedName] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {deletedName && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          &quot;{deletedName}&quot; and all of its data were deleted.
        </div>
      )}

      <div className="space-y-4">
        {sites.length === 0 && <p className="text-sm text-[var(--muted)]">No sites yet. Create one above.</p>}
        {sites.map((site) => {
          const snippet = `<script defer src="${appUrl}/tracker.js" data-site="${site.site_key}"></script>`;
          return (
            <div key={site.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-[var(--foreground)]">{site.name}</h2>
                    <ActiveToggle siteId={site.id} active={site.active} />
                  </div>
                  <p className="flex items-center gap-2 text-sm text-[var(--muted)]">
                    {site.domain ? (
                      <span>{site.domain}</span>
                    ) : (
                      <>
                        <span>No domain (podcast-only)</span>
                        <AddDomainForm siteId={site.id} />
                      </>
                    )}
                    <span>· {site.timezone}</span>
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Modules</span>
                <ModulesEditor siteId={site.id} activeModules={site.modules} hasDomain={!!site.domain} />
              </div>

              {site.domain && (
                <div className="mt-4 rounded-lg bg-gray-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Tracker snippet</span>
                    <CopySnippetButton snippet={snippet} />
                  </div>
                  <pre className="overflow-x-auto text-xs text-[var(--foreground)]">{snippet}</pre>
                </div>
              )}

              <div className="mt-4 flex justify-end border-t border-[var(--border)] pt-3">
                <DeleteSiteButton siteId={site.id} siteName={site.name} onDeleted={setDeletedName} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
