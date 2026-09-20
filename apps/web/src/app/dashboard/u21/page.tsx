"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, PositionBadge, BadgePreview, useConfirm, Tabs, useTabParam } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { AcademyCard } from "@/components/players/academy-card";
import { U21Rozvoj } from "@/components/players/u21-rozvoj";
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
const TAB_KEYS = ["kadr", "rozvoj", "tabulka", "rozpis", "akademie"] as const;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("cs", { day: "numeric", month: "numeric" });
}

function ini(name: string): string {
  return name.replace(/ U21$/, "").split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

export default function U21Page() {
  const { teamId, gameDate: ctxGameDate } = useTeam();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [tab, setTab] = useTabParam(TAB_KEYS);
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
        <div className="card p-6 text-center text-gray-600">
          Tvůj klub zatím nemá U21 tým. Kontaktuj správce hry.
        </div>
      </div>
    );
  }

  const young = seniorPlayers.filter((p) => p.age <= 21 && !p.loan_from_team_id);

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
    <div className="p-3 sm:p-4 md:p-6 space-y-3">
      {/* Nejbližší zápas */}
      {nextMatch && tab === "kadr" && (
        <NextMatchBanner data={nextMatch} gameDate={ctxGameDate} />
      )}

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={setTab}
        ariaLabel="U21"
        className="[&_[role=tablist]]:grid [&_[role=tablist]]:grid-cols-5 [&_[role=tablist]]:gap-0 [&_[role=tab]]:min-w-0 [&_[role=tab]]:px-1 [&_[role=tab]]:text-xs [&>div:last-child]:hidden"
        items={[
          { key: "kadr", label: "Kádr" },
          { key: "rozvoj", label: "Rozvoj" },
          { key: "tabulka", label: "Tabulka" },
          { key: "rozpis", label: "Rozpis" },
          { key: "akademie", label: "Akademie" },
        ]}
      />

      {error && (
        <div className="card border-l-4 border-card-red bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {tab === "kadr" && !squadLoaded && !error && <div className="flex justify-center p-8"><Spinner /></div>}
      {tab === "kadr" && squadLoaded && (
        <div className="grid gap-4">
          {/* U21 kádr — povýšení */}
          <section className="card min-w-0 p-3 md:p-4">
            <h2 className="font-heading font-bold text-base mb-3">
              U21 kádr ({u21Players.length})
            </h2>
            {u21Players.length === 0 ? (
              <p className="text-sm text-gray-500">Kádr je prázdný.</p>
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
                renderActions={(p) => (
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
          </section>

          {/* A-tým — mladí hráči k odeslání */}
          <section className="card min-w-0 p-3 md:p-4">
            <h2 className="font-heading font-bold text-base mb-3">
              A-tým: mladí hráči ({young.length})
            </h2>
            {young.length === 0 ? (
              <p className="text-sm text-gray-500">Žádný hráč do 21 let v A-týmu.</p>
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
                    <button
                      disabled={busy === p.id}
                      onClick={() => sendToU21(p.id, "next_match")}
                      className="min-h-11 px-3 py-2 text-xs bg-gold-500 hover:bg-gold-600 text-white rounded disabled:opacity-50 whitespace-nowrap w-full md:w-auto"
                      title="Jen na nejbližší U21 zápas, pak zpět"
                    >→ Na jeden zápas</button>
                  </div>
                )}
              />
            )}
          </section>
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
          {sortedRounds.filter((r) => onlyOurMatches || r.round === activeRound).map((r) => {
            const matches = r.matches.filter((m) => !onlyOurMatches || m.homeTeamId === u21TeamId || m.awayTeamId === u21TeamId);
            if (!matches.length) return null;
            return (
              <section key={r.round} className="card overflow-hidden">
                <div className="flex items-center justify-between bg-surface-2 px-3 py-2 text-xs">
                  <h2 className="font-bold">{r.round}. kolo</h2><span className="text-muted">{formatDate(r.scheduledAt)}</span>
                </div>
                <ul className="divide-y divide-gray-200">
                  {matches.map((m) => (
                    <li key={m.id} className={`p-3 ${m.homeTeamId === u21TeamId || m.awayTeamId === u21TeamId ? "border-l-2 border-pitch-500" : ""}`}>
                      <div className="space-y-2">
                        {(["home", "away"] as const).map((side) => {
                          const id = side === "home" ? m.homeTeamId : m.awayTeamId;
                          const name = side === "home" ? m.homeName : m.awayName;
                          const ai = side === "home" ? m.homeIsAi : m.awayIsAi;
                          const score = side === "home" ? m.homeScore : m.awayScore;
                          return <div key={side} className="flex items-center gap-2 text-sm">
                            <span className="shrink-0"><BadgePreview primary={(side === "home" ? m.homeColor : m.awayColor) || "#2D5F2D"} secondary={(side === "home" ? m.homeSecondary : m.awaySecondary) || "#FFFFFF"} pattern={((side === "home" ? m.homeBadge : m.awayBadge) as BadgePattern) || "shield"} initials={ini(name)} size={20} /></span>
                            <span className={`min-w-0 flex-1 break-words ${id === u21TeamId ? "font-bold text-pitch-600" : "text-ink"}`}>{id && !ai ? <Link href={`/dashboard/team/${id}`} className="hover:underline">{name}</Link> : name}</span>
                            <span className="w-6 shrink-0 text-center font-bold tabular-nums">{m.status === "simulated" ? score ?? "—" : "—"}</span>
                          </div>;
                        })}
                      </div>
                      <div className="mt-2 text-[11px] text-muted">{m.status === "simulated" ? "Odehráno" : r.scheduledAt ? new Date(r.scheduledAt).toLocaleTimeString("cs", { hour: "2-digit", minute: "2-digit" }) : "Termín bude upřesněn"} · domácí nahoře</div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {tab === "rozvoj" && teamId && <U21Rozvoj teamId={teamId} />}

      {tab === "akademie" && teamId && <AcademyCard teamId={teamId} />}
    </div>
  );
}

function NextMatchBanner({ data, gameDate }: { data: { round: LeagueRound; m: LeagueRound["matches"][number]; isHome: boolean }; gameDate: string | null }) {
  const { round, m, isHome } = data;
  const us = isHome ? { name: m.homeName, color: m.homeColor, secondary: m.homeSecondary, badge: m.homeBadge, id: m.homeTeamId, isAi: m.homeIsAi } : { name: m.awayName, color: m.awayColor, secondary: m.awaySecondary, badge: m.awayBadge, id: m.awayTeamId, isAi: m.awayIsAi };
  const opp = isHome ? { name: m.awayName, color: m.awayColor, secondary: m.awaySecondary, badge: m.awayBadge, id: m.awayTeamId, isAi: m.awayIsAi } : { name: m.homeName, color: m.homeColor, secondary: m.homeSecondary, badge: m.homeBadge, id: m.homeTeamId, isAi: m.homeIsAi };
  const date = round.scheduledAt ? new Date(round.scheduledAt) : null;
  const dateLabel = date ? date.toLocaleDateString("cs", { weekday: "long", day: "numeric", month: "numeric" }) : "—";
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
          {opp.id && !opp.isAi ? <Link href={`/dashboard/team/${opp.id}`} className="hover:underline">{opp.name}</Link> : opp.name}
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
          {us.id && !us.isAi ? (
            <Link href={`/dashboard/team/${us.id}`} className="truncate font-medium hover:text-pitch-600 transition-colors">{us.name}</Link>
          ) : (
            <span className={`truncate font-medium ${us.isAi ? "text-muted" : ""}`}>{us.name}</span>
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
          {opp.id && !opp.isAi ? (
            <Link href={`/dashboard/team/${opp.id}`} className="truncate font-medium hover:text-pitch-600 transition-colors">{opp.name}</Link>
          ) : (
            <span className={`truncate font-medium ${opp.isAi ? "text-muted" : ""}`}>{opp.name}</span>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

type StandingSortKey = "pos" | "team" | "played" | "wins" | "draws" | "losses" | "gd" | "points";

function StandingsTable({ standings, ownTeamId }: { standings: Standing[]; ownTeamId: string }) {
  const [sortKey, setSortKey] = useState<StandingSortKey>("pos");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggle = (key: StandingSortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "pos" || key === "team" ? "asc" : "desc");
    }
  };

  const sorted = [...standings].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "pos": cmp = a.pos - b.pos; break;
      case "team": cmp = a.team.localeCompare(b.team, "cs"); break;
      case "played": cmp = a.played - b.played; break;
      case "wins": cmp = a.wins - b.wins; break;
      case "draws": cmp = a.draws - b.draws; break;
      case "losses": cmp = a.losses - b.losses; break;
      case "gd": cmp = (a.gf - a.ga) - (b.gf - b.ga); break;
      case "points": cmp = a.points - b.points; break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const arrow = (key: StandingSortKey) => sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const Th = ({ k, label, align = "center", bold = false, desktop = false }: { k: StandingSortKey; label: string; align?: "left" | "center"; bold?: boolean; desktop?: boolean }) => (
    <th
      aria-sort={sortKey === k ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      className={`${desktop ? "hidden sm:table-cell" : ""} px-1 sm:px-3 py-1 hover:text-gray-700 select-none ${align === "left" ? "text-left" : "text-center"} ${bold ? "font-bold" : ""}`}
    >
      <button onClick={() => toggle(k)} className="min-h-11 whitespace-nowrap" aria-label={`Řadit: ${label}`}>{label}{arrow(k)}</button>
    </th>
  );

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <caption className="sr-only">Tabulka ligy U21. Z: zápasy, V: výhry, R: remízy, P: prohry, B: body.</caption>
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase">
            <Th k="pos" label="#" />
            <Th k="team" label="Tým" align="left" />
            <Th k="played" label="Z" />
            <Th k="wins" label="V" desktop />
            <Th k="draws" label="R" desktop />
            <Th k="losses" label="P" desktop />
            <Th k="gd" label="Skóre" />
            <Th k="points" label="B" bold />
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr
              key={s.pos}
              className={`border-b border-gray-100 ${s.teamId === ownTeamId ? "bg-pitch-50 font-semibold" : ""}`}
            >
              <td className="px-1 sm:px-3 py-2 text-center">{s.pos}</td>
              <td className="px-1 sm:px-3 py-2 w-full">
                <div className="flex items-center gap-1.5">
                  <BadgePreview
                    primary={s.primaryColor || "#2D5F2D"}
                    secondary={s.secondaryColor || "#FFFFFF"}
                    pattern={(s.badgePattern as BadgePattern) || "shield"}
                    initials={ini(s.team)}
                    size={22}
                  />
                  {s.teamId && !s.isAi ? (
                    <Link href={`/dashboard/team/${s.teamId}`} className="break-words hover:text-pitch-600 transition-colors">
                      {s.team.replace(/ U21$/, "")}
                    </Link>
                  ) : (
                    <span className={s.isAi ? "text-muted" : ""}>{s.team.replace(/ U21$/, "")}</span>
                  )}
                </div>
                <div className="mt-1 pl-7 text-[10px] font-normal text-muted sm:hidden">{s.wins} V · {s.draws} R · {s.losses} P</div>
              </td>
              <td className="px-1 sm:px-3 py-2 text-center tabular-nums">{s.played}</td>
              <td className="hidden sm:table-cell px-3 py-2 text-center tabular-nums">{s.wins}</td>
              <td className="hidden sm:table-cell px-3 py-2 text-center tabular-nums">{s.draws}</td>
              <td className="hidden sm:table-cell px-3 py-2 text-center tabular-nums">{s.losses}</td>
              <td className="px-1 sm:px-3 py-2 text-center whitespace-nowrap tabular-nums">{s.gf}:{s.ga}</td>
              <td className="px-1 sm:px-3 py-2 text-center tabular-nums font-bold">{s.points}</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={8} className="text-center text-gray-500 py-6">
                Žádné odehrané zápasy
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="min-w-0 flex-1 text-xs text-muted"><span className="sr-only">Řadit podle</span>
          <select className="w-full min-h-11 rounded-lg border border-gray-200 bg-surface px-2 text-sm text-ink" value={sortKey} onChange={(e) => { const key = e.target.value as SortKey; setSortKey(key); setSortDir(key === "name" || key === "age" || key === "pos" ? "asc" : "desc"); }}>
            {([["ovr", "Síla hráče"], ["growth", "Tréninkový růst"], ["age", "Věk"], ["name", "Jméno"], ["pos", "Pozice"], ["apps", "Zápasy"], ["g", "Góly"], ["a", "Asistence"], ["rat", "Hodnocení"]] as const).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button className="min-h-11 rounded-lg border border-gray-200 px-3 text-sm" onClick={() => toggle(sortKey)} aria-label="Obrátit směr řazení">{sortDir === "asc" ? "↑" : "↓"}</button>
      </div>
      <div className="divide-y divide-gray-200">
        {sorted.map((p) => {
          const stat = statsMap.get(p.id);
          const growth = growthMap.get(p.id) ?? 0;
          return (
            <details key={p.id} className="group">
              <summary className="flex min-h-16 cursor-pointer list-none items-center gap-2 py-2 [&::-webkit-details-marker]:hidden">
                <div className="flex h-10 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-pitch-50">
                  {p.avatar ? <FaceAvatar faceConfig={p.avatar} size={30} /> : <span className="text-xs font-bold text-pitch-600">{p.firstName[0]}{p.lastName[0]}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{p.firstName} {p.lastName}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <PositionBadge position={p.position} />
                    <span>{p.age} let</span>
                    {p.nextMatchReturn && <span className="text-amber-700">↩ do áčka</span>}
                    {p.age >= 22 && <span className="text-amber-700">nad 21 let</span>}
                  </span>
                </div>
                <span className="w-9 shrink-0 text-center tabular-nums">
                  <span className="block text-base font-bold text-ink">{p.overallRating}</span>
                  <span className="block text-[10px] text-muted">Síla</span>
                </span>
                <span className="w-10 shrink-0 text-center tabular-nums" title="Body dovedností za 30 dní">
                  <span className={`block text-sm font-semibold ${growth > 0 ? "text-pitch-600" : "text-muted"}`}>{growth > 0 ? `+${growth}` : "—"}</span>
                  <span className="block text-[10px] text-muted">Růst</span>
                </span>
                <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <div className="space-y-3 rounded-lg bg-surface-2 p-3 mb-2">
                <Link href={`/dashboard/player/${p.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-pitch-600 hover:underline">Profil: {p.firstName} {p.lastName} →</Link>
                <dl className="grid grid-cols-4 gap-1 text-center">
                  {[["Zápasy", stat?.appearances ?? 0], ["Góly", stat?.goals ?? 0], ["Asistence", stat?.assists ?? 0], ["Známka", stat?.avgRating?.toFixed(1) ?? "—"]].map(([label, value]) => (
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
            </details>
          );
        })}
      </div>
    </div>
  );
}
