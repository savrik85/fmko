/**
 * Weather forecast — generates expected & actual weather based on date/season.
 * Czech climate: cold winters, mild springs/autumns, warm summers.
 */

import type { Weather } from "../engine/types";

export interface WeatherForecast {
  expected: Weather;
  temperature: number;   // °C
  description: string;
  icon: string;
}

// Monthly weather probabilities for Czech Republic lower leagues
// [sunny, cloudy, rain, wind, snow]
const MONTHLY_WEIGHTS: Record<number, number[]> = {
  1:  [5,  20, 10, 15, 50],  // leden — sníh, zima
  2:  [10, 20, 10, 15, 45],  // únor
  3:  [15, 30, 25, 20, 10],  // březen — taje, vítr
  4:  [25, 30, 30, 10, 5],   // duben — aprílové počasí
  5:  [35, 25, 30, 8,  2],   // květen
  6:  [40, 25, 30, 5,  0],   // červen
  7:  [45, 20, 30, 5,  0],   // červenec — bouřky
  8:  [45, 20, 30, 5,  0],   // srpen
  9:  [30, 30, 25, 10, 5],   // září — podzim začíná
  10: [15, 35, 25, 15, 10],  // říjen
  11: [10, 30, 20, 20, 20],  // listopad — mlhy, vítr
  12: [5,  20, 10, 15, 50],  // prosinec — sníh
};

// Temperature ranges per month [min, max] °C
const TEMP_RANGES: Record<number, [number, number]> = {
  1: [-8, 3], 2: [-5, 5], 3: [0, 12], 4: [5, 18],
  5: [10, 23], 6: [14, 27], 7: [16, 30], 8: [15, 29],
  9: [10, 22], 10: [5, 16], 11: [0, 8], 12: [-6, 3],
};

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

function pickWeighted(weights: number[], rngValue: number): number {
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = rngValue * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

/**
 * Generate a weather forecast for a given date.
 * Uses a seed based on date for deterministic but varied results.
 */
export function generateForecast(scheduledAt: string | null, seed?: number): WeatherForecast {
  const date = scheduledAt ? new Date(scheduledAt) : new Date();
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();

  // Simple seeded pseudo-random (deterministic per match date)
  const s = seed ?? (month * 1000 + day * 37 + date.getFullYear());
  const rng = ((s * 9301 + 49297) % 233280) / 233280;
  const rng2 = ((s * 7841 + 21503) % 177723) / 177723;

  const weights = MONTHLY_WEIGHTS[month] ?? MONTHLY_WEIGHTS[6];
  const weatherIdx = pickWeighted(weights, rng);
  const weather = WEATHER_TYPES[weatherIdx];

  const [tMin, tMax] = TEMP_RANGES[month] ?? [10, 20];
  // Weather affects temperature
  const tempMod = weather === "sunny" ? 2 : weather === "snow" ? -3 : weather === "rain" ? -1 : 0;
  const temp = Math.round(tMin + rng2 * (tMax - tMin) + tempMod);

  const descriptions = DESCRIPTIONS[weather];
  const descIdx = Math.floor(rng * descriptions.length);

  return {
    expected: weather,
    temperature: temp,
    description: descriptions[descIdx],
    icon: ICONS[weather],
  };
}

/**
 * Generate actual match-day weather — similar to forecast but with slight variation.
 */
export function generateMatchWeather(scheduledAt: string | null, seed: number): { weather: Weather; temperature: number } {
  const forecast = generateForecast(scheduledAt, seed);
  // 70% chance forecast is accurate, 30% chance it shifts to neighboring weather
  const rng = ((seed * 4523 + 89123) % 100000) / 100000;
  if (rng < 0.7) return { weather: forecast.expected, temperature: forecast.temperature };

  // Shift to adjacent weather type
  const idx = WEATHER_TYPES.indexOf(forecast.expected);
  const shift = rng < 0.85 ? 1 : -1;
  const newIdx = Math.max(0, Math.min(WEATHER_TYPES.length - 1, idx + shift));
  return { weather: WEATHER_TYPES[newIdx], temperature: forecast.temperature + (shift > 0 ? -2 : 2) };
}
