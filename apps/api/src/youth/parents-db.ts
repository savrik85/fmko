/**
 * Fotbaloví rodiče v U21 v databázi (F12).
 *
 * Hodinový běh Telefonu (`tickYouthParents` z casual-messages.ts `runPhoneHourly`), jen přes den:
 *  1. Rodiče vznikají líně: dorost lidského klubu s trenérem, který je ve hře, má dva až tři rodiče,
 *     každý s jinou povahou. AI kluby rodiče nemají.
 *  2. Dohody táty podnikatele (`coach_commitments.kind = 'parent_deal'`): když syn nastoupil od
 *     začátku, přijdou peníze (`recordTransaction`, `parent_contribution`), jinak dohoda padá.
 *  3. Ticho trenéra: rodič, který čekal na odpověď a lhůta vypršela, se urazí. Máma pohrozí
 *     Vimperkem (syn dostane nespokojenost s důvodem `parent`), ctižádostivý táta to doma
 *     vytmaví synovi, podnikatel stáhne nabídku, tichý rodič se urazí mlčky.
 *  4. Spouštěče po zápase dorostu: syn dvakrát po sobě nehrál, zranil se, nebo dorost vyhrál
 *     a syn hrál. Spouštěč se zapíše a SMS odejde s prodlevou (v noci až ráno).
 * Trenér odpovídá v Telefonu (routes/messaging.ts, předpona `yp-`), rodič odepíše přes model
 * (`replyToParentMessage`), bez modelu připravenou větou.
 *
 * Opakovaný běh nic nezdvojí: rodič má UNIQUE hráče, spouštěč i SMS se zabírají podmíněným
 * UPDATE, dohoda má id podle nabídky a peníze se pohnou jen po zabrání dohody.
 */
import { logger } from "../lib/logger";
import { aiContextFromEnv, generateText, type AiContext } from "../lib/ai-provider";
import { seedFromString } from "../lib/seed";
import { createRng } from "../generators/rng";
import type { OptionalPushKeys } from "../community/phone-push";
import type { TransferUnrest } from "../transfers/offer-rejection-impact";
import { reasonSms } from "../transfers/unrest-reasons";
import {
  buildDealResultPrompt, buildOffendedPrompt, buildParentReplyPrompt, buildParentSmsPrompt, checkParentSms, classifyCoachReply,
  dealAmount, fallbackDealResultSms, fallbackOffendedSms, fallbackParentReply, fallbackParentSms, generateParentIdentity,
  isMother, isParentArchetype, isParentDaytime, parentCountFor, parentDeliveryTime, parentParticipantId, parentWritesAbout,
  parseParentReply, archetypesForClub, topicNeedsReply, THREAT_TOWN,
  type ParentArchetype, type ParentFacts, type ParentHistoryLine, type ParentMood, type ParentTopic, type ReplyOutcome,
} from "./parents";

const M = "youth-parents";
const HOUR_MS = 3_600_000;
/** Rodiče vznikají a píšou jen klubům, kde byl trenér ve hře nedávno. */
const ACTIVE_COACH_DAYS = 7;
/** Spouštěč platí jen čerstvý: zápas nejvýš dva dny, zranění tři dny staré. */
const MATCH_FRESH_HOURS = 48;
const INJURY_FRESH_HOURS = 72;
/** Rodič se sám ozve nejvýš jednou za tolik hodin. */
const SMS_GAP_HOURS = 36;
/** Lhůta na odpověď trenéra (často odpovídá až druhý den). */
export const PARENT_REPLY_HOURS = 36;
/** Uražený rodič tolik dní sám nepíše (pokud ho trenér neusmíří). */
const OFFENDED_DAYS = 7;
/** Nabídka příspěvku platí týden. */
const OFFER_TTL_DAYS = 7;
/** Dohoda o příspěvku: do kdy musí syn nastoupit od začátku. */
export const PARENT_DEAL_DAYS = 10;
/** Máma pohrozí Vimperkem nejvýš jednou za měsíc. */
const THREAT_GAP_DAYS = 30;
/** Nespokojenost syna po výhrůžce: nová, nebo přidaná k té, kterou už má. */
const PARENT_UNREST_LEVEL = 35;
const PARENT_UNREST_ADD = 20;
/** Ctižádostivý táta synovi doma vytmaví, že ho trenér přehlíží. */
const FATHER_MORALE_HIT = 4;
const WIN_CHANCE = 0.5;
const MODEL_TIMEOUT_MS = 20_000;
const MAX_ROWS_PER_RUN = 30;

const FATHER_PRESSURE_SMS = [
  "Trenére, táta je na vás naštvanej. Doma to pak schytávám já.",
  "Trenére, táta pořád řeší, že ho přehlížíte. Mně je to trapný.",
];

export type ParentEnv = {
  CACHE_KV?: KVNamespace;
  GEMINI_API_KEY?: string;
  AI?: Ai;
  AI_GATEWAY_URL?: string;
} & OptionalPushKeys;

export interface ParentTickOpts {
  /** null = AI vypnutá (připravené texty); bez hodnoty se vezme z env. */
  ai?: AiContext | null;
  /** Kostka pro pochvalu po výhře (testy). */
  rng?: () => number;
}

export interface ParentTickResult { created: number; triggered: number; sent: number; offended: number; deals: number }

interface ParentRow {
  id: string;
  player_id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  avatar: string | null;
  archetype: string;
  mood: string;
  pending_topic: string | null;
  pending_key: string | null;
  pending_due_at: string | null;
  last_match_key: string | null;
  last_injury_id: string | null;
  last_sms_at: string | null;
  sms_count: number;
  awaiting_reply_until: string | null;
  offended_at: string | null;
  threat_at: string | null;
  deal_offer_amount: number | null;
  deal_offer_at: string | null;
}

/** Rodič se synem a klubem. */
interface ParentWithSon extends ParentRow {
  son_first: string | null;
  son_last: string | null;
  son_nickname: string | null;
  son_avatar: string | null;
  son_team_id: string | null;
  club_name: string | null;
  club_user_id: string | null;
  club_game_date: string | null;
  u21_id: string | null;
}

const PARENT_SELECT = `SELECT yp.*, p.first_name AS son_first, p.last_name AS son_last, p.nickname AS son_nickname,
       p.avatar AS son_avatar, p.team_id AS son_team_id,
       c.name AS club_name, c.user_id AS club_user_id, c.game_date AS club_game_date, u21.id AS u21_id
  FROM youth_parents yp
  LEFT JOIN players p ON p.id = yp.player_id
  LEFT JOIN teams c ON c.id = yp.team_id
  LEFT JOIN teams u21 ON u21.parent_team_id = yp.team_id AND u21.team_type = 'u21'`;

// ── Pomocné ────────────────────────────────────────────────────────────────

/** Čas z DB: ISO i SQLite „YYYY-MM-DD HH:MM:SS“ (UTC). */
function timeOf(s: string | null | undefined): number {
  if (!s) return Number.NaN;
  const iso = /[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(" ", "T")}Z`;
  return Date.parse(iso);
}

function hoursSince(s: string | null | undefined, now: Date): number {
  const t = timeOf(s);
  return Number.isFinite(t) ? (now.getTime() - t) / HOUR_MS : Number.POSITIVE_INFINITY;
}

function isMood(v: unknown): v is ParentMood {
  return v === "calm" || v === "pleased" || v === "upset" || v === "offended";
}

function modelOn(ai: AiContext | null): boolean {
  return !!ai && ai.provider !== "off";
}

async function askModel(ai: AiContext | null, prompt: string, maxTokens = 256): Promise<string | null> {
  if (!modelOn(ai)) return null;
  return generateText(ai!, prompt, { json: true, maxTokens, temperature: 0.85, module: M, timeoutMs: MODEL_TIMEOUT_MS })
    .catch((e) => { logger.warn({ module: M }, "volání modelu pro rodiče", e); return null; });
}

async function resolveAi(env: ParentEnv, override: AiContext | null | undefined): Promise<AiContext | null> {
  if (override !== undefined) return override;
  return aiContextFromEnv(env).catch((e) => { logger.warn({ module: M }, "AI kontext pro rodiče", e); return null; });
}

function factsOf(row: ParentWithSon, firstMessage: boolean): ParentFacts {
  return {
    firstName: row.first_name,
    lastName: row.last_name,
    archetype: isParentArchetype(row.archetype) ? row.archetype : "quiet",
    sonFirstName: row.son_first ?? "kluk",
    sonLastName: row.son_last ?? "",
    clubName: row.club_name ?? "klub",
    mood: isMood(row.mood) ? row.mood : "calm",
    firstMessage,
  };
}

function clubIsHuman(row: ParentWithSon): boolean {
  return !!row.club_user_id && row.club_user_id !== "ai";
}

/** Syn je pořád v dorostu klubu: jen tehdy rodič píše po zápase. */
function sonInYouth(row: ParentWithSon): boolean {
  return clubIsHuman(row) && !!row.son_team_id && row.son_team_id === row.u21_id;
}

/** Syn je pořád v klubu (dorost nebo áčko). */
function sonInClub(row: ParentWithSon): boolean {
  return clubIsHuman(row) && !!row.son_team_id && (row.son_team_id === row.u21_id || row.son_team_id === row.team_id);
}

async function loadParent(db: D1Database, where: string, bind: string): Promise<ParentWithSon | null> {
  return db.prepare(`${PARENT_SELECT} WHERE ${where}`).bind(bind).first<ParentWithSon>();
}

async function parentConversation(db: D1Database, teamId: string, row: ParentRow, at: string): Promise<string> {
  const participantId = parentParticipantId(row.player_id);
  const existing = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND participant_id = ?")
    .bind(teamId, participantId).first<{ id: string }>();
  if (existing) return existing.id;
  const convId = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO conversations
      (id, team_id, type, title, participant_id, participant_avatar, pinned, unread_count, last_message_text, last_message_at, created_at)
     VALUES (?, ?, 'system', ?, ?, ?, 0, 0, '', ?, ?)`,
  ).bind(convId, teamId, `${row.first_name} ${row.last_name}`, participantId, row.avatar, at, at).run();
  return convId;
}

async function postParentMessage(db: D1Database, env: ParentEnv, teamId: string, row: ParentRow, body: string, at: Date): Promise<string> {
  const iso = at.toISOString();
  const convId = await parentConversation(db, teamId, row, iso);
  const name = `${row.first_name} ${row.last_name}`;
  await db.batch([
    db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at)
       VALUES (?, ?, 'system', ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), convId, parentParticipantId(row.player_id), name, body, JSON.stringify({ type: "youth_parent", parentId: row.id }), iso),
    db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = ? WHERE id = ?")
      .bind(body.slice(0, 100), iso, convId),
  ]);
  const { pushPhoneMessage } = await import("../community/phone-push");
  await pushPhoneMessage(db, env, { teamId, convId, sender: name, text: body });
  return convId;
}

async function loadHistory(db: D1Database, teamId: string, playerId: string, limit: number): Promise<ParentHistoryLine[]> {
  const res = await db.prepare(
    `SELECT m.sender_type, m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.team_id = ? AND c.type = 'system' AND c.participant_id = ?
      ORDER BY m.sent_at DESC, m.rowid DESC LIMIT ?`,
  ).bind(teamId, parentParticipantId(playerId), limit).all<{ sender_type: string; body: string }>();
  return res.results.reverse().map((m) => ({ from: m.sender_type === "user" ? "coach" as const : "parent" as const, body: m.body }));
}

async function activeDealAmount(db: D1Database, playerId: string): Promise<number | null> {
  const r = await db.prepare(
    "SELECT json_extract(details, '$.amount') AS amount FROM coach_commitments WHERE player_id = ? AND kind = 'parent_deal' AND status = 'active' LIMIT 1",
  ).bind(playerId).first<{ amount: number | null }>();
  return r ? Number(r.amount) || 0 : null;
}

// ── Hodinový běh ────────────────────────────────────────────────────────────

export async function tickYouthParents(db: D1Database, env: ParentEnv, now: Date = new Date(), opts: ParentTickOpts = {}): Promise<ParentTickResult> {
  const out: ParentTickResult = { created: 0, triggered: 0, sent: 0, offended: 0, deals: 0 };
  if (!isParentDaytime(now)) return out;
  const ai = await resolveAi(env, opts.ai);
  const rng = opts.rng ?? Math.random;

  let clubs: ActiveClub[] = [];
  try {
    clubs = await activeClubs(db, now);
  } catch (e) {
    logger.warn({ module: M }, "kluby s dorostem pro rodiče", e);
  }
  for (const club of clubs) {
    try {
      out.created += await ensureClubParents(db, club, now);
    } catch (e) {
      logger.warn({ module: M, teamId: club.club_id }, "vznik rodičů v dorostu", e);
    }
  }
  // Dohody a ticho před spouštěči: SMS o výsledku dohody nebo uražení zapíše čas poslední SMS
  // a spouštěč téhož zápasu už rodič nepošle.
  try {
    out.deals = await settleParentDeals(db, env, ai, now);
  } catch (e) {
    logger.warn({ module: M }, "dohody táty podnikatele", e);
  }
  try {
    out.offended = await handleSilence(db, env, ai, now);
  } catch (e) {
    logger.warn({ module: M }, "ticho trenéra", e);
  }
  for (const club of clubs) {
    try {
      out.triggered += await detectClubTriggers(db, club, now, rng);
    } catch (e) {
      logger.warn({ module: M, teamId: club.club_id }, "spouštěče rodičů", e);
    }
  }
  try {
    out.sent = await sendDueMessages(db, env, ai, now);
  } catch (e) {
    logger.warn({ module: M }, "SMS rodičů", e);
  }
  if (out.created || out.triggered || out.sent || out.offended || out.deals) {
    logger.info({ module: M }, `rodiče z U21: ${out.created} nových, ${out.triggered} spouštěčů, ${out.sent} SMS, ${out.offended} uražených, ${out.deals} dohod vyhodnoceno`);
  }
  return out;
}

interface ActiveClub { club_id: string; club_name: string; u21_id: string }

async function activeClubs(db: D1Database, now: Date): Promise<ActiveClub[]> {
  const res = await db.prepare(
    `SELECT c.id AS club_id, c.name AS club_name, u21.id AS u21_id
       FROM teams c
       JOIN teams u21 ON u21.parent_team_id = c.id AND u21.team_type = 'u21'
       JOIN users u ON u.id = c.user_id
      WHERE c.user_id != 'ai' AND c.parent_team_id IS NULL
        AND julianday(u.last_activity_at) > julianday(?1) - ?2`,
  ).bind(now.toISOString(), ACTIVE_COACH_DAYS).all<ActiveClub>();
  return res.results;
}

// ── Vznik rodičů ────────────────────────────────────────────────────────────

/** Dorost klubu má mít dva až tři rodiče (se synem v dorostu); chybějící doplní. */
async function ensureClubParents(db: D1Database, club: ActiveClub, now: Date): Promise<number> {
  const existing = (await db.prepare(
    "SELECT yp.player_id, yp.archetype, p.team_id AS son_team_id FROM youth_parents yp LEFT JOIN players p ON p.id = yp.player_id WHERE yp.team_id = ?",
  ).bind(club.club_id).all<{ player_id: string; archetype: string; son_team_id: string | null }>()).results;
  const active = existing.filter((r) => r.son_team_id === club.u21_id);
  const need = parentCountFor(club.club_id) - active.length;
  if (need <= 0) return 0;

  const kids = (await db.prepare(
    `SELECT p.id, p.last_name FROM players p
      WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active')
        AND NOT EXISTS (SELECT 1 FROM youth_parents y WHERE y.player_id = p.id)
      ORDER BY p.id`,
  ).bind(club.u21_id).all<{ id: string; last_name: string }>()).results;
  if (kids.length === 0) return 0;
  const rng = createRng(seedFromString(`parent-kids:${club.club_id}:${existing.length}`));
  for (let i = kids.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [kids[i], kids[j]] = [kids[j], kids[i]];
  }
  const taken = active.map((r) => r.archetype).filter(isParentArchetype);
  const archetypes = archetypesForClub(club.club_id, taken, need).slice(0, kids.length);
  if (archetypes.length === 0) return 0;
  const iso = now.toISOString();
  const res = await db.batch(archetypes.map((archetype, i) => {
    const kid = kids[i];
    const who = generateParentIdentity({ id: kid.id, lastName: kid.last_name }, archetype);
    return db.prepare(
      `INSERT OR IGNORE INTO youth_parents (id, player_id, team_id, first_name, last_name, avatar, archetype, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(parentParticipantId(kid.id), kid.id, club.club_id, who.firstName, who.lastName, who.avatar, archetype, iso);
  }));
  return res.reduce((n, r) => n + (r.meta?.changes ?? 0), 0);
}

// ── Spouštěče ───────────────────────────────────────────────────────────────

interface MatchRow { id: string; home_team_id: string; away_team_id: string; home_score: number | null; away_score: number | null; simulated_at: string }

function teamWon(m: MatchRow, teamId: string): boolean {
  if (m.home_score == null || m.away_score == null) return false;
  return m.home_team_id === teamId ? m.home_score > m.away_score : m.away_score > m.home_score;
}

/**
 * Po zápase dorostu: zranění, dvě lavičky po sobě, nebo výhra se synem na hřišti. Zápas a zranění
 * se zapíšou jako zpracované i bez SMS (rodič čeká na odpověď, je uražený, psal nedávno),
 * ať se k nim další běh nevrací.
 */
async function detectClubTriggers(db: D1Database, club: ActiveClub, now: Date, rng: () => number): Promise<number> {
  const parents = (await db.prepare(
    "SELECT yp.* FROM youth_parents yp JOIN players p ON p.id = yp.player_id WHERE yp.team_id = ? AND p.team_id = ?",
  ).bind(club.club_id, club.u21_id).all<ParentRow>()).results.filter((p) => p.pending_topic === null && isParentArchetype(p.archetype));
  if (parents.length === 0) return 0;

  const matches = (await db.prepare(
    `SELECT id, home_team_id, away_team_id, home_score, away_score, simulated_at FROM matches
      WHERE status = 'simulated' AND (home_team_id = ?1 OR away_team_id = ?1)
      ORDER BY simulated_at DESC LIMIT 2`,
  ).bind(club.u21_id).all<MatchRow>()).results;
  const ids = parents.map((p) => p.player_id);
  const marks = ids.map(() => "?").join(", ");
  const minutes = new Map<string, number>();
  if (matches.length > 0) {
    const stats = await db.prepare(
      `SELECT match_id, player_id, minutes_played FROM match_player_stats
        WHERE match_id IN (${matches.map(() => "?").join(", ")}) AND player_id IN (${marks})`,
    ).bind(...matches.map((m) => m.id), ...ids).all<{ match_id: string; player_id: string; minutes_played: number | null }>();
    for (const s of stats.results) minutes.set(`${s.match_id}|${s.player_id}`, s.minutes_played ?? 0);
  }
  const injuries = (await db.prepare(
    `SELECT id, player_id, created_at FROM injuries
      WHERE player_id IN (${marks}) AND days_remaining > 0 AND COALESCE(is_fake, 0) = 0
      ORDER BY created_at DESC`,
  ).bind(...ids).all<{ id: string; player_id: string; created_at: string }>()).results;

  const latest = matches[0];
  const prev = matches[1];
  let triggered = 0;
  for (const p of parents) {
    const archetype = p.archetype as ParentArchetype;
    const injury = injuries.find((i) => i.player_id === p.player_id);
    const freshInjury = injury && injury.id !== p.last_injury_id && hoursSince(injury.created_at, now) <= INJURY_FRESH_HOURS ? injury : null;
    const freshMatch = latest && latest.id !== p.last_match_key && hoursSince(latest.simulated_at, now) <= MATCH_FRESH_HOURS ? latest : null;
    if (!freshInjury && !freshMatch) continue;

    let topic: ParentTopic | null = null;
    let key: string | null = null;
    if (freshInjury) {
      topic = "injury";
      key = freshInjury.id;
    } else if (freshMatch) {
      const played = (minutes.get(`${freshMatch.id}|${p.player_id}`) ?? 0) > 0;
      const playedPrev = prev ? (minutes.get(`${prev.id}|${p.player_id}`) ?? 0) > 0 : true;
      if (!played && prev && !playedPrev && !injury) {
        topic = "benched";
        key = freshMatch.id;
      } else if (played && teamWon(freshMatch, club.u21_id) && rng() < WIN_CHANCE) {
        topic = "win";
        key = freshMatch.id;
      }
    }
    const quiet = !!p.awaiting_reply_until
      || hoursSince(p.offended_at, now) < OFFENDED_DAYS * 24
      || hoursSince(p.last_sms_at, now) < SMS_GAP_HOURS;
    if (topic && (quiet || !parentWritesAbout(archetype, topic))) topic = null;
    const due = topic ? parentDeliveryTime(now, seedFromString(`${p.id}|${key}`)).toISOString() : null;

    const claim = await db.prepare(
      `UPDATE youth_parents SET last_match_key = ?1, last_injury_id = ?2, pending_topic = ?3, pending_key = ?4, pending_due_at = ?5
        WHERE id = ?6 AND pending_topic IS NULL AND COALESCE(last_match_key, '') = ?7 AND COALESCE(last_injury_id, '') = ?8`,
    ).bind(
      freshMatch ? freshMatch.id : p.last_match_key, freshInjury ? freshInjury.id : p.last_injury_id,
      topic, topic ? key : null, due, p.id, p.last_match_key ?? "", p.last_injury_id ?? "",
    ).run();
    if (topic && (claim.meta?.changes ?? 0) > 0) triggered++;
  }
  return triggered;
}

// ── SMS po spouštěči ────────────────────────────────────────────────────────

/** SMS, jejichž čas nastal. Zabírá se před odesláním, takže druhý běh ji nepošle znovu. */
async function sendDueMessages(db: D1Database, env: ParentEnv, ai: AiContext | null, now: Date): Promise<number> {
  const iso = now.toISOString();
  const rows = (await db.prepare(
    `${PARENT_SELECT} WHERE yp.pending_due_at IS NOT NULL AND yp.pending_due_at <= ? ORDER BY yp.pending_due_at LIMIT ?`,
  ).bind(iso, MAX_ROWS_PER_RUN).all<ParentWithSon>()).results;
  let sent = 0;
  for (const row of rows) {
    const topic = row.pending_topic as ParentTopic | null;
    if (!topic || !row.pending_key || !isParentArchetype(row.archetype) || !sonInYouth(row)) {
      // AI klub, syn už v dorostu není: rodič nemá komu psát, spouštěč se jen odbaví.
      await db.prepare("UPDATE youth_parents SET pending_topic = NULL, pending_key = NULL, pending_due_at = NULL WHERE id = ? AND pending_due_at = ?")
        .bind(row.id, row.pending_due_at).run();
      continue;
    }
    const archetype = row.archetype;
    const offer = topic === "benched" && archetype === "sponsor_dad" && (await activeDealAmount(db, row.player_id)) === null
      ? dealAmount(seedFromString(`${row.id}|${row.pending_key}`)) : null;
    const awaiting = topicNeedsReply(archetype, topic) ? new Date(now.getTime() + PARENT_REPLY_HOURS * HOUR_MS).toISOString() : null;
    const claim = await db.prepare(
      `UPDATE youth_parents SET pending_topic = NULL, pending_key = NULL, pending_due_at = NULL,
              last_sms_at = ?1, sms_count = sms_count + 1, awaiting_reply_until = ?2,
              deal_offer_amount = ?3, deal_offer_at = CASE WHEN ?3 IS NULL THEN NULL ELSE ?1 END
        WHERE id = ?4 AND pending_key = ?5 AND pending_due_at <= ?1`,
    ).bind(iso, awaiting, offer, row.id, row.pending_key).run();
    if (!(claim.meta?.changes ?? 0)) continue;
    try {
      const facts = factsOf(row, row.sms_count === 0);
      const history = await loadHistory(db, row.team_id, row.player_id, 6);
      const prompt = buildParentSmsPrompt(facts, topic, { dealAmount: offer ?? undefined, history });
      const fromModel = checkParentSms(await askModel(ai, prompt), { requireAmount: offer ?? undefined });
      if (!fromModel && modelOn(ai)) logger.warn({ module: M, teamId: row.team_id }, `SMS rodiče ${row.id} od modelu neprošla, beru připravenou`);
      const body = fromModel ?? fallbackParentSms(facts, topic, seedFromString(`${row.id}|${row.pending_key}`), { dealAmount: offer ?? undefined });
      await postParentMessage(db, env, row.team_id, row, body, now);
      sent++;
    } catch (e) {
      logger.warn({ module: M, teamId: row.team_id }, `SMS rodiče ${row.id}`, e);
    }
  }
  return sent;
}

// ── Ticho trenéra a uražený rodič ───────────────────────────────────────────

async function coachRepliedSince(db: D1Database, teamId: string, playerId: string, since: string | null): Promise<boolean> {
  if (!since) return false;
  const r = await db.prepare(
    `SELECT 1 FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.team_id = ? AND c.type = 'system' AND c.participant_id = ? AND m.sender_type = 'user'
        AND julianday(m.sent_at) > julianday(?) LIMIT 1`,
  ).bind(teamId, parentParticipantId(playerId), since).first();
  return !!r;
}

/** Rodič čekal na odpověď a lhůta vypršela: urazí se (jednou, zabírá se podmíněným UPDATE). */
async function handleSilence(db: D1Database, env: ParentEnv, ai: AiContext | null, now: Date): Promise<number> {
  const iso = now.toISOString();
  const rows = (await db.prepare(
    `${PARENT_SELECT} WHERE yp.awaiting_reply_until IS NOT NULL AND yp.awaiting_reply_until <= ? LIMIT ?`,
  ).bind(iso, MAX_ROWS_PER_RUN).all<ParentWithSon>()).results;
  let offended = 0;
  for (const row of rows) {
    // Odpověď trenéra, kterou zpracování nestihlo zapsat, se počítá: rodič se neurazí.
    if (await coachRepliedSince(db, row.team_id, row.player_id, row.last_sms_at)) {
      await db.prepare("UPDATE youth_parents SET awaiting_reply_until = NULL WHERE id = ? AND awaiting_reply_until = ?")
        .bind(row.id, row.awaiting_reply_until).run();
      continue;
    }
    const claim = await db.prepare(
      `UPDATE youth_parents SET awaiting_reply_until = NULL, mood = 'offended', offended_at = ?1,
              deal_offer_amount = NULL, deal_offer_at = NULL
        WHERE id = ?2 AND awaiting_reply_until = ?3`,
    ).bind(iso, row.id, row.awaiting_reply_until).run();
    if (!(claim.meta?.changes ?? 0)) continue;
    // AI klub nebo syn už v klubu není: urazí se mlčky, nikomu nic nepíše.
    if (!sonInClub(row) || !isParentArchetype(row.archetype)) continue;
    try {
      await applyOffense(db, env, ai, row, "silence", now, { sendParentSms: true });
      offended++;
    } catch (e) {
      logger.warn({ module: M, teamId: row.team_id }, `uražený rodič ${row.id}`, e);
    }
  }
  return offended;
}

/**
 * Dopad uraženého rodiče. Máma pohrozí Vimperkem a syn dostane nespokojenost s důvodem `parent`
 * (nejvýš jednou za měsíc), ctižádostivý táta synovi vytmaví, že ho trenér přehlíží (nálada).
 * `sendParentSms` = rodič to trenérovi napíše (u hrubé odpovědi to už řekl v ní).
 */
async function applyOffense(
  db: D1Database, env: ParentEnv, ai: AiContext | null, row: ParentWithSon, reason: "silence" | "rude", now: Date,
  opts: { sendParentSms: boolean },
): Promise<void> {
  const facts = { ...factsOf(row, false), mood: "offended" as const };
  if (opts.sendParentSms && facts.archetype !== "quiet") {
    const history = await loadHistory(db, row.team_id, row.player_id, 6);
    const fromModel = checkParentSms(await askModel(ai, buildOffendedPrompt(facts, reason, history)),
      { requireWord: isMother(facts.archetype) ? THREAT_TOWN : undefined });
    const body = fromModel ?? fallbackOffendedSms(facts, seedFromString(`${row.id}|${now.toISOString()}`));
    if (body) await postParentMessage(db, env, row.team_id, row, body, now);
  }
  const son = {
    id: row.player_id, firstName: row.son_first ?? "", lastName: row.son_last ?? "", nickname: row.son_nickname, avatar: row.son_avatar,
  };
  const { sendPlayerSMS } = await import("../messaging/system-sms");
  if (facts.archetype === "worried_mother") {
    const iso = now.toISOString();
    const threat = await db.prepare(
      `UPDATE youth_parents SET threat_at = ?1
        WHERE id = ?2 AND (threat_at IS NULL OR julianday(threat_at) < julianday(?1) - ?3)`,
    ).bind(iso, row.id, THREAT_GAP_DAYS).run();
    if (!(threat.meta?.changes ?? 0)) return;
    await pushSonTowardThreatTown(db, row.player_id, now);
    await sendPlayerSMS(db, row.team_id, son, reasonSms("parent", undefined));
  } else if (facts.archetype === "ambitious_father") {
    await db.prepare(
      `UPDATE players SET life_context = json_set(CASE WHEN json_valid(life_context) THEN life_context ELSE '{}' END,
         '$.morale', MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) - ?))) WHERE id = ?`,
    ).bind(FATHER_MORALE_HIT, row.player_id).run();
    await sendPlayerSMS(db, row.team_id, son, FATHER_PRESSURE_SMS[seedFromString(row.id) % FATHER_PRESSURE_SMS.length]);
  }
}

/**
 * Máma doma tlačí kluka do Vimperka: nespokojenost s důvodem `parent` (dohody na ni nabídne
 * telefon jako u každé jiné). Když už syn nespokojený je, důvod se přidá a nespokojenost vzroste.
 */
async function pushSonTowardThreatTown(db: D1Database, playerId: string, now: Date): Promise<void> {
  const r = await db.prepare("SELECT life_context FROM players WHERE id = ?").bind(playerId).first<{ life_context: string | null }>();
  let lc: Record<string, unknown> = {};
  try {
    lc = r?.life_context ? (JSON.parse(r.life_context) as Record<string, unknown>) ?? {} : {};
  } catch (e) {
    logger.warn({ module: M }, `nečitelný life_context hráče ${playerId}`, e);
  }
  const prev = (lc.transferUnrest ?? null) as TransferUnrest | null;
  const iso = now.toISOString();
  // Nejvýš tři důvody od nejsilnějšího: rodiče se přidají za dva nejsilnější.
  const reasons = prev?.reasons?.includes("parent") ? prev.reasons : [...(prev?.reasons ?? []).slice(0, 2), "parent" as const];
  const next: TransferUnrest = {
    ...(prev ?? {}),
    level: Math.min(100, prev ? Math.max(0, prev.level) + PARENT_UNREST_ADD : PARENT_UNREST_LEVEL),
    reason: prev?.reason ?? "parent_pressure",
    since: prev?.since ?? iso,
    lastImpactAt: iso,
    reasons,
    deals: prev?.deals ?? [],
  };
  await db.prepare(
    `UPDATE players SET life_context = json_set(CASE WHEN json_valid(life_context) THEN life_context ELSE '{}' END,
       '$.transferUnrest', json(?)) WHERE id = ?`,
  ).bind(JSON.stringify(next), playerId).run();
}

// ── Dohody táty podnikatele ─────────────────────────────────────────────────

interface DealRow {
  id: string;
  team_id: string;
  player_id: string;
  made_at: string;
  due_at: string;
  details: string | null;
  roster_team_id: string | null;
  player_club_id: string | null;
  club_user_id: string | null;
  club_game_date: string | null;
}

function dealDetails(raw: string | null): { amount: number; parentId: string | null } {
  try {
    const d = raw ? (JSON.parse(raw) as { amount?: unknown; parentId?: unknown }) : {};
    return { amount: Math.max(0, Math.round(Number(d.amount) || 0)), parentId: typeof d.parentId === "string" ? d.parentId : null };
  } catch (e) {
    logger.warn({ module: M }, "nečitelné detaily dohody s rodičem", e);
    return { amount: 0, parentId: null };
  }
}

async function closeDeal(db: D1Database, id: string, status: "kept" | "broken" | "expired", now: Date): Promise<boolean> {
  const r = await db.prepare("UPDATE coach_commitments SET status = ?, resolved_at = ? WHERE id = ? AND status = 'active'")
    .bind(status, now.toISOString(), id).run();
  return (r.meta?.changes ?? 0) === 1;
}

/**
 * Dohoda platí pro příští zápas, kde syn mohl hrát (stejné pravidlo jako slib základu
 * `start_next`): nastoupil od začátku = peníze, nezačal = dohoda padá, zraněný nebo pryč
 * z klubu = vyprší bez výčitek. Peníze se pohnou až po zabrání dohody, jen jednou.
 */
async function settleParentDeals(db: D1Database, env: ParentEnv, ai: AiContext | null, now: Date): Promise<number> {
  const rows = (await db.prepare(
    `SELECT cc.id, cc.team_id, cc.player_id, cc.made_at, cc.due_at, cc.details,
            p.team_id AS roster_team_id, COALESCE(rt.parent_team_id, rt.id) AS player_club_id,
            c.user_id AS club_user_id, c.game_date AS club_game_date
       FROM coach_commitments cc
       LEFT JOIN players p ON p.id = cc.player_id
       LEFT JOIN teams rt ON rt.id = p.team_id
       LEFT JOIN teams c ON c.id = cc.team_id
      WHERE cc.kind = 'parent_deal' AND cc.status = 'active'
      ORDER BY cc.made_at LIMIT ?`,
  ).bind(MAX_ROWS_PER_RUN).all<DealRow>()).results;
  if (rows.length === 0) return 0;
  const { lineupVerdict, loadCommitmentMatches } = await import("../messaging/coach-commitments");
  let settled = 0;
  for (const r of rows) {
    try {
      const d = dealDetails(r.details);
      if (!r.roster_team_id || r.player_club_id !== r.team_id || !r.club_user_id || r.club_user_id === "ai") {
        if (await closeDeal(db, r.id, "expired", now)) settled++;
        continue;
      }
      const duePassed = timeOf(r.due_at) < now.getTime();
      const matches = await loadCommitmentMatches(db, r.player_id, r.team_id, r.made_at);
      let verdict = lineupVerdict("start_next", matches, r.roster_team_id, { duePassed });
      if (verdict === "broken") {
        const injured = await db.prepare("SELECT 1 FROM injuries WHERE player_id = ? AND days_remaining > 0 LIMIT 1").bind(r.player_id).first();
        if (injured) verdict = "expired";
      }
      if (verdict === "pending") continue;
      if (verdict === "expired") {
        if (await closeDeal(db, r.id, "expired", now)) settled++;
        continue;
      }
      const parent = d.parentId ? await loadParent(db, "yp.id = ?", d.parentId) : null;
      if (!(await closeDeal(db, r.id, verdict, now))) continue;
      // Platba se nepovedla: dohoda je zase ve hře a vyhodnotí se v dalším běhu.
      if (verdict === "kept" && d.amount > 0 && !(await payParentDeal(db, r, d.amount, parent, now))) continue;
      settled++;
      if (!parent || !isParentArchetype(parent.archetype)) continue;
      await db.prepare("UPDATE youth_parents SET mood = ?, last_sms_at = ? WHERE id = ?")
        .bind(verdict === "kept" ? "pleased" : "upset", now.toISOString(), parent.id).run();
      const facts = factsOf(parent, false);
      const fromModel = checkParentSms(await askModel(ai, buildDealResultPrompt(facts, verdict, d.amount)),
        { requireAmount: verdict === "kept" ? d.amount : undefined });
      const body = fromModel && (verdict === "kept" || !/\d/.test(fromModel))
        ? fromModel : fallbackDealResultSms(facts, verdict, d.amount, seedFromString(r.id));
      await postParentMessage(db, env, r.team_id, parent, body, now);
    } catch (e) {
      logger.warn({ module: M, teamId: r.team_id }, `dohoda s rodičem ${r.id}`, e);
    }
  }
  return settled;
}

/** Příspěvek na účet klubu. Už zapsaná platba se neopakuje; chyba vrátí dohodu do hry. */
async function payParentDeal(db: D1Database, r: DealRow, amount: number, parent: ParentWithSon | null, now: Date): Promise<boolean> {
  const referenceId = `parent-deal-${r.id}`;
  const already = await db.prepare("SELECT 1 FROM transactions WHERE team_id = ? AND reference_id = ? LIMIT 1").bind(r.team_id, referenceId).first();
  if (already) return true;
  try {
    const { recordTransaction } = await import("../season/finance-processor");
    const who = parent ? `${parent.first_name} ${parent.last_name}` : "rodič hráče z dorostu";
    await recordTransaction(db, r.team_id, "parent_contribution", amount, `Příspěvek od rodiče: ${who}`,
      r.club_game_date ?? now.toISOString().slice(0, 10), referenceId);
    return true;
  } catch (e) {
    logger.error({ module: M, teamId: r.team_id }, `příspěvek rodiče ${r.id}`, e);
    await db.prepare("UPDATE coach_commitments SET status = 'active', resolved_at = NULL WHERE id = ?").bind(r.id).run()
      .catch((err) => logger.error({ module: M }, `vrácení dohody s rodičem po chybě ${r.id}`, err));
    return false;
  }
}

/** Trenér kývl na nabídku: nabídka se zabere a vznikne dohoda (id podle nabídky, nikdy dvakrát). */
async function acceptParentDeal(
  db: D1Database, row: ParentWithSon, amount: number, msg: { teamId: string; convId: string; text: string }, now: Date,
): Promise<boolean> {
  const claim = await db.prepare(
    `UPDATE youth_parents SET deal_offer_amount = NULL, deal_offer_at = NULL, mood = 'pleased'
      WHERE id = ?1 AND deal_offer_amount = ?2 AND deal_offer_at = ?3`,
  ).bind(row.id, amount, row.deal_offer_at).run();
  if (!(claim.meta?.changes ?? 0)) return false;
  const iso = now.toISOString();
  await db.prepare(
    `INSERT OR IGNORE INTO coach_commitments (id, team_id, player_id, conversation_id, kind, status, made_at, due_at, quote, details)
     VALUES (?, ?, ?, ?, 'parent_deal', 'active', ?, ?, ?, ?)`,
  ).bind(
    `pd-${row.id}-${seedFromString(row.deal_offer_at ?? iso)}`, msg.teamId, row.player_id, msg.convId, iso,
    new Date(now.getTime() + PARENT_DEAL_DAYS * 24 * HOUR_MS).toISOString(), msg.text.slice(0, 200),
    JSON.stringify({ amount, parentId: row.id }),
  ).run();
  logger.info({ module: M, teamId: msg.teamId }, `dohoda s rodičem ${row.id}: ${amount} Kč, když ${row.player_id} nastoupí od začátku`);
  return true;
}

// ── Odpověď rodiče ──────────────────────────────────────────────────────────

/**
 * Trenér napsal rodiči (routes/messaging.ts, předpona `yp-`): odpověď přes model, bez modelu
 * připravená věta. Trenér odpověděl, takže lhůta padá. Kývnutí na nabídku založí dohodu,
 * odmítnutí ji stáhne, hrubost rodiče urazí, vlídnost uraženého usmíří. `pace` dočká zbytek
 * prodlevy „píše…“. false = rodič neexistuje nebo nepatří tomuhle klubu (volající vrátí kredit).
 */
export async function replyToParentMessage(
  db: D1Database,
  env: ParentEnv,
  msg: { teamId: string; convId: string; playerId: string; text: string; now?: Date },
  pace: () => Promise<void>,
  aiOverride?: AiContext | null,
): Promise<boolean> {
  const now = msg.now ?? new Date();
  const row = await loadParent(db, "yp.player_id = ?", msg.playerId);
  if (!row || row.team_id !== msg.teamId || !isParentArchetype(row.archetype)) return false;
  const ai = await resolveAi(env, aiOverride);

  const history = await loadHistory(db, msg.teamId, row.player_id, 12);
  // Zprávu trenéra už routa uložila; do promptu jde zvlášť jako poslední zpráva.
  const last = history[history.length - 1];
  if (last && last.from === "coach" && last.body === msg.text) history.pop();
  const offer = row.deal_offer_amount && hoursSince(row.deal_offer_at, now) <= OFFER_TTL_DAYS * 24 ? row.deal_offer_amount : null;
  const activeDeal = offer ? null : await activeDealAmount(db, row.player_id);
  const facts = factsOf(row, false);

  const guard = classifyCoachReply(msg.text);
  const fromModel = parseParentReply(await askModel(ai, buildParentReplyPrompt(facts, history, msg.text, { offerAmount: offer, activeDealAmount: activeDeal }), 300));
  if (!fromModel && modelOn(ai)) logger.warn({ module: M, teamId: msg.teamId }, `odpověď rodiče ${row.id} od modelu neprošla, beru připravenou`);
  // Jasné „ne“ v textu trenéra přebije kývnutí od modelu, hrubost se pozná i bez modelu.
  let intent = fromModel ? fromModel.intent : guard.intent;
  if (guard.intent === "decline" && intent === "accept") intent = "decline";
  if (!offer) intent = "none";
  const tone = guard.tone === "rude" ? "rude" : fromModel ? fromModel.tone : guard.tone;

  const iso = now.toISOString();
  await db.prepare("UPDATE youth_parents SET awaiting_reply_until = NULL, last_coach_reply_at = ? WHERE id = ?").bind(iso, row.id).run();
  let outcome: ReplyOutcome = tone === "rude" ? "rude" : tone === "kind" ? "kind" : "neutral";
  let dealAccepted = false;
  if (offer && intent === "accept") {
    dealAccepted = await acceptParentDeal(db, row, offer, msg, now);
    if (dealAccepted) outcome = "deal_accepted";
  } else if (offer && intent === "decline") {
    await db.prepare("UPDATE youth_parents SET deal_offer_amount = NULL, deal_offer_at = NULL, mood = 'upset' WHERE id = ? AND deal_offer_amount IS NOT NULL")
      .bind(row.id).run();
    if (tone !== "rude") outcome = "deal_declined";
  }
  if (tone === "rude" && !dealAccepted) {
    const wasOffended = hoursSince(row.offended_at, now) < 24;
    await db.prepare("UPDATE youth_parents SET mood = 'offended', offended_at = ?, deal_offer_amount = NULL, deal_offer_at = NULL WHERE id = ?")
      .bind(iso, row.id).run();
    // Dopad (výhrůžka, nálada syna) jen poprvé, ne za každou další hrubou SMS téhož dne.
    if (!wasOffended && sonInClub(row)) await applyOffense(db, env, ai, row, "rude", now, { sendParentSms: false });
  } else if (tone === "kind" && (row.mood === "offended" || row.mood === "upset")) {
    await db.prepare("UPDATE youth_parents SET mood = 'calm', offended_at = NULL WHERE id = ? AND mood IN ('offended', 'upset')").bind(row.id).run();
  }

  const modelBodyFits = !!fromModel
    && (outcome !== "deal_accepted" || checkParentSms({ body: fromModel.body }, { requireAmount: offer ?? undefined }) !== null)
    && (outcome !== "rude" || !isMother(facts.archetype) || checkParentSms({ body: fromModel.body }, { requireWord: THREAT_TOWN }) !== null);
  const body = modelBodyFits && fromModel
    ? fromModel.body
    : fallbackParentReply(facts, outcome, seedFromString(`${msg.convId}|${msg.text}|${history.length}`), offer ?? undefined);
  await pace();
  await postParentMessage(db, env, msg.teamId, row, body, msg.now ? new Date(now.getTime() + 1000) : new Date());
  return true;
}
