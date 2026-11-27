/**
 * Zátěž hráče pokutami (sazebník pokut, spec bod 4).
 *
 * Měřítko je hráčova kapsa, ne samotná částka: týdenní odměna z klubu (na produ skoro vždy
 * pod 500 Kč) plus to, co mu na fotbal a pivo zbude z práce. Student a učeň mají málo,
 * podnikatel hodně. Patriot vydrží víc, prchlivý méně.
 */

export interface PocketInput {
  weeklyWage: number | null;
  age: number;
  occupation: string | null;
}

export interface ToleranceInput {
  temper: number;
  patriotism: number;
}

const WEALTHY_RE = /podnikatel|majitel|[zž]ivnostn|l[eé]ka[rř]|advok[aá]t|mana[zž]er|program[aá]tor|ajťák|\bIT\b|architekt|notá[rř]|reditel|ředitel/i;
const LOW_INCOME_RE = /student|u[cč]e[nň]|brig[aá]d|nezam[eě]stnan|[zž][aá]k|gymnazist/i;

/** Kolik korun týdně má hráč „volných“ na fotbal a pivo. */
export function weeklyPocket(p: PocketInput): number {
  const occ = p.occupation ?? "";
  let base = p.age < 16 ? 120 : p.age < 19 ? 220 : p.age < 23 ? 450 : 650;
  if (LOW_INCOME_RE.test(occ)) base = Math.min(base, 280);
  else if (WEALTHY_RE.test(occ)) base = Math.round(base * 1.7);
  return base + Math.max(0, p.weeklyWage ?? 0);
}

/** Kolik toho povaha unese (0,7–1,3). */
export function fineTolerance(t: ToleranceInput): number {
  const m = 1 + (t.patriotism - 50) / 250 - (t.temper - 50) / 250;
  return Math.max(0.7, Math.min(1.3, m));
}

/** Okno zátěže v herních dnech. */
export const BURDEN_WINDOW_DAYS = 28;

/** Zátěž: korunový ekvivalent pokut za 4 týdny proti týdenní kapse (upravené povahou). */
export function burdenRatio(czkLast28Days: number, pocket: number, tolerance: number): number {
  if (czkLast28Days <= 0) return 0;
  return czkLast28Days / Math.max(50, pocket * tolerance);
}

/**
 * Stupeň zátěže: 0 v pořádku, 1 bručí, 2 odmítá platit a vynechává,
 * 3 chce odejít. Hranice podle spec: 0,5 / 1 / 2 týdenní kapsy za 4 týdny.
 */
export type BurdenStage = 0 | 1 | 2 | 3;

export function burdenStage(ratio: number): BurdenStage {
  if (ratio < 0.5) return 0;
  if (ratio < 1) return 1;
  if (ratio < 2) return 2;
  return 3;
}

/** Slovy, bez čísel (hráč i trenér čísla zátěže nevidí). */
export const BURDEN_STAGE_LABELS: Record<BurdenStage, string> = {
  0: "Platí bez řečí",
  1: "Bručí, že je toho moc",
  2: "Odmítá platit",
  3: "Kvůli pokutám chce pryč",
};
