/**
 * Nabídky vybavení od klubů ze sousedních okresů.
 *
 * Bazar se původně plnil z AI klubů ve vlastní lize. To ale selhalo přesně tam, kde
 * na tom nejvíc záleží: v lize, kde jsou všichni manažeři lidi (Okresní přebor
 * Prachatice — 14 týmů, 14 lidí), nebyl žádný AI klub a bazar zůstal prázdný.
 *
 * Řeší se to stejně jako u přestupového trhu (transfers/virtual-teams.ts): prodávají
 * VIRTUÁLNÍ kluby ze sousedních okresů. Nemají řádek v databázi, jen jméno — inzerát
 * má `team_id = NULL`, `is_ai_listing = 1` a `seller_name`. Funguje to v každé lize
 * bez ohledu na to, kdo v ní hraje.
 *
 * Nákup od virtuálního klubu peníze ze hry odčerpá (nikdo je nedostane), stejně jako
 * u nákupu virtuálního hráče na přestupovém trhu.
 */

import { logger } from "../lib/logger";
import { VIRTUAL_TEAMS } from "../transfers/virtual-teams";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  getBazarPriceBand,
} from "./equipment-generator";

const MODULE = "equipment-ai-listings";

/** Kolik nabídek od okolních klubů držet v lize. Nad tím se nedoplňuje. */
const TARGET_LISTINGS_PER_LEAGUE = 5;
/** Kolik jich smí přibýt za den — ať se bazar plní postupně a je proč se dívat. */
const MAX_NEW_PER_LEAGUE_PER_DAY = 2;
/** Inzerát okolního klubu vydrží déle než lidský — nikdo ho nestahuje. */
const AI_LISTING_DAYS = 10;

/**
 * Kluby pro okresy, které nemají vlastní záznam ve VIRTUAL_TEAMS.
 * Bez tohohle by v takové lize bazar zůstal prázdný — což je přesně ta chyba,
 * kterou tenhle modul opravuje.
 */
const FALLBACK_SELLERS = [
  "TJ Sokol Zálesí", "FK Nová Ves", "SK Podhoří", "TJ Baník Doubrava",
  "Slavoj Kamenice", "FK Střední Lhota", "TJ Dolní Újezd", "SK Vysoká",
];

/**
 * Rozdělení úrovní. Lv1 je běžné zboží, Lv3 se objeví jen občas — jinak by bazar
 * hned na začátku rozdal nejlepší vybavení ve hře a nákup v obchodě ztratil smysl.
 */
const LEVEL_WEIGHTS: Array<{ level: number; weight: number }> = [
  { level: 1, weight: 60 },
  { level: 2, weight: 30 },
  { level: 3, weight: 10 },
];

function pickLevel(): number {
  const total = LEVEL_WEIGHTS.reduce((s, l) => s + l.weight, 0);
  let roll = Math.random() * total;
  for (const entry of LEVEL_WEIGHTS) {
    roll -= entry.weight;
    if (roll <= 0) return entry.level;
  }
  return 1;
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Okres ligy — U21 ligy ho mají s příponou, kterou VIRTUAL_TEAMS nezná. */
function baseDistrict(district: string): string {
  return district.replace(/\s+U21$/, "").trim();
}

function pickSellerName(district: string): string {
  const teams = VIRTUAL_TEAMS[baseDistrict(district)];
  if (teams && teams.length > 0) return pick(teams).name;
  return pick(FALLBACK_SELLERS);
}

interface LeagueRow {
  league_id: string;
  district: string;
  active: number;
}

/** Doplní bazar o nabídky okolních klubů. Volá se z daily-ticku. */
export async function generateAiEquipmentListings(db: D1Database, now: Date): Promise<number> {
  const leagues = await db.prepare(
    `SELECT l.id AS league_id, l.district AS district,
            (SELECT COUNT(*) FROM equipment_listings el
              WHERE el.league_id = l.id AND el.status = 'active' AND el.is_ai_listing = 1) AS active
       FROM leagues l
      WHERE l.status = 'active'`
  ).all<LeagueRow>()
    .catch((e) => { logger.warn({ module: MODULE }, "fetch leagues for ai listings", e); return null; });

  if (!leagues?.results?.length) return 0;

  // Reálný čas, shodně s lidskými inzeráty i s expirací v daily-ticku.
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + AI_LISTING_DAYS);

  let created = 0;

  for (const league of leagues.results) {
    const missing = TARGET_LISTINGS_PER_LEAGUE - league.active;
    if (missing <= 0) continue;

    const toCreate = Math.min(missing, MAX_NEW_PER_LEAGUE_PER_DAY);
    const statements = [];

    for (let i = 0; i < toCreate; i++) {
      const category = pick(CATEGORIES);
      const level = pickLevel();
      // Ojeté, ale ne šrot — okolní kluby prodávají to, co jim doslouží.
      const condition = 25 + Math.floor(Math.random() * 61);

      const band = getBazarPriceBand(category, level, condition);
      const jitter = 0.85 + Math.random() * 0.3;
      const price = Math.max(band.min, Math.min(band.max, Math.round(band.suggested * jitter)));

      statements.push(
        db.prepare(
          `INSERT INTO equipment_listings
             (id, team_id, league_id, category, level, condition_at_listing, price, expires_at, is_ai_listing, seller_name)
           VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 1, ?)`
        ).bind(
          crypto.randomUUID(), league.league_id, category, level, condition, price,
          expiresAt.toISOString(), pickSellerName(league.district),
        )
      );
      logger.info({ module: MODULE }, `bazar ${league.district}: ${CATEGORY_LABELS[category]} lv${level} stav ${condition} % za ${price} Kč`);
    }

    try {
      await db.batch(statements);
      created += statements.length;
    } catch (e) {
      logger.warn({ module: MODULE }, `insert ai listings for league ${league.league_id}`, e);
    }
  }

  return created;
}
