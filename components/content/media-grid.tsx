"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, Upload, X } from "lucide-react";
import { uploadMedia, updateMediaMeta, deleteMedia } from "@/app/(dashboard)/content/actions";
import { DeleteConfirmDialog } from "@/components/content/delete-confirm-dialog";
import type { MediaAssetRecord } from "@/lib/dashboard/content-media";

function bytesToLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaGrid({ siteId, initialAssets }: { siteId: string; initialAssets: MediaAssetRecord[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [assets, setAssets] = useState(initialAssets);
  const [selected, setSelected] = useState<MediaAssetRecord | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleSearch(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("q", value);
    else params.delete("q");
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleFile(file: File) {
    setUploadError(null);
    const formData = new FormData();
    formData.set("file", file);
    startUpload(async () => {
      try {
        const { id, publicUrl } = await uploadMedia(siteId, formData);
        setAssets((prev) => [
          {
            id,
            siteId,
            storagePath: "",
            publicUrl,
            originalFilename: file.name,
            altText: null,
            title: null,
            mimeType: file.type,
            sizeBytes: file.size,
            width: null,
            height: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "Upload failed.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Media Library</h1>
        <div className="flex items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              defaultValue={searchParams.get("q") ?? ""}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search files…"
              className="w-full rounded-lg border border-[var(--border)] bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <button
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            <Upload className="h-4 w-4" />
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>

      {uploadError && <p className="text-sm text-[var(--negative)]">{uploadError}</p>}

      {assets.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] py-16 text-center text-sm text-[var(--muted)]">
          No media yet. Upload an image to get started.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {assets.map((asset) => (
            <button
              key={asset.id}
              onClick={() => setSelected(asset)}
              className="group overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] text-left"
            >
              <Image src={asset.publicUrl} alt={asset.altText ?? ""} width={200} height={140} className="h-28 w-full object-cover" unoptimized />
              <p className="truncate px-2 py-1.5 text-xs text-[var(--muted)]" title={asset.originalFilename}>
                {asset.originalFilename}
              </p>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <MediaDetailDialog
          siteId={siteId}
          asset={selected}
          onClose={() => setSelected(null)}
          onSaved={(updated) => {
            setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
            setSelected(null);
          }}
          onDeleted={(id) => {
            setAssets((prev) => prev.filter((a) => a.id !== id));
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

function MediaDetailDialog({
  siteId,
  asset,
  onClose,
  onSaved,
  onDeleted,
}: {
  siteId: string;
  asset: MediaAssetRecord;
  onClose: () => void;
  onSaved: (asset: MediaAssetRecord) => void;
  onDeleted: (id: string) => void;
}) {
  const [altText, setAltText] = useState(asset.altText ?? "");
  const [title, setTitle] = useState(asset.title ?? "");
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updateMediaMeta(siteId, asset.id, altText, title);
        onSaved({ ...asset, altText: altText || null, title: title || null });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-16" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Media details</h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <Image src={asset.publicUrl} alt={asset.altText ?? ""} width={400} height={220} className="mt-3 h-44 w-full rounded-lg object-cover" unoptimized />
        <p className="mt-2 text-xs text-[var(--muted)]">
          {asset.originalFilename} · {bytesToLabel(asset.sizeBytes)}
        </p>

        <div className="mt-3 space-y-3">
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
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Alt text</label>
            <input
              dir="auto"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
        </div>

        {error && <p className="mt-2 text-xs text-[var(--negative)]">{error}</p>}

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={handleSave}
            disabled={pending}
            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button onClick={() => setDeleteOpen(true)} className="text-xs font-medium text-[var(--negative)] hover:underline">
            Delete asset
          </button>
        </div>
      </div>

      {deleteOpen && (
        <DeleteConfirmDialog
          entityLabel="media asset"
          confirmText={asset.originalFilename}
          description="This removes the file from storage. Anywhere it's still referenced (Column, Author, Banner) will simply show no image."
          onClose={() => setDeleteOpen(false)}
          onConfirm={async () => {
            await deleteMedia(siteId, asset.id);
            onDeleted(asset.id);
          }}
        />
      )}
    </div>
  );
}
