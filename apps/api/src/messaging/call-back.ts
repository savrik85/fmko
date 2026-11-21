/**
 * Zavolat zpátky (F9).
 *
 * V Hovorech jde zmeškanému hovoru od hráče, sponzora nebo vůdce kotle zavolat zpátky.
 * Stojí to `CALL_BACK_PRICE` z telefonního kreditu a jde to jednou za herní den na klub.
 *
 *  - Hráč to nezvedne a hned pošle hlasovku, ve které řekne, proč volal. Důvod se bere
 *    z jeho skutečného stavu (call-back-reasons.ts). Hlasovka jde mimo týdenní strop
 *    (`force`), vlastní strop je `CALL_BACK_VOICE_LIMIT` na jeden zpětný hovor. Pak se
 *    pokračuje běžnými SMS ve vlákně (handleAiPlayerReply), případně ještě jednou hlasem.
 *  - Sponzor a vůdce kotle napíšou do svého vlákna, o co šlo, a dál se jedná jako jindy.
 *
 * Bez modelu (AI vypnutá, výpadek) jde hotová věta podle důvodu, bez Gemini TTS místo
 * hlasovky SMS. Nic z toho hovor neshodí.
 *
 * Zámek je řádek v `missed_call_callbacks` (unikátní na klub a den i na hovor). Zapíše se
 * dřív, než se strhne kredit: dvojklik i souběžný požadavek skončí na zámku a nic nezaplatí.
 * Když hovor nedopadne, řádek se smaže a kredit vrátí.
 */

import { pushPhoneMessage, type OptionalPushKeys } from "../community/phone-push";
import { logger } from "../lib/logger";
import { carryWeightTalk } from "../season/weight-talk";
import type { PlayerSnapshot } from "./ai-player-scenarios";
import { brokenCzech } from "./foreign-speech";
import {
  callBackScenario, isCallableCaller, leaderCallBackText, pickCallBackReason, playerFallbackText, sponsorCallBackText,
  type CallBackReason,
} from "./call-back-reasons";
import { CALL_BACK_PRICE, creditWord, loadCredit, returnCredit, spendCredit, type CreditState } from "./phone-credit";
import { pickAmbience, recordVoiceMessage, voicePreviewText, type RecordedVoiceMessage, type VoicePlayer } from "./voice-message";

const M = "call-back";

/** Kolik hlasovek pošle hráč v jednom vlákně po zpětném hovoru (první + nanejvýš jedna v odpovědi). */
export const CALL_BACK_VOICE_LIMIT = 2;
/** Šance, že hráč odpoví ve vlákně ještě jednou hlasem, dokud má na hlasovku limit. */
export const SECOND_VOICE_CHANCE = 0.5;
/**
 * Odpověď hráče běží ve `waitUntil` (~30 s). Když už model a čekání spotřebovaly tolik,
 * namlouvání se nestihne a odpověď by se ztratila: pak radši SMS.
 */
const SECOND_VOICE_MAX_ELAPSED_MS = 12_000;
/** Mimo tyhle hodiny (Praha) sponzor ani vůdce kotle telefon nezvednou. */
const DAY_FROM_HOUR = 7;
const DAY_TO_HOUR = 22;

export interface CallBackEnv extends OptionalPushKeys {
  GEMINI_API_KEY?: string;
  CACHE_KV?: KVNamespace;
  AI?: Ai;
  AI_GATEWAY_URL?: string;
  SEED_DATA?: R2Bucket;
}

/** Testy podstrčí nahrávání hlasovky (Gemini TTS v testu nejede) a náhodu. */
export interface CallBackDeps {
  recordVoice?: typeof recordVoiceMessage;
  random?: () => number;
}

/** Zpětný hovor ve stavu vlákna hráče (`ai_thread_state.call_back`). */
export interface CallBackThreadState {
  reason: CallBackReason;
  voicesLeft: number;
}

export type CallBackFailure =
  | "not_found" | "not_callable" | "already_today" | "already_called" | "unreachable" | "asleep" | "no_credit" | "failed";

export type CallBackResult =
  | {
    ok: true;
    /** `voice` = hlasovka, `sms` = hráč napsal (bez TTS), `thread` = sponzor nebo vůdce napsal do svého vlákna. */
    kind: "voice" | "sms" | "thread";
    conversationId: string;
    /** Věta pro trenéra, co se stalo. */
    text: string;
    credit: CreditState & { label: string };
  }
  | { ok: false; code: CallBackFailure; error: string; credit?: CreditState & { label: string } };

/** HTTP stav pro neúspěch, ať ho route nemusí znát. */
export const CALL_BACK_HTTP_STATUS: Record<CallBackFailure, 400 | 404 | 409 | 500> = {
  not_found: 404,
  not_callable: 400,
  already_today: 409,
  already_called: 409,
  unreachable: 409,
  asleep: 409,
  no_credit: 400,
  failed: 500,
};

interface CallRow {
  id: string;
  volajici: string;
  jmeno: string;
  player_id: string | null;
}

type Target =
  | { kind: "player"; row: Record<string, unknown>; player: PlayerSnapshot }
  | { kind: "sponsor"; sponsorId: number; firmName: string; ownerName: string; avatar: string }
  | { kind: "leader"; leader: LeaderRow; heat: number; campaign: boolean };

interface LeaderRow {
  id: string;
  group_id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  avatar: string;
}

const fail = (code: CallBackFailure, error: string, credit?: CreditState & { label: string }): CallBackResult =>
  ({ ok: false, code, error, ...(credit ? { credit } : {}) });

async function creditWithLabel(db: D1Database, teamId: string): Promise<CreditState & { label: string }> {
  const c = await loadCredit(db, teamId);
  return { ...c, label: creditWord(c.zbyva, c.denni) };
}

/** Herní den klubu, stejně jako u kreditu (phone-credit.ts). */
async function gameDay(db: D1Database, teamId: string, now: Date): Promise<string> {
  const row = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>();
  return (row?.game_date ?? now.toISOString()).slice(0, 10);
}

function pragueHour(now: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", hour12: false }).format(now);
  return Number(h) % 24;
}

/** Zavolá zpátky na zmeškaný hovor. Nikdy nehází: chyba = `failed` a kredit zůstává. */
export async function callBackMissedCall(
  db: D1Database,
  env: CallBackEnv,
  opts: { teamId: string; callId: string; now?: Date },
  deps: CallBackDeps = {},
): Promise<CallBackResult> {
  try {
    return await callBack(db, env, { ...opts, now: opts.now ?? new Date() }, deps);
  } catch (e) {
    logger.error({ module: M, teamId: opts.teamId }, `zpětný hovor ${opts.callId}`, e);
    return fail("failed", "Hovor se nepovedl, kredit ti zůstává.");
  }
}

async function callBack(
  db: D1Database,
  env: CallBackEnv,
  opts: { teamId: string; callId: string; now: Date },
  deps: CallBackDeps,
): Promise<CallBackResult> {
  const { teamId, callId, now } = opts;
  const call = await db.prepare("SELECT id, volajici, jmeno, player_id FROM missed_calls WHERE id = ? AND team_id = ?")
    .bind(callId, teamId).first<CallRow>();
  if (!call) return fail("not_found", "Tenhle hovor už v seznamu není.");
  if (!isCallableCaller(call.volajici)) return fail("not_callable", "Zpátky se volat nedá, na vsi se to řeší osobně.");

  const day = await gameDay(db, teamId, now);
  const used = await db.prepare("SELECT call_id FROM missed_call_callbacks WHERE team_id = ? AND (game_day = ? OR call_id = ?)")
    .bind(teamId, day, call.id).all<{ call_id: string }>();
  if (used.results.some((r) => r.call_id === call.id)) return fail("already_called", "Tomuhle číslu už jsi zpátky volal.");
  if (used.results.length > 0) return fail("already_today", "Dnes už jsi zpátky volal. Další hovor až zítra.");

  const target = await resolveTarget(db, teamId, call, now);
  if ("code" in target) return fail(target.code, target.error);

  // Zámek dřív než peníze: souběžný druhý požadavek tady skončí a nic nezaplatí.
  const claimId = crypto.randomUUID();
  const claim = await db.prepare(
    "INSERT OR IGNORE INTO missed_call_callbacks (id, team_id, call_id, game_day, caller) VALUES (?, ?, ?, ?, ?)",
  ).bind(claimId, teamId, call.id, day, call.volajici).run();
  if ((claim.meta?.changes ?? 0) === 0) return fail("already_today", "Dnes už jsi zpátky volal. Další hovor až zítra.");

  if (!(await spendCredit(db, teamId, CALL_BACK_PRICE))) {
    await releaseClaim(db, claimId);
    const credit = await creditWithLabel(db, teamId);
    return fail("no_credit", `Na hovor ti nezbývá kredit, máš ${credit.zbyva} Kč a hovor stojí ${CALL_BACK_PRICE} Kč. Dobije se zítra ráno.`, credit);
  }

  let delivered: { kind: "voice" | "sms" | "thread"; conversationId: string; text: string };
  try {
    delivered = target.kind === "player"
      ? await deliverToPlayer(db, env, { teamId, now, target }, deps)
      : target.kind === "sponsor"
        ? await deliverToSponsor(db, env, { teamId, target })
        : await deliverToLeader(db, env, { teamId, target });
  } catch (e) {
    logger.error({ module: M, teamId }, `zpětný hovor ${call.id} se nedoručil, kredit se vrací`, e);
    await returnCredit(db, teamId, CALL_BACK_PRICE)
      .catch((err) => logger.error({ module: M, teamId }, "vrácení kreditu za zpětný hovor", err));
    await releaseClaim(db, claimId);
    return fail("failed", "Hovor se nepovedl, kredit ti zůstává.");
  }

  await db.batch([
    db.prepare("UPDATE missed_call_callbacks SET outcome = ?, conversation_id = ? WHERE id = ?")
      .bind(delivered.kind, delivered.conversationId, claimId),
    db.prepare("UPDATE missed_calls SET seen = 1 WHERE id = ?").bind(call.id),
  ]).catch((e) => logger.warn({ module: M, teamId }, "zápis výsledku zpětného hovoru", e));
  logger.info({ module: M, teamId }, `zpětný hovor ${call.volajici} ${call.jmeno}: ${delivered.kind}`);
  return { ok: true, ...delivered, credit: await creditWithLabel(db, teamId) };
}

async function releaseClaim(db: D1Database, claimId: string): Promise<void> {
  await db.prepare("DELETE FROM missed_call_callbacks WHERE id = ?").bind(claimId).run()
    .catch((e) => logger.error({ module: M }, `uvolnění zámku zpětného hovoru ${claimId}`, e));
}

type Unreachable = { code: "unreachable" | "asleep"; error: string };

/** Komu se volá. Nedovolá se, kdo v klubu už není, a kdo spí, telefon nezvedne. */
async function resolveTarget(db: D1Database, teamId: string, call: CallRow, now: Date): Promise<Target | Unreachable> {
  if (call.volajici === "hrac") return resolvePlayer(db, teamId, call, now);
  const hour = pragueHour(now);
  const night = hour < DAY_FROM_HOUR || hour >= DAY_TO_HOUR;
  if (call.volajici === "sponzor") {
    // Hovor nese jen název firmy. Platí ta s tímhle názvem, jinak hlavní sponzor.
    const contract = await db.prepare(
      `SELECT sponsor_id, sponsor_name FROM sponsor_contracts
        WHERE team_id = ? AND status = 'active' AND sponsor_id IS NOT NULL
        ORDER BY (sponsor_name = ?) DESC, monthly_amount DESC LIMIT 1`,
    ).bind(teamId, call.jmeno).first<{ sponsor_id: number; sponsor_name: string }>();
    if (!contract) return { code: "unreachable", error: "Ve firmě to nikdo nebere. Smlouva už asi neplatí." };
    if (night) return { code: "asleep", error: "V tuhle hodinu ve firmě nikdo nebere. Zkus to ráno." };
    const { ensureSponsorOwner } = await import("../sponsors/favor");
    const owner = await ensureSponsorOwner(db, contract.sponsor_id);
    if (!owner) return { code: "unreachable", error: "Ve firmě to nikdo nebere." };
    return {
      kind: "sponsor", sponsorId: contract.sponsor_id, firmName: contract.sponsor_name,
      ownerName: `${owner.firstName} ${owner.lastName}`, avatar: JSON.stringify(owner.faceConfig),
    };
  }
  // Vůdce kotle: hovor nese jeho jméno, jinak současný vůdce kotle.
  const leader = await db.prepare(
    `SELECT l.id, l.group_id, l.first_name, l.last_name, l.nickname, l.avatar, g.heat
       FROM fan_leaders l JOIN fan_groups g ON g.id = l.group_id
      WHERE l.team_id = ? AND l.status = 'active'
      ORDER BY ((l.first_name || ' ' || l.last_name) = ?) DESC, (g.kind = 'kotel') DESC LIMIT 1`,
  ).bind(teamId, call.jmeno).first<LeaderRow & { heat: number | null }>();
  if (!leader) return { code: "unreachable", error: "Volané číslo je nedostupné." };
  if (night) return { code: "asleep", error: `${leader.first_name} to v noci nezvedne. Zkus to ráno.` };
  const campaign = await db.prepare(
    "SELECT 1 AS x FROM fan_campaigns WHERE team_id = ? AND kind = 'trener_ven' AND status IN ('sbira','splnena') LIMIT 1",
  ).bind(teamId).first<{ x: number }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "podpisovka pro zpětný hovor", e); return null; });
  return { kind: "leader", leader, heat: leader.heat ?? 0, campaign: !!campaign };
}

async function resolvePlayer(db: D1Database, teamId: string, call: CallRow, now: Date): Promise<Target | Unreachable> {
  const { INJURY_COLUMN, loadLastMatchContext, loadPlayerSnapshot } = await import("./ai-player-spawn");
  const columns = `p.id, p.first_name, p.last_name, p.nationality, p.nickname, p.avatar, p.age, p.position, p.team_id, p.status,
    p.personality, p.life_context, p.coach_relationship, p.is_celebrity, ${INJURY_COLUMN}`;
  // Starší hovory id hráče nemají: dohledá se podle jména mezi hráči klubu (áčko i U21).
  const row = call.player_id
    ? await db.prepare(`SELECT ${columns} FROM players p WHERE p.id = ?`).bind(call.player_id).first<Record<string, unknown>>()
    : await db.prepare(
      `SELECT ${columns} FROM players p
        WHERE p.team_id IN (SELECT id FROM teams WHERE id = ?1 OR parent_team_id = ?1)
          AND (p.first_name || ' ' || p.last_name) = ?2 AND (p.status IS NULL OR p.status = 'active')
        ORDER BY p.id LIMIT 1`,
    ).bind(teamId, call.jmeno).first<Record<string, unknown>>();
  const { playerInClub } = await import("./player-reach");
  const active = row && (row.status == null || row.status === "active");
  if (!row || !active || !(await playerInClub(db, row.id as string, teamId))) {
    return { code: "unreachable", error: `${call.jmeno} už u nás nehraje, číslo je nedostupné.` };
  }

  // Minuty za poslední měsíc jen pro tohohle hráče (scénář „chce hrát“).
  const minutes = await db.prepare(
    `SELECT COALESCE(SUM(s.minutes_played), 0) AS m FROM match_player_stats s JOIN matches m ON m.id = s.match_id
      WHERE s.player_id = ? AND m.status = 'simulated' AND m.simulated_at >= datetime('now', '-30 days')`,
  ).bind(row.id).first<{ m: number }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "minuty hráče pro zpětný hovor", e); return null; });
  const playerTeamId = (row.team_id as string | null) ?? teamId;
  const player = loadPlayerSnapshot({ ...row, recent_minutes: minutes?.m ?? 0 }, await loadLastMatchContext(db, playerTeamId));
  const { nactiSituaceTymu } = await import("./ai-player-spawn");
  const { nazevSituace } = await import("../incidents/situace");
  const situation = (await nactiSituaceTymu(db, teamId)).get(player.id);
  if (situation) player.zivotniSituace = { kind: situation, label: nazevSituace(situation) };

  const { playerTimeContext } = await import("./ai-player-chat");
  if (playerTimeContext(player, now).situace === "spi") {
    return { code: "asleep", error: `${player.firstName} teď spí a telefon nebere. Zkus to později.` };
  }
  return { kind: "player", row, player };
}

function parseObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || !raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? v as Record<string, unknown> : {};
  } catch (e) {
    logger.warn({ module: M }, "JSON hráče pro zpětný hovor", e);
    return {};
  }
}

function voicePlayerOf(row: Record<string, unknown>, player: PlayerSnapshot): VoicePlayer {
  return {
    id: player.id, firstName: player.firstName, age: player.age,
    nationality: player.nationality ?? null, lifeContext: (row.life_context as string | null) ?? null,
  };
}

/** Nahraje hlasovku. Chyba nahrávání hovor neshodí, jen místo hlasu půjde SMS. */
async function recordSafely(
  db: D1Database,
  env: CallBackEnv,
  deps: CallBackDeps,
  opts: Parameters<typeof recordVoiceMessage>[2],
): Promise<RecordedVoiceMessage | null> {
  try {
    return await (deps.recordVoice ?? recordVoiceMessage)(db, env, { ...opts, force: true });
  } catch (e) {
    logger.warn({ module: M, teamId: opts.teamId }, "hlasovka ke zpětnému hovoru, jde SMS", e);
    return null;
  }
}

/** Text hlasovky od modelu, nebo null (AI vypnutá, výpadek). */
async function modelText(
  env: CallBackEnv,
  player: PlayerSnapshot,
  reason: CallBackReason,
  team: Awaited<ReturnType<typeof import("./ai-player-spawn").loadTeamContext>>,
  now: Date,
): Promise<string | null> {
  const { isAiEnabled } = await import("../lib/ai-provider");
  if (!(await isAiEnabled(env))) return null;
  const { generateInitialMessage } = await import("./ai-player-chat");
  try {
    const text = await generateInitialMessage(env, player, callBackScenario(reason), team, now, undefined, true);
    return text.trim() || null;
  } catch (e) {
    logger.warn({ module: M }, `text zpětného hovoru od modelu (${reason}), jde hotová věta`, e);
    return null;
  }
}

async function deliverToPlayer(
  db: D1Database,
  env: CallBackEnv,
  o: { teamId: string; now: Date; target: Extract<Target, { kind: "player" }> },
  deps: CallBackDeps,
): Promise<{ kind: "voice" | "sms"; conversationId: string; text: string }> {
  const { teamId, now } = o;
  const { row, player } = o.target;
  const { getOrCreatePlayerConversation, loadTeamContext } = await import("./ai-player-spawn");
  const convId = await getOrCreatePlayerConversation(db, teamId, {
    id: player.id, firstName: player.firstName, lastName: player.lastName,
    nickname: row.nickname as string | null, avatar: row.avatar as string | null,
  });
  // Sliby trenéra, nabídky a zmeškaný hovor: model pak ví, o čem hráč mluví.
  const { loadChatMemory } = await import("./player-memory");
  await loadChatMemory(db, player, { teamId, convId })
    .catch((e) => logger.warn({ module: M, teamId }, "paměť hráče pro zpětný hovor", e));

  const { playerTimeContext } = await import("./ai-player-chat");
  const time = playerTimeContext(player, now);
  const reason = pickCallBackReason(player, { situation: time.situace, drinksAt: time.kdePije });
  const scenario = callBackScenario(reason);
  const drunk = time.situace === "pije" && time.kdePije === "hospoda";
  const team = await loadTeamContext(db, teamId, row.team_id as string | null);

  const messageId = crypto.randomUUID();
  const lifeContext = parseObject(row.life_context);
  const unrest = lifeContext.transferUnrest as { teamName?: unknown } | undefined;
  const fromModel = await modelText(env, player, reason, team, now);
  const seed = `${player.id}|${now.toISOString().slice(0, 10)}`;
  const text = fromModel ?? brokenCzech(playerFallbackText(reason, {
    injuryDescription: player.injury?.description ?? null,
    injuryDaysLeft: player.injury?.daysLeft ?? 0,
    transferTeam: typeof unrest?.teamName === "string" && unrest.teamName ? unrest.teamName : null,
    drinkingNow: drunk,
  }, seed), player.nationality, seed);

  const recorded = await recordSafely(db, env, deps, {
    teamId, messageId, scene: scenario.description, body: text, drunk, now,
    ambience: pickAmbience({
      drunk, situation: time.situace, drinksAt: time.kdePije, occupation: player.occupation,
      urban: team.urban ?? false, seed: messageId,
    }),
    player: voicePlayerOf(row, player),
  });
  const voice = recorded?.meta ?? null;
  const body = recorded?.transcript ?? text;

  // Rozepsané vlákno (stížnost, zpráva jen tak) se nepřepisuje: hlasovka do něj jen přibude.
  const current = await db.prepare("SELECT ai_thread_active, ai_thread_state FROM conversations WHERE id = ?")
    .bind(convId).first<{ ai_thread_active: number; ai_thread_state: string | null }>();
  const at = now.toISOString();
  const callBackState: CallBackThreadState = { reason, voicesLeft: CALL_BACK_VOICE_LIMIT - (voice ? 1 : 0) };
  const state = {
    trigger: "call_back", scenario_id: scenario.id, max_replies: scenario.expectedTurns, current_replies: 0,
    awaiting: "coach", initiated_at: at, player_id: player.id,
    // Trenér už zavolal sám: když pak neodepíše, hráč se neurazí (expireStaleAiThreads).
    casual: true, call_back: callBackState, resolution: null,
    ...carryWeightTalk(current?.ai_thread_state),
  };
  const { postPlayerMessageStmts } = await import("./follow-ups");
  await db.batch([
    ...postPlayerMessageStmts(db, {
      convId, player, body, now: at, messageId,
      metadata: { ai_generated: fromModel !== null, scenario_id: scenario.id, turn: 0, call_back: reason, ...(voice ?? {}) },
      preview: voice ? voicePreviewText(voice.durationSec) : body.slice(0, 100),
    }),
    db.prepare("UPDATE conversations SET ai_thread_active = 1, ai_thread_state = ?, ai_thread_last_at = ? WHERE id = ? AND ai_thread_active != 1")
      .bind(JSON.stringify(state), at, convId),
  ]);
  await pushPhoneMessage(db, env, {
    teamId, convId, sender: `${player.firstName} ${player.lastName}`, text: voice ? "🎤 Hlasová zpráva" : body,
  });
  return {
    kind: voice ? "voice" : "sms",
    conversationId: convId,
    text: voice ? `${player.firstName} to nezvedl, ale hned ti poslal hlasovku.` : `${player.firstName} to nezvedl, ale hned ti napsal.`,
  };
}

async function deliverToSponsor(
  db: D1Database,
  env: CallBackEnv,
  o: { teamId: string; target: Extract<Target, { kind: "sponsor" }> },
): Promise<{ kind: "thread"; conversationId: string; text: string }> {
  const { teamId, target } = o;
  const { formaKlubu } = await import("../fans/fan-banner");
  const form = await formaKlubu(db, teamId);
  const body = sponsorCallBackText({ losingStreak: Math.max(0, -form.serie) }, `${teamId}|${target.sponsorId}`);
  const { postOwnerMessages } = await import("./system-sms");
  const convId = await postOwnerMessages(db, teamId, {
    sponsorId: target.sponsorId, name: target.ownerName, firmName: target.firmName, avatar: target.avatar,
  }, [{ from: "owner", body, meta: { type: "sponsor_owner_note", callBack: true } }], { coachName: "Trenér", unread: true });
  if (!convId) throw new Error(`zpráva od majitele firmy ${target.sponsorId} se nezapsala`);
  await pushPhoneMessage(db, env, { teamId, convId, sender: target.ownerName, text: body });
  return { kind: "thread", conversationId: convId, text: `${target.ownerName} to nevzal, ale napsal ti, o co šlo.` };
}

async function deliverToLeader(
  db: D1Database,
  env: CallBackEnv,
  o: { teamId: string; target: Extract<Target, { kind: "leader" }> },
): Promise<{ kind: "thread"; conversationId: string; text: string }> {
  const { teamId, target } = o;
  const { fanLeaderFullName } = await import("../fans/fan-group-generator");
  const name = fanLeaderFullName(target.leader);
  const body = leaderCallBackText({ campaign: target.campaign, heat: target.heat }, `${teamId}|${target.leader.id}`);
  const { sendLeaderSMS } = await import("./system-sms");
  // Vlákno čeká na odpověď trenéra, odpoví na ni handleFanLeaderReply jako na jiné zprávy vůdce.
  const convId = await sendLeaderSMS(db, teamId, {
    id: target.leader.id, name, avatar: target.leader.avatar, groupId: target.leader.group_id,
  }, body, { ceka: true, tema: "call_back" });
  if (!convId) throw new Error(`zpráva od vůdce ${target.leader.id} se nezapsala`);
  await pushPhoneMessage(db, env, { teamId, convId, sender: name, text: body });
  return { kind: "thread", conversationId: convId, text: `${target.leader.first_name} to nezvedl, ale napsal ti, o co jde.` };
}

/**
 * Druhá hlasovka: odpověď hráče ve vlákně po zpětném hovoru může jít ještě jednou hlasem,
 * dokud vlákno má na hlasovku limit. Volá handleAiPlayerReply. Null = běžná SMS.
 */
export async function callBackReplyVoice(
  db: D1Database,
  env: CallBackEnv,
  o: {
    teamId: string; messageId: string; state: CallBackThreadState; body: string; scene: string;
    player: PlayerSnapshot; playerRow: Record<string, unknown>; now?: Date;
    /** Kdy začalo zpracování odpovědi (`Date.now()`), kvůli limitu `waitUntil`. */
    startedAt?: number;
  },
  deps: CallBackDeps = {},
): Promise<{ voice: RecordedVoiceMessage; state: CallBackThreadState } | null> {
  if (!(o.state.voicesLeft > 0)) return null;
  if (o.startedAt !== undefined && Date.now() - o.startedAt > SECOND_VOICE_MAX_ELAPSED_MS) return null;
  if ((deps.random ?? Math.random)() >= SECOND_VOICE_CHANCE) return null;
  const now = o.now ?? new Date();
  const { playerTimeContext } = await import("./ai-player-chat");
  const time = playerTimeContext(o.player, now);
  const drunk = time.situace === "pije" && time.kdePije === "hospoda";
  const voice = await recordSafely(db, env, deps, {
    teamId: o.teamId, messageId: o.messageId, scene: o.scene, body: o.body, drunk, now,
    ambience: pickAmbience({
      drunk, situation: time.situace, drinksAt: time.kdePije, occupation: o.player.occupation, urban: false, seed: o.messageId,
    }),
    player: voicePlayerOf(o.playerRow, o.player),
  });
  return voice ? { voice, state: { ...o.state, voicesLeft: o.state.voicesLeft - 1 } } : null;
}

/** Stav zpětných hovorů pro seznam: komu už se volalo a jestli je dnešní hovor pryč. */
export async function loadCallBackState(
  db: D1Database,
  teamId: string,
  now: Date = new Date(),
): Promise<{ usedToday: boolean; calls: Map<string, { outcome: string | null; conversationId: string | null }> }> {
  const empty = { usedToday: false, calls: new Map<string, { outcome: string | null; conversationId: string | null }>() };
  try {
    const day = await gameDay(db, teamId, now);
    const rows = await db.prepare(
      `SELECT call_id, game_day, outcome, conversation_id FROM missed_call_callbacks
        WHERE team_id = ? AND julianday(created_at) > julianday('now', '-15 days')`,
    ).bind(teamId).all<{ call_id: string; game_day: string; outcome: string | null; conversation_id: string | null }>();
    return {
      usedToday: rows.results.some((r) => r.game_day === day),
      calls: new Map(rows.results.map((r) => [r.call_id, { outcome: r.outcome, conversationId: r.conversation_id }])),
    };
  } catch (e) {
    logger.warn({ module: M, teamId }, "stav zpětných hovorů", e);
    return empty;
  }
}
