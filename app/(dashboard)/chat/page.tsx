import { resolveDashboardContext, type DashboardSearchParams } from "@/lib/dashboard/params";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";
import { AccessDenied, NoSiteAccess } from "@/components/access-denied";
import { ChatRoom } from "@/components/chat/chat-room";

const HISTORY_LIMIT = 50;

export default async function ChatPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const params = await searchParams;
  const { site } = await resolveDashboardContext(params);
  if (!site) return <NoSiteAccess />;

  const supabase = await createClient();
  if (!(await hasPermission(supabase, site.id, PERMISSIONS.CHAT_WRITERS_ACCESS))) {
    return <AccessDenied />;
  }

  // chat_messages_public, not chat_messages: it already carries display_name
  // and is readable by everyone with chat access, sidestepping profiles' own
  // "read own or admin reads all" RLS (a non-admin writer can't otherwise see
  // other panelists' display_name).
  const { data: messages } = await supabase
    .from("chat_messages_public")
    .select("id, display_name, body, created_at")
    .eq("site_id", site.id)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Chat</h1>
        <p className="text-sm text-[var(--muted)]">{site.name} &mdash; messages publish live to the public site chat.</p>
      </div>
      <ChatRoom siteId={site.id} initialMessages={(messages ?? []).slice().reverse()} />
    </div>
  );
}
