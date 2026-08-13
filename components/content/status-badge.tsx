import type { ColumnStatus } from "@/lib/dashboard/content-columns";

const STYLES: Record<ColumnStatus, string> = {
  draft: "bg-gray-100 text-[var(--muted)]",
  scheduled: "bg-amber-50 text-amber-700",
  published: "bg-green-50 text-green-700",
};

const LABELS: Record<ColumnStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
};

export function StatusBadge({ status }: { status: ColumnStatus }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[status]}`}>{LABELS[status]}</span>;
}
