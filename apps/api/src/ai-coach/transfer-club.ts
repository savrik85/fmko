/**
 * Stav AI klubu pro přestupy: kádr a jeho rozbor, peníze, rezerva na provoz podle šetrnosti
 * a počet obchodů za posledních 30 dní (limit podle obchodní aktivity).
 */

import { logger } from "../lib/logger";
import type { AiCoachProfile } from "./profile";
import { analyzeSquad, loadClubSquad, type SquadAnalysis, type SquadMember } from "./squad";
import { budgetReserve, monthlyDealLimit } from "./valuation";

const M = "ai-transfer-club";
const DAY_MS = 86_400_000;
/** Údržba hřiště a vybavení týdně, odhad (pondělní finance strhávají řádově 500–1 500 Kč). */
const FIXED_WEEKLY_COSTS = 1000;

export interface AiClubState {
  teamId: string;
  name: string;
  budget: number;
  leagueId: string | null;
  district: string | null;
  userId: string;
  profile: AiCoachProfile;
  members: SquadMember[];
  analysis: SquadAnalysis;
  weeklyCosts: number;
  reserve: number;
  /** Kolik smí klub utratit nad rezervou. */
  spendable: number;
  dealsLast30: number;
  dealLimit: number;
  overDealLimit: boolean;
}

/** Čas z databáze („YYYY-MM-DD HH:MM:SS“ i ISO) jako UTC datum. */
export function parseDbTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const PRAGUE_HOUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", hourCycle: "h23" });
const PRAGUE_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" });

/** Hodina v Praze (0–23). */
export function pragueHour(now: Date): number {
  return Number(PRAGUE_HOUR.format(now)) % 24;
}

/** Den v Praze jako YYYY-MM-DD (klíč nároků na denní úlohy). */
export function pragueDay(now: Date): string {
  return PRAGUE_DAY.format(now);
}

/** Týdenní provoz klubu: mzdy hráčů (áčko i U21), mzdy zaměstnanců, údržba. */
export async function weeklyRunningCosts(db: D1Database, clubTeamId: string): Promise<number> {
  const wages = await db.prepare(
    `SELECT COALESCE(SUM(p.weekly_wage), 0) AS total FROM players p JOIN teams t ON t.id = p.team_id
      WHERE (t.id = ? OR t.parent_team_id = ?) AND (p.status IS NULL OR p.status NOT IN ('released', 'quit'))`,
  ).bind(clubTeamId, clubTeamId).first<{ total: number }>()
    .catch((e) => { logger.warn({ module: M }, `mzdy hráčů ${clubTeamId}`, e); return null; });
  const staff = await db.prepare("SELECT COALESCE(SUM(weekly_wage), 0) AS total FROM staff_members WHERE team_id = ?")
    .bind(clubTeamId).first<{ total: number }>()
    .catch((e) => { logger.warn({ module: M }, `mzdy zaměstnanců ${clubTeamId}`, e); return null; });
  return Math.round((wages?.total ?? 0) + (staff?.total ?? 0) + FIXED_WEEKLY_COSTS);
}

/**
 * Obchody klubu za posledních 30 dní: přijaté přestupy a hostování (koupě i prodeje)
 * a podepsaní volní hráči. Podle nich se hlídá limit obchodů podle povahy.
 */
export async function countRecentDeals(db: D1Database, clubTeamId: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const offers = await db.prepare(
    `SELECT COUNT(*) AS n FROM transfer_offers
      WHERE status = 'accepted' AND julianday(resolved_at) > julianday(?)
        AND (from_team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)
          OR to_team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?))`,
  ).bind(since, clubTeamId, clubTeamId, clubTeamId, clubTeamId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, `obchody klubu ${clubTeamId}`, e); return null; });
  const signings = await db.prepare(
    `SELECT COUNT(*) AS n FROM player_contracts
      WHERE join_type = 'free_agent' AND julianday(joined_at) > julianday(?)
        AND team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)`,
  ).bind(since, clubTeamId, clubTeamId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, `podpisy volných hráčů ${clubTeamId}`, e); return null; });
  return (offers?.n ?? 0) + (signings?.n ?? 0);
}

/** Stav AI klubu (A-týmu). Pro lidský klub nebo U21 vrací null: rozhoduje jen AI trenér áčka. */
export async function loadAiClubState(db: D1Database, teamId: string, profile: AiCoachProfile, now: Date): Promise<AiClubState | null> {
  const team = await db.prepare(
    `SELECT t.id, t.name, t.budget, t.league_id, t.user_id, t.parent_team_id, v.district
       FROM teams t LEFT JOIN villages v ON v.id = t.village_id WHERE t.id = ?`,
  ).bind(teamId).first<{ id: string; name: string; budget: number; league_id: string | null; user_id: string; parent_team_id: string | null; district: string | null }>();
  if (!team || team.user_id !== "ai" || team.parent_team_id) return null;

  const members = await loadClubSquad(db, teamId);
  const analysis = analyzeSquad(members, profile);
  const weeklyCosts = await weeklyRunningCosts(db, teamId);
  const reserve = budgetReserve(profile, weeklyCosts);
  const budget = Number(team.budget) || 0;
  const dealsLast30 = await countRecentDeals(db, teamId, now);
  const dealLimit = monthlyDealLimit(profile);
  return {
    teamId, name: team.name, budget, leagueId: team.league_id, district: team.district, userId: team.user_id,
    profile, members, analysis, weeklyCosts, reserve,
    spendable: Math.max(0, budget - reserve),
    dealsLast30, dealLimit, overDealLimit: dealsLast30 >= dealLimit,
  };
}
