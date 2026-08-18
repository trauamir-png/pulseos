import { formatDateTime, formatShortDate, formatMonthYear, DEFAULT_TIMEZONE } from "@/lib/format/datetime";
import type {
  PodbeanDownloadPoint,
  PodbeanDownloadsSummary,
  PodbeanEngagementSummary,
  PodbeanDimensionRow,
  PodbeanMonthlyDownloadPoint,
  PodbeanTopEpisodeRow,
} from "@/lib/dashboard/podbean-queries";

/**
 * Podbean-sourced data, rendered as a clearly separate, badged section --
 * never mixed into the Web Player cards above. A Podbean "download" is not
 * a PulseOS "listen": different measurement systems, shown side by side but
 * never summed together.
 */

function formatPercent(rate: number | null): string {
  if (rate == null) return "–";
  const pct = rate <= 1 ? rate * 100 : rate;
  return `${pct.toFixed(1)}%`;
}

function formatDate(dateStr: string): string {
  return formatShortDate(`${dateStr}T00:00:00Z`, DEFAULT_TIMEZONE);
}

function formatMonth(dateStr: string): string {
  return formatMonthYear(`${dateStr}T00:00:00Z`, DEFAULT_TIMEZONE);
}

function DimensionTable({ title, rows }: { title: string; rows: PodbeanDimensionRow[] }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{title}</p>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-[var(--muted)]">No data yet.</p>
      ) : (
        <div className="space-y-1">
          {rows.slice(0, 8).map((r) => (
            <div key={r.key} className="flex items-center justify-between py-0.5 text-sm">
              <span className="text-[var(--foreground)]">{r.key}</span>
              <span className="font-medium text-[var(--foreground)]">{r.downloads.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface PodbeanSectionProps {
  podcastName: string;
  hasMappedEpisodes: boolean;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastError: string | null;
  /** Site's configured timezone, so "Last synced" renders identically on server and client. Falls back to UTC. */
  timeZone?: string;
  downloadsSummary: PodbeanDownloadsSummary;
  downloadsTimeseries: PodbeanDownloadPoint[];
  monthlyDownloadsHistory: PodbeanMonthlyDownloadPoint[];
  topEpisodes: PodbeanTopEpisodeRow[];
  engagement: PodbeanEngagementSummary;
  countriesRange: PodbeanDimensionRow[];
  platformsRange: PodbeanDimensionRow[];
  sourcesRange: PodbeanDimensionRow[];
  countriesAllTime: PodbeanDimensionRow[];
  platformsAllTime: PodbeanDimensionRow[];
  sourcesAllTime: PodbeanDimensionRow[];
  finalizedThrough: string | null;
}

export function PodbeanSection(props: PodbeanSectionProps) {
  const {
    podcastName,
    hasMappedEpisodes,
    lastSyncedAt,
    lastSyncStatus,
    lastError,
    timeZone,
    downloadsSummary,
    downloadsTimeseries,
    monthlyDownloadsHistory,
    topEpisodes,
    engagement,
    countriesRange,
    platformsRange,
    sourcesRange,
    countriesAllTime,
    platformsAllTime,
    sourcesAllTime,
    finalizedThrough,
  } = props;

  const recentDays = downloadsTimeseries.slice(-14);

  return (
    <div className="space-y-4 rounded-xl border border-orange-200 bg-orange-50/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-orange-600 px-2.5 py-0.5 text-xs font-semibold text-white">Podbean</span>
          <h2 className="text-sm font-semibold text-[var(--foreground)]">{podcastName} — Podbean Analytics</h2>
        </div>
        <span className="text-right text-xs text-[var(--muted)]">
          <span className="block">
            {lastSyncStatus === "error" ? (
              <span className="text-[var(--negative)]">Last sync failed{lastError ? `: ${lastError}` : ""}</span>
            ) : lastSyncedAt ? (
              `Last synced: ${formatDateTime(lastSyncedAt, timeZone)}`
            ) : (
              "Not synced yet"
            )}
          </span>
          {finalizedThrough && <span className="block">Data finalized through {formatDate(finalizedThrough)}</span>}
        </span>
      </div>

      {!hasMappedEpisodes ? (
        <p className="py-6 text-center text-sm text-[var(--muted)]">
          No episodes mapped to Podbean yet. Once the mapping and initial sync run, downloads, listeners, and engagement will show up here.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCardSmall label="Downloads (range)" value={downloadsSummary.rangeDownloads.toLocaleString()} />
            <KpiCardSmall label="Downloads (all-time)" value={downloadsSummary.allTimeDownloads.toLocaleString()} />
            <KpiCardSmall label="Listeners (latest)" value={engagement.listeners.toLocaleString()} />
            <KpiCardSmall label="Engaged listeners (latest)" value={engagement.engagedListeners.toLocaleString()} />
          </div>

          {recentDays.length > 0 && (
            <div className="rounded-lg border border-orange-200 bg-white p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Downloads — last {recentDays.length} synced days</p>
              <div className="flex items-end gap-1" style={{ height: 64 }}>
                {(() => {
                  const max = Math.max(...recentDays.map((d) => d.downloads), 1);
                  return recentDays.map((d) => (
                    <div key={d.date} className="group relative flex-1" title={`${formatDate(d.date)}: ${d.downloads.toLocaleString()}`}>
                      <div className="rounded-t bg-orange-400" style={{ height: `${Math.max((d.downloads / max) * 64, 2)}px` }} />
                    </div>
                  ));
                })()}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-[var(--muted)]">
                <span>{formatDate(recentDays[0].date)}</span>
                <span>{formatDate(recentDays[recentDays.length - 1].date)}</span>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-orange-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--foreground)]">Top Episodes by Podbean Downloads</h3>
            {topEpisodes.length === 0 ? (
              <p className="py-6 text-center text-xs text-[var(--muted)]">No episode download data in this range yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                    <th className="pb-2">Episode</th>
                    <th className="pb-2">Downloads</th>
                  </tr>
                </thead>
                <tbody>
                  {topEpisodes.map((ep) => (
                    <tr key={ep.episodeId} className="border-t border-orange-100">
                      <td className="py-2 text-[var(--foreground)]">
                        {ep.episodeNumber != null ? `#${ep.episodeNumber} · ` : ""}
                        {ep.title}
                      </td>
                      <td className="py-2 font-medium text-[var(--foreground)]">{ep.downloads.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-orange-200 bg-white p-4">
              <DimensionTable title="Countries (this range)" rows={countriesRange} />
            </div>
            <div className="rounded-lg border border-orange-200 bg-white p-4">
              <DimensionTable title="Platforms (this range)" rows={platformsRange} />
            </div>
            <div className="rounded-lg border border-orange-200 bg-white p-4">
              <DimensionTable title="Sources (this range)" rows={sourcesRange} />
            </div>
          </div>

          {monthlyDownloadsHistory.length > 0 && (
            <div className="rounded-lg border border-orange-200 bg-white p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Downloads — historical monthly totals (older than the last ~90 days, when true daily numbers aren&apos;t available from Podbean)
              </p>
              <div className="space-y-1">
                {monthlyDownloadsHistory.map((m) => (
                  <div key={m.monthStart} className="flex items-center justify-between py-0.5 text-sm">
                    <span className="text-[var(--foreground)]">{formatMonth(m.monthStart)}</span>
                    <span className="font-medium text-[var(--foreground)]">{m.downloads.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-medium text-[var(--muted)]">
              Historical totals (monthly resolution, last 24 months) — coarser than the range view above by design.
            </p>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-orange-200 bg-white p-4">
                <DimensionTable title="Countries (all-time)" rows={countriesAllTime} />
              </div>
              <div className="rounded-lg border border-orange-200 bg-white p-4">
                <DimensionTable title="Platforms (all-time)" rows={platformsAllTime} />
              </div>
              <div className="rounded-lg border border-orange-200 bg-white p-4">
                <DimensionTable title="Sources (all-time)" rows={sourcesAllTime} />
              </div>
            </div>
          </div>

          {engagement.statDate && (
            <p className="text-xs text-[var(--muted)]">
              Engagement snapshot as of {formatDate(engagement.statDate)} · avg consumption rate: {formatPercent(engagement.avgConsumptionRate)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function KpiCardSmall({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-orange-200 bg-white p-4">
      <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-[var(--foreground)]">{value}</p>
    </div>
  );
}
