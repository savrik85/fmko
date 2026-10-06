/**
 * Turnaj P-Mobile — práce s DB: ročník, hřiště, los a uložení rozpisu.
 */

import { logger } from "../lib/logger";
import {
  assignVenues, buildLeagueSchedule, drawOptions, leagueDays as leagueDaysFor, playoffStages,
  type DrawTeam, type DrawVenue,
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

/** Přihlášené týmy s okresem a reputací — podklad pro los. */
export async function loadEntrants(db: D1Database, tournamentId: string): Promise<Array<DrawTeam & { name: string }>> {
  const rows = await db.prepare(
    `SELECT t.id, t.name, COALESCE(t.reputation, 0) AS reputation, l.district
       FROM tournament_entries e
       JOIN teams t ON t.id = e.team_id
       LEFT JOIN leagues l ON l.id = t.league_id
      WHERE e.tournament_id = ?
      ORDER BY e.registered_at`
  ).bind(tournamentId).all<{ id: string; name: string; reputation: number; district: string | null }>();
  return rows.results.map((r) => ({ id: r.id, name: r.name, reputation: r.reputation, district: r.district }));
}

/** Seed losu z id ročníku — opakovaný los (např. po chybě) dá stejný rozpis. */
function seedOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h;
}

export class DrawError extends Error {}

/**
 * Los: uloží ligovou fázi s hřišti a nastaví ročník na `drawn`. Zámek přes status
 * (`drawing`), ať dvojklik admina nevylosuje turnaj dvakrát.
 */
export async function performDraw(db: D1Database, matchesPerTeam: number, now = new Date()): Promise<{ matches: number; leagueDays: number }> {
  const t = await loadCurrentTournament(db);
  if (!t) throw new DrawError("Turnaj není vypsaný");
  if (t.status !== "registration" && t.status !== "closed") throw new DrawError("Turnaj už je vylosovaný");
  if (now.toISOString() < t.registration_deadline) throw new DrawError("Přihlášky ještě běží");
  if (!t.starts_on) throw new DrawError("Turnaj nemá datum začátku");

  const entrants = await loadEntrants(db, t.id);
  const option = drawOptions(entrants.length).find((o) => o.matchesPerTeam === matchesPerTeam);
  if (!option) throw new DrawError(`S ${entrants.length} kluby nejde hrát ${matchesPerTeam} zápasů na tým`);

  const venues = await loadVenues(db, t.city);
  const drawVenues: DrawVenue[] = venues.map((v) => ({ id: v.id, capacity: v.capacity, isMain: v.is_main === 1 }));
  const schedule = buildLeagueSchedule(entrants, matchesPerTeam, seedOf(t.id));
  const reputation = new Map(entrants.map((e) => [e.id, e.reputation]));
  const mainCount = new Map<string, number>();

  const lock = await db.prepare("UPDATE tournaments SET status = 'drawing' WHERE id = ? AND status IN ('registration', 'closed')")
    .bind(t.id).run();
  if (lock.meta.changes === 0) throw new DrawError("Turnaj už se losuje");

  try {
    const stmts: D1PreparedStatement[] = [];
    schedule.forEach((day, idx) => {
      const dayNo = idx + 1;
      const venueIds = assignVenues(day, drawVenues, reputation, mainCount);
      day.forEach((m, pos) => {
        stmts.push(db.prepare(
          `INSERT INTO tournament_matches (id, tournament_id, stage, day, bracket_pos, scheduled_at, venue_id, home_team_id, away_team_id)
           VALUES (?, ?, 'league', ?, ?, ?, ?, ?, ?)`
        ).bind(crypto.randomUUID(), t.id, dayNo, pos + 1, kickoffAt(t.starts_on as string, dayNo), venueIds[pos], m.home, m.away));
      });
    });
    const days = leagueDaysFor(entrants.length, matchesPerTeam);
    stmts.push(db.prepare(
      "UPDATE tournaments SET status = 'drawn', drawn_at = ?, league_matches = ?, league_days = ? WHERE id = ?"
    ).bind(now.toISOString(), matchesPerTeam, days, t.id));
    // Jedna dávka = všechno, nebo nic.
    await db.batch(stmts);
    logger.info({ module: M }, `los ${t.id}: ${entrants.length} týmů, ${stmts.length - 1} zápasů, ${days} dní ligové fáze`);
    return { matches: stmts.length - 1, leagueDays: days };
  } catch (e) {
    await db.prepare("UPDATE tournaments SET status = 'closed' WHERE id = ? AND status = 'drawing'").bind(t.id).run()
      .catch((err) => logger.error({ module: M }, `los ${t.id}: návrat stavu po chybě`, err));
    throw e;
  }
}

/** Náhled pro admina: počet přihlášených a možnosti délky. */
export async function drawPreview(db: D1Database) {
  const t = await loadCurrentTournament(db);
  if (!t) return null;
  const entrants = await loadEntrants(db, t.id);
  const venues = await loadVenues(db, t.city);
  return {
    tournament: { id: t.id, edition: t.edition, status: t.status, startsOn: t.starts_on, registrationDeadline: t.registration_deadline },
    entrants: entrants.length,
    venues: venues.length,
    playoff: playoffStages(entrants.length),
    options: drawOptions(entrants.length).filter((o) => Math.floor(entrants.length / 2) <= venues.length),
  };
}
