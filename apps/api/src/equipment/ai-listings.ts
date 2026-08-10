/**
 * Nabídky vybavení od AI klubů.
 *
 * V lize se dvěma lidskými manažery by byl bazar prázdný a celá funkce k ničemu.
 * AI kluby proto občas vyklidí kůlnu — nabídnou vybavení, které jim zbylo.
 *
 * Prodej je pak úplně normální: kupující zaplatí, AI klub o vybavení opravdu přijde
 * a peníze dostane. Žádná zvláštní větev v nákupu, jen další inzerát v tabulce.
 */

import { logger } from "../lib/logger";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  getBazarPriceBand,
} from "./equipment-generator";

const MODULE = "equipment-ai-listings";

/** Kolik aktivních AI nabídek chceme v lize držet. Nad tím se nedoplňuje. */
const TARGET_AI_LISTINGS_PER_LEAGUE = 4;
/** Kolik jich smí vzniknout za jeden den v jedné lize — ať se bazar plní postupně. */
const MAX_NEW_PER_LEAGUE_PER_DAY = 1;
/** Inzerát AI klubu vydrží déle než lidský — nikdo ho nestahuje. */
const AI_LISTING_DAYS = 10;

interface LeagueNeed {
  league_id: string;
  active: number;
}

/**
 * Doplní bazar o nabídky AI klubů. Volá se z daily-ticku.
 *
 * Držíme se nízko s počtem dotazů: jeden na ligy, které mají málo nabídek, a pak
 * jeden na kandidáta a jeden insert na ligu. Daily-tick je na D1 limity citlivý.
 */
export async function generateAiEquipmentListings(db: D1Database, now: Date): Promise<number> {
  const leagues = await db.prepare(
    `SELECT l.id AS league_id,
            (SELECT COUNT(*) FROM equipment_listings el
               JOIN teams t2 ON t2.id = el.team_id
              WHERE el.league_id = l.id AND el.status = 'active' AND t2.user_id = 'ai') AS active
       FROM leagues l`
  ).all<LeagueNeed>()
    .catch((e) => { logger.warn({ module: MODULE }, "fetch leagues for ai listings", e); return null; });

  if (!leagues?.results?.length) return 0;

  // Reálný čas, shodně s lidskými inzeráty i s expirací v daily-ticku.
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + AI_LISTING_DAYS);
  let created = 0;

  for (const league of leagues.results) {
    if (league.active >= TARGET_AI_LISTINGS_PER_LEAGUE) continue;

    for (let i = 0; i < MAX_NEW_PER_LEAGUE_PER_DAY; i++) {
      // Náhodný AI klub v lize, který už má řádek vybavení. Řádek vzniká líně,
      // takže kluby, na které se nikdo nepodíval, prostě přeskočíme.
      const candidate = await db.prepare(
        `SELECT e.* FROM equipment e
           JOIN teams t ON t.id = e.team_id
          WHERE t.league_id = ? AND t.user_id = 'ai'
          ORDER BY RANDOM() LIMIT 1`
      ).bind(league.league_id).first<Record<string, unknown>>()
        .catch((e) => { logger.warn({ module: MODULE }, "pick ai seller", e); return null; });

      if (!candidate) break;
      const teamId = candidate.team_id as string;

      // Co už tenhle klub nabízí, znovu nabízet nesmíme — brání tomu unique index.
      const listedRows = await db.prepare(
        "SELECT category FROM equipment_listings WHERE team_id = ? AND status = 'active'"
      ).bind(teamId).all<{ category: string }>()
        .catch((e) => { logger.warn({ module: MODULE }, "fetch ai team listings", e); return null; });
      const alreadyListed = new Set((listedRows?.results ?? []).map((r) => r.category));

      const options = CATEGORIES.filter((cat) => {
        const level = (candidate[cat] as number) ?? 0;
        return level >= 1 && !alreadyListed.has(cat);
      });
      if (options.length === 0) break;

      const category = options[Math.floor(Math.random() * options.length)];
      const level = candidate[category] as number;
      const condition = (candidate[`${category}_condition`] as number) ?? 50;

      // AI nesmlouvá, ale ani nestřílí od boku — drží se doporučené ceny s rozptylem,
      // ať se v bazaru objeví i výhodné kusy a hráč má co vybírat.
      const band = getBazarPriceBand(category, level, condition);
      const jitter = 0.85 + Math.random() * 0.3;
      const price = Math.max(band.min, Math.min(band.max, Math.round(band.suggested * jitter)));

      try {
        await db.prepare(
          "INSERT INTO equipment_listings (id, team_id, league_id, category, level, condition_at_listing, price, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(crypto.randomUUID(), teamId, league.league_id, category, level, condition, price, expiresAt.toISOString()).run();
        created++;
        logger.info({ module: MODULE }, `AI nabídka: ${CATEGORY_LABELS[category]} lv${level} za ${price} Kč (${teamId})`);
      } catch (e) {
        // Souběh s unique indexem není chyba, jen se ten den nic nepřidalo.
        logger.warn({ module: MODULE }, `insert ai listing ${category} for ${teamId}`, e);
      }
    }
  }

  return created;
}
