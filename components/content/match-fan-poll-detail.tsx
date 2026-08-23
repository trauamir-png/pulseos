"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addMatchFanPollCandidate,
  removeMatchFanPollCandidate,
  openMatchFanPoll,
  closeMatchFanPoll,
  reopenMatchFanPoll,
  type MatchFanPollCandidateInput,
} from "@/app/(dashboard)/content/actions";
import type { MatchFanPollRecord, MatchFanPollCandidateRecord } from "@/lib/dashboard/content-match-fan-voting";
import type { CandidateResult } from "@/lib/content/fan-vote-results";

const EMPTY_CANDIDATE: MatchFanPollCandidateInput = {
  playerId: "",
  slug: "",
  playerName: "",
  profileUrl: "",
  imageUrl: "",
  shirtNumber: null,
  starter: true,
  enteredAsSubstitute: false,
  entryMinute: null,
};

export function MatchFanPollDetail({
  siteId,
  poll,
  candidates,
  results,
}: {
  siteId: string;
  poll: MatchFanPollRecord;
  candidates: MatchFanPollCandidateRecord[];
  results: { totalVotes: number; candidates: CandidateResult[] } | null;
}) {
  const router = useRouter();
  const draft = poll.status === "draft";
  const [form, setForm] = useState<MatchFanPollCandidateInput>(EMPTY_CANDIDATE);
  const [error, setError] = useState<string | null>(null);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [lifecyclePending, startLifecycleTransition] = useTransition();

  function handleAddCandidate() {
    setError(null);
    startTransition(async () => {
      try {
        await addMatchFanPollCandidate(siteId, poll.id, form);
        setForm(EMPTY_CANDIDATE);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add candidate.");
      }
    });
  }

  function handleRemoveCandidate(candidateId: string, playerName: string) {
    if (!window.confirm(`Remove ${playerName} as a candidate?`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await removeMatchFanPollCandidate(siteId, poll.id, candidateId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to remove candidate.");
      }
    });
  }

  function handleLifecycle(action: "open" | "close" | "reopen") {
    setLifecycleError(null);
    startLifecycleTransition(async () => {
      try {
        if (action === "open") await openMatchFanPoll(siteId, poll.id);
        if (action === "close") await closeMatchFanPoll(siteId, poll.id);
        if (action === "reopen") await reopenMatchFanPoll(siteId, poll.id);
        router.refresh();
      } catch (e) {
        setLifecycleError(e instanceof Error ? e.message : "Failed to update poll status.");
      }
    });
  }

  const resultByCandidate = new Map((results?.candidates ?? []).map((c) => [c.candidateId, c]));

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">Voting status</p>
            <p className="text-xs text-[var(--muted)]">
              {poll.status === "draft" && "Draft -- not visible to fans yet."}
              {poll.status === "open" && "Open -- fans can vote now."}
              {poll.status === "closed" && "Closed -- results are final and visible, no new votes accepted."}
            </p>
          </div>
          <div className="flex gap-2">
            {poll.status === "draft" && (
              <button
                onClick={() => handleLifecycle("open")}
                disabled={lifecyclePending}
                className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
              >
                Open voting
              </button>
            )}
            {poll.status === "open" && (
              <button
                onClick={() => handleLifecycle("close")}
                disabled={lifecyclePending}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-gray-50 disabled:opacity-60"
              >
                Close voting
              </button>
            )}
            {poll.status === "closed" && (
              <button
                onClick={() => handleLifecycle("reopen")}
                disabled={lifecyclePending}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-gray-50 disabled:opacity-60"
              >
                Reopen voting
              </button>
            )}
          </div>
        </div>
        {lifecycleError && <p className="mt-3 text-sm text-[var(--negative)]">{lifecycleError}</p>}
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Candidates</h2>
          {results && <p className="text-xs text-[var(--muted)]">{results.totalVotes} total votes</p>}
        </div>

        {candidates.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No candidates yet.</p>
        ) : (
          <div className="space-y-2">
            {candidates.map((c) => {
              const result = resultByCandidate.get(c.id);
              return (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
                  <div dir="auto">
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {c.playerName}
                      {c.shirtNumber != null && <span className="text-[var(--muted)]"> #{c.shirtNumber}</span>}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {c.starter ? "Starter" : c.enteredAsSubstitute ? `Substitute${c.entryMinute != null ? ` (${c.entryMinute}')` : ""}` : "Bench"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {result && (
                      <span className="text-xs text-[var(--muted)]">
                        {result.voteCount} votes · {result.percentage}%
                      </span>
                    )}
                    {draft && (
                      <button
                        onClick={() => handleRemoveCandidate(c.id, c.playerName)}
                        disabled={pending}
                        className="text-xs font-medium text-[var(--negative)] hover:underline disabled:opacity-60"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {draft && (
          <div className="space-y-3 border-t border-[var(--border)] pt-4">
            <p className="text-sm font-medium text-[var(--foreground)]">Add candidate</p>
            <div className="grid grid-cols-2 gap-3">
              <input
                value={form.playerId}
                onChange={(e) => setForm({ ...form, playerId: e.target.value })}
                placeholder="Player ID"
                className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              />
              <input
                dir="auto"
                value={form.playerName}
                onChange={(e) => setForm({ ...form, playerName: e.target.value })}
                placeholder="Player name"
                className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              />
              <input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="Slug (optional)"
                className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              />
              <input
                type="number"
                value={form.shirtNumber ?? ""}
                onChange={(e) => setForm({ ...form, shirtNumber: e.target.value ? Number(e.target.value) : null })}
                placeholder="Shirt number"
                className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              />
              <input
                value={form.profileUrl}
                onChange={(e) => setForm({ ...form, profileUrl: e.target.value })}
                placeholder="Profile URL (optional)"
                className="col-span-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              />
              <input
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                placeholder="Image URL (optional)"
                className="col-span-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                <input
                  type="checkbox"
                  checked={form.starter}
                  onChange={(e) => setForm({ ...form, starter: e.target.checked, enteredAsSubstitute: e.target.checked ? false : form.enteredAsSubstitute })}
                />
                Starter
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                <input
                  type="checkbox"
                  checked={form.enteredAsSubstitute}
                  onChange={(e) => setForm({ ...form, enteredAsSubstitute: e.target.checked, starter: e.target.checked ? false : form.starter })}
                />
                Substitute
              </label>
              {form.enteredAsSubstitute && (
                <input
                  type="number"
                  value={form.entryMinute ?? ""}
                  onChange={(e) => setForm({ ...form, entryMinute: e.target.value ? Number(e.target.value) : null })}
                  placeholder="Entry minute"
                  className="w-32 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                />
              )}
            </div>
            {error && <p className="text-sm text-[var(--negative)]">{error}</p>}
            <button
              onClick={handleAddCandidate}
              disabled={pending}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-gray-50 disabled:opacity-60"
            >
              {pending ? "Adding…" : "Add candidate"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
