"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createCategory, updateCategory } from "@/app/(dashboard)/content/actions";
import type { CategoryRecord } from "@/lib/dashboard/content-categories";

export function CategoryFormDialog({ siteId, category, onClose }: { siteId: string; category: CategoryRecord | null; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [active, setActive] = useState(category?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        const input = { name, slug, description, active };
        if (category) await updateCategory(siteId, category.id, input);
        else await createCategory(siteId, input);
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save category.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-24" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">{category ? "Edit category" : "New category"}</h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Name</label>
            <input
              dir="auto"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Slug</label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="auto-generated from name"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Description</label>
            <textarea
              dir="auto"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-[var(--negative)]">{error}</p>}

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={pending || !name.trim()}
            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
