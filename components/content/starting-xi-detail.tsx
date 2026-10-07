import Image from "next/image";
import type { StartingXiSnapshotRecord } from "@/lib/dashboard/content-starting-xi";
import type { StartingXiPlayerResult, StartingXiVotingStatus } from "@/lib/content/starting-xi-results";
import { computeFansXi, getEffectiveStartingXiStatus, sortStartingXiPlayers } from "@/lib/content/starting-xi-results";
import { formatDateTime } from "@/lib/format/datetime";

const STATUS_STYLES: Record<StartingXiVotingStatus, string> = {
  open: "bg-green-50 text-green-700",
  closed: "bg-blue-50 text-blue-700",
  unavailable: "bg-gray-100 text-[var(--muted)]",
};

const STATUS_LABELS: Record<StartingXiVotingStatus, string> = {
  open: "Open",
  closed: "Closed",
  unavailable: "Unavailable",
};

function PlayerAvatar({ imageUrl }: { imageUrl: string | null }) {
  return imageUrl ? (
    <Image src={imageUrl} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover" unoptimized />
  ) : (
    <div className="h-10 w-10 rounded-full bg-gray-100" />
  );
}

function PlayerRow({ player }: { player: StartingXiPlayerResult }) {
  return (
    <tr className="border-b border-[var(--border)] last:border-b-0">
      <td className="px-4 py-3">
        <PlayerAvatar imageUrl={player.imageUrl} />
      </td>
      <td className="px-4 py-3 font-medium text-[var(--foreground)]" dir="auto">
        {player.name}
      </td>
      <td className="px-4 py-3 text-[var(--muted)]">{player.shirtNumber ?? "—"}</td>
      <td className="px-4 py-3 text-[var(--muted)]" dir="auto">
        {player.position ?? "—"}
      </td>
      <td className="px-4 py-3 text-[var(--muted)]">{player.selectionCount}</td>
      <td className="px-4 py-3 text-[var(--muted)]">{player.selectionPercentage}%</td>
    </tr>
  );
}

function PlayerTable({ players }: { players: StartingXiPlayerResult[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            <th className="px-4 py-3"></th>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">#</th>
            <th className="px-4 py-3">Position</th>
            <th className="px-4 py-3">Selections</th>
            <th className="px-4 py-3">%</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <PlayerRow key={player.playerId} player={player} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StartingXiDetail({
  snapshot,
  players,
  timeZone,
}: {
  snapshot: StartingXiSnapshotRecord;
  players: StartingXiPlayerResult[];
  timeZone?: string;
}) {
  const currentSquad = sortStartingXiPlayers(players.filter((p) => p.isCurrentSquad));
  const notInSquad = sortStartingXiPlayers(players.filter((p) => !p.isCurrentSquad));
  const fansXi = computeFansXi(players);
  const noSubmissionsYet = snapshot.totalSubmissions === 0;
  const effectiveStatus = getEffectiveStartingXiStatus(snapshot.votingStatus, snapshot.lockAt, new Date());

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Kickoff</dt>
            <dd className="mt-1 text-[var(--foreground)]">{formatDateTime(snapshot.kickoffAt, timeZone)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Voting locks</dt>
            <dd className="mt-1 text-[var(--foreground)]">{formatDateTime(snapshot.lockAt, timeZone)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Status</dt>
            <dd className="mt-1">
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[effectiveStatus]}`}>
                {STATUS_LABELS[effectiveStatus]}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Submissions</dt>
            <dd className="mt-1 text-[var(--foreground)]">{snapshot.totalSubmissions}</dd>
          </div>
        </dl>
      </div>

      {noSubmissionsYet ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-sm text-[var(--muted)]" dir="auto">
            עדיין לא נשלחו הרכבים למשחק הזה
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-[var(--foreground)]" dir="auto">
              ה-11 של האוהדים
            </h2>
            <PlayerTable players={fansXi} />
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Current squad</h2>
            <PlayerTable players={currentSquad} />
          </div>

          {notInSquad.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-[var(--foreground)]" dir="auto">
                שחקנים שאינם בסגל הנוכחי
              </h2>
              <PlayerTable players={notInSquad} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
