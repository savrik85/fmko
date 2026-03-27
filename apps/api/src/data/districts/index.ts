import { logger } from "../../lib/logger";
/**
 * District data — loads surnames + sponsors from DB.
 * Fallback na generická data pokud okres nemá záznamy v DB.
 */

export interface DistrictSponsor {
  name: string;
  type: string;
  monthlyRange: [number, number];
  winBonus: [number, number];
}

export interface DistrictData {
  district: string;
  surnames: Record<string, number>;
  sponsors: DistrictSponsor[];
}

// Generic fallback
const GENERIC_SURNAMES: Record<string, number> = {
  "Novák": 45, "Svoboda": 38, "Novotný": 36, "Dvořák": 35, "Černý": 32,
  "Procházka": 30, "Kučera": 28, "Veselý": 25, "Horák": 24, "Němec": 22,
  "Pokorný": 20, "Marek": 19, "Pospíšil": 18, "Hájek": 17, "Jelínek": 16,
  "Král": 15, "Růžička": 15, "Beneš": 14, "Fiala": 13, "Sedláček": 12,
};

const GENERIC_SPONSORS: DistrictSponsor[] = [
  { name: "Řeznictví {surname}", type: "řeznictví", monthlyRange: [500, 1500], winBonus: [100, 300] },
  { name: "Autoservis {surname}", type: "autoservis", monthlyRange: [600, 1800], winBonus: [100, 350] },
  { name: "Hospoda U {surname}", type: "hospoda", monthlyRange: [400, 1200], winBonus: [50, 200] },
  { name: "Potraviny {surname}", type: "potraviny", monthlyRange: [800, 2000], winBonus: [150, 400] },
  { name: "Stavby {surname}", type: "stavby", monthlyRange: [700, 2000], winBonus: [150, 400] },
  { name: "Pila {surname}", type: "pila", monthlyRange: [600, 1800], winBonus: [100, 350] },
  { name: "Truhlářství {surname}", type: "truhlářství", monthlyRange: [400, 1200], winBonus: [50, 200] },
  { name: "Zemědělské družstvo", type: "farma", monthlyRange: [1000, 3000], winBonus: [200, 600] },
  { name: "Pekárna {surname}", type: "pekárna", monthlyRange: [500, 1400], winBonus: [100, 250] },
  { name: "Elektro {surname}", type: "elektro", monthlyRange: [500, 1500], winBonus: [100, 300] },
  { name: "Obecní úřad", type: "obec", monthlyRange: [800, 2500], winBonus: [200, 500] },
];

/**
 * Load district data from DB. Returns generic fallback if not found.
 */
export async function getDistrictDataFromDB(db: D1Database, district: string): Promise<DistrictData> {
  // Load surnames
  const surnameRows = await db.prepare(
    "SELECT surname, frequency FROM district_surnames WHERE district = ? ORDER BY frequency DESC"
  ).bind(district).all().catch((e) => { logger.warn({ module: "districts" }, "query", e); return { results: [] }; });

  // Load sponsors
  const sponsorRows = await db.prepare(
    "SELECT name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max FROM district_sponsors WHERE district = ?"
  ).bind(district).all().catch((e) => { logger.warn({ module: "districts" }, "query", e); return { results: [] }; });

  const surnames: Record<string, number> = {};
  if (surnameRows.results.length > 0) {
    for (const row of surnameRows.results) {
      surnames[row.surname as string] = row.frequency as number;
    }
  }

  const sponsors: DistrictSponsor[] = [];
  if (sponsorRows.results.length > 0) {
    for (const row of sponsorRows.results) {
      sponsors.push({
        name: row.name as string,
        type: row.type as string,
        monthlyRange: [row.monthly_min as number, row.monthly_max as number],
        winBonus: [row.win_bonus_min as number, row.win_bonus_max as number],
      });
    }
  }

  return {
    district,
    surnames: Object.keys(surnames).length > 0 ? surnames : GENERIC_SURNAMES,
    sponsors: sponsors.length > 0 ? sponsors : GENERIC_SPONSORS,
  };
}

/**
 * Synchronous fallback — used where we can't await DB.
 */
export function getDistrictData(district: string): DistrictData {
  // This returns generic data. For real data, use getDistrictDataFromDB.
  return {
    district,
    surnames: GENERIC_SURNAMES,
    sponsors: GENERIC_SPONSORS,
  };
}

export function hasDistrictData(_district: string): boolean {
  // Can't check DB synchronously — assume real data exists for known districts
  return false;
}

export function resolveSponsorName(name: string, surnames: Record<string, number>, rng: { pick: <T>(arr: T[]) => T }): string {
  if (!name.includes("{surname}")) return name;
  const surnameList = Object.keys(surnames);
  const picked = rng.pick(surnameList);
  return name.replace("{surname}", picked);
}
