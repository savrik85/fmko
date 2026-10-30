/**
 * Odložené zprávy od hráčů (tabulka player_follow_ups, migrace 0275). Hráč napíše
 * později sám, protože k tomu má důvod:
 *
 *  - `reply_later`: z práce odepsal „ozvu se pak". V říjnu to hráči napsali 96×
 *    a ozvali se 5×, takže hra lhala a důležité věci (zvýšení platu, váha) zapadly.
 *  - `retry_reply`: model byl mimo provoz, když trenér psal (23. 10. došel kredit
 *    u Gemini a ~12 hodin neodepsal nikdo). Zaplacená SMS dřív tiše zapadla.
 *  - `after_invite`: trenér přijal pozvání (casual-messages.ts), po akci hráč poděkuje.
 *  - `hangover`: ráno po opilé hlasovce se hráč omluví nebo to zlehčí.
 *
 * Doručuje je hodinový běh Telefonu (`runPhoneHourly`). Čas se volí podle toho, co hráč
 * dělá (chat-kontext.ts): nespí a u „ozvu se pak" ani nestojí v práci.
 */

import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { smenaProPovolani } from "../generators/occupations";
import { coachRelationStmts } from "../lib/coach-relation";
import { carryWeightTalk } from "../season/weight-talk";
import { kontextCasu, type Situace } from "./chat-kontext";
import { generateFollowUpMessage, GeminiUnavailableError, type ThreadMessage } from "./ai-player-chat";
import { INVITES, type InviteKind } from "./casual-topics";
import { PHOTO_SCENES, generatePlayerPhoto, historyBody } from "./player-photo";
import { loadChatMemory, offerStanceStmt } from "./player-memory";
import type { PlayerSnapshot } from "./ai-player-scenarios";

const M = "follow-ups";

export type FollowUpKind = "reply_later" | "retry_reply" | "after_invite" | "hangover";

/**
 * Jak dlouho se odložená zpráva zkouší, když model nejde. Výpadek 23. 10. trval ~12 hodin,
 * takže časem, ne počtem pokusů (revize 2026-10-25: 8 pokusů po hodině bylo málo).
 */
const MAX_AGE_MS = 36 * 3600_000;
/** Model nejde: další pokus za hodinu. */
const RETRY_AFTER_MS = 60 * 60_000;
/** Hledá se volná chvíle nejvýš tak daleko dopředu. */
const SEARCH_HOURS = 40;

interface FollowUpRow {
  id: string;
  team_id: string;
  player_id: string;
  conversation_id: string;
  kind: FollowUpKind;
  due_at: string;
  payload: string;
  attempts: number;
  created_at: string;
}

/**
 * Naplánuje odloženou zprávu a vrátí její id. Na jednu konverzaci čeká nejvýš jedna
 * stejného druhu (unikátní index): bez `replace` se druhá zahodí a vrací se null, takže
 * zápis zároveň slouží jako zámek (dvakrát přijaté pozvání nezaplatí dvě rundy).
 * S `replace` se čekající přepíše novým časem a kotvou: hráč, který „ozvu se pak"
 * napsal podruhé, se ozve po té druhé, ne vůbec.
 */
export async function scheduleFollowUp(
  db: D1Database,
  f: {
    teamId: string; playerId: string; convId: string; kind: FollowUpKind; dueAt: Date;
    payload?: Record<string, unknown>; replace?: boolean; now?: Date;
  },
): Promise<string | null> {
  const conflict = f.replace
    ? "ON CONFLICT (conversation_id, kind) WHERE done_at IS NULL DO UPDATE SET due_at = excluded.due_at, payload = excluded.payload"
    : "ON CONFLICT DO NOTHING";
  const r = await db.prepare(
    `INSERT INTO player_follow_ups (id, team_id, player_id, conversation_id, kind, due_at, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) ${conflict} RETURNING id`,
  ).bind(
    crypto.randomUUID(), f.teamId, f.playerId, f.convId, f.kind, f.dueAt.toISOString(),
    JSON.stringify(f.payload ?? {}), (f.now ?? new Date()).toISOString(),
  ).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: M, teamId: f.teamId }, `naplánování ${f.kind}`, e); return null; });
  return r?.id ?? null;
}

/** Zruší čekající odloženou zprávu (pozvání se nakonec nesplnilo). */
export async function cancelFollowUp(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE player_follow_ups SET done_at = ? WHERE id = ? AND done_at IS NULL")
    .bind(new Date().toISOString(), id).run()
    .catch((e) => logger.warn({ module: M }, `zrušení odložené zprávy ${id}`, e));
}

/**
 * Nejbližší chvíle od `from`, kdy hráč nespí (a bez `allowWork` ani nemaká).
 * Prochází po hodinách podle jeho směn; přidává pár minut, ať všichni nepíšou v xx:00.
 */
export function nextFreeMoment(
  player: Pick<PlayerSnapshot, "id" | "occupation" | "alcohol" | "age">,
  from: Date,
  opts: { allowWork?: boolean; earliestHour?: number } = {},
  rng: () => number = Math.random,
): Date {
  const ok: Situace[] = opts.allowWork ? ["po_praci", "volno", "pije", "prace"] : ["po_praci", "volno", "pije"];
  const shift = smenaProPovolani(player.occupation);
  const seed = seedFromString(player.id);
  for (let h = 0; h < SEARCH_HOURS; h++) {
    const at = new Date(from.getTime() + h * 3600_000);
    const k = kontextCasu(at, shift, seed, player.alcohol, player.age);
    if (opts.earliestHour !== undefined && (k.hodina < opts.earliestHour || k.hodina >= 22)) continue;
    if (ok.includes(k.situace)) return new Date(at.getTime() + Math.floor(rng() * 40) * 60_000);
  }
  return new Date(from.getTime() + 3 * 3600_000);
}

/** Doručí odložené zprávy, jejichž čas nastal. */
export async function deliverDueFollowUps(
  db: D1Database,
  env: FollowUpEnv,
  now = new Date(),
  limit = 15,
): Promise<{ delivered: number; cancelled: number; retried: number }> {
  const out = { delivered: 0, cancelled: 0, retried: 0 };
  const rows = await db.prepare(
    "SELECT * FROM player_follow_ups WHERE done_at IS NULL AND due_at <= ? ORDER BY due_at LIMIT ?",
  ).bind(now.toISOString(), limit).all<FollowUpRow>()
    .catch((e) => { logger.warn({ module: M }, "načtení odložených zpráv", e); return { results: [] as FollowUpRow[] }; });

  for (const row of rows.results) {
    // Zámek: zprávu doručí jen ten běh, který ji označí za hotovou (cron a ruční admin se mohou potkat).
    const claimed = await db.prepare("UPDATE player_follow_ups SET done_at = ?, attempts = attempts + 1 WHERE id = ? AND done_at IS NULL")
      .bind(now.toISOString(), row.id).run()
      .catch((e) => { logger.warn({ module: M }, `zámek odložené zprávy ${row.id}`, e); return null; });
    if ((claimed?.meta?.changes ?? 0) === 0) continue;

    let result: DeliveryResult;
    try {
      result = await deliverOne(db, env, row, now);
    } catch (e) {
      logger.error({ module: M, teamId: row.team_id }, `odložená zpráva ${row.id} (${row.kind})`, e);
      result = "retry";
    }
    if (result === "delivered" || result === "cancelled") {
      if (result === "delivered") out.delivered++; else out.cancelled++;
      continue;
    }
    if (result === "retry" && now.getTime() - Date.parse(row.created_at) > MAX_AGE_MS) {
      logger.warn({ module: M, teamId: row.team_id }, `odložená zpráva ${row.id} (${row.kind}) se po ${MAX_AGE_MS / 3600_000} hodinách vzdává`);
      out.cancelled++;
      continue;
    }
    // Znovu otevřít: model nejde (za hodinu), nebo hráč spí či maká (až bude mít chvíli).
    const dueAt = result === "retry" ? new Date(now.getTime() + RETRY_AFTER_MS) : result.postpone;
    await db.prepare("UPDATE player_follow_ups SET done_at = NULL, due_at = ? WHERE id = ?")
      .bind(dueAt.toISOString(), row.id).run()
      .catch((e) => logger.warn({ module: M }, `odklad odložené zprávy ${row.id}`, e));
    out.retried++;
  }
  return out;
}

type DeliveryResult = "delivered" | "cancelled" | "retry" | { postpone: Date };

/**
 * Hráč teď spí (nebo u „ozvu se pak" stojí v práci): zprávu odložit na chvíli, kdy bude mít
 * čas. Cron jede v xx:30 a k času se přidávají minuty, takže zpráva naplánovaná na 21:50
 * by jinak přišla, když už spí, a model by psal, že ho trenér vzbudil.
 */
async function postponeIfBusy(db: D1Database, row: FollowUpRow, now: Date): Promise<Date | null> {
  const p = await db.prepare("SELECT personality, life_context, age FROM players WHERE id = ?")
    .bind(row.player_id).first<{ personality: string | null; life_context: string | null; age: number | null }>()
    .catch((e) => { logger.warn({ module: M }, `hráč pro odloženou zprávu ${row.id}`, e); return null; });
  if (!p) return null;
  const who = {
    id: row.player_id,
    occupation: parseObject(p.life_context).occupation as string | undefined,
    alcohol: Number(parseObject(p.personality).alcohol ?? 30),
    age: p.age ?? 25,
  };
  const k = kontextCasu(now, smenaProPovolani(who.occupation), seedFromString(who.id), who.alcohol, who.age);
  if (k.situace === "spi") return nextFreeMoment(who, now, { allowWork: row.kind !== "reply_later", earliestHour: 7 });
  if (row.kind === "reply_later" && k.situace === "prace") return nextFreeMoment(who, now);
  return null;
}

export interface FollowUpEnv {
  GEMINI_API_KEY?: string;
  CACHE_KV?: KVNamespace;
  AI?: Ai;
  SEED_DATA?: R2Bucket;
}

async function deliverOne(db: D1Database, env: FollowUpEnv, row: FollowUpRow, now: Date): Promise<DeliveryResult> {
  const payload = parseObject(row.payload);
  const postpone = await postponeIfBusy(db, row, now);
  if (postpone) return { postpone };
  if (row.kind === "retry_reply") return retryReply(db, env, row);

  const { INJURY_COLUMN, loadLastMatchContext, loadPlayerSnapshot, loadTeamContext } = await import("./ai-player-spawn");
  const playerRow = await db.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.nationality, p.age, p.position, p.team_id, p.loan_from_team_id,
            p.personality, p.life_context, p.coach_relationship, p.is_celebrity, ${INJURY_COLUMN}
       FROM players p WHERE p.id = ?`,
  ).bind(row.player_id).first<Record<string, unknown>>();
  if (!playerRow || !(await stillInClub(db, playerRow, row.team_id))) return "cancelled";

  const conv = await db.prepare("SELECT ai_thread_active, ai_thread_state FROM conversations WHERE id = ?")
    .bind(row.conversation_id).first<{ ai_thread_active: number; ai_thread_state: string | null }>();
  if (!conv) return "cancelled";

  // Hráč mezitím psal sám: odložená zpráva by navazovala na něco, co už je pryč.
  const anchorAt = typeof payload.anchorAt === "string" ? payload.anchorAt : null;
  if (anchorAt && (row.kind === "reply_later" || row.kind === "hangover") && await playerWroteAfter(db, row.conversation_id, row.player_id, anchorAt)) {
    return "cancelled";
  }

  // Účast v posledním zápase jen u hráče z tohohle kádru, jinak hrál jinou soutěž.
  const player = loadPlayerSnapshot(playerRow, playerRow.team_id === row.team_id ? await loadLastMatchContext(db, row.team_id) : undefined);
  const memory = await loadChatMemory(db, player, { teamId: row.team_id, convId: row.conversation_id });
  const team = await loadTeamContext(db, row.team_id);
  const history = await loadHistory(db, row.conversation_id);

  let instruction: string;
  let topicId: string | null = null;
  let photoSceneId: string | undefined;
  let effect: { relation: number; morale: number; description: string } | null = null;
  if (row.kind === "reply_later") {
    instruction = "Před pár hodinami jsi trenérovi napsal, že se ozveš, až budeš mít čas. Teď už máš klid. Odpověz mu pořádně "
      + "na to, co ti psal (jeho poslední zprávy v historii), jako bys v rozhovoru pokračoval. Na začátku se nanejvýš krátce ozvi, že už můžeš.";
  } else if (row.kind === "hangover") {
    const { getScenarioById } = await import("./ai-player-scenarios");
    instruction = getScenarioById("casual_hangover")?.description ?? "";
    topicId = "casual_hangover";
  } else {
    const kind = payload.invite as InviteKind | undefined;
    const info = kind ? INVITES[kind] : undefined;
    if (!info) return "cancelled";
    instruction = info.thanks;
    topicId = "casual_invite_thanks";
    photoSceneId = info.photo;
    effect = {
      relation: info.relation, morale: info.morale,
      description: kind === "visit" ? "Udělal sis na něj čas, když se za tebou stavil" : `Přišel jsi na jeho pozvání (${info.label})`,
    };
  }

  const { isAiEnabled } = await import("../lib/ai-provider");
  if (!(await isAiEnabled(env))) return "retry";

  let photo: { key: string; alt: string } | null = null;
  const scene = photoSceneId ? PHOTO_SCENES[photoSceneId] : undefined;
  if (scene && env.AI && env.SEED_DATA) {
    const key = await generatePlayerPhoto(env.AI, env.SEED_DATA, scene, crypto.randomUUID(), seedFromString(row.id));
    if (key) photo = { key, alt: scene.alt };
    else logger.warn({ module: M, teamId: row.team_id }, `fotka ${scene.id} k odložené zprávě se nepovedla, jde bez ní`);
  }

  let generated: Awaited<ReturnType<typeof generateFollowUpMessage>>;
  try {
    generated = await generateFollowUpMessage(env, player, team, history, instruction, { photo: photo ? { alt: photo.alt } : undefined });
  } catch (e) {
    if (e instanceof GeminiUnavailableError) {
      logger.warn({ module: M, teamId: row.team_id }, `model nedostupný pro odloženou zprávu ${row.id}: ${e.message}`);
      return "retry";
    }
    throw e;
  }

  const sentAt = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];
  // Když s ním trenér zrovna nic nerozjel, otevře se vlákno, ať má na co odpovídat.
  if (conv.ai_thread_active !== 1) {
    const carried = carryWeightTalk(conv.ai_thread_state);
    const state = topicId
      ? { trigger: topicId, scenario_id: topicId, max_replies: 2, current_replies: 0, awaiting: "coach", initiated_at: sentAt, player_id: player.id, casual: true, ...carried }
      : { trigger: "coach_initiated", scenario_id: "coach_initiated", max_replies: 30, current_replies: 1, awaiting: "coach", initiated_at: sentAt, player_id: player.id, ...carried };
    stmts.push(db.prepare("UPDATE conversations SET ai_thread_active = 1, ai_thread_state = ?, ai_thread_last_at = ? WHERE id = ? AND ai_thread_active != 1")
      .bind(JSON.stringify(state), sentAt, row.conversation_id));
  }
  stmts.push(...postPlayerMessageStmts(db, {
    convId: row.conversation_id, player, body: generated.body, now: sentAt,
    metadata: {
      ai_generated: true, scenario_id: topicId ?? "coach_initiated", follow_up: row.kind,
      ...(photo ? { type: "photo", photoKey: photo.key, photoAlt: photo.alt } : {}),
    },
    preview: photo ? `📷 ${generated.body.slice(0, 90)}` : generated.body.slice(0, 100),
  }));
  if (generated.transferStance) stmts.push(offerStanceStmt(db, player.id, generated.transferStance, memory.offerIds));
  if (effect) {
    const { getTeamGameDate } = await import("../community/manager-relations");
    stmts.push(...coachRelationStmts(db, {
      playerId: player.id, delta: effect.relation, source: "invite", description: effect.description,
      gameDate: (await getTeamGameDate(db, row.team_id)).slice(0, 10),
    }));
    stmts.push(db.prepare(
      `UPDATE players SET life_context = json_set(COALESCE(life_context, '{}'), '$.morale',
         MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + ?))) WHERE id = ?`,
    ).bind(effect.morale, player.id));
  }
  await db.batch(stmts);
  logger.info({ module: M, teamId: row.team_id }, `odložená zpráva ${row.kind}: ${player.firstName} ${player.lastName}${photo ? " (fotka)" : ""}`);
  return "delivered";
}

/**
 * Trenér psal, když model nešel. Odpověď se zkusí znovu stejnou cestou jako tehdy
 * (vlákno, nebo zpráva od trenéra sama od sebe); hráč řekne, že neměl telefon u sebe.
 */
async function retryReply(db: D1Database, env: FollowUpEnv, row: FollowUpRow): Promise<"delivered" | "cancelled" | "retry"> {
  const lastCoach = await db.prepare(
    `SELECT id, body, sent_at FROM messages WHERE conversation_id = ? AND sender_type = 'user'
      ORDER BY julianday(sent_at) DESC LIMIT 1`,
  ).bind(row.conversation_id).first<{ id: string; body: string; sent_at: string }>();
  if (!lastCoach) return "cancelled";
  if (await answeredOrRead(db, row, lastCoach)) return "cancelled";

  const { isAiEnabled } = await import("../lib/ai-provider");
  if (!(await isAiEnabled(env))) return "retry";

  const conv = await db.prepare("SELECT ai_thread_active, ai_thread_state FROM conversations WHERE id = ?")
    .bind(row.conversation_id).first<{ ai_thread_active: number; ai_thread_state: string | null }>();
  if (!conv) return "cancelled";

  if (conv.ai_thread_active === 1) {
    // Stejná pojistka jako v routes/messaging.ts: odpověď generuje jen ten, kdo přepnul „čeká na hráče".
    const claimed = await db.prepare(
      `UPDATE conversations SET ai_thread_state = json_set(ai_thread_state, '$.awaiting', 'player')
        WHERE id = ? AND ai_thread_active = 1 AND json_extract(ai_thread_state, '$.awaiting') = 'coach'`,
    ).bind(row.conversation_id).run();
    if ((claimed.meta?.changes ?? 0) === 0) return "cancelled";
    const { handleAiPlayerReply } = await import("./ai-player-spawn");
    await handleAiPlayerReply(db, env, row.conversation_id, { lateReply: "offline" });
  } else {
    const { startCoachThread } = await import("./coach-initiated");
    await startCoachThread(db, env, {
      convId: row.conversation_id, teamId: row.team_id, playerId: row.player_id,
      coachMessage: lastCoach.body, lateReply: "offline",
    });
  }
  return (await answeredOrRead(db, row, lastCoach)) ? "delivered" : "retry";
}

/**
 * Je trenérova zpráva vyřízená? Hráč odepsal, nebo si ji schválně jen přečetl
 * (left-on-read.ts, `metadata.readAt`). Přečteno bez odpovědi je taky odpověď,
 * jinak by se odpověď zkoušela znovu každou hodinu.
 */
async function answeredOrRead(db: D1Database, row: FollowUpRow, lastCoach: { id: string; sent_at: string }): Promise<boolean> {
  if (await playerWroteAfter(db, row.conversation_id, row.player_id, lastCoach.sent_at)) return true;
  const read = await db.prepare("SELECT json_extract(metadata, '$.readAt') AS read_at FROM messages WHERE id = ?")
    .bind(lastCoach.id).first<{ read_at: string | null }>();
  return !!read?.read_at;
}

/** Je hráč pořád v klubu, kterému patří konverzace (i přes U21 nebo hostování)? */
async function stillInClub(db: D1Database, playerRow: Record<string, unknown>, teamId: string): Promise<boolean> {
  const club = (id: unknown) => id
    ? db.prepare("SELECT COALESCE(parent_team_id, id) AS id FROM teams WHERE id = ?").bind(id).first<{ id: string }>()
      .then((r) => r?.id ?? null)
    : Promise.resolve(null);
  const [own, loanOwner, conv] = await Promise.all([club(playerRow.team_id), club(playerRow.loan_from_team_id), club(teamId)]);
  return conv !== null && (own === conv || loanOwner === conv);
}

async function playerWroteAfter(db: D1Database, convId: string, playerId: string, at: string): Promise<boolean> {
  const r = await db.prepare(
    `SELECT 1 AS x FROM messages WHERE conversation_id = ? AND sender_type = 'player' AND sender_id = ?
       AND julianday(sent_at) > julianday(?) LIMIT 1`,
  ).bind(convId, playerId, at).first<{ x: number }>();
  return !!r;
}

/** Posledních pár zpráv chronologicky, s popisem fotek a označenou opilou hlasovkou. */
async function loadHistory(db: D1Database, convId: string): Promise<ThreadMessage[]> {
  const rows = await db.prepare(
    `SELECT * FROM (
       SELECT sender_type, body, sent_at, json_extract(metadata, '$.photoAlt') AS photo_alt, json_extract(metadata, '$.drunk') AS drunk
         FROM messages WHERE conversation_id = ? AND sender_type IN ('player','user')
        ORDER BY julianday(sent_at) DESC LIMIT 8
     ) ORDER BY julianday(sent_at) ASC`,
  ).bind(convId).all<{ sender_type: string; body: string; photo_alt: string | null; drunk: number | null }>()
    .catch((e) => { logger.warn({ module: M }, "historie pro odloženou zprávu", e); return { results: [] as never[] }; });
  return rows.results.map((m) => ({
    sender: m.sender_type === "player" ? "player" : "coach",
    body: historyBody(m.body, m.photo_alt, m.drunk === 1),
  }));
}

/** Zpráva od hráče do jeho konverzace s trenérem, včetně náhledu v seznamu. */
export function postPlayerMessageStmts(
  db: D1Database,
  m: {
    convId: string; player: { id: string; firstName: string; lastName: string }; body: string; now: string;
    metadata: Record<string, unknown>; preview: string; messageId?: string;
  },
): D1PreparedStatement[] {
  return [
    db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at, read) VALUES (?, ?, 'player', ?, ?, ?, ?, ?, 0)",
    ).bind(m.messageId ?? crypto.randomUUID(), m.convId, m.player.id, `${m.player.firstName} ${m.player.lastName}`, m.body, JSON.stringify(m.metadata), m.now),
    db.prepare(
      "UPDATE conversations SET last_message_text = ?, last_message_at = ?, unread_count = unread_count + 1 WHERE id = ?",
    ).bind(m.preview, m.now, m.convId),
  ];
}

function parseObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const p = JSON.parse(raw) as unknown;
    return p && typeof p === "object" ? p as Record<string, unknown> : {};
  } catch (e) {
    logger.warn({ module: M }, "JSON odložené zprávy nebo hráče", e);
    return {};
  }
}
