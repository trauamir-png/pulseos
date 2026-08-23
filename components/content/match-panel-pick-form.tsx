"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createMatchPanelPick,
  updateMatchPanelPick,
  deleteMatchPanelPick,
  type MatchPanelPickInput,
} from "@/app/(dashboard)/content/actions";
import { DeleteConfirmDialog, DeleteIconButton } from "@/components/content/delete-confirm-dialog";
import { deriveMatchOutcome, derivePanelPickType, panelPickLabel, matchOutcomeLabel } from "@/lib/content/match-result";
import type { MatchPanelPickRecord } from "@/lib/dashboard/content-match-panel-picks";

function toScoreInput(value: number | null): string {
  return value == null ? "" : String(value);
}

function parseScoreInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function MatchPanelPickForm({
  siteId,
  query,
  item,
}: {
  siteId: string;
  query: string;
  item: MatchPanelPickRecord | null;
}) {
  const router = useRouter();
  const listHref = `/content/match-panel-picks${query}`;

  const [externalFixtureId, setExternalFixtureId] = useState(item?.externalFixtureId ?? "");
  const [matchDate, setMatchDate] = useState(item?.matchDate ?? "");
  const [opponentName, setOpponentName] = useState(item?.opponentName ?? "");
  const [competition, setCompetition] = useState(item?.competition ?? "");
  const [isHome, setIsHome] = useState(item?.isHome ?? true);
  const [homeScore, setHomeScore] = useState(toScoreInput(item?.homeScore ?? null));
  const [awayScore, setAwayScore] = useState(toScoreInput(item?.awayScore ?? null));
  const [isFinal, setIsFinal] = useState(item?.isFinal ?? true);
  const [playerName, setPlayerName] = useState(item?.playerName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const resultInput = {
    isHome,
    homeScore: parseScoreInput(homeScore),
    awayScore: parseScoreInput(awayScore),
    isFinal,
  };
  const outcome = deriveMatchOutcome(resultInput);
  const pickType = derivePanelPickType(resultInput);

  function handleSave() {
    setError(null);
    const input: MatchPanelPickInput = {
      externalFixtureId,
      matchDate,
      opponentName,
      competition,
      isHome,
      homeScore: parseScoreInput(homeScore),
      awayScore: parseScoreInput(awayScore),
      isFinal,
      playerName,
    };
    startTransition(async () => {
      try {
        if (item) {
          await updateMatchPanelPick(siteId, item.id, input);
          router.refresh();
        } else {
          const { id } = await createMatchPanelPick(siteId, input);
          router.push(`/content/match-panel-picks/${id}${query}`);
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
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Fixture ID</label>
            <input
              value={externalFixtureId}
              onChange={(e) => setExternalFixtureId(e.target.value)}
              placeholder="The match's id/slug from the source site (used to match this pick to the fixture later)"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Match date</label>
              <input
                type="date"
                value={matchDate}
                onChange={(e) => setMatchDate(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Competition</label>
              <input
                dir="auto"
                value={competition}
                onChange={(e) => setCompetition(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Opponent</label>
            <input
              dir="auto"
              value={opponentName}
              onChange={(e) => setOpponentName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Maccabi is</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsHome(true)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  isHome ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--foreground)] hover:bg-gray-50"
                }`}
              >
                Home
              </button>
              <button
                type="button"
                onClick={() => setIsHome(false)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
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
                type="number"
                min={0}
                value={homeScore}
                onChange={(e) => setHomeScore(e.target.value)}
                placeholder="As shown on the source site"
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Away score</label>
              <input
                type="number"
                min={0}
                value={awayScore}
                onChange={(e) => setAwayScore(e.target.value)}
                placeholder="As shown on the source site"
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
            <input type="checkbox" checked={isFinal} onChange={(e) => setIsFinal(e.target.checked)} />
            Match is final
          </label>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Player</label>
            <input
              dir="auto"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="The panel's selection for this match"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          <div>
            <p className="mb-1.5 text-sm font-medium text-[var(--foreground)]">Derived result</p>
            <p className="text-sm text-[var(--muted)]">{outcome ? matchOutcomeLabel(outcome) : "Not final yet — result and panel pick label are not shown until the score is entered and the match is marked final."}</p>
          </div>
          {pickType && (
            <div>
              <p className="mb-1.5 text-sm font-medium text-[var(--foreground)]">Panel pick label</p>
              <p className="text-sm text-[var(--foreground)]" dir="rtl">
                {panelPickLabel(pickType)}
              </p>
            </div>
          )}
          <p className="text-xs text-[var(--muted)]">
            The result and label are always calculated automatically from the home/away scores above — they can&apos;t be set manually.
          </p>

          {error && <p className="text-sm text-[var(--negative)]">{error}</p>}
          <button
            onClick={handleSave}
            disabled={pending}
            className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>

          {item && (
            <div className="flex items-center justify-end border-t border-[var(--border)] pt-3">
              <DeleteIconButton title="Remove pick" onClick={() => setDeleteOpen(true)} />
            </div>
          )}
        </div>
      </div>

      {deleteOpen && item && (
        <DeleteConfirmDialog
          entityLabel="panel pick"
          confirmText={item.opponentName}
          onClose={() => setDeleteOpen(false)}
          onConfirm={async () => {
            await deleteMatchPanelPick(siteId, item.id);
            router.push(listHref);
          }}
        />
      )}
    </div>
  );
}
