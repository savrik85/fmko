// Stadium 3D scene constants — shared sizes, positions, palettes.

/**
 * Výška hrací plochy nad terénem a výška okolní výběhové zóny.
 *
 * Zóna je RÁM s dírou pod hrací plochou (viz SurroundTrack), takže se s trávníkem
 * nikde nepřekrývá. Nemusí se proto od něj odsazovat kvůli hloubkovému testu a
 * může ležet prakticky v rovině — žádný schod, žádné prosvítání.
 *
 * Ladit tohle rozestupem nešlo: větší mezera dělala viditelný schod pod dlažbou,
 * menší vracela prosvítání povrchu skrz trávník.
 */
export const PITCH_SURFACE_Y = 0.05;
export const APRON_Y = PITCH_SURFACE_Y - 0.002;

/**
 * Šířka výběhové zóny kolem hrací plochy (metry od postranní čáry).
 *
 * Zóna nese zvolený povrch areálu (tráva, antuka, zámková dlažba, umělka,
 * klubový koberec). Při 2,4 m z ní po odečtení zábradlí zbýval pruh 1,6 m
 * a zvolený povrch nebyl prakticky vidět — investice do dlažby vypadala stejně
 * jako tráva. Zábradlí se odvozuje odtud, aby zóna a plot nikdy nerozešly.
 */
export const APRON_MARGIN = 5.5;
/**
 * Pruh TRÁVY mezi postranní čarou a začátkem zvoleného povrchu.
 *
 * Bez něj dlažba začínala přesně na lajně a branka pak stála na zámkovce.
 * Na vesnickém hřišti kolem lajn tráva vždycky je — dlažba, antuka nebo koberec
 * začínají až za ní, u zábradlí. Díra v rámu zóny se o tenhle pruh zvětšuje.
 */
export const PITCH_GRASS_MARGIN = 2.5;
/** Zábradlí stojí u vnějšího okraje zóny, kousek dlažby nechává i za sebou. */
export const RAILING_MARGIN = APRON_MARGIN - 0.9;

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
        toilets:        [10, -34]  as [number, number],
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
      toilets:        [16, -45]  as [number, number],
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
// Zvětšeno z 200 na 360 (2026-09-02): kopce se posunuly dál do krajiny (~150 m) a musí stát
// na terénu, ne viset nad barvou kopule oblohy. Kopule má poloměr 250, far kamery 400.
export const GROUND_SIZE = 360;
export const GROUND_COLOR = "#4A7A2C";  // tmavší zelená než hřiště

// Sky/atmospheric defaults
export const SKY_SUN_POSITION: [number, number, number] = [50, 30, 20];

export type TimeOfDay = "day" | "sunset" | "night";

export type CameraViewpoint = "overview" | "main_stand" | "dugout" | "behind_goal" | "orbit";

export interface ViewpointDef {
  id: CameraViewpoint;
  label: string;
  icon: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export const VIEWPOINTS: Record<CameraViewpoint, ViewpointDef> = {
  overview: {
    id: "overview",
    label: "Areál",
    icon: "🦅",
    position: [55, 45, 55],
    target: [0, 0, 0],
    fov: 35,
  },
  main_stand: {
    id: "main_stand",
    label: "Tribuna",
    icon: "🏟️",
    position: [0, 8, 38],
    target: [0, 1, 0],
    fov: 48,
  },
  dugout: {
    id: "dugout",
    label: "Střídačka",
    icon: "💺",
    // Mezi oběma střídačkami u postranní čáry, výška sedícího trenéra.
    position: [-(PITCH.width / 2 + 2.6), 2.3, -2.0],
    target: [5, 0.3, 3],
    fov: 55,
  },
  behind_goal: {
    id: "behind_goal",
    label: "Za brankou",
    icon: "🎯",
    // Vedle branky mezi sítí a reklamou, před transparentem kotle (z = -32).
    // Dřív stála kamera za kotlem a koukala skrz jeho střechu a zrcadlový nápis.
    position: [5.3, 3.4, -(PITCH.depth / 2 + 1.3)],
    target: [0, 0.5, 4],
    fov: 50,
  },
  orbit: {
    id: "orbit",
    label: "Oblet",
    icon: "🎬",
    position: [52, 38, 52],
    target: [0, 0, 0],
    fov: 36,
  },
};

/** Mezera mezi postranní/brankovou čárou a přední hranou tribuny. */
export const STAND_GAP = 2.5;

/**
 * Pohledy kamery odvozené z úrovně tribun a střechy.
 *
 * Statické souřadnice fungovaly jen pro jednu velikost tribuny: s L2 tribunou
 * skončila kamera „Tribuna" v její střeše a „Za brankou" za kotlem. Hlavní tribuna
 * se proto počítá z rozměrů tribuny (STAND_DIMS) a výšky stříšky (stejná
 * `clearance` jako ve StandRoof), střídačka a branka jsou pevné u hřiště.
 */
export function getViewpoints(standsLevel: number, roofLevel: number): Record<CameraViewpoint, ViewpointDef> {
  const lvl = Math.min(Math.max(standsLevel, 0), 3);
  const dims = STAND_DIMS[lvl];
  const frontZ = PITCH.depth / 2 + STAND_GAP;

  // Výška očí: v poslední řadě, nebo (se stříškou) nad ní jako televizní kamera.
  const roofClearance = lvl === 1 ? 2.6 : 1.1; // stejné hodnoty jako StandRoof
  const eyeY = roofLevel > 0 && lvl > 0 ? dims.height + roofClearance + 2.2 : dims.height + 2.6;

  let mainStand: Pick<ViewpointDef, "position" | "target" | "fov">;
  if (lvl >= 2) {
    // Od L2 stojí boční tribuna (východ) — klasický televizní pohled od půlicí čáry,
    // se střídačkami naproti.
    const frontX = PITCH.width / 2 + STAND_GAP;
    mainStand = { position: [frontX + dims.depth * 0.9, eyeY, 0], target: [0, 0.6, 0], fov: 46 };
  } else if (lvl === 1) {
    // L1 má tribuny jen za brankami — z poslední řady, kousek stranou, aby síť
    // branky nezabírala půlku obrazu.
    mainStand = { position: [8, eyeY, frontZ + dims.depth * 0.9], target: [0, 0.6, -4], fov: 46 };
  } else {
    // Bez tribuny: zvýšený pohled z místa, kde by stála.
    mainStand = { position: [8, 6.5, 36], target: [0, 0.6, -4], fov: 46 };
  }

  return {
    ...VIEWPOINTS,
    main_stand: { ...VIEWPOINTS.main_stand, ...mainStand },
  };
}

export type WeatherType = "sunny" | "cloudy" | "rain" | "wind" | "snow";

export interface WeatherOption {
  id: WeatherType;
  label: string;
  icon: string;
  desc: string;
  defaultTemp: number;
}

export const WEATHER_OPTIONS: Record<WeatherType, WeatherOption> = {
  sunny: {
    id: "sunny",
    label: "Jasno",
    icon: "☀️",
    desc: "Slunečno, suché hřiště",
    defaultTemp: 22,
  },
  cloudy: {
    id: "cloudy",
    label: "Zataženo",
    icon: "☁️",
    desc: "Pod mrakem, klidné podmínky",
    defaultTemp: 16,
  },
  rain: {
    id: "rain",
    label: "Déšť",
    icon: "🌧️",
    desc: "Vytrvalý déšť, mokrý a kluzký terén",
    defaultTemp: 12,
  },
  wind: {
    id: "wind",
    label: "Vítr",
    icon: "💨",
    desc: "Silný vítr, ztížené dlouhé pasy",
    defaultTemp: 14,
  },
  snow: {
    id: "snow",
    label: "Sníh",
    icon: "❄️",
    desc: "Sněžení a mráz, ztížený pohyb",
    defaultTemp: -2,
  },
};

export type StadiumMode = "match_day" | "training_day";

export interface StadiumModeOption {
  id: StadiumMode;
  label: string;
  icon: string;
  desc: string;
}

export const STADIUM_MODES: Record<StadiumMode, StadiumModeOption> = {
  match_day: {
    id: "match_day",
    label: "Zápas",
    icon: "⚽",
    desc: "Zápasový den (fanoušci, kotel, plný areál)",
  },
  training_day: {
    id: "training_day",
    label: "Trénink",
    icon: "🏃",
    desc: "Tréninkový den (kužely, slalom, prázdné tribuny)",
  },
};

export type AttendanceLevel = "low" | "medium" | "high" | "sold_out";

export const ATTENDANCE_PRESETS: Record<AttendanceLevel, { id: AttendanceLevel; label: string; ratio: number; icon: string; desc: string }> = {
  low: { id: "low", label: "25%", ratio: 0.25, icon: "👤", desc: "Slabá návštěva (~25%)" },
  medium: { id: "medium", label: "50%", ratio: 0.50, icon: "👥", desc: "Polozaplněný stadion (~50%)" },
  high: { id: "high", label: "75%", ratio: 0.75, icon: "🏟️", desc: "Velmi slušná návštěva (~75%)" },
  sold_out: { id: "sold_out", label: "100%", ratio: 1.00, icon: "🔥", desc: "Vyprodáno do posledního místa (100%)" },
};

