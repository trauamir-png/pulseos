"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { ImagePlus, X } from "lucide-react";
import { uploadMedia } from "@/app/(dashboard)/content/actions";
import type { MediaAssetRecord } from "@/lib/dashboard/content-media";

/**
 * Shared image picker/uploader used by Column, Author, and Banner forms.
 * Browses the site's Media Library (passed in from the server page) and can
 * upload a new asset inline, which is immediately selected.
 */
export function MediaPicker({
  siteId,
  label,
  value,
  valueUrl,
  media,
  onSelect,
}: {
  siteId: string;
  label: string;
  value: string | null;
  valueUrl: string | null;
  media: MediaAssetRecord[];
  onSelect: (id: string | null, url: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState(media);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = q ? assets.filter((a) => a.originalFilename.toLowerCase().includes(q.toLowerCase())) : assets;

  function handleFile(file: File) {
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      try {
        const { id, publicUrl } = await uploadMedia(siteId, formData);
        const newAsset: MediaAssetRecord = {
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
        };
        setAssets((prev) => [newAsset, ...prev]);
        onSelect(id, publicUrl);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.");
      }
    });
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">{label}</label>
      {valueUrl ? (
        <div className="relative inline-block">
          <Image src={valueUrl} alt="" width={160} height={100} className="h-24 w-40 rounded-lg border border-[var(--border)] object-cover" unoptimized />
          <button
            type="button"
            onClick={() => onSelect(null, null)}
            className="absolute -right-2 -top-2 rounded-full bg-white p-1 text-[var(--negative)] shadow ring-1 ring-[var(--border)]"
            title="Remove"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-2 block text-xs font-medium text-[var(--accent)] hover:underline"
          >
            Change image
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-24 w-40 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--border)] text-xs font-medium text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          <ImagePlus className="h-5 w-5" />
          Choose image
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-16" onClick={() => setOpen(false)}>
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--border)] bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--foreground)]">Select image</h2>
              <button onClick={() => setOpen(false)} className="text-[var(--muted)] hover:text-[var(--foreground)]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search media…"
                className="flex-1 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              />
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
                type="button"
                disabled={pending}
                onClick={() => fileRef.current?.click()}
                className="whitespace-nowrap rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {pending ? "Uploading…" : "Upload new"}
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-[var(--negative)]">{error}</p>}

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {filtered.length === 0 && <p className="col-span-2 py-8 text-center text-sm text-[var(--muted)] sm:col-span-4">No media found.</p>}
              {filtered.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => {
                    onSelect(asset.id, asset.publicUrl);
                    setOpen(false);
                  }}
                  className={`overflow-hidden rounded-lg border-2 transition ${
                    asset.id === value ? "border-[var(--accent)]" : "border-transparent hover:border-[var(--border)]"
                  }`}
                >
                  <Image src={asset.publicUrl} alt={asset.altText ?? ""} width={140} height={90} className="h-20 w-full object-cover" unoptimized />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
