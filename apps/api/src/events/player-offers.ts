/**
 * Organické nabídky hráčů — kamarád, hospodský, dorost, doporučení.
 * Generují se jako between-round events a přijdou jako SMS.
 */

import type { Rng } from "../generators/rng";
import { generatePlayer, type VillageInfo } from "../generators/player";
import { getDistrictDataFromDB } from "../data/districts";
import { logger } from "../lib/logger";

const SOURCES = [
  {
    source: "pub" as const,
    senderName: "Hospodský",
    senderTitle: "Místní kontakt",
    messages: [
      "V hospodě se ozval chlápek, že by chtěl chodit kopat. Prý hrával za sousední vesnici.",
      "Jeden štamgast říkal, že zná fotbalistu co hledá nový tým. Prej je šikovnej.",
      "Přišel tady jeden, prý umí kopat a nemá kde hrát. Dáte mu šanci?",
      "Slyšel jsem, že syn od Dvořáků se vrátil z vojny a hledá tým.",
    ],
  },
  {
    source: "youth" as const,
    senderName: "Trenér dorostu",
    senderTitle: "Mládež",
    messages: [
      "Mám tady jednoho šikovného kluka z dorostu, mohl by posílit áčko.",
      "V dorostu vyrostl zajímavý hráč, dal bych mu šanci v mužích.",
      "Jeden z mladých je připravený na přechod do mužského fotbalu.",
    ],
    ageRange: [16, 20] as [number, number],
  },
  {
    source: "friend" as const,
    senderName: "Kapitán",
    senderTitle: "Kapitán týmu",
    messages: [
      "Kámo, znám jednoho borce co hrál za okres vedle. Zeptám se ho jestli by nechtěl k nám?",
      "Můj spolužák z učňáku umí kopat, mohl bych ho přivést na trénink?",
      "Brácha od Nováka hrával za Lhenice, teď nemá tým. Chceš ho vidět?",
    ],
  },
  {
    source: "recommendation" as const,
    senderName: "Starosta",
    senderTitle: "Starosta obce",
    messages: [
      "Přistěhoval se tady jeden pán, prej hrával fotbal. Mohl by posílit váš tým.",
      "Na obci se hlásil nový občan, prý má zkušenosti s fotbalem.",
    ],
    ageRange: [28, 42] as [number, number],
  },
];

const FIRSTNAMES: Record<string, Record<string, number>> = {
  "1960s": { "Jiří": 0.08, "Jan": 0.07, "Petr": 0.06, "Josef": 0.06 },
  "1970s": { "Petr": 0.08, "Jan": 0.07, "Martin": 0.06, "Pavel": 0.05 },
  "1980s": { "Jan": 0.08, "Martin": 0.07, "Tomáš": 0.06, "David": 0.05 },
  "1990s": { "Jan": 0.09, "Tomáš": 0.07, "Jakub": 0.06, "Lukáš": 0.05 },
  "2000s": { "Jakub": 0.08, "Jan": 0.07, "Adam": 0.06, "Filip": 0.05 },
  "2010s": { "Jakub": 0.07, "Jan": 0.07, "Adam": 0.06, "Vojtěch": 0.05 },
};

/**
 * Generate a player offer for a team. Returns null if conditions not met.
 * Called from daily-tick between-round events.
 */
export async function generatePlayerOffer(
  db: D1Database,
  rng: Rng,
  teamId: string,
  district: string,
  villageInfo: VillageInfo,
  gameDate: string,
): Promise<{ offerId: string; source: string; senderName: string; senderTitle: string; message: string; playerName: string } | null> {
  // Check pending offers — max 2 at a time
  const pending = await db.prepare("SELECT COUNT(*) as cnt FROM player_offers WHERE team_id = ? AND status = 'pending'")
    .bind(teamId).first<{ cnt: number }>().catch(() => ({ cnt: 0 }));
  if ((pending?.cnt ?? 0) >= 2) return null;

  // Pick source type
  const sourceType = rng.pick(SOURCES);
  const ageRange = sourceType.ageRange ?? [18, 38];
  const message = rng.pick(sourceType.messages);

  // Generate the player
  const districtData = await getDistrictDataFromDB(db, district);
  const surnameData = { surnames: districtData.surnames, female_forms: {} as Record<string, string> };
  const firstnameData = { male: FIRSTNAMES, female: {} as Record<string, Record<string, number>> };

  const positions = ["GK", "DEF", "MID", "FWD"] as const;
  const pos = rng.pick([...positions]);

  const player = generatePlayer(rng, villageInfo, pos, surnameData, firstnameData);

  // Override age for source-specific ranges
  const age = rng.int(ageRange[0], ageRange[1]);

  // Calculate rating — fallback if generatePlayer returns undefined props
  const fb = () => rng.int(15, 45);
  const skills = {
    speed: player.speed ?? fb(), technique: player.technique ?? fb(),
    shooting: player.shooting ?? fb(), passing: player.passing ?? fb(),
    heading: player.heading ?? fb(), defense: player.defense ?? fb(),
    goalkeeping: player.goalkeeping ?? (pos === "GK" ? rng.int(30, 60) : 0),
    stamina: player.stamina ?? fb(), strength: player.strength ?? fb(),
  };
  const posWeights: Record<string, Record<string, number>> = {
    GK: { goalkeeping: 4, strength: 2, stamina: 1 },
    DEF: { defense: 3, heading: 2, strength: 2, speed: 1, stamina: 2, passing: 1 },
    MID: { passing: 3, technique: 2, stamina: 3, speed: 1, shooting: 1 },
    FWD: { shooting: 3, speed: 3, technique: 2, heading: 1, stamina: 1 },
  };
  const w = posWeights[pos] ?? posWeights.MID;
  let wSum = 0, wTotal = 0;
  for (const [k, wt] of Object.entries(w)) {
    wSum += ((skills as Record<string, number>)[k] ?? 30) * wt;
    wTotal += wt;
  }
  const overallRating = Math.round(wTotal > 0 ? wSum / wTotal : 30);
  const weeklyWage = Math.round(10 + (overallRating / 100) * 400);

  const expiresAt = new Date(gameDate);
  expiresAt.setDate(expiresAt.getDate() + rng.int(3, 7));

  const offerId = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO player_offers (id, team_id, source, source_name, message, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, weekly_wage, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    offerId, teamId, sourceType.source, sourceType.senderName, message,
    player.firstName, player.lastName, null, age, pos, overallRating,
    JSON.stringify(skills),
    JSON.stringify({ stamina: player.stamina, strength: player.strength, injuryProneness: player.injuryProneness ?? 50, preferredFoot: player.preferredFoot, preferredSide: player.preferredSide }),
    JSON.stringify({ discipline: player.discipline, patriotism: player.patriotism, alcohol: player.alcohol, temper: player.temper }),
    JSON.stringify({ occupation: player.occupation, condition: 100, morale: 50 }),
    JSON.stringify(player.avatarConfig ?? {}),
    weeklyWage, expiresAt.toISOString(),
  ).run();

  logger.info({ module: "player-offers", teamId }, `new offer: ${player.firstName} ${player.lastName} (${pos}, ${overallRating}) from ${sourceType.source}`);

  return {
    offerId,
    source: sourceType.source,
    senderName: sourceType.senderName,
    senderTitle: sourceType.senderTitle,
    message,
    playerName: `${player.firstName} ${player.lastName}`,
  };
}
