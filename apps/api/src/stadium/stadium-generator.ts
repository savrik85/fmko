/**
 * Generátor stadionu — počáteční stav dle velikosti obce.
 * Menší obec = horší zázemí, větší město = lepší facilities.
 */

import type { Rng } from "../generators/rng";

export interface StadiumConfig {
  capacity: number;
  pitchCondition: number;
  pitchType: "natural" | "hybrid" | "artificial";
  changingRooms: number;
  showers: number;
  refreshments: number;
  lighting: number;
  stands: number;
  parking: number;
  fence: number;
}

const BASE_BY_SIZE: Record<string, StadiumConfig> = {
  hamlet: {
    capacity: 80, pitchCondition: 30, pitchType: "natural",
    changingRooms: 0, showers: 0, refreshments: 0, lighting: 0, stands: 0, parking: 0, fence: 0,
  },
  vesnice: {
    capacity: 150, pitchCondition: 40, pitchType: "natural",
    changingRooms: 1, showers: 0, refreshments: 0, lighting: 0, stands: 0, parking: 0, fence: 0,
  },
  obec: {
    capacity: 250, pitchCondition: 50, pitchType: "natural",
    changingRooms: 1, showers: 1, refreshments: 0, lighting: 0, stands: 0, parking: 1, fence: 0,
  },
  mestys: {
    capacity: 400, pitchCondition: 55, pitchType: "natural",
    changingRooms: 1, showers: 1, refreshments: 1, lighting: 0, stands: 1, parking: 1, fence: 1,
  },
  mesto: {
    capacity: 600, pitchCondition: 60, pitchType: "natural",
    changingRooms: 2, showers: 1, refreshments: 1, lighting: 1, stands: 1, parking: 1, fence: 1,
  },
  small_city: {
    capacity: 800, pitchCondition: 65, pitchType: "natural",
    changingRooms: 2, showers: 2, refreshments: 1, lighting: 1, stands: 1, parking: 2, fence: 1,
  },
  city: {
    capacity: 1200, pitchCondition: 70, pitchType: "hybrid",
    changingRooms: 2, showers: 2, refreshments: 2, lighting: 1, stands: 2, parking: 2, fence: 2,
  },
};

export function generateStadium(rng: Rng, villageSize: string): StadiumConfig {
  const base = BASE_BY_SIZE[villageSize] ?? BASE_BY_SIZE.obec;
  return {
    ...base,
    capacity: base.capacity + rng.int(-20, 40),
    pitchCondition: Math.max(10, Math.min(100, base.pitchCondition + rng.int(-10, 10))),
  };
}

/** Upgrade costs and effects */
export interface UpgradeOption {
  facility: string;
  label: string;
  currentLevel: number;
  nextLevel: number;
  cost: number;
  effect: string;
  locked?: boolean;
  lockReason?: string;
}

const FACILITY_LABELS: Record<string, string> = {
  changing_rooms: "Šatny",
  showers: "Sprchy",
  refreshments: "Občerstvení",
  lighting: "Osvětlení",
  stands: "Tribuny",
  parking: "Parkoviště",
  fence: "Oplocení",
};

// Stadium = dlouhodobá investice přes více sezón
// Při čistém zisku ~1-2k Kč/týd (16-32k/sezóna):
// L1 = 1-2 sezóny šetření, L2 = 2-4 sezóny, L3 = 4-8 sezón
const UPGRADE_COSTS: Record<string, number[]> = {
  changing_rooms: [0, 25000, 85000, 220000],
  showers: [0, 18000, 60000, 160000],
  refreshments: [0, 35000, 110000, 280000],
  lighting: [0, 95000, 280000, 600000],
  stands: [0, 55000, 170000, 450000],
  parking: [0, 20000, 60000, 150000],
  fence: [0, 15000, 50000, 130000],
};

const UPGRADE_EFFECTS: Record<string, string[]> = {
  changing_rooms: ["", "+5 morálka domácí", "+3 morálka + méně zranění", "+5 morálka + lepší regenerace"],
  showers: ["", "Základní hygiena", "+2 regenerace kondice", "+4 regenerace kondice"],
  refreshments: ["", "+500 Kč vstupné/zápas", "+1500 Kč vstupné", "+3000 Kč + sponzor zájem"],
  lighting: ["", "Večerní zápasy možné", "Lepší viditelnost", "Profesionální osvětlení"],
  stands: ["", "+50 kapacita", "+150 kapacita", "+300 kapacita + VIP"],
  parking: ["", "20 míst", "50 míst", "100 míst + autobusy"],
  fence: ["", "Plot kolem hřiště", "Vstupní brána", "Kompletní oplocení + pokladna"],
};

// Unlock requirements per level
interface UnlockReq {
  reputation?: number;
  matchesPlayed?: number;
  season?: number;
}

const STADIUM_UNLOCK: Record<number, UnlockReq> = {
  1: {},
  2: { reputation: 50, matchesPlayed: 15 },
  3: { reputation: 70, matchesPlayed: 35, season: 3 },
};

/** Cooldown in days per upgrade target level */
export const STADIUM_COOLDOWN_DAYS: Record<number, number> = {
  1: 21,    // L0→L1: 3 týdny
  2: 56,    // L1→L2: 8 týdnů (půl sezóny)
  3: 112,   // L2→L3: 16 týdnů (celá sezóna)
};

export function getUpgradeOptions(
  stadium: Record<string, number>,
  teamReputation: number = 0,
  matchesPlayed: number = 0,
  currentSeason: number = 1,
): UpgradeOption[] {
  const options: UpgradeOption[] = [];
  for (const [key, label] of Object.entries(FACILITY_LABELS)) {
    const current = stadium[key] ?? 0;
    if (current >= 3) continue;
    const next = current + 1;
    const costs = UPGRADE_COSTS[key];
    const effects = UPGRADE_EFFECTS[key];
    const req = STADIUM_UNLOCK[next] ?? {};

    let locked = false;
    let lockReason: string | undefined;

    if (req.reputation && teamReputation < req.reputation) {
      locked = true;
      lockReason = `Potřeba reputace ${req.reputation}+ (máš ${teamReputation})`;
    }
    if (req.matchesPlayed && matchesPlayed < req.matchesPlayed) {
      locked = true;
      lockReason = `Potřeba ${req.matchesPlayed}+ odehraných zápasů (máš ${matchesPlayed})`;
    }
    if (req.season && currentSeason < req.season) {
      locked = true;
      lockReason = `Dostupné od sezóny ${req.season} (aktuální: ${currentSeason})`;
    }

    options.push({
      facility: key,
      label,
      currentLevel: current,
      nextLevel: next,
      cost: costs[next] ?? 99999,
      effect: effects[next] ?? "",
      locked,
      lockReason,
    });
  }
  return options;
}

export { FACILITY_LABELS };
