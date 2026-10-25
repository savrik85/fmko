/**
 * AI trenér před zápasem áčka (liga, pohár, přátelák).
 *
 * V den zápasu, kdy jsou známé omluvenky, AI trenér zvolí formaci, taktiku, tvrdost,
 * koho šetřit, komu dát šanci, kapitána, exekutory a pokyny na lavičce. Volí model
 * (nebo náhradní pravidlo podle povahy), sestavu skládá kód a ukládá ji stejnou
 * službou jako člověk (`saveLineup`). Zápas na nic nečeká: když se nic neuloží,
 * match-runner postaví sestavu jako dřív.
 */

import type { Bindings } from "../index";
import { mapRowToMatchPlayer } from "../engine/lineup-loader";
import { logger } from "../lib/logger";
import { saveLineup, setTeamRoles } from "../services/lineup";
import { logDecision, type DecisionMode } from "./decision-log";
import { callCoachModel, COACH_MODEL } from "./llm";
import {
  assembleLineup, fallbackMatchDecision, formationOptions, matchDecisionSchema, MATCH_SYSTEM_PROMPT, renderMatchPrompt,
  slotRatings, validateMatchDecision,
  type AssembledLineup, type FixtureKind, type MatchContext, type MatchDecision, type Slot, type SquadPlayer, type UnavailablePlayer,
} from "./match-decision";
import { readCoachMode } from "./mode";
import { ensureAiProfile } from "./profile";

const M = "ai-coach-match";

export interface CoachFixture {
  /** Klíč sestavy: season_calendar.id (liga), cup_matches.id (pohár), matches.id (přátelák). */
  calendarId: string;
  kind: FixtureKind;
}

export interface PrepareLineupResult {
  used: "model" | "fallback";
  lineupId: string | null;
}

export interface PrepareLineupOptions {
  /** Jen rozhodnout a zapsat do deníku, nic neuložit (admin „nanečisto"). */
  dryRun?: boolean;
  /** Jiný model (srovnání). */
  model?: string;
}

interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  position: string;
  age: number;
  overall_rating: number;
  skills: string;
  personality: string;
  life_context: string;
  physical: string | null;
  suspended_matches: number | null;
}

function parseObj(raw: string | null | undefined, what: string, id: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v as Record<string, unknown> : {};
  } catch (e) {
    logger.warn({ module: M, playerId: id }, `nečitelné ${what}`, e);
    return {};
  }
}

function isSlot(v: unknown): v is Slot {
  return v === "GK" || v === "DEF" || v === "MID" || v === "FWD";
}

function cupRoundLabel(round: number, total: number): string {
  if (round === 1) return "first qualifying round";
  if (round === 2) return "second qualifying round";
  const fromEnd = total - round;
  if (fromEnd === 0) return "FINAL";
  if (fromEnd === 1) return "semi-final";
  if (fromEnd === 2) return "quarter-final";
  if (fromEnd === 3) return "round of 16";
  return `round ${round - 2}`;
}

async function recentForm(db: D1Database, teamId: string): Promise<string> {
  const rows = await db.prepare(
    `SELECT home_team_id, home_score, away_score FROM matches
      WHERE (home_team_id = ? OR away_team_id = ?) AND home_score IS NOT NULL AND away_score IS NOT NULL
      ORDER BY COALESCE(simulated_at, created_at) DESC LIMIT 5`,
  ).bind(teamId, teamId).all<{ home_team_id: string; home_score: number; away_score: number }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "forma týmu", e); return { results: [] as Array<{ home_team_id: string; home_score: number; away_score: number }> }; });
  return rows.results.map((m) => {
    const gf = m.home_team_id === teamId ? m.home_score : m.away_score;
    const ga = m.home_team_id === teamId ? m.away_score : m.home_score;
    return gf > ga ? "W" : gf < ga ? "L" : "D";
  }).join("");
}

async function topElevenStrength(db: D1Database, teamId: string): Promise<number | null> {
  const row = await db.prepare(
    `SELECT AVG(overall_rating) AS s FROM (
       SELECT overall_rating FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')
       ORDER BY overall_rating DESC LIMIT 11)`,
  ).bind(teamId).first<{ s: number | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "síla soupeře", e); return null; });
  return row?.s ?? null;
}

interface FixtureInfo {
  isHome: boolean;
  opponentTeamId: string | null;
  opponentName: string;
  opponentStrength: number | null;
  bigClub: boolean;
  label: string;
  scheduledAt: string | null;
  matchId: string | null;
  stake: number;
  homeTeamId: string | null;
}

async function loadFixtureInfo(db: D1Database, teamId: string, fixture: CoachFixture): Promise<FixtureInfo | null> {
  if (fixture.kind === "league") {
    const m = await db.prepare(
      `SELECT m.id, m.home_team_id, m.away_team_id, sc.scheduled_at, sc.game_week,
              th.name AS home_name, ta.name AS away_name
         FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
         JOIN teams th ON th.id = m.home_team_id JOIN teams ta ON ta.id = m.away_team_id
        WHERE m.calendar_id = ? AND (m.home_team_id = ? OR m.away_team_id = ?) LIMIT 1`,
    ).bind(fixture.calendarId, teamId, teamId).first<{ id: string; home_team_id: string; away_team_id: string; scheduled_at: string; game_week: number; home_name: string; away_name: string }>()
      .catch((e) => { logger.warn({ module: M, teamId }, "ligový zápas", e); return null; });
    if (!m) return null;
    const isHome = m.home_team_id === teamId;
    return {
      isHome, opponentTeamId: isHome ? m.away_team_id : m.home_team_id, opponentName: isHome ? m.away_name : m.home_name,
      opponentStrength: null, bigClub: false, label: `round ${m.game_week}`, scheduledAt: m.scheduled_at, matchId: m.id, stake: 0,
      homeTeamId: m.home_team_id,
    };
  }
  if (fixture.kind === "cup") {
    const m = await db.prepare(
      `SELECT cm.id, cm.round, cm.scheduled_at, cc.total_rounds, cm.home_cup_team_id,
              my.id AS my_id, ht.team_id AS home_team_id, ht.name AS home_name, ht.strength AS home_strength, ht.is_big_club AS home_big,
              at.team_id AS away_team_id, at.name AS away_name, at.strength AS away_strength, at.is_big_club AS away_big
         FROM cup_matches cm
         JOIN cup_competitions cc ON cc.id = cm.cup_id
         JOIN cup_teams my ON my.cup_id = cm.cup_id AND my.team_id = ? AND my.id IN (cm.home_cup_team_id, cm.away_cup_team_id)
         JOIN cup_teams ht ON ht.id = cm.home_cup_team_id
         JOIN cup_teams at ON at.id = cm.away_cup_team_id
        WHERE cm.id = ?`,
    ).bind(teamId, fixture.calendarId).first<Record<string, unknown>>()
      .catch((e) => { logger.warn({ module: M, teamId }, "pohárový zápas", e); return null; });
    if (!m) return null;
    const isHome = m.home_cup_team_id === m.my_id;
    const oppReal = (isHome ? m.away_team_id : m.home_team_id) as string | null;
    return {
      isHome,
      opponentTeamId: oppReal,
      opponentName: (isHome ? m.away_name : m.home_name) as string,
      opponentStrength: oppReal ? null : Number(isHome ? m.away_strength : m.home_strength) || null,
      bigClub: Number(isHome ? m.away_big : m.home_big) === 1,
      label: cupRoundLabel(Number(m.round), Number(m.total_rounds)),
      scheduledAt: (m.scheduled_at as string | null) ?? null,
      matchId: null,
      stake: 0,
      homeTeamId: (m.home_team_id as string | null) ?? null,
    };
  }
  const m = await db.prepare(
    `SELECT m.id, m.home_team_id, m.away_team_id, m.created_at, th.name AS home_name, ta.name AS away_name,
            c.stake, c.venue
       FROM matches m JOIN teams th ON th.id = m.home_team_id JOIN teams ta ON ta.id = m.away_team_id
       LEFT JOIN challenges c ON c.match_id = m.id
      WHERE m.id = ? AND m.calendar_id IS NULL AND (m.home_team_id = ? OR m.away_team_id = ?)`,
  ).bind(fixture.calendarId, teamId, teamId).first<{ id: string; home_team_id: string; away_team_id: string; created_at: string; home_name: string; away_name: string; stake: number | null; venue: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "přátelák", e); return null; });
  if (!m) return null;
  const isHome = m.home_team_id === teamId;
  return {
    isHome, opponentTeamId: isHome ? m.away_team_id : m.home_team_id, opponentName: isHome ? m.away_name : m.home_name,
    opponentStrength: null, bigClub: false, label: "friendly", scheduledAt: m.created_at, matchId: m.id, stake: m.stake ?? 0,
    homeTeamId: m.venue === "neutral" ? null : m.home_team_id,
  };
}

/**
 * Kdo je dnes k dispozici: stejný výpočet jako v zápase (`buildMatchPlayers` se stejným
 * klíčem zápasu, takže omluvenky, zranění i stopky sedí s tím, co se pak odehraje).
 */
async function loadAvailability(db: D1Database, teamId: string, fixture: CoachFixture): Promise<Set<string>> {
  const { buildMatchPlayers } = await import("../multiplayer/match-runner");
  const build = await buildMatchPlayers(db, teamId, null, 0, {
    matchKey: fixture.calendarId,
    friendlyMultiplier: fixture.kind === "friendly" ? 1.8 : undefined,
  });
  return new Set([...build.matchSquadIds, ...build.leftOutIds]);
}

async function daysToNextCompetitive(db: D1Database, teamId: string, leagueId: string | null, fromIso: string | null): Promise<number | null> {
  if (!fromIso) return null;
  const from = fromIso.slice(0, 10);
  const league = leagueId
    ? await db.prepare(
      `SELECT MIN(substr(sc.scheduled_at, 1, 10)) AS d FROM season_calendar sc JOIN matches m ON m.calendar_id = sc.id
        WHERE sc.league_id = ? AND sc.status = 'scheduled' AND substr(sc.scheduled_at, 1, 10) > ?
          AND (m.home_team_id = ? OR m.away_team_id = ?)`,
    ).bind(leagueId, from, teamId, teamId).first<{ d: string | null }>()
      .catch((e) => { logger.warn({ module: M, teamId }, "další ligový zápas", e); return null; })
    : null;
  const cup = await db.prepare(
    `SELECT MIN(substr(cm.scheduled_at, 1, 10)) AS d FROM cup_matches cm
       JOIN cup_teams my ON my.cup_id = cm.cup_id AND my.team_id = ? AND my.id IN (cm.home_cup_team_id, cm.away_cup_team_id)
      WHERE cm.status = 'scheduled' AND substr(cm.scheduled_at, 1, 10) > ?`,
  ).bind(teamId, from).first<{ d: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "další pohárový zápas", e); return null; });
  const dates = [league?.d, cup?.d].filter((d): d is string => !!d).sort();
  if (dates.length === 0) return null;
  const days = Math.round((new Date(`${dates[0]}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000);
  return days <= 7 ? days : null;
}

/** Načte všechno, co trenér před zápasem ví. Null = zápas nebo tým nejde najít. */
export async function loadMatchContext(db: D1Database, teamId: string, fixture: CoachFixture): Promise<MatchContext | null> {
  const team = await db.prepare(
    `SELECT t.id, t.name, t.league_id, t.village_id, t.penalty_taker_id, t.freekick_taker_id, t.formation_familiarity
       FROM teams t WHERE t.id = ?`,
  ).bind(teamId).first<{ id: string; name: string; league_id: string | null; village_id: string | null; penalty_taker_id: string | null; freekick_taker_id: string | null; formation_familiarity: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "tým", e); return null; });
  if (!team) return null;
  const info = await loadFixtureInfo(db, teamId, fixture);
  if (!info) return null;

  const profile = await ensureAiProfile(db, teamId);
  const available = await loadAvailability(db, teamId, fixture);

  const rows = await db.prepare(
    `SELECT id, first_name, last_name, nickname, position, age, overall_rating, skills, personality, life_context, physical, suspended_matches
       FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') ORDER BY overall_rating DESC`,
  ).bind(teamId).all<PlayerRow>()
    .catch((e) => { logger.warn({ module: M, teamId }, "kádr", e); return { results: [] as PlayerRow[] }; });
  const injuries = await db.prepare(
    "SELECT player_id FROM injuries WHERE days_remaining > 0 AND player_id IN (SELECT id FROM players WHERE team_id = ?)",
  ).bind(teamId).all<{ player_id: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "zranění", e); return { results: [] as Array<{ player_id: string }> }; });
  const injured = new Set(injuries.results.map((r) => r.player_id));
  const stats = await db.prepare(
    `SELECT player_id, appearances, yellow_cards, avg_rating FROM player_stats
      WHERE team_id = ? AND season_id = (SELECT id FROM seasons WHERE status = 'active' LIMIT 1)`,
  ).bind(teamId).all<{ player_id: string; appearances: number; yellow_cards: number; avg_rating: number }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "statistiky hráčů", e); return { results: [] as Array<{ player_id: string; appearances: number; yellow_cards: number; avg_rating: number }> }; });
  const statOf = new Map(stats.results.map((s) => [s.player_id, s]));
  // Forma: průměr posledních pěti známek (i z minulé sezóny, na začátku ročníku jinak nic není).
  const recent = await db.prepare(
    `SELECT player_id, AVG(rating) AS r, COUNT(*) AS n FROM (
       SELECT player_id, rating, ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY created_at DESC) AS rn
         FROM match_player_stats WHERE team_id = ? AND minutes_played >= 20)
      WHERE rn <= 5 GROUP BY player_id`,
  ).bind(teamId).all<{ player_id: string; r: number; n: number }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "forma hráčů", e); return { results: [] as Array<{ player_id: string; r: number; n: number }> }; });
  const formOf = new Map(recent.results.map((r) => [r.player_id, r.r]));

  const squad: SquadPlayer[] = [];
  const unavailable: UnavailablePlayer[] = [];
  let n = 0;
  for (const row of rows.results) {
    if (!isSlot(row.position)) continue;
    n++;
    const key = `P${n}`;
    const name = `${row.first_name} ${row.last_name}`;
    if (!available.has(row.id)) {
      unavailable.push({
        key, id: row.id, name, position: row.position,
        reason: injured.has(row.id) ? "injured" : (row.suspended_matches ?? 0) > 0 ? "suspended" : "excused",
      });
      continue;
    }
    let engine;
    try {
      engine = mapRowToMatchPlayer({ ...row, nickname: row.nickname ?? null });
    } catch (e) {
      logger.warn({ module: M, playerId: row.id }, "hráče nejde převést pro engine", e);
      continue;
    }
    const life = parseObj(row.life_context, "life_context", row.id);
    const st = statOf.get(row.id);
    const yellow = st?.yellow_cards ?? 0;
    squad.push({
      key, id: row.id, name, position: row.position, age: row.age, rating: row.overall_rating,
      condition: Math.round(typeof life.condition === "number" ? life.condition : 100),
      morale: Math.round(typeof life.morale === "number" ? life.morale : 50),
      form: formOf.has(row.id) ? Math.round((formOf.get(row.id) ?? 0) * 10) / 10 : null,
      appearances: st?.appearances ?? 0,
      leadership: engine.leadership, aggression: engine.aggression, setPieces: engine.setPieces, shooting: engine.shooting,
      oneYellowFromBan: yellow % 4 === 3,
      slotRating: slotRatings(engine),
      engine,
    });
  }

  // Tabulka a forma
  let own = { position: null as number | null, teams: null as number | null, points: null as number | null };
  let oppPosition: number | null = null;
  if (team.league_id) {
    const { calculateStandings } = await import("../stats/standings");
    const table = await calculateStandings(db, team.league_id)
      .catch((e) => { logger.warn({ module: M, teamId }, "tabulka", e); return []; });
    const played = table.some((t) => t.played > 0);
    if (played) {
      const me = table.find((t) => t.teamId === teamId);
      if (me) own = { position: me.pos, teams: table.length, points: me.points };
      if (info.opponentTeamId) oppPosition = table.find((t) => t.teamId === info.opponentTeamId)?.pos ?? null;
    }
  }
  const ownForm = await recentForm(db, teamId);
  const oppForm = info.opponentTeamId ? await recentForm(db, info.opponentTeamId) : "";
  const oppStrength = info.opponentStrength ?? (info.opponentTeamId ? await topElevenStrength(db, info.opponentTeamId) : null);

  // Sudí: u ligy delegovaný dva dny předem (čte se bez dodatečné delegace), u poháru z komise domácích.
  let refereeStrictness: number | null = null;
  if (fixture.kind === "league" && info.matchId) {
    const { loadRefereeForMatch } = await import("../referees/load");
    const ref = await loadRefereeForMatch(db, info.matchId).catch((e) => { logger.warn({ module: M, teamId }, "sudí", e); return null; });
    if (ref?.profile.id) refereeStrictness = Math.round(ref.profile.strictness);
  } else if (fixture.kind === "cup") {
    const { loadCupReferee } = await import("../referees/load");
    const ref = await loadCupReferee(db, fixture.calendarId, info.homeTeamId).catch((e) => { logger.warn({ module: M, teamId }, "pohárový sudí", e); return null; });
    if (ref?.profile.id) refereeStrictness = Math.round(ref.profile.strictness);
  }

  const { resolveWeatherForMatchKey } = await import("../season/season-weather");
  const weather = (await resolveWeatherForMatchKey(db, fixture.calendarId).catch((e) => { logger.warn({ module: M, teamId }, "počasí", e); return null; }))?.weather ?? null;
  const pitch = info.homeTeamId
    ? await db.prepare("SELECT pitch_condition FROM stadiums WHERE team_id = ?").bind(info.homeTeamId).first<{ pitch_condition: number }>()
      .catch((e) => { logger.warn({ module: M, teamId }, "stav hřiště", e); return null; })
    : null;

  const derby = info.opponentTeamId && team.village_id
    ? await db.prepare("SELECT 1 AS d FROM teams WHERE id = ? AND village_id = ?").bind(info.opponentTeamId, team.village_id).first<{ d: number }>()
      .catch((e) => { logger.warn({ module: M, teamId }, "derby", e); return null; })
    : null;

  const familiarity: Record<string, number> = {};
  const famRaw = parseObj(team.formation_familiarity, "formation_familiarity", teamId);
  for (const [k, v] of Object.entries(famRaw)) if (typeof v === "number") familiarity[k] = v;

  const last = await db.prepare(
    "SELECT formation, tactic FROM lineups WHERE team_id = ? AND is_auto = 0 ORDER BY submitted_at DESC LIMIT 1",
  ).bind(teamId).first<{ formation: string; tactic: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "poslední sestava", e); return null; });

  const ctx: MatchContext = {
    teamId,
    teamName: team.name,
    fixture: {
      kind: fixture.kind, calendarId: fixture.calendarId, isHome: info.isHome, opponentName: info.opponentName,
      label: info.label, isDerby: !!derby, stake: info.stake,
    },
    own: { ...own, form: ownForm, strength: 0 },
    opponent: { position: oppPosition, form: oppForm, strength: oppStrength === null ? null : Math.round(oppStrength * 10) / 10, bigClub: info.bigClub },
    refereeStrictness,
    weather,
    pitchCondition: pitch?.pitch_condition ?? null,
    daysToNextMatch: await daysToNextCompetitive(db, teamId, team.league_id, info.scheduledAt),
    familiarity,
    profile,
    squad,
    unavailable,
    currentRoles: { penaltyTakerId: team.penalty_taker_id, freekickTakerId: team.freekick_taker_id },
    lastLineup: last ?? null,
  };
  // Síla vlastního týmu na stejné škále jako soupeř: průměr hodnocení nejlepších jedenácti dostupných.
  const top = [...squad].sort((a, b) => b.rating - a.rating).slice(0, 11);
  ctx.own.strength = top.length ? Math.round((top.reduce((s, p) => s + p.rating, 0) / top.length) * 10) / 10 : 0;
  return ctx;
}

/** Krátký popis rozhodnutí do deníku a pro admina. */
function summarizeLineup(ctx: MatchContext, l: AssembledLineup): Record<string, unknown> {
  const nameOf = new Map(ctx.squad.map((p) => [p.id, `${p.key} ${p.name}`]));
  return {
    formation: l.formation, tactic: l.tactic, hardness: l.hardness,
    xi: l.players.map((p) => `${p.matchPosition} ${nameOf.get(p.playerId) ?? p.playerId}`),
    bench: l.bench.map((id) => nameOf.get(id) ?? id),
    captain: l.captainId ? nameOf.get(l.captainId) ?? l.captainId : null,
    plan: l.matchPlan.length,
    notes: l.notes,
  };
}

/** Rozhodne (model nebo náhradní pravidlo) bez ukládání. Pro admina a srovnání modelů. */
export async function decideMatch(env: Pick<Bindings, "AI">, ctx: MatchContext, opts: { useModel: boolean; model?: string; reasoningEffort?: "low" | "medium" | "high"; timeoutMs?: number }): Promise<{
  decision: MatchDecision;
  used: "model" | "fallback";
  raw: string | null;
  model: string | null;
  error: string | null;
  rejected: string[];
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
}> {
  if (!opts.useModel) {
    return { decision: fallbackMatchDecision(ctx), used: "fallback", raw: null, model: null, error: null, rejected: [], tokensIn: null, tokensOut: null, latencyMs: null };
  }
  const res = await callCoachModel(env, {
    system: MATCH_SYSTEM_PROMPT,
    user: renderMatchPrompt(ctx),
    maxTokens: 1200,
    schema: { name: "match_decision", schema: matchDecisionSchema(ctx) },
    model: opts.model,
    reasoningEffort: opts.reasoningEffort,
    timeoutMs: opts.timeoutMs,
  });
  const base = { raw: res.raw, model: res.model, tokensIn: res.tokensIn ?? null, tokensOut: res.tokensOut ?? null, latencyMs: res.latencyMs };
  if (!res.json) {
    return { ...base, decision: fallbackMatchDecision(ctx), used: "fallback", error: res.error ?? "bez odpovědi", rejected: [] };
  }
  const check = validateMatchDecision(res.json, ctx);
  if (!check.ok) {
    return { ...base, decision: fallbackMatchDecision(ctx), used: "fallback", error: check.reason, rejected: [] };
  }
  return { ...base, decision: check.decision, used: "model", error: null, rejected: check.rejected };
}

/** Doplní sestavu do jedenácti omluvenými (zápas je nahradí), když dostupných není dost. */
function fillWithExcused(ctx: MatchContext, lineup: AssembledLineup): AssembledLineup {
  if (lineup.players.length >= 11) return lineup;
  const used = new Set(lineup.players.map((p) => p.playerId));
  const counts: Record<Slot, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of lineup.players) counts[p.matchPosition]++;
  const players = [...lineup.players];
  for (const u of ctx.unavailable) {
    if (players.length >= 11) break;
    if (u.reason !== "excused" || used.has(u.id)) continue;
    const slot: Slot = counts.GK === 0 && u.position === "GK" ? "GK" : u.position === "GK" ? "DEF" : u.position;
    players.push({ playerId: u.id, matchPosition: slot });
    counts[slot]++;
    used.add(u.id);
  }
  return { ...lineup, players, bench: lineup.bench.filter((id) => !used.has(id)), notes: [...lineup.notes, "doplněno omluvenými hráči"] };
}

/**
 * Připraví sestavu AI klubu na zápas. Vrací, kdo rozhodl, a id uložené sestavy
 * (null = nic se neuložilo: režim shadow, nanečisto, nebo se sestava nedala postavit).
 */
export async function prepareAiLineup(
  env: Bindings,
  teamId: string,
  fixture: CoachFixture,
  opts: PrepareLineupOptions = {},
): Promise<PrepareLineupResult> {
  const db = env.DB;
  const mode = await readCoachMode(env.CACHE_KV, "match");
  const ctx = await loadMatchContext(db, teamId, fixture);
  if (!ctx) {
    logger.warn({ module: M, teamId }, `zápas ${fixture.kind} ${fixture.calendarId} se nenašel, sestava se nepřipraví`);
    return { used: "fallback", lineupId: null };
  }

  const decided = await decideMatch(env, ctx, { useModel: mode !== "off", model: opts.model });
  const squadIds = new Set([...ctx.squad.map((p) => p.id), ...ctx.unavailable.map((p) => p.id)]);
  let lineup = fillWithExcused(ctx, assembleLineup(ctx, decided.decision, squadIds));
  let error = decided.error;
  let used = decided.used;
  let replacedBy: MatchDecision | null = null;

  const execute = mode !== "shadow" && !opts.dryRun;
  let lineupId: string | null = null;
  let executed: Record<string, unknown> | null = null;
  if (lineup.players.length < 11) {
    error = [error, `málo hráčů k dispozici (${lineup.players.length})`].filter(Boolean).join("; ");
  } else if (execute) {
    let saved = await saveLineup(db, teamId, {
      calendarId: fixture.calendarId,
      formation: lineup.formation,
      tactic: lineup.tactic,
      hardness: lineup.hardness,
      captainId: lineup.captainId,
      matchPlan: lineup.matchPlan,
      bench: lineup.bench.length > 0 ? lineup.bench : null,
      players: lineup.players,
    });
    if (!saved.ok && decided.used === "model") {
      // Rozhodnutí modelu neprošlo kontrolou služby: zkusit náhradní pravidlo.
      error = `uložení podle modelu odmítnuto: ${saved.error}`;
      used = "fallback";
      replacedBy = fallbackMatchDecision(ctx);
      lineup = fillWithExcused(ctx, assembleLineup(ctx, replacedBy, squadIds));
      saved = await saveLineup(db, teamId, {
        calendarId: fixture.calendarId, formation: lineup.formation, tactic: lineup.tactic, hardness: lineup.hardness,
        captainId: lineup.captainId, matchPlan: lineup.matchPlan, bench: lineup.bench.length > 0 ? lineup.bench : null, players: lineup.players,
      });
    }
    if (saved.ok) {
      lineupId = saved.lineupId;
      const roles = await setTeamRoles(db, teamId, {
        penaltyTakerId: lineup.penaltyTakerId ?? undefined,
        freekickTakerId: lineup.freekickTakerId ?? undefined,
      });
      if (!roles.ok) logger.warn({ module: M, teamId }, `role exekutorů se neuložily: ${roles.error}`);
      executed = summarizeLineup(ctx, lineup);
    } else {
      error = [error, `sestava se neuložila: ${saved.error}`].filter(Boolean).join("; ");
      logger.warn({ module: M, teamId }, `sestava AI klubu na ${fixture.calendarId} se neuložila: ${saved.error}`);
    }
  }

  const logMode: DecisionMode = opts.dryRun ? "shadow" : mode;
  await logDecision(db, {
    teamId,
    kind: "match",
    mode: logMode,
    model: decided.model ?? (mode === "off" ? null : COACH_MODEL),
    contextRef: `${fixture.kind}:${fixture.calendarId}`,
    inputSummary: renderMatchPrompt(ctx),
    rawOutput: decided.raw,
    actions: {
      decision: decided.decision, rejected: decided.rejected, ...(replacedBy ? { replacedBy } : {}),
      planned: summarizeLineup(ctx, lineup), formations: formationOptions(ctx),
    },
    executed,
    usedFallback: used === "fallback",
    error,
    tokensIn: decided.tokensIn,
    tokensOut: decided.tokensOut,
    latencyMs: decided.latencyMs,
  });

  return { used, lineupId };
}

/**
 * Zápasy áčka, které se hrají dnes (herní den) a ještě neproběhly: ligové kolo,
 * které dnes pustí zápasový tick, pohárový zápas s dnešním (nebo prošlým) termínem
 * a domluvený přátelák na dnešek.
 */
export async function findTodaysFixtures(db: D1Database, teamId: string, gameDay: string): Promise<CoachFixture[]> {
  const out: CoachFixture[] = [];
  const team = await db.prepare("SELECT league_id FROM teams WHERE id = ?").bind(teamId).first<{ league_id: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "liga týmu", e); return null; });
  if (team?.league_id) {
    // Stejný výběr kola jako processLeagueRound: nejstarší neodehrané kolo sezóny s termínem do konce dne.
    const cal = await db.prepare(
      `SELECT id FROM season_calendar WHERE league_id = ? AND scheduled_at <= ? AND status = 'scheduled'
          AND season_number = (SELECT MAX(season_number) FROM season_calendar WHERE league_id = ?)
        ORDER BY scheduled_at ASC LIMIT 1`,
    ).bind(team.league_id, `${gameDay}T23:59:59.999Z`, team.league_id).first<{ id: string }>()
      .catch((e) => { logger.warn({ module: M, teamId }, "dnešní kolo", e); return null; });
    if (cal) {
      const plays = await db.prepare("SELECT 1 AS x FROM matches WHERE calendar_id = ? AND (home_team_id = ? OR away_team_id = ?) AND status = 'scheduled'")
        .bind(cal.id, teamId, teamId).first<{ x: number }>()
        .catch((e) => { logger.warn({ module: M, teamId }, "zápas v kole", e); return null; });
      if (plays) out.push({ calendarId: cal.id, kind: "league" });
    }
  }
  const cups = await db.prepare(
    `SELECT cm.id FROM cup_matches cm
       JOIN cup_teams my ON my.cup_id = cm.cup_id AND my.team_id = ? AND my.id IN (cm.home_cup_team_id, cm.away_cup_team_id)
      WHERE cm.status = 'scheduled' AND cm.scheduled_at IS NOT NULL AND substr(cm.scheduled_at, 1, 10) <= ?`,
  ).bind(teamId, gameDay).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "dnešní pohár", e); return { results: [] as Array<{ id: string }> }; });
  for (const c of cups.results) out.push({ calendarId: c.id, kind: "cup" });
  const friendlies = await db.prepare(
    `SELECT m.id FROM matches m
      WHERE m.calendar_id IS NULL AND m.league_id IS NULL AND m.status IN ('lineups_open', 'scheduled')
        AND (m.home_team_id = ? OR m.away_team_id = ?) AND substr(m.created_at, 1, 10) <= ?
        AND (m.status = 'lineups_open' OR m.id IN (SELECT match_id FROM challenges WHERE match_id IS NOT NULL AND status = 'accepted'))`,
  ).bind(teamId, teamId, gameDay).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "dnešní přátelák", e); return { results: [] as Array<{ id: string }> }; });
  for (const f of friendlies.results) out.push({ calendarId: f.id, kind: "friendly" });
  return out;
}
