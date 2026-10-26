/**
 * Výběr firmy, se kterou AI klub začne jednat o hlavním sponzorovi nebo o názvu stadionu, modelem.
 * Čisté funkce bez databáze: popis situace pro model, schéma odpovědi a kontrola, že model
 * vybral jen z nabídnutých firem.
 *
 * Co je počítání a pravidla, hlídá kód (main-sponsor.ts): nabídku tvoří jen firmy z okresu,
 * se kterými jde teď jednat stejně jako u člověka (`negotiationAvailability`), a peníze jsou
 * stejný odhad, jaký manažer vidí u firmy na webu. Model jen volí, kterou firmu oslovit,
 * nebo že tento týden nikoho. Bez platné odpovědi platí pořadí náhradního pravidla podle povahy.
 * Samotné jednání (podepsat, smlouvat, odejít) rozhoduje model tah po tahu
 * (sponsor-negotiation-decision.ts).
 */

import type { NegotiationCategory } from "../sponsors/negotiation";
import type { OwnerPersonality } from "../sponsors/owners";
import { favorBand, type FavorBand } from "../sponsors/overview";
import type { AiCoachProfile } from "./profile";
import { styleText } from "./weekly-decision";

/** Volba „tento týden nikoho neoslovit“. */
export const NO_SPONSOR_CHOICE = "none";

/** Firma, kterou model může oslovit. */
export interface MainSponsorOption {
  /** Klíč pro model (F1, F2…). */
  key: string;
  sponsorId: number;
  name: string;
  /** Obor firmy (`district_sponsors.type`). */
  type: string;
  /** Povaha majitele; null = nejde zjistit. */
  ownerPersonality: OwnerPersonality | null;
  /** Náklonnost firmy ke klubu (0–100), stejná, jakou vidí manažer. */
  favor: number;
  /** Odhad, kolik by firma v této kategorii dala měsíčně bez slibů (rozmezí jako na webu). */
  monthlyLow: number;
  monthlyHigh: number;
  /** Se sliby až tolik měsíčně. */
  monthlyCap: number;
  /** Dosavadní sponzor v kategorii: smlouva je prodloužení a klub (stadion) se nepřejmenuje. */
  renewal: boolean;
}

/** Tabulka a finance z pondělní správy (bez nich model ví jen rozpočet a reputaci). */
export interface MainSponsorClubInfo {
  league: { position: number | null; teams: number | null; points: number | null; played: number } | null;
  weeklyRunningCost: number | null;
  weeklyIncome: number | null;
}

export interface MainSponsorContext extends MainSponsorClubInfo {
  /** Hlavní sponzor (název klubu), nebo název stadionu. */
  category: NegotiationCategory;
  teamName: string;
  profile: AiCoachProfile;
  budget: number;
  reputation: number;
  options: MainSponsorOption[];
}

export interface MainSponsorDecision {
  /** Klíč nabídnuté firmy, nebo NO_SPONSOR_CHOICE. */
  key: string;
  /** null = tento týden nikoho neoslovit. */
  sponsorId: number | null;
  reason: string;
}

const CHOICE_TEXT: Record<NegotiationCategory, { situation: string; money: string; naming: string; companies: string; none: string; renewal: string }> = {
  main: {
    situation: "Your club has no main sponsor, and this week you may approach one local company to become it.",
    money: "monthly money",
    naming: "A new main sponsor puts its name into the club's name; renewing with your previous main sponsor keeps the name.",
    companies: "money as the main sponsor",
    none: "then the club gets no sponsor money until next Monday",
    renewal: "your previous main sponsor, renewing keeps the club name",
  },
  stadium: {
    situation: "Your stadium has no naming sponsor, and this week you may approach one local company to name it.",
    money: "monthly money (about half of what a main sponsor pays)",
    naming: "The stadium then carries the company's name and the club keeps its own; renewing with your previous stadium sponsor keeps the stadium name. Any company may name your stadium, even your main sponsor.",
    companies: "money for naming your stadium",
    none: "then the stadium brings no sponsor money until next Monday",
    renewal: "your previous stadium sponsor, renewing keeps the stadium name",
  },
};

export function sponsorChoiceSystemPrompt(category: NegotiationCategory): string {
  const t = CHOICE_TEXT[category];
  return [
    "You are the head coach and manager of an amateur Czech district football club in a football management game.",
    t.situation,
    `Its owner then makes an opening offer: ${t.money}, often a signing bonus, and his wishes as promises (a broken promise costs a penalty).`,
    "You can sign it or negotiate better terms in a few rounds, like a human manager.",
    t.naming,
    "Decide like a sensible real manager with YOUR personality. The game has already checked the rules, so every listed company is willing to talk now.",
    "Answer with exactly one JSON object and nothing else.",
  ].join(" ");
}

export const MAIN_SPONSOR_SYSTEM_PROMPT = sponsorChoiceSystemPrompt("main");

function czk(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} CZK`;
}

/** Co majitel podle povahy chce (přání z sponsors/wishes.ts), ať model ví, jaké sliby podepíše. */
export const OWNER_TEXT: Record<OwnerPersonality, string> = {
  patriot: "a patriot who loves the local club and wishes for young players in the team, calm stands and a good reputation",
  businessman: "a businessman who counts every crown and wishes for a full stadium and exclusivity for his business",
  fan: "a fan who lives for results and wishes for a good league position, promotion or a cup run",
  cautious: "a cautious owner who hates risk and scandals and wishes for no relegation, a good reputation and calm stands",
};

export const FAVOR_TEXT: Record<FavorBand, string> = {
  loves: "loves your club",
  friendly: "friendly",
  neutral: "neutral",
  cold: "cold",
  hostile: "hostile",
};

function optionLine(o: MainSponsorOption, category: NegotiationCategory): string {
  const owner = o.ownerPersonality ? OWNER_TEXT[o.ownerPersonality] : "unknown";
  const renewal = o.renewal ? `; ${CHOICE_TEXT[category].renewal}` : "";
  return `- "${o.key}": ${o.name}, ${o.type.replace(/_/g, " ")}; owner: ${owner}; favour ${o.favor}/100 (${FAVOR_TEXT[favorBand(o.favor)]}); `
    + `about ${czk(o.monthlyLow)} to ${czk(o.monthlyHigh)} a month without promises, up to ${czk(o.monthlyCap)} a month with promises${renewal}`;
}

export function renderMainSponsorPrompt(ctx: MainSponsorContext): string {
  const p = ctx.profile;
  const league = ctx.league
    ? `, ${ctx.league.position ? `table position ${ctx.league.position}/${ctx.league.teams}, ${ctx.league.points} pts after ${ctx.league.played} matches` : "season just started"}`
    : "";
  const money = ctx.weeklyRunningCost !== null && ctx.weeklyIncome !== null
    ? `. Weekly running costs about ${czk(ctx.weeklyRunningCost)}, weekly income about ${czk(ctx.weeklyIncome)}`
    : "";
  return [
    "YOUR PERSONALITY (0-100):",
    `ambition ${p.ambition}, thrift ${p.thrift}, risk ${p.risk}, patience ${p.patience}, youth focus ${p.youthFocus}.`,
    `YOUR STYLE: ${styleText(p)}`,
    "",
    `CLUB ${ctx.teamName}: reputation ${ctx.reputation}/100${league}.`,
    `MONEY: budget ${czk(ctx.budget)}${money}.`,
    "",
    `COMPANIES from your district that would talk to you now (key: company, business, owner, favour toward your club, ${CHOICE_TEXT[ctx.category].companies}):`,
    ...ctx.options.map((o) => optionLine(o, ctx.category)),
    "",
    `You may also approach nobody this week ("${NO_SPONSOR_CHOICE}"): ${CHOICE_TEXT[ctx.category].none}.`,
    "",
    "Which company do you approach?",
    `Return {"choice": one of the keys or "${NO_SPONSOR_CHOICE}", "reason": "one short English sentence"}.`,
  ].join("\n");
}

/** Enum nikdy není prázdný (Workers AI nesplnitelné schéma odmítne): „none“ je v něm vždy. */
export function mainSponsorSchema(ctx: MainSponsorContext): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      choice: { type: "string", enum: [...ctx.options.map((o) => o.key), NO_SPONSOR_CHOICE] },
      reason: { type: "string" },
    },
    required: ["choice", "reason"],
    additionalProperties: false,
  };
}

function cleanReason(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, 300) : "";
}

/**
 * Model smí vybrat jen nabídnutou firmu (klíčem, nebo přesným názvem) nebo „none“.
 * Cokoli jiného je neplatné: null, a rozhodne náhradní pravidlo.
 */
export function validateMainSponsorChoice(raw: unknown, ctx: MainSponsorContext): MainSponsorDecision | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.choice !== "string") return null;
  const choice = r.choice.trim().toLowerCase();
  const reason = cleanReason(r.reason);
  if (choice === NO_SPONSOR_CHOICE) return { key: NO_SPONSOR_CHOICE, sponsorId: null, reason };
  const option = ctx.options.find((o) => o.key.toLowerCase() === choice)
    ?? ctx.options.find((o) => o.name.trim().toLowerCase() === choice);
  return option ? { key: option.key, sponsorId: option.sponsorId, reason } : null;
}
