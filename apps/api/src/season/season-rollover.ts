/**
 * GLOBÁLNÍ rollover do nové sezóny — všechny senior ligy NAJEDNOU, po fázích.
 *
 * Jedna nová globální sezóna (`seasons`), synchronizovaný start kalendáře a
 * sdílený `game_date` napříč všemi ligami (sezóna je globální, ne per-liga).
 * Staré zápasy/kalendář zůstávají (historie); season-aware standings je ignoruje.
 *
 * Mirror logiky z bootstrap-league (game.ts), BEZ tvorby AI týmů. Před rozpisem proběhne
 * postup a sestup mezi okresním přeborem a III. třídou (`league/district-promotion.ts`).
 * Rozpis dostane i liga založená v přípravném období (bez zápasů staré sezóny).
 *
 * PO FÁZÍCH (ROLLOVER_PHASES). Do 24. 10. 2026 byl rollover jeden dlouhý krok. 21. 10. 2026
 * po stárnutí a dospívání dorostu přestal zapisovat (D1 má strop dotazů na jednu invokaci a
 * chyby se tu polykají): dorostový cyklus, marker stárnutí ani marker celého rolloveru se
 * nezapsaly, a admin přesto dostal „hotovo". Teď je každá fáze vlastní krok `runEndSeasonStep`
 * (vlastní invokace), velké fáze jdou po dávkách s kurzorem a každá má marker
 * v `season_end_progress`. Chyba zápisu markeru krok shodí, místo aby se tvářil hotový.
 *
 * Opakování: fáze jsou idempotentní (guard, INSERT OR IGNORE, markery uvnitř), nevratné
 * kroky mají zvláštní ochranu: stárnutí dorostu jde s markerem v jedné transakci, dospívání
 * zapisuje kurzor před zápisem dorostu a sponzoři s volbami běží nejvýš jednou (AT_MOST_ONCE).
 */

import { createRng, cryptoSeed } from "../generators/rng";
import { logger } from "../lib/logger";
import {
  ROLLOVER_KEY, U21_PROGRESS_KEY, VILLAGES_PROGRESS_KEY,
  insertProgressIfMissing, parseCursor, progressStatement, readProgress, writeProgress,
  type ProgressKey, type ProgressRow,
} from "./season-progress";
import { clearFreshAcademyFlags, runYouthCycleChunk } from "./u21-lifecycle";

const M = "season-rollover";

export interface GlobalRolloverResult {
  newSeasonNumber: number;
  rolledLeagues: number;
  matchesCreated: number;
}

/** „2 smlouvy vypršely" / „5 smluv vypršelo" — čeština počítá jinak než angličtina. */
export function smlouvyVyprsely(pocet: number): string {
  if (pocet >= 2 && pocet <= 4) return `${pocet} sponzorské smlouvy vypršely`;
  return `${pocet} sponzorských smluv vypršelo`;
}

/**
 * Krok 4a rolloveru: sezónní sliby sponzorům (etapa 3), posun termínů na novou časovou osu
 * a vynulování počítadla porušení pro novou sezónu. Vlastní exportovaná funkce kvůli
 * testovatelnosti a jasnému pořadí — volá se AŽ po synchronizaci s reálným kalendářem
 * (`startIso` už nese nové herní datum, krok 2/3) a PŘED krokem 4b (expirace smluv): smlouvy,
 * které teď vyprší, jsou ještě aktivní, takže se jim sezónní sliby i exkluzivita oboru
 * vyhodnotí, a výpověď sponzorem (za nesplněné sliby) má přednost před obyčejným vypršením.
 * Postup a sestup (krok 2b) už kluby přesunul do nové ligy; místo v tabulce se proto bere
 * z ligy, ve které klub skončenou sezónu hrál (promise-data.ts), ne z té současné.
 *
 * Retry bezpečné: když předchozí pokus o rollover termíny staré sezóny už posunul
 * (`shiftPromiseDeadlinesForRollover` nechal marker), vyhodnocení termínové sliby končících
 * smluv přeskočí (`skipDeadlineKinds`) — jinak by je posoudilo podle dne, který na nové
 * časové ose už neplatí. Každá část ve vlastním try, chyba nesmí shodit zbytek rolloveru.
 *
 * Vrací firmy, které v běhu smlouvu vypověděly (per tým + sponzor) — volající je vyřadí ze
 * sezónních SMS majitelů (`enqueueSeasonEndSms`) stejně jako vypršelé hlavní smlouvy.
 */
export async function rolloverSponsorPromises(
  db: D1Database, oldSeasonNumber: number, startIso: string,
): Promise<Array<{ team_id: string; sponsor_id: number }>> {
  const promiseDay = startIso.slice(0, 10);
  let terminatedSponsors: Array<{ team_id: string; sponsor_id: number }> = [];
  try {
    const { deadlinesAlreadyShifted, evaluateSeasonPromises } = await import("../sponsors/promise-runs");
    const skipDeadlineKinds = await deadlinesAlreadyShifted(db, oldSeasonNumber);
    const r = await evaluateSeasonPromises(db, oldSeasonNumber, {
      gameDate: startIso, day: promiseDay, agedSinceSeason: true, atRollover: true, skipDeadlineKinds,
    });
    terminatedSponsors = r.terminatedSponsors.map((t) => ({ team_id: t.teamId, sponsor_id: t.sponsorId }));
    logger.info({ module: "season-rollover" }, `sliby sponzorům: ${r.resolved} vyhodnoceno, ${r.skipped} nejde vyhodnotit, ${r.terminated} výpovědí`);
  } catch (e) {
    logger.error({ module: "season-rollover" }, "vyhodnocení sezónních slibů sponzorům", e);
  }
  try {
    const { shiftPromiseDeadlinesForRollover } = await import("../sponsors/promise-runs");
    await shiftPromiseDeadlinesForRollover(db, oldSeasonNumber, promiseDay);
  } catch (e) {
    logger.error({ module: "season-rollover" }, "posun termínů slibů sponzorům", e);
  }
  try {
    const { resetSeasonBreaches } = await import("../sponsors/promise-runs");
    await resetSeasonBreaches(db);
  } catch (e) {
    logger.error({ module: "season-rollover" }, "vynulování porušení slibů za sezónu", e);
  }
  return terminatedSponsors;
}

// ── Fáze rolloveru ──────────────────────────────────────────────────────────

/**
 * Fáze v pořadí, v jakém běží. Pořadí je převzaté z dřívějšího jednoho kroku:
 *  - postup a sestup PŘED rozpisem (tabulky staré sezóny, týmy mají sedět v nové lize dřív,
 *    než jí vznikne rozpis),
 *  - sliby sponzorům AŽ po rozpisu (nové herní datum) a PŘED expirací smluv (sponzors),
 *  - samospráva po smlouvách klubů a před uvítáním (obrazovka /nova-sezona zmíní rozpočet),
 *  - rozpis U21 až po rozpisu áčka (dorost hraje den po něm),
 *  - stárnutí dorostu → dospívání → cyklus (přírůstek i odchod ve 22 se počítají z nového věku)
 *    → úklid značky čerstvého odchovance.
 */
export const ROLLOVER_PHASES = [
  "season_open",
  "promotions",
  "calendars",
  "season_close",
  "sponsors",
  "governance",
  "betting",
  "cup",
  "welcome",
  "u21_schedule",
  "u21_aging",
  "u21_maturation",
  "u21_cycle",
  "u21_flags",
  "municipal_elections",
] as const;
export type RolloverPhase = (typeof ROLLOVER_PHASES)[number];

/**
 * Fáze, které se nesmí pustit dvakrát a idempotentní bez migrace nejdou: odečet sezóny ze
 * sponzorských smluv s +5 náklonnosti majitelů, a nové vedení obcí se SMS. Před během se
 * zapíše „claimed". Najde-li další krok fázi rozběhnutou, předchozí invokace spadla
 * uprostřed a fáze se už znovu nepouští: chybějící SMS je menší škoda než dvakrát
 * odečtená smlouva. Admin to uvidí jako chybu kroku a v logu.
 */
const AT_MOST_ONCE: ReadonlySet<RolloverPhase> = new Set<RolloverPhase>(["sponsors", "municipal_elections"]);

/** Kolik dorostů projde jedna invokace dospívání. Zápisy hráčů jdou v dávce, na dorost ~10 dotazů. */
export const YOUTH_MATURATION_CHUNK = 6;

/** Pojistka pro `rolloverAllLeagues`, ať se při chybě v kódu netočí donekonečna. */
const MAX_ROLLOVER_STEPS = 1000;

export interface RolloverStepResult {
  /** Doběhl celý rollover, tenhle krok zapsal jeho marker. */
  finished: boolean;
  /** Fáze, která v kroku běžela. Null, když už nebylo co dělat. */
  phase: RolloverPhase | null;
  status: "done" | "in_progress" | "error";
  detail: string;
  newSeasonNumber: number;
}

interface RolloverContext {
  oldSeason: number;
  newSeason: number;
  seasonId: string;
  /** Den 1 nové sezóny, stejný pro všechny fáze (viz rolloverStartDate). */
  startDate: Date;
  startIso: string;
}

interface PhaseOutcome {
  done: boolean;
  detail: string;
}

type PhaseRunner = (
  db: D1Database, ctx: RolloverContext, key: ProgressKey, progress: ProgressRow | null,
) => Promise<PhaseOutcome>;

/** Marker celého rolloveru: „in_progress" s kotvou nové sezóny, na konci „done". */
export function rolloverKey(oldSeasonNumber: number): ProgressKey {
  return { leagueId: ROLLOVER_KEY, seasonNumber: oldSeasonNumber, phase: "rollover" };
}

/**
 * Kde má fáze marker. Léto dorostu a komunální volby si nechávají dřívější klíče se sezónou,
 * do které se přechází (`__u21__`/3/`u21_aging` pro přechod 2 → 3). Ostatní fáze patří
 * pod marker celého rolloveru se sezónou, která končí.
 */
export function rolloverPhaseKey(phase: RolloverPhase, oldSeasonNumber: number): ProgressKey {
  const newSeason = oldSeasonNumber + 1;
  if (phase === "municipal_elections") return { leagueId: VILLAGES_PROGRESS_KEY, seasonNumber: newSeason, phase };
  if (phase.startsWith("u21_") && phase !== "u21_schedule") {
    return { leagueId: U21_PROGRESS_KEY, seasonNumber: newSeason, phase };
  }
  return { leagueId: ROLLOVER_KEY, seasonNumber: oldSeasonNumber, phase: `rollover_${phase}` };
}

/**
 * Den 1 nové sezóny: DNEŠNÍ reálné datum v 16:00 UTC, ne herní game_date, které nese starý
 * posun. Spočítá se jednou při založení rolloveru a uloží do jeho markeru, aby všechny fáze
 * počítaly se stejným dnem, i kdyby se rollover dokončoval až další den.
 */
export function rolloverStartDate(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 16, 0, 0, 0));
}

/**
 * Založí rollover sezóny, která končí. Existující marker nechá být: rozběhnutý rollover si
 * drží svou kotvu a hotový zůstane hotový. Vrací stav markeru po založení.
 */
export async function beginRollover(db: D1Database, oldSeasonNumber: number, now = new Date()): Promise<string> {
  const anchor = JSON.stringify({ start: rolloverStartDate(now).toISOString() });
  await insertProgressIfMissing(db, rolloverKey(oldSeasonNumber), "in_progress", anchor);
  const row = await readProgress(db, rolloverKey(oldSeasonNumber));
  if (!row) throw new Error(`rollover sezóny ${oldSeasonNumber}: marker se nezapsal`);
  return row.status;
}

/** Sezóna, jejíž rollover se rozběhl a nedoběhl. Chyba čtení propadne, hádat se tu nesmí. */
export async function findPendingRollover(db: D1Database): Promise<number | null> {
  const row = await db.prepare(
    `SELECT season_number FROM season_end_progress
      WHERE league_id = ? AND phase = 'rollover' AND status != 'done'
      ORDER BY season_number DESC LIMIT 1`,
  ).bind(ROLLOVER_KEY).first<{ season_number: number }>();
  return row?.season_number ?? null;
}

async function loadContext(db: D1Database, oldSeasonNumber: number): Promise<RolloverContext> {
  const key = rolloverKey(oldSeasonNumber);
  const row = await readProgress(db, key);
  let start = parseCursor<{ start?: string }>(row?.cursor, {}).start;
  if (!start) {
    // Marker bez kotvy (založený ručně): kotvou je dnešek a hned se zapíše, ať ji sdílí všechny fáze.
    start = rolloverStartDate(new Date()).toISOString();
    await writeProgress(db, key, row?.status ?? "in_progress", JSON.stringify({ start }));
  }
  const newSeason = oldSeasonNumber + 1;
  return {
    oldSeason: oldSeasonNumber,
    newSeason,
    seasonId: `season-${newSeason}`,
    startDate: new Date(start),
    startIso: start,
  };
}

/**
 * Jeden krok rolloveru: první nehotová fáze, u velkých fází jedna dávka. Volá ho
 * `runEndSeasonStep` opakovaně, dokud nevrátí `finished`. Každý krok je samostatná
 * invokace s vlastním stropem dotazů na D1.
 */
export async function runRolloverStep(db: D1Database, oldSeasonNumber: number): Promise<RolloverStepResult> {
  const ctx = await loadContext(db, oldSeasonNumber);
  for (const phase of ROLLOVER_PHASES) {
    const key = rolloverPhaseKey(phase, oldSeasonNumber);
    const progress = await readProgress(db, key);
    if (progress?.status === "done") continue;
    return await runPhase(db, ctx, phase, key, progress);
  }

  const calendars = await readProgress(db, rolloverPhaseKey("calendars", oldSeasonNumber));
  const c = parseCursor(calendars?.cursor, { leagues: [] as string[], rolled: 0, matches: 0 });
  await writeProgress(db, rolloverKey(oldSeasonNumber), "done", JSON.stringify({ start: ctx.startIso }));
  logger.info({ module: M }, `global rollover → sezóna ${ctx.newSeason}, ${c.rolled} lig, ${c.matches} zápasů`);
  return {
    finished: true, phase: null, status: "done", newSeasonNumber: ctx.newSeason,
    detail: `nová sezóna ${ctx.newSeason}, rollnuto ${c.rolled} lig`,
  };
}

async function runPhase(
  db: D1Database, ctx: RolloverContext, phase: RolloverPhase, key: ProgressKey, progress: ProgressRow | null,
): Promise<RolloverStepResult> {
  const base = { finished: false, phase, newSeasonNumber: ctx.newSeason };
  if (AT_MOST_ONCE.has(phase)) {
    if (progress?.status === "claimed") {
      logger.error({ module: M }, `rollover sezóny ${ctx.oldSeason}: fáze ${phase} se přerušila uprostřed, znovu se nepouští`);
      await writeProgress(db, key, "done", JSON.stringify({ interrupted: true }));
      return { ...base, status: "error", detail: `${phase} se minule přerušila uprostřed, podruhé ji nepouštím, zkontroluj ji ručně` };
    }
    await writeProgress(db, key, "claimed");
  }
  try {
    const outcome = await PHASE_RUNNERS[phase](db, ctx, key, progress);
    return { ...base, status: outcome.done ? "done" : "in_progress", detail: outcome.detail };
  } catch (e) {
    logger.error({ module: M }, `rollover sezóny ${ctx.oldSeason}: fáze ${phase} selhala`, e);
    return { ...base, status: "error", detail: `${phase} selhala, další krok ji zopakuje` };
  }
}

/** Fáze na jeden zátah: práce, pak marker. */
function singleStep(work: (db: D1Database, ctx: RolloverContext) => Promise<string>): PhaseRunner {
  return async (db, ctx, key) => {
    const detail = await work(db, ctx);
    await writeProgress(db, key, "done");
    return { done: true, detail };
  };
}

const PHASE_RUNNERS: Record<RolloverPhase, PhaseRunner> = {
  season_open: singleStep(openNewSeason),
  promotions: singleStep(applyPromotions),
  calendars: rollCalendarsChunk,
  season_close: singleStep(closeOldSeason),
  sponsors: singleStep(rolloverSponsors),
  governance: singleStep(rolloverGovernance),
  betting: singleStep(rolloverBetting),
  cup: singleStep(createNewSeasonCup),
  welcome: singleStep(welcomeNewSeason),
  u21_schedule: rollYouthSchedulesChunk,
  u21_aging: ageYouth,
  u21_maturation: matureYouthChunk,
  u21_cycle: youthCycleStep,
  u21_flags: singleStep(clearYouthFlags),
  municipal_elections: singleStep(holdElections),
};

/**
 * Celý rollover v jedné invokaci. Pro testy a ruční nástroje; produkce jde po krocích přes
 * `runEndSeasonStep`, jinak by narazila na strop dotazů jedné invokace jako 21. 10. 2026.
 * Hotový rollover nechá být, rozběhnutý dokončí.
 */
export async function rolloverAllLeagues(
  db: D1Database,
  oldSeasonNumber: number,
): Promise<GlobalRolloverResult> {
  if (await beginRollover(db, oldSeasonNumber) !== "done") {
    let lastError: { phase: RolloverPhase | null; count: number } = { phase: null, count: 0 };
    for (let i = 0; i < MAX_ROLLOVER_STEPS; i++) {
      const r = await runRolloverStep(db, oldSeasonNumber);
      if (r.finished) break;
      if (r.status !== "error") continue;
      lastError = { phase: r.phase, count: lastError.phase === r.phase ? lastError.count + 1 : 1 };
      if (lastError.count >= 3) throw new Error(`rollover sezóny ${oldSeasonNumber}: ${r.detail}`);
    }
  }
  const calendars = await readProgress(db, rolloverPhaseKey("calendars", oldSeasonNumber));
  const c = parseCursor(calendars?.cursor, { leagues: [] as string[], rolled: 0, matches: 0 });
  return { newSeasonNumber: oldSeasonNumber + 1, rolledLeagues: c.rolled, matchesCreated: c.matches };
}

// ── Jednotlivé fáze ─────────────────────────────────────────────────────────

/** 1. Nová globální sezóna, herní hodiny na reálné datum, přerazítkování rozhovorů. */
async function openNewSeason(db: D1Database, ctx: RolloverContext): Promise<string> {
  // number je UNIQUE → IGNORE, pokud existuje. Explicitně aktivovat, i kdyby řádek existoval
  // jako finished z dřívějška.
  await db.prepare("INSERT OR IGNORE INTO seasons (id, number, status) VALUES (?, ?, 'active')")
    .bind(ctx.seasonId, ctx.newSeason).run();
  await db.prepare("UPDATE seasons SET status = 'active' WHERE number = ?").bind(ctx.newSeason).run();

  // SYNCHRONIZACE S REÁLNÝM KALENDÁŘEM: offset herních hodin na nulu, herní datum = reálné
  // a rozpis (po/čt/so) sedí 1:1 se skutečným kalendářem.
  await db.prepare("INSERT INTO game_clock (id, offset_days) VALUES (1, 0) ON CONFLICT(id) DO UPDATE SET offset_days = 0").run();

  // Vynulování offsetu vrací herní čas o desítky dní zpět. Rozhovory rozdané ve staré ose
  // mají expires_at v budoucnosti, kterou nový herní čas nikdy nedožene. Expirace v denním
  // ticku porovnává s herním datem, takže by zůstaly věčně pending a strop dvou čekajících
  // rozhovorů na tým by se trvale ucpal. Opakování je neškodné: kotva je pro všechny
  // pokusy stejná, druhý průchod zapíše tytéž hodnoty.
  const { gameExpiry } = await import("../lib/game-time");
  await db.prepare(
    `UPDATE coach_interviews
        SET expires_at = CASE WHEN match_calendar_id LIKE 'season-%-wrap' THEN ? ELSE ? END
      WHERE status = 'pending' AND expires_at > ?`,
  ).bind(gameExpiry(ctx.startIso, 7), gameExpiry(ctx.startIso, 2), ctx.startIso).run();
  return `sezóna ${ctx.newSeason} založená, den 1 = ${ctx.startIso.slice(0, 10)}`;
}

/**
 * 2. Postup a sestup mezi okresním přeborem a III. třídou (2 ↔ 2), včetně U21 rezerv.
 * Tabulky se počítají za starou sezónu. Okres se přesouvá jednou dávkou s vlastním markerem,
 * takže chyba se dá bezpečně zopakovat.
 */
async function applyPromotions(db: D1Database, ctx: RolloverContext): Promise<string> {
  const { applyDistrictPromotions } = await import("../league/district-promotion");
  const moves = await applyDistrictPromotions(db, ctx.oldSeason, ctx.startIso);
  if (moves.length > 0) logger.info({ module: M }, `postupy a sestupy: ${moves.length} okresů`);
  return `postupy a sestupy: ${moves.length} okresů`;
}

interface CalendarsCursor {
  leagues: string[];
  rolled: number;
  matches: number;
}

/**
 * 3. Rozpis senior lig se SDÍLENÝM startem, jedna liga na krok (kolem dvou set dotazů).
 * Liga, která už má zápasy nové sezóny, se přeskočí (guard v rolloverLeagueCalendar).
 */
async function rollCalendarsChunk(
  db: D1Database, ctx: RolloverContext, key: ProgressKey, progress: ProgressRow | null,
): Promise<PhaseOutcome> {
  const cursor = parseCursor<CalendarsCursor>(progress?.cursor, { leagues: [], rolled: 0, matches: 0 });
  const leagues = (await db.prepare("SELECT id FROM leagues WHERE league_type = 'senior' ORDER BY id")
    .all<{ id: string }>()).results.map((r) => r.id);
  const next = leagues.find((id) => !cursor.leagues.includes(id));
  if (next) {
    const r = await rolloverLeagueCalendar(db, next, ctx.newSeason, ctx.seasonId, ctx.startDate);
    cursor.leagues.push(next);
    if (r.rolled) { cursor.rolled++; cursor.matches += r.matchesCreated; }
  }
  const done = leagues.every((id) => cursor.leagues.includes(id));
  await writeProgress(db, key, done ? "done" : "pending", JSON.stringify(cursor));
  return { done, detail: `rozpis ${cursor.leagues.length}/${leagues.length} lig, ${cursor.matches} zápasů` };
}

/** 4. Uzavřít starou sezónu. */
async function closeOldSeason(db: D1Database, ctx: RolloverContext): Promise<string> {
  await db.prepare("UPDATE seasons SET status = 'finished' WHERE number = ? AND status = 'active'")
    .bind(ctx.oldSeason).run();
  return `sezóna ${ctx.oldSeason} uzavřená`;
}

/**
 * 5. Sponzoři: sezónní sliby (4a), smlouvy o sezónu kratší a expirace (4b), SMS od majitelů
 * firem (4b-sms). Nejvýš jednou (AT_MOST_ONCE), odečet sezóny by druhý průchod zopakoval.
 * Každá část má vlastní try, chyba jedné nesmí shodit zbytek.
 */
async function rolloverSponsors(db: D1Database, ctx: RolloverContext): Promise<string> {
  const oldSeasonNumber = ctx.oldSeason;
  const newNum = ctx.newSeason;
  const startIso = ctx.startIso;

  // 4a. Sliby sponzorům (etapa 3), posun termínů a vynulování porušení za sezónu.
  const promiseTerminatedSponsors = await rolloverSponsorPromises(db, oldSeasonNumber, startIso);

  // Hlavní smlouvy, které teď vyprší: jejich majitelé se v kroku 4b-sms rozloučí.
  let expiringMain: Array<{ team_id: string; sponsor_id: number }> = [];

  // 4b. Sponzorské smlouvy: nová sezóna = o sezónu méně platnosti; na nule smlouva vyprší.
  //     Nabídky se generují per sezóna (seed obsahuje číslo sezóny) a škálují s reputací,
  //     takže expirovaný tým si hned může podepsat novou za aktualizovaných podmínek.
  try {
    const expiring = await db.prepare(
      `SELECT sc.team_id, sc.sponsor_name FROM sponsor_contracts sc
       JOIN teams t ON t.id = sc.team_id
       WHERE sc.status = 'active' AND sc.seasons_remaining <= 1 AND t.user_id != 'ai'`,
    ).all<{ team_id: string; sponsor_name: string }>()
      .catch((e) => { logger.warn({ module: M }, "load expiring sponsors", e); return { results: [] as Array<{ team_id: string; sponsor_name: string }> }; });

    // Sezóna spolupráce s hlavním sponzorem zvedne náklonnost jeho majitele (+5).
    const { rewardSeasonPartnerships } = await import("../sponsors/hooks");
    await rewardSeasonPartnerships(db)
      .catch((e) => { logger.error({ module: M }, "náklonnost za sezónu spolupráce", e); });

    // Hlavní sponzor je exkluzivní — kdo má u končícího sponzora přednost, se určí před expirací.
    const { assignMainPriorities } = await import("../sponsors/exclusivity");
    const priorityLosses = await assignMainPriorities(db, newNum)
      .catch((e) => { logger.error({ module: M }, "přednost hlavních sponzorů", e); return []; });

    // Kandidáti na rozloučení se zjistí PŘED oběma UPDATE, ale do `expiringMain` (co skutečně
    // spustí SMS „main_lost" v kroku 4b-sms) se přiřadí až PO obou — jinak by pád mezi
    // decrementem a expirací nechal SMS odejít i za smlouvu, která ve skutečnosti nevypršela.
    const expiringMainCandidates = (await db.prepare(
      `SELECT sc.team_id, sc.sponsor_id FROM sponsor_contracts sc JOIN teams t ON t.id = sc.team_id
       WHERE sc.status = 'active' AND sc.seasons_remaining <= 1 AND COALESCE(sc.category, 'main') = 'main'
         AND sc.sponsor_id IS NOT NULL AND t.user_id != 'ai'`,
    ).all<{ team_id: string; sponsor_id: number }>()
      .catch((e) => { logger.warn({ module: M }, "vypršelé hlavní smlouvy pro SMS", e); return { results: [] as Array<{ team_id: string; sponsor_id: number }> }; })).results;

    // Odečet a expirace jednou dávkou (D1 batch = transakce): buď obojí, nebo nic.
    await db.batch([
      db.prepare("UPDATE sponsor_contracts SET seasons_remaining = seasons_remaining - 1 WHERE status = 'active'"),
      db.prepare("UPDATE sponsor_contracts SET status = 'expired' WHERE status = 'active' AND seasons_remaining <= 0"),
    ]);
    expiringMain = expiringMainCandidates;

    // Jedna zpráva na klub, ne na smlouvu. Klub se sedmi sponzory dostal sedm SMS
    // během dvou sekund a všechny říkaly totéž — jdi na Sponzory.
    const namesByTeam = new Map<string, string[]>();
    for (const row of expiring.results) {
      const names = namesByTeam.get(row.team_id) ?? [];
      names.push(row.sponsor_name);
      namesByTeam.set(row.team_id, names);
    }
    const priorityLossByTeam = new Map(priorityLosses.map((l) => [l.teamId, l]));
    const { sendSystemSMS } = await import("../lib/sms");
    for (const [teamId, names] of namesByTeam) {
      const who = names.length === 1
        ? `Smlouva s ${names[0]} vypršela`
        : `${smlouvyVyprsely(names.length)}: ${names.join(", ")}`;
      const loss = priorityLossByTeam.get(teamId);
      const priorityNote = loss
        ? ` ${loss.sponsorName} dal přednost klubu ${loss.winnerTeamName}, u nás už pokračovat nebude.`
        : "";
      await sendSystemSMS(db, teamId, "Sportovní ředitel", "Sportovní ředitel",
        `📋 ${who} s koncem sezóny.${priorityNote} Mrkni na Sponzory, s firmami z okresu teď jednáš o nové smlouvě.`,
      );
    }
    logger.info({ module: M }, `sponzorské smlouvy: -1 sezóna, ${expiring.results.length} expirací u lidských týmů`);
  } catch (e) {
    logger.error({ module: M }, "sponsor contracts rollover", e);
  }

  // 4b-sms. SMS od majitelů firem. Herní čas se právě vrátil na reálné datum, lhůty
  // ze staré osy by nikdy nevypršely, proto se otevřená vlákna nejdřív tiše zavřou.
  // Pak poděkování nebo stížnost za sezónu a rozloučení majitelů vypršelých hlavních
  // smluv. Doručí je denní tick (nejvýš jedna SMS denně na klub).
  try {
    const { closeOwnerSmsForRollover } = await import("../sponsors/owner-sms");
    const { enqueueMainSponsorSms, enqueueSeasonEndSms } = await import("../sponsors/owner-sms-triggers");
    // Jednání se sponzory mají lhůty ve staré herní ose, uzavřou se stejně jako vlákna SMS.
    // Běží první, aby je nezablokovala chyba v úklidu SMS.
    const { closeNegotiationsForRollover } = await import("../sponsors/negotiation-db");
    await closeNegotiationsForRollover(db)
      .catch((e) => { logger.error({ module: M }, "uzavření jednání se sponzory", e); });
    await closeOwnerSmsForRollover(db);
    const day = startIso.slice(0, 10);
    // Sponzoři, kteří smlouvu vypověděli za nesplněné sliby (4a), se s verdiktem sezóny
    // nesmí míchat stejně jako vypršelé hlavní smlouvy — vlastní SMS o výpovědi šla dřív.
    const seasonSms = await enqueueSeasonEndSms(db, oldSeasonNumber, day, [...expiringMain, ...promiseTerminatedSponsors]);
    for (const m of expiringMain) {
      await enqueueMainSponsorSms(db, m.team_id, m.sponsor_id, "main_lost",
        `main-expired:${m.team_id}:${m.sponsor_id}:s${oldSeasonNumber}`, { day });
    }
    logger.info({ module: M }, `SMS majitelů: ${seasonSms} ke konci sezóny, ${expiringMain.length} rozloučení`);
  } catch (e) {
    logger.error({ module: M }, "SMS od majitelů firem", e);
  }
  return `sponzoři: ${expiringMain.length} vypršelých hlavních smluv`;
}

/**
 * 6. Samospráva soutěží: sazebník na novou sezónu z odhlasovaných návrhů, svazová dotace,
 * startovné, vypořádání sponzora a konec mandátů. Až po repointu lig a herním datu týmů
 * (rozpis) a po smlouvách klubů, ale před uvítáním do nové sezóny. Idempotentní (marker per
 * liga, INSERT OR IGNORE sazebníku, UNIQUE reference_id v pokladně).
 */
async function rolloverGovernance(db: D1Database, ctx: RolloverContext): Promise<string> {
  try {
    const { applyGovernanceRollover } = await import("../competition/rollover");
    const g = await applyGovernanceRollover(db, ctx.newSeason, ctx.startIso);
    if (g.leagues > 0) {
      logger.info({ module: M },
        `samospráva: ${g.leagues} soutěží, ${g.enabled} zapnuto, ${g.disabled} vypnuto, startovné od ${g.feesCollected} klubů`);
    }
    return `samospráva: ${g.leagues} soutěží`;
  } catch (e) {
    logger.error({ module: M }, "rollover samosprávy soutěží selhal", e);
    return "samospráva selhala, viz log";
  }
}

/**
 * 7. Sázková kancelář: co zbylo otevřené ze staré sezóny, se ruší a vklady se vracejí.
 * Otevřený tiket by jinak visel navždy, jeho kolo se už nikdy nedohraje. Odvod soutěži se
 * nevrací, ten obrat proběhl. Idempotence stojí na UPDATE ... WHERE status = 'open'.
 */
async function rolloverBetting(db: D1Database, ctx: RolloverContext): Promise<string> {
  let refunded = 0;
  try {
    const openTickets = await db.prepare(
      `SELECT id, team_id, stake FROM bet_tickets WHERE status = 'open' AND season_number < ?`
    ).bind(ctx.newSeason).all<{ id: string; team_id: string; stake: number }>();

    if (openTickets.results.length > 0) {
      const { recordTransaction } = await import("./finance-processor");
      for (const t of openTickets.results) {
        const gate = await db.prepare(
          `UPDATE bet_tickets SET status = 'void', payout = stake,
                  settled_game_date = ?, settled_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
            WHERE id = ? AND status = 'open'`
        ).bind(ctx.startIso, t.id).run();
        if ((gate.meta?.changes ?? 0) === 0) continue;

        await recordTransaction(db, t.team_id, "bet_refund", t.stake,
          "Vrácený vklad, konec sezóny", ctx.startIso, `bet-payout-${t.id}`);
        refunded++;
      }
      if (refunded > 0) {
        logger.info({ module: "betting" }, `rollover: zrušeno ${refunded} otevřených tiketů, vklady vráceny`);
      }
    }

    // Lístky se mažou o sezónu později. Kurzy právě skončené sezóny potřebuje hlídač
    // kurzů (calibration.ts měří kurzy odehraných zápasů za poslední tři týdny, admin
    // přehled až za 120 dní): kdyby zmizely s rolloverem, byl by hlídač na přelomu
    // sezón slepý a přeměřit model by nebylo z čeho. Starší sezóny už nikdo nepotřebuje.
    await db.prepare("DELETE FROM bet_odds WHERE season_number < ?").bind(ctx.oldSeason).run();
  } catch (e) { logger.error({ module: "betting" }, "úklid sázek při rolloveru selhal", e); }
  return `sázky: vráceno ${refunded} tiketů`;
}

/**
 * 8. Celorepublikový pohár nové sezóny (kola na soboty, finále na konci ligy). Když vytvoření
 * selže, založí ho líně maybeAdvanceCup v denním ticku.
 */
async function createNewSeasonCup(db: D1Database, ctx: RolloverContext): Promise<string> {
  try {
    const { createCup } = await import("../cup/cup");
    const r = await createCup(db, ctx.newSeason);
    return r.created ? `pohár: ${r.teams} týmů, ${r.rounds} kol` : "pohár už existuje";
  } catch (e) {
    logger.warn({ module: M }, "create cup on rollover failed", e);
    return "pohár se nevytvořil, založí ho denní tick";
  }
}

/** 9. Uvítání do nové sezóny pro všechny lidské týmy → obrazovka /nova-sezona. */
async function welcomeNewSeason(db: D1Database, ctx: RolloverContext): Promise<string> {
  const r = await db.prepare(
    "INSERT OR IGNORE INTO season_welcome (team_id, season_number, seen) SELECT id, ?, 0 FROM teams WHERE user_id != 'ai' AND team_type = 'senior'",
  ).bind(ctx.newSeason).run();
  return `uvítání: ${r.meta?.changes ?? 0} klubů`;
}

/**
 * 10. U21: repoint na novou sezónu a rozpis, jedna liga na krok. Šetrná regenerace maže jen
 * cílovou sezónu; liga, která už má zápasy nové sezóny, se přeskočí.
 */
async function rollYouthSchedulesChunk(
  db: D1Database, ctx: RolloverContext, key: ProgressKey, progress: ProgressRow | null,
): Promise<PhaseOutcome> {
  const cursor = parseCursor<{ leagues: string[] }>(progress?.cursor, { leagues: [] });
  const leagues = (await db.prepare("SELECT id FROM leagues WHERE league_type = 'u21' ORDER BY id")
    .all<{ id: string }>()).results.map((r) => r.id);
  const next = leagues.find((id) => !cursor.leagues.includes(id));
  if (next) {
    await db.prepare("UPDATE leagues SET season_id = ? WHERE id = ?").bind(ctx.seasonId, next).run();
    const has = await db.prepare(
      "SELECT 1 FROM season_calendar sc WHERE sc.league_id = ? AND sc.season_number = ? AND EXISTS (SELECT 1 FROM matches m WHERE m.calendar_id = sc.id) LIMIT 1",
    ).bind(next, ctx.newSeason).first();
    if (!has) {
      const { regenerateU21Schedule } = await import("../league/u21-generator");
      await regenerateU21Schedule(db, next, createRng(cryptoSeed()), ctx.startDate);
    }
    cursor.leagues.push(next);
  }
  const done = leagues.every((id) => cursor.leagues.includes(id));
  await writeProgress(db, key, done ? "done" : "pending", JSON.stringify(cursor));
  return { done, detail: `rozpis U21 ${cursor.leagues.length}/${leagues.length} lig` };
}

/**
 * 11. Stárnutí dorostu o rok, PŘESNĚ jednou: UPDATE i marker jdou jednou dávkou (D1 batch =
 * transakce) a UPDATE se navíc sám zastaví o hotový marker. Kdyby se marker zapsal až po
 * stárnutí zvlášť, pád mezi nimi by při dalším kroku nechal kluky zestárnout podruhé.
 * Senior kádry stárnou ve fázi departures. Čerstvý odchovanec z akademie (vznikl v tomhle
 * konci sezóny) nestárne a nedospívá.
 */
async function ageYouth(db: D1Database, _ctx: RolloverContext, key: ProgressKey): Promise<PhaseOutcome> {
  const [aged] = await db.batch([
    db.prepare(
      `UPDATE players SET age = age + 1
        WHERE team_id IN (SELECT id FROM teams WHERE team_type = 'u21')
          AND json_extract(COALESCE(life_context, '{}'), '$.freshAcademyGraduate') IS NULL
          AND NOT EXISTS (SELECT 1 FROM season_end_progress
                           WHERE league_id = ? AND season_number = ? AND phase = ? AND status = 'done')`,
    ).bind(key.leagueId, key.seasonNumber, key.phase),
    progressStatement(db, key, "done"),
  ]);
  return { done: true, detail: `dorost o rok starší (${aged.meta?.changes ?? 0} hráčů)` };
}

/**
 * 12. Dospívání a růst dorostu lidských klubů, po dávkách. Musí být tady, ne ve fázi
 * departures: ta běží jen pro senior ligy. Přírůstek se počítá z nového věku, proto až po
 * stárnutí. Dospívání se přičítá, takže dvakrát nesmí: kurzor se zapíše PŘED zápisy
 * dorostu (vzor departures). Pád uprostřed dorostu radši znamená chybějící přírůstek než dvojitý.
 */
async function matureYouthChunk(
  db: D1Database, ctx: RolloverContext, key: ProgressKey, progress: ProgressRow | null,
): Promise<PhaseOutcome> {
  const cursor = parseCursor<{ teams: string[] }>(progress?.cursor, { teams: [] });
  const processed = new Set(cursor.teams);
  const teams = (await db.prepare(
    `SELECT t.id FROM teams t JOIN teams rodic ON rodic.id = t.parent_team_id
      WHERE t.team_type = 'u21' AND rodic.user_id != 'ai' ORDER BY t.id`,
  ).all<{ id: string }>()).results.map((r) => r.id);

  const { dospejMladeHrace, oznamDospivani } = await import("./dospivani");
  const { growYoungPlayers } = await import("./body-drift");
  for (const teamId of teams.filter((id) => !processed.has(id)).slice(0, YOUTH_MATURATION_CHUNK)) {
    processed.add(teamId);
    await writeProgress(db, key, "pending", JSON.stringify({ teams: [...processed] }));
    try {
      const grown = await dospejMladeHrace(db, teamId);
      if (grown.length > 0) await oznamDospivani(db, teamId, grown);
      // Dorost do 18 let vyroste (postava, část 2).
      const gd = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>();
      await growYoungPlayers(db, teamId, gd?.game_date ?? ctx.startIso);
    } catch (e) {
      logger.error({ module: M, teamId }, "dospívání dorostu selhalo, dorost se už nezopakuje", e);
    }
  }
  const done = teams.every((id) => processed.has(id));
  await writeProgress(db, key, done ? "done" : "pending", JSON.stringify({ teams: [...processed] }));
  return { done, detail: `dospívání dorostu ${processed.size}/${teams.length}` };
}

/**
 * 13. Životní cyklus dorostu, AŽ ZA stárnutím a dospíváním: kdo právě dosáhl 22 let, jde do
 * áčka (nebo mezi volné hráče) a na jeho místo přijde nový šestnáctiletý ročník. Po dávkách
 * přes stejnou funkci, kterou jde cyklus pustit i ručně (POST /admin/u21/cyklus).
 */
async function youthCycleStep(db: D1Database, ctx: RolloverContext): Promise<PhaseOutcome> {
  const r = await runYouthCycleChunk(db, ctx.newSeason);
  return {
    done: r.done,
    detail: `dorostový cyklus ${r.teamsDone}/${r.teamsTotal}, do áčka ${r.promoted}, uvolněno ${r.released}, přišlo ${r.arrived}`,
  };
}

/** 14. Značka čerstvého odchovance platí jen pro tohle léto. */
async function clearYouthFlags(db: D1Database): Promise<string> {
  const cleared = await clearFreshAcademyFlags(db);
  return `značka odchovance smazána u ${cleared} hráčů`;
}

/**
 * 15. Komunální volby jednou za konec sezóny: nová sezóna = nové vedení obcí a každý klub
 * dostane SMS s novým starostou. Nejvýš jednou (AT_MOST_ONCE): druhé volby by vyměnily
 * vedení znovu a poslaly druhou SMS.
 */
async function holdElections(db: D1Database): Promise<string> {
  try {
    const { holdMunicipalElections } = await import("../villages/municipal-elections");
    const r = await holdMunicipalElections(db);
    logger.info({ module: M }, `komunální volby: ${r.villagesProcessed} obcí, ${r.teamsNotified} klubům SMS`);
    return `komunální volby: ${r.villagesProcessed} obcí`;
  } catch (e) {
    logger.error({ module: M }, "komunální volby selhaly", e);
    return "komunální volby selhaly, viz log";
  }
}

async function rolloverLeagueCalendar(
  db: D1Database,
  leagueId: string,
  newNum: number,
  seasonId: string,
  startDate: Date,
): Promise<{ rolled: boolean; matchesCreated: number }> {
  // Idempotence: rollover je HOTOVÝ jen když existují ZÁPASY nové sezóny (kalendář sám nestačí —
  // pád mezi vložením kalendáře a zápasů by jinak nechal ligu tiše bez zápasů).
  const hasMatches = await db.prepare("SELECT 1 FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id WHERE sc.league_id = ? AND sc.season_number = ? LIMIT 1")
    .bind(leagueId, newNum).first()
    .catch((e) => { logger.warn({ module: "season-rollover" }, "guard matches", e); return null; });
  if (hasMatches) return { rolled: false, matchesCreated: 0 };
  // Uklidit částečný stav z předchozího spadlého pokusu (kalendář bez zápasů) → čistá regenerace.
  await db.prepare("DELETE FROM matches WHERE calendar_id IN (SELECT id FROM season_calendar WHERE league_id = ? AND season_number = ?)").bind(leagueId, newNum).run()
    .catch((e) => logger.warn({ module: "season-rollover" }, "cleanup partial matches", e));
  await db.prepare("DELETE FROM season_calendar WHERE league_id = ? AND season_number = ?").bind(leagueId, newNum).run()
    .catch((e) => logger.warn({ module: "season-rollover" }, "cleanup partial calendar", e));

  await db.prepare("UPDATE leagues SET season_id = ? WHERE id = ?").bind(seasonId, leagueId).run()
    .catch((e) => logger.warn({ module: "season-rollover" }, "repoint league season", e));

  const teamsRes = await db.prepare("SELECT id FROM teams WHERE league_id = ? ORDER BY name").bind(leagueId).all()
    .catch((e) => { logger.warn({ module: "season-rollover" }, "load teams", e); return { results: [] as Record<string, unknown>[] }; });
  const teamIds = teamsRes.results.map((r) => r.id as string);
  if (teamIds.length < 2) return { rolled: false, matchesCreated: 0 };

  const { generateSchedule } = await import("../league/schedule");
  const { generateSeasonCalendar, parseMatchWeekdays } = await import("./calendar");
  const rng = createRng(cryptoSeed());

  // Hrací dny ligy (III. třída Prachatice hraje ve středu a v neděli); bez nich pondělí a čtvrtek.
  const leagueDays = await db.prepare("SELECT match_weekdays FROM leagues WHERE id = ?").bind(leagueId)
    .first<{ match_weekdays: string | null }>()
    .catch((e) => { logger.warn({ module: "season-rollover" }, `hrací dny ligy ${leagueId}`, e); return null; });

  const schedule = generateSchedule(rng, teamIds.length);
  // Krátká předsezóna — generátor sám posune o +5 dní a snapne na nejbližší hrací den ligy,
  // takže první zápas padne 5-8 dní po konci sezóny (max ~týden, žádných 10-15 dní čekání).
  const { totalRounds } = await import("../league/schedule");
  const calendar = generateSeasonCalendar(leagueId, newNum, startDate, totalRounds(teamIds.length),
    parseMatchWeekdays(leagueDays?.match_weekdays));

  for (const entry of calendar.entries) {
    await db.prepare(
      "INSERT OR IGNORE INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')",
    ).bind(entry.id, leagueId, newNum, entry.gameWeek, entry.matchDay, entry.scheduledAt).run()
      .catch((e) => logger.warn({ module: "season-rollover" }, "insert calendar", e));
  }

  const calByWeek = new Map<number, string>();
  for (const entry of calendar.entries) if (!calByWeek.has(entry.gameWeek)) calByWeek.set(entry.gameWeek, entry.id);

  let matchesCreated = 0;
  for (const match of schedule) {
    if (match.homeTeamIndex >= teamIds.length || match.awayTeamIndex >= teamIds.length) continue;
    const calId = calByWeek.get(match.round) ?? null;
    const res = await db.prepare(
      "INSERT INTO matches (id, league_id, calendar_id, round, home_team_id, away_team_id, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')",
    ).bind(crypto.randomUUID(), leagueId, calId, match.round, teamIds[match.homeTeamIndex], teamIds[match.awayTeamIndex]).run()
      .catch((e) => { logger.warn({ module: "season-rollover" }, "insert match", e); return null; });
    if (res) matchesCreated++;
  }

  // game_date + hranice sezóny — JEDNOTNĚ napříč ligami. Den 1 = startDate = REÁLNÉ dnešní datum
  // (offset 0 → denní tick drží herní datum 1:1 s realitou); první zápas je ~týden po startu (předsezóna).
  if (calendar.entries.length > 0) {
    await db.prepare("UPDATE teams SET game_date = ?, season_start = ?, season_end = ? WHERE league_id = ?")
      .bind(startDate.toISOString(), startDate.toISOString(), calendar.seasonEnd, leagueId).run()
      .catch((e) => logger.warn({ module: "season-rollover" }, "set team dates", e));
  }

  return { rolled: true, matchesCreated };
}
