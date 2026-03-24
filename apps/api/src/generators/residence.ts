/**
 * Generátor bydliště hráčů.
 * Většina hráčů bydlí v obci týmu, ale část dojíždí z okolí.
 * Menší obec = víc místních, větší město = víc dojíždějících.
 */

import type { Rng } from "./rng";

// Okolní obce dle okresu — generické názvy pro dojíždějící
const NEARBY_VILLAGES: Record<string, string[]> = {
  Prachatice: ["Lhenice", "Netolice", "Husinec", "Vlachovo Březí", "Čkyně", "Stachy", "Volary", "Zbytiny", "Záblatí", "Šumavské Hoštice", "Nebahovy", "Kratušín", "Vitějovice", "Dub", "Žernovice"],
  "České Budějovice": ["Hluboká", "Rudolfov", "Litvínovice", "Srubec", "Včelná", "Borek", "Homole", "Roudné", "Staré Hodějovice", "Úsilné", "Vidov", "Adamov", "Dubné", "Libníč"],
  "Český Krumlov": ["Větřní", "Kaplice", "Přísečná", "Holubov", "Chvalšiny", "Frymburk", "Horní Planá", "Vyšší Brod", "Rožmberk", "Brloh"],
  Benešov: ["Vlašim", "Votice", "Týnec nad Sázavou", "Čerčany", "Neveklov", "Sázava", "Bystřice", "Divišov", "Postupice", "Jankov"],
  Pelhřimov: ["Humpolec", "Pacov", "Kamenice nad Lipou", "Počátky", "Červená Řečice", "Žirovnice", "Lukavec", "Senožaty", "Černovice"],
  Zlín: ["Otrokovice", "Vizovice", "Napajedla", "Fryšták", "Slušovice", "Luhačovice", "Malenovice", "Lípa", "Tečovice", "Sazovice"],
};

// Fallback pro neznámé okresy
const GENERIC_NEARBY = ["Dolní Lhota", "Horní Ves", "Nová Ves", "Záhoří", "Podlesí", "Lučice", "Březina", "Háje", "Potok", "Dvorce", "Lipka", "Bory", "Strání", "Újezd", "Skály"];

interface ResidenceConfig {
  localRatio: number;      // % hráčů bydlících v obci týmu
  nearbyMinKm: number;
  nearbyMaxKm: number;
}

// Menší obec = méně místních obyvatel = víc hráčů musí dojíždět
const CONFIG_BY_SIZE: Record<string, ResidenceConfig> = {
  hamlet:     { localRatio: 0.35, nearbyMinKm: 3, nearbyMaxKm: 20 },  // 200 lidí → málokdo místní
  vesnice:    { localRatio: 0.50, nearbyMinKm: 3, nearbyMaxKm: 18 },
  obec:       { localRatio: 0.60, nearbyMinKm: 3, nearbyMaxKm: 15 },
  mestys:     { localRatio: 0.70, nearbyMinKm: 2, nearbyMaxKm: 12 },
  mesto:      { localRatio: 0.80, nearbyMinKm: 2, nearbyMaxKm: 10 },
  small_city: { localRatio: 0.85, nearbyMinKm: 2, nearbyMaxKm: 10 },
  city:       { localRatio: 0.90, nearbyMinKm: 2, nearbyMaxKm: 8 },   // ve městě je dost lidí
};

export interface PlayerResidence {
  residence: string;    // name of village/town where player lives
  commuteKm: number;    // distance to team's ground
}

export function generateResidence(
  rng: Rng,
  teamVillageName: string,
  villageSize: string,
  district: string,
): PlayerResidence {
  const config = CONFIG_BY_SIZE[villageSize] ?? CONFIG_BY_SIZE.obec;

  // Roll: local or commuter?
  if (rng.random() < config.localRatio) {
    return { residence: teamVillageName, commuteKm: 0 };
  }

  // Pick a nearby village
  const nearby = NEARBY_VILLAGES[district] ?? GENERIC_NEARBY;
  // Filter out the team's own village
  const candidates = nearby.filter((v) => v !== teamVillageName);
  const village = candidates.length > 0
    ? candidates[rng.int(0, candidates.length - 1)]
    : GENERIC_NEARBY[rng.int(0, GENERIC_NEARBY.length - 1)];

  const km = rng.int(config.nearbyMinKm, config.nearbyMaxKm);

  return { residence: village, commuteKm: km };
}

/**
 * Vliv dojíždění na docházku.
 * Vrací modifikátor 0.0–1.0 (1.0 = žádný vliv, 0.7 = velký vliv).
 */
export function commuteAttendanceMod(commuteKm: number): number {
  if (commuteKm <= 0) return 1.0;
  if (commuteKm <= 5) return 0.95;
  if (commuteKm <= 10) return 0.90;
  if (commuteKm <= 15) return 0.85;
  if (commuteKm <= 20) return 0.80;
  if (commuteKm <= 25) return 0.75;
  return 0.70;
}

/**
 * Šance na zpoždění na zápas dle vzdálenosti.
 * Vrací pravděpodobnost 0.0–0.25.
 */
export function commuteLateChance(commuteKm: number): number {
  if (commuteKm <= 0) return 0.0;
  if (commuteKm <= 5) return 0.03;
  if (commuteKm <= 10) return 0.07;
  if (commuteKm <= 15) return 0.12;
  if (commuteKm <= 20) return 0.17;
  return 0.22;
}
