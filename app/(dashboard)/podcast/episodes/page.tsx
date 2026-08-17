import Link from "next/link";
import { format } from "date-fns-tz";
import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, dashboardQueryString, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getEpisodesForSite, getPodcastsForSite } from "@/lib/dashboard/podcast";
import { getPodbeanEpisodesMetrics, getPodbeanFinalizedThroughForEpisodes } from "@/lib/dashboard/podbean-queries";
import { EpisodesSearch } from "@/components/episodes-search";
import { AccessDenied, NoSiteAccess } from "@/components/access-denied";
import { hasPermission } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";

function formatSeconds(seconds: number | null): string {
  if (seconds == null) return "–";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatPercent(rate: number | null): string {
  if (rate == null) return "–";
  const pct = rate <= 1 ? rate * 100 : rate;
  return `${pct.toFixed(1)}%`;
}

export default async function PodcastEpisodesPage({ searchParams }: { searchParams: Promise<DashboardSearchParams & { q?: string }> }) {
  const params = await searchParams;
  const { site, range } = await resolveDashboardContext(params);
  if (!site) return <NoSiteAccess />;
  requireModule(site, "podcast_analytics");

  const supabase = await createClient();
  if (!(await hasPermission(supabase, site.id, PERMISSIONS.PODCAST_EPISODES_VIEW))) {
    return <AccessDenied />;
  }

  const [allEpisodes, podcasts] = await Promise.all([getEpisodesForSite(supabase, site.id), getPodcastsForSite(supabase, site.id)]);
  const episodes = params.q ? allEpisodes.filter((ep) => ep.title.toLowerCase().includes(params.q!.toLowerCase())) : allEpisodes;

  const podbeanPodcastIds = podcasts.filter((p) => p.hostingProvider === "podbean").map((p) => p.id);
  const hasPodbean = podbeanPodcastIds.length > 0;

  const [podbeanMetrics, finalizedThrough] = await Promise.all([
    getPodbeanEpisodesMetrics(supabase, podbeanPodcastIds),
    getPodbeanFinalizedThroughForEpisodes(supabase, podbeanPodcastIds),
  ]);
  const detailQuery = dashboardQueryString({ siteId: site.id, range: params.range, from: params.from, to: params.to });
  const columnCount = hasPodbean ? 10 : 5;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Episodes</h1>
          <p className="text-sm text-[var(--muted)]">{site.name}</p>
        </div>
        <EpisodesSearch />
      </div>

      <div className="flex items-center gap-2">
        {hasPodbean && <span className="inline-flex items-center rounded-full bg-orange-600 px-2.5 py-0.5 text-xs font-semibold text-white">Podbean</span>}
        <p className="text-xs text-[var(--muted)]">
          {hasPodbean ? (
            <>
              Downloads and listener metrics below come from Podbean&apos;s hosting analytics. PulseOS Web Player metrics (plays, completion, outbound
              clicks) are shown on each episode&apos;s detail page.
              {finalizedThrough ? ` Data finalized through ${format(new Date(`${finalizedThrough}T00:00:00Z`), "MMM d, yyyy", { timeZone: "UTC" })}.` : ""}
            </>
          ) : (
            "Episode information is synced from the podcast RSS feed. Listening metrics measured by PulseOS are available on each episode's analytics page."
          )}
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              <th className="px-4 py-3"></th>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Published</th>
              <th className="px-4 py-3">Duration</th>
              {hasPodbean && (
                <>
                  <th className="px-4 py-3">Podbean Downloads</th>
                  <th className="px-4 py-3">Podbean Listeners</th>
                  <th className="px-4 py-3">Engaged Listeners</th>
                  <th className="px-4 py-3">Avg Consumption</th>
                  <th className="px-4 py-3">Avg Consumption Time</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {episodes.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-4 py-10 text-center text-sm text-[var(--muted)]">
                  {params.q ? "No episodes match your search." : "No episodes yet."}
                </td>
              </tr>
            ) : (
              episodes.map((ep) => {
                const pb = podbeanMetrics.get(ep.id);
                return (
                  <tr key={ep.id} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="px-4 py-3">
                      {ep.artworkUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable podcast host domains; not worth next/image remote-pattern config for a small thumbnail.
                        <img src={ep.artworkUrl} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-gray-100" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">{ep.episodeNumber ?? "–"}</td>
                    <td className="px-4 py-3">
                      <Link href={`/podcast/episodes/${ep.id}${detailQuery}`} className="font-medium text-[var(--foreground)] hover:text-[var(--accent)]">
                        {ep.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--foreground)]">
                      {ep.publishedAt ? format(new Date(ep.publishedAt), "MMM d, yyyy", { timeZone: range.timezone }) : "–"}
                    </td>
                    <td className="px-4 py-3 text-[var(--foreground)]">{formatSeconds(ep.durationSeconds)}</td>
                    {hasPodbean && (
                      <>
                        <td className="px-4 py-3 text-[var(--foreground)]">{pb ? pb.downloadsAllTime.toLocaleString() : "–"}</td>
                        <td className="px-4 py-3 text-[var(--foreground)]">{pb?.listeners != null ? pb.listeners.toLocaleString() : "–"}</td>
                        <td className="px-4 py-3 text-[var(--foreground)]">
                          {pb?.engagedListeners != null ? pb.engagedListeners.toLocaleString() : "–"}
                        </td>
                        <td className="px-4 py-3 text-[var(--foreground)]">{formatPercent(pb?.avgConsumptionRate ?? null)}</td>
                        <td className="px-4 py-3 text-[var(--foreground)]">{formatSeconds(pb?.avgConsumptionTimeSeconds ?? null)}</td>
                      </>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
