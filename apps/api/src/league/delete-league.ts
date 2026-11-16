/**
 * Smazání celé seniorské ligy i s její U21: kluby, hráči, zápasy a všechno, co na ně odkazuje.
 *
 * Určeno pro ligu, která vznikla omylem nebo se ruší krátce po založení (Strakonice 2026-11).
 * Účty lidí zůstávají, jen přijdou o klub a můžou si založit nový jinde.
 *
 * Jak hledá data: projde schéma a každý sloupec, který podle jména nese id klubu, hráče, ligy,
 * zápasu, kola nebo trenéra, porovná s mazanou ligou. Řádek, který na ni odkazuje, smaže.
 * Výjimkou jsou sloupce z `CLEAR_COLUMNS`: tam řádek patří někomu jinému a odkaz se jen vynuluje.
 * Tabulky, které se váží přes jiný klíč (zprávy přes konverzaci, události přes nabídku), drží
 * `CHILD_RULES`.
 *
 * Co by smazáním poškodilo kluby mimo ligu (rozehrané sázky cizích klubů, splátky, hostování,
 * pohár), vrátí jako `blockers` a naostro se nespustí.
 *
 * Maže po dávkách od závislých tabulek ke klubům a lize. Po přerušení jde pustit znovu:
 * kluby a liga mizí až poslední, takže opakované volání najde zbytek a domaže ho.
 */

import { logger } from "../lib/logger";

const M = "delete-league";
const BATCH_SIZE = 60;

type RefKind = "team" | "player" | "league" | "match" | "calendar" | "manager";

/** Tabulky, ze kterých se odvozuje rozsah mazání. Mažou se až na konci a v tomhle pořadí. */
const CORE_TABLES = ["matches", "season_calendar", "managers", "players", "teams", "leagues"] as const;

const TEAM_COLUMNS = new Set(["team_id", "team_a", "team_b", "team_a_id", "team_b_id", "nominated_by_team", "swapped_by_team", "parent_club_id"]);
const PLAYER_COLUMNS = new Set(["player_id", "player_a_id", "player_b_id", "player_of_round_id", "player_of_season_id"]);

/** Co sloupec podle jména nese. `cup_team_id` a `outside_player_id` míří do jiných tabulek. */
export function refKindOf(column: string): RefKind | null {
  if (column.endsWith("cup_team_id") || column === "outside_player_id") return null;
  if (TEAM_COLUMNS.has(column) || column.endsWith("_team_id")) return "team";
  if (PLAYER_COLUMNS.has(column) || column.endsWith("_player_id")) return "player";
  if (column === "league_id" || column.endsWith("_league_id")) return "league";
  if (column === "match_id" || column.endsWith("_match_id")) return "match";
  if (column === "calendar_id" || column.endsWith("_calendar_id")) return "calendar";
  if (column === "manager_id") return "manager";
  return null;
}

/** Odkazy v řádcích, které patří někomu jinému: řádek zůstane, odkaz se vynuluje. */
const CLEAR_COLUMNS = new Set([
  "players.loan_from_team_id", "players.raised_by_team_id", "players.parent_club_id",
  "teams.academy_coach_player_id", "matches.mom_player_id",
  "free_agents.released_from_team_id", "outside_players.sold_to_team_id", "outside_clubs.anchor_league_id",
  "district_registrations.founder_team_id", "district_sponsors.priority_team_id",
  "cup_competitions.winner_team_id", "tournaments.winner_team_id",
  "village_brigades.taken_by_team_id", "friendly_offers.taken_by_team_id",
  "loan_agreements.warned_for_match_id", "bus_satellite_fans.last_bus_match_id",
]);

interface ChildRule {
  table: string;
  column: string;
  /** Poddotaz s id rodičů, kteří se smažou (pojmenované rozsahy se dosadí). */
  parents: (s: Scopes) => string;
}

interface Scopes {
  team: string;
  player: string;
  league: string;
  match: string;
  calendar: string;
  manager: string;
}

const offerParents = (s: Scopes) =>
  `SELECT id FROM transfer_offers WHERE from_team_id IN (${s.team}) OR to_team_id IN (${s.team}) OR player_id IN (${s.player}) OR offered_player_id IN (${s.player})`;
const listingParents = (s: Scopes) =>
  `SELECT id FROM transfer_listings WHERE team_id IN (${s.team}) OR player_id IN (${s.player}) OR league_id IN (${s.league})`;
const ticketParents = (s: Scopes) =>
  `SELECT id FROM bet_tickets WHERE team_id IN (${s.team}) OR league_id IN (${s.league}) OR calendar_id IN (${s.calendar})`;
const conversationParents = (s: Scopes) => `SELECT id FROM conversations WHERE team_id IN (${s.team})`;
const leagueChatParents = (s: Scopes) => `SELECT id FROM group_chats WHERE scope = 'league' AND scope_id IN (${s.league})`;

/** Tabulky navázané přes jiný klíč než klub, hráče, ligu nebo zápas. Mažou se jako první. */
const CHILD_RULES: ChildRule[] = [
  { table: "messages", column: "conversation_id", parents: conversationParents },
  { table: "transfer_offer_events", column: "offer_id", parents: offerParents },
  { table: "transfer_offer_swap_players", column: "offer_id", parents: offerParents },
  { table: "transfer_demand_pitches", column: "offer_id", parents: offerParents },
  { table: "transfer_bids", column: "listing_id", parents: listingParents },
  { table: "ai_negotiations", column: "listing_id", parents: listingParents },
  { table: "transfer_offers", column: "listing_id", parents: listingParents },
  { table: "bet_selections", column: "ticket_id", parents: ticketParents },
  { table: "bet_comments", column: "ticket_id", parents: ticketParents },
  { table: "group_messages", column: "group_chat_id", parents: leagueChatParents },
  { table: "group_chat_reads", column: "group_chat_id", parents: leagueChatParents },
  { table: "group_chats", column: "id", parents: leagueChatParents },
];

export interface DeleteLeagueStep {
  table: string;
  column: string;
  action: "delete" | "clear";
  rows: number;
}

export interface DeleteLeagueResult {
  ok: boolean;
  reason?: string;
  dryRun: boolean;
  leagues?: Array<{ id: string; name: string }>;
  teams?: number;
  players?: number;
  matches?: number;
  /** Kluby, které vede člověk. Účet zůstane, klub zmizí. */
  humanTeams?: Array<{ teamId: string; name: string; userId: string }>;
  /** Vazby na kluby mimo ligu, které smazání nedovolí. */
  blockers?: string[];
  steps?: DeleteLeagueStep[];
  rowsTotal?: number;
  districtClosed?: string | null;
}

const fail = (reason: string, dryRun: boolean, extra: Partial<DeleteLeagueResult> = {}): DeleteLeagueResult =>
  ({ ok: false, reason, dryRun, ...extra });

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Seznam id jako SQL literály. Id jdou z databáze, tvar se přesto ověří. */
function idList(ids: readonly string[]): string {
  for (const id of ids) if (!ID_PATTERN.test(id)) throw new Error(`Neplatné id ${id}`);
  return ids.length > 0 ? ids.map((id) => `'${id}'`).join(",") : "NULL";
}

async function countOf(db: D1Database, sql: string): Promise<number> {
  return (await db.prepare(sql).first<{ n: number }>())?.n ?? 0;
}

async function findBlockers(db: D1Database, s: Scopes): Promise<string[]> {
  const checks: Array<[string, string]> = [
    ["rozehraných sázek klubů mimo ligu na její zápasy",
      `SELECT COUNT(*) AS n FROM bet_tickets t WHERE t.status = 'open' AND t.team_id NOT IN (${s.team})
        AND (t.league_id IN (${s.league}) OR EXISTS (SELECT 1 FROM bet_selections b WHERE b.ticket_id = t.id AND b.match_id IN (${s.match})))`],
    ["splátek přestupů s klubem mimo ligu",
      `SELECT COUNT(*) AS n FROM transfer_installments WHERE (buyer_team_id IN (${s.team})) <> (seller_team_id IN (${s.team}))`],
    ["hostování s klubem mimo ligu",
      `SELECT COUNT(*) AS n FROM loan_agreements WHERE (borrower_team_id IN (${s.team})) <> (lender_team_id IN (${s.team}))`],
    ["hráčů hostujících přes hranici ligy",
      `SELECT COUNT(*) AS n FROM players WHERE loan_from_team_id IS NOT NULL
        AND (team_id IN (${s.team})) <> (loan_from_team_id IN (${s.team}))`],
    ["podílů z dalšího prodeje s klubem mimo ligu",
      `SELECT COUNT(*) AS n FROM sell_on_clauses WHERE (beneficiary_team_id IN (${s.team})) <> (owner_team_id IN (${s.team}))`],
    ["zápasů s klubem mimo ligu",
      `SELECT COUNT(*) AS n FROM matches WHERE (home_team_id IN (${s.team})) <> (away_team_id IN (${s.team}))`],
    ["přihlášek do poháru", `SELECT COUNT(*) AS n FROM cup_teams WHERE team_id IN (${s.team})`],
    ["přihlášek do turnaje", `SELECT COUNT(*) AS n FROM tournament_entries WHERE team_id IN (${s.team})`],
  ];
  const blockers: string[] = [];
  for (const [label, sql] of checks) {
    const n = await countOf(db, sql);
    if (n > 0) blockers.push(`${n} ${label}`);
  }
  return blockers;
}

/** Smaže seniorskou ligu a její U21 se vším všudy. Nanečisto jen spočítá, co by zmizelo. */
export async function deleteLeague(
  db: D1Database, leagueId: string,
  opts: { dryRun: boolean; expectedHumanTeams?: number; closeDistrict?: boolean },
): Promise<DeleteLeagueResult> {
  const { dryRun } = opts;
  const league = await db.prepare(
    "SELECT id, name, district, COALESCE(league_type, 'senior') AS league_type FROM leagues WHERE id = ?",
  ).bind(leagueId).first<{ id: string; name: string; district: string; league_type: string }>();
  if (!league) return fail("Soutěž nenalezena.", dryRun);
  if (league.league_type !== "senior") return fail("Mazat jde jen seniorskou soutěž, její U21 jde s ní.", dryRun);

  const children = await db.prepare("SELECT id, name FROM leagues WHERE parent_league_id = ?").bind(leagueId)
    .all<{ id: string; name: string }>();
  const leagues = [{ id: league.id, name: league.name }, ...children.results];
  const leagueSql = idList(leagues.map((l) => l.id));

  const teamRows = await db.prepare(`SELECT id, name, user_id FROM teams WHERE league_id IN (${leagueSql}) ORDER BY name`)
    .all<{ id: string; name: string; user_id: string }>();
  const teamSql = idList(teamRows.results.map((t) => t.id));
  const scopes: Scopes = {
    team: teamSql,
    league: leagueSql,
    player: `SELECT id FROM players WHERE team_id IN (${teamSql})`,
    calendar: `SELECT id FROM season_calendar WHERE league_id IN (${leagueSql})`,
    match: `SELECT id FROM matches WHERE league_id IN (${leagueSql}) OR home_team_id IN (${teamSql}) OR away_team_id IN (${teamSql})`,
    manager: `SELECT id FROM managers WHERE team_id IN (${teamSql})`,
  };

  const humanTeams = teamRows.results.filter((t) => t.user_id !== "ai")
    .map((t) => ({ teamId: t.id, name: t.name, userId: t.user_id }));
  const summary: Partial<DeleteLeagueResult> = {
    leagues, teams: teamRows.results.length, humanTeams,
    players: await countOf(db, `SELECT COUNT(*) AS n FROM players WHERE team_id IN (${teamSql})`),
    matches: await countOf(db, `SELECT COUNT(*) AS n FROM (${scopes.match})`),
    blockers: await findBlockers(db, scopes),
  };

  // Schéma: všechny tabulky a jejich sloupce, které podle jména nesou mazaná id.
  const columns = await db.prepare(
    `SELECT m.name AS tbl, p.name AS col FROM sqlite_master m JOIN pragma_table_info(m.name) p
      WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%' AND m.name NOT LIKE 'd1_%'
      ORDER BY m.name, p.cid`,
  ).all<{ tbl: string; col: string }>();
  const tableNames = new Set(columns.results.map((c) => c.tbl));
  const core = new Set<string>(CORE_TABLES);

  const steps: DeleteLeagueStep[] = [];
  const childStatements: string[] = [];
  const clearStatements: string[] = [];
  const deleteStatements: string[] = [];

  for (const rule of CHILD_RULES) {
    if (!tableNames.has(rule.table)) continue;
    const where = `"${rule.column}" IN (${rule.parents(scopes)})`;
    const rows = await countOf(db, `SELECT COUNT(*) AS n FROM "${rule.table}" WHERE ${where}`);
    if (rows === 0) continue;
    steps.push({ table: rule.table, column: rule.column, action: "delete", rows });
    childStatements.push(`DELETE FROM "${rule.table}" WHERE ${where}`);
  }

  for (const { tbl, col } of columns.results) {
    const kind = refKindOf(col);
    if (!kind) continue;
    const clear = CLEAR_COLUMNS.has(`${tbl}.${col}`);
    if (core.has(tbl) && !clear) continue;
    // Vynulovat jen v řádcích, které samy nezmizí (hráč jiného klubu odchovaný v mazaném klubu).
    const keep = clear && tbl === "players" ? ` AND team_id NOT IN (${scopes.team})`
      : clear && tbl === "teams" ? ` AND id NOT IN (${scopes.team})`
        : clear && tbl === "matches" ? ` AND id NOT IN (${scopes.match})` : "";
    const where = `"${col}" IN (${scopes[kind]})${keep}`;
    const rows = await countOf(db, `SELECT COUNT(*) AS n FROM "${tbl}" WHERE ${where}`);
    if (rows === 0) continue;
    steps.push({ table: tbl, column: col, action: clear ? "clear" : "delete", rows });
    if (clear) clearStatements.push(`UPDATE "${tbl}" SET "${col}" = NULL WHERE ${where}`);
    else deleteStatements.push(`DELETE FROM "${tbl}" WHERE ${where}`);
  }

  const coreStatements = [
    // Zápasy drží odkaz na sestavy, které už jsou pryč, a U21 zápas na zápas áčka.
    `DELETE FROM matches WHERE id IN (${scopes.match}) AND parent_match_id IS NOT NULL`,
    `DELETE FROM matches WHERE league_id IN (${leagueSql}) OR home_team_id IN (${teamSql}) OR away_team_id IN (${teamSql})`,
    `DELETE FROM season_calendar WHERE league_id IN (${leagueSql}) AND parent_calendar_id IS NOT NULL`,
    `DELETE FROM season_calendar WHERE league_id IN (${leagueSql})`,
    `DELETE FROM managers WHERE team_id IN (${teamSql})`,
    `DELETE FROM players WHERE team_id IN (${teamSql})`,
    `DELETE FROM teams WHERE id IN (${teamSql}) AND parent_team_id IS NOT NULL`,
    `DELETE FROM teams WHERE id IN (${teamSql})`,
    `DELETE FROM leagues WHERE id IN (${leagueSql}) AND parent_league_id IS NOT NULL`,
    `DELETE FROM leagues WHERE id IN (${leagueSql})`,
  ];
  for (const table of CORE_TABLES) {
    const where = table === "leagues" ? `id IN (${leagueSql})`
      : table === "teams" ? `id IN (${teamSql})`
        : table === "matches" ? `id IN (${scopes.match})`
          : table === "season_calendar" ? `league_id IN (${leagueSql})`
            : `team_id IN (${teamSql})`;
    const rows = await countOf(db, `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`);
    if (rows > 0) steps.push({ table, column: "id", action: "delete", rows });
  }

  const result: DeleteLeagueResult = {
    ok: true, dryRun, ...summary, steps, rowsTotal: steps.reduce((sum, s) => sum + s.rows, 0),
    districtClosed: opts.closeDistrict ? league.district : null,
  };
  if (dryRun) return result;

  if ((summary.blockers ?? []).length > 0) {
    return fail(`Smazání by poškodilo kluby mimo ligu: ${summary.blockers!.join(", ")}.`, dryRun, summary);
  }
  if (opts.expectedHumanTeams !== humanTeams.length) {
    return fail(`V lize je ${humanTeams.length} klubů vedených člověkem, potvrzeno bylo ${opts.expectedHumanTeams ?? "nic"}.`, dryRun, summary);
  }

  const statements = [...childStatements, ...clearStatements, ...deleteStatements, ...coreStatements];
  if (opts.closeDistrict) {
    statements.push(`UPDATE district_registrations SET registration_closed = 1, founder_team_id = NULL, founder_request_id = NULL WHERE district = '${league.district.replace(/'/g, "''")}'`);
  }
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const chunk = statements.slice(i, i + BATCH_SIZE);
    try {
      // Jedna dávka = jedna transakce. Cizí klíče se v ní ověří až na konci, na pořadí uvnitř nezáleží.
      await db.batch([db.prepare("PRAGMA defer_foreign_keys = on"), ...chunk.map((sql) => db.prepare(sql))]);
    } catch (e) {
      logger.error({ module: M }, `liga ${leagueId}: dávka od ${i} selhala, opakované volání domaže zbytek`, e);
      throw e;
    }
  }
  logger.info({ module: M }, `liga ${league.name} smazána: ${result.teams} klubů, ${result.players} hráčů, ${result.rowsTotal} řádků`);
  return result;
}

export interface ClearScheduleResult {
  ok: boolean;
  reason?: string;
  dryRun: boolean;
  leagues?: Array<{ id: string; name: string }>;
  rounds?: number;
  matches?: number;
  steps?: DeleteLeagueStep[];
}

/**
 * Zruší rozpis ligy, která ještě nehrála (i její U21): kola, zápasy a co na ně odkazuje
 * (kurzy, sestavy na kolo, pozvánky). Kluby a hráči zůstávají, liga je pak v přípravném
 * období a rozpis dostane, až se spustí. Odehrané nebo rozehrané kolo zrušení zastaví,
 * stejně tak vsazený tiket na některý ze zápasů.
 */
export async function clearLeagueSchedule(
  db: D1Database, leagueId: string, opts: { dryRun: boolean },
): Promise<ClearScheduleResult> {
  const { dryRun } = opts;
  const stop = (reason: string): ClearScheduleResult => ({ ok: false, reason, dryRun });
  const league = await db.prepare(
    "SELECT id, name, COALESCE(league_type, 'senior') AS league_type FROM leagues WHERE id = ?",
  ).bind(leagueId).first<{ id: string; name: string; league_type: string }>();
  if (!league) return stop("Soutěž nenalezena.");
  if (league.league_type !== "senior") return stop("Rozpis se ruší u seniorské soutěže, její U21 jde s ní.");

  const children = await db.prepare("SELECT id, name FROM leagues WHERE parent_league_id = ?").bind(leagueId)
    .all<{ id: string; name: string }>();
  const leagues = [{ id: league.id, name: league.name }, ...children.results];
  const leagueSql = idList(leagues.map((l) => l.id));
  // Jen aktuální sezóna: liga drží v jedné tabulce i odehraná kola starších sezón. Číslo sezóny
  // se zjistí předem; poddotaz na nejvyšší sezónu by po smazání kol ukázal na tu předchozí.
  const seasons = await db.prepare(
    `SELECT league_id, MAX(season_number) AS season_number FROM season_calendar WHERE league_id IN (${leagueSql}) GROUP BY league_id`,
  ).all<{ league_id: string; season_number: number }>();
  if (seasons.results.length === 0) return stop("Soutěž žádný rozpis nemá.");
  const seasonFilter = seasons.results
    .map((r) => `(league_id IN (${idList([r.league_id])}) AND season_number = ${Number(r.season_number)})`).join(" OR ");
  const calendarScope = `SELECT id FROM season_calendar WHERE ${seasonFilter}`;
  const matchScope = `SELECT id FROM matches WHERE calendar_id IN (${calendarScope})`;

  const rounds = await countOf(db, `SELECT COUNT(*) AS n FROM (${calendarScope})`);
  const matches = await countOf(db, `SELECT COUNT(*) AS n FROM (${matchScope})`);
  if (rounds === 0 && matches === 0) return stop("Soutěž žádný rozpis nemá.");

  const started = await countOf(db, `SELECT COUNT(*) AS n FROM season_calendar WHERE id IN (${calendarScope}) AND status <> 'scheduled'`)
    + await countOf(db, `SELECT COUNT(*) AS n FROM matches WHERE id IN (${matchScope}) AND (status <> 'scheduled' OR home_score IS NOT NULL)`);
  if (started > 0) return stop("Soutěž už hrála nebo právě hraje, rozpis zrušit nejde.");
  const bets = await countOf(db,
    `SELECT COUNT(*) AS n FROM bet_tickets t WHERE t.calendar_id IN (${calendarScope})
        OR EXISTS (SELECT 1 FROM bet_selections b WHERE b.ticket_id = t.id AND b.match_id IN (${matchScope}))`);
  if (bets > 0) return stop(`Na zápasy soutěže je vsazeno (${bets} tiketů), rozpis zrušit nejde.`);

  const columns = await db.prepare(
    `SELECT m.name AS tbl, p.name AS col FROM sqlite_master m JOIN pragma_table_info(m.name) p
      WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%' AND m.name NOT LIKE 'd1_%'
      ORDER BY m.name, p.cid`,
  ).all<{ tbl: string; col: string }>();
  const steps: DeleteLeagueStep[] = [];
  const statements: string[] = [];
  for (const { tbl, col } of columns.results) {
    const kind = refKindOf(col);
    if (kind !== "match" && kind !== "calendar") continue;
    if (tbl === "matches" || tbl === "season_calendar") continue;
    const clear = CLEAR_COLUMNS.has(`${tbl}.${col}`);
    const where = `"${col}" IN (${kind === "match" ? matchScope : calendarScope})`;
    const rows = await countOf(db, `SELECT COUNT(*) AS n FROM "${tbl}" WHERE ${where}`);
    if (rows === 0) continue;
    steps.push({ table: tbl, column: col, action: clear ? "clear" : "delete", rows });
    statements.push(clear ? `UPDATE "${tbl}" SET "${col}" = NULL WHERE ${where}` : `DELETE FROM "${tbl}" WHERE ${where}`);
  }
  steps.push({ table: "matches", column: "id", action: "delete", rows: matches });
  steps.push({ table: "season_calendar", column: "id", action: "delete", rows: rounds });
  // U21 zápas a kolo odkazují na áčko, proto jdou první. Podmínka na stav drží pojistku i při souběhu s tickem.
  statements.push(
    `DELETE FROM matches WHERE id IN (${matchScope}) AND parent_match_id IS NOT NULL AND status = 'scheduled'`,
    `DELETE FROM matches WHERE id IN (${matchScope}) AND status = 'scheduled'`,
    `DELETE FROM season_calendar WHERE id IN (${calendarScope}) AND parent_calendar_id IS NOT NULL AND status = 'scheduled'`,
    `DELETE FROM season_calendar WHERE id IN (${calendarScope}) AND status = 'scheduled'`,
  );

  const result: ClearScheduleResult = { ok: true, dryRun, leagues, rounds, matches, steps };
  if (dryRun) return result;
  await db.batch([db.prepare("PRAGMA defer_foreign_keys = on"), ...statements.map((sql) => db.prepare(sql))]);
  logger.info({ module: M }, `liga ${league.name}: rozpis zrušen (${rounds} kol, ${matches} zápasů)`);
  return result;
}
