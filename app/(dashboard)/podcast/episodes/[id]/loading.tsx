export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-4 w-20 animate-pulse rounded bg-[var(--border)]" />
      <div className="flex items-start gap-4">
        <div className="h-20 w-20 shrink-0 animate-pulse rounded-lg bg-[var(--border)]" />
        <div className="space-y-2">
          <div className="h-7 w-64 animate-pulse rounded bg-[var(--border)]" />
          <div className="h-4 w-40 animate-pulse rounded bg-[var(--border)]" />
        </div>
      </div>
      <div className="h-32 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]" />
        ))}
      </div>
    </div>
  );
}
