/**
 * Úrovně tribun po světových stranách 3D scény.
 *
 * Hřiště je 40 (X) × 60 (Z). Sever a jih stojí ZA BRANKAMI, východ a západ jsou
 * na dlouhých stranách. Východ je hlavní tribuna (tam sedí lóže), západ protější;
 * za levou brankou je jih, za pravou sever.
 *
 * Bez sloupců stran (starší odpověď API, veřejné stránky klubu) platí starý model:
 * za brankami stojí tribuna vždy, na dlouhých stranách až od úrovně 2.
 * Bez React a three importů, aby šla logika testovat.
 */

export type SceneSide = "north" | "south" | "east" | "west";
export type SideLevels = Record<SceneSide, number>;

export interface StandFacilities {
  stands?: number;
  stand_main?: number;
  stand_opposite?: number;
  stand_goal_west?: number;
  stand_goal_east?: number;
}

const clamp = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(3, Math.round(v))) : 0;

export function getSideLevels(f: StandFacilities): SideLevels {
  const hasSides =
    f.stand_main !== undefined || f.stand_opposite !== undefined ||
    f.stand_goal_west !== undefined || f.stand_goal_east !== undefined;
  if (hasSides) {
    return {
      east: clamp(f.stand_main),
      west: clamp(f.stand_opposite),
      south: clamp(f.stand_goal_west),
      north: clamp(f.stand_goal_east),
    };
  }
  const s = clamp(f.stands);
  return { north: s, south: s, east: s >= 2 ? s : 0, west: s >= 2 ? s : 0 };
}

/**
 * Na které straně stojí lóže: na východní (hlavní) tribuně od úrovně 2, jinak za
 * brankou na severu. Kde stojí kotel, tam lóže není, a bez tribuny se nekreslí.
 * Se starým modelem dává stejné strany jako dřív.
 */
export function vipBoxSideFor(levels: SideLevels, ultrasSide: SceneSide, replaced?: ReadonlySet<SceneSide>): SceneSide | null {
  const order: SceneSide[] = levels.east >= 2
    ? ["east", "west", "north", "south"]
    : ["north", "south", "east", "west"];
  // Strana nahrazená točenou tribunou nebo valem má jiný tvar, lóže na ni nepatří.
  return order.find((s) => levels[s] >= 1 && s !== ultrasSide && !replaced?.has(s)) ?? null;
}

const SIDE_SLOT_OF: Record<string, SceneSide> = {
  ext_main: "east",
  ext_opposite: "west",
  ext_goal_west: "south",
  ext_goal_east: "north",
};

/** Znaménko X a Z rohu: východ je +X, sever je +Z. */
const CORNER_SIGNS: Record<string, [number, number]> = {
  corner_main_goal_east: [1, 1],
  corner_main_goal_west: [1, -1],
  corner_opposite_goal_east: [-1, 1],
  corner_opposite_goal_west: [-1, -1],
};

/**
 * Které konce tribuny (v jejím lokálním x) navazují na přístavbu. Tam se nesmí kreslit
 * koncová stěna, jinak by uprostřed spojeného celku zůstala přepážka.
 * Prodloužení spojí oba konce, rohová tribuna oba sousední konce, křídlo v rohu konec tribuny za brankou na straně rohu
 * (tribuna na severu má lokální +X ve světě +X, na jihu je otočená, tedy -X).
 */
export function joinedEnds(
  side: SceneSide,
  extensions: ReadonlyArray<{ slot: string; kind: string }>,
): { left: boolean; right: boolean } {
  const out = { left: false, right: false };
  for (const e of extensions) {
    if (e.kind === "length" && SIDE_SLOT_OF[e.slot] === side) {
      out.left = true;
      out.right = true;
    }
    if (e.kind === "curved_corner" || e.kind === "corner") {
      // Rohová tribuna navazuje na obě sousední tribuny: na tu za brankou i na tu na dlouhé straně.
      // Východní tribuna má lokální +X ve světě -Z, západní +Z (obě jsou otočené o 90 stupňů).
      const corner = CORNER_SIGNS[e.slot];
      if (!corner) continue;
      const [sx, sz] = corner;
      const goalSide: SceneSide = sz > 0 ? "north" : "south";
      const longSide: SceneSide = sx > 0 ? "east" : "west";
      let localSign = 0;
      if (side === goalSide) localSign = side === "north" ? sx : -sx;
      else if (side === longSide) localSign = side === "east" ? -sz : sz;
      if (localSign > 0) out.right = true;
      else if (localSign < 0) out.left = true;
    }
    if (e.kind === "wing") {
      const corner = CORNER_SIGNS[e.slot];
      if (!corner) continue;
      const [sx, sz] = corner;
      const goalSide: SceneSide = sz > 0 ? "north" : "south";
      if (goalSide !== side) continue;
      const localSign = side === "north" ? sx : -sx;
      if (localSign > 0) out.right = true;
      else out.left = true;
    }
  }
  return out;
}

/**
 * Strany, jejichž rovnou tribunu nahradí tvar přístavby. Točená tribuna a travnatý val nejsou
 * další tribuna před nebo za původní (kdo by seděl vzadu, neviděl by přes ni), ale jiná podoba
 * tribuny za brankou, takže se rovná tribuna na té straně nekreslí. Platí i pro náhled.
 */
export function replacedSides(
  extensions: ReadonlyArray<{ slot: string; kind: string }>,
  preview?: { slot: string; kind: string } | null,
): Set<SceneSide> {
  const out = new Set<SceneSide>();
  const considered = [
    ...extensions.filter((e) => !preview || e.slot !== preview.slot),
    ...(preview ? [preview] : []),
  ];
  for (const e of considered) {
    const side = SIDE_SLOT_OF[e.slot];
    if (side && (e.kind === "round_stand" || e.kind === "terrace")) out.add(side);
  }
  return out;
}

export type RaisedTierKind = "second_tier" | "double_stand" | "stilts";

export interface RaisedTierSpec {
  /** Šířka jako podíl délky strany. */
  widthFactor: number;
  rows: number;
  rowDepth: number;
  rise: number;
  /** Výška podlahy patra nad zemí a vzdálenost jeho přední hrany od přední hrany tribuny. */
  y0: number;
  z0: number;
  /** Styl sedadel (3 = beton a plastová sedadla, 2 = dřevo). */
  style: number;
  glass: boolean;
}

/**
 * Rozměry horního patra podle druhu a úrovně přístavby, pro tribunu výšky H a hloubky D.
 * Jediné místo, ze kterého čerpá vykreslení patra i zvednutí střechy nad ním.
 * Druhé patro a dvojitá tribuna leží nad tribunou, piloty za její zadní hranou VÝŠ než tribuna,
 * aby diváci na nich viděli přes ni.
 */
export function raisedTierSpec(kind: RaisedTierKind, level: number, H: number, D: number): RaisedTierSpec {
  const l = Math.max(1, Math.min(3, Math.round(level)));
  switch (kind) {
    case "second_tier":
      return { widthFactor: 0.5 + 0.15 * l, rows: 3 + l, rowDepth: 1.2, rise: 0.45, y0: H + 1.8, z0: D * 0.45, style: 3, glass: false };
    case "double_stand":
      return { widthFactor: 0.94, rows: 4 + l, rowDepth: 1.2, rise: 0.5, y0: H + 2.6, z0: D * 0.3, style: 3, glass: true };
    case "stilts":
      return { widthFactor: 0.5 + 0.1 * l, rows: 2 + l, rowDepth: 1.5, rise: 0.5, y0: Math.max(3.4, H + 0.8), z0: D + 0.3, style: 2, glass: false };
  }
}

/** Výška nejvyšší řady patra nad zemí. */
export function tierTop(spec: RaisedTierSpec): number {
  return spec.y0 + spec.rows * spec.rise;
}

export interface RoofTier {
  /** Výška podlahy patra, jeho přední hrana (z) a nejvyšší bod nad zemí. */
  y0: number;
  z0: number;
  top: number;
  /** Zadní hrana patra (z): střecha musí končit až za ní. */
  end: number;
}

/**
 * Pro strany, které mají nahoře patro, vrací jeho polohu, aby střecha kryla celou tribunu:
 * od přední řady dole až za zadní hranu patra, a ne jen jeho horní část.
 * `dimsOf(úroveň)` vrací výšku a hloubku tribuny dané úrovně.
 */
export function roofTiers(
  extensions: ReadonlyArray<{ slot: string; kind: string; level: number }>,
  sideLevels: SideLevels,
  dimsOf: (level: number) => { height: number; depth: number },
): Partial<Record<SceneSide, RoofTier>> {
  const out: Partial<Record<SceneSide, RoofTier>> = {};
  for (const e of extensions) {
    const side = SIDE_SLOT_OF[e.slot];
    if (!side || (e.kind !== "second_tier" && e.kind !== "double_stand" && e.kind !== "stilts")) continue;
    const { height: H, depth: D } = dimsOf(Math.max(1, sideLevels[side]));
    const spec = raisedTierSpec(e.kind, e.level, H, D);
    const tier: RoofTier = { y0: spec.y0, z0: spec.z0, top: tierTop(spec), end: Math.max(D, spec.z0 + spec.rows * spec.rowDepth) };
    const prev = out[side];
    out[side] = !prev ? tier : { y0: Math.min(prev.y0, tier.y0), z0: Math.min(prev.z0, tier.z0), top: Math.max(prev.top, tier.top), end: Math.max(prev.end, tier.end) };
  }
  return out;
}

export interface CanopyPlan {
  /** Sklon desky (rad); deska stoupá dozadu. */
  tilt: number;
  roofY: number;
  roofZ: number;
  roofDepth: number;
  backZ: number;
}

/**
 * Poloha a sklon střechy nad tribunou hloubky D a výšky H (lokálně: z = 0 přední hrana tribuny).
 *
 * Jediné pravidlo pro všechny střechy: deska je všude aspoň 2,4 m nad nejvyšším divákem pod ní,
 * takže nebrání ve výhledu, a je vodorovná, aby na sebe sousední střechy navazovaly. Dřív klesala
 * dopředu jako štít (0,32 rad) a v nízké výšce se divákům pletla do výhledu.
 * Nad tribunou s patrem kryje celou tribunu a leží nad nejvyšší řadou patra.
 */
export function canopyPlan(D: number, H: number, roofLevel: number, tier?: RoofTier): CanopyPlan {
  const overhang = 0.5 + roofLevel * 0.35;
  // Vodorovná: sousední střechy (rovná tribuna, roh, točená) na sebe pak navazují ve stejné výšce.
  const tilt = 0;
  const slope = Math.tan(tilt);
  let roofDepth = D * 0.7 + overhang;
  let roofZ = D * 0.45;
  let backZ = D + overhang * 0.5;
  if (tier) {
    const frontEdge = -overhang;
    const backEdge = tier.end + 0.4;
    roofDepth = backEdge - frontEdge;
    roofZ = (frontEdge + backEdge) / 2;
    backZ = backEdge;
  }
  const zBack = roofZ + roofDepth / 2;
  const zFront = roofZ - roofDepth / 2;
  const standH = (z: number) => H * Math.max(0, Math.min(1, z / D));
  const need = [
    standH(zBack) + 2.4 - (zBack - roofZ) * slope,
    standH(zFront) + 2.4 + (roofZ - zFront) * slope,
  ];
  if (tier) {
    need.push(tier.top + 2.2 + (roofZ - tier.z0) * slope, tier.y0 + 3.2 + (roofZ - tier.z0) * slope);
  }
  return { tilt, roofY: Math.max(...need), roofZ, roofDepth, backZ };
}

/** Postavené přístavby z odpovědi `/stadium` ve tvaru, který bere 3D scéna. */
export function builtExtensionsOf(
  standExtensions: { slots: ReadonlyArray<{ slot: string; built?: { kind: string; level: number } | null }> } | undefined,
): { slot: string; kind: string; level: number }[] {
  return (standExtensions?.slots ?? [])
    .filter((x) => x.built)
    .map((x) => ({ slot: x.slot, kind: x.built!.kind, level: x.built!.level }));
}
