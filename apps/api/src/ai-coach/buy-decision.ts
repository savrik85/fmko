/**
 * Nákup hráče modelem (spec 3.5 a 3.7). Čisté funkce bez databáze: popis situace pro model,
 * schéma odpovědi a kontrola, že model vybral jen z nabídnutých možností a v mezích.
 *
 * Co je počítání, hlídá kód (transfer-market.ts, outside-buy.ts, buy-negotiation.ts): jestli
 * a na jaký post kupovat (potřeba, přestupní kurz, rezerva na provoz, limity obchodů), kdo
 * přichází v úvahu a rozpětí nabídky. Horní mez je strop ceny `maxBuyPrice` (u inzerátu nanejvýš
 * cena z inzerátu), dolní mez 70 % ceny, pod kterou by nabídka byla urážka. Model vybere hráče
 * (nebo nic) a částku v rozpětí, v jednání pak přijmout, přihodit v mezích, nebo odejít.
 * Procenta z dalšího prodeje AI nikdy nedává a nad strop nikdy nejde, ať model napíše cokoli.
 */

import type { AiCoachProfile } from "./profile";
import { MIN_PRICE } from "./valuation";
import { styleText } from "./weekly-decision";

/** Kdo hráče prodává: klub ve hře (člověk, nebo AI trenér), klub mimo hru, nebo nikdo (volný hráč). */
export type BuySeller = "human" | "ai" | "outside" | "none";

/**
 * Jak se hráč kupuje: příhoz na inzerát klubu ve hře, přímá nabídka hráči klubu ve hře,
 * jednání s klubem mimo hru (inzerát, nebo hlášení skauta), podpis volného hráče.
 */
export type BuyRoute = "listing" | "offer" | "outside_listing" | "scout_report" | "free_agent";

export interface BuyCandidateOption {
  /** Klíč pro model („c1“…). */
  key: string;
  route: BuyRoute;
  seller: BuySeller;
  position: string;
  age: number;
  /** Hodnocení, jak ho vidí i člověk; u hlášení skauta střed odhadu. */
  rating: number;
  /** Hlášení skauta: rozsah odhadu. */
  ratingRange: { lo: number; hi: number } | null;
  /** Tržní hodnota (sdílený vzorec). */
  estimatedValue: number;
  /** Cena z inzerátu, u hlášení skautův odhad ceny, u volného hráče mzda, kterou chce (Kč týdně). */
  askingPrice: number | null;
  /** Meziligový poplatek, který kupující platí navíc (procenta); v rozpětí už je započtený. */
  feePct: number;
  /** Rozpětí nabídky (u volného hráče týdenní mzdy), které spočítal kód. */
  minBid: number;
  maxBid: number;
}

export interface BuyLoanOption {
  key: string;
  seller: "human" | "ai";
  position: string;
  age: number;
  rating: number;
  /** Délka hostování (dny), kterou zvolil kód. */
  days: number;
}

export interface BuyNeedInfo {
  position: string;
  need: number;
  missing: number;
  minRating: number;
  startersAverage: number;
}

export interface BuyPickContext {
  teamName: string;
  profile: AiCoachProfile;
  budget: number;
  reserve: number;
  spendable: number;
  squadSize: number;
  targetSquad: number;
  /** Průměr hodnocení nejlepší jedenáctky. */
  strength: number;
  need: BuyNeedInfo;
  /** Přestupní kurz z pondělní správy (null = žádný). */
  course: { stance: "buy" | "hold" | "sell"; focus: string[] } | null;
  candidates: BuyCandidateOption[];
  loans: BuyLoanOption[];
  /** Poptávka na post, když ji jde založit (žádná jiná na post neběží). */
  demand: { maxPrice: number; ageMin: number; ageMax: number } | null;
  /** Co trenér dnes už zkusil a nevyšlo (anglicky, pro model). */
  tried: string[];
}

export const BUY_NONE = "none";
export const BUY_DEMAND = "demand";

export type BuyPickDecision =
  | { kind: "buy"; key: string; bid: number; reason: string }
  | { kind: "loan"; key: string; reason: string }
  | { kind: "demand"; reason: string }
  | { kind: "none"; reason: string };

export const BUY_SYSTEM_PROMPT = [
  "You are the head coach and manager of an amateur Czech district football club in a football management game.",
  "You decide about buying players: whether to buy, which player to go for, how much to offer, and how to answer the seller in the negotiation.",
  "Decide like a sensible real manager with YOUR personality: weigh how much the player improves the team, his age and the value for money.",
  "The game has already checked the rules, the money and the squad limits, so every listed option is allowed and every amount inside a given range is affordable.",
  "Answer with exactly one JSON object and nothing else.",
].join(" ");

const POSITION_TEXT: Record<string, string> = { GK: "goalkeeper", DEF: "defender", MID: "midfielder", FWD: "forward" };

const SELLER_TEXT: Record<BuySeller, string> = {
  human: "a club managed by a human player",
  ai: "a club managed by another computer coach",
  outside: "a club outside the game",
  none: "nobody",
};

function czk(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} CZK`;
}

function cleanReason(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, 300) : "";
}

/** Celé číslo z odpovědi modelu (číslo i číselný řetězec), jinak null. */
function toAmount(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.round(n);
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return !!raw && typeof raw === "object" && !Array.isArray(raw);
}

function playerText(p: { position: string; age: number; rating: number; ratingRange: { lo: number; hi: number } | null }): string {
  const rating = p.ratingRange
    ? `rating about ${p.rating} (your scout's estimate ${p.ratingRange.lo}-${p.ratingRange.hi})`
    : `rating ${p.rating}`;
  return `${p.position}, age ${p.age}, ${rating}`;
}

function personalityLines(p: AiCoachProfile): string[] {
  return [
    "YOUR PERSONALITY (0-100):",
    `ambition ${p.ambition}, thrift ${p.thrift}, risk ${p.risk}, patience ${p.patience}, trading ${p.trading}, youth focus ${p.youthFocus}.`,
    `YOUR STYLE: ${styleText(p)}`,
  ];
}

/**
 * Spodní mez nabídky: 70 % ceny z inzerátu (bez inzerátu tržní hodnoty), nejméně MIN_PRICE,
 * a nikdy nad částku, kterou by nabídlo pravidlo (to musí do rozpětí vždycky patřit).
 */
export function minimumBid(input: { estimatedValue: number; listedPrice: number | null; ruleBid: number }): number {
  const reference = input.listedPrice && input.listedPrice > 0 ? input.listedPrice : input.estimatedValue;
  return Math.min(input.ruleBid, Math.max(MIN_PRICE, Math.floor((reference * 0.7) / 100) * 100));
}

/** Klíče, ze kterých model vybírá. „none“ je vždycky, takže výčet ve schématu nikdy není prázdný. */
export function buyChoiceKeys(ctx: Pick<BuyPickContext, "candidates" | "loans" | "demand">): string[] {
  return [...ctx.candidates.map((c) => c.key), ...ctx.loans.map((l) => l.key), ...(ctx.demand ? [BUY_DEMAND] : []), BUY_NONE];
}

/** Je o čem rozhodovat? Když zbývá jen „nic“, model se neptá. */
export function hasBuyChoice(ctx: Pick<BuyPickContext, "candidates" | "loans" | "demand">): boolean {
  return buyChoiceKeys(ctx).length > 1;
}

function candidateLine(c: BuyCandidateOption): string {
  const head = `- "${c.key}": ${playerText(c)}`;
  const value = `estimated value ${czk(c.estimatedValue)}`;
  const fee = c.feePct > 0 ? ` He plays in another league, so you also pay a ${c.feePct} % inter-league fee on top of the price (your range already allows for it).` : "";
  const range = `Bid between ${czk(c.minBid)} and ${czk(c.maxBid)}.`;
  switch (c.route) {
    case "listing":
      return `${head}, ${value}. Transfer-listed by ${SELLER_TEXT[c.seller]} for ${czk(c.askingPrice ?? c.maxBid)}: a bid at the asking price is accepted, a lower one may be countered or refused.${fee} ${range}`;
    case "offer":
      return `${head}, ${value}. Plays for ${SELLER_TEXT[c.seller]} and is not transfer-listed: a direct offer, the club may accept, counter or refuse (after a refusal you cannot bid for him for 10 days).${fee} ${range}`;
    case "outside_listing":
      return `${head}, ${value}. Transfer-listed by ${SELLER_TEXT.outside} for ${czk(c.askingPrice ?? c.maxBid)}: the club agrees at the asking price, haggles below it and breaks off after insulting offers; then the player decides whether to join. ${range}`;
    case "scout_report":
      return `${head}, ${value}. Found by your scout at ${SELLER_TEXT.outside} that has not listed him${c.askingPrice ? `; the scout guesses the club wants about ${czk(c.askingPrice)}` : ""}: the club haggles and breaks off after insulting offers; then the player decides whether to join. ${range}`;
    case "free_agent":
      return `${head}, ${value} on the transfer market. Free agent without a club: no transfer fee, only a signing fee of 500 CZK; he asks for ${czk(c.askingPrice ?? c.minBid)} a week and may refuse a club he does not like. Offer a weekly wage between ${czk(c.minBid)} and ${czk(c.maxBid)}.`;
  }
}

export function renderBuyPickPrompt(ctx: BuyPickContext): string {
  const n = ctx.need;
  const pos = POSITION_TEXT[n.position] ?? n.position;
  const course = ctx.course
    ? `TRANSFER COURSE for this week (your Monday review): ${ctx.course.stance}${ctx.course.focus.length ? `, strengthen ${ctx.course.focus.join(" and ")}` : ""}.`
    : "TRANSFER COURSE: none set this week.";
  const starters = n.startersAverage > 0 ? `your starters there average rating ${n.startersAverage}` : "nobody plays there now";
  const lines: string[] = [
    ...personalityLines(ctx.profile),
    "",
    `CLUB ${ctx.teamName}: budget ${czk(ctx.budget)}. You keep ${czk(ctx.reserve)} as a reserve for running costs, so you can spend at most ${czk(ctx.spendable)} on transfers.`,
    `SQUAD: ${ctx.squadSize} senior players (you want about ${ctx.targetSquad}), your best eleven averages rating ${ctx.strength.toFixed(1)}. Ratings are on the game's own scale, not out of 100: compare them with your own players.`,
    course,
    `NEED: ${pos} (${n.position}), need ${n.need.toFixed(2)} on a 0-1 scale${n.missing > 0 ? `, ${n.missing} player(s) short of full depth` : ""}, ${starters}. A signing improves the team from rating ${n.minRating} up.`,
    "",
  ];
  if (ctx.candidates.length > 0) {
    lines.push("PLAYERS YOU CAN GO FOR (key: player, seller, price, allowed bid):");
    lines.push(...ctx.candidates.map(candidateLine));
  } else {
    lines.push("PLAYERS YOU CAN GO FOR: none on the market fits your need and money right now.");
  }
  lines.push("", "OTHER OPTIONS:");
  for (const l of ctx.loans) {
    lines.push(`- "${l.key}": ask ${SELLER_TEXT[l.seller]} to loan you ${playerText({ ...l, ratingRange: null })} for ${l.days} days without a fee; the club decides.`);
  }
  if (ctx.demand) {
    lines.push(`- "${BUY_DEMAND}": post a public wanted ad for a ${pos} aged ${ctx.demand.ageMin}-${ctx.demand.ageMax}, up to ${czk(ctx.demand.maxPrice)}; clubs can offer you players over the next days.`);
  }
  lines.push(`- "${BUY_NONE}": do not buy anything today.`);
  if (ctx.tried.length > 0) {
    lines.push("", "ALREADY TRIED TODAY WITHOUT A DEAL:", ...ctx.tried.map((t) => `- ${t}`));
  }
  lines.push(
    "",
    'Return {"choice": one of the keys, "bid": your bid in CZK inside the chosen player\'s range (the weekly wage for a free agent; 0 for a loan, the wanted ad or none), "reason": "one short English sentence"}.',
  );
  return lines.join("\n");
}

export function buyPickSchema(ctx: Pick<BuyPickContext, "candidates" | "loans" | "demand">): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      choice: { type: "string", enum: buyChoiceKeys(ctx) },
      bid: { type: "integer" },
      reason: { type: "string" },
    },
    required: ["choice", "bid", "reason"],
    additionalProperties: false,
  };
}

/**
 * Model smí vybrat jen nabídnutou možnost a nabídnout jen v rozpětí kandidáta.
 * Cokoli jiného (neznámý klíč, částka mimo rozpětí, nesmysl) vrátí null a rozhodne pravidlo.
 */
export function validateBuyPick(raw: unknown, ctx: Pick<BuyPickContext, "candidates" | "loans" | "demand">): BuyPickDecision | null {
  if (!isRecord(raw)) return null;
  const choice = typeof raw.choice === "string" ? raw.choice.trim() : "";
  const reason = cleanReason(raw.reason);
  if (choice === BUY_NONE) return { kind: "none", reason };
  if (choice === BUY_DEMAND) return ctx.demand ? { kind: "demand", reason } : null;
  const loan = ctx.loans.find((l) => l.key === choice);
  if (loan) return { kind: "loan", key: loan.key, reason };
  const cand = ctx.candidates.find((c) => c.key === choice);
  if (!cand) return null;
  const bid = toAmount(raw.bid);
  if (bid === null || bid < cand.minBid || bid > cand.maxBid) return null;
  return { kind: "buy", key: cand.key, bid, reason };
}

// ─── Jednání o ceně ─────────────────────────────────────────────────────────

export type BuyNegotiationAction = "accept" | "counter" | "withdraw";

/** Podmínky, které prodávající chce (hotově = 100 % hned, bez splátek a procent). */
export interface AskTerms {
  upfrontPct: number;
  installments: number;
  sellOnPct: number;
}

export const CASH_TERMS: AskTerms = { upfrontPct: 100, installments: 0, sellOnPct: 0 };

export interface NegotiationBounds {
  /** Smí AI požadavek přijmout (do stropu a bez procent z dalšího prodeje)? */
  canAccept: boolean;
  /** Rozpětí protinávrhu, nebo null, když protinávrh nejde. */
  counter: { min: number; max: number } | null;
}

/**
 * Co smí AI kupující na požadavek prodávajícího udělat. Počítá kód, model jen vybírá:
 * přijmout jen do stropu a bez procent z dalšího prodeje, přihodit víc než minule, ale méně
 * než požadavek (s procenty stačí stejná částka bez nich) a nikdy nad strop, odejít vždycky.
 */
export function buyNegotiationBounds(input: {
  ask: number; sellOnPct: number; maxPrice: number; lastOwnBid: number; countersLeft: number;
}): NegotiationBounds {
  const wantsSellOn = input.sellOnPct > 0;
  const canAccept = !wantsSellOn && input.ask <= input.maxPrice;
  const max = Math.min(input.maxPrice, wantsSellOn ? input.ask : input.ask - 1);
  // S procenty jde i stejná částka jako požadavek, jen hotově a bez nich.
  const min = Math.max(100, wantsSellOn ? Math.min(input.lastOwnBid, input.ask) : input.lastOwnBid + 1);
  return { canAccept, counter: input.countersLeft > 0 && min <= max ? { min, max } : null };
}

export interface BuyNegotiationContext extends NegotiationBounds {
  teamName: string;
  profile: AiCoachProfile;
  spendable: number;
  player: { position: string; age: number; rating: number; ratingRange: { lo: number; hi: number } | null; estimatedValue: number };
  seller: Exclude<BuySeller, "none">;
  /** Cena z inzerátu, když je hráč na trhu. */
  listedPrice: number | null;
  /** Vlastní návrhy AI od prvního (hotově). */
  ownBids: number[];
  /** Co teď chce prodávající (celá cena v Kč). */
  ask: number;
  askTerms: AskTerms;
  /** Strop AI pro tohoto hráče (`maxBuyPrice` po meziligovém poplatku). */
  maxPrice: number;
  countersLeft: number;
}

export type BuyNegotiationDecision =
  | { kind: "accept"; reason: string }
  | { kind: "counter"; amount: number; reason: string }
  | { kind: "withdraw"; reason: string };

/** Akce, ze kterých model vybírá. „withdraw“ jde vždycky, takže výčet nikdy není prázdný. */
export function negotiationActions(ctx: NegotiationBounds): BuyNegotiationAction[] {
  return [...(ctx.canAccept ? ["accept" as const] : []), ...(ctx.counter ? ["counter" as const] : []), "withdraw"];
}

function askText(ask: number, t: AskTerms): string {
  const parts = [t.installments > 0 ? `${czk(ask)}: ${t.upfrontPct} % now and the rest in ${t.installments} weekly installments` : `${czk(ask)} in cash`];
  if (t.sellOnPct > 0) parts.push(`plus ${t.sellOnPct} % of any future transfer fee for this player`);
  return parts.join(", ");
}

export function renderBuyNegotiationPrompt(ctx: BuyNegotiationContext): string {
  const lines: string[] = [
    ...personalityLines(ctx.profile),
    "",
    `CLUB ${ctx.teamName}: you can spend at most ${czk(ctx.spendable)} on transfers.`,
    `TALKS about ${playerText(ctx.player)}, estimated value ${czk(ctx.player.estimatedValue)}, with ${SELLER_TEXT[ctx.seller]}${ctx.listedPrice ? ` (transfer-listed for ${czk(ctx.listedPrice)})` : ""}.`,
    `- your offers so far: ${ctx.ownBids.length ? ctx.ownBids.map(czk).join(", ") : "none"}`,
    `- the seller now asks ${askText(ctx.ask, ctx.askTerms)}`,
    `- your limit for this player is ${czk(ctx.maxPrice)}: you never pay more.`,
  ];
  if (ctx.askTerms.sellOnPct > 0) lines.push("- you never give a seller a share of future transfer fees, so you cannot accept these terms as they are.");
  if (ctx.seller === "outside") lines.push("- this club breaks off the talks when it runs out of patience; after a deal the player still decides whether to join.");
  lines.push("", "OPTIONS:");
  if (ctx.canAccept) lines.push(`- "accept": agree to pay ${askText(ctx.ask, ctx.askTerms)}.`);
  if (ctx.counter) {
    lines.push(`- "counter": offer between ${czk(ctx.counter.min)} and ${czk(ctx.counter.max)} in cash${ctx.askTerms.sellOnPct > 0 ? " without any share of future fees" : ""}; the seller may agree, ask again or end the talks. You can counter at most ${ctx.countersLeft} more time(s).`);
  }
  lines.push('- "withdraw": end the talks without a deal.');
  lines.push("", 'Return {"action": one of the options, "amount": your counter-offer in CZK (0 unless you counter), "reason": "one short English sentence"}.');
  return lines.join("\n");
}

export function buyNegotiationSchema(ctx: NegotiationBounds): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      action: { type: "string", enum: negotiationActions(ctx) },
      amount: { type: "integer" },
      reason: { type: "string" },
    },
    required: ["action", "amount", "reason"],
    additionalProperties: false,
  };
}

/** Model smí jen nabídnutou akci a protinávrh v rozpětí. Jinak null a rozhodne pravidlo. */
export function validateBuyNegotiation(raw: unknown, ctx: NegotiationBounds): BuyNegotiationDecision | null {
  if (!isRecord(raw)) return null;
  const action = typeof raw.action === "string" ? raw.action.trim() : "";
  if (!(negotiationActions(ctx) as string[]).includes(action)) return null;
  const reason = cleanReason(raw.reason);
  if (action === "accept") return { kind: "accept", reason };
  if (action === "withdraw") return { kind: "withdraw", reason };
  const amount = toAmount(raw.amount);
  if (amount === null || !ctx.counter || amount < ctx.counter.min || amount > ctx.counter.max) return null;
  return { kind: "counter", amount, reason };
}
