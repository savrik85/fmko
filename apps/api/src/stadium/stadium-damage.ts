/**
 * Co fanoušci rozbijí a co to stojí spravit.
 *
 * Úroveň zařízení se sráží PŘÍMO ve `stadiums`. Zařízení čte spousta míst —
 * návštěvnost, tržby z občerstvení, riziko výtržností, 3D scéna, nabídka
 * upgradu — a kdyby se poškození drželo stranou jako „příznak", muselo by o něm
 * vědět každé z nich zvlášť. Takhle o něm nemusí vědět ani jedno: rozbité
 * sociálky prostě nejsou.
 *
 * Co se má při opravě vrátit, si pamatuje `stadium_damage`.
 */

import { logger } from "../lib/logger";
import { FACILITY_LABELS, UPGRADE_COSTS } from "./stadium-generator";

const M = "stadium-damage";

/**
 * Co se dá na tribuně rozbít.
 *
 * Osvětlení ani šatny tu schválně nejsou: na stožár nikdo nevyleze a do kabin
 * se divák nedostane. Pořadatelská služba taky ne — to jsou lidi, ne věc.
 */
export const ROZBITNE = [
  "toilets", "stands", "fence", "roof", "ultras_stand", "refreshments", "entrance_gate",
] as const;
export type RozbitnyPrvek = (typeof ROZBITNE)[number];

/**
 * Co můžou rozbít hráči klubu. Na rozdíl od fanoušků se dostanou i do kabin
 * (spec incidentů, Část 4b).
 */
export const ROZBITNE_ZEVNITR = ["changing_rooms", "showers", "toilets", "refreshments"] as const;

const OPRAVITELNE: readonly string[] = [...new Set<string>([...ROZBITNE, ...ROZBITNE_ZEVNITR])];

/** Zařízení, které jde poškodit a opravit. Název jde do SQL, proto whitelist. */
export function jeOpravitelne(facility: string): boolean {
  return OPRAVITELNE.includes(facility);
}

/** Oprava stojí zlomek toho, co úroveň stála postavit — spravit není postavit. */
export const PODIL_OPRAVY = 0.35;

export interface PoskozeniRow {
  id: string;
  team_id: string;
  facility: string;
  levels: number;
  repair_cost: number;
  popis: string;
  game_date: string | null;
  repaired_at: string | null;
}

/** Cena opravy jedné úrovně daného zařízení. */
export function cenaOpravy(facility: string, urovenPred: number, levels = 1): number {
  const ceny = UPGRADE_COSTS[facility] ?? [];
  let soucet = 0;
  for (let i = 0; i < levels; i++) {
    const uroven = urovenPred - i; // úroveň, o kterou přicházíme
    soucet += ceny[Math.max(0, Math.min(ceny.length - 1, uroven))] ?? 0;
  }
  return Math.max(500, Math.round((soucet * PODIL_OPRAVY) / 100) * 100);
}

/**
 * Vybere, co parta rozbila, a srazí to o úroveň.
 *
 * Rozbít jde jen to, co klub má — na prázdné parcele není co ničit. Když klub
 * nemá postavené nic, vrací `null` a zůstane jen účet za úklid.
 */
export async function rozbijVybaveni(
  db: D1Database,
  opts: {
    teamId: string;
    incidentId: string;
    severity: number;
    gameDate: string;
    /** Deterministický výběr — stejný zápas rozbije totéž i při přepočtu. */
    vyber: <T>(z: readonly T[]) => T;
  },
): Promise<{ facility: string; label: string; levels: number; cost: number } | null> {
  const sloupce = ROZBITNE.join(", ");
  const stadion = await db
    .prepare(`SELECT ${sloupce} FROM stadiums WHERE team_id = ?`)
    .bind(opts.teamId)
    .first<Record<string, number>>()
    .catch((e) => { logger.warn({ module: M }, `stadion ${opts.teamId}`, e); return null; });
  if (!stadion) return null;

  const mozne = ROZBITNE.filter((k) => (stadion[k] ?? 0) > 0);
  if (mozne.length === 0) return null;

  const facility = opts.vyber(mozne);
  const pred = stadion[facility] ?? 0;
  // Vážná škoda umí sundat dvě úrovně, ale nikdy ne pod nulu.
  const levels = Math.min(pred, opts.severity >= 3 ? 2 : 1);
  if (levels <= 0) return null;

  const label = FACILITY_LABELS[facility] ?? facility;
  const cost = cenaOpravy(facility, pred, levels);
  // Názvy zařízení mají různý rod i číslo („Zastřešení tribun" střední jednotné,
  // „Sociálky" ženské množné), takže se s nimi nedá shodovat sloveso ani
  // přídavné jméno. Věta je proto postavená tak, že název stojí samostatně.
  const popis = levels > 1
    ? `Po zápase rozbité, a rovnou o dvě úrovně: ${label}.`
    : `Po zápase rozbité: ${label}. Dokud to neopravíš, nefunguje to.`;

  // Nárok na zápis: partial UNIQUE na incident_id zaručí, že jedna výtržnost
  // rozbije jednu věc jednou. Teprve po úspěšném zápisu se sráží úroveň, jinak
  // by přepočet zápasu srazil stadion podruhé.
  const zapis = await db
    .prepare(
      `INSERT OR IGNORE INTO stadium_damage
         (id, team_id, facility, levels, repair_cost, incident_id, popis, game_date)
       VALUES (?,?,?,?,?,?,?,?)`,
    )
    .bind(`dmg-${opts.incidentId}`, opts.teamId, facility, levels, cost, opts.incidentId, popis, opts.gameDate)
    .run()
    .catch((e) => { logger.error({ module: M }, `zápis poškození ${opts.incidentId}`, e); return null; });
  if ((zapis?.meta?.changes ?? 0) === 0) return null;

  // Název sloupce je z uzavřeného výčtu ROZBITNE, ne z uživatelského vstupu.
  await db
    .prepare(`UPDATE stadiums SET ${facility} = MAX(0, ${facility} - ?) WHERE team_id = ?`)
    .bind(levels, opts.teamId)
    .run()
    .catch((e) => { logger.error({ module: M }, `sražení ${facility} u ${opts.teamId}`, e); });

  return { facility, label, levels, cost };
}

/**
 * Poškodí konkrétní zařízení kvůli klubovému incidentu.
 *
 * Stejná idempotence jako `rozbijVybaveni`: klíč `incident_id` je `{incidentId}-{zařízení}`,
 * takže jeden incident smí poškodit dvě různá zařízení (gril i stánek), ale žádné dvakrát.
 */
export async function poskodZarizeni(
  db: D1Database,
  opts: { teamId: string; incidentId: string; facility: string; levels: number; gameDate: string; popis: string },
): Promise<{ damageId: string; label: string; levels: number; cost: number } | null> {
  if (!jeOpravitelne(opts.facility)) {
    logger.error({ module: M }, `poškození neznámého zařízení ${opts.facility}`);
    return null;
  }
  const stadion = await db
    .prepare(`SELECT ${opts.facility} AS u FROM stadiums WHERE team_id = ?`)
    .bind(opts.teamId)
    .first<{ u: number }>()
    .catch((e) => { logger.warn({ module: M }, `stadion ${opts.teamId}`, e); return null; });
  const pred = stadion?.u ?? 0;
  const levels = Math.min(pred, opts.levels);
  if (levels <= 0) return null;

  const label = FACILITY_LABELS[opts.facility] ?? opts.facility;
  const cost = cenaOpravy(opts.facility, pred, levels);
  const klic = `${opts.incidentId}-${opts.facility}`;
  const damageId = `dmg-${klic}`;

  const zapis = await db
    .prepare(
      `INSERT OR IGNORE INTO stadium_damage
         (id, team_id, facility, levels, repair_cost, incident_id, popis, game_date)
       VALUES (?,?,?,?,?,?,?,?)`,
    )
    .bind(damageId, opts.teamId, opts.facility, levels, cost, klic, opts.popis, opts.gameDate)
    .run()
    .catch((e) => { logger.error({ module: M }, `zápis poškození ${klic}`, e); return null; });
  if ((zapis?.meta?.changes ?? 0) === 0) return null;

  await db
    .prepare(`UPDATE stadiums SET ${opts.facility} = MAX(0, ${opts.facility} - ?) WHERE team_id = ?`)
    .bind(levels, opts.teamId)
    .run()
    .catch((e) => { logger.error({ module: M }, `sražení ${opts.facility} u ${opts.teamId}`, e); });

  return { damageId, label, levels, cost };
}

/** Co má klub rozbité a čeká na opravu. */
export async function nactiPoskozeni(db: D1Database, teamId: string): Promise<Array<PoskozeniRow & { label: string }>> {
  const rows = await db
    .prepare("SELECT * FROM stadium_damage WHERE team_id = ? AND repaired_at IS NULL ORDER BY created_at DESC")
    .bind(teamId)
    .all<PoskozeniRow>()
    .catch((e) => { logger.warn({ module: M }, `poškození ${teamId}`, e); return { results: [] as PoskozeniRow[] }; });
  return rows.results.map((r) => ({ ...r, label: FACILITY_LABELS[r.facility] ?? r.facility }));
}

export type VysledekOpravy =
  | { ok: true; label: string; cost: number; novaUroven: number }
  | { ok: false; duvod: "nenalezeno" | "uz_opraveno" | "malo_penez"; chybi?: number };

/**
 * Oprava. Peníze se strhnou jen tehdy, když se povede nárok — jinak by dvě
 * kliknutí za sebou zaplatila jednu opravu dvakrát.
 */
export async function opravVybaveni(
  db: D1Database,
  opts: { teamId: string; damageId: string; gameDate: string },
): Promise<VysledekOpravy> {
  const dmg = await db
    .prepare("SELECT * FROM stadium_damage WHERE id = ? AND team_id = ?")
    .bind(opts.damageId, opts.teamId)
    .first<PoskozeniRow>()
    .catch((e) => { logger.warn({ module: M }, `načtení opravy ${opts.damageId}`, e); return null; });
  if (!dmg) return { ok: false, duvod: "nenalezeno" };
  if (dmg.repaired_at) return { ok: false, duvod: "uz_opraveno" };

  const tym = await db
    .prepare("SELECT budget FROM teams WHERE id = ?")
    .bind(opts.teamId).first<{ budget: number }>()
    .catch((e) => { logger.warn({ module: M }, "rozpočet pro opravu", e); return null; });
  const budget = tym?.budget ?? 0;
  if (budget < dmg.repair_cost) {
    return { ok: false, duvod: "malo_penez", chybi: dmg.repair_cost - budget };
  }

  const narok = await db
    .prepare("UPDATE stadium_damage SET repaired_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ? AND repaired_at IS NULL")
    .bind(opts.damageId)
    .run()
    .catch((e) => { logger.error({ module: M }, `nárok na opravu ${opts.damageId}`, e); return null; });
  if ((narok?.meta?.changes ?? 0) === 0) return { ok: false, duvod: "uz_opraveno" };

  // Opravit jde i to, co rozbili hráči uvnitř (šatny, sprchy). Dřív whitelist znal jen
  // věci rozbitné fanoušky a oprava šaten by skončila „neznámé zařízení".
  const facility = OPRAVITELNE.find((k) => k === dmg.facility);
  if (!facility) {
    logger.error({ module: M }, `neznámé zařízení v opravě: ${dmg.facility}`);
    return { ok: false, duvod: "nenalezeno" };
  }

  await db
    .prepare(`UPDATE stadiums SET ${facility} = MIN(3, ${facility} + ?) WHERE team_id = ?`)
    .bind(dmg.levels, opts.teamId)
    .run()
    .catch((e) => { logger.error({ module: M }, `vrácení úrovně ${facility}`, e); });

  const { recordTransaction } = await import("../season/finance-processor");
  await recordTransaction(
    db, opts.teamId, "stadium_upgrade", -dmg.repair_cost,
    `Oprava: ${FACILITY_LABELS[facility] ?? facility}`, opts.gameDate, `oprava-${opts.damageId}`,
  ).catch((e) => { logger.error({ module: M }, "úhrada opravy", e); });

  const nova = await db
    .prepare(`SELECT ${facility} AS u FROM stadiums WHERE team_id = ?`)
    .bind(opts.teamId).first<{ u: number }>()
    .catch((e) => { logger.warn({ module: M }, "nová úroveň po opravě", e); return null; });

  return {
    ok: true,
    label: FACILITY_LABELS[facility] ?? facility,
    cost: dmg.repair_cost,
    novaUroven: nova?.u ?? 0,
  };
}

/**
 * Oprava, kterou nikdo neplatí (spec 4d, `remeslnik_opravil`). Stejně hlídaná jako placená
 * oprava: kdo přijde druhý, nedostane nic, aby se jedna škoda neopravila dvakrát.
 */
export async function opravZdarma(
  db: D1Database,
  opts: { teamId: string; damageId: string; gameDate: string },
): Promise<VysledekOpravy> {
  const dmg = await db
    .prepare("SELECT * FROM stadium_damage WHERE id = ? AND team_id = ?")
    .bind(opts.damageId, opts.teamId)
    .first<PoskozeniRow>()
    .catch((e) => { logger.warn({ module: M }, `načtení bezplatné opravy ${opts.damageId}`, e); return null; });
  if (!dmg) return { ok: false, duvod: "nenalezeno" };
  if (dmg.repaired_at) return { ok: false, duvod: "uz_opraveno" };

  const narok = await db
    .prepare("UPDATE stadium_damage SET repaired_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ? AND repaired_at IS NULL")
    .bind(opts.damageId)
    .run()
    .catch((e) => { logger.error({ module: M }, `nárok na bezplatnou opravu ${opts.damageId}`, e); return null; });
  if ((narok?.meta?.changes ?? 0) === 0) return { ok: false, duvod: "uz_opraveno" };

  // Stejný whitelist jako u placené opravy — smí se opravit i to, co rozbili hráči uvnitř.
  const facility = OPRAVITELNE.find((k) => k === dmg.facility);
  if (!facility) {
    logger.error({ module: M }, `neznámé zařízení v bezplatné opravě: ${dmg.facility}`);
    return { ok: false, duvod: "nenalezeno" };
  }

  await db
    .prepare(`UPDATE stadiums SET ${facility} = MIN(3, ${facility} + ?) WHERE team_id = ?`)
    .bind(dmg.levels, opts.teamId)
    .run()
    .catch((e) => { logger.error({ module: M }, `vrácení úrovně ${facility} (zdarma)`, e); });

  const nova = await db
    .prepare(`SELECT ${facility} AS u FROM stadiums WHERE team_id = ?`)
    .bind(opts.teamId).first<{ u: number }>()
    .catch((e) => { logger.warn({ module: M }, "nová úroveň po bezplatné opravě", e); return null; });

  return {
    ok: true,
    label: FACILITY_LABELS[facility] ?? facility,
    cost: 0,
    novaUroven: nova?.u ?? 0,
  };
}
