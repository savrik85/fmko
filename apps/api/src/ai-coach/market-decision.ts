/**
 * Další rozhodnutí AI klubu na trhu modelem (spec 3.5 a 3.7). Čisté funkce bez databáze: popis
 * situace pro model, schéma odpovědi a kontrola, že model vybral jen z přípustných možností.
 *
 * - Inzeráty: koho z přebytečných hráčů dát na trh a za kolik. Cena je od rezervace (pod ni AI
 *   neprodá a rezervace nikdy neklesne pod pevnou pojistku 60 % tržní hodnoty) do jedenapůlnásobku
 *   rezervace. Levnější inzerát by sliboval cenu, za kterou AI hráče stejně neprodá.
 * - Nabídka hráče k poptávce: ke které poptávce a kterého hráče, nebo nic.
 * - Skaut: jestli vyjede, na který post, jak daleko a jaký věk (jen z toho, co kód dovolí a co
 *   pokryjí peníze nad rezervou).
 * - Nouzový podpis volného hráče pod minimem kádru: kterého a za jakou mzdu. Podepsat se musí.
 *
 * Kdo co smí, hlídá kód (market-selling.ts, transfer-market.ts, outside-buy.ts). Do popisu nejde
 * žádný text, který píšou lidé (názvy klubů, poznámky k poptávkám): model by se jím dal navést.
 */

import type { AiCoachProfile } from "./profile";
import { cleanReason, czk, isRecord, personalityLines, POSITION_TEXT, SELLER_TEXT, toAmount } from "./buy-decision";

export const MARKET_SYSTEM_PROMPT = [
  "You are the head coach and manager of an amateur Czech district football club in a football management game.",
  "You run your club's day on the transfer market: which surplus players to put on the transfer list and at what price, which player to offer to a club that is looking for one, where to send your scout and which free agent to sign when the squad is too small.",
  "Decide like a sensible real manager with YOUR personality and your weekly transfer course.",
  "The game has already checked the rules, the money and the squad limits, so every listed option is allowed and every amount inside a given range is acceptable.",
  "Answer with exactly one JSON object and nothing else.",
].join(" ");

const NONE = "none";

/** Co model ví o klubu u každého rozhodnutí na trhu. */
export interface MarketClubInfo {
  teamName: string;
  profile: AiCoachProfile;
  budget: number;
  spendable: number;
  squadSize: number;
  targetSquad: number;
  course: { stance: "buy" | "hold" | "sell"; focus: string[] } | null;
}

type ClubLine = MarketClubInfo;

/** Údaje o klubu ze stavu AI klubu a pondělního kurzu. */
export function marketClubLine(
  club: { name: string; profile: AiCoachProfile; budget: number; spendable: number; analysis: { seniorOwnCount: number } },
  plan: { stance: "buy" | "hold" | "sell"; focus: string[] } | null,
  targetSquad: number,
): MarketClubInfo {
  return {
    teamName: club.name, profile: club.profile, budget: club.budget, spendable: club.spendable,
    squadSize: club.analysis.seniorOwnCount, targetSquad, course: plan ? { stance: plan.stance, focus: plan.focus } : null,
  };
}

function clubLines(ctx: ClubLine): string[] {
  const course = ctx.course
    ? `${ctx.course.stance}${ctx.course.focus.length ? `, strengthen ${ctx.course.focus.join(" and ")}` : ""}`
    : "none set";
  return [
    ...personalityLines(ctx.profile),
    "",
    `CLUB ${ctx.teamName}: budget ${czk(ctx.budget)}, of which ${czk(ctx.spendable)} is above the reserve you keep for running costs.`,
    `SQUAD: ${ctx.squadSize} senior players, you want about ${ctx.targetSquad} (on match days a few are always missing). Ratings are on the game's own scale, not out of 100.`,
    `TRANSFER COURSE this week (your Monday review): ${course}.`,
  ];
}

// ─── Inzeráty na přebytečné hráče ────────────────────────────────────────────

/** Násobek rezervace, nad který AI inzerát nedá (pravidlo dává 1,12 až 1,37). */
export const MAX_LISTING_TO_RESERVATION = 1.5;

export interface ListingOption {
  key: string;
  position: string;
  age: number;
  rating: number;
  marketValue: number;
  /** Trenér ho v pondělí vybral k prodeji. */
  chosen: boolean;
  /** Cena inzerátu od rezervace do 1,5násobku rezervace (po stovkách). */
  minPrice: number;
  maxPrice: number;
}

export interface ListingContext extends ClubLine {
  /** Kolik inzerátů ještě smí přibýt (limit rozjetých obchodů podle obchodní aktivity). */
  slots: number;
  options: ListingOption[];
}

export interface ListingDecision {
  picks: Array<{ key: string; price: number }>;
  reason: string;
}

export function listingPriceBounds(reservation: number): { minPrice: number; maxPrice: number } {
  return { minPrice: reservation, maxPrice: Math.ceil((reservation * MAX_LISTING_TO_RESERVATION) / 100) * 100 };
}

export function renderListingPrompt(ctx: ListingContext): string {
  return [
    ...clubLines(ctx),
    "",
    `SURPLUS PLAYERS you could put on the transfer list (they rarely play for you); you can list at most ${ctx.slots} more right now:`,
    ...ctx.options.map((o) => `- "${o.key}": ${o.position}, age ${o.age}, rating ${o.rating}, market value ${czk(o.marketValue)}${o.chosen ? "; you picked him to sell in your Monday review" : ""}. Asking price between ${czk(o.minPrice)} and ${czk(o.maxPrice)}.`),
    "",
    "A listing lasts 7 days and is public: a club that offers the asking price gets the player, a lower offer you can still refuse or counter. A player nobody buys stays and keeps his wage, but he also covers injuries.",
    `Return {"list": [{"player": one of the keys, "price": asking price in CZK, a whole hundred inside his range}] with at most ${ctx.slots} players (an empty list means you list nobody today), "reason": "one short English sentence"}.`,
  ].join("\n");
}

export function listingSchema(ctx: Pick<ListingContext, "options">): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      list: {
        type: "array",
        items: {
          type: "object",
          properties: { player: { type: "string", enum: ctx.options.map((o) => o.key) }, price: { type: "integer" } },
          required: ["player", "price"],
          additionalProperties: false,
        },
      },
      reason: { type: "string" },
    },
    required: ["list", "reason"],
    additionalProperties: false,
  };
}

/**
 * Model smí vystavit jen nabízené hráče, každého jednou, nejvýš `slots` a za cenu v rozpětí
 * (zaokrouhlí se na stovky). Cokoli jiného vrátí null a rozhodne pravidlo.
 */
export function validateListing(raw: unknown, ctx: Pick<ListingContext, "options" | "slots">): ListingDecision | null {
  if (!isRecord(raw) || !Array.isArray(raw.list)) return null;
  if (raw.list.length > ctx.slots) return null;
  const picks: ListingDecision["picks"] = [];
  for (const item of raw.list) {
    if (!isRecord(item) || typeof item.player !== "string") return null;
    const option = ctx.options.find((o) => o.key === item.player);
    if (!option || picks.some((p) => p.key === option.key)) return null;
    const amount = toAmount(item.price);
    if (amount === null) return null;
    const price = Math.round(amount / 100) * 100;
    if (price < option.minPrice || price > option.maxPrice) return null;
    picks.push({ key: option.key, price });
  }
  return { picks, reason: cleanReason(raw.reason) };
}

// ─── Nabídka hráče k poptávce ────────────────────────────────────────────────

export interface PitchOption {
  key: string;
  demand: {
    position: string;
    ageMin: number;
    ageMax: number;
    /** Práh hodnocení (u klubu mimo hru skrytý: null). */
    minRating: number | null;
    maxPrice: number | null;
    club: "human" | "ai" | "outside";
  };
  player: { position: string; age: number; rating: number; marketValue: number };
}

export interface PitchContext extends ClubLine {
  options: PitchOption[];
}

export type PitchDecision = { key: string | null; reason: string };

export function renderPitchPrompt(ctx: PitchContext): string {
  const line = (o: PitchOption): string => {
    const d = o.demand;
    const who = d.club === "outside"
      ? `${SELLER_TEXT.outside} from your district; it decides at once whether it wants him (its rating requirement is not public)`
      : `${SELLER_TEXT[d.club]}; it may then make you an offer, which you answer later`;
    const want = `${POSITION_TEXT[d.position] ?? d.position} aged ${d.ageMin}-${d.ageMax}${d.minRating ? `, rating ${d.minRating} or more` : ""}${d.maxPrice ? `, up to ${czk(d.maxPrice)}` : ""}`;
    return `- "${o.key}": offer your ${o.player.position}, age ${o.player.age}, rating ${o.player.rating}, market value ${czk(o.player.marketValue)}, to ${who}. They want a ${want}.`;
  };
  return [
    ...clubLines(ctx),
    "",
    "WANTED ADS that fit one of your surplus players (offering a player only tells the club he is available, it does not sell him):",
    ...ctx.options.map(line),
    `- "${NONE}": do not offer anyone today.`,
    "",
    'Return {"choice": one of the keys, "reason": "one short English sentence"}.',
  ].join("\n");
}

export function pitchSchema(ctx: Pick<PitchContext, "options">): Record<string, unknown> {
  return {
    type: "object",
    properties: { choice: { type: "string", enum: [...ctx.options.map((o) => o.key), NONE] }, reason: { type: "string" } },
    required: ["choice", "reason"],
    additionalProperties: false,
  };
}

export function validatePitch(raw: unknown, ctx: Pick<PitchContext, "options">): PitchDecision | null {
  if (!isRecord(raw) || typeof raw.choice !== "string") return null;
  const choice = raw.choice.trim();
  const reason = cleanReason(raw.reason);
  if (choice === NONE) return { key: null, reason };
  return ctx.options.some((o) => o.key === choice) ? { key: choice, reason } : null;
}

// ─── Skaut ───────────────────────────────────────────────────────────────────

/** Věk, který může skaut hledat: mladí (hlásí podle potenciálu), hráči v nejlepších letech, zkušení. */
export const SCOUT_AGE_BANDS = [
  { key: "youth", ageMin: 17, ageMax: 21 },
  { key: "prime", ageMin: 19, ageMax: 31 },
  { key: "experienced", ageMin: 25, ageMax: 34 },
] as const;

export type ScoutAgeBand = typeof SCOUT_AGE_BANDS[number]["key"];

/** Pásmo věku podle rozsahu (pravidlo `scoutAgesFor` dává mladé, nebo nejlepší léta). */
export function scoutAgeBandOf(ages: { ageMin: number; ageMax: number }): ScoutAgeBand | null {
  return SCOUT_AGE_BANDS.find((b) => b.ageMin === ages.ageMin && b.ageMax === ages.ageMax)?.key ?? null;
}

export interface ScoutContext extends ClubLine {
  /** Kolik týdnů úkol trvá (cestovné se platí každý týden). */
  weeks: number;
  /** Posty, kde klub hledá posilu a žádný skaut na nich nejede, od nejpotřebnějšího. */
  positions: Array<{ position: string; need: number; missing: number }>;
  /** Okruhy, na které jsou peníze nad rezervou. */
  radii: Array<{ km: number; weeklyCost: number }>;
  /** Posty, na kterých už některý skaut jede. */
  busy: string[];
}

export type ScoutDecision =
  | { send: false; reason: string }
  | { send: true; position: string; radiusKm: number; ages: ScoutAgeBand; reason: string };

export function hasScoutChoice(ctx: Pick<ScoutContext, "positions" | "radii">): boolean {
  return ctx.positions.length > 0 && ctx.radii.length > 0;
}

export function renderScoutPrompt(ctx: ScoutContext): string {
  return [
    ...clubLines(ctx),
    "",
    `SCOUT: you have a scout without a task. On a task he visits clubs outside the game for ${ctx.weeks} weeks and reports players for the chosen position and ages; you can then try to buy them. Travel costs are paid every week.`,
    `POSITIONS where you look for a signing: ${ctx.positions.map((p) => `"${p.position}" (${POSITION_TEXT[p.position] ?? p.position}, need ${p.need.toFixed(2)}${p.missing > 0 ? `, ${p.missing} short` : ""})`).join(", ")}.${ctx.busy.length ? ` Another scout already looks for ${ctx.busy.join(", ")}.` : ""}`,
    `RADIUS: ${ctx.radii.map((r) => `${r.km} km for ${czk(r.weeklyCost)} a week`).join(", ")}; further away means more clubs and more players to choose from.`,
    `AGES: ${SCOUT_AGE_BANDS.map((b) => `"${b.key}" = ${b.ageMin}-${b.ageMax}${b.key === "youth" ? " (he judges youngsters by their potential)" : ""}`).join(", ")}.`,
    "",
    'Return {"send": true or false, "position": one of the positions, "radius": one of the radii in km, "ages": one of the age keys, "reason": "one short English sentence"} (when you do not send him, still fill in any position, radius and ages).',
  ].join("\n");
}

export function scoutSchema(ctx: Pick<ScoutContext, "positions" | "radii">): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      send: { type: "boolean" },
      position: { type: "string", enum: ctx.positions.map((p) => p.position) },
      radius: { type: "integer", enum: ctx.radii.map((r) => r.km) },
      ages: { type: "string", enum: SCOUT_AGE_BANDS.map((b) => b.key) },
      reason: { type: "string" },
    },
    required: ["send", "position", "radius", "ages", "reason"],
    additionalProperties: false,
  };
}

export function validateScout(raw: unknown, ctx: Pick<ScoutContext, "positions" | "radii">): ScoutDecision | null {
  if (!isRecord(raw) || typeof raw.send !== "boolean") return null;
  const reason = cleanReason(raw.reason);
  if (!raw.send) return { send: false, reason };
  const position = typeof raw.position === "string" ? raw.position.trim() : "";
  if (!ctx.positions.some((p) => p.position === position)) return null;
  const radiusKm = toAmount(raw.radius);
  if (radiusKm === null || !ctx.radii.some((r) => r.km === radiusKm)) return null;
  const ages = SCOUT_AGE_BANDS.find((b) => b.key === raw.ages)?.key;
  if (!ages) return null;
  return { send: true, position, radiusKm, ages, reason };
}

// ─── Nouzový podpis volného hráče ────────────────────────────────────────────

/** Volnému hráči trenér přidá na mzdě nejvýš čtvrtinu (ambice 100 v pravidle). */
export const MAX_WAGE_PREMIUM = 0.25;

export interface EmergencyAgentOption {
  key: string;
  position: string;
  age: number;
  rating: number;
  /** Mzda, kterou hráč chce (Kč týdně), a rozpětí nabídky. */
  askWage: number;
  minWage: number;
  maxWage: number;
}

export interface EmergencySigningContext extends ClubLine {
  /** Pod tolik hráčů AI kádr nepustí (podepisuje volné hráče). */
  minSquad: number;
  /** Post, kde nemá klub nikoho (nebo null). */
  emptyPosition: string | null;
  needs: Array<{ position: string; need: number; missing: number }>;
  agents: EmergencyAgentOption[];
}

export interface EmergencySigningDecision {
  key: string;
  wage: number;
  reason: string;
}

export function wageBounds(askWage: number): { minWage: number; maxWage: number } {
  return { minWage: askWage, maxWage: Math.round(askWage * (1 + MAX_WAGE_PREMIUM)) };
}

export function renderEmergencySigningPrompt(ctx: EmergencySigningContext): string {
  const why = ctx.emptyPosition
    ? `you have no ${POSITION_TEXT[ctx.emptyPosition] ?? ctx.emptyPosition} at all`
    : `your senior squad has only ${ctx.squadSize} players and you never go below ${ctx.minSquad}`;
  return [
    ...clubLines(ctx),
    "",
    `URGENT: ${why}, so you must sign one free agent today.`,
    `Weak positions: ${ctx.needs.length ? ctx.needs.map((n) => `${n.position} need ${n.need.toFixed(2)}${n.missing > 0 ? `, ${n.missing} short` : ""}`).join("; ") : "none"}.`,
    "FREE AGENTS you can sign (no transfer fee, a signing fee of 500 CZK; a better wage makes him more likely to accept):",
    ...ctx.agents.map((a) => `- "${a.key}": ${a.position}, age ${a.age}, rating ${a.rating}, asks ${czk(a.askWage)} a week. Offer a weekly wage between ${czk(a.minWage)} and ${czk(a.maxWage)}.`),
    "",
    'Return {"choice": one of the keys, "wage": weekly wage in CZK inside his range, "reason": "one short English sentence"}.',
  ].join("\n");
}

export function emergencySigningSchema(ctx: Pick<EmergencySigningContext, "agents">): Record<string, unknown> {
  return {
    type: "object",
    properties: { choice: { type: "string", enum: ctx.agents.map((a) => a.key) }, wage: { type: "integer" }, reason: { type: "string" } },
    required: ["choice", "wage", "reason"],
    additionalProperties: false,
  };
}

export function validateEmergencySigning(raw: unknown, ctx: Pick<EmergencySigningContext, "agents">): EmergencySigningDecision | null {
  if (!isRecord(raw) || typeof raw.choice !== "string") return null;
  const agent = ctx.agents.find((a) => a.key === raw.choice);
  if (!agent) return null;
  const wage = toAmount(raw.wage);
  if (wage === null || wage < agent.minWage || wage > agent.maxWage) return null;
  return { key: agent.key, wage, reason: cleanReason(raw.reason) };
}
