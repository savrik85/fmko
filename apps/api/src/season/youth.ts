/**
 * Mládežnická akademie — generování nových hráčů z dorostu.
 */

import type { Rng } from "../generators/rng";
import type { GeneratedPlayer, VillageInfo } from "../generators/player";
import { generatePlayer } from "../generators/player";

export type YouthInvestment = "none" | "minimal" | "medium" | "high";

export interface YouthConfig {
  investment: YouthInvestment;
  villagPopulation: number;
}

export interface YouthGraduate {
  player: GeneratedPlayer;
  description: string;
}

/**
 * Měsíční náklad akademie.
 *
 * Původní ceny (500 / 2 000 / 5 000) byly proti reálné ekonomice klubů zanedbatelné:
 * fixní týdenní výdaje průměrného klubu jsou kolem 6 800 Kč (mzdy hráčů 4 552, zaměstnanci
 * 1 467, vybavení 534, hřiště 250), takže nejvyšší úroveň brala 17 % a nikdo nic neobětoval.
 * Teď velkorysá stojí 2 791 Kč/týden, tedy zhruba 41 % fixních nákladů — je to volba mezi
 * kádrem a mládeží, ne položka, které si nikdo nevšimne.
 */
const INVESTMENT_COST: Record<YouthInvestment, number> = {
  none: 0,
  minimal: 1500,
  medium: 5000,
  high: 12000,
};

/** České názvy úrovní investice — do UI ani do výpisu financí nikdy neposílat holý klíč. */
export const YOUTH_LABELS: Record<YouthInvestment, string> = {
  none: "Žádná",
  minimal: "Symbolická",
  medium: "Solidní",
  high: "Velkorysá",
};

/** Co manažer za svoje peníze dostane — text do UI, ať se nerozhoduje naslepo. */
export const YOUTH_POPISY: Record<YouthInvestment, string> = {
  none: "Do mládeže nesypeš nic. Žádní odchovanci.",
  minimal: "Pár míčů a kužely pro žáky. Občas z toho někdo vyroste.",
  medium: "Trenér žáků má na benzín a klub platí halu. Odchovanci chodí pravidelněji a jsou lepší.",
  high: "Vlastní mládežnický program. Nejvyšší šance na odchovance a nejvyšší strop, kam může dorůst.",
};

/** Šance na jednoho odchovance (před úpravou podle velikosti obce). */
export const YOUTH_SANCE: Record<YouthInvestment, number> = {
  none: 0,
  minimal: 0.40,
  medium: 0.55,
  high: 0.70,
};

/**
 * Kolik kluků se z akademie o postup pokouší.
 *
 * Jeden odchovanec za sezónu byl proti pasivnímu toku nabídek k smíchu: průměrnému klubu
 * chodí ~2,5 nabídky dorostence za 60 dní, tedy 4–7 za sezónu, a zadarmo. Akademie proto
 * nesmí soutěžit kvalitou jednoho kusu, ale objemem i kvalitou — odchovanec má navíc
 * vyšší strop a talent než náhodný tip z hospody.
 */
export const YOUTH_POCET_POKUSU: Record<YouthInvestment, number> = {
  none: 0,
  minimal: 1,
  medium: 2,
  high: 3,
};

/**
 * Strop šance jednoho pokusu. Velká obec vynásobí základ až 1,5×, takže bez stropu by
 * velkorysá akademie vycházela na jistotu — a odchovanec by přestal být událostí.
 */
export const YOUTH_SANCE_STROP = 0.8;

/**
 * Kolik odchovanců klub za sezónu očekává — do UI, ať manažer vidí, co za ty peníze dostane.
 * `popMod` je násobitel podle velikosti obce (0,5 až 1,5).
 */
export function ocekavanyPocetOdchovancu(investment: YouthInvestment, popMod: number): number {
  const sance = Math.min(YOUTH_SANCE_STROP, YOUTH_SANCE[investment] * popMod);
  return Math.round(YOUTH_POCET_POKUSU[investment] * sance * 10) / 10;
}

const SKILL_RANGE: Record<YouthInvestment, [number, number]> = {
  none: [0, 0], // No graduates
  minimal: [3, 8],
  medium: [5, 12],
  high: [8, 16],
};

/**
 * Monthly cost of youth academy.
 */
export function youthMonthlyCost(investment: YouthInvestment): number {
  return INVESTMENT_COST[investment];
}

/**
 * Try to graduate a youth player at end of season.
 * Returns a new player or null.
 */
export function tryGraduateYouth(
  rng: Rng,
  config: YouthConfig,
  villageInfo: VillageInfo,
  surnameData: { surnames: Record<string, number>; female_forms: Record<string, string> },
  firstnameData: { male: Record<string, Record<string, number>>; female: Record<string, Record<string, number>> },
): YouthGraduate | null {
  if (config.investment === "none") return null;

  // Bigger village = more kids = higher chance
  const popMod = Math.max(0.5, Math.min(1.5, config.villagPopulation / 3000));
  // Strop drží i nejlepší akademii pod jistotou — ročník, ze kterého nic nevyroste, se stát musí
  const prob = Math.min(YOUTH_SANCE_STROP, YOUTH_SANCE[config.investment] * popMod);

  if (rng.random() > prob) return null;

  // Generate the youth player
  const positions = ["GK", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD"] as const;
  const position = rng.pick([...positions]);
  const age = rng.int(16, 18);

  const player = generatePlayer(rng, villageInfo, position, surnameData, firstnameData);
  player.age = age;

  // Override attributes based on investment quality
  const [minSkill, maxSkill] = SKILL_RANGE[config.investment];
  const attrs: Array<keyof GeneratedPlayer> = [
    "speed", "technique", "shooting", "passing", "heading", "defense",
  ];
  for (const attr of attrs) {
    (player as unknown as Record<string, number>)[attr] = rng.int(minSkill, maxSkill);
  }

  // Youth academy players have higher patriotism
  player.patriotism = Math.min(20, player.patriotism + rng.int(3, 6));

  const descriptions = [
    `${player.firstName} ${player.lastName} (${age}) dorostl z mládeže do áčka. Nadšený mladík!`,
    `Z dorostu postoupil ${player.firstName} ${player.lastName}. Říkají o něm, že má talent.`,
    `${player.firstName} ${player.lastName} (${age}) se připojuje k áčku. Vychovanec klubu.`,
  ];

  return {
    player,
    description: rng.pick(descriptions),
  };
}
