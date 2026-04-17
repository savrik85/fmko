import { logger } from "../lib/logger";
/**
 * Centrální finanční procesor — jediný způsob jak měnit rozpočet týmu.
 * Každá změna se zaznamená do transaction ledgeru.
 */

export type TransactionType =
  | "wage"
  | "sponsor_income"
  | "match_income"
  | "match_expense"
  | "match_reward"
  | "training_cost"
  | "pitch_maintenance"
  | "equipment_expense"
  | "equipment_upgrade"
  | "stadium_upgrade"
  | "stadium_visual"
  | "pitch_repair"
  | "pitch_upgrade"
  | "classified_ad"
  | "sponsor_termination"
  | "season_reward"
  | "event"
  | "transfer_fee"
  | "transfer_income"
  | "signing_fee"
  | "loan_fee"
  | "loan_income"
  | "transfer_admin_fee"
  | "concession_wholesale"
  | "concession_income_external"
  | "concession_income_self"
  | "promotional_campaign"
  | "other";

/** Základní cena vstupenek podle kategorie obce — reference pro satisfaction delta calc. */
export function getBaseTicketPrice(category: string): number {
  return category === "vesnice" ? 20 : category === "obec" ? 30 : category === "mestys" ? 40 : 50;
}

/**
 * Týdenní příjem z externího provozovatele občerstvení.
 * I bez vlastního bufetu (refreshments=0) externí firma přijde s vlastním stánkem a platí za pronájem plochy.
 * S levelem refreshments roste pronájem (lepší lokace, víc zákazníků).
 */
export function computeExternalWeeklyConcession(refreshmentsLevel: number, reputation: number): number {
  // External = pasivní týdenní income z pronájmu. Nižší než self, ale realistický fallback.
  // L0=500, L1=900, L2=1400, L3=2000 Kč/týden (rep 50)
  const table = [500, 900, 1400, 2000];
  const base = table[Math.max(0, Math.min(3, refreshmentsLevel))] ?? 500;
  return Math.round(base * (Math.max(10, reputation) / 50));
}

/** Maps DB village size to economy.ts Czech category */
export function mapVillageSize(dbSize: string): string {
  switch (dbSize) {
    case "hamlet": return "vesnice";
    case "village": return "obec";
    case "town": return "mestys";
    case "small_city":
    case "city": return "mesto";
    default: return "obec";
  }
}

/**
 * Zaznamená finanční transakci a aktualizuje rozpočet.
 * Toto je JEDINÝ způsob jak měnit teams.budget.
 */
export async function recordTransaction(
  db: D1Database,
  teamId: string,
  type: TransactionType,
  amount: number,
  description: string,
  gameDate: string,
  referenceId?: string,
): Promise<number> {
  // Atomická operace: budget += amount bez race condition.
  // Přečteme aktuální budget až PO update, abychom měli správný balance_after.
  const updated = await db.prepare(
    "UPDATE teams SET budget = budget + ? WHERE id = ? RETURNING budget"
  ).bind(amount, teamId).first<{ budget: number }>();
  if (!updated) return 0;

  const balanceAfter = updated.budget;
  const id = crypto.randomUUID();

  await db.prepare(
    "INSERT INTO transactions (id, team_id, type, amount, balance_after, description, reference_id, game_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, teamId, type, amount, balanceAfter, description, referenceId ?? null, gameDate).run()
    .catch((e) => logger.warn({ module: "finance" }, "insert transaction record", e));

  return balanceAfter;
}

/**
 * Týdenní finanční zpracování — volá se v pondělí z daily-tick.
 * Strhne mzdy, přičte sponzory, strhne údržbu.
 */
export async function processWeeklyFinances(
  db: D1Database,
  teamId: string,
  gameDate: string,
  villageSize: string,
): Promise<void> {
  const category = mapVillageSize(villageSize);

  // Get team reputation
  const teamInfo = await db.prepare("SELECT reputation FROM teams WHERE id = ?")
    .bind(teamId).first<{ reputation: number }>();
  const reputation = teamInfo?.reputation ?? 50;

  // ── VÝDAJE ──

  // 1. Player wages — jen aktivní hráči, released se neplatí
  const wageResult = await db.prepare(
    "SELECT COUNT(*) as cnt, COALESCE(SUM(weekly_wage), 0) as total FROM players WHERE team_id = ? AND (status IS NULL OR status != 'released')"
  ).bind(teamId).first<{ cnt: number; total: number }>();

  if (wageResult && wageResult.total > 0) {
    await recordTransaction(db, teamId, "wage", -wageResult.total,
      `Týdenní mzdy: ${wageResult.cnt} hráčů`, gameDate);
  }

  // 2. Pitch maintenance (weekly = monthly / 4.3)
  const maintenanceCosts: Record<string, number> = {
    vesnice: 500, obec: 1000, mestys: 2000, mesto: 3000,
  };
  const monthlyMaintenance = maintenanceCosts[category] ?? 1000;
  const weeklyMaintenance = Math.round(monthlyMaintenance / 4.3);
  await recordTransaction(db, teamId, "pitch_maintenance", -weeklyMaintenance,
    `Údržba hřiště`, gameDate);

  // 3. Equipment amortization (500/month = ~116/week)
  const weeklyEquipment = Math.round(500 / 4.3);
  await recordTransaction(db, teamId, "equipment_expense", -weeklyEquipment,
    `Amortizace vybavení`, gameDate);

  // ── PŘÍJMY ──

  // 4. Sponsor contract income (monthly / 4.3 = weekly)
  const sponsorResult = await db.prepare(
    "SELECT COALESCE(SUM(monthly_amount), 0) as total FROM sponsor_contracts WHERE team_id = ? AND status = 'active'"
  ).bind(teamId).first<{ total: number }>();

  if (sponsorResult && sponsorResult.total > 0) {
    const weeklyIncome = Math.round(sponsorResult.total / 4.3) * 2;
    await recordTransaction(db, teamId, "sponsor_income", weeklyIncome,
      `Sponzorské příjmy`, gameDate);
  }

  // 5. Base sponsorship income (dle reputace — místní podpora)
  const baseSponsorMonthly = reputation * 100;
  const weeklyBaseSponsor = Math.round(baseSponsorMonthly / 4.3);
  if (weeklyBaseSponsor > 0) {
    await recordTransaction(db, teamId, "sponsor_income", weeklyBaseSponsor,
      `Podpora místních podnikatelů`, gameDate);
  }

  // 6. Municipal subsidy (dotace od obce)
  const monthlySubsidy: Record<string, number> = {
    vesnice: 6000, obec: 10000, mestys: 15000, mesto: 25000,
  };
  const weeklySubsidy = Math.round((monthlySubsidy[category] ?? 8000) / 4.3);
  await recordTransaction(db, teamId, "other", weeklySubsidy,
    `Dotace od obce`, gameDate);

  // 7. Player contributions (členské příspěvky — 100 Kč/hráč/měsíc)
  const playerCount = wageResult?.cnt ?? 0;
  if (playerCount > 0) {
    const weeklyContributions = Math.round((playerCount * 100) / 4.3);
    await recordTransaction(db, teamId, "other", weeklyContributions,
      `Členské příspěvky: ${playerCount} hráčů`, gameDate);
  }

  // 8. Concession external income (týdenní pasivní příjem při 'external' módu)
  // Funguje i bez vlastního bufetu — externí firma přijede s vlastním vybavením za pronájem plochy.
  const stadiumRow = await db.prepare(
    "SELECT refreshments, concession_mode FROM stadiums WHERE team_id = ?",
  ).bind(teamId).first<{ refreshments: number; concession_mode: string }>().catch((e) => {
    logger.warn({ module: "finance" }, "load stadium for concession", e);
    return null;
  });
  if (stadiumRow && stadiumRow.concession_mode === "external") {
    const refLevel = stadiumRow.refreshments ?? 0;
    const weeklyConcession = computeExternalWeeklyConcession(refLevel, reputation);
    if (weeklyConcession > 0) {
      await recordTransaction(db, teamId, "concession_income_external", weeklyConcession,
        refLevel > 0 ? "Pronájem bufetu (externí provozovatel)" : "Pronájem plochy (externí s vlastním vybavením)",
        gameDate);
    }
  }

  // 9. Manager → fans loyalty boost (weekly drift)
  const mgrRow = await db.prepare(
    "SELECT reputation, motivation FROM managers WHERE team_id = ?",
  ).bind(teamId).first<{ reputation: number; motivation: number }>().catch((e) => {
    logger.warn({ module: "finance" }, "load manager for loyalty drift", e);
    return null;
  });
  if (mgrRow) {
    const loyaltyDelta = Math.round(
      (mgrRow.reputation - 50) * 0.02 + (mgrRow.motivation - 50) * 0.015,
    );
    if (loyaltyDelta !== 0) {
      await db.prepare(
        "UPDATE fans SET loyalty = MAX(0, MIN(100, loyalty + ?)), updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE team_id = ?",
      ).bind(loyaltyDelta, teamId).run().catch((e) => logger.warn({ module: "finance" }, "mgr loyalty drift", e));
    }
  }
}

/**
 * Zápasové finance — volá se z match-runneru po každém zápase.
 *
 * @param opponentReputation Reputace soupeře (pro satisfaction expectations calc). Nepovinné — default 50.
 */
export async function processMatchDayFinances(
  db: D1Database,
  teamId: string,
  matchId: string,
  isHome: boolean,
  result: "win" | "draw" | "loss",
  attendance: number,
  gameDate: string,
  opponentReputation: number = 50,
  isFriendly: boolean = false,
): Promise<void> {
  // Get village info for ticket price calculation
  const team = await db.prepare(
    "SELECT v.size FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(teamId).first<{ size: string }>();
  const category = mapVillageSize(team?.size ?? "village");
  const baseTicketPrice = getBaseTicketPrice(category);

  // Load stadium facility effects
  const { calculateFacilityEffects } = await import("../stadium/stadium-generator");
  const stadiumRow = await db.prepare("SELECT * FROM stadiums WHERE team_id = ?")
    .bind(teamId).first<Record<string, unknown>>().catch((e) => { logger.warn({ module: "finance" }, "query stadium", e); return null; });
  const facilities: Record<string, number> = {};
  if (stadiumRow) {
    for (const key of ["changing_rooms", "showers", "refreshments", "stands", "parking", "fence"]) {
      facilities[key] = (stadiumRow[key] as number) ?? 0;
    }
  }
  const facilityFx = calculateFacilityEffects(facilities);

  // Load fans context (may not exist for older teams — ensure row exists)
  const { ensureFansRow, loadFansContext, computeMatchSatisfactionDelta, computeSelfConcessionMatch, applyFansMatchDelta } = await import("./fans-processor");
  await ensureFansRow(db, teamId);
  const fansCtx = await loadFansContext(db, teamId);

  // Satisfaction multiplier pro ticket price: 0.7 (unhappy) -> 1.3 (nadšení)
  const satisfaction = fansCtx?.fans.satisfaction ?? 50;
  const satisfactionTicketMul = 0.7 + (Math.max(0, Math.min(100, satisfaction)) / 100) * 0.6;

  // Effective base price (user override wins if > 0)
  const userBase = fansCtx?.fans.base_ticket_price ?? 0;
  const effectiveBase = userBase > 0 ? userBase : baseTicketPrice;
  const ticketPrice = Math.round(effectiveBase * (1 + facilityFx.ticketPriceBonus) * satisfactionTicketMul);

  let soldProducts: Awaited<ReturnType<typeof computeSelfConcessionMatch>>["products"] = [];

  if (isHome && attendance > 0) {
    // Fence guard: bez plnohodnotného plotu platí jen část diváků
    const payingAttendance = Math.round(attendance * facilityFx.fencePayingRatio);
    const ticketIncome = payingAttendance * ticketPrice;
    const fenceLevel = facilities.fence ?? 0;
    const fenceNote = facilityFx.fencePayingRatio < 1
      ? ` (${fenceLevel === 0 ? "bez plotu" : "provizorní plot"}: ${payingAttendance} z ${attendance})`
      : "";
    await recordTransaction(db, teamId, "match_income", ticketIncome,
      `Vstupné: ${payingAttendance} × ${ticketPrice} Kč${fenceNote}`, gameDate, matchId);

    // Concession income — podle módu
    if (fansCtx?.concessionMode === "self") {
      const sale = computeSelfConcessionMatch(attendance, satisfaction, fansCtx.products);
      soldProducts = sale.products;

      // Persist stock decrements + zaznamenat příjem
      for (const p of sale.products) {
        if (p.sold > 0) {
          await db.prepare(
            "UPDATE concession_products SET stock_quantity = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE team_id = ? AND product_key = ?",
          ).bind(p.stockLeft, teamId, p.key).run().catch((e) => logger.warn({ module: "finance" }, "concession stock update", e));
        }
      }

      if (sale.totalRevenue > 0) {
        const breakdown = sale.products
          .filter((p) => p.sold > 0)
          .map((p) => `${p.sold}× ${p.key}`)
          .join(", ");
        await recordTransaction(db, teamId, "concession_income_self", sale.totalRevenue,
          `Tržby z vlastního občerstvení: ${breakdown}`, gameDate, matchId);
      }

      // Persist per-produkt sales pro historii prodejů
      const { getWholesalePrice } = await import("./concession-catalog");
      for (const p of sale.products) {
        if (p.qualityLevel <= 0) continue;
        const wholesale = getWholesalePrice(p.key, p.qualityLevel);
        const revenue = p.sold * p.sellPrice;
        const profit = revenue - p.sold * wholesale;
        await db.prepare(
          `INSERT INTO concession_match_sales
           (id, team_id, match_id, gamedate, product_key, quality_level, sell_price, wholesale_price, sold_count, revenue, profit, stockout, attendance)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          teamId,
          matchId,
          gameDate,
          p.key,
          p.qualityLevel,
          p.sellPrice,
          wholesale,
          p.sold,
          revenue,
          profit,
          p.soldOut ? 1 : 0,
          attendance,
        ).run().catch((e) => logger.warn({ module: "finance" }, "concession sales insert", e));
      }
    }
    // External mode: income je čistě týdenní přes computeExternalWeeklyConcession,
    // per-match accounting zde odstraněn aby nedocházelo k dvojitému započítání.

    // Home team: referee costs (ne u přáteláků)
    if (!isFriendly) {
      const refereeCost = 800 + Math.round(Math.random() * 700);
      await recordTransaction(db, teamId, "match_expense", -refereeCost,
        `Rozhodčí`, gameDate, matchId);
    }
  }

  if (!isHome && !isFriendly) {
    // Away team: travel costs (simplified — random 200-600 Kč)
    const travelCost = 200 + Math.round(Math.random() * 400);
    await recordTransaction(db, teamId, "match_expense", -travelCost,
      `Cestovné (venkovní zápas)`, gameDate, matchId);
  }

  // Both teams: refreshments expense (pivo po zápase) — L3 občerstvení eliminuje (ne u přáteláků)
  if (!isFriendly && !facilityFx.noRefreshmentExpense) {
    const refreshments = 200 + Math.round(Math.random() * 400);
    await recordTransaction(db, teamId, "match_expense", -refreshments,
      `Občerstvení po zápase`, gameDate, matchId);
  }

  // Match result reward
  const sponsors = await db.prepare(
    "SELECT monthly_amount, win_bonus FROM sponsor_contracts WHERE team_id = ? AND status = 'active'"
  ).bind(teamId).all().catch((e) => { logger.warn({ module: "finance" }, "query sponsors", e); return { results: [] }; });

  const sponsorBonus = result === "win"
    ? sponsors.results.reduce((s, sp) => s + ((sp.win_bonus as number) ?? 0), 0)
    : result === "draw"
      ? Math.round(sponsors.results.reduce((s, sp) => s + ((sp.win_bonus as number) ?? 0), 0) * 0.3)
      : 0;

  const leagueBonus = result === "win" ? 500 : result === "draw" ? 150 : 0;
  const fanBase = category === "vesnice" ? 50 : category === "obec" ? 100 : 200;
  const fanBonus = result === "win" ? fanBase : result === "draw" ? Math.round(fanBase * 0.5) : 0;

  const totalReward = sponsorBonus + leagueBonus + fanBonus;
  if (totalReward > 0) {
    const resultLabel = result === "win" ? "výhra" : result === "draw" ? "remíza" : "prohra";
    await recordTransaction(db, teamId, "match_reward", totalReward,
      `Bonusy za ${resultLabel}${sponsorBonus > 0 ? ` (sponzoři ${sponsorBonus} Kč)` : ""}`,
      gameDate, matchId);
  }

  // Satisfaction delta — aplikuje se i pro venkovní zápas (fanoušci sledují výsledek)
  if (fansCtx) {
    const mgrRow = await db.prepare(
      "SELECT reputation, motivation FROM managers WHERE team_id = ?",
    ).bind(teamId).first<{ reputation: number; motivation: number }>().catch((e) => {
      logger.warn({ module: "finance" }, "load manager for fans delta", e);
      return null;
    });

    const satCalc = computeMatchSatisfactionDelta({
      result,
      fans: fansCtx.fans,
      opponentReputation,
      effectiveTicketPrice: isHome ? ticketPrice : baseTicketPrice,
      villageBaseTicketPrice: baseTicketPrice,
      concessionMode: fansCtx.concessionMode,
      soldProducts: isHome ? soldProducts : [],
      manager: mgrRow ?? undefined,
    });

    // Načíst jméno soupeře pro archivaci v historii
    const opponentRow = await db.prepare(
      `SELECT CASE WHEN home_team_id = ? THEN at.name ELSE ht.name END as opponent_name
       FROM matches m
       LEFT JOIN teams ht ON ht.id = m.home_team_id
       LEFT JOIN teams at ON at.id = m.away_team_id
       WHERE m.id = ?`,
    ).bind(teamId, matchId).first<{ opponent_name: string }>().catch((e) => {
      logger.warn({ module: "finance" }, "load opponent for fans history", e);
      return null;
    });

    await applyFansMatchDelta(db, teamId, satCalc.delta, satCalc.reasons, {
      matchId,
      gamedate: gameDate,
      opponentName: opponentRow?.opponent_name ?? undefined,
      result,
      attendance,
    });
  }
}

/**
 * Odečte tréninkové náklady — volá se v tréninkové dny.
 */
export async function processTrainingCost(
  db: D1Database,
  teamId: string,
  gameDate: string,
  villageSize: string,
): Promise<void> {
  const category = mapVillageSize(villageSize);
  const costPerSession: Record<string, number> = {
    vesnice: 200, obec: 400, mestys: 600, mesto: 1000,
  };
  const cost = costPerSession[category] ?? 400;
  await recordTransaction(db, teamId, "training_cost", -cost,
    `Trénink`, gameDate);
}
