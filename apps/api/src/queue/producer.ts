/**
 * Producent zpráv pro zápasový tick.
 *
 * Cron už nic nezpracovává — jen zjistí, co je potřeba udělat, a rozešle zprávy.
 * Je to pár D1 dotazů, takže doběhne nezávisle na počtu lig.
 */

import type { Bindings } from "../index";
import type { MatchQueueMessage, ReportQueueMessage } from "./messages";
import { findLeaguesWithDueRound } from "../season/league-round";
import { logger } from "../lib/logger";

/** sendBatch bere najednou nejvýš 100 zpráv. */
const MAX_BATCH = 100;

async function sendChunked<T>(queue: Queue<T>, bodies: T[], label: string): Promise<number> {
  let sent = 0;
  for (let i = 0; i < bodies.length; i += MAX_BATCH) {
    const chunk = bodies.slice(i, i + MAX_BATCH).map((body) => ({ body }));
    try {
      await queue.sendBatch(chunk);
      sent += chunk.length;
    } catch (e) {
      logger.error({ module: "queue-producer" }, `sendBatch ${label} selhal (${chunk.length} zpráv)`, e);
    }
  }
  return sent;
}

export interface EnqueueResult {
  rounds: number;
  maintenance: number;
  leagues: string[];
}

/**
 * Zařadí zápasový tick: jedna zpráva na ligu se splatným kolem + jedna údržbová
 * zpráva na každou ligu s lidským týmem.
 */
export async function enqueueMatchTick(env: Bindings): Promise<EnqueueResult> {
  const queue = env.MATCH_QUEUE;
  if (!queue) {
    logger.error({ module: "queue-producer" }, "MATCH_QUEUE binding chybí — nic nezařazeno");
    return { rounds: 0, maintenance: 0, leagues: [] };
  }

  const enqueuedAt = new Date().toISOString();
  const due = await findLeaguesWithDueRound(env.DB);

  const roundMessages: MatchQueueMessage[] = due.map((d) => ({
    kind: "league_round",
    leagueId: d.leagueId,
    gameDate: d.gameDate,
    enqueuedAt,
  }));
  const rounds = await sendChunked(queue, roundMessages, "league_round");

  // Údržba (celebrity, AI inzeráty) běží pro ligy s lidským týmem nezávisle na tom,
  // jestli se dnes hraje — stejně jako to dělaly původní globální smyčky v index.ts.
  const humanLeagues = await env.DB.prepare(
    "SELECT DISTINCT t.league_id AS league_id, MAX(t.game_date) AS game_date FROM teams t WHERE t.user_id != 'ai' AND t.league_id IS NOT NULL GROUP BY t.league_id",
  )
    .all<{ league_id: string; game_date: string | null }>()
    .catch((e) => {
      logger.error({ module: "queue-producer" }, "fetch human leagues failed", e);
      return { results: [] as Array<{ league_id: string; game_date: string | null }> };
    });

  const maintenanceMessages: MatchQueueMessage[] = humanLeagues.results.map((r) => ({
    kind: "league_maintenance",
    leagueId: r.league_id,
    gameDate: r.game_date ?? "",
    enqueuedAt,
  }));
  const maintenance = await sendChunked(queue, maintenanceMessages, "league_maintenance");

  logger.info(
    { module: "queue-producer" },
    `zápasový tick zařazen: ${rounds} kol, ${maintenance} údržeb (${due.length} lig se splatným kolem)`,
  );
  return { rounds, maintenance, leagues: due.map((d) => d.leagueId) };
}

/**
 * Zařadí předzápasové články (matchday preview) — dřív sériová smyčka s jedním
 * voláním Gemini na ligu v jedné invokaci (index.ts).
 */
export async function enqueueMatchdayPreviews(env: Bindings): Promise<number> {
  const queue = env.REPORTS_QUEUE;
  if (!queue) {
    logger.error({ module: "queue-producer" }, "REPORTS_QUEUE binding chybí — preview nezařazeno");
    return 0;
  }
  if (!env.GEMINI_API_KEY) {
    logger.warn({ module: "queue-producer" }, "skip matchday preview — no GEMINI_API_KEY");
    return 0;
  }

  const enqueuedAt = new Date().toISOString();
  const leagues = await env.DB.prepare(
    "SELECT DISTINCT t.league_id, t.game_date FROM teams t WHERE t.league_id IS NOT NULL AND t.game_date IS NOT NULL AND t.user_id != 'ai'",
  ).all<{ league_id: string; game_date: string }>();

  const messages: ReportQueueMessage[] = [];
  for (const lg of leagues.results) {
    if (!lg.league_id || !lg.game_date) continue;
    const gd = new Date(lg.game_date);
    const dayStart = new Date(gd);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(gd);
    dayEnd.setUTCHours(23, 59, 59, 999);
    const todayCal = await env.DB.prepare(
      "SELECT id FROM season_calendar WHERE league_id = ? AND status = 'scheduled' AND scheduled_at BETWEEN ? AND ? LIMIT 1",
    )
      .bind(lg.league_id, dayStart.toISOString(), dayEnd.toISOString())
      .first<{ id: string }>()
      .catch((e) => {
        logger.warn({ module: "queue-producer" }, `preview cal lookup ${lg.league_id}`, e);
        return null;
      });
    if (!todayCal) continue;
    messages.push({ kind: "matchday_preview", leagueId: lg.league_id, calendarId: todayCal.id, enqueuedAt });
  }

  const sent = await sendChunked(queue, messages, "matchday_preview");
  logger.info({ module: "queue-producer" }, `matchday preview zařazeno: ${sent} článků`);
  return sent;
}
