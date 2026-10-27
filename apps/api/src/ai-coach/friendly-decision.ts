/**
 * Rozhodnutí AI trenéra o přátelácích modelem. Čisté funkce bez databáze: popis situace
 * pro model, schéma odpovědi a kontrola, že model vybral jen z nabídnutých možností.
 *
 * Co je počítání, hlídá kód (friendlies.ts): žádný soutěžní zápas den před a den po,
 * nejvýš dva domluvené přáteláky, sázka a náklady v mezích povahy. Model rozhoduje jen
 * tam, kde je víc přípustných možností: přijmout, nebo odmítnout výzvu, a jestli, kdy,
 * kde a o kolik vypsat vlastní nabídku. Při výpadku platí náhradní pravidlo podle povahy.
 */

import type { OfferVenue } from "../multiplayer/friendlies";
import type { AiCoachProfile } from "./profile";
import { styleText } from "./weekly-decision";

/** Soutěžní zápas poblíž termínu: posun ve dnech (záporný = před přátelákem) a druh. */
export interface NearbyMatch {
  offset: number;
  kind: string;
}

export interface FriendlyClubSnapshot {
  teamName: string;
  profile: AiCoachProfile;
  budget: number;
  /** Průměr hodnocení nejlepší jedenáctky. */
  strength: number | null;
  players: number;
  avgCondition: number | null;
  injured: number;
  upcomingFriendlies: number;
}

export interface FriendlyReplyContext extends FriendlyClubSnapshot {
  opponent: { name: string; human: boolean; strength: number | null };
  date: string;
  daysAhead: number;
  nearby: NearbyMatch[];
  /** Z pohledu AI klubu. */
  venue: "home" | "away" | "neutral";
  costPayer: "each" | "challenger";
  ourCosts: number;
  stake: number;
}

export interface FriendlyReplyDecision {
  accept: boolean;
  reason: string;
}

export interface FriendlyOfferDate {
  date: string;
  daysAhead: number;
  nearby: NearbyMatch[];
}

export interface FriendlyOfferContext extends FriendlyClubSnapshot {
  dates: FriendlyOfferDate[];
  venues: OfferVenue[];
  stakes: number[];
}

export interface FriendlyOfferDecision {
  post: boolean;
  date: string;
  venue: OfferVenue;
  stake: number;
  reason: string;
}

export const FRIENDLY_SYSTEM_PROMPT = [
  "You are the head coach and manager of an amateur Czech district football club in a football management game.",
  "You decide about friendly matches: answering challenges from other clubs and posting your own public offers.",
  "A friendly gives match practice to players who do not play much, but it tires the squad and carries injury risk;",
  "each club pays its share of the costs (referee, travel or pitch rent) and an optional stake goes to the winner.",
  "A competitive match the day before or after means tired legs, but amateur clubs often play such a friendly with the reserves, especially when the challenger pays the costs.",
  "Decide like a sensible real manager with YOUR personality. The game has already checked the schedule, the money and the stake limits, so every listed option is allowed.",
  "Answer with exactly one JSON object and nothing else.",
].join(" ");

function czk(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} CZK`;
}

function weekday(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

const KIND_TEXT: Record<string, string> = { league: "league match", cup: "cup match", tournament: "tournament match" };

function nearbyText(nearby: NearbyMatch[]): string {
  if (nearby.length === 0) return "no competitive match within 3 days";
  return nearby
    .map((n) => `${KIND_TEXT[n.kind] ?? "competitive match"} ${Math.abs(n.offset)} day${Math.abs(n.offset) === 1 ? "" : "s"} ${n.offset < 0 ? "before" : "after"}`)
    .join(", ");
}

function strengthText(own: number | null, other: number | null): string {
  if (own === null || other === null) return "strength unknown";
  const diff = other - own;
  const word = diff >= 5 ? "clearly stronger" : diff >= 2 ? "a bit stronger" : diff <= -5 ? "clearly weaker" : diff <= -2 ? "a bit weaker" : "about as strong";
  return `strength ${other.toFixed(1)} vs your ${own.toFixed(1)}: ${word} than you`;
}

function clubLines(ctx: FriendlyClubSnapshot): string[] {
  const p = ctx.profile;
  return [
    "YOUR PERSONALITY (0-100):",
    `ambition ${p.ambition}, thrift ${p.thrift}, risk ${p.risk}, patience ${p.patience}, youth focus ${p.youthFocus}.`,
    `YOUR STYLE: ${styleText(p)}`,
    "",
    `CLUB ${ctx.teamName}: budget ${czk(ctx.budget)}, strength ${ctx.strength !== null ? ctx.strength.toFixed(1) : "unknown"} (average rating of the best eleven).`,
    `SQUAD: ${ctx.players} players, average condition ${ctx.avgCondition !== null ? `${Math.round(ctx.avgCondition)} %` : "unknown"}, injured ${ctx.injured}. Friendlies already agreed: ${ctx.upcomingFriendlies}.`,
  ];
}

export function renderFriendlyReplyPrompt(ctx: FriendlyReplyContext): string {
  const venue = ctx.venue === "home" ? "at your ground" : ctx.venue === "away" ? "away, at their ground" : "on a neutral ground";
  const costs = ctx.costPayer === "challenger" ? "the challenger pays all costs" : "each club pays its own share";
  return [
    ...clubLines(ctx),
    "",
    `CHALLENGE from ${ctx.opponent.name} (${ctx.opponent.human ? "managed by a human player" : "managed by another computer coach"}), ${strengthText(ctx.strength, ctx.opponent.strength)}.`,
    `- date ${ctx.date} (${weekday(ctx.date)}), in ${ctx.daysAhead} day${ctx.daysAhead === 1 ? "" : "s"}; ${nearbyText(ctx.nearby)}`,
    `- venue: ${venue}`,
    `- costs: ${costs}; your share ${czk(ctx.ourCosts)}`,
    `- stake: ${ctx.stake > 0 ? `${czk(ctx.stake)} from each club, the winner takes both` : "no stake"}`,
    "",
    "Do you accept this friendly?",
    'Return {"accept": true or false, "reason": "one short English sentence"}.',
  ].join("\n");
}

export const FRIENDLY_REPLY_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    accept: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["accept", "reason"],
  additionalProperties: false,
};

function cleanReason(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, 300) : "";
}

export function validateFriendlyReply(raw: unknown): FriendlyReplyDecision | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.accept !== "boolean") return null;
  return { accept: r.accept, reason: cleanReason(r.reason) };
}

const VENUE_TEXT: Record<OfferVenue, string> = {
  poster: "at your ground",
  neutral: "on a neutral ground",
  taker: "at the ground of the club that takes the offer",
};

export function renderFriendlyOfferPrompt(ctx: FriendlyOfferContext): string {
  return [
    ...clubLines(ctx),
    "",
    "You may post a public friendly offer now; any club in the game can take it. Post only if a friendly in that period helps your team.",
    "DATES you can offer (none has a competitive match the day before or after):",
    ...ctx.dates.map((d) => `- "${d.date}" (${weekday(d.date)}), in ${d.daysAhead} days; ${nearbyText(d.nearby)}`),
    `VENUES: ${ctx.venues.map((v) => `"${v}" = ${VENUE_TEXT[v]}`).join(", ")}.`,
    `STAKES you can offer (CZK from each club, the winner takes both): ${ctx.stakes.join(", ")}.`,
    "",
    'Return {"post": true or false, "date": one of the dates, "venue": one of the venues, "stake": one of the stakes, "reason": "one short English sentence"}.',
  ].join("\n");
}

export function friendlyOfferSchema(ctx: FriendlyOfferContext): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      post: { type: "boolean" },
      date: { type: "string", enum: ctx.dates.map((d) => d.date) },
      venue: { type: "string", enum: [...ctx.venues] },
      stake: { type: "integer", enum: [...ctx.stakes] },
      reason: { type: "string" },
    },
    required: ["post", "date", "venue", "stake", "reason"],
    additionalProperties: false,
  };
}

/** Model smí vybrat jen nabídnutý termín, místo a sázku. Jinak null a platí náhradní pravidlo. */
export function validateFriendlyOffer(raw: unknown, ctx: FriendlyOfferContext): FriendlyOfferDecision | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.post !== "boolean") return null;
  const reason = cleanReason(r.reason);
  if (!r.post) return { post: false, date: ctx.dates[0]?.date ?? "", venue: ctx.venues[0] ?? "poster", stake: 0, reason };
  const stake = typeof r.stake === "string" ? Number(r.stake) : r.stake;
  if (typeof r.date !== "string" || !ctx.dates.some((d) => d.date === r.date)) return null;
  if (typeof r.venue !== "string" || !(ctx.venues as string[]).includes(r.venue)) return null;
  if (typeof stake !== "number" || !ctx.stakes.includes(stake)) return null;
  return { post: true, date: r.date, venue: r.venue as OfferVenue, stake, reason };
}
