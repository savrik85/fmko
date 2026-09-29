/**
 * Prosba o příspěvek: trenér napíše majiteli firmy o peníze na konkrétní účel.
 * Čisté vzorce bez DB (DB vrstva je v requests-db.ts).
 *
 * Kolik majitel dá, řídí náklonnost, vztah ke klubu (smlouva) a povaha vůči účelu. Od stropu
 * se odečte, co firma klubu dala za posledních REQUEST_WINDOW_DAYS dní (příspěvky za podpis,
 * zaplacené stavby a vybavení, dřívější prosby). Peníze jdou hned na účet a do SPEND_DAYS dní
 * je klub musí utratit na slíbený účel, jinak se majitel naštve a do konce sezóny nedá nic.
 */
import type { OwnerPersonality } from "./owners";
import type { TransactionType } from "../season/finance-processor";

export const REQUEST_PURPOSES = ["coach", "transfer", "equipment", "stadium", "youth"] as const;
export type RequestPurpose = (typeof REQUEST_PURPOSES)[number];

export function isRequestPurpose(v: unknown): v is RequestPurpose {
  return typeof v === "string" && (REQUEST_PURPOSES as readonly string[]).includes(v);
}

/** Účel v textu: „příspěvek na {label}". */
export const PURPOSE_LABELS: Record<RequestPurpose, string> = {
  coach: "vzdělání trenéra",
  transfer: "přestup",
  equipment: "vybavení",
  stadium: "stadion",
  youth: "mládež",
};

/** Které výdaje se počítají jako utracené na daný účel. */
export const PURPOSE_SPEND_TYPES: Record<RequestPurpose, readonly TransactionType[]> = {
  coach: ["coach_course", "coach_exam_retake", "course_fee"],
  transfer: ["transfer_fee", "signing_fee", "loan_fee", "transfer_admin_fee"],
  equipment: ["equipment_upgrade", "equipment_purchase"],
  stadium: ["stadium_upgrade", "pitch_upgrade", "stadium_visual"],
  youth: ["youth_academy"],
};

/** Co se počítá do „už dal": za kolik posledních herních dní. */
export const REQUEST_WINDOW_DAYS = 90;
/** Do kolika dní musí klub peníze utratit na slíbený účel. */
export const SPEND_DAYS = 30;
/** Další prosba stejnému majiteli dřív než za tolik dní ho naštve. */
export const REPEAT_DAYS = 14;
/** Pod touhle náklonností majitel nedá nic. */
export const MIN_FAVOR = 30;
/** Cizí majitel (bez smlouvy s klubem) dá jen od téhle náklonnosti. */
export const STRANGER_MIN_FAVOR = 60;

export const REFUSED_FAVOR = -2;
export const TOO_SOON_FAVOR = -4;
export const BROKEN_FAVOR = -15;

export type RequestRelation = "main" | "stadium" | "banner" | "none";

const RELATION_MULT: Record<RequestRelation, number> = { main: 1, stadium: 0.7, banner: 0.4, none: 0.25 };

/** Povaha vůči účelu: fanoušek rád zaplatí přestup, patriot mládež a stadion, obchodník to, co se vrátí. */
const PURPOSE_FIT: Record<OwnerPersonality, Record<RequestPurpose, number>> = {
  fan: { coach: 0.8, transfer: 1.3, equipment: 1.0, stadium: 0.9, youth: 0.9 },
  patriot: { coach: 0.9, transfer: 0.8, equipment: 1.0, stadium: 1.3, youth: 1.3 },
  businessman: { coach: 1.3, transfer: 0.9, equipment: 1.2, stadium: 1.0, youth: 0.7 },
  cautious: { coach: 0.9, transfer: 0.6, equipment: 0.8, stadium: 0.7, youth: 0.9 },
};

export function purposeFit(personality: OwnerPersonality, purpose: RequestPurpose): number {
  return PURPOSE_FIT[personality][purpose];
}

function floorHundreds(n: number): number {
  return Math.max(0, Math.floor(n / 100) * 100);
}

/**
 * Nejvíc, co majitel dá na účel za REQUEST_WINDOW_DAYS dní (před odečtením toho, co už dal).
 * `monthlyB` = měsíční rozpočet firmy pro klub jako hlavního sponzora (sponsorBudgetB, category main).
 */
export function requestCap(i: {
  monthlyB: number; favor: number; relation: RequestRelation; personality: OwnerPersonality; purpose: RequestPurpose;
}): number {
  if (i.favor < MIN_FAVOR) return 0;
  if (i.relation === "none" && i.favor < STRANGER_MIN_FAVOR) return 0;
  const warmth = (Math.min(100, i.favor) - MIN_FAVOR) / (100 - MIN_FAVOR);
  const months = 0.3 + 1.7 * warmth;
  return floorHundreds(i.monthlyB * RELATION_MULT[i.relation] * months * purposeFit(i.personality, i.purpose));
}

export type RequestRefusal = "broken" | "too_soon" | "dislike" | "stranger" | "exhausted";

/** Proč majitel teď nedá nic, ještě než klub řekne částku (null = jde požádat). */
export function requestBlock(i: {
  favor: number; relation: RequestRelation; lastRequestDaysAgo: number | null; brokenThisSeason: boolean;
}): RequestRefusal | null {
  if (i.brokenThisSeason) return "broken";
  if (i.lastRequestDaysAgo !== null && i.lastRequestDaysAgo < REPEAT_DAYS) return "too_soon";
  if (i.favor < MIN_FAVOR) return "dislike";
  if (i.relation === "none" && i.favor < STRANGER_MIN_FAVOR) return "stranger";
  return null;
}

/** Zbytek pod tímhle je pro majitele „už jsem ti dal dost". */
export function exhaustedBelow(cap: number): number {
  return Math.max(1000, 0.1 * cap);
}

export type RequestDecision =
  | { kind: "granted" | "partial"; amount: number }
  | { kind: "refused"; refusal: RequestRefusal };

export function decideRequest(i: {
  asked: number; cap: number; given: number; block: RequestRefusal | null;
}): RequestDecision {
  if (i.block) return { kind: "refused", refusal: i.block };
  const remaining = floorHundreds(i.cap - i.given);
  if (remaining < exhaustedBelow(i.cap)) return { kind: "refused", refusal: "exhausted" };
  if (i.asked <= remaining) return { kind: "granted", amount: i.asked };
  return { kind: "partial", amount: remaining };
}

/** O kolik se po odpovědi pohne náklonnost. Splněná prosba nestojí nic. */
export function requestFavorDelta(d: RequestDecision): number {
  if (d.kind !== "refused") return 0;
  return d.refusal === "too_soon" ? TOO_SOON_FAVOR : REFUSED_FAVOR;
}

export const MIN_ASK = 1000;
export const MAX_ASK = 5_000_000;
