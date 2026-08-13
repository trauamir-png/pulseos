"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Radio,
  FileText,
  Share2,
  Zap,
  Globe,
  Settings,
  Mic,
  ListMusic,
  Newspaper,
  Image as ImageIcon,
  Users,
  Tag,
  GalleryHorizontal,
} from "lucide-react";
import type { SiteRecord } from "@/lib/dashboard/site";
import { hasModule } from "@/lib/dashboard/modules";

const WEB_ANALYTICS_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/realtime", label: "Realtime", icon: Radio },
  { href: "/pages", label: "Pages", icon: FileText },
  { href: "/sources", label: "Sources", icon: Share2 },
  { href: "/events", label: "Events", icon: Zap },
];

const PODCAST_ANALYTICS_ITEMS = [
  { href: "/podcast", label: "Overview", icon: Mic },
  { href: "/podcast/episodes", label: "Episodes", icon: ListMusic },
];

const CONTENT_ITEMS = [
  { href: "/content/columns", label: "Columns", icon: Newspaper },
  { href: "/content/banners", label: "Banners", icon: GalleryHorizontal },
  { href: "/content/media", label: "Media", icon: ImageIcon },
  { href: "/content/authors", label: "Authors", icon: Users },
  { href: "/content/categories", label: "Categories", icon: Tag },
];

const GLOBAL_ITEMS = [
  { href: "/sites", label: "Sites", icon: Globe },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ sites }: { sites: SiteRecord[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  const requestedId = searchParams.get("site") ?? undefined;
  const site = (requestedId ? sites.find((s) => s.id === requestedId) : undefined) ?? sites.find((s) => s.active) ?? sites[0] ?? null;

  const showWebAnalytics = hasModule(site, "web_analytics");
  const showPodcastAnalytics = hasModule(site, "podcast_analytics");
  const showContent = hasModule(site, "content_management");

  function renderLink(href: string, label: string, Icon: typeof LayoutDashboard) {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={query ? `${href}?${query}` : href}
        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
          active
            ? "bg-[var(--accent-soft)] text-[var(--accent)]"
            : "text-[var(--muted)] hover:bg-gray-50 hover:text-[var(--foreground)]"
        }`}
      >
        <Icon size={17} strokeWidth={2} />
        {label}
      </Link>
    );
  }

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-semibold text-white">
          P
        </div>
        <span className="text-base font-semibold text-[var(--foreground)]">PulseOS</span>
      </div>
      <nav className="flex-1 space-y-4 px-3">
        {showWebAnalytics && (
          <div className="space-y-0.5">
            {WEB_ANALYTICS_ITEMS.map(({ href, label, icon }) => renderLink(href, label, icon))}
          </div>
        )}

        {showPodcastAnalytics && (
          <div className="space-y-0.5">
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Podcast Analytics</p>
            {PODCAST_ANALYTICS_ITEMS.map(({ href, label, icon }) => renderLink(href, label, icon))}
          </div>
        )}

        {showContent && (
          <div className="space-y-0.5">
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Content</p>
            {CONTENT_ITEMS.map(({ href, label, icon }) => renderLink(href, label, icon))}
          </div>
        )}

        <div className="space-y-0.5">{GLOBAL_ITEMS.map(({ href, label, icon }) => renderLink(href, label, icon))}</div>
      </nav>
    </aside>
  );
}
