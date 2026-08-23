import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, dashboardQueryString, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getMatchFanPollById, getCandidatesForPoll, getPollResults } from "@/lib/dashboard/content-match-fan-voting";
import { MatchFanPollForm } from "@/components/content/match-fan-poll-form";
import { MatchFanPollDetail } from "@/components/content/match-fan-poll-detail";
import { AccessDenied, NoSiteAccess } from "@/components/access-denied";
import { hasPermission } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";

export default async function MatchFanPollDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<DashboardSearchParams>;
}) {
  const { id } = await params;
  const searchParamsResolved = await searchParams;
  const { site } = await resolveDashboardContext(searchParamsResolved);
  if (!site) return <NoSiteAccess />;
  requireModule(site, "content_management");

  const supabase = await createClient();
  if (!(await hasPermission(supabase, site.id, PERMISSIONS.CONTENT_MATCH_VOTING_MANAGE))) {
    return <AccessDenied />;
  }

  const item = await getMatchFanPollById(supabase, site.id, id);
  const query = dashboardQueryString({ siteId: site.id, range: searchParamsResolved.range, from: searchParamsResolved.from, to: searchParamsResolved.to });

  if (!item) {
    return (
      <div className="space-y-6">
        <Link href={`/content/match-fan-voting${query}`} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          ← Back to Fan Match Voting
        </Link>
        <p className="text-sm text-[var(--muted)]">Poll not found.</p>
      </div>
    );
  }

  const candidates = await getCandidatesForPoll(supabase, item.id);
  const results = item.status === "draft" ? null : await getPollResults(item.id, candidates.map((c) => c.id));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/content/match-fan-voting${query}`} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          ← Back to Fan Match Voting
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--foreground)]" dir="auto">
          {item.opponentName} — {item.matchDate}
        </h1>
      </div>
      <MatchFanPollForm siteId={site.id} query={query} item={item} />
      <MatchFanPollDetail siteId={site.id} poll={item} candidates={candidates} results={results} />
    </div>
  );
}
