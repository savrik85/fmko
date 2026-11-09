/**
 * Poptávka po náhradě, když AI klub prodal oporu. Čisté funkce bez databáze: popis situace pro
 * model, schéma odpovědi a kontrola.
 *
 * Dřív poptávku založil kód s pevnými parametry (stejný post, 18 až 31 let, strop 110 % ceny
 * prodaného hráče). Teď o ní rozhoduje model: jestli ji vůbec vypsat, na jaký post, jaký věk
 * a s jakým stropem ceny. Kód hlídá jen meze: posty a věková pásma ze sady, strop nejvýš
 * peníze nad rezervou a 1,5 tržní hodnoty prodaného hráče (`MARKET_BUY_CAP`), nejméně 1 000 Kč.
 * Když model neodpoví, poptávka se nezaloží (díru v kádru uvidí denní práce na trhu).
 */

import type { AiCoachProfile } from "./profile";
import { promptName } from "./prompt-text";
import { styleText } from "./weekly-decision";

export const REPLACEMENT_POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
export type ReplacementPosition = typeof REPLACEMENT_POSITIONS[number];

/** Věková pásma poptávky (stejná jako u skauta). */
export const REPLACEMENT_AGE_BANDS = [
  { key: "youth", ageMin: 17, ageMax: 21 },
  { key: "prime", ageMin: 19, ageMax: 31 },
  { key: "experienced", ageMin: 25, ageMax: 34 },
] as const;
export type ReplacementAgeBand = typeof REPLACEMENT_AGE_BANDS[number]["key"];

/** Nejnižší strop ceny, se kterým poptávka dává smysl. */
export const MIN_REPLACEMENT_PRICE = 1000;

export interface ReplacementDemandContext {
  teamName: string;
  profile: AiCoachProfile;
  budget: number;
  /** Peníze nad rezervou po prodeji. */
  spendable: number;
  squadSize: number;
  targetSquad: number;
  sold: { position: string; age: number; rating: number; marketValue: number; price: number };
  /** Hodnocení hráčů áčka, kteří na postu zbyli, od nejlepšího. */
  remaining: number[];
  /** Kolik hráčů na postu hraje v základu. */
  starters: number;
  /** Posty, na které už klub poptávku má (druhá na týž post nejde). */
  taken: string[];
  /** Meze stropu ceny po tisících. */
  minPrice: number;
  maxPrice: number;
}

export interface ReplacementDemandDecision {
  post: boolean;
  position: ReplacementPosition;
  ages: ReplacementAgeBand;
  maxPrice: number;
  reason: string;
}

const floor1000 = (v: number) => Math.floor(v / 1000) * 1000;

/** Meze stropu ceny poptávky: od 1 000 Kč do peněz nad rezervou, nejvýš `capRatio` × hodnota prodaného hráče. */
export function replacementPriceBounds(input: { spendable: number; soldValue: number; capRatio: number }): { minPrice: number; maxPrice: number } | null {
  const maxPrice = floor1000(Math.min(Math.max(0, input.spendable), Math.max(0, input.soldValue) * input.capRatio));
  return maxPrice >= MIN_REPLACEMENT_PRICE ? { minPrice: MIN_REPLACEMENT_PRICE, maxPrice } : null;
}

/** Posty, na které jde poptávku vypsat (bez těch, kde už poptávka běží). */
export function replacementPositions(ctx: Pick<ReplacementDemandContext, "taken">): ReplacementPosition[] {
  return REPLACEMENT_POSITIONS.filter((p) => !ctx.taken.includes(p));
}

export const REPLACEMENT_SYSTEM_PROMPT = [
  "You are the head coach and manager of an amateur Czech district football club in a football management game.",
  "You have just sold one of your key players and decide whether to post a public wanted ad for a replacement.",
  "Other clubs can then offer you their players; you decide about each offered player later.",
  "Decide like a sensible real manager with YOUR personality. Answer with exactly one JSON object and nothing else.",
].join(" ");

function czk(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} CZK`;
}

export function renderReplacementDemandPrompt(ctx: ReplacementDemandContext): string {
  const p = ctx.profile;
  const s = ctx.sold;
  const positions = replacementPositions(ctx);
  return [
    "YOUR PERSONALITY (0-100):",
    `ambition ${p.ambition}, thrift ${p.thrift}, youth focus ${p.youthFocus}, risk ${p.risk}, patience ${p.patience}, trading ${p.trading}.`,
    `YOUR STYLE: ${styleText(p)}`,
    "",
    `CLUB ${promptName(ctx.teamName)}: budget ${czk(ctx.budget)}, of which ${czk(ctx.spendable)} is above the reserve you keep for running costs. A-team squad ${ctx.squadSize} players, you want about ${ctx.targetSquad}.`,
    `SOLD: your key ${s.position}, age ${s.age}, rating ${s.rating}, market value ${czk(s.marketValue)}, for ${czk(s.price)}.`,
    `LEFT at ${s.position} in your A-team: ${ctx.remaining.length > 0 ? ctx.remaining.slice(0, 8).join(", ") : "nobody"}; ${ctx.starters} of them start.`,
    "",
    "WANTED AD options:",
    `- position: ${positions.map((x) => `"${x}"`).join(", ")}${ctx.taken.length ? ` (you already have an ad for ${ctx.taken.join(", ")})` : ""}`,
    `- ages: ${REPLACEMENT_AGE_BANDS.map((b) => `"${b.key}" = ${b.ageMin}-${b.ageMax}`).join(", ")}`,
    `- maxPrice: the most you would pay, ${czk(ctx.minPrice)} to ${czk(ctx.maxPrice)} in whole thousands`,
    '- or post nothing ("post": false) if the players you have left are enough.',
    "",
    'Return {"post": true or false, "position": one of the positions, "ages": one of the age keys, "maxPrice": CZK in whole thousands, "reason": "one short English sentence"} (when you post nothing, still fill in any position, ages and maxPrice).',
  ].join("\n");
}

export function replacementDemandSchema(ctx: ReplacementDemandContext): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      post: { type: "boolean" },
      position: { type: "string", enum: replacementPositions(ctx) },
      ages: { type: "string", enum: REPLACEMENT_AGE_BANDS.map((b) => b.key) },
      maxPrice: { type: "integer", minimum: ctx.minPrice, maximum: ctx.maxPrice },
      reason: { type: "string" },
    },
    required: ["post", "position", "ages", "maxPrice", "reason"],
    additionalProperties: false,
  };
}

/** Odpověď modelu v mezích, nebo null (pak se poptávka nezaloží). Strop se zaokrouhlí na tisíce. */
export function validateReplacementDemand(raw: unknown, ctx: ReplacementDemandContext): ReplacementDemandDecision | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.post !== "boolean") return null;
  const reason = typeof r.reason === "string" ? r.reason.trim().slice(0, 300) : "";
  const positions = replacementPositions(ctx);
  const position = positions.find((p) => p === r.position);
  const ages = REPLACEMENT_AGE_BANDS.find((b) => b.key === r.ages)?.key;
  if (!r.post) return { post: false, position: position ?? positions[0] ?? "MID", ages: ages ?? "prime", maxPrice: 0, reason };
  const price = typeof r.maxPrice === "string" ? Number(r.maxPrice) : r.maxPrice;
  if (!position || !ages || typeof price !== "number" || !Number.isFinite(price)) return null;
  const maxPrice = Math.round(price / 1000) * 1000;
  if (maxPrice < ctx.minPrice || maxPrice > ctx.maxPrice) return null;
  return { post: true, position, ages, maxPrice, reason };
}
