/**
 * Match API routes — absence, lineup, simulace, výsledky.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { createRng, cryptoSeed } from "../generators/rng";
import { requireTeamOwnership } from "../auth/middleware";
import { getSession, getTokenFromRequest } from "../auth/session";
import { generateAbsences } from "../events/absence";
import { simulateMatch } from "../engine/simulation";
import { generateMatchCommentary } from "../engine/commentary";
import type { GeneratedPlayer } from "../generators/player";
import type { TeamSetup, Tactic, Weather } from "../engine/types";
import { extractStatsFromEvents, updatePlayerStats, calculatePlayerRatings, saveMatchPlayerStats, type MatchPlayerStatsEntry } from "../stats/update-stats";
import { generateMatchWeather } from "../season/weather";
import { logger } from "../lib/logger";

const matchesRouter = new Hono<{ Bindings: Bindings }>();

matchesRouter.use("/teams/:teamId/*", requireTeamOwnership);

function uuid(): string { return crypto.randomUUID(); }

// POST /api/teams/:teamId/simulate-match — simuluje zápas (Sprint 1: okamžitá simulace)
matchesRouter.post("/teams/:teamId/simulate-match", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ tactic?: string }>().catch((e) => { logger.warn({ module: "matches" }, "parse simulate-match body", e); return { tactic: "balanced" }; });

  const rng = createRng(cryptoSeed());

  // Load team + players
  const team = await c.env.DB.prepare(
    "SELECT t.*, v.name as village_name, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(teamId).first<Record<string, unknown>>();
  if (!team) return c.json({ error: "Team not found" }, 404);

  const playersResult = await c.env.DB.prepare(
    "SELECT * FROM players WHERE team_id = ? ORDER BY overall_rating DESC"
  ).bind(teamId).all();

  const players = playersResult.results.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as number,
      first_name: r.first_name as string,
      last_name: r.last_name as string,
      nickname: r.nickname as string,
      age: r.age as number,
      position: r.position as string,
      overall_rating: r.overall_rating as number,
      skills: JSON.parse(r.skills as string),
      physical: r.physical ? JSON.parse(r.physical as string) : {},
      personality: JSON.parse(r.personality as string),
      lifeContext: JSON.parse(r.life_context as string),
    };
  });

  // Generate absences
  const generatedPlayers: GeneratedPlayer[] = players.map((p) => ({
    firstName: p.first_name,
    lastName: p.last_name,
    age: p.age,
    position: p.position as "GK" | "DEF" | "MID" | "FWD",
    speed: p.skills.speed, technique: p.skills.technique,
    shooting: p.skills.shooting, passing: p.skills.passing,
    heading: p.skills.heading, defense: p.skills.defense,
    goalkeeping: p.skills.goalkeeping,
    stamina: p.skills.speed, strength: p.skills.defense,
    injuryProneness: 10, discipline: p.personality.discipline,
    patriotism: p.personality.patriotism, alcohol: p.personality.alcohol,
    temper: p.personality.temper, occupation: p.lifeContext.occupation,
    bodyType: "normal" as const, avatarConfig: {} as any,
    condition: p.lifeContext.condition ?? 100, morale: p.lifeContext.morale ?? 50,
    preferredFoot: (p as any).physical?.preferredFoot ?? "right",
    preferredSide: (p as any).physical?.preferredSide ?? "center",
    leadership: p.personality.leadership ?? 30,
    workRate: p.personality.workRate ?? 50,
    aggression: p.personality.aggression ?? 40,
    consistency: p.personality.consistency ?? 50,
    clutch: p.personality.clutch ?? 50,
  }));

  const absences = generateAbsences(rng, generatedPlayers);
  const absentIndices = new Set(absences.map((a) => a.playerIndex));

  // Build available lineup (exclude absent players)
  const availablePlayers = players.filter((_, i) => !absentIndices.has(i));

  // Build match players
  const buildMatchPlayers = (source: typeof players, limit: number): TeamSetup["lineup"] =>
    source.slice(0, limit).map((p) => ({
      id: p.id as number,
      firstName: p.first_name as string,
      lastName: p.last_name as string,
      nickname: (p.nickname as string) || null,
      position: p.position as "GK" | "DEF" | "MID" | "FWD",
      speed: p.skills.speed, technique: p.skills.technique,
      shooting: p.skills.shooting, passing: p.skills.passing,
      heading: p.skills.heading, defense: p.skills.defense,
      goalkeeping: p.skills.goalkeeping,
      stamina: p.physical?.stamina ?? p.skills.stamina ?? 50,
      strength: p.physical?.strength ?? p.skills.strength ?? 50,
      vision: p.skills.vision ?? 50,
      creativity: p.skills.creativity ?? 50,
      setPieces: p.skills.setPieces ?? 50,
      discipline: p.personality.discipline, alcohol: p.personality.alcohol,
      temper: p.personality.temper,
      leadership: p.personality.leadership ?? 30,
      workRate: p.personality.workRate ?? 50,
      aggression: p.personality.aggression ?? 40,
      consistency: p.personality.consistency ?? 50,
      clutch: p.personality.clutch ?? 50,
      preferredFoot: p.physical?.preferredFoot ?? "right",
      preferredSide: p.physical?.preferredSide ?? "center",
      condition: p.lifeContext?.condition ?? 100,
      morale: p.lifeContext?.morale ?? 60,
    }));

  const homeLineup = buildMatchPlayers(availablePlayers, 11);
  const homeSubs = buildMatchPlayers(availablePlayers.slice(11), 5);

  // Generate fake opponent
  const opponentNames = ["Sokol Netolice", "TJ Husinec", "SK Lhenice", "Jiskra Stachy", "FK Čkyně", "Slavoj Vlachovo Březí"];
  const opponentName = rng.pick(opponentNames);

  // Simple opponent: clone home players with slight randomization
  const awayLineup = homeLineup.map((p) => ({
    ...p,
    id: rng.int(1000, 9999),
    firstName: rng.pick(["Jan", "Petr", "Martin", "Tomáš", "David", "Jakub", "Ondřej", "Filip", "Adam", "Lukáš"]),
    lastName: rng.pick(["Novák", "Dvořák", "Svoboda", "Černý", "Veselý", "Horák", "Marek", "Kučera"]),
    nickname: null,
    speed: Math.max(1, p.speed + rng.int(-5, 5)),
    shooting: Math.max(1, p.shooting + rng.int(-5, 5)),
    technique: Math.max(1, p.technique + rng.int(-5, 5)),
  }));

  const tactic = (body.tactic ?? "balanced") as Tactic;

  // Simulate
  const result = simulateMatch(rng, {
    home: { teamId: 1, teamName: team.name as string, lineup: homeLineup, subs: homeSubs, tactic },
    away: { teamId: 2, teamName: opponentName, lineup: awayLineup, subs: [], tactic: rng.pick(["balanced", "defensive", "offensive"] as Tactic[]) },
    weather: generateMatchWeather(null, Date.now()).weather,
    isHomeAdvantage: true,
  });

  // Generate commentary
  const commentary = generateMatchCommentary(rng, result.events, team.name as string, opponentName);

  // Save match
  const matchId = uuid();
  await c.env.DB.prepare(
    "INSERT INTO matches (id, home_team_id, away_team_id, home_score, away_score, status, events, commentary, simulated_at) VALUES (?, ?, ?, ?, ?, 'simulated', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
  ).bind(matchId, teamId, "ai-opponent", result.homeScore, result.awayScore,
    JSON.stringify(result.events), JSON.stringify(commentary)).run();

  // Update player stats
  const season = await c.env.DB.prepare(
    "SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"
  ).first<{ id: string }>().catch((e) => { logger.warn({ module: "matches" }, "fetch active season for stats", e); return null; });

  if (season) {
    // Build engine ID → DB player ID map
    const playerIdMap = new Map<number, string>();
    const starterDbIds: string[] = [];
    availablePlayers.slice(0, 11).forEach((p) => {
      playerIdMap.set(p.id as number, String(p.id));
      starterDbIds.push(String(p.id));
    });

    // Calculate per-player ratings
    const ratings = calculatePlayerRatings(result.events, playerIdMap, 1, result.homeScore, result.awayScore);

    const statsUpdates = extractStatsFromEvents(result.events, playerIdMap, starterDbIds, ratings);
    const isCleanSheet = result.awayScore === 0;
    await updatePlayerStats(c.env.DB, season.id, teamId, statsUpdates, isCleanSheet).catch((e) => logger.warn({ module: "matches" }, "update player stats", e));

    // Save per-match player stats
    const matchPlayerEntries: MatchPlayerStatsEntry[] = statsUpdates.map((u) => {
      const origPlayer = availablePlayers.find((p) => String(p.id) === u.playerId);
      return {
        playerId: u.playerId,
        teamId,
        started: true,
        position: origPlayer?.position ?? "MID",
        minutesPlayed: u.minutesPlayed,
        goals: u.goals,
        assists: u.assists,
        yellowCards: u.yellowCards,
        redCards: u.redCards,
        rating: u.rating,
      };
    });
    await saveMatchPlayerStats(c.env.DB, matchId, matchPlayerEntries).catch((e) => logger.warn({ module: "matches" }, "save match player stats", e));

    // Save player_ratings JSON to match record
    await c.env.DB.prepare("UPDATE matches SET player_ratings = ? WHERE id = ?")
      .bind(JSON.stringify(ratings), matchId).run().catch((e) => logger.warn({ module: "matches" }, "save player ratings to match", e));
  }

  return c.json({
    matchId,
    homeTeam: team.name,
    awayTeam: opponentName,
    homeScore: result.homeScore,
    awayScore: result.awayScore,
    events: result.events,
    commentary,
    absences: absences.map((a) => ({
      playerName: generatedPlayers[a.playerIndex].firstName + " " + generatedPlayers[a.playerIndex].lastName,
      reason: a.reason,
      emoji: a.emoji,
      smsText: a.smsText,
    })),
  });
});

// GET /api/teams/:teamId/absences — generovat absence pro příští zápas
matchesRouter.get("/teams/:teamId/absences", async (c) => {
  const teamId = c.req.param("teamId");
  const rng = createRng(cryptoSeed());

  const playersResult = await c.env.DB.prepare(
    "SELECT * FROM players WHERE team_id = ?"
  ).bind(teamId).all();

  const generatedPlayers: GeneratedPlayer[] = playersResult.results.map((row) => {
    const skills = JSON.parse(row.skills as string);
    const personality = JSON.parse(row.personality as string);
    const lifeContext = JSON.parse(row.life_context as string);
    return {
      firstName: row.first_name as string, lastName: row.last_name as string,
      age: row.age as number, position: row.position as any,
      speed: skills.speed, technique: skills.technique, shooting: skills.shooting,
      passing: skills.passing, heading: skills.heading, defense: skills.defense,
      goalkeeping: skills.goalkeeping, stamina: skills.speed, strength: skills.defense,
      injuryProneness: 10, discipline: personality.discipline,
      patriotism: personality.patriotism, alcohol: personality.alcohol,
      temper: personality.temper, occupation: lifeContext.occupation,
      bodyType: "normal" as const, avatarConfig: {} as any,
      condition: lifeContext.condition ?? 100, morale: lifeContext.morale ?? 50,
      preferredFoot: "right" as const, preferredSide: "center" as const,
      leadership: personality.leadership ?? 30, workRate: personality.workRate ?? 50,
      aggression: personality.aggression ?? 40, consistency: personality.consistency ?? 50,
      clutch: personality.clutch ?? 50,
    };
  });

  const absences = generateAbsences(rng, generatedPlayers);

  return c.json(playersResult.results.map((row, i) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    nickname: row.nickname,
    position: row.position,
    available: !absences.find((a) => a.playerIndex === i),
    absence: absences.find((a) => a.playerIndex === i) ?? null,
  })));
});

// GET /api/teams/:teamId/match-preview/:matchId — detailed match preview with team comparison
matchesRouter.get("/teams/:teamId/match-preview/:matchId", async (c) => {
  const teamId = c.req.param("teamId");
  const matchId = c.req.param("matchId");

  // Get match info
  const match = await c.env.DB.prepare(
    `SELECT m.*, sc.scheduled_at, sc.game_week
     FROM matches m LEFT JOIN season_calendar sc ON m.calendar_id = sc.id
     WHERE m.id = ?`
  ).bind(matchId).first<Record<string, unknown>>();
  if (!match) return c.json({ error: "Match not found" }, 404);

  const homeId = match.home_team_id as string;
  const awayId = match.away_team_id as string;

  // Get both teams with village info
  const [homeTeam, awayTeam] = await Promise.all([
    c.env.DB.prepare("SELECT t.*, v.name as village_name FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?")
      .bind(homeId).first<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT t.*, v.name as village_name FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?")
      .bind(awayId).first<Record<string, unknown>>(),
  ]);
  if (!homeTeam || !awayTeam) return c.json({ error: "Team not found" }, 404);

  // Get league standings for positions + form
  const leagueId = match.league_id as string;
  const allTeams = await c.env.DB.prepare("SELECT id FROM teams WHERE league_id = ?").bind(leagueId).all();
  const tIds = allTeams.results.map((t) => t.id as string);
  const ph = tIds.map(() => "?").join(",");
  const leagueMatches = await c.env.DB.prepare(
    `SELECT home_team_id, away_team_id, home_score, away_score FROM matches WHERE status = 'simulated' AND league_id = ?`
  ).bind(leagueId).all().catch((e) => { logger.warn({ module: "matches" }, "fetch league matches for preview", e); return { results: [] }; });

  // Calculate standings
  const stats: Record<string, { w: number; d: number; l: number; gf: number; ga: number; form: string[] }> = {};
  for (const tid of tIds) stats[tid] = { w: 0, d: 0, l: 0, gf: 0, ga: 0, form: [] };
  for (const m of leagueMatches.results) {
    const hid = m.home_team_id as string, aid = m.away_team_id as string;
    const hs = m.home_score as number, as_ = m.away_score as number;
    if (!stats[hid] || !stats[aid]) continue;
    stats[hid].gf += hs; stats[hid].ga += as_; stats[aid].gf += as_; stats[aid].ga += hs;
    if (hs > as_) { stats[hid].w++; stats[hid].form.push("W"); stats[aid].l++; stats[aid].form.push("L"); }
    else if (hs < as_) { stats[aid].w++; stats[aid].form.push("W"); stats[hid].l++; stats[hid].form.push("L"); }
    else { stats[hid].d++; stats[hid].form.push("D"); stats[aid].d++; stats[aid].form.push("D"); }
  }

  const sorted = tIds.map((tid) => {
    const s = stats[tid]; const pts = s.w * 3 + s.d;
    return { id: tid, pts, gd: s.gf - s.ga, gf: s.gf, played: s.w + s.d + s.l, form: s.form.slice(-5).reverse() };
  }).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  const posMap = new Map(sorted.map((t, i) => [t.id, i + 1]));

  // Get players + managers for both teams
  const [homePlayers, awayPlayers, homeManager, awayManager] = await Promise.all([
    c.env.DB.prepare("SELECT id, first_name, last_name, age, position, overall_rating, physical FROM players WHERE team_id = ? AND (status IS NULL OR status != 'released') ORDER BY CASE position WHEN 'GK' THEN 0 WHEN 'DEF' THEN 1 WHEN 'MID' THEN 2 WHEN 'FWD' THEN 3 END, overall_rating DESC")
      .bind(homeId).all(),
    c.env.DB.prepare("SELECT id, first_name, last_name, age, position, overall_rating, physical FROM players WHERE team_id = ? AND (status IS NULL OR status != 'released') ORDER BY CASE position WHEN 'GK' THEN 0 WHEN 'DEF' THEN 1 WHEN 'MID' THEN 2 WHEN 'FWD' THEN 3 END, overall_rating DESC")
      .bind(awayId).all(),
    c.env.DB.prepare("SELECT name, avatar FROM managers WHERE team_id = ? LIMIT 1")
      .bind(homeId).first<{ name: string; avatar: string }>().catch((e) => { logger.warn({ module: "matches" }, "fetch home manager", e); return null; }),
    c.env.DB.prepare("SELECT name, avatar FROM managers WHERE team_id = ? LIMIT 1")
      .bind(awayId).first<{ name: string; avatar: string }>().catch((e) => { logger.warn({ module: "matches" }, "fetch away manager", e); return null; }),
  ]);

  const mapTeam = (team: Record<string, unknown>, players: typeof homePlayers, manager: { name: string; avatar: string } | null) => {
    const tid = team.id as string;
    const s = stats[tid] || { w: 0, d: 0, l: 0, gf: 0, ga: 0, form: [] };
    return {
      id: tid,
      name: team.name as string,
      primaryColor: team.primary_color as string || "#2D5F2D",
      secondaryColor: team.secondary_color as string || "#FFFFFF",
      badgePattern: team.badge_pattern as string || "shield",
      isAi: team.user_id === "ai",
      isPlayer: tid === teamId,
      position: posMap.get(tid) ?? 0,
      points: s.w * 3 + s.d,
      played: s.w + s.d + s.l,
      wins: s.w, draws: s.d, losses: s.l,
      goalsFor: s.gf, goalsAgainst: s.ga,
      form: s.form.slice(-5),
      trainingType: team.training_type as string | null,
      manager: manager ? { name: manager.name, avatar: JSON.parse(manager.avatar) } : null,
      squad: players.results.map((p) => {
        const phys = typeof p.physical === "string" ? JSON.parse(p.physical) : (p.physical || {});
        return {
          id: p.id as string,
          name: `${p.first_name} ${p.last_name}`,
          position: p.position as string,
          rating: p.overall_rating as number,
          age: p.age as number,
          height: phys.height as number | undefined,
          weight: phys.weight as number | undefined,
          foot: (phys.preferredFoot as string) || "right",
        };
      }),
      avgRating: players.results.length > 0
        ? Math.round(players.results.reduce((sum, p) => sum + (p.overall_rating as number), 0) / players.results.length)
        : 0,
      squadSize: players.results.length,
    };
  };

  // Stadium of home team (where the match is played)
  const stadium = await c.env.DB.prepare(
    "SELECT capacity, pitch_condition, pitch_type FROM stadiums WHERE team_id = ?"
  ).bind(homeId).first<{ capacity: number; pitch_condition: number; pitch_type: string }>().catch((e) => { logger.warn({ module: "matches" }, "fetch stadium for preview", e); return null; });

  // Weather forecast
  const { generateForecast } = await import("../season/weather");
  const schedAt = (match.scheduled_at ?? match.created_at) as string | null;
  const forecast = generateForecast(schedAt, matchId.charCodeAt(0) + matchId.charCodeAt(1));

  return c.json({
    matchId,
    round: match.round,
    scheduledAt: schedAt,
    isHome: homeId === teamId,
    home: mapTeam(homeTeam, homePlayers, homeManager),
    away: mapTeam(awayTeam, awayPlayers, awayManager),
    venue: {
      name: (homeTeam.stadium_name as string) || `Hřiště ${homeTeam.name}`,
      capacity: stadium?.capacity ?? 0,
      pitchCondition: stadium?.pitch_condition ?? 50,
      pitchType: stadium?.pitch_type ?? "natural",
    },
    weather: {
      icon: forecast.icon,
      expected: forecast.expected,
      temperature: forecast.temperature,
      description: forecast.description,
    },
  });
});

// GET /api/teams/:teamId/schedule — rozpis zápasů (odehrané + nadcházející)
matchesRouter.get("/teams/:teamId/schedule", async (c) => {
  const teamId = c.req.param("teamId");

  // Get team's league + village size pro promotion price
  const team = await c.env.DB.prepare(
    "SELECT t.name, t.league_id, v.size as village_size FROM teams t LEFT JOIN villages v ON v.id = t.village_id WHERE t.id = ?"
  ).bind(teamId).first<{ name: string; league_id: string | null; village_size: string | null }>();
  if (!team) return c.json({ error: "Team not found" }, 404);
  if (!team.league_id) return c.json({ matches: [], leagueName: "" });

  // Promotion price dle kategorie obce — reuse promoCost logiky
  const { mapVillageSize } = await import("../season/finance-processor");
  const teamCategory = mapVillageSize(team.village_size ?? "village");
  const teamPromotionPrice = promoCost(teamCategory);

  // Get league info
  const league = await c.env.DB.prepare(
    "SELECT l.name, s.number as season_number FROM leagues l JOIN seasons s ON l.season_id = s.id WHERE l.id = ?"
  ).bind(team.league_id).first<{ name: string; season_number: number }>().catch((e) => { logger.warn({ module: "matches" }, "fetch league for schedule", e); return null; });

  // Get all matches involving this team
  const result = await c.env.DB.prepare(
    `SELECT m.*,
       ht.name as home_name, ht.primary_color as home_color, ht.secondary_color as home_secondary, ht.badge_pattern as home_badge, ht.user_id as home_user_id,
       at.name as away_name, at.primary_color as away_color, at.secondary_color as away_secondary, at.badge_pattern as away_badge, at.user_id as away_user_id,
       sc.scheduled_at, sc.game_week
     FROM matches m
     JOIN teams ht ON m.home_team_id = ht.id
     JOIN teams at ON m.away_team_id = at.id
     LEFT JOIN season_calendar sc ON m.calendar_id = sc.id
     WHERE (m.home_team_id = ? OR m.away_team_id = ?)
     ORDER BY COALESCE(sc.scheduled_at, m.created_at) ASC`
  ).bind(teamId, teamId).all().catch((e) => { logger.warn({ module: "matches" }, "fetch team schedule", e); return { results: [] }; });

  const matches = result.results.map((row) => ({
    id: row.id,
    calendarId: row.calendar_id,
    round: row.round,
    status: row.status,
    homeTeamId: row.home_team_id,
    homeName: row.home_name,
    homeColor: row.home_color || "#2D5F2D",
    homeSecondary: row.home_secondary || "#FFFFFF",
    homeBadge: row.home_badge || "shield",
    homeScore: row.home_score,
    awayTeamId: row.away_team_id,
    awayName: row.away_name,
    awayColor: row.away_color || "#2D5F2D",
    awaySecondary: row.away_secondary || "#FFFFFF",
    awayBadge: row.away_badge || "shield",
    awayScore: row.away_score,
    scheduledAt: row.scheduled_at || row.simulated_at || row.created_at,
    gameWeek: row.game_week,
    isHome: row.home_team_id === teamId,
    simulatedAt: row.simulated_at,
    promoted: (row.promoted as number | null) === 1,
    promotionCost: (row.promotion_cost as number | null) ?? null,
    promotionBoost: (row.promotion_boost as number | null) ?? 1.0,
  }));

  return c.json({
    leagueName: league?.name ?? "Liga",
    season: league?.season_number ?? 1,
    matches,
    promotionPrice: teamPromotionPrice,
  });
});

// POST /api/teams/:teamId/matches/:matchId/promote — zaplatit propagaci nadcházejícího domácího zápasu
const PROMO_BOOST = 1.25;
const PROMO_HEADLINES: string[] = [
  "{team} láká na zápas s {opp}!",
  "{team} pálí do propagace zápasu s {opp}",
  "Přijď na {team} vs {opp} — propagace běží",
  "Plakáty, rozhlas a tlampače: {team} zve na derby s {opp}",
  "{team}: „Na {opp} přijďte všichni!“",
];
const PROMO_BODIES: string[] = [
  "V {village} se rozjela propagační kampaň — fotbalisté {team} slibují parádní zápas proti {opp}. Vedení klubu nešetří na plakátech ani na hlášeních v obecním rozhlase. „Stánek s pivem bude připraven, grill roztopen a tribuna vyčištěna,“ hlásí pořadatelé.",
  "Klub {team} tentokrát sází na reklamu. Před zápasem s {opp} se v {village} objevily plakáty na každé druhé zastávce a místní trafika hlásí, že se o zápase mluví víc než obvykle. Očekává se vyprodaný stadion.",
  "„Takový zápas si nenecháme ujít,“ píše se na plakátech {team}. V {village} se připravuje na soupeření s {opp} a vedení klubu posílá pozvánku všem, kdo mají rádi dobrý fotbal. Kdo přijde, dostane atmosféru.",
  "V {village} je rušno: {team} vyrukoval s propagační kampaní před zápasem s {opp}. Starosta prý přislíbil účast i s rodinou, místní restaurace nabízí akci na pivo a fanoušci se těší na plný stadion.",
  "Před zápasem {team} vs {opp} proudí do {village} nezvyklé množství propagace. Reklamy visí u hřiště, na zastávkách i v hospodách. Očekává se znatelně vyšší návštěva než obvykle.",
];

function promoCost(category: string): number {
  return category === "vesnice" ? 500
       : category === "obec" ? 1000
       : category === "mestys" ? 1500
       : 2500;
}

function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

matchesRouter.post("/teams/:teamId/matches/:matchId/promote", async (c) => {
  const teamId = c.req.param("teamId");
  const matchId = c.req.param("matchId");

  // Načíst zápas a ověřit validaci
  const match = await c.env.DB.prepare(
    `SELECT m.*, ht.name as home_name, at.name as away_name, ht.league_id as league_id,
            v.name as village_name, v.size as village_size, ht.game_date as game_date
     FROM matches m
     JOIN teams ht ON m.home_team_id = ht.id
     JOIN teams at ON m.away_team_id = at.id
     JOIN villages v ON ht.village_id = v.id
     WHERE m.id = ? AND m.home_team_id = ?`,
  ).bind(matchId, teamId).first<Record<string, unknown>>().catch((e) => {
    logger.warn({ module: "matches" }, "load match for promote", e);
    return null;
  });

  if (!match) {
    return c.json({ error: "Zápas nenalezen nebo nejsi domácí tým" }, 404);
  }
  const status = match.status as string;
  if (status !== "scheduled" && status !== "lineups_open") {
    return c.json({ error: "Propagovat lze jen nadcházející zápas" }, 409);
  }
  if ((match.promoted as number) === 1) {
    return c.json({ error: "Tento zápas je už propagovaný" }, 409);
  }

  const { mapVillageSize } = await import("../season/finance-processor");
  const category = mapVillageSize((match.village_size as string) ?? "village");
  const cost = promoCost(category);

  const team = await c.env.DB.prepare("SELECT budget FROM teams WHERE id = ?")
    .bind(teamId).first<{ budget: number }>();
  if (!team || team.budget < cost) {
    return c.json({ error: `Nedostatek prostředků (${cost} Kč)` }, 400);
  }

  const gameDate = (match.game_date as string) ?? new Date().toISOString();
  const homeName = match.home_name as string;
  const awayName = match.away_name as string;
  const villageName = match.village_name as string;
  const leagueId = match.league_id as string;

  // 1. Odečíst cenu
  const { recordTransaction } = await import("../season/finance-processor");
  await recordTransaction(
    c.env.DB,
    teamId,
    "promotional_campaign",
    -cost,
    `Propagace zápasu vs ${awayName}`,
    gameDate,
    matchId,
  );

  // 2. Označit zápas
  await c.env.DB.prepare(
    "UPDATE matches SET promoted = 1, promotion_cost = ?, promotion_boost = ? WHERE id = ?",
  ).bind(cost, PROMO_BOOST, matchId).run();

  // 3. Pokusit se vygenerovat AI článek, fallback na statický pool
  const { generatePromotionalArticle } = await import("../news/promo-generator");
  const ai = await generatePromotionalArticle(
    c.env.DB,
    c.env.GEMINI_API_KEY,
    matchId,
    teamId,
  ).catch((e) => {
    logger.warn({ module: "matches" }, "ai promo generation failed", e);
    return null;
  });

  let headline: string;
  let body: string;
  if (ai) {
    headline = ai.headline;
    body = ai.body;
  } else {
    headline = pickOne(PROMO_HEADLINES)
      .replace("{team}", homeName)
      .replace("{opp}", awayName);
    body = pickOne(PROMO_BODIES)
      .replace(/\{team\}/g, homeName)
      .replace(/\{opp\}/g, awayName)
      .replace(/\{village\}/g, villageName);
  }

  await c.env.DB.prepare(
    "INSERT INTO news (id, league_id, team_id, type, headline, body, match_id, created_at) VALUES (?, ?, ?, 'promotion', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
  ).bind(uuid(), leagueId, teamId, headline, body, matchId).run().catch((e) => {
    logger.warn({ module: "matches" }, "insert promo news", e);
  });

  const newBudget = team.budget - cost;
  return c.json({ ok: true, cost, newBudget, promotionBoost: PROMO_BOOST });
});

// GET /api/teams/:teamId/league-schedule — full league schedule by rounds
matchesRouter.get("/teams/:teamId/league-schedule", async (c) => {
  const teamId = c.req.param("teamId");

  const team = await c.env.DB.prepare(
    "SELECT league_id FROM teams WHERE id = ?"
  ).bind(teamId).first<{ league_id: string | null }>();
  if (!team?.league_id) return c.json({ rounds: [], leagueName: "" });

  const league = await c.env.DB.prepare(
    "SELECT l.name, s.number as season_number FROM leagues l JOIN seasons s ON l.season_id = s.id WHERE l.id = ?"
  ).bind(team.league_id).first<{ name: string; season_number: number }>().catch((e) => { logger.warn({ module: "matches" }, "fetch league for league-schedule", e); return null; });

  const result = await c.env.DB.prepare(
    `SELECT m.id, m.round, m.status, m.home_score, m.away_score,
       m.home_team_id, m.away_team_id,
       ht.name as home_name, ht.primary_color as home_color, ht.secondary_color as home_secondary, ht.badge_pattern as home_badge,
       at.name as away_name, at.primary_color as away_color, at.secondary_color as away_secondary, at.badge_pattern as away_badge,
       sc.scheduled_at, sc.game_week
     FROM matches m
     JOIN teams ht ON m.home_team_id = ht.id
     JOIN teams at ON m.away_team_id = at.id
     LEFT JOIN season_calendar sc ON m.calendar_id = sc.id
     WHERE m.league_id = ?
     ORDER BY COALESCE(m.round, sc.game_week, 999), ht.name`
  ).bind(team.league_id).all().catch((e) => { logger.warn({ module: "matches" }, "fetch league schedule matches", e); return { results: [] }; });

  // Group by round
  const roundsMap = new Map<number, Array<Record<string, unknown>>>();
  for (const row of result.results) {
    const round = (row.round as number) ?? (row.game_week as number) ?? 0;
    if (!roundsMap.has(round)) roundsMap.set(round, []);
    roundsMap.get(round)!.push(row);
  }

  const rounds = Array.from(roundsMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([round, matches]) => ({
      round,
      scheduledAt: matches[0]?.scheduled_at as string | null,
      matches: matches.map((row) => ({
        id: row.id,
        status: row.status,
        homeTeamId: row.home_team_id,
        homeName: row.home_name,
        homeColor: row.home_color || "#2D5F2D",
        homeSecondary: row.home_secondary || "#FFFFFF",
        homeBadge: row.home_badge || "shield",
        homeScore: row.home_score,
        awayTeamId: row.away_team_id,
        awayName: row.away_name,
        awayColor: row.away_color || "#2D5F2D",
        awaySecondary: row.away_secondary || "#FFFFFF",
        awayBadge: row.away_badge || "shield",
        awayScore: row.away_score,
      })),
    }));

  return c.json({
    leagueName: league?.name ?? "Liga",
    season: league?.season_number ?? 1,
    rounds,
  });
});

// GET /api/matches/:id — detail zápasu
matchesRouter.get("/matches/:id", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT m.*,
       ht.name as home_name, ht.primary_color as home_color, ht.badge_pattern as home_badge, ht.secondary_color as home_secondary,
       at.name as away_name, at.primary_color as away_color, at.badge_pattern as away_badge, at.secondary_color as away_secondary
     FROM matches m
     LEFT JOIN teams ht ON m.home_team_id = ht.id
     LEFT JOIN teams at ON m.away_team_id = at.id
     WHERE m.id = ?`
  ).bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!row) return c.json({ error: "Match not found" }, 404);

  const homeLineup = JSON.parse((row.home_lineup_data as string) ?? "null");
  const awayLineup = JSON.parse((row.away_lineup_data as string) ?? "null");

  // Merge current squad_number from players table (stored lineup_data
  // doesn't have it). Match rating is in player_ratings JSON.
  type LP = { id: string; name: string; position: string; naturalPosition: string; rating: number; squadNumber?: number | null };
  const collectIds = (ld: { starters: LP[]; subs: LP[] } | null): string[] =>
    ld ? [...ld.starters, ...ld.subs].map((p) => p.id).filter(Boolean) : [];
  const allIds = [...collectIds(homeLineup), ...collectIds(awayLineup)];
  if (allIds.length > 0) {
    try {
      const placeholders = allIds.map(() => "?").join(",");
      const players = await c.env.DB.prepare(
        `SELECT id, squad_number FROM players WHERE id IN (${placeholders})`
      ).bind(...allIds).all<{ id: string; squad_number: number | null }>();
      const byId = new Map(players.results.map((p) => [p.id, p.squad_number]));
      const merge = (ld: { starters: LP[]; subs: LP[] } | null) => {
        if (!ld) return;
        for (const list of [ld.starters, ld.subs]) {
          for (const p of list) {
            const num = byId.get(p.id);
            if (num != null) p.squadNumber = num;
          }
        }
      };
      merge(homeLineup);
      merge(awayLineup);
    } catch (e) { logger.warn({ module: "matches" }, "merge squad numbers", e); }
  }

  return c.json({
    ...row,
    events: JSON.parse((row.events as string) ?? "[]"),
    commentary: JSON.parse((row.commentary as string) ?? "[]"),
    player_ratings: JSON.parse((row.player_ratings as string) ?? "{}"),
    home_lineup_data: homeLineup,
    away_lineup_data: awayLineup,
  });
});


// GET /api/teams/:teamId/unseen-match — najde nejstarší nepřečtený zápas
matchesRouter.get("/teams/:teamId/unseen-match", async (c) => {
  const teamId = c.req.param("teamId");

  const row = await c.env.DB.prepare(
    `SELECT m.id, m.round, m.home_team_id, m.away_team_id,
     t1.name as home_name, t2.name as away_name
     FROM matches m
     JOIN teams t1 ON m.home_team_id = t1.id
     JOIN teams t2 ON m.away_team_id = t2.id
     WHERE m.status = 'simulated' AND m.events IS NOT NULL AND LENGTH(m.events) > 10
     AND ((m.home_team_id = ? AND m.home_seen_at IS NULL)
       OR (m.away_team_id = ? AND m.away_seen_at IS NULL))
     ORDER BY m.simulated_at ASC LIMIT 1`
  ).bind(teamId, teamId).first<Record<string, unknown>>();

  if (!row) return c.json(null);

  const isHome = row.home_team_id === teamId;
  return c.json({
    matchId: row.id,
    opponent: isHome ? row.away_name : row.home_name,
    round: row.round,
    isHome,
  });
});

// POST /api/matches/:id/mark-seen — označí zápas jako přečtený
matchesRouter.post("/matches/:id/mark-seen", async (c) => {
  const token = getTokenFromRequest(c);
  if (!token) return c.json({ error: "Nepřihlášen" }, 401);
  const session = await getSession(c.env.SESSION_KV, token);
  if (!session) return c.json({ error: "Neplatná session" }, 401);

  const matchId = c.req.param("id");
  const body = await c.req.json<{ teamId: string }>().catch((e) => { logger.warn({ module: "matches" }, "parse mark-seen body", e); return { teamId: "" }; });

  // Ověřit, že teamId patří přihlášenému uživateli
  const ownTeam = await c.env.DB.prepare("SELECT id FROM teams WHERE id = ? AND user_id = ?")
    .bind(body.teamId, session.userId).first();
  if (!ownTeam) return c.json({ error: "Přístup odepřen" }, 403);

  const match = await c.env.DB.prepare("SELECT home_team_id, away_team_id FROM matches WHERE id = ?")
    .bind(matchId).first<Record<string, unknown>>();
  if (!match) return c.json({ error: "Match not found" }, 404);

  const col = match.home_team_id === body.teamId ? "home_seen_at" : "away_seen_at";
  await c.env.DB.prepare(`UPDATE matches SET ${col} = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`).bind(matchId).run();

  return c.json({ ok: true });
});

// GET /api/teams/:teamId/players/:playerId/match-history — FM-style match history per player
matchesRouter.get("/teams/:teamId/players/:playerId/match-history", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");

  const result = await c.env.DB.prepare(
    `SELECT mps.*, m.home_team_id, m.away_team_id, m.home_score, m.away_score,
       m.simulated_at, m.round, m.weather,
       ht.name as home_name, ht.primary_color as home_color, ht.secondary_color as home_secondary, ht.badge_pattern as home_badge,
       at.name as away_name, at.primary_color as away_color, at.secondary_color as away_secondary, at.badge_pattern as away_badge
     FROM match_player_stats mps
     JOIN matches m ON mps.match_id = m.id
     LEFT JOIN teams ht ON m.home_team_id = ht.id
     LEFT JOIN teams at ON m.away_team_id = at.id
     WHERE mps.player_id = ?
     ORDER BY m.simulated_at DESC`
  ).bind(playerId).all().catch((e) => { logger.warn({ module: "matches" }, "fetch player match history", e); return { results: [] }; });

  const matches = result.results.map((row) => {
    const isHome = row.home_team_id === teamId;
    const opponentName = isHome ? row.away_name : row.home_name;
    const opponentColor = isHome ? row.away_color : row.home_color;
    const opponentSecondary = isHome ? row.away_secondary : row.home_secondary;
    const opponentBadge = isHome ? row.away_badge : row.home_badge;
    const opponentId = isHome ? row.away_team_id : row.home_team_id;
    const myScore = isHome ? row.home_score : row.away_score;
    const oppScore = isHome ? row.away_score : row.home_score;
    const resultLabel = (myScore as number) > (oppScore as number) ? "W"
      : (myScore as number) < (oppScore as number) ? "L" : "D";

    return {
      matchId: row.match_id,
      date: row.simulated_at,
      round: row.round,
      isHome,
      opponent: opponentName,
      opponentId,
      opponentColor: opponentColor || "#2D5F2D",
      opponentSecondary: opponentSecondary || "#FFFFFF",
      opponentBadge: opponentBadge || "shield",
      homeScore: row.home_score,
      awayScore: row.away_score,
      result: resultLabel,
      position: row.position,
      started: row.started === 1,
      minutesPlayed: row.minutes_played,
      goals: row.goals,
      assists: row.assists,
      yellowCards: row.yellow_cards,
      redCards: row.red_cards,
      rating: row.rating,
      weather: row.weather,
    };
  });

  return c.json({ matches });
});

// GET /api/teams/:teamId/match-results — team match results with aggregated stats
matchesRouter.get("/teams/:teamId/match-results", async (c) => {
  const teamId = c.req.param("teamId");

  const result = await c.env.DB.prepare(
    `SELECT m.id, m.round, m.home_team_id, m.away_team_id, m.home_score, m.away_score,
       m.simulated_at, m.weather, m.attendance, m.stadium_name, m.calendar_id,
       ht.name as home_name, ht.primary_color as home_color, ht.secondary_color as home_secondary, ht.badge_pattern as home_badge,
       at.name as away_name, at.primary_color as away_color, at.secondary_color as away_secondary, at.badge_pattern as away_badge
     FROM matches m
     LEFT JOIN teams ht ON m.home_team_id = ht.id
     LEFT JOIN teams at ON m.away_team_id = at.id
     WHERE m.status = 'simulated'
       AND (m.home_team_id = ? OR m.away_team_id = ?)
     ORDER BY m.simulated_at DESC`
  ).bind(teamId, teamId).all().catch((e) => { logger.warn({ module: "matches" }, "fetch team match results", e); return { results: [] }; });

  // Get top scorers for this team from match_player_stats
  const scorers = await c.env.DB.prepare(
    `SELECT mps.player_id, p.first_name, p.last_name, p.nickname, p.position,
       SUM(mps.goals) as total_goals, SUM(mps.assists) as total_assists,
       SUM(mps.yellow_cards) as total_yellows, SUM(mps.red_cards) as total_reds,
       COUNT(*) as appearances, ROUND(AVG(mps.rating), 1) as avg_rating
     FROM match_player_stats mps
     JOIN players p ON mps.player_id = p.id
     WHERE mps.team_id = ?
     GROUP BY mps.player_id
     ORDER BY total_goals DESC, total_assists DESC
     LIMIT 10`
  ).bind(teamId).all().catch((e) => { logger.warn({ module: "matches" }, "fetch team scorers", e); return { results: [] }; });

  const matches = result.results.map((row) => {
    const isHome = row.home_team_id === teamId;
    const myScore = isHome ? row.home_score as number : row.away_score as number;
    const oppScore = isHome ? row.away_score as number : row.home_score as number;
    const resultLabel = myScore > oppScore ? "W" : myScore < oppScore ? "L" : "D";

    return {
      id: row.id,
      round: row.round,
      date: row.simulated_at,
      isHome,
      isFriendly: row.calendar_id == null,
      opponent: isHome ? row.away_name : row.home_name,
      opponentId: isHome ? row.away_team_id : row.home_team_id,
      opponentColor: (isHome ? row.away_color : row.home_color) || "#2D5F2D",
      opponentSecondary: (isHome ? row.away_secondary : row.home_secondary) || "#FFFFFF",
      opponentBadge: (isHome ? row.away_badge : row.home_badge) || "shield",
      homeScore: row.home_score,
      awayScore: row.away_score,
      result: resultLabel,
      weather: row.weather,
      attendance: row.attendance,
      stadium: row.stadium_name,
    };
  });

  // Aggregate form — league matches only
  const leagueMatches = matches.filter((m) => !m.isFriendly);
  const form = leagueMatches.slice(0, 5).map((m) => m.result);
  const totalW = leagueMatches.filter((m) => m.result === "W").length;
  const totalD = leagueMatches.filter((m) => m.result === "D").length;
  const totalL = leagueMatches.filter((m) => m.result === "L").length;
  const goalsFor = leagueMatches.reduce((s, m) => s + (m.isHome ? (m.homeScore as number) : (m.awayScore as number)), 0);
  const goalsAgainst = leagueMatches.reduce((s, m) => s + (m.isHome ? (m.awayScore as number) : (m.homeScore as number)), 0);

  return c.json({
    matches,
    form,
    summary: { played: leagueMatches.length, wins: totalW, draws: totalD, losses: totalL, goalsFor, goalsAgainst },
    topPlayers: scorers.results.map((r) => ({
      playerId: r.player_id,
      name: `${r.first_name} ${r.last_name}`,
      nickname: r.nickname,
      position: r.position,
      goals: r.total_goals,
      assists: r.total_assists,
      yellowCards: r.total_yellows,
      redCards: r.total_reds,
      appearances: r.appearances,
      avgRating: r.avg_rating,
    })),
  });
});

// POST /api/admin/backfill-match-stats — jednorázový backfill match_player_stats z existujících zápasů
matchesRouter.post("/admin/backfill-match-stats", async (c) => {
  const { backfillMatchStats } = await import("../../scripts/backfill-match-stats");
  const result = await backfillMatchStats(c.env.DB);
  return c.json(result);
});

// ── Friendly match challenges (PvP only) ──

async function sendSMS(db: D1Database, teamId: string, senderName: string, roleTitle: string, body: string) {
  let convId = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = ?")
    .bind(teamId, roleTitle).first<{ id: string }>().then((r) => r?.id)
    .catch((e) => { logger.warn({ module: "matches" }, "sendSMS find conversation", e); return null; });
  if (!convId) {
    convId = uuid();
    await db.prepare("INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_text, last_message_at, created_at) VALUES (?, ?, 'system', ?, 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
      .bind(convId, teamId, roleTitle).run()
      .catch((e) => logger.warn({ module: "matches" }, "sendSMS insert conversation", e));
  }
  await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    .bind(uuid(), convId, senderName, body).run()
    .catch((e) => logger.warn({ module: "matches" }, "sendSMS insert message", e));
  await db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
    .bind(body.slice(0, 100), convId).run()
    .catch((e) => logger.warn({ module: "matches" }, "sendSMS update conversation", e));
}

// POST /api/teams/:teamId/challenge/:opponentTeamId — poslat výzvu na přátelák
matchesRouter.post("/teams/:teamId/challenge/:opponentTeamId", async (c) => {
  const teamId = c.req.param("teamId");
  const opponentTeamId = c.req.param("opponentTeamId");
  const body = await c.req.json<{ message?: string }>().catch(() => ({}));

  if (teamId === opponentTeamId) return c.json({ error: "Nemůžeš vyzvat sám sebe" }, 400);

  // Verify opponent is human
  const opponent = await c.env.DB.prepare("SELECT id, name, user_id FROM teams WHERE id = ?")
    .bind(opponentTeamId).first<{ id: string; name: string; user_id: string }>();
  if (!opponent || opponent.user_id === "ai") return c.json({ error: "Přáteláky lze hrát pouze proti hráčským týmům" }, 400);

  // Přátelské zápasy jsou zdarma (na trénink taktiky a sehranosti).
  const team = await c.env.DB.prepare("SELECT name, budget, game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ name: string; budget: number; game_date: string }>();
  if (!team) return c.json({ error: "Team not found" }, 404);

  // Cooldown: 3 game days since last challenge
  const lastChallenge = await c.env.DB.prepare(
    "SELECT created_at FROM challenges WHERE (challenger_team_id = ? OR challenged_team_id = ?) AND status IN ('accepted','played') ORDER BY created_at DESC LIMIT 1"
  ).bind(teamId, teamId).first<{ created_at: string }>()
    .catch((e) => { logger.warn({ module: "matches" }, "fetch last challenge cooldown", e); return null; });

  if (lastChallenge) {
    const daysDiff = (new Date(team.game_date).getTime() - new Date(lastChallenge.created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff < 3) return c.json({ error: "Přátelák je možný jednou za 3 dny", cooldown: true }, 400);
  }

  // Check no pending challenge already exists between these teams
  const existing = await c.env.DB.prepare(
    "SELECT id FROM challenges WHERE challenger_team_id = ? AND challenged_team_id = ? AND status = 'pending'"
  ).bind(teamId, opponentTeamId).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: "matches" }, "fetch existing pending challenge", e); return null; });
  if (existing) return c.json({ error: "Výzva už byla odeslána" }, 400);

  // Check neither team has a league match or friendly today (same game_date)
  const gameDateStr = team.game_date;
  const gameDateDay = gameDateStr ? gameDateStr.split("T")[0] : null;
  if (gameDateDay) {
    const [leagueRes, friendlyRes] = await c.env.DB.batch([
      c.env.DB.prepare(
        `SELECT m.id FROM matches m JOIN season_calendar sc ON m.calendar_id = sc.id
         WHERE (m.home_team_id = ? OR m.away_team_id = ? OR m.home_team_id = ? OR m.away_team_id = ?)
         AND sc.scheduled_at LIKE ? AND m.status IN ('scheduled','lineups_open','simulated') LIMIT 1`
      ).bind(teamId, teamId, opponentTeamId, opponentTeamId, `${gameDateDay}%`),
      c.env.DB.prepare(
        `SELECT id FROM matches WHERE calendar_id IS NULL AND status IN ('lineups_open','simulated')
         AND (home_team_id = ? OR away_team_id = ? OR home_team_id = ? OR away_team_id = ?)
         AND created_at LIKE ? LIMIT 1`
      ).bind(teamId, teamId, opponentTeamId, opponentTeamId, `${gameDateDay}%`),
    ]);
    if (leagueRes.results.length > 0) return c.json({ error: "Dnes máš nebo soupeř má ligový zápas — přátelák lze hrát jen v dny bez ligového zápasu" }, 400);
    if (friendlyRes.results.length > 0) return c.json({ error: "Jeden z týmů už dnes hrál nebo má naplánovaný přátelák" }, 400);
  }

  const challengeId = uuid();
  const expiresAt = new Date(team.game_date);
  expiresAt.setDate(expiresAt.getDate() + 7);

  await c.env.DB.prepare(
    "INSERT INTO challenges (id, challenger_team_id, challenged_team_id, status, message, created_at, expires_at) VALUES (?, ?, ?, 'pending', ?, ?, ?)"
  ).bind(challengeId, teamId, opponentTeamId, (body as { message?: string }).message ?? null, team.game_date, expiresAt.toISOString()).run();

  // SMS to opponent
  await sendSMS(c.env.DB, opponentTeamId, "Sportovní ředitel", "Sportovní ředitel",
    `⚽ Výzva na přátelský zápas od ${team.name}!${(body as { message?: string }).message ? ` Vzkaz: "${(body as { message?: string }).message}"` : ""} Podívej se do Přáteláků.`
  );

  // challenge notifikace soupeři
  try {
    const { createNotification } = await import("../community/notifications");
    const pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
    await createNotification(c.env.DB, opponentTeamId, "challenge", `⚽ Výzva od ${team.name}!`, "Chcete hrát přátelský zápas? Odpověz v Přáteláky.", "/dashboard/friendly", pushEnv);
  } catch (e) { logger.warn({ module: "matches" }, "challenge create notification", e); }

  return c.json({ ok: true, challengeId });
});

// POST /api/teams/:teamId/challenge/:challengeId/accept — přijmout výzvu
matchesRouter.post("/teams/:teamId/challenge/:challengeId/accept", async (c) => {
  const teamId = c.req.param("teamId");
  const challengeId = c.req.param("challengeId");

  // Atomický claim — pouze první request projde, duplicitní vrátí 404
  const claimed = await c.env.DB.prepare(
    "UPDATE challenges SET status = 'accepted' WHERE id = ? AND challenged_team_id = ? AND status = 'pending' RETURNING *"
  ).bind(challengeId, teamId).first<Record<string, unknown>>();
  if (!claimed) return c.json({ error: "Výzva nenalezena nebo už zpracována" }, 404);
  const challenge = claimed;

  // Přátelské zápasy jsou zdarma — žádná kontrola budgetu
  const team = await c.env.DB.prepare("SELECT name, budget, game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ name: string; budget: number; game_date: string }>();
  if (!team) return c.json({ error: "Team not found" }, 404);

  const challengerTeamId = challenge.challenger_team_id as string;
  const challenger = await c.env.DB.prepare("SELECT name, game_date FROM teams WHERE id = ?")
    .bind(challengerTeamId).first<{ name: string; game_date: string }>();

  // Check neither team has a league match or friendly today
  const gameDateDay = team.game_date ? team.game_date.split("T")[0] : null;
  if (gameDateDay) {
    const [leagueRes, friendlyRes] = await c.env.DB.batch([
      c.env.DB.prepare(
        `SELECT m.id FROM matches m JOIN season_calendar sc ON m.calendar_id = sc.id
         WHERE (m.home_team_id = ? OR m.away_team_id = ? OR m.home_team_id = ? OR m.away_team_id = ?)
         AND sc.scheduled_at LIKE ? AND m.status IN ('scheduled','lineups_open','simulated') LIMIT 1`
      ).bind(teamId, teamId, challengerTeamId, challengerTeamId, `${gameDateDay}%`),
      c.env.DB.prepare(
        `SELECT id FROM matches WHERE calendar_id IS NULL AND status IN ('lineups_open','simulated')
         AND (home_team_id = ? OR away_team_id = ? OR home_team_id = ? OR away_team_id = ?)
         AND created_at LIKE ? LIMIT 1`
      ).bind(teamId, teamId, challengerTeamId, challengerTeamId, `${gameDateDay}%`),
    ]);
    if (leagueRes.results.length > 0) return c.json({ error: "Dnes máš nebo soupeř má ligový zápas — přátelák nelze přijmout" }, 400);
    if (friendlyRes.results.length > 0) return c.json({ error: "Jeden z týmů už dnes hrál nebo má naplánovaný přátelák" }, 400);
  }

  // Přátelské zápasy jsou zdarma — bez transakce

  // Create match
  const matchId = uuid();
  await c.env.DB.prepare(
    "INSERT INTO matches (id, home_team_id, away_team_id, status, created_at) VALUES (?, ?, ?, 'lineups_open', ?)"
  ).bind(matchId, challengerTeamId, teamId, team.game_date).run();

  // Update match_id on challenge (status already set atomically above)
  await c.env.DB.prepare("UPDATE challenges SET match_id = ? WHERE id = ?")
    .bind(matchId, challengeId).run();

  // SMS both teams
  await sendSMS(c.env.DB, challengerTeamId, "Sportovní ředitel", "Sportovní ředitel",
    `✅ ${team.name} přijal výzvu na přátelák! Nastav sestavu, zápas se odehraje v 18:00.`
  );
  await sendSMS(c.env.DB, teamId, "Sportovní ředitel", "Sportovní ředitel",
    `✅ Přátelák s ${challenger?.name ?? "soupeřem"} domluven! Nastav sestavu, zápas se odehraje v 18:00.`
  );

  // challenge accept notifikace oběma
  try {
    const { createNotification } = await import("../community/notifications");
    const pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
    await createNotification(c.env.DB, challengerTeamId, "challenge", `✅ ${team.name} přijal výzvu!`, "Nastav sestavu, zápas se odehraje v 18:00.", "/dashboard/match", pushEnv);
    await createNotification(c.env.DB, teamId, "challenge", `✅ Přátelák s ${challenger?.name ?? "soupeřem"} domluven!`, "Nastav sestavu, zápas se odehraje v 18:00.", "/dashboard/match", pushEnv);
  } catch (e) { logger.warn({ module: "matches" }, "challenge accept notifications", e); }

  return c.json({ ok: true, matchId });
});

// POST /api/teams/:teamId/challenge/:challengeId/decline — odmítnout výzvu
matchesRouter.post("/teams/:teamId/challenge/:challengeId/decline", async (c) => {
  const teamId = c.req.param("teamId");
  const challengeId = c.req.param("challengeId");

  const challenge = await c.env.DB.prepare(
    "SELECT challenger_team_id FROM challenges WHERE id = ? AND challenged_team_id = ? AND status = 'pending'"
  ).bind(challengeId, teamId).first<{ challenger_team_id: string }>();
  if (!challenge) return c.json({ error: "Výzva nenalezena" }, 404);

  await c.env.DB.prepare("UPDATE challenges SET status = 'declined' WHERE id = ?").bind(challengeId).run();

  const team = await c.env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId).first<{ name: string }>();
  await sendSMS(c.env.DB, challenge.challenger_team_id, "Sportovní ředitel", "Sportovní ředitel",
    `❌ ${team?.name ?? "Soupeř"} odmítl výzvu na přátelák.`
  );

  // challenge decline notifikace vyzyvajícímu
  try {
    const { createNotification } = await import("../community/notifications");
    const pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
    await createNotification(c.env.DB, challenge.challenger_team_id, "challenge", `❌ ${team?.name ?? "Soupeř"} odmítl výzvu`, "Zkus vyzvat jiný tým.", "/dashboard/friendly", pushEnv);
  } catch (e) { logger.warn({ module: "matches" }, "challenge decline notification", e); }

  return c.json({ ok: true });
});

// GET /api/teams/:teamId/challenges — seznam výzev + cooldown
matchesRouter.get("/teams/:teamId/challenges", async (c) => {
  const teamId = c.req.param("teamId");

  const team = await c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ game_date: string }>();

  // Incoming pending
  const incoming = await c.env.DB.prepare(
    `SELECT c.*, t.name as challenger_name FROM challenges c
     JOIN teams t ON c.challenger_team_id = t.id
     WHERE c.challenged_team_id = ? AND c.status = 'pending'
     ORDER BY c.created_at DESC`
  ).bind(teamId).all();

  // Outgoing pending + accepted (waiting for lineup/simulation)
  const outgoing = await c.env.DB.prepare(
    `SELECT c.*, t.name as challenged_name, m.status as match_status FROM challenges c
     JOIN teams t ON c.challenged_team_id = t.id
     LEFT JOIN matches m ON c.match_id = m.id
     WHERE c.challenger_team_id = ? AND c.status IN ('pending', 'accepted')
     ORDER BY c.created_at DESC`
  ).bind(teamId).all();

  // Recent played (last 5)
  const played = await c.env.DB.prepare(
    `SELECT c.*, t1.name as challenger_name, t2.name as challenged_name,
            m.home_score, m.away_score
     FROM challenges c
     JOIN teams t1 ON c.challenger_team_id = t1.id
     JOIN teams t2 ON c.challenged_team_id = t2.id
     LEFT JOIN matches m ON c.match_id = m.id
     WHERE (c.challenger_team_id = ? OR c.challenged_team_id = ?) AND c.status = 'played'
     ORDER BY c.created_at DESC LIMIT 5`
  ).bind(teamId, teamId).all();

  // Cooldown check
  const lastChallenge = await c.env.DB.prepare(
    "SELECT created_at FROM challenges WHERE (challenger_team_id = ? OR challenged_team_id = ?) AND status IN ('accepted','played') ORDER BY created_at DESC LIMIT 1"
  ).bind(teamId, teamId).first<{ created_at: string }>()
    .catch((e) => { logger.warn({ module: "matches" }, "fetch last challenge cooldown (list)", e); return null; });

  let cooldownDaysLeft = 0;
  if (lastChallenge && team) {
    const daysDiff = (new Date(team.game_date).getTime() - new Date(lastChallenge.created_at).getTime()) / (1000 * 60 * 60 * 24);
    cooldownDaysLeft = Math.max(0, Math.ceil(3 - daysDiff));
  }

  // List of human teams to challenge (exclude self)
  const humanTeams = await c.env.DB.prepare(
    "SELECT t.id, t.name, v.name as village FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.user_id <> 'ai' AND t.id <> ? ORDER BY t.name"
  ).bind(teamId).all();

  return c.json({
    incoming: incoming.results.map((r) => ({
      id: r.id, challengerName: r.challenger_name, message: r.message, createdAt: r.created_at,
    })),
    outgoing: outgoing.results.map((r) => ({
      id: r.id, challengedName: r.challenged_name, message: r.message, createdAt: r.created_at,
      status: r.status as string,
      matchId: r.match_id as string | null,
      matchStatus: r.match_status as string | null,
    })),
    played: played.results.map((r) => ({
      id: r.id, matchId: r.match_id,
      challengerName: r.challenger_name, challengedName: r.challenged_name,
      homeScore: r.home_score, awayScore: r.away_score,
    })),
    cooldownDaysLeft,
    canChallenge: cooldownDaysLeft === 0,
    teams: humanTeams.results.map((r) => ({ id: r.id, name: r.name, village: r.village })),
  });
});

export { matchesRouter };
