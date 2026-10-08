/**
 * Generátor zranění — typy, závažnost, doba léčení.
 * Okresní fotbal: častější drobná zranění, vzácnější vážná.
 */

import type { Rng } from "../generators/rng";
import type { POPISY_ZRANENI } from "../engine/simulation";

export interface InjuryDef {
  type: string;
  description: string;
  severity: "lehke" | "stredni" | "tezke";
  daysMin: number;
  daysMax: number;
  smsText: string;
}

const INJURIES: InjuryDef[] = [
  // Lehká (3-10 dní)
  { type: "sval", description: "Natažený sval", severity: "lehke", daysMin: 3, daysMax: 7, smsText: "Trenére, natáhl jsem si sval. Doktor říká {days} dní klid." },
  { type: "kotnik", description: "Podvrtnutý kotník", severity: "lehke", daysMin: 4, daysMax: 10, smsText: "Podvrtl jsem si kotník, {days} dní to potrvá." },
  { type: "zada", description: "Bolest zad", severity: "lehke", daysMin: 3, daysMax: 8, smsText: "Záda mě zase chytily, doktor říká {days} dní pauza." },
  { type: "obecne", description: "Modřina", severity: "lehke", daysMin: 2, daysMax: 5, smsText: "Mám pořádnou modřinu, ale za {days} dní bych měl být OK." },
  { type: "hlava", description: "Lehký otřes mozku", severity: "lehke", daysMin: 5, daysMax: 10, smsText: "Dostal jsem ránu do hlavy, musím {days} dní odpočívat." },

  // Střední (10-28 dní)
  { type: "sval", description: "Natržený sval", severity: "stredni", daysMin: 10, daysMax: 21, smsText: "Natrhl jsem si sval, {days} dní budu mimo. Sorry, trenére." },
  { type: "kotnik", description: "Výron kotníku", severity: "stredni", daysMin: 14, daysMax: 28, smsText: "Kotník je v háji, doktor říká {days} dní minimálně." },
  { type: "koleno", description: "Natažené vazy v koleni", severity: "stredni", daysMin: 14, daysMax: 28, smsText: "Koleno je oteklý, {days} dní klid. Snad to bude OK." },
  { type: "zebra", description: "Naražená žebra", severity: "stredni", daysMin: 10, daysMax: 21, smsText: "Narazil jsem si žebra, bolí to jak čert. {days} dní pauza." },
  { type: "triselny", description: "Tříselný problém", severity: "stredni", daysMin: 14, daysMax: 28, smsText: "Třísla mi nedají pokoj, musím {days} dní stát." },

  // Těžká (28-90 dní)
  { type: "koleno", description: "Poranění menisku", severity: "tezke", daysMin: 30, daysMax: 60, smsText: "Trenére, je to horší. Meniskus. Minimálně {days} dní mimo." },
  { type: "achilovka", description: "Natržená Achillova šlacha", severity: "tezke", daysMin: 45, daysMax: 90, smsText: "Achilovka praskla. {days} dní, možná víc. Mrzí mě to." },
  { type: "rameno", description: "Vykloubené rameno", severity: "tezke", daysMin: 28, daysMax: 45, smsText: "Vyhodil jsem si rameno, {days} dní budu mimo." },
  { type: "koleno", description: "Poranění zkřížených vazů", severity: "tezke", daysMin: 60, daysMax: 90, smsText: "Doktor říká zkřížený vazy. Minimálně {days} dní. To je katastrofa." },
];

/**
 * Generuje zranění na základě závažnosti.
 * Pravděpodobnost: 70% lehké, 25% střední, 5% těžké.
 * Věk a injuryProneness zvyšují šanci na horší zranění.
 */
export function generateInjury(
  rng: Rng,
  playerAge: number,
  injuryProneness: number, // 0-100
): { injury: InjuryDef; days: number } {
  // Severity weights modified by age and proneness
  let severeChance = 0.05 + (playerAge > 35 ? 0.05 : 0) + (injuryProneness / 100) * 0.05;
  let mediumChance = 0.25 + (playerAge > 30 ? 0.05 : 0) + (injuryProneness / 100) * 0.05;
  const lightChance = 1 - severeChance - mediumChance;

  const roll = rng.random();
  let severity: "lehke" | "stredni" | "tezke";
  if (roll < lightChance) severity = "lehke";
  else if (roll < lightChance + mediumChance) severity = "stredni";
  else severity = "tezke";

  const pool = INJURIES.filter((i) => i.severity === severity);
  const injury = pool[rng.int(0, pool.length - 1)];
  const days = rng.int(injury.daysMin, injury.daysMax);

  return { injury, days };
}

/** Popis zranění, který posílá zápasový engine (`POPISY_ZRANENI`). */
type MatchInjury = (typeof POPISY_ZRANENI)[number];

/**
 * Délky zranění ze zápasu podle druhu. `minor` je běžný průběh, `serious` vážnější varianta
 * (natržený sval, výron, meniskus). `seriousBase` je základní šance na vážnější variantu.
 *
 * Dřív se délka losovala 3–20 dní bez ohledu na druh, takže křeče klidně vyřadily hráče na
 * tři týdny a koleno se zahojilo za tři dny. Průměr zůstává kolem 10 dní jako dřív, jen se
 * rozdělil: drobnosti hráče o zápas nepřipraví, koleno umí vyřadit na kus sezóny.
 */
const MATCH_INJURY_DAYS: Record<MatchInjury, { minor: [number, number]; serious: [number, number]; seriousBase: number }> = {
  "křeče": { minor: [1, 3], serious: [1, 3], seriousBase: 0 },
  "naraženina": { minor: [2, 6], serious: [7, 14], seriousBase: 0.05 },
  "natažený sval": { minor: [4, 10], serious: [12, 24], seriousBase: 0.2 },
  "podvrtnutý kotník": { minor: [4, 10], serious: [14, 28], seriousBase: 0.2 },
  "koleno": { minor: [7, 14], serious: [30, 75], seriousBase: 0.25 },
};

/**
 * Kolik dní bude hráč po zranění ze zápasu mimo. Starší a náchylnější hráč má větší šanci
 * na vážnější variantu, stejně jako v `generateInjury`. `reductionDays` je ošetření na
 * hřišti z lékárničky. Neznámý popis se bere jako naraženina.
 */
export function matchInjuryDays(
  rng: Rng,
  description: string | undefined,
  playerAge: number,
  injuryProneness: number,
  reductionDays = 0,
): number {
  const def = MATCH_INJURY_DAYS[description as MatchInjury] ?? MATCH_INJURY_DAYS["naraženina"];
  const seriousChance = def.seriousBase === 0 ? 0
    : def.seriousBase
      + (playerAge > 30 ? 0.05 : 0)
      + (playerAge > 35 ? 0.05 : 0)
      + (injuryProneness / 100) * 0.1;
  const [min, max] = rng.random() < seriousChance ? def.serious : def.minor;
  return Math.max(1, rng.int(min, max) - reductionDays);
}

const SEVERITY_LABELS: Record<string, string> = {
  lehke: "Lehké",
  stredni: "Střední",
  tezke: "Těžké",
};

export { SEVERITY_LABELS };