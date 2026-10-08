/**
 * Úkoly zaměstnanců (kromě skauta, ten má vlastní skauting).
 *
 * Zaměstnanec dává pořád svůj trvalý bonus, úkol je práce navíc, kterou zadává manažer:
 *  - zápasový úkol (`match`) je příprava na nejbližší ligový zápas; po něm má zaměstnanec
 *    pár dní oddech, takže se musí vybírat, na který zápas ho nasadit,
 *  - dlouhý úkol (`weekly`) běží zvolený počet dní a pracuje se v něm s konkrétním hráčem.
 *
 * Sdílené pro API i web, aby formulář ukazoval stejnou cenu, jakou server strhne.
 * Ceny jsou ukotvené skautem (rozbor soupeře 500 Kč) a propagací zápasu (500–2 500 Kč).
 */

import type { StaffRole } from "./staff";

export type StaffTaskType =
  | "doctor_checkup"
  | "doctor_injury_care"
  | "massage_prep"
  | "set_piece_drill"
  | "fitness_prep"
  | "pitch_prep"
  | "fan_choreo"
  | "bar_program"
  | "psych_session"
  | "youth_plan"
  | "gk_plan"
  | "sponsor_care"
  | "weight_plan"
  | "weight_gain";

export type StaffTaskKind = "match" | "weekly";
export type StaffTaskStatus = "active" | "done" | "cancelled" | "failed";

/** Na koho se úkol zadává. */
export type StaffTaskTarget =
  | "none"
  /** Jeden hráč z kádru (áčko i U21). */
  | "player"
  /** Až `maxPlayers` hráčů z áčka. */
  | "players";

export interface StaffTaskDef {
  role: StaffRole;
  kind: StaffTaskKind;
  label: string;
  /** Co úkol udělá, jednou větou pro hráče. */
  description: string;
  /** Cena za úkol (zápasový) nebo za 7 dní (dlouhý). */
  cost: number;
  target: StaffTaskTarget;
  maxPlayers?: number;
  /** Jen na domácí zápas. */
  homeOnly?: boolean;
  /** Možné délky dlouhého úkolu ve dnech. */
  durations?: readonly number[];
}

/** Po zápasovém úkolu má zaměstnanec tolik dní oddech (liga se hraje po a čt, takže jeden zápas vynechá). */
export const STAFF_TASK_MATCH_COOLDOWN_DAYS = 7;
/** Stejný hráč nesmí na sezení k psychologovi dřív než po tolika dnech od posledního. */
export const PSYCH_SESSION_PLAYER_GAP_DAYS = 14;
/** Individuální plán trenéra mládeže jen do tohoto věku. */
export const YOUTH_PLAN_AGE_MAX = 21;

export const STAFF_TASK_DEFS: Record<StaffTaskType, StaffTaskDef> = {
  doctor_checkup: {
    role: "lekar", kind: "match", target: "none", cost: 600,
    label: "Prohlídka před zápasem",
    description: "Projde hráče před zápasem a odhalí, kdo je na hraně. V zápase je menší šance na zranění.",
  },
  doctor_injury_care: {
    role: "lekar", kind: "weekly", target: "player", cost: 500, durations: [7, 14],
    label: "Péče o zraněného",
    description: "Věnuje se jednomu zraněnému hráči každý den. Uzdraví se výrazně dřív.",
  },
  massage_prep: {
    role: "maser", kind: "match", target: "players", maxPlayers: 5, cost: 300,
    label: "Regenerace před zápasem",
    description: "Ráno v den zápasu promasíruje vybrané hráče. Do zápasu půjdou s lepší kondicí.",
  },
  set_piece_drill: {
    role: "asistent", kind: "match", target: "none", cost: 200,
    label: "Nácvik standardek",
    description: "Před zápasem nacvičí s týmem rohy a přímé kopy. Standardky v zápase půjdou líp.",
  },
  fitness_prep: {
    role: "kondicni_trener", kind: "match", target: "none", cost: 200,
    label: "Kondiční příprava",
    description: "Rozvrhne zátěž před zápasem tak, aby hráčům vydržely síly do konce.",
  },
  pitch_prep: {
    role: "spravce_hriste", kind: "match", target: "none", cost: 800, homeOnly: true,
    label: "Příprava trávníku",
    description: "Ráno před domácím zápasem poseká, uválí a zalije trávník.",
  },
  fan_choreo: {
    role: "sef_fanklubu", kind: "match", target: "none", cost: 1000, homeOnly: true,
    label: "Choreo a svolávačka",
    description: "Obvolá fanoušky a připraví choreo. Přijde víc lidí a tým to poponese.",
  },
  bar_program: {
    role: "obsluha", kind: "match", target: "none", cost: 700, homeOnly: true,
    label: "Grilovačka po zápase",
    description: "Po domácím zápase připraví u bufetu grilovačku. Fanoušci odcházejí spokojenější.",
  },
  psych_session: {
    role: "psycholog", kind: "weekly", target: "player", cost: 500, durations: [7],
    label: "Sezení s hráčem",
    description: "Týden se věnuje jednomu hráči. Zvedne mu náladu a uklidní ho, když chce pryč.",
  },
  youth_plan: {
    role: "trener_mladeze", kind: "weekly", target: "player", cost: 500, durations: [14, 28],
    label: "Individuální plán",
    description: "Připraví mladému hráči vlastní tréninkový plán. Na tréninku se zlepšuje rychleji.",
  },
  gk_plan: {
    role: "trener_brankaru", kind: "weekly", target: "player", cost: 500, durations: [14, 28],
    label: "Individuální trénink brankáře",
    description: "Trénuje s jedním brankářem zvlášť. Na tréninku se zlepšuje rychleji.",
  },
  weight_plan: {
    role: "kondicni_trener", kind: "weekly", target: "player", cost: 400, durations: [14, 28],
    label: "Plán hubnutí",
    description: "Hlídá jednomu hráči s nadváhou jídelníček a po tréninku s ním běhá. Hubne jen ten, kdo na trénink chodí.",
  },
  weight_gain: {
    role: "kondicni_trener", kind: "weekly", target: "player", cost: 400, durations: [14, 28],
    label: "Plán nabírání",
    description: "Hráči s podváhou naplánuje posilovnu a pořádné jídlo. Nabírá jen ten, kdo na trénink chodí.",
  },
  sponsor_care: {
    role: "ekonom", kind: "weekly", target: "none", cost: 300, durations: [14],
    label: "Péče o sponzory",
    description: "Dva týdny obchází firmy v okrese s dárkovým košem. Majitelé firem klub vidí raději a při jednání jsou vstřícnější.",
  },
};

export const STAFF_TASK_TYPES = Object.keys(STAFF_TASK_DEFS) as StaffTaskType[];

export function staffTasksForRole(role: StaffRole): StaffTaskType[] {
  return STAFF_TASK_TYPES.filter((t) => STAFF_TASK_DEFS[t].role === role);
}

/** Celková cena úkolu: zápasový platí jednou, dlouhý po započatých 7 dnech. */
export function staffTaskCost(type: StaffTaskType, durationDays?: number): number {
  const def = STAFF_TASK_DEFS[type];
  if (def.kind === "match") return def.cost;
  const days = durationDays ?? def.durations?.[0] ?? 7;
  return def.cost * Math.ceil(days / 7);
}

/** Úkol zaměstnance, jak ho vrací API. */
export interface StaffTaskView {
  id: string;
  staffId: string;
  taskType: StaffTaskType;
  kind: StaffTaskKind;
  status: StaffTaskStatus;
  targetPlayerId: string | null;
  targetPlayerName: string | null;
  targetMatchId: string | null;
  targetMatchLabel: string | null;
  playerNames: string[];
  startsGameDate: string;
  endsGameDate: string;
  costPaid: number;
  resultText: string | null;
  endReason: string | null;
}

/** Hráč v nabídce úkolu: jen to, podle čeho manažer vybírá. */
export interface StaffTaskPlayer {
  id: string;
  name: string;
  age: number;
  position: string;
  isU21: boolean;
  rating: number | null;
  injuryDays: number | null;
  injuryDaysTotal: number | null;
  /** Popis zranění, jak ho vidí hráč („podvrtnutý kotník“). */
  injuryName: string | null;
  condition: number | null;
  morale: number | null;
  unrest: number | null;
  /** Sestava na příští ligový zápas: `start` základ, `bench` lavička, `out` mimo, `null` neví se (sestava není, lavičku vybere automat). */
  lineup: "start" | "bench" | "out" | null;
  /** Sezení s psychologem jde znovu až od tohoto herního dne (YYYY-MM-DD), jinak `null`. */
  psychAgainFrom: string | null;
  /** Váha v kg (postava), `null` bez údaje. */
  weight: number | null;
  /** Váha slovy (API playerBodyView), pro plán hubnutí jen over a obese. */
  weightCategory: "under" | "ideal" | "muscular" | "over" | "obese" | null;
  /** Kg nad ideálem, `null` bez výšky nebo váhy. */
  weightExcess: number | null;
}
