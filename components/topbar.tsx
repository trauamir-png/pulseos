"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { LogOut, ChevronDown, User, Menu } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { RANGE_PRESET_LABELS, type RangePreset } from "@/lib/analytics/date-range";
import type { SiteRecord } from "@/lib/dashboard/site";
import { useMobileNav } from "@/components/mobile-nav-context";

const PRESETS: RangePreset[] = ["today", "yesterday", "7d", "30d", "90d", "custom"];

export function Topbar({ sites }: { sites: SiteRecord[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [customOpen, setCustomOpen] = useState(false);
  const { setOpen: setMobileNavOpen } = useMobileNav();

  const selectedSiteId = searchParams.get("site") || sites[0]?.id || "";
  const currentRange = (searchParams.get("range") as RangePreset) || "7d";

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleRangeChange(preset: RangePreset) {
    if (preset === "custom") {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", preset);
    params.delete("from");
    params.delete("to");
    router.push(`${pathname}?${params.toString()}`);
  }

  function applyCustomRange(from: string, to: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", "custom");
    params.set("from", from);
    params.set("to", to);
    router.push(`${pathname}?${params.toString()}`);
    setCustomOpen(false);
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex flex-col gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open menu"
          className="shrink-0 rounded-lg border border-[var(--border)] bg-white p-2 text-[var(--foreground)] md:hidden"
        >
          <Menu size={18} />
        </button>
        <div className="relative">
          <select
            value={selectedSiteId}
            onChange={(e) => setParam("site", e.target.value)}
            className="appearance-none rounded-lg border border-[var(--border)] bg-white py-1.5 pl-3 pr-8 text-sm font-medium text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
          >
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex max-w-full overflow-x-auto rounded-lg border border-[var(--border)] bg-white p-0.5">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              onClick={() => handleRangeChange(preset)}
              className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition ${
                currentRange === preset
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {RANGE_PRESET_LABELS[preset]}
            </button>
          ))}
        </div>

        <Link
          href="/account"
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <User size={14} />
          My profile
        </Link>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>

      {customOpen && (
        <CustomRangePopover
          onApply={applyCustomRange}
          onClose={() => setCustomOpen(false)}
          initialFrom={searchParams.get("from")}
          initialTo={searchParams.get("to")}
        />
      )}
    </header>
  );
}

function CustomRangePopover({
  onApply,
  onClose,
  initialFrom,
  initialTo,
}: {
  onApply: (from: string, to: string) => void;
  onClose: () => void;
  initialFrom: string | null;
  initialTo: string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(initialFrom || today);
  const [to, setTo] = useState(initialTo || today);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-16 sm:pt-24" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-xs overflow-y-auto rounded-xl border border-[var(--border)] bg-white p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">From</label>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">To</label>
            <input
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <button
          onClick={() => onApply(from, to)}
          className="w-full rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
