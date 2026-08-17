/**
 * Konzumer front.
 *
 * Jedna zpráva = jedna invokace = vlastní čerstvý rozpočet CPU, subrequestů a paměti.
 * Proto je zátěž na ligu konstantní bez ohledu na to, kolik lig hra má.
 *
 * Zprávy se potvrzují/vrací JEDNOTLIVĚ (ack/retry), aby jedna vadná zpráva
 * nestáhla s sebou zbytek dávky.
 */

import type { Bindings } from "../index";
import type { MatchQueueMessage, ReportQueueMessage } from "./messages";
import { processLeagueRound, processLeagueMaintenance } from "../season/league-round";
import { logger } from "../lib/logger";

type AnyQueueMessage = MatchQueueMessage | ReportQueueMessage;

export async function handleQueueBatch(
  batch: MessageBatch<AnyQueueMessage>,
  env: Bindings,
  _ctx: ExecutionContext,
): Promise<void> {
  logger.info({ module: "queue-consumer" }, `dávka z ${batch.queue}: ${batch.messages.length} zpráv`);

  for (const message of batch.messages) {
    const body = message.body;
    const startedAt = Date.now();
    const lagMs = body?.enqueuedAt ? startedAt - Date.parse(body.enqueuedAt) : null;
    try {
      const outcome = await handleMessage(body, env);
      await recordRun(env, body, message.attempts, lagMs, Date.now() - startedAt, outcome);
      message.ack();
    } catch (e) {
      // retry() vrátí JEN tuhle zprávu; po vyčerpání max_retries spadne do DLQ.
      logger.error({ module: "queue-consumer" }, `zpráva ${body?.kind ?? "?"} selhala (pokus ${message.attempts})`, e);
      await recordRun(env, body, message.attempts, lagMs, Date.now() - startedAt, { status: "error" });
      message.retry();
    }
  }
}

interface RunOutcome {
  status: string;
  matches?: number;
  queries?: number;
}

/**
 * Zapíše měření běhu. Selhání zápisu NESMÍ shodit zpracování — je to jen telemetrie,
 * proto se chyba loguje a jde se dál.
 */
async function recordRun(
  env: Bindings,
  body: AnyQueueMessage,
  attempts: number,
  lagMs: number | null,
  durationMs: number,
  outcome: RunOutcome,
): Promise<void> {
  const leagueId = body && "leagueId" in body ? (body as { leagueId?: string }).leagueId ?? null : null;
  await env.DB.prepare(
    "INSERT INTO queue_runs (id, kind, league_id, status, matches, queries, duration_ms, attempts, lag_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
  )
    .bind(
      crypto.randomUUID(),
      body?.kind ?? "unknown",
      leagueId,
      outcome.status,
      outcome.matches ?? null,
      outcome.queries ?? null,
      durationMs,
      attempts,
      lagMs,
    )
    .run()
    .catch((e) => logger.warn({ module: "queue-consumer" }, "zápis queue_runs selhal", e));
}

async function handleMessage(body: AnyQueueMessage, env: Bindings): Promise<RunOutcome> {
  switch (body.kind) {
    // ── zápasová fronta ──
    case "league_round": {
      const result = await processLeagueRound(env, body.leagueId, {
        expectedGameDate: body.gameDate,
        reportsQueue: env.REPORTS_QUEUE,
      });
      logger.info(
        { module: "queue-consumer" },
        `league_round ${body.leagueId}: ${result.status}, ${result.matches} zápasů, ${result.queries} dotazů, ${result.durationMs} ms`,
      );
      return { status: result.status, matches: result.matches, queries: result.queries };
    }

    case "league_maintenance": {
      const result = await processLeagueMaintenance(env, body.leagueId);
      logger.info(
        { module: "queue-consumer" },
        `league_maintenance ${body.leagueId}: celebrity=${result.celebritySpawned} listings=${result.listings}, ${result.queries} dotazů, ${result.durationMs} ms`,
      );
      return { status: "done", queries: result.queries };
    }

    case "league_day": {
      const { processLeagueDay } = await import("../season/team-day");
      const result = await processLeagueDay(env, body.leagueId, body.gameDate);
      logger.info(
        { module: "queue-consumer" },
        `league_day ${body.leagueId}: ${result.teams} týmů zpracováno, ${result.skipped} přeskočeno, ${result.durationMs} ms`,
      );
      return { status: result.teams > 0 ? "done" : "skipped", matches: result.teams };
    }

    // ── fronta článků ──
    case "round_report": {
      if (!env.GEMINI_API_KEY) {
        logger.warn({ module: "queue-consumer" }, "round_report bez GEMINI_API_KEY — přeskočeno");
        return { status: "skipped" };
      }
      const { generateAiRoundReport } = await import("../news/ai-reporter");
      await generateAiRoundReport(
        env.DB,
        env.GEMINI_API_KEY,
        body.leagueId,
        body.calendarId,
        body.gameWeek,
        body.standingsBefore as never,
      );
      return { status: "done" };
    }

    case "ultras_report": {
      if (!env.GEMINI_API_KEY) {
        logger.warn({ module: "queue-consumer" }, "ultras_report bez GEMINI_API_KEY — přeskočeno");
        return { status: "skipped" };
      }
      const { generateUltrasReport } = await import("../news/ultras-report");
      await generateUltrasReport(env.DB, env.GEMINI_API_KEY, body.calendarId);
      return { status: "done" };
    }

    case "matchday_preview": {
      if (!env.GEMINI_API_KEY) {
        logger.warn({ module: "queue-consumer" }, "matchday_preview bez GEMINI_API_KEY — přeskočeno");
        return { status: "skipped" };
      }
      const { generateMatchdayPreview } = await import("../news/matchday-preview");
      await generateMatchdayPreview(env.DB, env.GEMINI_API_KEY, body.leagueId, body.calendarId);
      return { status: "done" };
    }

    default: {
      // Neznámý typ zprávy — ack, ne retry. Retry by ji jen posílal dokola.
      const unknown = body as { kind?: string };
      logger.error({ module: "queue-consumer" }, `neznámý typ zprávy: ${unknown?.kind ?? "undefined"}`);
      return { status: "unknown" };
    }
  }
}

/**
 * Konzumer dead-letter fronty. Zpráva, která opakovaně selhala, se tu jen zaloguje
 * a zapíše do tabulky, aby nezmizela potichu.
 */
export async function handleDeadLetterBatch(
  batch: MessageBatch<AnyQueueMessage>,
  env: Bindings,
): Promise<void> {
  for (const message of batch.messages) {
    const body = message.body;
    const leagueId = "leagueId" in (body ?? {}) ? (body as { leagueId?: string }).leagueId ?? null : null;
    logger.error(
      { module: "queue-dlq" },
      `DLQ: zpráva ${body?.kind ?? "?"} (liga ${leagueId ?? "?"}) selhala po ${message.attempts} pokusech`,
    );
    await env.DB.prepare(
      "INSERT INTO queue_failures (id, queue_name, message_kind, league_id, attempts, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
    )
      .bind(crypto.randomUUID(), batch.queue, body?.kind ?? "unknown", leagueId, message.attempts, JSON.stringify(body).slice(0, 4000))
      .run()
      .catch((e) => logger.error({ module: "queue-dlq" }, "zápis do queue_failures selhal", e));
    message.ack();
  }
}
