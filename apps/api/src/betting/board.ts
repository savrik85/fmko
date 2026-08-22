/**
 * Generování kurzového lístku.
 *
 * Lístek se vypisuje na NEJBLIŽŠÍ nesehrané kolo soutěže a přepočítává jednou
 * za herní den, dokud je kolo 'scheduled'. Podaný tiket to nemůže ovlivnit —
 * kurz si nese ve vlastní kopii (bet_selections.odds_x100).
 *
 * Proč se kurzy materializují do tabulky, a ne počítají při každém zobrazení:
 *  - zmrazit kurz znamená zmrazit VSTUPY (síla kádru, forma, střelci), a ty se
 *    mění každý herní den — deterministický výpočet ze seedu by nepomohl,
 *    protože náhoda v kurzu vůbec není;
 *  - lístek pro sedm zápasů potřebuje kolem padesáti dotazů; takhle je to
 *    jeden SELECT;
 *  - uložená `probability` odpovídá na „proč mám 1,35" a dá se nad ní testovat.
 */

import { logger } from "../lib/logger";
import {
  expectedGoals, formAdjustment, outcomeProbabilities, totalsProbabilities,
  scorerShares, availability, scorerProbability,
  marketOdds, singleSideOdds,
} from "./odds-model";

const M = "betting-board";

/** Linie, na které se vypisuje trh „kolik padne gólů". */
export const TOTAL_LINES = [2.5, 3.5, 6.5] as const;

/** Kolik střelců se nabízí z každého týmu. */
export const SCORERS_PER_TEAM = 6;

/** Pod tuhle pravděpodobnost se střelec nenabízí — kurz by byl nesmyslně vysoký. */
export const MIN_SCORER_PROB = 0.06;

/** Kolik posledních zápasů se počítá do formy. */
const FORM_MATCHES = 5;

interface RoundRow {
  calendar_id: string;
  league_id: string;
  season_number: number;
  game_week: number;
  scheduled_at: string;
}

interface MatchRow {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_name: string;
  away_name: string;
}

interface PlayerRow {
  id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  position: string;
  overall_rating: number;
  goals: number;
  starts: number;
}

export interface OddsRow {
  leagueId: string;
  seasonNumber: number;
  calendarId: string;
  matchId: string;
  market: "1x2" | "totals" | "scorer";
  selection: string;
  oddsX100: number;
  probability: number;
  label: string;
}

/**
 * Nejbližší nesehrané kolo soutěže.
 *
 * Filtr na nejvyšší season_number je nutný — league_id se napříč sezónami
 * recykluje a bez něj by se vracela stará kola (vzor stats/standings.ts).
 */
export async function nextOpenRound(db: D1Database, leagueId: string): Promise<RoundRow | null> {
  return await db.prepare(
    `SELECT sc.id AS calendar_id, sc.league_id, sc.season_number, sc.game_week, sc.scheduled_at
       FROM season_calendar sc
      WHERE sc.league_id = ? AND sc.status = 'scheduled'
        AND sc.season_number = (SELECT MAX(season_number) FROM season_calendar WHERE league_id = ?)
      ORDER BY sc.scheduled_at ASC LIMIT 1`
  ).bind(leagueId, leagueId).first<RoundRow>()
    .catch((e) => { logger.warn({ module: M }, `nejbližší kolo ligy ${leagueId}`, e); return null; });
}

/** Síla kádru = AVG(overall_rating) aktivních hráčů. Definice je součástí kalibrace modelu. */
async function loadStrengths(db: D1Database, teamIds: string[]): Promise<Map<string, number>> {
  if (teamIds.length === 0) return new Map();
  const ph = teamIds.map(() => "?").join(",");
  const rows = await db.prepare(
    `SELECT team_id, COALESCE(AVG(overall_rating), 30) AS strength
       FROM players
      WHERE team_id IN (${ph}) AND (status IS NULL OR status = 'active')
      GROUP BY team_id`
  ).bind(...teamIds).all<{ team_id: string; strength: number }>()
    .catch((e) => { logger.warn({ module: M }, "síla kádrů", e); return { results: [] }; });

  const out = new Map<string, number>();
  for (const r of rows.results) out.set(r.team_id, r.strength);
  for (const id of teamIds) if (!out.has(id)) out.set(id, 30);
  return out;
}

/**
 * Forma jako průměr bodů na zápas z posledních pěti odehraných kol.
 * Počítá se jen z aktuální sezóny — jinak by se do formy míchaly staré ročníky.
 */
async function loadForm(
  db: D1Database, leagueId: string, seasonNumber: number, teamIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (teamIds.length === 0) return out;

  const rows = await db.prepare(
    `SELECT m.home_team_id, m.away_team_id, m.home_score, m.away_score, sc.game_week
       FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
      WHERE m.league_id = ? AND sc.season_number = ? AND m.status = 'simulated'
        AND m.home_score IS NOT NULL
      ORDER BY sc.game_week DESC`
  ).bind(leagueId, seasonNumber).all<{
    home_team_id: string; away_team_id: string; home_score: number; away_score: number;
  }>().catch((e) => { logger.warn({ module: M }, `forma ligy ${leagueId}`, e); return { results: [] }; });

  const body = new Map<string, number[]>();
  for (const id of teamIds) body.set(id, []);

  for (const m of rows.results) {
    for (const [tid, vlastni, cizi] of [
      [m.home_team_id, m.home_score, m.away_score] as const,
      [m.away_team_id, m.away_score, m.home_score] as const,
    ]) {
      const arr = body.get(tid);
      if (!arr || arr.length >= FORM_MATCHES) continue;
      arr.push(vlastni > cizi ? 3 : vlastni === cizi ? 1 : 0);
    }
  }

  for (const [tid, arr] of body) {
    // Bez odehraných zápasů je forma neutrální, ne nulová — nula znamená
    // „samé prohry" a na začátku sezóny by všem strhla kurz.
    out.set(tid, arr.length === 0 ? 0 : formAdjustment(arr.reduce((a, b) => a + b, 0) / arr.length));
  }
  return out;
}

/** Kandidáti na střelce se sezónními góly a počtem startů. */
async function loadScorers(
  db: D1Database, teamIds: string[], seasonId: string,
): Promise<Map<string, PlayerRow[]>> {
  const out = new Map<string, PlayerRow[]>();
  if (teamIds.length === 0) return out;
  const ph = teamIds.map(() => "?").join(",");

  const rows = await db.prepare(
    `SELECT p.id, p.team_id, p.first_name, p.last_name, p.position, p.overall_rating,
            COALESCE(ps.goals, 0) AS goals, COALESCE(ps.appearances, 0) AS starts
       FROM players p
       LEFT JOIN player_stats ps ON ps.player_id = p.id AND ps.season_id = ?
      WHERE p.team_id IN (${ph})
        AND (p.status IS NULL OR p.status = 'active')
        AND COALESCE(p.suspended_matches, 0) = 0
        AND p.position <> 'GK'`
  ).bind(seasonId, ...teamIds).all<PlayerRow>()
    .catch((e) => { logger.warn({ module: M }, "kandidáti na střelce", e); return { results: [] }; });

  for (const r of rows.results) {
    const arr = out.get(r.team_id) ?? [];
    arr.push(r);
    out.set(r.team_id, arr);
  }
  return out;
}

/** Kolik gólů tým v sezóně nastřílel — vstup pro rozdělení podílů. */
async function loadTeamGoals(
  db: D1Database, teamIds: string[], seasonId: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (teamIds.length === 0) return out;
  const ph = teamIds.map(() => "?").join(",");
  const rows = await db.prepare(
    `SELECT team_id, COALESCE(SUM(goals), 0) AS goals FROM player_stats
      WHERE team_id IN (${ph}) AND season_id = ? GROUP BY team_id`
  ).bind(...teamIds, seasonId).all<{ team_id: string; goals: number }>()
    .catch((e) => { logger.warn({ module: M }, "góly týmů", e); return { results: [] }; });
  for (const r of rows.results) out.set(r.team_id, r.goals);
  return out;
}

/** Kolik zápasů má tým za sebou — jmenovatel pro dostupnost hráče. */
async function loadPlayedCount(
  db: D1Database, leagueId: string, seasonNumber: number,
): Promise<number> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM season_calendar
      WHERE league_id = ? AND season_number = ? AND status = 'simulated'`
  ).bind(leagueId, seasonNumber).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "počet odehraných kol", e); return null; });
  return row?.n ?? 0;
}

/** Kurzy jednoho zápasu. Čistá část výpočtu, jen skládá volání modelu. */
export function matchOdds(input: {
  matchId: string;
  homeName: string;
  awayName: string;
  homeStrength: number;
  awayStrength: number;
  homeForm: number;
  awayForm: number;
  scorers: Array<{ playerId: string; name: string; teamName: string; isHome: boolean;
                   position: string; goals: number; starts: number }>;
  homeTeamGoals: number;
  awayTeamGoals: number;
  playedMatches: number;
}): Array<Omit<OddsRow, "leagueId" | "seasonNumber" | "calendarId">> {
  const lambdas = expectedGoals(
    { strength: input.homeStrength, form: input.homeForm },
    { strength: input.awayStrength, form: input.awayForm },
  );
  const out: Array<Omit<OddsRow, "leagueId" | "seasonNumber" | "calendarId">> = [];

  // Výsledek 1/X/2
  const o = outcomeProbabilities(lambdas);
  const [k1, kx, k2] = marketOdds([o.home, o.draw, o.away]);
  out.push(
    { matchId: input.matchId, market: "1x2", selection: "1", oddsX100: k1, probability: o.home, label: input.homeName },
    { matchId: input.matchId, market: "1x2", selection: "X", oddsX100: kx, probability: o.draw, label: "Remíza" },
    { matchId: input.matchId, market: "1x2", selection: "2", oddsX100: k2, probability: o.away, label: input.awayName },
  );

  // Počet gólů
  for (const line of TOTAL_LINES) {
    const t = totalsProbabilities(lambdas, line);
    const [kover, kunder] = marketOdds([t.over, t.under]);
    const tag = String(line).replace(".", "");
    const cara = String(line).replace(".", ",");
    out.push(
      { matchId: input.matchId, market: "totals", selection: `over${tag}`, oddsX100: kover, probability: t.over, label: `Víc než ${cara} gólu` },
      { matchId: input.matchId, market: "totals", selection: `under${tag}`, oddsX100: kunder, probability: t.under, label: `Míň než ${cara} gólu` },
    );
  }

  // Střelci — zvlášť pro každý tým, podíly se dělí uvnitř týmu
  for (const isHome of [true, false]) {
    const kadr = input.scorers.filter((s) => s.isHome === isHome);
    if (kadr.length === 0) continue;

    const teamLambda = isHome ? lambdas.home : lambdas.away;
    const teamGoals = isHome ? input.homeTeamGoals : input.awayTeamGoals;
    const shares = scorerShares(
      kadr.map((s) => ({ playerId: s.playerId, position: s.position, goals: s.goals })),
      teamGoals,
    );

    const ohodnoceni = kadr.map((s) => {
      const share = shares.get(s.playerId) ?? 0;
      const avail = availability(s.starts, input.playedMatches);
      return { s, prob: scorerProbability(teamLambda, share, avail) };
    })
      .filter((x) => x.prob >= MIN_SCORER_PROB)
      .sort((a, b) => b.prob - a.prob)
      .slice(0, SCORERS_PER_TEAM);

    for (const { s, prob } of ohodnoceni) {
      out.push({
        matchId: input.matchId, market: "scorer", selection: s.playerId,
        oddsX100: singleSideOdds(prob), probability: prob,
        label: `${s.name} (${s.teamName})`,
      });
    }
  }

  return out;
}

/**
 * Vygeneruje nebo přepočítá kurzový lístek nejbližšího kola soutěže.
 * Vrací počet zapsaných řádků; 0 znamená „není co vypisovat".
 */
export async function generateBoard(
  db: D1Database, leagueId: string, gameDate: string,
): Promise<{ calendarId: string | null; rows: number }> {
  const round = await nextOpenRound(db, leagueId);
  if (!round) return { calendarId: null, rows: 0 };

  const matches = await db.prepare(
    `SELECT m.id, m.home_team_id, m.away_team_id,
            h.name AS home_name, a.name AS away_name
       FROM matches m
       JOIN teams h ON h.id = m.home_team_id
       JOIN teams a ON a.id = m.away_team_id
      WHERE m.calendar_id = ? AND m.status = 'scheduled'
        AND h.name NOT LIKE 'DELETED-%' AND a.name NOT LIKE 'DELETED-%'`
  ).bind(round.calendar_id).all<MatchRow>()
    .catch((e) => { logger.warn({ module: M }, `zápasy kola ${round.calendar_id}`, e); return { results: [] }; });

  if (matches.results.length === 0) return { calendarId: round.calendar_id, rows: 0 };

  const teamIds = [...new Set(matches.results.flatMap((m) => [m.home_team_id, m.away_team_id]))];
  const seasonId = `season-${round.season_number}`;

  const [strengths, forms, scorers, teamGoals, played] = await Promise.all([
    loadStrengths(db, teamIds),
    loadForm(db, leagueId, round.season_number, teamIds),
    loadScorers(db, teamIds, seasonId),
    loadTeamGoals(db, teamIds, seasonId),
    loadPlayedCount(db, leagueId, round.season_number),
  ]);

  const vsechny: OddsRow[] = [];
  for (const m of matches.results) {
    const kadrDomaci = scorers.get(m.home_team_id) ?? [];
    const kadrHoste = scorers.get(m.away_team_id) ?? [];

    const rows = matchOdds({
      matchId: m.id,
      homeName: m.home_name,
      awayName: m.away_name,
      homeStrength: strengths.get(m.home_team_id) ?? 30,
      awayStrength: strengths.get(m.away_team_id) ?? 30,
      homeForm: forms.get(m.home_team_id) ?? 0,
      awayForm: forms.get(m.away_team_id) ?? 0,
      homeTeamGoals: teamGoals.get(m.home_team_id) ?? 0,
      awayTeamGoals: teamGoals.get(m.away_team_id) ?? 0,
      playedMatches: played,
      scorers: [
        ...kadrDomaci.map((p) => ({
          playerId: p.id, name: `${p.first_name} ${p.last_name}`, teamName: m.home_name,
          isHome: true, position: p.position, goals: p.goals, starts: p.starts,
        })),
        ...kadrHoste.map((p) => ({
          playerId: p.id, name: `${p.first_name} ${p.last_name}`, teamName: m.away_name,
          isHome: false, position: p.position, goals: p.goals, starts: p.starts,
        })),
      ],
    });

    for (const r of rows) {
      vsechny.push({
        ...r, leagueId, seasonNumber: round.season_number, calendarId: round.calendar_id,
      });
    }
  }

  await writeOdds(db, vsechny, gameDate);
  return { calendarId: round.calendar_id, rows: vsechny.length };
}

/**
 * Zápis lístku. UPSERT na UNIQUE(match_id, market, selection) — souběžné běhy
 * tak nemůžou vyrobit dvě sady kurzů na týž zápas.
 */
async function writeOdds(db: D1Database, rows: OddsRow[], gameDate: string): Promise<void> {
  if (rows.length === 0) return;

  const stmt = db.prepare(
    `INSERT INTO bet_odds
       (id, league_id, season_number, calendar_id, match_id, market, selection,
        odds_x100, probability, label, game_date)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(match_id, market, selection) DO UPDATE SET
       odds_x100 = excluded.odds_x100,
       probability = excluded.probability,
       label = excluded.label,
       game_date = excluded.game_date`
  );

  // D1 zvládne dávku pohodlně; sedm zápasů dá kolem sta řádků.
  const CHUNK = 60;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const davka = rows.slice(i, i + CHUNK).map((r) => stmt.bind(
      crypto.randomUUID(), r.leagueId, r.seasonNumber, r.calendarId, r.matchId,
      r.market, r.selection, r.oddsX100, r.probability, r.label, gameDate,
    ));
    await db.batch(davka).catch((e) => {
      logger.error({ module: M }, `zápis kurzů (dávka od ${i})`, e);
    });
  }
}
