/** Consistent, non-looping in-place fallback for authenticated users who hit a page/section they lack permission for. */
export function AccessDenied({ message }: { message?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-24 text-center">
      <p className="text-lg font-medium text-[var(--foreground)]">Access denied</p>
      <p className="max-w-sm text-sm text-[var(--muted)]">{message ?? "You don't have permission to view this page."}</p>
    </div>
  );
}

/** Shown instead of AccessDenied when the user has no accessible site at all -- never reveals names/data of sites they can't see. */
export function NoSiteAccess() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-24 text-center">
      <p className="text-lg font-medium text-[var(--foreground)]">No site access yet</p>
      <p className="max-w-sm text-sm text-[var(--muted)]">
        You don&apos;t currently have access to any site. Contact an administrator to be added.
      </p>
    </div>
  );
}
