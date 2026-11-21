/**
 * Tipovačka v hospodě.
 *
 * Kolo je jeden den ligových zápasů seniorských soutěží okresu (pražské datum výkopu).
 * Lidské kluby okresu tipují výsledky na lístku v Hospodě, každý zápas do svého výkopu.
 * S prvním tipem kola se strhne vklad 200 Kč. Po kole se sečtou body (3 přesný výsledek,
 * 1 tendence), bank si rozdělí nejlepší beze zbytku a hospodský pošle výsledky SMS.
 *
 * Vyhodnocení volá konec kola (multiplayer/match-runner.ts) a záchranná síť denního ticku.
 * Opakované volání nic nezdvojí: kolo se nejdřív zabere podmíněným UPDATE a výplaty mají
 * referenci.
 */

import { logger } from "../lib/logger";
import { recordTransaction } from "../season/finance-processor";

const M = "pub-tips";
export const TIP_STAKE = 200;
export const PUB_KEEPER = "Hospodský";
/** Zápas, který se do tolika hodin po výkopu neodehraje, se z tipovačky vyřadí. */
const VOID_AFTER_HOURS = 48;

export function tipPoints(tip: { home: number; away: number }, result: { home: number; away: number }): number {
  if (tip.home === result.home && tip.away === result.away) return 3;
  return Math.sign(tip.home - tip.away) === Math.sign(result.home - result.away) ? 1 : 0;
}

/**
 * Bank nejlepším: při shodě se dělí, zbylé koruny po celých dostanou dřív přihlášení
 * (podle pořadí v `entries`), takže se rozdá přesně celý bank.
 */
export function splitTipPot(entries: Array<{ teamId: string; points: number }>, pot: number): Map<string, number> {
  const out = new Map<string, number>();
  if (!entries.length || pot <= 0) return out;
  const best = Math.max(...entries.map((e) => e.points));
  const winners = entries.filter((e) => e.points === best);
  const share = Math.floor(pot / winners.length);
  let rest = pot - share * winners.length;
  for (const w of winners) {
    out.set(w.teamId, share + (rest > 0 ? 1 : 0));
    if (rest > 0) rest--;
  }
  return out;
}

export function isValidScore(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 20;
}

function pragueDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function czDay(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d}. ${m}.`;
}

function money(n: number): string {
  return `${n.toLocaleString("cs-CZ").replace(/ /g, " ")} Kč`;
}

export async function teamDistrict(db: D1Database, teamId: string): Promise<{ district: string; userId: string | null } | null> {
  const row = await db.prepare(
    "SELECT l.district, t.user_id FROM teams t JOIN leagues l ON l.id = t.league_id WHERE t.id = ? AND t.parent_team_id IS NULL",
  ).bind(teamId).first<{ district: string | null; user_id: string | null }>();
  return row?.district ? { district: row.district, userId: row.user_id } : null;
}

export interface TipMatch {
  matchId: string;
  leagueName: string;
  home: string;
  away: string;
  kickoffAt: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
}

/** Zápasy seniorských soutěží okresu v jeden pražský den. */
async function matchesOnDay(db: D1Database, district: string, day: string): Promise<TipMatch[]> {
  // Pražský den je v UTC nejvýš o dvě hodiny posunutý, stačí vzít okno ±1 den a dofiltrovat.
  const from = new Date(Date.parse(`${day}T00:00:00Z`) - 86400_000).toISOString();
  const to = new Date(Date.parse(`${day}T00:00:00Z`) + 2 * 86400_000).toISOString();
  const rows = await db.prepare(
    `SELECT m.id, l.name AS league_name, th.name AS home, ta.name AS away, sc.scheduled_at, m.status, m.home_score, m.away_score
       FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id JOIN leagues l ON l.id = m.league_id
       JOIN teams th ON th.id = m.home_team_id JOIN teams ta ON ta.id = m.away_team_id
      WHERE l.district = ? AND l.league_type = 'senior' AND COALESCE(l.waiting, 0) = 0
        AND sc.scheduled_at >= ? AND sc.scheduled_at < ?
      ORDER BY l.name, th.name`,
  ).bind(district, from, to).all<{ id: string; league_name: string; home: string; away: string; scheduled_at: string; status: string; home_score: number | null; away_score: number | null }>();
  return rows.results.filter((r) => pragueDate(r.scheduled_at) === day).map((r) => ({
    matchId: r.id, leagueName: r.league_name, home: r.home, away: r.away, kickoffAt: r.scheduled_at,
    status: r.status, homeScore: r.home_score, awayScore: r.away_score,
  }));
}

/** Nejbližší den, kdy se v okrese hraje a ještě nebyl výkop. */
async function nextRoundDay(db: D1Database, district: string, now: Date): Promise<string | null> {
  const row = await db.prepare(
    `SELECT MIN(sc.scheduled_at) AS next FROM season_calendar sc JOIN leagues l ON l.id = sc.league_id
      WHERE l.district = ? AND l.league_type = 'senior' AND COALESCE(l.waiting, 0) = 0
        AND sc.status = 'scheduled' AND sc.scheduled_at > ?`,
  ).bind(district, now.toISOString()).first<{ next: string | null }>();
  return row?.next ? pragueDate(row.next) : null;
}

function roundId(district: string, day: string): string {
  return `tip-${district.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-")}-${day}`;
}

async function activeSeason(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT MAX(number) AS n FROM seasons WHERE status = 'active'").first<{ n: number | null }>();
  return row?.n ?? 0;
}

export interface TipView {
  round: { id: string; day: string; stake: number; pot: number; entries: number; joined: boolean } | null;
  matches: Array<TipMatch & { open: boolean; tip: { home: number; away: number } | null }>;
  last: { day: string; winners: Array<{ name: string; points: number; payout: number }>; myPoints: number | null; myPayout: number } | null;
  season: Array<{ teamId: string; name: string; points: number; rounds: number }>;
}

/** Data pro lístek v Hospodě. */
export async function loadTipView(db: D1Database, teamId: string, now: Date = new Date()): Promise<TipView | null> {
  const where = await teamDistrict(db, teamId);
  if (!where) return null;
  const day = await nextRoundDay(db, where.district, now);
  let round: TipView["round"] = null;
  let matches: TipView["matches"] = [];
  if (day) {
    const id = roundId(where.district, day);
    const [list, entries, mine, tips] = await Promise.all([
      matchesOnDay(db, where.district, day),
      db.prepare("SELECT COUNT(*) AS n FROM pub_tip_entries WHERE round_id = ?").bind(id).first<{ n: number }>(),
      db.prepare("SELECT 1 AS x FROM pub_tip_entries WHERE round_id = ? AND team_id = ?").bind(id, teamId).first<{ x: number }>(),
      db.prepare("SELECT match_id, home, away FROM pub_tips WHERE round_id = ? AND team_id = ?").bind(id, teamId).all<{ match_id: string; home: number; away: number }>(),
    ]);
    const tipOf = new Map(tips.results.map((t) => [t.match_id, { home: t.home, away: t.away }]));
    const n = entries?.n ?? 0;
    round = { id, day, stake: TIP_STAKE, pot: n * TIP_STAKE, entries: n, joined: !!mine };
    matches = list.map((m) => ({ ...m, open: m.status === "scheduled" && m.kickoffAt > now.toISOString(), tip: tipOf.get(m.matchId) ?? null }));
  }

  const lastRound = await db.prepare(
    "SELECT id, round_date FROM pub_tip_rounds WHERE district = ? AND status = 'settled' ORDER BY round_date DESC LIMIT 1",
  ).bind(where.district).first<{ id: string; round_date: string }>();
  let last: TipView["last"] = null;
  if (lastRound) {
    const rows = await db.prepare(
      `SELECT e.team_id, e.points, e.payout, t.name FROM pub_tip_entries e JOIN teams t ON t.id = e.team_id
        WHERE e.round_id = ? ORDER BY e.points DESC, e.created_at`,
    ).bind(lastRound.id).all<{ team_id: string; points: number | null; payout: number; name: string }>();
    const mine = rows.results.find((r) => r.team_id === teamId);
    last = {
      day: lastRound.round_date,
      winners: rows.results.filter((r) => r.payout > 0).map((r) => ({ name: r.name, points: r.points ?? 0, payout: r.payout })),
      myPoints: mine ? mine.points ?? 0 : null,
      myPayout: mine?.payout ?? 0,
    };
  }

  const season = await activeSeason(db);
  const table = await db.prepare(
    `SELECT e.team_id, t.name, SUM(COALESCE(e.points, 0)) AS points, COUNT(*) AS rounds
       FROM pub_tip_entries e JOIN pub_tip_rounds r ON r.id = e.round_id JOIN teams t ON t.id = e.team_id
      WHERE r.district = ? AND r.season_number = ? AND r.status = 'settled'
      GROUP BY e.team_id ORDER BY points DESC, rounds ASC LIMIT 10`,
  ).bind(where.district, season).all<{ team_id: string; name: string; points: number; rounds: number }>();
  return { round, matches, last, season: table.results.map((r) => ({ teamId: r.team_id, name: r.name, points: r.points, rounds: r.rounds })) };
}

export class TipError extends Error {
  constructor(message: string, readonly status: 400 | 409 = 400) {
    super(message);
  }
}

/**
 * Uloží tipy klubu na nejbližší kolo. Zápas po výkopu se už tipovat nedá. S prvním tipem
 * kola se strhne vklad (jen jednou, i při dvojkliku).
 */
export async function saveTips(
  db: D1Database, teamId: string, tips: Array<{ matchId: string; home: unknown; away: unknown }>, now: Date = new Date(),
): Promise<{ saved: number; charged: boolean }> {
  const where = await teamDistrict(db, teamId);
  if (!where || !where.userId || where.userId === "ai") throw new TipError("Tipovačka je jen pro kluby trenérů.");
  const day = await nextRoundDay(db, where.district, now);
  if (!day) throw new TipError("Teď se žádné kolo netipuje.");
  const matches = await matchesOnDay(db, where.district, day);
  const byId = new Map(matches.map((m) => [m.matchId, m]));
  const valid = tips.filter((t) => byId.has(t.matchId));
  if (!valid.length) {
    // Typicky lístek otevřený před výkopem a odeslaný po něm: kolo se mezitím posunulo na další den.
    const ids = tips.map((t) => t.matchId).slice(0, 20);
    const started = ids.length ? await db.prepare(
      `SELECT 1 AS x FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
        WHERE m.id IN (${ids.map(() => "?").join(",")}) AND (m.status != 'scheduled' OR sc.scheduled_at <= ?) LIMIT 1`,
    ).bind(...ids, now.toISOString()).first<{ x: number }>() : null;
    if (started) throw new TipError("Zápas už začal, tip na něj nejde změnit.", 409);
    throw new TipError("Na lístku není žádný zápas tohohle kola.");
  }
  for (const t of valid) {
    if (!isValidScore(t.home) || !isValidScore(t.away)) throw new TipError("Tip musí být skóre od 0 do 20.");
    const m = byId.get(t.matchId)!;
    if (m.status !== "scheduled" || m.kickoffAt <= now.toISOString()) throw new TipError(`Zápas ${m.home} proti ${m.away} už začal, tip na něj nejde změnit.`, 409);
  }
  const id = roundId(where.district, day);
  const season = await activeSeason(db);
  await db.prepare(
    "INSERT OR IGNORE INTO pub_tip_rounds (id, district, round_date, season_number, stake) VALUES (?, ?, ?, ?, ?)",
  ).bind(id, where.district, day, season, TIP_STAKE).run();

  // Vklad: řádek účasti je zámek, strhne se jen tomu, kdo ho právě založil.
  const joined = await db.prepare("SELECT 1 AS x FROM pub_tip_entries WHERE round_id = ? AND team_id = ?").bind(id, teamId).first<{ x: number }>();
  let charged = false;
  if (!joined) {
    const budget = await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>();
    if ((budget?.budget ?? 0) < TIP_STAKE) throw new TipError(`Na vklad ${money(TIP_STAKE)} teď na účtu nemáte.`);
    const ins = await db.prepare("INSERT OR IGNORE INTO pub_tip_entries (round_id, team_id) VALUES (?, ?)").bind(id, teamId).run();
    if (ins.meta.changes) {
      try {
        await recordTransaction(db, teamId, "pub_tip_stake", -TIP_STAKE, `Tipovačka v hospodě: vklad na ${czDay(day)}`, now.toISOString().slice(0, 10), `pubtip-${id}-stake`);
        charged = true;
      } catch (e) {
        // Vklad neprošel (záporný rozpočet): účast zrušit, ať klub nehraje zadarmo.
        await db.prepare("DELETE FROM pub_tip_entries WHERE round_id = ? AND team_id = ?").bind(id, teamId).run();
        logger.warn({ module: M, teamId }, "vklad do tipovačky", e);
        throw new TipError(`Na vklad ${money(TIP_STAKE)} teď na účtu nemáte.`);
      }
    }
  }
  await db.batch(valid.map((t) => db.prepare(
    `INSERT INTO pub_tips (round_id, team_id, match_id, home, away) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (round_id, team_id, match_id) DO UPDATE SET home = excluded.home, away = excluded.away,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`,
  ).bind(id, teamId, t.matchId, t.home, t.away)));
  return { saved: valid.length, charged };
}

/**
 * Vyhodnotí kola, jejichž zápasy jsou dohrané (nebo po lhůtě vyřazené). Bank nejlepším,
 * SMS od hospodského všem tipujícím. Vrací počet vyhodnocených kol.
 */
export async function settlePubTips(db: D1Database, now: Date = new Date()): Promise<number> {
  const open = await db.prepare("SELECT id, district, round_date FROM pub_tip_rounds WHERE status = 'open' AND round_date <= ?")
    .bind(pragueDate(now.toISOString())).all<{ id: string; district: string; round_date: string }>();
  let settled = 0;
  for (const r of open.results) {
    const matches = await matchesOnDay(db, r.district, r.round_date);
    const deadline = (m: TipMatch) => Date.parse(m.kickoffAt) + VOID_AFTER_HOURS * 3600_000 <= now.getTime();
    const waiting = matches.some((m) => !(m.status === "simulated" && m.homeScore != null) && !deadline(m));
    if (waiting) continue;
    const claimed = await db.prepare("UPDATE pub_tip_rounds SET status = 'settling' WHERE id = ? AND status = 'open'").bind(r.id).run();
    if (!claimed.meta.changes) continue;
    try {
      await settleRound(db, r, matches);
      settled++;
    } catch (e) {
      logger.error({ module: M }, `vyhodnocení tipovačky ${r.id}`, e);
      await db.prepare("UPDATE pub_tip_rounds SET status = 'open' WHERE id = ? AND status = 'settling'").bind(r.id).run()
        .catch((err) => logger.warn({ module: M }, `uvolnění kola tipovačky ${r.id}`, err));
    }
  }
  return settled;
}

async function settleRound(db: D1Database, r: { id: string; district: string; round_date: string }, matches: TipMatch[]): Promise<void> {
  const results = new Map(matches.filter((m) => m.status === "simulated" && m.homeScore != null && m.awayScore != null)
    .map((m) => [m.matchId, { home: m.homeScore!, away: m.awayScore! }]));
  const tips = await db.prepare("SELECT team_id, match_id, home, away FROM pub_tips WHERE round_id = ?").bind(r.id)
    .all<{ team_id: string; match_id: string; home: number; away: number }>();
  const entries = await db.prepare(
    "SELECT e.team_id, t.name FROM pub_tip_entries e JOIN teams t ON t.id = e.team_id WHERE e.round_id = ? ORDER BY e.created_at, e.team_id",
  ).bind(r.id).all<{ team_id: string; name: string }>();
  const totals = new Map(entries.results.map((e) => [e.team_id, 0]));
  const stmts: D1PreparedStatement[] = [];
  for (const t of tips.results) {
    const res = results.get(t.match_id);
    const pts = res ? tipPoints(t, res) : 0;
    totals.set(t.team_id, (totals.get(t.team_id) ?? 0) + pts);
    stmts.push(db.prepare("UPDATE pub_tips SET points = ? WHERE round_id = ? AND team_id = ? AND match_id = ?").bind(res ? pts : null, r.id, t.team_id, t.match_id));
  }
  const pot = entries.results.length * TIP_STAKE;
  const ordered = entries.results.map((e) => ({ teamId: e.team_id, points: totals.get(e.team_id) ?? 0 }));
  const payouts = splitTipPot(ordered, pot);
  for (const e of ordered) {
    stmts.push(db.prepare("UPDATE pub_tip_entries SET points = ?, payout = ? WHERE round_id = ? AND team_id = ?")
      .bind(e.points, payouts.get(e.teamId) ?? 0, r.id, e.teamId));
  }
  if (stmts.length) await db.batch(stmts);
  for (const [teamId, amount] of payouts) {
    const done = await db.prepare("SELECT 1 FROM transactions WHERE team_id = ? AND reference_id = ? LIMIT 1").bind(teamId, `pubtip-${r.id}-win`).first();
    if (done || amount <= 0) continue;
    await recordTransaction(db, teamId, "pub_tip_win", amount, `Tipovačka v hospodě: výhra za ${czDay(r.round_date)}`, r.round_date, `pubtip-${r.id}-win`);
  }
  await db.prepare("UPDATE pub_tip_rounds SET status = 'settled', settled_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?").bind(r.id).run();

  const nameOf = new Map(entries.results.map((e) => [e.team_id, e.name]));
  const winners = [...payouts.entries()].map(([id, amount]) => `${nameOf.get(id)} (${money(amount)})`);
  const best = Math.max(0, ...ordered.map((e) => e.points));
  const { sendSystemSMS } = await import("../messaging/system-sms");
  for (const e of ordered) {
    const mine = payouts.get(e.teamId) ?? 0;
    const head = mine > 0
      ? `Tipovačka za ${czDay(r.round_date)}: máte ${e.points} ${e.points === 1 ? "bod" : e.points >= 2 && e.points <= 4 ? "body" : "bodů"} a berete ${money(mine)}.`
      : `Tipovačka za ${czDay(r.round_date)}: máte ${e.points} ${e.points === 1 ? "bod" : e.points >= 2 && e.points <= 4 ? "body" : "bodů"}, nejlepší měl ${best}.`;
    const tail = mine > 0 && payouts.size === 1 ? " Celý bank je váš, příště platíte rundu." : ` Bank ${money(pot)} si vzal ${winners.join(", ")}.`;
    await sendSystemSMS(db, e.teamId, PUB_KEEPER, `${head}${tail}`, { type: "guide", href: "/hospoda", label: "Otevřít Hospodu" })
      .catch((err) => logger.warn({ module: M, teamId: e.teamId }, "SMS hospodského o tipovačce", err));
  }
  logger.info({ module: M }, `tipovačka ${r.id}: ${entries.results.length} tipujících, bank ${pot} Kč`);
}
