"use client";

import { useRef, useState, useTransition } from "react";
import { Check, Copy, Plus } from "lucide-react";
import { createSite, toggleSiteActive } from "@/app/(dashboard)/sites/actions";

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
          <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Domain</label>
          <input
            name="domain"
            required
            placeholder="example.com"
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
