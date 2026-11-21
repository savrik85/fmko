/**
 * Domácí pomezní s praporkem (F15).
 *
 * Okresní sudí často píská bez delegovaných asistentů a praporek dostane někdo
 * od domácích: hráč, který nehraje, nebo vůdce kotle. Poctivý pomezní zápas
 * neovlivní. Nadržující (`homer`) zvedá praporek spíš proti hostům, takže sporný
 * ofsajd (neuznaný gól) padne častěji ve prospěch domácích.
 *
 * Sudí to může prokouknout a pomezního vyměnit (šance roste s jeho přísností),
 * pak posun neplatí. Rozhodnutí o výměně se počítá tady, z vlastní náhody odvozené
 * z id zápasu: hlavní RNG zápasu se nesmí čerpat navíc, jinak by se rozjely výsledky.
 *
 * Kdo nasadí nadržujícího pomezního potřetí v sezóně, dostane od soutěže pokutu
 * (skutek `linesman_bias`), a pak za každého dalšího.
 */

import { createRng } from "../generators/rng";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";

const M = "linesman";

export const LINESMAN_KINDS = ["player", "fan_leader"] as const;
export const LINESMAN_STYLES = ["fair", "homer"] as const;
export type LinesmanKind = typeof LINESMAN_KINDS[number];
export type LinesmanStyle = typeof LINESMAN_STYLES[number];

/** Volba pomezního, jak se ukládá do `lineups.linesman` a `lineup_presets.linesman`. */
export interface LinesmanChoice {
  kind: LinesmanKind;
  /** `players.id` nebo `fan_leaders.id`. */
  id: string;
  style: LinesmanStyle;
}

/** Pomezní, jak zápas proběhl. Ukládá se do `matches.home_lineup_data.linesman`. */
export interface StoredLinesman extends LinesmanChoice {
  name: string;
  /** Sudí ho před výkopem vyměnil, posun neplatil. */
  swapped: boolean;
}

/**
 * Posun prahu strany u ofsajdu (`planRefereeError`). Poctivý pomezní nic neposouvá,
 * nadržující dá domácím u sporného ofsajdu zhruba 80 % místo 50 %.
 */
export const LINESMAN_TILT: Record<LinesmanStyle, number> = { fair: 0, homer: 0.3 };

/** Kolikátý nadržující pomezní v sezóně už je skutek pro disciplinárku. */
export const LINESMAN_BIAS_LIMIT = 3;
/** Pokuta za každého nadržujícího pomezního od třetího v sezóně. */
export const LINESMAN_BIAS_FINE = 2_000;
export const LINESMAN_BIAS_KIND = "linesman_bias";

/** Přečte volbu z DB (text) nebo z těla požadavku (objekt). Cokoli neplatného = bez pomezního. */
export function parseLinesman(raw: unknown): LinesmanChoice | null {
  let value = raw;
  if (typeof raw === "string") {
    if (!raw) return null;
    try {
      value = JSON.parse(raw);
    } catch (e) {
      logger.warn({ module: M }, "nečitelný pomezní v sestavě", e);
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!(LINESMAN_KINDS as readonly unknown[]).includes(v.kind)) return null;
  if (!(LINESMAN_STYLES as readonly unknown[]).includes(v.style)) return null;
  if (typeof v.id !== "string" || !v.id) return null;
  return { kind: v.kind as LinesmanKind, id: v.id, style: v.style as LinesmanStyle };
}

/** Hodnota do sloupce `linesman`. */
export function linesmanColumn(choice: LinesmanChoice | null): string | null {
  return choice ? JSON.stringify({ kind: choice.kind, id: choice.id, style: choice.style }) : null;
}

/**
 * Šance, že sudí nadržujícího pomezního prokoukne a vymění. Pohodář (~30) ho
 * nechá skoro vždycky, puntičkář (~80) zhruba v každém druhém zápase.
 */
export function refereeSwapChance(strictness: number): number {
  const s = Math.min(100, Math.max(0, strictness));
  return 0.1 + 0.45 * (s / 100);
}

/**
 * Posun pro engine a jestli sudí pomezního vyměnil. Náhoda je vlastní, odvozená
 * z id zápasu: stejný zápas dopadne pokaždé stejně a hlavní RNG zůstane nedotčený.
 */
export function resolveLinesmanTilt(
  choice: LinesmanChoice | null, matchId: string, refereeStrictness: number,
): { tilt: number; swapped: boolean } {
  if (!choice || choice.style !== "homer") return { tilt: 0, swapped: false };
  const roll = createRng(seedFromString(`linesman-swap:${matchId}`)).random();
  if (roll < refereeSwapChance(refereeStrictness)) return { tilt: 0, swapped: true };
  return { tilt: LINESMAN_TILT.homer, swapped: false };
}

// ── Databáze ──────────────────────────────────────────────────────────────────

type CheckResult = { ok: true } | { ok: false; error: string };

/**
 * Smí tenhle člověk držet praporek domácích? Hráč musí být v kádru a mimo zápas
 * (`occupiedIds` = základ a lavička), vůdce kotle musí patřit klubu a být aktivní.
 */
export async function validateLinesmanForTeam(
  db: D1Database, teamId: string, choice: LinesmanChoice, occupiedIds: ReadonlySet<string>,
): Promise<CheckResult> {
  if (choice.kind === "player") {
    if (occupiedIds.has(choice.id)) return { ok: false, error: "Pomezní nemůže zároveň hrát ani sedět na lavičce." };
    const row = await db.prepare(
      "SELECT id FROM players WHERE id = ? AND team_id = ? AND (status IS NULL OR status = 'active')",
    ).bind(choice.id, teamId).first<{ id: string }>();
    return row ? { ok: true } : { ok: false, error: "Pomezní musí být hráč vašeho kádru." };
  }
  const row = await db.prepare(
    "SELECT id FROM fan_leaders WHERE id = ? AND team_id = ? AND status = 'active'",
  ).bind(choice.id, teamId).first<{ id: string }>();
  return row ? { ok: true } : { ok: false, error: "Pomezní musí být vůdce vašich fanoušků." };
}

/** Vůdci fanoušků klubu, kteří můžou vzít praporek. */
export async function loadLinesmanFanLeaders(
  db: D1Database, teamId: string,
): Promise<Array<{ id: string; name: string; groupName: string | null }>> {
  const rows = await db.prepare(
    `SELECT fl.id, fl.first_name, fl.last_name, fl.nickname, fg.name AS group_name
       FROM fan_leaders fl LEFT JOIN fan_groups fg ON fg.id = fl.group_id
      WHERE fl.team_id = ? AND fl.status = 'active'
      ORDER BY fl.id`,
  ).bind(teamId).all<{ id: string; first_name: string; last_name: string; nickname: string | null; group_name: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `vůdci fanoušků klubu ${teamId}`, e); return { results: [] }; });
  const { fanLeaderFullName } = await import("../fans/fan-group-generator");
  return rows.results.map((r) => ({ id: r.id, name: fanLeaderFullName(r), groupName: r.group_name }));
}

export interface LinesmanOverview {
  /** Domácí ligový zápas: jen tam si klub pomezního staví. */
  applies: boolean;
  /** Uložená volba (sestava zápasu, jinak poslední uložená sestava). */
  current: LinesmanChoice | null;
  fanLeaders: Array<{ id: string; name: string; groupName: string | null }>;
  /** Kolikrát letos doma nadržoval. */
  homerUses: number;
  limit: number;
  fine: number;
}

/** Podklad pro volbu pomezního na stránce sestavy. */
export async function loadLinesmanOverview(db: D1Database, teamId: string, calendarId: string): Promise<LinesmanOverview> {
  const base: LinesmanOverview = {
    applies: false, current: null, fanLeaders: [], homerUses: 0, limit: LINESMAN_BIAS_LIMIT, fine: LINESMAN_BIAS_FINE,
  };
  const match = await db.prepare(
    `SELECT sc.league_id, sc.season_number FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
      WHERE m.calendar_id = ? AND m.home_team_id = ? LIMIT 1`,
  ).bind(calendarId, teamId).first<{ league_id: string; season_number: number }>()
    .catch((e) => { logger.warn({ module: M }, `domácí zápas kola ${calendarId}`, e); return null; });
  if (!match) return base;

  const exact = await db.prepare(
    "SELECT linesman FROM lineups WHERE team_id = ? AND calendar_id = ? ORDER BY is_auto ASC, submitted_at DESC, id ASC LIMIT 1",
  ).bind(teamId, calendarId).first<{ linesman: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `pomezní v sestavě kola ${calendarId}`, e); return null; });
  // Bez sestavy na tohle kolo platí poslední uložená, stejně jako u sestavy samotné.
  const row = exact ?? await db.prepare(
    "SELECT linesman FROM lineups WHERE team_id = ? AND is_auto = 0 ORDER BY submitted_at DESC, id ASC LIMIT 1",
  ).bind(teamId).first<{ linesman: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `pomezní v poslední sestavě klubu ${teamId}`, e); return null; });

  const homerUses = await countHomerLinesmen(db, { teamId, leagueId: match.league_id, seasonNumber: match.season_number })
    .catch((e) => { logger.warn({ module: M }, `nadržující pomezní klubu ${teamId}`, e); return 0; });
  return {
    ...base,
    applies: true,
    current: parseLinesman(row?.linesman ?? null),
    fanLeaders: await loadLinesmanFanLeaders(db, teamId),
    homerUses,
  };
}

async function linesmanName(db: D1Database, teamId: string, choice: LinesmanChoice): Promise<string | null> {
  if (choice.kind === "player") {
    const p = await db.prepare(
      "SELECT first_name, last_name FROM players WHERE id = ? AND team_id = ? AND (status IS NULL OR status = 'active')",
    ).bind(choice.id, teamId).first<{ first_name: string; last_name: string }>();
    return p ? `${p.first_name} ${p.last_name}` : null;
  }
  const l = await db.prepare(
    "SELECT first_name, last_name, nickname FROM fan_leaders WHERE id = ? AND team_id = ? AND status = 'active'",
  ).bind(choice.id, teamId).first<{ first_name: string; last_name: string; nickname: string | null }>();
  if (!l) return null;
  const { fanLeaderFullName } = await import("../fans/fan-group-generator");
  return fanLeaderFullName(l);
}

export interface MatchLinesman {
  stored: StoredLinesman;
  /** Posun pro `simulateMatch` (`homeLinesmanTilt`). */
  tilt: number;
}

/**
 * Pomezní domácích na tenhle zápas, nebo null. Čte se ze sestavy kola (stejné pořadí
 * jako načtení sestavy v match-runneru). Hráč, který nakonec nastoupil nebo je na
 * lavičce (`playingIds`), praporek nedrží.
 */
export async function resolveMatchLinesman(db: D1Database, opts: {
  matchId: string;
  calendarId: string;
  homeTeamId: string;
  refereeStrictness: number;
  playingIds: ReadonlySet<string>;
}): Promise<MatchLinesman | null> {
  const row = await db.prepare(
    "SELECT linesman FROM lineups WHERE team_id = ? AND calendar_id = ? ORDER BY is_auto ASC, submitted_at DESC, id ASC LIMIT 1",
  ).bind(opts.homeTeamId, opts.calendarId).first<{ linesman: string | null }>();
  const choice = parseLinesman(row?.linesman ?? null);
  if (!choice) return null;
  if (choice.kind === "player" && opts.playingIds.has(choice.id)) {
    logger.info({ module: M }, `pomezní ${choice.id} v zápase ${opts.matchId} nastoupil, praporek nedrží`);
    return null;
  }
  const name = await linesmanName(db, opts.homeTeamId, choice);
  if (!name) {
    logger.info({ module: M }, `pomezní ${choice.kind} ${choice.id} už ke klubu ${opts.homeTeamId} nepatří`);
    return null;
  }
  const { tilt, swapped } = resolveLinesmanTilt(choice, opts.matchId, opts.refereeStrictness);
  return { stored: { ...choice, name, swapped }, tilt };
}

/**
 * Kolikrát klub letos doma nasadil nadržujícího pomezního (vyměněné sudím se počítají
 * taky: zapsané v zápisu o utkání jsou). Jen odehrané ligové zápasy dané sezóny.
 */
export async function countHomerLinesmen(db: D1Database, opts: {
  teamId: string;
  leagueId: string;
  seasonNumber: number;
}): Promise<number> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM matches
      WHERE home_team_id = ? AND status = 'simulated'
        AND calendar_id IN (SELECT id FROM season_calendar WHERE league_id = ? AND season_number = ?)
        AND (CASE WHEN json_valid(home_lineup_data) THEN json_extract(home_lineup_data, '$.linesman.style') END) = 'homer'`,
  ).bind(opts.teamId, opts.leagueId, opts.seasonNumber).first<{ n: number }>();
  return row?.n ?? 0;
}

const TIMES = ["", "poprvé", "podruhé", "potřetí", "počtvrté", "popáté", "pošesté", "posedmé", "poosmé", "podeváté", "podesáté"];

/** „potřetí", „počtvrté"… do textu pokuty. */
function timesText(n: number): string {
  return TIMES[n] ?? `po ${n}.`;
}

/**
 * Po zápase s nadržujícím pomezním: od třetího v sezóně pokuta přes disciplinárku.
 * Klíč pokuty je id zápasu, takže opakovaný běh kola ji podruhé nestrhne.
 */
export async function punishLinesmanBias(db: D1Database, opts: {
  matchId: string;
  teamId: string;
  leagueId: string;
  seasonNumber: number;
  gameDate: string;
}): Promise<{ uses: number; sanctioned: boolean }> {
  const uses = await countHomerLinesmen(db, opts);
  if (uses < LINESMAN_BIAS_LIMIT) return { uses, sanctioned: false };
  const { issueSanction } = await import("../competition/discipline");
  const id = await issueSanction(db, {
    leagueId: opts.leagueId,
    seasonNumber: opts.seasonNumber,
    teamId: opts.teamId,
    amount: LINESMAN_BIAS_FINE,
    kind: LINESMAN_BIAS_KIND,
    reason: `nadržující domácí pomezní ${timesText(uses)} v sezóně`,
    evidence: `Nadržující domácí pomezní v ${uses} domácích zápasech této sezóny.`,
    issuedBy: "rule",
    issuedByTeamId: null,
    proposalId: null,
    gameDate: opts.gameDate,
    referenceId: `linesman-bias-${opts.matchId}`,
  });
  return { uses, sanctioned: id !== null };
}
