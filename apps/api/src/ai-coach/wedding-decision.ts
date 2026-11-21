/**
 * Svatba hráče AI klubu (F3 „Svatba v kabině“): čisté funkce bez databáze. Popis pro model,
 * schéma odpovědi, kontrola odpovědi a náhradní pravidlo podle povahy.
 *
 * AI trenér má tytéž tři cesty jako člověk, který ženichovi odepíše v chatu: přijde a pohlídá
 * kluky (poloviční kocovina), pošle dar (kocovina plná, ženich rád) nebo klukům pít zakáže
 * (bez kocoviny, ženich dotčený). Kód hlídá jen meze: dar nesmí sáhnout na rezervu. Provede to
 * ai-coach/weddings.ts stejnou službou jako u člověka (weddings/wedding-db.ts `recordWeddingDecision`).
 */

import { WEDDING_GIFT_DEFAULT, type WeddingChoice } from "../weddings/wedding";
import { cleanReason, czk, isRecord } from "./buy-decision";
import type { AiCoachProfile } from "./profile";
import { promptName } from "./prompt-text";
import { styleText } from "./weekly-decision";

/** Částky, ze kterých model vybírá dar. */
export const WEDDING_GIFT_OPTIONS = [1000, 2000, 5000] as const;

export type AiWeddingChoice = Exclude<WeddingChoice, "none">;

export interface WeddingDecisionContext {
  teamName: string;
  profile: AiCoachProfile;
  budget: number;
  /** Rezerva na provoz podle šetrnosti (`budgetReserve`). */
  reserve: number;
  groom: { name: string; age: number; position: string };
  /** YYYY-MM-DD */
  weddingDay: string;
  /** Den po svatbě se hraje ligový zápas. */
  matchNextDay: boolean;
  /** Kolik hráčů na zápas nepřijde s plnou kocovinou a kolik, když trenér přijde a pohlídá je. */
  absentIfFull: number;
  absentIfAttend: number;
  /** Dary, které se vejdou nad rezervu. */
  giftOptions: number[];
}

export interface AiWeddingDecision {
  choice: AiWeddingChoice;
  giftAmount: number | null;
  reason: string;
}

export type WeddingCheck = { ok: true; decision: AiWeddingDecision } | { ok: false; reason: string };

export function affordableGifts(budget: number, reserve: number): number[] {
  return WEDDING_GIFT_OPTIONS.filter((a) => budget - a >= reserve);
}

export const WEDDING_SYSTEM_PROMPT = [
  "You are the head coach and manager of an amateur Czech district football club in a football management game.",
  "One of your players is getting married and invited you and the whole squad. You answer him as a human manager would.",
  "Decide like a sensible real manager with YOUR personality. The game has already checked the rules and the money.",
  "Answer with exactly one JSON object and nothing else.",
].join(" ");

function weekday(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

function players(n: number): string {
  return `${n} player${n === 1 ? "" : "s"}`;
}

export function renderWeddingPrompt(c: WeddingDecisionContext): string {
  const p = c.profile;
  const match = c.matchNextDay
    ? `It is the day before a league match: with a full hangover ${players(c.absentIfFull)} will not turn up for the match, the other drinkers play tired.`
    : "There is no match the next day, a hangover only makes the drinkers a bit tired.";
  const options = [
    `- "attend": you go to the wedding and keep an eye on the lads. The groom is delighted.`
      + (c.matchNextDay ? ` Only ${players(c.absentIfAttend)} miss${c.absentIfAttend === 1 ? "es" : ""} the match instead of ${c.absentIfFull}, the others are only half as tired.` : " The lads are only half as tired."),
  ];
  if (c.giftOptions.length > 0) {
    options.push(`- "gift": you stay away but send a wedding gift (${c.giftOptions.map(czk).join(", ")}). The bigger the gift, the happier the groom; the lads drink freely.`);
  }
  options.push(`- "ban": you forbid the lads to drink at the wedding. Nobody misses the match and nobody is tired, but the groom is offended.`);
  return [
    "YOUR PERSONALITY (0-100):",
    `ambition ${p.ambition}, thrift ${p.thrift}, risk ${p.risk}, patience ${p.patience}, youth focus ${p.youthFocus}.`,
    `YOUR STYLE: ${styleText(p)}`,
    "",
    `CLUB ${promptName(c.teamName)}: budget ${czk(c.budget)}, keep at least ${czk(c.reserve)} as a reserve.`,
    `WEDDING: your player ${promptName(c.groom.name, "a player")} (${c.groom.position}, age ${c.groom.age}) gets married on ${weekday(c.weddingDay)} ${c.weddingDay}. ${match}`,
    "",
    "OPTIONS:",
    ...options,
    "",
    `Return {"choice": "attend"|${c.giftOptions.length > 0 ? "\"gift\"|" : ""}"ban", "gift": the gift in CZK or null, "reason": "one short English sentence"}.`,
  ].join("\n");
}

export function weddingSchema(c: WeddingDecisionContext): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      choice: { type: "string", enum: c.giftOptions.length > 0 ? ["attend", "gift", "ban"] : ["attend", "ban"] },
      gift: { type: ["integer", "null"] },
      reason: { type: "string" },
    },
    required: ["choice", "gift", "reason"],
    additionalProperties: false,
  };
}

/** Model smí jen nabídnuté volby a nabídnutý dar (nad rezervou); dar bez částky je obvyklý dar. */
export function checkWeddingDecision(raw: unknown, c: WeddingDecisionContext): WeddingCheck {
  if (!isRecord(raw)) return { ok: false, reason: "odpověď není objekt" };
  const choice = typeof raw.choice === "string" ? raw.choice.trim().toLowerCase() : "";
  const reason = cleanReason(raw.reason);
  if (choice === "attend" || choice === "ban") return { ok: true, decision: { choice, giftAmount: null, reason } };
  if (choice !== "gift") return { ok: false, reason: `neznámá volba ${String(raw.choice).slice(0, 40)}` };
  if (c.giftOptions.length === 0) return { ok: false, reason: "na dar klub nemá" };
  const asked = typeof raw.gift === "number" ? raw.gift : typeof raw.gift === "string" && raw.gift.trim() ? Number(raw.gift) : null;
  const amount = asked === null ? WEDDING_GIFT_DEFAULT : Math.round(asked);
  if (!c.giftOptions.includes(amount)) {
    return { ok: false, reason: `dar ${asked} Kč není v nabídce ${c.giftOptions.join(", ")} Kč` };
  }
  return { ok: true, decision: { choice: "gift", giftAmount: amount, reason } };
}

/**
 * Náhradní pravidlo podle povahy. Ambiciózní trenér (aspoň 60) před zápasem, kdy by chyběli
 * aspoň dva hráči, pít zakáže. Štědrý (šetrnost nejvýš 30) pošle dar do 2 000 Kč, když na něj
 * klub má. Ostatní přijdou a kluky pohlídají.
 */
export function fallbackWeddingDecision(c: WeddingDecisionContext): AiWeddingDecision {
  const p = c.profile;
  if (c.matchNextDay && c.absentIfFull >= 2 && p.ambition >= 60) return { choice: "ban", giftAmount: null, reason: "fallback" };
  if (p.thrift <= 30 && c.giftOptions.length > 0) {
    const gift = [...c.giftOptions].reverse().find((a) => a <= WEDDING_GIFT_DEFAULT) ?? c.giftOptions[0];
    return { choice: "gift", giftAmount: gift, reason: "fallback" };
  }
  return { choice: "attend", giftAmount: null, reason: "fallback" };
}
