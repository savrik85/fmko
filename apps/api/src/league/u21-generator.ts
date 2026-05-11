/**
 * U21 systém — vytváří juniorský tým ke každému A-týmu, vlastní mirror ligu,
 * vygeneruje squad mladíků (16-21 let) a rozpis kopírující A-ligu s +24h posunem.
 *
 * Volá se:
 *   - jednorázově (admin backfill) pro existující ligy
 *   - automaticky při založení nové ligy (po generateSeasonCalendar)
 */

import type { Rng } from "../generators/rng";
import { generatePlayer, type VillageInfo } from "../generators/player";
import { generateFieldSkills, generateGKSkills, generateHiddenTalent, calculateOverallRating } from "../skills/generator";
import { generateDescription } from "../generators/description-generator";
import { pickOccupation } from "../generators/occupations";
import { generatePlayerFace } from "../routes/teams";
import { getDistrictDataFromDB } from "../data/districts";
import { logger } from "../lib/logger";

const POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
type Position = typeof POSITIONS[number];

// Squad position distribution pro 14 hráčů
const U21_POSITION_COUNTS: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 2 };

// Inline firstnames (stejné jako v transfers/free-agent-pool.ts)
const FIRSTNAMES: Record<string, Record<string, number>> = {
  "1960s": { "Jiří": 0.08, "Jan": 0.07, "Petr": 0.06, "Josef": 0.06, "Jaroslav": 0.05, "Milan": 0.05, "Zdeněk": 0.04 },
  "1970s": { "Petr": 0.08, "Jan": 0.07, "Martin": 0.06, "Jiří": 0.06, "Pavel": 0.05, "Tomáš": 0.04, "Roman": 0.03 },
  "1980s": { "Jan": 0.08, "Martin": 0.07, "Tomáš": 0.06, "Pavel": 0.05, "Michal": 0.05, "David": 0.05, "Lukáš": 0.04 },
  "1990s": { "Jan": 0.09, "Tomáš": 0.07, "Jakub": 0.06, "David": 0.06, "Lukáš": 0.05, "Ondřej": 0.05, "Filip": 0.04 },
  "2000s": { "Jakub": 0.08, "Jan": 0.07, "Adam": 0.06, "Matěj": 0.06, "Ondřej": 0.05, "Filip": 0.05, "Vojtěch": 0.04 },
  "2010s": { "Jakub": 0.07, "Jan": 0.07, "Adam": 0.06, "Vojtěch": 0.05, "Filip": 0.05, "Tomáš": 0.05, "Šimon": 0.04 },
};

interface SeniorTeam {
  id: string;
  user_id: string;
  village_id: string;
  name: string;
  primary_color: string;
  secondary_color: string;
}

interface BackfillResult {
  u21LeagueId: string;
  teamsCreated: number;
  playersCreated: number;
  calendarEntries: number;
  matches: number;
  skipped: boolean;
}

/**
 * Hlavní entry point — pro danou A-ligu vytvoří U21 ligu + týmy + hráče + mirror rozpis.
 * Idempotentní: pokud U21 liga existuje, vrací skipped=true.
 */
export async function backfillU21ForLeague(
  db: D1Database,
  seniorLeagueId: string,
  rng: Rng,
): Promise<BackfillResult> {
  // Skip pokud už existuje
  const existing = await db.prepare(
    "SELECT id FROM leagues WHERE parent_league_id = ? AND league_type = 'u21'"
  ).bind(seniorLeagueId).first<{ id: string }>();
  if (existing) {
    return { u21LeagueId: existing.id, teamsCreated: 0, playersCreated: 0, calendarEntries: 0, matches: 0, skipped: true };
  }

  const seniorLeague = await db.prepare(
    "SELECT id, season_id, district, name, level, status FROM leagues WHERE id = ?"
  ).bind(seniorLeagueId).first<{ id: string; season_id: string; district: string; name: string; level: string; status: string }>();
  if (!seniorLeague) {
    throw new Error(`senior liga ${seniorLeagueId} nenalezena`);
  }

  // 1) U21 liga — district + " U21" obchází UNIQUE(season_id, district, level)
  const u21LeagueId = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO leagues (id, season_id, district, name, level, status, league_type, parent_league_id) VALUES (?, ?, ?, ?, ?, ?, 'u21', ?)"
  ).bind(
    u21LeagueId,
    seniorLeague.season_id,
    `${seniorLeague.district} U21`,
    `${seniorLeague.name} — U21`,
    seniorLeague.level,
    seniorLeague.status,
    seniorLeagueId,
  ).run();

  // 2) U21 týmy pro každý A-tým v lize
  const seniorTeams = await db.prepare(
    "SELECT id, user_id, village_id, name, primary_color, secondary_color FROM teams WHERE league_id = ? AND team_type = 'senior'"
  ).bind(seniorLeagueId).all<SeniorTeam>();

  const districtData = await getDistrictDataFromDB(db, seniorLeague.district);
  const surnameData = { surnames: districtData.surnames, female_forms: {} as Record<string, string> };
  const firstnameData = { male: FIRSTNAMES, female: {} as Record<string, Record<string, number>> };

  const activeSeason = await db.prepare(
    "SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"
  ).first<{ id: string }>();
  const seasonId = activeSeason?.id ?? seniorLeague.season_id;

  let teamsCreated = 0;
  let playersCreated = 0;
  for (const st of seniorTeams.results) {
    const villageRow = await db.prepare(
      "SELECT id, district, population, size FROM villages WHERE id = ?"
    ).bind(st.village_id).first<{ id: string; district: string; population: number; size: string }>();

    const sizeMap: Record<string, VillageInfo["category"]> = {
      hamlet: "vesnice", village: "obec", town: "mestys", small_city: "mesto", city: "mesto",
    };
    const village: VillageInfo = {
      region_code: villageRow?.district ?? seniorLeague.district,
      category: sizeMap[villageRow?.size ?? "village"] ?? "obec",
      population: villageRow?.population ?? 500,
      district: villageRow?.district ?? seniorLeague.district,
    };

    const created = await createU21TeamAndSquad(
      db,
      st,
      u21LeagueId,
      village,
      rng,
      surnameData,
      firstnameData,
      seasonId,
    );
    teamsCreated++;
    playersCreated += created.playerCount;
  }

  // 3) Mirror rozpis — od aktuálního game_week dál (jen "druhá polovina")
  const fromGameWeek = await resolveFromGameWeek(db, seniorLeagueId);
  const mirror = await mirrorScheduleToU21(db, seniorLeagueId, u21LeagueId, fromGameWeek);

  // 4) game_date pro U21 týmy = stejné jako A-týmy v lize (aby je match-tick zařadil)
  const seniorGameDate = await db.prepare(
    "SELECT game_date FROM teams WHERE league_id = ? AND game_date IS NOT NULL LIMIT 1"
  ).bind(seniorLeagueId).first<{ game_date: string }>();
  if (seniorGameDate?.game_date) {
    await db.prepare("UPDATE teams SET game_date = ? WHERE league_id = ?")
      .bind(seniorGameDate.game_date, u21LeagueId).run();
  }

  return {
    u21LeagueId,
    teamsCreated,
    playersCreated,
    calendarEntries: mirror.calendarEntries,
    matches: mirror.matches,
    skipped: false,
  };
}

/**
 * Vytvoří 1 U21 tým + squad (14 mladíků). Vrací počet hráčů.
 */
export async function createU21TeamAndSquad(
  db: D1Database,
  seniorTeam: SeniorTeam,
  u21LeagueId: string,
  village: VillageInfo,
  rng: Rng,
  surnameData: { surnames: Record<string, number>; female_forms: Record<string, string> },
  firstnameData: { male: Record<string, Record<string, number>>; female: Record<string, Record<string, number>> },
  seasonId: string,
): Promise<{ teamId: string; playerCount: number }> {
  const u21TeamId = crypto.randomUUID();

  await db.prepare(
    "INSERT INTO teams (id, user_id, village_id, name, primary_color, secondary_color, budget, league_id, team_type, parent_team_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'u21', ?)"
  ).bind(
    u21TeamId,
    seniorTeam.user_id,
    seniorTeam.village_id,
    `${seniorTeam.name} U21`,
    seniorTeam.primary_color,
    seniorTeam.secondary_color,
    0, // U21 nemá vlastní rozpočet
    u21LeagueId,
    seniorTeam.id,
  ).run();

  // Zkopíruj vizuální atributy z A-týmu (badge, dres) ať se U21 zobrazuje shodně s parentem
  await db.prepare(
    `UPDATE teams SET
       badge_pattern = (SELECT badge_pattern FROM teams t2 WHERE t2.id = ?),
       badge_primary_color = (SELECT badge_primary_color FROM teams t2 WHERE t2.id = ?),
       badge_secondary_color = (SELECT badge_secondary_color FROM teams t2 WHERE t2.id = ?),
       badge_initials = (SELECT badge_initials FROM teams t2 WHERE t2.id = ?),
       badge_symbol = (SELECT badge_symbol FROM teams t2 WHERE t2.id = ?),
       jersey_pattern = (SELECT jersey_pattern FROM teams t2 WHERE t2.id = ?),
       away_primary_color = (SELECT away_primary_color FROM teams t2 WHERE t2.id = ?),
       away_secondary_color = (SELECT away_secondary_color FROM teams t2 WHERE t2.id = ?)
     WHERE id = ?`
  ).bind(
    seniorTeam.id, seniorTeam.id, seniorTeam.id, seniorTeam.id,
    seniorTeam.id, seniorTeam.id, seniorTeam.id, seniorTeam.id,
    u21TeamId,
  ).run().catch((e) => logger.warn({ module: "u21-generator" }, `copy visuals to U21 ${u21TeamId}`, e));

  // Build position list
  const positions: Position[] = [];
  for (const [pos, count] of Object.entries(U21_POSITION_COUNTS) as Array<[Position, number]>) {
    for (let i = 0; i < count; i++) positions.push(pos);
  }
  rng.shuffle(positions);

  const villageSize = village.category === "vesnice" ? "hamlet"
    : village.category === "obec" ? "village"
    : village.category === "mestys" ? "town" : "small_city";

  const playerStmts: D1PreparedStatement[] = [];
  const contractStmts: D1PreparedStatement[] = [];

  for (const position of positions) {
    const base = generatePlayer(rng, village, position, surnameData, firstnameData);
    // Forcovat věk 16-21 (override náhodný věk z generatePlayer)
    const age = rng.int(16, 21);

    const isGK = position === "GK";
    const fieldSkills = !isGK ? generateFieldSkills(rng, position as "DEF" | "MID" | "FWD", villageSize, age, true) : null;
    const gkSkills = isGK ? generateGKSkills(rng, villageSize, age, true) : null;
    const hiddenTalent = generateHiddenTalent(rng, villageSize);

    const skills = isGK
      ? { speed: 0, technique: 0, shooting: 0, passing: gkSkills!.distribution.current, heading: 0, defense: 0, goalkeeping: gkSkills!.reflexes.current, creativity: 0, setPieces: 0 }
      : { speed: fieldSkills!.speed.current, technique: fieldSkills!.technique.current, shooting: fieldSkills!.shooting.current, passing: fieldSkills!.passing.current, heading: fieldSkills!.heading.current, defense: fieldSkills!.defense.current, goalkeeping: 0, creativity: fieldSkills!.creativity.current, setPieces: fieldSkills!.setPieces.current };

    const height = (position === "GK" ? 185 : position === "DEF" ? 180 : position === "FWD" ? 178 : 176) + rng.int(-8, 8);
    const baseWeight = base.bodyType === "obese" ? 92 : base.bodyType === "stocky" ? 82 : base.bodyType === "thin" ? 65 : base.bodyType === "athletic" ? 72 : 74;
    const weight = baseWeight + rng.int(-4, 6);

    const physical = {
      stamina: isGK ? gkSkills!.strength.current : fieldSkills!.stamina.current,
      strength: isGK ? gkSkills!.strength.current : fieldSkills!.strength.current,
      injuryProneness: rng.int(10, 60), height, weight,
      preferredFoot: base.preferredFoot, preferredSide: base.preferredSide,
    };
    const personality = {
      discipline: rng.int(10, 90), patriotism: rng.int(20, 90), alcohol: rng.int(5, 60), temper: rng.int(10, 80),
      leadership: Math.max(5, base.leadership - 15), // mladí mají nižší vůdcovství
      workRate: base.workRate, aggression: base.aggression,
      consistency: Math.max(5, base.consistency - 10), clutch: base.clutch,
    };
    const occ = pickOccupation(rng, villageSize, age, village.district);
    const lifeContext = { occupation: occ.name, condition: 100, morale: 50 + rng.int(-10, 10) };
    const rating = calculateOverallRating(position, isGK ? gkSkills! : fieldSkills!, hiddenTalent);
    const description = generateDescription(rng, {
      firstName: base.firstName, lastName: base.lastName, nickname: "",
      age, position, occupation: occ.name,
      bodyType: base.bodyType, alcohol: personality.alcohol, discipline: personality.discipline,
      speed: skills.speed, shooting: skills.shooting, technique: skills.technique,
      patriotism: personality.patriotism,
    });

    const playerId = crypto.randomUUID();
    playerStmts.push(
      db.prepare(
        "INSERT INTO players (id, team_id, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, description, skills_max, hidden_talent, experience, weekly_wage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        playerId, u21TeamId, base.firstName, base.lastName, "", age, position, rating,
        JSON.stringify(skills), JSON.stringify(physical), JSON.stringify(personality),
        JSON.stringify(lifeContext),
        JSON.stringify(generatePlayerFace({ age, bodyType: base.bodyType })),
        description,
        JSON.stringify(isGK ? gkSkills : fieldSkills), hiddenTalent,
        isGK ? gkSkills!.experience.current : fieldSkills!.experience.current,
        Math.round(5 + rating * 2), // U21 nižší mzdy
      )
    );

    contractStmts.push(
      db.prepare(
        "INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (?, ?, ?, ?, 'generated', 0, 1)"
      ).bind(crypto.randomUUID(), playerId, u21TeamId, seasonId)
    );
  }

  try {
    await db.batch(playerStmts);
  } catch (e) {
    logger.error({ module: "u21-generator" }, `batch insert players for U21 team ${u21TeamId}`, e);
  }
  try {
    await db.batch(contractStmts);
  } catch (e) {
    logger.error({ module: "u21-generator" }, `batch insert contracts for U21 team ${u21TeamId}`, e);
  }

  return { teamId: u21TeamId, playerCount: positions.length };
}

/**
 * Mirror season_calendar + matches z A-ligy do U21 s posunem +24h.
 * Páry týmů se přemapují přes teams.parent_team_id.
 */
export async function mirrorScheduleToU21(
  db: D1Database,
  seniorLeagueId: string,
  u21LeagueId: string,
  fromGameWeek: number,
): Promise<{ calendarEntries: number; matches: number }> {
  // Lookup: senior team id → U21 team id
  const teamRows = await db.prepare(
    "SELECT id, parent_team_id FROM teams WHERE league_id = ? AND team_type = 'u21'"
  ).bind(u21LeagueId).all<{ id: string; parent_team_id: string }>();
  const u21ByParent = new Map<string, string>();
  for (const t of teamRows.results) u21ByParent.set(t.parent_team_id, t.id);

  // Vyber všechny A-ligy záznamy od fromGameWeek dál
  const calendarRows = await db.prepare(
    "SELECT id, season_number, game_week, match_day, scheduled_at, status FROM season_calendar WHERE league_id = ? AND game_week >= ? ORDER BY game_week"
  ).bind(seniorLeagueId, fromGameWeek).all<{ id: string; season_number: number; game_week: number; match_day: string; scheduled_at: string; status: string }>();

  let calCount = 0;
  let matchCount = 0;
  const calendarStmts: D1PreparedStatement[] = [];
  const matchStmts: D1PreparedStatement[] = [];

  for (const cal of calendarRows.results) {
    const u21CalId = crypto.randomUUID();
    const newScheduled = new Date(new Date(cal.scheduled_at).getTime() + 24 * 60 * 60 * 1000).toISOString();
    const newMatchDay = bumpMatchDay(cal.match_day);

    calendarStmts.push(
      db.prepare(
        "INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status, parent_calendar_id) VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?)"
      ).bind(u21CalId, u21LeagueId, cal.season_number, cal.game_week, newMatchDay, newScheduled, cal.id)
    );
    calCount++;

    // Mirror matches z toho kola
    const matchRows = await db.prepare(
      "SELECT id, round, home_team_id, away_team_id FROM matches WHERE calendar_id = ?"
    ).bind(cal.id).all<{ id: string; round: number | null; home_team_id: string; away_team_id: string }>();

    for (const m of matchRows.results) {
      const u21Home = u21ByParent.get(m.home_team_id);
      const u21Away = u21ByParent.get(m.away_team_id);
      if (!u21Home || !u21Away) {
        logger.warn({ module: "u21-generator" }, `chybí U21 protějšek pro ${m.home_team_id} vs ${m.away_team_id}`);
        continue;
      }
      matchStmts.push(
        db.prepare(
          "INSERT INTO matches (id, league_id, calendar_id, round, home_team_id, away_team_id, status, parent_match_id) VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?)"
        ).bind(crypto.randomUUID(), u21LeagueId, u21CalId, m.round, u21Home, u21Away, m.id)
      );
      matchCount++;
    }
  }

  const BATCH = 80;
  for (let i = 0; i < calendarStmts.length; i += BATCH) {
    try {
      await db.batch(calendarStmts.slice(i, i + BATCH));
    } catch (e) {
      logger.error({ module: "u21-generator" }, `batch calendar ${i}`, e);
    }
  }
  for (let i = 0; i < matchStmts.length; i += BATCH) {
    try {
      await db.batch(matchStmts.slice(i, i + BATCH));
    } catch (e) {
      logger.error({ module: "u21-generator" }, `batch matches ${i}`, e);
    }
  }

  return { calendarEntries: calCount, matches: matchCount };
}

/**
 * U21 začíná od dalšího nehraného kola A-ligy (nebo 1 pokud liga ještě nezačala).
 */
async function resolveFromGameWeek(db: D1Database, seniorLeagueId: string): Promise<number> {
  const row = await db.prepare(
    "SELECT MAX(game_week) as max_gw FROM season_calendar WHERE league_id = ? AND status IN ('simulated','lineup_locked')"
  ).bind(seniorLeagueId).first<{ max_gw: number | null }>();
  return (row?.max_gw ?? 0) + 1;
}

/**
 * Posun match_day o jeden den (saturday → sunday, sunday → wednesday, wednesday → saturday).
 * Match-day je v DB CHECKed na ['wednesday','saturday','sunday'], takže musí být validní.
 */
function bumpMatchDay(day: string): string {
  if (day === "saturday") return "sunday";
  if (day === "sunday") return "wednesday";
  return "saturday"; // wednesday → další termín
}
