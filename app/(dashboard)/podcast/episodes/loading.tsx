export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-32 animate-pulse rounded bg-[var(--border)]" />
          <div className="h-4 w-32 animate-pulse rounded bg-[var(--border)]" />
        </div>
        <div className="h-9 w-48 animate-pulse rounded-lg bg-[var(--border)]" />
      </div>
      <div className="h-96 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]" />
    </div>
  );
}
