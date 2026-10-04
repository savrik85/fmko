/**
 * Přístavby tribun: katalog druhů, míst, kapacit, cen a pravidel odemykání.
 *
 * Čistá logika bez databáze. Stadion má 8 míst (4 postranní u tribun, 4 rohy);
 * v každém stojí jedna přístavba a dá se vylepšovat na úroveň 1–3, druh se nemění.
 * Kapacity i ceny drží okresní měřítko: plně vybudovaný stadion vychází kolem 1 900 míst.
 */
import { describeLock, STADIUM_UNLOCK, type LockDetail } from "./stadium-generator";
import { STAND_SIDE_LABELS, type StandLevels, type StandSide } from "./stands-model";

export const EXT_KINDS = [
  "length", "second_tier", "double_stand", "stilts", "tower", "footbridge", "terrace",
  "round_stand", "mobile", "corner", "curved_corner", "wing", "bridge",
] as const;
export type ExtKind = (typeof EXT_KINDS)[number];

export const EXT_KIND_LABELS: Record<ExtKind, string> = {
  length: "Prodloužení do délky",
  second_tier: "Druhé patro",
  double_stand: "Dvojitá tribuna",
  stilts: "Tribuna na pilotech",
  tower: "Tribuna s věží",
  footbridge: "Dřevěná lávka u plotu",
  terrace: "Terasovitý val",
  round_stand: "Točená tribuna",
  mobile: "Mobilní tribunka",
  corner: "Rohová tribuna",
  curved_corner: "Zahnutá tribuna",
  wing: "Boční křídlo",
  bridge: "Napojovací most",
};

export const EXT_KIND_DESCRIPTIONS: Record<ExtKind, string> = {
  length: "Tribuna se natáhne k rohům, víc míst na stejné straně",
  second_tier: "Nástavba nad tribunou, hodně míst na stejném místě",
  double_stand: "Dvě patra s uličkou, největší kapacita na boku",
  stilts: "Zvýšená tribuna na pilotech s lepším výhledem",
  tower: "Tribuna s vyvýšenou věží, na které visí vlajky",
  footbridge: "Úzký dřevěný pruh u plotu, málo míst, ale levně",
  terrace: "Stupňovitý val ze zeminy za brankou, levné stání",
  round_stand: "Půlkruh za brankou s nejlepším pohledem na hřiště",
  mobile: "Skládací kovové dílce, postaví se kamkoli, ale je jich málo",
  corner: "Malá tribuna v rohu mezi dvěma stranami",
  curved_corner: "Oblouk kolem rohu, spojí sousední tribuny",
  wing: "Křídlo kolmo na tribunu, vznikne tvar L",
  bridge: "Most spojí dvě sousední tribuny do celku",
};

/** Kapacita druhu podle úrovně (index 0–3, úroveň 0 = nic). */
const CAPACITY: Record<ExtKind, readonly number[]> = {
  length: [0, 40, 80, 130],
  second_tier: [0, 50, 100, 160],
  double_stand: [0, 60, 120, 200],
  stilts: [0, 50, 90, 140],
  tower: [0, 20, 40, 60],
  footbridge: [0, 20, 35, 50],
  terrace: [0, 40, 90, 150],
  round_stand: [0, 50, 100, 170],
  mobile: [0, 15, 30, 45],
  corner: [0, 20, 40, 70],
  curved_corner: [0, 35, 70, 110],
  wing: [0, 30, 60, 100],
  bridge: [0, 25, 45, 70],
};

/**
 * Násobek ceny druhu. Cena za místo (níž) je odvozená ze stávajících cen tribun,
 * násobek říká, o kolik je druh levnější (val, lávka, mobilní) nebo dražší (patra, oblouky).
 */
const PRICE_MULT: Record<ExtKind, number> = {
  length: 1.0, second_tier: 1.5, double_stand: 1.7, stilts: 1.2, tower: 1.3, footbridge: 0.6,
  terrace: 0.55, round_stand: 1.4, mobile: 0.5, corner: 1.0, curved_corner: 1.3, wing: 1.1, bridge: 1.0,
};

/**
 * Cena za jedno místo podle úrovně: 55 000 / 90 = 611, 170 000 / 200 = 850, 450 000 / 210 = 2 143 Kč.
 * Přístavba tedy není levnější ani dražší než samotné tribuny.
 */
const BASE_PRICE_PER_SEAT = [0, 611, 850, 2143] as const;

export function extCapacity(kind: string, level: number): number {
  const t = CAPACITY[kind as ExtKind];
  if (!t || !Number.isInteger(level) || level < 1 || level > 3) return 0;
  return t[level];
}

/** Cena stavby na danou úroveň (z úrovně o jedna nižší), zaokrouhlená na stovky. */
export function extCost(kind: string, level: number): number {
  const t = CAPACITY[kind as ExtKind];
  if (!t || !Number.isInteger(level) || level < 1 || level > 3) return 0;
  const seats = t[level] - t[level - 1];
  return Math.round((seats * BASE_PRICE_PER_SEAT[level] * PRICE_MULT[kind as ExtKind]) / 100) * 100;
}

/** Celková kapacita postavených přístaveb. Neznámé druhy se přeskočí. */
export function extensionsCapacity(rows: ReadonlyArray<{ slot: string; kind: string; level: number }>): number {
  return rows.reduce((sum, r) => sum + extCapacity(r.kind, r.level), 0);
}

export const EXT_SLOTS = [
  "ext_main", "ext_opposite", "ext_goal_west", "ext_goal_east",
  "corner_main_goal_east", "corner_main_goal_west", "corner_opposite_goal_east", "corner_opposite_goal_west",
] as const;
export type ExtSlot = (typeof EXT_SLOTS)[number];

export interface ExtSlotDef {
  type: "side" | "corner";
  label: string;
  /** Tribuny, na kterých místo závisí (u rohu obě sousední). */
  sides: StandSide[];
}

const L = STAND_SIDE_LABELS;
export const EXT_SLOT_DEFS: Record<ExtSlot, ExtSlotDef> = {
  ext_main: { type: "side", label: `${L.stand_main}: přístavba`, sides: ["stand_main"] },
  ext_opposite: { type: "side", label: `${L.stand_opposite}: přístavba`, sides: ["stand_opposite"] },
  ext_goal_west: { type: "side", label: `${L.stand_goal_west}: přístavba`, sides: ["stand_goal_west"] },
  ext_goal_east: { type: "side", label: `${L.stand_goal_east}: přístavba`, sides: ["stand_goal_east"] },
  corner_main_goal_east: { type: "corner", label: "Roh: hlavní tribuna a za pravou brankou", sides: ["stand_main", "stand_goal_east"] },
  corner_main_goal_west: { type: "corner", label: "Roh: hlavní tribuna a za levou brankou", sides: ["stand_main", "stand_goal_west"] },
  corner_opposite_goal_east: { type: "corner", label: "Roh: protější tribuna a za pravou brankou", sides: ["stand_opposite", "stand_goal_east"] },
  corner_opposite_goal_west: { type: "corner", label: "Roh: protější tribuna a za levou brankou", sides: ["stand_opposite", "stand_goal_west"] },
};

const ALLOWED: Record<ExtSlot, readonly ExtKind[]> = {
  ext_main: ["length", "second_tier", "double_stand", "stilts", "tower", "footbridge", "mobile"],
  ext_opposite: ["length", "second_tier", "double_stand", "footbridge", "mobile"],
  ext_goal_west: ["second_tier", "terrace", "round_stand", "mobile"],
  ext_goal_east: ["second_tier", "terrace", "round_stand", "mobile"],
  corner_main_goal_east: ["corner", "curved_corner", "wing", "bridge", "mobile"],
  corner_main_goal_west: ["corner", "curved_corner", "wing", "bridge", "mobile"],
  corner_opposite_goal_east: ["corner", "curved_corner", "wing", "bridge", "mobile"],
  corner_opposite_goal_west: ["corner", "curved_corner", "wing", "bridge", "mobile"],
};

export function allowedKinds(slot: string): readonly ExtKind[] {
  return ALLOWED[slot as ExtSlot] ?? [];
}

/** Co druh chce od tribun: `all` = všechny dotčené strany, `any` = aspoň jedna. */
const REQUIREMENT: Record<ExtKind, { min: number; mode: "all" | "any" }> = {
  length: { min: 1, mode: "all" },
  second_tier: { min: 3, mode: "all" },
  double_stand: { min: 3, mode: "all" },
  stilts: { min: 2, mode: "all" },
  tower: { min: 2, mode: "all" },
  footbridge: { min: 0, mode: "all" },
  terrace: { min: 0, mode: "all" },
  round_stand: { min: 2, mode: "all" },
  mobile: { min: 0, mode: "all" },
  corner: { min: 1, mode: "all" },
  curved_corner: { min: 2, mode: "all" },
  wing: { min: 2, mode: "any" },
  bridge: { min: 2, mode: "all" },
};

export function requirementOf(kind: ExtKind): { min: number; mode: "all" | "any" } {
  return REQUIREMENT[kind];
}

export interface ExtOption {
  kind: ExtKind;
  label: string;
  description: string;
  /** Úroveň, na kterou se staví (1 u nové přístavby, o jedna výš u vylepšení). */
  level: number;
  cost: number;
  capacityGain: number;
  /** Kapacita přístavby po stavbě. */
  capacity: number;
  locked: boolean;
  lockReason?: string;
  lockDetail?: LockDetail;
}

export interface ExtSlotState {
  slot: ExtSlot;
  type: "side" | "corner";
  label: string;
  sides: StandSide[];
  built: { kind: ExtKind; label: string; level: number } | null;
  options: ExtOption[];
}

export interface ExtContext {
  reputation: number;
  matchesPlayed: number;
  season: number;
  /** Lokální testování: přeskočí podmínky reputace, zápasů a sezóny, ne podmínky na tribuny. */
  ignoreProgressLocks: boolean;
}

/**
 * Prodloužení strany a přístavba v jejím rohu se vylučují: prodloužení by zasáhlo do rohu, kam
 * rohová přístavba patří, a obě by se překrývaly. Vrací důvod zámku, nebo undefined.
 */
function cornerConflict(
  kind: ExtKind,
  slot: ExtSlot,
  built: ReadonlyArray<{ slot: string; kind: string; level: number }>,
): string | undefined {
  const def = EXT_SLOT_DEFS[slot];
  const defOf = (b: { slot: string }) => EXT_SLOT_DEFS[b.slot as ExtSlot];
  const touches = (b: { slot: string }) => !!defOf(b)?.sides.some((s) => def.sides.includes(s));
  // Křídlo je rovný blok navazující na ROVNOU tribunu za brankou. Točená tribuna a val tu rovnou
  // tribunu nahrazují jiným tvarem, takže křídlo by k ní nenavazovalo (ohýbá se k hřišti).
  const SHAPED_GOAL = ["round_stand", "terrace"];
  if (def.type === "corner") {
    if (kind === "wing" && built.some((b) => SHAPED_GOAL.includes(b.kind) && defOf(b)?.type === "side" && touches(b))) {
      return "Za brankou stojí točená tribuna nebo val, boční křídlo by na ně nenavazovalo";
    }
    // Roh: některá z jeho tribun je prodloužená.
    if (built.some((b) => b.kind === "length" && touches(b))) {
      return "Sousední tribuna je prodloužená až do rohu, na rohovou přístavbu tu není místo";
    }
    return undefined;
  }
  if (SHAPED_GOAL.includes(kind) && built.some((b) => b.kind === "wing" && defOf(b)?.type === "corner" && touches(b))) {
    return "V rohu u této tribuny stojí boční křídlo, které na točenou tribunu nebo val nenavazuje";
  }
  if (kind === "length" && built.some((b) => defOf(b)?.type === "corner" && touches(b))) {
    // Prodloužení: v některém rohu té strany už něco stojí.
    return "V rohu u této tribuny už stojí přístavba, prodloužení by do ní zasáhlo";
  }
  return undefined;
}

function buildOption(
  kind: ExtKind,
  slot: ExtSlot,
  level: number,
  fromLevel: number,
  sides: StandLevels,
  ctx: ExtContext,
  built: ReadonlyArray<{ slot: string; kind: string; level: number }>,
): ExtOption {
  const def = EXT_SLOT_DEFS[slot];
  const req = REQUIREMENT[kind];
  const detail: LockDetail = {};

  const conflict = cornerConflict(kind, slot, built);
  const levels = def.sides.map((s) => sides[s] ?? 0);
  const ok = req.mode === "all" ? levels.every((v) => v >= req.min) : levels.some((v) => v >= req.min);
  if (!ok) {
    const names = def.sides.map((s) => L[s].toLowerCase()).join(" a ");
    detail.prerequisite = req.mode === "any"
      ? `Aspoň jedna sousední tribuna musí mít úroveň ${req.min}+ (${names})`
      : `Tribuna na úrovni ${req.min}+ (${names})`;
  }

  if (conflict) detail.prerequisite = detail.prerequisite ? `${detail.prerequisite}. ${conflict}` : conflict;

  const unlock = ctx.ignoreProgressLocks ? {} : (STADIUM_UNLOCK[level] ?? {});
  if (unlock.reputation && ctx.reputation < unlock.reputation) {
    detail.reputation = { need: unlock.reputation, have: ctx.reputation };
  }
  if (unlock.matchesPlayed && ctx.matchesPlayed < unlock.matchesPlayed) {
    detail.matchesPlayed = { need: unlock.matchesPlayed, have: ctx.matchesPlayed };
  }
  if (unlock.season && ctx.season < unlock.season) {
    detail.season = { need: unlock.season, have: ctx.season };
  }

  const locked = Object.keys(detail).length > 0;
  return {
    kind,
    label: EXT_KIND_LABELS[kind],
    description: EXT_KIND_DESCRIPTIONS[kind],
    level,
    cost: extCost(kind, level),
    capacityGain: extCapacity(kind, level) - extCapacity(kind, fromLevel),
    capacity: extCapacity(kind, level),
    locked,
    lockReason: locked ? describeLock(detail) : undefined,
    lockDetail: locked ? detail : undefined,
  };
}

/**
 * Stav všech míst a to, co se tam dá postavit nebo vylepšit.
 * Prázdné místo nabízí všechny povolené druhy na úrovni 1, postavené jen vylepšení
 * stejného druhu o úroveň výš (na maximu nic).
 */
export function getExtensionSlots(
  sides: StandLevels,
  built: ReadonlyArray<{ slot: string; kind: string; level: number }>,
  ctx: ExtContext,
): ExtSlotState[] {
  return EXT_SLOTS.map((slot) => {
    const def = EXT_SLOT_DEFS[slot];
    const row = built.find((b) => b.slot === slot && (EXT_KINDS as readonly string[]).includes(b.kind));
    const current = row
      ? { kind: row.kind as ExtKind, label: EXT_KIND_LABELS[row.kind as ExtKind], level: Math.max(1, Math.min(3, row.level)) }
      : null;
    let options: ExtOption[];
    if (!current) {
      options = ALLOWED[slot].map((k) => buildOption(k, slot, 1, 0, sides, ctx, built));
    } else if (current.level >= 3) {
      options = [];
    } else {
      options = [buildOption(current.kind, slot, current.level + 1, current.level, sides, ctx, built)];
    }
    return { slot, type: def.type, label: def.label, sides: def.sides, built: current, options };
  });
}
