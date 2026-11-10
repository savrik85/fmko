/**
 * Pojistka proti dvojímu zpracování úlohy AI trenéra.
 *
 * Fronty doručují „aspoň jednou“: týdenní správa nebo nákup by bez nároku mohly proběhnout
 * dvakrát (dvakrát stržené peníze). Nárok je řádek (tým, úloha, den) v `ai_coach_claims`.
 *
 * Nárok se bere před provedením a při chybě ho uvolní `catch`. Když ale worker skončí natvrdo
 * (limit času, restart), `catch` neproběhne a nárok by zůstal navždy: nabídka by nikdy
 * nedostala odpověď. Úlohy, kterým to vadí (odpověď na nabídku, hodinová práce), proto berou
 * nárok s časem (`staleAfterMs`) a po dokončení ho označí (`completeCoachTask`, sloupec
 * `done_at`, migrace 0299). Nedokončený nárok starší než 30 minut smí převzít další běh.
 * Bez sloupce `done_at` (kód nasazený před migrací) se nic nepřebírá a platí původní chování.
 */

import { logger } from "../lib/logger";

const M = "ai-coach-claims";

/** Po jak dlouhé době se nedokončený nárok bere jako zaseknutý (běh ve frontě má strop 15 minut). */
export const STALE_CLAIM_MS = 30 * 60_000;

export interface ClaimOptions {
  /** Nedokončený nárok starší než tolik ms (reálný čas) smí převzít tento běh. Bez toho se nepřebírá nic. */
  staleAfterMs?: number;
}

export async function claimCoachTask(db: D1Database, teamId: string, task: string, day: string, opts: ClaimOptions = {}): Promise<boolean> {
  const res = await db.prepare("INSERT OR IGNORE INTO ai_coach_claims (team_id, task, day) VALUES (?, ?, ?)")
    .bind(teamId, task, day).run()
    .catch((e) => {
      logger.error({ module: M }, `nárok na úlohu ${task} týmu ${teamId} (${day})`, e);
      return null;
    });
  if ((res?.meta?.changes ?? 0) > 0) return true;
  if (!res || !opts.staleAfterMs || opts.staleAfterMs <= 0) return false;

  // Nárok už existuje. Když ho nikdo nedokončil a je starý, běh, který ho vzal, už nežije: převzít.
  // Zápis je podmíněný, takže ze dvou souběžných běhů převezme jen jeden.
  const seconds = Math.max(1, Math.round(opts.staleAfterMs / 1000));
  const taken = await db.prepare(
    `UPDATE ai_coach_claims SET claimed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE team_id = ? AND task = ? AND day = ? AND done_at IS NULL
        AND julianday(claimed_at) <= julianday('now', ?)`,
  ).bind(teamId, task, day, `-${seconds} seconds`).run()
    .catch((e) => {
      logger.warn({ module: M }, `převzetí zaseknutého nároku ${task} týmu ${teamId} (${day})`, e);
      return null;
    });
  if ((taken?.meta?.changes ?? 0) === 0) return false;
  logger.warn({ module: M, teamId }, `nárok ${task} (${day}) zůstal viset déle než ${Math.round(seconds / 60)} minut, přebírá ho další běh`);
  return true;
}

/** Označí nárok za dokončený: zaseknutý nárok už ho nikdo nepřevezme. */
export async function completeCoachTask(db: D1Database, teamId: string, task: string, day: string): Promise<void> {
  await db.prepare("UPDATE ai_coach_claims SET done_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE team_id = ? AND task = ? AND day = ?")
    .bind(teamId, task, day).run()
    .catch((e) => logger.warn({ module: M }, `dokončení nároku ${task} týmu ${teamId}`, e));
}

/** Uvolní nárok, když úloha spadla dřív, než cokoli provedla (aby ji šlo zopakovat). */
export async function releaseCoachTask(db: D1Database, teamId: string, task: string, day: string): Promise<void> {
  await db.prepare("DELETE FROM ai_coach_claims WHERE team_id = ? AND task = ? AND day = ?")
    .bind(teamId, task, day).run()
    .catch((e) => logger.warn({ module: M }, `uvolnění nároku ${task} týmu ${teamId}`, e));
}
