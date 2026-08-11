export function KpiCard({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <p className="text-sm font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-[var(--foreground)]">
        {value}
        {suffix && <span className="ml-1 text-lg font-medium text-[var(--muted)]">{suffix}</span>}
      </p>
    </div>
  );
}
