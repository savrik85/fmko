/**
 * Omluvenky mladých (do 19 let): taneční, prodloužená, diskotéka ve městě okresu, škola, rodiče.
 * Dospělé výmluvy (manželka, děti, práce) k šestnáctiletému nesedí.
 */
import type { Rng } from "../generators/rng";
import type { AbsenceTiming } from "./absence";

/** Do kolika let se hráč vymlouvá jako mladý. */
export const YOUTH_EXCUSE_MAX_AGE = 19;

/** Města okresu, kam mladí jezdí za zábavou, v 6. pádě i s předložkou. */
const TOWNS_BY_DISTRICT: Record<string, readonly string[]> = {
  Prachatice: ["v Prachaticích", "ve Vimperku", "v Netolicích", "ve Volarech"],
  "České Budějovice": ["v Budějovicích", "v Týně", "v Hluboké", "v Trhových Svinech"],
  Praha: ["na Smíchově", "na Žižkově", "v Karlíně", "ve Vršovicích"],
};
const FALLBACK_TOWN = "ve městě";

export function youthTown(rng: Rng, district: string | undefined): string {
  const towns = district ? TOWNS_BY_DISTRICT[district] : undefined;
  return towns ? rng.pick(towns) : FALLBACK_TOWN;
}

export interface YouthExcuse { text: string; emoji: string; timing: AbsenceTiming; minAge: number; maxAge: number }

/** `{town}` se nahradí městem okresu. */
export const YOUTH_EXCUSES: readonly YouthExcuse[] = [
  { text: "Mám prodlouženou z tanečních {town}, máma by mě zabila", emoji: "\u{1F483}", timing: "day_before", minAge: 15, maxAge: 18 },
  { text: "Taneční končí věnečkem {town}, partnerka by mi to neodpustila", emoji: "\u{1F339}", timing: "day_before", minAge: 15, maxAge: 18 },
  { text: "Máma řekla, že dokud neopravím pětku z matiky, žádnej fotbal", emoji: "\u{1F4DA}", timing: "day_before", minAge: 13, maxAge: 18 },
  { text: "Jedeme se školou na výlet, vracíme se až v neděli večer", emoji: "\u{1F68C}", timing: "day_before", minAge: 13, maxAge: 19 },
  { text: "Jedu s našima na chalupu, nemám to jak ovlivnit", emoji: "\u{1F3E1}", timing: "day_before", minAge: 13, maxAge: 18 },
  { text: "V pondělí píšu maturitní slohovku, musím se učit", emoji: "\u{270D}", timing: "day_before", minAge: 18, maxAge: 19 },
  { text: "Včera byla diskotéka {town}, domů jsem se dostal až ráno", emoji: "\u{1FAA9}", timing: "match_day", minAge: 16, maxAge: 19 },
  { text: "Byl jsem na diskotéce {town}, ujel mi poslední bus a spím u kámoše", emoji: "\u{1F68F}", timing: "match_day", minAge: 16, maxAge: 19 },
  { text: "Kámoš slavil osmnáctiny {town}, dneska nejsem schopnej", emoji: "\u{1F389}", timing: "match_day", minAge: 17, maxAge: 19 },
  { text: "Táta mě nemá jak odvízt a řidičák ještě nemám", emoji: "\u{1F697}", timing: "match_day", minAge: 13, maxAge: 17 },
];

/** Důvody absence na tréninku (večer ve všední den), jak je trenérovi řekne parta. */
export const YOUTH_TRAINING_REASONS: readonly { text: string; minAge: number; maxAge: number }[] = [
  { text: "Má taneční {town}, kurz je zrovna dneska", minAge: 15, maxAge: 18 },
  { text: "Píše zítra písemku, máma ho nepustila", minAge: 13, maxAge: 18 },
  { text: "Doučování z matiky, jinak propadne", minAge: 13, maxAge: 18 },
  { text: "Jel s partou {town} do kina", minAge: 14, maxAge: 19 },
  { text: "Autoškola, jízdy mu dali zrovna na dnešek", minAge: 17, maxAge: 19 },
  { text: "Zkouška se skupinou, prý mají v sobotu koncert {town}", minAge: 15, maxAge: 19 },
];

export function isYouthAge(age: number): boolean {
  return age <= YOUTH_EXCUSE_MAX_AGE;
}

/** Omluvenka mladého na zápas, nebo null, když pro jeho věk a čas žádná nesedí. */
export function pickYouthExcuse(rng: Rng, age: number, timing: AbsenceTiming, district: string | undefined, used: ReadonlySet<string>): { text: string; emoji: string; timing: AbsenceTiming } | null {
  const fits = YOUTH_EXCUSES.filter((e) => age >= e.minAge && age <= e.maxAge && (timing === "any" || e.timing === timing));
  if (fits.length === 0) return null;
  const fresh = fits.filter((e) => !used.has(e.text));
  const pick = rng.pick(fresh.length > 0 ? fresh : fits);
  return { text: pick.text.replace("{town}", youthTown(rng, district)), emoji: pick.emoji, timing: pick.timing };
}

/** Důvod absence mladého na tréninku, nebo null. */
export function pickYouthTrainingReason(rng: Rng, age: number, district: string | undefined): string | null {
  const fits = YOUTH_TRAINING_REASONS.filter((e) => age >= e.minAge && age <= e.maxAge);
  if (fits.length === 0) return null;
  return rng.pick(fits).text.replace("{town}", youthTown(rng, district));
}
