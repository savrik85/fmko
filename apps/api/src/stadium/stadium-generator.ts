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

// Significantly higher costs — stadium is long-term investment
const UPGRADE_COSTS: Record<string, number[]> = {
  changing_rooms: [0, 15000, 45000, 100000],
  showers: [0, 10000, 30000, 70000],
  refreshments: [0, 20000, 55000, 120000],
  lighting: [0, 60000, 150000, 300000],
  stands: [0, 35000, 90000, 200000],
  parking: [0, 12000, 30000, 65000],
  fence: [0, 8000, 25000, 55000],
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
  2: { reputation: 45, matchesPlayed: 8 },
  3: { reputation: 65, matchesPlayed: 20, season: 2 },
};

/** Cooldown in days per upgrade target level */
export const STADIUM_COOLDOWN_DAYS: Record<number, number> = {
  1: 14,   // L0→L1: 2 weeks
  2: 42,   // L1→L2: 6 weeks
  3: 84,   // L2→L3: 12 weeks
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
