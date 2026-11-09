/**
 * Přesuny hráčů mezi áčkem a U21: jedna služba pro manažera (routes/u21.ts) i AI trenéra.
 */

import { logger } from "../lib/logger";
import type { ServiceError } from "./lineup";

export type SendToU21Mode = "permanent" | "next_match";

/**
 * A → U21: pošle hráče do 21 let z áčka do U21.
 *  - `permanent`: hráč zůstává v U21, dokud ho manažer nepovýší,
 *  - `next_match`: hráč se vrátí po nejbližším zápase U21.
 */
export async function sendPlayerToU21(db: D1Database, teamId: string, playerId: string, mode: SendToU21Mode): Promise<{ ok: true; mode: SendToU21Mode } | ServiceError> {
  const player = await db.prepare(
    "SELECT id, team_id, age, status, loan_from_team_id, next_match_return, COALESCE(suspended_matches, 0) AS suspended_matches FROM players WHERE id = ?"
  ).bind(playerId).first<{ id: string; team_id: string; age: number; status: string | null; loan_from_team_id: string | null; next_match_return: number; suspended_matches: number }>();
  if (!player) return { ok: false, status: 404, error: "Hráč nenalezen" };
  if (player.team_id !== teamId) return { ok: false, status: 400, error: "Hráč nepatří k tomuto týmu" };
  if (player.age > 21) return { ok: false, status: 400, error: "Hráč je starší 21 let" };
  // Stopku z áčka by si jinak odseděl v dorostu: U21 hraje den po áčku, hráč se stopkou
  // v něm nenastoupí, zápas se mu odečte a áčko o něj nepřijde ani jednou.
  if (player.suspended_matches > 0) {
    return { ok: false, status: 400, error: "Hráč má stopku. Do dorostu může, až si ji odpyká." };
  }
  // Hostující hráč do U21 smí: hostování s tím počítá (stillOnLoan bere i U21 klubu,
  // který si ho půjčil) a návrat i stažení ho vrátí odkudkoli. Zápasy U21 se ale do
  // podmínky hraní nepočítají, ta hlídá áčko.
  if (player.next_match_return) return { ok: false, status: 400, error: "Hráč už čeká na návrat z U21" };
  // Jen trvale: přesun na jeden zápas si pamatuje áčko hostitele jako místo návratu
  // (`parent_club_id`), a kdyby hostování mezitím skončilo, vrátil by se po zápase U21 tam.
  if (player.loan_from_team_id && mode === "next_match") {
    return { ok: false, status: 400, error: "Hostujícího hráče jde do U21 přesunout jen trvale, na jeden zápas ne." };
  }

  const u21Team = await db.prepare(
    "SELECT id FROM teams WHERE parent_team_id = ? AND team_type = 'u21'"
  ).bind(teamId).first<{ id: string }>();
  if (!u21Team) return { ok: false, status: 404, error: "U21 tým neexistuje" };

  if (mode === "next_match") {
    await db.prepare(
      "UPDATE players SET team_id = ?, parent_club_id = ?, next_match_return = 1 WHERE id = ?"
    ).bind(u21Team.id, teamId, playerId).run();
  } else {
    await db.prepare(
      "UPDATE players SET team_id = ?, parent_club_id = NULL, next_match_return = 0 WHERE id = ?"
    ).bind(u21Team.id, playerId).run();
  }

  logger.info({ module: "u21", teamId, playerId, mode }, "player sent to U21");
  return { ok: true, mode };
}

/** U21 → A: povýší hráče zpět do áčka (vždy trvale). */
export async function promotePlayerFromU21(db: D1Database, teamId: string, playerId: string): Promise<{ ok: true } | ServiceError> {
  const u21Team = await db.prepare(
    "SELECT id FROM teams WHERE parent_team_id = ? AND team_type = 'u21'"
  ).bind(teamId).first<{ id: string }>();
  if (!u21Team) return { ok: false, status: 404, error: "U21 tým neexistuje" };

  const player = await db.prepare(
    "SELECT id, team_id, age FROM players WHERE id = ?"
  ).bind(playerId).first<{ id: string; team_id: string; age: number }>();
  if (!player) return { ok: false, status: 404, error: "Hráč nenalezen" };
  if (player.team_id !== u21Team.id) return { ok: false, status: 400, error: "Hráč není v U21" };
  // FAČR: za muže až od 15 let (starší žák smí jen do dorostu)
  const { SENIOR_MIN_AGE } = await import("../academy/rules");
  if (player.age < SENIOR_MIN_AGE) return { ok: false, status: 400, error: `Za muže smí hráč nastoupit až od ${SENIOR_MIN_AGE} let.` };

  await db.prepare(
    "UPDATE players SET team_id = ?, parent_club_id = NULL, next_match_return = 0 WHERE id = ?"
  ).bind(teamId, playerId).run();

  logger.info({ module: "u21", teamId, playerId }, "player promoted from U21");
  return { ok: true };
}
