import { listSites } from "@/lib/dashboard/site";
import { NewSiteForm, SitesList } from "@/components/site-actions";
import { AccessDenied } from "@/components/access-denied";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/permissions";

export default async function SitesPage() {
  const supabase = await createClient();
  if (!(await isAdmin(supabase))) {
    return <AccessDenied />;
  }

  const sites = await listSites();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://YOUR-PULSEOS-DOMAIN";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Sites</h1>
          <p className="text-sm text-[var(--muted)]">Every tracked site and its tracker install snippet.</p>
        </div>
        <NewSiteForm />
      </div>

      <SitesList sites={sites} appUrl={appUrl} />
    </div>
  );
}
