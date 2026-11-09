/**
 * Kolik místa má okres pro nové registrace a jestli je pro ně zavřený.
 *
 * Okres je zavřený, když (a) se do něj nový klub nevejde (pravidlo drží
 * league/district-leagues.ts `resolveDistrictSlot`), nebo (b) ho správce zavřel ručně
 * (`district_registrations.registration_closed`, migrace 0306).
 *
 * Výpočet nesmí shodit registraci: když dotaz selže (např. sloupec z migrace ještě
 * v databázi není), okres se bere jako otevřený a plnost znovu ověří zakládání klubu.
 */

import { listDistrictSeniorLeagues, resolveDistrictSlot } from "../league/district-leagues";
import { logger } from "../lib/logger";

const M = "district-capacity";

/** Kód chyby pro web: registrace do okresu, který nové kluby nepřijímá. */
export const DISTRICT_FULL_CODE = "district_full";

export function districtFullMessage(district: string): string {
  return `Liga v okrese ${district} je plná.`;
}

export interface DistrictCapacity {
  /** Kolik nových klubů se do okresu ještě vejde. U zavřeného okresu 0, null = nejde zjistit. */
  freeSlots: number | null;
  /** Nové registrace okres nepřijímá (plno, nebo ručně zavřeno). */
  full: boolean;
  /** Zavřel ho správce ručně. */
  manuallyClosed: boolean;
}

const OPEN_UNKNOWN: DistrictCapacity = { freeSlots: null, full: false, manuallyClosed: false };

/** Ručně zavřené okresy. Bez sloupce z migrace 0306 vrátí prázdnou množinu. */
export async function listManuallyClosedDistricts(db: D1Database): Promise<Set<string>> {
  const rows = await db.prepare("SELECT district FROM district_registrations WHERE registration_closed = 1")
    .all<{ district: string }>()
    .catch((e) => { logger.warn({ module: M }, "čtení ručně zavřených okresů", e); return { results: [] as Array<{ district: string }> }; });
  return new Set(rows.results.map((r) => r.district));
}

async function activeSeasonId(db: D1Database): Promise<string | null> {
  const season = await db.prepare("SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1").first<{ id: string }>();
  return season?.id ?? null;
}

async function computeCapacity(
  db: D1Database, district: string, seasonId: string | null, manuallyClosed: boolean, now: Date,
): Promise<DistrictCapacity> {
  if (manuallyClosed) return { freeSlots: 0, full: true, manuallyClosed: true };
  if (!seasonId) return OPEN_UNKNOWN;
  const slot = await resolveDistrictSlot(db, district, seasonId, null, now);
  if (slot.kind === "full") return { freeSlots: 0, full: true, manuallyClosed: false };
  if (slot.kind === "create") return { freeSlots: slot.size, full: false, manuallyClosed: false };
  const leagues = await listDistrictSeniorLeagues(db, district, seasonId, now);
  return { freeSlots: leagues.reduce((sum, l) => sum + l.aiTeams, 0), full: false, manuallyClosed: false };
}

/**
 * Vyhledávač kapacity s pamětí na jeden požadavek: seznam okresů se ptá na každý okres
 * a u zamčeného účtu i na jeho domovský, ručně zavřené okresy a sezóna se čtou jednou.
 */
export type CapacityLookup = (district: string) => Promise<DistrictCapacity>;

export function createCapacityLookup(db: D1Database, now: Date = new Date()): CapacityLookup {
  const cache = new Map<string, Promise<DistrictCapacity>>();
  let shared: Promise<{ closed: Set<string>; seasonId: string | null }> | null = null;
  return (district) => {
    let hit = cache.get(district);
    if (!hit) {
      shared ??= Promise.all([listManuallyClosedDistricts(db), activeSeasonId(db)])
        .then(([closed, seasonId]) => ({ closed, seasonId }));
      hit = shared
        .then((s) => computeCapacity(db, district, s.seasonId, s.closed.has(district), now))
        .catch((e) => { logger.warn({ module: M, district }, "kapacita okresu", e); return OPEN_UNKNOWN; });
      cache.set(district, hit);
    }
    return hit;
  };
}

export async function districtCapacity(db: D1Database, district: string, now: Date = new Date()): Promise<DistrictCapacity> {
  return createCapacityLookup(db, now)(district);
}

export interface OpenDistrict {
  name: string;
  /** Lidští manažeři v okrese (bez U21). */
  managers: number;
  freeSlots: number | null;
}

/**
 * Připravené okresy s volným místem, nejživější první (nejvíc lidských manažerů).
 * Nabídka pro toho, kdo se hlásí do plného okresu.
 */
export async function listOpenDistricts(db: D1Database, lookup: CapacityLookup = createCapacityLookup(db)): Promise<OpenDistrict[]> {
  const rows = await db.prepare(
    `SELECT d.district AS name,
            (SELECT COUNT(DISTINCT t.user_id) FROM teams t JOIN villages v ON v.id = t.village_id
              WHERE v.district = d.district AND t.user_id <> 'ai' AND COALESCE(t.team_type, 'senior') <> 'u21') AS managers
       FROM district_registrations d WHERE d.status = 'ready'`,
  ).all<{ name: string; managers: number }>();
  const open: OpenDistrict[] = [];
  for (const row of rows.results) {
    const capacity = await lookup(row.name);
    if (!capacity.full) open.push({ name: row.name, managers: row.managers, freeSlots: capacity.freeSlots });
  }
  return open.sort((a, b) => b.managers - a.managers || a.name.localeCompare(b.name, "cs"));
}
