import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext } from "@/lib/dashboard/params";
import { hasModule } from "@/lib/dashboard/modules";
import { getPodcastListeningTimeseries, type ListeningMetric } from "@/lib/dashboard/podcast-queries";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { site, range } = await resolveDashboardContext({
    site: searchParams.get("site") ?? undefined,
    range: searchParams.get("range") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  if (!site || !hasModule(site, "podcast_analytics")) return NextResponse.json({ error: "no_site" }, { status: 404 });

  const metric = (searchParams.get("metric") as ListeningMetric) || "listens";
  const data = await getPodcastListeningTimeseries(supabase, site.id, range.from, range.to, range.timezone, range.granularity, metric);

  return NextResponse.json({ data });
}
