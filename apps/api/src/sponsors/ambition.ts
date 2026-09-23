/**
 * Očekávané místo klubu a ambice slibů při jednání se sponzorem (čisté funkce, bez DB).
 * Ambice > 1 = slib je těžší, než klubu odpovídá, sponzor za něj dá víc a čeká nižší šanci.
 */

export const SEASON_WEEKS = 16;
export const WEEKS_PER_MONTH = 4.3;
/** Sezóna v měsících (16 týdnů). Smlouvy drží měsíční částky. */
export const MONTHS_PER_SEASON = SEASON_WEEKS / WEEKS_PER_MONTH;
/** Postupová a sestupová místa (stejně jako league/promotion.ts). */
export const PROMOTION_SPOTS = 2;
export const RELEGATION_SPOTS = 2;
/** Počet kol poháru, když pohár sezóny ještě nevznikl. */
export const DEFAULT_CUP_ROUNDS = 7;
/** Šance sponzora u termínových slibů a exkluzivity oboru. */
export const TERM_PROMISE_CHANCE = 0.7;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Pořadí klubu v lize podle průměru nejlepší jedenáctky (stejná definice síly jako
 * betting/board.ts). Shodná síla: stabilně podle id. Klub bez záznamu = střed tabulky.
 */
export function expectedPosition(strengths: ReadonlyArray<{ teamId: string; strength: number }>, teamId: string): number {
  const sorted = [...strengths].sort((a, b) => b.strength - a.strength || a.teamId.localeCompare(b.teamId));
  const idx = sorted.findIndex((s) => s.teamId === teamId);
  if (idx >= 0) return idx + 1;
  return Math.max(1, Math.ceil(sorted.length / 2));
}

export function leaguePositionAmbition(expected: number, target: number, teams: number): number {
  const n = Math.max(2, teams);
  return clamp(1 + ((expected - target) / n) * 2, 0.3, 2);
}

export function promotionAmbition(expected: number, teams: number): number {
  return leaguePositionAmbition(expected, PROMOTION_SPOTS, teams);
}

/** Nesestup = skončit nejhůř na posledním nesestupovém místě. Klubu v ohrožení na tom záleží víc. */
export function noRelegationAmbition(expected: number, teams: number): number {
  return leaguePositionAmbition(expected, Math.max(1, teams - RELEGATION_SPOTS), teams);
}

export function cupRoundAmbition(round: number, totalRounds: number): number {
  return clamp(0.3 + (1.7 * (round - 1)) / Math.max(1, totalRounds - 1), 0.3, 2);
}

export function attendanceAmbition(target: number, lastAvg: number): number {
  return clamp(target / Math.max(1, lastAvg), 0.67, 1.33);
}

/**
 * Starší odhad šance sezónního slibu podle ambice. Pro cenu bonusu za splnění se NEPOUŽÍVÁ,
 * tu počítá promiseChance() v negotiation.ts (spojitě 1,15 − 0,5 × ambice, sliby v rukou klubu 1,0).
 */
export function sponsorChance(ambition: number): number {
  return clamp(0.9 - 0.4 * ambition, 0.1, 0.9);
}

/** Očekávané výhry za sezónu (dvoukolově každý s každým) podle očekávaného místa. */
export function expectedWinsPerSeason(expected: number, teams: number): number {
  const n = Math.max(2, teams);
  const games = 2 * (n - 1);
  const rate = clamp(0.55 - (0.35 * (expected - 1)) / (n - 1), 0.15, 0.6);
  return games * rate;
}
