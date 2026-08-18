"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { StatusBadge } from "@/components/content/status-badge";
import type { ColumnListItem } from "@/lib/dashboard/content-columns";
import type { CategoryRecord } from "@/lib/dashboard/content-categories";
import { formatDate } from "@/lib/format/datetime";

export function ColumnsFilterBar({ categories }: { categories: CategoryRecord[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-xs">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
        <input
          defaultValue={searchParams.get("q") ?? ""}
          onChange={(e) => setParam("q", e.target.value)}
          placeholder="Search columns…"
          className="w-full rounded-lg border border-[var(--border)] bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>
      <select
        defaultValue={searchParams.get("status") ?? ""}
        onChange={(e) => setParam("status", e.target.value)}
        className="rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
      >
        <option value="">All statuses</option>
        <option value="draft">Draft</option>
        <option value="scheduled">Scheduled</option>
        <option value="published">Published</option>
      </select>
      <select
        defaultValue={searchParams.get("category") ?? ""}
        onChange={(e) => setParam("category", e.target.value)}
        className="rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ColumnsTable({
  columns,
  query,
  timeZone,
}: {
  columns: ColumnListItem[];
  query: string;
  /** Site's configured timezone, so the Updated date renders identically on server and client. Falls back to UTC. */
  timeZone?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Author</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3">Updated</th>
          </tr>
        </thead>
        <tbody>
          {columns.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-[var(--muted)]">
                No columns match your filters.
              </td>
            </tr>
          ) : (
            columns.map((col) => (
              <tr key={col.id} className="border-b border-[var(--border)] last:border-b-0">
                <td className="px-4 py-3">
                  <Link href={`/content/columns/${col.id}${query}`} dir="auto" className="font-medium text-[var(--foreground)] hover:text-[var(--accent)]">
                    {col.title}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={col.status} />
                </td>
                <td className="px-4 py-3 text-[var(--foreground)]">{col.authorName ?? "–"}</td>
                <td className="px-4 py-3 text-[var(--foreground)]">{col.categoryName ?? "–"}</td>
                <td className="px-4 py-3 text-[var(--muted)]">{formatDate(col.updatedAt, timeZone)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
