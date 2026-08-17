/**
 * Rozhodčí — API.
 *
 * GET přehled okresní komise (žebříček podle průměrné známky) a detail jednoho sudího
 * včetně známek z jednotlivých zápasů a bilance vůči konkrétnímu klubu.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { archetypeLabel } from "../engine/referee";
import { ensureReferees, normalizeDistrict, refereeFullName, type RefereeRow } from "../referees/referee-generator";

export const refereesRouter = new Hono<{ Bindings: Bindings }>();

interface StatsRow {
  referee_id: string;
  matches: number;
  fouls: number;
  yellow_cards: number;
  red_cards: number;
  penalties: number;
  incidents: number;
  grade_sum: number;
}

function baseProfile(r: RefereeRow) {
  return {
    id: r.id,
    name: refereeFullName(r),
    firstName: r.first_name,
    lastName: r.last_name,
    nickname: r.nickname,
    age: r.age,
    occupation: r.occupation,
    archetype: r.archetype,
    archetypeLabel: archetypeLabel(r.archetype, r.gender),
    bio: r.bio,
    hlaska: r.hlaska,
    strictness: r.strictness,
    cardHappiness: r.card_happiness,
    experience: r.experience,
    homeBias: r.home_bias,
    advantage: r.advantage,
    fitness: r.fitness,
    avatar: safeJson(r.avatar),
  };
}

function safeJson(raw: string | null): unknown {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) {
    logger.warn({ module: "referees" }, "nečitelný JSON u rozhodčího", e);
    return null;
  }
}

/** Sezónní statistiky sečtené přes všechny soutěže — sudí píská ligu i pohár. */
async function loadStats(db: D1Database, ids: string[], seasonNumber: number): Promise<Map<string, StatsRow>> {
  if (ids.length === 0) return new Map();
  const ph = ids.map(() => "?").join(",");
  const rows = await db.prepare(
    `SELECT referee_id,
            SUM(matches) AS matches, SUM(fouls) AS fouls,
            SUM(yellow_cards) AS yellow_cards, SUM(red_cards) AS red_cards,
            SUM(penalties) AS penalties, SUM(incidents) AS incidents,
            SUM(grade_sum) AS grade_sum
     FROM referee_stats
     WHERE season_number = ? AND referee_id IN (${ph})
     GROUP BY referee_id`
  ).bind(seasonNumber, ...ids).all<StatsRow>()
    .catch((e) => { logger.warn({ module: "referees" }, "načtení statistik rozhodčích", e); return null; });

  const map = new Map<string, StatsRow>();
  for (const row of rows?.results ?? []) map.set(row.referee_id, row);
  return map;
}

function statsView(s: StatsRow | undefined) {
  const m = s?.matches ?? 0;
  return {
    matches: m,
    // Průměrná známka dává smysl až od jednoho odpískaného zápasu.
    avgGrade: m > 0 ? Math.round(((s!.grade_sum) / m) * 100) / 100 : null,
    foulsPerMatch: m > 0 ? Math.round((s!.fouls / m) * 10) / 10 : null,
    cardsPerMatch: m > 0 ? Math.round(((s!.yellow_cards + s!.red_cards) / m) * 100) / 100 : null,
    yellowCards: s?.yellow_cards ?? 0,
    redCards: s?.red_cards ?? 0,
    penalties: s?.penalties ?? 0,
    incidents: s?.incidents ?? 0,
  };
}

/** Aktuální sezóna. Bez ní by žebříček mísil ročníky. */
async function currentSeason(db: D1Database): Promise<number> {
  const row = await db.prepare(
    "SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"
  ).first<{ number: number }>()
    .catch((e) => { logger.warn({ module: "referees" }, "načtení aktivní sezóny", e); return null; });
  return row?.number ?? 1;
}

/** Přehled komise pro daný okres — společné tělo pro obě cesty (podle ligy i podle týmu). */
async function poolOverview(db: D1Database, rawDistrict: string) {
  const district = normalizeDistrict(rawDistrict);
  const pool = await ensureReferees(db, district);
  const season = await currentSeason(db);
  const stats = await loadStats(db, pool.map((r) => r.id), season);

  const referees = pool.map((r) => ({ ...baseProfile(r), stats: statsView(stats.get(r.id)) }));

  // Žebříček: nejlepší známka nahoře, kdo ještě nepískal, jde na konec.
  referees.sort((a, b) => {
    if (a.stats.avgGrade == null && b.stats.avgGrade == null) return a.name.localeCompare(b.name, "cs");
    if (a.stats.avgGrade == null) return 1;
    if (b.stats.avgGrade == null) return -1;
    if (a.stats.avgGrade !== b.stats.avgGrade) return a.stats.avgGrade - b.stats.avgGrade;
    return b.stats.matches - a.stats.matches;
  });

  return { district, season, referees };
}

refereesRouter.get("/leagues/:leagueId/referees", async (c) => {
  const league = await c.env.DB.prepare("SELECT district FROM leagues WHERE id = ?")
    .bind(c.req.param("leagueId")).first<{ district: string }>()
    .catch((e) => { logger.warn({ module: "referees" }, "načtení ligy", e); return null; });
  if (!league) return c.json({ error: "Liga nenalezena" }, 404);
  return c.json(await poolOverview(c.env.DB, league.district));
});

/** Komise okresu, ve kterém tým hraje. Okres bereme z vesnice, ne z ligy — ta má u U21 sufix. */
refereesRouter.get("/teams/:teamId/referees", async (c) => {
  const team = await c.env.DB.prepare(
    "SELECT v.district AS district FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?"
  ).bind(c.req.param("teamId")).first<{ district: string }>()
    .catch((e) => { logger.warn({ module: "referees" }, "načtení okresu týmu", e); return null; });
  if (!team?.district) return c.json({ error: "Tým nemá okres" }, 404);
  return c.json(await poolOverview(c.env.DB, team.district));
});

// ── Disciplinární komise ──

/**
 * Listina pokut okresu. Vlastní tabulku pokuty nemají — účtují se rovnou do
 * `transactions`, takže se sem sbírají odtamtud:
 *   - `disciplinary_fine` — výroky o rozhodčím v pozápasovém rozhovoru
 *   - záporná `event` transakce se slovem „pokuta" v popisu — svazové pokuty
 *     z mezikolových událostí (pozdní soupiska, neuklizené kabiny…)
 * Typ transakce nemá index, proto pevný LIMIT — listina se stejně čte odshora.
 */
refereesRouter.get("/teams/:teamId/disciplinary", async (c) => {
  const team = await c.env.DB.prepare(
    "SELECT v.district AS district FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?"
  ).bind(c.req.param("teamId")).first<{ district: string }>()
    .catch((e) => { logger.warn({ module: "referees" }, "okres týmu pro disciplinárku", e); return null; });
  if (!team?.district) return c.json({ error: "Tým nemá okres" }, 404);

  const rows = await c.env.DB.prepare(
    `SELECT tr.id, tr.team_id, t.name AS team_name, tr.type, tr.amount, tr.description,
            tr.game_date, tr.created_at
     FROM transactions tr
     JOIN teams t ON t.id = tr.team_id
     JOIN villages v ON v.id = t.village_id
     WHERE v.district = ? AND tr.amount < 0
       AND (tr.type = 'disciplinary_fine' OR tr.description LIKE '%okuta%')
     ORDER BY tr.created_at DESC
     LIMIT 80`
  ).bind(team.district).all<{
    id: string; team_id: string; team_name: string; type: string;
    amount: number; description: string; game_date: string; created_at: string;
  }>().catch((e) => { logger.warn({ module: "referees" }, "načtení pokut", e); return null; });

  const fines = (rows?.results ?? []).map((r) => ({
    id: r.id,
    teamId: r.team_id,
    teamName: r.team_name,
    // Za co: pokuta komise za výroky, nebo administrativní pokuta od svazu.
    kind: r.type === "disciplinary_fine" ? "rozhovor" : "svaz",
    amount: Math.abs(r.amount),
    reason: r.description,
    gameDate: r.game_date,
    createdAt: r.created_at,
  }));

  return c.json({
    district: team.district,
    fines,
    total: fines.reduce((s, f) => s + f.amount, 0),
  });
});

// ── Detail rozhodčího ──
refereesRouter.get("/referees/:refereeId", async (c) => {
  const refereeId = c.req.param("refereeId");
  const teamId = c.req.query("teamId");

  const row = await c.env.DB.prepare("SELECT * FROM referees WHERE id = ?")
    .bind(refereeId).first<RefereeRow>()
    .catch((e) => { logger.warn({ module: "referees" }, "načtení rozhodčího", e); return null; });
  if (!row) return c.json({ error: "Rozhodčí nenalezen" }, 404);

  const season = await currentSeason(c.env.DB);
  const stats = await loadStats(c.env.DB, [refereeId], season);

  // Posledních 12 odpískaných zápasů se známkou — kvůli tomu, aby šlo poznat,
  // kde se sudímu dařilo a kde ne.
  const matches = await c.env.DB.prepare(
    `SELECT m.id, m.home_score, m.away_score, m.referee_grade, m.referee_incidents,
            m.simulated_at, sc.game_week,
            ht.name AS home_name, at.name AS away_name
     FROM matches m
     JOIN teams ht ON ht.id = m.home_team_id
     JOIN teams at ON at.id = m.away_team_id
     LEFT JOIN season_calendar sc ON sc.id = m.calendar_id
     WHERE m.referee_id = ? AND m.status = 'simulated'
     ORDER BY m.simulated_at DESC LIMIT 12`
  ).bind(refereeId).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "referees" }, "načtení zápasů rozhodčího", e); return null; });

  const recentMatches = (matches?.results ?? []).map((m) => ({
    matchId: m.id as string,
    gameWeek: (m.game_week as number | null) ?? null,
    homeName: m.home_name as string,
    awayName: m.away_name as string,
    homeScore: m.home_score as number | null,
    awayScore: m.away_score as number | null,
    grade: (m.referee_grade as number | null) ?? null,
    incidents: (safeJson(m.referee_incidents as string | null) as unknown[] | null) ?? [],
  }));

  let vsTeam = null;
  if (teamId) {
    const rel = await c.env.DB.prepare(
      "SELECT * FROM referee_team_relations WHERE referee_id = ? AND team_id = ?"
    ).bind(refereeId, teamId).first<Record<string, number>>()
      .catch((e) => { logger.warn({ module: "referees" }, "načtení vztahu k týmu", e); return null; });
    if (rel && ((rel.matches as number) > 0 || (rel.sentiment as number) !== 0)) {
      const { refereeBias } = await import("../engine/referee");
      vsTeam = {
        matches: rel.matches, wins: rel.wins, draws: rel.draws, losses: rel.losses,
        yellowCards: rel.yellow_cards, redCards: rel.red_cards,
        penaltiesFor: rel.penalties_for, penaltiesAgainst: rel.penalties_against,
        incidentsFor: rel.incidents_for, incidentsAgainst: rel.incidents_against,
        // Co si o klubu myslí — a o kolik to posune hraniční verdikty.
        sentiment: rel.sentiment ?? 0,
        duvod: (rel.duvod as unknown as string) || null,
        biasPct: Math.round(Math.abs(refereeBias((rel.sentiment as number) ?? 0)) * 1000) / 10,
      };
    }
  }

  return c.json({
    ...baseProfile(row),
    season,
    stats: statsView(stats.get(refereeId)),
    recentMatches,
    vsTeam,
  });
});
