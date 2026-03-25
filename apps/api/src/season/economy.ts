/**
 * FMK-15: Ekonomický systém — sponzoři, vstupné, výdaje, rozpočet.
 */

import type { Rng } from "../generators/rng";
import { getDistrictDataFromDB, resolveSponsorName } from "../data/districts";

export interface Sponsor {
  name: string;
  type: string;
  monthlyAmount: number;
  winBonus: number;
}

export interface MatchIncome {
  attendance: number;
  ticketPrice: number;
  total: number;
  description: string;
}

export interface MonthlyBudget {
  income: {
    sponsors: number;
    playerContributions: number;
  };
  expenses: {
    pitchMaintenance: number;
    equipment: number;
    youth: number;
  };
  net: number;
}

export interface MatchDayExpenses {
  referee: number;
  travel: number;
  refreshments: number;
  total: number;
}

// Generované názvy sponzorů
const SPONSOR_TEMPLATES: Array<{ template: string; type: string }> = [
  { template: "Řeznictví {surname}", type: "obchod" },
  { template: "Autoservis {surname}", type: "remeslo" },
  { template: "Hospoda U {surname_genitive}", type: "hospoda" },
  { template: "Potraviny u {surname_genitive}", type: "obchod" },
  { template: "Stavby {surname}", type: "firma" },
  { template: "Pila {surname}", type: "firma" },
  { template: "Truhlářství {surname}", type: "remeslo" },
  { template: "Zemědělské družstvo", type: "firma" },
  { template: "Pekárna {surname}", type: "obchod" },
  { template: "Instalatérství {surname}", type: "remeslo" },
  { template: "Elektro {surname}", type: "remeslo" },
  { template: "Květinářství {surname}", type: "obchod" },
  { template: "Obecní úřad", type: "obec" },
];

const COMMON_SURNAMES = [
  "Novák", "Dvořák", "Svoboda", "Černý", "Procházka",
  "Kučera", "Veselý", "Horák", "Němec", "Marek",
  "Pokorný", "Hájek", "Jelínek", "Král", "Sedláček",
];

// Genitive forms for "U Dvořáků" etc.
const SURNAME_GENITIVES: Record<string, string> = {
  "Novák": "Nováků", "Dvořák": "Dvořáků", "Svoboda": "Svobodů",
  "Černý": "Černých", "Procházka": "Procházků", "Kučera": "Kučerů",
  "Veselý": "Veselých", "Horák": "Horáků", "Němec": "Němců",
  "Marek": "Marků", "Pokorný": "Pokorných", "Hájek": "Hájků",
  "Jelínek": "Jelínků", "Král": "Králů", "Sedláček": "Sedláčků",
};

/**
 * Generate sponsors for a team.
 * Uses district-specific real sponsors when available, falls back to generic templates.
 */
export async function generateSponsors(
  rng: Rng,
  villageCategory: string,
  reputation: number,
  district?: string,
  db?: D1Database,
): Promise<Sponsor[]> {
  const count = villageCategory === "vesnice" ? rng.int(1, 2)
    : villageCategory === "obec" ? rng.int(1, 3)
    : rng.int(2, 3);

  const districtData = db && district
    ? await getDistrictDataFromDB(db, district)
    : { surnames: {}, sponsors: [] };

  const pool = districtData.sponsors.length > 0 ? districtData.sponsors : [
    { name: "Řeznictví {surname}", type: "řeznictví", monthlyRange: [1500, 4000] as [number, number], winBonus: [200, 500] as [number, number] },
    { name: "Autoservis {surname}", type: "autoservis", monthlyRange: [2000, 5000] as [number, number], winBonus: [300, 600] as [number, number] },
    { name: "Hospoda U {surname}", type: "hospoda", monthlyRange: [1000, 3000] as [number, number], winBonus: [150, 400] as [number, number] },
    { name: "Potraviny {surname}", type: "potraviny", monthlyRange: [2500, 6000] as [number, number], winBonus: [300, 700] as [number, number] },
    { name: "Obecní úřad", type: "obec", monthlyRange: [3000, 8000] as [number, number], winBonus: [400, 800] as [number, number] },
  ];

  const hasReal = districtData.sponsors.length > 0;
  const repMod = reputation / 50;
  const sponsors: Sponsor[] = [];
  const usedIndices = new Set<number>();

  for (let i = 0; i < count; i++) {
    let idx: number;
    do {
      idx = rng.int(0, pool.length - 1);
    } while (usedIndices.has(idx) && usedIndices.size < pool.length);
    usedIndices.add(idx);

    const s = pool[idx];
    const name = hasReal ? s.name : resolveSponsorName(s.name, districtData.surnames, rng);

    const baseAmount = rng.int(s.monthlyRange[0], s.monthlyRange[1]);
    const monthlyAmount = Math.round(baseAmount * repMod);
    const winBonus = rng.int(s.winBonus[0], s.winBonus[1]);

    sponsors.push({ name, type: s.type, monthlyAmount, winBonus });
  }

  return sponsors;
}

/**
 * Calculate match day income (home game).
 */
export function calculateMatchIncome(
  rng: Rng,
  villagePopulation: number,
  villageCategory: string,
  leaguePosition: number,
  totalTeams: number,
): MatchIncome {
  // Base attendance from village size
  let baseAttendance = villageCategory === "vesnice" ? rng.int(15, 40)
    : villageCategory === "obec" ? rng.int(30, 80)
    : villageCategory === "mestys" ? rng.int(50, 150)
    : rng.int(80, 300);

  // Better position = more fans
  const positionMod = 1 + (totalTeams - leaguePosition) / totalTeams * 0.3;
  baseAttendance = Math.round(baseAttendance * positionMod);

  const ticketPrice = villageCategory === "vesnice" ? 10
    : villageCategory === "obec" ? 20
    : villageCategory === "mestys" ? 30
    : 50;

  const total = baseAttendance * ticketPrice;

  const descriptions = [
    `Na zápas přišlo ${baseAttendance} diváků. Vstupné ${ticketPrice} Kč.`,
    `${baseAttendance} fanoušků na tribuně (tedy u plotu).`,
    `Dnešní návštěva: ${baseAttendance}. U stánku se prodalo ${rng.int(10, baseAttendance)} piv.`,
  ];

  return {
    attendance: baseAttendance,
    ticketPrice,
    total,
    description: rng.pick(descriptions),
  };
}

/**
 * Calculate match day expenses.
 */
export function calculateMatchExpenses(
  rng: Rng,
  isHome: boolean,
  distanceKm: number,
): MatchDayExpenses {
  const referee = rng.int(800, 1500);
  const travel = isHome ? 0 : Math.round(distanceKm * rng.int(8, 15));
  const refreshments = rng.int(200, 800); // Pivo po zápase je povinné

  return {
    referee: isHome ? referee : 0,
    travel,
    refreshments,
    total: (isHome ? referee : 0) + travel + refreshments,
  };
}

/**
 * Calculate monthly budget.
 */
export function calculateMonthlyBudget(
  sponsors: Sponsor[],
  playerCount: number,
  villageCategory: string,
  youthMonthlyCost: number,
): MonthlyBudget {
  const sponsorIncome = sponsors.reduce((sum, s) => sum + s.monthlyAmount, 0);

  // Player contributions (lowest leagues only)
  const playerContribution = villageCategory === "vesnice" ? 100
    : villageCategory === "obec" ? 50
    : 0;
  const playerContributions = playerCount * playerContribution;

  // Expenses
  const pitchMaintenance = villageCategory === "vesnice" ? 500
    : villageCategory === "obec" ? 1000
    : villageCategory === "mestys" ? 2000
    : 3000;

  const equipment = 500; // Flat monthly amortization

  const income = { sponsors: sponsorIncome, playerContributions };
  const expenses = { pitchMaintenance, equipment, youth: youthMonthlyCost };

  const totalIncome = sponsorIncome + playerContributions;
  const totalExpenses = pitchMaintenance + equipment + youthMonthlyCost;

  return { income, expenses, net: totalIncome - totalExpenses };
}

/**
 * Match result rewards — sponzorský bonus + bonus od soutěže + fan bonus.
 */
export interface MatchResultReward {
  sponsorBonus: number;
  leagueBonus: number;
  fanBonus: number;
  total: number;
}

export function calculateMatchReward(
  result: "win" | "draw" | "loss",
  sponsors: Sponsor[],
  villageCategory: string,
): MatchResultReward {
  const sponsorBonus = result === "win"
    ? sponsors.reduce((s, sp) => s + sp.winBonus, 0)
    : result === "draw"
      ? Math.round(sponsors.reduce((s, sp) => s + sp.winBonus, 0) * 0.3)
      : 0;

  const leagueBonus = result === "win" ? 500 : result === "draw" ? 150 : 0;

  const fanBase = villageCategory === "vesnice" ? 50 : villageCategory === "obec" ? 100 : 200;
  const fanBonus = result === "win" ? fanBase : result === "draw" ? Math.round(fanBase * 0.5) : 0;

  const total = sponsorBonus + leagueBonus + fanBonus;
  return { sponsorBonus, leagueBonus, fanBonus, total };
}

/**
 * Season-end rewards by league position. Same for all teams regardless of village size.
 */
export interface SeasonReward {
  prize: number;
  reputationBonus: number;
  description: string;
}

export function calculateSeasonReward(
  position: number,
  totalTeams: number,
): SeasonReward {
  if (position === 1) return { prize: 15000, reputationBonus: 10, description: "Vítěz ligy!" };
  if (position === 2) return { prize: 10000, reputationBonus: 5, description: "Stříbrná příčka" };
  if (position === 3) return { prize: 5000, reputationBonus: 3, description: "Bronzová medaile" };
  if (position <= Math.ceil(totalTeams / 2)) return { prize: 2000, reputationBonus: 1, description: "Horní polovina tabulky" };
  return { prize: 0, reputationBonus: 0, description: "Dolní polovina tabulky" };
}

/**
 * Training cost per month based on sessions/week and village category.
 */
export function calculateTrainingCost(sessionsPerWeek: number, villageCategory: string): number {
  const costPerSession: Record<string, number> = {
    vesnice: 200,
    obec: 400,
    mestys: 600,
    mesto: 1000,
  };
  const perSession = costPerSession[villageCategory] ?? 400;
  return Math.round(perSession * sessionsPerWeek * 4.3);
}

/**
 * Player weekly wage based on overall rating.
 * Okresní fotbal — spíš cestovné a odměna za zápas než plat.
 */
export function calculatePlayerWage(overallRating: number): number {
  return Math.round(10 + (overallRating / 100) * 400);
}

/**
 * Equipment repair cost — scales with level and missing condition.
 */
export function calculateRepairCost(level: number, condition: number): number {
  const missing = 100 - condition;
  const costPerPercent = level * 30 + 20;
  return Math.round(missing * costPerPercent);
}
