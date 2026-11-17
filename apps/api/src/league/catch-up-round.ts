/**
 * Dohnané kolo je kolo, jehož termín už minul a hraje se až teď. Typicky jde o ligu srovnanou
 * uprostřed sezóny s jinou ligou (`align-schedule.ts`, `start-league.ts`). Zpracování kola
 * pak dožene zmeškaná kola jedno za druhým během jednoho večera a mezi nimi neběží denní tick.
 *
 * Bez vyrovnání se zranění mezi koly nehojí a kondice se neobnoví. Na produkci 16. 11. 2026
 * dohnal Okresní přebor Strakonice kola 1–6 (termíny od 26. 10. do 12. 11.) za půl hodiny.
 * Průměrná kondice ligy spadla na 27 %, hráči s nulovou kondicí hráli další kola, a protože
 * engine zranění směřuje na unavené, šla zranění na ně. Zranění „z 26. 10.“ přitom trvala
 * jako čerstvá.
 *
 * Vyrovnání počítá, jako by se kolo hrálo v termínu: zranění se zkrátí o dny, které od
 * termínu uplynuly, a hráč dostane za tytéž dny regeneraci se stejnou sazbou jako v denním
 * ticku. Zápas sám zůstává, jak se odehrál.
 */

import { logConditionStmt } from "../lib/condition-log";
import { logger } from "../lib/logger";

const M = "catch-up-round";
const DAY_MS = 86_400_000;

/** Celé dny mezi termínem kola a jeho skutečným odehráním. Kolo hrané v den termínu má 0. */
export function catchUpLagDays(scheduledAt: string | null | undefined, playedAt: Date): number {
  if (!scheduledAt) return 0;
  const scheduled = Date.parse(scheduledAt);
  if (!Number.isFinite(scheduled)) return 0;
  return Math.max(0, Math.floor((playedAt.getTime() - scheduled) / DAY_MS));
}

/**
 * Denní regenerace kondice podle výdrže a věku. Sazba MUSÍ sedět s `recoveryNewCondSql`
 * v `season/daily-tick.ts`, hlídá to test `catch-up-round.test.ts`.
 */
export function dailyConditionRecovery(stamina: number | null | undefined, age: number | null | undefined): number {
  const s = stamina ?? 40;
  const base = s >= 75 ? 20 : s >= 50 ? 16 : s >= 25 ? 13 : 10;
  const a = age ?? 25;
  const ageMod = a <= 21 ? 3 : a <= 25 ? 1 : a <= 30 ? 0 : a <= 35 ? -1 : -3;
  return base + ageMod;
}

/** Kondice po dohnaném kole: k té ze zápasu se přičte regenerace za dny zpoždění. */
export function catchUpCondition(conditionAfter: number, lagDays: number, recoveryPerDay: number): number {
  if (lagDays <= 0) return conditionAfter;
  return Math.min(100, conditionAfter + lagDays * recoveryPerDay);
}

/** Kolik dní zranění ze zápasu dohnaného kola zbývá. 0 znamená, že by už bylo zahojené. */
export function catchUpInjuryDaysRemaining(days: number, lagDays: number): number {
  return Math.max(0, days - Math.max(0, lagDays));
}

/** Zápis „doléčeného“ zranění do paměti hráče, stejně jako v denním ticku. */
export function healedInjuryStmt(
  db: D1Database, playerId: string,
  injury: { description: string | null; daysTotal: number; volno?: boolean; fake?: boolean },
  healedAt: string,
): D1PreparedStatement {
  return db.prepare(
    "UPDATE players SET life_context = json_set(COALESCE(life_context, '{}'), '$.lastInjury', json(?)) WHERE id = ?",
  ).bind(JSON.stringify({
    description: injury.description ?? "", days: injury.daysTotal, healedAt,
    volno: injury.volno === true, fake: injury.fake === true,
  }), playerId);
}

/** Kdo nastoupil v dohnaném kole: kondice po zápase a podklady pro regeneraci. */
export interface CatchUpPlayer {
  dbId: string;
  teamId: string;
  conditionAfter: number;
  stamina: number | null | undefined;
  age: number | null | undefined;
}

/**
 * Statementy, které hráčům dohnaného kola připíšou regeneraci za dny zpoždění. Pouští se
 * až po zápisu kondice ze zápasu, aby `condition_log` ukázal únavu i regeneraci zvlášť.
 */
export function catchUpRecoveryStatements(
  db: D1Database, players: readonly CatchUpPlayer[], lagDays: number,
): D1PreparedStatement[] {
  if (lagDays <= 0) return [];
  const stmts: D1PreparedStatement[] = [];
  for (const p of players) {
    const before = Math.round(p.conditionAfter);
    const after = Math.round(catchUpCondition(p.conditionAfter, lagDays, dailyConditionRecovery(p.stamina, p.age)));
    if (after === before) continue;
    stmts.push(db.prepare("UPDATE players SET life_context = json_set(life_context, '$.condition', ?) WHERE id = ?").bind(after, p.dbId));
    stmts.push(logConditionStmt(db, p.dbId, p.teamId, before, after, "recovery", recoveryDescription(lagDays)));
  }
  return stmts;
}

function recoveryDescription(lagDays: number): string {
  return `Regenerace za ${lagDays} ${lagDays === 1 ? "den" : lagDays < 5 ? "dny" : "dní"} (kolo hrané po termínu)`;
}

// ── Zpětné vyrovnání už odehraných dohnaných kol ──

export interface SettledRound {
  leagueId: string;
  calendarId: string;
  gameWeek: number;
  lagDays: number;
  alreadySettled: boolean;
  injuriesShortened: number;
  injuriesHealed: number;
  playersRecovered: number;
}

export interface SettleCatchUpResult {
  ok: boolean;
  reason?: string;
  dryRun: boolean;
  rounds: SettledRound[];
  /** Hráči s nejvyšší vrácenou kondicí, pro kontrolu před ostrým během. */
  sample: Array<{ playerId: string; from: number; to: number }>;
  conditionAfterAvg?: number;
}

/** Značka v CACHE_KV, že kolo už je vyrovnané. Bez ní by druhý běh zkracoval zranění znovu. */
export const settledKey = (calendarId: string) => `catch-up-settled:${calendarId}`;

const sqlTime = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

interface RoundRow { id: string; league_id: string; game_week: number; scheduled_at: string; first_sim: string | null }
interface MatchRow { id: string; calendar_id: string; home_team_id: string; away_team_id: string; home_score: number; away_score: number; simulated_at: string }

/**
 * Vyrovná dohnaná kola ligy (a její U21), která se odehrála dřív, než runner uměl vyrovnání
 * sám. Zranění z jejich zápasů zkrátí o zpoždění kola, zahojená smaže a zapíše do paměti
 * hráče. Kondici, kterou zápasy dohnaných kol spálily, vrátí v rozsahu regenerace za
 * zpoždění. Únava ze zápasu se pozná z `condition_log` (zdroj `match`, tým a čas zápasu).
 * Každé kolo si v CACHE_KV označí, druhý běh ho přeskočí.
 */
export async function settleCaughtUpLeague(
  db: D1Database, kv: KVNamespace | undefined, leagueId: string, opts: { dryRun: boolean; now?: Date },
): Promise<SettleCatchUpResult> {
  const { dryRun } = opts;
  const stop = (reason: string): SettleCatchUpResult => ({ ok: false, reason, dryRun, rounds: [], sample: [] });
  if (!kv) return stop("Chybí CACHE_KV, bez značky by opakovaný běh zkracoval zranění znovu.");

  const league = await db.prepare("SELECT id, COALESCE(league_type, 'senior') AS league_type FROM leagues WHERE id = ?")
    .bind(leagueId).first<{ id: string; league_type: string }>();
  if (!league) return stop("Soutěž nenalezena.");
  if (league.league_type !== "senior") return stop("Zadej seniorskou soutěž, U21 se vyrovná s ní.");
  const u21 = await db.prepare("SELECT id FROM leagues WHERE parent_league_id = ? AND league_type = 'u21' LIMIT 1")
    .bind(leagueId).first<{ id: string }>();
  const leagueIds = u21 ? [leagueId, u21.id] : [leagueId];

  const rounds: RoundRow[] = [];
  for (const id of leagueIds) {
    const rows = await db.prepare(
      `SELECT c.id, c.league_id, c.game_week, c.scheduled_at, MIN(m.simulated_at) AS first_sim
         FROM season_calendar c JOIN matches m ON m.calendar_id = c.id AND m.status = 'simulated'
        WHERE c.league_id = ? AND c.status = 'simulated'
          AND c.season_number = (SELECT MAX(season_number) FROM season_calendar WHERE league_id = ?)
        GROUP BY c.id ORDER BY c.game_week`,
    ).bind(id, id).all<RoundRow>();
    rounds.push(...rows.results);
  }

  // Zápasy všech odehraných kol: z nich se pozná, kdy tým hrál příště (konec okna únavy).
  const calendarIds = rounds.map((r) => r.id);
  const matches: MatchRow[] = [];
  for (let i = 0; i < calendarIds.length; i += 50) {
    const chunk = calendarIds.slice(i, i + 50);
    const rows = await db.prepare(
      `SELECT id, calendar_id, home_team_id, away_team_id, home_score, away_score, simulated_at
         FROM matches WHERE status = 'simulated' AND calendar_id IN (${chunk.map(() => "?").join(",")})`,
    ).bind(...chunk).all<MatchRow>();
    matches.push(...rows.results);
  }
  const teamPlays = new Map<string, number[]>();
  for (const m of matches) {
    const t = Date.parse(m.simulated_at);
    for (const team of [m.home_team_id, m.away_team_id]) teamPlays.set(team, [...(teamPlays.get(team) ?? []), t]);
  }
  for (const list of teamPlays.values()) list.sort((a, b) => a - b);

  const result: SettleCatchUpResult = { ok: true, dryRun, rounds: [], sample: [] };
  const stmts: D1PreparedStatement[] = [];
  const recovered = new Map<string, number>();
  const healedAt = (opts.now ?? new Date()).toISOString();

  for (const round of rounds) {
    const lagDays = round.first_sim ? catchUpLagDays(round.scheduled_at, new Date(round.first_sim)) : 0;
    if (lagDays <= 0) continue;
    const report: SettledRound = {
      leagueId: round.league_id, calendarId: round.id, gameWeek: round.game_week, lagDays,
      alreadySettled: false, injuriesShortened: 0, injuriesHealed: 0, playersRecovered: 0,
    };
    result.rounds.push(report);
    const marker = await kv.get(settledKey(round.id))
      .catch((e) => { logger.warn({ module: M }, `značka vyrovnání kola ${round.id}`, e); return "unknown"; });
    if (marker) { report.alreadySettled = true; continue; }

    const roundMatches = matches.filter((m) => m.calendar_id === round.id);

    // Zranění: zkrátit o zpoždění, co by se do dneška zahojilo, smazat. Ze zápasů kola
    // a z událostí mezi koly (bez zápasu, vzniklé mezi tímto a dalším kolem ligy).
    const ids = roundMatches.map((m) => m.id);
    type InjuryRow = { id: string; player_id: string; days_remaining: number; days_total: number; description: string | null; is_fake: number; osobni_volno: number };
    const injuries: InjuryRow[] = ids.length === 0 ? [] : (await db.prepare(
      `SELECT id, player_id, days_remaining, days_total, description, is_fake, osobni_volno
         FROM injuries WHERE days_remaining > 0 AND match_id IN (${ids.map(() => "?").join(",")})`,
    ).bind(...ids).all<InjuryRow>()).results;
    if (round.first_sim) {
      const start = Date.parse(round.first_sim);
      const next = rounds.find((r) => r.league_id === round.league_id && r.game_week > round.game_week && r.first_sim);
      const end = next?.first_sim ? Date.parse(next.first_sim) : start + 10 * 60_000;
      const eventInjuries = await db.prepare(
        `SELECT id, player_id, days_remaining, days_total, description, is_fake, osobni_volno
           FROM injuries
          WHERE days_remaining > 0 AND match_id IS NULL AND is_fake = 0 AND osobni_volno = 0
            AND team_id IN (SELECT id FROM teams WHERE league_id = ?)
            AND created_at >= ? AND created_at < ?`,
      ).bind(round.league_id, sqlTime(start), sqlTime(end)).all<InjuryRow>();
      injuries.push(...eventInjuries.results);
    }
    for (const inj of injuries) {
      const left = catchUpInjuryDaysRemaining(inj.days_remaining, lagDays);
      if (left > 0) {
        report.injuriesShortened++;
        stmts.push(db.prepare("UPDATE injuries SET days_remaining = ? WHERE id = ?").bind(left, inj.id));
      } else {
        report.injuriesHealed++;
        stmts.push(healedInjuryStmt(db, inj.player_id, {
          description: inj.description, daysTotal: inj.days_total, volno: inj.osobni_volno === 1, fake: inj.is_fake === 1,
        }, healedAt));
        stmts.push(db.prepare("DELETE FROM injuries WHERE id = ?").bind(inj.id));
      }
    }

    // Únava ze zápasů kola: záznamy `match` týmů zápasu od výkopu do dalšího zápasu týmu.
    // Záznam vzniká až po financích a reportu zápasu (na produ 22 s po `simulated_at`),
    // proto okno 5 minut, ale nikdy přes další zápas týchž týmů.
    for (const m of roundMatches) {
      const sim = Date.parse(m.simulated_at);
      const nextPlay = (team: string) => (teamPlays.get(team) ?? []).find((t) => t > sim) ?? Infinity;
      const end = Math.min(sim + 5 * 60_000, nextPlay(m.home_team_id) - 1000, nextPlay(m.away_team_id) - 1000);
      const drains = await db.prepare(
        `SELECT player_id, delta FROM condition_log
          WHERE source = 'match' AND description = ? AND team_id IN (?, ?) AND delta < 0
            AND created_at >= ? AND created_at <= ?`,
      ).bind(`Zápas (${m.home_score}:${m.away_score})`, m.home_team_id, m.away_team_id, sqlTime(sim - 2000), sqlTime(end))
        .all<{ player_id: string; delta: number }>();
      const players = drains.results.length === 0 ? [] : (await db.prepare(
        `SELECT id, age, COALESCE(json_extract(physical, '$.stamina'), json_extract(skills, '$.stamina'), 40) AS stamina
           FROM players WHERE id IN (${drains.results.map(() => "?").join(",")})`,
      ).bind(...drains.results.map((d) => d.player_id)).all<{ id: string; age: number | null; stamina: number | null }>()).results;
      const info = new Map(players.map((p) => [p.id, p]));
      for (const d of drains.results) {
        const p = info.get(d.player_id);
        const back = Math.min(-d.delta, lagDays * dailyConditionRecovery(p?.stamina, p?.age));
        recovered.set(d.player_id, (recovered.get(d.player_id) ?? 0) + back);
        report.playersRecovered++;
      }
    }
  }

  // Kondice: vrácená únava, nejvýš do 100.
  const current = await loadConditions(db, [...recovered.keys()]);
  const after: number[] = [];
  for (const [playerId, back] of recovered) {
    const row = current.get(playerId);
    if (!row || row.condition === null || !row.teamId) continue;
    const to = Math.min(100, Math.round(row.condition + back));
    after.push(to);
    if (to === row.condition) continue;
    result.sample.push({ playerId, from: row.condition, to });
    stmts.push(db.prepare("UPDATE players SET life_context = json_set(life_context, '$.condition', ?) WHERE id = ?").bind(to, playerId));
    stmts.push(logConditionStmt(db, playerId, row.teamId, row.condition, to, "recovery", "Regenerace za kola dohnaná po termínu"));
  }
  result.sample.sort((a, b) => (b.to - b.from) - (a.to - a.from));
  result.sample = result.sample.slice(0, 15);
  if (after.length > 0) result.conditionAfterAvg = Math.round(after.reduce((a, b) => a + b, 0) / after.length * 10) / 10;

  if (dryRun) return result;

  // Značky před zápisem: kdyby dávka spadla napůl, kolo zůstane vyrovnané jen zčásti, ale
  // druhý běh už nezkrátí zranění podruhé. Chyba jde volajícímu do logu.
  for (const r of result.rounds) {
    if (r.alreadySettled) continue;
    await kv.put(settledKey(r.calendarId), healedAt);
  }
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
  logger.info({ module: M }, `liga ${leagueId}: vyrovnáno ${result.rounds.filter((r) => !r.alreadySettled).length} dohnaných kol`);
  return result;
}

async function loadConditions(db: D1Database, ids: string[]): Promise<Map<string, { condition: number | null; teamId: string }>> {
  const out = new Map<string, { condition: number | null; teamId: string }>();
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    const rows = await db.prepare(
      `SELECT id, team_id, json_extract(life_context, '$.condition') AS condition
         FROM players WHERE id IN (${chunk.map(() => "?").join(",")})`,
    ).bind(...chunk).all<{ id: string; team_id: string; condition: number | null }>();
    for (const r of rows.results) out.set(r.id, { condition: r.condition, teamId: r.team_id });
  }
  return out;
}
