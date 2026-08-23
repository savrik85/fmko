/**
 * Generátor stadionu — počáteční stav dle velikosti obce.
 * Menší obec = horší zázemí, větší město = lepší facilities.
 */

import type { Rng } from "../generators/rng";

export interface StadiumConfig {
  capacity: number;
  pitchCondition: number;
  pitchType: "natural" | "hybrid" | "artificial";
  changingRooms: number;
  showers: number;
  refreshments: number;
  lighting: number;
  stands: number;
  parking: number;
  fence: number;
}

const BASE_BY_SIZE: Record<string, StadiumConfig> = {
  hamlet: {
    capacity: 80, pitchCondition: 30, pitchType: "natural",
    changingRooms: 0, showers: 0, refreshments: 0, lighting: 0, stands: 0, parking: 0, fence: 0,
  },
  vesnice: {
    capacity: 150, pitchCondition: 40, pitchType: "natural",
    changingRooms: 1, showers: 0, refreshments: 0, lighting: 0, stands: 0, parking: 0, fence: 0,
  },
  obec: {
    capacity: 250, pitchCondition: 50, pitchType: "natural",
    changingRooms: 1, showers: 1, refreshments: 0, lighting: 0, stands: 0, parking: 1, fence: 0,
  },
  mestys: {
    capacity: 400, pitchCondition: 55, pitchType: "natural",
    changingRooms: 1, showers: 1, refreshments: 1, lighting: 0, stands: 1, parking: 1, fence: 1,
  },
  mesto: {
    capacity: 600, pitchCondition: 60, pitchType: "natural",
    changingRooms: 2, showers: 1, refreshments: 1, lighting: 0, stands: 1, parking: 1, fence: 1,
  },
  small_city: {
    capacity: 800, pitchCondition: 65, pitchType: "natural",
    changingRooms: 2, showers: 2, refreshments: 1, lighting: 0, stands: 1, parking: 2, fence: 1,
  },
  city: {
    capacity: 1200, pitchCondition: 70, pitchType: "hybrid",
    changingRooms: 2, showers: 2, refreshments: 2, lighting: 0, stands: 2, parking: 2, fence: 2,
  },
};

export function generateStadium(rng: Rng, villageSize: string): StadiumConfig {
  const base = BASE_BY_SIZE[villageSize] ?? BASE_BY_SIZE.obec;
  return {
    ...base,
    capacity: base.capacity + rng.int(-20, 40),
    pitchCondition: Math.max(10, Math.min(100, base.pitchCondition + rng.int(-10, 10))),
  };
}

/** Upgrade costs and effects */
export interface UpgradeOption {
  facility: string;
  label: string;
  currentLevel: number;
  nextLevel: number;
  cost: number;
  effect: string;
  locked?: boolean;
  /** Textové shrnutí — drží se kvůli starším klientům během deploye. */
  lockReason?: string;
  /** Všechny nesplněné podmínky najednou. */
  lockDetail?: LockDetail;
  /** Co s tím — konkrétní návod, ne jen konstatování. */
  lockHint?: string;
  /** Umí tenhle upgrade spolufinancovat obec? */
  villageCanFund?: boolean;
}

const FACILITY_LABELS: Record<string, string> = {
  changing_rooms: "Šatny",
  showers: "Sprchy",
  refreshments: "Občerstvení",
  lighting: "Osvětlení",
  stands: "Tribuny",
  roof: "Zastřešení tribun",
  ultras_stand: "Sektor kotle",
  toilets: "Sociálky",
  parking: "Parkoviště",
  fence: "Oplocení",
  entrance_gate: "Vstupní brána",
};

// Stadium = dlouhodobá investice přes více sezón
// Při čistém zisku ~1-2k Kč/týd (16-32k/sezóna):
// L1 = 1-2 sezóny šetření, L2 = 2-4 sezóny, L3 = 4-8 sezón
const UPGRADE_COSTS: Record<string, number[]> = {
  changing_rooms: [0, 25000, 85000, 220000],
  showers: [0, 18000, 60000, 160000],
  refreshments: [0, 5000, 110000, 280000],
  lighting: [0, 95000, 280000, 600000],
  stands: [0, 55000, 170000, 450000],
  roof: [0, 30000, 90000, 230000],
  ultras_stand: [0, 22000, 70000, 175000],
  toilets: [0, 12000, 40000, 100000],
  parking: [0, 20000, 60000, 150000],
  fence: [0, 15000, 50000, 130000],
  entrance_gate: [0, 12000, 45000, 120000],
};

const UPGRADE_EFFECTS: Record<string, string[]> = {
  changing_rooms: ["", "+3 morálka domácích", "+5 morálka, -5% zranění doma", "+8 morálka, -10% zranění"],
  showers: ["", "+2 regenerace kondice/den", "+4 regenerace kondice/den", "+6 regenerace kondice/den"],
  refreshments: ["", "Umožní vlastní provoz občerstvení", "Vyšší pronájem pro externí provozovatele", "Prémiové zázemí, bez výdajů za občerstvení po zápase"],
  lighting: ["", "2 základní osvětlovací stožáry", "4 stožáry — +5% návštěvnost", "Profesionální osvětlení — +10% návštěvnost"],
  stands: ["", "+50 kapacita", "+150 kapacita", "+300 kapacita"],
  roof: ["", "V ošklivém počasí odejde míň lidí", "Solidní zastřešení — počasí moc neřeší", "Kompletní střecha — na počasí kašlou"],
  ultras_stand: ["", "Hlasitější kotel — mírná výhoda doma", "Bubny a vlajky — větší výhoda doma", "Peklo pro soupeře — velká domácí výhoda"],
  toilets: ["", "Kadibudky místo kopřiv — +spokojenost", "Slušné záchodky — víc spokojenosti", "Čisté sociálky s teplou vodou — fanoušci spokojení"],
  parking: ["", "+5% návštěvnost", "+10% návštěvnost", "+15% návštěvnost"],
  fence: ["", "Víc lidí zaplatí vstupné", "Platí všichni diváci", "Platí všichni, prémiový stadion"],
  entrance_gate: ["", "Rychlejší odbavení — +2% návštěvnost", "2 turnikety — +5% návštěvnost", "Elektronické turnikety — +10% návštěvnost"],
};

// Unlock requirements per level
export interface UnlockReq {
  reputation?: number;
  matchesPlayed?: number;
  season?: number;
}

export const STADIUM_UNLOCK: Record<number, UnlockReq> = {
  1: {},
  2: { reputation: 50, matchesPlayed: 15 },
  3: { reputation: 70, matchesPlayed: 35, season: 3 },
};

/**
 * Cooldown in days per upgrade target level.
 *
 * TODO: zatím NEZAPOJENO — upgrade endpointy cooldown nekontrolují. Jsou to hotové
 * brzdy proti "L3 hned v první sezóně"; zapojení vyžaduje sloupec last_upgrade_at.
 * Zatím tu roli plní klesající výnosy reputace (lib/reputation.ts).
 */
export const STADIUM_COOLDOWN_DAYS: Record<number, number> = {
  1: 21,    // L0→L1: 3 týdny
  2: 56,    // L1→L2: 8 týdnů (půl sezóny)
  3: 112,   // L2→L3: 16 týdnů (celá sezóna)
};

export interface LockDetail {
  reputation?: { need: number; have: number };
  matchesPlayed?: { need: number; have: number };
  season?: { need: number; have: number };
  prerequisite?: string;
}

/** Zařízení, na která obec nabízí spolufinancování (village-processor INVESTMENT_TEMPLATES). */
const VILLAGE_FUNDABLE = new Set(["showers", "stands", "parking"]);

/** Textové shrnutí všech nesplněných podmínek — pro starší klienty a fallback. */
export function describeLock(d: LockDetail): string {
  const parts: string[] = [];
  if (d.reputation) parts.push(`reputace ${d.reputation.need}+ (máš ${d.reputation.have})`);
  if (d.matchesPlayed) parts.push(`${d.matchesPlayed.need}+ odehraných zápasů (máš ${d.matchesPlayed.have})`);
  if (d.season) parts.push(`sezóna ${d.season.need}+ (aktuální ${d.season.have})`);
  if (d.prerequisite) parts.push(d.prerequisite);
  return parts.length > 0 ? `Potřeba: ${parts.join(", ")}` : "Zamčeno";
}

export function getUpgradeOptions(
  stadium: Record<string, number>,
  teamReputation: number = 0,
  matchesPlayed: number = 0,
  currentSeason: number = 1,
  ignoreProgressLocks: boolean = false,
): UpgradeOption[] {
  const options: UpgradeOption[] = [];
  for (const [key, label] of Object.entries(FACILITY_LABELS)) {
    const current = stadium[key] ?? 0;
    if (current >= 3) continue;
    const next = current + 1;
    const costs = UPGRADE_COSTS[key];
    const effects = UPGRADE_EFFECTS[key];
    // Lokální vizuální testování může přeskočit časové/progresní podmínky,
    // ale logické návaznosti zařízení (např. střecha potřebuje tribunu) platí dál.
    const req = ignoreProgressLocks ? {} : (STADIUM_UNLOCK[next] ?? {});

    let locked = false;
    // lockDetail nese VŠECHNY nesplněné podmínky. Dřív se lockReason přiřazoval
    // sekvenčně, takže poslední kontrola přepsala předchozí — když chyběla reputace
    // i sezóna, hráč viděl jen sezónu.
    const lockDetail: LockDetail = {};

    if (req.reputation && teamReputation < req.reputation) {
      locked = true;
      lockDetail.reputation = { need: req.reputation, have: teamReputation };
    }
    if (req.matchesPlayed && matchesPlayed < req.matchesPlayed) {
      locked = true;
      lockDetail.matchesPlayed = { need: req.matchesPlayed, have: matchesPlayed };
    }
    if (req.season && currentSeason < req.season) {
      locked = true;
      lockDetail.season = { need: req.season, have: currentSeason };
    }

    // Zastřešení tribun vyžaduje aspoň základní tribuny (co jinak zastřešit?).
    if (key === "roof" && (stadium.stands ?? 0) < 1) {
      locked = true;
      lockDetail.prerequisite = "Nejdřív postav aspoň základní tribuny";
    }

    // Obec spolufinancuje jen tyhle cíle (viz INVESTMENT_TEMPLATES) — u ostatních
    // nesmíme slibovat, že se zámek dá obejít.
    const villageCanFund = VILLAGE_FUNDABLE.has(key);
    const lockReason = locked ? describeLock(lockDetail) : undefined;
    const lockHint = locked && lockDetail.reputation
      ? (villageCanFund
        ? "Reputaci zvedneš umístěním v lize, postupem v poháru, vyprodaným stadionem nebo sezónními akcemi. Nebo to obejdi — při dost vysoké přízni ti tenhle upgrade spolufinancuje obec."
        : "Reputaci zvedneš umístěním v lize, postupem v poháru, vyprodaným stadionem nebo sezónními akcemi. Přehled najdeš v sekci Reputace.")
      : undefined;

    options.push({
      facility: key,
      label,
      currentLevel: current,
      nextLevel: next,
      cost: costs[next] ?? 99999,
      effect: effects[next] ?? "",
      locked,
      lockReason,
      lockDetail: locked ? lockDetail : undefined,
      lockHint,
      villageCanFund,
    });
  }
  return options;
}

/** Calculated stadium facility effects for game logic */
export interface StadiumFacilityEffects {
  homeMoraleBonus: number;        // šatny: +morálka domácích hráčů
  homeInjuryReduction: number;    // šatny: snížení závažnosti zranění doma (0.0-0.10)
  conditionRegenBonus: number;    // sprchy: +body regenerace kondice/den
  refreshmentPerAttendee: number; // občerstvení: Kč příjem za diváka (external mode)
  noRefreshmentExpense: boolean;  // občerstvení L3: zruší výdaj za občerstvení
  attendanceBonus: number;        // osvětlení + parkoviště + vstupní brána: % bonus návštěvnosti
  capacityBonus: number;          // tribuny: +kapacita
  ticketPriceBonus: number;       // oplocení L2+: % bonus na cenu vstupného
  fencePayingRatio: number;       // oplocení: podíl diváků, kteří reálně zaplatí
  weatherAttendanceShield: number; // zastřešení: podíl počasového postihu návštěvy, který se zruší (0.0-1.0)
  homeAdvantageBonus: number;     // sektor kotle: + k domácí výhodě v zápase
  homeCrowdMoraleBonus: number;   // sektor kotle: + morálka domácích od kotle
  matchSatisfactionBonus: number; // sociálky: + spokojenost fanoušků po domácím zápase
}

export function calculateFacilityEffects(facilities: Record<string, number>): StadiumFacilityEffects {
  const cr = facilities.changing_rooms ?? 0;
  const sh = facilities.showers ?? 0;
  const re = facilities.refreshments ?? 0;
  const li = facilities.lighting ?? 0;
  const st = facilities.stands ?? 0;
  const pa = facilities.parking ?? 0;
  const fe = facilities.fence ?? 0;
  const ro = facilities.roof ?? 0;
  const ul = facilities.ultras_stand ?? 0;
  const to = facilities.toilets ?? 0;
  const eg = facilities.entrance_gate ?? 0;

  return {
    homeMoraleBonus: [0, 3, 5, 8][cr] ?? 0,
    homeInjuryReduction: [0, 0, 0.05, 0.10][cr] ?? 0,
    conditionRegenBonus: [0, 2, 4, 6][sh] ?? 0,
    refreshmentPerAttendee: [0, 8, 18, 30][re] ?? 0,
    noRefreshmentExpense: re >= 3,
    attendanceBonus: ([0, 0, 0.05, 0.10][li] ?? 0)
      + ([0, 0.05, 0.10, 0.15][pa] ?? 0)
      + ([0, 0.02, 0.05, 0.10][eg] ?? 0),
    capacityBonus: [0, 50, 150, 300][st] ?? 0,
    ticketPriceBonus: [0, 0, 0.10, 0.20][fe] ?? 0,
    fencePayingRatio: [0.3, 0.65, 1.0, 1.0][fe] ?? 0.3,
    weatherAttendanceShield: [0, 0.35, 0.65, 1.0][ro] ?? 0,
    homeAdvantageBonus: [0, 0.015, 0.03, 0.05][ul] ?? 0,
    homeCrowdMoraleBonus: [0, 1, 2, 3][ul] ?? 0,
    matchSatisfactionBonus: [0, 1, 2, 3][to] ?? 0,
  };
}

export { FACILITY_LABELS };
