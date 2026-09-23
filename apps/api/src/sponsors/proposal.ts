/**
 * Návrh klubu při jednání: validace (klient smí poslat jen tvar, čísla ověří server)
 * a katalog slibů a darů, který klient vidí. Hodnoty slibů klient dostává jen jako
 * rozmezí podle náklonnosti, stejně jako odhad rozpočtu.
 */
import { licenceLabel, MAX_LICENCE } from "@okresni-masina/shared";
import { roundName } from "../cup/cup";
import { CATEGORY_LABELS } from "../equipment/equipment-generator";
import { FACILITY_LABELS } from "../stadium/stadium-generator";
import { MONTHS_PER_SEASON, RELEGATION_SPOTS } from "./ambition";
import { budgetEstimateRange } from "./budget";
import {
  MAX_PROMISES, MAX_SEASONS, MIN_SEASONS, promiseChance, promisePenalty, promiseValueShare,
  type Demands, type NegotiationContext, type Proposal,
} from "./negotiation";
import {
  EQUIPMENT_GIFTS, isPromiseKind, LEAGUE_FINISH_KINDS, SEASONAL_KINDS,
  type PromiseKind, type PromiseParams, type PromiseSpec,
} from "./promise-kinds";
import { kindAllowedForCategory } from "./wishes";

export { MAX_PROMISES };

type Result = { ok: true; proposal: Proposal } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

function int(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) ? v : null;
}

function money(v: unknown, max: number): number | null {
  const n = int(v ?? 0);
  return n !== null && n >= 0 && n <= max ? n : null;
}

function openFacility(ctx: NegotiationContext, key: unknown) {
  return ctx.facilities.find((f) => f.facility === key && !f.locked && f.currentLevel < 3) ?? null;
}

/** Očištěný slib (jen povolené parametry), nebo český důvod, proč neprojde. */
function sanitizePromise(raw: unknown, ctx: NegotiationContext, seasons: number): PromiseSpec | string {
  if (!raw || typeof raw !== "object") return "Neplatný slib";
  const r = raw as { kind?: unknown; params?: Record<string, unknown> };
  if (!isPromiseKind(r.kind)) return "Neznámý druh slibu";
  const kind: PromiseKind = r.kind;
  const p = r.params ?? {};
  if (!kindAllowedForCategory(kind, ctx.category)) return "Tenhle slib u téhle smlouvy nabídnout nejde.";
  if (SEASONAL_KINDS.has(kind) && seasons < 2) return "Sezónní sliby platí až od příští sezóny, smlouva musí být aspoň na 2 sezóny";
  const spec = (params: PromiseParams): PromiseSpec => ({ kind, params });
  switch (kind) {
    case "league_position": {
      const position = int(p.position);
      // Bez posledních (sestupových) míst, ta by slíbil kdokoli.
      const max = ctx.leagueTeams - RELEGATION_SPOTS;
      return position !== null && position >= 1 && position <= max ? spec({ position }) : "Neplatné místo v tabulce";
    }
    case "promotion":
    case "no_relegation":
    case "no_riots":
    case "jersey_logo":
      return spec({});
    case "cup_round": {
      const round = int(p.round);
      return round !== null && round >= 2 && round <= ctx.cupTotalRounds ? spec({ round }) : "Neplatné kolo poháru";
    }
    case "coach_licence": {
      const level = int(p.level);
      return level !== null && level > ctx.licenceLevel && level <= MAX_LICENCE ? spec({ level }) : "Neplatná licence";
    }
    case "stadium_upgrade": {
      const f = openFacility(ctx, p.facility);
      const level = int(p.level);
      if (!f || level === null || level <= f.currentLevel || level > 3 || (f.costs[level] ?? 0) <= 0) return "Tuhle stavbu teď slíbit nejde";
      return spec({ facility: f.facility, level });
    }
    case "sector_exclusivity":
      if (ctx.sectorBannerActive) return "Máš banner firmy ze stejného oboru, exkluzivitu slíbit nejde";
      return spec({ sector: ctx.sponsorType });
    case "attendance": {
      const attendance = int(p.attendance);
      // Aspoň 0,9 × loňský průměr, jinak by šlo slíbit i pokles.
      const min = Math.max(1, Math.round(ctx.lastAvgAttendance * 0.9));
      return attendance !== null && attendance >= min && attendance <= 5000 ? spec({ attendance }) : "Neplatná návštěva";
    }
    case "youth": {
      const count = int(p.count);
      // Jeden hráč do 21 let bývá v sestavě i tak, slib musí něco přidat.
      return count !== null && count >= 2 && count <= 4 ? spec({ count }) : "Neplatný počet mladých hráčů";
    }
    case "reputation": {
      const reputation = int(p.reputation);
      // Aspoň o 3 nad současnou, jinak by slib nic neznamenal.
      const min = ctx.reputation + 3;
      return reputation !== null && reputation >= min && reputation <= 100 ? spec({ reputation }) : "Neplatná reputace";
    }
  }
}

export function validateProposal(raw: unknown, ctx: NegotiationContext): Result {
  if (!raw || typeof raw !== "object") return fail("Neplatný návrh");
  const r = raw as { seasons?: unknown; promises?: unknown; demands?: unknown };
  const seasons = int(r.seasons);
  if (seasons === null || seasons < MIN_SEASONS || seasons > MAX_SEASONS) return fail("Délka smlouvy musí být 1 až 3 sezóny");
  if (!Array.isArray(r.promises) || r.promises.length > MAX_PROMISES) return fail("Neplatné sliby");

  const promises: PromiseSpec[] = [];
  const seen = new Set<PromiseKind>();
  for (const rp of r.promises) {
    const p = sanitizePromise(rp, ctx, seasons);
    if (typeof p === "string") return fail(p);
    if (seen.has(p.kind)) return fail("Každý druh slibu jde dát jen jednou");
    seen.add(p.kind);
    promises.push(p);
  }
  // Umístění, postup a nesestup jsou v lize jeden a týž cíl, dohromady by šlo za jeden výsledek brát dvakrát.
  if (promises.filter((p) => LEAGUE_FINISH_KINDS.has(p.kind)).length > 1) {
    return fail("Umístění, postup a nesestup se navzájem vylučují, vyber jen jeden.");
  }

  if (!r.demands || typeof r.demands !== "object") return fail("Chybí požadavky");
  const d = r.demands as Record<string, unknown>;
  const b = ctx.budgetB;
  const monthly = money(d.monthly, 3 * b);
  if (monthly === null || monthly <= 0) return fail("Měsíční podpora musí být kladná a v rozumné výši");
  const winBonus = money(d.winBonus, b);
  if (winBonus === null || (ctx.category === "stadium" && winBonus > 0)) return fail("Neplatný bonus za výhru");
  const signingBonus = money(d.signingBonus, 12 * b);
  if (signingBonus === null) return fail("Neplatný příspěvek za podpis");

  const goalBonuses: Partial<Record<PromiseKind, number>> = {};
  const rawGoals = d.goalBonuses ?? {};
  if (typeof rawGoals !== "object" || rawGoals === null) return fail("Neplatné bonusy za splnění");
  for (const [k, v] of Object.entries(rawGoals as Record<string, unknown>)) {
    if (!isPromiseKind(k) || !seen.has(k)) return fail("Bonus za splnění jde jen ke slíbenému cíli");
    const g = money(v, 3 * b);
    if (g === null) return fail("Neplatný bonus za splnění");
    if (g > 0) goalBonuses[k] = g;
  }

  let construction: string | null = null;
  if (d.construction !== null && d.construction !== undefined) {
    const f = openFacility(ctx, d.construction);
    if (!f || (f.costs[f.currentLevel + 1] ?? 0) <= 0) return fail("Tuhle stavbu teď sponzor zaplatit nemůže");
    if (promises.some((p) => p.kind === "stadium_upgrade" && p.params.facility === f.facility)) {
      return fail("Stejnou stavbu nejde slíbit a zároveň chtít zaplatit");
    }
    construction = f.facility;
  }

  let equipment: string | null = null;
  if (d.equipment !== null && d.equipment !== undefined) {
    const e = ctx.equipment.find((x) => x.category === d.equipment && !x.locked);
    if (!e || !EQUIPMENT_GIFTS.includes(e.category)) return fail("Tohle vybavení teď sponzor koupit nemůže");
    equipment = e.category;
  }

  if (typeof (d.payCurrentFee ?? false) !== "boolean") return fail("Neplatný požadavek na výpovědní pokutu");
  const payCurrentFee = d.payCurrentFee === true;
  if (payCurrentFee && ctx.currentTerminationFee <= 0) return fail("Není žádná výpovědní pokuta, kterou by šlo zaplatit");

  const demands: Demands = { monthly, winBonus, signingBonus, goalBonuses, construction, equipment, payCurrentFee };
  return { ok: true, proposal: { seasons, promises, demands } };
}

function hracu(n: number): string {
  return n === 1 ? "hráč" : n <= 4 ? "hráči" : "hráčů";
}

/** Popisek konkrétního slibu pro hráče, bez dlouhé pomlčky. */
export function promiseLabel(s: PromiseSpec, ctx: NegotiationContext): string {
  const p = s.params;
  switch (s.kind) {
    case "league_position": return `skončit do ${p.position}. místa`;
    case "promotion": return "postup, 1. nebo 2. místo";
    case "no_relegation": return "nesestoupit";
    case "cup_round": return `v poháru aspoň ${roundName(p.round ?? 2, ctx.cupTotalRounds).toLowerCase()}`;
    case "coach_licence": return `trenér s licencí ${licenceLabel(p.level ?? 1)}`;
    case "stadium_upgrade": return `${FACILITY_LABELS[p.facility ?? ""] ?? p.facility} na úroveň ${p.level}`;
    case "jersey_logo": return "logo na rukávu dresu";
    case "sector_exclusivity": return "žádný banner firmy ze stejného oboru";
    case "attendance": return `průměrně aspoň ${p.attendance} diváků doma`;
    case "youth": return `průměrně ${p.count} ${hracu(p.count ?? 0)} do 21 let v sestavě`;
    case "reputation": return `reputace aspoň ${p.reputation} na konci sezóny`;
    case "no_riots": return "žádná výtržnost fanoušků";
  }
}

export interface Range { low: number; high: number }

export interface PromiseOption {
  kind: PromiseKind;
  params: PromiseParams;
  label: string;
  seasonal: boolean;
  /** Přínos k ochotě v Kč měsíčně, jako rozmezí podle náklonnosti. */
  value: Range;
  /** Pokuta za nesplnění (za každou sezónu u sezónních), jako rozmezí. */
  penalty: Range;
  /** Šance, kterou sponzor slibu dává (pro náhled ceny bonusu za splnění). */
  chance: number;
}

export interface GiftOption { key: string; label: string; level: number; cost: number }

function candidates(ctx: NegotiationContext): PromiseSpec[] {
  const out: PromiseSpec[] = [];
  // Bez sestupových míst, ta by nešla slíbit (validateProposal).
  for (let position = 1; position <= ctx.leagueTeams - RELEGATION_SPOTS; position++) {
    out.push({ kind: "league_position", params: { position } });
  }
  out.push({ kind: "promotion", params: {} }, { kind: "no_relegation", params: {} });
  for (let round = 2; round <= ctx.cupTotalRounds; round++) out.push({ kind: "cup_round", params: { round } });
  for (let level = ctx.licenceLevel + 1; level <= MAX_LICENCE; level++) out.push({ kind: "coach_licence", params: { level } });
  for (const f of ctx.facilities) {
    if (f.locked) continue;
    for (let level = f.currentLevel + 1; level <= 3; level++) {
      if ((f.costs[level] ?? 0) > 0) out.push({ kind: "stadium_upgrade", params: { facility: f.facility, level } });
    }
  }
  if (ctx.category === "stadium") out.push({ kind: "jersey_logo", params: {} });
  if (!ctx.sectorBannerActive) out.push({ kind: "sector_exclusivity", params: { sector: ctx.sponsorType } });
  const avg = Math.max(10, ctx.lastAvgAttendance);
  // Zaokrouhleno NAHORU (Math.ceil) a ohlídáno proti skutečnému minimu validátoru (sanitizePromise),
  // jinak by kulaté hodnoty katalogu mohly kvůli jinému zaokrouhlení padnout pod 0,9 × loňský průměr.
  const attendanceFloor = Math.max(10, Math.round(ctx.lastAvgAttendance * 0.9));
  const seenAttendance = new Set<number>();
  for (const mult of [0.9, 1, 1.1, 1.25, 1.5]) {
    const attendance = Math.max(attendanceFloor, Math.ceil((avg * mult) / 10) * 10);
    if (seenAttendance.has(attendance)) continue;
    seenAttendance.add(attendance);
    out.push({ kind: "attendance", params: { attendance } });
  }
  // Jeden hráč do 21 let bývá v sestavě i tak, katalog nabízí až od dvou (validateProposal).
  for (let count = 2; count <= 4; count++) out.push({ kind: "youth", params: { count } });
  const minReputation = ctx.reputation + 3;
  const seenReputation = new Set<number>();
  for (const plus of [3, 5, 10, 15]) {
    const reputation = Math.min(100, ctx.reputation + plus);
    if (reputation < minReputation || seenReputation.has(reputation)) continue;
    seenReputation.add(reputation);
    out.push({ kind: "reputation", params: { reputation } });
  }
  out.push({ kind: "no_riots", params: {} });
  return out;
}

/**
 * Všechny sliby, které klub může dát, s rozmezím přínosu a pokuty. V okamžiku katalogu klub ještě
 * nevybral délku smlouvy (ta patří do samotného návrhu, ne katalogu), takže pokuta je orientační
 * „na jednu sezónu" (skutečná pokuta na řádek se počítá v buildPromiseRows z celé délky smlouvy).
 */
export function promiseCatalog(ctx: NegotiationContext, favor: number): PromiseOption[] {
  return candidates(ctx).map((spec) => {
    const share = promiseValueShare(spec, ctx);
    return {
      kind: spec.kind,
      params: spec.params,
      label: promiseLabel(spec, ctx),
      seasonal: SEASONAL_KINDS.has(spec.kind),
      value: budgetEstimateRange(share * ctx.budgetB, favor),
      penalty: budgetEstimateRange(promisePenalty(share, ctx.budgetB, MONTHS_PER_SEASON, 1), favor),
      chance: Math.round(promiseChance(spec, ctx) * 100) / 100,
    };
  });
}

/** Stavby, které může sponzor zaplatit: odemčené zařízení o jednu úroveň. */
export function constructionOptions(ctx: NegotiationContext): GiftOption[] {
  return ctx.facilities
    .filter((f) => !f.locked && f.currentLevel < 3 && (f.costs[f.currentLevel + 1] ?? 0) > 0)
    .map((f) => ({ key: f.facility, label: FACILITY_LABELS[f.facility] ?? f.facility, level: f.currentLevel + 1, cost: f.costs[f.currentLevel + 1] }));
}

/** Vybavení (míče, dresy) o úroveň výš, když je další úroveň odemčená. */
export function equipmentOptions(ctx: NegotiationContext): GiftOption[] {
  return ctx.equipment
    .filter((e) => !e.locked && EQUIPMENT_GIFTS.includes(e.category))
    .map((e) => ({ key: e.category, label: CATEGORY_LABELS[e.category] ?? e.category, level: e.nextLevel, cost: e.cost }));
}
