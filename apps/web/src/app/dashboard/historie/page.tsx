"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { SectionLabel } from "@/components/ui";

interface StandingRow {
  pos: number; teamId: string; teamName: string;
  points: number; wins: number; draws: number; losses: number; gf: number; ga: number; gd: number; played: number;
}
interface BestElevenEntry { playerId: string; name: string; position: string; teamName: string }
interface AwardsSnapshot {
  champion?: { teamId: string; name: string | null } | null;
  runnerUp?: { teamId: string; name: string | null } | null;
  third?: { teamId: string; name: string | null } | null;
  playerOfSeason?: { id: string | null; name: string | null; reason: string | null };
  topScorer?: { id: string | null; name: string | null; goals: number };
  managerOfSeason?: { teamId: string | null; name: string | null; reason: string | null };
  discovery?: { id: string | null; name: string | null; reason: string | null };
  bestEleven?: BestElevenEntry[];
}
interface SeasonStats {
  matchesPlayed: number; totalGoals: number; goalsPerMatch: number;
  biggestWin?: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number } | null;
  highestScoring?: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number; total: number } | null;
  recordAttendance?: { value: number; homeTeam: string; awayTeam: string } | null;
  totalYellowCards: number; totalRedCards: number;
  longestWinStreak?: { teamName: string; length: number } | null;
}
interface HistoryEntry {
  id: string; leagueId: string; leagueName: string; seasonNumber: number;
  finalStandings: StandingRow[] | null; awards: AwardsSnapshot | null; seasonStats: SeasonStats | null;
}

export default function HistoriePage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiFetch<{ history: HistoryEntry[] }>("/api/season-history")
      .then((d) => setHistory(d.history ?? []))
      .catch((e) => console.error("load season history:", e))
      .finally(() => setLoaded(true));
  }, []);

  return (
    <div className="page-container space-y-5">
      <SectionLabel>📜 Historie a síň slávy</SectionLabel>

      {!loaded && <div className="card p-6 text-center text-muted text-sm">Načítám…</div>}
      {loaded && history.length === 0 && (
        <div className="card p-6 text-center text-muted text-sm">
          Zatím žádná archivovaná sezóna. Archiv vznikne po zakončení první sezóny.
        </div>
      )}

      {history.map((h) => (
        <SeasonCard key={h.id} entry={h} />
      ))}
    </div>
  );
}

function TeamLink({ teamId, name }: { teamId?: string | null; name?: string | null }) {
  if (!name) return <span>—</span>;
  if (!teamId) return <span className="font-heading font-bold">{name}</span>;
  return (
    <Link href={`/dashboard/team/${teamId}`} className="font-heading font-bold hover:text-pitch-500 transition-colors">
      {name}
    </Link>
  );
}

function SeasonCard({ entry }: { entry: HistoryEntry }) {
  const a = entry.awards;
  const s = entry.seasonStats;
  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="font-heading font-bold text-lg">{entry.leagueName}</h2>
        <span className="text-sm text-muted font-heading font-bold">{entry.seasonNumber}. sezóna</span>
      </div>

      {/* Ocenění */}
      {a && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Award icon="🏆" label="Mistr">
            <TeamLink teamId={a.champion?.teamId} name={a.champion?.name} />
          </Award>
          {a.playerOfSeason?.name && (
            <Award icon="⭐" label="Hráč sezóny" reason={a.playerOfSeason.reason}>
              <span className="font-heading font-bold text-base">{a.playerOfSeason.name}</span>
            </Award>
          )}
          {a.topScorer?.name && (
            <Award icon="👟" label="Král střelců">
              <span className="font-heading font-bold text-base">{a.topScorer.name}</span>
              <span className="text-muted text-sm"> · {a.topScorer.goals} gólů</span>
            </Award>
          )}
          {a.managerOfSeason?.name && (
            <Award icon="🎩" label="Trenér sezóny" reason={a.managerOfSeason.reason}>
              <span className="font-heading font-bold text-base">{a.managerOfSeason.name}</span>
            </Award>
          )}
          {a.discovery?.name && (
            <Award icon="🌱" label="Objev sezóny" reason={a.discovery.reason}>
              <span className="font-heading font-bold text-base">{a.discovery.name}</span>
            </Award>
          )}
        </div>
      )}

      {/* Konečná tabulka */}
      {entry.finalStandings && entry.finalStandings.length > 0 && (
        <div>
          <SectionLabel>Konečná tabulka</SectionLabel>
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-1.5 px-2 text-[10px] font-heading font-bold text-muted uppercase">#</th>
                  <th className="py-1.5 px-2 text-[10px] font-heading font-bold text-muted uppercase">Tým</th>
                  <th className="py-1.5 px-2 text-[10px] font-heading font-bold text-muted uppercase text-center">Z</th>
                  <th className="py-1.5 px-2 text-[10px] font-heading font-bold text-muted uppercase text-center">V-R-P</th>
                  <th className="py-1.5 px-2 text-[10px] font-heading font-bold text-muted uppercase text-center">Skóre</th>
                  <th className="py-1.5 px-2 text-[10px] font-heading font-bold text-muted uppercase text-center">B</th>
                </tr>
              </thead>
              <tbody>
                {entry.finalStandings.map((r) => (
                  <tr key={r.teamId} className={`border-b border-gray-50 ${r.pos <= 3 ? "bg-pitch-50/40" : ""}`}>
                    <td className="py-1.5 px-2 tabular-nums font-heading font-bold">{r.pos}.</td>
                    <td className="py-1.5 px-2"><TeamLink teamId={r.teamId} name={r.teamName} /></td>
                    <td className="py-1.5 px-2 text-center tabular-nums">{r.played}</td>
                    <td className="py-1.5 px-2 text-center tabular-nums text-muted">{r.wins}-{r.draws}-{r.losses}</td>
                    <td className="py-1.5 px-2 text-center tabular-nums text-muted">{r.gf}:{r.ga}</td>
                    <td className="py-1.5 px-2 text-center tabular-nums font-heading font-bold">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Nejlepší jedenáctka */}
      {a?.bestEleven && a.bestEleven.length > 0 && (
        <div>
          <SectionLabel>Nejlepší jedenáctka</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {a.bestEleven.map((p) => (
              <div key={p.playerId} className="bg-gray-50 rounded-lg px-3 py-1.5 text-sm">
                <span className="text-[10px] font-heading font-bold text-pitch-600 uppercase mr-1.5">{p.position}</span>
                <span className="font-heading font-bold">{p.name}</span>
                <span className="text-muted text-xs"> · {p.teamName}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sezona v číslech */}
      {s && (
        <div>
          <SectionLabel>Sezona v číslech</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            <Stat label="Branek celkem" value={`${s.totalGoals}`} sub={`${s.goalsPerMatch} / zápas`} />
            <Stat label="Zápasů" value={`${s.matchesPlayed}`} />
            <Stat label="Karty" value={`${s.totalYellowCards} 🟨 / ${s.totalRedCards} 🟥`} />
            {s.biggestWin && <Stat label="Nejvyšší výhra" value={`${s.biggestWin.homeScore}:${s.biggestWin.awayScore}`} sub={`${s.biggestWin.homeTeam} – ${s.biggestWin.awayTeam}`} />}
            {s.recordAttendance && <Stat label="Rekordní návštěva" value={`${s.recordAttendance.value}`} sub={`${s.recordAttendance.homeTeam}`} />}
            {s.longestWinStreak && <Stat label="Nejdelší série" value={`${s.longestWinStreak.length}×`} sub={s.longestWinStreak.teamName} />}
          </div>
        </div>
      )}
    </div>
  );
}

function Award({ icon, label, reason, children }: { icon: string; label: string; reason?: string | null; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <div className="text-[10px] font-heading font-bold text-muted uppercase">{icon} {label}</div>
      <div className="text-base">{children}</div>
      {reason && <div className="text-xs text-muted mt-0.5 italic">„{reason}"</div>}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <div className="text-[10px] font-heading font-bold text-muted uppercase">{label}</div>
      <div className="font-heading font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted truncate">{sub}</div>}
    </div>
  );
}
