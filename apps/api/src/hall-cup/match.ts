/**
 * Jeden zápas sálovky: soupisky z databáze, simulace 5+1 a zápis výsledku.
 *
 * Sálovka nemá trvalé následky: zranění, karty ani kondice se do ligy nepřenáší,
 * statistiky hráčů se nepočítají. Hraje se v hale, takže počasí i trávník jsou neutrální.
 */

import { logger } from "../lib/logger";
import { createRng, type Rng } from "../generators/rng";
import { simulateMatch } from "../engine/simulation";
import { mapRowToMatchPlayer } from "../engine/lineup-loader";
import { cupShootout } from "../cup/cup";
import type { MatchPlayer, TeamSetup } from "../engine/types";
import { HALL_FORMAT, pickHallRoster, type HallSlot, type RosterCandidate } from "./format";

const M = "hall-cup";
/** Kontumace v sálovce: 5:0 pro soupeře. */
const FORFEIT_GOALS = 5;

interface SquadRow {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  position: string;
  skills: string;
  personality: string;
  life_context: string;
  physical: string | null;
  age: number;
  overall_rating: number | null;
}

type Candidate = RosterCandidate & { row: SquadRow };

function goalkeepingOf(skills: string): number {
  try {
    return Number((JSON.parse(skills) as Record<string, unknown>).goalkeeping) || 0;
  } catch (e) {
    logger.warn({ module: M }, "nečitelné dovednosti hráče", e);
    return 0;
  }
}

function asPosition(p: string): RosterCandidate["position"] {
  return p === "GK" || p === "DEF" || p === "MID" || p === "FWD" ? p : "MID";
}

/** Zdraví hráči klubu, kteří můžou do haly. Zranění se čtou zvlášť (bez korelovaného poddotazu). */
export async function hallCandidates(db: D1Database, teamId: string): Promise<Candidate[]> {
  const [players, injured] = await Promise.all([
    db.prepare(
      `SELECT id, first_name, last_name, nickname, position, skills, personality, life_context, physical, age, overall_rating
         FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')`,
    ).bind(teamId).all<SquadRow>(),
    db.prepare(
      `SELECT i.player_id FROM injuries i JOIN players p ON p.id = i.player_id
        WHERE p.team_id = ? AND i.days_remaining > 0`,
    ).bind(teamId).all<{ player_id: string }>(),
  ]);
  const hurt = new Set(injured.results.map((r) => r.player_id));
  return players.results.filter((r) => !hurt.has(r.id)).map((row) => ({
    id: row.id, position: asPosition(row.position), rating: row.overall_rating ?? 0,
    goalkeeping: goalkeepingOf(row.skills), row,
  }));
}

export interface HallSide {
  setup: TeamSetup | null;
  idMap: Map<number, string>;
  names: Array<{ id: string; name: string; slot: HallSlot | "SUB" }>;
}

function playerName(r: SquadRow): string {
  return `${r.first_name} ${r.last_name}`;
}

/** Sestava jednoho klubu. `setup` null = méně než pět zdravých, kontumace. */
export function buildHallSide(engineTeamId: number, teamName: string, candidates: Candidate[], chosen: string[] | null): HallSide {
  const roster = pickHallRoster(candidates, chosen);
  const idMap = new Map<number, string>();
  if (!roster.lineup.length) return { setup: null, idMap, names: [] };
  const toEngine = (c: Candidate, slot?: HallSlot): MatchPlayer => {
    const p = mapRowToMatchPlayer(c.row, slot);
    idMap.set(p.id, c.id);
    return p;
  };
  const lineup = roster.lineup.map((c) => toEngine(c, c.slot));
  const subs = roster.subs.map((c) => toEngine(c));
  return {
    setup: { teamId: engineTeamId, teamName, lineup, subs, tactic: "balanced", formation: "2-1-2" },
    idMap,
    names: [
      ...roster.lineup.map((c) => ({ id: c.id, name: playerName(c.row), slot: c.slot })),
      ...roster.subs.map((c) => ({ id: c.id, name: playerName(c.row), slot: "SUB" as const })),
    ],
  };
}

export interface HallEvent {
  minute: number;
  type: "goal" | "card";
  detail: string | null;
  side: "home" | "away";
  playerId: string | null;
  name: string;
}

export interface HallMatchOutcome {
  homeScore: number;
  awayScore: number;
  homePens: number | null;
  awayPens: number | null;
  winner: string | null;
  events: HallEvent[];
  forfeit: boolean;
}

/**
 * Odehraje zápas. `knockout` = při remíze penalty. Kontumace: kdo nemá pět zdravých,
 * prohraje 0:5 (oba = 0:0 a v play-off postupuje domácí podle zápisu).
 */
export function playHallMatch(
  rng: Rng, home: { id: string; side: HallSide }, away: { id: string; side: HallSide }, knockout: boolean, attendance: number,
): HallMatchOutcome {
  const hs = home.side.setup;
  const as = away.side.setup;
  if (!hs || !as) {
    const homeScore = hs ? FORFEIT_GOALS : 0;
    const awayScore = as ? FORFEIT_GOALS : 0;
    const winner = homeScore > awayScore ? home.id : awayScore > homeScore ? away.id : knockout ? home.id : null;
    return { homeScore, awayScore, homePens: null, awayPens: null, winner, events: [], forfeit: true };
  }
  const result = simulateMatch(rng, {
    home: hs, away: as, weather: "cloudy", isHomeAdvantage: false, format: HALL_FORMAT,
    pitchCondition: 100, attendance, stadiumName: "hala",
  });
  let homePens: number | null = null;
  let awayPens: number | null = null;
  if (knockout && result.homeScore === result.awayScore) {
    const strength = (lineup: MatchPlayer[]) => lineup.reduce((s, p) => s + (p.shooting + p.technique) / 2, 0) / Math.max(1, lineup.length);
    const so = cupShootout(rng, strength(result.homeLineup), strength(result.awayLineup));
    homePens = so.hp;
    awayPens = so.ap;
  }
  const names = new Map<string, string>([...home.side.names, ...away.side.names].map((n) => [n.id, n.name]));
  const events: HallEvent[] = result.events
    .filter((e) => e.type === "goal" || e.type === "card")
    .map((e) => {
      const side = e.teamId === hs.teamId ? "home" : "away";
      const playerId = (side === "home" ? home.side.idMap : away.side.idMap).get(e.playerId) ?? null;
      return {
        minute: e.minute, type: e.type as "goal" | "card", detail: e.detail ?? null, side,
        playerId, name: playerId ? names.get(playerId) ?? "" : "",
      };
    });
  const homeWins = result.homeScore > result.awayScore || (homePens ?? 0) > (awayPens ?? 0);
  const awayWins = result.awayScore > result.homeScore || (awayPens ?? 0) > (homePens ?? 0);
  return {
    homeScore: result.homeScore, awayScore: result.awayScore, homePens, awayPens,
    winner: homeWins ? home.id : awayWins ? away.id : null, events, forfeit: false,
  };
}

/** Semínko zápasu z jeho id: opakovaný běh téhož zápasu dá stejný výsledek. */
export function matchRng(matchId: string): Rng {
  let h = 2166136261;
  for (let i = 0; i < matchId.length; i++) {
    h ^= matchId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return createRng(h >>> 0);
}
