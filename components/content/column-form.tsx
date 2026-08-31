"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createColumn, updateColumn, setColumnStatus, deleteColumn, type ColumnInput } from "@/app/(dashboard)/content/actions";
import { ColumnEditor } from "@/components/content/column-editor";
import { MediaPicker } from "@/components/content/media-picker";
import { StatusBadge } from "@/components/content/status-badge";
import { DeleteConfirmDialog, DeleteIconButton } from "@/components/content/delete-confirm-dialog";
import type { ColumnDetail } from "@/lib/dashboard/content-columns";
import type { AuthorRecord } from "@/lib/dashboard/content-authors";
import type { CategoryRecord } from "@/lib/dashboard/content-categories";
import type { MediaAssetRecord } from "@/lib/dashboard/content-media";
import { formatDateTime } from "@/lib/format/datetime";

export function ColumnForm({
  siteId,
  query,
  column,
  authors,
  categories,
  media,
  timeZone,
  canPublish = false,
  canSchedule = false,
  canDelete = false,
}: {
  siteId: string;
  query: string;
  column: ColumnDetail | null;
  authors: AuthorRecord[];
  categories: CategoryRecord[];
  media: MediaAssetRecord[];
  /** Site's configured timezone, so the scheduled-until time renders identically on server and client. Falls back to UTC. */
  timeZone?: string;
  /** Controls the Publish/Unpublish, Schedule/Cancel-schedule, and Delete controls below --
   * mirrors the Server Action's own enforcement in content/actions.ts, so a user who can only
   * create/edit drafts never sees a control the action would reject anyway (Phase 2, Section 6). */
  canPublish?: boolean;
  canSchedule?: boolean;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const listHref = `/content/columns${query}`;
  const [title, setTitle] = useState(column?.title ?? "");
  const [subtitle, setSubtitle] = useState(column?.subtitle ?? "");
  const [slug, setSlug] = useState(column?.slug ?? "");
  const [body, setBody] = useState(column?.body ?? "");
  const [authorId, setAuthorId] = useState(column?.authorId ?? authors[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState(column?.categoryId ?? categories[0]?.id ?? "");
  const [tags, setTags] = useState(column?.tags.join(", ") ?? "");
  const [featuredImageId, setFeaturedImageId] = useState<string | null>(column?.featuredImageId ?? null);
  const [featuredImageUrl, setFeaturedImageUrl] = useState<string | null>(column?.featuredImageUrl ?? null);
  const [seoTitle, setSeoTitle] = useState(column?.seoTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(column?.metaDescription ?? "");
  const [ogImageId, setOgImageId] = useState<string | null>(column?.ogImageId ?? null);
  const [ogImageUrl, setOgImageUrl] = useState<string | null>(column?.ogImageUrl ?? null);
  const [scheduleAt, setScheduleAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [statusPending, startStatusTransition] = useTransition();

  function buildInput(): ColumnInput {
    return {
      title,
      subtitle,
      slug,
      body,
      featuredImageId,
      authorId,
      categoryId,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      seoTitle,
      metaDescription,
      ogImageId,
    };
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        if (column) {
          await updateColumn(siteId, column.id, buildInput());
          router.refresh();
        } else {
          const { id } = await createColumn(siteId, buildInput());
          router.push(`/content/columns/${id}${query}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save.");
      }
    });
  }

  function handleStatus(status: "draft" | "scheduled" | "published") {
    if (!column) return;
    setError(null);
    startStatusTransition(async () => {
      try {
        await setColumnStatus(siteId, column.id, status, status === "scheduled" ? new Date(scheduleAt).toISOString() : undefined);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update status.");
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Title</label>
            <input
              dir="auto"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Column title"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Subtitle</label>
            <input
              dir="auto"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Optional subtitle"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Slug</label>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="auto-generated from title"
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Tags (comma separated)</label>
              <input
                dir="auto"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Body</label>
            <ColumnEditor value={body} onChange={setBody} />
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">SEO</h2>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">SEO title</label>
            <input
              dir="auto"
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              placeholder="Defaults to the column title"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Meta description</label>
            <textarea
              dir="auto"
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <MediaPicker siteId={siteId} label="Social share (OG) image" value={ogImageId} valueUrl={ogImageUrl} media={media} onSelect={(id, url) => { setOgImageId(id); setOgImageUrl(url); }} />
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          {column && (
            <div className="flex items-center justify-between">
              <StatusBadge status={column.status} />
              {column.status === "scheduled" && column.scheduledAt && (
                <span className="text-xs text-[var(--muted)]">until {formatDateTime(column.scheduledAt, timeZone)}</span>
              )}
            </div>
          )}

          {error && <p className="text-sm text-[var(--negative)]">{error}</p>}

          <button
            onClick={handleSave}
            disabled={pending}
            className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>

          {column && (
            <>
              <a
                href={`/content/columns/${column.id}/preview${query}`}
                target="_blank"
                rel="noreferrer"
                className="block w-full rounded-lg border border-[var(--border)] px-3 py-2 text-center text-sm font-medium text-[var(--foreground)] hover:bg-gray-50"
              >
                Preview
              </a>

              {(canPublish || canSchedule) && (
                <div className="space-y-2 border-t border-[var(--border)] pt-3">
                  {canPublish && column.status !== "published" && (
                    <button
                      onClick={() => handleStatus("published")}
                      disabled={statusPending}
                      className="w-full rounded-lg border border-[var(--positive)] px-3 py-2 text-sm font-medium text-[var(--positive)] hover:bg-green-50 disabled:opacity-60"
                    >
                      Publish now
                    </button>
                  )}
                  {canPublish && column.status === "published" && (
                    <button
                      onClick={() => handleStatus("draft")}
                      disabled={statusPending}
                      className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-gray-50 disabled:opacity-60"
                    >
                      Unpublish
                    </button>
                  )}
                  {canSchedule && column.status === "draft" && (
                    <div className="flex items-center gap-2">
                      <input
                        type="datetime-local"
                        value={scheduleAt}
                        onChange={(e) => setScheduleAt(e.target.value)}
                        className="flex-1 rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                      />
                      <button
                        onClick={() => handleStatus("scheduled")}
                        disabled={statusPending || !scheduleAt}
                        className="whitespace-nowrap rounded-lg border border-amber-500 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                      >
                        Schedule
                      </button>
                    </div>
                  )}
                  {canSchedule && column.status === "scheduled" && (
                    <button
                      onClick={() => handleStatus("draft")}
                      disabled={statusPending}
                      className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-gray-50 disabled:opacity-60"
                    >
                      Cancel schedule
                    </button>
                  )}
                </div>
              )}

              {canDelete && (
                <div className="flex justify-end border-t border-[var(--border)] pt-3">
                  <DeleteIconButton title="Delete column" onClick={() => setDeleteOpen(true)} />
                </div>
              )}
            </>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Author</label>
            <select
              value={authorId}
              onChange={(e) => setAuthorId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            >
              {authors.length === 0 && <option value="">No authors yet</option>}
              {authors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            >
              {categories.length === 0 && <option value="">No categories yet</option>}
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <MediaPicker
            siteId={siteId}
            label="Featured image"
            value={featuredImageId}
            valueUrl={featuredImageUrl}
            media={media}
            onSelect={(id, url) => {
              setFeaturedImageId(id);
              setFeaturedImageUrl(url);
            }}
          />
        </div>
      </div>

      {deleteOpen && column && (
        <DeleteConfirmDialog
          entityLabel="column"
          confirmText={column.title}
          onClose={() => setDeleteOpen(false)}
          onConfirm={async () => {
            await deleteColumn(siteId, column.id);
            router.push(listHref);
          }}
        />
      )}
    </div>
  );
}
