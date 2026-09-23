/**
 * Jednání se sponzorem: DB vrstva. Skládá kontext klubu pro čistou matematiku (negotiation.ts),
 * hlídá, jestli jde s firmou jednat (okres, exkluzivita hlavního sponzora, limit změny, okno
 * prodloužení, cooldown), expiruje v herním čase, zapisuje kola s optimistickým zámkem
 * a skládá pohled pro klienta. Podpis je v signing.ts.
 */
import { logger } from "../lib/logger";
import { gameExpiry, isGameExpired } from "../lib/game-time";
import { mustSeason } from "../lib/season";
import { CATEGORIES, getUpgradeOptions as equipmentUpgradeOptions } from "../equipment/equipment-generator";
import { FACILITY_LABELS, getUpgradeOptions as stadiumUpgradeOptions, UPGRADE_COSTS } from "../stadium/stadium-generator";
import { DEFAULT_CUP_ROUNDS, expectedPosition, MONTHS_PER_SEASON } from "./ambition";
import { budgetEstimateRange, sponsorBudgetB } from "./budget";
import { mainSponsorBlock } from "./exclusivity";
import { ensureSponsorOwner, getFavor, type SponsorOwner } from "./favor";
import {
  BASE_WILLINGNESS, CAUTIOUS_SEASON_BONUS, effectiveContractMonths, initialPatience, MAX_SEASONS, MIN_SEASONS, NEGOTIATION_DAYS,
  signingSummary, WILLINGNESS_CAP, winBonusFactor,
  type EquipmentOption, type FacilityOption, type NegotiationCategory, type NegotiationContext, type Proposal,
} from "./negotiation";
import type { ResponseKind } from "./negotiation-texts";
import type { OwnerPersonality } from "./owners";
import { EQUIPMENT_GIFTS, isPromiseKind, type PromiseKind, type PromiseParams } from "./promise-kinds";
import {
  constructionOptions, equipmentOptions, promiseCatalog, promiseLabel, type GiftOption, type PromiseOption, type Range,
} from "./proposal";
import { ownerWishes } from "./wishes";

/** Návštěva, když klub ještě žádný domácí zápas s diváky nemá. */
const DEFAULT_ATTENDANCE = 100;

export type NegotiationStatus = "open" | "accepted" | "walked_away" | "expired" | "signed";

export interface RoundResponse {
  kind: ResponseKind;
  text: string;
  counter?: Proposal;
  wish?: PromiseKind;
  gameDate: string;
}

export interface NegotiationRound {
  proposal: Proposal;
  response: RoundResponse;
}

interface NegotiationRow {
  id: string; team_id: string; sponsor_id: number; category: NegotiationCategory; wishes: string; budget_b: number;
  patience: number; rounds: string; status: NegotiationStatus; expires_game_date: string; cooldown_until: string | null;
  created_at: string;
}

export interface Negotiation {
  id: string;
  teamId: string;
  sponsorId: number;
  category: NegotiationCategory;
  wishes: PromiseKind[];
  budgetB: number;
  patience: number;
  rounds: NegotiationRound[];
  /** Přesně to, co je v DB: podmínka optimistického zámku při zápisu kola a podpisu. */
  roundsRaw: string;
  status: NegotiationStatus;
  expiresGameDate: string;
  cooldownUntil: string | null;
}

function parseJson<T>(raw: string, what: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    logger.warn({ module: "sponsors" }, `neplatný JSON: ${what}`, e);
    return fallback;
  }
}

export function parseNegotiation(r: NegotiationRow): Negotiation {
  const wishes = parseJson<unknown[]>(r.wishes, `přání jednání ${r.id}`, []).filter(isPromiseKind);
  return {
    id: r.id, teamId: r.team_id, sponsorId: r.sponsor_id, category: r.category, wishes, budgetB: r.budget_b,
    patience: r.patience, rounds: parseJson<NegotiationRound[]>(r.rounds, `kola jednání ${r.id}`, []), roundsRaw: r.rounds,
    status: r.status, expiresGameDate: r.expires_game_date, cooldownUntil: r.cooldown_until,
  };
}

export interface NegotiationTeam {
  id: string; name: string; reputation: number; budget: number; league_id: string | null; game_date: string | null;
  last_main_sponsor_change_season: number | null; district: string; size: string;
}

export async function loadNegotiationTeam(db: D1Database, teamId: string): Promise<NegotiationTeam | null> {
  return db.prepare(
    `SELECT t.id, t.name, t.reputation, t.budget, t.league_id, t.game_date, t.last_main_sponsor_change_season, v.district, v.size
     FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?`,
  ).bind(teamId).first<NegotiationTeam>();
}

export interface NegotiationSponsor { id: number; name: string; type: string; district: string; monthly_max: number }

export async function loadNegotiationSponsor(db: D1Database, sponsorId: number): Promise<NegotiationSponsor | null> {
  return db.prepare("SELECT id, name, type, district, monthly_max FROM district_sponsors WHERE id = ?")
    .bind(sponsorId).first<NegotiationSponsor>();
}

/** Herní datum klubu; bez něj aktuální čas v ISO (stejně jako favorLogStmt). */
export function teamGameDate(team: { game_date: string | null }): string {
  return team.game_date ?? new Date().toISOString();
}

export interface SeasonBounds { start: string; end: string }

/** Kolik měsíců aktuální sezóny k hernímu datu uplynulo (0 až MONTHS_PER_SEASON). */
export function seasonProgressMonths(bounds: SeasonBounds | null, gameDate: string): number {
  if (!bounds) return 0;
  const start = Date.parse(bounds.start);
  const end = Date.parse(bounds.end);
  const now = Date.parse(gameDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(now) || end <= start) return 0;
  return Math.min(1, Math.max(0, (now - start) / (end - start))) * MONTHS_PER_SEASON;
}

/** Předsezóna před prvním kolem, stejně jako season-weather.ts (seasonBounds). */
const PRESEASON_DAYS = 7;

/**
 * Postup sezóny klubu v měsících. Hranice sezóny drží `teams.season_start/season_end` (plní je
 * rollover); čerstvě naseedovaný svět je nemá, pak se odvodí z kalendáře ligy (jako auth.ts).
 */
export async function loadTeamSeasonProgress(db: D1Database, teamId: string): Promise<number> {
  const team = await db.prepare("SELECT game_date, season_start, season_end, league_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ game_date: string | null; season_start: string | null; season_end: string | null; league_id: string | null }>();
  if (!team) return 0;
  const gameDate = teamGameDate(team);
  if (team.season_start && team.season_end) return seasonProgressMonths({ start: team.season_start, end: team.season_end }, gameDate);
  if (!team.league_id) return 0;
  const cal = await db.prepare(
    `SELECT MIN(scheduled_at) AS first, MAX(scheduled_at) AS last FROM season_calendar
     WHERE league_id = ? AND season_number = (SELECT MAX(season_number) FROM season_calendar WHERE league_id = ?)`,
  ).bind(team.league_id, team.league_id).first<{ first: string | null; last: string | null }>();
  const first = cal?.first ? Date.parse(cal.first) : NaN;
  if (!Number.isFinite(first) || !cal?.last) {
    logger.warn({ module: "sponsors", teamId }, "hranice sezóny pro zálohu sponzora chybí, počítá se začátek sezóny");
    return 0;
  }
  return seasonProgressMonths({ start: new Date(first - PRESEASON_DAYS * 86400000).toISOString(), end: cal.last }, gameDate);
}

export async function activeSeason(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ number: number }>();
  return mustSeason(row?.number);
}

export interface ContractRow {
  id: string; sponsor_id: number | null; sponsor_name: string; monthly_amount: number; win_bonus: number;
  seasons_remaining: number; early_termination_fee: number; status: "active" | "expired";
}

/**
 * `lastExpired` je jen smlouva, jejíž obnova se počítá jako prodloužení (renewableExpiry), jinak null.
 * Aktivní smlouva v kategorii je vždycky `active`.
 */
export interface CategoryContracts { active: ContractRow | null; lastExpired: ContractRow | null }

/** Fakta o naposledy vypršelé smlouvě, ze kterých se pozná, jestli jde o prodloužení (EXPIRED_RENEWAL_FACTS_SQL). */
export interface ExpiredRenewalFacts {
  seasons_remaining: number;
  negotiation_id: string | null;
  /** 1 = smlouva z jednání podepsaná dřív, než začala sezóna, po které podle délky měla vypršet. */
  signed_before_window: number;
  /** Kolik smluv v kategorii klub podepsal ve stejnou chvíli nebo po ní. */
  signed_since: number;
}

/**
 * Sloupce ExpiredRenewalFacts k řádku `sc` ze sponsor_contracts.
 *  - `signed_before_window`: smlouva podepsaná v sezóně S na T sezón vyprší při rolloveru do
 *    sezóny S + T. Vypršela při POSLEDNÍM rolloveru, jen když byla podepsaná nejdřív v sezóně
 *    aktuální − T (začátek sezóny = seasons.created_at, zakládá ho rollover).
 *  - `signed_since`: jiné smlouvy v kategorii podepsané po ní (i ukončené), třeba nová firma,
 *    kterou klub hned zase vypověděl.
 */
export const EXPIRED_RENEWAL_FACTS_SQL = `
  CASE WHEN sc.negotiation_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM seasons s
    WHERE s.number = (SELECT MAX(number) FROM seasons WHERE status = 'active') - sc.seasons_total
      AND datetime(sc.signed_at) < datetime(s.created_at)
  ) THEN 1 ELSE 0 END AS signed_before_window,
  (SELECT COUNT(*) FROM sponsor_contracts o
    WHERE o.team_id = sc.team_id AND COALESCE(o.category, 'main') = COALESCE(sc.category, 'main')
      AND o.id != sc.id AND datetime(o.signed_at) >= datetime(sc.signed_at)) AS signed_since`;

/**
 * Obnova vypršelé smlouvy je prodloužení, jen když smlouva vypršela sama při posledním rolloveru
 * (ne předáním při prodloužení, ne o sezóny dřív) a v kategorii se od té doby nic nepodepsalo.
 * Jinak by šlo podepsat nového sponzora, vypovědět ho a pak se starou firmou „prodlužovat" bez
 * limitu změny hlavního sponzora a bez přejmenování. Smlouvy z dřívějších pevných nabídek (bez
 * jednání) se prodlužovaly na místě bez nového signed_at, u nich se sezóna vypršení neověřuje.
 */
export function expiredCountsAsRenewal(f: ExpiredRenewalFacts): boolean {
  return f.seasons_remaining <= 0 && Number(f.signed_before_window) === 0 && Number(f.signed_since) === 0;
}

/** Naposledy vypršelá smlouva v kategorii, jen když se její obnova počítá jako prodloužení (celý řádek). */
export async function lastRenewableExpired<T extends Record<string, unknown> = Record<string, unknown>>(
  db: D1Database, teamId: string, category: NegotiationCategory,
): Promise<T | null> {
  const row = await db.prepare(
    `SELECT sc.*, ${EXPIRED_RENEWAL_FACTS_SQL}
     FROM sponsor_contracts sc WHERE sc.team_id = ? AND sc.status = 'expired' AND COALESCE(sc.category, 'main') = ?
     ORDER BY sc.signed_at DESC LIMIT 1`,
  ).bind(teamId, category).first<T & ExpiredRenewalFacts>();
  return row && expiredCountsAsRenewal(row) ? row : null;
}

export async function categoryContracts(db: D1Database, teamId: string, category: NegotiationCategory): Promise<CategoryContracts> {
  const [active, lastExpired] = await Promise.all([
    db.prepare(
      `SELECT id, sponsor_id, sponsor_name, monthly_amount, win_bonus, seasons_remaining, early_termination_fee, status
       FROM sponsor_contracts WHERE team_id = ? AND status = 'active' AND COALESCE(category, 'main') = ?
       ORDER BY signed_at DESC LIMIT 1`,
    ).bind(teamId, category).first<ContractRow>(),
    lastRenewableExpired<ContractRow & Record<string, unknown>>(db, teamId, category),
  ]);
  return { active: active ?? null, lastExpired: lastExpired ?? null };
}

/** Prodloužení = jednání se stejnou firmou, jaká má aktivní (jinak naposledy vypršelou, viz expiredCountsAsRenewal) smlouvu v kategorii. */
export function isRenewalOf(c: CategoryContracts, sponsorId: number): boolean {
  return c.active ? c.active.sponsor_id === sponsorId : c.lastExpired?.sponsor_id === sponsorId;
}

/** Poměrná výpovědní pokuta, stejný vzorec jako POST /sponsors/terminate. */
export function prorataTerminationFee(c: ContractRow): number {
  return Math.round(c.early_termination_fee * (c.seasons_remaining / 3));
}

/** Proč teď s firmou nejde uzavřít smlouvu v kategorii (null = jde). Pro otevření i podpis. */
export async function contractBlock(
  db: D1Database, team: NegotiationTeam, sponsor: NegotiationSponsor, category: NegotiationCategory, season: number,
  contracts: CategoryContracts,
): Promise<string | null> {
  if (sponsor.district !== team.district) return "Jednat jde jen s firmami z vlastního okresu";
  const renewal = isRenewalOf(contracts, sponsor.id);
  if (contracts.active && renewal && contracts.active.seasons_remaining > 1) {
    return "Smlouvu s touhle firmou prodloužíš až v její poslední sezóně";
  }
  if (category === "main") {
    if (!renewal && (team.last_main_sponsor_change_season ?? 0) >= season) return "Hlavního sponzora jde změnit jen jednou za sezónu";
    const block = await mainSponsorBlock(db, sponsor.id, team.id, season);
    if (block) return block.reason;
  }
  return null;
}

async function expireIfDue(db: D1Database, neg: Negotiation, gameDate: string): Promise<Negotiation> {
  if ((neg.status !== "open" && neg.status !== "accepted") || !isGameExpired(neg.expiresGameDate, gameDate)) return neg;
  await db.prepare("UPDATE sponsor_negotiations SET status = 'expired' WHERE id = ? AND status IN ('open','accepted')")
    .bind(neg.id).run();
  return { ...neg, status: "expired" };
}

export async function findActiveNegotiation(
  db: D1Database, teamId: string, sponsorId: number, category: NegotiationCategory, gameDate: string,
): Promise<Negotiation | null> {
  const row = await db.prepare(
    `SELECT * FROM sponsor_negotiations WHERE team_id = ? AND sponsor_id = ? AND category = ? AND status IN ('open','accepted')
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(teamId, sponsorId, category).first<NegotiationRow>();
  if (!row) return null;
  const neg = await expireIfDue(db, parseNegotiation(row), gameDate);
  return neg.status === "expired" ? null : neg;
}

/** Do kdy majitel po odchodu od jednání nejedná (herní datum), nebo null. */
export async function cooldownUntil(db: D1Database, teamId: string, sponsorId: number, gameDate: string): Promise<string | null> {
  const row = await db.prepare(
    "SELECT MAX(cooldown_until) AS c FROM sponsor_negotiations WHERE team_id = ? AND sponsor_id = ? AND cooldown_until IS NOT NULL",
  ).bind(teamId, sponsorId).first<{ c: string | null }>();
  return row?.c && !isGameExpired(row.c, gameDate) ? row.c : null;
}

function czDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
}

export interface NegotiationAvailability { canOpen: boolean; reason: string | null; isRenewal: boolean; openId: string | null }

export async function negotiationAvailability(
  db: D1Database, team: NegotiationTeam, sponsor: NegotiationSponsor, category: NegotiationCategory, season: number,
): Promise<NegotiationAvailability> {
  const gameDate = teamGameDate(team);
  const contracts = await categoryContracts(db, team.id, category);
  const isRenewal = isRenewalOf(contracts, sponsor.id);
  if (sponsor.district !== team.district) {
    return { canOpen: false, reason: "Jednat jde jen s firmami z vlastního okresu", isRenewal, openId: null };
  }
  const open = await findActiveNegotiation(db, team.id, sponsor.id, category, gameDate);
  if (open) return { canOpen: true, reason: null, isRenewal, openId: open.id };
  const cd = await cooldownUntil(db, team.id, sponsor.id, gameDate);
  if (cd) return { canOpen: false, reason: `Majitel s vámi do ${czDay(cd)} jednat nechce`, isRenewal, openId: null };
  const block = await contractBlock(db, team, sponsor, category, season, contracts);
  return { canOpen: block === null, reason: block, isRenewal, openId: null };
}

async function leagueStrength(db: D1Database, leagueId: string | null, teamId: string): Promise<{ teams: number; expected: number }> {
  if (!leagueId) return { teams: 2, expected: 1 };
  const [teams, strengths] = await Promise.all([
    db.prepare(
      "SELECT id FROM teams WHERE league_id = ? AND COALESCE(team_type, 'senior') != 'u21' AND name NOT LIKE 'DELETED-%'",
    ).bind(leagueId).all<{ id: string }>(),
    // Síla = průměr nejlepší jedenáctky, stejná definice jako betting/board.ts (loadStrengths).
    db.prepare(
      `SELECT team_id, AVG(overall_rating) AS strength FROM (
         SELECT p.team_id, p.overall_rating,
                ROW_NUMBER() OVER (PARTITION BY p.team_id ORDER BY p.overall_rating DESC) AS poz
         FROM players p JOIN teams t ON t.id = p.team_id
         WHERE t.league_id = ? AND COALESCE(t.team_type, 'senior') != 'u21' AND (p.status IS NULL OR p.status = 'active')
       ) WHERE poz <= 11 GROUP BY team_id`,
    ).bind(leagueId).all<{ team_id: string; strength: number }>(),
  ]);
  const byTeam = new Map(strengths.results.map((r) => [r.team_id, r.strength]));
  const list = teams.results.map((t) => ({ teamId: t.id, strength: byTeam.get(t.id) ?? 30 }));
  return { teams: Math.max(2, list.length), expected: expectedPosition(list, teamId) };
}

/** Průměrná domácí návštěva minulé sezóny, když není, tak letošní. */
async function averageHomeAttendance(db: D1Database, teamId: string, season: number): Promise<number> {
  for (const s of [season - 1, season]) {
    const row = await db.prepare(
      `SELECT AVG(m.attendance) AS avg FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
       WHERE m.home_team_id = ? AND m.status = 'simulated' AND m.attendance IS NOT NULL AND sc.season_number = ?`,
    ).bind(teamId, s).first<{ avg: number | null }>();
    if (row?.avg) return Math.round(row.avg);
  }
  return DEFAULT_ATTENDANCE;
}

function facilityOptions(stadium: Record<string, unknown> | null, reputation: number, played: number, season: number): FacilityOption[] {
  const keys = Object.keys(FACILITY_LABELS);
  const levels: Record<string, number> = {};
  for (const key of keys) levels[key] = Number(stadium?.[key] ?? 0) || 0;
  const upgrades = stadiumUpgradeOptions(levels, reputation, played, season);
  return keys.map((key) => {
    const u = upgrades.find((x) => x.facility === key);
    // Bez nabídky upgradu = zařízení je na maximu, další stupeň neexistuje.
    return { facility: key, currentLevel: levels[key], locked: u ? u.locked === true : true, costs: UPGRADE_COSTS[key] ?? [0, 0, 0, 0] };
  });
}

function equipmentGiftOptions(equip: Record<string, unknown> | null, reputation: number, played: number, season: number): EquipmentOption[] {
  const levels: Record<string, number> = {};
  for (const cat of CATEGORIES) levels[cat] = Number(equip?.[cat] ?? 0) || 0;
  return equipmentUpgradeOptions(levels, reputation, played, season)
    .filter((u) => EQUIPMENT_GIFTS.includes(u.category))
    .map((u) => ({ category: u.category, currentLevel: u.currentLevel, nextLevel: u.nextLevel, cost: u.cost, locked: u.locked === true }));
}

export async function buildNegotiationContext(db: D1Database, i: {
  team: NegotiationTeam; sponsor: NegotiationSponsor; category: NegotiationCategory; season: number;
  personality: OwnerPersonality; wishes: PromiseKind[]; budgetB: number;
}): Promise<NegotiationContext> {
  const { team, sponsor } = i;
  const [league, cup, attendance, manager, stadium, equip, played, banner, contracts, progress] = await Promise.all([
    leagueStrength(db, team.league_id, team.id),
    db.prepare("SELECT total_rounds FROM cup_competitions WHERE season_number = ? ORDER BY rowid DESC LIMIT 1")
      .bind(i.season).first<{ total_rounds: number }>(),
    averageHomeAttendance(db, team.id, i.season),
    db.prepare("SELECT COALESCE(licence_level, 0) AS licence_level FROM managers WHERE team_id = ? LIMIT 1")
      .bind(team.id).first<{ licence_level: number }>(),
    db.prepare("SELECT * FROM stadiums WHERE team_id = ?").bind(team.id).first<Record<string, unknown>>(),
    db.prepare("SELECT * FROM equipment WHERE team_id = ?").bind(team.id).first<Record<string, unknown>>(),
    db.prepare("SELECT COUNT(*) AS cnt FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'")
      .bind(team.id, team.id).first<{ cnt: number }>(),
    db.prepare("SELECT 1 AS x FROM sponsor_contracts WHERE team_id = ? AND status = 'active' AND category = 'banner' AND sponsor_type = ? LIMIT 1")
      .bind(team.id, sponsor.type).first<{ x: number }>(),
    categoryContracts(db, team.id, i.category),
    loadTeamSeasonProgress(db, team.id),
  ]);
  const matchesPlayed = played?.cnt ?? 0;
  const other = contracts.active && contracts.active.sponsor_id !== sponsor.id ? contracts.active : null;
  return {
    category: i.category, personality: i.personality, wishes: i.wishes, budgetB: i.budgetB, season: i.season,
    leagueTeams: league.teams, expectedPosition: league.expected,
    cupTotalRounds: cup?.total_rounds ?? DEFAULT_CUP_ROUNDS,
    lastAvgAttendance: attendance,
    reputation: team.reputation,
    licenceLevel: manager?.licence_level ?? 0,
    sponsorType: sponsor.type,
    sectorBannerActive: banner !== null,
    facilities: facilityOptions(stadium, team.reputation, matchesPlayed, i.season),
    equipment: equipmentGiftOptions(equip, team.reputation, matchesPlayed, i.season),
    currentTerminationFee: other ? prorataTerminationFee(other) : 0,
    seasonProgressMonths: progress,
  };
}

export type Fail = { error: string; status: 400 | 404 | 409 | 410 };

/** Otevře jednání, nebo vrátí id už běžícího se stejnou firmou a kategorií. */
export async function openNegotiation(
  db: D1Database, teamId: string, sponsorId: number, category: NegotiationCategory,
): Promise<{ ok: true; id: string } | ({ ok: false } & Fail)> {
  const team = await loadNegotiationTeam(db, teamId);
  if (!team) return { ok: false, error: "Tým nenalezen", status: 404 };
  const sponsor = await loadNegotiationSponsor(db, sponsorId);
  if (!sponsor) return { ok: false, error: "Sponzor nenalezen", status: 404 };
  const season = await activeSeason(db);
  const av = await negotiationAvailability(db, team, sponsor, category, season);
  if (av.openId) return { ok: true, id: av.openId };
  if (!av.canOpen) return { ok: false, error: av.reason ?? "S touhle firmou teď jednat nejde", status: 409 };

  const owner = await ensureSponsorOwner(db, sponsorId);
  if (!owner) return { ok: false, error: "Majitel nenalezen", status: 404 };
  const favor = await getFavor(db, sponsorId, teamId);
  const budgetB = sponsorBudgetB({ monthlyMax: sponsor.monthly_max, reputation: team.reputation, villageSize: team.size, category, favor });
  const wishes = ownerWishes({ sponsorId, teamId, season, personality: owner.personality, sponsorType: sponsor.type, category });
  const id = crypto.randomUUID();
  // Jedno běžící jednání na klub, firmu a kategorii: podmíněný INSERT ustojí i dvojklik.
  const ins = await db.prepare(
    `INSERT INTO sponsor_negotiations (id, team_id, sponsor_id, category, wishes, budget_b, patience, expires_game_date)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM sponsor_negotiations WHERE team_id = ? AND sponsor_id = ? AND category = ? AND status IN ('open','accepted'))`,
  ).bind(
    id, teamId, sponsorId, category, JSON.stringify(wishes), budgetB, initialPatience(favor),
    gameExpiry(teamGameDate(team), NEGOTIATION_DAYS), teamId, sponsorId, category,
  ).run();
  if ((ins.meta?.changes ?? 0) !== 1) {
    const again = await findActiveNegotiation(db, teamId, sponsorId, category, teamGameDate(team));
    if (again) return { ok: true, id: again.id };
    return { ok: false, error: "Jednání se nepodařilo otevřít, zkus to znovu", status: 409 };
  }
  logger.info({ module: "sponsors", teamId }, `jednání ${id}: sponzor ${sponsorId}, ${category}, B=${budgetB}, přání ${wishes.join(",")}`);
  return { ok: true, id };
}

export interface NegotiationState {
  neg: Negotiation;
  team: NegotiationTeam;
  sponsor: NegotiationSponsor;
  owner: SponsorOwner;
  favor: number;
  season: number;
  ctx: NegotiationContext;
  isRenewal: boolean;
  contracts: CategoryContracts;
}

export async function loadNegotiationState(db: D1Database, teamId: string, negotiationId: string): Promise<NegotiationState | Fail> {
  const row = await db.prepare("SELECT * FROM sponsor_negotiations WHERE id = ? AND team_id = ?")
    .bind(negotiationId, teamId).first<NegotiationRow>();
  if (!row) return { error: "Jednání nenalezeno", status: 404 };
  const team = await loadNegotiationTeam(db, teamId);
  if (!team) return { error: "Tým nenalezen", status: 404 };
  const sponsor = await loadNegotiationSponsor(db, row.sponsor_id);
  if (!sponsor) return { error: "Sponzor nenalezen", status: 404 };
  const owner = await ensureSponsorOwner(db, row.sponsor_id);
  if (!owner) return { error: "Majitel nenalezen", status: 404 };
  const [favor, season, contracts] = await Promise.all([
    getFavor(db, sponsor.id, teamId), activeSeason(db), categoryContracts(db, teamId, row.category),
  ]);
  const neg = await expireIfDue(db, parseNegotiation(row), teamGameDate(team));
  const ctx = await buildNegotiationContext(db, {
    team, sponsor, category: neg.category, season, personality: owner.personality, wishes: neg.wishes, budgetB: neg.budgetB,
  });
  return { neg, team, sponsor, owner, favor, season, ctx, isRenewal: isRenewalOf(contracts, sponsor.id), contracts };
}

/** Co se podepíše: přijatý návrh klubu, nebo poslední protinabídka majitele. */
export function pendingTerms(neg: Negotiation): Proposal | null {
  const last = neg.rounds[neg.rounds.length - 1];
  if (!last) return null;
  if (neg.status === "accepted" && last.response.kind === "accept") return last.proposal;
  if (neg.status === "open" && (last.response.kind === "counter_money" || last.response.kind === "counter_wish") && last.response.counter) {
    return last.response.counter;
  }
  return null;
}

/** Zapíše kolo jen tehdy, když se od načtení nic nezměnilo (dvojklik nespálí trpělivost dvakrát). */
export async function saveRound(
  db: D1Database, neg: Negotiation, round: NegotiationRound,
  next: { status: NegotiationStatus; patience: number; cooldownUntil: string | null },
): Promise<boolean> {
  const rounds = JSON.stringify([...neg.rounds, round]);
  const res = await db.prepare(
    "UPDATE sponsor_negotiations SET rounds = ?, status = ?, patience = ?, cooldown_until = ? WHERE id = ? AND status = 'open' AND rounds = ?",
  ).bind(rounds, next.status, next.patience, next.cooldownUntil, neg.id, neg.roundsRaw).run();
  return (res.meta?.changes ?? 0) === 1;
}

/**
 * Rollover vrací herní čas zpátky na reálné datum: lhůty a cooldowny ze staré osy by
 * nikdy nevypršely. Běžící jednání se proto uzavřou a cooldowny smažou.
 */
export async function closeNegotiationsForRollover(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare("UPDATE sponsor_negotiations SET status = 'expired' WHERE status IN ('open','accepted')"),
    db.prepare("UPDATE sponsor_negotiations SET cooldown_until = NULL WHERE cooldown_until IS NOT NULL"),
  ]);
}

export interface NegotiationListItem {
  id: string; sponsorId: number; sponsorName: string; category: NegotiationCategory; status: "open" | "accepted"; expiresGameDate: string;
}

export async function listTeamNegotiations(db: D1Database, teamId: string): Promise<NegotiationListItem[]> {
  const team = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>();
  const gameDate = teamGameDate({ game_date: team?.game_date ?? null });
  const rows = await db.prepare(
    `SELECT n.id, n.sponsor_id, ds.name AS sponsor_name, n.category, n.status, n.expires_game_date
     FROM sponsor_negotiations n JOIN district_sponsors ds ON ds.id = n.sponsor_id
     WHERE n.team_id = ? AND n.status IN ('open','accepted') ORDER BY n.created_at DESC`,
  ).bind(teamId).all<{ id: string; sponsor_id: number; sponsor_name: string; category: NegotiationCategory; status: "open" | "accepted"; expires_game_date: string }>();
  return rows.results
    .filter((r) => !isGameExpired(r.expires_game_date, gameDate))
    .map((r) => ({ id: r.id, sponsorId: r.sponsor_id, sponsorName: r.sponsor_name, category: r.category, status: r.status, expiresGameDate: r.expires_game_date }));
}

export interface PromiseRowView {
  kind: PromiseKind; params: PromiseParams; label: string; season: number | null; deadlineGameDate: string | null;
  reward: number; penalty: number;
}

export interface NegotiationView {
  id: string;
  sponsorId: number;
  sponsorName: string;
  sponsorType: string;
  category: NegotiationCategory;
  status: NegotiationStatus;
  isRenewal: boolean;
  owner: { firstName: string; lastName: string; personality: OwnerPersonality; faceConfig: Record<string, unknown> };
  favor: number;
  wishes: PromiseKind[];
  patience: number;
  expiresGameDate: string;
  cooldownUntil: string | null;
  /** Ochota bez slibů a strop, obojí jako rozmezí; klient k nim přičítá rozmezí vybraných slibů. */
  estimate: { base: Range; cap: Range; cautiousSeasonBonus: number };
  winBonusFactor: number;
  monthsPerSeason: number;
  /**
   * Skutečná délka smlouvy v měsících podle počtu sezón (index 0 = 1 sezóna): od dneška do konce
   * poslední sezóny (effectiveContractMonths). Náhled na webu s ní rozpočítává jednorázové položky
   * a pravidlo o měsíční polovině stejně jako server.
   */
  contractMonths: number[];
  catalog: PromiseOption[];
  construction: GiftOption[];
  equipment: GiftOption[];
  /** `clawback` = nesplacená záloha současné smlouvy, kterou klub při podpisu vrací (i při prodloužení). */
  current: null | {
    sponsorName: string; monthlyAmount: number; winBonus: number; seasonsRemaining: number; terminationFee: number; sameSponsor: boolean;
    clawback: number;
  };
  rounds: NegotiationRound[];
  pending: null | {
    proposal: Proposal; promises: PromiseRowView[]; terminationFee: number; constructionCost: number; equipmentCost: number;
    currentFee: number; renamesClub: boolean;
  };
  season: number;
}

/** `currentClawback`: vratka zálohy současné smlouvy (contractClawback v signing.ts, viewWithClawback). */
export function negotiationView(st: NegotiationState, extra: { currentClawback: number } = { currentClawback: 0 }): NegotiationView {
  const { neg, ctx, favor, owner, sponsor } = st;
  const terms = pendingTerms(neg);
  const summary = terms ? signingSummary(terms, ctx, teamGameDate(st.team)) : null;
  const current = st.contracts.active;
  return {
    id: neg.id,
    sponsorId: sponsor.id,
    sponsorName: sponsor.name,
    sponsorType: sponsor.type,
    category: neg.category,
    status: neg.status,
    isRenewal: st.isRenewal,
    owner: { firstName: owner.firstName, lastName: owner.lastName, personality: owner.personality, faceConfig: owner.faceConfig },
    favor,
    wishes: neg.wishes,
    patience: neg.patience,
    expiresGameDate: neg.expiresGameDate,
    cooldownUntil: neg.cooldownUntil,
    estimate: {
      base: budgetEstimateRange(BASE_WILLINGNESS * ctx.budgetB, favor),
      cap: budgetEstimateRange(WILLINGNESS_CAP * ctx.budgetB, favor),
      cautiousSeasonBonus: owner.personality === "cautious" ? CAUTIOUS_SEASON_BONUS : 0,
    },
    winBonusFactor: Math.round(winBonusFactor(ctx) * 1000) / 1000,
    monthsPerSeason: MONTHS_PER_SEASON,
    // Nezaokrouhleně: web s tím počítá minMonthlyFor, musí vyjít na korunu stejně jako na serveru.
    contractMonths: Array.from({ length: MAX_SEASONS - MIN_SEASONS + 1 }, (_, i) => effectiveContractMonths(MIN_SEASONS + i, ctx.seasonProgressMonths)),
    catalog: promiseCatalog(ctx, favor),
    construction: constructionOptions(ctx),
    equipment: equipmentOptions(ctx),
    current: current ? {
      sponsorName: current.sponsor_name, monthlyAmount: current.monthly_amount, winBonus: current.win_bonus,
      seasonsRemaining: current.seasons_remaining, terminationFee: prorataTerminationFee(current),
      sameSponsor: current.sponsor_id === sponsor.id, clawback: extra.currentClawback,
    } : null,
    rounds: neg.rounds,
    pending: summary ? {
      proposal: summary.proposal,
      promises: summary.rows.map((r) => ({
        kind: r.kind, params: r.params, label: promiseLabel({ kind: r.kind, params: r.params }, ctx),
        season: r.season, deadlineGameDate: r.deadlineGameDate, reward: r.reward, penalty: r.penalty,
      })),
      terminationFee: summary.terminationFee,
      constructionCost: summary.constructionCost,
      equipmentCost: summary.equipmentCost,
      currentFee: summary.currentFee,
      renamesClub: neg.category === "main" && !st.isRenewal,
    } : null,
    season: st.season,
  };
}
