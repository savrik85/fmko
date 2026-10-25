/**
 * Přáteláky: výzvy s podmínkami, veřejné nabídky termínů a bilance se soupeři.
 * Pravidla a výpočty žijí v multiplayer/friendlies.ts, tady je HTTP vrstva.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { requirePrivateTeamRead, requireTeamOwnership } from "../auth/middleware";
import { logger } from "../lib/logger";
import { pragueHour } from "../lib/match-tick-schedule";
import { linkedTeamIds } from "../competition/club-links";
import {
  FRIENDLY_DAYS_AHEAD, FRIENDLY_MAX_STAKE, FRIENDLY_STAKE_STEP, MAX_MESSAGE_LENGTH, MAX_OPEN_OFFERS,
  FRIENDLY_REST_DAYS, FRIENDLY_REFEREE_FEE, NEUTRAL_RENTAL_FEE, TRAVEL_BASE, TRAVEL_PER_KM,
  addDays, busyText, earliestDay, expireStaleFriendlies, findBusy, gameDay,
  loadCrests, loadFriendlyTable, loadHeadToHead, offerToChallengeTerms, openDueFriendlies, parseTerms,
  quoteFriendly, sumCosts,
  type ChallengeVenue, type CostLine, type CostPayer, type Crest, type OfferCostPayer, type OfferVenue,
} from "../multiplayer/friendlies";
import {
  acceptChallenge, cancelChallenge, declineChallenge, friendlyToday, loadFriendlyClub, postFriendlyOffer, scheduleClash,
  sendChallenge, takeFriendlyOffer, type FriendlyActionFail, type FriendlyActionOpts,
} from "../multiplayer/friendly-actions";

const M = "friendlies";

export const friendliesRouter = new Hono<{ Bindings: Bindings }>();
friendliesRouter.use("/teams/:teamId/*", requireTeamOwnership);
// Přehled ukazuje rozpočet, vzkazy a sázky, náklady prozradí obsazené dny: čte je jen majitel.
friendliesRouter.use("/teams/:teamId/challenges", requirePrivateTeamRead);
friendliesRouter.use("/teams/:teamId/friendlies/quote", requirePrivateTeamRead);

/** Pravidla akcí žijí v multiplayer/friendly-actions.ts, sdílí je člověk i AI trenér. */
function actionOpts(env: Bindings): FriendlyActionOpts {
  return { push: { VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: env.VAPID_SUBJECT, DB: env.DB } };
}

function failResponse(c: { json: (body: unknown, status: number) => Response }, r: FriendlyActionFail): Response {
  return c.json({ error: r.error }, r.status);
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
  const team = await loadFriendlyClub(db, teamId);
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);
  const today = friendlyToday(team);
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

  // Vyzvat jde každé áčko v soutěži, lidské i AI (AI trenér výzvy vyřizuje sám, ai-coach/friendlies.ts).
  const teams = await db.prepare(
    `SELECT t.id, t.name, v.name AS village, v.district
       FROM teams t JOIN villages v ON v.id = t.village_id
      WHERE t.id <> ? AND t.parent_team_id IS NULL AND COALESCE(t.team_type, 'senior') <> 'u21'
        AND (t.user_id <> 'ai' OR t.league_id IS NOT NULL)
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
  const team = await loadFriendlyClub(c.env.DB, teamId);
  const today = team ? friendlyToday(team) : gameDay(new Date().toISOString());
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
  const body = await c.req.json<Record<string, unknown>>().catch((e): Record<string, unknown> => { logger.warn({ module: M }, "nečitelné tělo výzvy", e); return {}; });
  const r = await sendChallenge(c.env.DB, c.req.param("teamId"), c.req.param("opponentTeamId"), body, actionOpts(c.env));
  if (!r.ok) return failResponse(c, r);
  return c.json({ ok: true, challengeId: r.challengeId });
});

// POST /teams/:teamId/challenge/:challengeId/accept
friendliesRouter.post("/teams/:teamId/challenge/:challengeId/accept", async (c) => {
  const r = await acceptChallenge(c.env.DB, c.req.param("teamId"), c.req.param("challengeId"), actionOpts(c.env));
  if (!r.ok) return failResponse(c, r);
  return c.json({ ok: true, matchId: r.matchId });
});

// POST /teams/:teamId/challenge/:challengeId/decline
friendliesRouter.post("/teams/:teamId/challenge/:challengeId/decline", async (c) => {
  const r = await declineChallenge(c.env.DB, c.req.param("teamId"), c.req.param("challengeId"), actionOpts(c.env));
  if (!r.ok) return failResponse(c, r);
  return c.json({ ok: true });
});

// POST /teams/:teamId/challenge/:challengeId/cancel — stáhnout vlastní výzvu, dokud ji soupeř nepřijal
friendliesRouter.post("/teams/:teamId/challenge/:challengeId/cancel", async (c) => {
  const r = await cancelChallenge(c.env.DB, c.req.param("teamId"), c.req.param("challengeId"));
  if (!r.ok) return failResponse(c, r);
  return c.json({ ok: true });
});

// ── Veřejné nabídky termínů ───────────────────────────────────────────────

// POST /teams/:teamId/friendly-offers — „ten den mám volno a chci hrát"
friendliesRouter.post("/teams/:teamId/friendly-offers", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch((e): Record<string, unknown> => { logger.warn({ module: M }, "nečitelné tělo nabídky", e); return {}; });
  const r = await postFriendlyOffer(c.env.DB, c.req.param("teamId"), body, actionOpts(c.env));
  if (!r.ok) return failResponse(c, r);
  return c.json({ ok: true, offerId: r.offerId });
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
  const r = await takeFriendlyOffer(c.env.DB, c.req.param("teamId"), c.req.param("offerId"), actionOpts(c.env));
  if (!r.ok) return failResponse(c, r);
  return c.json({ ok: true, matchId: r.matchId, challengeId: r.challengeId });
});
