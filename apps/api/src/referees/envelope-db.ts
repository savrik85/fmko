/**
 * Obálka pro sudího (F16) v databázi.
 *
 * Průběh:
 * 1. Denní tick hned po delegaci (`planRefereeEnvelopes`): úplatný sudí delegovaný na derby
 *    (horká rivalita táborů, fans/fan-rivalries.ts) založí obálku pro jeden z klubů. Řádek má id
 *    odvozené ze zápasu, opakovaný běh nic nezdvojí.
 * 2. Hodinový Telefon (`tickRefereeEnvelopes`): lidskému trenérovi přes den pošle sudí nejasnou
 *    SMS (`rf-<refereeId>`) s hotovými odpověďmi; AI klub rozhodne modelem, bez modelu pravidlo
 *    podle povahy. Obálka bez odpovědi do výkopu propadne. Vlákno se sudím zůstává neaktivní
 *    (`ai_thread_active = 0`): aktivní vlákno bez hráče by klubu blokovalo rozhovory od hráčů.
 *    Tlačítka nese vždy poslední zpráva sudího, dokud obálka čeká.
 * 3. Odpověď trenéra (`handleRefereeEnvelopeReply`): tlačítko nebo volný text (síto, pak model,
 *    při vypnuté AI zůstane u síta). Zaplatit = `recordTransaction` se stabilní referencí,
 *    ignorovat = nic, nahlásit = SMS lidskému komisaři rozhodčích s důkazem, bez komisaře
 *    automatická stopka (`applyRefereePause`).
 * 4. Zápas (`withRefereeEnvelope`): zaplacená obálka nakloní spornou situaci jen v tom zápase
 *    a jen u sudího, kterému se platilo (vyměněný sudí nic nedluží).
 * 5. Revize účetnictví (`sanctionEnvelopePayments`): platba v okně 60 dní = skutek `bribery`
 *    přes `issueSanction`, jednou na obálku.
 */

import type { Bindings } from "../index";
import type { RefereeProfile } from "../engine/referee";
import type { OptionalPushKeys } from "../community/phone-push";
import type { ModelTrace } from "../ai-coach/buy-model";
import { logger } from "../lib/logger";
import { gameExpiry } from "../lib/game-time";
import { pragueHour } from "../lib/match-tick-schedule";
import { teplotaRivality } from "../fans/fan-rivalries";
import { refereeFullName } from "./referee-generator";
import {
  bribeFine, czk, effectiveCorruptibility, envelopeAmount, envelopeId, envelopeReferenceId, envelopeSmsText,
  ENVELOPE_CORRUPTIBILITY_THRESHOLD, ENVELOPE_EXPIRY_DAYS, ENVELOPE_OPTIONS, ENVELOPE_PARTICIPANT_PREFIX, ENVELOPE_REPLIES,
  checkEnvelopeDecision, envelopeSchema, ENVELOPE_SYSTEM_PROMPT, fallbackEnvelopeDecision, pickEnvelopeTarget,
  readModelEnvelopeReply, renderEnvelopePrompt, shouldOfferEnvelope, sieveEnvelopeReply,
  type EnvelopeChoice, type EnvelopeDecisionContext,
} from "./envelope";

const M = "referee-envelopes";

/** Odesílatel SMS od komise (trenérovi, který sudího nahlásil, i komisaři). */
export const COMMISSION_SENDER = "Komise rozhodčích OFS";

/** Sudí píše jen přes den, v noci počká do rána. */
const SEND_FROM_HOUR = 8;
const SEND_UNTIL_HOUR = 20;
/** Kolik otevřených obálek hodinový běh projde najednou. */
const TICK_LIMIT = 50;
/** O kolik bodů úplatnost klesne, když sudího někdo nahlásí. Vyděšený sudí se příště krotí. */
const REPORT_CORRUPTIBILITY_DROP = 30;
const MODEL_TIMEOUT_MS = 30_000;

export type EnvelopeEnv = Pick<Bindings, "DB"> & Partial<Pick<Bindings, "CACHE_KV" | "AI" | "GEMINI_API_KEY" | "AI_GATEWAY_URL">> & OptionalPushKeys;

export type EnvelopeStatus = "planned" | "pending" | "paid" | "ignored" | "reported" | "expired";

export interface EnvelopeRow {
  id: string;
  referee_id: string;
  team_id: string;
  match_id: string;
  league_id: string;
  season_number: number;
  game_week: number;
  amount: number;
  status: EnvelopeStatus;
  reference_id: string;
  conv_id: string | null;
  message: string | null;
  decided_by: string | null;
  sent_at: string | null;
  answered_at: string | null;
  sanction_id: string | null;
  created_at: string;
}

const nowIso = () => new Date().toISOString();

// ── 1. Založení obálek po delegaci ──────────────────────────────────────────

interface Candidate {
  match_id: string;
  home_team_id: string;
  away_team_id: string;
  referee_id: string;
  league_id: string;
  season_number: number;
  game_week: number;
  archetype: string;
  corruptibility: number | null;
}

/**
 * Obálky na zápasy, které se hrají za dva herní dny (stejné okno jako delegace). Úplatnost se
 * filtruje dřív než rivalita: úplatných sudích je v okrese pár, dotaz na rivalitu jde jen za nimi.
 */
export async function planRefereeEnvelopes(db: D1Database, gameDate: string): Promise<number> {
  const target = new Date(gameExpiry(gameDate, 2));
  const from = new Date(target); from.setUTCHours(0, 0, 0, 0);
  const to = new Date(target); to.setUTCHours(23, 59, 59, 999);

  const rows = await db.prepare(
    `SELECT m.id AS match_id, m.home_team_id, m.away_team_id, m.referee_id,
            sc.league_id, sc.season_number, sc.game_week, r.archetype, r.corruptibility
       FROM season_calendar sc
       JOIN leagues l ON l.id = sc.league_id
       JOIN matches m ON m.calendar_id = sc.id
       JOIN referees r ON r.id = m.referee_id
      WHERE sc.scheduled_at BETWEEN ? AND ? AND sc.status = 'scheduled'
        AND m.status IN ('scheduled', 'lineups_open')
        AND COALESCE(l.league_type, 'senior') = 'senior'
        AND sc.season_number = (SELECT MAX(x.season_number) FROM season_calendar x WHERE x.league_id = sc.league_id)`,
  ).bind(from.toISOString(), to.toISOString()).all<Candidate>()
    .catch((e) => { logger.warn({ module: M }, "zápasy k obálkám", e); return { results: [] as Candidate[] }; });

  let created = 0;
  for (const c of rows.results) {
    const corruptibility = effectiveCorruptibility({ id: c.referee_id, archetype: c.archetype, corruptibility: c.corruptibility });
    if (corruptibility < ENVELOPE_CORRUPTIBILITY_THRESHOLD) continue;
    try {
      const heat = await teplotaRivality(db, c.home_team_id, c.away_team_id, gameDate);
      if (!shouldOfferEnvelope(c.match_id, corruptibility, heat)) continue;

      const teams = await db.prepare("SELECT id, user_id FROM teams WHERE id IN (?, ?)")
        .bind(c.home_team_id, c.away_team_id).all<{ id: string; user_id: string | null }>();
      const userOf = new Map(teams.results.map((t) => [t.id, t.user_id]));
      if (!userOf.has(c.home_team_id) || !userOf.has(c.away_team_id)) continue;
      const isHuman = (id: string) => { const u = userOf.get(id); return !!u && u !== "ai"; };
      const teamId = pickEnvelopeTarget(c.match_id,
        { id: c.home_team_id, human: isHuman(c.home_team_id) }, { id: c.away_team_id, human: isHuman(c.away_team_id) });

      const res = await db.prepare(
        `INSERT OR IGNORE INTO referee_envelopes
           (id, referee_id, team_id, match_id, league_id, season_number, game_week, amount, status, reference_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?)`,
      ).bind(
        envelopeId(c.match_id), c.referee_id, teamId, c.match_id, c.league_id, c.season_number, c.game_week,
        envelopeAmount(c.match_id, corruptibility), envelopeReferenceId(c.match_id),
      ).run();
      if (res.meta.changes) created++;
    } catch (e) {
      logger.warn({ module: M }, `obálka na zápas ${c.match_id}`, e);
    }
  }
  if (created > 0) logger.info({ module: M }, `založeno ${created} obálek pro sudí`);
  return created;
}

// ── 2. Hodinový Telefon ─────────────────────────────────────────────────────

interface OpenEnvelope extends EnvelopeRow {
  match_status: string | null;
  team_user: string | null;
}

/** Zápas je odehraný (nebo zmizel), případně obálka visí déle, než by smělo. */
function isOver(e: OpenEnvelope, now: Date): boolean {
  if (!e.match_status || (e.match_status !== "scheduled" && e.match_status !== "lineups_open")) return true;
  const created = Date.parse(e.created_at);
  return Number.isFinite(created) && now.getTime() - created > ENVELOPE_EXPIRY_DAYS * 86_400_000;
}

/** Hodinový běh: propadlé obálky zavře, lidem přes den pošle SMS, AI kluby rozhodnou. */
export async function tickRefereeEnvelopes(env: EnvelopeEnv, now: Date = new Date()): Promise<{ sent: number; decided: number; expired: number }> {
  const db = env.DB;
  const rows = await db.prepare(
    `SELECT e.*, m.status AS match_status, t.user_id AS team_user
       FROM referee_envelopes e
       LEFT JOIN matches m ON m.id = e.match_id
       LEFT JOIN teams t ON t.id = e.team_id
      WHERE e.status IN ('planned', 'pending')
      ORDER BY e.created_at LIMIT ?`,
  ).bind(TICK_LIMIT).all<OpenEnvelope>()
    .catch((e) => { logger.warn({ module: M }, "otevřené obálky", e); return { results: [] as OpenEnvelope[] }; });

  const hour = pragueHour(now);
  const daytime = hour !== null && hour >= SEND_FROM_HOUR && hour <= SEND_UNTIL_HOUR;
  const out = { sent: 0, decided: 0, expired: 0 };
  for (const e of rows.results) {
    try {
      if (isOver(e, now)) {
        if (await expireEnvelope(db, e)) out.expired++;
        continue;
      }
      if (e.status !== "planned") continue;
      if (e.team_user === "ai") {
        if (await decideAiEnvelope(env, e)) out.decided++;
      } else if (e.team_user && daytime) {
        if (await sendEnvelopeSms(env, e)) out.sent++;
      }
    } catch (err) {
      logger.warn({ module: M }, `obálka ${e.id}`, err);
    }
  }
  return out;
}

/** Obálka bez odpovědi propadne. Nic se neplatí, sudí už nic nepíše. */
async function expireEnvelope(db: D1Database, e: Pick<EnvelopeRow, "id">): Promise<boolean> {
  const res = await db.prepare(
    "UPDATE referee_envelopes SET status = 'expired', answered_at = ? WHERE id = ? AND status IN ('planned', 'pending')",
  ).bind(nowIso(), e.id).run();
  return !!res.meta.changes;
}

interface EnvelopeContext {
  refereeName: string;
  refereeGender: string;
  refereeAvatar: string | null;
  teamName: string;
  opponentName: string;
  kickoff: string;
  district: string;
  budget: number;
  gameDate: string;
}

/** Jména, soupeř a výkop k obálce. */
async function loadContext(db: D1Database, e: EnvelopeRow): Promise<EnvelopeContext | null> {
  const row = await db.prepare(
    `SELECT r.first_name, r.last_name, r.nickname, r.gender, r.avatar,
            m.home_team_id, sc.scheduled_at, l.district,
            th.name AS home_name, ta.name AS away_name,
            me.name AS team_name, me.budget, me.game_date
       FROM referee_envelopes e
       JOIN referees r ON r.id = e.referee_id
       JOIN matches m ON m.id = e.match_id
       LEFT JOIN season_calendar sc ON sc.id = m.calendar_id
       LEFT JOIN leagues l ON l.id = e.league_id
       LEFT JOIN teams th ON th.id = m.home_team_id
       LEFT JOIN teams ta ON ta.id = m.away_team_id
       LEFT JOIN teams me ON me.id = e.team_id
      WHERE e.id = ?`,
  ).bind(e.id).first<{
    first_name: string; last_name: string; nickname: string | null; gender: string; avatar: string | null;
    home_team_id: string; scheduled_at: string | null; district: string | null;
    home_name: string | null; away_name: string | null; team_name: string | null; budget: number | null; game_date: string | null;
  }>();
  if (!row) return null;
  const isHome = row.home_team_id === e.team_id;
  return {
    refereeName: refereeFullName(row),
    refereeGender: row.gender,
    refereeAvatar: row.avatar,
    teamName: row.team_name ?? "klub",
    opponentName: (isHome ? row.away_name : row.home_name) ?? "soupeřem",
    kickoff: row.scheduled_at ?? "",
    district: row.district ?? "",
    budget: Number(row.budget) || 0,
    gameDate: row.game_date ?? nowIso(),
  };
}

/** Tlačítka pod zprávou sudího, dokud obálka čeká na odpověď. */
function optionsMeta(envelopeId: string): Record<string, unknown> {
  return { type: "referee_envelope", envelopeId, options: ENVELOPE_OPTIONS };
}

/** Zpráva od sudího do jeho vlákna. */
async function postRefereeMessage(
  db: D1Database, convId: string, sender: string, body: string, metadata?: Record<string, unknown>,
): Promise<void> {
  await db.batch([
    db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at)
       VALUES (?, ?, 'system', ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), convId, sender, body, metadata ? JSON.stringify(metadata) : null, nowIso()),
    db.prepare(
      "UPDATE conversations SET last_message_text = ?, last_message_at = ?, unread_count = unread_count + 1 WHERE id = ?",
    ).bind(body.slice(0, 100), nowIso(), convId),
  ]);
}

/**
 * Pošle SMS od sudího. Nejdřív zámek (planned → pending), pak zpráva: dvojí běh nepošle dvě SMS.
 * Konverzace se sudím je jedna na klub a sudího, další obálka přijde do téže.
 */
async function sendEnvelopeSms(env: EnvelopeEnv, e: EnvelopeRow): Promise<boolean> {
  const db = env.DB;
  const claimed = await db.prepare(
    "UPDATE referee_envelopes SET status = 'pending', sent_at = ? WHERE id = ? AND status = 'planned'",
  ).bind(nowIso(), e.id).run();
  if (!claimed.meta.changes) return false;

  const ctx = await loadContext(db, e);
  if (!ctx) {
    logger.warn({ module: M }, `obálka ${e.id}: chybí sudí nebo zápas, SMS neodešla`);
    await expireEnvelope(db, e);
    return false;
  }
  const text = envelopeSmsText({
    matchId: e.match_id, refereeName: ctx.refereeName, refereeGender: ctx.refereeGender,
    opponentName: ctx.opponentName, kickoff: ctx.kickoff, amount: e.amount,
  });

  const participantId = `${ENVELOPE_PARTICIPANT_PREFIX}${e.referee_id}`;
  let convId = (await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND participant_id = ?")
    .bind(e.team_id, participantId).first<{ id: string }>())?.id ?? null;
  if (!convId) {
    convId = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO conversations (id, team_id, type, title, participant_id, participant_avatar, ai_thread_active, pinned, unread_count, last_message_text, last_message_at, created_at)
       VALUES (?, ?, 'system', ?, ?, ?, 0, 0, 0, '', ?, ?)`,
    ).bind(convId, e.team_id, ctx.refereeName, participantId, ctx.refereeAvatar, nowIso(), nowIso()).run();
  }

  await postRefereeMessage(db, convId, ctx.refereeName, text, optionsMeta(e.id));
  await db.prepare("UPDATE referee_envelopes SET conv_id = ?, message = ? WHERE id = ?").bind(convId, text, e.id).run();

  const { pushPhoneMessage } = await import("../community/phone-push");
  await pushPhoneMessage(db, env, { teamId: e.team_id, convId, sender: ctx.refereeName, text });
  logger.info({ module: M, teamId: e.team_id }, `obálka ${e.id}: sudí ${e.referee_id} poslal SMS`);
  return true;
}

// ── 3. Rozhodnutí: zaplatit, ignorovat, nahlásit ────────────────────────────

export interface EnvelopeDecisionResult {
  recorded: boolean;
  reason?: "no_money" | "closed" | "missing";
}

/**
 * Zapíše volbu trenéra (člověka i AI). Stav se mění podmíněným UPDATE, takže opakované volání
 * nic nezdvojí; platba má navíc stabilní referenci v `transactions`.
 */
export async function recordEnvelopeChoice(
  env: EnvelopeEnv, envelope: EnvelopeRow, choice: EnvelopeChoice, decidedBy: string,
): Promise<EnvelopeDecisionResult> {
  const db = env.DB;
  // Řádek v ruce může být starý (dvojklik, souběh s propadnutím): o všem rozhoduje stav v DB.
  const current = await db.prepare("SELECT status FROM referee_envelopes WHERE id = ?").bind(envelope.id).first<{ status: string }>();
  if (!current) return { recorded: false, reason: "missing" };
  if (current.status !== "planned" && current.status !== "pending") return { recorded: false, reason: "closed" };
  const ctx = await loadContext(db, envelope);
  if (!ctx) return { recorded: false, reason: "missing" };
  // `stillOpen` = obálka dál čeká, zpráva proto znovu nese tlačítka.
  const reply = (body: string, stillOpen: boolean) => envelope.conv_id
    ? postRefereeMessage(db, envelope.conv_id, ctx.refereeName, body, stillOpen ? optionsMeta(envelope.id) : undefined)
      .catch((e) => logger.warn({ module: M }, `odpověď sudího na obálku ${envelope.id}`, e))
    : Promise.resolve();

  if (choice === "pay") {
    const { recordTransaction, spendBlockedMessage } = await import("../season/finance-processor");
    const blocked = await spendBlockedMessage(db, envelope.team_id, envelope.amount);
    if (blocked) {
      await reply(ENVELOPE_REPLIES.noMoney, true);
      return { recorded: false, reason: "no_money" };
    }
    const claimed = await db.prepare(
      `UPDATE referee_envelopes SET status = 'paid', decided_by = ?, answered_at = ?
        WHERE id = ? AND status IN ('planned', 'pending')`,
    ).bind(decidedBy, nowIso(), envelope.id).run();
    if (!claimed.meta.changes) return { recorded: false, reason: "closed" };
    const done = await db.prepare("SELECT 1 AS x FROM transactions WHERE team_id = ? AND reference_id = ? LIMIT 1")
      .bind(envelope.team_id, envelope.reference_id).first<{ x: number }>();
    if (!done) {
      try {
        await recordTransaction(db, envelope.team_id, "referee_envelope", -envelope.amount,
          "Výběr hotovosti bez dokladu", ctx.gameDate, envelope.reference_id);
      } catch (e) {
        // Rozpočet mezitím spadl do mínusu: obálka se vrátí k rozhodnutí, nic se nestrhlo.
        logger.warn({ module: M }, `platba obálky ${envelope.id}`, e);
        await db.prepare("UPDATE referee_envelopes SET status = ?, decided_by = NULL, answered_at = NULL WHERE id = ? AND status = 'paid'")
          .bind(current.status, envelope.id).run();
        await reply(ENVELOPE_REPLIES.noMoney, true);
        return { recorded: false, reason: "no_money" };
      }
    }
    await reply(ENVELOPE_REPLIES.paid, false);
    logger.info({ module: M, teamId: envelope.team_id }, `obálka ${envelope.id}: zaplaceno ${envelope.amount} Kč (${decidedBy})`);
    return { recorded: true };
  }

  const status = choice === "ignore" ? "ignored" : "reported";
  const claimed = await db.prepare(
    `UPDATE referee_envelopes SET status = ?, decided_by = ?, answered_at = ?
      WHERE id = ? AND status IN ('planned', 'pending')`,
  ).bind(status, decidedBy, nowIso(), envelope.id).run();
  if (!claimed.meta.changes) return { recorded: false, reason: "closed" };

  if (choice === "ignore") {
    await reply(ENVELOPE_REPLIES.ignored, false);
  } else {
    await reply(ENVELOPE_REPLIES.reported, false);
    await reportEnvelope(env, envelope, ctx)
      .catch((e) => logger.warn({ module: M }, `nahlášení obálky ${envelope.id}`, e));
  }
  logger.info({ module: M, teamId: envelope.team_id }, `obálka ${envelope.id}: ${status} (${decidedBy})`);
  return { recorded: true };
}

/**
 * Komisař rozhodčích grémia (nebo prezident, který neobsazenou funkci zastupuje), když je to
 * člověk. Bez samosprávy, bez funkcionáře nebo s AI funkcionářem vrací null.
 */
export async function findRefereeCommissioner(db: D1Database, leagueId: string, seasonNumber: number): Promise<string | null> {
  const { governingLeagueId, loadOwnGovernance } = await import("../competition/rules");
  const governingId = await governingLeagueId(db, leagueId);
  const gov = await loadOwnGovernance(db, governingId);
  if (!gov?.enabled) return null;
  const row = await db.prepare(
    `SELECT o.team_id, t.user_id FROM competition_officials o JOIN teams t ON t.id = o.team_id
      WHERE o.league_id = ? AND o.season_number = ? AND o.status = 'active' AND o.role IN ('rozhodcich', 'predseda')
      ORDER BY CASE o.role WHEN 'rozhodcich' THEN 0 ELSE 1 END LIMIT 1`,
  ).bind(governingId, seasonNumber).first<{ team_id: string; user_id: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `komisař rozhodčích soutěže ${governingId}`, e); return null; });
  if (!row || !row.user_id || row.user_id === "ai") return null;
  return row.team_id;
}

type ReportOutcome = "commissioner" | "self" | "paused" | "none";

/**
 * Nahlášení sudího: lidský komisař dostane SMS s důkazem (text SMS od sudího) a rozhodne sám;
 * bez komisaře dá komise automatickou stopku od kola po derby (derby je už rozdelegované).
 * Trenér, který sudího nahlásil, dostane SMS od komise. Úplatnost sudího klesne.
 */
async function reportEnvelope(env: EnvelopeEnv, e: EnvelopeRow, ctx: EnvelopeContext): Promise<ReportOutcome> {
  const db = env.DB;
  const { sendSystemSMS } = await import("../messaging/system-sms");
  const reporter = await db.prepare("SELECT user_id FROM teams WHERE id = ?").bind(e.team_id).first<{ user_id: string | null }>();
  const reporterIsHuman = !!reporter?.user_id && reporter.user_id !== "ai";
  const tellReporter = (body: string, metadata?: Record<string, unknown>) => reporterIsHuman
    ? sendSystemSMS(db, e.team_id, COMMISSION_SENDER, body, metadata)
      .catch((err) => logger.warn({ module: M }, "SMS komise trenérovi, který nahlásil sudího", err))
    : Promise.resolve();
  const competitionLink = { type: "guide", href: "/soutez", label: "Otevřít Soutěž" };
  const { applyRefereePause, canPauseReferee, PAUSE_WEEKS } = await import("../competition/referee-roster");
  const weeks = ({ 2: "dvě", 3: "tři", 4: "čtyři" } as Record<number, string>)[PAUSE_WEEKS] ?? String(PAUSE_WEEKS);

  const corruptibility = await db.prepare("SELECT archetype, corruptibility FROM referees WHERE id = ?").bind(e.referee_id)
    .first<{ archetype: string; corruptibility: number | null }>();
  if (corruptibility) {
    const lowered = Math.max(0, effectiveCorruptibility({ id: e.referee_id, ...corruptibility }) - REPORT_CORRUPTIBILITY_DROP);
    await db.prepare("UPDATE referees SET corruptibility = ? WHERE id = ?").bind(lowered, e.referee_id).run()
      .catch((err) => logger.warn({ module: M }, `úplatnost nahlášeného sudího ${e.referee_id}`, err));
  }

  const commissioner = await findRefereeCommissioner(db, e.league_id, e.season_number);
  if (commissioner === e.team_id) {
    await tellReporter(`Oznámení máme. Jako komisař rozhodčích můžeš sudímu ${ctx.refereeName} dát stopku sám na stránce Soutěž.`, competitionLink);
    return "self";
  }
  if (commissioner) {
    const evidence = e.message ? ` „${e.message}“` : "";
    await sendSystemSMS(db, commissioner, COMMISSION_SENDER,
      `Oznámení na rozhodčího ${ctx.refereeName}: trenér klubu ${ctx.teamName} hlásí, že mu sudí před zápasem s ${ctx.opponentName} `
        + `poslal tuhle SMS:${evidence} Stopku na ${weeks} kola můžeš dát na stránce Soutěž.`,
      competitionLink,
    ).catch((err) => logger.warn({ module: M }, "SMS komisaři rozhodčích s důkazem", err));
    await tellReporter("Děkujeme za oznámení. Předali jsme ho i s jeho SMS komisaři rozhodčích, rozhodnutí je na něm.");
    return "commissioner";
  }

  const fromWeek = e.game_week + 1;
  const check = await canPauseReferee(db, e.league_id, e.season_number, ctx.district, fromWeek, e.referee_id);
  if (!check.ok) {
    logger.warn({ module: M }, `nahlášený sudí ${e.referee_id} stopku nedostal: ${check.reason ?? "neznámý důvod"}`);
    await tellReporter("Děkujeme za oznámení. Komise to prošetří.");
    return "none";
  }
  const paused = await applyRefereePause(db, {
    leagueId: e.league_id, seasonNumber: e.season_number, refereeId: e.referee_id, fromWeek,
    reason: `Pokus o úplatek před derby, oznámení klubu ${ctx.teamName}`, issuedByTeamId: e.team_id, gameDate: ctx.gameDate,
  });
  if (!paused) {
    await tellReporter("Děkujeme za oznámení. Komise to prošetří.");
    return "none";
  }
  const got = ctx.refereeGender === "f" ? "dostala" : "dostal";
  await tellReporter(`Děkujeme za oznámení. Rozhodčí ${ctx.refereeName} ${got} od komise stopku na ${weeks} kola od ${fromWeek}. kola. `
    + "Vaše derby ještě odpíská, delegace už je hotová.");
  return "paused";
}

/**
 * Odpověď trenéra sudímu: tlačítko, jinak volný text. Síto rozhodne jasné odpovědi, model ty
 * ostatní; při vypnuté AI se sudí zeptá znovu. Bez otevřené obálky sudí trenéra jen odbude.
 */
export async function handleRefereeEnvelopeReply(
  env: EnvelopeEnv, convId: string, teamId: string, text: string, optionId: string | null,
): Promise<void> {
  const db = env.DB;
  const envelope = await db.prepare(
    "SELECT * FROM referee_envelopes WHERE conv_id = ? AND team_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
  ).bind(convId, teamId).first<EnvelopeRow>();
  if (!envelope) {
    const conv = await db.prepare("SELECT title FROM conversations WHERE id = ? AND team_id = ?").bind(convId, teamId).first<{ title: string }>();
    if (conv) await postRefereeMessage(db, convId, conv.title, ENVELOPE_REPLIES.closed);
    return;
  }

  let choice: EnvelopeChoice | null = optionId === "pay" || optionId === "ignore" || optionId === "report" ? optionId : null;
  if (!choice) {
    const sieved = sieveEnvelopeReply(text);
    if (sieved && sieved !== "unclear") choice = sieved;
    else {
      const fromModel = await readReplyWithModel(env, text, envelope.amount);
      if (fromModel && fromModel !== "unclear") choice = fromModel;
    }
  }
  if (!choice) {
    const ctx = await loadContext(db, envelope);
    await postRefereeMessage(db, convId, ctx?.refereeName ?? "Rozhodčí", ENVELOPE_REPLIES.unclear, optionsMeta(envelope.id));
    return;
  }
  await recordEnvelopeChoice(env, envelope, choice, "coach");
}

/** Volný text trenéra podle modelu. Vypnutá AI nebo výpadek = null. */
async function readReplyWithModel(env: EnvelopeEnv, text: string, amount: number): Promise<EnvelopeChoice | "unclear" | null> {
  const { isAiEnabled } = await import("../lib/ai-provider");
  if (!(await isAiEnabled(env))) return null;
  try {
    const chat = await import("../messaging/ai-player-chat");
    const raw = await chat.askModelJson<unknown>(env, [
      `Rozhodčí poslal trenérovi vesnického fotbalového klubu SMS, ve které mu naznačil, že za ${czk(amount)} „na cestovné“ nahraje jeho týmu v derby.`,
      `Trenér mu odepsal: ${chat.coachQuote(text)}`,
      chat.COACH_TEXT_RULE,
      "",
      "Co trenér v TÉHLE zprávě rozhodl?",
      "- pay: zaplatí, souhlasí, pošle nebo přinese obálku či peníze.",
      "- ignore: odmítl, nezaplatí, dělá, že neví, o čem je řeč, nebo to nechce řešit.",
      "- report: nahlásí sudího komisaři, komisi, svazu nebo policii, případně udáním vyhrožuje.",
      "- unclear: nic z toho jasně neřekl.",
      "Vrať POUZE JSON: {\"choice\": \"pay\"|\"ignore\"|\"report\"|\"unclear\"}",
    ].join("\n"), 40);
    const read = readModelEnvelopeReply(raw);
    if (!read) logger.warn({ module: M }, `model nevrátil čitelnou odpověď sudímu: ${JSON.stringify(raw)?.slice(0, 200)}`);
    return read;
  } catch (e) {
    logger.warn({ module: M }, "rozpoznání odpovědi sudímu modelem", e);
    return null;
  }
}

/** AI klub: model přes Workers AI, kód hlídá rezervu; bez modelu pravidlo podle povahy. */
async function decideAiEnvelope(env: EnvelopeEnv, e: EnvelopeRow): Promise<boolean> {
  const db = env.DB;
  const ctx = await loadContext(db, e);
  if (!ctx) {
    await expireEnvelope(db, e);
    return false;
  }
  // AI klubu SMS nechodí, text se přesto uloží: je to důkaz, kdyby sudího nahlásil.
  if (!e.message) {
    const text = envelopeSmsText({
      matchId: e.match_id, refereeName: ctx.refereeName, refereeGender: ctx.refereeGender,
      opponentName: ctx.opponentName, kickoff: ctx.kickoff, amount: e.amount,
    });
    await db.prepare("UPDATE referee_envelopes SET message = ? WHERE id = ?").bind(text, e.id).run();
    e = { ...e, message: text };
  }
  const { readCoachMode } = await import("../ai-coach/mode");
  const { ensureAiProfile, generateAiProfile } = await import("../ai-coach/profile");
  const { budgetReserve } = await import("../ai-coach/valuation");
  const { weeklyRunningCosts } = await import("../ai-coach/transfer-club");
  const { logDecision } = await import("../ai-coach/decision-log");
  const mode = await readCoachMode(env.CACHE_KV, "weekly");
  const profile = await ensureAiProfile(db, e.team_id)
    .catch((err) => { logger.warn({ module: M, teamId: e.team_id }, "povaha AI trenéra pro obálku", err); return generateAiProfile(e.team_id, null); });
  const costs = await weeklyRunningCosts(db, e.team_id)
    .catch((err) => { logger.warn({ module: M, teamId: e.team_id }, "týdenní náklady pro obálku", err); return 0; });
  const c: EnvelopeDecisionContext = {
    teamName: ctx.teamName, profile, budget: ctx.budget, reserve: budgetReserve(profile, costs),
    amount: e.amount, opponentName: ctx.opponentName, refereeName: ctx.refereeName,
  };

  let fromModel: { choice: EnvelopeChoice; reason: string } | null = null;
  let trace: ModelTrace = { model: null, raw: null, error: null, prompt: null, tokensIn: null, tokensOut: null, latencyMs: null };
  if (mode !== "off" && env.AI) {
    const { callCoachModel } = await import("../ai-coach/llm");
    const prompt = renderEnvelopePrompt(c);
    const res = await callCoachModel(env as Pick<Bindings, "AI">, {
      system: ENVELOPE_SYSTEM_PROMPT, user: prompt, maxTokens: 160,
      schema: { name: "referee_envelope", schema: envelopeSchema(c) }, timeoutMs: MODEL_TIMEOUT_MS,
    });
    trace = { model: res.model, raw: res.raw, error: res.error ?? null, prompt, tokensIn: res.tokensIn ?? null, tokensOut: res.tokensOut ?? null, latencyMs: res.latencyMs };
    if (res.json) {
      const check = checkEnvelopeDecision(res.json, c);
      if (check.ok) fromModel = { choice: check.choice, reason: check.reason };
      else trace.error = check.reason;
    }
  }
  const decidedBy = fromModel ? "ai" : "ai_fallback";
  const choice = fromModel?.choice ?? fallbackEnvelopeDecision(c);
  if (!fromModel) {
    logger.warn({ module: M, teamId: e.team_id }, `AI klub o obálce rozhodl pravidlem (model nevrátil odpověď): ${choice}`);
  }

  let executed: EnvelopeDecisionResult | null = null;
  if (mode === "shadow") {
    // Stínový režim nic neprovede; ignorovat je jediná volba bez následků, obálka tím skončí.
    await db.prepare("UPDATE referee_envelopes SET status = 'ignored', decided_by = 'ai_shadow', answered_at = ? WHERE id = ? AND status = 'planned'")
      .bind(nowIso(), e.id).run();
  } else {
    executed = await recordEnvelopeChoice(env, e, choice, decidedBy);
    // Zaplatit nešlo (peníze mezitím zmizely): AI klub obálku nechá být.
    if (!executed.recorded && executed.reason === "no_money") executed = await recordEnvelopeChoice(env, e, "ignore", "ai_fallback");
  }
  await logDecision(db, {
    teamId: e.team_id, kind: "referee_envelope", mode, model: trace.model, contextRef: e.id,
    inputSummary: trace.prompt ?? `obálka ${e.amount} Kč od sudího ${ctx.refereeName} před derby s ${ctx.opponentName}`,
    rawOutput: trace.raw, actions: { choice, reason: fromModel?.reason ?? "fallback", decidedBy },
    executed: mode === "shadow" ? null : executed, usedFallback: !fromModel, error: trace.error,
    tokensIn: trace.tokensIn, tokensOut: trace.tokensOut, latencyMs: trace.latencyMs,
  });
  return true;
}

// ── 4. Zápas ────────────────────────────────────────────────────────────────

/**
 * Doplní do profilu sudího obálku, když za tenhle zápas někdo zaplatil (vzor `withRefereeMemory`).
 * Neodpovězená obálka při výkopu propadne. Do RNG zápasu se nesahá, jen do profilu.
 */
export async function withRefereeEnvelope(
  db: D1Database, profile: RefereeProfile, matchId: string, homeTeamId: string, awayTeamId: string,
): Promise<RefereeProfile> {
  if (!profile.id) return profile;
  const row = await db.prepare("SELECT id, referee_id, team_id, status, conv_id FROM referee_envelopes WHERE match_id = ?")
    .bind(matchId).first<Pick<EnvelopeRow, "id" | "referee_id" | "team_id" | "status" | "conv_id">>()
    .catch((e) => { logger.warn({ module: M }, `obálka zápasu ${matchId}`, e); return null; });
  if (!row) return profile;
  if (row.status === "planned" || row.status === "pending") {
    await expireEnvelope(db, row).catch((e) => logger.warn({ module: M }, `propadnutí obálky ${row.id} při výkopu`, e));
    return profile;
  }
  // Komisař mohl sudího vyměnit: náhradník nic nedostal a nic nedluží.
  if (row.status !== "paid" || row.referee_id !== profile.id) return profile;
  const side = row.team_id === homeTeamId ? "home" : row.team_id === awayTeamId ? "away" : null;
  return side ? { ...profile, envelopeSide: side } : profile;
}

// ── 5. Revize účetnictví ────────────────────────────────────────────────────

export interface EnvelopePayment {
  envelopeId: string;
  amount: number;
  paidOn: string | null;
  refereeName: string;
  sanctionId: string | null;
}

/** Zaplacené obálky v účetnictví klubu od `since` (YYYY-MM-DD): to, co revize najde. */
export async function findEnvelopePayments(db: D1Database, teamId: string, since: string): Promise<EnvelopePayment[]> {
  const rows = await db.prepare(
    `SELECT e.id, e.amount, e.sanction_id, tx.game_date AS paid_on, r.first_name, r.last_name, r.nickname
       FROM transactions tx
       JOIN referee_envelopes e ON e.reference_id = tx.reference_id AND e.team_id = tx.team_id
       LEFT JOIN referees r ON r.id = e.referee_id
      WHERE tx.team_id = ? AND tx.type = 'referee_envelope' AND tx.game_date >= ?
      ORDER BY tx.game_date`,
  ).bind(teamId, since).all<{
    id: string; amount: number; sanction_id: string | null; paid_on: string | null;
    first_name: string | null; last_name: string | null; nickname: string | null;
  }>().catch((e) => { logger.warn({ module: M }, `obálky v účetnictví ${teamId}`, e); return { results: [] }; });
  return rows.results.map((r) => ({
    envelopeId: r.id,
    amount: r.amount,
    paidOn: r.paid_on,
    refereeName: r.first_name && r.last_name ? refereeFullName({ first_name: r.first_name, last_name: r.last_name, nickname: r.nickname }) : "rozhodčí",
    sanctionId: r.sanction_id,
  }));
}

/**
 * Revize našla obálku: skutek `bribery` přes `issueSanction` (pokuta podle `bribeFine`), jednou
 * na obálku díky referenci `bribery-<id>`. Vrací, kolik plateb revize našla a kolik pokut padlo.
 */
export async function sanctionEnvelopePayments(db: D1Database, opts: {
  leagueId: string; seasonNumber: number; targetTeamId: string; auditorTeamId: string; gameDate: string; since: string;
}): Promise<{ found: number; issued: number }> {
  const payments = await findEnvelopePayments(db, opts.targetTeamId, opts.since);
  let issued = 0;
  for (const p of payments) {
    if (p.sanctionId) continue;
    const referenceId = `bribery-${p.envelopeId}`;
    try {
      const { issueSanction } = await import("../competition/discipline");
      const id = await issueSanction(db, {
        leagueId: opts.leagueId, seasonNumber: opts.seasonNumber, teamId: opts.targetTeamId,
        amount: bribeFine(p.amount), kind: "bribery",
        reason: `Úplatek rozhodčímu ${p.refereeName} odhalený revizí účetnictví`,
        evidence: `Hotovost bez dokladu ${czk(p.amount)}${p.paidOn ? ` z ${p.paidOn.slice(0, 10)}` : ""}`,
        issuedBy: "rule", issuedByTeamId: opts.auditorTeamId, proposalId: null, gameDate: opts.gameDate, referenceId,
      });
      const sanctionId = id ?? (await db.prepare("SELECT id FROM competition_sanctions WHERE reference_id = ?")
        .bind(referenceId).first<{ id: string }>())?.id ?? null;
      if (sanctionId) {
        await db.prepare("UPDATE referee_envelopes SET sanction_id = ? WHERE id = ? AND sanction_id IS NULL")
          .bind(sanctionId, p.envelopeId).run();
      }
      if (id) issued++;
    } catch (e) {
      logger.warn({ module: M }, `pokuta za obálku ${p.envelopeId}`, e);
    }
  }
  return { found: payments.length, issued };
}
