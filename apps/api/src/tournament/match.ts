/**
 * Simulace zápasu Turnaje P-Mobile. Vychází z pohárové simulace (`simulateCupTie`),
 * rozdíly:
 * - hraje se na hřišti areálu P-Mobile, ne u domácích — žádná výhoda domácích, žádný
 *   trávník klubu, žádné vstupné ani bufet klubu (náklady i tržby nese P-Mobile),
 * - karty platí jen v turnaji: stopky z `tournament_suspensions`, ligové stopky
 *   (`players.suspended_matches`) se v turnaji neuplatní a turnajové se do ligy nepíšou,
 * - sudí z komise okresu, kde se hraje,
 * - návštěva z fanoušků obou klubů a místních, podle fáze turnaje a hřiště.
 */

import { createRng, type Rng } from "../generators/rng";
import { logger } from "../lib/logger";
import { experienceGainChance } from "../skills/training";
import { typZraneniZPopisu, zavaznostZeDnu } from "../injuries/injury-types";
import { buildCupLineupData, cupShootout, cupTieWeather } from "../cup/cup";
import type { TeamSetup, Weather } from "../engine/types";
import type { TournamentRow, VenueRow } from "./service";

const M = "tournament-match";

export interface TournamentMatchRow {
  id: string;
  tournament_id: string;
  stage: string;
  day: number;
  bracket_pos: number;
  scheduled_at: string;
  venue_id: string | null;
  home_team_id: string;
  away_team_id: string;
  status: string;
}

export interface TournamentMatchResult {
  homeScore: number;
  awayScore: number;
  homePens: number | null;
  awayPens: number | null;
  winnerTeamId: string | null;
}

type LineupRow = { players_data: string; formation: string; tactic: string | null; hardness: string | null; match_plan: string | null; bench_data: string | null };

/** Sestava pro tenhle zápas, jinak poslední uložená (kdo nic nenastaví, hraje v poslední sestavě). */
async function savedLineup(db: D1Database, teamId: string, matchId: string): Promise<LineupRow | null> {
  const perMatch = await db.prepare("SELECT players_data, formation, tactic, hardness, match_plan, bench_data FROM lineups WHERE team_id = ? AND calendar_id = ?")
    .bind(teamId, matchId).first<LineupRow>()
    .catch((e) => { logger.warn({ module: M }, `sestava na zápas ${matchId}`, e); return null; });
  if (perMatch) return perMatch;
  return db.prepare("SELECT players_data, formation, tactic, hardness, match_plan, bench_data FROM lineups WHERE team_id = ? AND is_auto = 0 ORDER BY submitted_at DESC LIMIT 1")
    .bind(teamId).first<LineupRow>()
    .catch((e) => { logger.warn({ module: M }, `poslední sestava týmu ${teamId}`, e); return null; });
}

/** Turnajové stopky: počet zápasů, které hráč ještě musí vynechat. */
export async function loadTournamentSuspensions(db: D1Database, tournamentId: string, teamIds: string[]): Promise<Map<string, number>> {
  const rows = await db.prepare(
    `SELECT s.player_id, s.matches_remaining FROM tournament_suspensions s
       JOIN players p ON p.id = s.player_id
      WHERE s.tournament_id = ? AND s.matches_remaining > 0 AND p.team_id IN (${teamIds.map(() => "?").join(",")})`
  ).bind(tournamentId, ...teamIds).all<{ player_id: string; matches_remaining: number }>();
  return new Map(rows.results.map((r) => [r.player_id, r.matches_remaining]));
}

/**
 * Kádr týmu pro sestavení zápasu: stejné řádky jako čte `buildMatchPlayers`, jen se
 * stopkou z turnaje místo ligové.
 */
async function squadWithTournamentSuspensions(db: D1Database, teamId: string, suspensions: Map<string, number>) {
  const rows = await db.prepare(
    "SELECT * FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') ORDER BY overall_rating DESC"
  ).bind(teamId).all<Record<string, unknown>>();
  return { results: rows.results.map((r) => ({ ...r, suspended_matches: suspensions.get(r.id as string) ?? 0 })) };
}

/** Diváci: cestující fanoušci obou klubů + místní, víc na hlavním stadionu a v play-off. */
export function tournamentAttendance(opts: {
  homeFans: number; awayFans: number; stage: string; isMain: boolean; weather: Weather; capacity: number; seed: string;
}): number {
  const travel = { league: 0.25, qf: 0.4, sf: 0.5, final: 0.7 }[opts.stage] ?? 0.25;
  const locals = (opts.isMain ? 600 : 150) * ({ league: 1, qf: 1.6, sf: 2.2, final: 3.5 }[opts.stage] ?? 1);
  const weatherMod = { sunny: 1.05, cloudy: 1, rain: 0.75, snow: 0.6, wind: 0.9, fog: 0.85 }[opts.weather as string] ?? 1;
  let h = 0;
  for (let i = 0; i < opts.seed.length; i++) h = (h * 31 + opts.seed.charCodeAt(i)) >>> 0;
  const jitter = 0.9 + ((h % 1000) / 1000) * 0.2;
  const raw = ((opts.homeFans + opts.awayFans) * travel + locals) * weatherMod * jitter;
  return Math.max(50, Math.min(opts.capacity, Math.round(raw)));
}

async function fanCount(db: D1Database, teamId: string): Promise<number> {
  const row = await db.prepare("SELECT hardcore_count, regular_count, casual_count FROM team_fanbase WHERE team_id = ?")
    .bind(teamId).first<{ hardcore_count: number; regular_count: number; casual_count: number }>()
    .catch((e) => { logger.warn({ module: M }, `fanoušci týmu ${teamId}`, e); return null; });
  if (!row) return 100;
  // Na výjezd jedou hlavně skalní, příležitostní fanoušci málokdy.
  return row.hardcore_count + row.regular_count * 0.5 + row.casual_count * 0.1;
}

/** Stav trávníku hřiště z jeho vzhledu: umělka je pořád stejná, tráva podle úrovně areálu. */
function pitchConditionOf(look: Record<string, unknown>): number {
  if (look.pitch_type === "artificial") return 95;
  const level = Number(look.changing_rooms ?? 1);
  return 70 + Math.min(3, Math.max(0, level)) * 8;
}

export async function simulateTournamentMatch(
  db: D1Database, m: TournamentMatchRow, t: TournamentRow, venue: VenueRow | null,
): Promise<TournamentMatchResult> {
  const { buildMatchPlayers } = await import("../multiplayer/match-runner");
  const { simulateMatch } = await import("../engine/simulation");
  const { calculatePlayerRatings, extractStatsFromEvents, saveMatchPlayerStats, determineManOfMatch, saveMatchMom } = await import("../stats/update-stats");

  const rng: Rng = createRng(Array.from(m.id).reduce((s, c) => (s * 31 + c.charCodeAt(0)) | 0, 7));
  const homeId = m.home_team_id;
  const awayId = m.away_team_id;
  const weather = await cupTieWeather(db, m.scheduled_at, m.id);
  const look = (() => {
    try { return JSON.parse(venue?.look ?? "{}") as Record<string, unknown>; } catch (e) {
      logger.warn({ module: M }, `vzhled hřiště ${venue?.id}`, e);
      return {};
    }
  })();

  const suspensions = await loadTournamentSuspensions(db, t.id, [homeId, awayId]);
  const [homeLR, awayLR] = await Promise.all([savedLineup(db, homeId, m.id), savedLineup(db, awayId, m.id)]);
  const [homeRows, awayRows] = await Promise.all([
    squadWithTournamentSuspensions(db, homeId, suspensions),
    squadWithTournamentSuspensions(db, awayId, suspensions),
  ]);
  const homeBuild = await buildMatchPlayers(db, homeId, homeLR?.players_data ?? null, 0, { matchKey: m.id, benchJson: homeLR?.bench_data }, homeRows);
  const awayBuild = await buildMatchPlayers(db, awayId, awayLR?.players_data ?? null, 100, { matchKey: m.id, benchJson: awayLR?.bench_data }, awayRows);

  const homeLineup = homeBuild.players; const homeSubs = homeLineup.splice(11);
  const awayLineup = awayBuild.players; const awaySubs = awayLineup.splice(11);

  // Kdo nedá dohromady ani sedm hráčů, prohrává kontumačně 0:3.
  if (homeLineup.length < 7 || awayLineup.length < 7) {
    const homeOk = homeLineup.length >= 7;
    const awayOk = awayLineup.length >= 7;
    logger.warn({ module: M }, `zápas ${m.id}: málo hráčů (domácí ${homeLineup.length}, hosté ${awayLineup.length}) → kontumace`);
    const hs = homeOk && !awayOk ? 3 : 0;
    const as = awayOk && !homeOk ? 3 : 0;
    await db.prepare("UPDATE tournament_matches SET stadium_name = ?, weather = ?, attendance = 0, simulated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?")
      .bind(venue?.name ?? null, weather, m.id).run()
      .catch((e) => logger.warn({ module: M }, `kontumace ${m.id}: detail`, e));
    const winner = hs > as ? homeId : as > hs ? awayId : null;
    return { homeScore: hs, awayScore: as, homePens: null, awayPens: null, winnerTeamId: m.stage === "league" ? winner : winner ?? homeId };
  }

  const { applyManagerMatchBonus } = await import("../season/manager-match-bonus");
  await applyManagerMatchBonus(db, homeId, [homeLineup, homeSubs]);
  await applyManagerMatchBonus(db, awayId, [awayLineup, awaySubs]);

  const { applyIncidentMatchMods } = await import("../incidents/zapas");
  const homeIncidentMods = await applyIncidentMatchMods(db, homeId, [homeLineup, homeSubs], homeBuild.idMap);
  const awayIncidentMods = await applyIncidentMatchMods(db, awayId, [awayLineup, awaySubs], awayBuild.idMap);
  // Morálka snížená incidentem je jen handicap pro tenhle zápas, do DB se nezapisuje.
  const incidentMoraleDelta = new Map<number, number>([
    ...(homeIncidentMods?.moraleDelta ?? []),
    ...(awayIncidentMods?.moraleDelta ?? []),
  ]);

  const homePre = homeLineup.map((p) => ({ ...p }));
  const awayPre = awayLineup.map((p) => ({ ...p }));

  const { injectRelationships } = await import("../multiplayer/inject-relations");
  await injectRelationships(db, [
    { players: [...homeLineup, ...homeSubs], idMap: homeBuild.idMap },
    { players: [...awayLineup, ...awaySubs], idMap: awayBuild.idMap },
  ]);

  const { readFamiliarity, applyMatchResult } = await import("../engine/chemistry");
  const homeFormation = homeLR?.formation ?? "4-4-2";
  const awayFormation = awayLR?.formation ?? "4-4-2";
  const homeTactic = (homeLR?.tactic as TeamSetup["tactic"]) ?? "balanced";
  const awayTactic = (awayLR?.tactic as TeamSetup["tactic"]) ?? "balanced";
  const homeHardness = (homeLR?.hardness as TeamSetup["hardness"]) ?? "normal";
  const awayHardness = (awayLR?.hardness as TeamSetup["hardness"]) ?? "normal";
  const [homeFam, awayFam] = await Promise.all([readFamiliarity(db, homeId), readFamiliarity(db, awayId)]);

  const { loadSetPieceTakers } = await import("../engine/set-piece-takers");
  const [homeTakers, awayTakers] = await Promise.all([
    loadSetPieceTakers(db, homeId, homeBuild.idMap),
    loadSetPieceTakers(db, awayId, awayBuild.idMap),
  ]);

  const { toEnginePlan } = await import("../engine/plan-mapping");
  const homePlan = toEnginePlan(homeBuild.idMap, homeLR?.match_plan);
  const awayPlan = toEnginePlan(awayBuild.idMap, awayLR?.match_plan);

  const homeSetup: TeamSetup = { teamId: 1, teamName: "Domácí", lineup: homeLineup, subs: homeSubs, tactic: homeTactic, formation: homeFormation, hardness: homeHardness, ...homeTakers, formationFamiliarity: homeFam.formation[homeFormation] ?? 0, plan: homePlan };
  const awaySetup: TeamSetup = { teamId: 2, teamName: "Hosté", lineup: awayLineup, subs: awaySubs, tactic: awayTactic, formation: awayFormation, hardness: awayHardness, ...awayTakers, formationFamiliarity: awayFam.formation[awayFormation] ?? 0, plan: awayPlan };

  // Neutrální půda: ani jeden tým není doma (vybavení „jen na domácí zápas" neplatí).
  const { loadMatchMods } = await import("../equipment/match-mods");
  const [homeEquipment, awayEquipment] = await Promise.all([loadMatchMods(db, homeId, false), loadMatchMods(db, awayId, false)]);

  const { loadDistrictReferee, mapIncidentsToDb, withRefereeMemory, refereeStatsStatements } = await import("../referees/load");
  const loadedRef = await loadDistrictReferee(db, m.id, t.city);
  const referee = {
    ...loadedRef,
    profile: loadedRef.profile.id ? await withRefereeMemory(db, loadedRef.profile, homeId, awayId) : loadedRef.profile,
  };

  const [homeFans, awayFans] = await Promise.all([fanCount(db, homeId), fanCount(db, awayId)]);
  const attendance = tournamentAttendance({
    homeFans, awayFans, stage: m.stage, isMain: venue?.is_main === 1, weather,
    capacity: venue?.capacity ?? 1000, seed: m.id,
  });
  const pitchCondition = pitchConditionOf(look);
  const stadiumName = venue ? `${venue.name}, ${t.city}` : t.venue_name;

  const result = simulateMatch(rng, {
    home: homeSetup, away: awaySetup, weather, isHomeAdvantage: false,
    homeEquipment, awayEquipment, referee: referee.profile,
    pitchCondition, attendance, stadiumName,
  });

  await applyMatchResult(db, homeId, homeTactic, homeFormation).catch((e) => logger.warn({ module: M }, "sehranost domácích", e));
  await applyMatchResult(db, awayId, awayTactic, awayFormation).catch((e) => logger.warn({ module: M }, "sehranost hostů", e));

  const fullIdMap = new Map<number, string>([...homeBuild.idMap, ...awayBuild.idMap]);
  const positions = new Map<string, string>([...homeBuild.positionMap, ...awayBuild.positionMap]);
  const enginePos = new Map<number, string>();
  for (const p of [...homePre, ...homeSubs, ...awayPre, ...awaySubs]) enginePos.set(p.id, p.matchPosition ?? p.position);

  const ratings = calculatePlayerRatings(result.events, fullIdMap, 1, result.homeScore, result.awayScore, enginePos);
  const homeStarterIds = homePre.map((p) => homeBuild.idMap.get(p.id) ?? "").filter(Boolean);
  const awayStarterIds = awayPre.map((p) => awayBuild.idMap.get(p.id) ?? "").filter(Boolean);
  const homeUpdates = extractStatsFromEvents(result.events, homeBuild.idMap, homeStarterIds, ratings, result.playerMinutes);
  const awayUpdates = extractStatsFromEvents(result.events, awayBuild.idMap, awayStarterIds, ratings, result.playerMinutes);
  const toEntry = (u: (typeof homeUpdates)[number], teamId: string, starters: string[]) => ({
    playerId: u.playerId, teamId, started: starters.includes(u.playerId), position: positions.get(u.playerId) ?? "MID",
    minutesPlayed: u.minutesPlayed, goals: u.goals, assists: u.assists, yellowCards: u.yellowCards, redCards: u.redCards, rating: u.rating,
  });
  await saveMatchPlayerStats(db, m.id, [
    ...homeUpdates.map((u) => toEntry(u, homeId, homeStarterIds)),
    ...awayUpdates.map((u) => toEntry(u, awayId, awayStarterIds)),
  ]).catch((e) => logger.warn({ module: M }, "statistiky hráčů", e));
  await saveMatchMom(db, m.id, determineManOfMatch(ratings)).catch((e) => logger.warn({ module: M }, "hráč zápasu", e));

  // ── Turnajové stopky: kdo stopku měl a nehrál, má ji o zápas kratší; červená = stopka na zápas.
  try {
    const playedIds = new Set([...homeUpdates, ...awayUpdates].map((u) => u.playerId));
    const susStmts: D1PreparedStatement[] = [];
    for (const [playerId] of suspensions) {
      if (playedIds.has(playerId)) continue;
      susStmts.push(db.prepare("UPDATE tournament_suspensions SET matches_remaining = MAX(0, matches_remaining - 1) WHERE tournament_id = ? AND player_id = ?").bind(t.id, playerId));
    }
    for (const u of [...homeUpdates, ...awayUpdates]) {
      if (u.redCards <= 0) continue;
      susStmts.push(db.prepare(
        `INSERT INTO tournament_suspensions (tournament_id, player_id, matches_remaining) VALUES (?, ?, 1)
         ON CONFLICT (tournament_id, player_id) DO UPDATE SET matches_remaining = matches_remaining + 1`
      ).bind(t.id, u.playerId));
    }
    if (susStmts.length > 0) await db.batch(susStmts);
  } catch (e) {
    logger.error({ module: M }, `turnajové stopky po zápase ${m.id}`, e);
  }

  // ── Kondice a morálka po zápase
  try {
    const { logConditionStmt } = await import("../lib/condition-log");
    const preCond = new Map<number, number>();
    for (const p of [...homePre, ...awayPre]) preCond.set(p.id, p.condition);
    const homePost = result.homeLineup ?? [];
    const stmts: D1PreparedStatement[] = [];
    for (const p of [...homePost, ...(result.awayLineup ?? [])]) {
      const dbId = fullIdMap.get(p.id);
      if (!dbId) continue;
      const teamId = homePost.includes(p) ? homeId : awayId;
      const morale = Math.max(0, Math.min(100, Math.round(p.morale - (incidentMoraleDelta.get(p.id) ?? 0))));
      stmts.push(db.prepare("UPDATE players SET life_context = json_set(life_context, '$.condition', ?, '$.morale', ?) WHERE id = ?").bind(Math.round(p.condition), morale, dbId));
      const old = preCond.get(p.id);
      if (old != null && Math.round(old) !== Math.round(p.condition)) {
        stmts.push(logConditionStmt(db, dbId, teamId, old, p.condition, "match", `Turnaj (${result.homeScore}:${result.awayScore})`));
      }
    }
    if (stmts.length > 0) await db.batch(stmts);
  } catch (e) {
    logger.warn({ module: M }, `kondice a morálka po zápase ${m.id}`, e);
  }

  {
    const { reactToLeftOut } = await import("../multiplayer/left-out");
    for (const [teamId, build] of [[homeId, homeBuild], [awayId, awayBuild]] as const) {
      await reactToLeftOut(db, teamId, m.id, build)
        .catch((e) => logger.warn({ module: M }, `reakce hráčů mimo zápas, tým ${teamId}`, e));
    }
  }

  // ── Zkušenost a zlepšení za odehrané minuty (turnaj se počítá jako pohár)
  try {
    const expRng = createRng(m.id.charCodeAt(1) * 7919 + result.homeScore);
    const { tryMatchGrowth, parseSkillCaps, loadYouthMod, sjednoceneDovednosti, zapisDovednost } = await import("../season/match-growth");
    const youthMod = new Map<string, number>([[homeId, await loadYouthMod(db, homeId)], [awayId, await loadYouthMod(db, awayId)]]);
    for (const [engineId, pm] of Object.entries(result.playerMinutes)) {
      const dbId = fullIdMap.get(Number(engineId));
      if (!dbId) continue;
      const teamId = homeBuild.idMap.has(Number(engineId)) ? homeId : awayId;
      const minutes = ((pm as { left?: number; entered: number }).left ?? 90) - (pm as { entered: number }).entered;
      if (minutes < 15) continue;
      const row = await db.prepare("SELECT age, skills, physical, position, hidden_talent, skills_max FROM players WHERE id = ?")
        .bind(dbId).first<{ age: number; skills: string; physical: string | null; position: string; hidden_talent: number | null; skills_max: string | null }>()
        .catch((e) => { logger.warn({ module: M }, "hráč pro zkušenost", e); return null; });
      if (!row) continue;
      const { skills, physical } = sjednoceneDovednosti(row.skills, row.physical);
      let changed = false;
      const exp = typeof skills.experience === "number" ? skills.experience : 0;
      if (exp < 100 && expRng.random() < experienceGainChance(minutes, "cup", row.age)) {
        skills.experience = exp + 1;
        changed = true;
      }
      const growth = tryMatchGrowth(expRng, skills, {
        age: row.age, position: row.position, minutes,
        hiddenTalent: row.hidden_talent ?? 0, skillCaps: parseSkillCaps(row.skills_max),
        youthMod: youthMod.get(teamId) ?? 0,
      });
      if (growth) {
        zapisDovednost(skills, physical, growth.attribute, growth.newValue);
        changed = true;
        await db.prepare(
          "INSERT INTO training_log (player_id, team_id, attribute, old_value, new_value, change, training_type, game_date) VALUES (?, ?, ?, ?, ?, 1, 'cup', ?)"
        ).bind(dbId, teamId, growth.attribute, growth.oldValue, growth.newValue, new Date().toISOString())
          .run().catch((e) => logger.warn({ module: M }, "záznam zlepšení", e));
      }
      if (changed) {
        await db.prepare("UPDATE players SET skills = ?, physical = ? WHERE id = ?")
          .bind(JSON.stringify(skills), JSON.stringify(physical), dbId).run()
          .catch((e) => logger.warn({ module: M }, "uložení dovedností", e));
      }
    }
  } catch (e) {
    logger.warn({ module: M }, `zkušenost a zlepšení po zápase ${m.id}`, e);
  }

  // ── Penalty v play-off
  let homePens: number | null = null;
  let awayPens: number | null = null;
  if (m.stage !== "league" && result.homeScore === result.awayScore) {
    const strength = (lineup: Array<Record<string, any>>) =>
      lineup.reduce((s, p) => s + ((p.shooting ?? 50) + (p.technique ?? 50)) / 2, 0) / Math.max(1, lineup.length);
    const so = cupShootout(rng, strength(homePre), strength(awayPre));
    homePens = so.hp;
    awayPens = so.ap;
  }

  // ── Detail zápasu: průběh, sestavy, hodnocení, sudí, dějiště
  try {
    const names = await db.prepare("SELECT id, name FROM teams WHERE id IN (?, ?)").bind(homeId, awayId).all<{ id: string; name: string }>();
    const nameOf = new Map(names.results.map((n) => [n.id, n.name]));
    const { generateMatchCommentary } = await import("../engine/commentary");
    const commentary = generateMatchCommentary(rng, result.events, nameOf.get(homeId) ?? "Domácí", nameOf.get(awayId) ?? "Hosté", t.city);
    const absences = [
      ...((homeBuild.absentNames ?? []) as Array<Record<string, unknown>>).map((a) => ({ ...a, teamId: homeId })),
      ...((awayBuild.absentNames ?? []) as Array<Record<string, unknown>>).map((a) => ({ ...a, teamId: awayId })),
    ];
    const incidents = mapIncidentsToDb(result.refereeIncidents, homeId, awayId);
    await db.prepare(
      `UPDATE tournament_matches SET events = ?, commentary = ?, attendance = ?, stadium_name = ?, pitch_condition = ?, weather = ?,
         home_lineup_data = ?, away_lineup_data = ?, absences = ?, player_ratings = ?,
         referee_id = ?, referee_snapshot = ?, referee_incidents = ?, referee_grade = ?,
         simulated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE id = ?`
    ).bind(
      JSON.stringify(result.events), JSON.stringify(commentary), attendance, stadiumName, pitchCondition, weather,
      JSON.stringify(buildCupLineupData(homePre, homeSubs, homeBuild.idMap, homeFormation, homeTactic, homeHardness)),
      JSON.stringify(buildCupLineupData(awayPre, awaySubs, awayBuild.idMap, awayFormation, awayTactic, awayHardness)),
      absences.length > 0 ? JSON.stringify(absences) : null, JSON.stringify(ratings),
      referee.profile.id, JSON.stringify(referee.snapshot),
      incidents.length > 0 ? JSON.stringify(incidents) : null, result.refereeGrade,
      m.id,
    ).run();

    if (referee.profile.id) {
      const count = (type: string, team: number, detail?: string) => result.events.filter(
        (e) => e.type === type && e.teamId === team && (detail === undefined || e.detail === detail),
      ).length;
      const season = await db.prepare("SELECT MAX(number) AS n FROM seasons WHERE status = 'active'").first<{ n: number | null }>()
        .catch((e) => { logger.warn({ module: M }, "sezóna pro bilanci sudího", e); return null; });
      await db.batch(refereeStatsStatements(db, {
        refereeId: referee.profile.id, seasonNumber: season?.n ?? 0, leagueId: null,
        homeTeamId: homeId, awayTeamId: awayId, homeScore: result.homeScore, awayScore: result.awayScore,
        grade: result.refereeGrade,
        fouls: result.events.filter((e) => e.type === "foul").length,
        homeYellow: count("card", 1, "yellow"), awayYellow: count("card", 2, "yellow"),
        homeRed: count("card", 1, "red"), awayRed: count("card", 2, "red"),
        homePenalties: count("penalty", 1), awayPenalties: count("penalty", 2),
        incidents,
      })).catch((e) => logger.warn({ module: M }, "bilance rozhodčího", e));
    }

    // Zranění z turnaje platí i v lize.
    const injuryStmts: D1PreparedStatement[] = [];
    for (const event of result.events) {
      if (event.type !== "injury") continue;
      const isHome = event.teamId === 1;
      const playerId = (isHome ? homeBuild.idMap : awayBuild.idMap).get(event.playerId);
      if (!playerId) continue;
      const days = Math.max(2, 3 + Math.floor(rng.random() * 18));
      injuryStmts.push(db.prepare(
        "INSERT INTO injuries (id, player_id, team_id, type, description, severity, days_remaining, days_total, match_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), playerId, isHome ? homeId : awayId, typZraneniZPopisu(event.detail), event.detail ?? "zranění", zavaznostZeDnu(days), days, days, m.id));
    }
    if (injuryStmts.length > 0) await db.batch(injuryStmts);
  } catch (e) {
    logger.error({ module: M }, `detail zápasu ${m.id}`, e);
  }

  const homeWins = result.homeScore > result.awayScore || (homePens != null && awayPens != null && homePens > awayPens);
  const awayWins = result.awayScore > result.homeScore || (homePens != null && awayPens != null && awayPens > homePens);
  return {
    homeScore: result.homeScore,
    awayScore: result.awayScore,
    homePens, awayPens,
    winnerTeamId: homeWins ? homeId : awayWins ? awayId : null,
  };
}
