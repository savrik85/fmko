/**
 * Sdílená logika pro generátorové absence (Práce/Osobní/Zdraví/Jiné).
 * Jeden zdroj pravdy — /next-match, apply-preset, POST /lineup, player detail.
 * Match-runner má vlastní inline variantu s rozšířeným reportingem.
 */

import { absenceSeedForMatch } from "../lib/seed";
import { generateAbsences } from "./absence";
import { createRng } from "../generators/rng";
import { logger } from "../lib/logger";

export interface MatchContext {
  /** calendar_id pro ligu, match.id pro friendly */
  matchKey: string;
  isFriendly: boolean;
  /** ISO string */
  scheduledAt: string;
  /** ISO string — game_date týmu */
  gameDate: string;
}

/** Najdi match kontext podle calendarId (ligu) nebo match.id (přátelák). */
export async function resolveMatchContext(
  db: D1Database,
  teamId: string,
  calendarOrMatchId: string,
): Promise<MatchContext | null> {
  const team = await db.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: "match-absences" }, "team query", e); return null; });
  if (!team?.game_date) return null;

  const cal = await db.prepare("SELECT scheduled_at FROM season_calendar WHERE id = ?")
    .bind(calendarOrMatchId).first<{ scheduled_at: string }>()
    .catch((e) => { logger.warn({ module: "match-absences" }, "calendar query", e); return null; });
  if (cal) {
    return { matchKey: calendarOrMatchId, isFriendly: false, scheduledAt: cal.scheduled_at, gameDate: team.game_date };
  }

  const friendly = await db.prepare(
    "SELECT created_at FROM matches WHERE id = ? AND calendar_id IS NULL AND (home_team_id = ? OR away_team_id = ?)",
  ).bind(calendarOrMatchId, teamId, teamId).first<{ created_at: string }>()
    .catch((e) => { logger.warn({ module: "match-absences" }, "friendly query", e); return null; });
  if (friendly) {
    return { matchKey: calendarOrMatchId, isFriendly: true, scheduledAt: friendly.created_at, gameDate: team.game_date };
  }
  return null;
}

export interface AbsencePlayerInfo {
  reason: string;
  category: string;
  emoji: string;
  smsText: string;
}

/**
 * Načte district týmu (rural/urban/undefined). Sdílené — každé volání `generateAbsences`
 * MUSÍ předat district, jinak envFilter v absence generátoru vybere jiný pool výmluv
 * pro stejný seed → divergence mezi SMS a simulací pro stejný (match, team, phase).
 */
export async function fetchTeamDistrict(
  db: D1Database,
  teamId: string,
): Promise<string | undefined> {
  const row = await db.prepare(
    "SELECT v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?",
  ).bind(teamId).first<{ district: string }>()
    .catch((e) => { logger.warn({ module: "match-absences" }, "district query", e); return null; });
  return row?.district ?? undefined;
}

/**
 * Vrátí Map<playerId, info> pro hráče absentní z generátoru (ne injury/suspension).
 * Prázdná mapa pokud je zápas vzdálenější než den a není přátelák.
 */
export async function getAbsentPlayersMap(
  db: D1Database,
  teamId: string,
  ctx: MatchContext,
): Promise<Map<string, AbsencePlayerInfo>> {
  const matchDate = new Date(ctx.scheduledAt);
  const gameDate = new Date(ctx.gameDate);
  const daysUntilMatch = ctx.isFriendly
    ? 0
    : Math.max(0, Math.round((matchDate.getTime() - gameDate.getTime()) / 86400000));
  if (daysUntilMatch > 1) return new Map();

  const [playersRes, injRes, district] = await Promise.all([
    db.prepare(
      "SELECT p.id, p.first_name, p.last_name, p.age, p.life_context, p.personality, p.physical, p.commute_km, p.suspended_matches, p.is_celebrity, p.overall_rating FROM players p WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active') ORDER BY p.overall_rating DESC",
    ).bind(teamId).all<Record<string, unknown>>()
      .catch((e) => { logger.warn({ module: "match-absences" }, "players query", e); return { results: [] as Record<string, unknown>[] }; }),
    db.prepare(
      "SELECT player_id FROM injuries WHERE days_remaining > 0 AND player_id IN (SELECT id FROM players WHERE team_id = ?)",
    ).bind(teamId).all<{ player_id: string }>()
      .catch((e) => { logger.warn({ module: "match-absences" }, "injuries query", e); return { results: [] as { player_id: string }[] }; }),
    fetchTeamDistrict(db, teamId),
  ]);

  const injuredIds = new Set(injRes.results.map((r) => r.player_id));
  const healthyPlayers = playersRes.results.filter((r) => !injuredIds.has(r.id as string) && !((r.suspended_matches as number) > 0));

  const absenceSquad = healthyPlayers.map((row) => {
    const pers = (() => { try { return JSON.parse(row.personality as string); } catch { return {}; } })();
    const lc = (() => { try { return JSON.parse(row.life_context as string); } catch { return {}; } })();
    const phys = (() => { try { return JSON.parse(row.physical as string); } catch { return {}; } })();
    return {
      firstName: row.first_name as string, lastName: row.last_name as string,
      age: row.age as number, occupation: (lc as { occupation?: string }).occupation ?? "",
      discipline: (pers as { discipline?: number }).discipline ?? 50,
      patriotism: (pers as { patriotism?: number }).patriotism ?? 50,
      alcohol: (pers as { alcohol?: number }).alcohol ?? 30,
      temper: (pers as { temper?: number }).temper ?? 40,
      morale: (lc as { morale?: number }).morale ?? 50,
      stamina: (phys as { stamina?: number }).stamina ?? 50,
      injuryProneness: (pers as { injuryProneness?: number }).injuryProneness ?? 50,
      commuteKm: (row.commute_km as number) ?? 0,
      isCelebrity: !!(row.is_celebrity as number),
      celebrityType: (pers as { celebrityType?: "legend" | "fallen_star" | "glass_man" }).celebrityType,
      celebrityTier: (pers as { celebrityTier?: "S" | "A" | "B" | "C" }).celebrityTier,
    };
  });

  const friendlyMultiplier = ctx.isFriendly ? 1.8 : undefined;
  const dayBeforeRng = createRng(absenceSeedForMatch({ matchKey: ctx.matchKey, teamId, phase: "day_before" }));
  const matchDayRng = createRng(absenceSeedForMatch({ matchKey: ctx.matchKey, teamId, phase: "match_day" }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dayBeforeAbs = generateAbsences(dayBeforeRng as any, absenceSquad, "day_before", district, friendlyMultiplier);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matchDayAbs = generateAbsences(matchDayRng as any, absenceSquad, "match_day", district, friendlyMultiplier);
  const seen = new Set<number>();
  const absences = [...dayBeforeAbs, ...matchDayAbs].filter((a) => {
    if (seen.has(a.playerIndex)) return false;
    seen.add(a.playerIndex);
    return true;
  });

  const map = new Map<string, AbsencePlayerInfo>();
  for (const a of absences) {
    const playerId = healthyPlayers[a.playerIndex]?.id as string | undefined;
    if (!playerId) continue;
    map.set(playerId, {
      reason: a.reason,
      category: a.category,
      emoji: a.emoji,
      smsText: a.smsText,
    });
  }
  return map;
}

/** Tenká wrapper pokud stačí jen ID set (používá apply-preset a POST /lineup). */
export async function getAbsentPlayerIds(
  db: D1Database,
  teamId: string,
  ctx: MatchContext,
): Promise<Set<string>> {
  const map = await getAbsentPlayersMap(db, teamId, ctx);
  return new Set(map.keys());
}

/**
 * Najde nejbližší relevantní zápas pro tým (pro player detail).
 * Priority: friendly lineups_open → nejbližší scheduled ligový.
 */
export async function findUpcomingMatchContext(
  db: D1Database,
  teamId: string,
): Promise<MatchContext | null> {
  const team = await db.prepare("SELECT league_id, game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ league_id: string | null; game_date: string | null }>()
    .catch((e) => { logger.warn({ module: "match-absences" }, "team lookup", e); return null; });
  if (!team?.game_date) return null;

  const friendly = await db.prepare(
    `SELECT id, created_at FROM matches
     WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'lineups_open' AND calendar_id IS NULL
     ORDER BY created_at ASC LIMIT 1`,
  ).bind(teamId, teamId).first<{ id: string; created_at: string }>()
    .catch((e) => { logger.warn({ module: "match-absences" }, "friendly lookup", e); return null; });
  if (friendly) {
    return { matchKey: friendly.id, isFriendly: true, scheduledAt: friendly.created_at, gameDate: team.game_date };
  }

  if (!team.league_id) return null;
  const cal = await db.prepare(
    "SELECT id, scheduled_at FROM season_calendar WHERE league_id = ? AND scheduled_at >= ? AND status = 'scheduled' ORDER BY scheduled_at ASC LIMIT 1",
  ).bind(team.league_id, team.game_date).first<{ id: string; scheduled_at: string }>()
    .catch((e) => { logger.warn({ module: "match-absences" }, "calendar lookup", e); return null; });
  if (!cal) return null;
  return { matchKey: cal.id, isFriendly: false, scheduledAt: cal.scheduled_at, gameDate: team.game_date };
}
