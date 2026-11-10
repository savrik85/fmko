/**
 * Věk pro áčko: za muže smí hráč až od `SENIOR_MIN_AGE` let (FAČR). Dřív to hlídal jen
 * přesun z U21 do áčka; přestupem, hostováním, výměnou nebo podpisem volného hráče se mladší
 * kluk do áčka dostal bez kontroly. Tahle funkce je jediné místo, které rozhoduje, na jakou
 * soupisku klubu příchozí hráč půjde: mladší jde do U21, a když ji klub nemá, nejde nikam.
 */

import { SENIOR_MIN_AGE } from "../academy/rules";

export type SeniorPlacement =
  | { ok: true; teamId: string; squad: "senior" | "u21" }
  | { ok: false; error: string };

/** Smí hráč tohohle věku na soupisku mužů? */
export function isSeniorAge(age: number): boolean {
  return age >= SENIOR_MIN_AGE;
}

/** Hláška pro klub bez U21, který bere hráče mladšího než `SENIOR_MIN_AGE`. */
export function tooYoungForSeniorError(playerName?: string | null): string {
  const who = playerName ? `${playerName} je na muže moc mladý` : "Hráč je na muže moc mladý";
  return `${who}: za muže se smí až od ${SENIOR_MIN_AGE} let a klub nemá dorost, kam by šel.`;
}

/**
 * Soupiska klubu `clubTeamId` (áčko) pro hráče, který má jít do áčka. Od `SENIOR_MIN_AGE`
 * let áčko, mladší U21 klubu; bez U21 chyba.
 */
export async function placeInSeniorSquad(
  db: D1Database, clubTeamId: string, age: number, playerName?: string | null,
): Promise<SeniorPlacement> {
  if (isSeniorAge(age)) return { ok: true, teamId: clubTeamId, squad: "senior" };
  const u21 = await db.prepare("SELECT id FROM teams WHERE parent_team_id = ? AND team_type = 'u21'")
    .bind(clubTeamId).first<{ id: string }>();
  if (!u21) return { ok: false, error: tooYoungForSeniorError(playerName) };
  return { ok: true, teamId: u21.id, squad: "u21" };
}
