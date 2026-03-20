/**
 * Systém absencí hráčů — generování důvodů proč hráč nepřijde na zápas.
 *
 * Každý hráč má % šanci na absenci dle svých atributů a kontextu.
 */

import type { Rng } from "../generators/rng";
import type { GeneratedPlayer } from "../generators/player";

export interface AbsenceResult {
  playerIndex: number;
  reason: string;
  emoji: string;
  smsText: string;
}

interface AbsenceRule {
  reason: string;
  emoji: string;
  /** Base probability (0-1) */
  baseProb: number;
  /** Calculate weight modifier from player attributes */
  weight: (player: GeneratedPlayer) => number;
  /** SMS templates for this reason */
  smsTemplates: string[];
}

const ABSENCE_RULES: AbsenceRule[] = [
  {
    reason: "Kocovina",
    emoji: "\u{1F37A}",
    baseProb: 0.08,
    weight: (p) => p.alcohol / 20 * 1.5 + (20 - p.discipline) / 20 * 0.5,
    smsTemplates: [
      "Sorry trenere, neni mi dobr... vcera to bylo silny",
      "Dneska to nepujde. Vcera jsme to s klukama trochu pretahli",
      "Nemuzuu... hlava mi tresti. Priste urcite",
      "Trenere omlouvam se, mam zaludecni chripku (pivo)",
    ],
  },
  {
    reason: "Rodinný oběd",
    emoji: "\u{1F356}",
    baseProb: 0.06,
    weight: (p) => (p.age > 30 ? 1.3 : 0.8) * (20 - p.patriotism) / 20,
    smsTemplates: [
      "Dneska nemuzem, mame rodinnej obed u tchyne",
      "Zenská mi nedovoli. Mame narozeniny u svagra",
      "Dneska fakt nejde, slibil sem rodine ze budem doma",
      "Sorry, dneska zabijacka u taty. Priste si to vynahradim",
    ],
  },
  {
    reason: "Brigáda / přesčas",
    emoji: "\u{1F3D7}",
    baseProb: 0.05,
    weight: (p) => {
      const hardJobs = ["Zedník", "Tesař", "Řidič kamionu", "Skladník", "Pokrývač"];
      return hardJobs.includes(p.occupation) ? 1.5 : 0.7;
    },
    smsTemplates: [
      "Mam prescas, sef me nechce pustit",
      "Musim na brigadu, potrebuju penize na opravu auta",
      "Dneska delam, nenasli nahradnika",
      "Sezona, musim sklizet. Priste budu",
    ],
  },
  {
    reason: "Nemá odvoz",
    emoji: "\u{1F697}",
    baseProb: 0.04,
    weight: (p) => p.age < 20 ? 1.5 : p.age > 45 ? 0.3 : 0.6,
    smsTemplates: [
      "Nemam jak prijet, auto nejde",
      "Dneska mi nikdo nemuze svist",
      "Ujel mi bus a dalsi jede az vecer",
      "Auto ma zenská, nemam odvoz",
    ],
  },
  {
    reason: "Hlídání dětí",
    emoji: "\u{1F476}",
    baseProb: 0.04,
    weight: (p) => p.age >= 25 && p.age <= 40 ? 1.2 : 0.3,
    smsTemplates: [
      "Musim hlidat malou, zenská ma sluzbu",
      "Deti jsou nemocny, musim byt doma",
      "Trenere nemuzem, maly mi prinesl ze skolky chripku",
    ],
  },
  {
    reason: "Rybářské závody",
    emoji: "\u{1F3A3}",
    baseProb: 0.02,
    weight: (p) => p.age > 35 ? 1.5 : 0.5,
    smsTemplates: [
      "Dneska mam rybarsky zavody, uz sem prihlasenej",
      "Jedu na ryby s kamosema, uz to neslo odrikat",
    ],
  },
  {
    reason: "Rozchod",
    emoji: "\u{1F494}",
    baseProb: 0.01,
    weight: (p) => p.age < 30 ? 1.5 : 0.5,
    smsTemplates: [
      "Nemam naladu na nic. Dala mi kopacky",
      "Dneska fakt ne... mam osobni problemy",
    ],
  },
  {
    reason: "Zranění z práce",
    emoji: "\u{1F9B4}",
    baseProb: 0.03,
    weight: (p) => {
      const riskyJobs = ["Zedník", "Tesař", "Lesní dělník", "Pokrývač", "Svářeč"];
      return riskyJobs.includes(p.occupation) ? 1.5 : 0.5;
    },
    smsTemplates: [
      "Spadl sem ze stfechy, koleno v haji",
      "Vrazil sem si do ruky kladivem, nemuzem chytit mic",
      "Natah sem si zada pri praci, nemuzem se ohnout",
    ],
  },
  {
    reason: "Zapomněl",
    emoji: "\u{1F4FA}",
    baseProb: 0.02,
    weight: (p) => (20 - p.discipline) / 20 * 1.5,
    smsTemplates: [
      "Jee to je dneska?? Sorry uplne sem zapomel",
      "Ty vole ja sem myslel ze hrajem az pristi tyden",
    ],
  },
  {
    reason: "Simulování",
    emoji: "\u{1F912}",
    baseProb: 0.02,
    weight: (p) => (20 - p.discipline) / 20 * 0.8 + p.temper / 20 * 0.5,
    smsTemplates: [
      "Nemuzem, bolí me koleno (asi)",
      "Mam nachlazenej, radsi zustanem doma",
      "Necitim se dobre, radeji ne",
    ],
  },
];

/**
 * Determine which players are absent for a given round.
 *
 * @returns Array of absences with reasons and SMS text
 */
export function generateAbsences(
  rng: Rng,
  squad: GeneratedPlayer[],
): AbsenceResult[] {
  const absences: AbsenceResult[] = [];

  for (let i = 0; i < squad.length; i++) {
    const player = squad[i];

    for (const rule of ABSENCE_RULES) {
      const prob = rule.baseProb * rule.weight(player);
      if (rng.random() < prob) {
        absences.push({
          playerIndex: i,
          reason: rule.reason,
          emoji: rule.emoji,
          smsText: rng.pick(rule.smsTemplates),
        });
        break; // Max one absence reason per player
      }
    }
  }

  return absences;
}
