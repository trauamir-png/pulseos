"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { uploadAvatar, removeAvatar } from "@/app/(dashboard)/account/actions";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Avatar preview + Upload/Replace/Remove, shared by the self-service Account page and the admin Edit User page. Initials fallback when avatarUrl is null. */
export function AvatarManager({
  userId,
  displayName,
  avatarUrl,
  canEdit,
}: {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(avatarUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      try {
        const { avatarUrl: newUrl } = await uploadAvatar(userId, formData);
        setUrl(newUrl);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.");
      }
    });
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      try {
        await removeAvatar(userId);
        setUrl(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to remove avatar.");
      }
    });
  }

  return (
    <div className="flex items-center gap-4">
      {url ? (
        <Image src={url} alt="" width={64} height={64} className="h-16 w-16 shrink-0 rounded-full border border-[var(--border)] object-cover" unoptimized />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--accent-soft)] text-lg font-semibold text-[var(--accent)]">
          {initials(displayName)}
        </div>
      )}

      {canEdit && (
        <div className="space-y-1.5">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => fileRef.current?.click()}
              className="text-sm font-medium text-[var(--accent)] hover:underline disabled:opacity-60"
            >
              {pending ? "Saving…" : url ? "Replace photo" : "Upload photo"}
            </button>
            {url && (
              <button
                type="button"
                disabled={pending}
                onClick={handleRemove}
                className="text-sm font-medium text-[var(--negative)] hover:underline disabled:opacity-60"
              >
                Remove
              </button>
            )}
          </div>
          {error && <p className="text-xs text-[var(--negative)]">{error}</p>}
          <p className="text-xs text-[var(--muted)]">JPEG, PNG, or WebP. Max 5MB.</p>
        </div>
      )}
    </div>
  );
}
