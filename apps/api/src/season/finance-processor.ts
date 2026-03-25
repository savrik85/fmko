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
  | "pitch_repair"
  | "pitch_upgrade"
  | "classified_ad"
  | "sponsor_termination"
  | "season_reward"
  | "event"
  | "other";

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
  const team = await db.prepare("SELECT budget FROM teams WHERE id = ?")
    .bind(teamId).first<{ budget: number }>();
  if (!team) return 0;

  const balanceAfter = team.budget + amount;
  const id = crypto.randomUUID();

  await db.batch([
    db.prepare(
      "INSERT INTO transactions (id, team_id, type, amount, balance_after, description, reference_id, game_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, teamId, type, amount, balanceAfter, description, referenceId ?? null, gameDate),
    db.prepare(
      "UPDATE teams SET budget = ? WHERE id = ?"
    ).bind(balanceAfter, teamId),
  ]);

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

  // 1. Player wages
  const wageResult = await db.prepare(
    "SELECT COUNT(*) as cnt, COALESCE(SUM(weekly_wage), 0) as total FROM players WHERE team_id = ?"
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
}

/**
 * Zápasové finance — volá se z match-runneru po každém zápase.
 */
export async function processMatchDayFinances(
  db: D1Database,
  teamId: string,
  matchId: string,
  isHome: boolean,
  result: "win" | "draw" | "loss",
  attendance: number,
  gameDate: string,
): Promise<void> {
  // Get village info for ticket price calculation
  const team = await db.prepare(
    "SELECT v.size FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(teamId).first<{ size: string }>();
  const category = mapVillageSize(team?.size ?? "village");

  // Load stadium facility effects
  const { calculateFacilityEffects } = await import("../stadium/stadium-generator");
  const stadiumRow = await db.prepare("SELECT * FROM stadiums WHERE team_id = ?")
    .bind(teamId).first<Record<string, unknown>>().catch(() => null);
  const facilities: Record<string, number> = {};
  if (stadiumRow) {
    for (const key of ["changing_rooms", "showers", "refreshments", "lighting", "stands", "parking", "fence"]) {
      facilities[key] = (stadiumRow[key] as number) ?? 0;
    }
  }
  const facilityFx = calculateFacilityEffects(facilities);

  if (isHome && attendance > 0) {
    // Home team: ticket income (fence bonus increases ticket price)
    const baseTicketPrice = category === "vesnice" ? 10 : category === "obec" ? 20 : category === "mestys" ? 30 : 50;
    const ticketPrice = Math.round(baseTicketPrice * (1 + facilityFx.ticketPriceBonus));
    const ticketIncome = attendance * ticketPrice;
    await recordTransaction(db, teamId, "match_income", ticketIncome,
      `Vstupné: ${attendance} diváků × ${ticketPrice} Kč`, gameDate, matchId);

    // Refreshment sales income (scales with attendance)
    if (facilityFx.refreshmentPerAttendee > 0) {
      const refreshmentIncome = attendance * facilityFx.refreshmentPerAttendee;
      await recordTransaction(db, teamId, "match_income", refreshmentIncome,
        `Tržby z občerstvení: ${attendance} diváků × ${facilityFx.refreshmentPerAttendee} Kč`, gameDate, matchId);
    }

    // Home team: referee costs
    const refereeCost = 800 + Math.round(Math.random() * 700);
    await recordTransaction(db, teamId, "match_expense", -refereeCost,
      `Rozhodčí`, gameDate, matchId);
  }

  if (!isHome) {
    // Away team: travel costs (simplified — random 200-600 Kč)
    const travelCost = 200 + Math.round(Math.random() * 400);
    await recordTransaction(db, teamId, "match_expense", -travelCost,
      `Cestovné (venkovní zápas)`, gameDate, matchId);
  }

  // Both teams: refreshments expense (pivo po zápase) — L3 občerstvení eliminuje
  if (!facilityFx.noRefreshmentExpense) {
    const refreshments = 200 + Math.round(Math.random() * 400);
    await recordTransaction(db, teamId, "match_expense", -refreshments,
      `Občerstvení po zápase`, gameDate, matchId);
  }

  // Match result reward
  const sponsors = await db.prepare(
    "SELECT monthly_amount, win_bonus FROM sponsor_contracts WHERE team_id = ? AND status = 'active'"
  ).bind(teamId).all().catch(() => ({ results: [] }));

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
