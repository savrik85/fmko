/**
 * Pravidelné týdenní příjmy klubu — jeden vzorec pro přehled Financí (`/budget`) i pro strop
 * splátek přestupů. Zrcadlí processWeeklyFinances: sponzorské smlouvy, místní podpora podle
 * reputace, dotace obce podle přízně a členské příspěvky placených hráčů.
 */

import { mapVillageSize, PLACENY_HRAC_SQL } from "./finance-processor";
import { logger } from "../lib/logger";

export interface WeeklyIncome {
  sponsors: number;
  baseSponsor: number;
  subsidy: number;
  contributions: number;
  total: number;
}

const MONTHLY_SUBSIDY_BASE: Record<string, number> = { vesnice: 6000, obec: 10000, mestys: 15000, mesto: 25000 };

export async function weeklyIncomeOf(db: D1Database, teamId: string): Promise<WeeklyIncome> {
  const [teamRes, sponsorRes, playersRes, favorRes] = await db.batch([
    db.prepare("SELECT t.reputation, v.size FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?").bind(teamId),
    db.prepare("SELECT COALESCE(SUM(monthly_amount), 0) AS monthly FROM sponsor_contracts WHERE team_id = ? AND status = 'active'").bind(teamId),
    db.prepare(`SELECT COUNT(*) AS cnt FROM players WHERE team_id = ? AND ${PLACENY_HRAC_SQL}`).bind(teamId),
    db.prepare("SELECT favor FROM village_team_favor WHERE team_id = ? AND official_id IS NULL").bind(teamId),
  ]);
  const team = teamRes.results[0] as { reputation: number | null; size: string } | undefined;
  if (!team) {
    logger.warn({ module: "weekly-income", teamId }, "tým pro týdenní příjmy nenalezen");
    return { sponsors: 0, baseSponsor: 0, subsidy: 0, contributions: 0, total: 0 };
  }
  const monthlySponsors = (sponsorRes.results[0] as { monthly: number } | undefined)?.monthly ?? 0;
  const playerCount = (playersRes.results[0] as { cnt: number } | undefined)?.cnt ?? 0;
  const favor = (favorRes.results[0] as { favor: number } | undefined)?.favor ?? 50;

  const sponsors = Math.round(monthlySponsors / 4.3) * 2;
  const baseSponsor = Math.round(((team.reputation ?? 50) * 100) / 4.3);
  const subsidy = Math.round(((MONTHLY_SUBSIDY_BASE[mapVillageSize(team.size)] ?? 8000) * (0.5 + favor / 100)) / 4.3);
  const contributions = Math.round((playerCount * 100) / 4.3);
  return { sponsors, baseSponsor, subsidy, contributions, total: sponsors + baseSponsor + subsidy + contributions };
}
