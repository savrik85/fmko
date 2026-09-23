/**
 * Sliby sponzorům (etapa 3): vyhodnocení, důsledky a texty. Čisté funkce bez DB.
 * Spec: docs/superpowers/specs/2026-09-22-vyjednavani-se-sponzory-design.md, sekce „Etapa 3".
 *
 * Sezónní sliby vyhodnotí rollover nad daty skončené sezóny, termínové denní tick.
 * „Těsně vedle" (partial) = o jedno místo hůř, návštěva do 10 % pod cílem, reputace
 * do 3 bodů pod cílem. Stojí polovinu pokuty a nepočítá se jako porušení.
 *
 * Druhy slibů, jejich `params` a klasifikace (sezónní/termínové) jsou definované v
 * promise-kinds.ts (etapa 2), tady se jen znovu vyvážejí, aby existoval jediný zdroj pravdy.
 */
import { licenceLabel } from "@okresni-masina/shared";
import { roundName } from "../cup/cup";
import { logger } from "../lib/logger";
import { DEFAULT_CUP_ROUNDS, PROMOTION_SPOTS, RELEGATION_SPOTS } from "./ambition";
import { promiseLabelByKind } from "./proposal";
import { DEADLINE_KINDS, isPromiseKind, PROMISE_KINDS, SEASONAL_KINDS, type PromiseKind, type PromiseParams as NegotiationPromiseParams } from "./promise-kinds";
import { FACILITY_LABELS } from "../stadium/stadium-generator";

export { DEADLINE_KINDS, isPromiseKind, PROMISE_KINDS, SEASONAL_KINDS, type PromiseKind };

/** Porušení, po kterém sponzor vypoví smlouvu hned, bez ohledu na počet porušení. */
export const FATAL_KINDS: readonly PromiseKind[] = ["promotion", "no_relegation"];

export type PromiseStatus = "pending" | "fulfilled" | "partial" | "broken";
export type PromiseOutcome = Exclude<PromiseStatus, "pending">;

export function isPromiseStatus(v: unknown): v is PromiseStatus {
  return v === "pending" || v === "fulfilled" || v === "partial" || v === "broken";
}

/**
 * Postupová a sestupová místa. Hra postupy zatím nemá (league/promotion.ts,
 * calculatePromotions je nezapojené), slib se ale měří stejnými zónami jako ambition.ts:
 * PROMOTION_SPOTS a RELEGATION_SPOTS, žádná vlastní čísla.
 */
export const PROMOTION_PLACES = PROMOTION_SPOTS;
export const RELEGATION_PLACES = RELEGATION_SPOTS;
export const FAVOR_FULFILLED = 5;
export const FAVOR_PARTIAL = -3;
export const FAVOR_BROKEN = -8;
export const BREACHES_TO_TERMINATE = 2;
export const TERMINATION_REPUTATION = -5;
const ATTENDANCE_PARTIAL_SHARE = 0.9;
const REPUTATION_PARTIAL_POINTS = 3;

export type PromiseParams = Record<string, unknown>;

/** Parametry slibu z JSON. `null` = nečitelné (volající slib přeskočí a zaloguje). */
export function parsePromiseParams(raw: string | null): PromiseParams | null {
  if (raw === null || raw === "") return {};
  try {
    const v: unknown = JSON.parse(raw);
    return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as PromiseParams) : null;
  } catch (e) {
    logger.warn({ module: "sponsor-promises" }, "nečitelné parametry slibu", e);
    return null;
  }
}

function num(p: PromiseParams, key: string): number | null {
  const v = p[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Co klub za sezónu dokázal. `null` = údaj chybí, slib závislý na něm nejde vyhodnotit. */
export interface SeasonStats {
  position: number | null;
  teamsInLeague: number | null;
  /** Nejvyšší odehrané kolo poháru. 0 = klub v poháru nebyl, null = pohár se nehrál. */
  cupReached: number | null;
  avgHomeAttendance: number | null;
  avgYouthStarters: number | null;
  reputation: number | null;
  riots: number | null;
}

export const EMPTY_SEASON_STATS: SeasonStats = {
  position: null, teamsInLeague: null, cupReached: null, avgHomeAttendance: null, avgYouthStarters: null,
  reputation: null, riots: null,
};

/** Stav klubu pro termínové sliby. */
export interface DeadlineState {
  licenceLevel: number | null;
  /** Úrovně zařízení podle klíčů FACILITY_LABELS. */
  facilities: Record<string, number>;
  sleeveSponsorId: number | null;
}

export interface Evaluation {
  outcome: PromiseOutcome;
  actual: number | null;
}

/** Sezónní slib nad statistikou sezóny. `null` = nejde vyhodnotit (chybí údaj nebo parametr). */
export function evaluateSeasonalPromise(kind: PromiseKind, params: PromiseParams, s: SeasonStats): Evaluation | null {
  switch (kind) {
    case "league_position": {
      const target = num(params, "position");
      if (target === null || s.position === null) return null;
      if (s.position <= target) return { outcome: "fulfilled", actual: s.position };
      if (s.position === target + 1) return { outcome: "partial", actual: s.position };
      return { outcome: "broken", actual: s.position };
    }
    case "promotion": {
      if (s.position === null) return null;
      return { outcome: s.position <= PROMOTION_PLACES ? "fulfilled" : "broken", actual: s.position };
    }
    case "no_relegation": {
      if (s.position === null || s.teamsInLeague === null) return null;
      return { outcome: s.position <= s.teamsInLeague - RELEGATION_PLACES ? "fulfilled" : "broken", actual: s.position };
    }
    case "cup_round": {
      const target = num(params, "round");
      if (target === null || s.cupReached === null) return null;
      return { outcome: s.cupReached >= target ? "fulfilled" : "broken", actual: s.cupReached };
    }
    case "attendance": {
      const target = num(params, "attendance");
      if (target === null || s.avgHomeAttendance === null) return null;
      const avg = Math.round(s.avgHomeAttendance);
      if (avg >= target) return { outcome: "fulfilled", actual: avg };
      if (avg >= target * ATTENDANCE_PARTIAL_SHARE) return { outcome: "partial", actual: avg };
      return { outcome: "broken", actual: avg };
    }
    case "youth": {
      const target = num(params, "count");
      if (target === null || s.avgYouthStarters === null) return null;
      const avg = Math.round(s.avgYouthStarters * 10) / 10;
      return { outcome: avg >= target ? "fulfilled" : "broken", actual: avg };
    }
    case "reputation": {
      const target = num(params, "reputation");
      if (target === null || s.reputation === null) return null;
      if (s.reputation >= target) return { outcome: "fulfilled", actual: s.reputation };
      if (s.reputation >= target - REPUTATION_PARTIAL_POINTS) return { outcome: "partial", actual: s.reputation };
      return { outcome: "broken", actual: s.reputation };
    }
    case "no_riots": {
      if (s.riots === null) return null;
      return { outcome: s.riots === 0 ? "fulfilled" : "broken", actual: s.riots };
    }
    case "sector_exclusivity":
      // Porušit nejde (podpis banneru stejného oboru je zablokovaný), na konci smlouvy se uzná.
      return { outcome: "fulfilled", actual: null };
    default:
      return null;
  }
}

/**
 * Termínový slib. Splněno, jakmile platí (i po termínu, když to tick stihne dřív);
 * porušeno až den po termínu. `"pending"` = zatím nic, `null` = nejde vyhodnotit.
 */
export function evaluateDeadlinePromise(
  kind: PromiseKind, params: PromiseParams, state: DeadlineState, sponsorId: number, today: string, deadline: string | null,
): Evaluation | "pending" | null {
  let met: boolean;
  let actual: number;
  switch (kind) {
    case "coach_licence": {
      const level = num(params, "level");
      if (level === null || state.licenceLevel === null) return null;
      met = state.licenceLevel >= level;
      actual = state.licenceLevel;
      break;
    }
    case "stadium_upgrade": {
      const facility = params.facility;
      const level = num(params, "level");
      if (typeof facility !== "string" || !(facility in FACILITY_LABELS) || level === null) return null;
      const current = state.facilities[facility] ?? 0;
      met = current >= level;
      actual = current;
      break;
    }
    case "jersey_logo":
      met = state.sleeveSponsorId === sponsorId;
      actual = met ? 1 : 0;
      break;
    default:
      return null;
  }
  if (met) return { outcome: "fulfilled", actual };
  if (deadline && today.slice(0, 10) > deadline.slice(0, 10)) return { outcome: "broken", actual };
  return "pending";
}

export interface Consequence {
  /** Kladně bonus, záporně pokuta. 0 = žádná transakce. */
  money: number;
  txType: "sponsor_bonus" | "sponsor_penalty" | null;
  favorDelta: number;
  /** Počítá se do `sponsor_contracts.breaches_season`. */
  breach: boolean;
}

export function promiseConsequence(outcome: PromiseOutcome, reward: number, penalty: number): Consequence {
  const bonus = Math.max(0, Math.round(reward || 0));
  const fine = Math.max(0, Math.round(penalty || 0));
  if (outcome === "fulfilled") {
    return { money: bonus, txType: bonus > 0 ? "sponsor_bonus" : null, favorDelta: FAVOR_FULFILLED, breach: false };
  }
  if (outcome === "partial") {
    const half = Math.round(fine / 2);
    return { money: half > 0 ? -half : 0, txType: half > 0 ? "sponsor_penalty" : null, favorDelta: FAVOR_PARTIAL, breach: false };
  }
  return { money: fine > 0 ? -fine : 0, txType: fine > 0 ? "sponsor_penalty" : null, favorDelta: FAVOR_BROKEN, breach: true };
}

/** Druhé porušení v sezóně, nebo porušený postup či nesestup: sponzor smlouvu vypoví. */
export function sponsorTerminates(breachesThisSeason: number, brokenKinds: readonly PromiseKind[]): boolean {
  if (brokenKinds.length === 0) return false;
  return breachesThisSeason >= BREACHES_TO_TERMINATE || brokenKinds.some((k) => FATAL_KINDS.includes(k));
}

function decimal(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

/** „1 hráč", „2 hráči", „5 hráčů", „1,5 hráče". */
function playersForm(n: number): string {
  if (!Number.isInteger(n)) return "hráče";
  if (n === 1) return "hráč";
  if (n >= 2 && n <= 4) return "hráči";
  return "hráčů";
}

function spectatorsForm(n: number): string {
  if (n === 1) return "divák";
  if (n >= 2 && n <= 4) return "diváci";
  return "diváků";
}

function riotsForm(n: number): string {
  if (n === 1) return "výtržnost";
  if (n >= 2 && n <= 4) return "výtržnosti";
  return "výtržností";
}

/** Doplní parametry na tvar promise-kinds.ts (proposal.ts promiseLabelByKind), s runtime validací. */
function toNegotiationParams(p: PromiseParams): NegotiationPromiseParams {
  return {
    position: num(p, "position") ?? undefined,
    round: num(p, "round") ?? undefined,
    level: num(p, "level") ?? undefined,
    facility: typeof p.facility === "string" ? p.facility : undefined,
    attendance: num(p, "attendance") ?? undefined,
    count: num(p, "count") ?? undefined,
    reputation: num(p, "reputation") ?? undefined,
  };
}

/**
 * Který parametr popisek daného druhu potřebuje (chybí-li, vrátí se obecný popisek místo
 * konkrétní hodnoty, aby na obrazovce nikdy nenaskočilo „undefined"). Sliby bez parametrů
 * (promotion, no_relegation, jersey_logo, sector_exclusivity, no_riots) nic nepotřebují.
 */
function hasRequiredParams(kind: PromiseKind, params: PromiseParams): boolean {
  switch (kind) {
    case "league_position": return num(params, "position") !== null;
    case "cup_round": return num(params, "round") !== null;
    case "coach_licence": return num(params, "level") !== null;
    case "stadium_upgrade": return typeof params.facility === "string" && params.facility in FACILITY_LABELS && num(params, "level") !== null;
    case "attendance": return num(params, "attendance") !== null;
    case "youth": return num(params, "count") !== null;
    case "reputation": return num(params, "reputation") !== null;
    default: return true;
  }
}

const GENERIC_LABEL: Partial<Record<PromiseKind, string>> = {
  league_position: "umístění v tabulce",
  cup_round: "postup v poháru",
  coach_licence: "licence pro trenéra",
  stadium_upgrade: "modernizace stadionu",
  attendance: "průměrná domácí návštěva",
  youth: "mladí hráči v sestavě",
  reputation: "reputace klubu",
};

/**
 * Popisek slibu v 1. pádě, deleguje na proposal.ts (promiseLabelByKind), jediný zdroj pravdy:
 * hráč přesně tohle znění viděl při podpisu. Pohárové kolo pojmenuje stejně jako proposal.ts
 * (roundName podle `cupTotalRounds`, výchozí DEFAULT_CUP_ROUNDS, když volající aktuální počet
 * kol soutěže nezná). Chybí-li povinný parametr, vrátí obecný popisek (GENERIC_LABEL), nikdy
 * text s „undefined".
 */
export function promiseLabel(kind: PromiseKind, params: PromiseParams, cupTotalRounds: number = DEFAULT_CUP_ROUNDS): string {
  if (!hasRequiredParams(kind, params)) return GENERIC_LABEL[kind] ?? "sponzorský slib";
  const round = num(params, "round");
  const cupRoundLabel = round !== null ? roundName(round, cupTotalRounds).toLowerCase() : "další kolo";
  return promiseLabelByKind(kind, toNegotiationParams(params), cupRoundLabel);
}

/**
 * Naměřená skutečnost česky pro obrazovku. `null` = nic k ukázání. Pohárové kolo pojmenuje
 * stejně jako promiseLabel (roundName podle `cupTotalRounds`, výchozí DEFAULT_CUP_ROUNDS).
 */
export function promiseActualText(kind: PromiseKind, actual: number | null, cupTotalRounds: number = DEFAULT_CUP_ROUNDS): string | null {
  if (actual === null) return null;
  switch (kind) {
    case "league_position":
    case "promotion":
    case "no_relegation":
      return `${actual}. místo`;
    case "cup_round":
      return actual === 0 ? "klub v poháru nehrál" : roundName(actual, cupTotalRounds).toLowerCase();
    case "attendance":
      return `${actual} ${spectatorsForm(actual)} v průměru`;
    case "youth":
      return `${decimal(actual)} ${playersForm(actual)} do 21 let v průměru`;
    case "reputation":
      return `reputace ${actual}`;
    case "no_riots":
      return actual === 0 ? "bez výtržností" : `${actual} ${riotsForm(actual)}`;
    case "coach_licence":
      return licenceLabel(actual);
    case "stadium_upgrade":
      return `úroveň ${actual}`;
    default:
      return null;
  }
}

/** Popis transakce ve Financích. Název firmy se neskloňuje, proto stojí před dvojtečkou. */
export function promiseTransactionText(outcome: PromiseOutcome, sponsorName: string, label: string): string {
  if (outcome === "fulfilled") return `${sponsorName}: bonus za splněný slib (${label})`;
  if (outcome === "partial") return `${sponsorName}: polovina pokuty za těsně nesplněný slib (${label})`;
  return `${sponsorName}: pokuta za porušený slib (${label})`;
}

/** Důvod v deníku náklonnosti (záložka Oblíbenost). */
export function promiseFavorReason(outcome: PromiseOutcome, label: string): string {
  if (outcome === "fulfilled") return `splněný slib: ${label}`;
  if (outcome === "partial") return `těsně nesplněný slib: ${label}`;
  return `porušený slib: ${label}`;
}

/**
 * Proč nejde podepsat nebo prodloužit banner stejného oboru. `action` volí sloveso druhé věty
 * (sign/renew), aby zpráva u prodloužení neříkala „podepsat". Jméno firmy je přístavek za
 * „Firma", ne po předložce „s" — u libovolného názvu (skloňovat by šlo jen ručně napsaná
 * jména) tak zůstává gramaticky správně v 1. pádě.
 */
export function sectorBlockMessage(sponsorName: string, action: "sign" | "renew" = "sign"): string {
  const clause = sectorBlockReason(sponsorName, action);
  return `${clause.charAt(0).toUpperCase()}${clause.slice(1)}.`;
}

/**
 * Totéž jako sectorBlockMessage, ale jako klauzule bez velkého písmena a bez tečky: karta smlouvy
 * ji vkládá za dvojtečku a tečku přidává sama (`blockedReason`).
 */
export function sectorBlockReason(sponsorName: string, action: "sign" | "renew" = "sign"): string {
  const verb = action === "renew" ? "prodloužit" : "podepsat";
  return `firma ${sponsorName} má u klubu exkluzivitu oboru, banner jiné firmy ze stejného oboru teď ${verb} nejde`;
}

export type PromiseSmsOccasion = "promise_kept" | "promise_broken" | "sponsor_terminates";

const OUTCOME_SEVERITY: Record<PromiseOutcome, number> = { broken: 0, partial: 1, fulfilled: 2 };

/**
 * Jedna SMS majitele za smlouvu a běh: výpověď, jinak nejhorší výsledek.
 * Víc SMS od téhož majitele by stejně spolkl pětidenní cooldown fronty.
 */
export function promiseSmsPlan(
  items: readonly { id: string; outcome: PromiseOutcome; label: string }[], terminated: boolean,
): { occasion: PromiseSmsOccasion; promiseId: string; label: string } | null {
  if (items.length === 0) return null;
  const worst = [...items].sort((a, b) =>
    OUTCOME_SEVERITY[a.outcome] - OUTCOME_SEVERITY[b.outcome] || a.id.localeCompare(b.id))[0];
  const occasion: PromiseSmsOccasion = terminated
    ? "sponsor_terminates"
    : worst.outcome === "fulfilled" ? "promise_kept" : "promise_broken";
  return { occasion, promiseId: worst.id, label: worst.label };
}

export interface MatchResultRow {
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
}

/** Pořadí v tabulce stejně jako `calculateStandings`: body, rozdíl skóre, vstřelené góly. */
export function rankTable(teamIds: readonly string[], matches: readonly MatchResultRow[]): Map<string, number> {
  const s = new Map(teamIds.map((id) => [id, { pts: 0, gf: 0, ga: 0 }]));
  for (const m of matches) {
    const h = s.get(m.home_team_id);
    const a = s.get(m.away_team_id);
    if (!h || !a) continue;
    h.gf += m.home_score; h.ga += m.away_score;
    a.gf += m.away_score; a.ga += m.home_score;
    if (m.home_score > m.away_score) h.pts += 3;
    else if (m.home_score < m.away_score) a.pts += 3;
    else { h.pts += 1; a.pts += 1; }
  }
  const order = [...s.entries()].sort(([, x], [, y]) =>
    (y.pts - x.pts) || ((y.gf - y.ga) - (x.gf - x.ga)) || (y.gf - x.gf));
  return new Map(order.map(([id], i) => [id, i + 1]));
}

/** Místo klubu v archivované konečné tabulce (`league_history.final_standings`). */
export function positionFromStandings(json: string, teamId: string): { position: number; teams: number } | null {
  let rows: unknown;
  try {
    rows = JSON.parse(json);
  } catch (e) {
    logger.warn({ module: "sponsor-promises", teamId }, "nečitelná konečná tabulka", e);
    return null;
  }
  if (!Array.isArray(rows)) return null;
  const entry = rows.find((r) => r !== null && typeof r === "object" && (r as { teamId?: unknown }).teamId === teamId) as
    { pos?: unknown } | undefined;
  if (!entry || typeof entry.pos !== "number") return null;
  return { position: entry.pos, teams: rows.length };
}

export interface CupEntryRow {
  status: string;
  total_rounds: number;
  current_round: number;
  eliminated_round: number | null;
  cup_team_id: string | null;
  is_winner: number;
}

/**
 * Nejvyšší odehrané kolo poháru. `null` = pohár se nehrál, nebo ještě běží a klub v něm pořád
 * je (výsledek ještě není známý, slib se nevyhodnotí). 0 = klub v poháru nebyl.
 */
export function cupRoundReached(r: CupEntryRow | null): number | null {
  if (!r) return null;
  if (!r.cup_team_id) return 0;
  if (r.eliminated_round !== null) return r.eliminated_round;
  if (r.is_winner === 1 || r.status === "finished") return r.total_rounds;
  return null;
}

/** Pohár ještě běží a klub v něm pořád je: kam až došel, zatím nejde říct. */
export function cupStillRunning(r: CupEntryRow | null): boolean {
  return !!r && !!r.cup_team_id && r.eliminated_round === null && r.is_winner !== 1 && r.status !== "finished";
}

export function averagePerMatch(total: number, matches: number): number | null {
  return matches > 0 ? total / matches : null;
}
