/**
 * Kredit na telefonu — denní strop AI odpovědí.
 *
 * Trenér si může psát s kýmkoli z kádru i do kabiny, ale každá odpověď stojí
 * volání modelu. Tvrdý zákaz („dnes už si psát nemůžeš") by byl neprůhledný;
 * kredit je vidět dopředu a rozhodnutí, na koho ho utratit, je součást hry.
 *
 * Účtuje se JEN to, co spotřebuje model. Odpověď vůdci fanoušků je
 * deterministická, zpráva druhému trenérovi jde člověku — obojí je zdarma.
 */

import { logger } from "../lib/logger";

const M = "phone-credit";

/** Kolik odpovědí denně. Jeden odeslaný dotaz = jedna odpověď = jeden kredit. */
export const DENNI_KREDIT = 12;

export interface CreditState {
  zbyva: number;
  denni: number;
}

/** Herní den, podle kterého se kredit obnovuje. */
function den(gameDate: string | null): string {
  return (gameDate ?? new Date().toISOString()).slice(0, 10);
}

/**
 * Kolik kreditu týmu zbývá.
 *
 * Obnovuje se líně při prvním čtení v novém herním dni — nezávisle na denním
 * ticku. Kdyby to viselo na ticku, tým, kterému tick spadne, by zůstal bez
 * telefonu do dalšího dne.
 */
export async function loadCredit(db: D1Database, teamId: string): Promise<CreditState> {
  const row = await db
    .prepare("SELECT phone_credit, phone_credit_date, game_date FROM teams WHERE id = ?")
    .bind(teamId)
    .first<{ phone_credit: number | null; phone_credit_date: string | null; game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `načtení kreditu ${teamId}`, e); return null; });

  if (!row) return { zbyva: 0, denni: DENNI_KREDIT };

  const dnes = den(row.game_date);
  if (row.phone_credit_date === dnes && row.phone_credit != null) {
    return { zbyva: Math.max(0, row.phone_credit), denni: DENNI_KREDIT };
  }

  await db
    .prepare("UPDATE teams SET phone_credit = ?, phone_credit_date = ? WHERE id = ?")
    .bind(DENNI_KREDIT, dnes, teamId)
    .run()
    .catch((e) => { logger.warn({ module: M }, `obnova kreditu ${teamId}`, e); });

  return { zbyva: DENNI_KREDIT, denni: DENNI_KREDIT };
}

/**
 * Strhne kredit, pokud je na co.
 *
 * Vrací `false`, když nezbývá — volající pak odpověď vůbec negeneruje.
 * Odečet je atomický (`WHERE phone_credit >= ?`), takže dvě zprávy odeslané
 * naráz nemůžou přečerpat.
 */
export async function spendCredit(db: D1Database, teamId: string, kolik = 1): Promise<boolean> {
  if (kolik <= 0) return true;
  // Načtení nejdřív — zajistí obnovu na nový herní den, než se začne odečítat.
  const stav = await loadCredit(db, teamId);
  if (stav.zbyva < kolik) return false;

  const res = await db
    .prepare("UPDATE teams SET phone_credit = phone_credit - ? WHERE id = ? AND phone_credit >= ?")
    .bind(kolik, teamId, kolik)
    .run()
    .catch((e) => { logger.warn({ module: M }, `stržení kreditu ${teamId}`, e); return null; });

  return (res?.meta?.changes ?? 0) > 0;
}

/** Kredit slovem — do UI, ať se to nepočítá na dvou místech. */
export function creditWord(zbyva: number, denni: number): string {
  if (zbyva <= 0) return "Kredit došel";
  if (zbyva <= Math.max(1, Math.floor(denni * 0.25))) return "Dochází kredit";
  return "Kredit v pořádku";
}
