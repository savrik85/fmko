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
export function vipBoxSideFor(levels: SideLevels, ultrasSide: SceneSide): SceneSide | null {
  const order: SceneSide[] = levels.east >= 2
    ? ["east", "west", "north", "south"]
    : ["north", "south", "east", "west"];
  return order.find((s) => levels[s] >= 1 && s !== ultrasSide) ?? null;
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
