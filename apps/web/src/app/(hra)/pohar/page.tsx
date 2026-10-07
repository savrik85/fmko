"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel, PageHeader, Tabs, useTabParam } from "@/components/ui";
import { FixtureGroup, FixtureRow, type FixtureCrest, type FixtureSide } from "@/components/match/fixture-row";
import { RoundPager } from "@/components/match/round-pager";

// Pořadí určuje i výchozí záložku — první je ta bez ?tab= v adrese.
const TAB_KEYS = ["pavouk", "strelci"] as const;

interface Side { name: string; color: string | null; isBig: boolean; teamId: string | null; strength: number; cupTeamId?: string; crest?: FixtureCrest | null }
interface BracketMatch {
  id?: string; scheduledAt?: string | null;
  bracketPos: number; home: Side | null; away: Side | null;
  homeScore: number | null; awayScore: number | null; homePens: number | null; awayPens: number | null;
  winnerId: string | null; status: string; upset: boolean;
}
interface MyMatch {
  matchId: string;
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

const GOLD = "#B8862B";

function fixtureSide(s: Side | null): FixtureSide {
  if (!s) return { name: "volný los" };
  return {
    name: s.name,
    href: s.teamId ? `/tym/${s.teamId}` : s.cupTeamId ? `/pohar/tym/${s.cupTeamId}` : null,
    color: s.color,
    crest: s.crest ?? null,
    italic: s.isBig,
  };
}

/** Pohárový zápas: tabule vede na detail odehraného zápasu, před zápasem ukáže datum. */
function TieRow({ m, mine }: { m: BracketMatch; mine: boolean }) {
  const played = m.status === "simulated" && m.homeScore != null && m.awayScore != null;
  const homeWon = played && (m.homeScore! > m.awayScore! || (m.homeScore === m.awayScore && (m.homePens ?? 0) > (m.awayPens ?? 0)));
  const kickoff = m.scheduledAt
    ? new Date(m.scheduledAt).toLocaleDateString("cs", { day: "numeric", month: "numeric" })
    : null;
  return (
    <FixtureRow
      home={fixtureSide(m.home)}
      away={fixtureSide(m.away)}
      score={played ? { home: m.homeScore!, away: m.awayScore!, homePens: m.homePens, awayPens: m.awayPens } : null}
      kickoff={kickoff}
      winner={played ? (homeWon ? "home" : "away") : null}
      href={played && m.id ? `/zapas/${m.id}` : null}
      hrefLabel={`Detail zápasu ${m.home?.name ?? ""} proti ${m.away?.name ?? ""}`}
      accent={mine ? GOLD : null}
      meta={m.upset ? <span className="font-heading font-bold text-ink/70">🔥 překvapení</span> : undefined}
    />
  );
}

export default function PoharPage() {
  const { teamId } = useTeam();
  const [data, setData] = useState<CupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useTabParam(TAB_KEYS);

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
        <PageHeader compact name="Pohár" detail="Celorepublikový amatérský pohár">{null}</PageHeader>
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
      <PageHeader compact name={cup.name} detail={`Sezóna ${cup.seasonNumber} · ${cup.status === "finished" ? "ukončeno" : `${rounds.find((r) => r.round === cup.currentRound)?.roundName ?? "probíhá"}`} · ${rounds[0]?.matches.length ? rounds[0].matches.length * 2 : ""} týmů`}>{null}</PageHeader>
      <div className="page-container space-y-5">

      {/* Vítěz (stejný highlight jako jinde v projektu) */}
      {cup.status === "finished" && cup.winner && (
        <div className="card px-4 py-5 bg-gradient-to-r from-gold-50 to-pitch-50 border border-gold-200 text-center">
          <div className="text-3xl mb-1">🏆</div>
          <div className="text-xs font-heading uppercase tracking-wider text-muted">Vítěz poháru</div>
          <div className="text-2xl font-heading font-bold mt-0.5">
            {cup.winner.teamId ? <Link href={`/tym/${cup.winner.teamId}`} className="hover:underline">{cup.winner.name}</Link> : cup.winner.cupTeamId ? <Link href={`/pohar/tym/${cup.winner.cupTeamId}`} className={`hover:underline ${cup.winner.isBig ? "italic" : ""}`}>{cup.winner.name}</Link> : <span className={cup.winner.isBig ? "italic" : ""}>{cup.winner.name}</span>}
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

      {/* Tvoje cesta — stejné řádky jako pavouk, s kolem a výsledkem pod zápasem */}
      {myTeam && (() => {
        const entryById = new Map(rounds.flatMap((r) => r.matches).filter((m) => m.id).map((m) => [m.id as string, m]));
        const status = myTeam.isChampion ? "vítěz poháru" : myTeam.alive ? "ve hře" : "vyřazeni";
        return (
          <FixtureGroup
            title="Tvoje cesta"
            note={myEarnings > 0 ? `${status}, vyděláno ${myEarnings.toLocaleString("cs")} Kč` : status}
          >
            {myMatches.length === 0 ? (
              <div className="px-4 py-4 text-sm text-muted text-center">Zatím bez zápasu, čeká se na los.</div>
            ) : myMatches.map((m) => {
              const e = entryById.get(m.matchId);
              if (!e) return null;
              const played = m.status === "simulated" && e.homeScore != null && e.awayScore != null;
              const homeWon = played && (e.homeScore! > e.awayScore! || (e.homeScore === e.awayScore && (e.homePens ?? 0) > (e.awayPens ?? 0)));
              return (
                <FixtureRow
                  key={m.matchId}
                  home={fixtureSide(e.home)}
                  away={fixtureSide(e.away)}
                  score={played ? { home: e.homeScore!, away: e.awayScore!, homePens: e.homePens, awayPens: e.awayPens } : null}
                  kickoff={m.scheduledAt ? new Date(m.scheduledAt).toLocaleDateString("cs", { day: "numeric", month: "numeric" }) : null}
                  winner={played ? (homeWon ? "home" : "away") : null}
                  href={played ? `/zapas/${m.matchId}` : `/zapas?calendarId=${m.matchId}`}
                  hrefLabel={played ? "Detail zápasu" : "Nastavit sestavu"}
                  accent={GOLD}
                  meta={
                    <>
                      <span className="font-heading font-bold text-ink/80">{m.roundName}</span>
                      {played && (
                        <span className={`font-heading font-bold ${m.won ? "text-pitch-600" : "text-card-red"}`}>{m.won ? "postup" : "konec v poháru"}</span>
                      )}
                      {!played && m.daysUntil != null && <span>{daysLabel(m.daysUntil)}</span>}
                    </>
                  }
                />
              );
            })}
          </FixtureGroup>
        );
      })()}

      {/* Taby — pavouk / střelci */}
      <Tabs
        value={tab}
        onChange={setTab}
        ariaLabel="Pohár"
        items={[
          { key: "pavouk", label: "Pavouk", icon: "🏆" },
          { key: "strelci", label: "Střelci", icon: "⚽" },
        ]}
      />

      {/* Střelci poháru */}
      {tab === "strelci" && (
        (data.scorers && data.scorers.length > 0) ? (
          <div className="card">
            {data.scorers.map((s, i) => (
              <div key={s.playerId} className="flex items-center gap-3 px-3 py-2 border-b border-gray-50 last:border-b-0">
                <span className="w-5 text-right text-xs text-muted tabular-nums shrink-0">{i + 1}.</span>
                <span className="flex-1 min-w-0 text-sm truncate">
                  <span className="font-bold">{s.teamId ? <Link href={`/tym/${s.teamId}`} className="hover:underline">{s.name}</Link> : s.name}</span>
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
      {tab === "pavouk" && rounds.length > 0 && (
        // Po kolech: výchozí je aktuální kolo (po konci poháru finále).
        <RoundPager
          pages={rounds.map((r) => ({ key: String(r.round), label: r.roundName }))}
          initialKey={String(rounds.some((r) => r.round === cup.currentRound) ? cup.currentRound : rounds.at(-1)!.round)}
        >
          {(key) => {
            const r = rounds.find((x) => String(x.round) === key);
            if (!r) return null;
            // Moje zápasy nahoru, ať je v kole se 64 dvojicemi nemusím hledat.
            const ordered = [...r.matches].sort((a, b) => Number(matchIsMine(b)) - Number(matchIsMine(a)));
            const date = r.matches.find((m) => m.scheduledAt)?.scheduledAt;
            return (
              <FixtureGroup
                title={date ? `${r.roundName}, ${new Date(date).toLocaleDateString("cs", { weekday: "short", day: "numeric", month: "numeric" })}` : r.roundName}
                note={`${r.matches.length} ${r.matches.length === 1 ? "zápas" : r.matches.length < 5 ? "zápasy" : "zápasů"}`}
              >
                {ordered.map((m, i) => <TieRow key={m.id ?? i} m={m} mine={matchIsMine(m)} />)}
              </FixtureGroup>
            );
          }}
        </RoundPager>
      )}
      </div>
    </>
  );
}
