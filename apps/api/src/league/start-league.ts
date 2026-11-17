/**
 * Spuštění ligy, která čeká bez rozpisu (IV. třída založená do zásoby).
 *
 * Liga se rozběhne, až do ní přijde první člověk: dostane termíny kol nejbližší vyšší soutěže
 * svého okresu (IV. třída podle III. třídy), U21 o den později. Kola, jejichž termín už minul,
 * zůstanou splatná a dopočítá je běžné zpracování kola: `enqueueLeagueCatchUp` na ně pošle
 * zprávy do fronty zápasů, jedno kolo na zprávu, s rozestupem.
 */

import type { Bindings } from "../index";
import { createRng, cryptoSeed } from "../generators/rng";
import { logger } from "../lib/logger";
import { pragueHour } from "../lib/match-tick-schedule";
import type { MatchQueueMessage } from "../queue/messages";
import { LEVEL_RANK } from "./district-leagues";
import { generateSchedule, totalRounds } from "./schedule";
import { mirrorScheduleToU21 } from "./u21-generator";

const M = "start-league";
/** Rozestup dopočítávaných kol: jedno kolo se zpracuje asi za minutu a půl. */
export const CATCH_UP_SPACING_SECONDS = 240;
/** Kolem večerního kola (17:00 až 18:59 v Praze) patří fronta jemu, dopočítávání počká. */
export const CATCH_UP_EVENING_DELAY_SECONDS = 2 * 3600;

export interface StartLeagueResult {
  ok: boolean;
  reason?: string;
  dryRun: boolean;
  referenceLeagueId?: string;
  referenceName?: string;
  rounds?: number;
  matches?: number;
  firstRoundAt?: string;
  lastRoundAt?: string;
  /** Kola s termínem v minulosti, která se dopočítají. */
  overdue?: number;
  u21?: { leagueId: string; rounds: number; matches: number; overdue: number } | null;
}

/** Dá čekající lize rozpis podle nejbližší vyšší soutěže okresu. Dopočítání řeší fronta. */
export async function startWaitingLeague(
  db: D1Database, leagueId: string, opts: { dryRun: boolean; seed?: number; now?: Date },
): Promise<StartLeagueResult> {
  const { dryRun } = opts;
  const now = (opts.now ?? new Date()).toISOString();
  const stop = (reason: string): StartLeagueResult => ({ ok: false, reason, dryRun });

  // Aktivní sezóna, ne sezóna založení ligy: řádek ligy přežívá rollover a nese původní `season_id`.
  const season = await db.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1").first<{ number: number }>();
  if (!season) return stop("Není aktivní sezóna.");
  const row = await db.prepare(
    "SELECT id, name, district, level, COALESCE(league_type, 'senior') AS league_type FROM leagues WHERE id = ? AND status = 'active'",
  ).bind(leagueId).first<{ id: string; name: string; district: string; level: string; league_type: string }>();
  if (!row) return stop("Soutěž nenalezena.");
  const league = { ...row, season_number: season.number };
  if (league.league_type !== "senior") return stop("Spouští se seniorská soutěž, její U21 jde s ní.");

  const existing = await db.prepare("SELECT COUNT(*) AS n FROM season_calendar WHERE league_id = ? AND season_number = ?")
    .bind(leagueId, league.season_number).first<{ n: number }>();
  if ((existing?.n ?? 0) > 0) return stop("Soutěž už rozpis má.");

  const teams = (await db.prepare("SELECT id FROM teams WHERE league_id = ? ORDER BY name, id").bind(leagueId).all<{ id: string }>()).results;
  if (teams.length < 2 || teams.length % 2 !== 0) return stop(`Soutěž má ${teams.length} klubů, rozpis umí jen sudý počet.`);
  const roundCount = totalRounds(teams.length);

  // Vzor: nejbližší vyšší seniorská soutěž okresu se stejně dlouhým rozpisem v téhle sezóně.
  const candidates = await db.prepare(
    `SELECT l.id, l.name, l.level, l.match_weekdays,
            (SELECT COUNT(*) FROM season_calendar c WHERE c.league_id = l.id AND c.season_number = ?) AS rounds
       FROM leagues l
      WHERE l.district = ? AND l.status = 'active' AND l.id <> ?
        AND COALESCE(l.league_type, 'senior') = 'senior'`,
  ).bind(league.season_number, league.district, leagueId)
    .all<{ id: string; name: string; level: string; match_weekdays: string | null; rounds: number }>();
  const ownRank = LEVEL_RANK[league.level] ?? 0;
  const reference = candidates.results
    .filter((c) => (LEVEL_RANK[c.level] ?? 0) > ownRank && c.rounds === roundCount)
    .sort((a, b) => (LEVEL_RANK[a.level] ?? 0) - (LEVEL_RANK[b.level] ?? 0))[0];
  if (!reference) return stop("V okrese není vyšší soutěž se stejně dlouhým rozpisem, podle které by se dalo hrát.");

  const referenceRounds = (await db.prepare(
    "SELECT game_week, match_day, scheduled_at FROM season_calendar WHERE league_id = ? AND season_number = ? ORDER BY game_week",
  ).bind(reference.id, league.season_number).all<{ game_week: number; match_day: string; scheduled_at: string }>()).results;
  if (referenceRounds.some((r, i) => r.game_week !== i + 1)) return stop(`${reference.name} nemá souvislý rozpis.`);

  const u21 = await db.prepare(
    "SELECT id FROM leagues WHERE parent_league_id = ? AND league_type = 'u21' AND status = 'active' LIMIT 1",
  ).bind(leagueId).first<{ id: string }>();
  const u21HasCalendar = u21
    ? ((await db.prepare("SELECT COUNT(*) AS n FROM season_calendar WHERE league_id = ? AND season_number = ?")
      .bind(u21.id, league.season_number).first<{ n: number }>())?.n ?? 0) > 0
    : false;
  if (u21HasCalendar) return stop("U21 soutěže už rozpis má, tohle ručně.");

  const overdue = referenceRounds.filter((r) => r.scheduled_at <= now).length;
  const u21Overdue = referenceRounds.filter((r) => new Date(Date.parse(r.scheduled_at) + 86_400_000).toISOString() <= now).length;
  const result: StartLeagueResult = {
    ok: true, dryRun, referenceLeagueId: reference.id, referenceName: reference.name,
    rounds: roundCount, matches: roundCount * (teams.length / 2),
    firstRoundAt: referenceRounds[0].scheduled_at, lastRoundAt: referenceRounds[referenceRounds.length - 1].scheduled_at,
    overdue,
    u21: u21 ? { leagueId: u21.id, rounds: roundCount, matches: roundCount * (teams.length / 2), overdue: u21Overdue } : null,
  };
  if (dryRun) return result;

  const calendarByRound = new Map<number, string>();
  const statements: D1PreparedStatement[] = referenceRounds.map((r) => {
    const id = crypto.randomUUID();
    calendarByRound.set(r.game_week, id);
    return db.prepare(
      "INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')",
    ).bind(id, leagueId, league.season_number, r.game_week, r.match_day, r.scheduled_at);
  });
  for (const m of generateSchedule(createRng(opts.seed ?? cryptoSeed()), teams.length)) {
    const home = teams[m.homeTeamIndex];
    const away = teams[m.awayTeamIndex];
    const calendarId = calendarByRound.get(m.round);
    if (!home || !away || !calendarId) throw new Error(`${league.name}: rozpis nesedí na kola (kolo ${m.round})`);
    statements.push(db.prepare(
      "INSERT INTO matches (id, league_id, calendar_id, round, home_team_id, away_team_id, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')",
    ).bind(crypto.randomUUID(), leagueId, calendarId, m.round, home.id, away.id));
  }
  statements.push(db.prepare("UPDATE leagues SET match_weekdays = ? WHERE id = ?").bind(reference.match_weekdays, leagueId));
  // Zavřená čekající liga se otevře i s U21 (league/waiting-league.ts).
  statements.push(db.prepare("UPDATE leagues SET waiting = 0 WHERE id = ? OR parent_league_id = ?").bind(leagueId, leagueId));
  // Jedna dávka = jedna transakce: liga má rozpis celý, nebo žádný.
  await db.batch(statements);

  if (u21) {
    const mirrored = await mirrorScheduleToU21(db, leagueId, u21.id, 1, league.season_number);
    result.u21 = { leagueId: u21.id, rounds: mirrored.calendarEntries, matches: mirrored.matches, overdue: u21Overdue };
  }
  logger.info({ module: M }, `liga ${league.name} spuštěna podle ${reference.name}: ${roundCount} kol, k dopočítání ${overdue} (U21 ${u21Overdue})`);
  return result;
}

/** Zprávy do fronty zápasů, které dopočítají zameškaná kola: jedno kolo na zprávu, áčko před U21. */
export async function enqueueLeagueCatchUp(env: Bindings, started: StartLeagueResult, leagueId: string, now: Date = new Date()): Promise<number> {
  const queue = env.MATCH_QUEUE;
  if (!queue || !started.ok) return 0;
  const targets = [
    ...Array.from({ length: started.overdue ?? 0 }, () => leagueId),
    ...Array.from({ length: started.u21?.overdue ?? 0 }, () => started.u21!.leagueId),
  ];
  if (targets.length === 0) return 0;
  const gameDates = new Map<string, string>();
  for (const id of new Set(targets)) {
    const row = await env.DB.prepare("SELECT MAX(game_date) AS game_date FROM teams WHERE league_id = ?").bind(id).first<{ game_date: string | null }>();
    if (row?.game_date) gameDates.set(id, row.game_date);
  }
  const hour = pragueHour(now);
  const base = hour === 17 || hour === 18 ? CATCH_UP_EVENING_DELAY_SECONDS : 0;
  const enqueuedAt = now.toISOString();
  let sent = 0;
  for (const [i, id] of targets.entries()) {
    const gameDate = gameDates.get(id);
    if (!gameDate) continue;
    const body: MatchQueueMessage = { kind: "league_round", leagueId: id, gameDate, enqueuedAt };
    const delaySeconds = base + i * CATCH_UP_SPACING_SECONDS;
    await queue.send(body, delaySeconds > 0 ? { delaySeconds } : undefined);
    sent++;
  }
  logger.info({ module: M }, `liga ${leagueId}: do fronty ${sent} kol k dopočítání`);
  return sent;
}

/**
 * Po příchodu člověka do ligy: když liga čeká bez rozpisu, spustí ji a zařadí dopočítání.
 * Chyba tady nesmí shodit registraci, klub už je převzatý.
 */
export async function startLeagueOnJoin(env: Bindings, leagueId: string): Promise<StartLeagueResult | null> {
  try {
    const started = await startWaitingLeague(env.DB, leagueId, { dryRun: false });
    if (!started.ok) return started;
    await enqueueLeagueCatchUp(env, started, leagueId);
    return started;
  } catch (e) {
    logger.error({ module: M }, `spuštění ligy ${leagueId} po registraci selhalo`, e);
    return null;
  }
}
