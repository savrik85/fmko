/**
 * Zpráva od hráče kvůli tomu, co se ve hře právě stalo: trenér odmítl nabídku, dal mu
 * trest, uzavřel s ním dohodu. Dřív na to chodily předem napsané věty bez paměti: „Trenére,
 * slyšel jsem o té nabídce. Dobře, že jste ji poslal k šípku.“ dostal jeden trenér pětkrát,
 * „Zaplatím to. Zasloužil jsem si to.“ přišlo pět minut po hráčově „Seru na to!“ (prod 9–11/2026).
 *
 * Teď text píše model: zná fakta z hry (co přesně se stalo, `instruction`), povahu hráče,
 * vztah k trenérovi a posledních pár zpráv konverzace, takže navazuje a neopakuje se
 * (repetition.ts). Když model nejede nebo vrátí nepoužitelný text, pošle se předem napsaná
 * varianta, kterou hráč ještě neposlal (`sendPlayerTemplateSMS`).
 *
 * Posílá se ve `waitUntil` (~30 s), proto časový rozpočet (lib/time-budget.ts): text od
 * modelu musí být hotový do `deadline`, jinak jde rovnou předem napsaná varianta. Dřív
 * mohlo druhé volání modelu (přegenerování kvůli opakování) skončit až po limitu a worker
 * ho uřízl i se zprávou: hráč nenapsal nic.
 */

import { logger } from "../lib/logger";
import { beforeDeadline, deadlineIn } from "../lib/time-budget";
import type { ChatEnv, TeamContext, ThreadMessage } from "./ai-player-chat";
import type { PlayerSnapshot } from "./ai-player-scenarios";
import { historyBody } from "./player-photo";
import { type PlayerSmsSender, sendPlayerSmsToConversation, sendPlayerTemplateSMS } from "./system-sms";

const M = "event-sms";

/** Kolik posledních zpráv konverzace model vidí. */
export const EVENT_HISTORY_LIMIT = 8;

export interface EventSmsContext {
  player: PlayerSnapshot;
  team: TeamContext;
  history: ThreadMessage[];
}

/** Posledních `limit` zpráv trenéra a hráče, nejstarší první. */
export async function loadConversationHistory(db: D1Database, convId: string, limit = EVENT_HISTORY_LIMIT): Promise<ThreadMessage[]> {
  const rows = await db.prepare(
    `SELECT * FROM (
       SELECT sender_type, body, sent_at, json_extract(metadata, '$.photoAlt') AS photo_alt, json_extract(metadata, '$.drunk') AS drunk
         FROM messages WHERE conversation_id = ? AND sender_type IN ('player', 'user')
        ORDER BY julianday(sent_at) DESC, rowid DESC LIMIT ?
     ) ORDER BY julianday(sent_at) ASC`,
  ).bind(convId, limit).all<{ sender_type: string; body: string; photo_alt: string | null; drunk: number | null }>()
    .catch((e) => { logger.warn({ module: M }, `historie konverzace ${convId}`, e); return { results: [] as never[] }; });
  return rows.results.map((m) => ({
    sender: m.sender_type === "player" ? "player" : "coach",
    body: historyBody(m.body, m.photo_alt, m.drunk === 1),
  }));
}

/**
 * Hráč, klub a historie pro model: stejné znalosti jako v chatu (incidenty, životní situace,
 * sliby, nabídky, co se doslechl, vlastní poslední věty). Null, když hráč neexistuje.
 */
export async function loadEventSmsContext(
  db: D1Database, o: { clubTeamId: string; playerId: string; convId: string },
): Promise<EventSmsContext | null> {
  const spawn = await import("./ai-player-spawn");
  const row = await db.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.nationality, p.age, p.position, p.team_id, p.loan_from_team_id,
            p.personality, p.life_context, p.coach_relationship, p.is_celebrity, ${spawn.INJURY_COLUMN}
       FROM players p WHERE p.id = ?`,
  ).bind(o.playerId).first<Record<string, unknown>>();
  if (!row) return null;
  const playerTeamId = (row.team_id as string | null) ?? o.clubTeamId;
  const player = spawn.loadPlayerSnapshot(row, await spawn.loadLastMatchContext(db, playerTeamId));
  const [{ nactiZnalostiHrace }, { loadRecentLifeEvent }, { nazevSituace }, { loadChatMemory }, { loadOwnRecentLines }] = await Promise.all([
    import("../incidents/znalosti-db"), import("../incidents/life-news"), import("../incidents/situace"),
    import("./player-memory"), import("./repetition"),
  ]);
  player.znalostiIncidentu = await nactiZnalostiHrace(db, { teamId: o.clubTeamId, playerId: player.id });
  const situation = (await spawn.nactiSituaceTymu(db, o.clubTeamId)).get(player.id);
  player.zivotniSituace = situation ? { kind: situation, label: nazevSituace(situation) } : undefined;
  player.recentLifeEvent = await loadRecentLifeEvent(db, o.clubTeamId, player.id);
  player.lastOwnMessageAt = await spawn.loadLastOwnMessageAt(db, o.convId, player.id);
  player.ownRecentLines = await loadOwnRecentLines(db, { playerId: player.id, convId: o.convId });
  // Píše kvůli vážné věci: odpoví hned a nesliboval by „ozvu se pak“.
  player.seriousTopic = true;
  await loadChatMemory(db, player, { teamId: o.clubTeamId, convId: o.convId });
  const team = await spawn.loadTeamContext(db, o.clubTeamId, playerTeamId);
  return { player, team, history: await loadConversationHistory(db, o.convId) };
}

export interface EventSmsRequest {
  clubTeamId: string;
  player: PlayerSmsSender;
  /** Co se stalo a jak se k tomu hráč staví, jen fakta z hry. Model to dostane jako „PROČ PÍŠEŠ TEĎ“. */
  instruction: string;
  /** Předem napsané varianty, když model nejede. */
  fallback: readonly string[];
  /** Věta za předem napsanou variantou (důvod odchodu), do výběru varianty nepatří. */
  fallbackSuffix?: string;
  /** Výběr předem napsané varianty (stejný seed, stejná volba mezi těmi, které hráč nedostal). */
  seed: string;
  /** Do `metadata.scenario_id`: podle něj se zpráva pozná (např. poděkování za odmítnutou nabídku). */
  scenarioId: string;
  metadata?: Record<string, unknown>;
  /** Proč text od modelu nejde použít (popírá trest), nebo null. Pak jde předem napsaná varianta. */
  reject?: (body: string) => string | null;
  /** Konverzace, když ji volající už má. */
  convId?: string;
  /**
   * Do kdy (ms) musí být text od modelu hotový, jinak jde předem napsaná varianta. Volající
   * ve `waitUntil` ho počítá od začátku své práce, bez něj platí rozpočet od zavolání.
   */
  deadline?: number;
}

/**
 * Pošle zprávu od hráče kvůli události ve hře: text od modelu, jinak předem napsaná varianta.
 * Bez `env` (nebo s vypnutým modelem) rovnou varianta.
 */
export async function sendEventSms(
  db: D1Database, env: ChatEnv | undefined, req: EventSmsRequest,
): Promise<{ convId: string; body: string; aiGenerated: boolean }> {
  const deadline = req.deadline ?? deadlineIn();
  const { getOrCreatePlayerConversation } = await import("./ai-player-spawn");
  const convId = req.convId ?? await getOrCreatePlayerConversation(db, req.clubTeamId, req.player);
  const generated = env
    ? await beforeDeadline(generateEventBody(db, env, req, convId, deadline), deadline, () => {
      logger.warn({ module: M, teamId: req.clubTeamId }, `model nestihl zprávu ${req.scenarioId} v časovém rozpočtu, jde předem napsaná`);
      return null;
    })
    : null;
  if (generated) {
    const body = await sendPlayerSmsToConversation(db, convId, req.player, generated, {
      ...(req.metadata ?? {}), ai_generated: true, scenario_id: req.scenarioId,
    });
    return { convId, body, aiGenerated: true };
  }
  const sent = await sendPlayerTemplateSMS(db, req.clubTeamId, req.player, req.fallback, {
    seed: req.seed, suffix: req.fallbackSuffix, convId, metadata: { ...(req.metadata ?? {}), scenario_id: req.scenarioId },
  });
  return { convId, body: sent.body, aiGenerated: false };
}

async function generateEventBody(
  db: D1Database, env: ChatEnv, req: EventSmsRequest, convId: string, deadline: number,
): Promise<string | null> {
  const { isAiEnabled } = await import("../lib/ai-provider");
  if (!(await isAiEnabled(env))) return null;
  const { GeminiUnavailableError, generateFollowUpMessage } = await import("./ai-player-chat");
  try {
    const ctx = await loadEventSmsContext(db, { clubTeamId: req.clubTeamId, playerId: req.player.id, convId });
    if (!ctx) return null;
    const out = await generateFollowUpMessage(env, ctx.player, ctx.team, ctx.history, req.instruction, { deadline });
    const why = req.reject?.(out.body) ?? null;
    if (why) {
      logger.warn({ module: M, teamId: req.clubTeamId }, `text modelu ${req.scenarioId} nejde použít (${why}): ${out.body}`);
      return null;
    }
    return out.body;
  } catch (e) {
    logger.warn({ module: M, teamId: req.clubTeamId },
      `${e instanceof GeminiUnavailableError ? "model nedostupný" : "chyba modelu"} pro zprávu ${req.scenarioId}, jde předem napsaná`, e);
    return null;
  }
}
