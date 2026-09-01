"use client";

import { useEffect } from "react";

/**
 * Defensive fallback only -- the actual save-flow fix was removing the
 * redundant router.refresh() in status-snapshot-form.tsx (the Server
 * Action's own revalidatePath already bundles a re-render into its
 * response). This boundary just means that *if* some future/unrelated
 * render error ever reaches this route, it degrades to a recoverable
 * in-page message instead of an app-wide crash -- see startTransition's
 * "unhandled errors bubble up to the nearest error boundary" in this fork's
 * error handling guide. retry() re-renders this segment; since a Server
 * Action's mutation completes before this boundary is ever reached,
 * retrying reliably shows whatever save already succeeded.
 */
export default function StatusSnapshotError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div dir="rtl" className="flex h-full flex-col items-center justify-center gap-3 py-24 text-center">
      <p className="text-lg font-medium text-[var(--foreground)]">משהו השתבש</p>
      <p className="max-w-sm text-sm text-[var(--muted)]">
        השמירה כנראה בוצעה בהצלחה, אך הצגת העדכון נכשלה. נסו לרענן.
      </p>
      <button
        onClick={() => retry()}
        className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
      >
        נסה שוב
      </button>
    </div>
  );
}
