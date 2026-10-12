/**
 * Turnaj P-Mobile — práce s DB: ročník, hřiště, los a uložení rozpisu.
 */

import { logger } from "../lib/logger";
import {
  assignVenues, buildGroupSchedule, buildLeagueSchedule, drawGroups, drawOptions, groupCode, playoffStages,
  type DrawFormat, type DrawTeam, type DrawVenue, type LeagueSchedule,
} from "./draw";

const M = "tournament";

export interface TournamentRow {
  id: string;
  edition: number;
  name: string;
  sponsor: string;
  city: string;
  city_locative: string | null;
  venue_name: string;
  status: string;
  registration_deadline: string;
  starts_on: string | null;
  point_reward: number;
  prize_quarterfinal: number;
  prize_semifinal: number;
  prize_finalist: number;
  prize_winner: number;
  league_matches: number | null;
  league_days: number | null;
  winner_team_id: string | null;
  invited_at: string | null;
  drawn_at: string | null;
}

export interface VenueRow {
  id: string;
  city: string;
  name: string;
  capacity: number;
  is_main: number;
  sort: number;
  look: string;
}

/** Aktuální ročník = nejvyšší číslo ročníku (po skončení zůstává vidět výsledek). */
export async function loadCurrentTournament(db: D1Database): Promise<TournamentRow | null> {
  return db.prepare("SELECT * FROM tournaments ORDER BY edition DESC LIMIT 1").first<TournamentRow>();
}

export async function loadVenues(db: D1Database, city: string): Promise<VenueRow[]> {
  const rows = await db.prepare("SELECT * FROM tournament_venues WHERE city = ? ORDER BY sort").bind(city).all<VenueRow>();
  return rows.results;
}

/** Výkop hracího dne: den 1 = starts_on, vždy 16:00 UTC (18:00 v Praze v létě, 17:00 v zimě). */
export function kickoffAt(startsOn: string, day: number): string {
  const d = new Date(`${startsOn}T16:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + day - 1);
  return d.toISOString();
}

/** Přihlášené týmy s okresem, obcí a reputací — podklad pro los. */
export async function loadEntrants(db: D1Database, tournamentId: string): Promise<Array<DrawTeam & { name: string }>> {
  const rows = await db.prepare(
    `SELECT t.id, t.name, COALESCE(t.reputation, 0) AS reputation, l.district, t.village_id
       FROM tournament_entries e
       JOIN teams t ON t.id = e.team_id
       LEFT JOIN leagues l ON l.id = t.league_id
      WHERE e.tournament_id = ?
      ORDER BY e.registered_at`
  ).bind(tournamentId).all<{ id: string; name: string; reputation: number; district: string | null; village_id: string | null }>();
  return rows.results.map((r) => ({ id: r.id, name: r.name, reputation: r.reputation, district: r.district, village: r.village_id }));
}

/** Skupiny ročníku: písmeno → id týmů. Prázdné = hraje se jedna tabulka. */
export async function loadGroups(db: D1Database, tournamentId: string): Promise<Map<string, string[]>> {
  const rows = await db.prepare(
    "SELECT team_id, group_code FROM tournament_entries WHERE tournament_id = ? AND group_code IS NOT NULL ORDER BY group_code"
  ).bind(tournamentId).all<{ team_id: string; group_code: string }>();
  const groups = new Map<string, string[]>();
  for (const r of rows.results) groups.set(r.group_code, [...(groups.get(r.group_code) ?? []), r.team_id]);
  return groups;
}

/** Seed losu z id ročníku — opakovaný los (např. po chybě) dá stejný rozpis. */
function seedOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h;
}

export class DrawError extends Error {}

export type DrawChoice = { format: "league"; matchesPerTeam: number } | { format: "groups"; groupCount: number };

/**
 * Los: uloží ligovou fázi (jednu tabulku, nebo skupiny) s hřišti a nastaví ročník na `drawn`.
 * Zámek přes status (`drawing`), ať dvojklik admina nevylosuje turnaj dvakrát.
 */
export async function performDraw(db: D1Database, choice: DrawChoice, now = new Date()): Promise<{ matches: number; leagueDays: number; format: DrawFormat }> {
  const t = await loadCurrentTournament(db);
  if (!t) throw new DrawError("Turnaj není vypsaný");
  if (t.status !== "registration" && t.status !== "closed") throw new DrawError("Turnaj už je vylosovaný");
  if (now.toISOString() < t.registration_deadline) throw new DrawError("Přihlášky ještě běží");
  if (!t.starts_on) throw new DrawError("Turnaj nemá datum začátku");

  const entrants = await loadEntrants(db, t.id);
  const option = drawOptions(entrants.length).find((o) => o.format === choice.format
    && (choice.format === "groups" ? o.groupSizes?.length === choice.groupCount : o.matchesPerTeam === choice.matchesPerTeam));
  if (!option) {
    throw new DrawError(choice.format === "groups"
      ? `S ${entrants.length} kluby nejde hrát ${choice.groupCount} skupiny`
      : `S ${entrants.length} kluby nejde hrát ${choice.matchesPerTeam} zápasů na tým`);
  }

  const venues = await loadVenues(db, t.city);
  const drawVenues: DrawVenue[] = venues.map((v) => ({ id: v.id, capacity: v.capacity, isMain: v.is_main === 1 }));
  let schedule: LeagueSchedule;
  let groups: string[][] = [];
  if (choice.format === "groups") {
    groups = drawGroups(entrants, seedOf(t.id), choice.groupCount);
    schedule = buildGroupSchedule(groups, seedOf(t.id) + 1);
  } else {
    schedule = buildLeagueSchedule(entrants, choice.matchesPerTeam, seedOf(t.id));
  }
  const reputation = new Map(entrants.map((e) => [e.id, e.reputation]));
  const history = new Map<string, Map<string, number>>();

  const lock = await db.prepare("UPDATE tournaments SET status = 'drawing' WHERE id = ? AND status IN ('registration', 'closed')")
    .bind(t.id).run();
  if (lock.meta.changes === 0) throw new DrawError("Turnaj už se losuje");

  try {
    const stmts: D1PreparedStatement[] = [];
    schedule.forEach((day, idx) => {
      const dayNo = idx + 1;
      const venueIds = assignVenues(day, drawVenues, reputation, history);
      day.forEach((m, pos) => {
        stmts.push(db.prepare(
          `INSERT INTO tournament_matches (id, tournament_id, stage, day, bracket_pos, scheduled_at, venue_id, home_team_id, away_team_id)
           VALUES (?, ?, 'league', ?, ?, ?, ?, ?, ?)`
        ).bind(crypto.randomUUID(), t.id, dayNo, pos + 1, kickoffAt(t.starts_on as string, dayNo), venueIds[pos], m.home, m.away));
      });
    });
    const matchCount = stmts.length;
    groups.forEach((teamIds, g) => {
      for (const teamId of teamIds) {
        stmts.push(db.prepare("UPDATE tournament_entries SET group_code = ? WHERE tournament_id = ? AND team_id = ?")
          .bind(groupCode(g), t.id, teamId));
      }
    });
    const days = schedule.length;
    stmts.push(db.prepare(
      "UPDATE tournaments SET status = 'drawn', drawn_at = ?, league_matches = ?, league_days = ? WHERE id = ?"
    ).bind(now.toISOString(), option.matchesPerTeam, days, t.id));
    // Jedna dávka = všechno, nebo nic.
    await db.batch(stmts);
    logger.info({ module: M }, `los ${t.id}: ${entrants.length} týmů, ${choice.format === "groups" ? `${groups.length} skupiny, ` : ""}${matchCount} zápasů, ${days} dní ligové fáze`);
    return { matches: matchCount, leagueDays: days, format: choice.format };
  } catch (e) {
    await db.prepare("UPDATE tournaments SET status = 'closed' WHERE id = ? AND status = 'drawing'").bind(t.id).run()
      .catch((err) => logger.error({ module: M }, `los ${t.id}: návrat stavu po chybě`, err));
    throw e;
  }
}

/** Los jde zrušit, dokud se nezačalo hrát (žádný zápas odehraný ani zabraný k simulaci). */
async function drawIsResettable(db: D1Database, t: TournamentRow): Promise<boolean> {
  if (t.status !== "drawn") return false;
  const started = await db.prepare(
    "SELECT COUNT(*) AS n FROM tournament_matches WHERE tournament_id = ? AND (status != 'scheduled' OR claimed_at IS NOT NULL)"
  ).bind(t.id).first<{ n: number }>();
  return (started?.n ?? 0) === 0;
}

/**
 * Zrušení losu před prvním zápasem: smaže rozpis, skupiny a vrátí ročník do stavu po uzávěrce,
 * takže jde vylosovat znovu. Přihlášky zůstávají. SMS z losu to nemaže.
 */
export async function resetDraw(db: D1Database): Promise<{ matches: number }> {
  const t = await loadCurrentTournament(db);
  if (!t) throw new DrawError("Turnaj není vypsaný");
  if (!(await drawIsResettable(db, t))) throw new DrawError("Los jde zrušit jen před prvním zápasem");
  const res = await db.batch([
    db.prepare("DELETE FROM tournament_matches WHERE tournament_id = ? AND status = 'scheduled' AND claimed_at IS NULL").bind(t.id),
    db.prepare("UPDATE tournament_entries SET group_code = NULL WHERE tournament_id = ?").bind(t.id),
    db.prepare("UPDATE tournaments SET status = 'closed', drawn_at = NULL, league_matches = NULL, league_days = NULL WHERE id = ? AND status = 'drawn'").bind(t.id),
  ]);
  const removed = (res[0] as { meta?: { changes?: number } }).meta?.changes ?? 0;
  logger.info({ module: M }, `los ${t.id} zrušen: smazáno ${removed} zápasů`);
  return { matches: removed };
}

/** Náhled pro admina: počet přihlášených a možnosti délky. */
export async function drawPreview(db: D1Database) {
  const t = await loadCurrentTournament(db);
  if (!t) return null;
  const entrants = await loadEntrants(db, t.id);
  const venues = await loadVenues(db, t.city);
  return {
    tournament: { id: t.id, edition: t.edition, status: t.status, startsOn: t.starts_on, registrationDeadline: t.registration_deadline },
    canReset: await drawIsResettable(db, t),
    entrants: entrants.length,
    venues: venues.length,
    playoff: playoffStages(entrants.length),
    options: drawOptions(entrants.length).filter((o) => Math.floor(entrants.length / 2) <= venues.length),
  };
}
