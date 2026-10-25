/**
 * Akce s přáteláky: výzva, přijetí, odmítnutí, stažení, nabídka termínu a její převzetí.
 *
 * Jedna implementace pravidel pro člověka (routes/friendlies.ts) i pro AI trenéra
 * (ai-coach/friendlies.ts), aby AI nemohla hrát podle jiných pravidel. Výpočty a kontroly
 * žijí v multiplayer/friendlies.ts, tady je pořadí kroků, zápisy a zprávy.
 *
 * AI klub hraje přáteláky jako každý jiný klub, jen se mu nepíše: SMS a notifikace dostává
 * jen lidský klub.
 */

import { logger } from "../lib/logger";
import { pragueHour } from "../lib/match-tick-schedule";
import { sendSystemSMS } from "../messaging/system-sms";
import type { PushEnv } from "../community/web-push";
import {
  MAX_OPEN_OFFERS,
  busyText, dateError, earliestDay, findBusy, gameDay,
  holdStakes, linkedTermsError, loadClubGeo, offerToChallengeTerms, parseTerms, pickNeutralVillage, refundStake,
  type ChallengeVenue, type CostPayer, type FriendlyTerms, type OfferCostPayer, type OfferVenue,
} from "./friendlies";

const M = "friendly-actions";
export const FRIENDLY_SMS_ROLE = "Sportovní ředitel";

export interface FriendlyClub {
  id: string; name: string; budget: number; game_date: string | null; user_id: string; parent_team_id: string | null;
  team_type: string | null; season_start: string | null;
}

export type FriendlyActionFail = { ok: false; status: 400 | 403 | 404 | 409 | 410; error: string };

export interface FriendlyActionOpts {
  /** Reálný čas akce (pražská hodina rozhoduje, jestli jde ještě hrát dnes). */
  now?: Date;
  /** Web push k notifikaci. Bez něj vznikne jen notifikace v aplikaci. */
  push?: PushEnv | null;
}

function fail(status: FriendlyActionFail["status"], error: string): FriendlyActionFail {
  return { ok: false, status, error };
}

export async function loadFriendlyClub(db: D1Database, teamId: string): Promise<FriendlyClub | null> {
  return db.prepare("SELECT id, name, budget, game_date, user_id, parent_team_id, team_type, season_start FROM teams WHERE id = ?")
    .bind(teamId).first<FriendlyClub>();
}

/** Přáteláky hraje áčko klubu, lidského i AI. U21 ne. */
export function isPlayableClub(t: FriendlyClub | null): t is FriendlyClub {
  return !!t && !t.parent_team_id && (t.team_type ?? "senior") !== "u21";
}

export function isHumanClub(t: { user_id: string | null } | null | undefined): boolean {
  return !!t?.user_id && t.user_id !== "ai";
}

export function friendlyToday(team: { game_date: string | null }): string {
  return gameDay(team.game_date ?? new Date().toISOString());
}

const VENUE_PHRASE: Record<ChallengeVenue, (challenger: string, opponent: string) => string> = {
  challenger: (c) => `u ${c}`,
  opponent: (_c, o) => `u ${o}`,
  neutral: () => "na neutrálním hřišti",
};

function dateWords(day: string): string {
  const d = new Date(`${day}T12:00:00.000Z`);
  const weekday = new Intl.DateTimeFormat("cs", { weekday: "long", timeZone: "UTC" }).format(d);
  return `${weekday} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
}

/** Shrnutí podmínek do SMS, česky a bez čísel tam, kde nejsou potřeba. */
export function termsSummary(t: { date: string; venue: ChallengeVenue; costPayer: CostPayer; stake: number }, challenger: string, opponent: string, neutralVillage: string | null): string {
  const venue = t.venue === "neutral" && neutralVillage ? `na obecním hřišti v obci ${neutralVillage}` : VENUE_PHRASE[t.venue](challenger, opponent);
  const parts = [`${dateWords(t.date)} v 18:00 ${venue}`];
  if (t.costPayer === "challenger") parts.push(`náklady platí ${challenger}`);
  if (t.stake > 0) parts.push(`hraje se o ${t.stake.toLocaleString("cs")} Kč`);
  return parts.join(", ");
}

/** SMS od sportovního ředitele, jen lidskému klubu. */
async function smsClub(db: D1Database, club: FriendlyClub | null, body: string, metadata?: Record<string, unknown>): Promise<void> {
  if (!club || !isHumanClub(club)) return;
  await sendSystemSMS(db, club.id, FRIENDLY_SMS_ROLE, body, metadata);
}

/** Notifikace (a push), jen lidskému klubu. Chyba notifikace akci nezastaví. */
async function notifyClub(db: D1Database, opts: FriendlyActionOpts, club: FriendlyClub | null, title: string, body: string, url: string): Promise<void> {
  if (!club || !isHumanClub(club)) return;
  try {
    const { createNotification } = await import("../community/notifications");
    await createNotification(db, club.id, "challenge", title, body, url, opts.push ?? undefined);
  } catch (e) {
    logger.warn({ module: M }, "notifikace k přáteláku", e);
  }
}

/** Kolize obou týmů v daný den. Vrací hlášku pro toho, kdo akci dělá. */
export async function scheduleClash(db: D1Database, actorId: string, otherId: string, day: string): Promise<string | null> {
  const [mine, theirs] = await Promise.all([findBusy(db, actorId, day), findBusy(db, otherId, day)]);
  if (mine) return busyText(mine, true);
  if (theirs) return busyText(theirs, false);
  return null;
}

/**
 * Domluvený přátelák: složené sázky a zápas v rozpisu. Volá se po atomickém zabrání výzvy.
 * Přátelák na dnešek je hned otevřený na sestavu, pozdější čeká jako 'scheduled'.
 * Při neúspěchu nezůstanou strhnuté peníze ani zápas a volající zabrání vrátí.
 */
async function scheduleFriendly(
  db: D1Database,
  ch: { id: string; challengerId: string; opponentId: string; date: string; venue: ChallengeVenue; stake: number },
  today: string, names: { challenger: string; opponent: string },
): Promise<{ ok: true; matchId: string } | { ok: false; error: string }> {
  if (ch.stake > 0 && !await holdStakes(db, ch, today, names)) {
    return { ok: false, error: "Sázku se nepodařilo složit, jeden z klubů na ni teď nemá peníze." };
  }

  const matchId = crypto.randomUUID();
  const [home, away] = ch.venue === "opponent" ? [ch.opponentId, ch.challengerId] : [ch.challengerId, ch.opponentId];
  try {
    await db.batch([
      db.prepare("INSERT INTO matches (id, home_team_id, away_team_id, status, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(matchId, home, away, ch.date <= today ? "lineups_open" : "scheduled", `${ch.date}T16:00:00.000Z`),
      db.prepare("UPDATE challenges SET match_id = ? WHERE id = ?").bind(matchId, ch.id),
    ]);
  } catch (e) {
    logger.error({ module: M }, "zápis domluveného přáteláku", e);
    if (ch.stake > 0) {
      await refundStake(db,
        { id: ch.id, challenger_team_id: ch.challengerId, challenged_team_id: ch.opponentId, stake: ch.stake, stake_status: "held" },
        names, `${today}T16:00:00.000Z`);
    }
    return { ok: false, error: "Přátelák se nepodařilo zapsat, zkus to znovu." };
  }
  return { ok: true, matchId };
}

async function neutralVillageFor(db: D1Database, a: string, b: string): Promise<{ id: string; name: string } | null> {
  const geo = await loadClubGeo(db, [a, b]);
  const ga = geo.get(a);
  const gb = geo.get(b);
  return ga && gb ? pickNeutralVillage(db, ga, gb) : null;
}

// ── Přímá výzva ───────────────────────────────────────────────────────────

/** Výzva s podmínkami (den, místo, náklady, sázka, vzkaz) od `teamId` pro `opponentId`. */
export async function sendChallenge(
  db: D1Database, teamId: string, opponentId: string, body: Record<string, unknown>, opts: FriendlyActionOpts = {},
): Promise<{ ok: true; challengeId: string } | FriendlyActionFail> {
  if (teamId === opponentId) return fail(400, "Nemůžeš vyzvat sám sebe");
  const [team, opponent] = await Promise.all([loadFriendlyClub(db, teamId), loadFriendlyClub(db, opponentId)]);
  if (!isPlayableClub(team)) return fail(400, "Přáteláky hraje áčko klubu.");
  if (!isPlayableClub(opponent)) return fail(400, "Přáteláky lze hrát pouze proti hráčským týmům");

  const today = friendlyToday(team);
  const hour = pragueHour(opts.now ?? new Date());
  const parsed = parseTerms(body, earliestDay(today, hour));
  if (!parsed.ok) return fail(400, parsed.error);
  const terms = parsed.terms;

  const dateErr = dateError(terms.date, today, hour);
  if (dateErr) return fail(400, dateErr);
  const linkedErr = await linkedTermsError(db, teamId, opponentId, terms);
  if (linkedErr) return fail(403, linkedErr);
  if (team.budget < terms.stake) return fail(400, "Na takovou sázku nemáš dost peněz.");
  const clash = await scheduleClash(db, teamId, opponentId, terms.date);
  if (clash) return fail(409, clash);

  const existing = await db.prepare(
    "SELECT id FROM challenges WHERE challenger_team_id = ? AND challenged_team_id = ? AND status = 'pending' LIMIT 1",
  ).bind(teamId, opponentId).first<{ id: string }>();
  if (existing) return fail(409, "Tomuhle soupeři už výzva leží. Počkej na odpověď, nebo ji stáhni.");

  let neutralVillage: { id: string; name: string } | null = null;
  if (terms.venue === "neutral") {
    neutralVillage = await neutralVillageFor(db, teamId, opponentId);
    if (!neutralVillage) return fail(400, "Neutrální hřiště se nepodařilo najít.");
  }

  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO challenges (id, challenger_team_id, challenged_team_id, status, message, created_at, expires_at,
                             match_date, venue, neutral_village_id, cost_payer, stake)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, teamId, opponentId, terms.message, team.game_date ?? new Date().toISOString(), `${terms.date}T16:00:00.000Z`,
    terms.date, terms.venue, neutralVillage?.id ?? null, terms.costPayer, terms.stake).run();

  const summary = termsSummary(terms, team.name, opponent.name, neutralVillage?.name ?? null);
  await smsClub(db, opponent,
    `⚽ ${team.name} tě vyzývá na přátelák: ${summary}.${terms.message ? ` Vzkaz: „${terms.message}“` : ""} Odpověz v Přátelákách.`,
    { type: "friendly", challengeId: id });
  await notifyClub(db, opts, opponent, `⚽ Výzva od ${team.name}`, summary, "/pratelaky");

  return { ok: true, challengeId: id };
}

interface PendingChallengeRow {
  id: string; challenger_team_id: string; match_date: string | null; venue: ChallengeVenue | null;
  neutral_village_id: string | null; cost_payer: CostPayer | null; stake: number | null; message: string | null;
}

/** Podmínky čekající výzvy. Výzva z doby před termíny se hraje nejbližší volný den, jako dřív. */
export function pendingChallengeTerms(ch: PendingChallengeRow, today: string, hour: number | null): FriendlyTerms {
  return {
    date: ch.match_date ?? earliestDay(today, hour),
    venue: ch.venue ?? "challenger",
    costPayer: ch.cost_payer ?? "each",
    stake: ch.stake ?? 0,
    message: ch.message,
  };
}

/** Přijetí výzvy klubem `teamId` (vyzvaný). */
export async function acceptChallenge(
  db: D1Database, teamId: string, challengeId: string, opts: FriendlyActionOpts = {},
): Promise<{ ok: true; matchId: string } | FriendlyActionFail> {
  const ch = await db.prepare(
    "SELECT * FROM challenges WHERE id = ? AND challenged_team_id = ? AND status = 'pending'",
  ).bind(challengeId, teamId).first<PendingChallengeRow>();
  if (!ch) return fail(404, "Výzva nenalezena nebo už zpracována");

  const [team, challenger] = await Promise.all([loadFriendlyClub(db, teamId), loadFriendlyClub(db, ch.challenger_team_id)]);
  if (!team || !challenger) return fail(404, "Tým nenalezen");
  const today = friendlyToday(team);
  const hour = pragueHour(opts.now ?? new Date());
  const terms = pendingChallengeTerms(ch, today, hour);

  const dateErr = dateError(terms.date, today, hour);
  if (dateErr) {
    await db.prepare("UPDATE challenges SET status = 'expired', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ? AND status = 'pending'")
      .bind(challengeId).run();
    return fail(410, "Termín výzvy už prošel.");
  }
  const linkedErr = await linkedTermsError(db, ch.challenger_team_id, teamId, terms);
  if (linkedErr) return fail(403, linkedErr);
  if (team.budget < terms.stake) return fail(400, "Na sázku nemáš dost peněz.");
  if (challenger.budget < terms.stake) return fail(400, "Soupeř teď na sázku nemá peníze.");
  const clash = await scheduleClash(db, teamId, ch.challenger_team_id, terms.date);
  if (clash) return fail(409, clash);

  // Atomické zabrání: souběžné přijetí nebo stažení vyhraje jen jeden.
  const claimed = await db.prepare(
    `UPDATE challenges SET status = 'accepted', match_date = ?, resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ? AND status = 'pending' RETURNING id`,
  ).bind(terms.date, challengeId).first<{ id: string }>();
  if (!claimed) return fail(409, "Výzva už byla mezitím zpracována");

  const names = { challenger: challenger.name, opponent: team.name };
  const scheduled = await scheduleFriendly(db,
    { id: challengeId, challengerId: ch.challenger_team_id, opponentId: teamId, date: terms.date, venue: terms.venue, stake: terms.stake },
    today, names);
  if (!scheduled.ok) {
    await db.prepare("UPDATE challenges SET status = 'pending', match_date = ?, resolved_at = NULL WHERE id = ? AND status = 'accepted' AND match_id IS NULL")
      .bind(ch.match_date, challengeId).run();
    return fail(409, scheduled.error);
  }

  const neutralName = ch.neutral_village_id
    ? (await db.prepare("SELECT name FROM villages WHERE id = ?").bind(ch.neutral_village_id).first<{ name: string }>())?.name ?? null
    : null;
  const summary = termsSummary(terms, challenger.name, team.name, neutralName);
  await smsClub(db, challenger, `✅ ${team.name} výzvu přijal. Přátelák: ${summary}.`, { type: "friendly", challengeId });
  await smsClub(db, team, `✅ Přátelák s ${challenger.name} domluven: ${summary}.`, { type: "friendly", challengeId });
  await notifyClub(db, opts, challenger, `✅ ${team.name} přijal výzvu`, summary, "/pratelaky");

  return { ok: true, matchId: scheduled.matchId };
}

/** Odmítnutí výzvy klubem `teamId` (vyzvaný). */
export async function declineChallenge(
  db: D1Database, teamId: string, challengeId: string, opts: FriendlyActionOpts = {},
): Promise<{ ok: true } | FriendlyActionFail> {
  const declined = await db.prepare(
    `UPDATE challenges SET status = 'declined', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ? AND challenged_team_id = ? AND status = 'pending' RETURNING challenger_team_id`,
  ).bind(challengeId, teamId).first<{ challenger_team_id: string }>();
  if (!declined) return fail(404, "Výzva nenalezena");

  const [team, challenger] = await Promise.all([loadFriendlyClub(db, teamId), loadFriendlyClub(db, declined.challenger_team_id)]);
  await smsClub(db, challenger, `❌ ${team?.name ?? "Soupeř"} výzvu na přátelák odmítl.`);
  await notifyClub(db, opts, challenger, `❌ ${team?.name ?? "Soupeř"} odmítl výzvu`, "Zkus vyzvat jiný tým.", "/pratelaky");
  return { ok: true };
}

/** Stažení vlastní výzvy, dokud ji soupeř nepřijal. */
export async function cancelChallenge(
  db: D1Database, teamId: string, challengeId: string,
): Promise<{ ok: true } | FriendlyActionFail> {
  // 'declined' místo 'cancelled': status má CHECK jen na pět hodnot a stažená výzva skončí stejně.
  const cancelled = await db.prepare(
    `UPDATE challenges SET status = 'declined', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ? AND challenger_team_id = ? AND status = 'pending' RETURNING challenged_team_id`,
  ).bind(challengeId, teamId).first<{ challenged_team_id: string }>();
  if (!cancelled) return fail(409, "Výzva už byla mezitím přijata nebo zpracována");

  const [team, opponent] = await Promise.all([loadFriendlyClub(db, teamId), loadFriendlyClub(db, cancelled.challenged_team_id)]);
  await smsClub(db, opponent, `↩️ ${team?.name ?? "Soupeř"} stáhl výzvu na přátelák.`);
  return { ok: true };
}

// ── Veřejné nabídky termínů ───────────────────────────────────────────────

const OFFER_VENUES: OfferVenue[] = ["poster", "taker", "neutral"];
const OFFER_PAYERS: OfferCostPayer[] = ["each", "poster"];

/** Veřejná nabídka termínu „ten den mám volno a chci hrát". */
export async function postFriendlyOffer(
  db: D1Database, teamId: string, body: Record<string, unknown>, opts: FriendlyActionOpts = {},
): Promise<{ ok: true; offerId: string } | FriendlyActionFail> {
  const team = await loadFriendlyClub(db, teamId);
  if (!isPlayableClub(team)) return fail(400, "Přáteláky hraje áčko klubu.");

  const venue = (body.venue ?? "poster") as OfferVenue;
  const costPayer = (body.costPayer ?? "each") as OfferCostPayer;
  if (!OFFER_VENUES.includes(venue)) return fail(400, "Neznámé místo zápasu.");
  if (!OFFER_PAYERS.includes(costPayer)) return fail(400, "Neznámé rozdělení nákladů.");
  // Částku, den a vzkaz kontroluje stejné pravidlo jako u výzvy.
  const today = friendlyToday(team);
  const hour = pragueHour(opts.now ?? new Date());
  const parsed = parseTerms({ ...body, venue: "challenger", costPayer: "each" }, "");
  if (!parsed.ok) return fail(400, parsed.error);
  const { date, stake, message } = parsed.terms;

  const dateErr = dateError(date, today, hour);
  if (dateErr) return fail(400, dateErr);
  if (team.budget < stake) return fail(400, "Na takovou sázku nemáš dost peněz.");
  const busy = await findBusy(db, teamId, date);
  if (busy) return fail(409, busyText(busy, true));

  const mine = await db.prepare("SELECT match_date FROM friendly_offers WHERE team_id = ? AND status = 'open'")
    .bind(teamId).all<{ match_date: string }>();
  if (mine.results.some((o) => o.match_date === date)) return fail(409, "Na tenhle den už nabídku máš.");
  if (mine.results.length >= MAX_OPEN_OFFERS) return fail(409, `Najednou můžeš mít nejvýš ${MAX_OPEN_OFFERS} nabídky.`);

  const id = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO friendly_offers (id, team_id, match_date, venue, cost_payer, stake, message) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(id, teamId, date, venue, costPayer, stake, message).run();
  return { ok: true, offerId: id };
}

/** Převzetí cizí nabídky termínu klubem `teamId`. */
export async function takeFriendlyOffer(
  db: D1Database, teamId: string, offerId: string, opts: FriendlyActionOpts = {},
): Promise<{ ok: true; matchId: string; challengeId: string } | FriendlyActionFail> {
  const offer = await db.prepare("SELECT * FROM friendly_offers WHERE id = ? AND status = 'open'")
    .bind(offerId).first<{ id: string; team_id: string; match_date: string; venue: OfferVenue; cost_payer: OfferCostPayer; stake: number; message: string | null }>();
  if (!offer) return fail(409, "Nabídka už neplatí.");
  if (offer.team_id === teamId) return fail(400, "Vlastní nabídku vzít nemůžeš.");

  const [team, poster] = await Promise.all([loadFriendlyClub(db, teamId), loadFriendlyClub(db, offer.team_id)]);
  if (!isPlayableClub(team)) return fail(400, "Přáteláky hraje áčko klubu.");
  if (!isPlayableClub(poster)) return fail(409, "Nabídka už neplatí.");

  const today = friendlyToday(team);
  const hour = pragueHour(opts.now ?? new Date());
  const dateErr = dateError(offer.match_date, today, hour);
  if (dateErr) return fail(410, "Termín nabídky už prošel.");

  const { venue, costPayer } = offerToChallengeTerms(offer);
  const terms: FriendlyTerms = { date: offer.match_date, venue, costPayer, stake: offer.stake, message: offer.message };
  const linkedErr = await linkedTermsError(db, offer.team_id, teamId, terms);
  if (linkedErr) return fail(403, linkedErr);
  if (team.budget < terms.stake) return fail(400, "Na sázku nemáš dost peněz.");
  if (poster.budget < terms.stake) return fail(400, "Klub, který nabídku vypsal, teď na sázku nemá peníze.");
  const clash = await scheduleClash(db, teamId, offer.team_id, terms.date);
  if (clash) return fail(409, clash);

  let neutralVillage: { id: string; name: string } | null = null;
  if (venue === "neutral") {
    neutralVillage = await neutralVillageFor(db, offer.team_id, teamId);
    if (!neutralVillage) return fail(400, "Neutrální hřiště se nepodařilo najít.");
  }

  // Nabídku si zabere jen jeden: dva souběžní zájemci nesmí dostat dva zápasy.
  const challengeId = crypto.randomUUID();
  const claimed = await db.prepare(
    `UPDATE friendly_offers SET status = 'taken', taken_by_team_id = ?, challenge_id = ?, resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ? AND status = 'open' RETURNING id`,
  ).bind(teamId, challengeId, offerId).first<{ id: string }>();
  if (!claimed) return fail(409, "Nabídku už mezitím vzal někdo jiný.");

  await db.prepare(
    `INSERT INTO challenges (id, challenger_team_id, challenged_team_id, status, message, created_at, expires_at,
                             match_date, venue, neutral_village_id, cost_payer, stake, offer_id, resolved_at)
     VALUES (?, ?, ?, 'accepted', ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
  ).bind(challengeId, offer.team_id, teamId, offer.message, team.game_date ?? new Date().toISOString(), `${terms.date}T16:00:00.000Z`,
    terms.date, venue, neutralVillage?.id ?? null, costPayer, terms.stake, offerId).run();

  const names = { challenger: poster.name, opponent: team.name };
  const scheduled = await scheduleFriendly(db,
    { id: challengeId, challengerId: offer.team_id, opponentId: teamId, date: terms.date, venue, stake: terms.stake },
    today, names);
  if (!scheduled.ok) {
    await db.batch([
      db.prepare("DELETE FROM challenges WHERE id = ? AND match_id IS NULL").bind(challengeId),
      db.prepare("UPDATE friendly_offers SET status = 'open', taken_by_team_id = NULL, challenge_id = NULL, resolved_at = NULL WHERE id = ? AND challenge_id = ?")
        .bind(offerId, challengeId),
    ]);
    return fail(409, scheduled.error);
  }

  const summary = termsSummary(terms, poster.name, team.name, neutralVillage?.name ?? null);
  await smsClub(db, poster, `✅ ${team.name} vzal tvoji nabídku přáteláku: ${summary}.`, { type: "friendly", challengeId });
  await notifyClub(db, opts, poster, `✅ ${team.name} vzal tvůj termín`, summary, "/pratelaky");
  return { ok: true, matchId: scheduled.matchId, challengeId };
}
