import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext } from "@/lib/dashboard/params";
import { getTimeseries, type TimeseriesMetric } from "@/lib/dashboard/queries";

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

  if (!site) return NextResponse.json({ error: "no_site" }, { status: 404 });

  const metric = (searchParams.get("metric") as TimeseriesMetric) || "visitors";
  const data = await getTimeseries(supabase, site.id, range.from, range.to, range.timezone, range.granularity, metric);

  return NextResponse.json({ data });
}
