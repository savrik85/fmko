/**
 * Občerstvení AI klubu v pondělní správě: čisté funkce bez databáze.
 *
 * Model volí provoz bufetu (externí provozovatel, nebo vlastní prodej) a u každého
 * produktu kvalitu, prodejní cenu a kolik naskladnit. Kód připraví přípustné možnosti
 * a meze a nákup jde stejnou službou jako u člověka (services/concessions.ts):
 * - cena nad nákupní cenou a pod cenou, za kterou už nikdo nekoupí (bufet člověka u ní
 *   hlásí „Za tuhle cenu nikdo nekoupí" a revize soutěže ji hlídá), nejvýš 1 000 Kč jako v routě,
 * - množství podle návštěvy domácích zápasů do příští správy (rezerva na silnější návštěvu
 *   i nejnižší cenu) a jen z peněz nad rezervou trenéra.
 * Poptávka se počítá stejnou funkcí jako prodej v zápase (`computeSelfConcessionMatch`).
 *
 * Náhradní pravidlo podle povahy: šetrný trenér bere levnou kvalitu a méně kusů, ostatní
 * střední kvalitu na očekávaný prodej. Před domácím zápasem se sklad dorovná na stejné
 * pokrytí, jaké trenér zvolil v pondělí (`planConcessionTopUp`).
 */

import type { Weather } from "../engine/types";
import {
  CONCESSION_CATALOG, CONCESSION_PRODUCT_KEYS, concessionNoSalePrice, type ProductKey,
} from "../season/concession-catalog";
import type { StockByTier } from "../season/concession-stock";
import { computeSelfConcessionMatch } from "../season/fans-processor";
import { MAX_CONCESSION_PRICE, MAX_RESTOCK_QUANTITY, type ConcessionMode } from "../services/concessions";
import type { AiCoachProfile } from "./profile";

export type { ConcessionMode };
export const CONCESSION_MODES: readonly ConcessionMode[] = ["external", "self"];

/** Kdo rozhodl: model, náhradní pravidlo, nebo kód (jediná přípustná možnost). */
export type ConcessionDecidedBy = "model" | "fallback" | "guard";

/** Od jaké šetrnosti bere náhradní pravidlo levnou kvalitu a méně kusů (jako „hate spending" v promptu). */
export const THRIFTY_FROM = 70;
/** Domácí zápasy do příští pondělní správy. */
export const CONCESSION_WINDOW_DAYS = 7;
/** Silnější návštěva, se kterou kód počítá v horní mezi nákupu: aspoň o čtvrtinu nad průměrem. */
export const PEAK_ATTENDANCE_MUL = 1.25;
/** Bez historie domácích zápasů (nový klub). Základní kapacita hřiště je 150. */
export const DEFAULT_HOME_ATTENDANCE = 150;
export const DEFAULT_PEAK_ATTENDANCE = 250;
/** Přátelák: na něj chodí 20 až 70 lidí (multiplayer/friendly-runner.ts). */
export const FRIENDLY_ATTENDANCE = 45;
export const FRIENDLY_PEAK_ATTENDANCE = 70;
/** Dorovnání před zápasem nejvýš na tolikanásobek očekávaného prodeje. */
export const MAX_TOPUP_COVER = 1.5;
/** Pod tímhle pokrytím trenér produkt prodávat nechce (třeba svařák v létě) a nedokupuje se. */
export const MIN_TOPUP_COVER = 0.25;
/** Dokup pár kusů nemá smysl, sklad i tak skoro vystačí. */
export const MIN_TOPUP_UNITS = 5;

export interface ConcessionFixture {
  id: string;
  kind: "league" | "cup" | "friendly";
  /** YYYY-MM-DD */
  day: string;
  /** Očekávaná návštěva. */
  attendance: number;
  /** Silnější návštěva pro horní mez nákupu. */
  peak: number;
  weather: Weather;
  /** °C jako v prodeji v zápase; null = prodej teplotu nezná (pohár, přátelák). */
  temperature: number | null;
}

export interface ConcessionTierOption {
  level: number;
  label: string;
  wholesale: number;
  defaultPrice: number;
  minPrice: number;
  maxPrice: number;
  stock: number;
  /** Očekávaný prodej do příští správy za doporučenou cenu. */
  expectedSales: number;
  /** Nejvíc kusů, které kód dovolí koupit: silnější návštěva, nejnižší cena, peníze nad rezervou. */
  maxBuy: number;
}

export interface ConcessionProductOption {
  key: ProductKey;
  label: string;
  currentLevel: number;
  currentPrice: number;
  tiers: ConcessionTierOption[];
}

export interface ConcessionContext {
  mode: ConcessionMode;
  modeOptions: ConcessionMode[];
  refreshmentsLevel: number;
  externalWeeklyIncome: number;
  satisfaction: number;
  /** Obsluha bufetu a útrata part: násobič poptávky jako v zápase. */
  demandMul: number;
  attendance: { average: number; peak: number; matches: number };
  fixtures: ConcessionFixture[];
  /** Peníze nad rezervou, ze kterých jde nákup do skladu. */
  spendable: number;
  products: ConcessionProductOption[];
}

/** Co klub o bufetu ví z databáze; z toho `buildConcessionContext` spočítá možnosti a meze. */
export interface ConcessionInput {
  mode: ConcessionMode;
  refreshmentsLevel: number;
  externalWeeklyIncome: number;
  satisfaction: number;
  demandMul: number;
  attendance: { average: number; peak: number; matches: number };
  fixtures: ConcessionFixture[];
  spendable: number;
  stock: Array<{ key: ProductKey; qualityLevel: number; sellPrice: number; stockByTier: StockByTier }>;
}

export interface ConcessionProductChoice {
  key: ProductKey;
  tier: number;
  price: number;
  buy: number;
  decidedBy: "model" | "fallback";
}

export interface ConcessionDecision {
  mode: ConcessionMode;
  /** Prázdné u externího provozovatele. */
  products: ConcessionProductChoice[];
  decidedBy: ConcessionDecidedBy;
}

export type ConcessionAction =
  | { kind: "concession_mode"; mode: ConcessionMode; from: ConcessionMode }
  | { kind: "concession_product"; key: ProductKey; tier: number; price: number; fromTier: number; fromPrice: number }
  | { kind: "concession_stock"; key: ProductKey; tier: number; quantity: number; unitCost: number; cost: number };

/** Nákup do skladu, jak ho trenér chce (před kontrolou peněz). */
export interface ConcessionPurchase {
  key: ProductKey;
  tier: number;
  quantity: number;
  unitCost: number;
}

/** Plán bufetu na týden pro dorovnání před domácím zápasem (ukládá se do deníku pondělní správy). */
export interface ConcessionTopUpPlan {
  decidedBy: ConcessionDecidedBy;
  mode: ConcessionMode;
  /** Rezerva trenéra v pondělí: dokup nesmí jít pod ni. */
  reserve: number;
  /** `cover` = sklad po nákupu / očekávaný prodej týdne; podle něj se dorovnává před zápasem. */
  products: Array<{ key: ProductKey; tier: number; price: number; cover: number }>;
}

// ── Poptávka a meze ────────────────────────────────────────────────────────

/** Ceny, které kód pustí: nad nákupní cenou, pod cenou „nikdo nekoupí", nejvýš 1 000 Kč. */
export function priceBounds(key: ProductKey, level: number): { min: number; max: number } | null {
  const tier = CONCESSION_CATALOG[key]?.tiers[level];
  const noSale = concessionNoSalePrice(key, level);
  if (!tier || tier.wholesalePrice <= 0 || noSale === null) return null;
  return { min: tier.wholesalePrice + 1, max: Math.min(MAX_CONCESSION_PRICE, noSale - 1) };
}

/**
 * Kolik kusů se prodá v zápasech okna: stejný výpočet jako prodej v zápase
 * (spokojenost, cena, kvalita, počasí, obsluha a party), jen s neomezeným skladem.
 */
export function salesFor(
  c: Pick<ConcessionContext, "fixtures" | "satisfaction" | "demandMul">,
  key: ProductKey,
  level: number,
  price: number,
  attendance: "attendance" | "peak" = "attendance",
): number {
  let total = 0;
  for (const f of c.fixtures) {
    const sale = computeSelfConcessionMatch(
      f[attendance], c.satisfaction,
      [{ key, qualityLevel: level, sellPrice: price, stockQuantity: Number.MAX_SAFE_INTEGER }],
      f.weather, c.demandMul, f.temperature ?? undefined,
    );
    total += sale.products[0]?.sold ?? 0;
  }
  return total;
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

/** Možnosti a meze bufetu z dat klubu. */
export function buildConcessionContext(input: ConcessionInput): ConcessionContext {
  const base = { fixtures: input.fixtures, satisfaction: input.satisfaction, demandMul: input.demandMul };
  const spendable = Math.max(0, input.spendable);
  const products: ConcessionProductOption[] = [];
  for (const key of CONCESSION_PRODUCT_KEYS) {
    const row = input.stock.find((r) => r.key === key);
    if (!row) continue;
    const catalog = CONCESSION_CATALOG[key];
    const tiers: ConcessionTierOption[] = [];
    for (let level = 1; level < catalog.tiers.length; level++) {
      const tier = catalog.tiers[level];
      const bounds = priceBounds(key, level);
      if (!bounds) continue;
      const stock = Math.max(0, row.stockByTier[level] ?? 0);
      const peakSales = salesFor(base, key, level, bounds.min, "peak");
      tiers.push({
        level,
        label: tier.label,
        wholesale: tier.wholesalePrice,
        defaultPrice: clampInt(tier.defaultSellPrice, bounds.min, bounds.max),
        minPrice: bounds.min,
        maxPrice: bounds.max,
        stock,
        expectedSales: salesFor(base, key, level, tier.defaultSellPrice),
        maxBuy: Math.max(0, Math.min(MAX_RESTOCK_QUANTITY, Math.floor(spendable / tier.wholesalePrice), peakSales - stock)),
      });
    }
    if (tiers.length > 0) {
      products.push({ key, label: catalog.label, currentLevel: row.qualityLevel, currentPrice: row.sellPrice, tiers });
    }
  }
  // Vlastní provoz chce aspoň L1 občerstvení (jako routa). Klub bez produktů nemá co prodávat.
  const canSelf = products.length > 0 && input.refreshmentsLevel >= 1;
  const modeOptions: ConcessionMode[] = canSelf || (input.mode === "self" && products.length > 0)
    ? ["external", "self"]
    : [input.mode];
  return {
    mode: input.mode,
    modeOptions,
    refreshmentsLevel: input.refreshmentsLevel,
    externalWeeklyIncome: input.externalWeeklyIncome,
    satisfaction: input.satisfaction,
    demandMul: input.demandMul,
    attendance: input.attendance,
    fixtures: input.fixtures,
    spendable,
    products,
  };
}

/** Bufet bez volby (žádné vlastní občerstvení, žádné produkty). */
export function emptyConcessionContext(mode: ConcessionMode = "external"): ConcessionContext {
  return buildConcessionContext({
    mode, refreshmentsLevel: 0, externalWeeklyIncome: 0, satisfaction: 50, demandMul: 1,
    attendance: { average: DEFAULT_HOME_ATTENDANCE, peak: DEFAULT_PEAK_ATTENDANCE, matches: 0 },
    fixtures: [], spendable: 0, stock: [],
  });
}

export function hasConcessionChoice(c: ConcessionContext): boolean {
  return c.modeOptions.length > 1;
}

function tierOf(c: ConcessionContext, key: ProductKey, level: number): ConcessionTierOption | undefined {
  return c.products.find((p) => p.key === key)?.tiers.find((t) => t.level === level);
}

// ── Náhradní pravidlo podle povahy ──────────────────────────────────────────

/**
 * Pokrytí očekávaného prodeje: šetrný kupuje méně, přesně na očekávaný prodej (při větší návštěvě
 * dojde), ostatní s rezervou na silnější zápas. Došlé zboží stojí 2 body spokojenosti za produkt.
 */
export function fallbackCover(profile: Pick<AiCoachProfile, "thrift">): number {
  return profile.thrift >= THRIFTY_FROM ? 1 : 1.15;
}

export function fallbackTierLevel(profile: Pick<AiCoachProfile, "thrift">): number {
  return profile.thrift >= THRIFTY_FROM ? 1 : 2;
}

/** Produkt podle povahy: šetrný levnou kvalitu a méně kusů, ostatní střední kvalitu na očekávaný prodej. */
export function fallbackProductChoice(p: ConcessionProductOption, profile: Pick<AiCoachProfile, "thrift">): ConcessionProductChoice {
  const cover = fallbackCover(profile);
  const buyFor = (t: ConcessionTierOption) => Math.max(0, Math.min(t.maxBuy, Math.ceil(t.expectedSales * cover) - t.stock));
  const sellable = (t: ConcessionTierOption) => Math.min(t.expectedSales, t.stock + buyFor(t));
  const target = p.tiers.find((t) => t.level === fallbackTierLevel(profile)) ?? p.tiers[0];
  const current = p.tiers.find((t) => t.level === p.currentLevel);
  // Jiná kvalita se zbožím aspoň na půl týdne se nejdřív doprodá, jinak by ležela ve skladu.
  // Stejně tak, když na zvolenou kvalitu nejsou peníze a prodalo by se míň než ze skladu.
  const keepCurrent = !!current && current !== target && current.stock > 0
    && (current.stock >= current.expectedSales * 0.5 || sellable(current) > sellable(target));
  const tier = keepCurrent && current ? current : target;
  return { key: p.key, tier: tier.level, price: tier.defaultPrice, buy: buyFor(tier), decidedBy: "fallback" };
}

/** Od jakého podílu očekávané tržby, na který je zboží (sklad + nákup), přejde náhradní pravidlo na vlastní provoz. */
export const MIN_SELF_COVERAGE = 0.5;

/**
 * Co vynese vlastní provoz do příští správy se skladem a s tím, co se vejde do peněz nad
 * rezervou: zisk a podíl očekávané tržby, na který zboží stačí.
 */
export function concessionOutlook(c: ConcessionContext, products: ConcessionProductChoice[]): { profit: number; coverage: number } {
  let money = c.spendable;
  let profit = 0;
  let covered = 0;
  let wanted = 0;
  for (const choice of products) {
    const tier = tierOf(c, choice.key, choice.tier);
    if (!tier) continue;
    const bought = Math.min(choice.buy, Math.floor(Math.max(0, money) / tier.wholesale));
    money -= bought * tier.wholesale;
    const sales = salesFor(c, choice.key, choice.tier, choice.price);
    const units = Math.min(sales, tier.stock + bought);
    profit += units * (choice.price - tier.wholesale);
    covered += units * choice.price;
    wanted += sales * choice.price;
  }
  return { profit, coverage: wanted > 0 ? covered / wanted : 0 };
}

/**
 * Provoz podle náhradního pravidla: vlastní, když vydělá víc než externí provozovatel za týden
 * a zboží stačí aspoň na polovinu očekávané tržby (jinak by bufet každý zápas vyprodal a fanoušci
 * se zlobili). Vlastní provoz zůstává, dokud je co prodávat. Bez domácího zápasu do příští správy
 * se provoz nemění, aby se nepřepínal sem a tam podle rozpisu.
 */
export function fallbackConcessionMode(c: ConcessionContext, products: ConcessionProductChoice[]): ConcessionMode {
  if (!c.modeOptions.includes("self")) return c.modeOptions[0] ?? "external";
  if (c.fixtures.length === 0) return c.mode;
  const { profit, coverage } = concessionOutlook(c, products);
  if (c.mode === "self") return profit > 0 ? "self" : "external";
  return profit > c.externalWeeklyIncome && coverage >= MIN_SELF_COVERAGE ? "self" : "external";
}

export function fixedConcessions(c: ConcessionContext): ConcessionDecision {
  return { mode: c.mode, products: [], decidedBy: "guard" };
}

export function fallbackConcessions(c: ConcessionContext, profile: Pick<AiCoachProfile, "thrift">): ConcessionDecision {
  if (!hasConcessionChoice(c)) return fixedConcessions(c);
  const products = c.products.map((p) => fallbackProductChoice(p, profile));
  const mode = fallbackConcessionMode(c, products);
  return { mode, products: mode === "self" ? products : [], decidedBy: "fallback" };
}

// ── Kontrola odpovědi modelu ───────────────────────────────────────────────

function checkProductChoice(raw: unknown, p: ConcessionProductOption): { ok: true; choice: ConcessionProductChoice } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "chybí" };
  const r = raw as Record<string, unknown>;
  const level = Number(r.tier);
  const tier = Number.isInteger(level) ? p.tiers.find((t) => t.level === level) : undefined;
  if (!tier) return { ok: false, reason: `neznámá kvalita ${String(r.tier)}` };
  const rawPrice = Number(r.price);
  if (!Number.isFinite(rawPrice)) return { ok: false, reason: `neplatná cena ${String(r.price)}` };
  const price = Math.round(rawPrice);
  if (price < tier.minPrice || price > tier.maxPrice) return { ok: false, reason: `cena ${price} Kč mimo ${tier.minPrice}-${tier.maxPrice}` };
  const rawBuy = Number(r.buy);
  if (!Number.isFinite(rawBuy)) return { ok: false, reason: `neplatný nákup ${String(r.buy)}` };
  const buy = Math.round(rawBuy);
  if (buy < 0 || buy > tier.maxBuy) return { ok: false, reason: `nákup ${buy} ks mimo 0-${tier.maxBuy}` };
  return { ok: true, choice: { key: p.key, tier: tier.level, price, buy, decidedBy: "model" } };
}

/**
 * Blok bufetu je samostatný: neplatný provoz nahradí celé náhradní pravidlo, neplatný produkt
 * (neznámá kvalita, cena nebo množství mimo meze) jen ten produkt. Zbytek týdne platí.
 */
export function validateConcessions(raw: unknown, c: ConcessionContext, profile: Pick<AiCoachProfile, "thrift">, rejected: string[]): ConcessionDecision {
  if (!hasConcessionChoice(c)) return fixedConcessions(c);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    rejected.push("concessions: chybí, platí náhradní pravidlo");
    return fallbackConcessions(c, profile);
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.mode !== "string" || !(c.modeOptions as readonly string[]).includes(r.mode)) {
    rejected.push(`concessions.mode: neplatná hodnota ${String(r.mode)}, platí náhradní pravidlo`);
    return fallbackConcessions(c, profile);
  }
  const mode = r.mode as ConcessionMode;
  if (mode === "external") return { mode, products: [], decidedBy: "model" };

  const given = r.products && typeof r.products === "object" && !Array.isArray(r.products) ? r.products as Record<string, unknown> : {};
  for (const k of Object.keys(given)) {
    if (!c.products.some((p) => p.key === k)) rejected.push(`concessions.products: neznámý produkt ${k}`);
  }
  const products = c.products.map((p) => {
    const check = checkProductChoice(given[p.key], p);
    if (check.ok) return check.choice;
    rejected.push(`concessions.${p.key}: ${check.reason}, platí náhradní pravidlo`);
    return fallbackProductChoice(p, profile);
  });
  return { mode, products, decidedBy: "model" };
}

// ── Plán akcí ──────────────────────────────────────────────────────────────

/** Provoz, kvalita a cena: nic nestojí, jdou před nákupem (nákup jde do zvolené kvality). */
export function concessionSettingActions(c: ConcessionContext, d: ConcessionDecision): ConcessionAction[] {
  const out: ConcessionAction[] = [];
  if (d.mode !== c.mode && c.modeOptions.includes(d.mode)) out.push({ kind: "concession_mode", mode: d.mode, from: c.mode });
  if (d.mode !== "self") return out;
  for (const choice of d.products) {
    const p = c.products.find((x) => x.key === choice.key);
    if (!p || !p.tiers.some((t) => t.level === choice.tier)) continue;
    if (choice.tier !== p.currentLevel || choice.price !== p.currentPrice) {
      out.push({ kind: "concession_product", key: choice.key, tier: choice.tier, price: choice.price, fromTier: p.currentLevel, fromPrice: p.currentPrice });
    }
  }
  return out;
}

/** Nákupy do skladu, nejdřív produkty s největším očekávaným ziskem (když peníze nevystačí na všechno). */
export function concessionPurchases(c: ConcessionContext, d: ConcessionDecision): ConcessionPurchase[] {
  if (d.mode !== "self") return [];
  const out: Array<ConcessionPurchase & { profit: number }> = [];
  for (const choice of d.products) {
    const tier = tierOf(c, choice.key, choice.tier);
    if (!tier || choice.buy <= 0) continue;
    const sold = Math.min(salesFor(c, choice.key, choice.tier, choice.price), tier.stock + choice.buy);
    out.push({ key: choice.key, tier: choice.tier, quantity: Math.min(choice.buy, tier.maxBuy), unitCost: tier.wholesale, profit: sold * (choice.price - tier.wholesale) });
  }
  return out
    .sort((a, b) => b.profit - a.profit)
    .map((p) => ({ key: p.key, tier: p.tier, quantity: p.quantity, unitCost: p.unitCost }));
}

/** Plán pro dorovnání skladu před domácím zápasem: kvalita, cena a pokrytí, které trenér zvolil. */
export function concessionTopUpPlan(c: ConcessionContext, d: ConcessionDecision, profile: Pick<AiCoachProfile, "thrift">, reserve: number): ConcessionTopUpPlan {
  const products = d.mode !== "self" ? [] : d.products.flatMap((choice) => {
    const tier = tierOf(c, choice.key, choice.tier);
    if (!tier) return [];
    const expected = salesFor(c, choice.key, choice.tier, choice.price);
    const cover = expected > 0 ? Math.min(MAX_TOPUP_COVER, (tier.stock + choice.buy) / expected) : fallbackCover(profile);
    return [{ key: choice.key, tier: choice.tier, price: choice.price, cover: Math.round(cover * 100) / 100 }];
  });
  return { decidedBy: d.decidedBy, mode: d.mode, reserve, products };
}

export interface TopUpPurchase extends ConcessionPurchase {
  cost: number;
  /** Na kolik kusů se dorovnává. */
  target: number;
  stock: number;
}

/**
 * Dorovnání skladu před dnešním domácím zápasem podle pondělního plánu: zvolená kvalita
 * na stejné pokrytí očekávaného prodeje. Meze jako v pondělí (silnější návštěva, nejnižší
 * cena) a jen z peněz nad rezervou. `c` je kontext s dnešními zápasy.
 */
export function planConcessionTopUp(c: ConcessionContext, plan: ConcessionTopUpPlan, budget: number): { purchases: TopUpPurchase[]; skipped: Array<{ item: string; reason: string }> } {
  const purchases: TopUpPurchase[] = [];
  const skipped: Array<{ item: string; reason: string }> = [];
  if (plan.mode !== "self" || c.mode !== "self") return { purchases, skipped };
  let left = Math.max(0, budget - plan.reserve);
  for (const pp of plan.products) {
    if (pp.cover < MIN_TOPUP_COVER) continue;
    const product = c.products.find((p) => p.key === pp.key);
    const tier = product?.tiers.find((t) => t.level === pp.tier);
    if (!product || !tier) continue;
    if (product.currentLevel !== pp.tier) { skipped.push({ item: pp.key, reason: `prodává se jiná kvalita (L${product.currentLevel})` }); continue; }
    if (product.currentPrice < tier.minPrice || product.currentPrice > tier.maxPrice) {
      skipped.push({ item: pp.key, reason: `cena ${product.currentPrice} Kč mimo meze` });
      continue;
    }
    const target = Math.ceil(salesFor(c, pp.key, pp.tier, product.currentPrice) * Math.min(MAX_TOPUP_COVER, pp.cover));
    const need = target - tier.stock;
    if (need < MIN_TOPUP_UNITS) continue;
    const quantity = Math.min(need, tier.maxBuy, Math.floor(left / tier.wholesale));
    if (quantity < need) skipped.push({ item: pp.key, reason: `meze nebo rezerva (koupí ${Math.max(0, quantity)} z ${need} ks)` });
    if (quantity <= 0) continue;
    const cost = quantity * tier.wholesale;
    left -= cost;
    purchases.push({ key: pp.key, tier: pp.tier, quantity, unitCost: tier.wholesale, cost, target, stock: tier.stock });
  }
  return { purchases, skipped };
}

// ── Prompt a schéma ────────────────────────────────────────────────────────

function czk(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} CZK`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fixtureText(f: ConcessionFixture): string {
  const weekday = WEEKDAYS[new Date(`${f.day}T12:00:00Z`).getUTCDay()] ?? f.day;
  const weather = `${f.weather}${f.temperature !== null ? ` ${f.temperature} °C` : ""}`;
  return `${f.kind} on ${weekday} (about ${f.attendance} spectators, ${weather})`;
}

/** Část promptu pondělní správy o bufetu. */
export function renderConcessionPrompt(c: ConcessionContext): string[] {
  const external = `an outside operator runs the stand and pays you ${czk(c.externalWeeklyIncome)} a week`;
  if (!hasConcessionChoice(c)) {
    return [c.mode === "self"
      ? "REFRESHMENTS: you run the stand yourself, nothing to decide this week."
      : `REFRESHMENTS: ${external}. Own sales need a refreshment stand (stadium upgrade "refreshments").`];
  }
  const L: string[] = [];
  L.push(`REFRESHMENTS now: ${c.mode === "self" ? "own sales" : "external operator"}. Options (concessions.mode): external = ${external}, nothing else to do; self = you run the stand (refreshments level ${c.refreshmentsLevel}): buy stock, set a price per product and earn the margin at every home match.`);
  L.push(`Home matches until next Monday: ${c.fixtures.length ? c.fixtures.map(fixtureText).join("; ") : "none, stock bought now sells only later"}. Fan satisfaction ${c.satisfaction}/100 (happier fans buy more).`);
  L.push("Own sales rules: spectators buy less the more you price above the recommended price and nobody buys above the allowed range. Only the selected tier is sold; other tiers keep their stock, stock never spoils. A product that runs out during a match costs 2 fan satisfaction. A tier 1 product priced above 2x its purchase price costs 2 satisfaction; a tier 2 or 3 product priced at most 1.8x its purchase price pleases fans (+1, at most +3 together with other comforts).");
  L.push(`Stock is paid from the money above your reserve (${czk(c.spendable)} this week, after repairs and pitch). buy = units of the selected tier to buy now (0 = none, e.g. mulled wine in summer). Before each home match the game tops the selected tier up to the same cover (stock against expected sales) you choose now.`);
  L.push("Products (tier: name, purchase/recommended price CZK, allowed price, in stock, expected sales until next Monday at the recommended price, max buy):");
  for (const p of c.products) {
    L.push(`${p.key} (${p.label}), now ${p.currentLevel > 0 ? `tier ${p.currentLevel} at ${p.currentPrice} CZK` : "not offered"}:`);
    for (const t of p.tiers) {
      L.push(`  ${t.level} ${t.label}: ${t.wholesale}/${t.defaultPrice}, price ${t.minPrice}-${t.maxPrice}, stock ${t.stock}, sells ~${t.expectedSales}, max buy ${t.maxBuy}`);
    }
  }
  return L;
}

/** Schéma bloku `concessions`, nebo null, když není co rozhodnout. Výčty nikdy prázdné. */
export function concessionSchema(c: ConcessionContext): Record<string, unknown> | null {
  if (!hasConcessionChoice(c)) return null;
  const products: Record<string, unknown> = {};
  for (const p of c.products) {
    // Kvalita jako rozsah celých čísel (jako počet tréninků): úrovně jdou po sobě 1 až 3.
    products[p.key] = {
      type: "object",
      additionalProperties: false,
      properties: {
        tier: { type: "integer", minimum: Math.min(...p.tiers.map((t) => t.level)), maximum: Math.max(...p.tiers.map((t) => t.level)) },
        price: { type: "integer", minimum: Math.min(...p.tiers.map((t) => t.minPrice)), maximum: Math.max(...p.tiers.map((t) => t.maxPrice)) },
        buy: { type: "integer", minimum: 0, maximum: Math.max(0, ...p.tiers.map((t) => t.maxBuy)) },
      },
      required: ["tier", "price", "buy"],
    };
  }
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      mode: { type: "string", enum: [...c.modeOptions] },
      products: { type: "object", additionalProperties: false, properties: products, required: c.products.map((p) => p.key) },
    },
    required: ["mode", "products"],
  };
}
