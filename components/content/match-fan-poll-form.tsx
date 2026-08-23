"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMatchFanPoll, updateMatchFanPoll, type MatchFanPollInput } from "@/app/(dashboard)/content/actions";
import { deriveMatchOutcome, derivePanelPickType, panelPickLabel, matchOutcomeLabel } from "@/lib/content/match-result";
import type { MatchFanPollRecord } from "@/lib/dashboard/content-match-fan-voting";

function toScoreInput(value: number | null): string {
  return value == null ? "" : String(value);
}

function parseScoreInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function MatchFanPollForm({
  siteId,
  query,
  item,
}: {
  siteId: string;
  query: string;
  item: MatchFanPollRecord | null;
}) {
  const router = useRouter();
  const locked = item != null && item.status !== "draft";

  const [externalFixtureId, setExternalFixtureId] = useState(item?.externalFixtureId ?? "");
  const [matchDate, setMatchDate] = useState(item?.matchDate ?? "");
  const [opponentName, setOpponentName] = useState(item?.opponentName ?? "");
  const [competition, setCompetition] = useState(item?.competition ?? "");
  const [isHome, setIsHome] = useState(item?.isHome ?? true);
  const [homeScore, setHomeScore] = useState(toScoreInput(item?.homeScore ?? null));
  const [awayScore, setAwayScore] = useState(toScoreInput(item?.awayScore ?? null));
  const [isFinal, setIsFinal] = useState(item?.isFinal ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const resultInput = {
    isHome,
    homeScore: parseScoreInput(homeScore),
    awayScore: parseScoreInput(awayScore),
    isFinal,
  };
  const outcome = deriveMatchOutcome(resultInput);
  const voteType = derivePanelPickType(resultInput);

  function handleSave() {
    setError(null);
    const input: MatchFanPollInput = {
      externalFixtureId,
      matchDate,
      opponentName,
      competition,
      isHome,
      homeScore: parseScoreInput(homeScore),
      awayScore: parseScoreInput(awayScore),
      isFinal,
    };
    startTransition(async () => {
      try {
        if (item) {
          await updateMatchFanPoll(siteId, item.id, input);
          router.refresh();
        } else {
          const { id } = await createMatchFanPoll(siteId, input);
          router.push(`/content/match-fan-voting/${id}${query}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save.");
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          {locked && (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-[var(--muted)]">
              This poll is {item!.status} -- match details are frozen and can no longer be edited.
            </p>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Fixture ID</label>
            <input
              disabled={locked}
              value={externalFixtureId}
              onChange={(e) => setExternalFixtureId(e.target.value)}
              placeholder="The match's id/slug from the source site"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] disabled:bg-gray-50 disabled:text-[var(--muted)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Match date</label>
              <input
                disabled={locked}
                type="date"
                value={matchDate}
                onChange={(e) => setMatchDate(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] disabled:bg-gray-50 disabled:text-[var(--muted)]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Competition</label>
              <input
                disabled={locked}
                dir="auto"
                value={competition}
                onChange={(e) => setCompetition(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] disabled:bg-gray-50 disabled:text-[var(--muted)]"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Opponent</label>
            <input
              disabled={locked}
              dir="auto"
              value={opponentName}
              onChange={(e) => setOpponentName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] disabled:bg-gray-50 disabled:text-[var(--muted)]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Maccabi is</label>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={locked}
                onClick={() => setIsHome(true)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${
                  isHome ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--foreground)] hover:bg-gray-50"
                }`}
              >
                Home
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => setIsHome(false)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${
                  !isHome ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--foreground)] hover:bg-gray-50"
                }`}
              >
                Away
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Home score</label>
              <input
                disabled={locked}
                type="number"
                min={0}
                value={homeScore}
                onChange={(e) => setHomeScore(e.target.value)}
                placeholder="As shown on the source site"
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] disabled:bg-gray-50 disabled:text-[var(--muted)]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Away score</label>
              <input
                disabled={locked}
                type="number"
                min={0}
                value={awayScore}
                onChange={(e) => setAwayScore(e.target.value)}
                placeholder="As shown on the source site"
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] disabled:bg-gray-50 disabled:text-[var(--muted)]"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
            <input disabled={locked} type="checkbox" checked={isFinal} onChange={(e) => setIsFinal(e.target.checked)} />
            Match is final
          </label>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          <div>
            <p className="mb-1.5 text-sm font-medium text-[var(--foreground)]">Derived result</p>
            <p className="text-sm text-[var(--muted)]">
              {outcome ? matchOutcomeLabel(outcome) : "Not final yet -- result and vote type are not available until the score is entered and the match is marked final."}
            </p>
          </div>
          {voteType && (
            <div>
              <p className="mb-1.5 text-sm font-medium text-[var(--foreground)]">Fans will vote for</p>
              <p className="text-sm text-[var(--foreground)]" dir="rtl">
                {panelPickLabel(voteType)}
              </p>
            </div>
          )}
          <p className="text-xs text-[var(--muted)]">Fans never choose which of these they&apos;re voting for -- it&apos;s always derived automatically from the final score above.</p>

          {error && <p className="text-sm text-[var(--negative)]">{error}</p>}
          {!locked && (
            <button
              onClick={handleSave}
              disabled={pending}
              className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
