/**
 * Kam skaut jezdí a koho tam vidí (spec 2026-10-04).
 *
 * Kluby mimo hru = obce z `villages`, které ve hře nemají tým. Úroveň kádru takového klubu
 * se řídí velikostí obce: průměr 4,71 · ln(počet obyvatel), rozptyl v kádru 4,5. Koeficient je
 * nafitovaný na ručně nastavené síly `VIRTUAL_TEAMS` (virtual-teams.ts) proti počtu obyvatel
 * jejich měst, rozptyl na rozptylu AI inzerátů v rámci klubu na produkci. Není to fotbalová
 * statistika, jen to drží kluby mimo hru tam, kde je měl trh dosud.
 */

import { haversineKm } from "../transfers/player-agency";
import { stableOffset } from "../lib/scout-estimate";
import type { Rng } from "../generators/rng";

export const SCOUT_CLUB_MEAN_COEF = 4.71;
export const SCOUT_CLUB_SPREAD = 4.5;
/** Kolik hráčů má kádr klubu mimo hru (medián AI kádrů na produkci). */
export const SCOUT_CLUB_SQUAD = 18;
/** Kolik hráčů z kádru hraje na jednotlivých postech. */
const POSITION_SHARE: Record<string, number> = { GK: 2 / 18, DEF: 6 / 18, MID: 6 / 18, FWD: 4 / 18 };
/** Věk hráčů v kádru klubu mimo hru (rovnoměrně). */
export const CLUB_AGE_MIN = 16;
export const CLUB_AGE_MAX = 35;

export interface VillageRow {
  id: string;
  name: string;
  district: string;
  population: number;
  size: string | null;
  lat: number;
  lng: number;
}

export interface VillageInRange extends VillageRow { distanceKm: number }

export function clubMeanFor(population: number): number {
  return SCOUT_CLUB_MEAN_COEF * Math.log(Math.max(30, population));
}

const CLUB_PREFIXES = ["TJ Sokol", "SK", "TJ", "FK", "Sokol", "SK Slavoj"] as const;

/** Název klubu obce. Stabilní: stejná obec má pořád stejný klub. */
export function villageClubName(village: { id: string; name: string }): string {
  const i = Math.floor(((stableOffset(`club:${village.id}`) + 1) / 2) * CLUB_PREFIXES.length) % CLUB_PREFIXES.length;
  return `${CLUB_PREFIXES[i]} ${village.name}`;
}

/** Obdélník kolem bodu, do kterého se okruh vejde (předfiltr pro SQL). */
export function boundingBox(lat: number, lng: number, km: number) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

export function villagesInRadius(rows: VillageRow[], home: { id?: string; lat: number; lng: number }, km: number): VillageInRange[] {
  const out: VillageInRange[] = [];
  for (const v of rows) {
    if (v.id === home.id) continue;
    const d = haversineKm(home.lat, home.lng, v.lat, v.lng);
    if (d <= km) out.push({ ...v, distanceKm: Math.round(d) });
  }
  return out;
}

/** Obce bez týmu ve hře v okruhu kolem obce klubu. */
export async function loadVillagesInRadius(
  db: D1Database, home: { id: string; lat: number; lng: number }, km: number,
): Promise<VillageInRange[]> {
  const box = boundingBox(home.lat, home.lng, km);
  const rows = await db.prepare(
    `SELECT v.id, v.name, v.district, v.population, v.size, v.lat, v.lng FROM villages v
      WHERE v.lat BETWEEN ? AND ? AND v.lng BETWEEN ? AND ?
        AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.village_id = v.id)`,
  ).bind(box.minLat, box.maxLat, box.minLng, box.maxLng).all<VillageRow>();
  return villagesInRadius(rows.results, home, km);
}

/**
 * Které kluby skaut tenhle týden objede: náhodně, větší obce častěji (váha √obyvatel),
 * každý nejvýš jednou.
 */
export function pickClubsToVisit(rng: Rng, villages: VillageInRange[], count: number): VillageInRange[] {
  const pool = [...villages];
  const picked: VillageInRange[] = [];
  while (picked.length < count && pool.length > 0) {
    const weights = pool.map((v) => Math.sqrt(Math.max(1, v.population)));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng.random() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) { idx = i; break; }
    }
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}

/** Kolik hráčů z kádru klubu odpovídá úkolu (posty a věk). Očekávaná hodnota, zaokrouhlí volající. */
export function expectedMatches(positions: readonly string[] | null, ageMin: number, ageMax: number): number {
  const posShare = positions ? positions.reduce((sum, p) => sum + (POSITION_SHARE[p] ?? 0), 0) : 1;
  const lo = Math.max(CLUB_AGE_MIN, ageMin);
  const hi = Math.min(CLUB_AGE_MAX, ageMax);
  const ageShare = hi >= lo ? (hi - lo + 1) / (CLUB_AGE_MAX - CLUB_AGE_MIN + 1) : 0;
  return SCOUT_CLUB_SQUAD * posShare * ageShare;
}

/** Normální rozdělení z rovnoměrného (Box–Muller). */
export function normal(rng: Rng): number {
  const u = Math.max(1e-9, rng.random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.random());
}

/** Distribuční funkce normálního rozdělení (Abramowitz–Stegun). */
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/**
 * Pořadí hráče v kádru jeho klubu (1 = nejlepší). Zbytek kádru se nelosuje celý: kolik
 * spoluhráčů je lepších, je binomický náhodný počet s pravděpodobností podle průměru a rozptylu.
 */
export function clubRankOf(rng: Rng, rating: number, clubMean: number): number {
  const pBetter = 1 - normalCdf((rating - clubMean) / SCOUT_CLUB_SPREAD);
  let better = 0;
  for (let i = 0; i < SCOUT_CLUB_SQUAD - 1; i++) if (rng.random() < pBetter) better++;
  return better + 1;
}
