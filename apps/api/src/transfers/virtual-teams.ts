/**
 * Virtuální AI týmy ze sousedních okresů — generují aktivitu na přestupovém trhu.
 * Čistě virtuální — nemají ligu, nemají DB záznam, jen hardcoded data.
 * Dvě aktivity: listují hráče na prodej + dávají nabídky na hráče lidských týmů.
 */

import type { Rng } from "../generators/rng";
import { FIRSTNAMES } from "../data/czech-names";
import { generatePlayer, type VillageInfo } from "../generators/player";
import { generateHeightWeight } from "../generators/physicals";
import { generatePlayerFace } from "../routes/teams";
import { estimateMarketValue } from "../season/economy";
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

/**
 * Cena CPU nabídky: ~1,5× tržní hodnoty hráče (1,40–1,65) — má být lákavá,
 * aby odmítnutí bolelo. Tržní hodnota zohledňuje rating i věk (estimateMarketValue).
 */
function calcOfferPrice(rating: number, age: number, rng: Rng): number {
  const marketValue = estimateMarketValue(rating, age);
  const premium = rng.int(140, 165) / 100;
  return Math.round((marketValue * premium) / 100) * 100;
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
  const avatar = generatePlayerFace({ age, bodyType: player.bodyType, ethnicity: player.ethnicity });

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
    nationality: player.nationality ?? "CZ",
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

const OFFER_MESSAGES_LOYAL = [
  "Trenére, volali z {team}. Řekl jsem jim, že jsem tady doma. Ale ať víte.",
  "Šéfe, {team} se na mě ptal. Mě to nezajímá, ale nabídka vám asi přijde.",
  "Trenére, {team} nabízí {price} Kč. Já nikam nechci, jen hlásím.",
];

/**
 * CPU nabídky od virtuálních klubů — spravedlivě per tým: každý lidský tým v lize
 * se posuzuje samostatně se stejnou šancí, cílí se na top hráče JEHO kádru
 * (hvězdy slabších týmů jsou v ohrožení stejně jako hvězdy lídra).
 */
export async function generateAiOffers(
  db: D1Database,
  district: string,
  leagueId: string,
  rng: Rng,
  opts: { force?: boolean } = {},
): Promise<number> {
  const teams = await getVirtualTeamsForDistrict(db, district);
  if (teams.length === 0) return 0;

  const humanTeams = await db.prepare(
    "SELECT id FROM teams WHERE league_id = ? AND user_id != 'ai'"
  ).bind(leagueId).all().catch((e) => { logger.warn({ module: "virtual-teams" }, "fetch human teams", e); return { results: [] }; });

  let created = 0;
  for (const ht of humanTeams.results) {
    try {
      created += await maybeOfferForTeam(db, ht.id as string, teams, rng, opts);
    } catch (e) {
      logger.warn({ module: "virtual-teams" }, "offer for team failed", e);
    }
  }
  return created;
}

/**
 * Virtuální kluby pro okres: hardcoded pokud existují, jinak deterministický
 * fallback z měst/městysů okresu (stejná jména každý den — kluby mají stabilní
 * identitu). Díky tomu CPU nabídky fungují ve VŠECH okresech.
 */
const CLUB_PREFIXES = ["SK", "FK", "TJ", "Sokol"] as const;

export async function getVirtualTeamsForDistrict(db: D1Database, district: string): Promise<VirtualTeam[]> {
  const hardcoded = VIRTUAL_TEAMS[district];
  if (hardcoded && hardcoded.length > 0) return hardcoded;

  const towns = await db.prepare(
    `SELECT name, population FROM villages WHERE district = ? AND size IN ('town','small_city','city')
     ORDER BY population DESC LIMIT 8`
  ).bind(district).all<{ name: string; population: number }>()
    .catch((e) => { logger.warn({ module: "virtual-teams" }, "fetch towns for virtual teams", e); return { results: [] as { name: string; population: number }[] }; });

  return towns.results.map((t, i) => ({
    name: `${CLUB_PREFIXES[i % CLUB_PREFIXES.length]} ${t.name}`,
    city: t.name,
    district,
    rating: Math.max(45, 58 - i * 2), // 58, 56, 54… — "lepší kluby než my"
  }));
}

/** Šance na CPU nabídku per tým a den (~1 nabídka za 2 týdny, cooldowny to dál ředí). */
const OFFER_CHANCE_PER_TEAM = 0.08;

async function maybeOfferForTeam(
  db: D1Database,
  targetTeamId: string,
  teams: VirtualTeam[],
  rng: Rng,
  opts: { force?: boolean } = {},
): Promise<number> {
  // force (admin generování): přeskočí denní šanci, cooldown i kontrolu aktivní nabídky —
  // per-hráč cooldown 14 dní zůstává (nová nabídka půjde na jiného hráče).
  if (!opts.force) {
    if (rng.random() > OFFER_CHANCE_PER_TEAM) return 0;

    // Cooldown — žádná nabídka, pokud v posledních 5 dnech nějaká přišla
    const recentOffer = await db.prepare(
      "SELECT id FROM transfer_offers WHERE to_team_id = ? AND from_team_id = 'virtual_ai' AND created_at > datetime('now', '-5 days')"
    ).bind(targetTeamId).first().catch((e) => { logger.warn({ module: "virtual-teams" }, "check cooldown", e); return null; });
    if (recentOffer) return 0;

    // Žádná aktivní CPU nabídka na tento tým
    const activeOffer = await db.prepare(
      "SELECT id FROM transfer_offers WHERE to_team_id = ? AND from_team_id = 'virtual_ai' AND status = 'pending'"
    ).bind(targetTeamId).first().catch((e) => { logger.warn({ module: "virtual-teams" }, "check active offer", e); return null; });
    if (activeOffer) return 0;
  }

  // Top hráči TOHOTO kádru dle ratingu (~15 %, min 2) — CPU jde po hvězdách týmu.
  // Per-hráč cooldown 14 dní: koho nedávno řešila JAKÁKOLI nabídka, toho CPU nechá být.
  const players = await db.prepare(
    `SELECT id, first_name, last_name, age, position, overall_rating, personality, life_context
     FROM players p WHERE team_id = ? AND (status IS NULL OR status = 'active') AND is_celebrity = 0
     AND loan_from_team_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM transfer_offers o WHERE o.player_id = p.id AND o.created_at > datetime('now', '-14 days'))
     ORDER BY overall_rating DESC`
  ).bind(targetTeamId).all().catch((e) => { logger.warn({ module: "virtual-teams" }, "fetch players", e); return { results: [] }; });
  if (players.results.length < 5) return 0; // too small squad, don't poach

  const topCount = Math.max(2, Math.ceil(players.results.length * 0.15));
  const candidates = players.results.slice(0, topCount);

  // Preferovat hráče, který o přestup stojí: max 2 pokusy, první se zájmem ≥ 1 vyhrává
  const { computeInterestForOffer } = await import("./player-interest");
  const teamAvg = players.results.reduce((s, p) => s + (p.overall_rating as number), 0) / players.results.length;

  // "Lepší klub než my" — nabízející klub musí být lákavý i pro hvězdy silných kádrů.
  // Rating pro tuto nabídku zvedneme aspoň na průměr kádru +3..12 (ambiciózní klub, co staví tým) —
  // jinak by top hráčům vycházel faktor „Slabší klub" a tlak na hvězdy by nefungoval.
  const baseTeam = teams.filter((t) => t.rating > teamAvg).length > 0
    ? rng.pick(teams.filter((t) => t.rating > teamAvg))
    : teams.reduce((a, b) => (a.rating >= b.rating ? a : b));
  const virtualTeam: VirtualTeam = {
    ...baseTeam,
    rating: Math.max(baseTeam.rating, Math.round(teamAvg) + 3 + rng.int(0, 9)),
  };

  let target = rng.pick(candidates);
  let offerPrice = calcOfferPrice(target.overall_rating as number, (target.age as number) ?? 25, rng);
  let interest = await computeInterestForOffer(db, target.id as string, {
    fromTeamId: "virtual_ai", offerAmount: offerPrice, virtualRating: virtualTeam.rating,
  }).catch((e) => { logger.warn({ module: "virtual-teams" }, "compute interest", e); return null; });

  if (interest && interest.level === 0 && candidates.length > 1) {
    const other = rng.pick(candidates.filter((p) => p.id !== target.id));
    const otherPrice = calcOfferPrice(other.overall_rating as number, (other.age as number) ?? 25, rng);
    const otherInterest = await computeInterestForOffer(db, other.id as string, {
      fromTeamId: "virtual_ai", offerAmount: otherPrice, virtualRating: virtualTeam.rating,
    }).catch((e) => { logger.warn({ module: "virtual-teams" }, "compute interest #2", e); return null; });
    if (otherInterest && otherInterest.level >= 1) {
      target = other;
      offerPrice = otherPrice;
      interest = otherInterest;
    }
  }

  const rating = target.overall_rating as number;

  const offerId = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, offer_amount, offer_type, status, message, virtual_team_data, player_interest, expires_at, created_at)
     VALUES (?, ?, 'virtual_ai', ?, ?, 'transfer', 'pending', ?, ?, ?, datetime('now', '+7 days'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`
  ).bind(
    offerId, target.id, targetTeamId, offerPrice,
    `Máme vážný zájem o vašeho hráče. Nabízíme ${offerPrice.toLocaleString("cs")} Kč, peníze máme připravené.`,
    JSON.stringify({ name: virtualTeam.name, city: virtualTeam.city, district: virtualTeam.district, rating: virtualTeam.rating }),
    interest?.level ?? null,
  ).run();

  // Player message in Kabina — tón podle toho, jak moc hráč o přestup stojí
  const kabinaConv = await db.prepare(
    "SELECT id FROM conversations WHERE team_id = ? AND type = 'squad_group' AND title = 'Kabina' ORDER BY created_at DESC LIMIT 1"
  ).bind(targetTeamId).first<{ id: string }>().catch((e) => { logger.warn({ module: "virtual-teams" }, "find kabina", e); return null; });

  if (kabinaConv) {
    const level = interest?.level ?? 1;
    const templates = level >= 2 ? OFFER_MESSAGES_LOW_MORALE : level === 0 ? OFFER_MESSAGES_LOYAL : OFFER_MESSAGES_NORMAL;
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

  logger.info({ module: "virtual-teams" }, `AI offer: ${virtualTeam.name} → ${target.first_name} ${target.last_name} (${rating}) for ${offerPrice} Kč, interest=${interest?.level ?? "?"}`);
  return 1;
}
