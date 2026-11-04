/**
 * Žáci: pravidla družstva mladších a starších žáků bez databáze.
 *
 * Podle skutečného okresního fotbalu (docs/youth-academy-redesign-2026-11-04.md): klub
 * buď družstvo žáků má, nebo nemá. Mít ho stojí hlavně trenéra a dost kluků z obce, málo
 * peněz. Kluci 11–14 let jsou v družstvu hned po založení, každé léto postoupí čtrnáctiletí
 * do dorostu (U21) a přijde nový ročník jedenáctiletých.
 *
 * Kategorie podle FAČR 2026/27: mladší žáci 11–12, starší žáci 13–14, mladší dorost 15–16.
 * Kdo hraje o kategorii výš, smí do dorostu od 13 let.
 */

import type { Rng } from "../generators/rng";

/** Nejmladší a nejstarší ročník žáků. */
export const YOUNGEST_AGE = 11;
export const OLDEST_AGE = 14;

/**
 * Kolik kluků jednoho ročníku dá obec: zhruba 1 % obyvatel v ročníku, polovina kluci,
 * třetina z nich hraje fotbal. Obec s 2 300 obyvateli (medián klubů na produ) má 3–4 kluky
 * na ročník, osada do 500 obyvatel kluka jednou za dva roky.
 */
export const KIDS_PER_RESIDENT = 0.0015;
/** Víc kluků na ročník družstvo nepobere (velké obce). */
export const MAX_KIDS_PER_YEAR = 6;
/** Pod tolik kluků družstvo nehraje okresní soutěž. */
export const MIN_SQUAD = 9;

/** Týdenní provoz žáků: dresy, míče, startovné, cesty na zápasy. */
export const UPKEEP_WEEKLY = 400;

export function expectedKidsPerYear(population: number): number {
  return Math.min(MAX_KIDS_PER_YEAR, Math.max(0, population) * KIDS_PER_RESIDENT);
}

/** Ze střední hodnoty skutečný počet kluků: celá část jistě, zbytek s pravděpodobností. */
export function rollKids(rng: Rng, expected: number): number {
  const whole = Math.floor(expected);
  return whole + (rng.random() < expected - whole ? 1 : 0);
}

export type CoachType = "volunteer" | "parent" | "staff";

/** Dobrovolník z áčka musí být starší hráč. */
export const VOLUNTEER_MIN_AGE = 28;

export interface QualityInput {
  coach: CoachType | null;
  /** Vůdcovství dobrovolníka z áčka 0–100. */
  volunteerLeadership?: number;
  /** Efektivita placeného trenéra mládeže 0–20 (`rowEffectiveness`). */
  staffEffectiveness?: number;
  /** Trenérova (manažerova) dovednost „mládež“ 0–100. */
  managerYouth: number;
  squadSize: number;
}

/**
 * Kvalita přípravy `q`. Čtyři roky při q = 1 dají náskok +6 k dovednostem a +12 ke stropu.
 * Bez trenéra žáci netrénují (q = 0). Placený trenér je nejlepší (0,7–1,2), dobrovolník
 * podle vůdcovství (0,5–0,9), táta průměrný (0,6). Bez soutěže (pod 9 kluků) poloviční.
 */
export function programQuality(i: QualityInput): number {
  let base: number;
  if (i.coach === "staff") base = 0.7 + (Math.max(0, Math.min(20, i.staffEffectiveness ?? 10)) / 20) * 0.5;
  else if (i.coach === "volunteer") base = 0.5 + (Math.max(0, Math.min(100, i.volunteerLeadership ?? 40)) / 100) * 0.4;
  else if (i.coach === "parent") base = 0.6;
  else return 0;
  const manager = (Math.max(0, Math.min(100, i.managerYouth)) / 100) * 0.15;
  const q = base + manager;
  return i.squadSize < MIN_SQUAD ? q * 0.5 : q;
}

/** Týdnů v sezóně, přes které se rozkládá roční růst (sezóna na produ ~15 týdnů). */
export const WEEKS_PER_SEASON = 15;
export const YEARLY_CURRENT = 1.5;
export const YEARLY_CAP = 3;

export function weeklyProgress(q: number): { current: number; cap: number } {
  return { current: (YEARLY_CURRENT * q) / WEEKS_PER_SEASON, cap: (YEARLY_CAP * q) / WEEKS_PER_SEASON };
}

export const LATE_BLOOM_CHANCE = 0.10;
export const BURNOUT_CHANCE = 0.10;

/** Změna talentu ve třinácti, kdy kluk začne dospívat: pozdní květ nebo vyhoření. */
export function talentShiftAt13(rng: Rng): number {
  const r = rng.random();
  if (r < LATE_BLOOM_CHANCE) return rng.int(20, 35);
  if (r < LATE_BLOOM_CHANCE + BURNOUT_CHANCE) return -20;
  return 0;
}

/**
 * Šum v trenérově odhadu talentu: v 11 letech ±25, ve 14 ±10. Placený trenér se plete
 * až o polovinu méně podle úsudku (`judgement` 0–20). `offset` je pevné číslo kluka −1..1,
 * aby odhad v UI neposkakoval.
 */
export function estimatedTalent(talent: number, age: number, offset: number, staffJudgement: number | null): number {
  const base = Math.max(0, 16 - age) * 5;
  const sharp = staffJudgement === null ? 1 : 1 - (Math.max(0, Math.min(20, staffJudgement)) / 20) * 0.5;
  return Math.max(0, Math.min(100, Math.round(talent + offset * base * sharp)));
}

export function verdictText(estimate: number): string {
  if (estimate >= 70) return "Takovýho kluka tu dlouho nebylo. Z toho může být hvězda okresu.";
  if (estimate >= 50) return "Má na krajskej přebor, když vydrží.";
  if (estimate >= 35) return "Do áčka se dostane, na to vemte jed.";
  if (estimate >= 20) return "Na béčko nebo lavičku áčka.";
  return "Spíš pro radost, ale kluk dobrej.";
}

export function commitmentText(commitment: number): string {
  if (commitment >= 70) return "chodí rád";
  if (commitment >= 40) return "občas vynechá trénink";
  return "uvažuje, že skončí";
}

/** Do dorostu o kategorii výš smí kluk od 13 let (starší žák v mladším dorostu). */
export const PLAY_UP_AGE = 13;
/** Od jakého odhadu trenér sám doporučí, aby kluk hrál o kategorii výš. */
export const PLAY_UP_ESTIMATE = 50;

export function canPlayUp(age: number): boolean {
  return age >= PLAY_UP_AGE;
}

export function recommendsPlayUp(age: number, estimate: number): boolean {
  return canPlayUp(age) && estimate >= PLAY_UP_ESTIMATE;
}

/** Za kolik dní po odmítnutém doporučení to trenér zkusí znovu. */
export const REOFFER_DAYS: [number, number] = [28, 35];

/** Den doporučení přes sezónu, ať nechodí všechna najednou. */
export function firstOfferDay(rng: Rng, seasonDays: number): number {
  return rng.int(7, Math.max(8, seasonDays - 7));
}

/** Roční šance, že kluk skončí (hokej, florbal, holky, škola). */
export const QUIT_BASE = 0.08;
export const QUIT_NO_COMPETITION = 0.15;
export const QUIT_NO_COACH = 0.10;

export function quitChance(commitment: number, playsCompetition: boolean, hasCoach: boolean): number {
  let chance = QUIT_BASE;
  if (!playsCompetition) chance += QUIT_NO_COMPETITION;
  if (!hasCoach) chance += QUIT_NO_COACH;
  if (commitment < 40) chance += 0.15;
  else if (commitment >= 70) chance -= 0.03;
  return Math.max(0, Math.min(0.9, chance));
}

/**
 * Tabulkové odstupné za kluka ve starších žácích (U14–U15) podle soutěže áčka klubu, kam
 * přechází (Přestupní řád FAČR od 1. 6. 2025, § 23). Platí se, když klub bez dorostu přijde
 * o čtrnáctileté do klubu s dorostem.
 */
export const YOUTH_TRANSFER_FEE: Record<string, number> = {
  krajsky_prebor: 15_000,
  i_a_trida: 12_500,
  i_b_trida: 10_000,
  okresni_prebor: 8_000,
  okresni_soutez: 6_500,
  iv_trida: 5_000,
};
export const DEFAULT_YOUTH_TRANSFER_FEE = 8_000;

export function youthTransferFee(leagueLevel: string | null | undefined): number {
  return (leagueLevel && YOUTH_TRANSFER_FEE[leagueLevel]) || DEFAULT_YOUTH_TRANSFER_FEE;
}

/** Plat odchovance v první smlouvě proti běžnému hráči stejného hodnocení. */
export const GRADUATE_WAGE_FACTOR = 0.7;

export const TRAITS = [
  "rychlej jak blesk", "bojí se hlavičkovat", "levá noha jako kladivo", "nejmenší z party, ale nejvíc běhá",
  "vidí přihrávky, co ostatní nevidí", "o míč se pere jak o život", "brácha hraje za áčko", "táta chytal za béčko",
  "doma ho ženou do hokeje", "učitelka si na něj stěžuje", "na trénink chodí první", "kope jen pravou",
  "dlouhej jak tyčka", "pořád se směje", "ve škole jednička z tělocviku", "neumí prohrávat",
] as const;

export function pickTraits(rng: Rng): string[] {
  const first = rng.pick([...TRAITS]);
  if (rng.random() < 0.5) return [first];
  return [first, rng.pick(TRAITS.filter((t) => t !== first))];
}

/** Pozice se u mladších žáků ještě neví, ukazuje se od třinácti. */
export function positionVisible(age: number): boolean {
  return age >= 13;
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return Math.hypot((a.lng - b.lng) * 71.5, (a.lat - b.lat) * 111.2);
}

/** Jak trenér slovy hodnotí přípravu. */
export function qualityText(q: number, coach: CoachType | null): string {
  if (!coach) return "Žáci nemají trenéra, netrénují.";
  if (q >= 1.05) return "Příprava jako v krajském klubu.";
  if (q >= 0.8) return "Slušná příprava.";
  if (q >= 0.55) return "Příprava na koleně.";
  return "Kluci spíš jen kopou do míče.";
}
