/**
 * SMS od majitelů firem: pravidla bez DB. Kdy smí zpráva odejít, kolik stojí
 * odpověď a mlčení, kterého majitele vybrat.
 */
import { klasifikujOdpoved } from "../engine/fan-reactions";
import { gameExpiry } from "../lib/game-time";
import type { OwnerPersonality } from "./owners";
import type { OwnerSmsOccasion, ReplyTone } from "./owner-sms-texts";

/** Kolik herních dní majitel vůči jednomu klubu mlčí po odeslané SMS. */
export const OWNER_SMS_COOLDOWN_DAYS = 5;
/** Kolik herních dní má trenér na odpověď. */
export const OWNER_SMS_REPLY_DAYS = 3;
/** Od kolika proher v řadě se majitel ozve. */
export const LOSING_STREAK_MIN = 3;

export interface OccasionRule {
  /** Čeká majitel odpověď? Jen pak mlčení stojí náklonnost. */
  expectsReply: boolean;
  /** Nižší = důležitější, vyhrává při souběhu více kandidátů. */
  priority: number;
  /** Kolik herních dní po zařazení smí SMS ještě odejít (0 = jen ten den). */
  deliverDays: number;
}

export const OCCASION_RULES: Record<OwnerSmsOccasion, OccasionRule> = {
  riot: { expectsReply: true, priority: 1, deliverDays: 2 },
  sponsor_terminates: { expectsReply: false, priority: 2, deliverDays: 3 },
  scandal: { expectsReply: true, priority: 3, deliverDays: 3 },
  promise_broken: { expectsReply: true, priority: 4, deliverDays: 3 },
  main_lost: { expectsReply: true, priority: 5, deliverDays: 3 },
  after_loss: { expectsReply: true, priority: 6, deliverDays: 1 },
  after_win: { expectsReply: false, priority: 7, deliverDays: 1 },
  losing_streak: { expectsReply: true, priority: 8, deliverDays: 2 },
  match_eve: { expectsReply: false, priority: 9, deliverDays: 0 },
  promise_kept: { expectsReply: false, priority: 10, deliverDays: 3 },
  main_new: { expectsReply: false, priority: 11, deliverDays: 3 },
  season_complaint: { expectsReply: true, priority: 12, deliverDays: 3 },
  season_thanks: { expectsReply: false, priority: 13, deliverDays: 3 },
};

/** Není správná odpověď pro všechny: podnikateli sedí věcnost, fanouškovi srdce. */
const REPLY_FAVOR: Record<OwnerPersonality, Record<ReplyTone, number>> = {
  fan: { warm: 3, neutral: 0, dismissive: -4 },
  patriot: { warm: 2, neutral: 0, dismissive: -3 },
  businessman: { warm: 1, neutral: 2, dismissive: -2 },
  cautious: { warm: 2, neutral: 0, dismissive: -3 },
};

const IGNORE_FAVOR: Record<OwnerPersonality, number> = { fan: -2, patriot: -2, businessman: -1, cautious: -2 };

export function replyFavorDelta(personality: OwnerPersonality, tone: ReplyTone): number {
  return REPLY_FAVOR[personality][tone];
}

export function ignoreFavorDelta(personality: OwnerPersonality): number {
  return IGNORE_FAVOR[personality];
}

/**
 * Tón odpovědi napsané vlastními slovy. Stejný lexikální klasifikátor jako u vůdce
 * fanoušků (`klasifikujOdpoved`), bez modelu.
 */
export function classifyFreeReply(text: string): ReplyTone {
  const postoj = klasifikujOdpoved(text);
  if (postoj === "uklidnit") return "warm";
  if (postoj === "postavit_se") return "dismissive";
  return text.trim().length < 8 ? "dismissive" : "neutral";
}

/** Herní den + N dní, výstup YYYY-MM-DD. Vstup YYYY-MM-DD i celé ISO. */
export function addDays(day: string, n: number): string {
  return gameExpiry(`${day.slice(0, 10)}T00:00:00.000Z`, n).slice(0, 10);
}

/** Vzdálenost dvou herních dní v dnech, bez znaménka (rollover vrací čas zpátky). */
export function dayDiff(a: string, b: string): number {
  return Math.abs(Date.parse(`${a.slice(0, 10)}T00:00:00.000Z`) - Date.parse(`${b.slice(0, 10)}T00:00:00.000Z`)) / 86_400_000;
}

export interface PendingOwnerSms {
  id: string;
  sponsorId: number;
  occasion: OwnerSmsOccasion;
  createdDay: string;
}

export interface SentOwnerSms {
  sponsorId: number;
  occasion: OwnerSmsOccasion;
  sentDay: string;
}

function blockedByCooldown(c: PendingOwnerSms, s: SentOwnerSms, today: string): boolean {
  if (s.sponsorId !== c.sponsorId) return false;
  if (dayDiff(s.sentDay, today) >= OWNER_SMS_COOLDOWN_DAYS) return false;
  // Den před zápasem a zpráva po něm patří k sobě: „zítra jsem tam" i „to byl zápas".
  const afterMatch = c.occasion === "after_win" || c.occasion === "after_loss";
  return !(afterMatch && s.occasion === "match_eve");
}

/**
 * Která čekající SMS smí dnes odejít. Nejvýš jedna SMS od majitelů na klub a den,
 * majitel po své SMS OWNER_SMS_COOLDOWN_DAYS dní mlčí. Při souběhu vyhraje priorita.
 */
export function pickDeliverable(
  pending: readonly PendingOwnerSms[], sent: readonly SentOwnerSms[], today: string,
): PendingOwnerSms | null {
  const day = today.slice(0, 10);
  if (sent.some((s) => s.sentDay.slice(0, 10) === day)) return null;
  const sorted = [...pending].sort((a, b) =>
    OCCASION_RULES[a.occasion].priority - OCCASION_RULES[b.occasion].priority
    || a.createdDay.localeCompare(b.createdDay)
    || a.id.localeCompare(b.id));
  return sorted.find((c) => !sent.some((s) => blockedByCooldown(c, s, day))) ?? null;
}

export interface RelationshipOwner {
  sponsorId: number;
  personality: OwnerPersonality;
  favor: number;
  hasContract: boolean;
  isMain: boolean;
}

/**
 * Kdo z majitelů, se kterými má klub vztah, se ozve. Hlavní sponzor má přednost,
 * pak kdokoli se smlouvou, pak vyšší náklonnost. `only` zúží na jednu povahu,
 * `prefer` jí dá přednost i před hlavním sponzorem.
 */
export function pickRelationshipOwner(
  owners: readonly RelationshipOwner[], opts: { only?: OwnerPersonality; prefer?: OwnerPersonality } = {},
): RelationshipOwner | null {
  const pool = opts.only ? owners.filter((o) => o.personality === opts.only) : owners;
  const score = (o: RelationshipOwner) =>
    (opts.prefer && o.personality === opts.prefer ? 1000 : 0) + (o.isMain ? 500 : 0) + (o.hasContract ? 200 : 0) + o.favor;
  return [...pool].sort((a, b) => score(b) - score(a) || a.sponsorId - b.sponsorId)[0] ?? null;
}

/** Poděkování, nebo stížnost za sezónu: hranice 1,2 bodu na zápas. */
export function seasonVerdict(wins: number, draws: number, played: number): "season_thanks" | "season_complaint" | null {
  if (played <= 0) return null;
  return (3 * wins + draws) / played >= 1.2 ? "season_thanks" : "season_complaint";
}

/** Zápas z pohledu domácích. Remíza SMS nevyvolá. */
export function occasionForResult(our: number, their: number): "after_win" | "after_loss" | null {
  if (our > their) return "after_win";
  if (our < their) return "after_loss";
  return null;
}

/** Kolik proher v řadě od posledního zápasu (výsledky od nejnovějšího). */
export function leadingLosses(results: readonly ("W" | "D" | "L")[]): number {
  let n = 0;
  for (const r of results) {
    if (r !== "L") break;
    n++;
  }
  return n;
}
