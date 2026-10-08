/**
 * Váha v čase a růst dorostu (postava, část 2).
 * Spec: docs/superpowers/specs/2026-10-08-player-body-drift-design.md
 *
 * Váha se denně hýbe podle toho, co hráč dělal: hospoda přidává, trénink ubírá, zranění přidává
 * a tělo táhne zpátky k přirozené váze podle postavy a věku. Přes léto se posune podle chování,
 * dorost do 18 let roste. Z váhy pak část 1 (generators/physicals.ts) počítá úpravy vlastností.
 */

import type { Rng } from "../generators/rng";
import { BODY_WEIGHT_FACTOR, idealWeight, isBodyType } from "../generators/physicals";

/** Jakou část rozdílu k přirozené váze tělo za den srovná. */
const NATURAL_PULL = 0.006;
/** Večer v hospodě, násobí se (0,5 + alkohol / 100). */
const PUB_VISIT_KG = 0.08;
const TRAINING_KG = -0.03;
const CONDITIONING_KG = -0.07;
const INJURED_KG = 0.03;
const MIN_WEIGHT = 50;
const MAX_WEIGHT = 140;
/** Od kolika let přirozená váha roste a o kolik za rok. */
const AGE_GAIN_FROM = 28;
const AGE_GAIN_PER_YEAR = 0.005;
const SUMMER_CAP = 3;
/** Nárůst za ~4 týdny, od kterého štáb napíše SMS, a pauza mezi SMS o stejném hráči. */
export const WEIGHT_ALERT_KG = 3;
const WEIGHT_SMS_COOLDOWN_DAYS = 30;

export type TrainingToday = "conditioning" | "other" | null;
export type SummerEvent = "fit" | "rusty" | "injury" | null;
export type WeightSmsCause = "pub" | "idle" | "injury";

export interface DailyBodyInput {
  weight: number;
  /** Přirozená váha, null = chybí výška nebo postava, tělo pak netáhne nikam. */
  natural: number | null;
  pubVisit: boolean;
  alcohol: number;
  training: TrainingToday;
  injured: boolean;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Přirozená váha: ideál podle výšky × postava, od 28 let mírně roste. */
export function naturalWeight(heightCm: unknown, bodyType: unknown, age: number): number | null {
  if (typeof heightCm !== "number" || !(heightCm > 0) || !isBodyType(bodyType)) return null;
  const ageMul = 1 + Math.max(0, age - AGE_GAIN_FROM) * AGE_GAIN_PER_YEAR;
  return idealWeight(heightCm) * BODY_WEIGHT_FACTOR[bodyType] * ageMul;
}

/** Změna váhy za jeden herní den (kg, nezaokrouhlená). */
export function dailyWeightChange(input: DailyBodyInput): number {
  let change = input.natural === null ? 0 : NATURAL_PULL * (input.natural - input.weight);
  if (input.pubVisit) change += PUB_VISIT_KG * (0.5 + input.alcohol / 100);
  if (input.training === "conditioning") change += CONDITIONING_KG;
  else if (input.training === "other") change += TRAINING_KG;
  if (input.injured) change += INJURED_KG;
  return change;
}

/** Nová váha: na setiny kg, v rozsahu 50–140. */
export function applyDailyWeight(weight: number, change: number): number {
  return round2(Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, weight + change)));
}

/** Změna váhy přes léto podle chování a letního příběhu, nejvýš ±3 kg. */
export function summerWeightChange(input: { alcohol: number; age: number; event: SummerEvent }): number {
  let change = 1;
  if (input.alcohol > 60) change += 1;
  if (input.age >= 30) change += 0.5;
  if (input.event === "fit") change -= 2.5;
  else if (input.event === "rusty" || input.event === "injury") change += 1;
  return Math.max(-SUMMER_CAP, Math.min(SUMMER_CAP, change));
}

/** O kolik cm hráč vyroste, když dosáhne věku `newAge`. */
export function youthGrowthCm(rng: Rng, newAge: number): number {
  if (newAge <= 17) return rng.int(2, 4);
  if (newAge === 18) return rng.int(1, 2);
  return 0;
}

/** Váha po růstu se stejným BMI. */
export function grownWeight(weight: number, oldHeightCm: number, newHeightCm: number): number {
  return round2(weight * (newHeightCm / oldHeightCm) ** 2);
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso.slice(0, 10)) - Date.parse(fromIso.slice(0, 10))) / 86400000);
}

/**
 * Změna proti záznamu nejbližšímu 28 dnům zpět, bere se jen záznam starý `minDays`–`maxDays` dní.
 * Na desetiny kg, null bez vhodného záznamu.
 */
export function weightTrend(
  current: number,
  entries: ReadonlyArray<{ gameDate: string; weight: number }>,
  today: string,
  minDays = 14,
  maxDays = 42,
): number | null {
  let best: { weight: number; distance: number } | null = null;
  for (const e of entries) {
    const age = daysBetween(e.gameDate, today);
    if (age < minDays || age > maxDays) continue;
    const distance = Math.abs(age - 28);
    if (!best || distance < best.distance) best = { weight: e.weight, distance };
  }
  return best ? round1(current - best.weight) : null;
}

/** Má štáb poslat SMS? Nárůst aspoň 3 kg a od poslední takové SMS aspoň 30 dní. */
export function weightAlertDue(input: { gain: number | null; lastSmsAt: string | null; today: string }): boolean {
  if (input.gain === null || input.gain < WEIGHT_ALERT_KG) return false;
  return !input.lastSmsAt || daysBetween(input.lastSmsAt, input.today) >= WEIGHT_SMS_COOLDOWN_DAYS;
}

/** Hlavní příčina přibírání pro text SMS. */
export function weightSmsCause(input: { injured: boolean; pubVisits28d: number }): WeightSmsCause {
  if (input.injured) return "injury";
  if (input.pubVisits28d >= 6) return "pub";
  return "idle";
}

const WEIGHT_SMS_TEXTS: Record<WeightSmsCause, string[]> = {
  pub: [
    "Trenére, {name} za poslední měsíc přibral {kg} kg. V hospodě sedí skoro každý večer a na tréninku pak funí.",
    "{name} je o {kg} kg těžší než před měsícem. Štamgast U Pralesa, to je na něm vidět.",
    "Trenére, {name} nabral za měsíc {kg} kg. Pivo mu chutná víc než běhání, chtělo by to s ním promluvit.",
  ],
  idle: [
    "{name} přibral za měsíc {kg} kg. Na tréninky skoro nechodí a je to na něm vidět.",
    "Trenére, {name} má za poslední měsíc {kg} kg navíc. Kdo netrénuje, ten roste do šířky.",
    "{name} je o {kg} kg těžší. Tréninky vynechává a v souboji už nestíhá.",
  ],
  injury: [
    "{name} je po zranění o {kg} kg těžší. Až se dá dohromady, chtělo by to s ním zabrat.",
    "Trenére, {name} za měsíc na marodce přibral {kg} kg. Po návratu ho čeká pořádná dřina.",
    "{name} sedí doma se zraněním a nabral {kg} kg. Hlídejte mu to, ať se vrátí v kondici.",
  ],
};

/** Text SMS od štábu o přibírání. Kila s desetinnou čárkou. */
export function weightSmsText(rng: Rng, cause: WeightSmsCause, name: string, kg: number): string {
  const template = rng.pick(WEIGHT_SMS_TEXTS[cause]);
  return template.replace("{name}", name).replace("{kg}", kg.toFixed(1).replace(".", ","));
}
