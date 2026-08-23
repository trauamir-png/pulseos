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
  UserCog,
  Video,
  MessageCircle,
  Trophy,
  Vote,
} from "lucide-react";
import type { SiteRecord } from "@/lib/dashboard/site";
import { hasModule } from "@/lib/dashboard/modules";
import { PERMISSIONS, type PermissionKey } from "@/lib/auth/permission-definitions";

export const WEB_ANALYTICS_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, permission: PERMISSIONS.ANALYTICS_DASHBOARD_VIEW },
  { href: "/realtime", label: "Realtime", icon: Radio, permission: PERMISSIONS.ANALYTICS_REALTIME_VIEW },
  { href: "/pages", label: "Pages", icon: FileText, permission: PERMISSIONS.ANALYTICS_PAGES_VIEW },
  { href: "/sources", label: "Sources", icon: Share2, permission: PERMISSIONS.ANALYTICS_SOURCES_VIEW },
  { href: "/events", label: "Events", icon: Zap, permission: PERMISSIONS.ANALYTICS_EVENTS_VIEW },
];

export const PODCAST_ANALYTICS_ITEMS = [
  { href: "/podcast", label: "Overview", icon: Mic, permission: PERMISSIONS.PODCAST_OVERVIEW_VIEW },
  { href: "/podcast/episodes", label: "Episodes", icon: ListMusic, permission: PERMISSIONS.PODCAST_EPISODES_VIEW },
];

export const CONTENT_ITEMS = [
  { href: "/content/columns", label: "Columns", icon: Newspaper, permission: PERMISSIONS.CONTENT_COLUMNS_VIEW },
  { href: "/content/banners", label: "Banners", icon: GalleryHorizontal, permission: PERMISSIONS.CONTENT_BANNERS_MANAGE },
  { href: "/content/stand-media", label: "Stand Media", icon: Video, permission: PERMISSIONS.CONTENT_STAND_MEDIA_VIEW },
  { href: "/content/match-panel-picks", label: "Panel Picks", icon: Trophy, permission: PERMISSIONS.CONTENT_MATCH_PANEL_PICKS_VIEW },
  { href: "/content/match-fan-voting", label: "Fan Match Voting", icon: Vote, permission: PERMISSIONS.CONTENT_MATCH_VOTING_VIEW },
  { href: "/content/media", label: "Media", icon: ImageIcon, permission: PERMISSIONS.CONTENT_MEDIA_MANAGE },
  { href: "/content/authors", label: "Authors", icon: Users, permission: PERMISSIONS.CONTENT_AUTHORS_MANAGE },
  { href: "/content/categories", label: "Categories", icon: Tag, permission: PERMISSIONS.CONTENT_CATEGORIES_MANAGE },
];

/** Visible to Admin, or to a non-Admin holding site.users.manage on the currently selected site (Phase 3, Section 1). */
export const USERS_ITEMS = [
  { href: "/users", label: "Users & Permissions", icon: UserCog, permission: PERMISSIONS.SITE_USERS_MANAGE },
];

/** Visible to Admin, or to a non-Admin holding chat.writers.access on the currently selected site. Not module-gated, like USERS_ITEMS. */
export const CHAT_ITEMS = [
  { href: "/chat", label: "Chat", icon: MessageCircle, permission: PERMISSIONS.CHAT_WRITERS_ACCESS },
];

/** Admin-only, not permission-gated: see the Phase 2 report for why (be conservative -- no site-scoped equivalent exists yet for these two). */
export const GLOBAL_ITEMS = [
  { href: "/sites", label: "Sites", icon: Globe },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Pure visibility rule shared by the Sidebar render logic and its tests: Admin sees everything, everyone else needs the item's permission. */
export function canSeeNavItem(isAdmin: boolean, permissions: ReadonlySet<PermissionKey>, item: { permission: PermissionKey }): boolean {
  return isAdmin || permissions.has(item.permission);
}

const ALL_NAV_ITEMS = [...WEB_ANALYTICS_ITEMS, ...PODCAST_ANALYTICS_ITEMS, ...CONTENT_ITEMS, ...USERS_ITEMS, ...CHAT_ITEMS, ...GLOBAL_ITEMS];

/**
 * Nested routes (e.g. /podcast/episodes/[id]) must keep their section's own
 * item active, but a parent item (/podcast) must not also light up just
 * because its href is a string-prefix of a sibling's href
 * (/podcast/episodes). So instead of testing each item against the
 * pathname independently, find the single longest href that matches --
 * that's the only one that's active.
 */
function matchesRoute(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function activeHrefFor(pathname: string) {
  const matches = ALL_NAV_ITEMS.filter((item) => matchesRoute(pathname, item.href));
  return matches.sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export function Sidebar({
  sites,
  isAdmin,
  permissionsBySite,
}: {
  sites: SiteRecord[];
  isAdmin: boolean;
  permissionsBySite: Record<string, PermissionKey[]>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  const requestedId = searchParams.get("site") ?? undefined;
  const site = (requestedId ? sites.find((s) => s.id === requestedId) : undefined) ?? sites.find((s) => s.active) ?? sites[0] ?? null;

  const permissions = new Set(site ? permissionsBySite[site.id] ?? [] : []);

  const showWebAnalytics = hasModule(site, "web_analytics");
  const showPodcastAnalytics = hasModule(site, "podcast_analytics");
  const showContent = hasModule(site, "content_management");

  const visibleWebAnalytics = WEB_ANALYTICS_ITEMS.filter((item) => canSeeNavItem(isAdmin, permissions, item));
  const visiblePodcastAnalytics = PODCAST_ANALYTICS_ITEMS.filter((item) => canSeeNavItem(isAdmin, permissions, item));
  const visibleContent = CONTENT_ITEMS.filter((item) => canSeeNavItem(isAdmin, permissions, item));
  const visibleUsers = USERS_ITEMS.filter((item) => canSeeNavItem(isAdmin, permissions, item));
  const visibleChat = CHAT_ITEMS.filter((item) => canSeeNavItem(isAdmin, permissions, item));

  const activeHref = activeHrefFor(pathname);

  function renderLink(href: string, label: string, Icon: typeof LayoutDashboard) {
    const active = href === activeHref;
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
        {showWebAnalytics && visibleWebAnalytics.length > 0 && (
          <div className="space-y-0.5">
            {visibleWebAnalytics.map(({ href, label, icon }) => renderLink(href, label, icon))}
          </div>
        )}

        {showPodcastAnalytics && visiblePodcastAnalytics.length > 0 && (
          <div className="space-y-0.5">
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Podcast Analytics</p>
            {visiblePodcastAnalytics.map(({ href, label, icon }) => renderLink(href, label, icon))}
          </div>
        )}

        {showContent && visibleContent.length > 0 && (
          <div className="space-y-0.5">
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Content</p>
            {visibleContent.map(({ href, label, icon }) => renderLink(href, label, icon))}
          </div>
        )}

        {visibleUsers.length > 0 && (
          <div className="space-y-0.5">{visibleUsers.map(({ href, label, icon }) => renderLink(href, label, icon))}</div>
        )}

        {visibleChat.length > 0 && (
          <div className="space-y-0.5">{visibleChat.map(({ href, label, icon }) => renderLink(href, label, icon))}</div>
        )}

        {isAdmin && (
          <div className="space-y-0.5">{GLOBAL_ITEMS.map(({ href, label, icon }) => renderLink(href, label, icon))}</div>
        )}
      </nav>
    </aside>
  );
}
