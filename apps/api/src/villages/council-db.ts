/**
 * Zasedání zastupitelstva v databázi (F18).
 *
 * 1. Denní tick v herní pondělí (`createMonthlyCouncilSessions`): obec s lidským seniorským
 *    klubem dostane jedno zasedání za herní měsíc. Bank podle velikosti obce, žadatelé hasiči,
 *    myslivci a každý klub obce (i AI klub). Zasedání je za dva dny v šest večer.
 * 2. Hodinový běh Telefonu (`tickVillageCouncil`), jen přes den:
 *    - starosta (`village_officials`, kontakt `vo-<id>`) pozve trenéry lidských klubů SMS,
 *    - trenér odpoví proslovem (routes/messaging.ts → `handleCouncilReply`), starosta
 *      odepíše s prodlevou, v den zasedání od poledne připomene, kdo nic neposlal,
 *    - po zasedání model posoudí proslovy (bez modelu pravidlo), AI klub napíše proslov
 *      modelem (bez modelu připravený podle povahy), bank se rozdělí beze zbytku, dotace jdou
 *      přes `recordTransaction` (`village_grant`, referenceId = id řádku dotace), vyjde článek
 *      `village_council` v každé soutěži, kde klub obce hraje, a SMS od Redakce Zpravodaje.
 *
 * Lhůta je začátek zasedání: kdo do té doby nic nepošle (neaktivní klub), dostane minimum.
 * Opakovaný běh nic nezdvojí: zasedání a dotace mají deterministická id, rozdělení se zabírá
 * podmíněným UPDATE, výplata hlídá referenceId a každá SMS se zabírá před odesláním.
 */
import { logger } from "../lib/logger";
import { aiContextFromEnv, generateText, type AiContext } from "../lib/ai-provider";
import { seedFromString } from "../lib/seed";
import type { OptionalPushKeys } from "../community/phone-push";
import type { CoachMode } from "../ai-coach/mode";
import {
  addDays, buildAiSpeechPrompt, buildArticlePrompt, buildJudgePrompt, checkCouncilArticle, COUNCIL_NEWS_DESK, COUNCIL_NEWS_TYPE,
  COUNCIL_PREFIX, COUNCIL_REPLIES, councilParticipantId, councilPot, councilReplyDueAt, councilSchedule, councilTaste, czk,
  DAY_END, DAY_START, decisionReady, fallbackAiSpeech, pragueParts, fallbackCouncilArticle, favorDelta, invitationText, parseAiSpeech, parseJudgeAnswer,
  reminderDue, reminderText, redakceSmsText, ruleSpeechVerdict, sessionInProgress, splitCouncilPot, weekdayAdjective,
  type ArticleClub, type ArticleFacts, type PotApplicant, type SpeechVerdict,
} from "./council";

const M = "village-council";
/** Proslov se skládá z SMS trenéra, delší se ořízne. */
const SPEECH_MAX = 1500;
/** Rozdělení, které nikdo nedokončil (pád workeru), se po čtvrthodině převezme. */
const CLAIM_TTL_MS = 15 * 60_000;
/** Zasedání za jeden hodinový běh (každé je pár volání modelu). */
const MAX_SESSIONS_PER_RUN = 3;
const MODEL_TIMEOUT_MS = 20_000;

export type CouncilEnv = {
  CACHE_KV?: KVNamespace;
  GEMINI_API_KEY?: string;
  AI?: Ai;
  AI_GATEWAY_URL?: string;
} & OptionalPushKeys;

export interface CouncilOpts {
  /** null = AI vypnutá (pravidlo a připravené texty); bez hodnoty se vezme z env. */
  ai?: AiContext | null;
  /** Režim AI trenérů pro proslov AI klubu; bez hodnoty z CACHE_KV (`ai_coach_mode`). */
  coachMode?: CoachMode;
}

export interface CouncilTickResult { replies: number; invited: number; reminded: number; decided: number }

const nowIso = () => new Date().toISOString();

function isHuman(userId: string | null | undefined): boolean {
  return !!userId && userId !== "ai";
}

function modelOn(ai: AiContext | null): ai is AiContext {
  return !!ai && ai.provider !== "off";
}

async function askModel(ai: AiContext | null, prompt: string, maxTokens: number, temperature: number): Promise<string | null> {
  if (!modelOn(ai)) return null;
  return generateText(ai, prompt, { json: true, maxTokens, temperature, module: M, timeoutMs: MODEL_TIMEOUT_MS })
    .catch((e) => { logger.warn({ module: M }, "volání modelu pro zastupitelstvo", e); return null; });
}

async function resolveAi(env: CouncilEnv, opts: CouncilOpts): Promise<AiContext | null> {
  if (opts.ai !== undefined) return opts.ai;
  return aiContextFromEnv(env).catch((e) => { logger.warn({ module: M }, "AI kontext pro zastupitelstvo", e); return null; });
}

// ── Založení v pondělí ──────────────────────────────────────────────────────

/** Seniorské kluby obce v hrající soutěži (čekající soutěž ne, dorost ne). */
const CLUB_FILTER = `t.parent_team_id IS NULL AND COALESCE(t.team_type, 'senior') = 'senior' AND t.user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM leagues l WHERE l.id = t.league_id AND COALESCE(l.waiting, 0) = 0)`;

export function councilSessionId(villageId: string, month: string): string {
  return `vcs-${villageId}-${month}`;
}

/**
 * Pondělní větev denního ticku: zasedání pro každou obec s lidským klubem, které v herním
 * měsíci ještě nemá. Vrací počet nově založených. Opakovaný běh nic nezdvojí (INSERT OR IGNORE).
 */
export async function createMonthlyCouncilSessions(db: D1Database, gameDay: string, now: Date = new Date()): Promise<number> {
  const month = gameDay.slice(0, 7);
  const villages = await db.prepare(
    `SELECT DISTINCT t.village_id, v.size FROM teams t JOIN villages v ON v.id = t.village_id
      WHERE ${CLUB_FILTER} AND t.user_id != 'ai'
        AND NOT EXISTS (SELECT 1 FROM village_council_sessions s WHERE s.village_id = t.village_id AND s.month = ?)`,
  ).bind(month).all<{ village_id: string; size: string | null }>();
  let created = 0;
  for (const v of villages.results) {
    try {
      const clubs = await db.prepare(`SELECT t.id FROM teams t WHERE t.village_id = ? AND ${CLUB_FILTER} ORDER BY t.id`)
        .bind(v.village_id).all<{ id: string }>();
      const { ensureVillageOfficials } = await import("./officials-store");
      const mayor = (await ensureVillageOfficials(db, v.village_id)).find((o) => o.role === "starosta");
      if (!mayor) {
        logger.warn({ module: M }, `obec ${v.village_id} nemá starostu, zasedání nezakládám`);
        continue;
      }
      const sessionId = councilSessionId(v.village_id, month);
      const seed = seedFromString(sessionId);
      const schedule = councilSchedule(now, seed);
      const grantStmt = (key: string, applicant: string, teamId: string | null) => db.prepare(
        "INSERT OR IGNORE INTO village_grants (id, session_id, village_id, applicant, team_id) VALUES (?, ?, ?, ?, ?)",
      ).bind(`vg-${sessionId}-${key}`, sessionId, v.village_id, applicant, teamId);
      const res = await db.batch([
        db.prepare(
          `INSERT OR IGNORE INTO village_council_sessions
             (id, village_id, month, session_date, pot, status, mayor_id, mayor_name, invite_due_at, deadline_at, created_at)
           VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
        ).bind(
          sessionId, v.village_id, month, addDays(gameDay, schedule.sessionOffsetDays), councilPot(v.size, seed),
          mayor.id, `${mayor.first_name} ${mayor.last_name}`, schedule.inviteDueAt, schedule.deadlineAt, now.toISOString(),
        ),
        grantStmt("firefighters", "firefighters", null),
        grantStmt("hunters", "hunters", null),
        ...clubs.results.map((c) => grantStmt(c.id, "club", c.id)),
      ]);
      if ((res[0]?.meta?.changes ?? 0) > 0) created++;
    } catch (e) {
      logger.warn({ module: M }, `zasedání obce ${v.village_id}`, e);
    }
  }
  if (created > 0) logger.info({ module: M }, `zastupitelstvo: ${created} nových zasedání (${month})`);
  return created;
}

// ── Telefon se starostou ────────────────────────────────────────────────────

interface MayorInfo {
  id: string;
  first_name: string;
  last_name: string;
  personality: string | null;
  face_config: string | null;
}

async function loadMayor(db: D1Database, mayorId: string, mayorName: string | null): Promise<MayorInfo> {
  const row = await db.prepare("SELECT id, first_name, last_name, personality, face_config FROM village_officials WHERE id = ?")
    .bind(mayorId).first<MayorInfo>()
    .catch((e) => { logger.warn({ module: M }, "starosta obce", e); return null; });
  if (row) return row;
  // Starosta mezitím prohrál volby: vlákno patří tomu, kdo zval.
  const [first, ...rest] = (mayorName ?? "Starosta").split(" ");
  return { id: mayorId, first_name: first, last_name: rest.join(" "), personality: null, face_config: null };
}

function mayorTitle(m: Pick<MayorInfo, "first_name" | "last_name">): string {
  return `Starosta ${m.first_name} ${m.last_name}`.trim();
}

async function mayorConversation(db: D1Database, teamId: string, mayor: MayorInfo): Promise<string> {
  const participantId = councilParticipantId(mayor.id);
  const existing = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND participant_id = ?")
    .bind(teamId, participantId).first<{ id: string }>();
  if (existing) return existing.id;
  const convId = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO conversations
      (id, team_id, type, title, participant_id, participant_avatar, pinned, unread_count, last_message_text, last_message_at, created_at)
     VALUES (?, ?, 'system', ?, ?, ?, 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
  ).bind(convId, teamId, mayorTitle(mayor), participantId, mayor.face_config).run();
  return convId;
}

/** Čas zprávy ve formátu ostatních zpráv v Telefonu (bez milisekund). */
function messageTime(now: Date): string {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function postMayorMessage(
  db: D1Database, env: CouncilEnv, now: Date,
  m: { teamId: string; convId: string; mayorId: string; sender: string; body: string; sessionId: string },
): Promise<void> {
  const at = messageTime(now);
  await db.batch([
    db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at)
       VALUES (?, ?, 'system', ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), m.convId, councilParticipantId(m.mayorId), m.sender, m.body,
      JSON.stringify({ type: "village_council", sessionId: m.sessionId }), at),
    db.prepare(
      "UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = ? WHERE id = ?",
    ).bind(m.body.slice(0, 100), at, m.convId),
  ]);
  const { pushPhoneMessage } = await import("../community/phone-push");
  await pushPhoneMessage(db, env, { teamId: m.teamId, convId: m.convId, sender: m.sender, text: m.body });
}

/** Pozvánky lidským klubům, kterým ještě nepřišly. Pozvánka se zabírá před odesláním. */
async function sendInvitations(db: D1Database, env: CouncilEnv, now: Date): Promise<number> {
  const iso = now.toISOString();
  const rows = await db.prepare(
    `SELECT g.id, g.team_id, g.session_id, s.pot, s.deadline_at, s.mayor_id, s.mayor_name
       FROM village_grants g
       JOIN village_council_sessions s ON s.id = g.session_id
       JOIN teams t ON t.id = g.team_id
      WHERE s.status = 'open' AND s.invite_due_at <= ?1 AND s.deadline_at > ?1
        AND g.applicant = 'club' AND g.invited_at IS NULL
        AND t.user_id IS NOT NULL AND t.user_id != 'ai' AND t.village_id = s.village_id
      ORDER BY s.invite_due_at LIMIT 50`,
  ).bind(iso).all<{ id: string; team_id: string; session_id: string; pot: number; deadline_at: string; mayor_id: string; mayor_name: string | null }>();
  let sent = 0;
  for (const r of rows.results) {
    const claim = await db.prepare("UPDATE village_grants SET invited_at = ? WHERE id = ? AND invited_at IS NULL").bind(iso, r.id).run();
    if (!(claim.meta?.changes ?? 0)) continue;
    try {
      const mayor = await loadMayor(db, r.mayor_id, r.mayor_name);
      const others = await db.prepare(
        `SELECT t.name FROM village_grants g JOIN teams t ON t.id = g.team_id
          WHERE g.session_id = ? AND g.applicant = 'club' AND g.team_id != ? ORDER BY t.name`,
      ).bind(r.session_id, r.team_id).all<{ name: string }>();
      const body = invitationText({
        mayorFirstName: mayor.first_name, mayorLastName: mayor.last_name, personality: mayor.personality,
        pot: r.pot, deadlineAt: r.deadline_at, otherClubs: others.results.map((o) => o.name),
      });
      const convId = await mayorConversation(db, r.team_id, mayor);
      await db.prepare("UPDATE village_grants SET conv_id = ? WHERE id = ?").bind(convId, r.id).run();
      await postMayorMessage(db, env, now, { teamId: r.team_id, convId, mayorId: mayor.id, sender: mayorTitle(mayor), body, sessionId: r.session_id });
      sent++;
    } catch (e) {
      logger.warn({ module: M, teamId: r.team_id }, `pozvánka na zasedání ${r.session_id}`, e);
    }
  }
  return sent;
}

/** V den zasedání od poledne: kdo dostal pozvánku a nic neposlal, dostane připomínku (jednou). */
async function sendReminders(db: D1Database, env: CouncilEnv, now: Date): Promise<number> {
  const iso = now.toISOString();
  const rows = await db.prepare(
    `SELECT g.id, g.team_id, g.conv_id, g.session_id, s.deadline_at, s.mayor_id, s.mayor_name
       FROM village_grants g
       JOIN village_council_sessions s ON s.id = g.session_id
       JOIN teams t ON t.id = g.team_id
      WHERE s.status = 'open' AND s.deadline_at > ? AND g.applicant = 'club'
        AND g.invited_at IS NOT NULL AND g.conv_id IS NOT NULL AND g.speech IS NULL AND g.reminded_at IS NULL
        AND t.user_id IS NOT NULL AND t.user_id != 'ai'
      LIMIT 50`,
  ).bind(iso).all<{ id: string; team_id: string; conv_id: string; session_id: string; deadline_at: string; mayor_id: string; mayor_name: string | null }>();
  let sent = 0;
  for (const r of rows.results) {
    if (!reminderDue(now, r.deadline_at)) continue;
    const claim = await db.prepare("UPDATE village_grants SET reminded_at = ? WHERE id = ? AND reminded_at IS NULL AND speech IS NULL")
      .bind(iso, r.id).run();
    if (!(claim.meta?.changes ?? 0)) continue;
    try {
      const mayor = await loadMayor(db, r.mayor_id, r.mayor_name);
      await postMayorMessage(db, env, now, { teamId: r.team_id, convId: r.conv_id, mayorId: mayor.id, sender: mayorTitle(mayor), body: reminderText(), sessionId: r.session_id });
      sent++;
    } catch (e) {
      logger.warn({ module: M, teamId: r.team_id }, `připomínka zasedání ${r.session_id}`, e);
    }
  }
  return sent;
}

/** Doručí odpovědi starosty, kterým uplynula prodleva. Odpověď se zabírá před odesláním. */
async function deliverReplies(db: D1Database, env: CouncilEnv, now: Date): Promise<number> {
  const rows = await db.prepare(
    `SELECT g.id, g.team_id, g.conv_id, g.session_id, g.pending_reply, s.mayor_id, s.mayor_name
       FROM village_grants g JOIN village_council_sessions s ON s.id = g.session_id
      WHERE g.pending_reply IS NOT NULL AND g.reply_due_at <= ? AND g.conv_id IS NOT NULL
      LIMIT 100`,
  ).bind(now.toISOString()).all<{ id: string; team_id: string; conv_id: string; session_id: string; pending_reply: string; mayor_id: string; mayor_name: string | null }>();
  let sent = 0;
  for (const r of rows.results) {
    const claim = await db.prepare("UPDATE village_grants SET pending_reply = NULL, reply_due_at = NULL WHERE id = ? AND pending_reply = ?")
      .bind(r.id, r.pending_reply).run();
    if (!(claim.meta?.changes ?? 0)) continue;
    try {
      const mayor = await loadMayor(db, r.mayor_id, r.mayor_name);
      await postMayorMessage(db, env, now, { teamId: r.team_id, convId: r.conv_id, mayorId: mayor.id, sender: mayorTitle(mayor), body: r.pending_reply, sessionId: r.session_id });
      sent++;
    } catch (e) {
      logger.warn({ module: M, teamId: r.team_id }, `odpověď starosty k zasedání ${r.session_id}`, e);
    }
  }
  return sent;
}

/**
 * Trenér napsal starostovi (routes/messaging.ts, předpona `vo-`). Do začátku zasedání se SMS
 * skládají do proslovu, starosta odepíše s prodlevou (víc zpráv = jedna odpověď). Po začátku
 * zasedání se proslov už nemění a starosta odpoví, že je pozdě.
 */
export async function handleCouncilReply(
  db: D1Database,
  msg: { teamId: string; convId: string; participantId: string; text: string },
  now: Date = new Date(),
): Promise<void> {
  const text = msg.text.trim();
  if (!text || !msg.participantId.startsWith(COUNCIL_PREFIX)) return;
  const mayorId = msg.participantId.slice(COUNCIL_PREFIX.length);
  const row = await db.prepare(
    `SELECT g.id, g.acked_at, s.status, s.deadline_at FROM village_grants g JOIN village_council_sessions s ON s.id = g.session_id
      WHERE g.team_id = ? AND g.applicant = 'club' AND s.mayor_id = ? ORDER BY s.created_at DESC LIMIT 1`,
  ).bind(msg.teamId, mayorId).first<{ id: string; acked_at: string | null; status: string; deadline_at: string }>();
  if (!row) return;
  const iso = now.toISOString();
  const seed = seedFromString(`${msg.convId}|${iso}|${text.length}`);
  const due = councilReplyDueAt(now, seed).toISOString();

  if (row.status === "open" && now.getTime() < Date.parse(row.deadline_at)) {
    const reply = row.acked_at ? COUNCIL_REPLIES.more(seed) : COUNCIL_REPLIES.ack(row.deadline_at, seed);
    await db.prepare(
      `UPDATE village_grants SET
         speech = substr(CASE WHEN speech IS NULL OR speech = '' THEN ?1 ELSE speech || char(10) || ?1 END, 1, ?2),
         speech_at = ?3, speech_by = 'coach', conv_id = COALESCE(conv_id, ?4), acked_at = COALESCE(acked_at, ?3),
         pending_reply = COALESCE(pending_reply, ?5), reply_due_at = COALESCE(reply_due_at, ?6)
       WHERE id = ?7`,
    ).bind(text, SPEECH_MAX, iso, msg.convId, reply, due, row.id).run();
    return;
  }
  const reply = row.status !== "closed" && sessionInProgress(now, row.deadline_at) ? COUNCIL_REPLIES.deciding : COUNCIL_REPLIES.late;
  await db.prepare(
    `UPDATE village_grants SET conv_id = COALESCE(conv_id, ?1), pending_reply = COALESCE(pending_reply, ?2),
       reply_due_at = COALESCE(reply_due_at, ?3) WHERE id = ?4`,
  ).bind(msg.convId, reply, due, row.id).run();
}

// ── Rozdělení po zasedání ───────────────────────────────────────────────────

interface SessionRow {
  id: string;
  village_id: string;
  village_name: string;
  session_date: string;
  pot: number;
  mayor_name: string | null;
  deadline_at: string;
  result: string | null;
}

interface GrantRow {
  id: string;
  applicant: "firefighters" | "hunters" | "club";
  team_id: string | null;
  amount: number;
  speech: string | null;
  speech_by: string | null;
  verdict: string | null;
  decided_at: string | null;
  favor_applied: number;
  team_name: string | null;
  user_id: string | null;
  league_id: string | null;
  team_village_id: string | null;
  favor: number | null;
  coach_name: string | null;
}

interface StoredVerdict extends SpeechVerdict { by: "model" | "rule" }

interface StoredResult {
  headline?: string;
  body?: string;
  articleBy?: "model" | "rule";
  newsIds?: Record<string, string>;
}

function parseJson<T>(raw: string | null, what: string): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    logger.warn({ module: M }, `nečitelný JSON (${what})`, e);
    return null;
  }
}

async function loadGrants(db: D1Database, sessionId: string): Promise<GrantRow[]> {
  return (await db.prepare(
    `SELECT g.id, g.applicant, g.team_id, g.amount, g.speech, g.speech_by, g.verdict, g.decided_at, g.favor_applied,
            t.name AS team_name, t.user_id, t.league_id, t.village_id AS team_village_id,
            f.favor, (SELECT m.name FROM managers m WHERE m.team_id = g.team_id LIMIT 1) AS coach_name
       FROM village_grants g
       LEFT JOIN teams t ON t.id = g.team_id
       LEFT JOIN village_team_favor f ON f.team_id = g.team_id AND f.official_id IS NULL
      WHERE g.session_id = ? ORDER BY g.applicant, g.team_id`,
  ).bind(sessionId).all<GrantRow>()).results;
}

/** Klub, který se zasedání účastní: existuje a pořád patří do obce. */
function participates(g: GrantRow, villageId: string): boolean {
  return g.applicant !== "club" || (!!g.team_name && g.team_village_id === villageId);
}

async function judge(ai: AiContext | null, prompt: string, speech: string, teamId: string | null): Promise<StoredVerdict> {
  const fromModel = parseJudgeAnswer(await askModel(ai, prompt, 160, 0.3));
  if (fromModel) return { ...fromModel, by: "model" };
  if (modelOn(ai)) logger.warn({ module: M, teamId: teamId ?? undefined }, "model proslov neposoudil, rozhodlo pravidlo");
  return { ...ruleSpeechVerdict(speech), by: "rule" };
}

/** Proslov AI klubu: model v roli trenéra, bez modelu (nebo s vypnutými AI trenéry) připravený podle povahy. */
async function aiClubSpeech(
  db: D1Database, env: CouncilEnv, ai: AiContext | null, opts: CouncilOpts, village: string, g: GrantRow,
): Promise<{ speech: string; by: "model" | "rule" }> {
  const { ensureAiProfile } = await import("../ai-coach/profile");
  const profile = await ensureAiProfile(db, g.team_id!);
  const mode = opts.coachMode ?? await (await import("../ai-coach/mode")).readCoachMode(env.CACHE_KV, "weekly");
  if (mode === "on" && modelOn(ai)) {
    const speech = parseAiSpeech(await askModel(ai, buildAiSpeechPrompt({ village, teamName: g.team_name ?? "", profile }), 300, 0.8));
    if (speech) return { speech, by: "model" };
    logger.warn({ module: M, teamId: g.team_id ?? undefined }, "model nenapsal proslov AI klubu, beru připravený podle povahy");
  }
  return { speech: fallbackAiSpeech(profile), by: "rule" };
}

/** Verdikty proslovů a rozdělení banku. Uložené verdikty se použijí znovu (převzaté rozdělení). */
async function allocate(db: D1Database, env: CouncilEnv, ai: AiContext | null, opts: CouncilOpts, s: SessionRow, grants: GrantRow[]): Promise<void> {
  const officials = (await db.prepare("SELECT role, first_name, last_name, personality FROM village_officials WHERE village_id = ?")
    .bind(s.village_id).all<{ role: string; first_name: string; last_name: string; personality: string }>()).results;
  const verdicts = new Map<string, StoredVerdict | null>();
  for (const g of grants) {
    if (g.applicant !== "club" || !participates(g, s.village_id)) continue;
    let verdict = parseJson<StoredVerdict>(g.verdict, "verdikt proslovu");
    if (!verdict) {
      let speech = g.speech;
      if (!speech && g.user_id === "ai") {
        const written = await aiClubSpeech(db, env, ai, opts, s.village_name, g);
        speech = written.speech;
        await db.prepare("UPDATE village_grants SET speech = ?, speech_by = ?, speech_at = ? WHERE id = ? AND speech IS NULL")
          .bind(speech, written.by, nowIso(), g.id).run();
      }
      if (speech) {
        const prompt = buildJudgePrompt({
          village: s.village_name, teamName: g.team_name ?? "", favor: g.favor ?? 50, speech,
          officials: officials.map((o) => ({ role: o.role, name: `${o.first_name} ${o.last_name}`, personality: o.personality })),
        });
        verdict = await judge(ai, prompt, speech, g.team_id);
        await db.prepare("UPDATE village_grants SET verdict = ? WHERE id = ?").bind(JSON.stringify(verdict), g.id).run();
      }
    }
    verdicts.set(g.id, verdict);
  }

  const applicants: PotApplicant[] = grants.filter((g) => participates(g, s.village_id)).map((g) => ({
    key: g.id, kind: g.applicant, favor: g.favor ?? 50, verdict: verdicts.get(g.id) ?? null,
  }));
  const split = splitCouncilPot(s.pot, applicants, councilTaste(officials.map((o) => o.personality)));
  const at = nowIso();
  await db.batch(grants.map((g) => db.prepare("UPDATE village_grants SET amount = ?, decided_at = ? WHERE id = ? AND decided_at IS NULL")
    .bind(split.get(g.id) ?? 0, at, g.id)));
}

/** Dotace klubům přes recordTransaction; referenceId = id řádku dotace, druhý běh nezaplatí znovu. */
async function payGrants(db: D1Database, s: SessionRow, clubs: GrantRow[]): Promise<void> {
  const { recordTransaction } = await import("../season/finance-processor");
  for (const g of clubs) {
    if (g.amount <= 0 || !g.team_id) continue;
    const paid = await db.prepare("SELECT 1 FROM transactions WHERE team_id = ? AND reference_id = ? LIMIT 1").bind(g.team_id, g.id).first();
    if (paid) continue;
    await recordTransaction(db, g.team_id, "village_grant", g.amount, `Dotace obce ${s.village_name}`, s.session_date, g.id);
  }
}

/** Přízeň obce po výrazném proslovu; zabírá se příznakem, druhý běh ji nepohne znovu. */
async function applyFavor(db: D1Database, s: SessionRow, clubs: GrantRow[]): Promise<void> {
  for (const g of clubs) {
    const delta = favorDelta(parseJson<StoredVerdict>(g.verdict, "verdikt proslovu"));
    if (delta === 0 || !g.team_id || g.favor_applied) continue;
    const claim = await db.prepare("UPDATE village_grants SET favor_applied = 1 WHERE id = ? AND favor_applied = 0").bind(g.id).run();
    if (!(claim.meta?.changes ?? 0)) continue;
    const at = nowIso();
    await db.batch([
      db.prepare(
        `INSERT OR IGNORE INTO village_team_favor (id, village_id, team_id, official_id, favor, trust, updated_at)
         VALUES (?, ?, ?, NULL, 50, 50, ?)`,
      ).bind(crypto.randomUUID(), s.village_id, g.team_id, at),
      db.prepare(
        `UPDATE village_team_favor SET favor = MAX(0, MIN(100, favor + ?)), last_interaction_at = ?, updated_at = ?
          WHERE team_id = ? AND official_id IS NULL`,
      ).bind(delta, at, at, g.team_id),
    ]);
  }
}

function articleFacts(s: SessionRow, grants: GrantRow[], clubs: GrantRow[]): ArticleFacts {
  const amountOf = (kind: string) => grants.find((g) => g.applicant === kind)?.amount ?? 0;
  return {
    village: s.village_name,
    weekdayAdjective: weekdayAdjective(s.deadline_at),
    mayorName: s.mayor_name,
    pot: s.pot,
    firefighters: amountOf("firefighters"),
    hunters: amountOf("hunters"),
    clubs: clubs.map((g): ArticleClub => {
      const verdict = parseJson<StoredVerdict>(g.verdict, "verdikt proslovu");
      return {
        teamName: g.team_name ?? "",
        coachName: g.coach_name,
        amount: g.amount,
        spoke: !!g.speech && !!verdict,
        reaction: verdict?.reaction ?? "",
        speechExcerpt: g.speech ? g.speech.slice(0, 300) : null,
      };
    }),
  };
}

/** Článek se napíše jednou a uloží do výsledku zasedání; převzaté rozdělení ho použije znovu. */
async function writeArticle(db: D1Database, ai: AiContext | null, s: SessionRow, facts: ArticleFacts): Promise<StoredResult> {
  const stored = parseJson<StoredResult>(s.result, "výsledek zasedání") ?? {};
  if (stored.headline && stored.body) return stored;
  const fromModel = checkCouncilArticle(await askModel(ai, buildArticlePrompt(facts), 900, 0.7), facts);
  if (!fromModel && modelOn(ai)) logger.warn({ module: M }, `článek ze zasedání ${s.id} od modelu neprošel, beru připravený`);
  const article = fromModel ?? fallbackCouncilArticle(facts, seedFromString(s.id));
  const result: StoredResult = { ...stored, headline: article.headline, body: article.body, articleBy: fromModel ? "model" : "rule" };
  await db.prepare("UPDATE village_council_sessions SET result = ? WHERE id = ?").bind(JSON.stringify(result), s.id).run();
  return result;
}

/** Článek do každé soutěže, kde klub obce hraje. Vrací mapu soutěž → id článku. */
async function publishArticles(db: D1Database, s: SessionRow, clubs: GrantRow[], article: StoredResult): Promise<Record<string, string>> {
  const { activeSeasonNumber } = await import("../transfers/unrest");
  const season = await activeSeasonNumber(db);
  const byLeague = new Map<string, GrantRow>();
  // Článek se váže ke klubu soutěže: přednost má lidský klub (z článku vede jméno trenéra na profil).
  for (const g of [...clubs].sort((a, b) => Number(isHuman(b.user_id)) - Number(isHuman(a.user_id)))) {
    if (g.league_id && !byLeague.has(g.league_id)) byLeague.set(g.league_id, g);
  }
  const ids: Record<string, string> = {};
  const stmts: D1PreparedStatement[] = [];
  for (const [leagueId, g] of byLeague) {
    const newsId = `vcn-${s.village_id}-${s.id.slice(-7)}-${leagueId}`;
    ids[leagueId] = newsId;
    stmts.push(db.prepare(
      `INSERT OR IGNORE INTO news (id, league_id, team_id, type, headline, body, season_number, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
    ).bind(newsId, leagueId, g.team_id, COUNCIL_NEWS_TYPE, article.headline, article.body, season));
  }
  if (stmts.length > 0) await db.batch(stmts);
  return ids;
}

/** Záznam do historie obce (stránka Obec), jednou na dotaci. */
async function recordHistory(db: D1Database, s: SessionRow, clubs: GrantRow[]): Promise<void> {
  if (clubs.length === 0) return;
  const at = nowIso();
  await db.batch(clubs.map((g) => db.prepare(
    `INSERT OR IGNORE INTO village_history (id, village_id, team_id, official_id, event_type, description, impact, game_date, created_at)
     VALUES (?, ?, ?, NULL, 'council_grant', ?, ?, ?, ?)`,
  ).bind(
    `vh-${g.id}`, s.village_id, g.team_id, `Zastupitelstvo přiklepnulo fotbalu ${czk(g.amount)} z obecní kasy pro spolky.`,
    JSON.stringify({ amount: g.amount, sessionId: s.id }), s.session_date, at,
  )));
}

/** SMS od Redakce Zpravodaje lidským klubům obce s tlačítkem na článek jejich soutěže. */
async function notifyClubs(db: D1Database, s: SessionRow, clubs: GrantRow[], article: StoredResult, newsIds: Record<string, string>): Promise<void> {
  const { sendSystemSMS } = await import("../messaging/system-sms");
  for (const g of clubs) {
    if (!isHuman(g.user_id) || !g.team_id) continue;
    const claim = await db.prepare("UPDATE village_grants SET notified_at = ? WHERE id = ? AND notified_at IS NULL").bind(nowIso(), g.id).run();
    if (!(claim.meta?.changes ?? 0)) continue;
    const newsId = g.league_id ? newsIds[g.league_id] : undefined;
    await sendSystemSMS(db, g.team_id, COUNCIL_NEWS_DESK, redakceSmsText(s.village_name, article.headline ?? "", g.amount),
      newsId ? { type: "guide", href: `/zpravodaj?article=${newsId}`, label: "Otevřít Zpravodaj", newsId } : undefined);
  }
}

/**
 * Rozdělí bank jednoho zasedání. Zabírá se podmíněným UPDATE (open, nebo rozjeté se starým
 * zámkem), takže souběžný ani opakovaný běh nic nezdvojí. Chyba nechá zasedání rozjeté
 * a další běh ho po čtvrthodině převezme. Vrací true, když se zasedání uzavřelo.
 */
export async function decideCouncilSession(
  db: D1Database, env: CouncilEnv, sessionId: string, now: Date = new Date(), opts: CouncilOpts = {},
): Promise<boolean> {
  const iso = now.toISOString();
  const stale = new Date(now.getTime() - CLAIM_TTL_MS).toISOString();
  const claim = await db.prepare(
    `UPDATE village_council_sessions SET status = 'deciding', claimed_at = ?1
      WHERE id = ?2 AND (status = 'open' OR (status = 'deciding' AND claimed_at < ?3))`,
  ).bind(iso, sessionId, stale).run();
  if (!(claim.meta?.changes ?? 0)) return false;

  try {
    const s = await db.prepare(
      `SELECT s.id, s.village_id, v.name AS village_name, s.session_date, s.pot, s.mayor_name, s.deadline_at, s.result
         FROM village_council_sessions s JOIN villages v ON v.id = s.village_id WHERE s.id = ?`,
    ).bind(sessionId).first<SessionRow>();
    if (!s) return false;
    const ai = await resolveAi(env, opts);

    let grants = await loadGrants(db, sessionId);
    if (grants.some((g) => !g.decided_at)) {
      await allocate(db, env, ai, opts, s, grants);
      grants = await loadGrants(db, sessionId);
    }
    const clubs = grants.filter((g) => g.applicant === "club" && participates(g, s.village_id));

    await payGrants(db, s, clubs);
    await applyFavor(db, s, clubs);
    const article = await writeArticle(db, ai, s, articleFacts(s, grants, clubs));
    const newsIds = await publishArticles(db, s, clubs, article);
    await recordHistory(db, s, clubs);
    await notifyClubs(db, s, clubs, article, newsIds);

    const result = {
      ...article,
      newsIds,
      pot: s.pot,
      grants: grants.map((g) => ({ applicant: g.applicant, teamId: g.team_id, amount: g.amount })),
    };
    await db.prepare(
      "UPDATE village_council_sessions SET status = 'closed', result = ?, news_id = ?, closed_at = ? WHERE id = ? AND status = 'deciding'",
    ).bind(JSON.stringify(result), Object.values(newsIds)[0] ?? null, nowIso(), sessionId).run();
    logger.info({ module: M }, `zasedání ${sessionId}: rozděleno ${s.pot} Kč mezi ${grants.length} žadatelů`);
    return true;
  } catch (e) {
    logger.warn({ module: M }, `rozdělení zasedání ${sessionId} se nepovedlo, další běh ho převezme`, e);
    return false;
  }
}

async function decideDueSessions(db: D1Database, env: CouncilEnv, now: Date, opts: CouncilOpts): Promise<number> {
  const iso = now.toISOString();
  const stale = new Date(now.getTime() - CLAIM_TTL_MS).toISOString();
  const due = await db.prepare(
    `SELECT id, deadline_at FROM village_council_sessions
      WHERE (status = 'open' AND deadline_at <= ?1) OR (status = 'deciding' AND claimed_at < ?2)
      ORDER BY deadline_at LIMIT 20`,
  ).bind(iso, stale).all<{ id: string; deadline_at: string }>();
  const ready = due.results.filter((r) => decisionReady(now, r.deadline_at)).slice(0, MAX_SESSIONS_PER_RUN);
  if (ready.length === 0) return 0;
  const resolved: CouncilOpts = { ...opts, ai: await resolveAi(env, opts) };
  let decided = 0;
  for (const r of ready) {
    if (await decideCouncilSession(db, env, r.id, now, resolved)) decided++;
  }
  return decided;
}

/**
 * Hodinový běh Telefonu: odpovědi starosty (jejich čas je vždy přes den), pozvánky,
 * připomínky a rozdělení po zasedání jen přes den. Části si chyby logují samy.
 */
export async function tickVillageCouncil(db: D1Database, env: CouncilEnv, now: Date = new Date(), opts: CouncilOpts = {}): Promise<CouncilTickResult> {
  const out: CouncilTickResult = { replies: 0, invited: 0, reminded: 0, decided: 0 };
  try {
    out.replies = await deliverReplies(db, env, now);
  } catch (e) {
    logger.warn({ module: M }, "odpovědi starostů", e);
  }
  const { hour } = pragueParts(now);
  if (hour < DAY_START || hour >= DAY_END) return out;
  try {
    out.invited = await sendInvitations(db, env, now);
  } catch (e) {
    logger.warn({ module: M }, "pozvánky na zasedání", e);
  }
  try {
    out.reminded = await sendReminders(db, env, now);
  } catch (e) {
    logger.warn({ module: M }, "připomínky zasedání", e);
  }
  try {
    out.decided = await decideDueSessions(db, env, now, opts);
  } catch (e) {
    logger.warn({ module: M }, "rozdělení po zasedání", e);
  }
  if (out.replies || out.invited || out.reminded || out.decided) {
    logger.info({ module: M }, `zastupitelstvo: pozvánek ${out.invited}, odpovědí ${out.replies}, připomínek ${out.reminded}, rozděleno ${out.decided}`);
  }
  return out;
}
