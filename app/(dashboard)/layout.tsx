import { Suspense } from "react";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { MobileNavProvider } from "@/components/mobile-nav-context";
import { listAccessibleSites } from "@/lib/dashboard/site";
import { createClient } from "@/lib/supabase/server";
import { isAdmin as checkIsAdmin, getPermissionsForSite } from "@/lib/auth/permissions";
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/auth/permission-definitions";

/**
 * Computed once per request here (not per-page) because this fork's layouts
 * don't receive searchParams -- Sidebar/Topbar are client components that
 * read the current ?site= themselves via useSearchParams(), so switching
 * sites client-side doesn't re-render this Server Component. Passing
 * permissions for every accessible site (not just the current one) lets the
 * client-side site switch stay instant while sidebar gating remains correct.
 */
async function loadSidebarAccess(): Promise<{ isAdmin: boolean; permissionsBySite: Record<string, PermissionKey[]> }> {
  const supabase = await createClient();
  const [admin, sites] = await Promise.all([checkIsAdmin(supabase), listAccessibleSites()]);

  const permissionsBySite: Record<string, PermissionKey[]> = {};
  if (admin) {
    for (const site of sites) permissionsBySite[site.id] = PERMISSION_KEYS;
  } else {
    await Promise.all(
      sites.map(async (site) => {
        permissionsBySite[site.id] = [...(await getPermissionsForSite(supabase, site.id))];
      }),
    );
  }

  return { isAdmin: admin, permissionsBySite };
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sites, access] = await Promise.all([listAccessibleSites(), loadSidebarAccess()]);

  return (
    <MobileNavProvider>
      <div className="flex min-h-screen bg-[var(--background)]">
        <Suspense fallback={null}>
          <Sidebar sites={sites} isAdmin={access.isAdmin} permissionsBySite={access.permissionsBySite} />
        </Suspense>
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Suspense fallback={<div className="h-[57px] border-b border-[var(--border)] bg-[var(--surface)]" />}>
            <Topbar sites={sites} />
          </Suspense>
          <main className="flex-1 overflow-x-hidden overflow-y-auto px-4 py-6 sm:px-6">{children}</main>
        </div>
      </div>
    </MobileNavProvider>
  );
}
