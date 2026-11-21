/**
 * Sežeň mu práci (F8): trenér shání hráči místo u firmy, která klub sponzoruje nebo mu fandí.
 * Čisté vzorce bez DB (DB vrstva je v player-jobs-db.ts).
 *
 * Jestli firma hráče vezme, rozhoduje hra: oblíbenost klubu u majitele, vztah (smlouva),
 * povaha majitele a obor firmy (`district_sponsors.type`). Dělnický obor potřebuje ruce
 * a bere snáz, kancelář chce šikovné lidi, malá hospoda uživí za sezónu jednoho. Model jen
 * napíše odpověď majitele.
 *
 * Práce u sponzora má dopad na zápasy: šéf, který klub podporuje, hráče na zápas pustí
 * (`occupationMatchAbsence` se `sponsorJob`), takže směny ani přesčasy ho od zápasu neberou.
 */
import type { OwnerPersonality } from "./owners";
import type { RequestRelation } from "./requests";
import type { SponsorType } from "./types";

export type JobSource = "coach_sms" | "player_tip" | "unrest_deal";
export type JobRefusal = "dislike" | "stranger" | "full" | "too_soon" | "too_young" | "student" | "retired" | "already_hired";

type JobField = "labour" | "service" | "office" | "public";

const FIELD_BY_TYPE: Record<SponsorType, JobField> = {
  construction: "labour", woodwork: "labour", farm: "labour", industry: "labour", gardening: "labour",
  brewery: "labour", car_service: "labour",
  pub: "service", restaurant: "service", fast_food: "service", cafe: "service", bakery: "service", butcher: "service",
  grocery: "service", shop: "service", hospitality: "service", services: "service", car_dealer: "service", electro: "service",
  it: "office", ecommerce: "office", company: "office",
  municipality: "public", club: "public",
};

/** Jako co firma hráče vezme. Jen povolání z `generators/occupations.ts` (směny, výmluvy, fotky z práce). */
export const JOB_BY_TYPE: Record<SponsorType, string> = {
  construction: "Zedník", woodwork: "Truhlář", farm: "Traktorista", industry: "Svářeč", gardening: "Zahradník",
  brewery: "Skladník", car_service: "Automechanik",
  pub: "Číšník", restaurant: "Kuchař", fast_food: "Kuchař", cafe: "Číšník", bakery: "Pekař", butcher: "Řezník",
  grocery: "Prodavač", shop: "Prodavač", hospitality: "Číšník", services: "Skladník", car_dealer: "Automechanik",
  electro: "Elektrikář",
  it: "Úředník", ecommerce: "Skladník", company: "Skladník",
  municipality: "Zahradník", club: "Správce hřiště",
};

/** Řemesla, která firma z oboru vezme tak, jak jsou: tesař u stavební firmy zůstane tesařem. */
const TRADES: Partial<Record<SponsorType, readonly string[]>> = {
  construction: ["Zedník", "Tesař", "Pokrývač", "Malíř pokojů", "Instalatér", "Elektrikář"],
  woodwork: ["Truhlář", "Stolař", "Tesař", "Dělník v pile", "Dřevorubec", "Lesní dělník"],
  farm: ["Zemědělec", "Traktorista", "Kombajnér", "Chovatel", "Sezonní dělník"],
  industry: ["Svářeč", "Mistr v továrně", "Strojní inženýr", "Skladník", "Opravář"],
  gardening: ["Zahradník", "Sadař"],
  brewery: ["Skladník", "Řidič kamionu"],
  car_service: ["Automechanik", "Opravář"],
  car_dealer: ["Automechanik", "Obchodník"],
  electro: ["Elektrikář"],
  restaurant: ["Kuchař", "Číšník"],
  pub: ["Číšník", "Hospodský", "Barman"],
  hospitality: ["Číšník", "Kuchař", "Barman"],
  bakery: ["Pekař"],
  butcher: ["Řezník"],
  it: ["Programátor", "Účetní", "Úředník"],
  ecommerce: ["Skladník", "Kurýr", "Programátor"],
};

/** Kolik nových lidí firma za sezónu přibere (ze všech klubů dohromady). */
export const JOB_SLOTS_BY_TYPE: Record<SponsorType, number> = {
  construction: 3, woodwork: 3, farm: 3, industry: 3, company: 3,
  brewery: 2, car_service: 2, gardening: 2, electro: 2, ecommerce: 2, it: 2, services: 2, hospitality: 2,
  car_dealer: 2, municipality: 2,
  pub: 1, restaurant: 1, fast_food: 1, cafe: 1, bakery: 1, butcher: 1, grocery: 1, shop: 1, club: 1,
};

/** Pod touhle oblibou majitel hráče nevezme nikdy. */
export const JOB_MIN_FAVOR = 35;
/** Firma bez smlouvy bere jen klubu, kterému fandí. */
export const JOB_STRANGER_MIN_FAVOR = 75;
/** Po odmítnutí se na téhož hráče u stejné firmy dá zeptat znovu až po tolika dnech. */
export const JOB_REPEAT_DAYS = 14;
/** Za kolik herních dní po nástupu hráče si majitel řekne o protislužbu. */
export const JOB_FAVOR_AFTER_DAYS = 7;

const FIELD_FAVOR: Record<JobField, number> = { labour: 50, service: 58, office: 66, public: 55 };
const RELATION_ADJ: Record<RequestRelation, number> = { main: -10, stadium: -6, banner: -3, none: 12 };
/** Patriot a fanoušek vezmou kluka z klubu rádi, obchodník a opatrný chtějí jistotu. */
const PERSONALITY_ADJ: Record<OwnerPersonality, number> = { patriot: -5, fan: -5, businessman: 5, cautious: 5 };
const TRADE_ADJ = -10;

function fieldOf(type: string): JobField {
  return FIELD_BY_TYPE[type as SponsorType] ?? "service";
}

/** Povolání u firmy: řemeslník z oboru zůstane u svého, ostatní dostanou práci, kterou firma má. */
export function jobForFirm(type: string, previousOccupation: string): { occupation: string; tradeMatch: boolean } {
  const t = type as SponsorType;
  const own = JOB_BY_TYPE[t] ?? "Skladník";
  const tradeMatch = previousOccupation !== "" && (previousOccupation === own || (TRADES[t] ?? []).includes(previousOccupation));
  return { occupation: tradeMatch ? previousOccupation : own, tradeMatch };
}

/** Od jaké obliby firma hráče vezme. */
export function jobRequiredFavor(i: {
  sponsorType: string; relation: RequestRelation; personality: OwnerPersonality; tradeMatch: boolean;
}): number {
  const raw = FIELD_FAVOR[fieldOf(i.sponsorType)] + RELATION_ADJ[i.relation] + PERSONALITY_ADJ[i.personality]
    + (i.tradeMatch ? TRADE_ADJ : 0);
  return Math.max(JOB_MIN_FAVOR, raw);
}

export interface JobInput {
  favor: number;
  relation: RequestRelation;
  personality: OwnerPersonality;
  sponsorType: string;
  playerAge: number;
  playerOccupation: string;
  /** Hráč už u téhle firmy dělá (`life_context.sponsorJob`). */
  alreadyAtFirm: boolean;
  /** Kolik lidí firma v téhle sezóně už přibrala. */
  hiredThisSeason: number;
  /** Kdy firma téhož hráče naposledy odmítla (dny), null = nikdy. */
  lastRefusedDaysAgo: number | null;
}

export type JobDecision = { kind: "hired"; occupation: string; tradeMatch: boolean } | { kind: "refused"; refusal: JobRefusal };

/** Kdo do práce nemůže vůbec: kluk, student, důchodce. */
export function jobBlockForPlayer(age: number, occupation: string): JobRefusal | null {
  if (age < 18) return "too_young";
  if (occupation === "Student") return "student";
  if (occupation === "Důchodce" || age >= 62) return "retired";
  return null;
}

export function decideJob(i: JobInput): JobDecision {
  if (i.alreadyAtFirm) return { kind: "refused", refusal: "already_hired" };
  const block = jobBlockForPlayer(i.playerAge, i.playerOccupation);
  if (block) return { kind: "refused", refusal: block };
  if (i.lastRefusedDaysAgo !== null && i.lastRefusedDaysAgo < JOB_REPEAT_DAYS) return { kind: "refused", refusal: "too_soon" };
  if (i.relation === "none" && i.favor < JOB_STRANGER_MIN_FAVOR) return { kind: "refused", refusal: "stranger" };
  const job = jobForFirm(i.sponsorType, i.playerOccupation);
  if (i.favor < jobRequiredFavor({ ...i, tradeMatch: job.tradeMatch })) return { kind: "refused", refusal: "dislike" };
  if (i.hiredThisSeason >= (JOB_SLOTS_BY_TYPE[i.sponsorType as SponsorType] ?? 1)) return { kind: "refused", refusal: "full" };
  return { kind: "hired", ...job };
}

/** Co práce udělá s hráčem: kdo byl bez práce, má velkou radost a je trenérovi vděčný. */
export function jobPlayerEffect(unemployed: boolean): { morale: number; relation: number } {
  return unemployed ? { morale: 8, relation: 6 } : { morale: 3, relation: 2 };
}

/** Doptání majitele „pro koho?": typ v metadatech jeho zprávy, další SMS trenéra na něj navazuje. */
export const JOB_ASK_META = "sponsor_job_ask";

/** Uloženo v `life_context.sponsorJob`: u které firmy hráč dělá díky klubu. */
export interface SponsorJob {
  sponsorId: number;
  firm: string;
  /** Herní den nástupu YYYY-MM-DD. */
  since: string;
  previous: string;
}
