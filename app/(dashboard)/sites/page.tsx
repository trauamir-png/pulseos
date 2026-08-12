import { listSites } from "@/lib/dashboard/site";
import { NewSiteForm, CopySnippetButton, ActiveToggle, ModulesEditor } from "@/components/site-actions";

export default async function SitesPage() {
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

      <div className="space-y-4">
        {sites.length === 0 && <p className="text-sm text-[var(--muted)]">No sites yet. Create one above.</p>}
        {sites.map((site) => {
          const snippet = `<script defer src="${appUrl}/tracker.js" data-site="${site.site_key}"></script>`;
          return (
            <div key={site.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-[var(--foreground)]">{site.name}</h2>
                    <ActiveToggle siteId={site.id} active={site.active} />
                  </div>
                  <p className="text-sm text-[var(--muted)]">
                    {site.domain} · {site.timezone}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Modules</span>
                <ModulesEditor siteId={site.id} activeModules={site.modules} />
              </div>

              <div className="mt-4 rounded-lg bg-gray-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Tracker snippet</span>
                  <CopySnippetButton snippet={snippet} />
                </div>
                <pre className="overflow-x-auto text-xs text-[var(--foreground)]">{snippet}</pre>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
