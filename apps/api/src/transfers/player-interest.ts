/**
 * Zájem hráče o přestup — deterministický výpočet (žádné rng, stejné vstupy = stejný výsledek).
 *
 * Používá se na třech místech:
 *  - snapshot při vzniku nabídky (POST /offers, generateAiOffers) → transfer_offers.player_interest
 *  - čerstvý přepočet v detailu nabídky (GET detail) včetně faktorů pro tooltip
 *  - čerstvý přepočet při reject/expire → rozhoduje o dopadu na morálku (offer-rejection-impact)
 */

import { estimateMarketValue } from "../season/economy";
import { logger } from "../lib/logger";

/** 0 = nechce odejít, 1 = váhá, 2 = chce přestoupit, 3 = velmi chce přestoupit */
export type InterestLevel = 0 | 1 | 2 | 3;

export interface InterestFactor {
  label: string;
  delta: number;
}

export interface InterestResult {
  level: InterestLevel;
  score: number; // 0-100
  factors: InterestFactor[];
}

export const INTEREST_LABELS: Record<InterestLevel, string> = {
  0: "Nechce odejít",
  1: "Váhá",
  2: "Chce přestoupit",
  3: "Velmi chce přestoupit",
};

export interface InterestInputs {
  personality: Record<string, number>;
  morale: number;
  coachRelationship: number;
  recentMinutes: number; // odehrané minuty za posledních 30 dní
  age: number;
  overallRating: number; // pro odhad tržní hodnoty (faktor peněz)
  currentTeamStrength: number; // AVG(overall_rating) kádru prodávajícího
  offerTeamStrength: number;   // AVG kádru kupujícího / rating virtuálního klubu
  offerAmount: number;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function computePlayerInterest(input: InterestInputs): InterestResult {
  const p = input.personality ?? {};
  const factors: InterestFactor[] = [];
  let score = 48; // většina hráčů zváží dobrou nabídku; brzdí je jen věrnost + spokojenost

  const add = (label: string, delta: number) => {
    if (Math.round(delta) === 0) return;
    factors.push({ label, delta: Math.round(delta) });
    score += delta;
  };

  // Atraktivita nabízejícího klubu vs. současný tým
  const strengthDiff = clamp((input.offerTeamStrength - input.currentTeamStrength) * 1.3, -20, 30);
  add(strengthDiff >= 0 ? "Lepší klub" : "Slabší klub", strengthDiff);

  // Peníze — na vesnici hlavní motiv, výrazný přeplatek táhne nejvíc.
  const marketValue = estimateMarketValue(input.overallRating, input.age);
  if (input.offerAmount >= marketValue * 1.6) add("Balík peněz", 22);
  else if (input.offerAmount >= marketValue * 1.35) add("Lákavé peníze", 15);
  else if (input.offerAmount >= marketValue * 1.1) add("Slušné peníze", 8);
  else if (input.offerAmount > 0 && input.offerAmount <= marketValue * 0.7) add("Urážlivě málo", -6);

  // Spokojenost brzdí — jen opravdu spokojený a spřízněný hráč zůstane
  add("Morálka", (50 - input.morale) * 0.4);
  add("Vztah s trenérem", (50 - input.coachRelationship) * 0.3);
  add("Vztah k obci", (50 - (p.patriotism ?? 50)) * 0.4);

  // Herní vytížení
  if (input.recentMinutes < 90) add("Skoro nehraje", 15);
  else if (input.recentMinutes < 180) add("Hraje málo", 8);
  else if (input.recentMinutes > 300) add("Hraje pravidelně", -5);

  // Ambice / věk / povaha
  if ((p.workRate ?? 50) > 60 && input.age < 28) add("Ambice", 6);
  if (input.age > 33) add("Zvyk a věk", -8);
  if ((p.discipline ?? 50) < 35) add("Nestálost", 5);

  score = clamp(Math.round(score), 0, 100);
  const level: InterestLevel = score >= 75 ? 3 : score >= 55 ? 2 : score >= 35 ? 1 : 0;
  return { level, score, factors };
}

/**
 * Načte vstupy pro computePlayerInterest z DB.
 * offerTeam: id lidského kupujícího, nebo { virtualRating } pro virtuální klub.
 */
export async function loadInterestInputs(
  db: D1Database,
  playerId: string,
  offer: { fromTeamId: string; offerAmount: number; virtualRating?: number | null },
): Promise<InterestInputs | null> {
  const player = await db.prepare(
    `SELECT p.team_id, p.age, p.overall_rating, p.coach_relationship, p.personality, p.life_context,
            COALESCE(stats.recent_minutes, 0) as recent_minutes
     FROM players p
     LEFT JOIN (
       SELECT mps.player_id, SUM(mps.minutes_played) as recent_minutes
       FROM match_player_stats mps
       JOIN matches m ON mps.match_id = m.id
       WHERE m.status = 'simulated' AND m.simulated_at >= datetime('now', '-30 days')
       GROUP BY mps.player_id
     ) stats ON stats.player_id = p.id
     WHERE p.id = ?`
  ).bind(playerId).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "player-interest" }, "load player", e); return null; });
  if (!player) return null;

  let personality: Record<string, number> = {};
  let morale = 50;
  try { personality = player.personality ? JSON.parse(player.personality as string) : {}; } catch (e) { logger.warn({ module: "player-interest" }, "parse personality", e); }
  try {
    const lc = player.life_context ? JSON.parse(player.life_context as string) : {};
    morale = typeof lc.morale === "number" ? lc.morale : 50;
  } catch (e) { logger.warn({ module: "player-interest" }, "parse life_context", e); }

  const avgStrength = async (teamId: string): Promise<number> => {
    const row = await db.prepare(
      "SELECT AVG(overall_rating) as avg_rating FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')"
    ).bind(teamId).first<{ avg_rating: number | null }>()
      .catch((e) => { logger.warn({ module: "player-interest" }, "avg strength", e); return null; });
    return row?.avg_rating ?? 40;
  };

  const currentTeamStrength = await avgStrength(player.team_id as string);
  const offerTeamStrength = offer.fromTeamId === "virtual_ai"
    ? (offer.virtualRating ?? 45)
    : await avgStrength(offer.fromTeamId);

  return {
    personality,
    morale,
    coachRelationship: (player.coach_relationship as number) ?? 50,
    recentMinutes: (player.recent_minutes as number) ?? 0,
    age: (player.age as number) ?? 25,
    overallRating: (player.overall_rating as number) ?? 40,
    currentTeamStrength,
    offerTeamStrength,
    offerAmount: offer.offerAmount,
  };
}

/** Pohodlný wrapper: načti vstupy + spočítej. Vrací null, když hráč neexistuje. */
export async function computeInterestForOffer(
  db: D1Database,
  playerId: string,
  offer: { fromTeamId: string; offerAmount: number; virtualRating?: number | null },
): Promise<InterestResult | null> {
  const inputs = await loadInterestInputs(db, playerId, offer);
  return inputs ? computePlayerInterest(inputs) : null;
}
