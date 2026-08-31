"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

/**
 * Generalized version of DeleteSiteDialog (components/site-actions.tsx) for
 * Content entities -- type-to-confirm, surfaces the server action's error
 * message verbatim (used for the "N columns use this" delete-safety block).
 */
export function DeleteConfirmDialog({
  entityLabel,
  confirmText,
  description,
  onConfirm,
  onClose,
}: {
  entityLabel: string;
  confirmText: string;
  description?: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const matches = typed === confirmText;

  function handleDelete() {
    if (!matches) return;
    setError(null);
    startTransition(async () => {
      try {
        await onConfirm();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-16 sm:pt-24" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-xl border border-[var(--border)] bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-[var(--foreground)]">Delete {entityLabel}</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{description ?? "This cannot be undone."}</p>
        <label className="mb-1.5 mt-4 block text-xs font-medium text-[var(--foreground)]">Type &quot;{confirmText}&quot; to confirm</label>
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={confirmText}
          className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--negative)] focus:ring-1 focus:ring-[var(--negative)]"
        />
        {error && <p className="mt-2 text-xs text-[var(--negative)]">{error}</p>}
        <div className="mt-4 flex items-center gap-2">
          <button
            disabled={!matches || pending}
            onClick={handleDelete}
            className="rounded-lg bg-[var(--negative)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Deleting…" : "Delete"}
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

export function DeleteIconButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} className="inline-flex items-center gap-1 text-xs font-medium text-[var(--negative)] hover:underline">
      <Trash2 className="h-3.5 w-3.5" />
      Delete
    </button>
  );
}
