/**
 * Oprava zápasu, u kterého běh spadl hned po uložení výsledku.
 *
 * Budvar Spůle – FORPSI Čkyně (2026-11-09): výsledek a události se uložily, pak běh
 * fronty zmizel a nic dalšího se nezapsalo (statistiky a hodnocení hráčů, hráč zápasu,
 * sezónní statistiky, stopky, zranění, peníze ze zápasu). Nová simulace by dala jiné
 * skóre, proto se to dopočítá z uložených událostí a sestav.
 *
 * Interní čísla hráčů v událostech: domácí 1.., hosté 101.., v pořadí uložené sestavy
 * (základ, pak lavička). Když jméno v události nesedí na sestavu, oprava se nespustí.
 */

import { logger } from "../lib/logger";
import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import { typZraneniZPopisu, zavaznostZeDnu } from "../injuries/injury-types";
import { matchInjuryDays } from "../injuries/injury-generator";
import {
  calculatePlayerRatings, determineManOfMatch, extractStatsFromEvents, playedTeamsMap,
  saveMatchMom, saveMatchPlayerStats, updatePlayerStats, type MatchPlayerStatsEntry,
} from "../stats/update-stats";
import type { MatchEvent } from "../engine/types";

const M = "match-aftermath-repair";
const AWAY_OFFSET = 100;

interface StoredLineupPlayer { id: string; name: string; position: string }
interface StoredLineup { starters: StoredLineupPlayer[]; subs: StoredLineupPlayer[] }

export interface RebuiltMatch {
  /** Interní číslo → id hráče, obě strany. */
  fullIdMap: Map<number, string>;
  homeIdMap: Map<number, string>;
  awayIdMap: Map<number, string>;
  /** Interní číslo → pozice. */
  positions: Map<number, string>;
  /** Id hráče → pozice. */
  posById: Map<string, string>;
  homeStarterIds: string[];
  awayStarterIds: string[];
  playerMinutes: Record<number, { entered: number; left: number | null }>;
  /** Události, kde jméno nesedí na sestavu. Víc než nula = data se nedají věřit. */
  mismatches: number;
}

/** Sestaví z uložených sestav a událostí to, co při simulaci drží engine v paměti. */
export function rebuildFromStored(home: StoredLineup, away: StoredLineup, events: MatchEvent[]): RebuiltMatch {
  const fullIdMap = new Map<number, string>();
  const homeIdMap = new Map<number, string>();
  const awayIdMap = new Map<number, string>();
  const positions = new Map<number, string>();
  const posById = new Map<string, string>();
  const names = new Map<string, number>();
  const side = (lineup: StoredLineup, offset: number, idMap: Map<number, string>, team: 1 | 2) => {
    [...lineup.starters, ...lineup.subs].forEach((p, i) => {
      const engineId = offset + i + 1;
      fullIdMap.set(engineId, p.id);
      idMap.set(engineId, p.id);
      positions.set(engineId, p.position);
      posById.set(p.id, p.position);
      names.set(`${team}|${p.name}`, engineId);
    });
  };
  side(home, 0, homeIdMap, 1);
  side(away, AWAY_OFFSET, awayIdMap, 2);

  let mismatches = 0;
  const nameOf = new Map<number, string>();
  for (const [key, id] of names) nameOf.set(id, key.split("|")[1]);
  for (const e of events) {
    if (e.playerId == null || !e.playerName) continue;
    if (nameOf.get(e.playerId) !== e.playerName) mismatches++;
  }

  const playerMinutes: Record<number, { entered: number; left: number | null }> = {};
  home.starters.forEach((_, i) => { playerMinutes[i + 1] = { entered: 0, left: null }; });
  away.starters.forEach((_, i) => { playerMinutes[AWAY_OFFSET + i + 1] = { entered: 0, left: null }; });
  for (const e of events) {
    if (e.type === "substitution" && e.playerId != null) {
      playerMinutes[e.playerId] = { entered: e.minute, left: null };
      const out = /za (.+)$/.exec(e.description ?? "")?.[1]?.trim();
      const outId = out ? names.get(`${e.teamId}|${out}`) : undefined;
      if (outId != null && playerMinutes[outId]) playerMinutes[outId].left = e.minute;
    }
    if (e.type === "card" && e.detail === "red" && e.playerId != null && playerMinutes[e.playerId]) {
      playerMinutes[e.playerId].left = e.minute;
    }
  }

  return {
    fullIdMap, homeIdMap, awayIdMap, positions, posById,
    homeStarterIds: home.starters.map((p) => p.id),
    awayStarterIds: away.starters.map((p) => p.id),
    playerMinutes, mismatches,
  };
}

export interface RepairResult {
  ok: boolean;
  reason?: string;
  players?: number;
  suspensions?: number;
  injuries?: number;
  finances?: boolean;
}

export async function repairMatchAftermath(db: D1Database, matchId: string): Promise<RepairResult> {
  const m = await db.prepare(
    `SELECT m.id, m.status, m.league_id, m.calendar_id, m.home_team_id, m.away_team_id, m.home_score, m.away_score,
            m.events, m.home_lineup_data, m.away_lineup_data, m.attendance, m.weather,
            sc.season_number, th.team_type AS home_type
       FROM matches m LEFT JOIN season_calendar sc ON sc.id = m.calendar_id LEFT JOIN teams th ON th.id = m.home_team_id
      WHERE m.id = ?`,
  ).bind(matchId).first<{
    id: string; status: string; league_id: string | null; calendar_id: string | null; home_team_id: string; away_team_id: string;
    home_score: number; away_score: number; events: string | null; home_lineup_data: string | null; away_lineup_data: string | null;
    attendance: number | null; weather: string | null; season_number: number | null; home_type: string | null;
  }>();
  if (!m) return { ok: false, reason: "zápas nenalezen" };
  if (m.status !== "simulated") return { ok: false, reason: `zápas není odehraný (${m.status})` };
  const existing = await db.prepare("SELECT COUNT(*) AS n FROM match_player_stats WHERE match_id = ?").bind(matchId).first<{ n: number }>();
  if ((existing?.n ?? 0) > 0) return { ok: false, reason: "zápas už statistiky má" };

  let events: MatchEvent[];
  let home: StoredLineup;
  let away: StoredLineup;
  try {
    events = JSON.parse(m.events ?? "[]") as MatchEvent[];
    home = JSON.parse(m.home_lineup_data ?? "null") as StoredLineup;
    away = JSON.parse(m.away_lineup_data ?? "null") as StoredLineup;
  } catch (e) {
    logger.warn({ module: M }, `nečitelná data zápasu ${matchId}`, e);
    return { ok: false, reason: "nečitelná data zápasu" };
  }
  if (!home?.starters || !away?.starters) return { ok: false, reason: "chybí sestavy" };
  const r = rebuildFromStored(home, away, events);
  if (r.mismatches > 0) return { ok: false, reason: `${r.mismatches} událostí nesedí na sestavu` };

  const hs = m.home_score ?? 0;
  const as = m.away_score ?? 0;
  const playedTeams = playedTeamsMap(r.playerMinutes, r.homeIdMap.keys(), r.awayIdMap.keys(), 1, 2);
  const ratings = calculatePlayerRatings(events, r.fullIdMap, 1, hs, as, r.positions, playedTeams);
  const momPlayerId = determineManOfMatch(ratings);
  await saveMatchMom(db, matchId, momPlayerId);

  const season = await db.prepare("SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1").first<{ id: string }>();
  if (!season) return { ok: false, reason: "žádná aktivní sezóna" };
  const homeUpdates = extractStatsFromEvents(events, r.homeIdMap, r.homeStarterIds, ratings, r.playerMinutes, { concededGoals: as, positions: r.posById });
  const awayUpdates = extractStatsFromEvents(events, r.awayIdMap, r.awayStarterIds, ratings, r.playerMinutes, { concededGoals: hs, positions: r.posById });
  await updatePlayerStats(db, season.id, m.home_team_id, homeUpdates, as === 0, momPlayerId);
  await updatePlayerStats(db, season.id, m.away_team_id, awayUpdates, hs === 0, momPlayerId);
  const entry = (teamId: string, starters: string[]) => (u: (typeof homeUpdates)[number]): MatchPlayerStatsEntry => ({
    playerId: u.playerId, teamId, started: starters.includes(u.playerId), position: r.posById.get(u.playerId) ?? "MID",
    minutesPlayed: u.minutesPlayed, goals: u.goals, assists: u.assists, yellowCards: u.yellowCards, redCards: u.redCards, rating: u.rating,
  });
  await saveMatchPlayerStats(db, matchId, [
    ...homeUpdates.map(entry(m.home_team_id, r.homeStarterIds)),
    ...awayUpdates.map(entry(m.away_team_id, r.awayStarterIds)),
  ]);
  await db.prepare("UPDATE matches SET player_ratings = ? WHERE id = ?").bind(JSON.stringify(ratings), matchId).run();

  // Stopky stejně jako při simulaci: červená = 1 zápas, každá 4. žlutá v sezóně = 1 zápas.
  let suspensions = 0;
  const all = [...homeUpdates, ...awayUpdates];
  for (const u of all) {
    if (u.redCards > 0) {
      await db.prepare("UPDATE players SET suspended_matches = suspended_matches + 1 WHERE id = ?").bind(u.playerId).run();
      suspensions++;
    }
    if (u.yellowCards > 0) {
      const y = await db.prepare("SELECT COALESCE(SUM(yellow_cards), 0) AS yellow_cards FROM player_stats WHERE player_id = ? AND season_id = ?")
        .bind(u.playerId, season.id).first<{ yellow_cards: number }>();
      if (y && y.yellow_cards > 0 && y.yellow_cards % 4 === 0) {
        await db.prepare("UPDATE players SET suspended_matches = suspended_matches + 1 WHERE id = ?").bind(u.playerId).run();
        suspensions++;
      }
    }
  }
  // Kdo měl stopku a v zápase nebyl, si ji tímhle zápasem odseděl.
  await db.prepare("UPDATE players SET suspended_matches = MAX(0, suspended_matches - 1) WHERE team_id IN (?, ?) AND suspended_matches > 0 AND id NOT IN (SELECT player_id FROM match_player_stats WHERE match_id = ?)")
    .bind(m.home_team_id, m.away_team_id, matchId).run();
  await db.prepare("UPDATE club_incident_absences SET zapasu_zbyva = zapasu_zbyva - 1 WHERE team_id IN (?, ?) AND kind = 'vyrazen' AND zapasu_zbyva > 0")
    .bind(m.home_team_id, m.away_team_id).run()
    .catch((e) => logger.warn({ module: M }, "vyřazení za incident", e));

  // Zranění z událostí; vybavení klubu tu neznáme, zkrácení o lékárničku se nepočítá.
  let injuries = 0;
  const injuryRng = createRng(seedFromString(`${matchId}:injuries`));
  for (const e of events) {
    if (e.type !== "injury" || e.playerId == null) continue;
    const playerId = r.fullIdMap.get(e.playerId);
    if (!playerId) continue;
    const p = await db.prepare("SELECT age FROM players WHERE id = ?").bind(playerId).first<{ age: number }>();
    const days = matchInjuryDays(injuryRng, e.detail, p?.age ?? 25, 50, 0);
    await db.prepare(
      "INSERT INTO injuries (id, player_id, team_id, type, description, severity, days_remaining, days_total, match_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), playerId, e.teamId === 1 ? m.home_team_id : m.away_team_id, typZraneniZPopisu(e.detail),
      e.detail ?? "zranění", zavaznostZeDnu(days), days, days, matchId).run();
    injuries++;
  }

  // Peníze ze zápasu jen u áčka; zaúčtování hlídá reference_id, dvakrát nic nestrhne.
  let finances = false;
  if (m.home_type !== "u21") {
    try {
      const { processMatchDayFinances, processCashLoanRepayment } = await import("../season/finance-processor");
      const { loadCompetitionContext } = await import("../competition/rules");
      const comp = m.league_id && m.season_number != null ? await loadCompetitionContext(db, m.league_id, m.season_number) : null;
      const reps = await db.prepare("SELECT id, reputation FROM teams WHERE id IN (?, ?)").bind(m.home_team_id, m.away_team_id)
        .all<{ id: string; reputation: number | null }>();
      const rep = new Map(reps.results.map((t) => [t.id, t.reputation ?? 50]));
      const res = (own: number, opp: number) => (own > opp ? "win" : own < opp ? "loss" : "draw") as "win" | "loss" | "draw";
      const now = new Date().toISOString();
      const weather = (m.weather ?? "cloudy") as Parameters<typeof processMatchDayFinances>[9];
      await processMatchDayFinances(db, m.home_team_id, matchId, true, res(hs, as), m.attendance ?? 0, now, rep.get(m.away_team_id) ?? 50, false, weather, comp);
      await processMatchDayFinances(db, m.away_team_id, matchId, false, res(as, hs), m.attendance ?? 0, now, rep.get(m.home_team_id) ?? 50, false, weather, comp);
      await processCashLoanRepayment(db, m.home_team_id, matchId, now);
      await processCashLoanRepayment(db, m.away_team_id, matchId, now);
      finances = true;
    } catch (e) {
      logger.warn({ module: M }, `peníze ze zápasu ${matchId}`, e);
    }
  }

  logger.info({ module: M }, `opraven zápas ${matchId}: ${all.length} hráčů, ${suspensions} stopek, ${injuries} zranění`);
  return { ok: true, players: all.length, suspensions, injuries, finances };
}
