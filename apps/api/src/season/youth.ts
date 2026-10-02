/**
 * Mládežnická akademie — generování nových hráčů z dorostu.
 */

import type { Rng } from "../generators/rng";
import type { GeneratedPlayer, VillageInfo } from "../generators/player";
import { generatePlayer } from "../generators/player";
import type { FieldSkills, GoalkeeperSkills } from "../skills/types";
import { generateFieldSkills, generateGKSkills, generateHiddenTalent, flattenGeneratedSkills } from "../skills/generator";

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
  medium: "Trenér žáků má na benzín a klub platí halu. Odchovanci chodí pravidelněji, jsou dál a mají vyšší strop.",
  high: "Vlastní mládežnický program. Nejvyšší šance na odchovance a nejvyšší strop, kam může dorůst.",
};

/**
 * Šance na jednoho odchovance (před úpravou podle velikosti obce).
 *
 * Stupně se od sebe liší POČTEM pokusů (1 / 2 / 3), ne šancí jednoho z nich. Šance je
 * proto u všech skoro stejná a vysoká — akademie má dodávat, ne losovat.
 *
 * Velikost obce se do počtu odchovanců NEPROMÍTÁ. Dřív se šance násobila `populace / 3000`
 * s dolní hranicí 0,5, jenže tahle hra se hraje na vesnicích: naměřeno na produkci, jedenáct
 * klubů z třiadvaceti sedělo na dně stupnice a mezi obcí s 54 obyvateli a městysem s 1 600
 * nebyl žádný rozdíl. Symbolická akademie tak vesnici dávala jednoho kluka za tři sezóny,
 * což je za 349 Kč týdně vyhozené peníze. Zlom nastával až kolem tří tisíc obyvatel, které
 * v celém okrese přeleze jen Vimperk a Volary.
 */
export const YOUTH_SANCE: Record<YouthInvestment, number> = {
  none: 0,
  minimal: 0.80,
  medium: 0.80,
  high: 0.85,
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
 * Strop šance jednoho pokusu. Drží i nejlepší akademii pod jistotou — ročník, ze kterého
 * nevyroste nikdo, se stát musí, jinak přestane být odchovanec událostí.
 */
export const YOUTH_SANCE_STROP = 0.9;

/** Kolik odchovanců klub za sezónu očekává — do UI, ať manažer vidí, co za ty peníze dostane. */
export function ocekavanyPocetOdchovancu(investment: YouthInvestment): number {
  return Math.round(YOUTH_POCET_POKUSU[investment] * sanceJednohoPokusu(investment) * 10) / 10;
}

/**
 * Šance, že JEDEN kluk projde. Do UI se posílá zvlášť, protože střední hodnota sama o sobě
 * manažerovi nic neříká — „0,6 odchovance za sezónu" čte každý jako půlku hráče.
 * Skutečný mechanismus jsou nezávislé pokusy, každý s touhle pravděpodobností.
 */
export function sanceJednohoPokusu(investment: YouthInvestment): number {
  return Math.min(YOUTH_SANCE_STROP, YOUTH_SANCE[investment]);
}

/**
 * Co investice odchovanci přidá proti běžnému dorostenci (body na stupnici 0–100).
 *
 * Dřív se současné dovednosti odchovance losovaly z pevného rozsahu 3–8 / 5–12 / 8–16, zatímco
 * běžný dorostenec, kterého klub dostane zadarmo, vycházel z generátoru kolem 24. Simulace na
 * 3 000 hráčích: odchovanec z velkorysé akademie měl hodnocení 16, dorostenec 24. Klub tak
 * platil za horší kluky. Teď se odchovanec generuje stejně jako dorostenec a investice k tomu
 * přidává: `current` = o kolik je dál už dnes, `cap` = kam až může dorůst, `talent` = jak
 * rychle tam dojde.
 *
 * `gemChance` je šance na klenot: talent 70–95 a strop posunutý o dalších 10–20. Hvězda
 * (strop hodnocení 75+, úroveň nejlepších hráčů okresu) má být odměna, ne standard. Simulace
 * pro velkorysou akademii: osada ~1 hvězda za 6 sezón, obec za 4, městys za 2; solidní
 * akademie v osadě ~1 za 30 sezón, symbolická prakticky nikdy.
 */
export const YOUTH_BONUS: Record<Exclude<YouthInvestment, "none">, { current: number; cap: number; talent: [number, number]; gemChance: number }> = {
  minimal: { current: 1, cap: 6, talent: [0, 5], gemChance: 0.03 },
  medium: { current: 3, cap: 10, talent: [5, 15], gemChance: 0.06 },
  high: { current: 5, cap: 14, talent: [10, 25], gemChance: 0.10 },
};

/** Talent a posun stropu klenotu — stejné pásmo jako „kluk, co vesnici přeroste" v U21 generátoru. */
const GEM_TALENT: [number, number] = [70, 95];
const GEM_EXTRA_CAP: [number, number] = [10, 20];

export interface AcademyGraduateSkills {
  /** Ploché hodnoty do `players.skills`. */
  skills: Record<string, number>;
  /** Hodnoty se stropy do `players.skills_max` — current sedí se `skills`. */
  skillsMax: FieldSkills | GoalkeeperSkills;
  hiddenTalent: number;
}

/**
 * Dovednosti odchovance: stejný generátor jako u dorostence z U21 generátoru, k tomu bonus
 * podle investice. Současná hodnota nikdy nepřeleze strop.
 */
export function generateAcademyGraduateSkills(
  rng: Rng,
  investment: Exclude<YouthInvestment, "none">,
  position: "GK" | "DEF" | "MID" | "FWD",
  villageSize: string,
  age: number,
): AcademyGraduateSkills {
  const isGK = position === "GK";
  const skillsMax = isGK
    ? generateGKSkills(rng, villageSize, age)
    : generateFieldSkills(rng, position, villageSize, age);
  const bonus = YOUTH_BONUS[investment];
  const isGem = rng.random() < bonus.gemChance;
  const capBonus = bonus.cap + (isGem ? rng.int(GEM_EXTRA_CAP[0], GEM_EXTRA_CAP[1]) : 0);

  for (const [key, value] of Object.entries(skillsMax as unknown as Record<string, { current: number; maxPotential: number }>)) {
    // Zkušenost dávají odehrané minuty, ne akademie
    if (key === "experience") continue;
    value.maxPotential = Math.min(100, value.maxPotential + capBonus);
    value.current = Math.min(value.maxPotential, value.current + bonus.current);
  }

  const hiddenTalent = isGem
    ? rng.int(GEM_TALENT[0], GEM_TALENT[1])
    : Math.min(100, generateHiddenTalent(rng, villageSize) + rng.int(bonus.talent[0], bonus.talent[1]));

  return { skills: flattenGeneratedSkills(skillsMax, isGK), skillsMax, hiddenTalent };
}

/**
 * Monthly cost of youth academy.
 */
export function youthMonthlyCost(investment: YouthInvestment): number {
  return INVESTMENT_COST[investment];
}

/** Základní týdenní cena úrovně (bez vlivu zaměstnanců) — v téhle měně se počítá zaplacená úroveň. */
export function youthWeeklyBaseCost(investment: YouthInvestment): number {
  return Math.round(INVESTMENT_COST[investment] / 4.3);
}

/** Kolik z týdenní ceny musí klub v průměru zaplatit, aby mu ročník dostal danou úroveň. */
const PAID_LEVEL_THRESHOLD = 0.9;

/**
 * Úroveň, kterou si klub za sezónu skutečně zaplatil.
 *
 * Ročník se dřív řídil nastavením v den konce sezóny, takže stačilo přepnout na velkorysou
 * týden před koncem a celý rok neplatit. A naopak: kdo platil celý rok a na konci akademii
 * zrušil, nedostal nic. Teď rozhoduje průměrná týdenní platba za sezónu (`paidBase` / `weeks`):
 * nejvyšší úroveň, jejíž týdenní cenu klub v průměru zaplatil aspoň z 90 %.
 */
export function paidYouthLevel(paidBase: number, weeks: number): YouthInvestment {
  if (weeks <= 0 || paidBase <= 0) return "none";
  const averageWeekly = paidBase / weeks;
  const levels: YouthInvestment[] = ["high", "medium", "minimal"];
  return levels.find((level) => averageWeekly >= youthWeeklyBaseCost(level) * PAID_LEVEL_THRESHOLD) ?? "none";
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

  // Šance nezávisí na velikosti obce — viz komentář u YOUTH_SANCE. Kvalitu odchovance
  // velikost obce pořád ovlivňuje přes `villageInfo` v generátoru, jen ne jejich počet.
  const prob = sanceJednohoPokusu(config.investment);

  if (rng.random() > prob) return null;

  // Generate the youth player
  const positions = ["GK", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD"] as const;
  const position = rng.pick([...positions]);
  const age = rng.int(16, 18);

  const player = generatePlayer(rng, villageInfo, position, surnameData, firstnameData);
  player.age = age;

  // Dovednosti se tu nenastavují — skutečné hodnoty skládá generateAcademyGraduateSkills(),
  // tady se vybírá jen kluk (jméno, věk, pozice, povaha).

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
