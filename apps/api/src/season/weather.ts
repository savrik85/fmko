/**
 * Pomocné věci k počasí — popisky, ikony a násobiče návštěvy.
 *
 * Samotné počasí se generuje v `season-weather.ts`, který je jediným zdrojem
 * pravdy. Tenhle soubor už žádné počasí nelosuje: dřív tu byl `generateForecast`
 * s měsíčními vahami, který běžel nezávisle na tom, co dostal odehraný zápas,
 * takže předpověď hráči nic nepředpovídala.
 */

import type { Weather } from "../engine/types";

const WEATHER_TYPES: Weather[] = ["sunny", "cloudy", "rain", "wind", "snow"];

const DESCRIPTIONS: Record<Weather, string[]> = {
  sunny:  ["Jasno, ideální podmínky", "Slunečno, suché hřiště", "Krásný den na fotbal"],
  cloudy: ["Zataženo, bez deště", "Oblačno, příjemná teplota", "Pod mrakem, klidné podmínky"],
  rain:   ["Déšť, mokré hřiště", "Přeháňky, kluzký terén", "Vytrvalý déšť, bahno"],
  wind:   ["Silný vítr, těžké podmínky", "Poryvistý vítr", "Větrno, dlouhé míče nepoletí"],
  snow:   ["Sněžení, zmrzlé hřiště", "Sníh, omezená viditelnost", "Mráz a sněhová pokrývka"],
};

const ICONS: Record<Weather, string> = {
  sunny: "\u2600\uFE0F",
  cloudy: "\u26C5",
  rain: "\u{1F327}\uFE0F",
  wind: "\u{1F32C}\uFE0F",
  snow: "\u{1F328}\uFE0F",
};

/** Násobič návštěvy dle počasí — v ošklivu přijde míň lidí. */
// Hodnoty žijí ve sdíleném balíčku, aby je frontend nemusel mít natvrdo znovu —
// právě takhle se widget rozešel se skutečností (sníh hlásil -30 % místo -38 %).
export { weatherAttendanceFactor } from "@okresni-masina/shared";

/**
 * Násobič návštěvy podle stavu hřiště.
 *
 * Na rozoranou louku se nikomu nechce. Bez tohohle se rozbité hřiště klubu
 * vyplácelo: ušetřil na údržbě a nakopávaná taktika na něm navíc funguje líp,
 * takže záměrně neudržovaný trávník byl čistý zisk. Teď za něj platí u pokladny.
 *
 * 100 → 1.0, 60 → 0.98, 30 → 0.91, 5 → 0.85. Postih začíná až pod 70 — do té doby
 * je hřiště „normální" a divák ho neřeší.
 */
export function pitchAttendanceFactor(pitchCondition: number | null | undefined): number {
  if (pitchCondition == null) return 1;
  const pc = Math.max(0, Math.min(100, pitchCondition));
  if (pc >= 70) return 1;
  return 1 - ((70 - pc) / 70) * 0.15;
}

/**
 * Popisek a ikona k danému počasí. Deterministické — varianta popisu se vybírá
 * z `key`, aby se text u téhož zápasu neměnil při každém načtení stránky.
 */
export function describeWeather(weather: Weather, key: string): { description: string; icon: string } {
  const varianty = DESCRIPTIONS[weather];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return { description: varianty[h % varianty.length], icon: ICONS[weather] };
}
