/**
 * Pohárové kolo přes frontu.
 *
 * Dřív se pohár hrál přímo v cronu: až tři dávky po dvanácti zápasech plným enginem
 * v jedné invokaci. Zápas plným enginem trvá přes minutu, takže kolo, kde je v každém
 * zápase skutečný klub, se do patnáctiminutového limitu nevešlo. Spadlá invokace nechala
 * zápas zabraný a po propadnutí záboru se odehrál znovu.
 *
 * Teď cron jen pošle zprávy. Každá zpráva odehraje malou dávku ve vlastní invokaci a když
 * v kole ještě něco zbývá, pošle další zprávu. Souběh je bezpečný: zápas si každá invokace
 * zabírá atomicky a kolo uzavře jen jedna (viz simulateCupRound).
 */

import type { Bindings } from "../index";
import type { MatchQueueMessage } from "../queue/messages";
import { logger } from "../lib/logger";

const M = "cup-queue";

/** Kolik zápasů plným enginem odehraje jedna zpráva. */
export const CUP_QUEUE_FULL_ENGINE_BUDGET = 5;
/** Kolik řetězů zpráv běží vedle sebe. Dva: kolo je hotové za půl hodiny a instance to unese. */
export const CUP_QUEUE_CHAINS = 2;
/** Po kolika článcích se řetěz zastaví, ať se vadný zápas netočí donekonečna. Další tick ho pustí znovu. */
export const CUP_QUEUE_MAX_HOPS = 24;
/** Čas na dávku. Invokace konzumera smí 15 minut; nový zápas se po této době nezačne. */
const CHUNK_TIME_BUDGET_MS = 9 * 60_000;
/** Když dávka nic neodehrála (vše drží jiná invokace), další zkus až za chvíli. */
const IDLE_RETRY_SECONDS = 120;

export interface DueCupRound {
  cupId: string;
  round: number;
  /** Neodehrané zápasy kola, jehož termín už nastal. */
  remaining: number;
  /** Z toho zápasy se skutečným klubem (plný engine). */
  watched: number;
}

/** Aktuální kolo aktivního poháru, pokud už má nadejít a ještě v něm zbývají zápasy. */
export async function dueCupRound(db: D1Database): Promise<DueCupRound | null> {
  const row = await db.prepare(
    `SELECT c.id AS cup_id, c.current_round AS round,
            COUNT(*) AS remaining,
            SUM(CASE WHEN h.team_id IS NOT NULL OR a.team_id IS NOT NULL THEN 1 ELSE 0 END) AS watched,
            MIN(m.scheduled_at) AS first_at
       FROM cup_competitions c
       JOIN cup_matches m ON m.cup_id = c.id AND m.round = c.current_round AND m.status = 'scheduled'
       LEFT JOIN cup_teams h ON h.id = m.home_cup_team_id
       LEFT JOIN cup_teams a ON a.id = m.away_cup_team_id
      WHERE c.status = 'active'
        AND c.season_number = (SELECT MAX(number) FROM seasons WHERE status = 'active')
      GROUP BY c.id, c.current_round`,
  ).first<{ cup_id: string; round: number; remaining: number; watched: number | null; first_at: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "načtení kola poháru", e); return null; });
  if (!row?.cup_id || !row.first_at) return null;
  const gd = await db.prepare("SELECT MAX(game_date) AS d FROM teams WHERE game_date IS NOT NULL").first<{ d: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "herní datum", e); return null; });
  if (!gd?.d || row.first_at > gd.d) return null;
  return { cupId: row.cup_id, round: row.round, remaining: row.remaining, watched: row.watched ?? 0 };
}

function cupMessage(hop: number): MatchQueueMessage {
  return { kind: "cup_round", hop, enqueuedAt: new Date().toISOString() };
}

/**
 * Pohárový tick v režimu fronty. Vrací počet poslaných zpráv; 0 = kolo nemá zápasy
 * se skutečným klubem (nebo není co hrát) a volající ho smí odehrát rovnou.
 */
export async function enqueueCupTick(env: Bindings): Promise<number> {
  const queue = env.MATCH_QUEUE;
  if (!queue) return 0;
  const due = await dueCupRound(env.DB);
  if (!due || due.watched === 0) return 0;
  const chains = Math.min(CUP_QUEUE_CHAINS, Math.ceil(due.watched / CUP_QUEUE_FULL_ENGINE_BUDGET));
  let sent = 0;
  for (let i = 0; i < chains; i++) {
    try {
      // Druhý řetěz o půl minuty později, ať oba nezačnou stejným zápasem.
      await queue.send(cupMessage(0), i > 0 ? { delaySeconds: 30 * i } : undefined);
      sent++;
    } catch (e) {
      logger.error({ module: M }, "zařazení pohárové dávky selhalo", e);
    }
  }
  logger.info({ module: M }, `pohár, ${due.round}. kolo: ${due.remaining} zápasů čeká, zařazeno ${sent} řetězů`);
  return sent;
}

export interface CupChunkResult {
  status: "done" | "idle" | "no-round";
  played: number;
  remaining: number;
}

/** Jedna zpráva fronty: odehraje dávku a když v kole něco zbývá, pošle další. */
export async function processCupChunk(env: Bindings, hop: number): Promise<CupChunkResult> {
  const before = await dueCupRound(env.DB);
  if (!before) return { status: "no-round", played: 0, remaining: 0 };

  const { maybeAdvanceCup } = await import("./cup");
  await maybeAdvanceCup(env.DB, env, {
    maxChunks: 1,
    fullEngineBudget: CUP_QUEUE_FULL_ENGINE_BUDGET,
    deadlineMs: Date.now() + CHUNK_TIME_BUDGET_MS,
  });

  const after = await dueCupRound(env.DB);
  // Kolo se mohlo uzavřít a další má termín až jindy: pak after === null.
  const sameRound = !!after && after.cupId === before.cupId && after.round === before.round;
  const remaining = sameRound ? after!.remaining : 0;
  const played = sameRound ? Math.max(0, before.remaining - after!.remaining) : before.remaining;

  if (after && after.remaining > 0) {
    if (hop + 1 >= CUP_QUEUE_MAX_HOPS) {
      logger.error({ module: M }, `pohár: řetěz dávek skončil po ${hop + 1} článcích a ${after.remaining} zápasů zbývá, dohraje je další tick`);
    } else if (env.MATCH_QUEUE) {
      await env.MATCH_QUEUE.send(cupMessage(hop + 1), played === 0 ? { delaySeconds: IDLE_RETRY_SECONDS } : undefined)
        .catch((e) => logger.error({ module: M }, "zařazení další pohárové dávky selhalo", e));
    }
  }
  return { status: played > 0 ? "done" : "idle", played, remaining };
}
