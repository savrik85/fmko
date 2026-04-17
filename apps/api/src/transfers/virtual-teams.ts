/**
 * Virtuální AI týmy ze sousedních okresů — generují aktivitu na přestupovém trhu.
 * Čistě virtuální — nemají ligu, nemají DB záznam, jen hardcoded data.
 * Dvě aktivity: listují hráče na prodej + dávají nabídky na hráče lidských týmů.
 */

import type { Rng } from "../generators/rng";
import { generatePlayer, type VillageInfo } from "../generators/player";
import { generateHeightWeight } from "../generators/physicals";
import { generatePlayerFace } from "../routes/teams";
import { logger } from "../lib/logger";

// ═══════════════════════════════════════════════
// HARDCODED VIRTUAL TEAMS PER DISTRICT
// ═══════════════════════════════════════════════

interface VirtualTeam {
  name: string;
  city: string;
  district: string;
  rating: number; // average player quality base
}

const VIRTUAL_TEAMS: Record<string, VirtualTeam[]> = {
  "Prachatice": [
    { name: "SK Strakonice 1908", city: "Strakonice", district: "Strakonice", rating: 48 },
    { name: "FK Junior Strakonice", city: "Strakonice", district: "Strakonice", rating: 42 },
    { name: "TJ Blatná", city: "Blatná", district: "Strakonice", rating: 40 },
    { name: "FK Český Krumlov", city: "Český Krumlov", district: "Český Krumlov", rating: 50 },
    { name: "SK Kaplice", city: "Kaplice", district: "Český Krumlov", rating: 44 },
    { name: "TJ Písek", city: "Písek", district: "Písek", rating: 46 },
    { name: "FK Protivín", city: "Protivín", district: "Písek", rating: 38 },
    { name: "TJ Sušice", city: "Sušice", district: "Klatovy", rating: 42 },
  ],
  "Praha": [
    { name: "FK Admira Praha", city: "Praha", district: "Praha", rating: 45 },
    { name: "SK Motorlet Praha", city: "Praha", district: "Praha", rating: 48 },
    { name: "FK Slavoj Vyšehrad", city: "Praha", district: "Praha", rating: 50 },
    { name: "TJ Sokol Vršovice", city: "Praha", district: "Praha", rating: 42 },
    { name: "FC Háje", city: "Praha", district: "Praha", rating: 38 },
    { name: "SK Čechie Uhříněves", city: "Praha", district: "Praha", rating: 40 },
    { name: "FK Řeporyje", city: "Praha", district: "Praha", rating: 36 },
    { name: "TJ Chodov", city: "Praha", district: "Praha", rating: 44 },
  ],
  "Pardubice": [
    { name: "FK Přelouč", city: "Přelouč", district: "Pardubice", rating: 42 },
    { name: "TJ Holice", city: "Holice", district: "Pardubice", rating: 40 },
    { name: "SK Chrudim B", city: "Chrudim", district: "Chrudim", rating: 46 },
    { name: "FK Hlinsko", city: "Hlinsko", district: "Chrudim", rating: 38 },
    { name: "TJ Svitavy", city: "Svitavy", district: "Svitavy", rating: 44 },
  ],
  "Pelhřimov": [
    { name: "FK Humpolec", city: "Humpolec", district: "Pelhřimov", rating: 44 },
    { name: "TJ Pacov", city: "Pacov", district: "Pelhřimov", rating: 38 },
    { name: "SK Chotěboř", city: "Chotěboř", district: "Havlíčkův Brod", rating: 42 },
    { name: "FK Ledeč nad Sázavou", city: "Ledeč nad Sázavou", district: "Havlíčkův Brod", rating: 40 },
    { name: "TJ Jindřichův Hradec B", city: "Jindřichův Hradec", district: "Jindřichův Hradec", rating: 46 },
  ],
};

export { VIRTUAL_TEAMS };

// ═══════════════════════════════════════════════
// FIRSTNAMES (inline fallback for virtual player gen)
// ═══════════════════════════════════════════════

const FIRSTNAMES: Record<string, Record<string, number>> = {
  "1980s": { "Jan": 0.08, "Martin": 0.07, "Tomáš": 0.06, "Pavel": 0.05, "Michal": 0.05, "David": 0.05, "Lukáš": 0.04 },
  "1990s": { "Jan": 0.09, "Tomáš": 0.07, "Jakub": 0.06, "David": 0.06, "Lukáš": 0.05, "Ondřej": 0.05, "Filip": 0.04 },
  "2000s": { "Jakub": 0.08, "Jan": 0.07, "Adam": 0.06, "Matěj": 0.06, "Ondřej": 0.05, "Filip": 0.05, "Vojtěch": 0.04 },
};

const POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;

// ═══════════════════════════════════════════════
// ASKING PRICE CALCULATION
// ═══════════════════════════════════════════════

function calcAskingPrice(rating: number, rng: Rng): number {
  if (rating >= 60) return rng.int(8000, 15000);
  if (rating >= 50) return rng.int(5000, 8000);
  if (rating >= 40) return rng.int(3000, 5000);
  return rng.int(1500, 3000);
}

function calcOfferPrice(rating: number, rng: Rng): number {
  if (rating >= 60) return rng.int(7000, 12000);
  if (rating >= 50) return rng.int(4000, 7000);
  if (rating >= 40) return rng.int(2000, 4000);
  return rng.int(1000, 2500);
}

// ═══════════════════════════════════════════════
// AI LISTING GENERATOR — puts virtual players on the market
// ═══════════════════════════════════════════════

export async function generateAiListings(
  db: D1Database,
  district: string,
  leagueId: string,
  rng: Rng,
): Promise<number> {
  const teams = VIRTUAL_TEAMS[district];
  if (!teams || teams.length === 0) return 0;

  // Check current AI listing count
  const currentCount = await db.prepare(
    "SELECT COUNT(*) as cnt FROM transfer_listings WHERE status = 'active' AND is_ai_listing = 1 AND league_id = ?"
  ).bind(leagueId).first<{ cnt: number }>().catch((e) => { logger.warn({ module: "virtual-teams" }, "count listings", e); return { cnt: 0 }; });
  if ((currentCount?.cnt ?? 0) >= 5) return 0;

  // 30% chance per tick
  if (rng.random() > 0.30) return 0;

  const team = rng.pick(teams);
  const position = rng.pick([...POSITIONS]);
  const age = rng.int(19, 35);
  const qualityBase = team.rating + rng.int(-5, 5);

  // Get district surnames
  const { getDistrictDataFromDB } = await import("../data/districts");
  const districtData = await getDistrictDataFromDB(db, team.district);
  const surnameData = { surnames: districtData.surnames, female_forms: {} as Record<string, string> };
  const firstnameData = { male: FIRSTNAMES, female: {} as Record<string, Record<string, number>> };

  const village: VillageInfo = { region_code: "CZ03", category: "mesto", population: 5000, district: team.district };
  const player = generatePlayer(rng, village, position, surnameData, firstnameData);
  // Override quality to match team rating
  const skillKeys = ["speed", "technique", "shooting", "passing", "heading", "defense", "goalkeeping"] as const;
  const adjustedSkills: Record<string, number> = {};
  for (const k of skillKeys) {
    adjustedSkills[k] = Math.max(1, Math.min(95, qualityBase + rng.int(-10, 10)));
  }
  // Position bonuses
  if (position === "GK") { adjustedSkills.goalkeeping += 20; adjustedSkills.shooting -= 15; }
  if (position === "DEF") { adjustedSkills.defense += 10; adjustedSkills.heading += 8; }
  if (position === "MID") { adjustedSkills.passing += 10; adjustedSkills.technique += 8; }
  if (position === "FWD") { adjustedSkills.shooting += 12; adjustedSkills.speed += 8; }
  for (const k of skillKeys) adjustedSkills[k] = Math.max(1, Math.min(95, adjustedSkills[k]));

  const posWeights: Record<string, Record<string, number>> = {
    GK: { speed: 0.05, technique: 0.05, shooting: 0.02, passing: 0.08, heading: 0.05, defense: 0.15, goalkeeping: 0.60 },
    DEF: { speed: 0.12, technique: 0.10, shooting: 0.05, passing: 0.12, heading: 0.18, defense: 0.35, goalkeeping: 0.08 },
    MID: { speed: 0.12, technique: 0.20, shooting: 0.12, passing: 0.25, heading: 0.08, defense: 0.15, goalkeeping: 0.08 },
    FWD: { speed: 0.18, technique: 0.18, shooting: 0.28, passing: 0.12, heading: 0.15, defense: 0.05, goalkeeping: 0.04 },
  };
  const w = posWeights[position] ?? posWeights.MID;
  const overallRating = Math.round(skillKeys.reduce((sum, k) => sum + adjustedSkills[k] * (w[k] ?? 0.14), 0));

  const askingPrice = calcAskingPrice(overallRating, rng);
  const weeklyWage = Math.round(10 + (overallRating / 100) * 400);
  const avatar = generatePlayerFace({ age, bodyType: player.bodyType });

  const playerData = JSON.stringify({
    firstName: player.firstName,
    lastName: player.lastName,
    age,
    position,
    overallRating,
    skills: adjustedSkills,
    physical: { stamina: player.stamina, strength: player.strength, ...generateHeightWeight(rng, position, player.bodyType ?? "normal"), preferredFoot: player.preferredFoot },
    personality: { discipline: player.discipline, workRate: player.workRate, leadership: player.leadership },
    weeklyWage,
    avatar,
    fromTeam: team.name,
    fromCity: team.city,
    fromDistrict: team.district,
  });

  const listingId = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await db.prepare(
    `INSERT INTO transfer_listings (id, team_id, player_id,
      asking_price, league_id, status, is_ai_listing, ai_player_data, expires_at, created_at)
    VALUES (?, 'virtual_ai', 'virtual_ai', ?, ?, 'active', 1, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`
  ).bind(
    listingId, askingPrice, leagueId,
    playerData, expiresAt.toISOString(),
  ).run();

  logger.info({ module: "virtual-teams" }, `AI listing: ${player.firstName} ${player.lastName} (${position}, ${overallRating}) from ${team.name} for ${askingPrice} Kč`);
  return 1;
}

// ═══════════════════════════════════════════════
// AI OFFER GENERATOR — makes offers on human players
// ═══════════════════════════════════════════════

const OFFER_MESSAGES_NORMAL = [
  "Trenére, volali mi z {team}. Říkali, že mě chtějí. Co na to říkáte?",
  "Šéfe, ozval se mi {team} z {city}. Nabízejí {price} Kč. Rozhodnutí je na vás.",
  "Trenére, přišla nabídka z {team}. Prej mě sledovali na posledním zápase.",
  "Šéfe, {team} se ozval. Říkali že hledají hráče na moji pozici. Co vy na to?",
];

const OFFER_MESSAGES_LOW_MORALE = [
  "Trenére, přišla nabídka z {team}. Upřímně, zvažuju to...",
  "Šéfe, {team} nabízí {price} Kč. Nebudu lhát, láká mě to.",
  "Trenére, ozval se mi {team}. Vzhledem k tomu jak to tu jde... asi bych šel.",
];

export async function generateAiOffers(
  db: D1Database,
  district: string,
  leagueId: string,
  rng: Rng,
): Promise<number> {
  const teams = VIRTUAL_TEAMS[district];
  if (!teams || teams.length === 0) return 0;

  // 10% chance per tick
  if (rng.random() > 0.10) return 0;

  // Find human teams in this league
  const humanTeams = await db.prepare(
    "SELECT id FROM teams WHERE league_id = ? AND user_id != 'ai'"
  ).bind(leagueId).all().catch((e) => { logger.warn({ module: "virtual-teams" }, "fetch human teams", e); return { results: [] }; });
  if (humanTeams.results.length === 0) return 0;

  const targetTeamId = rng.pick(humanTeams.results).id as string;

  // Check cooldown — no offer if one was made in last 5 game days
  const recentOffer = await db.prepare(
    "SELECT id FROM transfer_offers WHERE to_team_id = ? AND from_team_id = 'virtual_ai' AND created_at > datetime('now', '-5 days')"
  ).bind(targetTeamId).first().catch((e) => { logger.warn({ module: "virtual-teams" }, "check cooldown", e); return null; });
  if (recentOffer) return 0;

  // Check no active AI offer already
  const activeOffer = await db.prepare(
    "SELECT id FROM transfer_offers WHERE to_team_id = ? AND from_team_id = 'virtual_ai' AND status = 'pending'"
  ).bind(targetTeamId).first().catch((e) => { logger.warn({ module: "virtual-teams" }, "check active offer", e); return null; });
  if (activeOffer) return 0;

  // Get top 30% players by rating — target the better ones
  const players = await db.prepare(
    `SELECT id, first_name, last_name, age, position, overall_rating, personality, life_context
     FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') AND is_celebrity = 0
     ORDER BY overall_rating DESC`
  ).bind(targetTeamId).all().catch((e) => { logger.warn({ module: "virtual-teams" }, "fetch players", e); return { results: [] }; });
  if (players.results.length < 5) return 0; // too small squad, don't poach

  const top30pct = Math.max(3, Math.ceil(players.results.length * 0.3));
  const candidates = players.results.slice(0, top30pct);
  const target = rng.pick(candidates);

  const pers = (() => { try { return JSON.parse(target.personality as string); } catch { return {}; } })();
  const lc = (() => { try { return JSON.parse(target.life_context as string); } catch { return {}; } })();
  const rating = target.overall_rating as number;
  const morale = lc.morale ?? 50;
  const patriotism = pers.patriotism ?? 50;

  const virtualTeam = rng.pick(teams);
  const offerPrice = calcOfferPrice(rating, rng);

  const offerId = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, offer_amount, offer_type, status, message, expires_at, created_at)
     VALUES (?, ?, 'virtual_ai', ?, ?, 'transfer', 'pending', ?, datetime('now', '+7 days'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`
  ).bind(
    offerId, target.id, targetTeamId, offerPrice, `Nabídka od ${virtualTeam.name}`,
  ).run();

  // Store virtual team info in offer metadata for FE display
  await db.prepare(
    "UPDATE transfer_offers SET message = ? WHERE id = ?"
  ).bind(JSON.stringify({ teamName: virtualTeam.name, city: virtualTeam.city, price: offerPrice }), offerId).run()
    .catch((e) => logger.warn({ module: "virtual-teams" }, "update offer metadata", e));

  // Player message in Kabina
  const kabinaConv = await db.prepare(
    "SELECT id FROM conversations WHERE team_id = ? AND type = 'squad_group' AND title = 'Kabina' ORDER BY created_at DESC LIMIT 1"
  ).bind(targetTeamId).first<{ id: string }>().catch((e) => { logger.warn({ module: "virtual-teams" }, "find kabina", e); return null; });

  if (kabinaConv) {
    const templates = morale < 35 || patriotism < 30 ? OFFER_MESSAGES_LOW_MORALE : OFFER_MESSAGES_NORMAL;
    const msgText = rng.pick(templates)
      .replace("{team}", virtualTeam.name)
      .replace("{city}", virtualTeam.city)
      .replace("{price}", offerPrice.toLocaleString("cs"));

    await db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, sent_at) VALUES (?, ?, 'player', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
    ).bind(
      crypto.randomUUID(), kabinaConv.id, target.id,
      `${target.first_name} ${target.last_name}`, msgText,
    ).run().catch((e) => logger.warn({ module: "virtual-teams" }, "kabina msg", e));

    await db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
      .bind(`Nabídka na ${target.first_name} ${target.last_name}`, kabinaConv.id).run()
      .catch((e) => logger.warn({ module: "virtual-teams" }, "update conv", e));
  }

  logger.info({ module: "virtual-teams" }, `AI offer: ${virtualTeam.name} → ${target.first_name} ${target.last_name} (${rating}) for ${offerPrice} Kč`);
  return 1;
}
