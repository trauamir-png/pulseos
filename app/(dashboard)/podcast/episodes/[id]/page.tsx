import Link from "next/link";
import { format } from "date-fns-tz";
import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, dashboardQueryString, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getEpisodeById, getPodcastsForSite } from "@/lib/dashboard/podcast";
import { getEpisodeDetail } from "@/lib/dashboard/podcast-queries";
import { getPodbeanEpisodesMetrics, getPodbeanFinalizedThroughForEpisode } from "@/lib/dashboard/podbean-queries";
import { formatDate } from "@/lib/format/datetime";
import { KpiCard } from "@/components/kpi-card";
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

function KpiCardSmall({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-orange-200 bg-white p-4">
      <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-[var(--foreground)]">{value}</p>
    </div>
  );
}

const FUNNEL_STEPS = [
  { key: "started", label: "Started" },
  { key: "p25", label: "25%" },
  { key: "p50", label: "50%" },
  { key: "p75", label: "75%" },
  { key: "p100", label: "100%" },
] as const;

export default async function EpisodeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<DashboardSearchParams>;
}) {
  const { id } = await params;
  const searchParamsResolved = await searchParams;
  const { site, range } = await resolveDashboardContext(searchParamsResolved);
  if (!site) return <NoSiteAccess />;
  requireModule(site, "podcast_analytics");

  const supabase = await createClient();
  if (!(await hasPermission(supabase, site.id, PERMISSIONS.PODCAST_EPISODES_VIEW))) {
    return <AccessDenied />;
  }

  const episode = await getEpisodeById(supabase, site.id, id);
  const backQuery = dashboardQueryString({ siteId: site.id, range: searchParamsResolved.range, from: searchParamsResolved.from, to: searchParamsResolved.to });

  if (!episode) {
    return (
      <div className="space-y-6">
        <Link href={`/podcast/episodes${backQuery}`} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          ← Episodes
        </Link>
        <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-24 text-center">
          <p className="text-lg font-medium text-[var(--foreground)]">Episode not found</p>
          <p className="max-w-sm text-sm text-[var(--muted)]">This episode doesn&apos;t exist or no longer belongs to {site.name}.</p>
        </div>
      </div>
    );
  }

  const detail = await getEpisodeDetail(supabase, site.id, episode.id, range.from, range.to);
  const noData = detail.overview.listens === 0;
  const podcasts = await getPodcastsForSite(supabase, site.id);
  const isPodbean = podcasts.find((p) => p.id === episode.podcastId)?.hostingProvider === "podbean";
  const [podbeanMetricsByEpisode, finalizedThrough] = await Promise.all([
    getPodbeanEpisodesMetrics(supabase, isPodbean ? [episode.podcastId] : []),
    isPodbean ? getPodbeanFinalizedThroughForEpisode(supabase, episode.id) : Promise.resolve(null),
  ]);
  const podbeanMetrics = podbeanMetricsByEpisode.get(episode.id) ?? null;

  return (
    <div className="space-y-6">
      <Link href={`/podcast/episodes${backQuery}`} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
        ← Episodes
      </Link>

      <div className="flex items-start gap-4">
        {episode.artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable podcast host domains; not worth next/image remote-pattern config for a single artwork image.
          <img src={episode.artworkUrl} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
        ) : null}
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">
            {episode.episodeNumber != null ? `#${episode.episodeNumber} · ` : ""}
            {episode.title}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {episode.publishedAt ? format(new Date(episode.publishedAt), "MMM d, yyyy", { timeZone: range.timezone }) : "Unpublished"} ·{" "}
            {formatSeconds(episode.durationSeconds)}
          </p>
          {episode.description && (
            // Sanitized server-side at RSS ingestion time (lib/rss/parse.ts) -- safe to render as-is here.
            <div
              className="prose prose-sm mt-2 max-w-xl text-[var(--muted)] [&_a]:text-[var(--accent)]"
              dangerouslySetInnerHTML={{ __html: episode.description }}
            />
          )}
          {episode.audioUrl && (
            <a
              href={episode.audioUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-block text-xs text-[var(--accent)] hover:underline"
            >
              Audio file ↗
            </a>
          )}
        </div>
      </div>

      {isPodbean ? (
        <div className="space-y-4 rounded-xl border border-orange-200 bg-orange-50/40 p-5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-orange-600 px-2.5 py-0.5 text-xs font-semibold text-white">Podbean</span>
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Podbean Analytics</h2>
          </div>
          {podbeanMetrics ? (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <KpiCardSmall label="Downloads (all-time)" value={podbeanMetrics.downloadsAllTime.toLocaleString()} />
                <KpiCardSmall label="Listeners" value={podbeanMetrics.listeners != null ? podbeanMetrics.listeners.toLocaleString() : "–"} />
                <KpiCardSmall
                  label="Engaged listeners"
                  value={podbeanMetrics.engagedListeners != null ? podbeanMetrics.engagedListeners.toLocaleString() : "–"}
                />
                <KpiCardSmall label="Avg consumption rate" value={formatPercent(podbeanMetrics.avgConsumptionRate)} />
              </div>
              <p className="text-xs text-[var(--muted)]">
                Avg consumption time: {formatSeconds(podbeanMetrics.avgConsumptionTimeSeconds)}
                {podbeanMetrics.engagementStatDate
                  ? ` · listener/engagement figures as of ${formatDate(`${podbeanMetrics.engagementStatDate}T00:00:00Z`)}`
                  : ""}
                {finalizedThrough
                  ? ` · downloads finalized through ${formatDate(`${finalizedThrough}T00:00:00Z`)}`
                  : ""}
              </p>
            </>
          ) : (
            <p className="py-2 text-center text-sm text-[var(--muted)]">Not mapped to Podbean, or no Podbean data synced for this episode yet.</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-[var(--muted)]">
          Spotify/Apple hosting analytics are not connected for this podcast. Episode metadata is synced from its RSS feed; the listening
          metrics below are measured only through the PulseOS website/web player, not hosting-platform plays.
        </p>
      )}

      <div>
        <h2 className="mb-4 text-sm font-semibold text-[var(--foreground)]">PulseOS Web Player</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard label="Plays" value={detail.overview.listens.toLocaleString()} />
          <KpiCard label="Unique Listeners" value={detail.overview.uniqueListeners.toLocaleString()} />
          <KpiCard label="Avg Listening Time" value={formatSeconds(detail.overview.avgListeningSeconds)} />
          <KpiCard label="Completion Rate" value={detail.overview.completionRate.toFixed(1)} suffix="%" />
        </div>
      </div>

      {noData ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-20 text-center">
          <p className="text-lg font-medium text-[var(--foreground)]">No Web Player listening data yet</p>
          <p className="max-w-sm text-sm text-[var(--muted)]">
            PulseOS&apos;s own audio player and listening-progress tracking aren&apos;t built yet, so this funnel, sources, and platform activity
            stay empty for now.{isPodbean ? " Podbean's hosting analytics above are unaffected." : ""}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="mb-4 text-sm font-semibold text-[var(--foreground)]">Listening funnel</h2>
            <p className="mb-4 text-xs text-[var(--muted)]">Based on 25% listening milestones — the finest granularity available in V1.</p>
            <div className="space-y-2">
              {FUNNEL_STEPS.map((step) => {
                const value = detail.funnel[step.key];
                const pct = detail.funnel.started > 0 ? (value / detail.funnel.started) * 100 : 0;
                return (
                  <div key={step.key} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-xs font-medium text-[var(--muted)]">{step.label}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-12 shrink-0 text-right text-xs font-medium text-[var(--foreground)]">{value}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="mb-4 text-sm font-semibold text-[var(--foreground)]">Sources</h2>
              {detail.sources.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--muted)]">No source data yet.</p>
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
                    {detail.sources.map((s) => (
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

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="mb-4 text-sm font-semibold text-[var(--foreground)]">Platforms</h2>
              <div className="space-y-3">
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Measured listens</p>
                  {detail.platforms.measured.map((p) => (
                    <div key={p.platform} className="flex items-center justify-between py-1 text-sm">
                      <span className="text-[var(--foreground)]">{p.platform}</span>
                      <span className="font-medium text-[var(--foreground)]">{p.listens.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Outbound clicks (not listens)</p>
                  {detail.platforms.outboundClicks.map((p) => (
                    <div key={p.platform} className="flex items-center justify-between py-1 text-sm">
                      <span className="text-[var(--foreground)]">{p.platform}</span>
                      <span className="font-medium text-[var(--foreground)]">{p.clicks.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="mb-4 text-sm font-semibold text-[var(--foreground)]">Recent activity</h2>
            {detail.recentActivity.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--muted)]">No recent events.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                    <th className="pb-2">Event</th>
                    <th className="pb-2">Source</th>
                    <th className="pb-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.recentActivity.map((a, i) => (
                    <tr key={i} className="border-t border-[var(--border)]">
                      <td className="py-2 text-[var(--foreground)]">{a.eventName}</td>
                      <td className="py-2 capitalize text-[var(--foreground)]">{a.trafficSource}</td>
                      <td className="py-2 text-[var(--muted)]">{format(new Date(a.occurredAt), "MMM d, HH:mm", { timeZone: range.timezone })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
