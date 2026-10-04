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
