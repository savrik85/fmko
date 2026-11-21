/**
 * Svatba v kabině (F3): zápis do databáze. Pravidla a texty jsou ve wedding.ts.
 *
 * Tok:
 *  1. Denní tick založí situaci `svatba_spoluhrace` (incidents/situace-db.ts `zalozSituaci`):
 *     svatba dostane datum (`insertWedding`) a ženich pošle trenérovi pozvánku s datem.
 *  2. Trenér odpoví v chatu s ženichem (`handleWeddingReply`, volá ho messaging/casual-messages.ts
 *     `handleCoachMessageForInvite`). Síto, pak model, při vypnuté AI pravidlo. Rozhodnutí se zapíše
 *     jednou (`recordWeddingDecision`): dar, kocovina v sestavě jako incidentní absence, vztah ženicha.
 *     AI klub rozhoduje modelem v hodinové práci AI trenéra (ai-coach/weddings.ts).
 *  3. Denní tick (`processWeddingsForDay`): den před svatbou se uzavře rozhodnutí (kdo neodpověděl,
 *     nic nerozhodl), den po svatbě kondice pijáků, vztah ženicha za účast a poděkování.
 *  4. Hodinový běh Telefonu (`publishWeddingArticles`): krátký článek do Zpravodaje se svatební
 *     fotkou a SMS od Redakce Zpravodaje s tlačítkem na článek.
 *
 * Každý krok má v `weddings` vlastní zámek (podmíněný UPDATE … IS NULL), takže opakovaný běh fronty,
 * dvojí cron ani dvě rychlé zprávy trenéra nedají dvojí dar, dvojí kocovinu ani dvojí SMS.
 */

import { createRng } from "../generators/rng";
import { prikazAbsence } from "../incidents/absence-hracu";
import { clubReceivesMessages, sendIncidentPlayerSms } from "../incidents/club-messages";
import { posunHrace } from "../incidents/hraci";
import { hracZRadku, SLOUPCE_HRACE } from "../incidents/stav-klubu";
import { text } from "../incidents/texty";
import type { StavKlubu } from "../incidents/typy";
import type { Bindings } from "../index";
import { coachRelationStmts } from "../lib/coach-relation";
import { logConditionStmt } from "../lib/condition-log";
import { cleanDashes } from "../lib/dashes";
import { logger } from "../lib/logger";
import { pragueHour } from "../lib/match-tick-schedule";
import { seedFromString } from "../lib/seed";
import type { ChatEnv } from "../messaging/ai-player-chat";
import type { FollowUpEnv } from "../messaging/follow-ups";
import {
  ATTEND_EFFECT, canAnnounceHangover, checkModelWeddingReply, czechDayWords, dayPlus, decisionClosesOn, decisionEffect,
  formatCzk, mightBeWeddingReply, planHangover, readWeddingReplyByRules, weddingArticleFallback,
  weddingDecisionFromReply, weddingNoteText,
  type WeddingChoice, type WeddingDecider, type WeddingGuest, type WeddingPlan, type WeddingReply,
} from "./wedding";

const M = "weddings";

/** Odesílatel SMS o článku, stejný jako u reportáže z okresní akce (events/district-event-db.ts). */
export const NEWS_DESK = "Redakce Zpravodaje";
/** Typ článku v `news`. Má vlastní rubriku ve Zpravodaji (web zpravodaj/page.tsx). */
export const WEDDING_NEWS_TYPE = "club_wedding";
/** Článek se píše jen přes den, ať SMS od Redakce nechodí v noci. Pražské hodiny. */
const ARTICLE_FROM_HOUR = 8;
const ARTICLE_TO_HOUR = 21;
/** Kolik článků nejvýš za jeden hodinový běh (fotka i model trvají vteřiny). */
const ARTICLES_PER_RUN = 3;
/** Kondice tvrdého pijáka, kterému se absence nestihla nahlásit: hraje, ale s kocovinou. */
const UNANNOUNCED_HANGOVER_DROP = 20;

export interface WeddingRow {
  id: string;
  team_id: string;
  player_id: string;
  season_number: number | null;
  announced_on: string;
  wedding_date: string;
  match_date: string | null;
  choice: WeddingChoice | null;
  gift_amount: number | null;
  decided_by: WeddingDecider | null;
  decided_at: string | null;
  coach_quote: string | null;
  gift_paid_at: string | null;
  hangover_absent: string | null;
  hangover_written_at: string | null;
  settled_at: string | null;
  article_at: string | null;
  news_id: string | null;
  photo_key: string | null;
  created_at: string;
}

interface GroomRow {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  avatar: string | null;
}

/** Svatba naplánovaná při založení situace. `INSERT OR IGNORE`: druhý průchod dnem nic nepřidá. */
export async function insertWedding(
  db: D1Database,
  o: { id: string; teamId: string; playerId: string; seasonNumber: number; announcedOn: string; plan: WeddingPlan },
): Promise<boolean> {
  const r = await db.prepare(
    `INSERT OR IGNORE INTO weddings (id, team_id, player_id, season_number, announced_on, wedding_date, match_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(o.id, o.teamId, o.playerId, o.seasonNumber, o.announcedOn.slice(0, 10), o.plan.weddingDate, o.plan.matchDate, new Date().toISOString()).run()
    .catch((e) => { logger.error({ module: M, teamId: o.teamId }, `založení svatby ${o.id}`, e); return null; });
  return (r?.meta?.changes ?? 0) > 0;
}

async function loadGroom(db: D1Database, w: Pick<WeddingRow, "team_id" | "player_id">): Promise<GroomRow | null> {
  return db.prepare(
    "SELECT id, first_name, last_name, nickname, avatar FROM players WHERE id = ? AND team_id = ? AND (status IS NULL OR status = 'active')",
  ).bind(w.player_id, w.team_id).first<GroomRow>()
    .catch((e) => { logger.warn({ module: M, teamId: w.team_id }, `ženich ${w.player_id}`, e); return null; });
}

const groomRef = (g: GroomRow) => ({ id: g.id, firstName: g.first_name, lastName: g.last_name, nickname: g.nickname, avatar: g.avatar });

/** Hosté ze šatny: aktivní kádr kromě ženicha. Pití se čte stejně jako ve stavu klubu (`hracZRadku`). */
export async function loadGuests(db: D1Database, teamId: string, groomId: string): Promise<WeddingGuest[]> {
  const rows = await db.prepare(
    `SELECT ${SLOUPCE_HRACE} FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')`,
  ).bind(teamId).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: M, teamId }, "kádr na svatbu", e); return { results: [] as Array<Record<string, unknown>> }; });
  return rows.results.map((r) => hracZRadku(r)).filter((h) => h.id !== groomId).map((h) => ({ id: h.id, alcohol: h.alkohol }));
}

const hangoverRng = (weddingId: string) => createRng(seedFromString(`wedding-hangover|${weddingId}`));

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch (e) {
    logger.warn({ module: M }, "seznam hráčů s kocovinou není JSON", e);
    return [];
  }
}

/**
 * Kocovina v sestavě: nejtvrdší pijáci dostanou incidentní absenci na zápas den po svatbě. Jen když
 * se to dá ohlásit včas (`canAnnounceHangover`), jinak by SMS den předem a simulace viděly něco
 * jiného. Zámek `hangover_written_at` a odvozená id absencí drží jeden zápis. Vrací, kdo chybí.
 */
async function writeHangoverAbsences(db: D1Database, w: WeddingRow, choice: WeddingChoice, today: string): Promise<string[]> {
  if (choice === "ban" || !canAnnounceHangover(today, w.match_date)) return [];
  const claimed = await db.prepare("UPDATE weddings SET hangover_written_at = ? WHERE id = ? AND hangover_written_at IS NULL")
    .bind(new Date().toISOString(), w.id).run()
    .catch((e) => { logger.warn({ module: M, teamId: w.team_id }, `zámek kocoviny ${w.id}`, e); return null; });
  if ((claimed?.meta?.changes ?? 0) === 0) return [];
  const plan = planHangover(await loadGuests(db, w.team_id, w.player_id), choice, hangoverRng(w.id));
  const stmts: D1PreparedStatement[] = [];
  for (const playerId of plan.absent) {
    const stmt = prikazAbsence(db, {
      incidentId: `${w.id}-hangover-${playerId}`, teamId: w.team_id, playerId, druh: "hangover",
      od: w.match_date, do: w.match_date, zapasu: null, ohlaseno: today,
      sms: text(createRng(seedFromString(`wedding-absence|${w.id}|${playerId}`)), "absence_hangover"),
    });
    if (stmt) stmts.push(stmt);
  }
  stmts.push(db.prepare("UPDATE weddings SET hangover_absent = ? WHERE id = ?").bind(JSON.stringify(plan.absent), w.id));
  const ok = await db.batch(stmts).then(() => true)
    .catch((e) => { logger.error({ module: M, teamId: w.team_id }, `kocovina po svatbě ${w.id}`, e); return false; });
  if (!ok) {
    // Zámek pustit, ať to denní tick zkusí znovu (odvozená id absencí drží jeden zápis).
    await db.prepare("UPDATE weddings SET hangover_written_at = NULL WHERE id = ?").bind(w.id).run()
      .catch((e) => logger.warn({ module: M, teamId: w.team_id }, `uvolnění zámku kocoviny ${w.id}`, e));
    return [];
  }
  return plan.absent;
}

/**
 * Svatební dar: jednou. Zámek `gift_paid_at`, nad ním kontrola transakce se stejným `referenceId`.
 * Když platba neprojde (rozpočet v mínusu), zámek se pustí a vrací se false.
 */
async function payWeddingGift(db: D1Database, w: WeddingRow, amount: number, gameDate: string, groomName: string): Promise<boolean> {
  const referenceId = `wedding-gift-${w.id}`;
  const claimed = await db.prepare("UPDATE weddings SET gift_paid_at = ? WHERE id = ? AND gift_paid_at IS NULL")
    .bind(new Date().toISOString(), w.id).run()
    .catch((e) => { logger.warn({ module: M, teamId: w.team_id }, `zámek daru ${w.id}`, e); return null; });
  if ((claimed?.meta?.changes ?? 0) === 0) return false;
  const already = await db.prepare("SELECT 1 AS yes FROM transactions WHERE team_id = ? AND reference_id = ? LIMIT 1")
    .bind(w.team_id, referenceId).first()
    .catch((e) => { logger.warn({ module: M, teamId: w.team_id }, `kontrola daru ${w.id}`, e); return null; });
  if (already) return false;
  const { recordTransaction } = await import("../season/finance-processor");
  const paid = await recordTransaction(db, w.team_id, "wedding_gift", -amount, `Svatební dar: ${groomName}`, gameDate, referenceId)
    .then(() => true)
    .catch((e) => { logger.warn({ module: M, teamId: w.team_id }, `svatební dar ${w.id}`, e); return false; });
  if (!paid) {
    await db.prepare("UPDATE weddings SET gift_paid_at = NULL WHERE id = ?").bind(w.id).run()
      .catch((e) => logger.warn({ module: M, teamId: w.team_id }, `uvolnění zámku daru ${w.id}`, e));
  }
  return paid;
}

/** Poznámka pro manažera do konverzace s ženichem (jako u slibů z rozhovorů). */
async function postNote(db: D1Database, convId: string, weddingId: string, body: string): Promise<void> {
  const at = new Date(Date.now() + 1000).toISOString();
  await db.batch([
    db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at, read)
       VALUES (?, ?, 'system', 'Systém', ?, ?, ?, 1)`,
    ).bind(crypto.randomUUID(), convId, body, JSON.stringify({ type: "wedding_note", weddingId }), at),
  ]).catch((e) => logger.warn({ module: M }, `poznámka ke svatbě ${weddingId}`, e));
}

export interface WeddingDecision {
  choice: WeddingChoice;
  giftAmount: number | null;
  decidedBy: WeddingDecider;
  quote?: string | null;
}

export interface RecordResult {
  recorded: boolean;
  giftPaid: boolean;
  absent: string[];
}

/**
 * Zapíše rozhodnutí jednou (zámek na `choice IS NULL`) a hned provede, co z něj plyne: dar,
 * kocovinu v sestavě a dopad zákazu nebo daru na ženicha. „Přijdu“ se ve vztahu projeví až
 * den po svatbě (`settleWedding`). S `convId` dostane manažer poznámku, co si hra zapsala.
 */
export async function recordWeddingDecision(
  db: D1Database,
  w: WeddingRow,
  d: WeddingDecision,
  o: { today: string; gameDate: string; convId?: string | null },
): Promise<RecordResult> {
  const nothing: RecordResult = { recorded: false, giftPaid: false, absent: [] };
  const claimed = await db.prepare(
    `UPDATE weddings SET choice = ?, gift_amount = ?, decided_by = ?, decided_at = ?, coach_quote = ?
      WHERE id = ? AND choice IS NULL`,
  ).bind(d.choice, d.giftAmount, d.decidedBy, new Date().toISOString(), d.quote ? d.quote.replace(/\s+/g, " ").slice(0, 200) : null, w.id).run()
    .catch((e) => { logger.error({ module: M, teamId: w.team_id }, `rozhodnutí o svatbě ${w.id}`, e); return null; });
  if ((claimed?.meta?.changes ?? 0) === 0) return nothing;

  const groom = await loadGroom(db, w);
  if (!groom) {
    logger.info({ module: M, teamId: w.team_id }, `svatba ${w.id}: ženich už v klubu není, rozhodnutí bez dopadů`);
    return { ...nothing, recorded: true };
  }
  const groomName = `${groom.first_name} ${groom.last_name}`;
  const giftPaid = d.giftAmount ? await payWeddingGift(db, w, d.giftAmount, o.gameDate, groomName) : false;
  const absent = await writeHangoverAbsences(db, w, d.choice, o.today.slice(0, 10));

  const effect = decisionEffect(d.choice, giftPaid ? d.giftAmount : null);
  if (effect) {
    const stmts = d.choice === "ban"
      ? posunHrace(db, w.team_id, groom.id, { morale: effect.morale, vztah: effect.relation, description: effect.description })
      : [
        ...posunHrace(db, w.team_id, groom.id, { morale: effect.morale }),
        ...coachRelationStmts(db, { playerId: groom.id, delta: effect.relation, source: "invite", description: effect.description, gameDate: o.today.slice(0, 10) }),
      ];
    if (stmts.length > 0) {
      await db.batch(stmts).catch((e) => logger.warn({ module: M, teamId: w.team_id }, `dopad rozhodnutí o svatbě ${w.id}`, e));
    }
  }

  if (o.convId && d.choice !== "none") {
    const note = d.choice === "gift" && !giftPaid
      ? `💍 ${groom.first_name}: svatební dar se nepodařilo zaplatit, na účtu není dost peněz.`
      : weddingNoteText(groom.first_name, d.choice, giftPaid ? d.giftAmount : null);
    await postNote(db, o.convId, w.id, note);
  }
  logger.info({ module: M, teamId: w.team_id }, `svatba ${w.id}: ${d.choice} (${d.decidedBy})${giftPaid ? `, dar ${d.giftAmount} Kč` : ""}, kocovina ${absent.length}`);
  return { recorded: true, giftPaid, absent };
}

/**
 * Odpověď trenéra s modelem, při vypnuté AI nebo výpadku podle pravidla. Model dostane jen zprávu
 * a pozvánku, rozhodnutí z jeho odpovědi zkontroluje `checkModelWeddingReply`.
 */
async function readWeddingReply(env: ChatEnv, coachMessage: string, o: { firstName: string; weddingDate: string; matchNextDay: boolean }): Promise<WeddingReply | null> {
  const { isAiEnabled } = await import("../lib/ai-provider");
  if (await isAiEnabled(env)) {
    try {
      const chat = await import("../messaging/ai-player-chat");
      const raw = await chat.askModelJson<unknown>(env, [
        `Hráč ${o.firstName} pozval trenéra vesnického fotbalového týmu na svou svatbu ${czechDayWords(o.weddingDate)}`
          + `${o.matchNextDay ? ", den před ligovým zápasem" : ""}. Kluci z kabiny jsou pozvaní taky.`,
        `Trenér mu teď napsal: ${chat.coachQuote(coachMessage)}`,
        chat.COACH_TEXT_RULE,
        "",
        "Co trenér v TÉHLE zprávě rozhodl? Může platit víc věcí naráz.",
        "- attend: slíbil, že na svatbu přijde („dorazím“, „budu tam“, „nenechám si to ujít“, „pohlídám kluky“). Váhání („možná“, „uvidím“) nebo odmítnutí = false.",
        "- ban: klukům na svatbě zakázal pít, nebo jim zakázal na svatbu jezdit („ani kapku“, „žádnej chlast“, „nikam nejezděte“). Přání „ať se neztřískaj“ u slibu, že je pohlídá, zákaz není.",
        "- gift: pošle nebo přinese novomanželům dar, obálku nebo peníze.",
        "- amount: částka daru v Kč, když ji napsal („dva litry“ = 2000, „pětistovka“ = 500, „tři táce“ = 3000), jinak null.",
        "Vrať POUZE JSON: {\"attend\": true|false, \"ban\": true|false, \"gift\": true|false, \"amount\": číslo|null}",
      ].join("\n"), 80);
      const checked = checkModelWeddingReply(raw, coachMessage);
      if (checked) return checked;
      logger.warn({ module: M }, `model nevrátil čitelné rozhodnutí o svatbě: ${JSON.stringify(raw)?.slice(0, 200)}`);
    } catch (e) {
      logger.warn({ module: M }, "rozpoznání odpovědi na svatbu modelem, rozhodne pravidlo", e);
    }
  }
  return readWeddingReplyByRules(coachMessage);
}

/**
 * Trenér napsal ženichovi. Když na odpověď čeká svatba, pozná z textu rozhodnutí a zapíše ho.
 * Vrací `null`, když v téhle konverzaci žádná svatba nečeká (volající pak řeší obyčejné pozvání),
 * jinak jestli se rozhodnutí zapsalo.
 */
export async function handleWeddingReply(db: D1Database, env: ChatEnv, convId: string, coachMessage: string): Promise<boolean | null> {
  const conv = await db.prepare("SELECT team_id, participant_id, type FROM conversations WHERE id = ?")
    .bind(convId).first<{ team_id: string; participant_id: string | null; type: string }>()
    .catch((e) => { logger.warn({ module: M }, `konverzace ${convId} pro svatbu`, e); return null; });
  if (!conv || conv.type !== "player" || !conv.participant_id) return null;
  const team = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(conv.team_id).first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId: conv.team_id }, "herní den pro svatbu", e); return null; });
  const gameDate = team?.game_date ?? new Date().toISOString();
  const today = gameDate.slice(0, 10);
  const w = await db.prepare(
    `SELECT * FROM weddings WHERE team_id = ? AND player_id = ? AND choice IS NULL AND wedding_date > ?
      ORDER BY wedding_date LIMIT 1`,
  ).bind(conv.team_id, conv.participant_id, today).first<WeddingRow>()
    .catch((e) => { logger.warn({ module: M, teamId: conv.team_id }, "otevřená svatba", e); return null; });
  if (!w) return null;
  if (!mightBeWeddingReply(coachMessage)) return false;

  const groom = await loadGroom(db, w);
  if (!groom) return false;
  const reply = await readWeddingReply(env, coachMessage, { firstName: groom.first_name, weddingDate: w.wedding_date, matchNextDay: !!w.match_date });
  const decision = reply ? weddingDecisionFromReply(reply) : null;
  if (!decision) return false;

  let giftAmount = decision.giftAmount;
  if (giftAmount) {
    const { spendBlockedMessage } = await import("../season/finance-processor");
    const blocked = await spendBlockedMessage(db, w.team_id, giftAmount)
      .catch((e) => { logger.warn({ module: M, teamId: w.team_id }, "rozpočet na svatební dar", e); return "Rozpočet se nepodařilo ověřit."; });
    if (blocked) {
      await postNote(db, convId, w.id, `💍 Svatební dar ${formatCzk(giftAmount)}: ${blocked}`);
      // Samotný dar bez peněz nic nerozhodl, ať může trenér odpovědět jinak.
      if (decision.choice === "gift") return false;
      giftAmount = null;
    }
  }
  const r = await recordWeddingDecision(db, w, { choice: decision.choice, giftAmount, decidedBy: "coach", quote: coachMessage }, { today, gameDate, convId });
  return r.recorded;
}

async function isAiTeam(db: D1Database, teamId: string): Promise<boolean> {
  return !(await clubReceivesMessages(db, teamId));
}

/** Dar, který se nepodařilo zaplatit, se po svatbě počítá, jako by trenér nic nerozhodl. */
function effectiveChoice(w: Pick<WeddingRow, "choice" | "gift_paid_at">): WeddingChoice {
  const choice = w.choice ?? "none";
  return choice === "gift" && !w.gift_paid_at ? "none" : choice;
}

/**
 * Den po svatbě (nebo později, když tick vypadl): kondice pijáků, vztah ženicha za účast
 * a poděkování od ženicha. Zámek `settled_at`, takže se to stane jednou.
 */
async function settleWedding(env: Bindings, w: WeddingRow, state: StavKlubu): Promise<void> {
  const db = env.DB;
  const claimed = await db.prepare("UPDATE weddings SET settled_at = ? WHERE id = ? AND settled_at IS NULL")
    .bind(new Date().toISOString(), w.id).run()
    .catch((e) => { logger.warn({ module: M, teamId: w.team_id }, `zámek dne po svatbě ${w.id}`, e); return null; });
  if ((claimed?.meta?.changes ?? 0) === 0) return;
  const groom = await loadGroom(db, w);
  if (!groom || !state.kadr.some((h) => h.id === groom.id)) {
    logger.info({ module: M, teamId: w.team_id }, `svatba ${w.id}: ženich už v klubu není`);
    return;
  }
  const choice = effectiveChoice(w);

  const guests = state.kadr.filter((h) => h.id !== groom.id).map((h) => ({ id: h.id, alcohol: h.alkohol }));
  const plan = planHangover(guests, choice, hangoverRng(w.id));
  const absent = new Set(parseIds(w.hangover_absent));
  const drops = [
    ...plan.conditionDrops.filter((d) => !absent.has(d.playerId)),
    // Tvrdý piják, kterému se absence nestihla nahlásit, hraje s kocovinou.
    ...plan.absent.filter((id) => !absent.has(id)).map((playerId) => ({ playerId, drop: UNANNOUNCED_HANGOVER_DROP })),
  ];
  const stmts: D1PreparedStatement[] = [];
  for (const d of drops) {
    stmts.push(db.prepare(
      `UPDATE players SET life_context = json_set(COALESCE(life_context, '{}'), '$.condition',
         MAX(15, COALESCE(json_extract(life_context, '$.condition'), 100) - ?), '$.hangover', 1)
        WHERE id = ? AND team_id = ?`,
    ).bind(d.drop, d.playerId, w.team_id));
    stmts.push(logConditionStmt(db, d.playerId, w.team_id, 100, 100 - d.drop, "hangover", "Kocovina po svatbě spoluhráče", state.den));
  }
  if (choice === "attend") {
    stmts.push(...posunHrace(db, w.team_id, groom.id, { morale: ATTEND_EFFECT.morale }));
    stmts.push(...coachRelationStmts(db, { playerId: groom.id, delta: ATTEND_EFFECT.relation, source: "invite", description: ATTEND_EFFECT.description, gameDate: state.den }));
  }
  if (stmts.length > 0) {
    await db.batch(stmts).catch((e) => logger.error({ module: M, teamId: w.team_id }, `den po svatbě ${w.id}`, e));
  }
  await thankFromGroom(env, w, groom, choice);
}

/** Ženich se ozve: po účasti model (odložená zpráva se svatební fotkou), jinak šablona. AI klubu nic. */
async function thankFromGroom(env: Bindings, w: WeddingRow, groom: GroomRow, choice: WeddingChoice): Promise<void> {
  const db = env.DB;
  if (choice === "none" || await isAiTeam(db, w.team_id)) return;
  const rng = createRng(seedFromString(`wedding-thanks|${w.id}`));
  if (choice === "attend") {
    const { isAiEnabled } = await import("../lib/ai-provider");
    if (await isAiEnabled(env)) {
      const scheduled = await scheduleThanks(db, w, groom)
        .catch((e) => { logger.warn({ module: M, teamId: w.team_id }, `poděkování za svatbu ${w.id}`, e); return false; });
      if (scheduled) return;
    }
  }
  const key = choice === "attend" ? "wedding_thanks_attend" : choice === "gift" ? "wedding_thanks_gift" : "wedding_after_ban";
  await sendIncidentPlayerSms(db, w.team_id, groomRef(groom), text(rng, key))
    .catch((e) => logger.warn({ module: M, teamId: w.team_id }, `SMS ženicha po svatbě ${w.id}`, e));
}

/** Poděkování modelem jako po přijatém pozvání (follow-ups.ts), vztah už se započítal tady. */
async function scheduleThanks(db: D1Database, w: WeddingRow, groom: GroomRow): Promise<boolean> {
  const { getOrCreatePlayerConversation } = await import("../messaging/ai-player-spawn");
  const { nextFreeMoment, scheduleFollowUp } = await import("../messaging/follow-ups");
  const convId = await getOrCreatePlayerConversation(db, w.team_id, groomRef(groom));
  const p = await db.prepare("SELECT personality, life_context, age FROM players WHERE id = ?").bind(groom.id)
    .first<{ personality: string | null; life_context: string | null; age: number | null }>();
  const personality = safeObject(p?.personality);
  const lifeContext = safeObject(p?.life_context);
  const dueAt = nextFreeMoment(
    { id: groom.id, occupation: lifeContext.occupation as string | undefined, alcohol: Number(personality.alcohol ?? 30), age: p?.age ?? 25 },
    new Date(Date.now() + 2 * 3600_000),
    { allowWork: true, earliestHour: 9 },
  );
  const id = await scheduleFollowUp(db, {
    teamId: w.team_id, playerId: groom.id, convId, kind: "after_invite", dueAt,
    payload: { invite: "wedding", topicId: "casual_wedding", effectApplied: true, weddingId: w.id },
  });
  return !!id;
}

function safeObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? v as Record<string, unknown> : {};
  } catch (e) {
    logger.warn({ module: M }, "JSON hráče pro poděkování za svatbu", e);
    return {};
  }
}

/**
 * Denní tick jednoho klubu (incidents/denni-krok.ts): rozhodnutí po lhůtě, dopsání kocoviny,
 * která se nezapsala, a den po svatbě dopady. Chyba jedné svatby nezastaví ostatní.
 */
export async function processWeddingsForDay(env: Bindings, state: StavKlubu): Promise<void> {
  const db = env.DB;
  const rows = await db.prepare("SELECT * FROM weddings WHERE team_id = ? AND settled_at IS NULL ORDER BY wedding_date, id")
    .bind(state.teamId).all<WeddingRow>()
    .catch((e) => { logger.warn({ module: M, teamId: state.teamId }, "otevřené svatby", e); return { results: [] as WeddingRow[] }; });
  for (const row of rows.results) {
    try {
      let w = row;
      if (!w.choice && state.den >= decisionClosesOn(w.wedding_date)) {
        if (await isAiTeam(db, w.team_id)) {
          // AI klub rozhoduje modelem v hodinové práci; když ji nestihl (nebo běží vypnutá), pravidlo.
          const { decideAiWeddings } = await import("../ai-coach/weddings");
          const { ensureAiProfile } = await import("../ai-coach/profile");
          await decideAiWeddings(env, w.team_id, await ensureAiProfile(db, w.team_id), new Date(), { mode: "off", ai: null, today: state.den, weddingId: w.id });
        } else {
          await recordWeddingDecision(db, w, { choice: "none", giftAmount: null, decidedBy: "default" }, { today: state.den, gameDate: state.gameDate });
        }
        w = (await db.prepare("SELECT * FROM weddings WHERE id = ?").bind(w.id).first<WeddingRow>()) ?? w;
      } else if (w.choice && !w.hangover_written_at) {
        await writeHangoverAbsences(db, w, w.choice, state.den);
      }
      if (state.den >= dayPlus(w.wedding_date, 1)) await settleWedding(env, w, state);
    } catch (e) {
      logger.warn({ module: M, teamId: state.teamId }, `svatba ${row.id}`, e);
    }
  }
}

interface ArticleRow extends WeddingRow {
  first_name: string | null;
  last_name: string | null;
  team_name: string | null;
  league_id: string | null;
}

/** Článek modelem, při vypnuté AI nebo nesmyslu šablona. Bez čísel, bez dlouhé pomlčky. */
async function writeArticle(env: FollowUpEnv & { AI_GATEWAY_URL?: string }, o: { groom: string; teamName: string; choice: WeddingChoice; weddingId: string }): Promise<{ headline: string; text: string }> {
  const fallback = weddingArticleFallback(o, createRng(seedFromString(`wedding-article|${o.weddingId}`)));
  const { isAiEnabled, aiContextFromEnv, generateText } = await import("../lib/ai-provider");
  if (!(await isAiEnabled(env))) return fallback;
  const what: Record<WeddingChoice, string> = {
    attend: "Trenér na svatbu přišel, připil novomanželům a celý večer dohlížel, aby to kluci z kabiny nepřehnali.",
    gift: "Trenér sám nepřišel, ale poslal novomanželům dar. Kluci z kabiny slavili naplno.",
    ban: "Trenér klukům z kabiny pít na svatbě zakázal, protože druhý den se hraje. Ženich z toho nadšený nebyl.",
    none: "Trenér se k pozvání nevyjádřil a nepřišel. Kluci z kabiny slavili naplno.",
  };
  const prompt = [
    "Jsi redaktor okresního fotbalového zpravodaje z jižních Čech. Napiš krátkou zprávičku do rubriky Ze života klubů.",
    `Hráč ${o.groom} z klubu ${o.teamName} se oženil. Svatba byla v sále, pozvaná byla celá kabina.`,
    what[o.choice],
    "Piš vesnicky a s lehkým humorem, 3 až 4 věty, žádná čísla, žádná jména kromě ženicha a klubu, nic si nevymýšlej o výsledcích zápasů.",
    "Jméno ženicha používej jen v 1. pádě. Nepoužívej dlouhou pomlčku.",
    "Vrať POUZE JSON: {\"headline\": \"titulek do 80 znaků\", \"text\": \"zprávička\"}",
  ].join("\n");
  const raw = await generateText(await aiContextFromEnv(env), prompt, { maxTokens: 400, temperature: 0.8, json: true, module: M, timeoutMs: 30_000 })
    .catch((e) => { logger.warn({ module: M }, "článek o svatbě od modelu", e); return null; });
  if (!raw) return fallback;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match?.[0] ?? raw) as { headline?: unknown; text?: unknown };
    const headline = typeof parsed.headline === "string" ? cleanDashes(parsed.headline.trim()) : "";
    const body = typeof parsed.text === "string" ? cleanDashes(parsed.text.trim()) : "";
    if (headline.length < 8 || headline.length > 120 || body.length < 40 || body.length > 900) return fallback;
    return { headline, text: body };
  } catch (e) {
    logger.warn({ module: M }, "článek o svatbě od modelu není JSON", e);
    return fallback;
  }
}

/**
 * Hodinový běh Telefonu: článek o svatbě do Zpravodaje ligy (rubrika Ze života klubů) se svatební
 * fotkou od Workers AI a SMS od Redakce Zpravodaje lidskému klubu s tlačítkem na článek.
 * Zámek `article_at`: článek i SMS vyjdou jednou. Vrací počet článků.
 */
export async function publishWeddingArticles(db: D1Database, env: FollowUpEnv & { AI_GATEWAY_URL?: string }, now: Date = new Date()): Promise<number> {
  const hour = pragueHour(now);
  if (hour === null || hour < ARTICLE_FROM_HOUR || hour >= ARTICLE_TO_HOUR) return 0;
  const rows = await db.prepare(
    `SELECT w.*, p.first_name, p.last_name, t.name AS team_name, t.league_id
       FROM weddings w
       LEFT JOIN players p ON p.id = w.player_id
       LEFT JOIN teams t ON t.id = w.team_id
      WHERE w.settled_at IS NOT NULL AND w.article_at IS NULL AND w.choice IS NOT NULL
      ORDER BY w.settled_at LIMIT ?`,
  ).bind(ARTICLES_PER_RUN).all<ArticleRow>()
    .catch((e) => { logger.warn({ module: M }, "svatby čekající na článek", e); return { results: [] as ArticleRow[] }; });

  let published = 0;
  for (const w of rows.results) {
    const claimed = await db.prepare("UPDATE weddings SET article_at = ? WHERE id = ? AND article_at IS NULL")
      .bind(now.toISOString(), w.id).run()
      .catch((e) => { logger.warn({ module: M, teamId: w.team_id }, `zámek článku ${w.id}`, e); return null; });
    if ((claimed?.meta?.changes ?? 0) === 0) continue;
    if (!w.first_name || !w.team_name || !w.league_id) {
      logger.info({ module: M, teamId: w.team_id }, `svatba ${w.id}: bez ženicha nebo ligy, článek nevyjde`);
      continue;
    }
    try {
      const groom = `${w.first_name} ${w.last_name ?? ""}`.trim();
      const article = await writeArticle(env, { groom, teamName: w.team_name, choice: effectiveChoice(w), weddingId: w.id });
      let photo: { key: string; alt: string } | null = null;
      if (env.AI && env.SEED_DATA) {
        const { PHOTO_SCENES, generatePlayerPhoto } = await import("../messaging/player-photo");
        const scene = PHOTO_SCENES.wedding_party;
        const key = await generatePlayerPhoto(env.AI, env.SEED_DATA, scene, crypto.randomUUID(), seedFromString(`wedding-photo|${w.id}`))
          .catch((e) => { logger.warn({ module: M, teamId: w.team_id }, `svatební fotka ${w.id}`, e); return null; });
        if (key) photo = { key, alt: scene.alt };
        else logger.warn({ module: M, teamId: w.team_id }, `svatební fotka ${w.id} se nepovedla, článek jde bez ní`);
      }
      const newsId = crypto.randomUUID();
      const body = JSON.stringify({
        article: article.text, playerId: w.player_id, playerName: groom, teamName: w.team_name,
        ...(photo ? { photoKey: photo.key, photoAlt: photo.alt } : {}),
      });
      await db.batch([
        db.prepare(
          `INSERT INTO news (id, league_id, team_id, type, headline, body, season_number, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(newsId, w.league_id, w.team_id, WEDDING_NEWS_TYPE, article.headline, body, w.season_number, now.toISOString()),
        db.prepare("UPDATE weddings SET news_id = ?, photo_key = ? WHERE id = ?").bind(newsId, photo?.key ?? null, w.id),
      ]);
      published++;
      if (!(await isAiTeam(db, w.team_id))) {
        const { sendSystemSMS } = await import("../messaging/system-sms");
        await sendSystemSMS(db, w.team_id, NEWS_DESK, `📰 Ve Zpravodaji vyšla zpráva o svatbě: „${article.headline}“`, {
          type: "guide", href: `/zpravodaj?article=${newsId}`, label: "Otevřít Zpravodaj", newsId,
        });
      }
      logger.info({ module: M, teamId: w.team_id }, `článek o svatbě ${w.id}${photo ? " s fotkou" : ""}`);
    } catch (e) {
      logger.error({ module: M, teamId: w.team_id }, `článek o svatbě ${w.id}`, e);
    }
  }
  return published;
}
