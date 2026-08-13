"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBanner, updateBanner, deleteBanner, type BannerInput } from "@/app/(dashboard)/content/actions";
import { MediaPicker } from "@/components/content/media-picker";
import { DeleteConfirmDialog, DeleteIconButton } from "@/components/content/delete-confirm-dialog";
import type { BannerRecord, BannerPlacement } from "@/lib/dashboard/content-banners";
import type { MediaAssetRecord } from "@/lib/dashboard/content-media";

const PLACEMENTS: { value: BannerPlacement; label: string }[] = [
  { value: "home_hero", label: "Home — Hero" },
  { value: "home_secondary", label: "Home — Secondary" },
  { value: "columns_top", label: "Columns — Top" },
  { value: "column_top", label: "Column page — Top" },
  { value: "column_bottom", label: "Column page — Bottom" },
];

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 16);
}

export function BannerForm({
  siteId,
  query,
  banner,
  media,
}: {
  siteId: string;
  query: string;
  banner: BannerRecord | null;
  media: MediaAssetRecord[];
}) {
  const router = useRouter();
  const listHref = `/content/banners${query}`;
  const [internalName, setInternalName] = useState(banner?.internalName ?? "");
  const [desktopImageId, setDesktopImageId] = useState<string | null>(banner?.desktopImageId ?? null);
  const [desktopImageUrl, setDesktopImageUrl] = useState<string | null>(banner?.desktopImageUrl ?? null);
  const [mobileImageId, setMobileImageId] = useState<string | null>(banner?.mobileImageId ?? null);
  const [mobileImageUrl, setMobileImageUrl] = useState<string | null>(banner?.mobileImageUrl ?? null);
  const [title, setTitle] = useState(banner?.title ?? "");
  const [subtitle, setSubtitle] = useState(banner?.subtitle ?? "");
  const [ctaText, setCtaText] = useState(banner?.ctaText ?? "");
  const [destinationUrl, setDestinationUrl] = useState(banner?.destinationUrl ?? "");
  const [placement, setPlacement] = useState<BannerPlacement>(banner?.placement ?? "home_hero");
  const [active, setActive] = useState(banner?.active ?? true);
  const [startAt, setStartAt] = useState(toDatetimeLocal(banner?.startAt ?? null));
  const [endAt, setEndAt] = useState(toDatetimeLocal(banner?.endAt ?? null));
  const [sortOrder, setSortOrder] = useState(banner?.sortOrder ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    if (!desktopImageId) {
      setError("A desktop image is required.");
      return;
    }
    setError(null);
    const input: BannerInput = {
      internalName,
      desktopImageId,
      mobileImageId,
      title,
      subtitle,
      ctaText,
      destinationUrl,
      placement,
      active,
      startAt: startAt ? new Date(startAt).toISOString() : null,
      endAt: endAt ? new Date(endAt).toISOString() : null,
      sortOrder,
    };
    startTransition(async () => {
      try {
        if (banner) {
          await updateBanner(siteId, banner.id, input);
          router.refresh();
        } else {
          await createBanner(siteId, input);
          router.push(listHref);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save.");
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Internal name</label>
            <input
              value={internalName}
              onChange={(e) => setInternalName(e.target.value)}
              placeholder="Only visible in PulseOS"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <div className="flex gap-4">
            <MediaPicker
              siteId={siteId}
              label="Desktop image"
              value={desktopImageId}
              valueUrl={desktopImageUrl}
              media={media}
              onSelect={(id, url) => {
                setDesktopImageId(id);
                setDesktopImageUrl(url);
              }}
            />
            <MediaPicker
              siteId={siteId}
              label="Mobile image (optional)"
              value={mobileImageId}
              valueUrl={mobileImageUrl}
              media={media}
              onSelect={(id, url) => {
                setMobileImageId(id);
                setMobileImageUrl(url);
              }}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Title</label>
            <input
              dir="auto"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Subtitle</label>
            <input
              dir="auto"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">CTA text</label>
              <input
                dir="auto"
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Destination URL</label>
              <input
                value={destinationUrl}
                onChange={(e) => setDestinationUrl(e.target.value)}
                placeholder="https://…"
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>
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
            {pending ? "Saving…" : "Save"}
          </button>

          {banner && (
            <div className="flex justify-end border-t border-[var(--border)] pt-3">
              <DeleteIconButton title="Delete banner" onClick={() => setDeleteOpen(true)} />
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Placement</label>
            <select
              value={placement}
              onChange={(e) => setPlacement(e.target.value as BannerPlacement)}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            >
              {PLACEMENTS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Sort order</label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Starts</label>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Ends</label>
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active
          </label>
        </div>
      </div>

      {deleteOpen && banner && (
        <DeleteConfirmDialog
          entityLabel="banner"
          confirmText={banner.internalName}
          onClose={() => setDeleteOpen(false)}
          onConfirm={async () => {
            await deleteBanner(siteId, banner.id);
            router.push(listHref);
          }}
        />
      )}
    </div>
  );
}
