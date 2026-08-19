"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createStandMedia,
  updateStandMedia,
  deleteStandMedia,
  setStandMediaStatus,
  type StandMediaInput,
} from "@/app/(dashboard)/content/actions";
import { DeleteConfirmDialog, DeleteIconButton } from "@/components/content/delete-confirm-dialog";
import { extractTikTokVideoId } from "@/lib/content/tiktok";
import type { StandMediaRecord } from "@/lib/dashboard/content-stand-media";

export function StandMediaForm({
  siteId,
  query,
  item,
}: {
  siteId: string;
  query: string;
  item: StandMediaRecord | null;
}) {
  const router = useRouter();
  const listHref = `/content/stand-media${query}`;
  const [title, setTitle] = useState(item?.title ?? "");
  const [tiktokUrl, setTiktokUrl] = useState(item?.tiktokUrl ?? "");
  const [sortOrder, setSortOrder] = useState(item?.sortOrder ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [statusPending, startStatusTransition] = useTransition();

  const previewVideoId = extractTikTokVideoId(tiktokUrl);

  function handleSave() {
    setError(null);
    const input: StandMediaInput = { title, tiktokUrl, sortOrder };
    startTransition(async () => {
      try {
        if (item) {
          await updateStandMedia(siteId, item.id, input);
          router.refresh();
        } else {
          const { id } = await createStandMedia(siteId, input);
          router.push(`/content/stand-media/${id}${query}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save.");
      }
    });
  }

  function handleTogglePublish() {
    if (!item) return;
    setError(null);
    startStatusTransition(async () => {
      try {
        await setStandMediaStatus(siteId, item.id, item.status === "published" ? "draft" : "published");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update status.");
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Title</label>
            <input
              dir="auto"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Shown publicly on the website"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">TikTok video URL</label>
            <input
              value={tiktokUrl}
              onChange={(e) => setTiktokUrl(e.target.value)}
              placeholder="https://www.tiktok.com/@account/video/…"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>

          {previewVideoId && (
            <div>
              <p className="mb-1.5 text-sm font-medium text-[var(--foreground)]">Preview</p>
              <iframe
                key={previewVideoId}
                src={`https://www.tiktok.com/embed/v2/${previewVideoId}`}
                className="h-[480px] w-full max-w-[325px] rounded-lg border border-[var(--border)]"
                allow="encrypted-media"
                title="TikTok preview"
              />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          {error && <p className="text-sm text-[var(--negative)]">{error}</p>}
          <button
            onClick={handleSave}
            disabled={pending}
            className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>

          {item && (
            <button
              onClick={handleTogglePublish}
              disabled={statusPending}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-gray-50 disabled:opacity-60"
            >
              {statusPending ? "Updating…" : item.status === "published" ? "Unpublish (set to Draft)" : "Publish"}
            </button>
          )}

          <div className="flex items-center justify-between border-t border-[var(--border)] pt-3">
            {item && (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  item.status === "published" ? "bg-green-50 text-green-700" : "bg-gray-100 text-[var(--muted)]"
                }`}
              >
                {item.status === "published" ? "Published" : "Draft"}
              </span>
            )}
            {item && <DeleteIconButton title="Delete video" onClick={() => setDeleteOpen(true)} />}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Sort order</label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
        </div>
      </div>

      {deleteOpen && item && (
        <DeleteConfirmDialog
          entityLabel="video"
          confirmText={item.title}
          onClose={() => setDeleteOpen(false)}
          onConfirm={async () => {
            await deleteStandMedia(siteId, item.id);
            router.push(listHref);
          }}
        />
      )}
    </div>
  );
}
