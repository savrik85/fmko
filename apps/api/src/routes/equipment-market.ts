/**
 * Bazar vybavení a zastavárna.
 *
 * Vybavení nemá identitu kusů — tabulka `equipment` je široká, jeden řádek na tým,
 * kategorie × (level, stav). Obchoduje se tedy ÚROVEŇ KATEGORIE, ne předmět. Prodej
 * srazí kategorii na nulu, nákup ji zvedne na úroveň z inzerátu i s opotřebením.
 *
 * Prodávající vybavení používá dál, dokud se neprodá (žádné escrow) — jinak by nikdo
 * nic nevystavil. Cenou za to je kaskáda podmíněných UPDATE níž: D1 nemá transakce
 * a `batch()` nerollbackuje WHERE, který nechytne řádek, takže se každý vzácný zdroj
 * zabírá zvlášť a kompenzuje ručně.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { requireTeamOwnership } from "../auth/middleware";
import { logger } from "../lib/logger";
import { mustSeason } from "../lib/season";
import { sendSystemSMS } from "../messaging/system-sms";
import { createNotification } from "../community/notifications";
import { ensureEquipmentRow, splitEquipmentRow } from "../equipment/equipment-service";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  checkLevelUnlock,
  cumulativeInvestment,
  getBazarPriceBand,
  getLevelDescription,
  getPawnQuote,
  getUpgradeEffectLabel,
  shopCostFromLevel,
  type EquipmentCategory,
} from "../equipment/equipment-generator";

export const equipmentMarketRouter = new Hono<{ Bindings: Bindings }>();

// Ownership explicitně, ne spoléháním na to, že gameRouter má překrývající se pattern.
// Kdo čte tenhle soubor, musí vidět, že je chráněný. (Middleware pouští GET dál — viz
// auth/middleware.ts:34 — proto GET níž záměrně nevrací nic soukromého jako rozpočet.)
equipmentMarketRouter.use("/teams/:teamId/equipment-market", requireTeamOwnership);
equipmentMarketRouter.use("/teams/:teamId/equipment-market/*", requireTeamOwnership);
equipmentMarketRouter.use("/teams/:teamId/equipment/pawn", requireTeamOwnership);

const LISTING_DAYS = 7;
const MODULE = "equipment-market";

/** Kategorie se interpoluje do SQL stringu (široká tabulka), takže whitelist je povinný. */
function isKnownCategory(value: unknown): value is EquipmentCategory {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

interface ListingRow {
  id: string;
  team_id: string;
  league_id: string;
  category: string;
  level: number;
  condition_at_listing: number;
  price: number;
  status: string;
  expires_at: string | null;
}

interface BuyerContext {
  budget: number;
  league_id: string | null;
  reputation: number;
  game_date: string | null;
}

/**
 * Má tým zápas dnes nebo zítra?
 *
 * Dodávka (team_van) ovlivňuje absence přes fetchTeamCommuteMod, které se čte dvakrát:
 * v „den před" SMS (daily-tick) a znovu při simulaci zápasu. Kdyby se mezi tím změnila
 * úroveň dodávky, sestava v SMS by nesouhlasila s tou, co reálně nastoupí. Proto se
 * dodávka v zápasovém okně neprodává ani nekupuje.
 */
async function hasImminentMatch(db: D1Database, teamId: string, leagueId: string | null, gameDate: string | null): Promise<boolean> {
  if (!leagueId) return false;
  const base = gameDate ? new Date(gameDate) : new Date();
  if (Number.isNaN(base.getTime())) return false;

  const from = new Date(base); from.setUTCHours(0, 0, 0, 0);
  const to = new Date(base); to.setDate(to.getDate() + 1); to.setUTCHours(23, 59, 59, 999);

  const row = await db.prepare(
    `SELECT sc.id FROM season_calendar sc
      WHERE sc.league_id = ? AND sc.status = 'scheduled' AND sc.scheduled_at BETWEEN ? AND ?
        AND EXISTS (SELECT 1 FROM matches m WHERE m.calendar_id = sc.id AND (m.home_team_id = ? OR m.away_team_id = ?))
      LIMIT 1`
  ).bind(leagueId, from.toISOString(), to.toISOString(), teamId, teamId).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: MODULE }, "imminent match lookup", e); return null; });

  return !!row;
}

const VAN_LOCK_MESSAGE = "Dodávku nemůžeš prodat ani kupovat v den zápasu — kluci s ní počítají a sestava je už rozeslaná.";

/** Kolik odehraných zápasů a jaká je aktivní sezóna — vstup do kontroly nároku na level. */
async function fetchUnlockContext(db: D1Database, teamId: string): Promise<{ matchesPlayed: number; season: number }> {
  const [matchesRes, seasonRes] = await db.batch([
    db.prepare("SELECT COUNT(*) as cnt FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'").bind(teamId, teamId),
    db.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"),
  ]);
  return {
    matchesPlayed: (matchesRes.results[0] as { cnt: number } | undefined)?.cnt ?? 0,
    season: mustSeason((seasonRes.results[0] as { number: number } | undefined)?.number),
  };
}

// ── GET /api/teams/:teamId/equipment-market ──────────────────────────────────
// Nabídky z mojí ligy + moje inzeráty + historie prodejů.
// Rozpočet ZÁMĚRNĚ nevrací: requireTeamOwnership pouští GET bez kontroly, takže by
// šlo přečíst cizí rozpočet. Frontend ho stejně má z team-contextu.
equipmentMarketRouter.get("/teams/:teamId/equipment-market", async (c) => {
  const teamId = c.req.param("teamId");

  const me = await c.env.DB.prepare("SELECT league_id, reputation FROM teams WHERE id = ?")
    .bind(teamId).first<{ league_id: string | null; reputation: number }>()
    .catch((e) => { logger.warn({ module: MODULE }, "fetch team for market", e); return null; });
  if (!me) return c.json({ error: "Tým nenalezen" }, 404);

  const equip = await ensureEquipmentRow(c.env.DB, teamId);
  if (!equip) return c.json({ error: "Vybavení se nepodařilo načíst" }, 500);
  const { levels } = splitEquipmentRow(equip);

  const { matchesPlayed, season } = await fetchUnlockContext(c.env.DB, teamId);

  const [offersRes, mineRes, historyRes] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT el.id, el.team_id, el.category, el.level, el.price, el.expires_at, el.created_at,
              el.condition_at_listing, t.name AS team_name
         FROM equipment_listings el
         JOIN teams t ON el.team_id = t.id
        WHERE el.league_id = ? AND el.status = 'active' AND el.team_id != ?
        ORDER BY el.created_at DESC`
    ).bind(me.league_id ?? "", teamId),
    c.env.DB.prepare(
      "SELECT id, category, level, price, condition_at_listing, expires_at, created_at FROM equipment_listings WHERE team_id = ? AND status = 'active' ORDER BY created_at DESC"
    ).bind(teamId),
    c.env.DB.prepare(
      `SELECT el.category, el.level, el.status, el.sold_price, el.sold_condition, el.resolved_at, t.name AS buyer_name
         FROM equipment_listings el
         LEFT JOIN teams t ON el.buyer_team_id = t.id
        WHERE el.team_id = ? AND el.status IN ('sold','pawned','expired','withdrawn')
        ORDER BY el.resolved_at DESC LIMIT 20`
    ).bind(teamId),
  ]);

  // Živé stavy prodávajících jedním dotazem — JOIN výš vrací jen rowid, hodnoty musíme
  // vytáhnout z široké tabulky podle názvu sloupce, což se v SQL dělá blbě.
  const sellerIds = [...new Set((offersRes.results as Array<{ team_id: string }>).map((r) => r.team_id))];
  const sellerConditions = new Map<string, Record<string, unknown>>();
  if (sellerIds.length > 0) {
    const rows = await c.env.DB.prepare(
      `SELECT * FROM equipment WHERE team_id IN (${sellerIds.map(() => "?").join(",")})`
    ).bind(...sellerIds).all<Record<string, unknown>>()
      .catch((e) => { logger.warn({ module: MODULE }, "fetch seller equipment", e); return null; });
    for (const row of rows?.results ?? []) sellerConditions.set(row.team_id as string, row);
  }

  const listings = (offersRes.results as Array<Record<string, unknown>>)
    .filter((row) => isKnownCategory(row.category))
    .map((row) => {
      const category = row.category as string;
      const level = row.level as number;
      const myLevel = levels[category] ?? 0;
      const sellerRow = sellerConditions.get(row.team_id as string);
      const liveCondition = (sellerRow?.[`${category}_condition`] as number) ?? (row.condition_at_listing as number);
      const unlock = checkLevelUnlock(level, me.reputation, matchesPlayed, season);
      const shopPrice = shopCostFromLevel(category, myLevel, level);

      let blockReason: string | null = null;
      if (myLevel >= level) blockReason = `Tohle už máš — úroveň ${myLevel}`;
      else if (unlock.locked) blockReason = unlock.reason ?? "Zatím na to nemáš nárok";

      return {
        id: row.id as string,
        teamId: row.team_id as string,
        teamName: row.team_name as string,
        category,
        categoryLabel: CATEGORY_LABELS[category],
        level,
        levelDescription: getLevelDescription(category, level),
        effect: getUpgradeEffectLabel(category, level),
        condition: liveCondition,
        conditionAtListing: row.condition_at_listing as number,
        price: row.price as number,
        expiresAt: row.expires_at as string,
        myLevel,
        shopPrice,
        savings: shopPrice - (row.price as number),
        repairCostAfterBuy: liveCondition < 60 ? level * 500 : 0,
        canBuy: blockReason === null,
        blockReason,
        lockDetail: unlock.locked ? unlock.detail : null,
      };
    });

  const myListings = (mineRes.results as Array<Record<string, unknown>>).map((row) => {
    const category = row.category as string;
    return {
      id: row.id as string,
      category,
      categoryLabel: CATEGORY_LABELS[category] ?? category,
      level: row.level as number,
      price: row.price as number,
      condition: (equip[`${category}_condition`] as number) ?? (row.condition_at_listing as number),
      conditionAtListing: row.condition_at_listing as number,
      expiresAt: row.expires_at as string,
    };
  });

  const history = (historyRes.results as Array<Record<string, unknown>>).map((row) => ({
    category: row.category as string,
    categoryLabel: CATEGORY_LABELS[row.category as string] ?? (row.category as string),
    level: row.level as number,
    status: row.status as string,
    soldPrice: (row.sold_price as number) ?? null,
    soldCondition: (row.sold_condition as number) ?? null,
    resolvedAt: (row.resolved_at as string) ?? null,
    buyerName: (row.buyer_name as string) ?? null,
  }));

  return c.json({ listings, myListings, history });
});

// ── POST /api/teams/:teamId/equipment-market/list ────────────────────────────
equipmentMarketRouter.post("/teams/:teamId/equipment-market/list", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ category?: string; price?: number }>().catch(() => ({}) as { category?: string; price?: number });

  if (!isKnownCategory(body.category)) return c.json({ error: "Neznámá kategorie vybavení" }, 400);
  const category = body.category;

  if (!Number.isInteger(body.price) || (body.price as number) <= 0) {
    return c.json({ error: "Cena musí být celé kladné číslo" }, 400);
  }
  const price = body.price as number;

  const team = await c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ league_id: string | null }>()
    .catch((e) => { logger.warn({ module: MODULE }, "fetch team for listing", e); return null; });
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);
  if (!team.league_id) return c.json({ error: "Tvůj tým zatím není zařazený do ligy" }, 400);

  const equip = await ensureEquipmentRow(c.env.DB, teamId);
  if (!equip) return c.json({ error: "Vybavení se nepodařilo načíst" }, 500);

  const level = (equip[category] as number) ?? 0;
  if (level <= 0) return c.json({ error: `${CATEGORY_LABELS[category]} nemáš, není co prodávat` }, 400);
  const condition = (equip[`${category}_condition`] as number) ?? 50;

  if (category === "team_van") {
    const teamClock = await c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?")
      .bind(teamId).first<{ game_date: string | null }>()
      .catch((e) => { logger.warn({ module: MODULE }, "fetch game_date for van listing guard", e); return null; });
    if (await hasImminentMatch(c.env.DB, teamId, team.league_id, teamClock?.game_date ?? null)) {
      return c.json({ error: VAN_LOCK_MESSAGE }, 400);
    }
  }

  const band = getBazarPriceBand(category, level, condition);
  if (price < band.min || price > band.max) {
    return c.json({
      error: `Cena musí být mezi ${band.min.toLocaleString("cs")} a ${band.max.toLocaleString("cs")} Kč`,
      band,
    }, 400);
  }

  // REÁLNÝ čas, ne herní — schválně, shodně s transfer_listings (game.ts) a s tím,
  // jak inzeráty expiruje daily-tick. Herní čas se mezi ligami rozchází kvůli
  // game_clock.offset_days, takže by inzeráty expirovaly hned nebo nikdy.
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + LISTING_DAYS);

  const listingId = crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      "INSERT INTO equipment_listings (id, team_id, league_id, category, level, condition_at_listing, price, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(listingId, teamId, team.league_id, category, level, condition, price, expiresAt.toISOString()).run();
  } catch (e) {
    // Partial unique index — druhý aktivní inzerát na stejnou kategorii neprojde.
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE")) return c.json({ error: `${CATEGORY_LABELS[category]} už v bazaru máš` }, 409);
    logger.error({ module: MODULE }, `insert listing failed team=${teamId} cat=${category}`, e);
    return c.json({ error: "Inzerát se nepodařilo vytvořit" }, 500);
  }

  return c.json({ ok: true, listingId, price, expiresAt: expiresAt.toISOString() });
});

// ── DELETE /api/teams/:teamId/equipment-market/:listingId ────────────────────
equipmentMarketRouter.delete("/teams/:teamId/equipment-market/:listingId", async (c) => {
  const teamId = c.req.param("teamId");
  const listingId = c.req.param("listingId");

  const res = await c.env.DB.prepare(
    "UPDATE equipment_listings SET status = 'withdrawn', resolved_at = ? WHERE id = ? AND team_id = ? AND status = 'active'"
  ).bind(new Date().toISOString(), listingId, teamId).run()
    .catch((e) => { logger.warn({ module: MODULE }, "withdraw listing", e); return null; });

  if (!res || res.meta.changes === 0) return c.json({ error: "Nabídka už není aktivní" }, 409);
  return c.json({ ok: true });
});

// ── POST /api/teams/:teamId/equipment/pawn ───────────────────────────────────
equipmentMarketRouter.post("/teams/:teamId/equipment/pawn", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ category?: string }>().catch(() => ({}) as { category?: string });

  if (!isKnownCategory(body.category)) return c.json({ error: "Neznámá kategorie vybavení" }, 400);
  const category = body.category;

  const equip = await ensureEquipmentRow(c.env.DB, teamId);
  if (!equip) return c.json({ error: "Vybavení se nepodařilo načíst" }, 500);

  const level = (equip[category] as number) ?? 0;
  if (level <= 0) return c.json({ error: `${CATEGORY_LABELS[category]} nemáš, není co prodávat` }, 400);
  const condition = (equip[`${category}_condition`] as number) ?? 50;

  const team = await c.env.DB.prepare("SELECT league_id, game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ league_id: string | null; game_date: string | null }>()
    .catch((e) => { logger.warn({ module: MODULE }, "fetch team for pawn", e); return null; });

  if (category === "team_van" && await hasImminentMatch(c.env.DB, teamId, team?.league_id ?? null, team?.game_date ?? null)) {
    return c.json({ error: VAN_LOCK_MESSAGE }, 400);
  }

  const payout = getPawnQuote(category, level, condition);

  // Guard na level I stav: dvojklik projde jen jednou a mezi zobrazenou kvótou
  // a zápisem nesmí zasáhnout noční degradace, jinak by vyplacená částka nesouhlasila.
  const taken = await c.env.DB.prepare(
    `UPDATE equipment SET ${category} = 0, ${category}_condition = 50
      WHERE team_id = ? AND ${category} = ? AND ${category}_condition = ?`
  ).bind(teamId, level, condition).run()
    .catch((e) => { logger.error({ module: MODULE }, `pawn take failed team=${teamId} cat=${category}`, e); return null; });

  if (!taken || taken.meta.changes === 0) {
    return c.json({ error: "Stav vybavení se mezitím změnil, načti stránku znovu" }, 409);
  }

  // Zboží je odebrané, teprve teď se platí. Opačné pořadí by při souběhu vyplatilo dvakrát.
  const { recordTransaction } = await import("../season/finance-processor");
  const gameDate = team?.game_date ?? new Date().toISOString();
  const balanceAfter = await recordTransaction(
    c.env.DB, teamId, "equipment_pawn", payout,
    `Zastavárna: ${CATEGORY_LABELS[category]} (úroveň ${level}, stav ${condition} %)`, gameDate,
  );

  await c.env.DB.batch([
    // Historie „co jsem prodal" — pawned řádky nikdy nebyly aktivní, proto expires_at NULL.
    c.env.DB.prepare(
      "INSERT INTO equipment_listings (id, team_id, league_id, category, level, condition_at_listing, price, status, sold_price, sold_condition, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pawned', ?, ?, ?)"
    ).bind(crypto.randomUUID(), teamId, team?.league_id ?? "", category, level, condition, payout, payout, condition, new Date().toISOString()),
    // Inzerát na tuhle kategorii už nemá krytí.
    c.env.DB.prepare(
      "UPDATE equipment_listings SET status = 'withdrawn', resolved_at = ? WHERE team_id = ? AND category = ? AND status = 'active'"
    ).bind(new Date().toISOString(), teamId, category),
  ]).catch((e) => logger.warn({ module: MODULE }, "pawn bookkeeping", e));

  return c.json({ ok: true, category, level, payout, balanceAfter });
});

// ── POST /api/teams/:teamId/equipment-market/:listingId/buy ──────────────────
equipmentMarketRouter.post("/teams/:teamId/equipment-market/:listingId/buy", async (c) => {
  const teamId = c.req.param("teamId");
  const listingId = c.req.param("listingId");
  const now = new Date().toISOString();

  const listing = await c.env.DB.prepare(
    "SELECT id, team_id, league_id, category, level, condition_at_listing, price, status, expires_at FROM equipment_listings WHERE id = ?"
  ).bind(listingId).first<ListingRow>()
    .catch((e) => { logger.warn({ module: MODULE }, "fetch listing for buy", e); return null; });

  if (!listing) return c.json({ error: "Nabídka neexistuje" }, 404);
  if (listing.status !== "active") return c.json({ error: "Nabídka už není aktivní" }, 409);
  if (listing.expires_at && listing.expires_at < now) return c.json({ error: "Nabídka vypršela" }, 409);
  if (listing.team_id === teamId) return c.json({ error: "Vlastní nabídku koupit nemůžeš" }, 400);

  // Kategorie jde z DB rovnou do SQL stringu — whitelist podruhé, nezávisle na vstupu z requestu.
  if (!isKnownCategory(listing.category)) {
    logger.error({ module: MODULE }, `listing ${listingId} má neznámou kategorii "${listing.category}"`);
    return c.json({ error: "Poškozený záznam nabídky" }, 500);
  }
  const category = listing.category;

  const buyer = await c.env.DB.prepare("SELECT budget, league_id, reputation, game_date FROM teams WHERE id = ?")
    .bind(teamId).first<BuyerContext>()
    .catch((e) => { logger.warn({ module: MODULE }, "fetch buyer", e); return null; });
  if (!buyer) return c.json({ error: "Tým nenalezen" }, 404);
  if (buyer.league_id !== listing.league_id) return c.json({ error: "Nabídka je z jiné ligy" }, 403);

  const buyerEquip = await ensureEquipmentRow(c.env.DB, teamId);
  if (!buyerEquip) return c.json({ error: "Vybavení se nepodařilo načíst" }, 500);
  const myLevel = (buyerEquip[category] as number) ?? 0;
  const myCondition = (buyerEquip[`${category}_condition`] as number) ?? 50;
  if (myLevel >= listing.level) {
    return c.json({ error: `${CATEGORY_LABELS[category]} už máš na úrovni ${myLevel}` }, 400);
  }

  const { matchesPlayed, season } = await fetchUnlockContext(c.env.DB, teamId);
  const unlock = checkLevelUnlock(listing.level, buyer.reputation, matchesPlayed, season);
  if (unlock.locked) {
    return c.json({ error: unlock.reason ?? "Na tuhle úroveň zatím nemáš nárok", lockDetail: unlock.detail, lockHint: unlock.hint }, 400);
  }

  if (category === "team_van") {
    if (await hasImminentMatch(c.env.DB, teamId, buyer.league_id, buyer.game_date)) {
      return c.json({ error: VAN_LOCK_MESSAGE }, 400);
    }
  }

  const seller = await c.env.DB.prepare("SELECT * FROM equipment WHERE team_id = ?")
    .bind(listing.team_id).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: MODULE }, "fetch seller equipment", e); return null; });
  const sellerLevel = (seller?.[category] as number) ?? 0;
  const sellerCondition = (seller?.[`${category}_condition`] as number) ?? listing.condition_at_listing;

  if (sellerLevel !== listing.level) {
    await c.env.DB.prepare("UPDATE equipment_listings SET status = 'withdrawn', resolved_at = ? WHERE id = ? AND status = 'active'")
      .bind(now, listingId).run().catch((e) => logger.warn({ module: MODULE }, "auto-withdraw stale listing", e));
    return c.json({ error: "Prodávající vybavení mezitím změnil, nabídka byla stažena" }, 409);
  }

  if (buyer.budget < listing.price) return c.json({ error: "Nedostatek peněz" }, 400);

  // ── P1: zabrat inzerát. Jediný vítěz mezi souběžnými kupci. ───────────────
  const claimed = await c.env.DB.prepare(
    "UPDATE equipment_listings SET status = 'sold', buyer_team_id = ?, sold_price = ?, sold_condition = ?, resolved_at = ? WHERE id = ? AND status = 'active'"
  ).bind(teamId, listing.price, sellerCondition, now, listingId).run()
    .catch((e) => { logger.error({ module: MODULE }, `P1 claim failed listing=${listingId}`, e); return null; });

  if (!claimed || claimed.meta.changes === 0) {
    return c.json({ error: "Nabídku právě koupil někdo jiný" }, 409);
  }
  // Od téhle chvíle je každý další neúspěch potřeba kompenzovat.
  const rollbackListing = async () => {
    await c.env.DB.prepare(
      "UPDATE equipment_listings SET status = 'active', buyer_team_id = NULL, sold_price = NULL, sold_condition = NULL, resolved_at = NULL WHERE id = ?"
    ).bind(listingId).run().catch((e) => logger.error({ module: MODULE }, `rollback P1 failed listing=${listingId}`, e));
  };

  // ── P2: odebrat prodávajícímu. Prohraje proti zastavárně i upgradu. ───────
  const removed = await c.env.DB.prepare(
    `UPDATE equipment SET ${category} = 0, ${category}_condition = 50 WHERE team_id = ? AND ${category} = ?`
  ).bind(listing.team_id, listing.level).run()
    .catch((e) => { logger.error({ module: MODULE }, `P2 remove failed listing=${listingId}`, e); return null; });

  if (!removed || removed.meta.changes === 0) {
    await rollbackListing();
    return c.json({ error: "Prodávající vybavení mezitím prodal jinam" }, 409);
  }
  const rollbackSeller = async () => {
    await c.env.DB.prepare(
      `UPDATE equipment SET ${category} = ?, ${category}_condition = ? WHERE team_id = ? AND ${category} = 0`
    ).bind(listing.level, sellerCondition, listing.team_id).run()
      .catch((e) => logger.error({ module: MODULE }, `rollback P2 failed listing=${listingId}`, e));
  };

  // ── P3: přidat kupujícímu. Guard proti upgradu z jiného tabu. ─────────────
  const granted = await c.env.DB.prepare(
    `UPDATE equipment SET ${category} = ?, ${category}_condition = ? WHERE team_id = ? AND ${category} < ?`
  ).bind(listing.level, sellerCondition, teamId, listing.level).run()
    .catch((e) => { logger.error({ module: MODULE }, `P3 grant failed listing=${listingId}`, e); return null; });

  if (!granted || granted.meta.changes === 0) {
    await rollbackSeller();
    await rollbackListing();
    return c.json({ error: "Mezitím sis tuhle úroveň pořídil sám" }, 409);
  }
  const rollbackBuyer = async () => {
    await c.env.DB.prepare(
      `UPDATE equipment SET ${category} = ?, ${category}_condition = ? WHERE team_id = ?`
    ).bind(myLevel, myCondition, teamId).run()
      .catch((e) => logger.error({ module: MODULE }, `rollback P3 failed listing=${listingId}`, e));
  };

  // ── P4: strhnout peníze. recordTransaction tu nejde — dělá nepodmíněné +=, ─
  // takže dva souběžné nákupy by rozpočet srazily do mínusu.
  const debited = await c.env.DB.prepare(
    "UPDATE teams SET budget = budget - ? WHERE id = ? AND budget >= ? RETURNING budget"
  ).bind(listing.price, teamId, listing.price).first<{ budget: number }>()
    .catch((e) => { logger.error({ module: MODULE }, `P4 debit failed listing=${listingId}`, e); return null; });

  if (!debited) {
    await rollbackBuyer();
    await rollbackSeller();
    await rollbackListing();
    return c.json({ error: "Nedostatek peněz" }, 400);
  }

  // ── P5: nepodmíněné dopisy. Nemůžou half-failnout, jdou v jednom batchi. ──
  const sellerRow = await c.env.DB.prepare("SELECT name, budget, game_date FROM teams WHERE id = ?")
    .bind(listing.team_id).first<{ name: string; budget: number; game_date: string | null }>()
    .catch((e) => { logger.warn({ module: MODULE }, "fetch seller team for bookkeeping", e); return null; });
  const buyerRow = await c.env.DB.prepare("SELECT name FROM teams WHERE id = ?")
    .bind(teamId).first<{ name: string }>()
    .catch((e) => { logger.warn({ module: MODULE }, "fetch buyer team name", e); return null; });

  const label = CATEGORY_LABELS[category];
  const desc = `${label} (úroveň ${listing.level}, stav ${sellerCondition} %)`;

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE teams SET budget = budget + ? WHERE id = ?").bind(listing.price, listing.team_id),
    c.env.DB.prepare(
      "INSERT INTO transactions (id, team_id, type, amount, balance_after, description, reference_id, game_date) VALUES (?, ?, 'equipment_purchase', ?, ?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), teamId, -listing.price, debited.budget, `Bazar — nákup: ${desc}`, listingId, buyer.game_date ?? now),
    c.env.DB.prepare(
      "INSERT INTO transactions (id, team_id, type, amount, balance_after, description, reference_id, game_date) VALUES (?, ?, 'equipment_sale', ?, ?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), listing.team_id, listing.price, (sellerRow?.budget ?? 0) + listing.price, `Bazar — prodej: ${desc}`, listingId, sellerRow?.game_date ?? now),
  ]).catch((e) => logger.error({ module: MODULE }, `P5 bookkeeping failed listing=${listingId} buyer=${teamId} seller=${listing.team_id}`, e));

  // ── P6: notifikace, fire-and-forget ──────────────────────────────────────
  const priceCz = listing.price.toLocaleString("cs");
  await Promise.all([
    sendSystemSMS(c.env.DB, listing.team_id, "Kustod",
      `💰 Prodáno! ${desc} si odvezli z ${buyerRow?.name ?? "jiného klubu"}. Na účtu máš o ${priceCz} Kč víc.`)
      .catch((e) => logger.warn({ module: MODULE }, "sms seller", e)),
    sendSystemSMS(c.env.DB, teamId, "Kustod",
      `🚚 Dovezli to z ${sellerRow?.name ?? "jiného klubu"}: ${desc}.` +
      (sellerCondition < 60 ? ` Chce to opravit — ${(listing.level * 500).toLocaleString("cs")} Kč.` : ""))
      .catch((e) => logger.warn({ module: MODULE }, "sms buyer", e)),
    createNotification(c.env.DB, listing.team_id, "event", "Vybavení prodáno",
      `${label} za ${priceCz} Kč`, "/dashboard/equipment?tab=bazar", c.env)
      .catch((e) => logger.warn({ module: MODULE }, "notify seller", e)),
  ]);

  return c.json({
    ok: true,
    category,
    categoryLabel: label,
    level: listing.level,
    condition: sellerCondition,
    price: listing.price,
    balanceAfter: debited.budget,
    repairCost: sellerCondition < 60 ? listing.level * 500 : 0,
  });
});
