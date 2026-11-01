/**
 * Hostování s podmínkou hraní a přehled o půjčených hráčích (2026-11-01).
 *
 * Každé přijaté hostování dostane záznam v `loan_agreements`. Ten drží stav hráče na
 * začátku (hodnocení, dovednosti, docházku na tréninky), takže půjčující klub vidí, jestli
 * se hráč u hostujícího klubu zlepšuje. Když hostování vzniklo z inzerátu s podmínkou
 * hraní („v základu“ nebo „pravidelně“), hra po každém ligovém zápase spočítá, jestli se
 * plní. Hostujícího varuje den před zápasem, půjčujícímu při porušení napíše a ten může
 * hráče stáhnout.
 *
 * Počítají se jen ligové zápasy. Zápas, kdy hráč chyběl (zranění, stopka, omluvenka),
 * se do podmínky nepočítá: za to hostující klub nemůže.
 */

import { logger } from "../lib/logger";
import { sendSystemSMS } from "../messaging/system-sms";

const M = "loan-agreements";

export type LoanPlayingTime = "starter" | "regular" | "none";
export const LOAN_PLAYING_TIMES: readonly LoanPlayingTime[] = ["starter", "regular", "none"];

export const LOAN_PLAYING_TIME_LABEL: Record<LoanPlayingTime, string> = {
  starter: "Hraje v základu",
  regular: "Pravidelně nastupuje",
  none: "Bez podmínky",
};

/** Věta pro SMS: „slíbili jste, že Novák bude hrát v základu“. */
const PROMISE_PHRASE: Record<Exclude<LoanPlayingTime, "none">, string> = {
  starter: "bude hrát v základu",
  regular: "bude pravidelně nastupovat",
};

/** Totéž v infinitivu: „měl hrát v základu“. */
const PROMISE_INFINITIVE: Record<Exclude<LoanPlayingTime, "none">, string> = {
  starter: "hrát v základu",
  regular: "pravidelně nastupovat",
};

/** Jaký podíl zápasů, kdy hráč mohl hrát, musí podmínka splnit. */
const REQUIRED_SHARE: Record<Exclude<LoanPlayingTime, "none">, number> = {
  starter: 0.75,
  regular: 0.5,
};

/** Podmínka se hodnotí až od tolika zápasů, aby jedna lavička hned neznamenala porušení. */
export const LOAN_MIN_MATCHES = 3;
/** Inzerát na hostování visí déle než prodejní (7 dní): nováčci reagují pomaleji. */
export const LOAN_LISTING_DAYS = 14;
export const LOAN_DAYS_MIN = 7;
export const LOAN_DAYS_MAX = 180;

const SMS_ROLE = "Sportovní ředitel";

export function parsePlayingTime(v: unknown): LoanPlayingTime | null {
  return typeof v === "string" && (LOAN_PLAYING_TIMES as readonly string[]).includes(v) ? (v as LoanPlayingTime) : null;
}

/** Jeden ligový zápas hostujícího klubu během hostování. */
export interface LoanMatchLine {
  matchId: string;
  playedAt: string;
  opponentName: string;
  home: boolean;
  goalsFor: number | null;
  goalsAgainst: number | null;
  /** Mohl hrát (nebyl zraněný, vyloučený ani omluvený)? */
  available: boolean;
  absenceReason: string | null;
  started: boolean;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  rating: number | null;
}

export type PlayingTimeState = "none" | "pending" | "ok" | "at_risk" | "breached";

export interface PlayingTimeCheck {
  playingTime: LoanPlayingTime;
  /** Zápasy, kdy hráč mohl hrát. */
  eligible: number;
  /** Kolikrát podmínku splnil (začal v základu, nebo nastoupil). */
  fulfilled: number;
  /** Kolik splnění je při dnešním počtu zápasů potřeba. */
  required: number;
  state: PlayingTimeState;
}

function requiredFor(share: number, matches: number): number {
  return Math.ceil(share * matches - 1e-9);
}

/**
 * Plní se podmínka hraní? Čistá funkce nad seznamem zápasů.
 *
 * - `pending`: málo zápasů, ještě se nehodnotí,
 * - `at_risk`: když v příštím zápase nenastoupí (nezačne), podmínka padne,
 * - `breached`: podmínka se teď neplní.
 */
export function checkPlayingTime(playingTime: LoanPlayingTime, lines: LoanMatchLine[]): PlayingTimeCheck {
  const eligibleLines = lines.filter((l) => l.available);
  const eligible = eligibleLines.length;
  if (playingTime === "none") {
    return { playingTime, eligible, fulfilled: 0, required: 0, state: "none" };
  }
  const share = REQUIRED_SHARE[playingTime];
  const fulfilled = eligibleLines.filter((l) => (playingTime === "starter" ? l.started : l.minutes > 0)).length;
  const required = requiredFor(share, eligible);
  const nextRequired = requiredFor(share, eligible + 1);
  const nextCounts = eligible + 1 >= LOAN_MIN_MATCHES;

  if (eligible < LOAN_MIN_MATCHES) {
    const state: PlayingTimeState = nextCounts && fulfilled < nextRequired ? "at_risk" : "pending";
    return { playingTime, eligible, fulfilled, required, state };
  }
  if (fulfilled < required) return { playingTime, eligible, fulfilled, required, state: "breached" };
  return { playingTime, eligible, fulfilled, required, state: fulfilled < nextRequired ? "at_risk" : "ok" };
}

/**
 * Předložka před číslem: „ze“ tam, kde číslovka začíná na č, š nebo s
 * (ze čtyř, ze šesti, ze sedmi, ze čtrnácti, ze sta), jinak „z“.
 */
export function fromPreposition(n: number): "z" | "ze" {
  if (n >= 100 && n < 200) return "ze";
  if ([4, 6, 7, 14, 16, 17].includes(n)) return "ze";
  if (n >= 20 && n < 100) return [4, 6, 7].includes(Math.floor(n / 10)) ? "ze" : "z";
  return "z";
}

/** Popis stavu podmínky pro obě strany, např. „V základu 3 ze 4 zápasů“. */
export function playingTimeSummary(c: PlayingTimeCheck): string {
  if (c.playingTime === "none") return "Bez podmínky hraní";
  const what = c.playingTime === "starter" ? "V základu" : "Nastoupil";
  if (c.eligible === 0) return `${what}: zatím žádný zápas`;
  return `${what} ${c.fulfilled} ${fromPreposition(c.eligible)} ${c.eligible} ${c.eligible === 1 ? "zápasu" : "zápasů"}`;
}

export interface LoanAgreementRow {
  id: string;
  offer_id: string | null;
  player_id: string;
  lender_team_id: string;
  borrower_team_id: string;
  playing_time: LoanPlayingTime;
  fee: number;
  started_at: string;
  until: string;
  start_rating: number | null;
  start_skills: string | null;
  start_training_attended: number;
  start_training_total: number;
  baseline_at: string | null;
  status: "active" | "ended" | "recalled" | "bought";
  breach_notified_at: string | null;
  warned_for_match_id: string | null;
  ended_at: string | null;
  created_at: string;
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Docházka hráče na tréninky klubu: kumulativní počty z `teams.training_attendance`. */
async function trainingAttendance(db: D1Database, teamId: string, playerId: string): Promise<{ attended: number; total: number }> {
  const row = await db.prepare("SELECT training_attendance FROM teams WHERE id = ?")
    .bind(teamId).first<{ training_attendance: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "docházka klubu", e); return null; });
  try {
    const data = JSON.parse(row?.training_attendance ?? "{}") as Record<string, { attended?: number; total?: number }>;
    const p = data[playerId];
    return { attended: p?.attended ?? 0, total: p?.total ?? 0 };
  } catch (e) {
    logger.warn({ module: M }, "docházka klubu nejde přečíst", e);
    return { attended: 0, total: 0 };
  }
}

/** Hodnocení a dovednosti hráče teď: výchozí bod pro sledování vývoje. */
async function playerSnapshot(db: D1Database, playerId: string): Promise<{ rating: number | null; skills: string | null }> {
  const p = await db.prepare("SELECT overall_rating, skills FROM players WHERE id = ?")
    .bind(playerId).first<{ overall_rating: number | null; skills: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "stav hráče", e); return null; });
  return { rating: p?.overall_rating ?? null, skills: p?.skills ?? null };
}

/**
 * Založí záznam přijatého hostování. Volá se až po přesunu hráče: chyba tady nesmí
 * shodit hostování, proto se jen zaloguje.
 */
export async function createLoanAgreement(db: D1Database, input: {
  offerId: string | null; playerId: string; lenderTeamId: string; borrowerTeamId: string;
  playingTime: LoanPlayingTime | null; fee: number; startedAt: string; until: string;
}): Promise<string | null> {
  try {
    const snap = await playerSnapshot(db, input.playerId);
    const att = await trainingAttendance(db, input.borrowerTeamId, input.playerId);
    const id = crypto.randomUUID();
    await db.batch([
      // Hráč může mít jen jedno živé hostování. Starý záznam (třeba z dřívějšího hostování
      // téhož hráče, které skončilo mimo běžnou cestu) se uzavře.
      db.prepare("UPDATE loan_agreements SET status = 'ended', ended_at = ? WHERE player_id = ? AND status = 'active'")
        .bind(nowIso(), input.playerId),
      db.prepare(
        `INSERT INTO loan_agreements (id, offer_id, player_id, lender_team_id, borrower_team_id, playing_time, fee,
           started_at, until, start_rating, start_skills, start_training_attended, start_training_total, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, input.offerId, input.playerId, input.lenderTeamId, input.borrowerTeamId, input.playingTime ?? "none",
        input.fee, input.startedAt, input.until, snap.rating, snap.skills, att.attended, att.total, nowIso()),
    ]);
    return id;
  } catch (e) {
    logger.error({ module: M }, "záznam hostování se nepodařilo založit", e);
    return null;
  }
}

/** Uzavře živý záznam hostování hráče (návrat, odkup, stažení). */
export async function closeLoanAgreements(
  db: D1Database, playerId: string, status: "ended" | "recalled" | "bought",
): Promise<void> {
  await db.prepare("UPDATE loan_agreements SET status = ?, ended_at = ? WHERE player_id = ? AND status = 'active'")
    .bind(status, nowIso(), playerId).run()
    .catch((e) => logger.warn({ module: M }, `uzavření hostování (${status})`, e));
}

/**
 * Hostování, která vznikla před zavedením záznamů, záznam nemají. Doplní se s výchozím
 * bodem „teď“ (`baseline_at`), takže vývoj se ukazuje od dneška, ne od začátku hostování.
 */
export async function ensureLoanAgreements(db: D1Database, lenderOrBorrowerTeamId?: string): Promise<number> {
  const scope = lenderOrBorrowerTeamId
    ? "AND (p.loan_from_team_id = ? OR p.team_id = ?)"
    : "";
  const stmt = db.prepare(
    `SELECT p.id, p.team_id, p.loan_from_team_id, p.loan_until,
            (SELECT c.joined_at FROM player_contracts c
              WHERE c.player_id = p.id AND c.join_type = 'loan' AND c.is_active = 1
              ORDER BY c.joined_at DESC LIMIT 1) AS joined_at,
            (SELECT c.fee FROM player_contracts c
              WHERE c.player_id = p.id AND c.join_type = 'loan' AND c.is_active = 1
              ORDER BY c.joined_at DESC LIMIT 1) AS fee
       FROM players p
      WHERE p.loan_from_team_id IS NOT NULL ${scope}
        AND NOT EXISTS (SELECT 1 FROM loan_agreements la WHERE la.player_id = p.id AND la.status = 'active')`,
  );
  const rows = await (lenderOrBorrowerTeamId ? stmt.bind(lenderOrBorrowerTeamId, lenderOrBorrowerTeamId) : stmt)
    .all<{ id: string; team_id: string; loan_from_team_id: string; loan_until: string | null; joined_at: string | null; fee: number | null }>()
    .catch((e) => { logger.warn({ module: M }, "hostování bez záznamu", e); return { results: [] }; });
  let created = 0;
  for (const r of rows.results) {
    const snap = await playerSnapshot(db, r.id);
    const att = await trainingAttendance(db, r.team_id, r.id);
    const now = nowIso();
    const res = await db.prepare(
      `INSERT INTO loan_agreements (id, offer_id, player_id, lender_team_id, borrower_team_id, playing_time, fee,
         started_at, until, start_rating, start_skills, start_training_attended, start_training_total, baseline_at, created_at)
       SELECT ?, NULL, ?, ?, ?, 'none', ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM loan_agreements WHERE player_id = ? AND status = 'active')`,
    ).bind(crypto.randomUUID(), r.id, r.loan_from_team_id, r.team_id, r.fee ?? 0, r.joined_at ?? now, r.loan_until ?? now,
      snap.rating, snap.skills, att.attended, att.total, now, now, r.id).run()
      .catch((e) => { logger.warn({ module: M }, "doplnění záznamu hostování", e); return null; });
    if ((res?.meta.changes ?? 0) > 0) created++;
  }
  return created;
}

interface MatchRow {
  id: string; home_team_id: string; away_team_id: string; home_score: number | null; away_score: number | null;
  absences: string | null; scheduled_at: string; home_name: string; away_name: string;
  started: number | null; minutes_played: number | null; goals: number | null; assists: number | null;
  yellow_cards: number | null; red_cards: number | null; rating: number | null;
}

/** Proč hráč v zápase chyběl, podle seznamu nepřítomných uloženého u zápasu. */
function absenceReasonFor(raw: string | null, teamId: string, playerId: string, fullName: string): string | null {
  if (!raw) return null;
  try {
    const list = JSON.parse(raw) as Array<{ playerId?: string; name?: string; reason?: string; teamId?: string }>;
    if (!Array.isArray(list)) return null;
    const hit = list.find((a) => a.teamId === teamId && (a.playerId ? a.playerId === playerId : a.name === fullName));
    return hit ? (hit.reason ?? "Chyběl") : null;
  } catch (e) {
    logger.warn({ module: M }, "nepřítomní u zápasu nejdou přečíst", e);
    return null;
  }
}

/** Ligové zápasy hostujícího klubu odehrané během hostování, s účastí hráče. */
export async function loanMatchLines(db: D1Database, a: LoanAgreementRow): Promise<LoanMatchLine[]> {
  const player = await db.prepare("SELECT first_name, last_name FROM players WHERE id = ?")
    .bind(a.player_id).first<{ first_name: string; last_name: string }>()
    .catch((e) => { logger.warn({ module: M }, "jméno hráče", e); return null; });
  const fullName = player ? `${player.first_name} ${player.last_name}` : "";
  // Nové hostování: jen zápasy odehrané po jeho vzniku (reálný čas simulace), aby se
  // nepočítal zápas z téhož dne, který proběhl dřív, než hráč přišel. Doplněné staré
  // hostování (baseline_at) bere zápasy od začátku hostování podle herního data.
  const rows = await db.prepare(
    `SELECT m.id, m.home_team_id, m.away_team_id, m.home_score, m.away_score, m.absences, sc.scheduled_at,
            COALESCE(ht.name, 'soupeř') AS home_name, COALESCE(aw.name, 'soupeř') AS away_name,
            s.started, s.minutes_played, s.goals, s.assists, s.yellow_cards, s.red_cards, s.rating
       FROM matches m
       JOIN season_calendar sc ON sc.id = m.calendar_id
       LEFT JOIN teams ht ON ht.id = m.home_team_id
       LEFT JOIN teams aw ON aw.id = m.away_team_id
       LEFT JOIN match_player_stats s ON s.match_id = m.id AND s.player_id = ?
      WHERE m.status = 'simulated' AND m.league_id IS NOT NULL
        AND (m.home_team_id = ? OR m.away_team_id = ?)
        AND sc.scheduled_at >= ?
        AND (? IS NOT NULL OR m.simulated_at IS NULL OR m.simulated_at >= ?)
        AND (? IS NULL OR m.simulated_at IS NULL OR m.simulated_at <= ?)
      ORDER BY sc.scheduled_at`,
  ).bind(a.player_id, a.borrower_team_id, a.borrower_team_id, a.started_at,
    a.baseline_at, a.created_at, a.ended_at, a.ended_at)
    .all<MatchRow>()
    .catch((e) => { logger.warn({ module: M }, "zápasy během hostování", e); return { results: [] as MatchRow[] }; });

  return rows.results.map((r) => {
    const home = r.home_team_id === a.borrower_team_id;
    const played = r.minutes_played != null;
    const absenceReason = played ? null : absenceReasonFor(r.absences, a.borrower_team_id, a.player_id, fullName);
    return {
      matchId: r.id,
      playedAt: r.scheduled_at,
      opponentName: home ? r.away_name : r.home_name,
      home,
      goalsFor: home ? r.home_score : r.away_score,
      goalsAgainst: home ? r.away_score : r.home_score,
      available: played || absenceReason === null,
      absenceReason,
      started: (r.started ?? 0) === 1 && played,
      minutes: r.minutes_played ?? 0,
      goals: r.goals ?? 0,
      assists: r.assists ?? 0,
      yellowCards: r.yellow_cards ?? 0,
      redCards: r.red_cards ?? 0,
      rating: played ? r.rating : null,
    };
  });
}

async function loadAgreement(db: D1Database, id: string): Promise<LoanAgreementRow | null> {
  return db.prepare("SELECT * FROM loan_agreements WHERE id = ?").bind(id).first<LoanAgreementRow>()
    .catch((e) => { logger.warn({ module: M }, "záznam hostování", e); return null; });
}

/** Je hráč pořád na hostování podle záznamu? Jinak záznam neplatí (odešel jinou cestou). */
async function stillOnLoan(db: D1Database, a: LoanAgreementRow): Promise<boolean> {
  const p = await db.prepare(
    `SELECT 1 AS ok FROM players p JOIN teams t ON t.id = p.team_id
      WHERE p.id = ? AND p.loan_from_team_id = ? AND (p.team_id = ? OR t.parent_team_id = ?)`,
  ).bind(a.player_id, a.lender_team_id, a.borrower_team_id, a.borrower_team_id).first()
    .catch((e) => { logger.warn({ module: M }, "je hráč na hostování", e); return null; });
  return !!p;
}

async function teamName(db: D1Database, teamId: string): Promise<string> {
  const t = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId).first<{ name: string }>()
    .catch((e) => { logger.warn({ module: M }, "název klubu", e); return null; });
  return t?.name ?? "klub";
}

async function isAiClub(db: D1Database, teamId: string): Promise<boolean> {
  const { isAiTeam } = await import("../community/manager-relations");
  return isAiTeam(db, teamId);
}

/**
 * Denní kontrola živých hostování: uzavře záznamy hráčů, kteří už nehostují, a půjčujícímu
 * klubu jednou napíše, když se podmínka hraní přestane plnit. Když se zase plní, zpráva
 * se může poslat znovu při dalším porušení.
 */
export async function checkLoanAgreements(db: D1Database): Promise<{ breaches: number; closed: number }> {
  const active = await db.prepare("SELECT * FROM loan_agreements WHERE status = 'active'")
    .all<LoanAgreementRow>()
    .catch((e) => { logger.warn({ module: M }, "živá hostování", e); return { results: [] as LoanAgreementRow[] }; });
  let breaches = 0;
  let closed = 0;
  for (const a of active.results) {
    if (!(await stillOnLoan(db, a))) {
      await closeLoanAgreements(db, a.player_id, "ended");
      closed++;
      continue;
    }
    if (a.playing_time === "none") continue;
    const check = checkPlayingTime(a.playing_time, await loanMatchLines(db, a));
    if (check.state === "breached" && !a.breach_notified_at) {
      await db.prepare("UPDATE loan_agreements SET breach_notified_at = ? WHERE id = ? AND breach_notified_at IS NULL")
        .bind(nowIso(), a.id).run()
        .catch((e) => logger.warn({ module: M }, "zápis porušení podmínky", e));
      if (!(await isAiClub(db, a.lender_team_id))) {
        const p = await db.prepare("SELECT first_name, last_name FROM players WHERE id = ?").bind(a.player_id)
          .first<{ first_name: string; last_name: string }>()
          .catch((e) => { logger.warn({ module: M }, "hráč pro zprávu o porušení", e); return null; });
        const borrower = await teamName(db, a.borrower_team_id);
        const name = p ? `${p.first_name} ${p.last_name}` : "Hráč";
        await sendSystemSMS(db, a.lender_team_id, SMS_ROLE,
          `${name} na hostování v klubu ${borrower} nehraje, jak bylo domluveno. Měl ${PROMISE_INFINITIVE[a.playing_time]}, zatím ${playingTimeSummary(check).toLowerCase()}. Můžete ho stáhnout zpátky.`,
          { type: "loan", agreementId: a.id });
      }
      breaches++;
    } else if (check.state !== "breached" && a.breach_notified_at) {
      await db.prepare("UPDATE loan_agreements SET breach_notified_at = NULL WHERE id = ?").bind(a.id).run()
        .catch((e) => logger.warn({ module: M }, "podmínka se zase plní", e));
    }
  }
  return { breaches, closed };
}

/**
 * Den před ligovým zápasem: hostujícímu klubu připomene podmínku hráče, kterému hrozí
 * porušení. Jednou na zápas (`warned_for_match_id` je id kola v kalendáři).
 */
export async function warnLoanBorrowersBeforeMatch(db: D1Database, borrowerTeamId: string, calendarId: string): Promise<number> {
  const rows = await db.prepare(
    `SELECT * FROM loan_agreements
      WHERE status = 'active' AND playing_time != 'none'
        AND borrower_team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)
        AND COALESCE(warned_for_match_id, '') != ?`,
  ).bind(borrowerTeamId, borrowerTeamId, calendarId).all<LoanAgreementRow>()
    .catch((e) => { logger.warn({ module: M }, "hostování k varování", e); return { results: [] as LoanAgreementRow[] }; });
  if (rows.results.length === 0 || await isAiClub(db, borrowerTeamId)) return 0;
  let warned = 0;
  for (const a of rows.results) {
    if (a.playing_time === "none") continue;
    const check = checkPlayingTime(a.playing_time, await loanMatchLines(db, a));
    if (check.state !== "at_risk" && check.state !== "breached") continue;
    const p = await db.prepare("SELECT first_name, last_name FROM players WHERE id = ?").bind(a.player_id)
      .first<{ first_name: string; last_name: string }>()
      .catch((e) => { logger.warn({ module: M }, "hráč pro varování", e); return null; });
    const lender = await teamName(db, a.lender_team_id);
    const name = p ? `${p.first_name} ${p.last_name}` : "hostující hráč";
    const tail = check.state === "breached"
      ? `${lender} ho může stáhnout zpátky.`
      : `Když zítra ${a.playing_time === "starter" ? "nezačne v základu" : "nenastoupí"}, podmínka padne a ${lender} ho může stáhnout.`;
    await sendSystemSMS(db, borrowerTeamId, SMS_ROLE,
      `Slíbili jste, že ${name} ${PROMISE_PHRASE[a.playing_time]}. ${playingTimeSummary(check)}. ${tail}`,
      { type: "loan", agreementId: a.id });
    await db.prepare("UPDATE loan_agreements SET warned_for_match_id = ? WHERE id = ?").bind(calendarId, a.id).run()
      .catch((e) => logger.warn({ module: M }, "zápis varování", e));
    warned++;
  }
  return warned;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000));
}

/** Kolik poplatku vrací půjčující, když stáhne hráče, který podmínku plní: poměrná část za zbývající dny. */
export function recallRefund(a: Pick<LoanAgreementRow, "fee" | "started_at" | "until">, gameDate: string, breached: boolean): number {
  if (breached || a.fee <= 0) return 0;
  const total = daysBetween(a.started_at, a.until);
  if (total <= 0) return 0;
  const left = Math.min(total, daysBetween(gameDate, a.until));
  return Math.round((a.fee * left) / total);
}

/** Nálada slovy, bez čísel (hráč není tabulka). */
export function moodWords(morale: number | null | undefined): string {
  const m = morale ?? 50;
  if (m >= 80) return "Je v pohodě";
  if (m >= 60) return "Je spokojený";
  if (m >= 40) return "Nic moc";
  if (m >= 20) return "Je zklamaný";
  return "Je naštvaný";
}

/** Klub, za který jedná přihlášený tým (áčko i jeho U21 jsou jeden klub). */
async function clubOf(db: D1Database, teamId: string): Promise<string> {
  const t = await db.prepare("SELECT COALESCE(parent_team_id, id) AS club FROM teams WHERE id = ?")
    .bind(teamId).first<{ club: string }>()
    .catch((e) => { logger.warn({ module: M }, "klub týmu", e); return null; });
  return t?.club ?? teamId;
}

async function gameDateOf(db: D1Database, teamId: string): Promise<string> {
  const t = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "herní datum", e); return null; });
  return t?.game_date ?? new Date().toISOString();
}

interface PlayerNow {
  first_name: string; last_name: string; age: number; position: string; overall_rating: number | null;
  skills: string | null; avatar: string | null; condition: number | null; morale: number | null;
}

function parseSkills(raw: string | null): Record<string, number> {
  if (!raw) return {};
  try {
    const s = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v === "number")) as Record<string, number>;
  } catch (e) {
    logger.warn({ module: M }, "dovednosti nejdou přečíst", e);
    return {};
  }
}

function parseJson(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, unknown>; } catch (e) {
    logger.warn({ module: M }, "JSON hráče nejde přečíst", e);
    return {};
  }
}

export interface LoanSummary {
  agreementId: string;
  playerId: string;
  playerName: string;
  age: number;
  position: string;
  rating: number | null;
  ratingChange: number | null;
  lenderTeamId: string;
  lenderName: string;
  borrowerTeamId: string;
  borrowerName: string;
  until: string;
  daysLeft: number;
  playingTime: LoanPlayingTime;
  playingTimeLabel: string;
  playingTimeState: PlayingTimeState;
  playingTimeSummary: string;
  matches: number;
  starts: number;
  minutes: number;
  goals: number;
  avgRating: number | null;
}

async function summarize(db: D1Database, a: LoanAgreementRow, gameDate: string): Promise<LoanSummary | null> {
  const p = await db.prepare(
    `SELECT first_name, last_name, age, position, overall_rating, skills, avatar,
            json_extract(life_context, '$.condition') AS condition, json_extract(life_context, '$.morale') AS morale
       FROM players WHERE id = ?`,
  ).bind(a.player_id).first<PlayerNow>()
    .catch((e) => { logger.warn({ module: M }, "hráč na hostování", e); return null; });
  if (!p) return null;
  const lines = await loanMatchLines(db, a);
  const check = checkPlayingTime(a.playing_time, lines);
  const played = lines.filter((l) => l.minutes > 0);
  const rated = played.filter((l) => l.rating != null);
  return {
    agreementId: a.id,
    playerId: a.player_id,
    playerName: `${p.first_name} ${p.last_name}`,
    age: p.age,
    position: p.position,
    rating: p.overall_rating,
    ratingChange: a.start_rating != null && p.overall_rating != null ? p.overall_rating - a.start_rating : null,
    lenderTeamId: a.lender_team_id,
    lenderName: await teamName(db, a.lender_team_id),
    borrowerTeamId: a.borrower_team_id,
    borrowerName: await teamName(db, a.borrower_team_id),
    until: a.until,
    daysLeft: daysBetween(gameDate, a.until),
    playingTime: a.playing_time,
    playingTimeLabel: LOAN_PLAYING_TIME_LABEL[a.playing_time],
    playingTimeState: check.state,
    playingTimeSummary: playingTimeSummary(check),
    matches: played.length,
    starts: played.filter((l) => l.started).length,
    minutes: played.reduce((s, l) => s + l.minutes, 0),
    goals: played.reduce((s, l) => s + l.goals, 0),
    avgRating: rated.length > 0 ? Math.round((rated.reduce((s, l) => s + (l.rating ?? 0), 0) / rated.length) * 10) / 10 : null,
  };
}

/** Přehled pro záložku Hostování: koho klub půjčil a koho má půjčeného. */
export async function loanOverview(db: D1Database, teamId: string): Promise<{ lent: LoanSummary[]; borrowed: LoanSummary[] }> {
  const club = await clubOf(db, teamId);
  await ensureLoanAgreements(db, club);
  const gameDate = await gameDateOf(db, club);
  const rows = await db.prepare(
    `SELECT * FROM loan_agreements
      WHERE status = 'active'
        AND (lender_team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)
          OR borrower_team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?))
      ORDER BY until`,
  ).bind(club, club, club, club).all<LoanAgreementRow>()
    .catch((e) => { logger.warn({ module: M }, "hostování klubu", e); return { results: [] as LoanAgreementRow[] }; });
  const lent: LoanSummary[] = [];
  const borrowed: LoanSummary[] = [];
  for (const a of rows.results) {
    if (!(await stillOnLoan(db, a))) continue;
    const s = await summarize(db, a, gameDate);
    if (!s) continue;
    if ((await clubOf(db, a.lender_team_id)) === club) lent.push(s);
    else borrowed.push(s);
  }
  return { lent, borrowed };
}

export interface LoanReport extends LoanSummary {
  role: "lender" | "borrower";
  status: LoanAgreementRow["status"];
  fee: number;
  startedAt: string;
  playingTimeCheck: PlayingTimeCheck;
  matchLines: LoanMatchLine[];
  totals: { matches: number; starts: number; minutes: number; goals: number; assists: number; yellowCards: number; redCards: number; avgRating: number | null; missed: number };
  development: {
    sinceBaseline: boolean;
    startRating: number | null;
    skills: Array<{ key: string; before: number; now: number }>;
  };
  training: { attended: number; total: number; gains: Array<{ key: string; change: number }> };
  now: { condition: number | null; mood: string; injuryDays: number | null; injury: string | null };
  avatar: Record<string, unknown>;
  recall: { allowed: boolean; refund: number; breached: boolean };
}

/** Podrobný přehled jednoho hostování. Vidí ho jen půjčující a hostující klub. */
export async function loanReport(db: D1Database, viewerTeamId: string, agreementId: string): Promise<LoanReport | { error: string; status: 403 | 404 }> {
  const a = await loadAgreement(db, agreementId);
  if (!a) return { error: "Hostování nenalezeno", status: 404 };
  const viewer = await clubOf(db, viewerTeamId);
  const lenderClub = await clubOf(db, a.lender_team_id);
  const borrowerClub = await clubOf(db, a.borrower_team_id);
  const role = viewer === lenderClub ? "lender" : viewer === borrowerClub ? "borrower" : null;
  if (!role) return { error: "Tohle hostování se tvého klubu netýká", status: 403 };

  const gameDate = await gameDateOf(db, viewer);
  const summary = await summarize(db, a, gameDate);
  if (!summary) return { error: "Hráč nenalezen", status: 404 };

  const lines = await loanMatchLines(db, a);
  const check = checkPlayingTime(a.playing_time, lines);
  const played = lines.filter((l) => l.minutes > 0);
  const rated = played.filter((l) => l.rating != null);

  const p = await db.prepare(
    `SELECT overall_rating, skills, avatar, json_extract(life_context, '$.condition') AS condition,
            json_extract(life_context, '$.morale') AS morale
       FROM players WHERE id = ?`,
  ).bind(a.player_id).first<{ overall_rating: number | null; skills: string | null; avatar: string | null; condition: number | null; morale: number | null }>()
    .catch((e) => { logger.warn({ module: M }, "stav hráče v přehledu", e); return null; });

  const before = parseSkills(a.start_skills);
  const now = parseSkills(p?.skills ?? null);
  const skills = Object.keys(now)
    .filter((k) => before[k] != null)
    .map((k) => ({ key: k, before: before[k], now: now[k] }));

  // Docházka u hostujícího klubu od začátku hostování. Kdyby se počítadlo klubu mezitím
  // vynulovalo, ukáže se jen to, co je v něm teď.
  const att = await trainingAttendance(db, a.borrower_team_id, a.player_id);
  const attended = att.attended >= a.start_training_attended ? att.attended - a.start_training_attended : att.attended;
  const total = att.total >= a.start_training_total ? att.total - a.start_training_total : att.total;

  const fromDay = (a.baseline_at ?? a.started_at).slice(0, 10);
  const gains = await db.prepare(
    `SELECT attribute, SUM(change) AS change FROM training_log
      WHERE player_id = ? AND team_id = ? AND substr(COALESCE(game_date, created_at), 1, 10) >= ?
      GROUP BY attribute HAVING SUM(change) != 0 ORDER BY SUM(change) DESC`,
  ).bind(a.player_id, a.borrower_team_id, fromDay).all<{ attribute: string; change: number }>()
    .catch((e) => { logger.warn({ module: M }, "zlepšení z tréninku", e); return { results: [] as { attribute: string; change: number }[] }; });

  const injury = await db.prepare(
    "SELECT description, days_remaining FROM injuries WHERE player_id = ? AND days_remaining > 0 ORDER BY days_remaining DESC LIMIT 1",
  ).bind(a.player_id).first<{ description: string; days_remaining: number }>()
    .catch((e) => { logger.warn({ module: M }, "zranění hráče", e); return null; });

  const breached = check.state === "breached";
  const active = a.status === "active" && await stillOnLoan(db, a);
  return {
    ...summary,
    role,
    status: a.status,
    fee: a.fee,
    startedAt: a.started_at,
    playingTimeCheck: check,
    matchLines: lines,
    totals: {
      matches: played.length,
      starts: played.filter((l) => l.started).length,
      minutes: played.reduce((s, l) => s + l.minutes, 0),
      goals: played.reduce((s, l) => s + l.goals, 0),
      assists: played.reduce((s, l) => s + l.assists, 0),
      yellowCards: played.reduce((s, l) => s + l.yellowCards, 0),
      redCards: played.reduce((s, l) => s + l.redCards, 0),
      avgRating: rated.length > 0 ? Math.round((rated.reduce((s, l) => s + (l.rating ?? 0), 0) / rated.length) * 10) / 10 : null,
      missed: lines.filter((l) => !l.available).length,
    },
    development: { sinceBaseline: !!a.baseline_at, startRating: a.start_rating, skills },
    training: { attended, total, gains: gains.results.map((g) => ({ key: g.attribute, change: g.change })) },
    now: {
      condition: p?.condition ?? null,
      mood: moodWords(p?.morale),
      injuryDays: injury?.days_remaining ?? null,
      injury: injury?.description ?? null,
    },
    avatar: parseJson(p?.avatar ?? null),
    recall: { allowed: role === "lender" && active, refund: recallRefund(a, gameDate, breached), breached },
  };
}

export type RecallResult = { ok: true; refund: number } | { ok: false; status: 400 | 403 | 404 | 409; error: string };

/**
 * Půjčující stáhne hráče z hostování. Hráč se vrací hned. Když hostující klub podmínku
 * hraní porušil, poplatek zůstává půjčujícímu. Jinak půjčující vrátí poměrnou část
 * poplatku za dny, které hráč u hostujícího klubu už nebude.
 */
export async function recallLoan(db: D1Database, actorTeamId: string, agreementId: string): Promise<RecallResult> {
  const a = await loadAgreement(db, agreementId);
  if (!a) return { ok: false, status: 404, error: "Hostování nenalezeno" };
  const actorClub = await clubOf(db, actorTeamId);
  if (actorClub !== await clubOf(db, a.lender_team_id)) return { ok: false, status: 403, error: "Stáhnout hráče může jen klub, který ho půjčil" };
  if (a.status !== "active" || !(await stillOnLoan(db, a))) return { ok: false, status: 409, error: "Hráč už na hostování není" };

  const check = checkPlayingTime(a.playing_time, await loanMatchLines(db, a));
  const breached = check.state === "breached";
  const lenderGameDate = await gameDateOf(db, a.lender_team_id);
  const refund = recallRefund(a, lenderGameDate, breached);

  const player = await db.prepare("SELECT first_name, last_name, team_id FROM players WHERE id = ?").bind(a.player_id)
    .first<{ first_name: string; last_name: string; team_id: string }>();
  if (!player) return { ok: false, status: 404, error: "Hráč nenalezen" };
  const name = `${player.first_name} ${player.last_name}`;

  const lender = await db.prepare("SELECT budget, name FROM teams WHERE id = ?").bind(a.lender_team_id).first<{ budget: number; name: string }>();
  const borrower = await db.prepare("SELECT budget, name, game_date FROM teams WHERE id = ?").bind(a.borrower_team_id).first<{ budget: number; name: string; game_date: string | null }>();
  if (!lender || !borrower) return { ok: false, status: 404, error: "Klub nenalezen" };
  if (refund > 0 && lender.budget < refund) {
    return { ok: false, status: 400, error: `Na vrácení části poplatku (${refund.toLocaleString("cs")} Kč) nemáš peníze.` };
  }

  // Přesun hráče je zámek: projde jen jednou, i kdyby se klikalo dvakrát.
  const moved = await db.prepare(
    "UPDATE players SET team_id = ?, loan_from_team_id = NULL, loan_until = NULL WHERE id = ? AND loan_from_team_id = ? AND team_id = ?",
  ).bind(a.lender_team_id, a.player_id, a.lender_team_id, player.team_id).run();
  if ((moved.meta.changes ?? 0) === 0) return { ok: false, status: 409, error: "Hráč už na hostování není" };

  const now = nowIso();
  const gameDate = borrower.game_date ?? now;
  const stmts = [
    db.prepare("UPDATE loan_agreements SET status = 'recalled', ended_at = ? WHERE id = ?").bind(now, a.id),
    db.prepare(
      `UPDATE player_contracts SET is_active = 0, left_at = ?, leave_type = 'loan_end'
        WHERE player_id = ? AND team_id = ? AND join_type = 'loan' AND is_active = 1`,
    ).bind(gameDate, a.player_id, player.team_id),
    // Rozjednaný odkup hostujícího klubu ztratil smysl.
    db.prepare(
      `UPDATE transfer_offers SET status = 'withdrawn', resolved_at = ?
        WHERE player_id = ? AND status IN ('pending','countered')`,
    ).bind(now, a.player_id),
  ];
  if (refund > 0) {
    stmts.push(
      db.prepare("UPDATE teams SET budget = budget - ? WHERE id = ?").bind(refund, a.lender_team_id),
      db.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'loan_fee', ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), a.lender_team_id, -refund, lender.budget - refund, `Stažení z hostování (vrácení části poplatku): ${name}`, gameDate),
      db.prepare("UPDATE teams SET budget = budget + ? WHERE id = ?").bind(refund, a.borrower_team_id),
      db.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'loan_income', ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), a.borrower_team_id, refund, borrower.budget + refund, `Vrácená část poplatku za hostování: ${name}`, gameDate),
    );
  }
  try {
    await db.batch(stmts);
  } catch (e) {
    logger.error({ module: M }, "stažení z hostování se nepodařilo dokončit, vracím hráče", e);
    await db.prepare("UPDATE players SET team_id = ?, loan_from_team_id = ?, loan_until = ? WHERE id = ? AND team_id = ? AND loan_from_team_id IS NULL")
      .bind(player.team_id, a.lender_team_id, a.until, a.player_id, a.lender_team_id).run()
      .catch((rollbackError) => logger.error({ module: M }, "vrácení hráče po chybě stažení", rollbackError));
    return { ok: false, status: 409, error: "Stažení se nepodařilo, zkus to znovu" };
  }

  if (!(await isAiClub(db, a.borrower_team_id))) {
    const why = breached && a.playing_time !== "none"
      ? `Neplnili jste podmínku: ${PROMISE_INFINITIVE[a.playing_time]}.`
      : refund > 0 ? `Z poplatku vám vrací ${refund.toLocaleString("cs")} Kč za zbývající dny.` : "";
    await sendSystemSMS(db, a.borrower_team_id, SMS_ROLE,
      `${lender.name} stahuje hráče z hostování: ${name} se k nim hned vrací. ${why}`.trim(),
      { type: "loan", agreementId: a.id });
  }
  return { ok: true, refund };
}

/**
 * Nový hráč k zapůjčení: krátká SMS klubům nižší soutěže v okrese. Každý klub nejvýš
 * jednu takovou zprávu za den, ať je víc inzerátů nezahltí.
 */
export async function announceLoanListing(db: D1Database, input: {
  listingTeamId: string; playerName: string; position: string; age: number; loanDays: number; fee: number; playingTime: LoanPlayingTime;
}): Promise<number> {
  const { LEVEL_RANK } = await import("../league/district-leagues");
  const lister = await db.prepare(
    `SELECT t.user_id, l.district, l.level, t.name FROM teams t JOIN leagues l ON l.id = t.league_id WHERE t.id = ?`,
  ).bind(input.listingTeamId).first<{ user_id: string | null; district: string | null; level: string; name: string }>()
    .catch((e) => { logger.warn({ module: M }, "klub inzerátu", e); return null; });
  if (!lister?.district) return 0;
  const listerRank = LEVEL_RANK[lister.level] ?? 0;
  const lowerLevels = Object.entries(LEVEL_RANK).filter(([, r]) => r < listerRank).map(([lvl]) => lvl);
  if (lowerLevels.length === 0) return 0;

  const recipients = await db.prepare(
    `SELECT t.id FROM teams t JOIN leagues l ON l.id = t.league_id
      WHERE l.district = ? AND l.level IN (${lowerLevels.map(() => "?").join(",")})
        AND t.parent_team_id IS NULL AND t.user_id IS NOT NULL AND t.user_id != 'ai'
        AND t.user_id != ?
        AND NOT EXISTS (SELECT 1 FROM managers mm WHERE mm.team_id = t.id AND mm.user_id = 'ai')
        AND NOT EXISTS (
          SELECT 1 FROM messages m JOIN conversations c ON c.id = m.conversation_id
           WHERE c.team_id = t.id AND c.type = 'system' AND c.title = ?
             AND json_extract(m.metadata, '$.type') = 'loan_market'
             AND m.sent_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-20 hours'))`,
  ).bind(lister.district, ...lowerLevels, lister.user_id ?? "", SMS_ROLE).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, "příjemci zprávy o hostování", e); return { results: [] as { id: string }[] }; });

  const { areClubsLinked } = await import("../competition/club-links");
  const condition = input.playingTime === "none" ? "" : ` Podmínka: ${LOAN_PLAYING_TIME_LABEL[input.playingTime].toLowerCase()}.`;
  const fee = input.fee > 0 ? `za ${input.fee.toLocaleString("cs")} Kč` : "zdarma";
  const body = `${lister.name} nabízí hráče na hostování: ${input.playerName} (${input.age}, ${positionWord(input.position)}), ${input.loanDays} dní ${fee}.${condition} Najdete ho v Přestupech na trhu.`;
  let sent = 0;
  for (const r of recipients.results) {
    if (await areClubsLinked(db, r.id, input.listingTeamId)) continue;
    await sendSystemSMS(db, r.id, SMS_ROLE, body, { type: "loan_market" });
    sent++;
  }
  return sent;
}

function positionWord(position: string): string {
  return ({ GK: "brankář", DEF: "obránce", MID: "záložník", FWD: "útočník" } as Record<string, string>)[position] ?? position;
}
