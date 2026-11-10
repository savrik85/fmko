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

/**
 * Denní dobití předplacenky v korunách a cena jedné SMS.
 *
 * Kredit se ukazuje jako peníze, protože to je telefon, ne kvóta — „zbývá ti
 * 27 Kč" je věta, kterou člověk zná, „zbývá ti 9 odpovědí" ne. Pod tím je pořád
 * tentýž strop: 36 / 3 = dvanáct zpráv na herní den.
 *
 * S rozpočtem klubu to schválně nesouvisí. Je to brzda na spotřebu modelu, ne
 * ekonomika — jinak by si bohatý klub ukecal celou kvótu.
 */
export const DENNI_KREDIT = 36;
export const CENA_SMS = 3;

export interface CreditState {
  /** Zbývající kredit v korunách. */
  zbyva: number;
  /** Kolik se dobíjí každý herní den. */
  denni: number;
  /** Cena jedné odeslané SMS. */
  cenaSms: number;
  /** Kolik zpráv se z toho ještě dá poslat. */
  zprav: number;
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

  if (!row) return stav(0);

  const dnes = den(row.game_date);
  if (row.phone_credit_date === dnes && row.phone_credit != null) {
    return stav(row.phone_credit);
  }

  // Dobíjí se jen dopředu a jen jednou: podmínka na datum je přímo v zápisu, takže
  // souběžná čtení ani herní den posunutý zpět (oprava kalendáře) nedobijí podruhé.
  const refill = await db
    .prepare(
      `UPDATE teams SET phone_credit = ?, phone_credit_date = ?
        WHERE id = ? AND (phone_credit_date IS NULL OR phone_credit_date < ? OR phone_credit IS NULL)`,
    )
    .bind(DENNI_KREDIT, dnes, teamId, dnes)
    .run()
    .catch((e) => { logger.warn({ module: M }, `obnova kreditu ${teamId}`, e); return null; });
  if ((refill?.meta?.changes ?? 0) > 0) return stav(DENNI_KREDIT);

  // Nedobilo se: dobil to souběžný požadavek, nebo se den vrátil. Platí, co je v DB.
  const current = await db
    .prepare("SELECT phone_credit FROM teams WHERE id = ?")
    .bind(teamId)
    .first<{ phone_credit: number | null }>()
    .catch((e) => { logger.warn({ module: M }, `kredit po obnově ${teamId}`, e); return null; });
  return stav(current?.phone_credit ?? row.phone_credit ?? 0);
}

function stav(zbyva: number): CreditState {
  const kc = Math.max(0, zbyva);
  return { zbyva: kc, denni: DENNI_KREDIT, cenaSms: CENA_SMS, zprav: Math.floor(kc / CENA_SMS) };
}

/**
 * Strhne kredit, pokud je na co.
 *
 * Vrací `false`, když nezbývá — volající pak odpověď vůbec negeneruje.
 * Odečet je atomický (`WHERE phone_credit >= ?`), takže dvě zprávy odeslané
 * naráz nemůžou přečerpat.
 */
export async function spendCredit(db: D1Database, teamId: string, kolik = CENA_SMS): Promise<boolean> {
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

/**
 * Vrátí kredit za poslední SMS trenéra v konverzaci, na kterou odpověď definitivně
 * nepřijde (hráč odešel, odpověď spadla, hráč zrovna psal a zprávu už nezapočítal).
 * Dočasný výpadek modelu sem nepatří, tam se odpověď zkouší znovu.
 *
 * Každá zpráva se vrací nejvýš jednou: vratku si zabere značka v metadatech zprávy,
 * takže opakované pokusy o odpověď nevrátí kredit dvakrát. Nikdy nad denní dobití.
 */
export async function refundCoachSms(db: D1Database, teamId: string, convId: string, reason: string): Promise<boolean> {
  try {
    const claimed = await db.prepare(
      `UPDATE messages SET metadata = json_set(COALESCE(metadata, '{}'), '$.creditRefunded', 1)
        WHERE id = (SELECT id FROM messages WHERE conversation_id = ? AND sender_type = 'user'
                     ORDER BY julianday(sent_at) DESC LIMIT 1)
          AND json_extract(COALESCE(metadata, '{}'), '$.creditRefunded') IS NULL`,
    ).bind(convId).run();
    if ((claimed.meta?.changes ?? 0) !== 1) return false;
    await db.prepare("UPDATE teams SET phone_credit = MIN(?, COALESCE(phone_credit, 0) + ?) WHERE id = ?")
      .bind(DENNI_KREDIT, CENA_SMS, teamId).run();
    logger.info({ module: M, teamId }, `kredit za SMS vrácen (${reason}), konverzace ${convId}`);
    return true;
  } catch (e) {
    logger.warn({ module: M, teamId }, `vrácení kreditu (${reason}), konverzace ${convId}`, e);
    return false;
  }
}

/** Kredit slovem — do UI, ať se to nepočítá na dvou místech. */
export function creditWord(zbyva: number, denni: number): string {
  // Na jednu SMS to nestačí — z pohledu hráče je to došlý kredit, i když
  // na účtu zbyla koruna.
  if (zbyva < CENA_SMS) return "Kredit došel";
  if (zbyva <= Math.max(CENA_SMS, Math.floor(denni * 0.25))) return "Dochází kredit";
  return "Kredit v pořádku";
}
