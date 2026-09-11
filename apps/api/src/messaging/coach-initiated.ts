/**
 * Konverzace, které začne trenér — 1:1 s libovolným hráčem i zpráva do kabiny.
 *
 * Dosud uměl chat jen hráč: cron vybral někoho, kdo měl důvod si postěžovat,
 * a trenér mohl leda odpovědět. Napsat sám od sebe šlo, ale zpráva zapadla bez
 * reakce. Tenhle modul to otáčí.
 *
 * Každá odpověď stojí kredit na telefonu (`phone-credit.ts`) — to je jediná
 * brzda proti tomu, aby se tudy protopila celá AI kvóta. Kdo kredit nemá,
 * zprávu neodešle a ví proč.
 */

import { logger } from "../lib/logger";
import { createRng, cryptoSeed } from "../generators/rng";
import {
  generateCoachInitiatedReply, generateSquadGroupReaction, GeminiUnavailableError,
} from "./ai-player-chat";
import { loadPlayerSnapshot, loadTeamContext } from "./ai-player-spawn";
import type { PlayerSnapshot } from "./ai-player-scenarios";

const M = "coach-initiated";

/** Kolik výměn trenér ↔ hráč u konverzace, kterou začal trenér. */
const MAX_VYMEN = 2;

/** Dotaz na hráče ve tvaru, jaký očekává `loadPlayerSnapshot`. */
const PLAYER_SELECT = `
  SELECT p.id, p.first_name, p.last_name, p.nickname, p.avatar, p.age, p.position,
         p.personality, p.life_context, p.coach_relationship, p.is_celebrity,
         0 AS recent_minutes, 6.5 AS recent_rating_avg
  FROM players p`;

/**
 * Hráč odpoví na zprávu, kterou mu trenér napsal sám od sebe.
 *
 * Zakládá thread se stejnými sloupci jako spawnované konverzace, takže další
 * výměnu už obslouží existující `handleAiPlayerReply` — tenhle modul řeší jen
 * ten první krok, který dosud chyběl.
 */
export async function startCoachThread(
  db: D1Database,
  env: { GEMINI_API_KEY?: string },
  opts: { convId: string; teamId: string; playerId: string; coachMessage: string },
): Promise<boolean> {
  try {
    const row = await db
      .prepare(`${PLAYER_SELECT} WHERE p.id = ? AND p.team_id = ?`)
      .bind(opts.playerId, opts.teamId)
      .first<Record<string, unknown>>();
    if (!row) {
      logger.warn({ module: M }, `hráč ${opts.playerId} není v kádru ${opts.teamId}`);
      return false;
    }

    const player = loadPlayerSnapshot(row);
    const team = await loadTeamContext(db, opts.teamId);

    const reply = await generateCoachInitiatedReply(
      env, player, team,
      [{ sender: "coach", body: opts.coachMessage }],
      false,
    );

    const now = new Date().toISOString();
    const jmeno = `${player.firstName} ${player.lastName}`;
    // Když hráč rovnou uzavřel, thread se neotevírá — jinak by konverzace
    // čekala na odpověď, kterou už nikdo nedluží.
    const pokracuje = !reply.conversationComplete;

    const state = {
      trigger: "coach_initiated",
      scenario_id: "coach_initiated",
      max_replies: MAX_VYMEN,
      current_replies: 1,
      awaiting: pokracuje ? "coach" : "done",
      initiated_at: now,
      player_id: opts.playerId,
    };

    await db.batch([
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at, read)
         VALUES (?, ?, 'player', ?, ?, ?, ?, ?, 0)`,
      ).bind(
        crypto.randomUUID(), opts.convId, opts.playerId, jmeno, reply.body,
        JSON.stringify({ ai_generated: true, scenario_id: "coach_initiated", turn: 1 }), now,
      ),
      db.prepare(
        `UPDATE conversations SET ai_thread_active = ?, ai_thread_state = ?, ai_thread_last_at = ?,
           unread_count = unread_count + 1, last_message_text = ?, last_message_at = ?
         WHERE id = ?`,
      ).bind(
        pokracuje ? 1 : 0, JSON.stringify(state), now,
        reply.body.slice(0, 100), now, opts.convId,
      ),
    ]);

    return true;
  } catch (e) {
    if (e instanceof GeminiUnavailableError) {
      logger.warn({ module: M }, `model nedostupný pro ${opts.playerId}`);
      return false;
    }
    logger.error({ module: M }, `konverzace s hráčem ${opts.playerId}`, e);
    return false;
  }
}

/**
 * Na trenérovu zprávu do kabiny se ozve jeden hráč.
 *
 * Jeden, ne dva — kredit se pak dá spočítat dopředu („jedna zpráva, jedna
 * odpověď") a hráč ví, co ho to stojí. Kdo se ozve, rozhoduje losování vážené
 * povahou: ukecaní a vzteklí mají navrch, zakřiknutí mlčí.
 */
export async function replyInSquadGroup(
  db: D1Database,
  env: { GEMINI_API_KEY?: string },
  opts: { convId: string; teamId: string; coachMessage: string },
): Promise<boolean> {
  try {
    const rows = await db
      .prepare(`${PLAYER_SELECT} WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active')`)
      .bind(opts.teamId)
      .all<Record<string, unknown>>();
    if (rows.results.length === 0) return false;

    const kadr = rows.results.map((r) => loadPlayerSnapshot(r));
    const mluvci = vyberMluvciho(kadr);
    if (!mluvci) return false;

    const team = await loadTeamContext(db, opts.teamId);

    // Posledních pár hlášek, aby se kabina neopakovala dokola.
    const predchozi = await db
      .prepare(
        `SELECT sender_name, body FROM messages
         WHERE conversation_id = ? AND sender_type = 'player'
         ORDER BY sent_at DESC LIMIT 4`,
      ).bind(opts.convId).all<{ sender_name: string; body: string }>()
      .catch((e) => { logger.warn({ module: M }, "historie kabiny", e); return null; });

    const text = await generateSquadGroupReaction(
      env, mluvci, team, opts.coachMessage,
      (predchozi?.results ?? []).map((m) => `${m.sender_name}: ${m.body}`),
    );
    if (!text) return false;

    const now = new Date().toISOString();
    const jmeno = `${mluvci.firstName} ${mluvci.lastName}`;
    await db.batch([
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at, read)
         VALUES (?, ?, 'player', ?, ?, ?, ?, ?, 0)`,
      ).bind(
        crypto.randomUUID(), opts.convId, mluvci.id, jmeno, text,
        JSON.stringify({ ai_generated: true, kabina: true }), now,
      ),
      db.prepare(
        `UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = ?
         WHERE id = ?`,
      ).bind(`${jmeno}: ${text}`.slice(0, 100), now, opts.convId),
    ]);

    return true;
  } catch (e) {
    if (e instanceof GeminiUnavailableError) {
      logger.warn({ module: M }, `model nedostupný pro kabinu ${opts.teamId}`);
      return false;
    }
    logger.error({ module: M }, `reakce v kabině ${opts.teamId}`, e);
    return false;
  }
}

/**
 * Kdo se v kabině ozve.
 *
 * Váha, ne čistá náhoda: v každé partě je někdo, kdo má pořád co říct, a někdo,
 * kdo za celou sezónu nepromluví. Vzteklí, vůdčí a naštvaní mluví nejvíc.
 */
export function vyberMluvciho(kadr: PlayerSnapshot[], rng = createRng(cryptoSeed())): PlayerSnapshot | null {
  if (kadr.length === 0) return null;
  const vahy: Record<string, number> = {};
  for (const p of kadr) {
    vahy[p.id] = 1
      + (p.temper > 60 ? 2 : 0)
      + (p.leadership > 60 ? 2 : 0)
      + (p.morale < 40 ? 2 : 0)
      + (p.coachRelationship > 70 ? 1 : 0);
  }
  const id = rng.weighted(vahy);
  return kadr.find((p) => p.id === id) ?? kadr[0];
}
