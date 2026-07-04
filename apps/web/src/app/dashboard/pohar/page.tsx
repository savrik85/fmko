"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel, PageHeader } from "@/components/ui";

interface Side { name: string; color: string | null; isBig: boolean; teamId: string | null; strength: number; cupTeamId?: string }

/** Barva síly soupeře — zelená lehký, jantar střední, červená těžký. */
function strengthColor(s: number): string {
  if (s >= 55) return "bg-card-red/10 text-card-red";
  if (s >= 42) return "bg-amber-50 text-amber-700";
  return "bg-pitch-50 text-pitch-600";
}
interface BracketMatch {
  bracketPos: number; home: Side | null; away: Side | null;
  homeScore: number | null; awayScore: number | null; homePens: number | null; awayPens: number | null;
  winnerId: string | null; status: string; upset: boolean;
}
interface MyMatch {
  round: number; roundName: string; opponent: Side | null; isHome: boolean;
  myScore: number | null; oppScore: number | null; myPens: number | null; oppPens: number | null;
  status: string; won: boolean | null;
  scheduledAt?: string | null; daysUntil?: number | null;
}

/** „za 5 dní" / „zítra" / „dnes" — český countdown k zápasu. */
function daysLabel(d: number): string {
  if (d <= 0) return "dnes";
  if (d === 1) return "zítra";
  if (d <= 4) return `za ${d} dny`;
  return `za ${d} dní`;
}
interface Scorer {
  playerId: string; name: string; teamName: string; teamId: string | null;
  goals: number; assists: number; yellow: number; red: number; apps: number;
}
interface CupData {
  cup: { name: string; seasonNumber: number; status: string; totalRounds: number; currentRound: number; winner: Side | null } | null;
  myTeam: { name: string; eliminatedRound: number | null; alive: boolean; isChampion: boolean } | null;
  myMatches: MyMatch[];
  rounds: { round: number; roundName: string; matches: BracketMatch[] }[];
  prizes?: { round: number; roundName: string; prize: number }[];
  scorers?: Scorer[];
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function TeamCell({ s, align, bold }: { s: Side | null; align: "left" | "right"; bold: boolean }) {
  const badge = (
    <span className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-heading font-bold text-white shrink-0" style={{ background: s?.color || "#9aa18c" }}>
      {s ? initials(s.name) : "?"}
    </span>
  );
  const name = s?.teamId
    ? <Link href={`/dashboard/team/${s.teamId}`} className={`truncate hover:underline ${s.isBig ? "italic" : ""}`}>{s.name}</Link>
    : s?.cupTeamId
      ? <Link href={`/dashboard/pohar/tym/${s.cupTeamId}`} className={`truncate hover:underline ${s.isBig ? "italic" : ""}`}>{s.name}</Link>
      : <span className={`truncate ${s?.isBig ? "italic" : ""} ${!s ? "text-muted" : ""}`}>{s?.name ?? "volný los"}</span>;
  return (
    <div className={`flex items-center gap-1.5 min-w-0 flex-1 ${align === "right" ? "sm:flex-row-reverse sm:text-right" : ""}`}>
      {badge}
      <span className={`min-w-0 text-sm leading-tight ${bold ? "font-bold text-ink" : "text-ink/70"}`}>{name}</span>
      {s && <span className={`shrink-0 text-[10px] font-heading font-bold tabular-nums px-1 py-0.5 rounded ${strengthColor(s.strength)}`} title="síla soupeře">{s.strength}</span>}
    </div>
  );
}

/** Řádek pohárového zápasu — desktop: domácí | skóre | hosté; mobil: týmy pod sebou. */
function TieRow({ m, mine }: { m: BracketMatch; mine: boolean }) {
  const sim = m.status === "simulated" && m.homeScore != null && m.awayScore != null;
  const homeWon = sim && (m.homeScore! > m.awayScore! || (m.homeScore === m.awayScore && (m.homePens ?? 0) > (m.awayPens ?? 0)));
  const awayWon = sim && !homeWon;
  const pens = sim && m.homeScore === m.awayScore && m.homePens != null;
  return (
    <div className={`rounded-lg border ${mine ? "border-pitch-300 bg-pitch-50" : "border-gray-100 bg-white"}`}>
      {/* ≥sm: jeden řádek — domácí | skóre | hosté */}
      <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-2">
        <TeamCell s={m.home} align="right" bold={homeWon} />
        <div className="shrink-0 w-14 text-center">
          {sim
            ? <div className="font-heading font-[800] text-sm tabular-nums leading-none">{m.homeScore}:{m.awayScore}{pens && <div className="text-[9px] text-muted font-normal mt-0.5">pen {m.homePens}:{m.awayPens}</div>}</div>
            : <span className="text-xs text-muted font-heading">vs</span>}
        </div>
        <TeamCell s={m.away} align="left" bold={awayWon} />
        <span className="w-3.5 shrink-0 text-center text-xs">{m.upset ? "🔥" : ""}</span>
      </div>
      {/* mobil: týmy pod sebou, skóre vpravo */}
      <div className="sm:hidden px-2.5 py-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <TeamCell s={m.home} align="left" bold={homeWon} />
          <span className={`font-heading font-[800] text-sm tabular-nums shrink-0 w-5 text-right ${homeWon ? "text-ink" : "text-ink/60"}`}>{sim ? m.homeScore : "–"}</span>
        </div>
        <div className="flex items-center gap-2">
          <TeamCell s={m.away} align="left" bold={awayWon} />
          <span className={`font-heading font-[800] text-sm tabular-nums shrink-0 w-5 text-right ${awayWon ? "text-ink" : "text-ink/60"}`}>{sim ? m.awayScore : "–"}</span>
        </div>
        {(pens || m.upset) && (
          <div className="text-[11px] text-muted pl-8">
            {pens && <span>na penalty {m.homePens}:{m.awayPens}</span>}
            {m.upset && <span className={pens ? "ml-2" : ""}>🔥 překvapení</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PoharPage() {
  const { teamId } = useTeam();
  const [data, setData] = useState<CupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pavouk" | "strelci">("pavouk");

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
      <>
        <PageHeader name="Pohár" detail="Celorepublikový amatérský pohár">{null}</PageHeader>
        <div className="page-container space-y-5">
          <div className="card p-8 text-center text-muted">Celorepublikový pohár zatím nezačal. Rozlosuje se v průběhu sezóny.</div>
        </div>
      </>
    );
  }

  const { cup, myTeam, myMatches, rounds } = data;
  const myCtName = myTeam?.name;
  const matchIsMine = (m: BracketMatch) => !!myCtName && (m.home?.name === myCtName || m.away?.name === myCtName);
  const prizeByRound = new Map((data.prizes ?? []).map((p) => [p.round, p.prize]));
  const myEarnings = myMatches.filter((m) => m.won).reduce((s, m) => s + (prizeByRound.get(m.round) ?? 0), 0);

  return (
    <>
      <PageHeader name={cup.name} detail={`Sezóna ${cup.seasonNumber} · ${cup.status === "finished" ? "ukončeno" : `${rounds.find((r) => r.round === cup.currentRound)?.roundName ?? "probíhá"}`} · ${rounds[0]?.matches.length ? rounds[0].matches.length * 2 : ""} týmů`}>{null}</PageHeader>
      <div className="page-container space-y-5">

      {/* Vítěz (stejný highlight jako jinde v projektu) */}
      {cup.status === "finished" && cup.winner && (
        <div className="card px-4 py-5 bg-gradient-to-r from-gold-50 to-pitch-50 border border-gold-200 text-center">
          <div className="text-3xl mb-1">🏆</div>
          <div className="text-xs font-heading uppercase tracking-wider text-muted">Vítěz poháru</div>
          <div className="text-2xl font-heading font-bold mt-0.5">
            {cup.winner.teamId ? <Link href={`/dashboard/team/${cup.winner.teamId}`} className="hover:underline">{cup.winner.name}</Link> : cup.winner.cupTeamId ? <Link href={`/dashboard/pohar/tym/${cup.winner.cupTeamId}`} className={`hover:underline ${cup.winner.isBig ? "italic" : ""}`}>{cup.winner.name}</Link> : <span className={cup.winner.isBig ? "italic" : ""}>{cup.winner.name}</span>}
          </div>
        </div>
      )}

      {/* Odměny za postup */}
      {data.prizes && data.prizes.length > 0 && (
        <div>
          <SectionLabel>Odměny za výhru v kole</SectionLabel>
          <div className="card p-3 sm:p-4 mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
            {data.prizes.map((p) => (
              <div key={p.round}>
                <div className="text-xs text-muted">{p.roundName}</div>
                <div className="font-heading font-bold tabular-nums text-base leading-tight">{p.prize.toLocaleString("cs")} Kč</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tvoje cesta */}
      {myTeam && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <SectionLabel>Tvoje cesta{myEarnings > 0 && <span className="text-pitch-600 font-bold normal-case"> · vyděláno {myEarnings.toLocaleString("cs")} Kč</span>}</SectionLabel>
            <span className={`text-xs font-heading font-bold ${myTeam.isChampion ? "text-gold-600" : myTeam.alive ? "text-pitch-600" : "text-muted"}`}>
              {myTeam.isChampion ? "🏆 vítěz poháru" : myTeam.alive ? "ve hře" : `vyřazeni — ${myMatches.find((m) => m.round === myTeam.eliminatedRound)?.roundName ?? ""}`}
            </span>
          </div>
          <div className="card">
            {myMatches.length === 0 ? (
              <div className="px-3 py-4 text-sm text-muted text-center">Zatím bez zápasu — čeká se na los.</div>
            ) : myMatches.map((m, i) => {
              const pen = m.status === "simulated" && m.myScore === m.oppScore && m.myPens != null;
              return (
                <div key={i} className="px-3 py-2.5 border-b border-gray-50 last:border-b-0">
                  {/* mobil: kolo + doma/venku nad soupeřem */}
                  <div className="sm:hidden text-[11px] font-heading uppercase text-muted mb-1">
                    {m.roundName} · {m.isHome ? "doma" : "venku"}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="hidden sm:block text-[11px] font-heading uppercase text-muted w-24 shrink-0">{m.roundName}</span>
                    <span className="hidden sm:block text-xs text-muted shrink-0 w-12">{m.isHome ? "doma" : "venku"}</span>
                    <span className="flex-1 min-w-0 text-base sm:text-sm font-bold truncate">
                      {m.opponent?.teamId ? <Link href={`/dashboard/team/${m.opponent.teamId}`} className="hover:underline">{m.opponent.name}</Link> : m.opponent?.cupTeamId ? <Link href={`/dashboard/pohar/tym/${m.opponent.cupTeamId}`} className={`hover:underline ${m.opponent.isBig ? "italic" : ""}`}>{m.opponent.name}</Link> : <span className={m.opponent?.isBig ? "italic" : ""}>{m.opponent?.name}</span>}
                    </span>
                    {m.status === "simulated" ? (
                      <>
                        <span className="font-heading font-[800] text-sm tabular-nums shrink-0">{m.myScore}:{m.oppScore}{pen && <span className="text-[10px] text-muted font-normal"> (p {m.myPens}:{m.oppPens})</span>}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${m.won ? "bg-pitch-50 text-pitch-600" : "bg-card-red/10 text-card-red"}`}>{m.won ? "POSTUP" : "KONEC"}</span>
                      </>
                    ) : (
                      <span className="text-xs shrink-0">
                        {m.scheduledAt && <span className="text-muted">{new Date(m.scheduledAt).toLocaleDateString("cs", { weekday: "short", day: "numeric", month: "numeric" })}</span>}
                        {m.daysUntil != null && <span className="ml-1.5 font-heading font-bold text-pitch-600">{daysLabel(m.daysUntil)}</span>}
                        {!m.scheduledAt && m.daysUntil == null && <span className="text-muted">naplánováno</span>}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Taby — pavouk / střelci */}
      <div className="flex gap-1 bg-surface rounded-xl p-1">
        {(["pavouk", "strelci"] as const).map((key) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2.5 text-sm font-heading font-bold rounded-lg transition-colors ${
              tab === key ? "bg-white text-pitch-600 shadow-sm" : "text-muted hover:text-ink"
            }`}>
            {key === "pavouk" ? "🏆 Pavouk" : "⚽ Střelci"}
          </button>
        ))}
      </div>

      {/* Střelci poháru */}
      {tab === "strelci" && (
        (data.scorers && data.scorers.length > 0) ? (
          <div className="card">
            {data.scorers.map((s, i) => (
              <div key={s.playerId} className="flex items-center gap-3 px-3 py-2 border-b border-gray-50 last:border-b-0">
                <span className="w-5 text-right text-xs text-muted tabular-nums shrink-0">{i + 1}.</span>
                <span className="flex-1 min-w-0 text-sm truncate">
                  <span className="font-bold">{s.teamId ? <Link href={`/dashboard/team/${s.teamId}`} className="hover:underline">{s.name}</Link> : s.name}</span>
                  <span className="text-muted"> · {s.teamName}</span>
                </span>
                {s.assists > 0 && <span className="text-xs text-muted shrink-0">{s.assists} A</span>}
                {(s.yellow > 0 || s.red > 0) && (
                  <span className="text-xs shrink-0 tabular-nums">
                    {s.yellow > 0 && <span className="text-amber-600">🟨{s.yellow}</span>}
                    {s.red > 0 && <span className="text-card-red ml-1">🟥{s.red}</span>}
                  </span>
                )}
                <span className="font-heading font-[800] text-sm tabular-nums shrink-0 w-6 text-right">{s.goals}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="card p-8 text-center text-muted text-sm">Zatím žádní střelci — góly se objeví po odehrání zápasů.</div>
        )
      )}

      {/* Všechna kola */}
      {tab === "pavouk" && [...rounds].reverse().map((r) => (
        <div key={r.round}>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="font-heading font-bold text-base text-pitch-600">{r.roundName}</span>
            <span className="text-sm text-muted">· {r.matches.length} {r.matches.length === 1 ? "zápas" : r.matches.length < 5 ? "zápasy" : "zápasů"}</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
            {r.matches.map((m, i) => <TieRow key={i} m={m} mine={matchIsMine(m)} />)}
          </div>
        </div>
      ))}
      </div>
    </>
  );
}
