/**
 * Srovnání rozpisu ligy s jinou ligou: každé kolo dostane termín stejného kola vzorové ligy.
 *
 * Liga, která vznikla uprostřed sezóny, tak hraje ve stejné dny jako ostatní. Kola, jejichž
 * termín už minul, zůstanou neodehraná a se splatným termínem: zpracování kola
 * (`processLeagueRound`, ručně `POST /api/game/run-matches?leagueId=`) je pak dopočítá jedno
 * po druhém, dokud liga ostatní nedožene. U21 liga dostane termíny o den později.
 *
 * Odehraným kolům se termín přepíše taky, aby kola šla v čase po sobě. Rozehrané kolo
 * (`lineup_locked`) srovnání zastaví.
 */

import { logger } from "../lib/logger";

const M = "align-schedule";
const DAY_MS = 86_400_000;
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

interface RoundRow {
  id: string;
  game_week: number;
  scheduled_at: string;
  match_day: string;
  status: string;
}

export interface AlignedRound { gameWeek: number; from: string; to: string; status: string }

export interface AlignResult {
  ok: boolean;
  reason?: string;
  dryRun: boolean;
  rounds?: AlignedRound[];
  /** Neodehraná kola, jejichž nový termín už minul: ta se dopočítají. */
  overdue?: number;
  u21?: { leagueId: string; rounds: AlignedRound[]; overdue: number } | null;
}

/** Přepíše termíny kol ligy (a její U21) podle vzorové ligy téže sezóny. */
export async function alignLeagueSchedule(
  db: D1Database, leagueId: string, referenceLeagueId: string, opts: { dryRun: boolean; now?: Date },
): Promise<AlignResult> {
  const { dryRun } = opts;
  const now = (opts.now ?? new Date()).toISOString();
  const stop = (reason: string): AlignResult => ({ ok: false, reason, dryRun });
  if (leagueId === referenceLeagueId) return stop("Vzorová soutěž musí být jiná než srovnávaná.");

  const loadLeague = (id: string) => db.prepare(
    `SELECT l.id, l.name, l.match_weekdays, COALESCE(l.league_type, 'senior') AS league_type,
            (SELECT MAX(season_number) FROM season_calendar c WHERE c.league_id = l.id) AS season_number
       FROM leagues l WHERE l.id = ?`,
  ).bind(id).first<{ id: string; name: string; match_weekdays: string | null; league_type: string; season_number: number | null }>();
  const [league, reference] = await Promise.all([loadLeague(leagueId), loadLeague(referenceLeagueId)]);
  if (!league) return stop("Soutěž nenalezena.");
  if (!reference) return stop("Vzorová soutěž nenalezena.");
  if (league.league_type !== "senior" || reference.league_type !== "senior") return stop("Srovnat jde jen seniorské soutěže, U21 jde s áčkem.");
  if (league.season_number === null || league.season_number !== reference.season_number) {
    return stop("Soutěže nemají rozpis ve stejné sezóně.");
  }

  const loadRounds = (id: string) => db.prepare(
    "SELECT id, game_week, scheduled_at, match_day, status FROM season_calendar WHERE league_id = ? AND season_number = ? ORDER BY game_week",
  ).bind(id, league.season_number).all<RoundRow>().then((r) => r.results);
  const [rounds, referenceRounds] = await Promise.all([loadRounds(leagueId), loadRounds(referenceLeagueId)]);
  if (rounds.length !== referenceRounds.length || rounds.some((r, i) => r.game_week !== referenceRounds[i].game_week)) {
    return stop(`Soutěž má ${rounds.length} kol, vzorová ${referenceRounds.length}. Srovnat jde jen stejně dlouhé rozpisy.`);
  }

  const u21 = await db.prepare(
    "SELECT id FROM leagues WHERE parent_league_id = ? AND league_type = 'u21' AND status = 'active' LIMIT 1",
  ).bind(leagueId).first<{ id: string }>();
  const u21Rounds = u21 ? await loadRounds(u21.id) : [];
  if (u21 && (u21Rounds.length !== rounds.length || u21Rounds.some((r, i) => r.game_week !== rounds[i].game_week))) {
    return stop(`U21 má ${u21Rounds.length} kol, áčko ${rounds.length}.`);
  }
  if ([...rounds, ...u21Rounds].some((r) => r.status === "lineup_locked")) return stop("Některé kolo se právě hraje, zkus to po něm.");

  const statements: D1PreparedStatement[] = [];
  const plan = (rows: RoundRow[], shiftMs: number): AlignedRound[] => {
    const changed: AlignedRound[] = [];
    rows.forEach((row, i) => {
      const at = new Date(Date.parse(referenceRounds[i].scheduled_at) + shiftMs);
      const to = at.toISOString();
      if (to === row.scheduled_at) return;
      changed.push({ gameWeek: row.game_week, from: row.scheduled_at, to, status: row.status });
      statements.push(db.prepare("UPDATE season_calendar SET scheduled_at = ?, match_day = ? WHERE id = ? AND status = ?")
        .bind(to, DAY_NAMES[at.getUTCDay()], row.id, row.status));
    });
    return changed;
  };
  const overdueOf = (rows: RoundRow[], shiftMs: number) => rows.filter((row, i) =>
    row.status === "scheduled" && new Date(Date.parse(referenceRounds[i].scheduled_at) + shiftMs).toISOString() <= now).length;

  const result: AlignResult = {
    ok: true, dryRun, rounds: plan(rounds, 0), overdue: overdueOf(rounds, 0),
    u21: u21 ? { leagueId: u21.id, rounds: plan(u21Rounds, DAY_MS), overdue: overdueOf(u21Rounds, DAY_MS) } : null,
  };
  if (league.match_weekdays !== reference.match_weekdays) {
    statements.push(db.prepare("UPDATE leagues SET match_weekdays = ? WHERE id = ?").bind(reference.match_weekdays, leagueId));
  }
  if (dryRun || statements.length === 0) return result;

  await db.batch(statements);
  logger.info({ module: M }, `liga ${league.name}: rozpis srovnán podle ${reference.name}, ${result.rounds!.length} kol, k dopočítání ${result.overdue}`);
  return result;
}
