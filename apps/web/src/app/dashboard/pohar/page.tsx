"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel, PageHeader } from "@/components/ui";

interface Side { name: string; color: string | null; isBig: boolean; teamId: string | null }
interface BracketMatch {
  bracketPos: number; home: Side | null; away: Side | null;
  homeScore: number | null; awayScore: number | null; homePens: number | null; awayPens: number | null;
  winnerId: string | null; status: string; upset: boolean;
}
interface MyMatch {
  round: number; roundName: string; opponent: Side | null; isHome: boolean;
  myScore: number | null; oppScore: number | null; myPens: number | null; oppPens: number | null;
  status: string; won: boolean | null;
}
interface CupData {
  cup: { name: string; seasonNumber: number; status: string; totalRounds: number; currentRound: number; winner: Side | null } | null;
  myTeam: { name: string; eliminatedRound: number | null; alive: boolean; isChampion: boolean } | null;
  myMatches: MyMatch[];
  rounds: { round: number; roundName: string; matches: BracketMatch[] }[];
}

function TeamName({ s }: { s: Side | null }) {
  if (!s) return <span className="text-muted">?</span>;
  const inner = (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color || "#999" }} />
      <span className={s.isBig ? "italic" : ""}>{s.name}</span>
    </span>
  );
  return s.teamId ? <Link href={`/dashboard/team/${s.teamId}`} className="hover:underline">{inner}</Link> : inner;
}

function score(a: number | null, b: number | null, ap: number | null, bp: number | null) {
  if (a == null || b == null) return "—";
  const pen = (ap != null && bp != null && a === b) ? ` (pen ${ap}:${bp})` : "";
  return `${a}:${b}${pen}`;
}

export default function PoharPage() {
  const { teamId } = useTeam();
  const [data, setData] = useState<CupData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    setLoading(true);
    apiFetch<CupData>(`/api/teams/${teamId}/cup`)
      .then(setData)
      .catch((e) => console.error("load cup:", e))
      .finally(() => setLoading(false));
  }, [teamId]);

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  if (!data?.cup) {
    return (
      <div>
        <PageHeader name="Pohár" detail="Celorepublikový amatérský pohár">{null}</PageHeader>
        <div className="card p-6 text-center text-muted">Celorepublikový pohár zatím nezačal. Rozlosuje se v průběhu sezóny.</div>
      </div>
    );
  }

  const { cup, myTeam, myMatches, rounds } = data;
  const laterRounds = rounds.filter((r) => r.round >= cup.totalRounds - 3); // Osmifinále → Finále

  return (
    <div>
      <PageHeader name={cup.name} detail={`Sezóna ${cup.seasonNumber} · ${cup.status === "finished" ? "ukončeno" : "probíhá"}`}>{null}</PageHeader>

      {/* Vítěz / můj stav */}
      {cup.status === "finished" && cup.winner && (
        <div className="card p-5 mb-5 text-center" style={{ background: "linear-gradient(135deg,#FCEFC7,#F8E08E)" }}>
          <div className="text-xs font-heading uppercase tracking-wider text-ink/60">🏆 Vítěz poháru</div>
          <div className="text-2xl font-heading font-bold mt-1"><TeamName s={cup.winner} /></div>
        </div>
      )}
      {myTeam && (
        <div className="card p-4 mb-5">
          <SectionLabel>Tvoje cesta pohárem</SectionLabel>
          <div className="text-sm mb-3">
            {myTeam.isChampion ? <span className="font-bold text-pitch-600">🏆 Vyhráli jste celý pohár!</span>
              : myTeam.alive ? <span className="font-bold text-pitch-600">Stále ve hře 💪</span>
              : <span className="text-muted">Vyřazeni — {myMatches.find((m) => m.round === myTeam.eliminatedRound)?.roundName ?? `${myTeam.eliminatedRound}. kolo`}</span>}
          </div>
          {myMatches.length === 0 ? (
            <div className="text-sm text-muted">Zatím bez zápasu — čeká se na los.</div>
          ) : (
            <div className="space-y-0">
              {myMatches.map((m, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-b-0 text-sm">
                  <span className="text-[11px] font-heading uppercase text-muted w-24 shrink-0">{m.roundName}</span>
                  <span className="flex-1 min-w-0">{m.isHome ? "doma" : "venku"} vs <TeamName s={m.opponent} /></span>
                  {m.status === "simulated" ? (
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="tabular-nums font-heading">{score(m.myScore, m.oppScore, m.myPens, m.oppPens)}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${m.won ? "bg-pitch-50 text-pitch-600" : "bg-card-red/10 text-card-red"}`}>{m.won ? "POSTUP" : "KONEC"}</span>
                    </span>
                  ) : <span className="text-xs text-muted shrink-0">naplánováno</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pavouk — pozdější kola */}
      {laterRounds.map((r) => (
        <div key={r.round} className="card p-4 mb-4">
          <SectionLabel>{r.roundName}</SectionLabel>
          <div className="space-y-0">
            {r.matches.map((m, i) => {
              const sim = m.status === "simulated" && m.homeScore != null && m.awayScore != null;
              const homeWon = sim && (m.homeScore! > m.awayScore! || (m.homeScore === m.awayScore && (m.homePens ?? 0) > (m.awayPens ?? 0)));
              const awayWon = sim && !homeWon;
              return (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-b-0 text-sm">
                  <span className="flex-1 min-w-0 text-right pr-2">{homeWon ? <strong><TeamName s={m.home} /></strong> : <TeamName s={m.home} />}</span>
                  <span className="tabular-nums font-heading text-xs px-2 shrink-0">{sim ? score(m.homeScore, m.awayScore, m.homePens, m.awayPens) : "vs"}</span>
                  <span className="flex-1 min-w-0 pl-2">{awayWon ? <strong><TeamName s={m.away} /></strong> : <TeamName s={m.away} />}</span>
                  {m.upset && <span className="text-[10px] ml-2 shrink-0" title="Překvapení!">🔥</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
