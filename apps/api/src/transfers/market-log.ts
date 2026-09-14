/**
 * Záznam o tom, kdo se objevil na trhu a odkud přišel.
 *
 * Vznik hráče se nikde nezapisoval. Řádek ve `free_agents` po podpisu nebo
 * vypršení zmizí, takže zpětně nešlo zjistit, kolik lidí hra vytvořila.
 * Počítat to z toho, co v poolu zbylo, nefunguje: v okrese s hodně manažery
 * se hráči podepíšou dřív, než se na ně někdo podívá, a vyjde z toho nula.
 *
 * Zapisuje se u zdroje, na všech třech místech, kde řádek ve `free_agents`
 * vzniká. Selhání zápisu nesmí shodit to, kvůli čemu se to dělá, takže se
 * chyba jen zaloguje.
 */

import { logger } from "../lib/logger";

const M = "market-log";

/** Odkud se hráč na trhu vzal. */
export type PuvodNaTrhu = "generated" | "celebrity" | "released";

/**
 * Zapíše vstup na trh.
 *
 * `teamId` dává smysl jen u propuštěných; u toho, co vytvořila hra, je null.
 * `fromHuman` se dopočítá z týmu, ať volající nemusí vědět, kdo je AI.
 */
export async function zapisNaTrh(
  db: D1Database,
  zaznam: { district: string | null; origin: PuvodNaTrhu; teamId?: string | null; gameDate?: string | null },
): Promise<void> {
  let odCloveka = 0;
  if (zaznam.teamId) {
    const t = await db.prepare("SELECT user_id FROM teams WHERE id = ?")
      .bind(zaznam.teamId).first<{ user_id: string | null }>()
      .catch((e) => { logger.warn({ module: M }, "typ klubu", e); return null; });
    odCloveka = t && t.user_id && t.user_id !== "ai" ? 1 : 0;
  }

  await db.prepare(
    `INSERT INTO market_log (id, district, origin, team_id, from_human, game_date)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(), zaznam.district ?? null, zaznam.origin,
    zaznam.teamId ?? null, odCloveka, zaznam.gameDate ?? null,
  ).run().catch((e) => { logger.warn({ module: M }, "zápis vstupu na trh", e); });
}

export interface RadekPrehledu {
  den: string;
  district: string | null;
  /** Nové tělo, které vytvořila hra. */
  vytvorila_hra: number;
  /** Hráč, co už existoval a pustil ho klub se živým trenérem. */
  od_manazeru: number;
  /** Totéž, ale od AI klubu. */
  od_ai: number;
}

/** Přehled po dnech a okresech. Poslední `dnu` dní. */
export async function prehledTrhu(db: D1Database, dnu: number): Promise<RadekPrehledu[]> {
  const rows = await db.prepare(
    `SELECT date(created_at) AS den, district,
            SUM(CASE WHEN origin IN ('generated','celebrity') THEN 1 ELSE 0 END) AS vytvorila_hra,
            SUM(CASE WHEN origin = 'released' AND from_human = 1 THEN 1 ELSE 0 END) AS od_manazeru,
            SUM(CASE WHEN origin = 'released' AND from_human = 0 THEN 1 ELSE 0 END) AS od_ai
       FROM market_log
      WHERE created_at >= date('now', ?)
      GROUP BY date(created_at), district
      ORDER BY den DESC, district`,
  ).bind(`-${Math.max(1, Math.min(90, dnu))} day`)
    .all<RadekPrehledu>()
    .catch((e) => { logger.warn({ module: M }, "přehled trhu", e); return { results: [] as RadekPrehledu[] }; });
  return rows.results ?? [];
}
