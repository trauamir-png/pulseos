"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createAuthor, updateAuthor } from "@/app/(dashboard)/content/actions";
import { MediaPicker } from "@/components/content/media-picker";
import type { AuthorRecord } from "@/lib/dashboard/content-authors";
import type { MediaAssetRecord } from "@/lib/dashboard/content-media";

export function AuthorFormDialog({
  siteId,
  author,
  media,
  onClose,
}: {
  siteId: string;
  author: AuthorRecord | null;
  media: MediaAssetRecord[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(author?.name ?? "");
  const [slug, setSlug] = useState(author?.slug ?? "");
  const [shortBio, setShortBio] = useState(author?.shortBio ?? "");
  const [fullBio, setFullBio] = useState(author?.fullBio ?? "");
  const [email, setEmail] = useState(author?.email ?? "");
  const [active, setActive] = useState(author?.active ?? true);
  const [profileImageId, setProfileImageId] = useState<string | null>(author?.profileImageId ?? null);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(author?.profileImageUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        const input = {
          name,
          slug,
          profileImageId,
          shortBio,
          fullBio,
          email,
          socialLinks: author?.socialLinks ?? {},
          active,
        };
        if (author) await updateAuthor(siteId, author.id, input);
        else await createAuthor(siteId, input);
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save author.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-16" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">{author ? "Edit author" : "New author"}</h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Name</label>
            <input
              dir="auto"
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
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Short bio</label>
            <textarea
              dir="auto"
              value={shortBio}
              onChange={(e) => setShortBio(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Full bio</label>
            <textarea
              dir="auto"
              value={fullBio}
              onChange={(e) => setFullBio(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <MediaPicker
            siteId={siteId}
            label="Profile image"
            value={profileImageId}
            valueUrl={profileImageUrl}
            media={media}
            onSelect={(id, url) => {
              setProfileImageId(id);
              setProfileImageUrl(url);
            }}
          />
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
