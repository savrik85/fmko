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

// Pozice okolo hřiště pro budovy. [x, z]. y = 0 (na zemi).
// Hřiště je centrované v 0,0,0. Tribuny budou těsně u okrajů (X: ±20, Z: ±30)
// Budovy jsou v rozích za tribunami.
export const BUILDING_POSITIONS = {
  changing_rooms: [-26, -25] as [number, number],   // SW corner
  showers:        [-26, 25]  as [number, number],   // NW corner
  refreshments:   [26, 25]   as [number, number],   // NE corner
};

export const PARKING_POSITION: [number, number] = [26, -25];   // SE corner

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

// Plot kolem celého areálu - obdélník
export const FENCE_BOUNDS = {
  width: 80,    // X axis
  depth: 90,    // Z axis
};

// Stromy v okolí - statické pozice (mimo plot, kolem areálu)
export const TREE_POSITIONS: Array<[number, number]> = [
  [-50, -45], [-48, -20], [-50, 10], [-46, 35], [-50, 50],
  [50, -48],  [48, -15],  [50, 15],  [46, 40],  [50, 55],
  [-30, -55], [0, -58],   [25, -55], [-25, 55], [10, 58], [30, 55],
  [-55, 0],   [55, 0],    [-42, -30], [42, 30],
];

// Příjezdová cesta od jihu k parkovišti
export const ROAD = {
  start: [10, -55] as [number, number],
  end:   [26, -32] as [number, number],
  width: 4,
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
