/**
 * Nespokojení hráči AI klubu: popis situace pro model, schéma odpovědi, kontrola odpovědi
 * a náhradní pravidlo podle povahy. Čisté funkce bez databáze.
 *
 * Co je pravidlo, hlídá kód (unhappy-players.ts a služba `performUnrestAction`): kterou dohodu
 * jde s hráčem uzavřít, na co klub má a koho smí pustit. Model u každého hráče jen vybere
 * jednu z nabídnutých dohod, nebo počká. Volba mimo nabídku se zahodí a za toho hráče
 * rozhodne náhradní pravidlo.
 */

import type { UnrestActionId } from "../transfers/unrest";
import type { UnrestReason } from "../transfers/unrest-reasons";
import type { AiCoachProfile } from "./profile";
import type { SquadImportance } from "./valuation";
import { styleText } from "./weekly-decision";

export type UnrestChoice = UnrestActionId | "wait";

/** Dohoda, kterou kód AI trenérovi pustil: přijala by ji služba a klub na ni má. */
export interface UnrestOption {
  id: UnrestActionId;
  /** Kolik dohoda stojí hned (Kč). */
  cost: number;
  /** O kolik se trvale zvednou týdenní odměny (Kč). */
  weeklyCost: number;
  /** „Pustit ho“: kdo hráče koupí a za kolik. */
  sale?: { club: string; amount: number };
}

export interface UnrestCandidate {
  /** Klíč pro model (P1…), ne UUID. */
  key: string;
  playerId: string;
  name: string;
  age: number;
  position: string;
  rating: number;
  importance: SquadImportance;
  /** Hraje za U21 klubu. */
  inU21: boolean;
  /** Je na hostování v jiném klubu. */
  onLoanElsewhere: boolean;
  weeklyWage: number;
  /** Nespokojenost 1–100 (hráčům se neukazuje, model ji dostane slovy). */
  level: number;
  reasons: UnrestReason[];
  /** Odmítnutá nabídka, kvůli které se zlobí; null = chce pryč sám od sebe. */
  offer: { club: string; amount: number } | null;
  /** Dohody, které už v tomhle truci padly. */
  dealsDone: string[];
  options: UnrestOption[];
}

export interface UnrestDecisionContext {
  teamName: string;
  profile: AiCoachProfile;
  budget: number;
  reserve: number;
  /** Peníze nad rezervou. */
  spendable: number;
  /** Průměr hodnocení nejlepší jedenáctky áčka. */
  top11Average: number;
  players: UnrestCandidate[];
}

export interface UnrestPlayerDecision {
  key: string;
  playerId: string;
  action: UnrestChoice;
  reason: string;
  decidedBy: "model" | "fallback";
}

export interface UnrestValidation {
  chosen: Map<string, { action: UnrestChoice; reason: string }>;
  /** Volby modelu, které neprošly (do deníku). */
  rejected: string[];
}

/** Pod tuhle úroveň trenér nic nedělá: hráč se skoro uklidnil a rozchodí to sám. */
export const CALM_ENOUGH_LEVEL = 15;
/** Od téhle úrovně je hráč naštvaný (chodí míň na trénink, hrozí absence a simulované zranění). */
export const ANGRY_LEVEL = 40;

export const UNREST_SYSTEM_PROMPT = [
  "You are the head coach and manager of an amateur Czech district football club in a football management game.",
  "Some of your players are unhappy, mostly because you refused a transfer they wanted.",
  "An unhappy player trains less, may skip matches or even fake an injury; his anger fades only slowly by itself.",
  "For each unhappy player you either make one deal today or wait. Every listed deal is allowed and affordable,",
  "and each deal can be made only once while he stays unhappy.",
  "Decide like a sensible real manager with YOUR personality: look after the players you need and do not waste money on players you can do without.",
  "Answer with exactly one JSON object and nothing else.",
].join(" ");

function czk(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} CZK`;
}

/** Nálada slovy, jako ji vidí člověk v panelu hráče (číslo nespokojenosti hra neukazuje). */
export function moodText(level: number): string {
  if (level >= 70) return "very angry, his head is elsewhere";
  if (level >= ANGRY_LEVEL) return "angry";
  if (level >= CALM_ENOUGH_LEVEL) return "still simmering";
  return "almost calm";
}

const REASON_TEXT: Record<UnrestReason, string> = {
  // „Peníze“ jsou výše odstupného (jak moc ho klub chtěl), ne jeho plat (unrest-reasons.ts).
  money: "the big fee showed how much they wanted him",
  better_club: "a better club",
  minutes: "he plays too little",
  coach: "his relationship with you",
  morale: "the bad mood in the club",
};

const IMPORTANCE_TEXT: Record<SquadImportance, string> = {
  key: "key player (regular starter, hard to replace)",
  rotation: "squad player (rotation or backup)",
  surplus: "surplus (you can do without him)",
};

function optionText(o: UnrestOption, p: UnrestCandidate): string {
  switch (o.id) {
    case "bonus":
      return `one-off bonus of ${czk(o.cost)} from the club budget; reliably calms a player who was after the money`;
    case "raise_wage":
      return `raise his weekly wage by 30 % for good (${czk(p.weeklyWage)} to ${czk(p.weeklyWage + o.weeklyCost)} a week, once a season); calms him strongly`;
    case "promise_minutes":
      return "promise him a starting place: your lineup will start him in your next matches until he has started 2 of 3, even where a better player would play; calms him";
    case "promise_transfer":
      return "promise to sell him when the next decent offer comes within 30 days; refusing such an offer later makes him furious";
    case "captaincy":
      return "make him team captain (the current captain loses the armband); keeps an ambitious player";
    case "personal_talk":
      return `take him for a beer and talk it through (${czk(o.cost)}); improves his relationship with you and calms him a bit`;
    case "appeal_loyalty":
      return "appeal to his love for the club, free; works on a player who cares about the club";
    case "tough_love":
      return "tell him off and demand hard work, free; a disciplined player takes it to heart, calms him a little";
    case "release":
      return `let him go: ${o.sale?.club ?? "the club"} sends its ${czk(o.sale?.amount ?? 0)} offer again and you accept it; he leaves the club for good and you get the fee`;
  }
}

function whyText(p: UnrestCandidate): string {
  const reasons = p.reasons.map((r) => REASON_TEXT[r]).join(", ");
  if (!p.offer) return reasons ? `he wants to leave: ${reasons}` : "he wants to leave the club";
  return `you refused ${czk(p.offer.amount)} from ${p.offer.club}${reasons ? `; he wanted to go because of: ${reasons}` : ""}`;
}

function playerLines(p: UnrestCandidate): string[] {
  const where = p.onLoanElsewhere ? ", now on loan at another club" : p.inU21 ? ", plays for your U21 team" : "";
  return [
    `${p.key} ${p.name}, ${p.age}, ${p.position}, rating ${Math.round(p.rating)}, ${IMPORTANCE_TEXT[p.importance]}${where}; weekly wage ${czk(p.weeklyWage)}.`,
    `- mood: ${moodText(p.level)}`,
    `- why: ${whyText(p)}`,
    `- deals already made with him this time: ${p.dealsDone.length ? p.dealsDone.join(", ") : "none"}`,
    "- options:",
    ...p.options.map((o) => `  "${o.id}": ${optionText(o, p)}`),
    `  "wait": no deal today`,
  ];
}

export function renderUnrestPrompt(ctx: UnrestDecisionContext): string {
  const p = ctx.profile;
  return [
    "YOUR PERSONALITY (0-100):",
    `ambition ${p.ambition}, thrift ${p.thrift}, youth focus ${p.youthFocus}, risk ${p.risk}, patience ${p.patience}, trading ${p.trading}.`,
    `YOUR STYLE: ${styleText(p)}`,
    "",
    `CLUB ${ctx.teamName}: budget ${czk(ctx.budget)}; you keep ${czk(ctx.reserve)} as a reserve for running costs, so ${czk(ctx.spendable)} is free to spend. Your best eleven averages rating ${ctx.top11Average.toFixed(1)}.`,
    "",
    "UNHAPPY PLAYERS:",
    ...ctx.players.flatMap((pl) => [...playerLines(pl), ""]),
    'Return {"decisions": [{"player": "P1", "action": one of that player\'s options, "reason": "one short English sentence"}], "reasoning": "max 30 words"} with exactly one entry for each player.',
  ].join("\n");
}

/** Schéma odpovědi. Výčty nejsou nikdy prázdné: aspoň jeden hráč a vždy „wait“. */
export function unrestDecisionSchema(ctx: UnrestDecisionContext): Record<string, unknown> {
  const actions = ["wait", ...new Set(ctx.players.flatMap((p) => p.options.map((o) => o.id)))];
  return {
    type: "object",
    properties: {
      decisions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            player: { type: "string", enum: ctx.players.map((p) => p.key) },
            action: { type: "string", enum: actions },
            reason: { type: "string" },
          },
          required: ["player", "action", "reason"],
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
 * Volby modelu, které prošly: známý hráč a dohoda z jeho nabídky (nebo „wait“). Ostatní
 * se zahodí a zapíšou do `rejected`. Null = odpověď nemá tvar rozhodnutí vůbec.
 */
export function validateUnrestDecision(raw: unknown, ctx: UnrestDecisionContext): UnrestValidation | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const list = (raw as Record<string, unknown>).decisions;
  if (!Array.isArray(list)) return null;
  const byKey = new Map(ctx.players.map((p) => [p.key, p]));
  const chosen = new Map<string, { action: UnrestChoice; reason: string }>();
  const rejected: string[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      rejected.push("položka není objekt");
      continue;
    }
    const r = item as Record<string, unknown>;
    const key = typeof r.player === "string" ? r.player.trim() : "";
    const player = byKey.get(key);
    if (!player) {
      rejected.push(`neznámý hráč ${String(r.player)}`);
      continue;
    }
    if (chosen.has(key)) {
      rejected.push(`${key} podruhé`);
      continue;
    }
    const action = typeof r.action === "string" ? r.action.trim() : "";
    if (action !== "wait" && !player.options.some((o) => o.id === action)) {
      rejected.push(`${key}: ${action || "bez dohody"} není v nabídce`);
      continue;
    }
    chosen.set(key, { action: action as UnrestChoice, reason: cleanReason(r.reason) });
  }
  for (const p of ctx.players) {
    if (!chosen.has(p.key) && !rejected.some((x) => x.startsWith(`${p.key}:`))) rejected.push(`${p.key}: chybí`);
  }
  return { chosen, rejected };
}

/**
 * Náhradní pravidlo podle povahy. Skoro klidného hráče nechá být, obchodník pustí hráče,
 * bez kterého se obejde, apel a páska jdou zadarmo, trpělivý trenér slibuje a mluví,
 * šetrný platí jen oporám (skrblík ani těm) a přebytečnému hráči nedá nic, co stojí peníze.
 */
export function fallbackUnrestChoice(p: UnrestCandidate, profile: AiCoachProfile): UnrestChoice {
  const legal = new Set(p.options.map((o) => o.id));
  if (p.level < CALM_ENOUGH_LEVEL) return "wait";
  if (legal.has("release") && p.importance !== "key"
    && (profile.trading >= 55 || (p.importance === "surplus" && profile.trading >= 35))) {
    return "release";
  }
  const needed = p.importance !== "surplus";
  const patient = profile.patience >= 60 || (profile.youthFocus >= 60 && p.age <= 21);
  const pays = p.importance === "key" ? profile.thrift < 80 : needed && p.level >= ANGRY_LEVEL && profile.thrift < 50;
  const order: UnrestActionId[] = ["appeal_loyalty"];
  if (p.importance === "key") order.push("captaincy");
  if (patient && needed) order.push("promise_minutes", "personal_talk");
  if (pays) order.push(...(p.importance === "key" ? ["raise_wage", "bonus"] as const : ["bonus", "raise_wage"] as const));
  if (needed) order.push("personal_talk");
  order.push("tough_love");
  return order.find((a) => legal.has(a)) ?? "wait";
}

/** Rozhodnutí pro každého hráče: volba modelu, kde prošla, jinak náhradní pravidlo. */
export function resolveUnrestDecisions(ctx: UnrestDecisionContext, validation: UnrestValidation | null): UnrestPlayerDecision[] {
  return ctx.players.map((p) => {
    const pick = validation?.chosen.get(p.key);
    if (pick) return { key: p.key, playerId: p.playerId, action: pick.action, reason: pick.reason, decidedBy: "model" };
    return { key: p.key, playerId: p.playerId, action: fallbackUnrestChoice(p, ctx.profile), reason: "fallback", decidedBy: "fallback" };
  });
}
