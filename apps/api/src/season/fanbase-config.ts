// Konfigurace tier-based fanouškovské základny: cofficienty pro home advantage,
// příchodnost na zápasy, podmínky promote mezi tiery, konverze přes autobus
// a propagaci.

export const FANBASE_CONFIG = {
  // Per-tier příchodnost na zápasy (jak velké procento z tieru reálně přijde)
  ATTENDANCE_RATE: {
    hardcore: { min: 0.95, max: 1.0 },
    regular: { min: 0.7, max: 0.9 },
    casual: { min: 0.2, max: 0.5 },
  },
  // Home advantage modifier per fan (sčítá se do totalHA v match-runner)
  HOME_ADVANTAGE_PER_FAN: {
    hardcore: 0.04,
    regular: 0.015,
    casual: 0.005,
  },
  // Atmosphere bonus dle fill ratio
  ATMOSPHERE: {
    sellOutThreshold: 0.9,
    sellOutBonus: 1.0,
    emptyThreshold: 0.15,
    emptyDebuff: -0.5,
  },
  // Tier promotion (loyalty progression) — počítají se home zápasy v řadě jako fan
  PROMOTION: {
    casualToRegular: { matchesNeeded: 4, conversionRate: 0.25 },
    regularToHardcore: { matchesNeeded: 8, conversionRate: 0.15 },
  },
  // Loss streak penalty (5 prohier v řadě)
  LOSS_STREAK_PENALTY: {
    matchesNeeded: 5,
    casualDecayRate: 0.3,
    regularDecayRate: 0.1,
  },
  // Walk-up = "lidi co přijdou na zápas náhodně, nejsou v žádném tieru"
  // - z vlastní vesnice: 5-10 % populace
  // - z okolních obcí (do 5 km): 0.5-1.5 % jejich populace (zájem regionu)
  WALK_UP_HOME: { min: 0.05, max: 0.10 },
  WALK_UP_REGIONAL: { min: 0.005, max: 0.015 },
  WALK_UP_REGIONAL_RADIUS_KM: 5,
  // Backfill koeficienty (% populace na startu) — realistické pro vesnický fotbal
  BACKFILL_RATIO: { hardcore: 0.010, regular: 0.040, casual: 0.070 },
} as const;

export const BUS_CONFIG = {
  MAX_DISTANCE_KM: 10,
  SIZES: {
    traktor: {
      cost: 1200,
      attendeesMin: 8,
      attendeesMax: 12,
      label: "Vlek za traktorem",
      description: "Strejda Pepa zapřáhne starý vlek za zetor. Jede to pomalu, smrdí to naftou, ale levně a babičky to milují.",
      icon: "🚜",
    },
    karosa: {
      cost: 2000,
      attendeesMin: 18,
      attendeesMax: 25,
      label: "Stará Karosa",
      description: "Vyřazená z OAD v devadesátých. Drnčí, na kopcích řve, ale doveze 25 lidí v kuse.",
      icon: "🚌",
    },
    autokar: {
      cost: 3500,
      attendeesMin: 30,
      attendeesMax: 45,
      label: "Pohodlný autokar",
      description: "Klimatizace, čalouněná sedadla, dokonce i WC. Lidi se těší už cestou tam.",
      icon: "🚍",
    },
  },
  CONVERSION: {
    THRESHOLD_3: { rate: 0.25, capPerVillage: 8 },
    THRESHOLD_5: { rate: 0.15, capPerVillage: 15 },
  },
  // Distance modifier: bližší obec = vyšší konverze (lidi z 3 km přijdou pravidelně).
  // 0 km = 1.5×, 3 km = 1.2×, 6 km = 0.9×, 10 km = 0.5× (clamp 0.5-1.5)
  DISTANCE_MOD: {
    base: 1.5,
    perKm: 0.1,
    minMod: 0.5,
    maxMod: 1.5,
  },
  STREAK_BREAK_AFTER: 3,
  STREAK_BREAK_DECAY: 0.5,
} as const;

export const PROMO_CONVERSION = {
  THRESHOLD_3: { rate: 0.3, cap: 10 },
  THRESHOLD_6: { rate: 0.25, cap: 20 },
  STREAK_BREAK_AFTER: 2,
  STREAK_BREAK_DECAY: 0.5,
  // PROMO_BOOST z matches.ts — copy pro konsistenci výpočtu drop-in
  PROMO_ATTENDANCE_BOOST: 0.25,
} as const;

export type BusSize = keyof typeof BUS_CONFIG.SIZES;

export interface TeamFanbaseRow {
  team_id: string;
  // Counts JEN z vlastní vesnice (loyalty progression působí na ně)
  hardcore_count: number;
  regular_count: number;
  casual_count: number;
  // Z propagačních článků (nevztahuje se na vesnici)
  promo_casual_count: number;
  casual_to_regular_streak: number;
  regular_to_hardcore_streak: number;
  promo_consecutive_matches: number;
  promo_unpromoted_streak: number;
}
