/**
 * Přáteláky: výzvy s podmínkami, veřejné nabídky termínů a bilance se soupeři.
 * Pravidla a výpočty žijí v multiplayer/friendlies.ts, tady je HTTP vrstva.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { requirePrivateTeamRead, requireTeamOwnership } from "../auth/middleware";
import { logger } from "../lib/logger";
import { pragueHour } from "../lib/match-tick-schedule";
import { sendSystemSMS } from "../messaging/system-sms";
import { linkedTeamIds } from "../competition/club-links";
import {
  FRIENDLY_DAYS_AHEAD, FRIENDLY_MAX_STAKE, FRIENDLY_STAKE_STEP, MAX_MESSAGE_LENGTH, MAX_OPEN_OFFERS,
  FRIENDLY_REST_DAYS, FRIENDLY_REFEREE_FEE, NEUTRAL_RENTAL_FEE, TRAVEL_BASE, TRAVEL_PER_KM,
  addDays, busyText, dateError, earliestDay, expireStaleFriendlies, findBusy, gameDay,
  linkedTermsError, loadClubGeo, loadCrests, loadFriendlyTable, loadHeadToHead, offerToChallengeTerms, openDueFriendlies, parseTerms,
  holdStakes, pickNeutralVillage, quoteFriendly, refundStake, sumCosts,
  type ChallengeVenue, type CostLine, type CostPayer, type Crest, type FriendlyTerms, type OfferCostPayer, type OfferVenue,
} from "../multiplayer/friendlies";

const M = "friendlies";
const SMS_ROLE = "Sportovní ředitel";

export const friendliesRouter = new Hono<{ Bindings: Bindings }>();
friendliesRouter.use("/teams/:teamId/*", requireTeamOwnership);
// Přehled ukazuje rozpočet, vzkazy a sázky, náklady prozradí obsazené dny: čte je jen majitel.
friendliesRouter.use("/teams/:teamId/challenges", requirePrivateTeamRead);
friendliesRouter.use("/teams/:teamId/friendlies/quote", requirePrivateTeamRead);

interface TeamRow {
  id: string; name: string; budget: number; game_date: string | null; user_id: string; parent_team_id: string | null;
  team_type: string | null; season_start: string | null;
}

async function loadTeam(db: D1Database, teamId: string): Promise<TeamRow | null> {
  return db.prepare("SELECT id, name, budget, game_date, user_id, parent_team_id, team_type, season_start FROM teams WHERE id = ?")
    .bind(teamId).first<TeamRow>();
}

function isPlayableClub(t: TeamRow | null): t is TeamRow {
  return !!t && t.user_id !== "ai" && !t.parent_team_id && (t.team_type ?? "senior") !== "u21";
}

function todayOf(team: TeamRow): string {
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
function termsSummary(t: { date: string; venue: ChallengeVenue; costPayer: CostPayer; stake: number }, challenger: string, opponent: string, neutralVillage: string | null): string {
  const venue = t.venue === "neutral" && neutralVillage ? `na obecním hřišti v obci ${neutralVillage}` : VENUE_PHRASE[t.venue](challenger, opponent);
  const parts = [`${dateWords(t.date)} v 18:00 ${venue}`];
  if (t.costPayer === "challenger") parts.push(`náklady platí ${challenger}`);
  if (t.stake > 0) parts.push(`hraje se o ${t.stake.toLocaleString("cs")} Kč`);
  return parts.join(", ");
}

async function notify(env: Bindings, teamId: string, title: string, body: string, url: string): Promise<void> {
  try {
    const { createNotification } = await import("../community/notifications");
    const pushEnv = { VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: env.VAPID_SUBJECT, DB: env.DB };
    await createNotification(env.DB, teamId, "challenge", title, body, url, pushEnv);
  } catch (e) {
    logger.warn({ module: M }, "notifikace k přáteláku", e);
  }
}

/** Kolize obou týmů v daný den. Vrací hlášku pro toho, kdo akci dělá. */
async function scheduleClash(db: D1Database, actorId: string, otherId: string, day: string): Promise<string | null> {
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

// ── Přehled stránky Přáteláky ─────────────────────────────────────────────

interface ChallengeRow {
  id: string; challenger_team_id: string; challenged_team_id: string; status: string; match_id: string | null;
  message: string | null; created_at: string; match_date: string | null; venue: ChallengeVenue | null;
  neutral_village_id: string | null; neutral_village: string | null; cost_payer: CostPayer | null; stake: number | null;
  stake_status: string | null; cancel_reason: string | null; offer_id: string | null;
  challenger_name: string; challenged_name: string;
  m_status: string | null; home_team_id: string | null; home_score: number | null; away_score: number | null;
  m_created_at: string | null;
}

function viewOfChallenge(r: ChallengeRow, teamId: string, myCosts: CostLine[] | null, crests: Map<string, { name: string; crest: Crest }>) {
  const iAmChallenger = r.challenger_team_id === teamId;
  const venue = r.venue ?? "challenger";
  const myVenue = venue === "neutral" ? "neutral" : (venue === "challenger") === iAmChallenger ? "home" : "away";
  const payer = (r.cost_payer ?? "each") === "challenger" ? (iAmChallenger ? "me" : "opponent") : "each";
  const iAmHome = r.home_team_id === teamId;
  const played = r.m_status === "simulated";
  return {
    id: r.id,
    direction: iAmChallenger ? "out" : "in",
    opponent: {
      id: iAmChallenger ? r.challenged_team_id : r.challenger_team_id,
      name: iAmChallenger ? r.challenged_name : r.challenger_name,
      crest: crests.get(iAmChallenger ? r.challenged_team_id : r.challenger_team_id)?.crest ?? null,
    },
    // Čekající výzva z doby před termíny den nemá: hraje se nejbližší volný den po přijetí.
    // Přátelák z doby před termíny má den zápasu v matches.created_at, výzva vznikla den předtím.
    date: r.match_date ?? (r.status === "pending" ? null : gameDay(r.m_created_at ?? r.created_at)),
    venue: myVenue,
    neutralVillage: r.neutral_village,
    costPayer: payer,
    stake: r.stake ?? 0,
    message: r.message,
    status: r.status,
    fromOffer: !!r.offer_id,
    matchId: r.match_id,
    matchStatus: r.m_status,
    myScore: played ? (iAmHome ? r.home_score : r.away_score) : null,
    opponentScore: played ? (iAmHome ? r.away_score : r.home_score) : null,
    cancelReason: r.cancel_reason,
    myCosts,
  };
}

friendliesRouter.get("/teams/:teamId/challenges", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const team = await loadTeam(db, teamId);
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);
  const today = todayOf(team);
  const hour = pragueHour();

  // Výzvy po termínu vyprší a dnešní domluvené se otevřou na sestavu, i když tick ještě neběžel.
  await expireStaleFriendlies(db, today, hour).catch((e) => logger.error({ module: M }, "vypršení přáteláků", e));
  await openDueFriendlies(db, today).catch((e) => logger.error({ module: M }, "otevření dnešních přáteláků", e));

  const rows = await db.prepare(
    `SELECT c.*, tc.name AS challenger_name, td.name AS challenged_name, nv.name AS neutral_village,
            m.status AS m_status, m.home_team_id, m.home_score, m.away_score, m.created_at AS m_created_at
       FROM challenges c
       JOIN teams tc ON tc.id = c.challenger_team_id
       JOIN teams td ON td.id = c.challenged_team_id
       LEFT JOIN villages nv ON nv.id = c.neutral_village_id
       LEFT JOIN matches m ON m.id = c.match_id
      WHERE ?1 IN (c.challenger_team_id, c.challenged_team_id)
        AND (c.status IN ('pending', 'accepted') OR (c.status = 'played' AND c.created_at >= ?2)
             OR (c.status = 'expired' AND c.cancel_reason IS NOT NULL AND c.resolved_at >= ?2))
      ORDER BY COALESCE(c.match_date, c.created_at) DESC
      LIMIT 60`,
  ).bind(teamId, addDays(today, -60)).all<ChallengeRow>();

  // Náklady pro moji stranu: vzdálenosti ze souřadnic obcí, neutrální obec je u výzvy uložená.
  const geoIds = new Set<string>([teamId]);
  for (const r of rows.results) { geoIds.add(r.challenger_team_id); geoIds.add(r.challenged_team_id); }
  const costsFor = async (r: ChallengeRow): Promise<CostLine[] | null> => {
    if (!r.match_date) return null;
    const q = await quoteFriendly(db, r.challenger_team_id, r.challenged_team_id,
      { venue: r.venue ?? "challenger", costPayer: r.cost_payer ?? "each" }, r.neutral_village_id)
      .catch((e) => { logger.warn({ module: M }, `náklady výzvy ${r.id}`, e); return null; });
    if (!q) return null;
    return r.challenger_team_id === teamId ? q.costs.challenger : q.costs.opponent;
  };

  const crests = await loadCrests(db, [...geoIds])
    .catch((e) => { logger.warn({ module: M }, "erby klubů pro přáteláky", e); return new Map<string, { name: string; crest: Crest }>(); });

  const incoming = [];
  const outgoing = [];
  const upcoming = [];
  const played = [];
  const cancelled = [];
  for (const r of rows.results) {
    if (r.status === "played") { played.push(viewOfChallenge(r, teamId, null, crests)); continue; }
    if (r.status === "expired") { cancelled.push(viewOfChallenge(r, teamId, null, crests)); continue; }
    const view = viewOfChallenge(r, teamId, await costsFor(r), crests);
    if (r.status === "accepted") upcoming.push(view);
    else if (r.challenged_team_id === teamId) {
      // Kolize se počítá teď, ne při odeslání: mezitím se mohl domluvit jiný zápas.
      // Výzva bez dne se hraje nejbližší volný den, kolize se hlídá pro něj.
      const clash = await scheduleClash(db, teamId, r.challenger_team_id, r.match_date ?? earliestDay(today, hour));
      incoming.push({ ...view, clash });
    } else outgoing.push(view);
  }
  // Výzva bez dne (z doby před termíny) jde na začátek: hraje se nejbližší volný den.
  const byDate = (a: { date: string | null }, b: { date: string | null }) => (a.date ?? "").localeCompare(b.date ?? "");
  upcoming.sort(byDate);
  incoming.sort(byDate);
  outgoing.sort(byDate);

  // Veřejné nabídky termínů
  const offers = await db.prepare(
    `SELECT o.*, t.name AS team_name, v.name AS village, v.district
       FROM friendly_offers o
       JOIN teams t ON t.id = o.team_id
       JOIN villages v ON v.id = t.village_id
      WHERE o.status = 'open'
      ORDER BY o.match_date ASC, o.created_at ASC
      LIMIT 50`,
  ).all<{ id: string; team_id: string; match_date: string; venue: OfferVenue; cost_payer: OfferCostPayer; stake: number;
          message: string | null; created_at: string; team_name: string; village: string; district: string | null }>();

  const linked = await linkedTeamIds(db, teamId);
  const offerCrests = await loadCrests(db, offers.results.map((o) => o.team_id))
    .catch((e) => { logger.warn({ module: M }, "erby klubů v nabídkách", e); return new Map<string, { name: string; crest: Crest }>(); });
  const myOffers = [];
  const openOffers = [];
  for (const o of offers.results) {
    const base = {
      id: o.id, date: o.match_date, venue: o.venue, costPayer: o.cost_payer, stake: o.stake, message: o.message,
      team: { id: o.team_id, name: o.team_name, village: o.village, district: o.district, crest: offerCrests.get(o.team_id)?.crest ?? null },
    };
    if (o.team_id === teamId) { myOffers.push(base); continue; }
    const terms = offerToChallengeTerms(o);
    const q = await quoteFriendly(db, o.team_id, teamId, terms)
      .catch((e) => { logger.warn({ module: M }, `náklady nabídky ${o.id}`, e); return null; });
    let blocked: string | null = null;
    if (linked.has(o.team_id) && (o.stake > 0 || o.cost_payer !== "each")) blocked = "Kluby mají stejného majitele, o peníze spolu hrát nemůžou.";
    else if (team.budget < o.stake) blocked = "Na sázku nemáš dost peněz.";
    else blocked = await scheduleClash(db, teamId, o.team_id, o.match_date);
    openOffers.push({ ...base, myCosts: q?.costs.opponent ?? null, neutralVillage: q?.neutralVillage?.name ?? null, distanceKm: q?.distanceKm ?? null, blocked });
  }

  // Můj rozpis na dny, které jde vybrat
  const first = earliestDay(today, hour);
  const days = [];
  for (let d = first; d <= addDays(today, FRIENDLY_DAYS_AHEAD); d = addDays(d, 1)) {
    const busy = await findBusy(db, teamId, d);
    days.push({ date: d, busy: busy ? busyText(busy, true) : null });
  }

  const teams = await db.prepare(
    `SELECT t.id, t.name, v.name AS village, v.district
       FROM teams t JOIN villages v ON v.id = t.village_id
      WHERE t.user_id <> 'ai' AND t.id <> ? AND t.parent_team_id IS NULL AND COALESCE(t.team_type, 'senior') <> 'u21'
      ORDER BY v.district, t.name`,
  ).bind(teamId).all<{ id: string; name: string; village: string; district: string | null }>();

  const record = await loadHeadToHead(db, teamId);
  // Žebříček od začátku sezóny; bez známého začátku posledních 120 dní, ať tam nevisí loňské zápasy.
  const table = await loadFriendlyTable(db, team.season_start ? gameDay(team.season_start) : addDays(today, -120))
    .catch((e) => { logger.error({ module: M }, "žebříček přáteláků", e); return []; });
  const me = (await loadCrests(db, [teamId])).get(teamId) ?? null;

  return c.json({
    today,
    budget: team.budget,
    days,
    incoming, outgoing, upcoming, played: played.slice(0, 10), cancelled,
    offers: openOffers, myOffers,
    teams: teams.results.map((t) => ({ ...t, linked: linked.has(t.id) })),
    me: me ? { id: teamId, name: me.name, crest: me.crest } : null,
    record,
    table,
    limits: {
      maxStake: FRIENDLY_MAX_STAKE, stakeStep: FRIENDLY_STAKE_STEP, daysAhead: FRIENDLY_DAYS_AHEAD,
      maxOpenOffers: MAX_OPEN_OFFERS, maxMessage: MAX_MESSAGE_LENGTH, restDays: FRIENDLY_REST_DAYS,
      refereeFee: FRIENDLY_REFEREE_FEE, rentalFee: NEUTRAL_RENTAL_FEE, travelBase: TRAVEL_BASE, travelPerKm: TRAVEL_PER_KM,
    },
  });
});

// GET /teams/:teamId/friendlies/quote?opponent=&venue=&costPayer= — náklady pro formulář
friendliesRouter.get("/teams/:teamId/friendlies/quote", async (c) => {
  const teamId = c.req.param("teamId");
  const opponentId = c.req.query("opponent") ?? "";
  const parsed = parseTerms({ venue: c.req.query("venue"), costPayer: c.req.query("costPayer") }, "");
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const q = await quoteFriendly(c.env.DB, teamId, opponentId, parsed.terms);
  if (!q) return c.json({ error: "Soupeř nenalezen" }, 404);

  // Soupeřův rozpis, ať formulář rovnou zašedí dny, kdy hrát nemůže. Server to hlídá i při odeslání.
  const team = await loadTeam(c.env.DB, teamId);
  const today = team ? todayOf(team) : gameDay(new Date().toISOString());
  const opponentBusy: Array<{ date: string; text: string }> = [];
  for (let d = earliestDay(today, pragueHour()); d <= addDays(today, FRIENDLY_DAYS_AHEAD); d = addDays(d, 1)) {
    const busy = await findBusy(c.env.DB, opponentId, d);
    if (busy) opponentBusy.push({ date: d, text: busyText(busy, false) });
  }

  return c.json({
    distanceKm: q.distanceKm, neutralVillage: q.neutralVillage,
    myCosts: q.costs.challenger, opponentCosts: q.costs.opponent,
    myTotal: sumCosts(q.costs.challenger), opponentTotal: sumCosts(q.costs.opponent),
    opponentBusy,
  });
});

// ── Přímá výzva ───────────────────────────────────────────────────────────

// POST /teams/:teamId/challenge/:opponentTeamId — výzva s podmínkami
friendliesRouter.post("/teams/:teamId/challenge/:opponentTeamId", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const opponentId = c.req.param("opponentTeamId");
  const body = await c.req.json<Record<string, unknown>>().catch((e): Record<string, unknown> => { logger.warn({ module: M }, "nečitelné tělo výzvy", e); return {}; });

  if (teamId === opponentId) return c.json({ error: "Nemůžeš vyzvat sám sebe" }, 400);
  const [team, opponent] = await Promise.all([loadTeam(db, teamId), loadTeam(db, opponentId)]);
  if (!isPlayableClub(team)) return c.json({ error: "Přáteláky hraje áčko klubu." }, 400);
  if (!isPlayableClub(opponent)) return c.json({ error: "Přáteláky lze hrát pouze proti hráčským týmům" }, 400);

  const today = todayOf(team);
  const hour = pragueHour();
  const parsed = parseTerms(body, earliestDay(today, hour));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const terms = parsed.terms;

  const dateErr = dateError(terms.date, today, hour);
  if (dateErr) return c.json({ error: dateErr }, 400);
  const linkedErr = await linkedTermsError(db, teamId, opponentId, terms);
  if (linkedErr) return c.json({ error: linkedErr }, 403);
  if (team.budget < terms.stake) return c.json({ error: "Na takovou sázku nemáš dost peněz." }, 400);
  const clash = await scheduleClash(db, teamId, opponentId, terms.date);
  if (clash) return c.json({ error: clash }, 409);

  const existing = await db.prepare(
    "SELECT id FROM challenges WHERE challenger_team_id = ? AND challenged_team_id = ? AND status = 'pending' LIMIT 1",
  ).bind(teamId, opponentId).first<{ id: string }>();
  if (existing) return c.json({ error: "Tomuhle soupeři už výzva leží. Počkej na odpověď, nebo ji stáhni." }, 409);

  let neutralVillage: { id: string; name: string } | null = null;
  if (terms.venue === "neutral") {
    const geo = await loadClubGeo(db, [teamId, opponentId]);
    const a = geo.get(teamId);
    const b = geo.get(opponentId);
    neutralVillage = a && b ? await pickNeutralVillage(db, a, b) : null;
    if (!neutralVillage) return c.json({ error: "Neutrální hřiště se nepodařilo najít." }, 400);
  }

  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO challenges (id, challenger_team_id, challenged_team_id, status, message, created_at, expires_at,
                             match_date, venue, neutral_village_id, cost_payer, stake)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, teamId, opponentId, terms.message, team.game_date ?? new Date().toISOString(), `${terms.date}T16:00:00.000Z`,
    terms.date, terms.venue, neutralVillage?.id ?? null, terms.costPayer, terms.stake).run();

  const summary = termsSummary(terms, team.name, opponent.name, neutralVillage?.name ?? null);
  await sendSystemSMS(db, opponentId, SMS_ROLE,
    `⚽ ${team.name} tě vyzývá na přátelák: ${summary}.${terms.message ? ` Vzkaz: „${terms.message}“` : ""} Odpověz v Přátelákách.`,
    { type: "friendly", challengeId: id });
  await notify(c.env, opponentId, `⚽ Výzva od ${team.name}`, summary, "/pratelaky");

  return c.json({ ok: true, challengeId: id });
});

// POST /teams/:teamId/challenge/:challengeId/accept
friendliesRouter.post("/teams/:teamId/challenge/:challengeId/accept", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const challengeId = c.req.param("challengeId");

  const ch = await db.prepare(
    "SELECT * FROM challenges WHERE id = ? AND challenged_team_id = ? AND status = 'pending'",
  ).bind(challengeId, teamId).first<{
    id: string; challenger_team_id: string; match_date: string | null; venue: ChallengeVenue | null;
    neutral_village_id: string | null; cost_payer: CostPayer | null; stake: number | null; message: string | null;
  }>();
  if (!ch) return c.json({ error: "Výzva nenalezena nebo už zpracována" }, 404);

  const [team, challenger] = await Promise.all([loadTeam(db, teamId), loadTeam(db, ch.challenger_team_id)]);
  if (!team || !challenger) return c.json({ error: "Tým nenalezen" }, 404);
  const today = todayOf(team);
  const hour = pragueHour();
  // Výzva z doby před termíny se hraje nejbližší volný den, jako dřív.
  const terms: FriendlyTerms = {
    date: ch.match_date ?? earliestDay(today, hour),
    venue: ch.venue ?? "challenger",
    costPayer: ch.cost_payer ?? "each",
    stake: ch.stake ?? 0,
    message: ch.message,
  };

  const dateErr = dateError(terms.date, today, hour);
  if (dateErr) {
    await db.prepare("UPDATE challenges SET status = 'expired', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ? AND status = 'pending'")
      .bind(challengeId).run();
    return c.json({ error: "Termín výzvy už prošel." }, 410);
  }
  const linkedErr = await linkedTermsError(db, ch.challenger_team_id, teamId, terms);
  if (linkedErr) return c.json({ error: linkedErr }, 403);
  if (team.budget < terms.stake) return c.json({ error: "Na sázku nemáš dost peněz." }, 400);
  if (challenger.budget < terms.stake) return c.json({ error: "Soupeř teď na sázku nemá peníze." }, 400);
  const clash = await scheduleClash(db, teamId, ch.challenger_team_id, terms.date);
  if (clash) return c.json({ error: clash }, 409);

  // Atomické zabrání: souběžné přijetí nebo stažení vyhraje jen jeden.
  const claimed = await db.prepare(
    `UPDATE challenges SET status = 'accepted', match_date = ?, resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ? AND status = 'pending' RETURNING id`,
  ).bind(terms.date, challengeId).first<{ id: string }>();
  if (!claimed) return c.json({ error: "Výzva už byla mezitím zpracována" }, 409);

  const names = { challenger: challenger.name, opponent: team.name };
  const scheduled = await scheduleFriendly(db,
    { id: challengeId, challengerId: ch.challenger_team_id, opponentId: teamId, date: terms.date, venue: terms.venue, stake: terms.stake },
    today, names);
  if (!scheduled.ok) {
    await db.prepare("UPDATE challenges SET status = 'pending', match_date = ?, resolved_at = NULL WHERE id = ? AND status = 'accepted' AND match_id IS NULL")
      .bind(ch.match_date, challengeId).run();
    return c.json({ error: scheduled.error }, 409);
  }

  const neutralName = ch.neutral_village_id
    ? (await db.prepare("SELECT name FROM villages WHERE id = ?").bind(ch.neutral_village_id).first<{ name: string }>())?.name ?? null
    : null;
  const summary = termsSummary(terms, challenger.name, team.name, neutralName);
  await sendSystemSMS(db, ch.challenger_team_id, SMS_ROLE, `✅ ${team.name} výzvu přijal. Přátelák: ${summary}.`, { type: "friendly", challengeId });
  await sendSystemSMS(db, teamId, SMS_ROLE, `✅ Přátelák s ${challenger.name} domluven: ${summary}.`, { type: "friendly", challengeId });
  await notify(c.env, ch.challenger_team_id, `✅ ${team.name} přijal výzvu`, summary, "/pratelaky");

  return c.json({ ok: true, matchId: scheduled.matchId });
});

// POST /teams/:teamId/challenge/:challengeId/decline
friendliesRouter.post("/teams/:teamId/challenge/:challengeId/decline", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const challengeId = c.req.param("challengeId");
  const declined = await db.prepare(
    `UPDATE challenges SET status = 'declined', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ? AND challenged_team_id = ? AND status = 'pending' RETURNING challenger_team_id`,
  ).bind(challengeId, teamId).first<{ challenger_team_id: string }>();
  if (!declined) return c.json({ error: "Výzva nenalezena" }, 404);

  const team = await loadTeam(db, teamId);
  await sendSystemSMS(db, declined.challenger_team_id, SMS_ROLE, `❌ ${team?.name ?? "Soupeř"} výzvu na přátelák odmítl.`);
  await notify(c.env, declined.challenger_team_id, `❌ ${team?.name ?? "Soupeř"} odmítl výzvu`, "Zkus vyzvat jiný tým.", "/pratelaky");
  return c.json({ ok: true });
});

// POST /teams/:teamId/challenge/:challengeId/cancel — stáhnout vlastní výzvu, dokud ji soupeř nepřijal
friendliesRouter.post("/teams/:teamId/challenge/:challengeId/cancel", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const challengeId = c.req.param("challengeId");
  // 'declined' místo 'cancelled': status má CHECK jen na pět hodnot a stažená výzva skončí stejně.
  const cancelled = await db.prepare(
    `UPDATE challenges SET status = 'declined', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ? AND challenger_team_id = ? AND status = 'pending' RETURNING challenged_team_id`,
  ).bind(challengeId, teamId).first<{ challenged_team_id: string }>();
  if (!cancelled) return c.json({ error: "Výzva už byla mezitím přijata nebo zpracována" }, 409);

  const team = await loadTeam(db, teamId);
  await sendSystemSMS(db, cancelled.challenged_team_id, SMS_ROLE, `↩️ ${team?.name ?? "Soupeř"} stáhl výzvu na přátelák.`);
  return c.json({ ok: true });
});

// ── Veřejné nabídky termínů ───────────────────────────────────────────────

const OFFER_VENUES: OfferVenue[] = ["poster", "taker", "neutral"];
const OFFER_PAYERS: OfferCostPayer[] = ["each", "poster"];

// POST /teams/:teamId/friendly-offers — „ten den mám volno a chci hrát"
friendliesRouter.post("/teams/:teamId/friendly-offers", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const body = await c.req.json<Record<string, unknown>>().catch((e): Record<string, unknown> => { logger.warn({ module: M }, "nečitelné tělo nabídky", e); return {}; });
  const team = await loadTeam(db, teamId);
  if (!isPlayableClub(team)) return c.json({ error: "Přáteláky hraje áčko klubu." }, 400);

  const venue = (body.venue ?? "poster") as OfferVenue;
  const costPayer = (body.costPayer ?? "each") as OfferCostPayer;
  if (!OFFER_VENUES.includes(venue)) return c.json({ error: "Neznámé místo zápasu." }, 400);
  if (!OFFER_PAYERS.includes(costPayer)) return c.json({ error: "Neznámé rozdělení nákladů." }, 400);
  // Částku, den a vzkaz kontroluje stejné pravidlo jako u výzvy.
  const today = todayOf(team);
  const hour = pragueHour();
  const parsed = parseTerms({ ...body, venue: "challenger", costPayer: "each" }, "");
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { date, stake, message } = parsed.terms;

  const dateErr = dateError(date, today, hour);
  if (dateErr) return c.json({ error: dateErr }, 400);
  if (team.budget < stake) return c.json({ error: "Na takovou sázku nemáš dost peněz." }, 400);
  const busy = await findBusy(db, teamId, date);
  if (busy) return c.json({ error: busyText(busy, true) }, 409);

  const mine = await db.prepare("SELECT match_date FROM friendly_offers WHERE team_id = ? AND status = 'open'")
    .bind(teamId).all<{ match_date: string }>();
  if (mine.results.some((o) => o.match_date === date)) return c.json({ error: "Na tenhle den už nabídku máš." }, 409);
  if (mine.results.length >= MAX_OPEN_OFFERS) return c.json({ error: `Najednou můžeš mít nejvýš ${MAX_OPEN_OFFERS} nabídky.` }, 409);

  const id = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO friendly_offers (id, team_id, match_date, venue, cost_payer, stake, message) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(id, teamId, date, venue, costPayer, stake, message).run();
  return c.json({ ok: true, offerId: id });
});

// POST /teams/:teamId/friendly-offers/:offerId/withdraw
friendliesRouter.post("/teams/:teamId/friendly-offers/:offerId/withdraw", async (c) => {
  const res = await c.env.DB.prepare(
    `UPDATE friendly_offers SET status = 'withdrawn', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ? AND team_id = ? AND status = 'open' RETURNING id`,
  ).bind(c.req.param("offerId"), c.req.param("teamId")).first<{ id: string }>();
  if (!res) return c.json({ error: "Nabídka už neplatí." }, 409);
  return c.json({ ok: true });
});

// POST /teams/:teamId/friendly-offers/:offerId/take — vzít cizí nabídku termínu
friendliesRouter.post("/teams/:teamId/friendly-offers/:offerId/take", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const offerId = c.req.param("offerId");

  const offer = await db.prepare("SELECT * FROM friendly_offers WHERE id = ? AND status = 'open'")
    .bind(offerId).first<{ id: string; team_id: string; match_date: string; venue: OfferVenue; cost_payer: OfferCostPayer; stake: number; message: string | null }>();
  if (!offer) return c.json({ error: "Nabídka už neplatí." }, 409);
  if (offer.team_id === teamId) return c.json({ error: "Vlastní nabídku vzít nemůžeš." }, 400);

  const [team, poster] = await Promise.all([loadTeam(db, teamId), loadTeam(db, offer.team_id)]);
  if (!isPlayableClub(team)) return c.json({ error: "Přáteláky hraje áčko klubu." }, 400);
  if (!isPlayableClub(poster)) return c.json({ error: "Nabídka už neplatí." }, 409);

  const today = todayOf(team);
  const hour = pragueHour();
  const dateErr = dateError(offer.match_date, today, hour);
  if (dateErr) return c.json({ error: "Termín nabídky už prošel." }, 410);

  const { venue, costPayer } = offerToChallengeTerms(offer);
  const terms: FriendlyTerms = { date: offer.match_date, venue, costPayer, stake: offer.stake, message: offer.message };
  const linkedErr = await linkedTermsError(db, offer.team_id, teamId, terms);
  if (linkedErr) return c.json({ error: linkedErr }, 403);
  if (team.budget < terms.stake) return c.json({ error: "Na sázku nemáš dost peněz." }, 400);
  if (poster.budget < terms.stake) return c.json({ error: "Klub, který nabídku vypsal, teď na sázku nemá peníze." }, 400);
  const clash = await scheduleClash(db, teamId, offer.team_id, terms.date);
  if (clash) return c.json({ error: clash }, 409);

  let neutralVillage: { id: string; name: string } | null = null;
  if (venue === "neutral") {
    const geo = await loadClubGeo(db, [offer.team_id, teamId]);
    const a = geo.get(offer.team_id);
    const b = geo.get(teamId);
    neutralVillage = a && b ? await pickNeutralVillage(db, a, b) : null;
    if (!neutralVillage) return c.json({ error: "Neutrální hřiště se nepodařilo najít." }, 400);
  }

  // Nabídku si zabere jen jeden: dva souběžní zájemci nesmí dostat dva zápasy.
  const challengeId = crypto.randomUUID();
  const claimed = await db.prepare(
    `UPDATE friendly_offers SET status = 'taken', taken_by_team_id = ?, challenge_id = ?, resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ? AND status = 'open' RETURNING id`,
  ).bind(teamId, challengeId, offerId).first<{ id: string }>();
  if (!claimed) return c.json({ error: "Nabídku už mezitím vzal někdo jiný." }, 409);

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
    return c.json({ error: scheduled.error }, 409);
  }

  const summary = termsSummary(terms, poster.name, team.name, neutralVillage?.name ?? null);
  await sendSystemSMS(db, offer.team_id, SMS_ROLE, `✅ ${team.name} vzal tvoji nabídku přáteláku: ${summary}.`, { type: "friendly", challengeId });
  await notify(c.env, offer.team_id, `✅ ${team.name} vzal tvůj termín`, summary, "/pratelaky");
  return c.json({ ok: true, matchId: scheduled.matchId, challengeId });
});

