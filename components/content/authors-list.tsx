"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { deleteAuthor } from "@/app/(dashboard)/content/actions";
import { AuthorFormDialog } from "@/components/content/author-form-dialog";
import { DeleteConfirmDialog, DeleteIconButton } from "@/components/content/delete-confirm-dialog";
import type { AuthorRecord } from "@/lib/dashboard/content-authors";
import type { MediaAssetRecord } from "@/lib/dashboard/content-media";

export function AuthorsList({ siteId, authors, media }: { siteId: string; authors: AuthorRecord[]; media: MediaAssetRecord[] }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AuthorRecord | null>(null);
  const [deleting, setDeleting] = useState<AuthorRecord | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Authors</h1>
        <button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New author
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              <th className="px-4 py-3"></th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {authors.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-[var(--muted)]">
                  No authors yet.
                </td>
              </tr>
            ) : (
              authors.map((author) => (
                <tr key={author.id} className="border-b border-[var(--border)] last:border-b-0">
                  <td className="px-4 py-3">
                    {author.profileImageUrl ? (
                      <Image src={author.profileImageUrl} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover" unoptimized />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-gray-100" />
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-[var(--foreground)]" dir="auto">
                    {author.name}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">{author.email ?? "–"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${author.active ? "bg-green-50 text-green-700" : "bg-gray-100 text-[var(--muted)]"}`}>
                      {author.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => {
                          setEditing(author);
                          setFormOpen(true);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <DeleteIconButton title="Delete author" onClick={() => setDeleting(author)} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <AuthorFormDialog
          siteId={siteId}
          author={editing}
          media={media}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <DeleteConfirmDialog
          entityLabel="author"
          confirmText={deleting.name}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteAuthor(siteId, deleting.id);
            router.refresh();
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
