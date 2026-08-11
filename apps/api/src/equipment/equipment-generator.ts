import { describeLock, type LockDetail } from "../stadium/stadium-generator";
/**
 * Vybavení týmu v2 — kategorie, progression, reálné efekty.
 * Unlock podmínky: reputace, odehrané zápasy, sezóna.
 */

import type { Rng } from "../generators/rng";

// ── Categories ──

export const CATEGORIES = [
  "balls", "jerseys", "training_cones", "first_aid",
  "boots_stock", "bibs", "goalkeeper_gear", "water_bottles", "tactics_board",
  "team_van", "gym_corner", "training_wall", "club_grill", "fan_drums", "winter_gear", "video_setup",
  "laundry", "mower", "coffee_maker",
] as const;
export type EquipmentCategory = typeof CATEGORIES[number];

export const MAX_LEVEL = 3;

export const CATEGORY_LABELS: Record<string, string> = {
  balls: "Míče",
  jerseys: "Dresy",
  training_cones: "Tréninkové pomůcky",
  first_aid: "Lékárnička",
  boots_stock: "Sklad kopaček",
  bibs: "Rozlišováky",
  goalkeeper_gear: "Brankářské vybavení",
  water_bottles: "Láhve a občerstvení",
  tactics_board: "Taktická tabule",
  team_van: "Klubová dodávka",
  gym_corner: "Posilovna v kabině",
  training_wall: "Tréninková zeď",
  club_grill: "Klubový gril",
  fan_drums: "Kotel — bubny a vlajky",
  winter_gear: "Zimní výbava lavičky",
  video_setup: "Kamera a rozbory",
  laundry: "Pračka a sušárna dresů",
  mower: "Sekačka a traktůrek",
  coffee_maker: "Kávovar do kabiny",
};

// ── Level descriptions (Czech village humor) ──

const LEVEL_DESCRIPTIONS: Record<string, string[]> = {
  balls: [
    "3 prasklé Adidasy z 90. let",
    "5 použitelných míčů Gala",
    "10 slušných Select",
    "Sada profi míčů Adidas",
  ],
  jerseys: [
    "Každý v čem přišel z domu",
    "Sada z bazaru, víceméně stejná barva",
    "Nové dresy s čísly",
    "Profi dresy se jmény a sponzorem",
  ],
  training_cones: [
    "Kameny a větve místo kuželů",
    "10 kuželů a pár tyčí",
    "Kompletní sada s žebříky a kloboučky",
    "Profi tréninkový set s překážkami",
  ],
  first_aid: [
    "Panáky slivovice a staré obvazy",
    "Základní lékárnička z lékárny",
    "Obvazy, tejpy, chladící spray, led",
    "Komplet zdravotnický set s nosítky",
  ],
  boots_stock: [
    "Každý si nosí své, kdo nemá hraje v tesakách",
    "Pár náhradních kopaček ve skladu",
    "Kolíky, turfy i halu — základ pro každý povrch",
    "Komplet sklad obuvi všech velikostí",
  ],
  bibs: [
    "Tričko vs. holý hrudník",
    "Sada rozlišováků ve dvou barvách",
    "Rozlišováky + kapitánská páska + píšťalka",
    "Komplet příslušenství pro tréninky i zápasy",
  ],
  goalkeeper_gear: [
    "Brankář chytá v čem má",
    "Jedny brankářské rukavice a chrániče",
    "2 páry rukavic + chránič hrudi",
    "Komplet GK výbava — rukavice, chrániče, dres",
  ],
  water_bottles: [
    "Kdo má žízeň, napije se z kohoutku",
    "5 lahví a kyblík s houbou",
    "Sada lahví se stojánkem + izotonik",
    "Komplet pitný režim + energetické tyčinky",
  ],
  tactics_board: [
    "Trenér kreslí klackem do hlíny",
    "Magnetická tabule z bazaru",
    "Flipchart + sada magnetů se jmény",
    "Profi taktická tabule + video analýza",
  ],
  team_van: [
    "Kdo nemá auto, nedorazí",
    "Ojetá Felicia combi — vejde se pět kluků",
    "Devítimístná dodávka po elektrikáři",
    "Klubový mikrobus s logem",
  ],
  gym_corner: [
    "Posilovna? Zvedáme půllitry",
    "Činky a stará lavička v rohu kabiny",
    "Rotoped a hrazda",
    "Posilovna s trenažérem",
  ],
  training_wall: [
    "Na standardky se nevěří",
    "Zeď z palet za brankou",
    "Přenosné branky a figuríny",
    "Profi zeď + figuríny na kolečkách",
  ],
  club_grill: [
    "Po zápase se jde rovnou domů",
    "Gril z hobbymarketu za brankou",
    "Zděná udírna, dělá ji Pepa",
    "Klubovka s krbem a výčepem",
  ],
  fan_drums: [
    "Fandí jen štamgasti od piva",
    "Bedna vlajek a jeden buben",
    "Fanshop se šálami",
    "Kotel s bubny a chorea",
  ],
  winter_gear: [
    "V zimě se klepe celá lavička",
    "Deky a čaj v termosce",
    "Zimní bundy pro celou lavičku",
    "Vyhřívaná lavička jak v lize",
  ],
  video_setup: [
    "Rozbory? Vyprávění u piva",
    "Stará kamera na stativu",
    "GoPro + notebook",
    "Kamera + střižna, rozbory na plátně",
  ],
  laundry: [
    "Dresy pere každý doma, někdo nikdy",
    "Stará automatická pračka v kabině",
    "Pračka a sušička, do soboty je sucho",
    "Prádelna se sušárnou, dresy voní až na hřiště",
  ],
  mower: [
    "Trávu spase sousedovic koza",
    "Ojetá sekačka po Pepovi",
    "Zahradní traktůrek",
    "Profi sekačka, válec a značkovač lajn",
  ],
  coffee_maker: [
    "Ráno se to nějak rozchodí",
    "Rychlovarná konvice a Jacobs 3v1",
    "Překapávač a bylinkový čaj od Pepovy ženy",
    "Pákový kávovar, Pepa dělá i cappuccino",
  ],
};

// ── Upgrade effects (actual game modifiers) ──

export interface EquipmentEffects {
  trainingMultiplier: number;   // training improvement chance multiplier (1.0 = base)
  tacticsTrainingBonus: number; // extra bonus for tactics training type
  matchTechniqueMod: number;    // technique modifier in matches
  moraleMod: number;            // morale bonus
  injurySeverityMod: number;    // šance na zranění v zápase ×(1 - mod)
  conditionDrainMod: number;    // condition drain reduction in matches
  teamChemistryMod: number;     // chemie k taktickému tréninku (bibs + tabule)
  gkBonus: number;              // goalkeeper performance bonus
  injuryDaysReduction: number;  // lékárnička Lv2+: nové zranění o N dní kratší (min 2 dny)
  commuteAbsenceMod: number;    // dodávka: šance na absenci kvůli dojíždění ×(1 - mod)
  attendanceBonus: number;      // dodávka: bonus k docházce na trénink (aditivní k pravděpodobnosti)
  conditionRegenBonus: number;  // posilovna: denní regenerace kondice navíc (body)
  setPiecesMod: number;         // tréninková zeď: +standardky v zápase
  moraleTargetBonus: number;    // gril: denní drift morálky míří na 50 + bonus
  crowdMod: number;             // kotel: domácí návštěva ×(1 + mod)
  weatherResistMod: number;     // zimní výbava: postih počasí ×(1 - mod)
  youthTrainingMod: number;     // kamera: růst hráčů do 22 let ×(1 + mod)
  equipCareMod: number;         // pračka: šance na denní opotřebení OSTATNÍHO vybavení ×(1 - mod)
  pitchCareMod: number;         // sekačka: šance, že trávník ten den nechátrá
  hangoverMod: number;          // kávovar: šance na ranní kocovinu po hospodě ×(1 - mod)
}

/** Calculate actual game effects from equipment levels + conditions */
export function calculateEffects(levels: Record<string, number>, conditions: Record<string, number>): EquipmentEffects {
  const eff = (cat: string) => {
    const lv = levels[cat] ?? 0;
    const cond = conditions[`${cat}_condition`] ?? 50;
    return lv * (cond / 100);
  };

  const firstAidEff = eff("first_aid");

  return {
    trainingMultiplier: 1.0 + eff("balls") * 0.05 + eff("training_cones") * 0.07,
    tacticsTrainingBonus: eff("bibs") * 0.05 + eff("tactics_board") * 0.06,
    matchTechniqueMod: Math.round(eff("balls") * 1.5),
    moraleMod: Math.round(eff("jerseys") * 2.5),
    injurySeverityMod: firstAidEff * 0.10,
    conditionDrainMod: eff("boots_stock") * 0.05 + eff("water_bottles") * 0.03,
    teamChemistryMod: Math.round(eff("bibs") * 1.0 + eff("tactics_board") * 1.5),
    gkBonus: Math.round(eff("goalkeeper_gear") * 1.5),
    // Lékárnička Lv2+ „ošetření hned na hřišti" — opotřebení snižuje práh (Lv3 @ 50 % = 1 den)
    injuryDaysReduction: firstAidEff >= 2.5 ? 2 : firstAidEff >= 1.5 ? 1 : 0,
    commuteAbsenceMod: eff("team_van") * 0.15,
    attendanceBonus: eff("team_van") * 0.02,
    conditionRegenBonus: Math.round(eff("gym_corner")),
    setPiecesMod: Math.round(eff("training_wall") * 1.5),
    moraleTargetBonus: Math.round(eff("club_grill") * 2),
    crowdMod: eff("fan_drums") * 0.04,
    weatherResistMod: eff("winter_gear") * 0.15,
    youthTrainingMod: eff("video_setup") * 0.05,
    // Pračka je jediný meta-upgrade v katalogu — nezlepšuje hru přímo, ale drží
    // v kondici všechno ostatní. Dává smysl kupovat až po zbytku.
    equipCareMod: eff("laundry") * 0.15,
    pitchCareMod: eff("mower") * 0.30,
    hangoverMod: eff("coffee_maker") * 0.15,
  };
}

// ── Upgrade costs (significantly higher for progression) ──

// Ceny: Lv.1 = 1-2 týdny šetření, Lv.2 = půl sezóny, Lv.3 = celá sezóna+
// Při bilanci ~+2000 Kč/týd (= ~32 000 Kč/sezóna čistý zisk)
const UPGRADE_COSTS: Record<string, number[]> = {
  balls:           [0, 3000, 15000, 40000],
  jerseys:         [0, 4000, 18000, 50000],
  training_cones:  [0, 2000, 10000, 30000],
  first_aid:       [0, 1500, 8000, 25000],
  boots_stock:     [0, 3500, 15000, 45000],
  bibs:            [0, 1000, 6000, 18000],
  goalkeeper_gear: [0, 3000, 12000, 35000],
  water_bottles:   [0, 800, 4000, 12000],
  tactics_board:   [0, 2000, 10000, 30000],
  team_van:        [0, 25000, 90000, 220000],
  gym_corner:      [0, 6000, 25000, 80000],
  training_wall:   [0, 3000, 15000, 45000],
  club_grill:      [0, 4000, 15000, 120000],
  fan_drums:       [0, 5000, 20000, 60000],
  winter_gear:     [0, 2500, 12000, 70000],
  video_setup:     [0, 5000, 25000, 75000],
  laundry:         [0, 5000, 20000, 60000],
  mower:           [0, 8000, 30000, 90000],
  coffee_maker:    [0, 1500, 6000, 18000],
};

// ── Bazar a zastavárna — ceny ──

/**
 * Sazby pro druhotný trh s vybavením.
 *
 * ⚠️ INVARIANT: spodní mez bazaru se MUSÍ rovnat výkupu zastavárny při stavu 100 %.
 * Proto se getBazarPriceBand().min počítá doslova jako getPawnQuote(cat, level, 100),
 * ne druhým nezávislým vzorcem — jinak by zaokrouhlení otevřelo škvíru.
 *
 * Kdyby spodní mez klesala se stavem, vznikne tiskárna peněz: koupím v bazaru ojetou
 * Lv3 levně, opravím za level×500 a zastavím za plnou cenu. U míčů Lv3 to dělá
 * +3 720 Kč na kolo, u dodávky přes 28 000 Kč. S plochou mezí je bilance po opravě
 * vždycky záporná, a to nezávisle na cenách oprav.
 */
export const PAWN_RATE = 0.30;
export const BAZAR_SUGGESTED_RATE = 0.65;

/** Kumulativní investice do kategorie na daný level (co mě to celkem stálo v obchodě). */
export function cumulativeInvestment(category: string, level: number): number {
  const costs = UPGRADE_COSTS[category];
  if (!costs) return 0;
  let total = 0;
  for (let lv = 1; lv <= Math.min(level, MAX_LEVEL); lv++) total += costs[lv] ?? 0;
  return total;
}

/** Kolik by mě v obchodě stála cesta z fromLevel na toLevel — pro srovnání „v obchodě máš za". */
export function shopCostFromLevel(category: string, fromLevel: number, toLevel: number): number {
  return Math.max(0, cumulativeInvestment(category, toLevel) - cumulativeInvestment(category, fromLevel));
}

/**
 * Opotřebení netrestá lineárně (0.50 … 1.00). Kdyby ano, šrot by byl skoro zadarmo
 * a nikdo by ho neprodával — rovnou by se vyhazoval.
 */
export function equipmentConditionFactor(condition: number): number {
  const c = Math.max(0, Math.min(100, condition));
  return 0.5 + 0.5 * (c / 100);
}

/** Ceny zaokrouhlujeme, ať v UI nesvítí „17 399 Kč". */
function roundPrice(value: number): number {
  return value >= 10000 ? Math.round(value / 100) * 100 : Math.round(value / 10) * 10;
}

/** Výkup zastavárny — nejméně výhodná cesta ven, stav rozhoduje. */
export function getPawnQuote(category: string, level: number, condition: number): number {
  if (level <= 0) return 0;
  return roundPrice(cumulativeInvestment(category, level) * PAWN_RATE * equipmentConditionFactor(condition));
}

export interface BazarPriceBand {
  min: number;
  suggested: number;
  max: number;
}

export function getBazarPriceBand(category: string, level: number, condition: number): BazarPriceBand {
  const invested = cumulativeInvestment(category, level);
  // min = výkup zastavárny při stavu 100 %. Viz invariant výše — NEPŘEPISOVAT na vlastní vzorec.
  const min = getPawnQuote(category, level, 100);
  const suggested = Math.max(min, roundPrice(invested * BAZAR_SUGGESTED_RATE * equipmentConditionFactor(condition)));
  return { min, suggested, max: Math.max(min, invested) };
}

export interface SellOption {
  category: string;
  label: string;
  level: number;
  condition: number;
  invested: number;
  pawnQuote: number;
  bazarMin: number;
  bazarSuggested: number;
  bazarMax: number;
}

/** Co všechno můžu prodat — počítá se z už načtených levelů a stavů, nula dotazů navíc. */
export function getSellOptions(levels: Record<string, number>, conditions: Record<string, number>): SellOption[] {
  const options: SellOption[] = [];
  for (const cat of CATEGORIES) {
    const level = levels[cat] ?? 0;
    if (level <= 0) continue;
    const condition = conditions[`${cat}_condition`] ?? 50;
    const band = getBazarPriceBand(cat, level, condition);
    options.push({
      category: cat,
      label: CATEGORY_LABELS[cat],
      level,
      condition,
      invested: cumulativeInvestment(cat, level),
      pawnQuote: getPawnQuote(cat, level, condition),
      bazarMin: band.min,
      bazarSuggested: band.suggested,
      bazarMax: band.max,
    });
  }
  return options;
}

// ── Unlock requirements per level ──

interface UnlockReq {
  reputation?: number;
  matchesPlayed?: number;
  season?: number;
}

export const UNLOCK_REQUIREMENTS: Record<number, UnlockReq> = {
  1: {},                                                   // Always available
  2: { reputation: 40, matchesPlayed: 5 },                 // Need some progress
  3: { reputation: 60, matchesPlayed: 15, season: 2 },     // Need serious progress + season 2
};

/** Cooldown in days per upgrade target level */
/**
 * TODO: zatím NEZAPOJENO — upgrade endpointy cooldown nekontrolují.
 * Viz poznámka u STADIUM_COOLDOWN_DAYS ve stadium-generator.ts.
 */
export const EQUIPMENT_COOLDOWN_DAYS: Record<number, number> = {
  1: 7,    // L0→L1: 1 week
  2: 21,   // L1→L2: 3 weeks
  3: 42,   // L2→L3: 6 weeks
};

/**
 * Popis bonusu pro danou úroveň.
 *
 * Každá položka musí dávat smysl SAMA O SOBĚ — na kartě i v bazaru se zobrazuje
 * vždycky jen jedna, ne celý sloupec. Zkratky typu „+10 %, +2 chemie" nebo
 * „o 30 % pomaleji" vypadaly jako oříznutý text, protože jim chyběl podmět.
 */
const UPGRADE_EFFECT_LABELS: Record<string, string[]> = {
  balls:           ["", "+5 % trénink", "+10 % trénink, +1 technika v zápase", "+20 % trénink, +4 technika v zápase"],
  jerseys:         ["", "+2 morálka", "+5 morálka", "+8 morálka a zájem sponzorů"],
  training_cones:  ["", "+7 % efektivita tréninku", "+14 % efektivita tréninku", "+21 % efektivita tréninku"],
  first_aid:       ["", "Šance na zranění -10 %", "Šance na zranění -20 %, nová o den kratší", "Šance na zranění -30 %, nová o 2 dny kratší"],
  boots_stock:     ["", "Ztráta kondice -5 %", "Ztráta kondice -10 %", "Ztráta kondice -15 %"],
  bibs:            ["", "+5 % taktický trénink, +1 chemie", "+10 % taktický trénink, +2 chemie", "+15 % taktický trénink, +3 chemie"],
  goalkeeper_gear: ["", "+1 výkon brankáře", "+3 výkon brankáře", "+5 výkon brankáře"],
  water_bottles:   ["", "Ztráta kondice -3 %", "Ztráta kondice -6 %", "Ztráta kondice -9 %"],
  tactics_board:   ["", "+6 % taktický trénink, +1 chemie", "+12 % taktický trénink, +3 chemie", "+18 % taktický trénink, +5 chemie"],
  team_van:        ["", "Absence z dojíždění -15 %, +2 % docházka", "Absence z dojíždění -30 %, +4 % docházka", "Absence z dojíždění -45 %, +6 % docházka"],
  gym_corner:      ["", "+1 kondice denně", "+2 kondice denně", "+3 kondice denně"],
  training_wall:   ["", "+1 standardky v zápase", "+3 standardky v zápase", "+5 standardky v zápase"],
  club_grill:      ["", "Nálada kabiny drží na 52", "Nálada kabiny drží na 54", "Nálada kabiny drží na 56"],
  fan_drums:       ["", "+4 % domácí návštěva", "+8 % domácí návštěva", "+12 % domácí návštěva"],
  winter_gear:     ["", "Postih počasí -15 %", "Postih počasí -30 %", "Postih počasí -45 %"],
  video_setup:     ["", "Hráči do 22 let +5 % trénink", "Hráči do 22 let +10 % trénink", "Hráči do 22 let +15 % trénink"],
  laundry:         ["", "Vybavení chátrá o 15 % pomaleji", "Vybavení chátrá o 30 % pomaleji", "Vybavení chátrá o 45 % pomaleji"],
  mower:           ["", "Trávník vydrží 30 % dní bez opotřebení", "Trávník vydrží 60 % dní bez opotřebení", "Trávník vydrží 90 % dní bez opotřebení"],
  coffee_maker:    ["", "Kocovina o 15 % míň častá", "Kocovina o 30 % míň častá", "Kocovina o 45 % míň častá"],
};

// ── Starting equipment by village size ──

export interface EquipmentConfig {
  [key: string]: number;
}

const BASE_BY_SIZE: Record<string, EquipmentConfig> = {
  hamlet:     { balls: 0, jerseys: 0, training_cones: 0, first_aid: 0, boots_stock: 0, bibs: 0, goalkeeper_gear: 0, water_bottles: 0, tactics_board: 0 },
  vesnice:    { balls: 0, jerseys: 1, training_cones: 0, first_aid: 0, boots_stock: 0, bibs: 0, goalkeeper_gear: 0, water_bottles: 0, tactics_board: 0 },
  obec:       { balls: 1, jerseys: 1, training_cones: 0, first_aid: 0, boots_stock: 0, bibs: 0, goalkeeper_gear: 0, water_bottles: 1, tactics_board: 0 },
  mestys:     { balls: 1, jerseys: 1, training_cones: 1, first_aid: 0, boots_stock: 0, bibs: 1, goalkeeper_gear: 0, water_bottles: 1, tactics_board: 0 },
  mesto:      { balls: 1, jerseys: 1, training_cones: 1, first_aid: 1, boots_stock: 0, bibs: 1, goalkeeper_gear: 1, water_bottles: 1, tactics_board: 1 },
  small_city: { balls: 1, jerseys: 1, training_cones: 1, first_aid: 1, boots_stock: 1, bibs: 1, goalkeeper_gear: 1, water_bottles: 1, tactics_board: 1 },
  city:       { balls: 2, jerseys: 2, training_cones: 1, first_aid: 1, boots_stock: 1, bibs: 1, goalkeeper_gear: 1, water_bottles: 1, tactics_board: 1 },
};

export function generateEquipment(rng: Rng, villageSize: string): EquipmentConfig {
  const base = BASE_BY_SIZE[villageSize] ?? BASE_BY_SIZE.obec;
  const condRange = villageSize === "hamlet" || villageSize === "vesnice" ? [30, 60] : [40, 75];
  const result: EquipmentConfig = {};

  for (const cat of CATEGORIES) {
    result[cat] = base[cat] ?? 0;
    result[`${cat}_condition`] = rng.int(condRange[0], condRange[1]);
  }

  return result;
}

// ── Upgrade/Repair options ──

export interface UpgradeOption {
  category: string;
  label: string;
  currentLevel: number;
  nextLevel: number;
  cost: number;
  effect: string;
  description: string;
  locked: boolean;
  /** Textové shrnutí — drží se kvůli starším klientům během deploye. */
  lockReason?: string;
  /** Všechny nesplněné podmínky najednou. */
  lockDetail?: LockDetail;
  /** Co s tím — konkrétní návod, ne jen konstatování. */
  lockHint?: string;
}

export type { LockDetail } from "../stadium/stadium-generator";

export interface RepairOption {
  category: string;
  label: string;
  level: number;
  condition: number;
  cost: number;
}

export interface LevelUnlock {
  locked: boolean;
  detail?: LockDetail;
  reason?: string;
  hint?: string;
}

/**
 * Nárok na konkrétní úroveň vybavení.
 *
 * Vytaženo z getUpgradeOptions, protože bazar potřebuje zámek pro LIBOVOLNÝ cílový
 * level (koupím rovnou Lv3), zatímco obchod řeší vždycky jen current+1. Musí to být
 * jedna funkce — kdyby se logika rozdvojila, bazar by časem začal pouštět dál než obchod.
 */
export function checkLevelUnlock(
  targetLevel: number,
  teamReputation: number,
  matchesPlayed: number,
  currentSeason: number,
): LevelUnlock {
  const req = UNLOCK_REQUIREMENTS[targetLevel] ?? {};

  let locked = false;
  // Všechny nesplněné podmínky najednou — dřív poslední kontrola přepsala předchozí.
  const detail: LockDetail = {};

  if (req.reputation && teamReputation < req.reputation) {
    locked = true;
    detail.reputation = { need: req.reputation, have: teamReputation };
  }
  if (req.matchesPlayed && matchesPlayed < req.matchesPlayed) {
    locked = true;
    detail.matchesPlayed = { need: req.matchesPlayed, have: matchesPlayed };
  }
  if (req.season && currentSeason < req.season) {
    locked = true;
    detail.season = { need: req.season, have: currentSeason };
  }

  if (!locked) return { locked: false };

  return {
    locked: true,
    detail,
    reason: describeLock(detail),
    hint: detail.reputation
      ? "Reputaci zvedneš umístěním v lize, postupem v poháru, vyprodaným stadionem nebo sezónními akcemi. Přehled najdeš v sekci Reputace."
      : undefined,
  };
}

export function getUpgradeOptions(
  levels: Record<string, number>,
  teamReputation: number,
  matchesPlayed: number,
  currentSeason: number = 1,
): UpgradeOption[] {
  const options: UpgradeOption[] = [];

  for (const cat of CATEGORIES) {
    const current = levels[cat] ?? 0;
    if (current >= MAX_LEVEL) continue;
    const next = current + 1;
    const costs = UPGRADE_COSTS[cat];
    const unlock = checkLevelUnlock(next, teamReputation, matchesPlayed, currentSeason);

    options.push({
      category: cat,
      label: CATEGORY_LABELS[cat],
      currentLevel: current,
      nextLevel: next,
      cost: costs[next] ?? 99999,
      effect: UPGRADE_EFFECT_LABELS[cat]?.[next] ?? "",
      description: LEVEL_DESCRIPTIONS[cat]?.[next] ?? "",
      locked: unlock.locked,
      lockReason: unlock.reason,
      lockDetail: unlock.detail,
      lockHint: unlock.hint,
    });
  }

  return options;
}

export function getRepairOptions(levels: Record<string, number>, conditions: Record<string, number>): RepairOption[] {
  const options: RepairOption[] = [];
  for (const cat of CATEGORIES) {
    const level = levels[cat] ?? 0;
    const cond = conditions[`${cat}_condition`] ?? 50;
    if (level === 0 || cond >= 60) continue;
    options.push({
      category: cat,
      label: CATEGORY_LABELS[cat],
      level,
      condition: cond,
      cost: level * 500, // Slightly higher repair cost
    });
  }
  return options;
}

export function getLevelDescription(category: string, level: number): string {
  return LEVEL_DESCRIPTIONS[category]?.[level] ?? "";
}

/** Textový popis bonusu na dané úrovni — bazar ho ukazuje na kartě nabídky. */
export function getUpgradeEffectLabel(category: string, level: number): string {
  return UPGRADE_EFFECT_LABELS[category]?.[level] ?? "";
}
