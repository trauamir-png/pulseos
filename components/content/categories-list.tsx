"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, ArrowUp, ArrowDown } from "lucide-react";
import { deleteCategory, reorderCategories } from "@/app/(dashboard)/content/actions";
import { CategoryFormDialog } from "@/components/content/category-form-dialog";
import { DeleteConfirmDialog, DeleteIconButton } from "@/components/content/delete-confirm-dialog";
import type { CategoryRecord } from "@/lib/dashboard/content-categories";

export function CategoriesList({ siteId, categories }: { siteId: string; categories: CategoryRecord[] }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRecord | null>(null);
  const [deleting, setDeleting] = useState<CategoryRecord | null>(null);
  const [, startTransition] = useTransition();

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    const reordered = [...categories];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    startTransition(async () => {
      await reorderCategories(siteId, reordered.map((c) => c.id));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Categories</h1>
        <button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New category
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-[var(--muted)]">
                  No categories yet.
                </td>
              </tr>
            ) : (
              categories.map((category, index) => (
                <tr key={category.id} className="border-b border-[var(--border)] last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                        className="rounded p-1 text-[var(--muted)] hover:bg-gray-100 disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        disabled={index === categories.length - 1}
                        onClick={() => move(index, 1)}
                        className="rounded p-1 text-[var(--muted)] hover:bg-gray-100 disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-[var(--foreground)]" dir="auto">
                    {category.name}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${category.active ? "bg-green-50 text-green-700" : "bg-gray-100 text-[var(--muted)]"}`}>
                      {category.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => {
                          setEditing(category);
                          setFormOpen(true);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <DeleteIconButton title="Delete category" onClick={() => setDeleting(category)} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <CategoryFormDialog
          siteId={siteId}
          category={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <DeleteConfirmDialog
          entityLabel="category"
          confirmText={deleting.name}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteCategory(siteId, deleting.id);
            router.refresh();
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
