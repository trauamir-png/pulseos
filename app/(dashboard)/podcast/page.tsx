import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, dashboardQueryString, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getPodcastsForSite, getEpisodesForSite } from "@/lib/dashboard/podcast";
import {
  getPodcastSummary,
  getPodcastListeningTimeseries,
  getTopEpisodes,
  getPlatformsBreakdown,
  getPodcastSourcesBreakdown,
} from "@/lib/dashboard/podcast-queries";
import {
  getPodbeanDownloadsSummary,
  getPodbeanDownloadsTimeseries,
  getPodbeanMonthlyDownloadsHistory,
  getPodbeanTopEpisodes,
  getPodbeanDimensionsForRange,
  getPodbeanDimensionsAllTimeMonthly,
  getPodbeanEngagementSummary,
  getPodbeanFinalizedThroughForPodcast,
} from "@/lib/dashboard/podbean-queries";
import { KpiCard } from "@/components/kpi-card";
import { PodcastListeningChart } from "@/components/podcast-listening-chart";
import { ConnectPodcastForm, PodcastRssStatusCard } from "@/components/podcast-rss";
import { PodbeanSection } from "@/components/podbean-section";
import { AccessDenied, NoSiteAccess } from "@/components/access-denied";
import { hasPermission } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";

function formatSeconds(seconds: number | null): string {
  if (seconds == null) return "–";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default async function PodcastOverviewPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const params = await searchParams;
  const { site, range } = await resolveDashboardContext(params);
  if (!site) return <NoSiteAccess />;
  requireModule(site, "podcast_analytics");

  const supabase = await createClient();
  if (!(await hasPermission(supabase, site.id, PERMISSIONS.PODCAST_OVERVIEW_VIEW))) {
    return <AccessDenied />;
  }

  const podcasts = await getPodcastsForSite(supabase, site.id);

  if (podcasts.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Podcast Analytics</h1>
          <p className="text-sm text-[var(--muted)]">{site.name}</p>
        </div>
        <div className="flex h-full flex-col items-center justify-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-24 text-center">
          <p className="text-lg font-medium text-[var(--foreground)]">No podcast configured yet</p>
          <p className="max-w-sm text-sm text-[var(--muted)]">
            Connect this site&apos;s podcast via its RSS feed to import its episodes and start seeing listening data here.
          </p>
          <ConnectPodcastForm siteId={site.id} />
        </div>
      </div>
    );
  }

  const episodes = await getEpisodesForSite(supabase, site.id);
  const episodeCountByPodcast = new Map<string, number>();
  for (const ep of episodes) {
    episodeCountByPodcast.set(ep.podcastId, (episodeCountByPodcast.get(ep.podcastId) ?? 0) + 1);
  }

  const [summary, timeseries, topEpisodes, platforms, sources] = await Promise.all([
    getPodcastSummary(supabase, site.id, range.from, range.to),
    getPodcastListeningTimeseries(supabase, site.id, range.from, range.to, range.timezone, range.granularity, "listens"),
    getTopEpisodes(supabase, site.id, range.from, range.to),
    getPlatformsBreakdown(supabase, site.id, range.from, range.to),
    getPodcastSourcesBreakdown(supabase, site.id, range.from, range.to),
  ]);

  const noData = summary.totalListens === 0 && summary.listeningNow === 0;
  const detailQuery = dashboardQueryString({ siteId: site.id, range: params.range, from: params.from, to: params.to });

  const podbeanPodcasts = podcasts.filter((p) => p.hostingProvider === "podbean");
  const nonPodbeanPodcasts = podcasts.filter((p) => p.hostingProvider !== "podbean");

  const podbeanSections = await Promise.all(
    podbeanPodcasts.map(async (podcast) => {
      const [
        mappedCountRes,
        downloadsSummary,
        downloadsTimeseries,
        monthlyDownloadsHistory,
        podbeanTopEpisodes,
        countriesRange,
        platformsRange,
        sourcesRange,
        countriesAllTime,
        platformsAllTime,
        sourcesAllTime,
        engagement,
        finalizedThrough,
      ] = await Promise.all([
        supabase.from("episodes").select("id", { count: "exact", head: true }).eq("podcast_id", podcast.id).not("podbean_episode_id", "is", null),
        getPodbeanDownloadsSummary(supabase, podcast.id, range.from, range.to),
        getPodbeanDownloadsTimeseries(supabase, podcast.id, range.from, range.to),
        getPodbeanMonthlyDownloadsHistory(supabase, podcast.id),
        getPodbeanTopEpisodes(supabase, podcast.id, range.from, range.to),
        getPodbeanDimensionsForRange(supabase, podcast.id, "country", range.from, range.to),
        getPodbeanDimensionsForRange(supabase, podcast.id, "platform", range.from, range.to),
        getPodbeanDimensionsForRange(supabase, podcast.id, "source", range.from, range.to),
        getPodbeanDimensionsAllTimeMonthly(supabase, podcast.id, "country"),
        getPodbeanDimensionsAllTimeMonthly(supabase, podcast.id, "platform"),
        getPodbeanDimensionsAllTimeMonthly(supabase, podcast.id, "source"),
        getPodbeanEngagementSummary(supabase, podcast.id),
        getPodbeanFinalizedThroughForPodcast(supabase, podcast.id),
      ]);

      return {
        podcastId: podcast.id,
        podcastName: podcast.name,
        hasMappedEpisodes: (mappedCountRes.count ?? 0) > 0,
        lastSyncedAt: podcast.podbeanLastSyncedAt,
        lastSyncStatus: podcast.podbeanLastSyncStatus,
        lastError: podcast.podbeanLastError,
        downloadsSummary,
        downloadsTimeseries,
        monthlyDownloadsHistory,
        topEpisodes: podbeanTopEpisodes,
        countriesRange,
        platformsRange,
        sourcesRange,
        countriesAllTime,
        platformsAllTime,
        sourcesAllTime,
        engagement,
        finalizedThrough,
      };
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Podcast Analytics</h1>
        <p className="text-sm text-[var(--muted)]">{site.name}</p>
      </div>

      <div className="space-y-4">
        {podcasts.map((podcast) => (
          <PodcastRssStatusCard
            key={podcast.id}
            podcast={podcast}
            episodeCount={episodeCountByPodcast.get(podcast.id) ?? 0}
            timeZone={site.timezone}
          />
        ))}
      </div>

      <div className="space-y-4">
        {podbeanSections.map((s) => (
          <PodbeanSection
            key={s.podcastId}
            podcastName={s.podcastName}
            hasMappedEpisodes={s.hasMappedEpisodes}
            lastSyncedAt={s.lastSyncedAt}
            lastSyncStatus={s.lastSyncStatus}
            lastError={s.lastError}
            timeZone={site.timezone}
            downloadsSummary={s.downloadsSummary}
            downloadsTimeseries={s.downloadsTimeseries}
            monthlyDownloadsHistory={s.monthlyDownloadsHistory}
            topEpisodes={s.topEpisodes}
            engagement={s.engagement}
            countriesRange={s.countriesRange}
            platformsRange={s.platformsRange}
            sourcesRange={s.sourcesRange}
            countriesAllTime={s.countriesAllTime}
            platformsAllTime={s.platformsAllTime}
            sourcesAllTime={s.sourcesAllTime}
            finalizedThrough={s.finalizedThrough}
          />
        ))}
        {nonPodbeanPodcasts.map((podcast) => (
          <p key={podcast.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-xs text-[var(--muted)]">
            Spotify/Apple hosting analytics are not connected for {podcast.name}. Episode information is synced from its RSS feed; the listening
            metrics below and on each episode&apos;s detail page are measured only through the PulseOS website/web player, not hosting-platform
            plays.
          </p>
        ))}
      </div>

      <div>
        <h2 className="mb-4 text-sm font-semibold text-[var(--foreground)]">Website Listening (PulseOS Web Player)</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard label="Website Listens" value={summary.totalListens.toLocaleString()} />
          <KpiCard label="Unique Listeners" value={summary.uniqueListeners.toLocaleString()} />
          <KpiCard label="Avg Listening Time" value={formatSeconds(summary.avgListeningSeconds)} />
          <KpiCard label="Completion Rate" value={summary.completionRate.toFixed(1)} suffix="%" />
          <KpiCard label="Listening Now" value={summary.listeningNow.toLocaleString()} />
        </div>
      </div>

      {noData ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-24 text-center">
          <p className="text-lg font-medium text-[var(--foreground)]">No listening data yet</p>
          <p className="max-w-sm text-sm text-[var(--muted)]">
            Once listeners start playing episodes, listens, sources, and platform activity will show up here.
          </p>
        </div>
      ) : (
        <>
          <PodcastListeningChart
            key={`${site.id}-${range.from.toISOString()}-${range.to.toISOString()}`}
            siteId={site.id}
            initialData={timeseries}
          />

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="mb-4 text-sm font-semibold text-[var(--foreground)]">Top Episodes</h2>
            {topEpisodes.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--muted)]">No episode listens in this range yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                    <th className="pb-2">Episode</th>
                    <th className="pb-2">Listens</th>
                    <th className="pb-2">Unique listeners</th>
                    <th className="pb-2">Avg listening time</th>
                    <th className="pb-2">Completion rate</th>
                  </tr>
                </thead>
                <tbody>
                  {topEpisodes.map((ep) => (
                    <tr key={ep.episodeId} className="border-t border-[var(--border)]">
                      <td className="py-2">
                        <Link href={`/podcast/episodes/${ep.episodeId}${detailQuery}`} className="font-medium text-[var(--foreground)] hover:text-[var(--accent)]">
                          {ep.episodeNumber != null ? `#${ep.episodeNumber} · ` : ""}
                          {ep.title}
                        </Link>
                      </td>
                      <td className="py-2 text-[var(--foreground)]">{ep.listens.toLocaleString()}</td>
                      <td className="py-2 text-[var(--foreground)]">{ep.uniqueListeners.toLocaleString()}</td>
                      <td className="py-2 text-[var(--foreground)]">{formatSeconds(ep.avgListeningSeconds)}</td>
                      <td className="py-2 text-[var(--foreground)]">{ep.completionRate.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="mb-4 text-sm font-semibold text-[var(--foreground)]">Platforms</h2>
              <div className="space-y-3">
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Measured listens</p>
                  {platforms.measured.map((p) => (
                    <div key={p.platform} className="flex items-center justify-between py-1 text-sm">
                      <span className="text-[var(--foreground)]">{p.platform}</span>
                      <span className="font-medium text-[var(--foreground)]">{p.listens.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Outbound clicks (not listens)</p>
                  {platforms.outboundClicks.map((p) => (
                    <div key={p.platform} className="flex items-center justify-between py-1 text-sm">
                      <span className="text-[var(--foreground)]">{p.platform}</span>
                      <span className="font-medium text-[var(--foreground)]">{p.clicks.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="mb-4 text-sm font-semibold text-[var(--foreground)]">Sources</h2>
              {sources.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--muted)]">No source data in this range yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                      <th className="pb-2">Source</th>
                      <th className="pb-2">Visitors</th>
                      <th className="pb-2">Listen starts</th>
                      <th className="pb-2">Avg time</th>
                      <th className="pb-2">Completion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map((s) => (
                      <tr key={s.source} className="border-t border-[var(--border)]">
                        <td className="py-2 capitalize text-[var(--foreground)]">{s.source}</td>
                        <td className="py-2 text-[var(--foreground)]">{s.visitors.toLocaleString()}</td>
                        <td className="py-2 text-[var(--foreground)]">{s.listenStarts.toLocaleString()}</td>
                        <td className="py-2 text-[var(--foreground)]">{formatSeconds(s.avgListeningSeconds)}</td>
                        <td className="py-2 text-[var(--foreground)]">{s.completionRate.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
