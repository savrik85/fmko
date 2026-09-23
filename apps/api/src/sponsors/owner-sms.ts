/**
 * SMS od majitelů firem: fronta, doručení do telefonu, odpověď trenéra a mlčení.
 *
 * Spouštěče jen zapisují do fronty (`enqueueOwnerSms`, idempotentně přes reference_id).
 * Doručuje `deliverOwnerSmsForTeam`: nejvýš jedna SMS od majitelů na klub a herní den,
 * majitel pak OWNER_SMS_COOLDOWN_DAYS dní mlčí. Bez modelu a bez kreditu, stejně jako
 * vůdce fanoušků (fans/fan-leader-reply.ts). Každá změna náklonnosti jde přes
 * `favorDeltaStmts`, tedy s deníkem pro záložku Oblíbenost.
 */
import { logger } from "../lib/logger";
import { sendOwnerSMS } from "../messaging/system-sms";
import { ensureSponsorOwner, ensureSponsorOwners, favorDeltaStmts } from "./favor";
import { DEFAULT_FAVOR, FAVOR_REASONS } from "./favor-math";
import {
  addDays, classifyFreeReply, ignoreFavorDelta, OCCASION_RULES, OWNER_SMS_COOLDOWN_DAYS, OWNER_SMS_REPLY_DAYS,
  pickDeliverable, replyFavorDelta, type RelationshipOwner,
} from "./owner-sms-rules";
import {
  isOwnerSmsOccasion, isReplyTone, ownerReplyBack, renderOwnerSms, replyOptions,
  type OwnerSmsOccasion, type OwnerSmsVars, type ReplyTone,
} from "./owner-sms-texts";
import { isOwnerPersonality, type OwnerPersonality } from "./owners";

const M = "owner-sms";

/** Herní den klubu (YYYY-MM-DD) z `teams.game_date`. */
export async function teamGameDay(db: D1Database, teamId: string): Promise<string | null> {
  const row = await db.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ game_date: string | null }>();
  return row?.game_date ? row.game_date.slice(0, 10) : null;
}

export interface OwnerSmsRequest {
  sponsorId: number;
  teamId: string;
  occasion: OwnerSmsOccasion;
  /** Stabilní klíč spouštěče, např. `riot:{matchId}`. */
  referenceId: string;
  /** Herní den zařazení (YYYY-MM-DD nebo ISO). */
  day: string;
  vars?: OwnerSmsVars;
}

/** Zařadí SMS do fronty. Jen lidský seniorský klub; tatáž reference podruhé nic nezapíše. */
export async function enqueueOwnerSms(db: D1Database, r: OwnerSmsRequest): Promise<boolean> {
  const rule = OCCASION_RULES[r.occasion];
  const day = r.day.slice(0, 10);
  const res = await db.prepare(
    `INSERT OR IGNORE INTO sponsor_owner_sms
       (id, sponsor_id, team_id, occasion, reference_id, expects_reply, status, vars, created_day, deliver_by)
     SELECT ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?
     WHERE EXISTS (SELECT 1 FROM teams t WHERE t.id = ? AND t.user_id != 'ai'
                     AND COALESCE(t.team_type, 'senior') != 'u21' AND t.name NOT LIKE 'DELETED-%')`,
  ).bind(
    crypto.randomUUID(), r.sponsorId, r.teamId, r.occasion, r.referenceId, rule.expectsReply ? 1 : 0,
    JSON.stringify(r.vars ?? {}), day, addDays(day, rule.deliverDays), r.teamId,
  ).run();
  return (res.meta?.changes ?? 0) > 0;
}

/** Majitelé, se kterými má klub vztah: řádek náklonnosti nebo aktivní smlouva. */
export async function loadRelationshipOwners(db: D1Database, teamId: string): Promise<RelationshipOwner[]> {
  const rows = await db.prepare(
    `WITH rel AS (
       SELECT sponsor_id FROM sponsor_team_favor WHERE team_id = ?1
       UNION
       SELECT sponsor_id FROM sponsor_contracts WHERE team_id = ?1 AND status = 'active' AND sponsor_id IS NOT NULL
     )
     SELECT rel.sponsor_id,
            COALESCE((SELECT favor FROM sponsor_team_favor f WHERE f.sponsor_id = rel.sponsor_id AND f.team_id = ?1), ?2) AS favor,
            EXISTS (SELECT 1 FROM sponsor_contracts sc WHERE sc.sponsor_id = rel.sponsor_id AND sc.team_id = ?1
                      AND sc.status = 'active') AS has_contract,
            EXISTS (SELECT 1 FROM sponsor_contracts sc WHERE sc.sponsor_id = rel.sponsor_id AND sc.team_id = ?1
                      AND sc.status = 'active' AND COALESCE(sc.category, 'main') = 'main') AS is_main
     FROM rel`,
  ).bind(teamId, DEFAULT_FAVOR).all<{ sponsor_id: number; favor: number; has_contract: number; is_main: number }>();
  if (rows.results.length === 0) return [];
  const owners = await ensureSponsorOwners(db, rows.results.map((r) => r.sponsor_id));
  const out: RelationshipOwner[] = [];
  for (const r of rows.results) {
    const o = owners.get(r.sponsor_id);
    if (!o) continue;
    out.push({ sponsorId: r.sponsor_id, personality: o.personality, favor: r.favor, hasContract: r.has_contract === 1, isMain: r.is_main === 1 });
  }
  return out;
}

function parseVars(raw: string | null): OwnerSmsVars {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as OwnerSmsVars;
  } catch (e) {
    logger.warn({ module: M }, "nečitelné proměnné SMS majitele", e);
    return {};
  }
}

interface PendingRow {
  id: string; sponsor_id: number; occasion: string; created_day: string; reference_id: string; vars: string | null;
}

/**
 * Pošle klubu nejvýš jednu čekající SMS od majitele. `todayIso` = herní den ticku;
 * bez něj se vezme `teams.game_date` (match-runner, routy). Vrací, jestli SMS odešla.
 */
export async function deliverOwnerSmsForTeam(db: D1Database, teamId: string, todayIso?: string): Promise<boolean> {
  const today = (todayIso ?? (await teamGameDay(db, teamId)) ?? "").slice(0, 10);
  if (!today) return false;

  await db.prepare("UPDATE sponsor_owner_sms SET status = 'dropped' WHERE team_id = ? AND status = 'pending' AND deliver_by < ?")
    .bind(teamId, today).run();

  const pending = await db.prepare(
    "SELECT id, sponsor_id, occasion, created_day, reference_id, vars FROM sponsor_owner_sms WHERE team_id = ? AND status = 'pending'",
  ).bind(teamId).all<PendingRow>();
  if (pending.results.length === 0) return false;

  // ABS: rollover vrací herní čas zpátky, starší odeslání pak leží „v budoucnu".
  const sent = await db.prepare(
    `SELECT sponsor_id, occasion, sent_day FROM sponsor_owner_sms
     WHERE team_id = ? AND sent_day IS NOT NULL AND ABS(julianday(sent_day) - julianday(?)) < ?`,
  ).bind(teamId, today, OWNER_SMS_COOLDOWN_DAYS).all<{ sponsor_id: number; occasion: string; sent_day: string }>();

  const pick = pickDeliverable(
    pending.results.filter((p) => isOwnerSmsOccasion(p.occasion))
      .map((p) => ({ id: p.id, sponsorId: p.sponsor_id, occasion: p.occasion as OwnerSmsOccasion, createdDay: p.created_day })),
    sent.results.filter((s) => isOwnerSmsOccasion(s.occasion))
      .map((s) => ({ sponsorId: s.sponsor_id, occasion: s.occasion as OwnerSmsOccasion, sentDay: s.sent_day })),
    today,
  );
  if (!pick) return false;
  const row = pending.results.find((p) => p.id === pick.id);
  if (!row) return false;

  // Nárok: podmíněný UPDATE drží denní limit i při souběhu match-runneru a denního ticku.
  const claim = await db.prepare(
    `UPDATE sponsor_owner_sms SET status = 'awaiting', sent_day = ?1, reply_by = ?2
     WHERE id = ?3 AND status = 'pending'
       AND NOT EXISTS (SELECT 1 FROM sponsor_owner_sms x WHERE x.team_id = ?4 AND x.sent_day = ?1 AND x.id != ?3)`,
  ).bind(today, addDays(today, OWNER_SMS_REPLY_DAYS), pick.id, teamId).run();
  if ((claim.meta?.changes ?? 0) !== 1) return false;

  const drop = () => db.prepare("UPDATE sponsor_owner_sms SET status = 'dropped', sent_day = NULL, reply_by = NULL WHERE id = ?")
    .bind(pick.id).run();

  const owner = await ensureSponsorOwner(db, pick.sponsorId);
  const firm = await db.prepare("SELECT name FROM district_sponsors WHERE id = ?")
    .bind(pick.sponsorId).first<{ name: string }>();
  const recent = await db.prepare(
    "SELECT body FROM sponsor_owner_sms WHERE team_id = ? AND body IS NOT NULL ORDER BY sent_day DESC, created_at DESC LIMIT 6",
  ).bind(teamId).all<{ body: string }>();
  const text = owner
    ? renderOwnerSms(pick.occasion, owner.personality, parseVars(row.vars), `owner-sms|${row.reference_id}`, recent.results.map((r) => r.body))
    : null;
  if (!owner || !text) {
    await drop();
    return false;
  }

  // Předchozí nezodpovězená SMS téhož majitele (den před zápasem) tímhle končí, bez postihu.
  await db.prepare(
    "UPDATE sponsor_owner_sms SET status = 'closed' WHERE team_id = ? AND sponsor_id = ? AND status = 'awaiting' AND id != ?",
  ).bind(teamId, pick.sponsorId, pick.id).run();

  const name = `${owner.firstName} ${owner.lastName}`;
  const convId = await sendOwnerSMS(db, teamId, {
    sponsorId: pick.sponsorId, name, firmName: firm?.name ?? null, avatar: JSON.stringify(owner.faceConfig),
  }, text, { smsId: pick.id, options: replyOptions(pick.occasion) });
  if (!convId) {
    await drop();
    return false;
  }
  await db.prepare("UPDATE sponsor_owner_sms SET body = ?, conversation_id = ? WHERE id = ?")
    .bind(text, convId, pick.id).run();
  logger.info({ module: M, teamId }, `SMS od majitele ${pick.sponsorId}: ${pick.occasion}`);
  return true;
}

interface OwnerThreadState {
  kind?: string;
  smsId?: string;
  sponsorId?: number;
  awaiting?: string;
}

/**
 * Odpověď trenéra v konverzaci s majitelem. `optionId` = tlačítko (warm/neutral/dismissive),
 * bez něj se tón pozná z textu. Vrací `false`, když vlákno majiteli nepatří. Nikdy nehází.
 */
export async function handleOwnerSmsReply(
  db: D1Database, convId: string, text: string, optionId: string | null,
): Promise<boolean> {
  try {
    const conv = await db
      .prepare("SELECT team_id, ai_thread_state FROM conversations WHERE id = ? AND ai_thread_active = 1")
      .bind(convId).first<{ team_id: string; ai_thread_state: string | null }>();
    if (!conv?.ai_thread_state) return false;

    let state: OwnerThreadState;
    try {
      state = JSON.parse(conv.ai_thread_state) as OwnerThreadState;
    } catch (e) {
      logger.warn({ module: M }, `nečitelné vlákno konverzace ${convId}`, e);
      return false;
    }
    if (state.kind !== "sponsor_owner" || !state.smsId || typeof state.sponsorId !== "number") return false;

    const tone: ReplyTone = isReplyTone(optionId) ? optionId : classifyFreeReply(text);
    // Nárok na SMS: dvě rychlé odpovědi za sebou nesmí dopad zdvojit. RETURNING occasion
    // ušetří druhý dotaz — nese ji ten samý nárokovaný řádek.
    const claim = await db.prepare(
      `UPDATE sponsor_owner_sms SET status = 'replied', reply_tone = ?
       WHERE id = ? AND status = 'awaiting' AND team_id = ?
       RETURNING occasion`,
    ).bind(tone, state.smsId, conv.team_id).run<{ occasion: string }>();
    if ((claim.meta?.changes ?? 0) !== 1) {
      // Vlákno přežilo svou SMS (vypršela nebo ji nahradila novější): jen ho zavřít.
      await db.prepare(
        "UPDATE conversations SET ai_thread_active = 0, ai_thread_state = NULL WHERE id = ? AND json_extract(ai_thread_state, '$.smsId') = ?",
      ).bind(convId, state.smsId).run();
      return true;
    }

    const owner = await ensureSponsorOwner(db, state.sponsorId);
    const personality: OwnerPersonality = owner?.personality ?? "businessman";
    const delta = replyFavorDelta(personality, tone);
    // Obranný fallback: RETURNING vrací occasion nárokovaného řádku, chybět nemá.
    const occasionRaw = claim.results?.[0]?.occasion;
    const occasion: OwnerSmsOccasion = isOwnerSmsOccasion(occasionRaw) ? occasionRaw : "after_win";
    const back = ownerReplyBack(personality, occasion, delta, `owner-reply|${state.smsId}`);
    const senderName = owner ? `${owner.firstName} ${owner.lastName}` : "Majitel firmy";
    const reason = tone === "dismissive" ? FAVOR_REASONS.smsDismissed : FAVOR_REASONS.smsReply;

    await db.batch([
      ...(delta !== 0 ? favorDeltaStmts(db, state.sponsorId, conv.team_id, delta, reason) : []),
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, sent_at)
         VALUES (?, ?, 'system', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
      ).bind(crypto.randomUUID(), convId, `so-${state.sponsorId}`, senderName, back),
      db.prepare(
        `UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?,
           last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), ai_thread_active = 0, ai_thread_state = NULL
         WHERE id = ?`,
      ).bind(back.slice(0, 100), convId),
    ]);
    logger.info({ module: M, teamId: conv.team_id }, `odpověď majiteli ${state.sponsorId}: ${tone}, náklonnost ${delta}`);
    return true;
  } catch (e) {
    logger.warn({ module: M }, `odpověď majiteli v konverzaci ${convId}`, e);
    return false;
  }
}

/**
 * Lhůta na odpověď vypršela. Kde se odpověď čekala, stojí mlčení náklonnost
 * („neodpověděl na SMS"), jinak se vlákno jen zavře. Vrací počet vyřízených SMS.
 */
export async function expireOwnerSmsReplies(db: D1Database, today: string): Promise<number> {
  const rows = await db.prepare(
    `SELECT s.id, s.sponsor_id, s.team_id, s.expects_reply, s.conversation_id, so.personality
     FROM sponsor_owner_sms s LEFT JOIN sponsor_owners so ON so.sponsor_id = s.sponsor_id
     WHERE s.status = 'awaiting' AND s.reply_by < ?`,
  ).bind(today.slice(0, 10)).all<{
    id: string; sponsor_id: number; team_id: string; expects_reply: number; conversation_id: string | null; personality: string | null;
  }>();
  let n = 0;
  for (const r of rows.results) {
    const claim = await db.prepare("UPDATE sponsor_owner_sms SET status = ? WHERE id = ? AND status = 'awaiting'")
      .bind(r.expects_reply === 1 ? "ignored" : "closed", r.id).run();
    if ((claim.meta?.changes ?? 0) !== 1) continue;
    n++;
    const p: OwnerPersonality = isOwnerPersonality(r.personality) ? r.personality : "businessman";
    const stmts: D1PreparedStatement[] = [];
    if (r.expects_reply === 1) {
      stmts.push(...favorDeltaStmts(db, r.sponsor_id, r.team_id, ignoreFavorDelta(p), FAVOR_REASONS.smsIgnored));
    }
    if (r.conversation_id) {
      stmts.push(db.prepare(
        "UPDATE conversations SET ai_thread_active = 0, ai_thread_state = NULL WHERE id = ? AND json_extract(ai_thread_state, '$.smsId') = ?",
      ).bind(r.conversation_id, r.id));
    }
    if (stmts.length > 0) await db.batch(stmts);
  }
  return n;
}

/**
 * Rollover vrací herní čas na reálné datum: lhůty ze staré osy by nikdy nevypršely.
 * Otevřená vlákna se proto tiše zavřou a fronta se vyprázdní, bez postihu.
 */
export async function closeOwnerSmsForRollover(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare("UPDATE sponsor_owner_sms SET status = 'closed' WHERE status = 'awaiting'"),
    db.prepare("UPDATE sponsor_owner_sms SET status = 'dropped' WHERE status = 'pending'"),
    db.prepare(
      `UPDATE conversations SET ai_thread_active = 0, ai_thread_state = NULL
       WHERE ai_thread_active = 1 AND participant_id LIKE 'so-%'`,
    ),
  ]);
}
