/**
 * Žáci: pravidla mládežnické akademie bez databáze.
 *
 * Klub má vlastní žáky (12–15 let), kteří vznikají náborem v obcích kolem klubu, rostou podle
 * toho, za co klub platí (provoz, hala, trenér mládeže), a od patnácti je trenér průběžně
 * nabízí do dorostu. Návrh: docs/youth-academy-redesign-2026-11-04.md.
 *
 * Čísla vycházejí z produkce (2026-11-04): obec klubu má medián 2 300 obyvatel, osady pod 500
 * jich mají osm. Nábor ve vlastní obci a dvou okolních dává osadě ~3 kluky za rok, obci
 * 500–2 000 obyvatel ~4, větší obce narazí na strop ročníku.
 */

import type { Rng } from "../generators/rng";

/** Nábor jen v obcích do téhle vzdálenosti od obce klubu. */
export const RECRUIT_RADIUS_KM = 8;
/** Jednorázový poplatek za nábor v každé další obci (leták, náborový den). Vlastní obec je zdarma. */
export const RECRUIT_FEE = 1000;
/** Nábor najednou nejvýš v tolika dalších obcích. */
export const MAX_RECRUIT_VILLAGES = 4;
/** Kolik dvanáctiletých se přihlásí na obyvatele obce (jeden ročník). */
export const KIDS_PER_RESIDENT = 0.0008;
/** Z jedné obce nejvýš tolik kluků za ročník. */
export const MAX_KIDS_PER_VILLAGE = 3;
/** Nový ročník nejvýš tolik kluků. */
export const MAX_CLASS_SIZE = 6;
/** Víc žáků klub neuživí, nikdo nový se nepřihlásí. */
export const MAX_SQUAD = 20;
/** Pod tolik žáků nemůžou hrát okresní soutěž a rostou pomaleji. */
export const MIN_SQUAD = 9;

/** Týdenní ceny položek zázemí (Kč). Trenér mládeže se platí zvlášť jako zaměstnanec. */
export const PROGRAM_COST = { upkeep: 600, hall: 700, bus: 500 } as const;
export type ProgramItem = keyof typeof PROGRAM_COST;

export interface AcademyProgram {
  /** Provoz žáků: dresy, míče, startovné. Bez něj akademie nefunguje. */
  upkeep: boolean;
  /** Hala na zimu. */
  hall: boolean;
  /** Autobus na zápasy pro kluky z okolních obcí. */
  bus: boolean;
}

/** Kolik program stojí za týden (bez trenéra mládeže). Bez provozu se nic neplatí. */
export function programWeeklyCost(p: AcademyProgram): number {
  if (!p.upkeep) return 0;
  return PROGRAM_COST.upkeep + (p.hall ? PROGRAM_COST.hall : 0) + (p.bus ? PROGRAM_COST.bus : 0);
}

/** Vzdálenost dvou obcí v km (stačí plochá aproximace na území Česka). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return Math.hypot((a.lng - b.lng) * 71.5, (a.lat - b.lat) * 111.2);
}

/**
 * Kolik kluků se z obce přihlásí do jednoho ročníku (střední hodnota). V cizí obci se dělí
 * s kluby, které tam mají domov (`competitors`). Vlastní obec patří klubu celá.
 */
export function expectedKidsFromVillage(population: number, competitors: number): number {
  const kids = Math.min(MAX_KIDS_PER_VILLAGE, Math.max(0, population) * KIDS_PER_RESIDENT);
  return kids / (1 + Math.max(0, competitors));
}

/** Ze střední hodnoty skutečný počet kluků: celá část jistě, zbytek s pravděpodobností. */
export function rollKids(rng: Rng, expected: number): number {
  const whole = Math.floor(expected);
  return whole + (rng.random() < expected - whole ? 1 : 0);
}

export interface QualityInput {
  program: AcademyProgram;
  /** Efektivita trenéra mládeže 0–20 (`rowEffectiveness`), null = klub ho nemá. */
  trainerEffectiveness: number | null;
  /** Trenérova (manažerova) dovednost „mládež“ 0–100. */
  managerYouth: number;
  /** Kolik má klub aktivních žáků. */
  squadSize: number;
}

/**
 * Kvalita přípravy `q`. Čtyři roky při q = 1 dají náskok +6 k dovednostem a +12 ke stropu,
 * zhruba jako dřívější velkorysá akademie (+5 / +14). Bez provozu se neroste vůbec.
 */
export function programQuality(i: QualityInput): number {
  if (!i.program.upkeep) return 0;
  const trainer = i.trainerEffectiveness === null ? 0 : (Math.max(0, Math.min(20, i.trainerEffectiveness)) / 20) * 0.4;
  const hall = i.program.hall ? 0.15 : 0;
  const manager = (Math.max(0, Math.min(100, i.managerYouth)) / 100) * 0.15;
  const smallSquad = i.squadSize < MIN_SQUAD ? 0.25 : 0;
  return Math.max(0.2, 0.6 + trainer + hall + manager - smallSquad);
}

/** Týdnů v sezóně, přes které se rozkládá roční růst (sezóna na produ ~15 týdnů). */
export const WEEKS_PER_SEASON = 15;
/** Roční náskok při q = 1. */
export const YEARLY_CURRENT = 1.5;
export const YEARLY_CAP = 3;

/** O kolik kluk povyroste za jeden týden přípravy. */
export function weeklyProgress(q: number): { current: number; cap: number } {
  return { current: (YEARLY_CURRENT * q) / WEEKS_PER_SEASON, cap: (YEARLY_CAP * q) / WEEKS_PER_SEASON };
}

/** Šance, že kluk ve čtrnácti „rozkvete“ nebo „vyhoří“. */
export const LATE_BLOOM_CHANCE = 0.10;
export const BURNOUT_CHANCE = 0.10;

/** Změna talentu při přechodu na čtrnáct let. */
export function talentShiftAt14(rng: Rng): number {
  const r = rng.random();
  if (r < LATE_BLOOM_CHANCE) return rng.int(20, 35);
  if (r < LATE_BLOOM_CHANCE + BURNOUT_CHANCE) return -20;
  return 0;
}

/**
 * Šum v trenérově odhadu talentu: ve 12 letech ±24, v 15 ±6. Lepší trenér mládeže
 * (`judgement` 0–20) se plete až o polovinu méně. `offset` je pevné číslo kluka −1..1,
 * aby odhad v UI neposkakoval den ode dne.
 */
export function estimatedTalent(talent: number, age: number, offset: number, trainerJudgement: number | null): number {
  const base = Math.max(0, 16 - age) * 6;
  const sharp = trainerJudgement === null ? 1 : 1 - (Math.max(0, Math.min(20, trainerJudgement)) / 20) * 0.5;
  return Math.max(0, Math.min(100, Math.round(talent + offset * base * sharp)));
}

/** Co trenér o klukovi řekne: kam to podle něj dotáhne. */
export function verdictText(estimate: number): string {
  if (estimate >= 70) return "Takovýho kluka tu dlouho nebylo. Z toho může být hvězda okresu.";
  if (estimate >= 50) return "Má na krajskej přebor, když vydrží.";
  if (estimate >= 35) return "Do áčka se dostane, na to vemte jed.";
  if (estimate >= 20) return "Na béčko nebo lavičku áčka.";
  return "Spíš pro radost, ale kluk dobrej.";
}

/** Nálada kluka slovy. */
export function commitmentText(commitment: number): string {
  if (commitment >= 70) return "chodí rád";
  if (commitment >= 40) return "občas vynechá trénink";
  return "uvažuje, že skončí";
}

/** Od kolika let může kluk do dorostu. Výjimečný talent (podle trenéra) už ve čtrnácti. */
export const PROMOTION_AGE = 15;
export const EARLY_PROMOTION_ESTIMATE = 70;

export function canPromote(age: number, estimate: number): boolean {
  return age >= PROMOTION_AGE || (age === PROMOTION_AGE - 1 && estimate >= EARLY_PROMOTION_ESTIMATE);
}

/** Jestli trenér kluka považuje za připraveného na dorost. */
export function readinessText(age: number, estimate: number, progressCurrent: number): string {
  if (!canPromote(age, estimate)) return "Na dorost je ještě brzo.";
  if (age >= 16 || progressCurrent >= 4 || estimate >= 50) return "Na dorost je připravenej.";
  return "Šel by, ale rok u žáků by mu prospěl.";
}

/** Za kolik dní po předchozí nabídce trenér kluka nabídne znovu. */
export const REOFFER_DAYS: [number, number] = [21, 28];

/**
 * Den, kdy trenér poprvé nabídne kluka, který právě dosáhl věku na dorost: rovnoměrně přes
 * sezónu, ať nabídky chodí průběžně a ne všechny najednou.
 */
export function firstOfferDay(rng: Rng, seasonDays: number): number {
  return rng.int(7, Math.max(8, seasonDays - 7));
}

/** Roční šance, že kluk skončí (hokej, holky, škola). */
export const QUIT_BASE = 0.08;
/** Navíc pro kluka z obce dál než `BUS_DISTANCE_KM`, když klub nemá autobus. */
export const QUIT_NO_BUS = 0.15;
export const BUS_DISTANCE_KM = 3;

export function quitChance(commitment: number, distanceFromClubKm: number, hasBus: boolean): number {
  let chance = QUIT_BASE;
  if (!hasBus && distanceFromClubKm > BUS_DISTANCE_KM) chance += QUIT_NO_BUS;
  if (commitment < 40) chance += 0.15;
  else if (commitment >= 70) chance -= 0.03;
  return Math.max(0, Math.min(0.9, chance));
}

/** Plat odchovance v první smlouvě proti běžnému hráči stejného hodnocení. */
export const GRADUATE_WAGE_FACTOR = 0.7;

/** Rysy, kterými trenér kluka popisuje. Nic nemění, jen dělají z kluka člověka. */
export const TRAITS = [
  "rychlej jak blesk", "bojí se hlavičkovat", "levá noha jako kladivo", "nejmenší z party, ale nejvíc běhá",
  "vidí přihrávky, co ostatní nevidí", "o míč se pere jak o život", "brácha hraje za áčko", "táta chytal za béčko",
  "doma ho ženou do hokeje", "učitelka si na něj stěžuje", "na trénink chodí první", "kope jen pravou",
  "dlouhej jak tyčka", "pořád se směje", "ve škole jednička z tělocviku", "neumí prohrávat",
] as const;

export function pickTraits(rng: Rng): string[] {
  const first = rng.pick([...TRAITS]);
  if (rng.random() < 0.5) return [first];
  const rest = TRAITS.filter((t) => t !== first);
  return [first, rng.pick([...rest])];
}

/**
 * Pozice se ve dvanácti ještě neví. Ukazuje se od třinácti, do té doby trenér říká, že kluk
 * „hraje všude“.
 */
export function positionVisible(age: number): boolean {
  return age >= 13;
}
