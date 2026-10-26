/**
 * Nabídky místních hráčů AI klubu (hospodský, trenér dorostu, kapitán, starosta): popis situace
 * pro model, schéma odpovědi, kontrola odpovědi a náhradní pravidlo podle povahy. Čisté funkce
 * bez databáze.
 *
 * Co je pravidlo, hlídá kód (player-offers.ts): podepsat jde jen pod strop soupisky a jen když
 * klub z peněz nad rezervou unese registraci a mzdu na sezónu dopředu. Model u každé nabídky
 * vybere, jestli hráče podepíše, nebo odmítne. Volba mimo nabídku se zahodí a za tu nabídku
 * rozhodne náhradní pravidlo.
 */

import type { OfferSource } from "../events/player-offers";
import type { AiCoachProfile } from "./profile";
import { styleText } from "./weekly-decision";

export type PlayerOfferChoice = "sign" | "decline";
export const PLAYER_OFFER_CHOICES: readonly PlayerOfferChoice[] = ["sign", "decline"];

/** Talent dorostence, jak ho na kartě nabídky vidí člověk (stejné prahy jako v Přestupech). */
export type TalentBand = "high" | "medium" | "low";

export function talentBand(hiddenTalent: number): TalentBand {
  return hiddenTalent >= 30 ? "high" : hiddenTalent >= 18 ? "medium" : "low";
}

export interface PlayerOfferCandidate {
  /** Klíč pro model (O1…), ne UUID nabídky. */
  key: string;
  offerId: string;
  source: OfferSource;
  age: number;
  position: string;
  rating: number;
  weeklyWage: number;
  /** Talent jen u kluka z dorostu (člověk ho vidí jen u něj). */
  talent: TalentBand | null;
  /** Za kolik dní nabídka propadne. */
  daysLeft: number;
  /** Hodnocení hráčů áčka na stejném postu, od nejlepšího. */
  samePosition: number[];
  /** Kolik hráčů na postu hraje v základu podle formace. */
  starters: number;
  /** Potřeba postu 0–1 (squad.ts), 0 = post je obsazený. */
  need: number;
  /** Kolik hráčů na postu chybí do plné hloubky. */
  missing: number;
}

export interface PlayerOfferContext {
  teamName: string;
  profile: AiCoachProfile;
  budget: number;
  reserve: number;
  /** Peníze nad rezervou. */
  spendable: number;
  weeklyCosts: number;
  /** Hráči na soupisce áčka. */
  squadSize: number;
  targetSquad: number;
  maxSquad: number;
  formation: string;
  /** Průměr hodnocení nejlepší jedenáctky áčka. */
  top11Average: number;
  /** Registrace hráče z nabídky (Kč). */
  signingFee: number;
  offers: PlayerOfferCandidate[];
}

export interface PlayerOfferDecision {
  /** Klíč pro model; null u nabídky, o které rozhodl kód (podepsat nešlo). */
  key: string | null;
  offerId: string;
  action: PlayerOfferChoice;
  reason: string;
  /** Model, náhradní pravidlo, nebo kód (zbylo jen odmítnutí). */
  decidedBy: "model" | "fallback" | "guard";
}

export interface PlayerOfferValidation {
  chosen: Map<string, { action: PlayerOfferChoice; reason: string }>;
  /** Volby modelu, které neprošly (do deníku). */
  rejected: string[];
}

export const PLAYER_OFFER_SYSTEM_PROMPT = [
  "You are the head coach and manager of an amateur Czech district football club in a football management game.",
  "Local people sometimes recommend a player who would like to join your club: the pub landlord, your youth coach, your captain or the mayor.",
  "Signing him costs a one-off registration fee and then his weekly wage; he joins your first-team squad and later you can sell or release him like anyone else.",
  "For each offer you either sign the player or decline. Every listed option is allowed and affordable.",
  "Decide like a sensible real manager with YOUR personality: sign players who make your team better or fill a thin position, and do not fill the squad with players you do not need.",
  "Answer with exactly one JSON object and nothing else.",
].join(" ");

function czk(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} CZK`;
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
}

const SOURCE_TEXT: Record<OfferSource, string> = {
  pub: "the pub landlord heard of him",
  youth: "your youth coach recommends a boy from the club's youth team",
  friend: "your captain knows him",
  recommendation: "the mayor recommends a man who has just moved to the village",
};

const TALENT_TEXT: Record<TalentBand, string> = {
  high: "high (he grows faster in training and has a higher ceiling)",
  medium: "medium",
  low: "low",
};

/** Kolik hráčů na postu je lepších než on (jeho místo v pořadí na postu je o jedno dál). */
function betterAtPosition(o: Pick<PlayerOfferCandidate, "samePosition" | "rating">): number {
  return o.samePosition.filter((r) => r > o.rating).length;
}

function needText(o: PlayerOfferCandidate): string {
  if (o.missing > 0) return `you are ${o.missing} ${o.position} short of a full squad`;
  if (o.need >= 0.3) return `your ${o.position}s are weak compared with the rest of your team`;
  if (o.need > 0) return `your ${o.position}s could be a bit better`;
  return `you have enough ${o.position}s`;
}

function offerLines(o: PlayerOfferCandidate, formation: string): string[] {
  const depth = o.samePosition.length > 0 ? o.samePosition.map((r) => Math.round(r)).join(", ") : "nobody";
  return [
    `${o.key}: ${SOURCE_TEXT[o.source]}. ${o.position}, age ${o.age}, rating ${Math.round(o.rating)}, weekly wage ${czk(o.weeklyWage)}; the offer expires in ${o.daysLeft} day${o.daysLeft === 1 ? "" : "s"}.`,
    ...(o.talent ? [`- talent: ${TALENT_TEXT[o.talent]}`] : []),
    `- your ${o.position}s (${o.starters} start in your ${formation}): ${depth}; he would be your ${ordinal(betterAtPosition(o) + 1)} best ${o.position}`,
    `- ${needText(o)}`,
  ];
}

export function renderPlayerOfferPrompt(ctx: PlayerOfferContext): string {
  const p = ctx.profile;
  return [
    "YOUR PERSONALITY (0-100):",
    `ambition ${p.ambition}, thrift ${p.thrift}, youth focus ${p.youthFocus}, risk ${p.risk}, patience ${p.patience}, trading ${p.trading}.`,
    `YOUR STYLE: ${styleText(p)}`,
    "",
    `CLUB ${ctx.teamName}: budget ${czk(ctx.budget)}; you keep ${czk(ctx.reserve)} as a reserve for running costs, so ${czk(ctx.spendable)} is free to spend. Weekly running costs about ${czk(ctx.weeklyCosts)}.`,
    `SQUAD: ${ctx.squadSize} first-team players (you want about ${ctx.targetSquad}, the limit is ${ctx.maxSquad}); formation ${ctx.formation}; your best eleven averages rating ${ctx.top11Average.toFixed(1)}.`,
    "",
    `OFFERS (a local player who would like to join you; signing costs a one-off ${czk(ctx.signingFee)} registration fee and then his weekly wage):`,
    ...ctx.offers.flatMap((o) => [...offerLines(o, ctx.formation), ""]),
    'Return {"decisions": [{"offer": "O1", "action": "sign" or "decline", "reason": "one short English sentence"}], "reasoning": "max 30 words"} with exactly one entry for each offer.',
  ].join("\n");
}

/** Schéma odpovědi. Výčty nejsou nikdy prázdné: model se ptá jen na aspoň jednu nabídku. */
export function playerOfferSchema(ctx: PlayerOfferContext): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      decisions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            offer: { type: "string", enum: ctx.offers.map((o) => o.key) },
            action: { type: "string", enum: [...PLAYER_OFFER_CHOICES] },
            reason: { type: "string" },
          },
          required: ["offer", "action", "reason"],
          additionalProperties: false,
        },
      },
      reasoning: { type: "string" },
    },
    required: ["decisions", "reasoning"],
    additionalProperties: false,
  };
}

function cleanReason(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, 300) : "";
}

/**
 * Volby modelu, které prošly: známá nabídka a „sign“, nebo „decline“. Ostatní se zahodí
 * a zapíšou do `rejected`. Null = odpověď nemá tvar rozhodnutí vůbec.
 */
export function validatePlayerOfferDecision(raw: unknown, ctx: PlayerOfferContext): PlayerOfferValidation | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const list = (raw as Record<string, unknown>).decisions;
  if (!Array.isArray(list)) return null;
  const keys = new Set(ctx.offers.map((o) => o.key));
  const chosen = new Map<string, { action: PlayerOfferChoice; reason: string }>();
  const rejected: string[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      rejected.push("položka není objekt");
      continue;
    }
    const r = item as Record<string, unknown>;
    const key = typeof r.offer === "string" ? r.offer.trim() : "";
    if (!keys.has(key)) {
      rejected.push(`neznámá nabídka ${String(r.offer)}`);
      continue;
    }
    if (chosen.has(key)) {
      rejected.push(`${key} podruhé`);
      continue;
    }
    const action = typeof r.action === "string" ? r.action.trim() : "";
    if (!(PLAYER_OFFER_CHOICES as readonly string[]).includes(action)) {
      rejected.push(`${key}: ${action || "bez volby"} není v nabídce`);
      continue;
    }
    chosen.set(key, { action: action as PlayerOfferChoice, reason: cleanReason(r.reason) });
  }
  for (const o of ctx.offers) {
    if (!chosen.has(o.key) && !rejected.some((x) => x.startsWith(`${o.key}:`))) rejected.push(`${o.key}: chybí`);
  }
  return { chosen, rejected };
}

/**
 * Náhradní pravidlo podle povahy. Hráče, který by hrál v základu, podepíše každý trenér. Skrblík
 * nikoho dalšího. Jinak doplní slabý nebo tenký post, pod cílem kádru vezme rozumnou zálohu
 * a mládežník talentovaného kluka z dorostu. Ostatní odmítne.
 */
export function fallbackPlayerOfferChoice(o: PlayerOfferCandidate, ctx: PlayerOfferContext): PlayerOfferChoice {
  const p = ctx.profile;
  if (betterAtPosition(o) < o.starters) return "sign";
  if (p.thrift >= 80) return "decline";
  if (o.need >= 0.3 && o.rating >= ctx.top11Average - 10) return "sign";
  if (ctx.squadSize < ctx.targetSquad && o.rating >= ctx.top11Average - 8) return "sign";
  if (o.talent !== null && o.talent !== "low" && p.youthFocus >= 60) return "sign";
  return "decline";
}

/** Rozhodnutí pro každou nabídku: volba modelu, kde prošla, jinak náhradní pravidlo. */
export function resolvePlayerOfferDecisions(ctx: PlayerOfferContext, validation: PlayerOfferValidation | null): PlayerOfferDecision[] {
  return ctx.offers.map((o) => {
    const pick = validation?.chosen.get(o.key);
    if (pick) return { key: o.key, offerId: o.offerId, action: pick.action, reason: pick.reason, decidedBy: "model" };
    return { key: o.key, offerId: o.offerId, action: fallbackPlayerOfferChoice(o, ctx), reason: "fallback", decidedBy: "fallback" };
  });
}
