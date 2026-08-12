import Link from "next/link";
import { format } from "date-fns-tz";
import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getEpisodesList } from "@/lib/dashboard/podcast-queries";
import { EpisodesSearch } from "@/components/episodes-search";

function formatSeconds(seconds: number | null): string {
  if (seconds == null) return "–";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default async function PodcastEpisodesPage({ searchParams }: { searchParams: Promise<DashboardSearchParams & { q?: string }> }) {
  const params = await searchParams;
  const { site, range } = await resolveDashboardContext(params);
  requireModule(site, "podcast_analytics");

  const supabase = await createClient();
  const episodes = await getEpisodesList(supabase, site.id, range.from, range.to, params.q);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Episodes</h1>
          <p className="text-sm text-[var(--muted)]">{site.name}</p>
        </div>
        <EpisodesSearch />
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Published</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Listens</th>
              <th className="px-4 py-3">Unique listeners</th>
              <th className="px-4 py-3">Avg listening time</th>
              <th className="px-4 py-3">Completion</th>
              <th className="px-4 py-3">Spotify clicks</th>
              <th className="px-4 py-3">Apple clicks</th>
              <th className="px-4 py-3">YouTube clicks</th>
            </tr>
          </thead>
          <tbody>
            {episodes.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-sm text-[var(--muted)]">
                  {params.q ? "No episodes match your search." : "No episodes yet."}
                </td>
              </tr>
            ) : (
              episodes.map((ep) => (
                <tr key={ep.id} className="border-b border-[var(--border)] last:border-b-0">
                  <td className="px-4 py-3 text-[var(--muted)]">{ep.episodeNumber ?? "–"}</td>
                  <td className="px-4 py-3">
                    <Link href={`/podcast/episodes/${ep.id}`} className="font-medium text-[var(--foreground)] hover:text-[var(--accent)]">
                      {ep.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--foreground)]">
                    {ep.publishedAt ? format(new Date(ep.publishedAt), "MMM d, yyyy", { timeZone: range.timezone }) : "–"}
                  </td>
                  <td className="px-4 py-3 text-[var(--foreground)]">{formatSeconds(ep.durationSeconds)}</td>
                  <td className="px-4 py-3 text-[var(--foreground)]">{ep.listens.toLocaleString()}</td>
                  <td className="px-4 py-3 text-[var(--foreground)]">{ep.uniqueListeners.toLocaleString()}</td>
                  <td className="px-4 py-3 text-[var(--foreground)]">{formatSeconds(ep.avgListeningSeconds)}</td>
                  <td className="px-4 py-3 text-[var(--foreground)]">{ep.completionRate.toFixed(1)}%</td>
                  <td className="px-4 py-3 text-[var(--foreground)]">{ep.spotifyClicks.toLocaleString()}</td>
                  <td className="px-4 py-3 text-[var(--foreground)]">{ep.appleClicks.toLocaleString()}</td>
                  <td className="px-4 py-3 text-[var(--foreground)]">{ep.youtubeClicks.toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
