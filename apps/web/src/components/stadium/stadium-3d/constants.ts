// Stadium 3D scene constants — shared sizes, positions, palettes.

export const PITCH = {
  width: 40,    // X axis (kratší strana)
  depth: 60,    // Z axis (delší strana)
};

// Trávník barvy podle pitch_condition (0-100). Stejné prahy jako v 2D verzi.
export function pitchColor(condition: number): string {
  if (condition >= 85) return "#2A6E10";
  if (condition >= 70) return "#3D7A1A";
  if (condition >= 55) return "#558B2F";
  if (condition >= 40) return "#7A8B3A";
  if (condition >= 25) return "#908555";
  return "#8B7355";
}

// Tribuny - výška/hloubka roste s level. index = level (0-3)
export const STAND_DIMS = [
  { height: 0,   depth: 0,  rows: 0, color: "#000" },              // L0 — neviditelné
  { height: 1.2, depth: 4,  rows: 3, color: "#8B6F47" },           // L1 dřevěné lavičky
  { height: 3.5, depth: 6,  rows: 6, color: "#A0826D" },           // L2 dřevěná tribuna
  { height: 6,   depth: 8,  rows: 10, color: "#9CA3AF" },          // L3 betonová s VIP
];

// Hřiště 40x60 centrované v (0,0,0). Tribuny okolo: N/S z=±31..39, E/W x=±25..33.
// Layout je dynamický podle stands levelu: bez tribun jsou budovy blíž hřišti,
// s tribunami se odsouvají do rohů aby nepřekrývaly stand zóny.
export function getStadiumLayout(standsLevel: number) {
  if (standsLevel <= 0) {
    return {
      buildings: {
        changing_rooms: [-25, -34] as [number, number],
        showers:        [-25, 34]  as [number, number],
        refreshments:   [25, 34]   as [number, number],
      },
      parking: [30, -34] as [number, number],
      fence: { width: 80, depth: 90 },
    };
  }
  return {
    buildings: {
      changing_rooms: [-40, -45] as [number, number],
      showers:        [-40, 45]  as [number, number],
      refreshments:   [40, 45]   as [number, number],
    },
    parking: [42, -45] as [number, number],
    fence: { width: 100, depth: 110 },
  };
}

// Velikost parkoviště dle level
export const PARKING_DIMS = [
  { width: 0,  depth: 0 },    // L0
  { width: 8,  depth: 6 },    // L1
  { width: 12, depth: 8 },    // L2
  { width: 16, depth: 10 },   // L3
];

// Barvy aut na parkovišti (rotuje cyklicky)
export const CAR_COLORS = [
  "#4A6741", "#8B4513", "#4A708B", "#CD5C5C",
  "#6B6B6B", "#B8860B", "#556B2F",
];

// Default fence bounds — používá se pokud explicit fence není předán (kompatibilita)
export const FENCE_BOUNDS = {
  width: 100,
  depth: 110,
};

// Stromy v okolí - statické pozice (mimo plot, kolem areálu)
export const TREE_POSITIONS: Array<[number, number]> = [
  [-60, -55], [-62, -25], [-60, 10], [-58, 40], [-62, 60],
  [60, -58],  [62, -20],  [60, 20],  [58, 45],  [62, 65],
  [-35, -68], [0, -70],   [30, -68], [-30, 68], [10, 70], [35, 68],
  [-68, 0],   [68, 0],    [-52, -38], [52, 38],
];

// Příjezdová cesta od jihu k parkovišti
export const ROAD = {
  start: [42, -65] as [number, number],
  end:   [42, -50] as [number, number],
  width: 5,
};

// Building barvy podle typu
export const BUILDING_COLORS = {
  changing_rooms: { wall: "#E8DCC4", roof: "#A0432C" },   // béžová + cihla
  showers:        { wall: "#E8DCC4", roof: "#3B6B8C" },   // béžová + modrá
  refreshments:   { wall: "#F5E6C8", roof: "#C9A84C" },   // krémová + zlatá
};

// Velikost budovy podle level
export const BUILDING_DIMS = [
  { width: 0,   height: 0,   depth: 0 },       // L0
  { width: 4,   height: 2.5, depth: 3 },       // L1
  { width: 5,   height: 3,   depth: 4 },       // L2
  { width: 6,   height: 3.5, depth: 5 },       // L3
];

// Ground plane velikost (mimo plot, vidíš to jako travnatou krajinu)
export const GROUND_SIZE = 200;
export const GROUND_COLOR = "#4A7A2C";  // tmavší zelená než hřiště

// Sky/atmospheric defaults
export const SKY_SUN_POSITION: [number, number, number] = [50, 30, 20];
