export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-48 animate-pulse rounded bg-[var(--border)]" />
        <div className="h-4 w-32 animate-pulse rounded bg-[var(--border)]" />
      </div>
      <div className="h-24 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]" />
    </div>
  );
}
