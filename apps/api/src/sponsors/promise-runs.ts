/**
 * Sliby sponzorům: běhy vyhodnocení a drobné dotazy pro routy.
 * - denní tick: termínové sliby (`evaluateDeadlinePromises`),
 * - rollover: sezónní sliby, u smluv končících tímhle rolloverem i exkluzivita oboru
 *   a termínové sliby (`evaluateSeasonPromises`), posun termínů na novou časovou osu
 *   a vynulování počítadla porušení,
 * - routy: exkluzivita oboru, výpis slibů klubu, logo na rukávu.
 *
 * Vyhodnocují se jen sliby aktivních smluv (nahrazené, vypršelé a vypovězené zůstávají čekat,
 * resolvePromise je stejně nenárokuje).
 */
import { logger } from "../lib/logger";
import { DEFAULT_CUP_ROUNDS, MONTHS_PER_SEASON } from "./ambition";
import { loadDeadlineState, loadSeasonStats } from "./promise-data";
import {
  DEADLINE_KINDS, EMPTY_SEASON_STATS, evaluateDeadlinePromise, evaluateSeasonalPromise, isPromiseKind, isPromiseStatus,
  parsePromiseParams, promiseActualText, promiseLabel, SEASONAL_KINDS,
  type DeadlineState, type PromiseKind, type PromiseStatus, type SeasonStats,
} from "./promise-eval";
import {
  applyContractOutcomes, type ContractRow, type PromiseEvaluation, type PromiseRow, type ResolveContext,
} from "./promise-resolve";

const M = "sponsor-promises";
/** Značka v season_end_progress: termíny staré sezóny už jsou posunuté. */
const SHIFT_MARKER = "__sponsor_promises__";

/** Firma, která v běhu smlouvu vypověděla. */
export interface TerminatedSponsor {
  teamId: string;
  sponsorId: number;
}

export interface RunResult {
  resolved: number;
  skipped: number;
  terminated: number;
  /** Kdo v běhu vypověděl: rollover je vyřadí ze sezónních SMS majitelů (enqueueSeasonEndSms). */
  terminatedSponsors: TerminatedSponsor[];
}

interface PendingJoinRow extends PromiseRow {
  sponsor_name: string;
  category: string | null;
  seasons_remaining: number;
}

const PENDING_SELECT = `
  SELECT p.id, p.contract_id, p.team_id, p.sponsor_id, p.kind, p.params, p.season, p.deadline_game_date,
         p.reward, p.penalty, p.status, sc.sponsor_name, sc.category, sc.seasons_remaining
  FROM sponsor_promises p JOIN sponsor_contracts sc ON sc.id = p.contract_id
  WHERE p.status = 'pending' AND sc.status = 'active'`;

/** Klíče druhů do SQL `IN (…)`. Jen konstanty z promise-kinds, žádný vstup od hráče. */
function sqlList(kinds: Iterable<PromiseKind>): string {
  return [...kinds].map((k) => `'${k}'`).join(", ");
}

function emptyResult(): RunResult {
  return { resolved: 0, skipped: 0, terminated: 0, terminatedSponsors: [] };
}

function groupBy<T>(rows: readonly T[], key: (r: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = out.get(k) ?? [];
    list.push(r);
    out.set(k, list);
  }
  return out;
}

function contractOf(r: PendingJoinRow): ContractRow {
  return {
    id: r.contract_id, team_id: r.team_id, sponsor_id: r.sponsor_id, sponsor_name: r.sponsor_name,
    category: r.category, seasons_remaining: r.seasons_remaining,
  };
}

async function applyPerContract(
  db: D1Database, teamId: string, evaluations: PromiseEvaluation[], rows: PendingJoinRow[],
  ctx: ResolveContext, result: RunResult,
): Promise<void> {
  for (const [contractId, list] of groupBy(evaluations, (e) => e.row.contract_id)) {
    const first = rows.find((r) => r.contract_id === contractId);
    if (!first) continue;
    try {
      const out = await applyContractOutcomes(db, contractOf(first), list, ctx);
      result.resolved += out.applied.length;
      if (out.terminated) result.terminated++;
      if (out.terminatedSponsorId !== null) result.terminatedSponsors.push({ teamId, sponsorId: out.terminatedSponsorId });
    } catch (e) {
      logger.error({ module: M, teamId }, `důsledky slibů smlouvy ${contractId}`, e);
    }
  }
}

/**
 * Termínový slib k danému dni. `null` = zatím nic (čeká na splnění nebo na termín),
 * nebo nejde vyhodnotit (pak `result.skipped` a varování).
 */
function evaluateDeadlineRow(
  r: PendingJoinRow, state: DeadlineState, day: string, teamId: string, result: RunResult,
): PromiseEvaluation | null {
  if (!isPromiseKind(r.kind)) return null;
  const params = parsePromiseParams(r.params);
  const ev = params ? evaluateDeadlinePromise(r.kind, params, state, r.sponsor_id, day, r.deadline_game_date) : null;
  if (ev === null) {
    result.skipped++;
    logger.warn({ module: M, teamId }, `slib ${r.id} (${r.kind}) nejde vyhodnotit, zůstává čekat`);
    return null;
  }
  if (ev === "pending") return null;
  return { row: r, kind: r.kind, outcome: ev.outcome, actual: ev.actual };
}

/**
 * Denní tick: licence, stavba a logo. Splněno, jakmile platí; porušeno den po termínu.
 * `teamId` zúží běh na jeden klub (route po logu na rukávu). Vratka zálohy při výpovědi
 * počítá se skutečným postupem sezóny (progressMonths se nepředává).
 */
export async function evaluateDeadlinePromises(
  db: D1Database, todayIso: string, opts: { teamId?: string } = {},
): Promise<RunResult> {
  const today = todayIso.slice(0, 10);
  const teamFilter = opts.teamId ?? null;
  const result = emptyResult();

  // Logo na rukávu patří jen aktivnímu sponzorovi: po konci smlouvy z dresu zmizí.
  await db.prepare(
    `UPDATE teams SET sleeve_sponsor_id = NULL
     WHERE sleeve_sponsor_id IS NOT NULL AND (?1 IS NULL OR id = ?1)
       AND NOT EXISTS (SELECT 1 FROM sponsor_contracts sc WHERE sc.team_id = teams.id
                         AND sc.sponsor_id = teams.sleeve_sponsor_id AND sc.status = 'active')`,
  ).bind(teamFilter).run();

  const rows = await db.prepare(
    `${PENDING_SELECT} AND p.kind IN (${sqlList(DEADLINE_KINDS)}) AND (?1 IS NULL OR p.team_id = ?1)
     ORDER BY p.team_id, p.contract_id, p.id`,
  ).bind(teamFilter).all<PendingJoinRow>();

  for (const [teamId, teamRows] of groupBy(rows.results, (r) => r.team_id)) {
    try {
      const state = await loadDeadlineState(db, teamId);
      const evaluations: PromiseEvaluation[] = [];
      for (const r of teamRows) {
        const ev = evaluateDeadlineRow(r, state, today, teamId, result);
        if (ev) evaluations.push(ev);
      }
      await applyPerContract(db, teamId, evaluations, teamRows, { gameDate: todayIso, day: today }, result);
    } catch (e) {
      logger.error({ module: M, teamId }, "vyhodnocení slibů s termínem", e);
    }
  }
  return result;
}

/** Poslední herní den sezóny podle kalendáře senior lig (stará časová osa). */
async function lastSeasonDay(db: D1Database, season: number): Promise<string | null> {
  const row = await db.prepare(
    `SELECT MAX(substr(sc.scheduled_at, 1, 10)) AS d FROM season_calendar sc
     JOIN leagues l ON l.id = sc.league_id
     WHERE l.league_type = 'senior' AND sc.season_number = ?`,
  ).bind(season).first<{ d: string | null }>();
  return row?.d ?? null;
}

/** Počet kol poháru sezóny pro popisky slibů (jako etapa 2 v negotiation-db.ts). */
async function cupTotalRoundsOf(db: D1Database, season: number): Promise<number> {
  const row = await db.prepare(
    "SELECT total_rounds FROM cup_competitions WHERE season_number = ? ORDER BY rowid DESC LIMIT 1",
  ).bind(season).first<{ total_rounds: number | null }>();
  return typeof row?.total_rounds === "number" && row.total_rounds > 0 ? row.total_rounds : DEFAULT_CUP_ROUNDS;
}

/**
 * Sezónní sliby sezóny `season`.
 *
 * `atRollover: true` (krok 4a rolloveru, PŘED posunem termínů a expirací smluv):
 * - u smluv, které tímhle rolloverem končí (`seasons_remaining <= 1`), se uzná exkluzivita
 *   oboru (season i termín má NULL) a vyhodnotí termínové sliby k poslednímu dni staré sezóny:
 *   splněný = bonus, nesplněný s termínem ještě v budoucnu = bez pokuty, zůstane čekat
 *   (smlouva končí, vyhodnocení ho už nenárokuje), prošlý termín = porušeno jako v ticku,
 * - vratka zálohy při výpovědi počítá s celou odehranou sezónou (`MONTHS_PER_SEASON`):
 *   herní čas už je vrácený na začátek nové sezóny, ale seasons_remaining ještě ne.
 *
 * `atRollover: false` (ruční admin běh během sezóny): jen sezónní sliby nad dosavadními daty,
 * končící smlouvy se neuzavírají a vratka počítá se skutečným postupem sezóny.
 *
 * `skipDeadlineKinds: true`: opakovaný pokus o rollover, kterému už jednou proběhl
 * `shiftPromiseDeadlinesForRollover` (marker v season_end_progress existuje). Termíny jsou
 * pak na nové časové ose a seasons_remaining mohl být už snížený, takže se končící smlouvy
 * (termínové sliby i exkluzivita oboru) v tomto běhu vůbec neuzavírají. Jejich sliby zůstanou
 * pending: pokud smlouva mezitím vypršela, nikdo je už nevyhodnotí (neaktivní smlouvy se
 * přeskakují), jinak je dožene denní tick nebo další rollover. Bez vlivu na `atRollover: false`.
 */
export async function evaluateSeasonPromises(
  db: D1Database, season: number,
  ctx: { gameDate: string; day: string; agedSinceSeason: boolean; atRollover: boolean; skipDeadlineKinds?: boolean },
): Promise<RunResult> {
  const result = emptyResult();
  const endingContracts = ctx.atRollover && !ctx.skipDeadlineKinds
    ? `OR (p.kind = 'sector_exclusivity' AND sc.seasons_remaining <= 1)`
      + ` OR (p.kind IN (${sqlList(DEADLINE_KINDS)}) AND sc.seasons_remaining <= 1)`
    : "";
  const rows = await db.prepare(
    `${PENDING_SELECT}
       AND ((p.season = ?1 AND p.kind IN (${sqlList(SEASONAL_KINDS)}))
            ${endingContracts})
     ORDER BY p.team_id, p.contract_id, p.id`,
  ).bind(season).all<PendingJoinRow>();
  if (rows.results.length === 0) return result;

  const cupTotalRounds = await cupTotalRoundsOf(db, season);
  const resolveCtx: ResolveContext = {
    gameDate: ctx.gameDate, day: ctx.day, cupTotalRounds,
    ...(ctx.atRollover ? { progressMonths: MONTHS_PER_SEASON } : {}),
  };
  const isDeadline = (r: PendingJoinRow) => isPromiseKind(r.kind) && DEADLINE_KINDS.has(r.kind);
  const deadlineDay = rows.results.some(isDeadline) ? (await lastSeasonDay(db, season)) ?? ctx.day : ctx.day;

  for (const [teamId, teamRows] of groupBy(rows.results, (r) => r.team_id)) {
    try {
      const needsStats = teamRows.some((r) => r.kind !== "sector_exclusivity" && !isDeadline(r));
      const stats: SeasonStats = needsStats
        ? await loadSeasonStats(db, teamId, season, { agedSinceSeason: ctx.agedSinceSeason })
        : EMPTY_SEASON_STATS;
      const state = teamRows.some(isDeadline) ? await loadDeadlineState(db, teamId) : null;
      const evaluations: PromiseEvaluation[] = [];
      for (const r of teamRows) {
        if (!isPromiseKind(r.kind)) continue;
        if (state && DEADLINE_KINDS.has(r.kind)) {
          const ev = evaluateDeadlineRow(r, state, deadlineDay, teamId, result);
          if (ev) evaluations.push(ev);
          continue;
        }
        const params = parsePromiseParams(r.params);
        const ev = params ? evaluateSeasonalPromise(r.kind, params, stats) : null;
        if (ev === null) {
          result.skipped++;
          logger.warn({ module: M, teamId }, `slib ${r.id} (${r.kind}) za sezónu ${season} nejde vyhodnotit, zůstává čekat`);
          continue;
        }
        evaluations.push({ row: r, kind: r.kind, outcome: ev.outcome, actual: ev.actual });
      }
      await applyPerContract(db, teamId, evaluations, teamRows, resolveCtx, result);
    } catch (e) {
      logger.error({ module: M, teamId }, `vyhodnocení sezónních slibů za sezónu ${season}`, e);
    }
  }
  return result;
}

/**
 * Rollover vrací herní čas na reálné datum. Čekající termíny ze staré osy by jinak
 * dostaly desítky dní navíc. Zbytek lhůty od posledního dne staré sezóny se přičte
 * k prvnímu dni nové. Posun a značka jdou v jednom batchi (transakce), takže opakovaný
 * rollover termíny neposune podruhé. Běží AŽ po evaluateSeasonPromises (ta čte termíny
 * ve staré ose). `true` = něco se posunulo.
 */
export async function shiftPromiseDeadlinesForRollover(db: D1Database, oldSeason: number, newDay: string): Promise<boolean> {
  const last = await lastSeasonDay(db, oldSeason);
  if (!last) return false;
  const res = await db.batch([
    db.prepare(
      `UPDATE sponsor_promises
          SET deadline_game_date = date(?1, '+' || CAST(MAX(0, ROUND(julianday(substr(deadline_game_date, 1, 10)) - julianday(?2))) AS INTEGER) || ' days')
        WHERE status = 'pending' AND deadline_game_date IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM season_end_progress
                          WHERE league_id = ?3 AND season_number = ?4 AND phase = 'deadline_shift')`,
    ).bind(newDay.slice(0, 10), last, SHIFT_MARKER, oldSeason),
    db.prepare(
      `INSERT OR IGNORE INTO season_end_progress (league_id, season_number, phase, status, updated_at)
       VALUES (?, ?, 'deadline_shift', 'done', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
    ).bind(SHIFT_MARKER, oldSeason),
  ]);
  return (res[0]?.meta?.changes ?? 0) > 0;
}

/**
 * `true` = termíny staré sezóny `oldSeason` už `shiftPromiseDeadlinesForRollover` posunul
 * (marker v `season_end_progress` existuje). Rollover si tím před opakovaným pokusem ověří,
 * jestli má `evaluateSeasonPromises` přeskočit termínové sliby končících smluv
 * (`skipDeadlineKinds`) — jinak by je vyhodnotil podle dne, který už neplatí.
 */
export async function deadlinesAlreadyShifted(db: D1Database, oldSeason: number): Promise<boolean> {
  const row = await db.prepare(
    "SELECT 1 FROM season_end_progress WHERE league_id = ? AND season_number = ? AND phase = 'deadline_shift'",
  ).bind(SHIFT_MARKER, oldSeason).first();
  return row !== null;
}

/** Nová sezóna = nové počítání porušení. Běží v rolloveru AŽ po vyhodnocení sezónních slibů. */
export async function resetSeasonBreaches(db: D1Database): Promise<void> {
  await db.prepare("UPDATE sponsor_contracts SET breaches_season = 0 WHERE breaches_season != 0").run();
}

/** Obory chráněné slibem exkluzivity u aktivních smluv klubu: obor → firma. */
export async function exclusiveSectors(db: D1Database, teamId: string): Promise<Map<string, string>> {
  const rows = await db.prepare(
    `SELECT ds.type, sc.sponsor_name
     FROM sponsor_promises p
     JOIN sponsor_contracts sc ON sc.id = p.contract_id
     JOIN district_sponsors ds ON ds.id = p.sponsor_id
     WHERE p.team_id = ? AND p.kind = 'sector_exclusivity' AND p.status = 'pending' AND sc.status = 'active'`,
  ).bind(teamId).all<{ type: string; sponsor_name: string }>();
  return new Map(rows.results.map((r) => [r.type, r.sponsor_name]));
}

export interface PromiseView {
  id: string;
  contractId: string;
  sponsorId: number;
  kind: PromiseKind;
  label: string;
  season: number | null;
  deadline: string | null;
  status: PromiseStatus;
  reward: number;
  penalty: number;
  actualText: string | null;
  canPlaceSleeveLogo: boolean;
}

interface PromiseListRow {
  id: string; contract_id: string; sponsor_id: number; kind: string; params: string | null; season: number | null;
  deadline_game_date: string | null; status: string; reward: number; penalty: number; actual_value: number | null;
}

/**
 * Sliby u aktivních smluv klubu pro stránku Sponzoři. Pokuty a bonusy nejsou veřejné,
 * routa nad tímhle výpisem patří jen majiteli klubu.
 */
export async function listTeamPromises(db: D1Database, teamId: string): Promise<PromiseView[]> {
  const rows = await db.prepare(
    `SELECT p.id, p.contract_id, p.sponsor_id, p.kind, p.params, p.season, p.deadline_game_date, p.status,
            p.reward, p.penalty, p.actual_value
     FROM sponsor_promises p JOIN sponsor_contracts sc ON sc.id = p.contract_id
     WHERE p.team_id = ? AND sc.status = 'active'
     ORDER BY p.contract_id, CASE WHEN p.season IS NULL THEN 0 ELSE 1 END, p.season, p.deadline_game_date, p.id`,
  ).bind(teamId).all<PromiseListRow>();

  // Pohárové kolo se jmenuje podle počtu kol poháru té sezóny, stejně jako při podpisu.
  const cupRounds = new Map<number, number>();
  if (rows.results.some((r) => r.kind === "cup_round")) {
    const cups = await db.prepare("SELECT season_number, total_rounds FROM cup_competitions ORDER BY rowid")
      .all<{ season_number: number; total_rounds: number }>();
    for (const c of cups.results) cupRounds.set(c.season_number, c.total_rounds);
  }

  // Rukáv smí nést jen jednoho sponzora najednou (placeSleeveLogo): tlačítko se ukáže, jen
  // když ho drží tenhle sponzor, nebo nikdo — jinak by klik skončil 409.
  let sleeveHolder: number | null = null;
  if (rows.results.some((r) => r.kind === "jersey_logo" && r.status === "pending")) {
    const sleeve = await db.prepare(
      `SELECT t.sleeve_sponsor_id AS id FROM teams t
       WHERE t.id = ? AND t.sleeve_sponsor_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM sponsor_contracts sc WHERE sc.team_id = t.id AND sc.sponsor_id = t.sleeve_sponsor_id AND sc.status = 'active')`,
    ).bind(teamId).first<{ id: number | null }>();
    sleeveHolder = sleeve?.id ?? null;
  }

  const out: PromiseView[] = [];
  for (const r of rows.results) {
    if (!isPromiseKind(r.kind)) continue;
    const status: PromiseStatus = isPromiseStatus(r.status) ? r.status : "pending";
    const rounds = (r.season !== null ? cupRounds.get(r.season) : undefined) ?? DEFAULT_CUP_ROUNDS;
    out.push({
      id: r.id,
      contractId: r.contract_id,
      sponsorId: r.sponsor_id,
      kind: r.kind,
      label: promiseLabel(r.kind, parsePromiseParams(r.params) ?? {}, rounds),
      season: r.season,
      deadline: r.deadline_game_date,
      status,
      reward: r.reward ?? 0,
      penalty: r.penalty ?? 0,
      actualText: promiseActualText(r.kind, r.actual_value, rounds),
      canPlaceSleeveLogo: r.kind === "jersey_logo" && status === "pending" && (sleeveHolder === null || sleeveHolder === r.sponsor_id),
    });
  }
  return out;
}

export type SleeveLogoResult =
  | { ok: true; status: PromiseStatus }
  | { ok: false; error: string; code: 400 | 404 | 409 };

/**
 * Logo sponzora stadionu na rukáv dresu. Slib se hned vyhodnotí, splní se ještě v tomtéž
 * požadavku. Logo smí na rukáv jen smlouva kategorie „stadium" (hlavní ani banner ne) a
 * rukáv smí nést vždycky jen jednoho sponzora — dokud aktivní smlouva jiné firmy logo drží,
 * novou tam vložit nejde (nejdřív by musela ta stará smlouva skončit).
 */
export async function placeSleeveLogo(db: D1Database, teamId: string, promiseId: string, todayIso: string): Promise<SleeveLogoResult> {
  const row = await db.prepare(
    `SELECT p.id, p.kind, p.status, p.sponsor_id, sc.status AS contract_status, sc.category
     FROM sponsor_promises p JOIN sponsor_contracts sc ON sc.id = p.contract_id
     WHERE p.id = ? AND p.team_id = ?`,
  ).bind(promiseId, teamId).first<{
    id: string; kind: string; status: string; sponsor_id: number; contract_status: string; category: string | null;
  }>();
  if (!row) return { ok: false, error: "Slib nenalezen", code: 404 };
  if (row.kind !== "jersey_logo") return { ok: false, error: "Tenhle slib se logem na rukávu neplní", code: 400 };
  // Stav před kategorií: už vyřízený slib je 409, i kdyby (nemožnou shodou) patřil ke smlouvě
  // jiné kategorie — klient tak vždycky pozná „už se nedá nic dělat" dřív než „na tohle to nejde".
  if (row.status !== "pending" || row.contract_status !== "active") return { ok: false, error: "Slib už je vyřízený", code: 409 };
  if (row.category !== "stadium") return { ok: false, error: "Logo na rukáv patří sponzorovi stadionu", code: 400 };

  const conflict = await db.prepare(
    `SELECT 1 FROM teams t
     WHERE t.id = ? AND t.sleeve_sponsor_id IS NOT NULL AND t.sleeve_sponsor_id != ?
       AND EXISTS (SELECT 1 FROM sponsor_contracts sc WHERE sc.team_id = t.id AND sc.sponsor_id = t.sleeve_sponsor_id AND sc.status = 'active')`,
  ).bind(teamId, row.sponsor_id).first();
  if (conflict) return { ok: false, error: "Rukáv už nese logo jiného sponzora", code: 409 };

  await db.prepare("UPDATE teams SET sleeve_sponsor_id = ? WHERE id = ?").bind(row.sponsor_id, teamId).run();
  await evaluateDeadlinePromises(db, todayIso, { teamId });
  const after = await db.prepare("SELECT status FROM sponsor_promises WHERE id = ?").bind(promiseId).first<{ status: string }>();
  return { ok: true, status: isPromiseStatus(after?.status) ? after.status : "pending" };
}
