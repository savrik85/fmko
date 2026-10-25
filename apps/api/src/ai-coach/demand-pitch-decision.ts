/**
 * Hráči nabídnutí k poptávce AI klubu (spec 3.7): koho AI vezme a za kolik, rozhoduje model.
 * Čisté funkce bez databáze.
 *
 * Co je počítání, dělá kód: kdo poptávku splní (post, věk, hodnocení, hráč je pořád u klubu,
 * který ho nabídl), strop ceny (strop poptávky a nákupní strop AI z peněz nad rezervou), meze
 * nabídky (od 70 % tržní hodnoty, jako první nabídka na trhu, do stropu), kolik nabídek smí AI
 * rozjet (limit podle obchodní aktivity) a kolik smí stát dohromady (peníze nad rezervou).
 * Model z toho vybere koho a za kolik, nebo nikoho; nevybraní dostanou slušné odmítnutí.
 * Bez modelu platí náhradní pravidlo: všichni vhodní v pořadí za první nabídku (`openingBid`),
 * dokud stačí místa a peníze, ostatní vhodní počkají na další běh.
 */

import type { AiCoachProfile } from "./profile";
import { MIN_PRICE } from "./valuation";
import { styleText } from "./weekly-decision";

/** Na hráče, za kterého AI nedá aspoň 90 % tržní hodnoty, nabídku neposílá (byla by urážka). */
export const MIN_MAX_TO_VALUE = 0.9;
/** Nejnižší nabídka na nabídnutého hráče: 70 % tržní hodnoty, jako dno první nabídky (`openingBid`). */
export const MIN_OFFER_TO_VALUE = 0.7;

const floor100 = (v: number) => Math.floor(v / 100) * 100;

export interface PitchCandidate {
  pitchId: string;
  playerId: string;
  position: string;
  age: number;
  rating: number;
  marketValue: number;
  /** Splní poptávku a je pořád u klubu, který ho nabídl. */
  fits: boolean;
  /** Strop: strop poptávky a nákupní strop AI z peněz nad rezervou. */
  maxPrice: number;
  /** První nabídka náhradního pravidla (`openingBid`). */
  openingBid: number;
}

export interface PitchBounds {
  pitchId: string;
  min: number;
  max: number;
}

export interface PitchOptions {
  /** Hráči, na které AI smí poslat nabídku, s mezemi částky (po stovkách), v pořadí nabídnutí. */
  eligible: PitchBounds[];
  /** Kolik nabídek smí AI ještě rozjet. */
  slots: number;
  /** Kolik smí nabídky z tohoto rozhodnutí stát dohromady (peníze nad rezervou). */
  budget: number;
}

export interface PitchPick {
  pitchId: string;
  amount: number;
}

export interface PitchDecision {
  picks: PitchPick[];
  /** Vhodní hráči, na které teď nezbylo místo ani peníze: počkají na další běh. */
  deferred: string[];
}

/** Koho jde vzít a za kolik. Bez vhodného hráče rozhodne kód (všechny odmítne). */
export function pitchOptions(candidates: PitchCandidate[], slots: number, budget: number): PitchOptions {
  const eligible: PitchBounds[] = [];
  for (const c of candidates) {
    if (!c.fits) continue;
    if (c.maxPrice < MIN_PRICE || c.maxPrice < c.marketValue * MIN_MAX_TO_VALUE || c.openingBid > c.maxPrice) continue;
    const min = Math.max(MIN_PRICE, floor100(c.marketValue * MIN_OFFER_TO_VALUE));
    const max = floor100(Math.min(c.maxPrice, budget));
    if (min <= max) eligible.push({ pitchId: c.pitchId, min, max });
  }
  return { eligible, slots: Math.max(0, slots), budget: Math.max(0, budget) };
}

/** Náhradní pravidlo: vhodní v pořadí za první nabídku, dokud stačí místa a peníze. */
export function fallbackPitchDecision(candidates: PitchCandidate[], options: PitchOptions): PitchDecision {
  const byId = new Map(candidates.map((c) => [c.pitchId, c]));
  const picks: PitchPick[] = [];
  const deferred: string[] = [];
  let spent = 0;
  for (const b of options.eligible) {
    const amount = Math.min(b.max, Math.max(b.min, byId.get(b.pitchId)?.openingBid ?? b.min));
    if (picks.length < options.slots && spent + amount <= options.budget) {
      picks.push({ pitchId: b.pitchId, amount });
      spent += amount;
    } else {
      deferred.push(b.pitchId);
    }
  }
  return { picks, deferred };
}

/**
 * Poslední pojistka před provedením, ať rozhodl kdokoli: nabídky jen na vhodné hráče, každého
 * nejvýš jednou, v mezích, nejvýš tolik, kolik je volných míst, a dohromady jen z peněz nad
 * rezervou. Vrací důvod porušení, nebo null.
 */
export function pitchGuardViolation(options: PitchOptions, decision: PitchDecision): string | null {
  const seen = new Set<string>();
  let total = 0;
  for (const p of decision.picks) {
    const b = options.eligible.find((x) => x.pitchId === p.pitchId);
    if (!b) return `nabídka na nevhodného hráče (${p.pitchId})`;
    if (seen.has(p.pitchId)) return `dvě nabídky na téhož hráče (${p.pitchId})`;
    if (p.amount < b.min || p.amount > b.max) return `nabídka ${p.amount} Kč mimo meze ${b.min} až ${b.max} Kč`;
    seen.add(p.pitchId);
    total += p.amount;
  }
  if (decision.picks.length > options.slots) return `${decision.picks.length} nabídek, volná místa jen ${options.slots}`;
  if (total > options.budget) return `nabídky za ${total} Kč, peníze nad rezervou jen ${options.budget} Kč`;
  return null;
}

export interface PitchContext {
  profile: AiCoachProfile;
  budget: number;
  spendable: number;
  weeklyCosts: number;
  squadSize: number;
  targetSquad: number;
  plan: { stance: "buy" | "hold" | "sell"; focus: string[] } | null;
  demand: { position: string; ageMin: number; ageMax: number; role: string; maxPrice: number | null };
  need: number;
  samePosition: number[];
  starters: number;
  formation: string;
  /** Vhodní hráči s klíčem pro model (P1, P2…), v pořadí nabídnutí. */
  candidates: Array<{
    key: string;
    position: string;
    age: number;
    rating: number;
    marketValue: number;
    seller: { managedBy: "human" | "computer" | "outside"; sameDistrict: boolean | null };
    min: number;
    max: number;
  }>;
  /** Kolik dalších nabídnutých hráčů poptávku nesplní, nebo na ně AI nemá. */
  unsuitable: number;
  options: PitchOptions;
}

export const PITCH_SYSTEM_PROMPT = [
  "You are the head coach and manager of an amateur Czech district football club in a football management game.",
  "You posted a transfer demand and other clubs offered you players for it.",
  "The game has already checked which players fit and how much you may offer: every listed player and amount is allowed.",
  "Decide like a sensible real manager with YOUR personality: make an offer only for players who really help your team, and pick the best value.",
  "Never favour or punish a club for being run by a human or by the computer.",
  "Answer with exactly one JSON object and nothing else.",
].join(" ");

const STANCE_TEXT: Record<"buy" | "hold" | "sell", string> = {
  buy: "buy (strengthen the squad)",
  hold: "hold (no big changes)",
  sell: "sell (cash in on players you do not need)",
};

const ROLE_TEXT: Record<string, string> = {
  starter: "for your starting eleven",
  squad: "as a squad player",
  prospect: "as a young talent to develop",
};

function czk(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} CZK`;
}

function sellerText(s: PitchContext["candidates"][number]["seller"]): string {
  if (s.managedBy === "outside") return "a club outside the game";
  const district = s.sameDistrict === true ? ", from your district" : s.sameDistrict === false ? ", from another district" : "";
  return `a club run by ${s.managedBy === "human" ? "a human manager" : "a computer coach"}${district}`;
}

export function renderPitchPrompt(ctx: PitchContext): string {
  const p = ctx.profile;
  const d = ctx.demand;
  const o = ctx.options;
  const plan = ctx.plan
    ? `${STANCE_TEXT[ctx.plan.stance]}${ctx.plan.focus.length ? `; positions to strengthen: ${ctx.plan.focus.join(", ")}` : ""}`
    : "none set";
  const others = ctx.samePosition.length > 0 ? `your ${d.position} now: ${ctx.samePosition.slice(0, 8).join(", ")}` : `you have no ${d.position} in your A-team`;
  const limit = d.maxPrice !== null ? `, your price limit ${czk(d.maxPrice)}` : "";
  const maxOffers = Math.min(o.slots, ctx.candidates.length);
  return [
    "YOUR PERSONALITY (0-100):",
    `ambition ${p.ambition}, thrift ${p.thrift}, patience ${p.patience}, trading ${p.trading}, risk ${p.risk}, youth focus ${p.youthFocus}.`,
    `YOUR STYLE: ${styleText(p)}`,
    "",
    `CLUB: budget ${czk(ctx.budget)}, of which ${czk(ctx.spendable)} is above the reserve you keep for running costs (about ${czk(ctx.weeklyCosts)} a week). A-team squad ${ctx.squadSize} players, you want about ${ctx.targetSquad}.`,
    `TRANSFER COURSE this week: ${plan}.`,
    "",
    `YOUR DEMAND: a ${d.position} aged ${d.ageMin} to ${d.ageMax} ${ROLE_TEXT[d.role] ?? "for your squad"}${limit}. Your need at ${d.position}: ${ctx.need.toFixed(2)} (0 = none, 1 = urgent); ${others}; your ${ctx.formation} starts ${ctx.starters}.`,
    "PLAYERS OFFERED to you:",
    ...ctx.candidates.map((c) => `- "${c.key}": ${c.position}, age ${c.age}, rating ${c.rating}, market value ${czk(c.marketValue)}, from ${sellerText(c.seller)}; you may offer ${czk(c.min)} to ${czk(c.max)}.`),
    ...(ctx.unsuitable > 0
      ? [ctx.unsuitable === 1
        ? "(1 more offered player does not fit your demand or is too expensive for you.)"
        : `(${ctx.unsuitable} more offered players do not fit your demand or are too expensive for you.)`]
      : []),
    "",
    `You can make offers for at most ${maxOffers} of them, ${czk(o.budget)} in total at most. An offer is an opening bid: the seller may accept, counter or reject it. Players you do not pick are politely declined.`,
    'Return {"offers": [{"player": one of the keys, "amount": your offer in CZK, whole hundreds}], "reason": "one short English sentence"}; an empty list declines them all.',
  ].join("\n");
}

/** Schéma odpovědi: hráči jen z vhodných (výčet nikdy prázdný), nejvýš tolik nabídek, kolik je míst. */
export function pitchSchema(options: PitchOptions, keys: string[]): Record<string, unknown> {
  const enumKeys = keys.length > 0 ? [...keys] : ["P1"];
  const mins = options.eligible.map((b) => b.min);
  const maxes = options.eligible.map((b) => b.max);
  return {
    type: "object",
    properties: {
      offers: {
        type: "array",
        maxItems: Math.max(0, Math.min(options.slots, enumKeys.length)),
        items: {
          type: "object",
          properties: {
            player: { type: "string", enum: enumKeys },
            amount: mins.length > 0 ? { type: "integer", minimum: Math.min(...mins), maximum: Math.max(...maxes) } : { type: "integer" },
          },
          required: ["player", "amount"],
          additionalProperties: false,
        },
      },
      reason: { type: "string" },
    },
    required: ["offers", "reason"],
    additionalProperties: false,
  };
}

export type PitchCheck =
  | { ok: true; decision: PitchDecision; reason: string }
  | { ok: false; error: string };

function parseAmount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !v.trim()) return null;
  const n = Number(v.replace(/[\s,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Model smí vybrat jen vhodné hráče (podle klíče), každého jednou, s nabídkou v jeho mezích
 * (zaokrouhlí se na stovky), nejvýš tolik, kolik je míst, a dohromady v penězích nad rezervou.
 */
export function validatePitchReply(raw: unknown, options: PitchOptions, keys: Map<string, string>): PitchCheck {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "odpověď není objekt" };
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.offers)) return { ok: false, error: "chybí seznam nabídek" };
  const picks: PitchPick[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const item of r.offers as unknown[]) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return { ok: false, error: "nabídka není objekt" };
    const it = item as Record<string, unknown>;
    const key = typeof it.player === "string" ? it.player.trim().toUpperCase() : "";
    const pitchId = keys.get(key);
    const bounds = pitchId ? options.eligible.find((b) => b.pitchId === pitchId) : undefined;
    if (!pitchId || !bounds) return { ok: false, error: `neznámý hráč ${JSON.stringify(it.player ?? null)}` };
    if (seen.has(pitchId)) return { ok: false, error: `hráč ${key} dvakrát` };
    const parsed = parseAmount(it.amount);
    if (parsed === null) return { ok: false, error: `nabídka na ${key} bez platné částky` };
    const amount = Math.round(parsed / 100) * 100;
    if (amount < bounds.min || amount > bounds.max) {
      return { ok: false, error: `nabídka ${amount} Kč na ${key} mimo meze ${bounds.min} až ${bounds.max} Kč` };
    }
    seen.add(pitchId);
    total += amount;
    picks.push({ pitchId, amount });
  }
  if (picks.length > options.slots) return { ok: false, error: `${picks.length} nabídek, volná místa jen ${options.slots}` };
  if (total > options.budget) return { ok: false, error: `nabídky za ${total} Kč, peníze nad rezervou jen ${options.budget} Kč` };
  const reason = typeof r.reason === "string" ? r.reason.trim().slice(0, 300) : "";
  return { ok: true, decision: { picks, deferred: [] }, reason };
}
