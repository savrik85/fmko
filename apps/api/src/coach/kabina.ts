import { coachRelationBand, COACH_RELATION_BAND_ORDER, type CoachRelationBandKey } from "@okresni-masina/shared";
import { logger } from "../lib/logger";
import { isSulking } from "../multiplayer/left-out";
import { getTeamGameDate } from "../community/manager-relations";

/**
 * Kabina: jak trenéra berou vlastní hráči a proč.
 * Data jsou jen pro vlastníka klubu — cizím klubům se vztah k trenérovi neukazuje.
 */

/** Pod touhle morálkou dostane hráč v Kabině štítek „Nízká morálka". */
const LOW_MORALE = 35;
/** Od téhle úrovně nepokoje hráč „chce pryč". */
const UNREST_FLAG = 40;
const FEED_LIMIT = 40;

interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  age: number;
  avatar: string | null;
  coach_relationship: number | null;
  morale: number | null;
  left_out_streak: number | null;
  sulk: string | null;
  unrest_level: number | null;
  injured_days: number | null;
}

interface LogRow {
  player_id: string;
  first_name: string | null;
  last_name: string | null;
  delta: number;
  new_value: number;
  source: string;
  description: string;
  game_date: string | null;
  created_at: string;
}

export interface KabinaPlayer {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  age: number;
  avatar: Record<string, unknown> | null;
  relationship: number;
  band: CoachRelationBandKey;
  morale: number;
  sulking: boolean;
  leftOutStreak: number;
  unrestLevel: number;
  wantsOut: boolean;
  lowMorale: boolean;
  injuredDays: number | null;
  lastChange: { delta: number; description: string; date: string } | null;
}

export interface KabinaFeedItem {
  playerId: string;
  playerName: string;
  delta: number;
  newValue: number;
  source: string;
  description: string;
  date: string;
}

export interface Kabina {
  summary: {
    total: number;
    avgRelationship: number;
    bands: Record<CoachRelationBandKey, number>;
    sulking: number;
    wantsOut: number;
    lowMorale: number;
  };
  players: KabinaPlayer[];
  feed: KabinaFeedItem[];
}

function parseJson<T>(raw: string | null, what: string): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    logger.warn({ module: "kabina" }, `parse ${what}`, e);
    return null;
  }
}

export async function loadKabina(db: D1Database, teamId: string): Promise<Kabina> {
  const [players, latest, feed] = await db.batch([
    db.prepare(
      `SELECT p.id, p.first_name, p.last_name, p.position, p.age, p.avatar, p.coach_relationship,
              json_extract(p.life_context, '$.morale') AS morale,
              json_extract(p.life_context, '$.leftOutStreak') AS left_out_streak,
              json_extract(p.life_context, '$.leftOutSulk') AS sulk,
              json_extract(p.life_context, '$.transferUnrest.level') AS unrest_level,
              (SELECT MAX(i.days_remaining) FROM injuries i WHERE i.player_id = p.id AND i.days_remaining > 0) AS injured_days
         FROM players p
        WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active')
        ORDER BY COALESCE(p.coach_relationship, 50) ASC, p.last_name`,
    ).bind(teamId),
    db.prepare(
      `SELECT l.player_id, l.delta, l.description, COALESCE(l.game_date, l.created_at) AS created_at
         FROM coach_relation_log l
        WHERE l.id IN (SELECT MAX(id) FROM coach_relation_log WHERE team_id = ? GROUP BY player_id)`,
    ).bind(teamId),
    db.prepare(
      `SELECT l.player_id, p.first_name, p.last_name, l.delta, l.new_value, l.source, l.description,
              l.game_date, l.created_at
         FROM coach_relation_log l
         LEFT JOIN players p ON p.id = l.player_id
        WHERE l.team_id = ?
        ORDER BY l.id DESC
        LIMIT ?`,
    ).bind(teamId, FEED_LIMIT),
  ]);

  const gameDay = await getTeamGameDate(db, teamId);
  const lastByPlayer = new Map(
    (latest.results as Array<{ player_id: string; delta: number; description: string; created_at: string }>)
      .map((r) => [r.player_id, { delta: r.delta, description: r.description, date: r.created_at }]),
  );

  const bands = Object.fromEntries(COACH_RELATION_BAND_ORDER.map((k) => [k, 0])) as Record<CoachRelationBandKey, number>;
  let sum = 0;
  let sulkingCount = 0;
  let wantsOutCount = 0;
  let lowMoraleCount = 0;

  const out: KabinaPlayer[] = (players.results as unknown as PlayerRow[]).map((r) => {
    const relationship = r.coach_relationship ?? 50;
    const band = coachRelationBand(relationship).key;
    const morale = r.morale ?? 50;
    const sulking = isSulking(parseJson(r.sulk, `sulk of ${r.id}`), gameDay);
    const unrestLevel = r.unrest_level ?? 0;
    const wantsOut = unrestLevel >= UNREST_FLAG;
    const lowMorale = morale < LOW_MORALE;

    bands[band]++;
    sum += relationship;
    if (sulking) sulkingCount++;
    if (wantsOut) wantsOutCount++;
    if (lowMorale) lowMoraleCount++;

    return {
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      position: r.position,
      age: r.age,
      avatar: parseJson<Record<string, unknown>>(r.avatar, `avatar of ${r.id}`),
      relationship,
      band,
      morale,
      sulking,
      leftOutStreak: r.left_out_streak ?? 0,
      unrestLevel,
      wantsOut,
      lowMorale,
      injuredDays: r.injured_days ?? null,
      lastChange: lastByPlayer.get(r.id) ?? null,
    };
  });

  return {
    summary: {
      total: out.length,
      avgRelationship: out.length > 0 ? Math.round(sum / out.length) : 50,
      bands,
      sulking: sulkingCount,
      wantsOut: wantsOutCount,
      lowMorale: lowMoraleCount,
    },
    players: out,
    feed: (feed.results as unknown as LogRow[]).map((r) => ({
      playerId: r.player_id,
      playerName: r.first_name ? `${r.first_name} ${r.last_name}` : "Bývalý hráč",
      delta: r.delta,
      newValue: r.new_value,
      source: r.source,
      description: r.description,
      date: r.game_date ?? r.created_at,
    })),
  };
}

/** Historie vztahu jednoho hráče k trenérovi v tomhle klubu. */
export async function loadPlayerRelationLog(
  db: D1Database,
  teamId: string,
  playerId: string,
  limit = 10,
): Promise<KabinaFeedItem[]> {
  const rows = await db.prepare(
    `SELECT player_id, delta, new_value, source, description, game_date, created_at
       FROM coach_relation_log
      WHERE team_id = ? AND player_id = ?
      ORDER BY id DESC
      LIMIT ?`,
  ).bind(teamId, playerId, limit).all<Omit<LogRow, "first_name" | "last_name">>()
    .catch((e) => {
      logger.warn({ module: "kabina" }, `relation log of ${playerId}`, e);
      return { results: [] as Array<Omit<LogRow, "first_name" | "last_name">> };
    });
  return rows.results.map((r) => ({
    playerId: r.player_id,
    playerName: "",
    delta: r.delta,
    newValue: r.new_value,
    source: r.source,
    description: r.description,
    date: r.game_date ?? r.created_at,
  }));
}
