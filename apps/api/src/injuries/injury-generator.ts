/**
 * Generátor zranění — typy, závažnost, doba léčení.
 * Okresní fotbal: častější drobná zranění, vzácnější vážná.
 */

import type { Rng } from "../generators/rng";

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
  { type: "sval", description: "Natažený sval", severity: "lehke", daysMin: 3, daysMax: 7, smsText: "Šéfe, natáhl jsem si sval. Doktor říká {days} dní klid." },
  { type: "kotnік", description: "Podvrtnutý kotník", severity: "lehke", daysMin: 4, daysMax: 10, smsText: "Podvrtl jsem si kotník, {days} dní to potrvá." },
  { type: "zada", description: "Bolest zad", severity: "lehke", daysMin: 3, daysMax: 8, smsText: "Záda mě zase chytily, doktor říká {days} dní pauza." },
  { type: "obecne", description: "Modřina", severity: "lehke", daysMin: 2, daysMax: 5, smsText: "Mám pořádnou modřinu, ale za {days} dní bych měl být OK." },
  { type: "hlava", description: "Lehký otřes mozku", severity: "lehke", daysMin: 5, daysMax: 10, smsText: "Dostal jsem ránu do hlavy, musím {days} dní odpočívat." },

  // Střední (10-28 dní)
  { type: "sval", description: "Natržený sval", severity: "stredni", daysMin: 10, daysMax: 21, smsText: "Natrhl jsem si sval, {days} dní budu mimo. Sorry šéfe." },
  { type: "kotnік", description: "Výron kotníku", severity: "stredni", daysMin: 14, daysMax: 28, smsText: "Kotník je v háji, doktor říká {days} dní minimálně." },
  { type: "koleno", description: "Natažené vazy v koleni", severity: "stredni", daysMin: 14, daysMax: 28, smsText: "Koleno je oteklý, {days} dní klid. Snad to bude OK." },
  { type: "zebra", description: "Naražená žebra", severity: "stredni", daysMin: 10, daysMax: 21, smsText: "Narazil jsem si žebra, bolí to jak čert. {days} dní pauza." },
  { type: "tříselný", description: "Tříselný problém", severity: "stredni", daysMin: 14, daysMax: 28, smsText: "Třísla mi nedají pokoj, musím {days} dní stát." },

  // Těžká (28-90 dní)
  { type: "koleno", description: "Poranění menisku", severity: "tezke", daysMin: 30, daysMax: 60, smsText: "Šéfe, je to horší. Meniskus. Minimálně {days} dní mimo." },
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

const SEVERITY_LABELS: Record<string, string> = {
  lehke: "Lehké",
  stredni: "Střední",
  tezke: "Těžké",
};

export { SEVERITY_LABELS };