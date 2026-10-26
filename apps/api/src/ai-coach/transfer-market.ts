/**
 * AI klub na přestupovém trhu (spec 3.7): prodává, co přebývá, a shání, co mu chybí.
 *
 * Jednou denně v hodinu, kterou má každý klub jinou (jako člověk, co se na trh podívá
 * po práci), a jen v některé dny podle obchodní aktivity:
 * - pod minimem kádru (nebo bez hráče na postu) podepíše volného hráče,
 * - dá na trh přebytečné hráče a nabídne je k cizím poptávkám (market-selling.ts),
 * - skauta bez práce pošle hledat posilu (outside-buy.ts),
 * - na nejslabší nebo nejtenčí post shání posilu: inzerát nebo přímá nabídka hráči v lize,
 *   jednání s klubem mimo hru (inzerát, hlášení skauta; outside-buy.ts), volný hráč, hostování,
 *   nebo poptávka.
 *
 * Model navrhuje, kód hlídá (buy-decision.ts, market-decision.ts, buy-model.ts): jestli a na jaký
 * post kupovat rozhoduje kód (potřeba, pondělní kurz, rezerva, limity) a kód sestaví přípustné
 * možnosti s mezemi. Model z nich vybere: koho podepsat a za jakou mzdu, koho vystavit a za kolik,
 * komu nabídnout hráče, kam poslat skauta, koho koupit a za kolik, jak dlouho si hráče půjčit.
 * Bez modelu (výpadek, režim off, neplatná odpověď, došel limit volání) platí dosavadní pravidla.
 *
 * Všechno přes stejné služby jako člověk. Limity: počet obchodů za měsíc a rozjetých
 * nabídek podle obchodní aktivity, rezerva na provoz podle šetrnosti. Obchody mezi
 * AI kluby jsou povolené, ale vzácné.
 */

import type { Bindings } from "../index";
import { marketValue } from "@okresni-masina/shared";
import { logger } from "../lib/logger";
import { createTransferOffer, FREE_AGENT_SIGNING_FEE, placeListingBid, signFreeAgent } from "../services/transfer-actions";
import { AI_SELLER } from "../transfers/ai-seller";
import type { DemandInput } from "../transfers/demands";
import { findVisibleFreeAgents, findVisibleListings } from "../transfers/market-visibility";
import { findTransferSearchPlayerRows } from "../transfers/player-search";
import {
  BUY_DEMAND, minimumBid,
  type BuyCandidateOption, type BuyLoanOption, type BuyPickContext, type BuyPickDecision,
} from "./buy-decision";
import {
  decideBuyPick, decideByModel, newMarketTrace, recordDecision, type DecidedBy, type MarketTrace, type ModelUse,
} from "./buy-model";
import { claimCoachTask } from "./claims";
import { logDecision, type DecisionMode } from "./decision-log";
import type { HourlyHook } from "./hourly-hooks";
import {
  emergencySigningSchema, hasScoutChoice, MARKET_SYSTEM_PROMPT, marketClubLine, renderEmergencySigningPrompt, renderScoutPrompt, SCOUT_AGE_BANDS,
  scoutAgeBandOf, scoutSchema, validateEmergencySigning, validateScout, wageBounds,
  type EmergencySigningContext, type EmergencySigningDecision, type ScoutContext, type ScoutDecision,
} from "./market-decision";
import { listSurplus, pitchSurplus } from "./market-selling";
import { readCoachMode } from "./mode";
import {
  affordableScoutRadii, loadScoutReportCandidates, loadScoutSituation, negotiateOutsidePurchase, outsideCandidateFromListing,
  SCOUT_TASK_WEEKS, scoutAgesFor, scoutRadiusFor, startScoutTask, type OutsideCandidate,
} from "./outside-buy";
import { ensureAiProfile, type AiCoachProfile } from "./profile";
import { MAX_SQUAD, SIGNING_SQUAD_THRESHOLD, TARGET_SENIOR_SQUAD, type PositionNeed } from "./squad";
import { loadAiClubState, pragueDay, pragueHour, type AiClubState } from "./transfer-club";
import { canOpenDeal, claimTask, openOutgoingOffers } from "./transfer-replies";
import { maxBuyPrice, openingBid, stableUnit } from "./valuation";

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
/** Potřeba postu, od které AI kupuje (bez přestupního kurzu i s kurzem „kupovat“). */
const BUY_NEED = 0.3;
/** Post, který trenér v pondělí určil k posílení: stačí menší potřeba. */
const FOCUS_NEED = 0.15;
/** S kurzem „držet“ nebo „prodávat“ kupuje jen na prázdné místo v základu (potřeba ≥ 0,65, squad.ts). */
const URGENT_NEED = 0.65;
/** Přestupní kurz z pondělní správy platí nejvýš tolik dní, pak trh jede bez něj. */
const PLAN_MAX_AGE_DAYS = 8;

/** Přestupní kurz, který trenér zvolil v pondělní správě (weekly-decision.ts). */
export interface WeeklyTransferPlan {
  stance: "buy" | "hold" | "sell";
  focus: string[];
  sellIds: string[];
}

/**
 * Kurz z poslední pondělní správy, která se opravdu provedla (ne nanečisto), nejvýš 8 dní
 * starý podle hodin hry (`actions.at`). Bez kurzu (nový klub, výpadek) trh rozhoduje jako dřív.
 */
export async function loadWeeklyTransferPlan(db: D1Database, teamId: string, now: Date): Promise<WeeklyTransferPlan | null> {
  const rows = await db.prepare(
    `SELECT CASE WHEN json_valid(actions) THEN json_extract(actions, '$.transferPlan') END AS plan,
            CASE WHEN json_valid(actions) THEN json_extract(actions, '$.at') END AS at
       FROM ai_coach_decisions
      WHERE team_id = ? AND kind = 'weekly' AND mode != 'shadow'
      ORDER BY created_at DESC LIMIT 3`,
  ).bind(teamId).all<{ plan: string | null; at: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `přestupní kurz klubu ${teamId}`, e); return { results: [] as { plan: string | null; at: string | null }[] }; });
  const since = new Date(now.getTime() - PLAN_MAX_AGE_DAYS * 86_400_000).toISOString();
  const row = rows.results.find((r) => r.plan && r.at && r.at >= since);
  if (!row?.plan) return null;
  try {
    const p = JSON.parse(row.plan) as Partial<WeeklyTransferPlan>;
    if (p.stance !== "buy" && p.stance !== "hold" && p.stance !== "sell") return null;
    return {
      stance: p.stance,
      focus: Array.isArray(p.focus) ? p.focus.filter((x): x is string => typeof x === "string") : [],
      sellIds: Array.isArray(p.sellIds) ? p.sellIds.filter((x): x is string => typeof x === "string") : [],
    };
  } catch (e) {
    logger.warn({ module: M }, `nečitelný přestupní kurz klubu ${teamId}`, e);
    return null;
  }
}

/** Od jaké potřeby AI na post kupuje podle kurzu (bez kurzu `BUY_NEED`). */
export function buyThreshold(position: string, plan: WeeklyTransferPlan | null): number {
  if (!plan) return BUY_NEED;
  if (plan.stance !== "buy") return URGENT_NEED;
  return plan.focus.includes(position) ? FOCUS_NEED : BUY_NEED;
}

export interface MarketAction {
  kind:
    | "list" | "pitch" | "offer" | "bid" | "loan_request" | "demand" | "sign_free_agent" | "outside_buy" | "scout_task"
    // Model rozhodl, že dnes nic: nekoupí, nevystaví, nenabídne, skauta nepošle.
    | "no_buy" | "no_list" | "no_pitch" | "no_scout";
  playerId?: string;
  listingId?: string;
  demandId?: string;
  amount?: number;
  /** Délka hostování (dny) u žádosti o hostování. */
  loanDays?: number;
  position?: string;
  /** Kdo o akci rozhodl: model, náhradní pravidlo, nebo kód (nebylo z čeho vybírat). */
  decidedBy?: DecidedBy;
  /** Zdůvodnění modelu (u pravidla „rules“). */
  reason?: string;
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
  /** Jiný model než COACH_MODEL (srovnání, admin). */
  model?: string;
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

/** Podíl meziligového poplatku, který kupující zaplatí navíc k ceně (0,2 = 20 %), podle ligy prodávajícího. */
async function adminFeeShare(db: D1Database, buyerLeagueId: string | null, sellerLeagueId: string | null, cache: Map<string, number>): Promise<number> {
  const key = sellerLeagueId ?? "-";
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const { computeTransferLevies } = await import("../competition/transfer-levy");
  const levies = await computeTransferLevies(db, { buyerLeagueId, sellerLeagueId, amount: 100_000, isLoan: false })
    .catch((e) => { logger.warn({ module: M }, "poplatky z přestupu", e); return null; });
  const share = levies ? levies.adminFee / 100_000 : 0;
  cache.set(key, share);
  return share;
}

interface BuyCandidate {
  playerId: string;
  teamId: string;
  leagueId: string | null;
  rating: number;
  age: number;
  position: string;
  marketValue: number;
  listingId: string | null;
  askingPrice: number | null;
  sellerIsAi: boolean;
  /** Hráč klubu mimo hru (inzerát nebo hlášení skauta): kupuje se jednáním, ne nabídkou. */
  outside?: OutsideCandidate;
}

/** Kandidáti na post: inzeráty klubů ve hře a hráči soupeřů v lize (bez vlastních a hostujících). */
async function buyCandidates(env: Bindings, club: AiClubState, need: PositionNeed, now: Date): Promise<BuyCandidate[]> {
  const db = env.DB;
  const out = new Map<string, BuyCandidate>();
  if (club.leagueId) {
    const listings = await findVisibleListings(db, { id: club.teamId, leagueId: club.leagueId })
      .catch((e) => { logger.warn({ module: M }, "inzeráty pro nákup", e); return [] as Record<string, unknown>[]; });
    for (const l of listings) {
      if (l.is_ai_listing) {
        // Inzerát klubu mimo hru: vidí ho jen jeho liga, kupuje se jednáním jako u člověka.
        const o = outsideCandidateFromListing(l);
        if (o && o.position === need.position && o.rating >= need.minRating) {
          out.set(`outside:${o.sourceId}`, {
            playerId: `outside:${o.sourceId}`, teamId: "", leagueId: null, rating: o.rating, age: o.age, position: o.position,
            marketValue: marketValue(o.rating, o.age, o.position), listingId: null, askingPrice: o.askingPrice, sellerIsAi: false, outside: o,
          });
        }
        continue;
      }
      if (!l.player_id || l.position !== need.position) continue;
      const rating = Number(l.overall_rating) || 0;
      if (rating < need.minRating) continue;
      out.set(l.player_id as string, {
        playerId: l.player_id as string, teamId: l.team_id as string, leagueId: (l.league_id as string | null) ?? null,
        rating, age: Number(l.age) || 25, position: l.position as string,
        marketValue: marketValue(rating, Number(l.age) || 25, l.position as string),
        listingId: l.id as string, askingPrice: Number(l.asking_price) || null, sellerIsAi: l.team_user_id === "ai",
      });
    }
    const rows = await findTransferSearchPlayerRows(db, club.leagueId, club.teamId)
      .catch((e) => { logger.warn({ module: M }, "hledání hráčů pro nákup", e); return []; });
    const fitting = rows.filter((r) => r.position === need.position && r.overall_rating >= need.minRating && !out.has(r.id));
    const teamIds = Array.from(new Set(fitting.map((r) => r.team_id)));
    const owners = new Map<string, { userId: string | null; leagueId: string | null }>();
    for (let i = 0; i < teamIds.length; i += 90) {
      const chunk = teamIds.slice(i, i + 90);
      const res = await db.prepare(`SELECT id, user_id, league_id FROM teams WHERE id IN (${chunk.map(() => "?").join(",")})`)
        .bind(...chunk).all<{ id: string; user_id: string | null; league_id: string | null }>()
        .catch((e) => { logger.warn({ module: M }, "majitelé klubů kandidátů", e); return { results: [] as { id: string; user_id: string | null; league_id: string | null }[] }; });
      for (const r of res.results) owners.set(r.id, { userId: r.user_id, leagueId: r.league_id });
    }
    for (const r of fitting) {
      out.set(r.id, {
        playerId: r.id, teamId: r.team_id, leagueId: owners.get(r.team_id)?.leagueId ?? null,
        rating: r.overall_rating, age: r.age, position: r.position,
        marketValue: marketValue(r.overall_rating, r.age, r.position), listingId: null, askingPrice: null,
        sellerIsAi: owners.get(r.team_id)?.userId === "ai",
      });
    }
  }
  // Hlášení vlastního skauta o hráčích klubů mimo hru (střed odhadu, jak ho vidí i člověk).
  for (const o of await loadScoutReportCandidates(db, club.teamId, now)) {
    if (o.position !== need.position || o.rating < need.minRating) continue;
    out.set(`outside:${o.sourceId}`, {
      playerId: `outside:${o.sourceId}`, teamId: "", leagueId: null, rating: o.rating, age: o.age, position: o.position,
      marketValue: marketValue(o.rating, o.age, o.position), listingId: null, askingPrice: o.askingPrice, sellerIsAi: false, outside: o,
    });
  }
  // Obchody mezi AI kluby jsou vzácné: hráče jiného AI klubu AI zvažuje jen některé dny.
  const aiDay = stableUnit(`ai-to-ai|${club.teamId}|${pragueDay(now)}`) < AI_TO_AI_CHANCE;
  return Array.from(out.values()).filter((c) => aiDay || !c.sellerIsAi);
}

/** Kandidát s cenou podle pravidla: strop, úvodní nabídka a meziligový poplatek. */
type PricedCandidate = BuyCandidate & { maxPrice: number; amount: number; feeShare: number };

/** Kolik hráčů na přestup, volných hráčů a hostování model nejvýš uvidí. */
const MAX_SHORTLIST = 6;
const MAX_FREE_AGENT_OPTIONS = 2;
const MAX_LOAN_OPTIONS = 2;
/** Kolikrát se trenér za den nejvýš zeptá modelu (po nevydařeném pokusu zkusí jinou možnost). */
const MAX_MODEL_PICKS = 3;
/**
 * Volání modelu za běh trhu dohromady (nouzový podpis, inzeráty, nabídka k poptávce, skaut,
 * výběr i tahy v jednání). Jedno trvá až desítky sekund a hodinová úloha ve frontě obsluhuje
 * i odpovědi na nabídky a přáteláky, proto strop; po vyčerpání dokončí den pravidlo.
 */
const MAX_MODEL_CALLS_PER_RUN = 8;
/** Kroky pravidla: pokusy o koupi, pak hostování a poptávka. */
const MAX_PICK_STEPS = MAX_OFFER_ATTEMPTS + 2;
/** Kolik volných hráčů model nejvýš uvidí při nouzovém podpisu. */
const MAX_EMERGENCY_AGENTS = 6;
const DAY_MS = 86_400_000;

/** Možnost z užšího výběru: co vidí model a co potřebuje kód k provedení. */
interface ShortlistEntry {
  option: BuyCandidateOption;
  /** Kandidát na přestup, u volného hráče null. */
  cand: PricedCandidate | null;
  freeAgentId: string | null;
  /** Částka podle pravidla (u volného hráče týdenní mzda). */
  ruleBid: number;
  /** Pořadí podle pravidla; volné hráče pravidlo při potřebě nebere (null). */
  ruleRank: number | null;
}

interface LoanEntry {
  option: BuyLoanOption;
  playerId: string;
}

interface DemandEntry {
  cap: number;
  input: DemandInput;
}

interface BuyOptions {
  shortlist: ShortlistEntry[];
  loans: LoanEntry[];
  /** Hostování, které by zvolilo pravidlo (šetrný trenér na tenký post), nebo null. */
  ruleLoan: LoanEntry | null;
  demand: DemandEntry | null;
}

/** Mzda, kterou volnému hráči nabídne pravidlo: ambiciózní trenér přidá, ať hráč kývne. */
function freeAgentWage(baseWage: number, profile: AiCoachProfile): number {
  return Math.round(baseWage * (1 + profile.ambition / 400));
}

function loanDays(teamId: string, playerId: string): number {
  return 30 + Math.floor(stableUnit(`loan-days|${teamId}|${playerId}`) * 31);
}

/** Ceny kandidátů podle pravidla (strop, úvodní nabídka) v pořadí, v jakém by je pravidlo zkoušelo. */
async function priceCandidates(db: D1Database, club: AiClubState, need: PositionNeed, candidates: BuyCandidate[], now: Date): Promise<PricedCandidate[]> {
  const priced: PricedCandidate[] = [];
  const feeShares = new Map<string, number>();
  for (const c of candidates) {
    const feeShare = await adminFeeShare(db, club.leagueId, c.leagueId, feeShares);
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
    priced.push({ ...c, maxPrice, amount, feeShare });
  }
  // Hlášení vlastního skauta první (je to jeho práce na hledaný post a za deset dní propadne),
  // pak nejvíc kvality za peníze; při shodě lepší hráč.
  const ownReport = (c: BuyCandidate) => Number(c.outside?.source === "scout_report");
  priced.sort((a, b) => (ownReport(b) - ownReport(a))
    || ((b.rating - need.minRating + 1) / b.amount) - ((a.rating - need.minRating + 1) / a.amount)
    || b.rating - a.rating);
  return priced;
}

/** Na hráče klubu ve hře jde nabídnout: žádná rozjetá nabídka, pauza po odmítnutí ani propojené kluby. */
async function inGameCandidateOpen(db: D1Database, clubTeamId: string, c: BuyCandidate): Promise<boolean> {
  if (await hasOpenOfferFor(db, c.playerId, clubTeamId)) return false;
  if (!(await cooldownFree(db, c.playerId, clubTeamId))) return false;
  // Propojeným klubům služba nabídku nepustí; model je proto vůbec nevidí. Při chybě rozhodne služba.
  const { areClubsLinked } = await import("../competition/club-links");
  const linked = await areClubsLinked(db, clubTeamId, c.teamId)
    .catch((e) => { logger.warn({ module: M }, `propojení s klubem ${c.teamId}`, e); return false; });
  return !linked;
}

/** S klubem mimo hru jde jednat: o hráči neběží jednání a klub ho v posledních dvou týdnech neukončil. */
async function outsideCandidateOpen(db: D1Database, clubTeamId: string, o: OutsideCandidate, now: Date): Promise<boolean> {
  const column = o.source === "listing" ? "listing_id" : "scout_report_id";
  const since = new Date(now.getTime() - AI_SELLER.breakOffCooldownDays * DAY_MS).toISOString();
  const row = await db.prepare(
    `SELECT 1 AS x FROM ai_negotiations WHERE team_id = ? AND ${column} = ?
       AND (status IN ('open', 'agreed') OR (status = 'broken_off' AND resolved_at > ?)) LIMIT 1`,
  ).bind(clubTeamId, o.sourceId, since).first<{ x: number }>()
    .catch((e) => { logger.warn({ module: M }, `jednání o hráči ${o.sourceId}`, e); return null; });
  return !row;
}

/** Poptávka na post, když na něj žádná neběží a strop ceny dává smysl, jinak null. */
async function demandOption(db: D1Database, club: AiClubState, need: PositionNeed, now: Date): Promise<DemandEntry | null> {
  const existing = await db.prepare("SELECT 1 AS x FROM transfer_demands WHERE team_id = ? AND position = ? AND status = 'active' AND expires_at > ? LIMIT 1")
    .bind(club.teamId, need.position, now.toISOString()).first<{ x: number }>()
    .catch((e) => { logger.warn({ module: M }, "vlastní poptávky", e); return null; });
  if (existing) return null;
  const sampleValue = marketValue(need.minRating + 2, 25, need.position);
  const cap = floor1000(maxBuyPrice({ marketValue: sampleValue, need: need.need, profile: club.profile, playerId: `demand|${need.position}`, now, spendable: club.spendable }));
  if (cap < 1000) return null;
  return {
    cap,
    input: {
      position: need.position, ageMin: 18, ageMax: need.missing > 0 ? 33 : 30, role: need.missing > 0 ? "squad" : "starter",
      maxPrice: cap, note: null, minRating: need.minRating, skills: [],
    },
  };
}

/**
 * Užší výběr pro model: kandidáti na přestup v pořadí pravidla (jen ti, na které jde nabídnout),
 * volní hráči na post, hostování mladých hráčů na tenký post a poptávka, když na post neběží.
 * Rozpětí nabídky počítá kód: strop `maxBuyPrice` (u inzerátu nanejvýš cena z inzerátu),
 * dole 70 % ceny; nabídka pravidla do rozpětí vždycky patří.
 */
async function buildBuyOptions(
  env: Bindings, club: AiClubState, need: PositionNeed, candidates: BuyCandidate[], priced: PricedCandidate[], now: Date,
): Promise<BuyOptions> {
  const db = env.DB;
  const shortlist: ShortlistEntry[] = [];
  for (const c of priced) {
    if (shortlist.length >= MAX_SHORTLIST) break;
    const open = c.outside ? await outsideCandidateOpen(db, club.teamId, c.outside, now) : await inGameCandidateOpen(db, club.teamId, c);
    if (!open) continue;
    const listed = c.listingId || c.outside?.source === "listing" ? c.askingPrice : null;
    shortlist.push({
      option: {
        key: `c${shortlist.length + 1}`,
        route: c.outside ? (c.outside.source === "listing" ? "outside_listing" : "scout_report") : c.listingId ? "listing" : "offer",
        seller: c.outside ? "outside" : c.sellerIsAi ? "ai" : "human",
        position: c.position, age: c.age, rating: c.rating, ratingRange: c.outside?.ratingRange ?? null,
        estimatedValue: c.marketValue, askingPrice: c.askingPrice, feePct: Math.round(c.feeShare * 100),
        minBid: minimumBid({ estimatedValue: c.marketValue, listedPrice: listed, ruleBid: c.amount }),
        maxBid: listed ? Math.min(c.maxPrice, listed) : c.maxPrice,
      },
      cand: c, freeAgentId: null, ruleBid: c.amount, ruleRank: shortlist.length,
    });
  }

  // Volní hráči na post: bez odstupného, jen registrace a mzda.
  if (club.district && !club.overDealLimit && club.spendable >= FREE_AGENT_SIGNING_FEE) {
    const agents = await findVisibleFreeAgents(db, { id: club.teamId, district: club.district, userId: club.userId })
      .catch((e) => { logger.warn({ module: M }, "volní hráči pro nákup", e); return [] as Record<string, unknown>[]; });
    let added = 0;
    for (const a of agents) {
      if (added >= MAX_FREE_AGENT_OPTIONS) break;
      const rating = Number(a.overall_rating) || 0;
      if (a.position !== need.position || rating < need.minRating || typeof a.id !== "string") continue;
      const age = Number(a.age) || 25;
      const askWage = Number(a.weekly_wage) || 50;
      shortlist.push({
        option: {
          key: `c${shortlist.length + 1}`, route: "free_agent", seller: "none", position: need.position, age, rating, ratingRange: null,
          estimatedValue: marketValue(rating, age, need.position), askingPrice: askWage, feePct: 0,
          minBid: wageBounds(askWage).minWage, maxBid: wageBounds(askWage).maxWage,
        },
        cand: null, freeAgentId: a.id, ruleBid: freeAgentWage(askWage, club.profile), ruleRank: null,
      });
      added++;
    }
  }

  // Hostování: mladý hráč klubu ve hře na tenký post (bez poplatku, délku volí model z `LOAN_DURATIONS`).
  const loans: LoanEntry[] = [];
  if (need.missing > 0) {
    const young = candidates.filter((c) => c.age <= 21 && !c.listingId && !c.outside).sort((a, b) => b.rating - a.rating);
    for (const c of young) {
      if (loans.length >= MAX_LOAN_OPTIONS) break;
      if (!(await inGameCandidateOpen(db, club.teamId, c))) continue;
      loans.push({
        option: { key: `l${loans.length + 1}`, seller: c.sellerIsAi ? "ai" : "human", position: c.position, age: c.age, rating: c.rating },
        playerId: c.playerId,
      });
    }
  }
  // Pravidlo si půjčuje jen nejlepšího mladého ze všech kandidátů, a jen když na něj jde poslat žádost.
  const bestYoung = candidates.filter((c) => c.age <= 21 && !c.listingId).sort((a, b) => b.rating - a.rating)[0];
  const ruleLoan = bestYoung ? loans.find((l) => l.playerId === bestYoung.playerId) ?? null : null;

  return { shortlist, loans, ruleLoan, demand: await demandOption(db, club, need, now) };
}

/** Co model vidí v daném kroku: bez vyzkoušených možností, po třech pokusech o koupi už bez hráčů. */
function pickContext(
  club: AiClubState, need: PositionNeed, plan: WeeklyTransferPlan | null, options: BuyOptions,
  tried: Set<string>, triedLines: string[], buyAttempts: number,
): BuyPickContext {
  return {
    teamName: club.name, profile: club.profile, budget: club.budget, reserve: club.reserve, spendable: club.spendable,
    squadSize: club.analysis.seniorOwnCount, targetSquad: TARGET_SENIOR_SQUAD, strength: club.analysis.top11Average,
    need: { position: need.position, need: need.need, missing: need.missing, minRating: need.minRating, startersAverage: need.startersAverage, upgrade: need.upgrade },
    course: plan ? { stance: plan.stance, focus: plan.focus } : null,
    candidates: buyAttempts < MAX_OFFER_ATTEMPTS ? options.shortlist.filter((e) => !tried.has(e.option.key)).map((e) => e.option) : [],
    loans: options.loans.filter((l) => !tried.has(l.option.key)).map((l) => l.option),
    demand: options.demand && !tried.has(BUY_DEMAND)
      ? { maxPrice: options.demand.cap, ageMin: options.demand.input.ageMin, ageMax: options.demand.input.ageMax }
      : null,
    tried: [...triedLines],
  };
}

/**
 * Náhradní pravidlo (bez modelu): kandidáti v pořadí kódu za částku pravidla, pak si šetrný
 * trenér na tenký post půjčí mladého hráče (30 až 60 dní, pevně pro hráče), jinak poptávka.
 * Volné hráče pravidlo při potřebě nebere.
 */
function rulePick(ctx: BuyPickContext, options: BuyOptions, club: AiClubState, need: PositionNeed): BuyPickDecision {
  const open = new Set(ctx.candidates.map((c) => c.key));
  const next = options.shortlist.find((e) => e.ruleRank !== null && open.has(e.option.key));
  if (next) return { kind: "buy", key: next.option.key, bid: next.ruleBid, reason: "rules" };
  const loan = options.ruleLoan;
  if (need.missing > 0 && club.profile.thrift >= 60 && loan && ctx.loans.some((l) => l.key === loan.option.key)) {
    return { kind: "loan", key: loan.option.key, days: loanDays(club.teamId, loan.playerId), reason: "rules" };
  }
  if (ctx.demand) return { kind: "demand", reason: "rules" };
  return { kind: "none", reason: "rules" };
}

/** Akce do deníku pro rozhodnutí nanečisto (nic se neprovede). */
function shadowAction(d: BuyPickDecision, options: BuyOptions, position: string, by: DecidedBy): MarketAction {
  const meta = { position, decidedBy: by, reason: d.reason, result: "shadow" };
  if (d.kind === "demand") return { kind: "demand", amount: options.demand?.cap, ...meta };
  if (d.kind === "loan") {
    return { kind: "loan_request", playerId: options.loans.find((l) => l.option.key === d.key)?.playerId, amount: 0, loanDays: d.days, ...meta };
  }
  const entry = d.kind === "buy" ? options.shortlist.find((e) => e.option.key === d.key) : undefined;
  if (!entry || d.kind !== "buy") return { kind: "no_buy", ...meta };
  if (!entry.cand) return { kind: "sign_free_agent", playerId: entry.freeAgentId ?? undefined, amount: d.bid, ...meta };
  const c = entry.cand;
  return { kind: c.outside ? "outside_buy" : c.listingId ? "bid" : "offer", playerId: c.playerId, listingId: c.listingId ?? undefined, amount: d.bid, ...meta };
}

const OUTSIDE_RESULT_TEXT: Record<string, string> = {
  refused: "the club agreed, but the player refused to join",
  broken_off: "the club broke off the talks",
  too_expensive: "you withdrew from the talks",
  failed: "the talks could not go on",
};

/**
 * Provede vybranou možnost stejnou službou jako člověk. `done` = obchod je rozjetý nebo hotový
 * (nebo poptávka), jinak `tried` popíše pro model, co nevyšlo.
 */
async function executeBuyPick(
  env: Bindings, club: AiClubState, need: PositionNeed, now: Date, mode: DecisionMode, use: ModelUse, options: BuyOptions,
  d: BuyPickDecision, by: DecidedBy, actions: MarketAction[],
): Promise<{ done: boolean; tried?: string }> {
  const db = env.DB;
  const meta = { position: need.position, decidedBy: by, reason: d.reason };
  if (d.kind === "none") return { done: true };
  if (d.kind === "demand") {
    const demand = options.demand;
    if (!demand) return { done: true };
    const { createDemand } = await import("../transfers/demands");
    const res = await createDemand(db, club.teamId, demand.input)
      .catch((e) => { logger.warn({ module: M }, "založení poptávky", e); return { ok: false as const, error: String(e) }; });
    actions.push({ kind: "demand", amount: demand.cap, demandId: res.ok ? res.id : undefined, ...meta, result: res.ok ? "created" : "failed", error: res.ok ? undefined : res.error });
    return { done: true };
  }
  if (d.kind === "loan") {
    const loan = options.loans.find((l) => l.option.key === d.key);
    if (!loan) return { done: false };
    const res = await createTransferOffer(env, club.teamId, { playerId: loan.playerId, amount: 0, offerType: "loan", loanDuration: d.days });
    actions.push({
      kind: "loan_request", playerId: loan.playerId, amount: 0, loanDays: d.days, ...meta,
      result: res.ok ? "sent" : "failed", error: res.ok ? undefined : res.error,
    });
    return res.ok ? { done: true } : { done: false, tried: `"${d.key}" (loan of a ${loan.option.position} aged ${loan.option.age}): the request could not be sent` };
  }
  const entry = options.shortlist.find((e) => e.option.key === d.key);
  if (!entry) return { done: false };
  const label = `"${d.key}" (${entry.option.position}, age ${entry.option.age}, rating ${entry.option.rating})`;
  if (!entry.cand) {
    const res = await signFreeAgent(env, club.teamId, entry.freeAgentId ?? "", d.bid);
    const result = res.ok ? (res.success ? "signed" : "refused") : "failed";
    actions.push({ kind: "sign_free_agent", playerId: entry.freeAgentId ?? undefined, amount: d.bid, ...meta, result, error: res.ok ? undefined : res.error });
    if (result === "signed") return { done: true };
    return { done: false, tried: `${label}: ${result === "refused" ? "the player refused your wage offer" : "the signing could not be done"}` };
  }
  const c = entry.cand;
  if (c.outside) {
    const res = await negotiateOutsidePurchase(db, club, c.outside, d.bid, c.maxPrice, now, { ...use, mode });
    actions.push({
      kind: "outside_buy", playerId: c.playerId, amount: res.result === "signed" ? res.amount : d.bid, ...meta,
      result: res.result, error: res.result === "signed" ? undefined : res.detail,
    });
    if (res.result === "signed") return { done: true };
    return { done: false, tried: `${label}: ${OUTSIDE_RESULT_TEXT[res.result] ?? "no deal"}` };
  }
  if (c.listingId) {
    const res = await placeListingBid(env, club.teamId, c.listingId, { amount: d.bid });
    actions.push({ kind: "bid", playerId: c.playerId, listingId: c.listingId, amount: d.bid, ...meta, result: res.ok ? "sent" : "failed", error: res.ok ? undefined : res.error });
    return res.ok ? { done: true } : { done: false, tried: `${label}: the bid could not be sent` };
  }
  const res = await createTransferOffer(env, club.teamId, { playerId: c.playerId, amount: d.bid });
  actions.push({ kind: "offer", playerId: c.playerId, amount: d.bid, ...meta, result: res.ok ? "sent" : "failed", error: res.ok ? undefined : res.error });
  return res.ok ? { done: true } : { done: false, tried: `${label}: the offer could not be sent` };
}

/**
 * Skaut bez práce vyjede po klubech mimo hru hned, jak je díra v kádru (jako u člověka), nabídky
 * klubům ve hře jdou vedle toho; hlášení pak přijdou jako další kandidáti. Kód nabídne posty, kde
 * klub posilu hledá a žádný skaut na nich nejede, okruhy, na které jsou peníze nad rezervou,
 * a pásma věku. Jestli, kam a koho hledat, vybere model; bez něj pravidlo (nejpotřebnější post,
 * okruh a věk podle povahy).
 */
async function scoutForNeeds(
  env: Bindings, club: AiClubState, needs: PositionNeed[], now: Date, mode: DecisionMode, actions: MarketAction[],
  plan: WeeklyTransferPlan | null, trace: MarketTrace, use: ModelUse,
): Promise<void> {
  const db = env.DB;
  const loaded = await loadScoutSituation(db, club.teamId);
  if (!loaded.ok) return;
  const scoutId = loaded.situation.freeScoutId;
  if (!scoutId) return;
  const busy = loaded.situation.busy;
  const ctx: ScoutContext = {
    ...marketClubLine(club, plan, TARGET_SENIOR_SQUAD), weeks: SCOUT_TASK_WEEKS,
    positions: needs.filter((n) => !busy.has(n.position)).map((n) => ({ position: n.position, need: n.need, missing: n.missing })),
    radii: affordableScoutRadii(club.spendable), busy: [...busy],
  };
  if (!hasScoutChoice(ctx)) return;
  const rule = (): ScoutDecision => {
    const position = needs[0]?.position;
    const radiusKm = scoutRadiusFor(club.profile);
    const ages = scoutAgeBandOf(scoutAgesFor(club.profile));
    if (!position || busy.has(position) || !ctx.radii.some((r) => r.km === radiusKm) || !ages) return { send: false, reason: "rules" };
    return { send: true, position, radiusKm, ages, reason: "rules" };
  };
  const decided = await decideByModel({
    name: "scout_task", system: MARKET_SYSTEM_PROMPT, maxTokens: 300,
    prompt: () => renderScoutPrompt(ctx), schema: () => scoutSchema(ctx), validate: (raw) => validateScout(raw, ctx), rule,
  }, use);
  recordDecision(trace, "skaut", decided.by, decided.trace);
  const d = decided.decision;
  const meta = { decidedBy: decided.by, reason: d.reason };
  if (!d.send) {
    if (decided.by === "model") actions.push({ kind: "no_scout", ...meta, result: "none" });
    return;
  }
  if (mode === "shadow") {
    actions.push({ kind: "scout_task", position: d.position, amount: d.radiusKm, ...meta, result: "shadow" });
    return;
  }
  const band = SCOUT_AGE_BANDS.find((b) => b.key === d.ages) ?? SCOUT_AGE_BANDS[1];
  const team = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(club.teamId).first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "herní datum pro skauta", e); return null; });
  const res = await startScoutTask(db, club.teamId, scoutId, { position: d.position, radiusKm: d.radiusKm, ageMin: band.ageMin, ageMax: band.ageMax },
    (team?.game_date ?? now.toISOString()).slice(0, 10));
  actions.push({
    kind: "scout_task", position: d.position, amount: d.radiusKm, ...meta,
    result: res.started ? "started" : "failed", error: res.started ? undefined : res.reason,
  });
}

/**
 * Na nejpotřebnější post shání posilu. Jestli a na jaký post, rozhoduje kód: pondělní kurz určuje,
 * od jaké potřeby a na které posty nejdřív (`buyThreshold`), k tomu rezerva a limity obchodů.
 * Koho a za kolik vybere model z užšího výběru (bez modelu pravidlo). Když pokus nevyjde (klub
 * jednání ukončil, hráč odmítl, služba nabídku nepustila), trenér zkusí jinou možnost, nejvýš
 * `MAX_MODEL_PICKS` rozhodnutí modelu za den. Po výpadku modelu dokončí den pravidlo.
 */
async function buyForNeed(
  env: Bindings, club: AiClubState, now: Date, mode: DecisionMode, actions: MarketAction[], plan: WeeklyTransferPlan | null,
  trace: MarketTrace, use: ModelUse,
): Promise<void> {
  const db = env.DB;
  if (club.analysis.seniorOwnCount >= MAX_SQUAD - 1 || club.spendable <= 0) return;
  const focus = plan?.stance === "buy" ? plan.focus : [];
  const needs = [...club.analysis.needs]
    .sort((a, b) => (Number(focus.includes(b.position)) - Number(focus.includes(a.position))) || (b.need - a.need))
    // Zlepšení základu jde i s kurzem „držet“ nebo „prodávat“: koupit, nebo nic, rozhodne model.
    .filter((n) => n.need >= (n.upgrade ? BUY_NEED : buyThreshold(n.position, plan)));
  const need = needs[0];
  if (!need) return;

  await scoutForNeeds(env, club, needs, now, mode, actions, plan, trace, use);

  if (!canOpenDeal(club, await openOutgoingOffers(db, club.teamId))) return;
  const candidates = await buyCandidates(env, club, need, now);
  const priced = await priceCandidates(db, club, need, candidates, now);
  const options = await buildBuyOptions(env, club, need, candidates, priced, now);

  const tried = new Set<string>();
  const triedLines: string[] = [];
  let buyAttempts = 0;
  let modelPicks = 0;
  let modelOk = use.useModel && !!use.ai?.AI;
  for (let step = 0; step < MAX_PICK_STEPS; step++) {
    if (modelOk && modelPicks >= MAX_MODEL_PICKS) return;
    const ctx = pickContext(club, need, plan, options, tried, triedLines, buyAttempts);
    const decided = await decideBuyPick(ctx, () => rulePick(ctx, options, club, need), { ...use, useModel: modelOk });
    // Kromě „nic“ nebylo z čeho vybírat.
    if (decided.by === "guard") return;
    recordDecision(trace, "výběr", decided.by, decided.trace);
    if (decided.trace.model) modelPicks++;
    if (decided.by === "fallback") modelOk = false;
    const d = decided.decision;
    if (d.kind === "none") {
      // Pravidlo končí „nic“ jen tehdy, když mu došly možnosti; zápis má smysl jen u modelu.
      if (decided.by === "model") actions.push({ kind: "no_buy", position: need.position, decidedBy: decided.by, reason: d.reason, result: "none" });
      return;
    }
    if (mode === "shadow") {
      actions.push(shadowAction(d, options, need.position, decided.by));
      return;
    }
    const res = await executeBuyPick(env, club, need, now, mode, { ...use, useModel: modelOk }, options, d, decided.by, actions);
    if (res.done) return;
    tried.add(d.kind === "buy" || d.kind === "loan" ? d.key : BUY_DEMAND);
    if (res.tried) triedLines.push(res.tried);
    if (d.kind === "buy") buyAttempts++;
  }
}

/**
 * Pod minimem kádru (nebo když na postu nikdo není) musí klub podepsat volného hráče: to hlídá
 * kód, stejně jako peníze na registraci a limit obchodů. Kterého a za jakou mzdu (od toho, co hráč
 * chce, nejvýš o čtvrtinu víc) vybere model; bez něj pravidlo: nejlepší hráč na prázdný nebo
 * nejpotřebnější post, ambiciózní trenér přidá na mzdě.
 */
async function signFreeAgents(
  env: Bindings, club: AiClubState, now: Date, mode: DecisionMode, actions: MarketAction[], plan: WeeklyTransferPlan | null,
  trace: MarketTrace, use: ModelUse,
): Promise<void> {
  const emptyPosition = club.analysis.needs.find((n) => n.startersAverage === 0);
  const belowMinimum = club.analysis.seniorOwnCount < SIGNING_SQUAD_THRESHOLD;
  if (!belowMinimum && !emptyPosition) return;
  if (club.overDealLimit || club.budget < FREE_AGENT_SIGNING_FEE + club.reserve / 4) return;
  if (!club.district) return;
  const agents = await findVisibleFreeAgents(env.DB, { id: club.teamId, district: club.district, userId: club.userId })
    .catch((e) => { logger.warn({ module: M }, "volní hráči", e); return [] as Record<string, unknown>[]; });
  // Pořadí pravidla: prázdný post, jinak posty podle potřeby; pod minimem kádru pak kdokoli.
  // Volní hráči jsou seřazení od nejlepšího, takže první je hráč, kterého by vzalo pravidlo.
  const order = emptyPosition ? [emptyPosition.position] : club.analysis.needs.map((n) => n.position);
  const preferred = order.flatMap((pos) => agents.filter((a) => a.position === pos));
  const pool = [...preferred, ...(belowMinimum ? agents.filter((a) => !preferred.includes(a)) : [])]
    .filter((a) => typeof a.id === "string").slice(0, MAX_EMERGENCY_AGENTS);
  if (pool.length === 0) return;

  const options = pool.map((a, i) => {
    const askWage = Number(a.weekly_wage) || 50;
    return {
      key: `a${i + 1}`, position: String(a.position), age: Number(a.age) || 25, rating: Number(a.overall_rating) || 0, askWage, ...wageBounds(askWage),
    };
  });
  const ctx: EmergencySigningContext = {
    ...marketClubLine(club, plan, TARGET_SENIOR_SQUAD), minSquad: SIGNING_SQUAD_THRESHOLD, emptyPosition: emptyPosition?.position ?? null,
    needs: club.analysis.needs.map((n) => ({ position: n.position, need: n.need, missing: n.missing })), agents: options,
  };
  const rule = (): EmergencySigningDecision => ({ key: options[0].key, wage: freeAgentWage(options[0].askWage, club.profile), reason: "rules" });
  const decided = await decideByModel({
    name: "emergency_signing", system: MARKET_SYSTEM_PROMPT, maxTokens: 300,
    prompt: () => renderEmergencySigningPrompt(ctx), schema: () => emergencySigningSchema(ctx),
    validate: (raw) => validateEmergencySigning(raw, ctx), rule,
  }, use);
  recordDecision(trace, "volný hráč", decided.by, decided.trace);
  const d = decided.decision;
  const pick = pool[options.findIndex((o) => o.key === d.key)];
  if (!pick) return;
  const base = {
    kind: "sign_free_agent" as const, playerId: pick.id as string, amount: d.wage, position: pick.position as string,
    decidedBy: decided.by, reason: d.reason,
  };
  if (mode === "shadow") {
    actions.push({ ...base, result: "shadow" });
    return;
  }
  const res = await signFreeAgent(env, club.teamId, pick.id as string, d.wage);
  actions.push({ ...base, result: res.ok ? (res.success ? "signed" : "refused") : "failed", error: res.ok ? undefined : res.error });
}

/**
 * Denní práce AI klubu na trhu. Vrací, co klub udělal (v režimu shadow jen naplánoval).
 * Bez `ignoreSchedule` běží nejvýš jednou za den, v hodinu klubu a jen v některé dny.
 *
 * Režim přepínače `market`: `on` rozhoduje model a provádí se, `shadow` model rozhodne a zapíše
 * do deníku, ale nic neprovede, `off` rozhoduje jen pravidlo. Model je binding `env.AI`.
 */
export async function runTransferMarket(env: Bindings, teamId: string, now: Date = new Date(), opts: RunOptions = {}): Promise<MarketResult> {
  const db = env.DB;
  const mode = await readCoachMode(env.CACHE_KV, "market");
  // Hodinová úloha běží u každého klubu: rozvrh se pozná bez načítání kádru.
  const team = await db.prepare("SELECT user_id, parent_team_id FROM teams WHERE id = ?").bind(teamId)
    .first<{ user_id: string; parent_team_id: string | null }>();
  if (!team || team.user_id !== "ai" || team.parent_team_id) return { skipped: "not_ai_club", mode, actions: [] };
  if (!opts.ignoreSchedule && pragueHour(now) < marketHour(teamId)) return { skipped: "not_yet", mode, actions: [] };

  const profile = opts.profile ?? await ensureAiProfile(db, teamId);
  if (!opts.ignoreSchedule) {
    const day = pragueDay(now);
    if (!(await claimCoachTask(db, teamId, claimTask(mode, "transfer_market"), day))) return { skipped: "done_today", mode, actions: [] };
    if (stableUnit(`market-day|${teamId}|${day}`) >= marketDayChance(profile)) {
      return { skipped: "quiet_day", mode, actions: [] };
    }
  }
  const club = await loadAiClubState(db, teamId, profile, now);
  if (!club) return { skipped: "not_ai_club", mode, actions: [] };
  const plan = await loadWeeklyTransferPlan(db, teamId, now);

  const actions: MarketAction[] = [];
  const trace = newMarketTrace();
  const use: ModelUse = { useModel: mode !== "off", ai: env, model: opts.model, budget: { left: MAX_MODEL_CALLS_PER_RUN } };
  const steps: Array<[string, () => Promise<void>]> = [
    ["free_agents", () => signFreeAgents(env, club, now, mode, actions, plan, trace, use)],
    ["list", () => listSurplus(env, club, now, mode, actions, plan, trace, use)],
    ["pitch", () => pitchSurplus(env, club, now, mode, actions, plan, trace, use)],
    ["buy", () => buyForNeed(env, club, now, mode, actions, plan, trace, use)],
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

  // Jeden zápis za běh: akce všech kroků, k nim všechna rozhodnutí modelu (prompty, odpovědi, tokeny).
  const allErrors = [...errors, ...trace.errors];
  await logDecision(db, {
    teamId, kind: "transfer_market", mode, model: trace.model ?? "rules", contextRef: pragueDay(now),
    inputSummary: `budget=${club.budget} reserve=${club.reserve} spendable=${club.spendable} squad=${club.analysis.seniorOwnCount}`
      + ` deals30=${club.dealsLast30}/${club.dealLimit} needs=${club.analysis.needs.map((n) => `${n.position}:${n.need.toFixed(2)}`).join(",") || "-"}`
      + ` course=${plan ? `${plan.stance}${plan.focus.length ? `:${plan.focus.join("+")}` : ""}` : "-"}`
      + (trace.prompts.length > 0 ? `\n\n${trace.prompts.join("\n---\n")}` : ""),
    rawOutput: trace.raws.length > 0 ? trace.raws.join("\n---\n") : null,
    actions: actions.map(({ result: _r, error: _e, ...a }) => a),
    executed: actions.map((a) => ({ kind: a.kind, result: a.result, error: a.error })),
    usedFallback: trace.usedFallback,
    error: allErrors.length > 0 ? allErrors.join("; ") : null,
    tokensIn: trace.calls > 0 ? trace.tokensIn : null,
    tokensOut: trace.calls > 0 ? trace.tokensOut : null,
    latencyMs: trace.calls > 0 ? trace.latencyMs : null,
  });
  return { skipped: null, mode, actions };
}

/**
 * Hodinová část AI trenéra: trh (sám si hlídá, že poběží jednou denně v hodinu klubu).
 * `env` nese i binding Workers AI (`env.AI`), kterým model vybírá hráče a jedná o ceně.
 */
export const transferMarketHourlyHook: HourlyHook = async (env, teamId, profile, now) => {
  await runTransferMarket(env, teamId, now, { profile });
};
