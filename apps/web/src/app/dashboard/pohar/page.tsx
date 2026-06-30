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

function teamLink(s: Side | null, cls: string) {
  if (!s) return <span className={`${cls} text-muted`}>volný los</span>;
  const label = <span className={`${cls} ${s.isBig ? "italic" : ""} truncate`}>{s.name}</span>;
  return s.teamId ? <Link href={`/dashboard/team/${s.teamId}`} className="hover:underline truncate">{label}</Link> : label;
}

function fmt(a: number | null, b: number | null) { return a == null || b == null ? "" : `${a}:${b}`; }

/** Jeden zápas pavouku — dva řádky s barevným pruhem týmu, vítěz tučně + zvýrazněn. */
function Tie({ m }: { m: BracketMatch }) {
  const sim = m.status === "simulated" && m.homeScore != null && m.awayScore != null;
  const homeWon = sim && (m.homeScore! > m.awayScore! || (m.homeScore === m.awayScore && (m.homePens ?? 0) > (m.awayPens ?? 0)));
  const awayWon = sim && !homeWon;
  const pens = sim && m.homeScore === m.awayScore && m.homePens != null;
  const Row = ({ s, score, won, pen }: { s: Side | null; score: number | null; won: boolean; pen: number | null }) => (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 ${won ? "bg-pitch-50" : ""}`}>
      <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: s?.color || "#cbd2c0" }} />
      {teamLink(s, `flex-1 min-w-0 text-[13px] leading-tight ${won ? "font-bold text-ink" : "text-ink/70"}`)}
      {pen && score != null && <span className="text-[10px] text-muted tabular-nums">({pen})</span>}
      <span className={`tabular-nums font-heading text-sm w-4 text-right ${won ? "text-ink" : "text-muted"}`}>{sim ? score : ""}</span>
    </div>
  );
  return (
    <div className={`rounded-lg border bg-white overflow-hidden shadow-sm ${m.upset ? "border-gold-300 ring-1 ring-gold-300" : "border-gray-100"}`}>
      <Row s={m.home} score={m.homeScore} won={homeWon} pen={pens ? m.homePens : null} />
      <div className="h-px bg-gray-100" />
      <Row s={m.away} score={m.awayScore} won={awayWon} pen={pens ? m.awayPens : null} />
      {m.upset && <div className="text-[9px] text-center bg-gold-300/15 text-gold-600 font-heading uppercase tracking-wide py-0.5">🔥 překvapení</div>}
    </div>
  );
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
        <div className="card p-8 text-center text-muted">Celorepublikový pohár zatím nezačal. Rozlosuje se v průběhu sezóny.</div>
      </div>
    );
  }

  const { cup, myTeam, myMatches, rounds } = data;
  const laterRounds = rounds.filter((r) => r.round >= cup.totalRounds - 3); // Osmifinále → Finále

  return (
    <div>
      <PageHeader name={cup.name} detail={`Sezóna ${cup.seasonNumber} · ${cup.status === "finished" ? "ukončeno" : `probíhá · ${rounds.find((r) => r.round === cup.currentRound)?.roundName ?? ""}`}`}>{null}</PageHeader>

      {/* Vítěz */}
      {cup.status === "finished" && cup.winner && (
        <div className="card relative overflow-hidden mb-5 text-center py-7" style={{ background: "radial-gradient(120% 140% at 50% 0%, #FFF7DA 0%, #F6E6A6 55%, #EAD27C 100%)" }}>
          <div className="text-5xl mb-1">🏆</div>
          <div className="text-[11px] font-heading uppercase tracking-[0.2em] text-ink/50">Vítěz poháru</div>
          <div className="text-3xl sm:text-4xl font-heading font-bold mt-1 flex items-center justify-center gap-2.5">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: cup.winner.color || "#888" }} />
            {teamLink(cup.winner, "")}
          </div>
        </div>
      )}

      {/* Tvoje cesta */}
      {myTeam && (
        <div className="card p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Tvoje cesta pohárem</SectionLabel>
            <span className={`text-xs font-heading font-bold px-2 py-0.5 rounded-full ${
              myTeam.isChampion ? "bg-gold-300/25 text-gold-600" : myTeam.alive ? "bg-pitch-50 text-pitch-600" : "bg-gray-100 text-muted"
            }`}>{myTeam.isChampion ? "🏆 VÍTĚZ" : myTeam.alive ? "VE HŘE" : `KONEC · ${myMatches.find((m) => m.round === myTeam.eliminatedRound)?.roundName ?? ""}`}</span>
          </div>
          {myMatches.length === 0 ? (
            <div className="text-sm text-muted py-2">Zatím bez zápasu — čeká se na los.</div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {myMatches.map((m, i) => {
                const won = m.won;
                const pen = m.status === "simulated" && m.myScore === m.oppScore && m.myPens != null;
                return (
                  <div key={i} className={`shrink-0 w-40 rounded-xl border p-3 ${won === true ? "border-pitch-200 bg-pitch-50/50" : won === false ? "border-card-red/30 bg-card-red/5" : "border-gray-100 bg-white"}`}>
                    <div className="text-[10px] font-heading uppercase tracking-wide text-muted">{m.roundName}</div>
                    <div className="text-[11px] text-muted mt-0.5">{m.isHome ? "doma" : "venku"} s</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: m.opponent?.color || "#ccc" }} />
                      {teamLink(m.opponent, "text-sm font-bold leading-tight")}
                    </div>
                    {m.status === "simulated" ? (
                      <div className="mt-2 flex items-center justify-between">
                        <span className="font-heading text-lg tabular-nums">{fmt(m.myScore, m.oppScore)}{pen && <span className="text-xs text-muted"> (p {m.myPens}:{m.oppPens})</span>}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${won ? "bg-pitch-100 text-pitch-600" : "bg-card-red/10 text-card-red"}`}>{won ? "POSTUP" : "KONEC"}</span>
                      </div>
                    ) : <div className="mt-2 text-xs text-muted">naplánováno</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Pavouk */}
      {laterRounds.length > 0 && (
        <div className="card p-4">
          <SectionLabel>Pavouk</SectionLabel>
          <div className="flex gap-3 sm:gap-5 overflow-x-auto pb-2 mt-2">
            {laterRounds.map((r) => (
              <div key={r.round} className="flex flex-col min-w-[170px] flex-1">
                <div className="text-[11px] font-heading uppercase tracking-wide text-muted text-center mb-2">{r.roundName}</div>
                <div className="flex flex-col justify-around gap-3 flex-1">
                  {r.matches.map((m, i) => <Tie key={i} m={m} />)}
                </div>
              </div>
            ))}
            {cup.status === "finished" && cup.winner && (
              <div className="flex flex-col min-w-[150px] justify-center items-center">
                <div className="text-[11px] font-heading uppercase tracking-wide text-muted text-center mb-2">Vítěz</div>
                <div className="flex flex-col items-center justify-center flex-1 text-center">
                  <div className="text-3xl">🏆</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: cup.winner.color || "#888" }} />
                    {teamLink(cup.winner, "font-heading font-bold text-base")}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
