/**
 * Registrační lhůta: hráče, kterého klub získal za pár stovek, nejde hned prodat.
 *
 * Volný hráč stojí 500 Kč a stejně tak tip z hospody, od kamaráda nebo doporučení.
 * Nic nebránilo ho druhý den prodat: na produ od 15. 8. 18 takových hráčů prodaných
 * za 287 tis. Kč, 14 z nich do 14 dnů, hráči z hospody průměrně po 1,8 dne.
 *
 * Lhůta platí pro prodej, výměnu i hostování (i poplatek za hostování je výdělek).
 * Hráčů koupených přestupem ani původního kádru se netýká.
 */

import { logger } from "../lib/logger";

const M = "registration-window";

/** Kolik dní po příchodu nejde levně získaného hráče prodat ani vyměnit. */
export const REGISTRATION_DAYS = 14;

/**
 * Příchody za pár stovek (`player_contracts.join_type`). Tip na mladého hráče se zapisuje
 * jako `youth`, stejně jako odchovanec z akademie: rozlišit je nejde, takže lhůtu má i čerstvý
 * odchovanec (ten se stejně hned neprodává).
 */
export const CHEAP_JOIN_TYPES = ["free_agent", "pub", "friend", "recommendation", "youth"] as const;

const CHEAP_IN = CHEAP_JOIN_TYPES.map((t) => `'${t}'`).join(", ");

const czechDay = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", timeZone: "Europe/Prague" });

/** Do kdy hráč v lhůtě je (ISO), nebo null, když už se smí prodat. */
export async function registrationLockedUntil(db: D1Database, playerId: string, now: Date = new Date()): Promise<string | null> {
  const row = await db.prepare(
    `SELECT strftime('%Y-%m-%dT%H:%M:%SZ', joined_at, '+${REGISTRATION_DAYS} days') AS until FROM player_contracts
      WHERE player_id = ? AND is_active = 1 AND join_type IN (${CHEAP_IN})
        AND julianday(joined_at) + ${REGISTRATION_DAYS} > julianday(?)
      ORDER BY joined_at DESC LIMIT 1`,
  ).bind(playerId, now.toISOString()).first<{ until: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `lhůta hráče ${playerId}`, e); return null; });
  return row?.until ?? null;
}

/** Text pro hráče: kdo a od kdy půjde prodat. */
export function registrationLockMessage(playerName: string | null, until: string): string {
  const who = playerName?.trim() || "Hráč";
  return `${who} je v klubu teprve krátce. Prodat, vyměnit nebo půjčit ho půjde od ${czechDay.format(new Date(until))}`;
}

/** Chyba pro prvního hráče v lhůtě, nebo null. */
export async function registrationLockError(db: D1Database, playerIds: string[], now: Date = new Date()): Promise<string | null> {
  for (const id of playerIds) {
    const until = await registrationLockedUntil(db, id, now);
    if (!until) continue;
    const p = await db.prepare("SELECT first_name, last_name FROM players WHERE id = ?").bind(id)
      .first<{ first_name: string | null; last_name: string | null }>()
      .catch((e) => { logger.warn({ module: M }, `jméno hráče ${id}`, e); return null; });
    const name = p ? `${p.first_name ?? ""} ${p.last_name ?? ""}` : null;
    return registrationLockMessage(name, until);
  }
  return null;
}
