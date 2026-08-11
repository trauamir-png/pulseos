"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import type { RealtimeSnapshot } from "@/lib/dashboard/queries";

const POLL_INTERVAL_MS = 5000;

export function RealtimeView({ siteId, initialSnapshot }: { siteId: string; initialSnapshot: RealtimeSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);

  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`/api/dashboard/realtime?site=${siteId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (json) setSnapshot(json);
        })
        .catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [siteId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Realtime</h1>
        <p className="text-sm text-[var(--muted)]">Active in the last 90 seconds</p>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--positive)] opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-[var(--positive)]" />
          </span>
          <span className="text-sm font-medium text-[var(--muted)]">Online now</span>
        </div>
        <p className="mt-2 text-5xl font-semibold tracking-tight text-[var(--foreground)]">{snapshot.onlineNow}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Current pages">
          {snapshot.currentPages.length === 0 && <EmptyRow />}
          {snapshot.currentPages.map((p) => (
            <Row key={p.pathname} label={p.pathname} value={p.count} />
          ))}
        </Panel>

        <Panel title="Sources online">
          {snapshot.sources.length === 0 && <EmptyRow />}
          {snapshot.sources.map((s) => (
            <Row key={s.source} label={s.source} value={s.count} />
          ))}
        </Panel>

        <Panel title="Recent page views">
          {snapshot.recentPageViews.length === 0 && <EmptyRow />}
          {snapshot.recentPageViews.map((pv, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 text-sm">
              <span className="truncate text-[var(--foreground)]">{pv.pathname}</span>
              <span className="shrink-0 text-xs text-[var(--muted)]">
                {pv.trafficSource} · {formatDistanceToNow(new Date(pv.occurredAt), { addSuffix: true })}
              </span>
            </div>
          ))}
        </Panel>

        <Panel title="Recent events">
          {snapshot.recentEvents.length === 0 && <EmptyRow />}
          {snapshot.recentEvents.map((ev, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 text-sm">
              <span className="truncate text-[var(--foreground)]">{ev.eventName}</span>
              <span className="shrink-0 text-xs text-[var(--muted)]">
                {ev.pathname} · {formatDistanceToNow(new Date(ev.occurredAt), { addSuffix: true })}
              </span>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">{title}</h2>
      <div className="divide-y divide-[var(--border)]">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="truncate text-[var(--foreground)]">{label}</span>
      <span className="font-medium text-[var(--muted)]">{value}</span>
    </div>
  );
}

function EmptyRow() {
  return <p className="py-2 text-sm text-[var(--muted)]">Nothing yet.</p>;
}
