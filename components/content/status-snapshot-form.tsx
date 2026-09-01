"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createStatusSnapshot,
  updateStatusSnapshot,
  deleteStatusSnapshot,
  setStatusSnapshotStatus,
  type StatusSnapshotInput,
} from "@/app/(dashboard)/content/actions";
import { DeleteConfirmDialog, DeleteIconButton } from "@/components/content/delete-confirm-dialog";
import type { StatusSnapshotRecord } from "@/lib/dashboard/content-status-snapshots";

export function StatusSnapshotForm({
  siteId,
  query,
  item,
}: {
  siteId: string;
  query: string;
  item: StatusSnapshotRecord | null;
}) {
  const router = useRouter();
  const listHref = `/content/status-snapshot${query}`;
  const [headline, setHeadline] = useState(item?.headline ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [statusPending, startStatusTransition] = useTransition();

  function handleSave() {
    setError(null);
    const input: StatusSnapshotInput = { headline, body };
    startTransition(async () => {
      try {
        if (item) {
          await updateStatusSnapshot(siteId, item.id, input);
          router.refresh();
        } else {
          const { id } = await createStatusSnapshot(siteId, input);
          router.push(`/content/status-snapshot/${id}${query}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "השמירה נכשלה.");
      }
    });
  }

  function handleTogglePublish() {
    if (!item) return;
    setError(null);
    startStatusTransition(async () => {
      try {
        await setStatusSnapshotStatus(siteId, item.id, item.status === "published" ? "draft" : "published");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "עדכון הסטטוס נכשל.");
      }
    });
  }

  return (
    <div dir="rtl" className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">כותרת</label>
            <input
              dir="auto"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="מוצג לגולשים באתר"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">תקציר / תוכן</label>
            <textarea
              dir="auto"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="תיאור קצר של תמונת המצב הנוכחית"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
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
            {pending ? "שומר…" : "שמור"}
          </button>

          {item && (
            <button
              onClick={handleTogglePublish}
              disabled={statusPending}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-gray-50 disabled:opacity-60"
            >
              {statusPending ? "מעדכן…" : item.status === "published" ? "בטל פרסום (החזר לטיוטה)" : "פרסם"}
            </button>
          )}

          {item && (
            <p className="text-xs text-[var(--muted)]">
              {item.status === "published"
                ? "שמירה מעדכנת את התוכן ומשאירה אותו במצב פורסם. ביטול פרסום מחזיר אותו לטיוטה."
                : "שמירה מעדכנת את הטיוטה מבלי לפרסם אותה. פרסום יחשוף אותה לגולשים."}
            </p>
          )}

          <div className="flex items-center justify-between border-t border-[var(--border)] pt-3">
            {item && (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  item.status === "published" ? "bg-green-50 text-green-700" : "bg-gray-100 text-[var(--muted)]"
                }`}
              >
                {item.status === "published" ? "פורסם" : "טיוטה"}
              </span>
            )}
            {item && <DeleteIconButton title="מחק עדכון" onClick={() => setDeleteOpen(true)} />}
          </div>
        </div>
      </div>

      {deleteOpen && item && (
        <DeleteConfirmDialog
          entityLabel="עדכון"
          confirmText={item.headline}
          onClose={() => setDeleteOpen(false)}
          onConfirm={async () => {
            await deleteStatusSnapshot(siteId, item.id);
            router.push(listHref);
          }}
        />
      )}
    </div>
  );
}
