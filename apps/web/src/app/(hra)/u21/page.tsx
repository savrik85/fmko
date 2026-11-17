"use client";

import { FixtureGroup, FixtureRow, type FixtureSide } from "@/components/match/fixture-row";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { LeagueStatsTab, type StatsData } from "@/components/league/league-stats";
import { apiFetch } from "@/lib/api";
import { Spinner, PositionBadge, BadgePreview, useConfirm, Tabs, useTabParam, DataTable, EntityCell, ListCard, ListRow, ListEmpty, RowValue, RatingPill, ratingToneIn, type DataColumn } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { U21Rozvoj } from "@/components/players/u21-rozvoj";
import { YouthSectionNav } from "@/components/players/youth-section-nav";
import { U21Attributes } from "@/components/players/u21-attributes";
import type { BadgePattern } from "@/components/ui";

interface U21Player {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  age: number;
  position: "GK" | "DEF" | "MID" | "FWD";
  overall_rating: number;
  weekly_wage: number;
  status: string | null;
  parent_club_id: string | null;
  next_match_return: number;
}

interface PlayerStat {
  playerId: string;
  appearances: number;
  goals: number;
  assists: number;
  avgRating: number | null;
  manOfMatch: number;
}

interface SeniorPlayer {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string;
  age: number;
  position: "GK" | "DEF" | "MID" | "FWD";
  overall_rating: number;
  weekly_wage: number | null;
  loan_from_team_id: string | null;
  avatar?: Record<string, unknown> | null;
}

interface Standing {
  pos: number;
  team: string;
  teamId: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  points: number;
  isPlayer?: boolean;
  isAi?: boolean;
  primaryColor?: string;
  secondaryColor?: string;
  badgePattern?: string;
}

interface LeagueRound {
  round: number;
  scheduledAt: string | null;
  matches: Array<{
    id: string;
    status: string;
    homeTeamId?: string;
    homeName: string;
    homeColor?: string;
    homeSecondary?: string;
    homeBadge?: string;
    homeIsAi?: boolean;
    homeScore: number | null;
    awayTeamId?: string;
    awayName: string;
    awayColor?: string;
    awaySecondary?: string;
    awayBadge?: string;
    awayIsAi?: boolean;
    awayScore: number | null;
  }>;
}

// Pořadí určuje i výchozí záložku — první je ta bez ?tab= v adrese.
const TAB_KEYS = ["kadr", "atributy", "rozvoj", "tabulka", "rozpis", "statistiky"] as const;

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("cs", { day: "numeric", month: "numeric" });
}

function ini(name: string): string {
  return name.replace(/ U21$/, "").split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

export default function U21Page() {
  const { teamId, gameDate: ctxGameDate } = useTeam();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [tab, setTab] = useTabParam(TAB_KEYS);

  // Akademie byla záložkou U21 (?tab=akademie), teď má vlastní stránku v menu Mládež
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "akademie") {
      window.location.replace("/akademie");
    }
  }, []);
  const [u21TeamId, setU21TeamId] = useState<string | null>(null);
  const [u21LeagueId, setU21LeagueId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [seniorPlayers, setSeniorPlayers] = useState<SeniorPlayer[]>([]);
  const [u21Players, setU21Players] = useState<U21Player[]>([]);
  const [statsMap, setStatsMap] = useState<Map<string, PlayerStat>>(new Map());
  const [growthMap, setGrowthMap] = useState<Map<string, number>>(new Map());
  const [standings, setStandings] = useState<Standing[]>([]);
  const [standingsLoaded, setStandingsLoaded] = useState(false);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);
  const [standingsError, setStandingsError] = useState<string | null>(null);
  const [statsData, setStatsData] = useState<StatsData | null>(null);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [onlyOurMatches, setOnlyOurMatches] = useState(true);
  const [rounds, setRounds] = useState<LeagueRound[]>([]);
  const [squadLoaded, setSquadLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadKadr = useCallback(async () => {
    if (!teamId || !u21TeamId) return;
    try {
      const [senior, u21, seniorStats, u21Stats, seniorGrowth, u21Growth] = await Promise.all([
        apiFetch<SeniorPlayer[]>(`/api/teams/${teamId}/players`),
        apiFetch<{ players: U21Player[] }>(`/api/teams/${teamId}/u21/players`),
        apiFetch<{ stats: PlayerStat[] }>(`/api/teams/${teamId}/stats`),
        apiFetch<{ stats: PlayerStat[] }>(`/api/teams/${u21TeamId}/stats`),
        apiFetch<{ growth: Array<{ playerId: string; totalChange: number }> }>(`/api/teams/${teamId}/growth`),
        apiFetch<{ growth: Array<{ playerId: string; totalChange: number }> }>(`/api/teams/${teamId}/u21/growth`),
      ]);
      setSeniorPlayers(Array.isArray(senior) ? senior : []);
      setU21Players(u21.players ?? []);
      const m = new Map<string, PlayerStat>();
      for (const s of seniorStats.stats ?? []) m.set(s.playerId, s);
      for (const s of u21Stats.stats ?? []) m.set(s.playerId, s); // U21 přepíše A pokud hráč pendluje (zobrazujeme stats podle aktuálního týmu)
      setStatsMap(m);
      const g = new Map<string, number>();
      for (const x of seniorGrowth.growth ?? []) g.set(x.playerId, x.totalChange);
      for (const x of u21Growth.growth ?? []) g.set(x.playerId, x.totalChange);
      setGrowthMap(g);
      setSquadLoaded(true);
    } catch (e) {
      console.error("u21 kadr load:", e);
      setError("Nepodařilo se načíst kádry.");
    }
  }, [teamId, u21TeamId]);

  // Init: zjistit U21 tým a ligu
  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ u21TeamId: string | null; u21LeagueId: string | null }>(`/api/teams/${teamId}/u21`)
      .then((r) => {
        setU21TeamId(r.u21TeamId);
        setU21LeagueId(r.u21LeagueId);
        setLoading(false);
      })
      .catch((e) => {
        console.error("fetch u21 info:", e);
        setLoading(false);
      });
  }, [teamId]);

  // Load kádr tab
  useEffect(() => {
    if (tab === "kadr") loadKadr();
  }, [tab, loadKadr]);

  // Load tabulka
  useEffect(() => {
    if (tab !== "tabulka" || !u21LeagueId) return;
    apiFetch<{ standings: Standing[] }>(`/api/leagues/${u21LeagueId}/standings`)
      .then((r) => { setStandings(r.standings ?? []); setStandingsLoaded(true); setStandingsError(null); })
      .catch((e) => { console.error("fetch u21 standings:", e); setStandingsError("Tabulku se nepodařilo načíst. Zkus záložku otevřít znovu."); });
  }, [tab, u21LeagueId]);

  // Statistiky soutěže U21: stejný endpoint jako liga áčka, jen za U21 tým.
  useEffect(() => {
    if (tab !== "statistiky" || !u21TeamId || statsLoaded) return;
    apiFetch<StatsData>(`/api/teams/${u21TeamId}/league-stats`)
      .then((d) => { setStatsData(d); setStatsLoaded(true); })
      .catch((e) => { console.error("fetch u21 league-stats:", e); setStatsLoaded(true); });
  }, [tab, u21TeamId, statsLoaded]);

  // Load rozpis hned po zjištění U21 ligy — potřebujeme i pro „Nejbližší zápas" banner.
  useEffect(() => {
    if (!u21LeagueId || !teamId) return;
    apiFetch<{ rounds: LeagueRound[] }>(`/api/teams/${teamId}/league-schedule?leagueId=${u21LeagueId}`)
      .then((r) => { setRounds(r.rounds ?? []); setScheduleLoaded(true); })
      .catch((e) => { console.error("fetch u21 rounds:", e); setScheduleError("Rozpis se nepodařilo načíst. Obnov stránku."); });
  }, [u21LeagueId, teamId]);

  const sendToU21 = async (playerId: string, mode: "permanent" | "next_match") => {
    if (!teamId) return;
    setBusy(playerId);
    setError(null);
    try {
      await apiFetch(`/api/teams/${teamId}/players/${playerId}/send-to-u21`, {
        method: "POST",
        body: JSON.stringify({ mode }),
        headers: { "Content-Type": "application/json" },
      });
      await loadKadr();
    } catch (e) {
      console.error("send to u21:", e);
      setError(e instanceof Error ? e.message : "Přesun do U21 selhal.");
    } finally {
      setBusy(null);
    }
  };

  const promoteToA = async (player: U21Player) => {
    if (!teamId) return;
    const ok = await confirm({
      title: "Povolat do A-týmu?",
      description: `${player.first_name} ${player.last_name} (${player.age} let, ${player.position}) přejde z U21 trvale do A-týmu.`,
      confirmLabel: "Povolat",
    });
    if (!ok) return;
    setBusy(player.id);
    setError(null);
    try {
      await apiFetch(`/api/teams/${teamId}/u21/players/${player.id}/promote`, {
        method: "POST",
      });
      await loadKadr();
    } catch (e) {
      console.error("promote:", e);
      setError(e instanceof Error ? e.message : "Povolání do A selhalo.");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="p-3 sm:p-4 md:p-6 space-y-3">
        <div className="flex items-center justify-center py-12"><Spinner /></div>
      </div>
    );
  }

  if (!u21TeamId) {
    return (
      <div className="p-3 sm:p-4 md:p-6 space-y-3">
        {/* I bez dorostu musí jít přepnout na Akademii (SMS žáků posílají do Mládež → Akademie) */}
        <YouthSectionNav />
        <div className="card p-6 text-center text-gray-600">
          Klub nemá dorost (U21). Žáky najdeš v Akademii.
        </div>
      </div>
    );
  }

  const young = seniorPlayers.filter((p) => p.age <= 21);

  // Nejbližší U21 zápas: první nesimulovaný match v rounds kde figuruje náš U21 tým
  const nextMatch: { round: LeagueRound; m: LeagueRound["matches"][number]; isHome: boolean } | null = (() => {
    if (!u21TeamId) return null;
    const sorted = [...rounds].sort((a, b) => a.round - b.round);
    for (const r of sorted) {
      const m = r.matches.find((mm) => mm.status !== "simulated" && (mm.homeTeamId === u21TeamId || mm.awayTeamId === u21TeamId));
      if (m) return { round: r, m, isHome: m.homeTeamId === u21TeamId };
    }
    return null;
  })();

  const sortedRounds = [...rounds].sort((a, b) => a.round - b.round);
  const activeRound = selectedRound ?? nextMatch?.round.round ?? sortedRounds[0]?.round;
  const roundIndex = sortedRounds.findIndex((r) => r.round === activeRound);

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-3 max-w-7xl mx-auto w-full">
      <YouthSectionNav />
      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={setTab}
        ariaLabel="U21"
        className="[&_[role=tablist]]:grid [&_[role=tablist]]:grid-cols-6 [&_[role=tablist]]:gap-0 [&_[role=tab]]:min-w-0 [&_[role=tab]]:px-1 [&_[role=tab]]:text-xs sm:[&_[role=tab]]:text-sm sm:[&_[role=tab]]:px-3 [&>div:last-child]:hidden"
        items={[
          { key: "kadr", label: "Kádr" },
          { key: "atributy", label: "Atributy" },
          { key: "rozvoj", label: "Rozvoj" },
          { key: "tabulka", label: "Tabulka" },
          { key: "rozpis", label: "Rozpis" },
          { key: "statistiky", label: "Statistiky" },
        ]}
      />

      {/* Nejbližší zápas: pod záložkami, ať lišta drží na stejném místě */}
      {nextMatch && tab === "kadr" && (
        <NextMatchBanner data={nextMatch} gameDate={ctxGameDate} />
      )}

      {error && (
        <div className="card border-l-4 border-card-red bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {tab === "kadr" && !squadLoaded && !error && <div className="flex justify-center p-8"><Spinner /></div>}
      {tab === "kadr" && squadLoaded && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* A-tým — mladí hráči k odeslání */}
          <ListCard title="A-tým: mladí hráči" count={young.length} className="min-w-0">
            {young.length === 0 ? (
              <ListEmpty icon="🧒">Žádný hráč do 21 let v A-týmu.</ListEmpty>
            ) : (
              <PlayerList
                players={young.map((p) => ({
                  id: p.id, firstName: p.first_name, lastName: p.last_name, position: p.position,
                  age: p.age, overallRating: p.overall_rating, avatar: p.avatar ?? null,
                  nextMatchReturn: false,
                }))}
                statsMap={statsMap}
                growthMap={growthMap}
                renderActions={(p) => (
                  <div className="flex flex-wrap gap-2 items-stretch">
                    <button
                      disabled={busy === p.id}
                      onClick={() => sendToU21(p.id, "permanent")}
                      className="min-h-11 px-3 py-2 text-xs bg-pitch-500 hover:bg-pitch-600 text-white rounded disabled:opacity-50 whitespace-nowrap w-full md:w-auto"
                      title="Trvale do U21 dokud ho nepovoláš zpět"
                    >→ Přesunout do U21</button>
                    {/* Hostující hráč smí do U21 jen trvale (návrat po zápase by kolidoval s koncem hostování). */}
                    {!young.find((y) => y.id === p.id)?.loan_from_team_id && (
                      <button
                        disabled={busy === p.id}
                        onClick={() => sendToU21(p.id, "next_match")}
                        className="min-h-11 px-3 py-2 text-xs bg-gold-500 hover:bg-gold-600 text-white rounded disabled:opacity-50 whitespace-nowrap w-full md:w-auto"
                        title="Jen na nejbližší U21 zápas, pak zpět"
                      >→ Na jeden zápas</button>
                    )}
                  </div>
                )}
              />
            )}
          </ListCard>

          {/* U21 kádr — povýšení */}
          <ListCard title="U21 kádr" count={u21Players.length} className="min-w-0">
            {u21Players.length === 0 ? (
              <ListEmpty icon="🧒">Kádr U21 je prázdný. Mladé hráče sem pošleš ze seznamu áčka.</ListEmpty>
            ) : (
              <PlayerList
                players={u21Players.map((p) => ({
                  id: p.id, firstName: p.first_name, lastName: p.last_name, position: p.position,
                  age: p.age, overallRating: p.overall_rating,
                  avatar: (p as unknown as { avatar?: Record<string, unknown> }).avatar ?? null,
                  nextMatchReturn: p.next_match_return === 1,
                }))}
                statsMap={statsMap}
                growthMap={growthMap}
                renderActions={(p) => p.age < 15 ? (
                  // FAČR: za muže až od 15 let
                  <span className="text-xs text-muted">Do áčka až v 15 letech</span>
                ) : (
                  <button
                    disabled={busy === p.id}
                    onClick={() => {
                      const u21Player = u21Players.find((x) => x.id === p.id);
                      if (u21Player) promoteToA(u21Player);
                    }}
                    className="min-h-11 px-3 py-2 text-xs bg-pitch-500 hover:bg-pitch-600 text-white rounded disabled:opacity-50"
                    title="Povolat do A-týmu"
                  >↑ Povolat do áčka</button>
                )}
              />
            )}
          </ListCard>
        </div>
      )}

      {tab === "tabulka" && standingsError && <p role="alert" className="card p-4 text-sm">{standingsError}</p>}
      {tab === "rozpis" && scheduleError && <p role="alert" className="card p-4 text-sm">{scheduleError}</p>}
      {tab === "tabulka" && !standingsError && (standingsLoaded ? <StandingsTable standings={standings} ownTeamId={u21TeamId} /> : <p role="status" className="p-4 text-sm text-muted">{u21LeagueId ? "Načítám tabulku…" : "U21 zatím nemá přidělenou ligu."}</p>)}

      {confirmDialog}

      {tab === "rozpis" && !scheduleError && (
        <div className="space-y-3">
          <div className="flex gap-1 rounded-lg bg-surface p-1" role="group" aria-label="Zobrazené zápasy">
            {[true, false].map((own) => <button key={String(own)} aria-pressed={onlyOurMatches === own} onClick={() => setOnlyOurMatches(own)} className={`min-h-11 flex-1 rounded-lg text-sm font-semibold ${onlyOurMatches === own ? "bg-pitch-500 text-white" : "text-muted"}`}>{own ? "Naše U21" : "Celá liga"}</button>)}
          </div>
          {!onlyOurMatches && sortedRounds.length > 0 && (
            <div className="flex items-center gap-2">
              <button aria-label="Předchozí kolo" disabled={roundIndex <= 0} onClick={() => setSelectedRound(sortedRounds[roundIndex - 1].round)} className="min-h-11 min-w-11 rounded-lg bg-surface disabled:opacity-30">←</button>
              <select aria-label="Kolo soutěže" value={activeRound} onChange={(e) => setSelectedRound(Number(e.target.value))} className="min-h-11 min-w-0 flex-1 rounded-lg border border-gray-200 bg-surface px-3 text-sm">
                {sortedRounds.map((r) => <option key={r.round} value={r.round}>{r.round}. kolo · {formatDate(r.scheduledAt)}</option>)}
              </select>
              <button aria-label="Další kolo" disabled={roundIndex >= sortedRounds.length - 1} onClick={() => setSelectedRound(sortedRounds[roundIndex + 1].round)} className="min-h-11 min-w-11 rounded-lg bg-surface disabled:opacity-30">→</button>
            </div>
          )}
          {!scheduleLoaded && <p role="status" className="p-3 text-sm text-muted">{u21LeagueId ? "Načítám rozpis…" : "U21 zatím nemá přidělenou ligu."}</p>}
          {scheduleLoaded && rounds.length === 0 && <p className="card p-4 text-sm text-muted">Rozpis zatím není k dispozici.</p>}
          <div className={onlyOurMatches ? "grid grid-cols-1 lg:grid-cols-2 gap-3" : "space-y-3"}>
            {sortedRounds.filter((r) => onlyOurMatches || r.round === activeRound).map((r) => {
              const matches = r.matches.filter((m) => !onlyOurMatches || m.homeTeamId === u21TeamId || m.awayTeamId === u21TeamId);
              if (!matches.length) return null;
              return (
                <FixtureGroup key={r.round} title={`${r.round}. kolo`} note={formatDate(r.scheduledAt)}>
                  {matches.map((m) => {
                    const isPlayed = m.status === "simulated" && m.homeScore != null && m.awayScore != null;
                    const side = (id: string | null | undefined, name: string, color: string | null | undefined, secondary: string | null | undefined, badge: string | null | undefined, isAi?: boolean): FixtureSide => ({
                      name: name.replace(/ U21$/, ""), href: id ? `/tym/${id}` : null, color: color || "#2D5F2D", isAi: isAi === true,
                      crest: { pattern: badge ?? null, primary: color || "#2D5F2D", secondary: secondary || "#FFFFFF", initials: null, symbol: null },
                    });
                    return (
                      <FixtureRow key={m.id}
                        home={side(m.homeTeamId, m.homeName, m.homeColor, m.homeSecondary, m.homeBadge, m.homeIsAi)}
                        away={side(m.awayTeamId, m.awayName, m.awayColor, m.awaySecondary, m.awayBadge, m.awayIsAi)}
                        score={isPlayed ? { home: m.homeScore!, away: m.awayScore! } : null}
                        // Neodehraný zápas ukáže v tabuli čas výkopu, jako dřív pod zápasem.
                        kickoff={r.scheduledAt ? new Date(r.scheduledAt).toLocaleTimeString("cs", { hour: "2-digit", minute: "2-digit" }) : "?"}
                        winner={isPlayed ? (m.homeScore! > m.awayScore! ? "home" : m.awayScore! > m.homeScore! ? "away" : null) : null}
                        href={isPlayed ? `/zapas/${m.id}` : null}
                        accent={m.homeTeamId === u21TeamId || m.awayTeamId === u21TeamId ? "var(--color-pitch-500)" : null} />
                    );
                  })}
                </FixtureGroup>
              );
            })}
          </div>
        </div>
      )}

      {tab === "statistiky" && <LeagueStatsTab data={statsData} loaded={statsLoaded} />}

      {tab === "atributy" && teamId && <U21Attributes teamId={teamId} />}

      {tab === "rozvoj" && teamId && <U21Rozvoj teamId={teamId} />}

    </div>
  );
}

function NextMatchBanner({ data, gameDate }: { data: { round: LeagueRound; m: LeagueRound["matches"][number]; isHome: boolean }; gameDate: string | null }) {
  const { round, m, isHome } = data;
  const us = isHome ? { name: m.homeName, color: m.homeColor, secondary: m.homeSecondary, badge: m.homeBadge, id: m.homeTeamId } : { name: m.awayName, color: m.awayColor, secondary: m.awaySecondary, badge: m.awayBadge, id: m.awayTeamId };
  const opp = isHome ? { name: m.awayName, color: m.awayColor, secondary: m.awaySecondary, badge: m.awayBadge, id: m.awayTeamId } : { name: m.homeName, color: m.homeColor, secondary: m.homeSecondary, badge: m.homeBadge, id: m.homeTeamId };
  const date = round.scheduledAt ? new Date(round.scheduledAt) : null;
  const dateLabel = date ? date.toLocaleDateString("cs", { weekday: "long", day: "numeric", month: "numeric" }) : "-";
  const timeLabel = date ? date.toLocaleTimeString("cs", { hour: "2-digit", minute: "2-digit" }) : "";

  // Game-time „za N dní" — porovnáme datum zápasu s game_date hráče (ne real datum).
  const inDaysLabel: string | null = (() => {
    if (!date || !gameDate) return null;
    const today = new Date(gameDate);
    today.setUTCHours(0, 0, 0, 0);
    const matchDay = new Date(date);
    matchDay.setUTCHours(0, 0, 0, 0);
    const diffMs = matchDay.getTime() - today.getTime();
    const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
    if (days < 0) return null;
    if (days === 0) return "dnes";
    if (days === 1) return "zítra";
    if (days < 5) return `za ${days} dny`;
    return `za ${days} dní`;
  })();

  return (
    <div className="card p-3 sm:p-4">
      <div className="sm:hidden text-xs">
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-muted">
          <span>Příští zápas · {formatDate(round.scheduledAt)}{timeLabel ? ` · ${timeLabel}` : ""}</span>
          {inDaysLabel && <span className="font-semibold text-pitch-600">{inDaysLabel}</span>}
        </div>
        <div className="mt-1 text-sm font-semibold text-ink break-words">
          {opp.id ? <Link href={`/tym/${opp.id}`} className="hover:underline">{opp.name}</Link> : opp.name}
          <span className="font-normal text-muted"> · {isHome ? "doma" : "venku"}</span>
        </div>
      </div>
      <div className="hidden sm:flex items-center gap-4">
      <div className="flex-shrink-0 text-center sm:text-left">
        <div className="text-micro uppercase tracking-widest text-muted font-heading">Nejbližší zápas</div>
        <div className="font-heading font-bold text-lg text-ink mt-0.5 capitalize">{dateLabel}</div>
        <div className="text-xs text-gray-500">
          Kolo {round.round}{timeLabel ? ` · ${timeLabel}` : ""}
          {inDaysLabel && <span className="ml-2 text-pitch-600 font-semibold">{inDaysLabel}</span>}
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center gap-4 w-full">
        <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
          {us.id ? (
            <Link href={`/tym/${us.id}`} className="truncate font-medium hover:text-pitch-600 transition-colors">{us.name}</Link>
          ) : (
            <span className="truncate font-medium">{us.name}</span>
          )}
          <BadgePreview
            primary={us.color || "#2D5F2D"}
            secondary={us.secondary || "#FFFFFF"}
            pattern={(us.badge as BadgePattern) || "shield"}
            initials={ini(us.name)}
            size={32}
          />
        </div>
        <div className="text-center">
          <div className="text-xs font-heading uppercase text-muted">{isHome ? "doma" : "venku"}</div>
          <div className="text-base font-bold text-gray-400">vs</div>
        </div>
        <div className="flex-1 flex items-center justify-start gap-2 min-w-0">
          <BadgePreview
            primary={opp.color || "#2D5F2D"}
            secondary={opp.secondary || "#FFFFFF"}
            pattern={(opp.badge as BadgePattern) || "shield"}
            initials={ini(opp.name)}
            size={32}
          />
          {opp.id ? (
            <Link href={`/tym/${opp.id}`} className="truncate font-medium hover:text-pitch-600 transition-colors">{opp.name}</Link>
          ) : (
            <span className="truncate font-medium">{opp.name}</span>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}


function StandingsTable({ standings, ownTeamId }: { standings: Standing[]; ownTeamId: string }) {
  const columns: DataColumn<Standing>[] = [
    { key: "pos", header: "#", width: "w-10", align: "center", sortValue: (r) => r.pos, firstDir: "asc",
      cell: (r) => <span className={`font-bold ${r.pos === 1 ? "text-gold-700" : "text-muted"}`}>{r.pos}</span> },
    { key: "team", header: "Klub", align: "left", sortValue: (r) => r.team,
      cell: (r) => (
        <EntityCell
          leading={<BadgePreview primary={r.primaryColor || "#2D5F2D"} secondary={r.secondaryColor || "#FFFFFF"}
            pattern={(r.badgePattern as BadgePattern) || "shield"} initials={ini(r.team)} size={24} />}
          name={r.team.replace(/ U21$/, "")} bold={r.teamId === ownTeamId}
          meta={`${r.wins}-${r.draws}-${r.losses} · ${r.gf}:${r.ga}`} metaMobileOnly />
      ) },
    { key: "played", header: "Z", title: "Zápasy", width: "w-10", sortValue: (r) => r.played, cell: (r) => r.played },
    { key: "wins", header: "V", title: "Výhry", width: "w-10", priority: 2, sortValue: (r) => r.wins, cell: (r) => r.wins },
    { key: "draws", header: "R", title: "Remízy", width: "w-10", priority: 2, sortValue: (r) => r.draws, cell: (r) => r.draws },
    { key: "losses", header: "P", title: "Prohry", width: "w-10", priority: 2, sortValue: (r) => r.losses, cell: (r) => r.losses },
    { key: "gd", header: "Skóre", width: "w-16", priority: 2, sortValue: (r) => r.gf - r.ga, cell: (r) => `${r.gf}:${r.ga}` },
    { key: "points", header: "Body", width: "w-14", emphasis: true, sortValue: (r) => r.points, cell: (r) => r.points },
  ];
  return (
    <ListCard>
      <DataTable columns={columns} rows={standings} rowKey={(r) => String(r.pos)}
        rowHref={(r) => (r.teamId ? `/tym/${r.teamId}` : undefined)}
        rowTone={(r) => ({ own: r.teamId === ownTeamId })}
        empty="Tabulka U21 se naplní po prvním odehraném kole." emptyIcon="🏆" />
    </ListCard>
  );
}

interface TableRow {
  id: string;
  firstName: string;
  lastName: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  age: number;
  overallRating: number;
  avatar: Record<string, unknown> | null;
  nextMatchReturn: boolean;
}

type SortKey = "name" | "pos" | "age" | "ovr" | "apps" | "g" | "a" | "rat" | "growth";

const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

function PlayerList({
  players,
  statsMap,
  growthMap,
  renderActions,
}: {
  players: TableRow[];
  statsMap: Map<string, PlayerStat>;
  growthMap: Map<string, number>;
  renderActions: (p: TableRow) => React.ReactNode;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("ovr");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [openId, setOpenId] = useState<string | null>(null);

  const toggle = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" || key === "pos" ? "asc" : "desc");
    }
  };

  const sorted = [...players].sort((a, b) => {
    const sa = statsMap.get(a.id);
    const sb = statsMap.get(b.id);
    const ga = growthMap.get(a.id) ?? 0;
    const gb = growthMap.get(b.id) ?? 0;
    let cmp = 0;
    switch (sortKey) {
      case "name": cmp = `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "cs"); break;
      case "pos": cmp = (POS_ORDER[a.position] ?? 9) - (POS_ORDER[b.position] ?? 9); break;
      case "age": cmp = a.age - b.age; break;
      case "ovr": cmp = a.overallRating - b.overallRating; break;
      case "apps": cmp = (sa?.appearances ?? 0) - (sb?.appearances ?? 0); break;
      case "g": cmp = (sa?.goals ?? 0) - (sb?.goals ?? 0); break;
      case "a": cmp = (sa?.assists ?? 0) - (sb?.assists ?? 0); break;
      case "rat": cmp = (sa?.avgRating ?? 0) - (sb?.avgRating ?? 0); break;
      case "growth": cmp = ga - gb; break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const ratings = players.map((p) => p.overallRating);

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-line-soft">
        <label className="min-w-0 flex-1 text-xs text-muted"><span className="sr-only">Řadit podle</span>
          <select className="w-full min-h-11 rounded-lg border border-gray-200 bg-surface px-2 text-sm text-ink" value={sortKey} onChange={(e) => { const key = e.target.value as SortKey; setSortKey(key); setSortDir(key === "name" || key === "age" || key === "pos" ? "asc" : "desc"); }}>
            {([["ovr", "Celkové hodnocení"], ["growth", "Tréninkový růst"], ["age", "Věk"], ["name", "Jméno"], ["pos", "Pozice"], ["apps", "Zápasy"], ["g", "Góly"], ["a", "Asistence"], ["rat", "Zápasová známka"]] as const).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button className="min-h-11 rounded-lg border border-gray-200 px-3 text-sm" onClick={() => toggle(sortKey)} aria-label="Obrátit směr řazení">{sortDir === "asc" ? "↑" : "↓"}</button>
      </div>
      {sorted.map((p) => {
        const stat = statsMap.get(p.id);
        const growth = growthMap.get(p.id) ?? 0;
        const open = openId === p.id;
        return (
          <div key={p.id} className="border-b border-line-soft last:border-b-0">
            {/* Řádek rozbalí panel se statistikami a akcemi; tlačítka a odkaz jsou
                mimo řádek, protože tlačítko v tlačítku nejde. */}
            <ListRow onClick={() => setOpenId(open ? null : p.id)} chevron={false}
              leading={p.avatar ? <FaceAvatar faceConfig={p.avatar} size={36} /> : <span className="w-9 h-9 rounded-full bg-pitch-50 flex items-center justify-center text-meta font-bold text-pitch-600">{p.firstName[0]}{p.lastName[0]}</span>}
              title={`${p.firstName} ${p.lastName}`}
              meta={
                <span className="inline-flex items-center gap-1.5">
                  <PositionBadge position={p.position} />
                  <span>{p.age} let</span>
                  {p.nextMatchReturn && <span className="text-amber-700">↩ do áčka</span>}
                  {p.age >= 22 && <span className="text-amber-700">nad 21 let</span>}
                </span>
              }
              trailing={
                <>
                  <span title="Celkové hodnocení hráče"><RatingPill value={p.overallRating} tone={ratingToneIn(p.overallRating, ratings)} /></span>
                  <span className="w-9 text-center" title="Body dovedností za 30 dní">
                    <RowValue tone={growth > 0 ? "plus" : undefined} sub="Růst">{growth > 0 ? `+${growth}` : "-"}</RowValue>
                  </span>
                  <span aria-hidden="true" className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
                </>
              } />
            {open && (
              <div className="space-y-3 mx-4 mb-3 rounded-lg bg-surface-2 p-3">
                <Link href={`/hrac/${p.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-pitch-600 hover:underline">Profil: {p.firstName} {p.lastName} →</Link>
                <dl className="grid grid-cols-4 gap-1 text-center">
                  {[["Zápasy", stat?.appearances ?? 0], ["Góly", stat?.goals ?? 0], ["Asistence", stat?.assists ?? 0], ["Známka", stat?.avgRating?.toFixed(1) ?? "-"]].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-muted">{label}</dt>
                      <dd className="mt-1 text-sm font-bold tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs text-muted">Trénink za 30 dní: {growth > 0 ? `+${growth}` : "0"} bodů dovedností{(stat?.manOfMatch ?? 0) > 0 ? ` · ${stat?.manOfMatch}× hráč zápasu` : ""}</p>
                {p.nextMatchReturn && <p className="text-xs text-amber-700">Po nejbližším zápase se vrátí do áčka.</p>}
                {renderActions(p)}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
