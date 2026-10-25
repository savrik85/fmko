/**
 * Týdenní správa AI klubu: čisté funkce bez databáze (rozhodnutí, kontrola, plán akcí).
 *
 * Model nebo náhradní pravidlo vybírá z nabídky (trénink, vstupné, trávník, stavby,
 * vybavení, zaměstnanci, akademie, bannery, přesuny s U21, občerstvení). Kód hlídá rozpočet:
 * placené akce se berou jen do výše peněz nad rezervou, kterou si trenér drží podle šetrnosti.
 *
 * Přestupní kurz na týden (kupovat / držet / prodávat, posty k posílení, koho nabídnout)
 * volí taky model, ale nic se podle něj hned neprovede: řídí se jím denní práce na trhu
 * (`transfer-market.ts`). Ceny dál počítá jen kód (spec 3.7).
 *
 * Bufet (provoz, kvalita, cena a sklad u každého produktu) má vlastní meze a kontrolu
 * v `concession-decision.ts`; sklad se platí z peněz nad rezervou spolu s ostatními nákupy.
 */

import {
  concessionPurchases, concessionSchema, concessionSettingActions, concessionTopUpPlan, fallbackConcessions,
  fixedConcessions, hasConcessionChoice, renderConcessionPrompt, validateConcessions,
  type ConcessionAction, type ConcessionContext, type ConcessionDecision, type ConcessionTopUpPlan,
} from "./concession-decision";
import type { AiCoachProfile } from "./profile";

export const TRAINING_FOCUS = ["conditioning", "technique", "tactics", "match_practice", "mixed"] as const;
export type TrainingFocus = typeof TRAINING_FOCUS[number];
export const TRAINING_INTENSITY = ["light", "normal", "hard"] as const;
export type TrainingIntensityChoice = typeof TRAINING_INTENSITY[number];
export const TRAINING_APPROACH = ["strict", "balanced", "relaxed"] as const;
export type TrainingApproachChoice = typeof TRAINING_APPROACH[number];
export const TICKET_CHOICES = ["keep", "lower", "raise"] as const;
export type TicketChoice = typeof TICKET_CHOICES[number];
export const PITCH_MAINTENANCE_CHOICES = ["none", "basic", "thorough", "renovation"] as const;
export type PitchMaintenanceChoice = typeof PITCH_MAINTENANCE_CHOICES[number];
export const PITCH_CARE_CHOICES = ["keep", "auto", "manual", "off"] as const;
export type PitchCareChoice = typeof PITCH_CARE_CHOICES[number];
export const ACADEMY_CHOICES = ["keep", "none", "minimal", "medium", "high"] as const;
export type AcademyChoice = typeof ACADEMY_CHOICES[number];
export const TRANSFER_STANCES = ["buy", "hold", "sell"] as const;
export type TransferStance = typeof TRANSFER_STANCES[number];
export const TRANSFER_POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
export type TransferPosition = typeof TRANSFER_POSITIONS[number];
const MAX_TRANSFER_FOCUS = 2;
const MAX_TRANSFER_SELL = 3;
/** Od jaké potřeby postu kupuje náhradní pravidlo (stejně jako trh bez kurzu). */
const FALLBACK_BUY_NEED = 0.3;

export const PITCH_MAINTENANCE_COST: Record<Exclude<PitchMaintenanceChoice, "none">, { cost: number; improvement: number }> = {
  basic: { cost: 1600, improvement: 10 },
  thorough: { cost: 3000, improvement: 25 },
  renovation: { cost: 5000, improvement: 50 },
};

/** Měsíční náklad akademie (season/youth.ts). */
export const ACADEMY_MONTHLY_COST: Record<Exclude<AcademyChoice, "keep">, number> = { none: 0, minimal: 1500, medium: 5000, high: 12000 };

export interface PricedOption {
  key: string;
  /** Klíč pro službu (zařízení, kategorie vybavení, id kandidáta, název sponzora…). */
  ref: string;
  label: string;
  cost: number;
  detail: string;
}

export interface RepairChoice extends PricedOption {
  condition: number;
}

export interface StaffCandidateOption extends PricedOption {
  role: string;
  weeklyWage: number;
}

export interface BannerOption extends PricedOption {
  monthly: number;
  seasons: number;
  sponsorType: string;
}

export interface U21MoveOption {
  key: string;
  playerId: string;
  label: string;
}

export interface TransferNeedInfo {
  position: TransferPosition;
  /** 0–1 jako `PositionNeed.need` (squad.ts). */
  need: number;
  missing: number;
  startersAverage: number;
}

/** Přebytečný hráč, kterého jde dát na přestupovou listinu. */
export interface SurplusOption {
  key: string;
  playerId: string;
  label: string;
}

export interface TransferPlan {
  stance: TransferStance;
  focus: TransferPosition[];
  /** Id hráčů z `sell` (klíče přeložené přes kontext), trh je vystaví přednostně. */
  sellIds: string[];
}

export interface WeeklyContext {
  teamId: string;
  teamName: string;
  gameDay: string;
  budget: number;
  reputation: number;
  profile: AiCoachProfile;
  finance: { weeklyRunningCost: number; weeklyIncome: number; reserveWeeks: number; reserve: number; spendable: number };
  league: { position: number | null; teams: number | null; points: number | null; played: number };
  training: {
    type: string; approach: string; sessions: number;
    /** Hrací dny ligy (getDay, 0 = neděle). */
    matchWeekdays: number[];
    avgCondition: number;
    injured: number;
    squadSize: number;
    youngPlayers: number;
  };
  fans: { satisfaction: number; ticketPrice: number; villageBasePrice: number; daysSinceTicketChange: number | null };
  pitch: { condition: number; type: string; careMode: string; hasCareEquipment: boolean; hasMower: boolean };
  stadium: PricedOption[];
  equipmentUpgrades: PricedOption[];
  equipmentRepairs: RepairChoice[];
  staff: { hiredRoles: string[]; candidates: StaffCandidateOption[] };
  academy: { current: string; weeklyCostNow: number };
  banners: { active: number; max: number; offers: BannerOption[] };
  u21: { exists: boolean; aTeamSize: number; promote: U21MoveOption[]; sendDown: U21MoveOption[] };
  transfers: { squadSize: number; targetSize: number; needs: TransferNeedInfo[]; surplus: SurplusOption[] };
  /** Bufet: provoz, produkty, kvality a meze cen i nákupu (concession-decision.ts). */
  concessions: ConcessionContext;
}

export interface WeeklyDecision {
  training: { focus: TrainingFocus; intensity: TrainingIntensityChoice; sessions: number; approach: TrainingApproachChoice };
  ticketPrice: TicketChoice;
  pitchMaintenance: PitchMaintenanceChoice;
  pitchCareMode: PitchCareChoice;
  stadium: string[];
  equipmentUpgrades: string[];
  equipmentRepairs: string[];
  hire: string[];
  academy: AcademyChoice;
  banners: string[];
  promote: string[];
  sendDown: string[];
  transfers: { stance: TransferStance; focus: TransferPosition[]; sell: string[] };
  concessions: ConcessionDecision;
  reasoning: string;
}

export type WeeklyAction =
  | ConcessionAction
  | { kind: "training"; focus: TrainingFocus; intensity: TrainingIntensityChoice; sessions: number; approach: TrainingApproachChoice }
  | { kind: "ticket_price"; price: number; from: number }
  | { kind: "pitch_care_mode"; mode: Exclude<PitchCareChoice, "keep"> }
  | { kind: "academy"; level: Exclude<AcademyChoice, "keep"> }
  | { kind: "banner"; key: string; sponsorName: string; sponsorType: string; monthly: number; seasons: number }
  | { kind: "promote"; key: string; playerId: string }
  | { kind: "send_down"; key: string; playerId: string }
  | { kind: "equipment_repair"; key: string; category: string; cost: number }
  | { kind: "pitch_maintenance"; level: Exclude<PitchMaintenanceChoice, "none">; cost: number }
  | { kind: "hire"; key: string; staffId: string; role: string; cost: number; weeklyWage: number }
  | { kind: "equipment_upgrade"; key: string; category: string; cost: number }
  | { kind: "stadium_upgrade"; key: string; facility: string; cost: number };

export interface WeeklyPlan {
  actions: WeeklyAction[];
  skipped: Array<{ item: string; reason: string }>;
  /** Kolik stojí placené akce dohromady (musí být ≤ spendable). */
  totalCost: number;
  /** Přestupní kurz pro trh na tento týden. */
  transfers: TransferPlan;
  /** Bufet na týden: podle něj se sklad dorovná před domácím zápasem (concessions.ts). */
  concessions: ConcessionTopUpPlan;
}

const MAX_STADIUM = 2;
const MAX_EQUIPMENT = 3;
const MAX_HIRES = 1;
const MAX_U21_MOVES = 2;
/** Minimální rezerva, i kdyby provoz nic nestál. */
export const MIN_RESERVE = 15_000;

/** Kolik týdnů provozu si trenér drží v rezervě: 3 (rozhazovačný) až 12 (šetrný). */
export function reserveWeeksFor(profile: AiCoachProfile): number {
  return Math.round((3 + (profile.thrift / 100) * 9 - (profile.ambition - 50) / 50) * 10) / 10;
}

export function computeReserve(profile: AiCoachProfile, weeklyRunningCost: number): number {
  return Math.max(MIN_RESERVE, Math.round(reserveWeeksFor(profile) * weeklyRunningCost));
}

/**
 * Kolik z peněz nad rezervou smí jít tento týden na stavby a nové vybavení: podle chuti
 * stavět (15 % u „nestavitele", 100 % u stavitele). Opravy, trávník a nábor jdou mimo.
 * Díky tomu se kluby rozcházejí podle povahy, ať rozhoduje kterýkoli model.
 */
export function investBudgetFor(profile: AiCoachProfile, spendable: number): number {
  return Math.round(Math.max(0, spendable) * (0.15 + 0.85 * profile.building / 100));
}

/** Nová cena vstupného po zdražení nebo zlevnění o desetinu (na pětikoruny, v mezích obce). */
export function nextTicketPrice(current: number, villageBase: number, choice: TicketChoice): number {
  if (choice === "keep") return current;
  const raw = choice === "raise" ? current * 1.1 : current * 0.9;
  const rounded = Math.round(raw / 5) * 5;
  const lo = Math.max(10, Math.round(villageBase * 0.6));
  const hi = Math.min(500, Math.round(villageBase * 2.2));
  const bounded = Math.max(lo, Math.min(hi, rounded));
  if (bounded === current) return choice === "raise" ? Math.min(hi, current + 5) : Math.max(lo, current - 5);
  return bounded;
}

// ── Náhradní pravidlo podle povahy ──────────────────────────────────────────

const STAFF_PRIORITY = ["asistent", "maser", "spravce_hriste", "lekar", "kondicni_trener", "trener_mladeze", "trener_brankaru", "psycholog", "obsluha", "sef_fanklubu", "ekonom", "skaut"];
const EQUIPMENT_PRIORITY = [
  "balls", "first_aid", "mower", "jerseys", "training_cones", "goalkeeper_gear", "water_bottles", "boots_stock", "bibs",
  "tactics_board", "laundry", "gym_corner", "sports_drinks", "winter_gear", "training_wall", "nutrition", "team_van",
  "video_setup", "club_grill", "coffee_maker", "pa_system", "fan_drums", "raffle", "trophy_case", "area_security",
  "pitch_irrigation", "pitch_heating",
];
const STADIUM_PRIORITY = [
  "changing_rooms", "showers", "toilets", "refreshments", "stand_main", "stands", "fence", "parking", "entrance_gate",
  "stand_opposite", "lighting", "security", "roof", "stand_goal_west", "stand_goal_east", "ultras_stand", "cage", "vip_box",
  "stand_ext_capacity",
];

function rank(list: readonly string[], ref: string): number {
  const i = list.indexOf(ref);
  return i < 0 ? list.length : i;
}

export function fallbackWeeklyDecision(ctx: WeeklyContext): WeeklyDecision {
  const p = ctx.profile;
  const focus: TrainingFocus = p.youthFocus >= 65 ? "technique"
    : ctx.training.avgCondition < 70 ? "conditioning"
      : p.favouriteTactic === "possession" ? "technique"
        : p.favouriteTactic === "pressing" ? "conditioning"
          : "mixed";
  const sessions = Math.max(2, Math.min(5, Math.round(2 + p.ambition / 40 + (ctx.finance.spendable > 50_000 ? 0.5 : 0) - (p.thrift > 75 ? 0.5 : 0))));
  const intensity: TrainingIntensityChoice = ctx.training.avgCondition < 65 ? "light" : p.ambition >= 75 && p.risk >= 50 ? "hard" : "normal";
  const approach: TrainingApproachChoice = p.patience < 35 ? "strict" : p.patience > 70 ? "relaxed" : "balanced";

  let ticketPrice: TicketChoice = "keep";
  const recent = ctx.fans.daysSinceTicketChange !== null && ctx.fans.daysSinceTicketChange < 21;
  if (!recent) {
    if (ctx.fans.satisfaction >= 72 && ctx.fans.ticketPrice < ctx.fans.villageBasePrice * 1.5 && (p.thrift >= 55 || p.ambition >= 60)) ticketPrice = "raise";
    else if (ctx.fans.satisfaction < 35 && ctx.fans.ticketPrice > ctx.fans.villageBasePrice * 0.7) ticketPrice = "lower";
  }

  const c = ctx.pitch.condition;
  const pitchMaintenance: PitchMaintenanceChoice = c < 25 ? "renovation" : c < 45 ? "thorough" : c < 65 && !ctx.pitch.hasMower ? "basic" : c < 55 ? "basic" : "none";
  const pitchCareMode: PitchCareChoice = ctx.pitch.hasCareEquipment && ctx.pitch.careMode !== "auto" && p.thrift < 75 ? "auto" : "keep";

  const equipmentRepairs = ctx.equipmentRepairs.filter((r) => r.condition < 60).map((r) => r.key);

  // Stavění podle chuti stavět: kolikanásobek ceny musí zbýt nad rezervou.
  const buildMultiplier = 1 + (100 - p.building) / 40;
  const spend = ctx.finance.spendable;
  const equipmentUpgrades = ctx.equipmentUpgrades
    .slice()
    .sort((a, b) => rank(EQUIPMENT_PRIORITY, a.ref) - rank(EQUIPMENT_PRIORITY, b.ref) || a.cost - b.cost)
    .filter((o) => o.cost * buildMultiplier <= spend)
    .slice(0, p.building >= 70 ? 2 : 1)
    .map((o) => o.key);
  const stadium = p.building >= 30
    ? ctx.stadium
      .slice()
      .sort((a, b) => rank(STADIUM_PRIORITY, a.ref) - rank(STADIUM_PRIORITY, b.ref) || a.cost - b.cost)
      .filter((o) => o.cost * buildMultiplier * 1.5 <= spend)
      .slice(0, 1)
      .map((o) => o.key)
    : [];

  const hire = ctx.staff.candidates
    .filter((cand) => !ctx.staff.hiredRoles.includes(cand.role))
    .filter((cand) => cand.cost + cand.weeklyWage * 6 <= spend && cand.weeklyWage <= Math.max(600, ctx.finance.weeklyIncome * 0.15))
    .sort((a, b) => rank(STAFF_PRIORITY, a.role) - rank(STAFF_PRIORITY, b.role) || a.weeklyWage - b.weeklyWage)
    .slice(0, 1)
    .map((cand) => cand.key);

  const academyTarget: Exclude<AcademyChoice, "keep"> = p.youthFocus >= 75 ? "medium" : p.youthFocus >= 45 ? "minimal" : "none";
  const affordable = ACADEMY_MONTHLY_COST[academyTarget] / 4.3 <= Math.max(0, ctx.finance.weeklyIncome - ctx.finance.weeklyRunningCost) + spend / 30;
  const academy: AcademyChoice = academyTarget === ctx.academy.current ? "keep" : affordable ? academyTarget : "keep";

  const freeSlots = Math.max(0, ctx.banners.max - ctx.banners.active);
  const banners = ctx.banners.offers.slice(0, freeSlots).map((b) => b.key);

  const promote = ctx.u21.promote.slice(0, p.youthFocus >= 60 ? 2 : 1).map((u) => u.key);
  const sendDown = ctx.u21.sendDown.slice(0, 1).map((u) => u.key);

  return {
    training: { focus, intensity, sessions, approach },
    ticketPrice, pitchMaintenance, pitchCareMode, stadium, equipmentUpgrades, equipmentRepairs, hire, academy, banners,
    promote, sendDown, transfers: fallbackTransfers(ctx), concessions: fallbackConcessions(ctx.concessions, p),
    reasoning: "fallback rule",
  };
}

/**
 * Přestupní kurz bez modelu, stejně jako se trh choval bez kurzu: kupuje, kde je potřeba
 * aspoň 0,3 a jsou peníze, přeplněný kádr obchodník pročišťuje, jinak drží.
 */
export function fallbackTransfers(ctx: WeeklyContext): WeeklyDecision["transfers"] {
  const t = ctx.transfers;
  const urgent = t.needs.filter((n) => n.need >= FALLBACK_BUY_NEED);
  const stance: TransferStance = urgent.length > 0 && ctx.finance.spendable > 0 ? "buy"
    : t.squadSize > t.targetSize && ctx.profile.trading >= 40 ? "sell"
      : "hold";
  return { stance, focus: urgent.slice(0, MAX_TRANSFER_FOCUS).map((n) => n.position), sell: [] };
}

/** Přestupní blok je samostatný: chybný nebo chybějící nahradí náhradní kurz, zbytek týdne platí. */
function validateTransfers(raw: unknown, ctx: WeeklyContext, rejected: string[]): WeeklyDecision["transfers"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    rejected.push("transfers: chybí, platí náhradní kurz");
    return fallbackTransfers(ctx);
  }
  const r = raw as Record<string, unknown>;
  const stance = pick(r.stance, TRANSFER_STANCES, "transfers.stance");
  if (typeof stance === "object") {
    rejected.push(`${stance.error}, platí náhradní kurz`);
    return fallbackTransfers(ctx);
  }
  const focus = keys(r.focus, "transfers.focus", new Set(TRANSFER_POSITIONS), MAX_TRANSFER_FOCUS, rejected);
  const sell = keys(r.sell, "transfers.sell", new Set(ctx.transfers.surplus.map((o) => o.key)), MAX_TRANSFER_SELL, rejected);
  return {
    stance,
    focus: Array.isArray(focus) ? focus as TransferPosition[] : [],
    sell: Array.isArray(sell) ? sell : [],
  };
}

// ── Kontrola rozhodnutí modelu ─────────────────────────────────────────────

export type WeeklyCheck =
  | { ok: true; decision: WeeklyDecision; rejected: string[] }
  | { ok: false; reason: string };

function pick<T extends string>(raw: unknown, allowed: readonly T[], field: string): T | { error: string } {
  if (typeof raw === "string" && (allowed as readonly string[]).includes(raw)) return raw as T;
  return { error: `${field}: neplatná hodnota ${String(raw)}` };
}

function keys(raw: unknown, field: string, valid: ReadonlySet<string>, max: number, rejected: string[]): string[] | { error: string } {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return { error: `${field} není seznam` };
  const out: string[] = [];
  for (const k of raw) {
    if (typeof k !== "string") return { error: `${field} obsahuje neplatnou hodnotu` };
    // Položky týdne jsou nezávislé: volba mimo nabídku (třeba klíč z jiného seznamu) se jen
    // zahodí, provést jde stejně jen to, co v nabídce je. Zbytek rozhodnutí platí.
    if (!valid.has(k)) {
      rejected.push(`${field}: neznámá volba ${k}`);
      continue;
    }
    if (!out.includes(k)) out.push(k);
  }
  if (out.length > max) {
    rejected.push(`${field}: zkráceno na ${max}`);
    return out.slice(0, max);
  }
  return out;
}

/**
 * Zkontroluje odpověď modelu: neznámá volba nebo položka mimo nabídku shodí celé rozhodnutí
 * (rozhodne náhradní pravidlo). Rozpočet hlídá až `planWeeklyActions`.
 */
export function validateWeeklyDecision(raw: unknown, ctx: WeeklyContext): WeeklyCheck {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "odpověď není objekt" };
  const r = raw as Record<string, unknown>;
  const t = (r.training && typeof r.training === "object" ? r.training : {}) as Record<string, unknown>;
  const focus = pick(t.focus, TRAINING_FOCUS, "training.focus");
  if (typeof focus === "object") return { ok: false, reason: focus.error };
  const intensity = pick(t.intensity, TRAINING_INTENSITY, "training.intensity");
  if (typeof intensity === "object") return { ok: false, reason: intensity.error };
  const approach = pick(t.approach, TRAINING_APPROACH, "training.approach");
  if (typeof approach === "object") return { ok: false, reason: approach.error };
  const rawSessions = Number(t.sessions);
  if (!Number.isFinite(rawSessions)) return { ok: false, reason: `training.sessions: ${String(t.sessions)}` };
  const ticketPrice = pick(r.ticketPrice, TICKET_CHOICES, "ticketPrice");
  if (typeof ticketPrice === "object") return { ok: false, reason: ticketPrice.error };
  const pitchMaintenance = pick(r.pitchMaintenance, PITCH_MAINTENANCE_CHOICES, "pitchMaintenance");
  if (typeof pitchMaintenance === "object") return { ok: false, reason: pitchMaintenance.error };
  const pitchCareMode = pick(r.pitchCareMode, PITCH_CARE_CHOICES, "pitchCareMode");
  if (typeof pitchCareMode === "object") return { ok: false, reason: pitchCareMode.error };
  const academy = pick(r.academy, ACADEMY_CHOICES, "academy");
  if (typeof academy === "object") return { ok: false, reason: academy.error };

  const rejected: string[] = [];
  // Počet tréninků mimo 1–5 (model chtěl volný týden nebo trénink denně) se srovná do mezí.
  const sessions = Math.max(1, Math.min(5, Math.round(rawSessions)));
  if (sessions !== rawSessions) rejected.push(`training.sessions ${rawSessions} upraveno na ${sessions}`);
  const sets = {
    stadium: keys(r.stadium, "stadium", new Set(ctx.stadium.map((o) => o.key)), MAX_STADIUM, rejected),
    equipmentUpgrades: keys(r.equipmentUpgrades, "equipmentUpgrades", new Set(ctx.equipmentUpgrades.map((o) => o.key)), MAX_EQUIPMENT, rejected),
    equipmentRepairs: keys(r.equipmentRepairs, "equipmentRepairs", new Set(ctx.equipmentRepairs.map((o) => o.key)), 10, rejected),
    hire: keys(r.hire, "hire", new Set(ctx.staff.candidates.map((o) => o.key)), MAX_HIRES, rejected),
    banners: keys(r.banners, "banners", new Set(ctx.banners.offers.map((o) => o.key)), ctx.banners.max, rejected),
    promote: keys(r.promote, "promote", new Set(ctx.u21.promote.map((o) => o.key)), MAX_U21_MOVES, rejected),
    sendDown: keys(r.sendDown, "sendDown", new Set(ctx.u21.sendDown.map((o) => o.key)), MAX_U21_MOVES, rejected),
  };
  for (const v of Object.values(sets)) if (!Array.isArray(v)) return { ok: false, reason: v.error };

  return {
    ok: true,
    rejected,
    decision: {
      training: { focus, intensity, sessions, approach },
      ticketPrice, pitchMaintenance, pitchCareMode, academy,
      stadium: sets.stadium as string[],
      equipmentUpgrades: sets.equipmentUpgrades as string[],
      equipmentRepairs: sets.equipmentRepairs as string[],
      hire: sets.hire as string[],
      banners: sets.banners as string[],
      promote: sets.promote as string[],
      sendDown: sets.sendDown as string[],
      transfers: validateTransfers(r.transfers, ctx, rejected),
      concessions: validateConcessions(r.concessions, ctx.concessions, ctx.profile, rejected),
      reasoning: typeof r.reasoning === "string" ? r.reasoning.slice(0, 600) : "",
    },
  };
}

/**
 * Z rozhodnutí udělá seznam akcí. Placené akce jdou v pořadí opravy → trávník → sklad bufetu →
 * nábor → vybavení → stavby a berou se jen do výše `spendable` (peníze nad rezervou).
 */
export function planWeeklyActions(ctx: WeeklyContext, d: WeeklyDecision): WeeklyPlan {
  const actions: WeeklyAction[] = [];
  const skipped: WeeklyPlan["skipped"] = [];
  actions.push({ kind: "training", ...d.training });
  // Rozhodnutí z doby před bufetem (uložené plány, testy) ho nemá: bufet zůstane, jak je.
  const concessions = d.concessions ?? fixedConcessions(ctx.concessions);
  // Provoz, kvalita a cena nic nestojí a jdou před nákupem: sklad se kupuje do zvolené kvality.
  actions.push(...concessionSettingActions(ctx.concessions, concessions));

  if (d.ticketPrice !== "keep") {
    const price = nextTicketPrice(ctx.fans.ticketPrice, ctx.fans.villageBasePrice, d.ticketPrice);
    if (price !== ctx.fans.ticketPrice) actions.push({ kind: "ticket_price", price, from: ctx.fans.ticketPrice });
  }
  if (d.pitchCareMode !== "keep" && d.pitchCareMode !== ctx.pitch.careMode) actions.push({ kind: "pitch_care_mode", mode: d.pitchCareMode });
  if (d.academy !== "keep" && d.academy !== ctx.academy.current) actions.push({ kind: "academy", level: d.academy });

  const freeSlots = Math.max(0, ctx.banners.max - ctx.banners.active);
  for (const key of d.banners) {
    const o = ctx.banners.offers.find((b) => b.key === key);
    if (!o) continue;
    if (actions.filter((a) => a.kind === "banner").length >= freeSlots) { skipped.push({ item: key, reason: "plné bannery" }); continue; }
    actions.push({ kind: "banner", key, sponsorName: o.ref, sponsorType: o.sponsorType, monthly: o.monthly, seasons: o.seasons });
  }
  // Banner jen přináší peníze a nic nestojí: volná místa doplní nejlepší zbylé nabídky
  // (měření: model občas nechal místo prázdné bez důvodu).
  for (const o of ctx.banners.offers) {
    if (actions.filter((a) => a.kind === "banner").length >= freeSlots) break;
    if (actions.some((a) => a.kind === "banner" && a.key === o.key)) continue;
    actions.push({ kind: "banner", key: o.key, sponsorName: o.ref, sponsorType: o.sponsorType, monthly: o.monthly, seasons: o.seasons });
  }

  let squad = ctx.u21.aTeamSize;
  for (const key of d.promote) {
    const o = ctx.u21.promote.find((u) => u.key === key);
    if (!o) continue;
    if (squad >= 25) { skipped.push({ item: key, reason: "plný kádr áčka" }); continue; }
    actions.push({ kind: "promote", key, playerId: o.playerId });
    squad++;
  }
  for (const key of d.sendDown) {
    const o = ctx.u21.sendDown.find((u) => u.key === key);
    if (!o) continue;
    if (squad <= 16) { skipped.push({ item: key, reason: "áčko by mělo málo hráčů" }); continue; }
    actions.push({ kind: "send_down", key, playerId: o.playerId });
    squad--;
  }

  let left = ctx.finance.spendable;
  let total = 0;
  const pay = (item: string, cost: number): boolean => {
    if (cost > left) { skipped.push({ item, reason: `rezerva (chybí ${Math.round(cost - left)} Kč)` }); return false; }
    left -= cost;
    total += cost;
    return true;
  };
  for (const key of d.equipmentRepairs) {
    const o = ctx.equipmentRepairs.find((x) => x.key === key);
    if (o && pay(key, o.cost)) actions.push({ kind: "equipment_repair", key, category: o.ref, cost: o.cost });
  }
  if (d.pitchMaintenance !== "none") {
    const m = PITCH_MAINTENANCE_COST[d.pitchMaintenance];
    if (pay(`pitch:${d.pitchMaintenance}`, m.cost)) actions.push({ kind: "pitch_maintenance", level: d.pitchMaintenance, cost: m.cost });
  }
  // Sklad bufetu: co se vejde do peněz nad rezervou, přednostně produkty s největším ziskem.
  // Zboží se prodá do týdne, proto jde před nábor a stavby.
  for (const purchase of concessionPurchases(ctx.concessions, concessions)) {
    const item = `stock:${purchase.key}`;
    const quantity = Math.min(purchase.quantity, Math.floor(Math.max(0, left) / purchase.unitCost));
    if (quantity < purchase.quantity) skipped.push({ item, reason: `rezerva (koupí ${quantity} z ${purchase.quantity} ks)` });
    if (quantity <= 0) continue;
    const cost = quantity * purchase.unitCost;
    if (pay(item, cost)) actions.push({ kind: "concession_stock", key: purchase.key, tier: purchase.tier, quantity, unitCost: purchase.unitCost, cost });
  }
  for (const key of d.hire) {
    const o = ctx.staff.candidates.find((x) => x.key === key);
    if (!o) continue;
    if (ctx.staff.hiredRoles.includes(o.role)) { skipped.push({ item: key, reason: "role je obsazená" }); continue; }
    // Podpisné + mzda na šest týdnů musí zůstat nad rezervou.
    if (o.cost + o.weeklyWage * 6 > left) { skipped.push({ item: key, reason: "rezerva (podpisné a mzda)" }); continue; }
    if (pay(key, o.cost)) actions.push({ kind: "hire", key, staffId: o.ref, role: o.role, cost: o.cost, weeklyWage: o.weeklyWage });
  }
  // Stavby a nové vybavení jen do investičního rozpočtu podle chuti stavět.
  let invest = investBudgetFor(ctx.profile, ctx.finance.spendable);
  const investPay = (item: string, cost: number): boolean => {
    if (cost > invest) { skipped.push({ item, reason: `investiční rozpočet (zbývá ${Math.round(invest)} Kč)` }); return false; }
    if (!pay(item, cost)) return false;
    invest -= cost;
    return true;
  };
  for (const key of d.equipmentUpgrades) {
    const o = ctx.equipmentUpgrades.find((x) => x.key === key);
    if (o && investPay(key, o.cost)) actions.push({ kind: "equipment_upgrade", key, category: o.ref, cost: o.cost });
  }
  for (const key of d.stadium) {
    const o = ctx.stadium.find((x) => x.key === key);
    if (o && investPay(key, o.cost)) actions.push({ kind: "stadium_upgrade", key, facility: o.ref, cost: o.cost });
  }
  // Rozhodnutí z doby před přestupním kurzem (uložené plány, testy) ho nemá: platí náhradní.
  const course = d.transfers ?? fallbackTransfers(ctx);
  const surplusById = new Map(ctx.transfers.surplus.map((o) => [o.key, o.playerId]));
  const transfers: TransferPlan = {
    stance: course.stance,
    focus: course.focus,
    sellIds: course.sell.map((k) => surplusById.get(k)).filter((id): id is string => !!id),
  };
  return {
    actions, skipped, totalCost: total, transfers,
    concessions: concessionTopUpPlan(ctx.concessions, concessions, ctx.profile, ctx.finance.reserve),
  };
}

/**
 * Tréninkový plán týdne z volby trenéra: dny mimo zápas, den před zápasem lehce,
 * typy podle zaměření (smíšený = střídání), jinak jeden kondiční den pro údržbu.
 */
export function buildTrainingPlan(
  choice: { focus: TrainingFocus; intensity: TrainingIntensityChoice; sessions: number },
  matchWeekdays: number[],
): Record<string, { type: string; intensity: string }> {
  const matchDays = new Set(matchWeekdays);
  const dayBefore = new Set(matchWeekdays.map((d) => (d + 6) % 7));
  const candidates = [2, 3, 5, 1, 4, 6, 0].filter((d) => !matchDays.has(d));
  // Rozprostřít: nejdřív dny, které nejsou den před zápasem.
  const ordered = [...candidates.filter((d) => !dayBefore.has(d)), ...candidates.filter((d) => dayBefore.has(d))];
  const days = ordered.slice(0, Math.max(1, Math.min(choice.sessions, ordered.length))).sort((a, b) => a - b);
  const rotation = ["conditioning", "technique", "tactics", "match_practice"];
  const plan: Record<string, { type: string; intensity: string }> = {};
  days.forEach((day, i) => {
    let type: string;
    if (choice.focus === "mixed") type = rotation[i % rotation.length];
    else type = i === days.length - 1 && days.length >= 3 && choice.focus !== "conditioning" ? "conditioning" : choice.focus;
    const intensity = dayBefore.has(day) ? "light" : choice.intensity;
    plan[String(day)] = { type, intensity };
  });
  return plan;
}

// ── Prompt pro model ───────────────────────────────────────────────────────

export const WEEKLY_SYSTEM_PROMPT = [
  "You are the head coach and manager of an amateur Czech district football club in a football management game.",
  "Every Monday you run the club: training, ticket price, pitch, refreshment stand, stadium, equipment, staff, youth academy, sponsors, squad moves between the A-team and the U21 team and your transfer course for the week.",
  "Decide like a sensible real club manager with YOUR personality. Spend money only on things that help the club; never risk the club's finances.",
  "You only choose among the listed options (by their keys). The game checks every rule and the money reserve itself.",
  "Answer with exactly one JSON object and nothing else.",
].join(" ");

function czk(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} CZK`;
}

/** Povaha slovy, ať ji model bere jako styl, ne jako čísla. */
export function styleText(p: AiCoachProfile): string {
  const parts: string[] = [];
  if (p.thrift >= 70) parts.push("you hate spending money and buy only what clearly pays off");
  else if (p.thrift <= 30) parts.push("you are happy to spend when it helps the team");
  if (p.building >= 70) parts.push("you love improving the stadium and equipment");
  else if (p.building <= 30) parts.push("you spend on stadium and equipment only when something is broken or essential");
  if (p.ambition >= 70) parts.push("you want results now");
  else if (p.ambition <= 30) parts.push("you think long term and accept a modest season");
  if (p.youthFocus >= 70) parts.push("you believe in youth and the academy");
  else if (p.youthFocus <= 30) parts.push("you trust experienced players more than youngsters");
  if (p.trading >= 70) parts.push("you like doing transfer deals and keep the squad lean");
  else if (p.trading <= 30) parts.push("you rarely buy or sell players");
  return parts.length ? `${parts.join("; ")}.` : "a balanced, pragmatic manager.";
}

export function renderWeeklyPrompt(ctx: WeeklyContext): string {
  const p = ctx.profile;
  const f = ctx.finance;
  const L: string[] = [];
  L.push("YOUR PERSONALITY (0-100):");
  L.push(`ambition ${p.ambition}, thrift ${p.thrift}, building (stadium and equipment) ${p.building}, youth focus ${p.youthFocus}, risk ${p.risk}, patience ${p.patience}, trading ${p.trading}. Favourite tactic: ${p.favouriteTactic}.`);
  L.push("");
  L.push(`CLUB ${ctx.teamName}: ${ctx.league.position ? `table position ${ctx.league.position}/${ctx.league.teams}, ${ctx.league.points} pts after ${ctx.league.played} matches` : "season just started"}. Reputation ${ctx.reputation}/100.`);
  L.push(`MONEY: budget ${czk(ctx.budget)}. Weekly running costs about ${czk(f.weeklyRunningCost)}, weekly income about ${czk(f.weeklyIncome)}. You keep a reserve of ${f.reserveWeeks} weeks of running costs = ${czk(f.reserve)}. Money you may spend this week: ${czk(f.spendable)}, of which at most ${czk(investBudgetFor(p, f.spendable))} on stadium and new equipment (your building appetite).`);
  L.push(`YOUR STYLE: ${styleText(p)}`);
  L.push("");
  L.push(`TRAINING now: ${ctx.training.type}, ${ctx.training.sessions} sessions/week, approach ${ctx.training.approach}. Matches are played on weekdays ${ctx.training.matchWeekdays.join(",")} (0 = Sunday). Squad ${ctx.training.squadSize} players (${ctx.training.youngPlayers} aged 21 or less), average condition ${ctx.training.avgCondition}, injured ${ctx.training.injured}.`);
  L.push("Training focus: conditioning (stamina, speed, strength), technique (technique, shooting, creativity, set pieces), tactics (passing, defence, vision), match_practice (shooting, heading, goalkeeping), mixed (rotate all). Intensity: light (recovery), normal, hard (+45 % growth but tiring and more injuries). Each session costs a few hundred CZK. Approach: strict / balanced / relaxed (players' mood). Training is how players improve: 2 sessions a week roughly keep the level, 3 to 4 make the squad grow, ambitious clubs train 4 to 5 times.");
  L.push("");
  L.push(`FANS: satisfaction ${ctx.fans.satisfaction}/100. Ticket price ${ctx.fans.ticketPrice} CZK (village standard ${ctx.fans.villageBasePrice} CZK)${ctx.fans.daysSinceTicketChange !== null ? `, last changed ${ctx.fans.daysSinceTicketChange} days ago` : ""}. Options: keep / lower / raise (by about 10 %). Fans dislike price rises, especially when unhappy.`);
  L.push(`PITCH: condition ${ctx.pitch.condition}/100 (${ctx.pitch.type}), drops about 1 point a day without a mower${ctx.pitch.hasMower ? " (you have a mower)" : ""}. Maintenance now: none / basic (+10, 1,600 CZK) / thorough (+25, 3,000 CZK) / renovation (+50, 5,000 CZK). Pitch care mode (heating/irrigation on match days): ${ctx.pitch.careMode}${ctx.pitch.hasCareEquipment ? "" : " (you own no heating or irrigation)"}; options keep / auto / manual / off.`);
  L.push("");
  L.push(...renderConcessionPrompt(ctx.concessions));
  L.push("");
  L.push("STADIUM UPGRADES you can build now (key: facility level, cost, effect):");
  L.push(ctx.stadium.length ? ctx.stadium.map((o) => `${o.key}: ${o.label}, ${czk(o.cost)}, ${o.detail}`).join("\n") : "(none)");
  L.push("EQUIPMENT UPGRADES (key: item level, cost, effect):");
  L.push(ctx.equipmentUpgrades.length ? ctx.equipmentUpgrades.map((o) => `${o.key}: ${o.label}, ${czk(o.cost)}, ${o.detail}`).join("\n") : "(none)");
  L.push("EQUIPMENT REPAIRS (key: item, cost, state):");
  L.push(ctx.equipmentRepairs.length ? ctx.equipmentRepairs.map((o) => `${o.key}: ${o.label}, ${czk(o.cost)}, ${o.detail}`).join("\n") : "(none)");
  L.push("");
  L.push(`STAFF hired: ${ctx.staff.hiredRoles.length ? ctx.staff.hiredRoles.join(", ") : "nobody"}. Candidates (key: role, name, quality 1-20, weekly wage, signing fee):`);
  L.push(ctx.staff.candidates.length ? ctx.staff.candidates.map((o) => `${o.key}: ${o.role}, ${o.label}, ${o.detail}, wage ${czk(o.weeklyWage)}/week, signing ${czk(o.cost)}`).join("\n") : "(none)");
  L.push("Roles: asistent (faster player development), maser (better daily recovery), lekar (shorter injuries), kondicni_trener (less fatigue), spravce_hriste (pitch keeps condition), trener_mladeze (youth development), trener_brankaru (goalkeepers), psycholog (morale), obsluha (refreshment sales), sef_fanklubu (fans), ekonom (finances), skaut (scouting).");
  L.push("");
  L.push(`YOUTH ACADEMY now: ${ctx.academy.current}. Options keep / none / minimal (1,500 CZK a month) / medium (5,000) / high (12,000); more investment = more and better youth graduates at season end.`);
  L.push(`BANNER SPONSORS: ${ctx.banners.active}/${ctx.banners.max} used. Offers (key: company, monthly payment, seasons); banners only bring money, free slots are filled with the best offers you do not pick:`);
  L.push(ctx.banners.offers.length ? ctx.banners.offers.map((o) => `${o.key}: ${o.label}, ${czk(o.monthly)}/month, ${o.seasons} season(s)`).join("\n") : "(none)");
  L.push("");
  L.push(`U21: ${ctx.u21.exists ? `A-team has ${ctx.u21.aTeamSize} players.` : "the club has no U21 team."}`);
  if (ctx.u21.promote.length) L.push(`Promote from U21 to the A-team: ${ctx.u21.promote.map((o) => `${o.key} ${o.label}`).join("; ")}.`);
  if (ctx.u21.sendDown.length) L.push(`Send from the A-team down to U21 for playing time: ${ctx.u21.sendDown.map((o) => `${o.key} ${o.label}`).join("; ")}.`);
  L.push("");
  const t = ctx.transfers;
  L.push(`TRANSFERS: A-team squad ${t.squadSize} players (you want about ${t.targetSize}; on match days a few players are always missing).`);
  L.push(`Weak positions (need 0-1, starters' average rating): ${t.needs.length ? t.needs.map((n) => `${n.position} need ${n.need.toFixed(2)}, starters ${n.startersAverage}${n.missing > 0 ? `, ${n.missing} player(s) short` : ""}`).join("; ") : "none, every position is covered"}.`);
  L.push("Surplus players you could put on the transfer list (key: position, age, rating):");
  L.push(t.surplus.length ? t.surplus.map((o) => `${o.key}: ${o.label}`).join("\n") : "(none)");
  L.push("Transfer course for this week (your scouts then work on it every day; the game sets all prices and never overpays): buy = look for a player for your weak positions within the money above your reserve; hold = no purchases unless a starting position is empty; sell = put surplus players on the transfer list, no purchases unless a starting position is empty. focus = up to 2 positions to strengthen first. sell = up to 3 surplus keys to list first.");
  L.push("");
  const concessionKeys = hasConcessionChoice(ctx.concessions)
    ? `, concessions {mode ${ctx.concessions.modeOptions.join("/")}, products {${ctx.concessions.products.map((p) => p.key).join(", ")}: each {tier, price, buy}}}`
    : "";
  L.push(`DECIDE (JSON keys): training {focus, intensity, sessions 1-5, approach}, ticketPrice, pitchMaintenance, pitchCareMode, stadium (keys, max 2), equipmentUpgrades (keys, max 3), equipmentRepairs (keys), hire (candidate keys, max 1), academy, banners (offer keys), promote (keys, max 2), sendDown (keys, max 2), transfers {stance buy/hold/sell, focus (positions GK/DEF/MID/FWD, max 2), sell (surplus keys, max 3)}${concessionKeys}, reasoning (max 40 words).`);
  L.push("Paid items are executed in the order repairs, pitch, refreshment stock, hiring, equipment, stadium and stop when the money above the reserve runs out.");
  return L.join("\n");
}

export function weeklyDecisionSchema(ctx: WeeklyContext): Record<string, unknown> {
  // Prázdná nabídka = prázdný seznam (jinak by model mohl napsat klíč z jiného seznamu).
  const arr = (keys: string[]) => (keys.length
    ? { type: "array", items: { type: "string", enum: keys } }
    : { type: "array", items: { type: "string" }, maxItems: 0 });
  // Bufet jen tam, kde je co rozhodnout (vlastní provoz chce aspoň L1 občerstvení).
  const concessions = concessionSchema(ctx.concessions);
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      training: {
        type: "object",
        additionalProperties: false,
        properties: {
          focus: { type: "string", enum: [...TRAINING_FOCUS] },
          intensity: { type: "string", enum: [...TRAINING_INTENSITY] },
          sessions: { type: "integer", minimum: 1, maximum: 5 },
          approach: { type: "string", enum: [...TRAINING_APPROACH] },
        },
        required: ["focus", "intensity", "sessions", "approach"],
      },
      ticketPrice: { type: "string", enum: [...TICKET_CHOICES] },
      pitchMaintenance: { type: "string", enum: [...PITCH_MAINTENANCE_CHOICES] },
      pitchCareMode: { type: "string", enum: [...PITCH_CARE_CHOICES] },
      stadium: arr(ctx.stadium.map((o) => o.key)),
      equipmentUpgrades: arr(ctx.equipmentUpgrades.map((o) => o.key)),
      equipmentRepairs: arr(ctx.equipmentRepairs.map((o) => o.key)),
      hire: arr(ctx.staff.candidates.map((o) => o.key)),
      academy: { type: "string", enum: [...ACADEMY_CHOICES] },
      banners: arr(ctx.banners.offers.map((o) => o.key)),
      promote: arr(ctx.u21.promote.map((o) => o.key)),
      sendDown: arr(ctx.u21.sendDown.map((o) => o.key)),
      transfers: {
        type: "object",
        additionalProperties: false,
        properties: {
          stance: { type: "string", enum: [...TRANSFER_STANCES] },
          focus: { type: "array", items: { type: "string", enum: [...TRANSFER_POSITIONS] }, maxItems: MAX_TRANSFER_FOCUS },
          sell: arr(ctx.transfers.surplus.map((o) => o.key)),
        },
        required: ["stance", "focus", "sell"],
      },
      ...(concessions ? { concessions } : {}),
      reasoning: { type: "string" },
    },
    required: [
      "training", "ticketPrice", "pitchMaintenance", "pitchCareMode", "stadium", "equipmentUpgrades", "equipmentRepairs", "hire",
      "academy", "banners", "promote", "sendDown", "transfers", ...(concessions ? ["concessions"] : []), "reasoning",
    ],
  };
}
