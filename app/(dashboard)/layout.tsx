import { Suspense } from "react";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { listSites } from "@/lib/dashboard/site";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sites = await listSites();

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      <Suspense fallback={null}>
        <Sidebar sites={sites} />
      </Suspense>
      <div className="flex min-h-screen flex-1 flex-col">
        <Suspense fallback={<div className="h-[57px] border-b border-[var(--border)] bg-[var(--surface)]" />}>
          <Topbar sites={sites} />
        </Suspense>
        <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
