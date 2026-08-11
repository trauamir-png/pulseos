import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSelectedSite } from "@/lib/dashboard/site";
import { getRealtimeSnapshot } from "@/lib/dashboard/queries";

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const siteId = request.nextUrl.searchParams.get("site") ?? undefined;
  const { site } = await getSelectedSite(siteId);
  if (!site) return NextResponse.json({ error: "no_site" }, { status: 404 });

  const snapshot = await getRealtimeSnapshot(supabase, site.id);
  return NextResponse.json(snapshot);
}
