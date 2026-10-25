/**
 * AI klub na přestupovém trhu (spec 3.7): prodává, co přebývá, a shání, co mu chybí.
 *
 * Jednou denně v hodinu, kterou má každý klub jinou (jako člověk, co se na trh podívá
 * po práci), a jen v některé dny podle obchodní aktivity:
 * - dá na trh přebytečné hráče (cena z `valuation.ts`, nikdy pod rezervací),
 * - nabídne přebytečného hráče k cizí poptávce,
 * - na nejslabší nebo nejtenčí post pošle nabídku (inzerát nebo přímo hráči v lize),
 *   když nic nenajde, založí poptávku,
 * - šetrný trenér si na tenký post radši půjčí mladého hráče,
 * - pod minimem kádru podepíše volného hráče.
 *
 * Všechno přes stejné služby jako člověk. Limity: počet obchodů za měsíc a rozjetých
 * nabídek podle obchodní aktivity, rezerva na provoz podle šetrnosti. Obchody mezi
 * AI kluby jsou povolené, ale vzácné. Model se tu nevolá: ceny i výběr počítá kód.
 */

import type { Bindings } from "../index";
import { marketValue } from "@okresni-masina/shared";
import { createRng } from "../generators/rng";
import { logger } from "../lib/logger";
import { createTransferOffer, FREE_AGENT_SIGNING_FEE, listPlayerOnMarket, placeListingBid, signFreeAgent } from "../services/transfer-actions";
import { findVisibleFreeAgents, findVisibleListings } from "../transfers/market-visibility";
import { findTransferSearchPlayerRows } from "../transfers/player-search";
import { claimCoachTask } from "./claims";
import { logDecision, type DecisionMode } from "./decision-log";
import type { HourlyHook } from "./hourly-hooks";
import { readCoachMode } from "./mode";
import { ensureAiProfile, type AiCoachProfile } from "./profile";
import { MAX_SQUAD, SIGNING_SQUAD_THRESHOLD, TARGET_SENIOR_SQUAD, type PositionNeed } from "./squad";
import { loadAiClubState, pragueDay, pragueHour, type AiClubState } from "./transfer-club";
import { canOpenDeal, openOutgoingOffers } from "./transfer-replies";
import { hashString, maxBuyPrice, openDealLimit, openingAsk, openingBid, stableUnit } from "./valuation";

const M = "ai-transfer-market";

/** Šance, že se AI na trh ten den vůbec podívá: 25 % (neobchodník) až 75 % (obchodník). */
export function marketDayChance(profile: AiCoachProfile): number {
  return 0.25 + (profile.trading / 100) * 0.5;
}

/** Hodina v Praze, kdy se klub na trh dívá (9–19, každý klub jinak). */
export function marketHour(teamId: string): number {
  return 9 + Math.floor(stableUnit(`market-hour|${teamId}`) * 11);
}

/** Jak často AI klub uvažuje o hráči jiného AI klubu (obchody mezi AI kluby jsou vzácné). */
export const AI_TO_AI_CHANCE = 0.2;
/** Nabídku AI pošle, jen když jí strop dovolí dát aspoň tolik z tržní hodnoty. */
const MIN_MAX_TO_VALUE = 0.9;
/** Nejvýš tolik pokusů o nabídku za den (služba může odmítnout: pauza po odmítnutí, propojení). */
const MAX_OFFER_ATTEMPTS = 3;

export interface MarketAction {
  kind: "list" | "pitch" | "offer" | "bid" | "loan_request" | "demand" | "sign_free_agent";
  playerId?: string;
  listingId?: string;
  demandId?: string;
  amount?: number;
  position?: string;
  result: string;
  error?: string;
}

export interface MarketResult {
  /** Proč klub dnes na trh nešel (null = šel). */
  skipped: string | null;
  mode: DecisionMode;
  actions: MarketAction[];
}

interface RunOptions {
  profile?: AiCoachProfile;
  /** Bez rozvrhu (hodina, denní šance, nárok na den): pro admina a testy. */
  ignoreSchedule?: boolean;
}

function floor1000(v: number): number {
  return Math.floor(v / 1000) * 1000;
}

async function cooldownFree(db: D1Database, playerId: string, clubTeamId: string): Promise<boolean> {
  const { offerRetryBlock } = await import("../transfers/offer-cooldown");
  const block = await offerRetryBlock(db, playerId, clubTeamId)
    .catch((e) => { logger.warn({ module: M }, `pauza po odmítnutí ${playerId}`, e); return null; });
  return !block;
}

async function hasOpenOfferFor(db: D1Database, playerId: string, clubTeamId: string): Promise<boolean> {
  const row = await db.prepare(
    `SELECT 1 AS x FROM transfer_offers WHERE player_id = ? AND status IN ('pending', 'countered')
       AND from_team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?) LIMIT 1`,
  ).bind(playerId, clubTeamId, clubTeamId).first<{ x: number }>()
    .catch((e) => { logger.warn({ module: M }, `rozjetá nabídka na ${playerId}`, e); return null; });
  return !!row;
}

/** Podíl meziligového poplatku, který kupující zaplatí navíc k ceně (0,2 = 20 %). */
async function adminFeeShare(db: D1Database, buyerLeagueId: string | null, sellerTeamId: string): Promise<number> {
  const seller = await db.prepare("SELECT league_id FROM teams WHERE id = ?").bind(sellerTeamId).first<{ league_id: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `liga prodávajícího ${sellerTeamId}`, e); return null; });
  const { computeTransferLevies } = await import("../competition/transfer-levy");
  const levies = await computeTransferLevies(db, { buyerLeagueId, sellerLeagueId: seller?.league_id, amount: 100_000, isLoan: false })
    .catch((e) => { logger.warn({ module: M }, "poplatky z přestupu", e); return null; });
  return levies ? levies.adminFee / 100_000 : 0;
}

/** Inzeráty na přebytečné hráče, dokud je volné místo pro rozjeté obchody. */
async function listSurplus(env: Bindings, club: AiClubState, now: Date, mode: DecisionMode, actions: MarketAction[]): Promise<void> {
  const db = env.DB;
  const active = await db.prepare(
    "SELECT player_id FROM transfer_listings WHERE team_id = ? AND status = 'active'",
  ).bind(club.teamId).all<{ player_id: string }>()
    .catch((e) => { logger.warn({ module: M }, `inzeráty klubu ${club.teamId}`, e); return { results: [] as { player_id: string }[] }; });
  const listed = new Set(active.results.map((r) => r.player_id));
  let slots = openDealLimit(club.profile) - listed.size;
  if (slots <= 0) return;
  // Trh pročišťuje hlavně přeplněný kádr; obchodník prodává přebytek i jinak.
  const crowded = club.analysis.seniorOwnCount > TARGET_SENIOR_SQUAD;
  if (!crowded && club.profile.trading < 50) return;

  const candidates = club.members
    .filter((m) => !m.isU21Roster && !m.loanedIn && !listed.has(m.id) && club.analysis.importanceOf(m.id) === "surplus")
    .filter((m) => club.analysis.sellBlock(m.id) === null)
    // Nejdřív starší a slabší, mladé si mládežník nechá.
    .sort((a, b) => (b.age - a.age) || (a.rating - b.rating));
  for (const m of candidates) {
    if (slots <= 0) break;
    if (m.age <= 21 && club.profile.youthFocus >= 50) continue;
    const mv = marketValue(m.rating, m.age, m.position);
    const price = openingAsk({ marketValue: mv, importance: "surplus", profile: club.profile, playerId: m.id, now });
    if (mode === "shadow") {
      actions.push({ kind: "list", playerId: m.id, amount: price, result: "shadow" });
    } else {
      const res = await listPlayerOnMarket(env, club.teamId, m.id, price);
      actions.push({ kind: "list", playerId: m.id, amount: price, result: res.ok ? "listed" : "failed", error: res.ok ? undefined : res.error });
    }
    slots--;
  }
}

/** Přebytečného hráče nabídne k poptávce (klubu mimo hru z okresu nebo klubu ve hře). */
async function pitchSurplus(env: Bindings, club: AiClubState, now: Date, mode: DecisionMode, actions: MarketAction[]): Promise<void> {
  if (club.profile.trading < 30) return;
  const db = env.DB;
  const surplus = club.members.filter((m) => !m.loanedIn && club.analysis.importanceOf(m.id) === "surplus" && club.analysis.sellBlock(m.id) === null);
  if (surplus.length === 0) return;
  const demands = await db.prepare(
    `SELECT d.id, d.position, d.age_min, d.age_max, d.min_rating, d.team_id
       FROM transfer_demands d
      WHERE d.status = 'active' AND d.expires_at > ? AND (d.team_id IS NULL OR d.team_id != ?)
        AND ((d.team_id IS NULL AND d.district = ?) OR d.team_id IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM transfer_demand_pitches dp WHERE dp.demand_id = d.id AND dp.team_id = ?)
      ORDER BY d.created_at DESC LIMIT 30`,
  ).bind(now.toISOString(), club.teamId, club.district ?? "", club.teamId).all<{
    id: string; position: string; age_min: number; age_max: number; min_rating: number | null; team_id: string | null;
  }>().catch((e) => { logger.warn({ module: M }, "poptávky pro nabídnutí hráče", e); return { results: [] }; });

  for (const d of demands.results) {
    // U klubu ve hře poptávka hodnocení hlídá sama, u klubu mimo hru je práh skrytý.
    const fit = surplus.find((m) => m.position === d.position && m.age >= d.age_min && m.age <= d.age_max
      && (d.team_id == null || m.rating >= (d.min_rating ?? 0)));
    if (!fit) continue;
    if (mode === "shadow") {
      actions.push({ kind: "pitch", playerId: fit.id, demandId: d.id, result: "shadow" });
      return;
    }
    const { pitchPlayer } = await import("../transfers/demands");
    const res = await pitchPlayer(db, club.teamId, d.id, fit.id, createRng(hashString(`pitch|${club.teamId}|${d.id}|${pragueDay(now)}`)));
    actions.push({ kind: "pitch", playerId: fit.id, demandId: d.id, result: res.ok ? res.status : "failed", error: res.ok ? undefined : res.error });
    return;
  }
}

interface BuyCandidate {
  playerId: string;
  teamId: string;
  rating: number;
  age: number;
  position: string;
  marketValue: number;
  listingId: string | null;
  askingPrice: number | null;
  sellerIsAi: boolean;
}

/** Kandidáti na post: inzeráty klubů ve hře a hráči soupeřů v lize (bez vlastních a hostujících). */
async function buyCandidates(env: Bindings, club: AiClubState, need: PositionNeed, now: Date): Promise<BuyCandidate[]> {
  const db = env.DB;
  const out = new Map<string, BuyCandidate>();
  if (club.leagueId) {
    const listings = await findVisibleListings(db, { id: club.teamId, leagueId: club.leagueId })
      .catch((e) => { logger.warn({ module: M }, "inzeráty pro nákup", e); return [] as Record<string, unknown>[]; });
    for (const l of listings) {
      if (l.is_ai_listing || !l.player_id || l.position !== need.position) continue;
      const rating = Number(l.overall_rating) || 0;
      if (rating < need.minRating) continue;
      out.set(l.player_id as string, {
        playerId: l.player_id as string, teamId: l.team_id as string, rating, age: Number(l.age) || 25, position: l.position as string,
        marketValue: marketValue(rating, Number(l.age) || 25, l.position as string),
        listingId: l.id as string, askingPrice: Number(l.asking_price) || null, sellerIsAi: l.team_user_id === "ai",
      });
    }
    const rows = await findTransferSearchPlayerRows(db, club.leagueId, club.teamId)
      .catch((e) => { logger.warn({ module: M }, "hledání hráčů pro nákup", e); return []; });
    const teamIds = Array.from(new Set(rows.map((r) => r.team_id)));
    const owners = new Map<string, string | null>();
    for (let i = 0; i < teamIds.length; i += 90) {
      const chunk = teamIds.slice(i, i + 90);
      const res = await db.prepare(`SELECT id, user_id FROM teams WHERE id IN (${chunk.map(() => "?").join(",")})`)
        .bind(...chunk).all<{ id: string; user_id: string | null }>()
        .catch((e) => { logger.warn({ module: M }, "majitelé klubů kandidátů", e); return { results: [] as { id: string; user_id: string | null }[] }; });
      for (const r of res.results) owners.set(r.id, r.user_id);
    }
    for (const r of rows) {
      if (r.position !== need.position || r.overall_rating < need.minRating || out.has(r.id)) continue;
      out.set(r.id, {
        playerId: r.id, teamId: r.team_id, rating: r.overall_rating, age: r.age, position: r.position,
        marketValue: marketValue(r.overall_rating, r.age, r.position), listingId: null, askingPrice: null,
        sellerIsAi: owners.get(r.team_id) === "ai",
      });
    }
  }
  // Obchody mezi AI kluby jsou vzácné: hráče jiného AI klubu AI zvažuje jen některé dny.
  const aiDay = stableUnit(`ai-to-ai|${club.teamId}|${pragueDay(now)}`) < AI_TO_AI_CHANCE;
  return Array.from(out.values()).filter((c) => aiDay || !c.sellerIsAi);
}

/** Na nejpotřebnější post pošle jednu nabídku (inzerát, nebo přímo), jinak založí poptávku. */
async function buyForNeed(env: Bindings, club: AiClubState, now: Date, mode: DecisionMode, actions: MarketAction[]): Promise<void> {
  const db = env.DB;
  if (club.analysis.seniorOwnCount >= MAX_SQUAD - 1 || club.spendable <= 0) return;
  if (!canOpenDeal(club, await openOutgoingOffers(db, club.teamId))) return;
  const need = club.analysis.needs.find((n) => n.need >= 0.3);
  if (!need) return;

  const candidates = await buyCandidates(env, club, need, now);
  const priced: Array<BuyCandidate & { maxPrice: number; amount: number }> = [];
  for (const c of candidates) {
    const feeShare = await adminFeeShare(db, club.leagueId, c.teamId);
    const maxPrice = Math.floor(maxBuyPrice({
      marketValue: c.marketValue, need: need.need, profile: club.profile, playerId: c.playerId, now, spendable: club.spendable,
    }) / (1 + feeShare) / 100) * 100;
    if (maxPrice < c.marketValue * MIN_MAX_TO_VALUE) continue;
    const bid = openingBid(maxPrice, c.marketValue, club.profile, c.playerId, now);
    // Inzerát: cena z inzerátu, když se vejde do stropu, jinak rozumně pod ní.
    const amount = c.askingPrice
      ? (c.askingPrice <= maxPrice ? c.askingPrice : Math.max(bid, Math.floor(c.askingPrice * 0.85 / 100) * 100))
      : bid;
    if (amount > maxPrice) continue;
    priced.push({ ...c, maxPrice, amount });
  }
  // Nejvíc kvality za peníze; při shodě lepší hráč.
  priced.sort((a, b) => ((b.rating - need.minRating + 1) / b.amount) - ((a.rating - need.minRating + 1) / a.amount) || b.rating - a.rating);

  let attempts = 0;
  for (const c of priced) {
    if (attempts >= MAX_OFFER_ATTEMPTS) break;
    if (await hasOpenOfferFor(db, c.playerId, club.teamId) || !(await cooldownFree(db, c.playerId, club.teamId))) continue;
    attempts++;
    if (mode === "shadow") {
      actions.push({ kind: c.listingId ? "bid" : "offer", playerId: c.playerId, listingId: c.listingId ?? undefined, amount: c.amount, position: need.position, result: "shadow" });
      return;
    }
    if (c.listingId) {
      const res = await placeListingBid(env, club.teamId, c.listingId, { amount: c.amount });
      actions.push({ kind: "bid", playerId: c.playerId, listingId: c.listingId, amount: c.amount, position: need.position, result: res.ok ? "sent" : "failed", error: res.ok ? undefined : res.error });
      if (res.ok) return;
    } else {
      const res = await createTransferOffer(env, club.teamId, { playerId: c.playerId, amount: c.amount });
      actions.push({ kind: "offer", playerId: c.playerId, amount: c.amount, position: need.position, result: res.ok ? "sent" : "failed", error: res.ok ? undefined : res.error });
      if (res.ok) return;
    }
  }

  // Šetrný trenér si tenký post radši vypůjčí (mladého hráče, který jinde nehraje).
  if (need.missing > 0 && club.profile.thrift >= 60) {
    const young = candidates.filter((c) => c.age <= 21 && !c.listingId).sort((a, b) => b.rating - a.rating)[0];
    if (young && !(await hasOpenOfferFor(db, young.playerId, club.teamId)) && await cooldownFree(db, young.playerId, club.teamId)) {
      const days = 30 + Math.floor(stableUnit(`loan-days|${club.teamId}|${young.playerId}`) * 31);
      if (mode === "shadow") {
        actions.push({ kind: "loan_request", playerId: young.playerId, amount: 0, position: need.position, result: "shadow" });
        return;
      }
      const res = await createTransferOffer(env, club.teamId, { playerId: young.playerId, amount: 0, offerType: "loan", loanDuration: days });
      actions.push({ kind: "loan_request", playerId: young.playerId, amount: 0, position: need.position, result: res.ok ? "sent" : "failed", error: res.ok ? undefined : res.error });
      if (res.ok) return;
    }
  }

  // Nic vhodného na trhu: poptávka (nejvýš jedna na post).
  const existing = await db.prepare("SELECT 1 AS x FROM transfer_demands WHERE team_id = ? AND position = ? AND status = 'active' AND expires_at > ? LIMIT 1")
    .bind(club.teamId, need.position, now.toISOString()).first<{ x: number }>()
    .catch((e) => { logger.warn({ module: M }, "vlastní poptávky", e); return null; });
  if (existing) return;
  const sampleValue = marketValue(need.minRating + 2, 25, need.position);
  const cap = floor1000(maxBuyPrice({ marketValue: sampleValue, need: need.need, profile: club.profile, playerId: `demand|${need.position}`, now, spendable: club.spendable }));
  if (cap < 1000) return;
  const input = {
    position: need.position, ageMin: 18, ageMax: need.missing > 0 ? 33 : 30,
    role: (need.missing > 0 ? "squad" : "starter") as "squad" | "starter",
    maxPrice: cap, note: null, minRating: need.minRating, skills: [],
  };
  if (mode === "shadow") {
    actions.push({ kind: "demand", position: need.position, amount: cap, result: "shadow" });
    return;
  }
  const { createDemand } = await import("../transfers/demands");
  const res = await createDemand(db, club.teamId, input)
    .catch((e) => { logger.warn({ module: M }, "založení poptávky", e); return { ok: false as const, error: String(e) }; });
  actions.push({ kind: "demand", position: need.position, amount: cap, demandId: res.ok ? res.id : undefined, result: res.ok ? "created" : "failed", error: res.ok ? undefined : res.error });
}

/** Pod minimem kádru: podepíše nejlepšího dostupného volného hráče na nejpotřebnější post. */
async function signFreeAgents(env: Bindings, club: AiClubState, now: Date, mode: DecisionMode, actions: MarketAction[]): Promise<void> {
  const emptyPosition = club.analysis.needs.find((n) => n.startersAverage === 0);
  if (club.analysis.seniorOwnCount >= SIGNING_SQUAD_THRESHOLD && !emptyPosition) return;
  if (club.overDealLimit || club.budget < FREE_AGENT_SIGNING_FEE + club.reserve / 4) return;
  if (!club.district) return;
  const agents = await findVisibleFreeAgents(env.DB, { id: club.teamId, district: club.district, userId: club.userId })
    .catch((e) => { logger.warn({ module: M }, "volní hráči", e); return [] as Record<string, unknown>[]; });
  const order = emptyPosition ? [emptyPosition.position] : club.analysis.needs.map((n) => n.position);
  const pick = order.map((pos) => agents.find((a) => a.position === pos)).find(Boolean)
    ?? (club.analysis.seniorOwnCount < SIGNING_SQUAD_THRESHOLD ? agents[0] : undefined);
  if (!pick) return;
  const baseWage = Number(pick.weekly_wage) || 50;
  // Ambiciózní trenér přidá na mzdě, ať hráč kývne.
  const wage = Math.round(baseWage * (1 + club.profile.ambition / 400));
  if (mode === "shadow") {
    actions.push({ kind: "sign_free_agent", playerId: pick.id as string, amount: wage, position: pick.position as string, result: "shadow" });
    return;
  }
  const res = await signFreeAgent(env, club.teamId, pick.id as string, wage);
  actions.push({
    kind: "sign_free_agent", playerId: pick.id as string, amount: wage, position: pick.position as string,
    result: res.ok ? (res.success ? "signed" : "refused") : "failed", error: res.ok ? undefined : res.error,
  });
}

/**
 * Denní práce AI klubu na trhu. Vrací, co klub udělal (v režimu shadow jen naplánoval).
 * Bez `ignoreSchedule` běží nejvýš jednou za den, v hodinu klubu a jen v některé dny.
 */
export async function runTransferMarket(env: Bindings, teamId: string, now: Date = new Date(), opts: RunOptions = {}): Promise<MarketResult> {
  const db = env.DB;
  const mode = await readCoachMode(env.CACHE_KV, "market");
  const profile = opts.profile ?? await ensureAiProfile(db, teamId);
  const club = await loadAiClubState(db, teamId, profile, now);
  if (!club) return { skipped: "not_ai_club", mode, actions: [] };

  if (!opts.ignoreSchedule) {
    if (pragueHour(now) < marketHour(teamId)) return { skipped: "not_yet", mode, actions: [] };
    const day = pragueDay(now);
    if (!(await claimCoachTask(db, teamId, "transfer_market", day))) return { skipped: "done_today", mode, actions: [] };
    if (stableUnit(`market-day|${teamId}|${day}`) >= marketDayChance(profile)) {
      return { skipped: "quiet_day", mode, actions: [] };
    }
  }

  const actions: MarketAction[] = [];
  const steps: Array<[string, () => Promise<void>]> = [
    ["free_agents", () => signFreeAgents(env, club, now, mode, actions)],
    ["list", () => listSurplus(env, club, now, mode, actions)],
    ["pitch", () => pitchSurplus(env, club, now, mode, actions)],
    ["buy", () => buyForNeed(env, club, now, mode, actions)],
  ];
  const errors: string[] = [];
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (e) {
      logger.error({ module: M }, `trh AI klubu ${teamId}: krok ${name}`, e);
      errors.push(`${name}: ${String(e)}`);
    }
  }

  await logDecision(db, {
    teamId, kind: "transfer_market", mode, model: "rules", contextRef: pragueDay(now),
    inputSummary: `budget=${club.budget} reserve=${club.reserve} spendable=${club.spendable} squad=${club.analysis.seniorOwnCount}`
      + ` deals30=${club.dealsLast30}/${club.dealLimit} needs=${club.analysis.needs.map((n) => `${n.position}:${n.need.toFixed(2)}`).join(",") || "-"}`,
    actions: actions.map(({ result: _r, error: _e, ...a }) => a),
    executed: actions.map((a) => ({ kind: a.kind, result: a.result, error: a.error })),
    usedFallback: false,
    error: errors.length > 0 ? errors.join("; ") : null,
  });
  return { skipped: null, mode, actions };
}

/** Hodinová část AI trenéra: trh (sám si hlídá, že poběží jednou denně v hodinu klubu). */
export const transferMarketHourlyHook: HourlyHook = async (env, teamId, profile, now) => {
  await runTransferMarket(env, teamId, now, { profile });
};
