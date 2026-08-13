import Link from "next/link";
import Image from "next/image";
import type { BannerRecord } from "@/lib/dashboard/content-banners";

const PLACEMENT_LABELS: Record<string, string> = {
  home_hero: "Home — Hero",
  home_secondary: "Home — Secondary",
  columns_top: "Columns — Top",
  column_top: "Column page — Top",
  column_bottom: "Column page — Bottom",
};

export function BannersTable({ banners, query }: { banners: BannerRecord[]; query: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            <th className="px-4 py-3"></th>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Placement</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Window</th>
          </tr>
        </thead>
        <tbody>
          {banners.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-[var(--muted)]">
                No banners yet.
              </td>
            </tr>
          ) : (
            banners.map((banner) => (
              <tr key={banner.id} className="border-b border-[var(--border)] last:border-b-0">
                <td className="px-4 py-3">
                  {banner.desktopImageUrl ? (
                    <Image src={banner.desktopImageUrl} alt="" width={64} height={36} className="h-9 w-16 rounded object-cover" unoptimized />
                  ) : (
                    <div className="h-9 w-16 rounded bg-gray-100" />
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/content/banners/${banner.id}${query}`} className="font-medium text-[var(--foreground)] hover:text-[var(--accent)]">
                    {banner.internalName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-[var(--foreground)]">{PLACEMENT_LABELS[banner.placement] ?? banner.placement}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${banner.active ? "bg-green-50 text-green-700" : "bg-gray-100 text-[var(--muted)]"}`}>
                    {banner.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">
                  {banner.startAt || banner.endAt
                    ? `${banner.startAt ? new Date(banner.startAt).toLocaleDateString() : "…"} – ${banner.endAt ? new Date(banner.endAt).toLocaleDateString() : "…"}`
                    : "Always"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
