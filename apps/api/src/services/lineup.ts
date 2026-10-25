/**
 * Uložení sestavy a týmových rolí: jedna služba pro manažera (routy v routes/game.ts)
 * i AI trenéra (ai-coach/match.ts). Pravidla žijí jen tady, aby AI nemohla dostat
 * jinou (výhodnější) kontrolu než člověk.
 */

import { validateMatchPlan } from "../lib/match-plan-validation";
import { validateBench, benchColumn } from "../lib/lineup-bench";
import { logger } from "../lib/logger";

/** Whitelist taktik a formací, drží sync se shared/engine. Neplatné hodnoty by jinak shodily engine. */
export const VALID_TACTICS = ["offensive", "balanced", "defensive", "long_ball", "possession", "pressing"] as const;
/** Tvrdost hry: whitelist stejně jako u taktiky, DB na ni CHECK nemá. */
export const VALID_HARDNESS = ["fair", "normal", "hard"] as const;
export const VALID_FORMATIONS = ["4-4-2", "4-3-3", "3-5-2", "4-5-1", "5-3-2", "3-4-3"] as const;

export interface SaveLineupInput {
  calendarId: string;
  formation: string;
  tactic: string;
  hardness?: string;
  captainId?: string | null;
  presetSlot?: "A" | "B" | "C" | null;
  matchPlan?: unknown;
  bench?: unknown;
  players: Array<{ playerId: string; matchPosition: string }>;
}

export type ServiceError = { ok: false; status: 400 | 403 | 404 | 409 | 500; error: string };
export type SaveLineupResult = { ok: true; lineupId: string } | ServiceError;

/**
 * Zkontroluje a uloží sestavu na zápas (`lineups`, upsert podle týmu a kola).
 * Stejné kontroly jako dřív v POST /teams/:teamId/lineup.
 */
export async function saveLineup(db: D1Database, teamId: string, body: SaveLineupInput): Promise<SaveLineupResult> {
  if (!body.players || body.players.length !== 11) return { ok: false, status: 400, error: "Sestava musí mít přesně 11 hráčů" };
  const gkCount = body.players.filter((p) => p.matchPosition === "GK").length;
  if (gkCount !== 1) return { ok: false, status: 400, error: "Sestava musí mít přesně 1 brankáře" };
  if (!VALID_TACTICS.includes(body.tactic as typeof VALID_TACTICS[number])) {
    return { ok: false, status: 400, error: `Neplatná taktika "${body.tactic}"` };
  }
  const hardness = body.hardness ?? "normal";
  if (!VALID_HARDNESS.includes(hardness as typeof VALID_HARDNESS[number])) {
    return { ok: false, status: 400, error: `Neplatná tvrdost hry "${body.hardness}"` };
  }
  if (!VALID_FORMATIONS.includes(body.formation as typeof VALID_FORMATIONS[number])) {
    return { ok: false, status: 400, error: `Neplatná formace "${body.formation}"` };
  }

  // Hráči musí patřit týmu a být k dispozici
  const playerIds = body.players.map((p) => p.playerId);
  if (new Set(playerIds).size !== playerIds.length) {
    return { ok: false, status: 400, error: "Sestava obsahuje duplicitního hráče" };
  }
  const placeholders = playerIds.map(() => "?").join(",");
  // Turnajový zápas: ligová stopka v turnaji neplatí, hlídá se turnajová.
  const tournamentMatch = await db.prepare(
    "SELECT tournament_id FROM tournament_matches WHERE id = ? AND (home_team_id = ? OR away_team_id = ?)"
  ).bind(body.calendarId, teamId, teamId).first<{ tournament_id: string }>()
    .catch((e) => { logger.warn({ module: "game" }, "turnajový zápas pro uložení sestavy", e); return null; });
  const validPlayers = await db.prepare(
    `SELECT p.id FROM players p LEFT JOIN injuries i ON p.id = i.player_id AND i.days_remaining > 0
     WHERE p.id IN (${placeholders}) AND p.team_id = ? AND (p.status IS NULL OR p.status = 'active')
     AND i.id IS NULL${tournamentMatch ? "" : " AND (p.suspended_matches IS NULL OR p.suspended_matches = 0)"}`
  ).bind(...playerIds, teamId).all().catch((e) => { logger.warn({ module: "game" }, "validate lineup players", e); return { results: [] }; });

  const validIds = new Set(validPlayers.results.map((r) => r.id as string));
  if (tournamentMatch) {
    const { loadTournamentSuspensions } = await import("../tournament/match");
    const susp = await loadTournamentSuspensions(db, tournamentMatch.tournament_id, [teamId]);
    for (const id of susp.keys()) validIds.delete(id);
  }
  const invalid = playerIds.filter((id) => !validIds.has(id));
  if (invalid.length > 0) {
    return { ok: false, status: 400, error: `${invalid.length} hráč(ů) není dostupných (zranění, suspendace nebo nepatří do týmu)` };
  }
  // Pozn.: Generátorové absence (Práce/Osobní/Zdraví/Jiné) záměrně NEblokujeme — default lineup fallback
  // i staré uložené sestavy mohou obsahovat dnes omluvené hráče. Match-runner je auto-substituuje při simulaci
  // (buildMatchPlayers s matchKey seedem). Blokovat save by znamenalo že user nemůže uložit preset který má
  // omluvence, i když UI už absentní substituuje v apply-preset.

  // Captain musí být v lineupu (pokud je vyplněn). Jinak nullify.
  const captainId = body.captainId && playerIds.includes(body.captainId) ? body.captainId : null;

  // Pokyny na lavičce — střídání se smí odkazovat jen na hráče z jedenáctky
  // (ven) a ze zbytku kádru (dovnitř), proto potřebujeme celý kádr, ne jen sestavu.
  const squadRows = await db.prepare(
    "SELECT id FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')"
  ).bind(teamId).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: "game" }, "kádr pro validaci pokynů", e); return { results: [] }; });
  const planCheck = validateMatchPlan(body.matchPlan, {
    starterIds: new Set(playerIds),
    squadIds: new Set(squadRows.results.map((r) => r.id)),
  });
  if (!planCheck.ok) return { ok: false, status: 400, error: planCheck.error };
  const matchPlanJson = JSON.stringify(planCheck.plan);

  const benchCheck = validateBench(body.bench, {
    starterIds: new Set(playerIds),
    squadIds: new Set(squadRows.results.map((r) => r.id)),
  });
  if (!benchCheck.ok) return { ok: false, status: 400, error: benchCheck.error };
  const benchJson = benchColumn(benchCheck.bench);

  // Upsert lineup
  const existing = await db.prepare("SELECT id FROM lineups WHERE team_id = ? AND calendar_id = ?")
    .bind(teamId, body.calendarId).first<{ id: string }>();

  // Preset slot: jen A/B/C formát validujeme, existenci presetu NE — preset tabulka je oddělená
  // a FE může chtít označit lineup "Sestava A" i pokud slot A zatím nemá uložený preset
  // (teprve se ukládá). Nullifikace pak způsobovala že UI rozpis ukazoval "Bez sestavy"
  // přestože lineup byl uložen.
  const presetSlot: string | null = body.presetSlot && ["A", "B", "C"].includes(body.presetSlot)
    ? body.presetSlot : null;
  let lineupId: string;
  if (existing) {
    lineupId = existing.id;
    await db.prepare("UPDATE lineups SET formation = ?, tactic = ?, hardness = ?, players_data = ?, captain_id = ?, preset_slot = ?, match_plan = ?, bench_data = ?, is_auto = 0, submitted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
      .bind(body.formation, body.tactic, hardness, JSON.stringify(body.players), captainId, presetSlot, matchPlanJson, benchJson, existing.id).run();
  } else {
    lineupId = crypto.randomUUID();
    await db.prepare("INSERT INTO lineups (id, team_id, calendar_id, formation, tactic, hardness, players_data, captain_id, preset_slot, match_plan, bench_data, is_auto, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
      .bind(lineupId, teamId, body.calendarId, body.formation, body.tactic, hardness, JSON.stringify(body.players), captainId, presetSlot, matchPlanJson, benchJson).run();
  }

  // Auto-upsert do lineup_presets když user ukládá sestavu s presetSlot A/B/C.
  // Dřív preset vznikal jen přes explicitní PUT /lineup-presets/{slot}, takže běžný save lineupu
  // s "presetSlot=A" preset A nevytvořil → UI rozpisu ukazoval "Sestava A prázdná". User myslí
  // že jedna akce "Uložit Sestavu A" naplní slot i zápas naráz — to je teď skutečné chování.
  if (presetSlot) {
    await db.prepare(
      `INSERT INTO lineup_presets (team_id, slot, formation, tactic, hardness, captain_id, players_data, match_plan, bench_data, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
       ON CONFLICT(team_id, slot) DO UPDATE SET
         formation = excluded.formation,
         tactic = excluded.tactic,
         hardness = excluded.hardness,
         captain_id = excluded.captain_id,
         players_data = excluded.players_data,
         match_plan = excluded.match_plan,
         bench_data = excluded.bench_data,
         updated_at = excluded.updated_at`
    ).bind(teamId, presetSlot, body.formation, body.tactic, hardness, captainId, JSON.stringify(body.players), matchPlanJson, benchJson)
      .run().catch((e) => logger.warn({ module: "game" }, "auto-upsert preset", e));
  }

  return { ok: true, lineupId };
}

export interface TeamRolesInput {
  captainId?: string;
  penaltyTakerId?: string;
  freekickTakerId?: string;
}

/**
 * Týmové role (kapitán, penalty, přímé kopy). Stejná pravidla jako dřív v POST /teams/:teamId/roles:
 * přiřadit jde jen hráče vlastního týmu, prázdná hodnota roli zruší.
 */
export async function setTeamRoles(db: D1Database, teamId: string, body: TeamRolesInput): Promise<{ ok: true } | ServiceError> {
  const updates: string[] = [];
  const binds: unknown[] = [];

  // Ověřit že přiřazované hráče ID patří do týmu (nenastavit cizího hráče jako kapitána)
  const idsToCheck = [body.captainId, body.penaltyTakerId, body.freekickTakerId].filter((id): id is string => !!id);
  if (idsToCheck.length > 0) {
    const placeholders = idsToCheck.map(() => "?").join(",");
    const validCount = await db.prepare(
      `SELECT COUNT(*) as cnt FROM players WHERE team_id = ? AND id IN (${placeholders})`
    ).bind(teamId, ...idsToCheck).first<{ cnt: number }>().catch((e) => { logger.warn({ module: "game" }, "validate role player ids", e); return null; });
    if (!validCount || validCount.cnt !== idsToCheck.length) {
      return { ok: false, status: 400, error: "Hráč nenáleží do týmu" };
    }
  }

  if (body.captainId !== undefined) { updates.push("captain_id = ?"); binds.push(body.captainId || null); }
  if (body.penaltyTakerId !== undefined) { updates.push("penalty_taker_id = ?"); binds.push(body.penaltyTakerId || null); }
  if (body.freekickTakerId !== undefined) { updates.push("freekick_taker_id = ?"); binds.push(body.freekickTakerId || null); }

  if (updates.length > 0) {
    binds.push(teamId);
    await db.prepare(`UPDATE teams SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...binds).run().catch((e) => logger.warn({ module: "game" }, "update team roles", e));
  }

  return { ok: true };
}
