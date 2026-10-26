/**
 * Pozvání majitelů firem do VIP lóže na domácí zápas AI klubu modelem. Čisté funkce bez databáze:
 * popis situace pro model, schéma odpovědi, kontrola odpovědi a náhradní pravidlo podle povahy.
 *
 * Co je pravidlo a počítání, hlídá kód (sponsor-invites.ts): zve se jen na nejbližší domácí zápas
 * (stejně jako člověk), jen když má klub použitelnou VIP lóži, a nejvýš tolik hostů, kolik lóže
 * pojme (úroveň lóže, MAX_GUESTS_PER_LEVEL na úroveň, minus už přijatá pozvání na zápas). Nabídnou
 * se jen majitelé, které jde pozvat (vlastní okres, ten den nejdou k jinému klubu, na tenhle zápas
 * ještě nezvaní) a jejichž dárek se vejde nad rezervu. Model vybere koho, nebo nikoho. Pozvání
 * provede stejná služba jako u člověka (sponsors/invitations.ts).
 */

import type { OwnerPersonality } from "../sponsors/owners";
import { favorBand } from "../sponsors/overview";
import { cleanReason, czk, isRecord } from "./buy-decision";
import { FAVOR_TEXT, OWNER_TEXT } from "./main-sponsor-decision";
import type { AiCoachProfile } from "./profile";
import { styleText } from "./weekly-decision";

/** Nejnižší úroveň VIP lóže, se kterou AI klub zve. */
export const MIN_VIP_BOX_LEVEL = 1;
/** Kolik hostů pojme lóže na jednu úroveň. */
export const MAX_GUESTS_PER_LEVEL = 1;
/** Kolik majitelů model nejvýš uvidí. */
export const MAX_INVITE_OPTIONS = 8;

/** Co klub s firmou má. */
export type InviteRelation = "main" | "stadium" | "banner" | null;

/** Majitel, kterého jde pozvat. */
export interface InviteOption {
  /** Klíč pro model (O1, O2…). */
  key: string;
  sponsorId: number;
  name: string;
  type: string;
  owner: OwnerPersonality;
  favor: number;
  giftCost: number;
  relation: InviteRelation;
  /** Smlouva hlavního sponzora nebo stadionu s firmou letos končí (brzy se bude jednat o prodloužení). */
  contractEnding: boolean;
  /** Firma je hlavním sponzorem jiného klubu (hlavním sponzorem tohoto klubu teď být nemůže). */
  mainElsewhere: boolean;
  /** Odhad, kolik by firma dala měsíčně jako hlavní sponzor bez slibů (rozmezí jako na webu). */
  mainMonthly: { low: number; high: number };
}

export interface InviteContext {
  teamName: string;
  profile: AiCoachProfile;
  budget: number;
  /** Kolik smí dárky stát nad rezervou. */
  spendable: number;
  match: { matchId: string; day: string; opponentName: string; daysAhead: number };
  vipBoxLevel: number;
  /** Kolik hostů lóže na tenhle zápas ještě pojme. */
  seats: number;
  /** O kolik procentních bodů lóže zvedá šanci, že majitel přijme. */
  vipAcceptancePoints: number;
  /** Kolik náklonnosti lóže přidá hostovi po zápase. */
  vipFavorBonus: number;
  recentLosses: number;
  options: InviteOption[];
}

export interface InviteDecision {
  /** Klíče pozvaných majitelů v pořadí (prázdné = nikoho). */
  keys: string[];
  reason: string;
}

export type InviteCheck = { ok: true; decision: InviteDecision } | { ok: false; reason: string };

/** Kolik hostů lóže pojme na zápas, když už `accepted` pozvání přijali. */
export function guestSeats(vipBoxLevel: number, accepted: number): number {
  if (vipBoxLevel < MIN_VIP_BOX_LEVEL) return 0;
  return Math.max(0, vipBoxLevel * MAX_GUESTS_PER_LEVEL - accepted);
}

export const INVITE_SYSTEM_PROMPT = [
  "You are the head coach and manager of an amateur Czech district football club in a football management game.",
  "You decide whether to invite owners of local companies to watch your next home match from your VIP box, as a human manager can.",
  "An invitation costs a gift paid at once, whether the owner accepts or not; an owner who comes likes your club more,",
  "and an owner who likes your club pays more and is more patient when you negotiate a sponsorship.",
  "Decide like a sensible real manager with YOUR personality. The game has already checked the rules and the money, so every listed owner can be invited.",
  "Answer with exactly one JSON object and nothing else.",
].join(" ");

function weekday(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

function relationText(o: InviteOption): string {
  const parts: string[] = [];
  if (o.relation === "main") parts.push(`your main sponsor${o.contractEnding ? ", the contract ends this season" : ""}`);
  else if (o.relation === "stadium") parts.push(`names your stadium${o.contractEnding ? ", the contract ends this season" : ""}`);
  else if (o.relation === "banner") parts.push("has a banner at your ground");
  else parts.push("no contract with you yet");
  if (o.mainElsewhere) parts.push("main sponsor of another club");
  else if (o.relation !== "main") parts.push(`could pay about ${czk(o.mainMonthly.low)} to ${czk(o.mainMonthly.high)} a month as your main sponsor`);
  return parts.join("; ");
}

function optionLine(o: InviteOption): string {
  return `- "${o.key}": ${o.name}, ${o.type.replace(/_/g, " ")}; owner: ${OWNER_TEXT[o.owner]}; favour ${o.favor}/100`
    + ` (${FAVOR_TEXT[favorBand(o.favor)]}); gift ${czk(o.giftCost)}; ${relationText(o)}`;
}

export function renderInvitePrompt(c: InviteContext): string {
  const p = c.profile;
  const guests = `${c.seats} more guest${c.seats === 1 ? "" : "s"}`;
  return [
    "YOUR PERSONALITY (0-100):",
    `ambition ${p.ambition}, thrift ${p.thrift}, risk ${p.risk}, patience ${p.patience}, youth focus ${p.youthFocus}.`,
    `YOUR STYLE: ${styleText(p)}`,
    "",
    `CLUB ${c.teamName}: budget ${czk(c.budget)}; gifts may cost at most ${czk(c.spendable)} this week, the rest is your reserve.`,
    `NEXT HOME MATCH: ${weekday(c.match.day)} ${c.match.day} against ${c.match.opponentName}, in ${c.match.daysAhead} day${c.match.daysAhead === 1 ? "" : "s"}.`
      + ` You lost ${c.recentLosses} of your last 5 matches.`,
    `YOUR VIP BOX (level ${c.vipBoxLevel}) has room for ${guests} at this match. An owner invited to the box accepts more often`
      + ` (+${c.vipAcceptancePoints} percentage points) and gains ${c.vipFavorBonus} more favour after the match.`,
    "",
    "If an owner accepts, his favour toward your club rises at once (a patriot +5, others +3); after the match a win adds favour"
      + " (a fan counts it twice), a draw a little, a defeat costs a little.",
    "Favour pays off in sponsorship talks: an owner who loves your club has up to about 20 % more money for you than a neutral one,"
      + " more patience, and you can read his budget more precisely; a cold owner has up to 20 % less.",
    "Who accepts: the higher his favour the likelier; a patriot comes gladly, a cautious owner hesitates, a fan stays away after a losing run.",
    "",
    "OWNERS you can invite (key: company, business, owner, favour toward your club, gift, what the company is to your club):",
    ...c.options.map(optionLine),
    "",
    `Invite at most ${c.seats} owner${c.seats === 1 ? "" : "s"}, or nobody.`,
    'Return {"invite": [keys of the owners you invite, or empty], "reason": "one short English sentence"}.',
  ].join("\n");
}

/** Enum klíčů nikdy není prázdný: model se ptá, jen když je koho pozvat. */
export function inviteSchema(c: InviteContext): Record<string, unknown> {
  const keys = c.options.map((o) => o.key);
  return {
    type: "object",
    properties: {
      invite: { type: "array", items: keys.length > 0 ? { type: "string", enum: keys } : { type: "string" } },
      reason: { type: "string" },
    },
    required: ["invite", "reason"],
    additionalProperties: false,
  };
}

/**
 * Model smí pozvat jen nabídnuté majitele (klíčem), nejvýš tolik, kolik lóže pojme, a jen za dárky,
 * které se vejdou nad rezervu. Opakovaný klíč se sloučí. Jinak důvod pro deník a rozhodne pravidlo.
 */
export function checkInvite(raw: unknown, c: InviteContext): InviteCheck {
  if (!isRecord(raw)) return { ok: false, reason: "odpověď není objekt" };
  if (!Array.isArray(raw.invite)) return { ok: false, reason: "pozvaní nejsou seznam" };
  const keys: string[] = [];
  for (const item of raw.invite) {
    const key = typeof item === "string" ? item.trim().toUpperCase() : "";
    if (!c.options.some((o) => o.key === key)) return { ok: false, reason: `majitel ${String(item).slice(0, 40)} není v nabídce` };
    if (!keys.includes(key)) keys.push(key);
  }
  if (keys.length > c.seats) return { ok: false, reason: `pozvaných ${keys.length}, lóže pojme ${c.seats}` };
  const cost = keys.reduce((s, k) => s + (c.options.find((o) => o.key === k)?.giftCost ?? 0), 0);
  if (cost > c.spendable) return { ok: false, reason: `dárky ${cost} Kč nad možnosti ${c.spendable} Kč` };
  return { ok: true, decision: { keys, reason: cleanReason(raw.reason) } };
}

/**
 * Náhradní pravidlo podle povahy. Šetrný trenér (šetrnost aspoň 70) nezve nikoho, štědrý (nejvýš 30)
 * zaplní lóži, ostatní pozvou jednoho. Přednost má majitel firmy, které letos končí smlouva (brzy
 * se bude jednat o prodloužení), pak současní sponzoři; dál ambiciózní trenér (aspoň 50) zve
 * firmy s největšími penězi, ostatní ty, které klub už mají rády. Hlavní sponzor jiného klubu
 * bez vlastní smlouvy jde na konec. Jen dokud se dárky vejdou nad rezervu.
 */
export function fallbackInvite(c: InviteContext): InviteDecision {
  const p = c.profile;
  if (p.thrift >= 70 || c.seats <= 0) return { keys: [], reason: "fallback" };
  const want = p.thrift <= 30 ? c.seats : 1;
  const rank = (o: InviteOption): number[] => [
    o.contractEnding ? 0 : 1,
    o.relation === "main" || o.relation === "stadium" ? 0 : 1,
    o.mainElsewhere && o.relation === null ? 1 : 0,
    p.ambition >= 50 ? -o.mainMonthly.high : -o.favor,
    o.sponsorId,
  ];
  const ordered = [...c.options].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return 0;
  });
  const keys: string[] = [];
  let cost = 0;
  for (const o of ordered) {
    if (keys.length >= want) break;
    if (cost + o.giftCost > c.spendable) continue;
    keys.push(o.key);
    cost += o.giftCost;
  }
  return { keys, reason: "fallback" };
}
