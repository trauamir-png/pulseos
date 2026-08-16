"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Rss } from "lucide-react";
import { connectPodcast, syncPodcastRss, updatePodcastSettings } from "@/app/(dashboard)/podcast/actions";
import { HOSTING_PROVIDER_OPTIONS, detectHostingProvider, hostingProviderLabel } from "@/lib/rss/hosting-provider";
import type { PodcastRecord } from "@/lib/dashboard/podcast";

function HostingProviderSelect({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <select
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
      >
        <option value="" disabled>
          Select a hosting provider…
        </option>
        {HOSTING_PROVIDER_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {value === "spotify_for_podcasters" && (
        <p className="mt-1 text-xs text-[var(--muted)]">Formerly Spotify for Podcasters / Anchor.</p>
      )}
    </div>
  );
}

export function ConnectPodcastForm({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rssUrl, setRssUrl] = useState("");
  const [hostingProvider, setHostingProvider] = useState<string | null>(null);
  const [providerTouched, setProviderTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRssUrlChange(value: string) {
    setRssUrl(value);
    // Auto-detection only ever fills a suggested default. Once the user has
    // manually picked a provider, further edits to the URL don't override it.
    if (!providerTouched) {
      setHostingProvider(detectHostingProvider(value));
    }
  }

  function handleConnect() {
    if (!rssUrl.trim() || !hostingProvider) return;
    setError(null);
    startTransition(async () => {
      try {
        await connectPodcast(siteId, rssUrl.trim(), hostingProvider);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't connect that feed.");
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
      >
        <Rss className="h-4 w-4" />
        Connect podcast
      </button>
    );
  }

  return (
    <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-left">
      <h2 className="text-sm font-semibold text-[var(--foreground)]">Connect podcast</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">Paste the podcast&apos;s RSS feed URL. PulseOS will read the podcast details and import its episodes.</p>
      <label className="mb-1.5 mt-4 block text-xs font-medium text-[var(--foreground)]">RSS feed URL</label>
      <input
        autoFocus
        value={rssUrl}
        onChange={(e) => handleRssUrlChange(e.target.value)}
        placeholder="https://example.com/feed.xml"
        className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
      />
      <label className="mb-1.5 mt-4 block text-xs font-medium text-[var(--foreground)]">Podcast hosting provider</label>
      <HostingProviderSelect
        value={hostingProvider}
        onChange={(v) => {
          setHostingProvider(v);
          setProviderTouched(true);
        }}
      />
      {error && <p className="mt-2 text-xs text-[var(--negative)]">{error}</p>}
      <div className="mt-4 flex items-center gap-2">
        <button
          disabled={!rssUrl.trim() || !hostingProvider || pending}
          onClick={handleConnect}
          className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Connecting…" : "Connect"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setError(null);
            setRssUrl("");
            setHostingProvider(null);
            setProviderTouched(false);
          }}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function PodcastRssStatusCard({ podcast, episodeCount }: { podcast: PodcastRecord; episodeCount: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ added: number; updated: number; unchanged: number } | null>(null);
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [editRssUrl, setEditRssUrl] = useState(podcast.rssUrl ?? "");
  const [editProvider, setEditProvider] = useState<string | null>(podcast.hostingProvider);
  const [editPending, startEditTransition] = useTransition();
  const [editError, setEditError] = useState<string | null>(null);

  function handleSync() {
    setError(null);
    setSummary(null);
    startTransition(async () => {
      try {
        const result = await syncPodcastRss(podcast.id);
        setSummary(result);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sync failed.");
        router.refresh();
      }
    });
  }

  function openEdit() {
    setEditRssUrl(podcast.rssUrl ?? "");
    setEditProvider(podcast.hostingProvider);
    setEditError(null);
    setEditing(true);
  }

  function handleSaveEdit() {
    if (!editRssUrl.trim() || !editProvider) return;
    setEditError(null);
    startEditTransition(async () => {
      try {
        await updatePodcastSettings(podcast.id, { rssUrl: editRssUrl.trim(), hostingProvider: editProvider });
        setEditing(false);
        router.refresh();
      } catch (e) {
        setEditError(e instanceof Error ? e.message : "Couldn't save changes.");
      }
    });
  }

  const failed = podcast.rssLastSyncStatus === "error";

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {podcast.artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable podcast host domains; not worth next/image remote-pattern config for a single thumbnail.
            <img src={podcast.artworkUrl} alt="" className="h-14 w-14 rounded-lg object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gray-100 text-[var(--muted)]">
              <Rss className="h-6 w-6" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-[var(--foreground)]">{podcast.name}</h2>
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--muted)]">
                {hostingProviderLabel(podcast.hostingProvider)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
              <span className="inline-flex items-center gap-1 text-green-700">
                <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
                RSS connected
              </span>
              <span>{episodeCount} episodes</span>
              <span>Last synced: {formatDateTime(podcast.rssLastSyncedAt)}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            disabled={pending}
            onClick={handleSync}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
            {pending ? "Syncing…" : "Sync RSS"}
          </button>
          <button
            onClick={openEdit}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-gray-50"
          >
            Edit
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-gray-50 p-4">
          <label className="mb-1.5 block text-xs font-medium text-[var(--foreground)]">RSS feed URL</label>
          <input
            value={editRssUrl}
            onChange={(e) => setEditRssUrl(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
          />
          <label className="mb-1.5 mt-3 block text-xs font-medium text-[var(--foreground)]">Podcast hosting provider</label>
          <HostingProviderSelect value={editProvider} onChange={setEditProvider} />
          {editError && <p className="mt-2 text-xs text-[var(--negative)]">{editError}</p>}
          <div className="mt-3 flex items-center gap-2">
            <button
              disabled={!editRssUrl.trim() || !editProvider || editPending}
              onClick={handleSaveEdit}
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {editPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={editPending}
              onClick={() => setEditing(false)}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {failed && !error && (
        <p className="mt-3 text-xs text-[var(--negative)]">Last sync failed: {podcast.rssLastError ?? "Unknown error."}</p>
      )}
      {error && <p className="mt-3 text-xs text-[var(--negative)]">{error}</p>}
      {summary && (
        <p className="mt-3 text-xs text-green-700">
          {summary.added} episodes added · {summary.updated} episodes updated · {summary.unchanged} unchanged
        </p>
      )}
    </div>
  );
}
