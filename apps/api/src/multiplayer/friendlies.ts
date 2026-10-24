/**
 * Přáteláky s podmínkami.
 *
 * Přátelák se domlouvá na konkrétní den: buď přímou výzvou konkrétnímu klubu, nebo
 * veřejnou nabídkou „ten den mám volno“, kterou vezme kdokoli. K výzvě patří místo
 * (u vyzyvatele, u soupeře, na obecním hřišti napůl cesty), kdo platí náklady
 * a případná sázka o peníze. Sázku si obě strany složí při přijetí, vítěz bere obě.
 *
 * V den přáteláku nesmí mít žádný z týmů ligu, pohár, turnaj ani jiný přátelák
 * a mezi dvěma přáteláky téhož týmu musí být aspoň tři dny. Hlídá se to při zadání,
 * při přijetí i v den zápasu (pohár se mohl vylosovat až po domluvě).
 *
 * Kluby se stejným majitelem spolu hrát smí, ale jen bez peněz: bez sázky
 * a každý za své (competition/club-links.ts).
 */

import { logger } from "../lib/logger";
import { haversineKm } from "../season/fanbase-helpers";
import { areClubsLinked } from "../competition/club-links";
import { recordTransaction } from "../season/finance-processor";

const M = "friendlies";

export const FRIENDLY_MAX_STAKE = 10_000;
export const FRIENDLY_STAKE_STEP = 500;
export const FRIENDLY_DAYS_AHEAD = 14;
/** Mezi dvěma přáteláky téhož týmu aspoň tolik dní, jako dřív pauza po přáteláku. */
export const FRIENDLY_REST_DAYS = 3;
export const FRIENDLY_REFEREE_FEE = 800;
export const NEUTRAL_RENTAL_FEE = 1_500;
export const TRAVEL_BASE = 200;
export const TRAVEL_PER_KM = 8;
/** Přátelák se hraje se zápasovým tickem v 18:00 v Praze. Dnešní den jde domluvit do té doby. */
export const FRIENDLY_MATCH_HOUR = 18;
export const MAX_OPEN_OFFERS = 3;
export const MAX_MESSAGE_LENGTH = 200;

export type ChallengeVenue = "challenger" | "opponent" | "neutral";
export type CostPayer = "each" | "challenger";
export type OfferVenue = "poster" | "taker" | "neutral";
export type OfferCostPayer = "each" | "poster";

export interface FriendlyTerms {
  date: string;
  venue: ChallengeVenue;
  costPayer: CostPayer;
  stake: number;
  message: string | null;
}

// ── Dny ────────────────────────────────────────────────────────────────────

export function gameDay(gameDate: string): string {
  return gameDate.slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T12:00:00.000Z`).getTime() - new Date(`${a}T12:00:00.000Z`).getTime()) / 86_400_000);
}

/** Dá se v den `date` ještě hrát? Dnes jen do 18:00 v Praze, nejdál 14 dní dopředu. */
export function dateError(date: string, today: string, hourInPrague: number | null): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Vyber den zápasu.";
  if (date < today) return "Ten den už je pryč.";
  if (date === today && (hourInPrague == null || hourInPrague >= FRIENDLY_MATCH_HOUR)) {
    return "Dnešní zápasy už se hrají, vyber jiný den.";
  }
  if (date > addDays(today, FRIENDLY_DAYS_AHEAD)) return `Přátelák jde domluvit nejvýš ${FRIENDLY_DAYS_AHEAD} dní dopředu.`;
  return null;
}

/** Nejbližší den, na který jde přátelák ještě domluvit. */
export function earliestDay(today: string, hourInPrague: number | null): string {
  return dateError(today, today, hourInPrague) ? addDays(today, 1) : today;
}

// ── Podmínky ───────────────────────────────────────────────────────────────

const CHALLENGE_VENUES: ChallengeVenue[] = ["challenger", "opponent", "neutral"];
const COST_PAYERS: CostPayer[] = ["each", "challenger"];

/** Přečte podmínky z těla požadavku. Den chybí jen u starých klientů, ti dostanou nejbližší volný. */
export function parseTerms(body: Record<string, unknown>, fallbackDate: string): { ok: true; terms: FriendlyTerms } | { ok: false; error: string } {
  const venue = (body.venue ?? "challenger") as ChallengeVenue;
  if (!CHALLENGE_VENUES.includes(venue)) return { ok: false, error: "Neznámé místo zápasu." };
  const costPayer = (body.costPayer ?? "each") as CostPayer;
  if (!COST_PAYERS.includes(costPayer)) return { ok: false, error: "Neznámé rozdělení nákladů." };
  const stake = body.stake == null || body.stake === "" ? 0 : Number(body.stake);
  if (!Number.isInteger(stake) || stake < 0) return { ok: false, error: "Sázka musí být celé číslo." };
  if (stake > FRIENDLY_MAX_STAKE) return { ok: false, error: `Hrát se dá nejvýš o ${FRIENDLY_MAX_STAKE.toLocaleString("cs")} Kč.` };
  if (stake % FRIENDLY_STAKE_STEP !== 0) return { ok: false, error: `Sázka jde po ${FRIENDLY_STAKE_STEP} Kč.` };
  const rawMessage = typeof body.message === "string" ? body.message.trim() : "";
  if (rawMessage.length > MAX_MESSAGE_LENGTH) return { ok: false, error: `Vzkaz může mít nejvýš ${MAX_MESSAGE_LENGTH} znaků.` };
  const date = typeof body.date === "string" && body.date ? body.date : fallbackDate;
  return { ok: true, terms: { date, venue, costPayer, stake, message: rawMessage || null } };
}

/** Nabídka termínu se ukládá z pohledu toho, kdo ji vypsal. Při převzetí se stane výzvou. */
export function offerToChallengeTerms(offer: { venue: OfferVenue; cost_payer: OfferCostPayer }): { venue: ChallengeVenue; costPayer: CostPayer } {
  return {
    venue: offer.venue === "poster" ? "challenger" : offer.venue === "taker" ? "opponent" : "neutral",
    costPayer: offer.cost_payer === "poster" ? "challenger" : "each",
  };
}

export function challengeToOfferTerms(terms: { venue: ChallengeVenue; costPayer: CostPayer }): { venue: OfferVenue; costPayer: OfferCostPayer } {
  return {
    venue: terms.venue === "challenger" ? "poster" : terms.venue === "opponent" ? "taker" : "neutral",
    costPayer: terms.costPayer === "challenger" ? "poster" : "each",
  };
}

/** Kluby se stejným majitelem smí hrát jen bez peněz. */
export async function linkedTermsError(db: D1Database, teamA: string, teamB: string, terms: { stake: number; costPayer: CostPayer }): Promise<string | null> {
  if (terms.stake === 0 && terms.costPayer === "each") return null;
  if (!(await areClubsLinked(db, teamA, teamB))) return null;
  return "Kluby mají stejného majitele. Spolu můžou hrát jen bez sázky a každý za své.";
}

// ── Kolize v rozpisu ──────────────────────────────────────────────────────

export type BusyKind = "league" | "cup" | "tournament" | "friendly" | "rest";
export interface BusyInfo { kind: BusyKind; opponent: string | null; date: string }

/**
 * Má tým v den `day` jiný zápas? U přáteláků hlídá i odstup tří dní.
 * `ignoreMatchId` vynechá přátelák, o kterém se právě rozhoduje (kontrola v den zápasu).
 */
export async function findBusy(
  db: D1Database, teamId: string, day: string,
  opts: { ignoreMatchId?: string; competitiveOnly?: boolean } = {},
): Promise<BusyInfo | null> {
  const [league, cup, tournament] = await db.batch([
    db.prepare(
      `SELECT CASE WHEN m.home_team_id = ?1 THEN ta.name ELSE th.name END AS opponent
         FROM matches m
         JOIN season_calendar sc ON sc.id = m.calendar_id
         JOIN teams th ON th.id = m.home_team_id
         JOIN teams ta ON ta.id = m.away_team_id
        WHERE (m.home_team_id = ?1 OR m.away_team_id = ?1) AND substr(sc.scheduled_at, 1, 10) = ?2
          AND sc.season_number = (SELECT MAX(number) FROM seasons WHERE status = 'active')
        LIMIT 1`,
    ).bind(teamId, day),
    db.prepare(
      `SELECT CASE WHEN cm.home_cup_team_id = my.id THEN away.name ELSE home.name END AS opponent
         FROM cup_matches cm
         JOIN cup_teams my ON my.id IN (cm.home_cup_team_id, cm.away_cup_team_id) AND my.team_id = ?1
         LEFT JOIN cup_teams home ON home.id = cm.home_cup_team_id
         LEFT JOIN cup_teams away ON away.id = cm.away_cup_team_id
        WHERE substr(cm.scheduled_at, 1, 10) = ?2
        LIMIT 1`,
    ).bind(teamId, day),
    db.prepare(
      `SELECT CASE WHEN tm.home_team_id = ?1 THEN ta.name ELSE th.name END AS opponent
         FROM tournament_matches tm
         LEFT JOIN teams th ON th.id = tm.home_team_id
         LEFT JOIN teams ta ON ta.id = tm.away_team_id
        WHERE (tm.home_team_id = ?1 OR tm.away_team_id = ?1) AND substr(tm.scheduled_at, 1, 10) = ?2
        LIMIT 1`,
    ).bind(teamId, day),
  ]);
  const opponentOf = (r: D1Result) => ((r.results[0] as { opponent?: string | null } | undefined)?.opponent ?? null);
  if (league.results.length > 0) return { kind: "league", opponent: opponentOf(league), date: day };
  if (cup.results.length > 0) return { kind: "cup", opponent: opponentOf(cup), date: day };
  if (tournament.results.length > 0) return { kind: "tournament", opponent: opponentOf(tournament), date: day };
  if (opts.competitiveOnly) return null;

  // Přátelák má v `matches` den uložený v created_at (nové i ty z doby před termíny).
  const friendlies = await db.prepare(
    `SELECT substr(m.created_at, 1, 10) AS day,
            CASE WHEN m.home_team_id = ?1 THEN ta.name ELSE th.name END AS opponent
       FROM matches m
       JOIN teams th ON th.id = m.home_team_id
       JOIN teams ta ON ta.id = m.away_team_id
      WHERE m.calendar_id IS NULL AND m.league_id IS NULL
        AND (m.home_team_id = ?1 OR m.away_team_id = ?1)
        AND substr(m.created_at, 1, 10) BETWEEN ?2 AND ?3
        AND m.id <> ?4
      ORDER BY ABS(julianday(substr(m.created_at, 1, 10)) - julianday(?5))`,
  ).bind(teamId, addDays(day, -(FRIENDLY_REST_DAYS - 1)), addDays(day, FRIENDLY_REST_DAYS - 1), opts.ignoreMatchId ?? "", day)
    .all<{ day: string; opponent: string }>();
  const nearest = friendlies.results[0];
  if (!nearest) return null;
  return { kind: nearest.day === day ? "friendly" : "rest", opponent: nearest.opponent, date: nearest.day };
}

function shortDate(day: string): string {
  const [, m, d] = day.split("-");
  return `${Number(d)}. ${Number(m)}.`;
}

/** Hláška pro kolizi; `own` = týká se toho, kdo akci dělá. */
export function busyText(busy: BusyInfo, own: boolean): string {
  const who = own ? "" : "Soupeř ";
  const vs = busy.opponent ? ` s ${busy.opponent}` : "";
  switch (busy.kind) {
    case "league": return own ? `Ten den hraješ ligu${vs}.` : `${who}ten den hraje ligu.`;
    case "cup": return own ? `Ten den hraješ pohár${vs}.` : `${who}ten den hraje pohár.`;
    case "tournament": return own ? `Ten den hraješ turnaj${vs}.` : `${who}ten den hraje turnaj.`;
    case "friendly": return own ? `Ten den už máš přátelák${vs}.` : `${who}ten den už má přátelák.`;
    case "rest": return own
      ? `Mezi přáteláky musí být aspoň ${FRIENDLY_REST_DAYS} dny, ${shortDate(busy.date)} máš přátelák${vs}.`
      : `${who}má ${shortDate(busy.date)} jiný přátelák, mezi přáteláky musí být aspoň ${FRIENDLY_REST_DAYS} dny.`;
  }
}

// ── Náklady a místo ───────────────────────────────────────────────────────

export interface CostLine { label: string; amount: number }
export interface FriendlyCosts { challenger: CostLine[]; opponent: CostLine[] }

export function travelCost(km: number): number {
  return Math.round((TRAVEL_BASE + TRAVEL_PER_KM * Math.max(0, km)) / 10) * 10;
}

/**
 * Kdo co platí. Hostitel platí rozhodčího, host cestovné. Na neutrálním hřišti se
 * rozhodčí i pronájem dělí napůl a každý jede na své. Kdo platí za oba, převezme všechno.
 */
export function computeCosts(input: {
  venue: ChallengeVenue; costPayer: CostPayer;
  distanceKm: number; neutralKm?: { challenger: number; opponent: number } | null;
}): FriendlyCosts {
  const challenger: CostLine[] = [];
  const opponent: CostLine[] = [];
  if (input.venue === "neutral") {
    const km = input.neutralKm ?? { challenger: input.distanceKm / 2, opponent: input.distanceKm / 2 };
    const half = (n: number) => Math.round(n / 2);
    challenger.push({ label: "Rozhodčí (napůl)", amount: half(FRIENDLY_REFEREE_FEE) }, { label: "Pronájem hřiště (napůl)", amount: half(NEUTRAL_RENTAL_FEE) },
      { label: "Cestovné", amount: travelCost(km.challenger) });
    opponent.push({ label: "Rozhodčí (napůl)", amount: half(FRIENDLY_REFEREE_FEE) }, { label: "Pronájem hřiště (napůl)", amount: half(NEUTRAL_RENTAL_FEE) },
      { label: "Cestovné", amount: travelCost(km.opponent) });
  } else {
    const [host, guest] = input.venue === "challenger" ? [challenger, opponent] : [opponent, challenger];
    host.push({ label: "Rozhodčí", amount: FRIENDLY_REFEREE_FEE });
    guest.push({ label: "Cestovné", amount: travelCost(input.distanceKm) });
  }
  if (input.costPayer === "challenger") {
    for (const line of opponent) challenger.push({ label: `${line.label} za soupeře`, amount: line.amount });
    return { challenger, opponent: [] };
  }
  return { challenger, opponent };
}

export function sumCosts(lines: CostLine[]): number {
  return lines.reduce((s, l) => s + l.amount, 0);
}

interface ClubGeo { id: string; name: string; villageId: string; village: string; lat: number; lng: number }

export async function loadClubGeo(db: D1Database, teamIds: string[]): Promise<Map<string, ClubGeo>> {
  if (teamIds.length === 0) return new Map();
  const rows = await db.prepare(
    `SELECT t.id, t.name, t.village_id, v.name AS village, v.lat, v.lng
       FROM teams t JOIN villages v ON v.id = t.village_id
      WHERE t.id IN (${teamIds.map(() => "?").join(",")})`,
  ).bind(...teamIds).all<{ id: string; name: string; village_id: string; village: string; lat: number; lng: number }>();
  return new Map(rows.results.map((r) => [r.id, { id: r.id, name: r.name, villageId: r.village_id, village: r.village, lat: r.lat, lng: r.lng }]));
}

/** Obecní hřiště nejblíž půli cesty. Vesnice obou klubů se vynechávají, to by nebyl neutrál. */
export async function pickNeutralVillage(db: D1Database, a: ClubGeo, b: ClubGeo): Promise<{ id: string; name: string; lat: number; lng: number } | null> {
  const lat = (a.lat + b.lat) / 2;
  const lng = (a.lng + b.lng) / 2;
  // Stupeň délky je v Česku zhruba 0,65 stupně šířky. Na výběr nejbližší obce to stačí.
  return db.prepare(
    `SELECT id, name, lat, lng FROM villages
      WHERE id NOT IN (?1, ?2) AND lat IS NOT NULL AND lng IS NOT NULL
      ORDER BY (lat - ?3) * (lat - ?3) + ((lng - ?4) * 0.65) * ((lng - ?4) * 0.65)
      LIMIT 1`,
  ).bind(a.villageId, b.villageId, lat, lng).first<{ id: string; name: string; lat: number; lng: number }>();
}

export function neutralVenueName(village: string): string {
  return `Obecní hřiště ${village}`;
}

export interface FriendlyQuote {
  distanceKm: number;
  neutralVillage: { id: string; name: string } | null;
  costs: FriendlyCosts;
}

export async function quoteFriendly(
  db: D1Database, challengerId: string, opponentId: string,
  terms: { venue: ChallengeVenue; costPayer: CostPayer },
  neutralVillageId?: string | null,
): Promise<FriendlyQuote | null> {
  const geo = await loadClubGeo(db, [challengerId, opponentId]);
  const a = geo.get(challengerId);
  const b = geo.get(opponentId);
  if (!a || !b) return null;
  const distanceKm = Math.round(haversineKm(a.lat, a.lng, b.lat, b.lng));
  let neutral: { id: string; name: string; lat: number; lng: number } | null = null;
  if (terms.venue === "neutral") {
    neutral = neutralVillageId
      ? await db.prepare("SELECT id, name, lat, lng FROM villages WHERE id = ?").bind(neutralVillageId).first<{ id: string; name: string; lat: number; lng: number }>()
      : await pickNeutralVillage(db, a, b);
  }
  const neutralKm = neutral
    ? { challenger: Math.round(haversineKm(a.lat, a.lng, neutral.lat, neutral.lng)), opponent: Math.round(haversineKm(b.lat, b.lng, neutral.lat, neutral.lng)) }
    : null;
  return {
    distanceKm,
    neutralVillage: neutral ? { id: neutral.id, name: neutral.name } : null,
    costs: computeCosts({ venue: terms.venue, costPayer: terms.costPayer, distanceKm, neutralKm }),
  };
}

// ── Sázka ─────────────────────────────────────────────────────────────────

interface StakeChallenge {
  id: string; challenger_team_id: string; challenged_team_id: string; stake: number; stake_status: string | null;
}

/**
 * Složí sázky obou klubů. D1 batch je transakce: výzva dostane značku jen tohoto složení,
 * jen když na sázku mají oba, peníze se strhnou jen podle té značky a nakonec se z ní stane
 * 'held'. Nikdy tak nezůstane strhnutá sázka bez příznaku, podle kterého ji výplata nebo
 * vrácení najde, a už složenou sázku nejde strhnout podruhé. false = někdo na ni nemá.
 */
export async function holdStakes(
  db: D1Database,
  ch: { id: string; challengerId: string; opponentId: string; stake: number },
  today: string, names: { challenger: string; opponent: string },
): Promise<boolean> {
  const mark = `holding:${crypto.randomUUID()}`;
  const [, debit] = await db.batch([
    db.prepare(
      `UPDATE challenges SET stake_status = ?1 WHERE id = ?2 AND stake_status IS NULL
         AND (SELECT COUNT(*) FROM teams WHERE id IN (?3, ?4) AND budget >= ?5) = 2`,
    ).bind(mark, ch.id, ch.challengerId, ch.opponentId, ch.stake),
    db.prepare(
      `UPDATE teams SET budget = budget - ?1 WHERE id IN (?2, ?3)
         AND EXISTS (SELECT 1 FROM challenges WHERE id = ?4 AND stake_status = ?5)
       RETURNING id, budget`,
    ).bind(ch.stake, ch.challengerId, ch.opponentId, ch.id, mark),
    db.prepare("UPDATE challenges SET stake_status = 'held' WHERE id = ? AND stake_status = ?").bind(ch.id, mark),
  ]);
  const balances = new Map(((debit.results ?? []) as Array<{ id: string; budget: number }>).map((r) => [r.id, r.budget]));
  if (balances.size === 0) return false;

  const gameDate = `${today}T16:00:00.000Z`;
  const ledger = (teamId: string, opponentName: string) => db.prepare(
    "INSERT INTO transactions (id, team_id, type, amount, balance_after, description, reference_id, game_date) VALUES (?, ?, 'friendly_stake', ?, ?, ?, ?, ?)",
  ).bind(crypto.randomUUID(), teamId, -ch.stake, balances.get(teamId) ?? 0, `Sázka v přáteláku s ${opponentName} (složeno)`, ch.id, gameDate);
  await db.batch([ledger(ch.challengerId, names.opponent), ledger(ch.opponentId, names.challenger)])
    .catch((e) => logger.warn({ module: M }, "zápis složené sázky do transakcí", e));
  return true;
}

/** Vítěz bere obě složené sázky, při remíze si je každý vezme zpátky. Jen jednou. */
export async function settleStake(
  db: D1Database, ch: StakeChallenge, winner: "challenger" | "opponent" | null,
  names: { challenger: string; opponent: string }, gameDate: string,
): Promise<void> {
  if (!ch.stake || ch.stake_status !== "held") return;
  const claimed = await db.prepare(
    "UPDATE challenges SET stake_status = 'paid' WHERE id = ? AND stake_status = 'held' RETURNING id",
  ).bind(ch.id).first<{ id: string }>();
  if (!claimed) return;
  if (winner === "challenger") {
    await recordTransaction(db, ch.challenger_team_id, "friendly_stake_payout", ch.stake * 2, `Výhra v přáteláku o peníze s ${names.opponent}`, gameDate, ch.id);
  } else if (winner === "opponent") {
    await recordTransaction(db, ch.challenged_team_id, "friendly_stake_payout", ch.stake * 2, `Výhra v přáteláku o peníze s ${names.challenger}`, gameDate, ch.id);
  } else {
    await recordTransaction(db, ch.challenger_team_id, "friendly_stake_payout", ch.stake, `Vrácená sázka, přátelák s ${names.opponent} skončil remízou`, gameDate, ch.id);
    await recordTransaction(db, ch.challenged_team_id, "friendly_stake_payout", ch.stake, `Vrácená sázka, přátelák s ${names.challenger} skončil remízou`, gameDate, ch.id);
  }
}

/** Zrušený přátelák vrátí oběma složenou sázku. */
export async function refundStake(db: D1Database, ch: StakeChallenge, names: { challenger: string; opponent: string }, gameDate: string): Promise<void> {
  if (!ch.stake || ch.stake_status !== "held") return;
  const claimed = await db.prepare(
    "UPDATE challenges SET stake_status = 'refunded' WHERE id = ? AND stake_status = 'held' RETURNING id",
  ).bind(ch.id).first<{ id: string }>();
  if (!claimed) return;
  await recordTransaction(db, ch.challenger_team_id, "friendly_stake_payout", ch.stake, `Vrácená sázka, přátelák s ${names.opponent} se nehrál`, gameDate, ch.id);
  await recordTransaction(db, ch.challenged_team_id, "friendly_stake_payout", ch.stake, `Vrácená sázka, přátelák s ${names.challenger} se nehrál`, gameDate, ch.id);
}

// ── Úklid a otevření dne ──────────────────────────────────────────────────

/**
 * Výzvy a nabídky, jejichž den prošel, vyprší. Peníze v nich nejsou: sázka se skládá
 * až při přijetí. Výzvy z doby před termíny (bez dne) vyprší podle staré lhůty.
 */
export async function expireStaleFriendlies(db: D1Database, today: string, hourInPrague: number | null): Promise<{ challenges: number; offers: number }> {
  const todayGone = hourInPrague == null || hourInPrague >= FRIENDLY_MATCH_HOUR;
  const lastGone = todayGone ? today : addDays(today, -1);
  const [ch, legacy, of] = await db.batch([
    db.prepare(
      `UPDATE challenges SET status = 'expired', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE status = 'pending' AND match_date IS NOT NULL AND match_date <= ?`,
    ).bind(lastGone),
    db.prepare(
      `UPDATE challenges SET status = 'expired', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE status = 'pending' AND match_date IS NULL AND substr(expires_at, 1, 10) < ?`,
    ).bind(today),
    db.prepare(
      `UPDATE friendly_offers SET status = 'expired', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE status = 'open' AND match_date <= ?`,
    ).bind(lastGone),
  ]);
  return { challenges: (ch.meta?.changes ?? 0) + (legacy.meta?.changes ?? 0), offers: of.meta?.changes ?? 0 };
}

/** Domluvený přátelák čeká jako 'scheduled'; v den zápasu se otevře na sestavu. */
export async function openDueFriendlies(db: D1Database, today: string): Promise<number> {
  const res = await db.prepare(
    `UPDATE matches SET status = 'lineups_open'
      WHERE status = 'scheduled' AND calendar_id IS NULL AND league_id IS NULL
        AND substr(created_at, 1, 10) <= ?
        AND id IN (SELECT match_id FROM challenges WHERE match_id IS NOT NULL AND status = 'accepted')`,
  ).bind(today).run();
  return res.meta?.changes ?? 0;
}

// ── Erb klubu ─────────────────────────────────────────────────────────────

export interface Crest { primary: string; secondary: string; pattern: string; initials: string; symbol: string | null }

export interface CrestRow {
  name: string; primary_color: string | null; secondary_color: string | null; badge_primary_color: string | null;
  badge_secondary_color: string | null; badge_pattern: string | null; badge_initials: string | null; badge_symbol: string | null;
}

/** Erb stejně jako na profilu týmu: vlastní barvy erbu, jinak barvy dresu, jinak zelená. */
export function crestOf(r: CrestRow): Crest {
  return {
    primary: r.badge_primary_color || r.primary_color || "#2D5F2D",
    secondary: r.badge_secondary_color || r.secondary_color || "#FFFFFF",
    pattern: r.badge_pattern || "shield",
    initials: r.badge_initials || r.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase(),
    symbol: r.badge_symbol,
  };
}

export const CREST_COLUMNS = "primary_color, secondary_color, badge_primary_color, badge_secondary_color, badge_pattern, badge_initials, badge_symbol";

export async function loadCrests(db: D1Database, teamIds: string[]): Promise<Map<string, { name: string; crest: Crest }>> {
  const ids = [...new Set(teamIds)];
  if (ids.length === 0) return new Map();
  const rows = await db.prepare(
    `SELECT id, name, ${CREST_COLUMNS} FROM teams WHERE id IN (${ids.map(() => "?").join(",")})`,
  ).bind(...ids).all<CrestRow & { id: string }>();
  return new Map(rows.results.map((r) => [r.id, { name: r.name, crest: crestOf(r) }]));
}

// ── Bilance ───────────────────────────────────────────────────────────────

export type MatchResult = "W" | "D" | "L";

export interface Streak { kind: MatchResult; length: number }

export interface HeadToHead {
  teamId: string;
  name: string;
  crest: Crest | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  /** Kolik klub na sázkách s tímhle soupeřem vydělal (záporné = prodělal). */
  stakeNet: number;
  lastDate: string | null;
  lastScore: string | null;
  lastResult: MatchResult | null;
  /** Aktuální série proti tomuhle soupeři (stejné výsledky za sebou od posledního zápasu). */
  streak: Streak | null;
}

export interface FriendlyRecord {
  overall: Omit<HeadToHead, "teamId" | "name" | "crest" | "lastDate" | "lastScore" | "lastResult" | "streak">;
  /** Posledních 10 výsledků od nejstaršího po nejnovější. */
  form: MatchResult[];
  streak: Streak | null;
  /** Kolik zápasů za sebou bez porážky (včetně posledního). */
  unbeaten: number;
  biggestWin: { opponent: string; teamId: string; goalsFor: number; goalsAgainst: number; date: string } | null;
  opponents: HeadToHead[];
}

/** Série od nejnovějšího výsledku: kolik stejných za sebou. Výsledky jsou od nejnovějšího. */
export function currentStreak(newestFirst: MatchResult[]): Streak | null {
  if (newestFirst.length === 0) return null;
  const kind = newestFirst[0];
  let length = 0;
  while (length < newestFirst.length && newestFirst[length] === kind) length += 1;
  return { kind, length };
}

export async function loadHeadToHead(db: D1Database, teamId: string): Promise<FriendlyRecord> {
  const rows = await db.prepare(
    `SELECT c.challenger_team_id, c.challenged_team_id, c.stake, c.stake_status,
            m.home_team_id, m.home_score, m.away_score, COALESCE(c.match_date, substr(m.created_at, 1, 10)) AS day
       FROM challenges c
       JOIN matches m ON m.id = c.match_id
      WHERE c.status = 'played' AND m.status = 'simulated' AND ?1 IN (c.challenger_team_id, c.challenged_team_id)
      ORDER BY day DESC, m.simulated_at DESC`,
  ).bind(teamId).all<{
    challenger_team_id: string; challenged_team_id: string; stake: number | null; stake_status: string | null;
    home_team_id: string; home_score: number; away_score: number; day: string;
  }>().catch((e) => { logger.error({ module: M }, `bilance přáteláků ${teamId}`, e); return { results: [] }; });

  const opponentIds = rows.results.map((r) => (r.challenger_team_id === teamId ? r.challenged_team_id : r.challenger_team_id));
  const crests = await loadCrests(db, opponentIds)
    .catch((e) => { logger.warn({ module: M }, "erby soupeřů pro bilanci", e); return new Map<string, { name: string; crest: Crest }>(); });

  const byOpponent = new Map<string, HeadToHead & { results: MatchResult[] }>();
  const overall = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, stakeNet: 0 };
  const results: MatchResult[] = [];
  let biggestWin: FriendlyRecord["biggestWin"] = null;
  for (const r of rows.results) {
    const oppId = r.challenger_team_id === teamId ? r.challenged_team_id : r.challenger_team_id;
    const oppName = crests.get(oppId)?.name ?? "Soupeř";
    const iAmHome = r.home_team_id === teamId;
    const gf = iAmHome ? r.home_score : r.away_score;
    const ga = iAmHome ? r.away_score : r.home_score;
    const result: MatchResult = gf > ga ? "W" : gf < ga ? "L" : "D";
    const stakeNet = r.stake && r.stake_status === "paid" ? (result === "W" ? r.stake : result === "L" ? -r.stake : 0) : 0;
    results.push(result);
    if (result === "W" && (!biggestWin || gf - ga > biggestWin.goalsFor - biggestWin.goalsAgainst)) {
      biggestWin = { opponent: oppName, teamId: oppId, goalsFor: gf, goalsAgainst: ga, date: r.day };
    }
    const h = byOpponent.get(oppId) ?? {
      teamId: oppId, name: oppName, crest: crests.get(oppId)?.crest ?? null,
      played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, stakeNet: 0,
      lastDate: r.day, lastScore: `${gf}:${ga}`, lastResult: result, streak: null, results: [],
    };
    h.results.push(result);
    for (const acc of [h, overall]) {
      acc.played += 1;
      if (result === "W") acc.won += 1; else if (result === "L") acc.lost += 1; else acc.drawn += 1;
      acc.goalsFor += gf;
      acc.goalsAgainst += ga;
      acc.stakeNet += stakeNet;
    }
    byOpponent.set(oppId, h);
  }

  let unbeaten = 0;
  while (unbeaten < results.length && results[unbeaten] !== "L") unbeaten += 1;

  const opponents = [...byOpponent.values()]
    .map(({ results: res, ...h }) => ({ ...h, streak: currentStreak(res) }))
    .sort((a, b) => b.played - a.played || (b.lastDate ?? "").localeCompare(a.lastDate ?? ""));
  return {
    overall,
    form: results.slice(0, 10).reverse(),
    streak: currentStreak(results),
    unbeaten,
    biggestWin,
    opponents,
  };
}

// ── Žebříček přáteláků ────────────────────────────────────────────────────

export interface FriendlyTableRow {
  pos: number; teamId: string; name: string; crest: Crest;
  played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number;
}

/** Tabulka přáteláků od začátku sezóny: 3 body za výhru, 1 za remízu, pak rozdíl skóre a víc gólů. */
export async function loadFriendlyTable(db: D1Database, sinceDay: string): Promise<FriendlyTableRow[]> {
  const rows = await db.prepare(
    `SELECT m.home_team_id, m.away_team_id, m.home_score, m.away_score
       FROM challenges c
       JOIN matches m ON m.id = c.match_id
      WHERE c.status = 'played' AND m.status = 'simulated' AND COALESCE(c.match_date, substr(m.created_at, 1, 10)) >= ?`,
  ).bind(sinceDay).all<{ home_team_id: string; away_team_id: string; home_score: number; away_score: number }>();

  const acc = new Map<string, Omit<FriendlyTableRow, "pos" | "name" | "crest">>();
  const add = (id: string, gf: number, ga: number) => {
    const t = acc.get(id) ?? { teamId: id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
    t.played += 1; t.goalsFor += gf; t.goalsAgainst += ga;
    if (gf > ga) { t.won += 1; t.points += 3; } else if (gf < ga) t.lost += 1; else { t.drawn += 1; t.points += 1; }
    acc.set(id, t);
  };
  for (const r of rows.results) {
    add(r.home_team_id, r.home_score, r.away_score);
    add(r.away_team_id, r.away_score, r.home_score);
  }
  const crests = await loadCrests(db, [...acc.keys()]);
  return [...acc.values()]
    .sort((a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor)
    .map((t, i) => ({ ...t, pos: i + 1, name: crests.get(t.teamId)?.name ?? "Klub", crest: crests.get(t.teamId)?.crest ?? crestOf({
      name: "Klub", primary_color: null, secondary_color: null, badge_primary_color: null, badge_secondary_color: null,
      badge_pattern: null, badge_initials: null, badge_symbol: null,
    }) }));
}
