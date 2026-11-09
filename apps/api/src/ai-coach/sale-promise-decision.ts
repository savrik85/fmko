/**
 * Inzerát hráče, kterému AI trenér slíbil prodej (dohoda s nespokojeným hráčem): popis situace
 * pro model, schéma odpovědi, kontrola a náhradní pravidlo. Čisté funkce bez databáze.
 *
 * Meze hlídá kód (sale-promise.ts): hráč na trh jde vždy, slib se musí dodržet. Cena inzerátu
 * je od tržní hodnoty (pod ni AI se slibem neprodá, transfer-decision.ts) do 115 % tržní
 * hodnoty; dráž by kupce odradila a slib by jen vypršel. Dřív šla cena od 60 % tržní hodnoty
 * a opory odcházely pod cenou (audit 2026-11). Kterou cenu dát do inzerátu, vybere model;
 * při jeho výpadku se inzerát odloží na další běh, tržní hodnota platí jen v režimu off.
 */

import type { AiCoachProfile } from "./profile";
import { MIN_PRICE, type SquadImportance } from "./valuation";
import { styleText } from "./weekly-decision";
import { promptName } from "./prompt-text";

const ceil100 = (v: number) => Math.ceil(v / 100) * 100;

/** Nejvyšší cena inzerátu po slibu prodeje jako násobek tržní hodnoty. */
export const PROMISE_LISTING_MAX_RATIO = 1.15;

export interface PromiseListingContext {
  teamName: string;
  profile: AiCoachProfile;
  budget: number;
  spendable: number;
  player: { position: string; age: number; rating: number; importance: SquadImportance; marketValue: number };
  /** Kolik dní slib ještě platí. */
  daysLeft: number;
  /** Nejnižší cena inzerátu: tržní hodnota po stovkách (pod ni AI se slibem neprodá). */
  minPrice: number;
  /** Nejvyšší cena inzerátu: 115 % tržní hodnoty po stovkách. */
  maxPrice: number;
}

export interface PromiseListingDecision {
  price: number;
  reason: string;
}

/** Meze ceny inzerátu po slibu prodeje (po stovkách, dolní mez nikdy nad horní). */
export function promiseListingBounds(marketValue: number): { minPrice: number; maxPrice: number } {
  const minPrice = ceil100(Math.max(MIN_PRICE, marketValue));
  return { minPrice, maxPrice: Math.max(minPrice, ceil100(minPrice * PROMISE_LISTING_MAX_RATIO)) };
}

export const PROMISE_LISTING_SYSTEM_PROMPT = [
  "You are the head coach and manager of an amateur Czech district football club in a football management game.",
  "You promised an unhappy player to let him go when the next decent offer comes, and you keep your word:",
  "he goes on the transfer list for a fair price and you will not sell him below the asking price you choose.",
  "Choose his asking price: a lower price sells him sooner, a higher one may bring more money but can scare buyers off before the promise runs out.",
  "Answer with exactly one JSON object and nothing else.",
].join(" ");

function czk(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} CZK`;
}

const IMPORTANCE_TEXT: Record<SquadImportance, string> = {
  key: "a key player for you",
  rotation: "a squad player for you",
  surplus: "a player you can do without",
};

export function renderPromiseListingPrompt(ctx: PromiseListingContext): string {
  const p = ctx.profile;
  const pl = ctx.player;
  return [
    "YOUR PERSONALITY (0-100):",
    `ambition ${p.ambition}, thrift ${p.thrift}, youth focus ${p.youthFocus}, risk ${p.risk}, patience ${p.patience}, trading ${p.trading}.`,
    `YOUR STYLE: ${styleText(p)}`,
    "",
    `CLUB ${promptName(ctx.teamName)}: budget ${czk(ctx.budget)}, of which ${czk(ctx.spendable)} is free to spend.`,
    `PLAYER you promised to sell: ${pl.position}, age ${pl.age}, rating ${Math.round(pl.rating)}, ${IMPORTANCE_TEXT[pl.importance]}; market value ${czk(pl.marketValue)}. The promise runs for ${ctx.daysLeft} more day${ctx.daysLeft === 1 ? "" : "s"}.`,
    `The listing is public for 7 days. A club that offers the asking price gets him at once; lower offers you will answer one by one, never below his market value.`,
    `Asking price between ${czk(ctx.minPrice)} and ${czk(ctx.maxPrice)}, in whole hundreds.`,
    "",
    'Return {"price": asking price in CZK, "reason": "one short English sentence"}.',
  ].join("\n");
}

export function promiseListingSchema(ctx: PromiseListingContext): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      price: { type: "integer", minimum: ctx.minPrice, maximum: ctx.maxPrice },
      reason: { type: "string" },
    },
    required: ["price", "reason"],
    additionalProperties: false,
  };
}

/** Cena musí být celá stovka v mezích slibu. Jinak null a platí náhradní pravidlo. */
export function validatePromiseListing(raw: unknown, ctx: PromiseListingContext): PromiseListingDecision | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const price = typeof r.price === "string" ? Number(r.price) : r.price;
  if (typeof price !== "number" || !Number.isInteger(price) || price % 100 !== 0) return null;
  if (price < ctx.minPrice || price > ctx.maxPrice) return null;
  return { price, reason: typeof r.reason === "string" ? r.reason.trim().slice(0, 300) : "" };
}

/** Jen v režimu off (model se neptá): tržní hodnota, podle hry slušná nabídka. */
export function fallbackPromiseListing(ctx: PromiseListingContext): PromiseListingDecision {
  return { price: ctx.minPrice, reason: "fallback" };
}
