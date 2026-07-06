/**
 * Zaměstnanci (realizační tým) — 12 rolí, sdílený pool per okres, kurzy.
 * Každý zaměstnanec má 7 atributů (1–20). Efektivita v roli = (2×primární + sekundární) / 3.
 * Zaměstnance lze najmout na libovolnou roli — atributy určují, jak dobrý v ní bude.
 */

export type StaffRole =
  | "asistent"
  | "trener_mladeze"
  | "trener_brankaru"
  | "kondicni_trener"
  | "maser"
  | "lekar"
  | "psycholog"
  | "spravce_hriste"
  | "skaut"
  | "obsluha"
  | "sef_fanklubu"
  | "ekonom";

export type StaffAttributeKey =
  | "coaching"
  | "medicine"
  | "maintenance"
  | "judgement"
  | "communication"
  | "work_rate"
  | "charm";

export type StaffGender = "m" | "f";

/** Vizuální seskupení slotů na FE. */
export type StaffGroup = "trenerske" | "zdravi" | "provoz" | "scouting";

export interface StaffMember {
  id: string;
  district: string;
  teamId: string | null; // null = volný kandidát
  role: StaffRole | null; // null dokud není najatý
  profession: StaffRole; // co umí nejlíp (původní profese)
  firstName: string;
  lastName: string;
  gender: StaffGender;
  age: number;
  coaching: number;
  medicine: number;
  maintenance: number;
  judgement: number;
  communication: number;
  workRate: number;
  charm: number;
  weeklyWage: number;
  signingFee: number;
  avatar: Record<string, unknown>; // facesjs faceConfig
  description: string | null;
  courseAttribute: StaffAttributeKey | null;
  coursePoints: number | null;
  courseWeeksRemaining: number | null;
  hiredAt: string | null;
  listedUntil: string | null;
}

export interface StaffRoleDef {
  label: string;
  primary: StaffAttributeKey;
  secondary: StaffAttributeKey;
  group: StaffGroup;
  /** Krátký popis co role dělá (efekt). */
  effectDesc: string;
}

/** České popisky atributů pro UI. */
export const STAFF_ATTRIBUTE_LABELS: Record<StaffAttributeKey, string> = {
  coaching: "Trénování",
  medicine: "Zdravověda",
  maintenance: "Údržba",
  judgement: "Úsudek",
  communication: "Komunikace",
  work_rate: "Pracovitost",
  charm: "Šarm",
};

export const STAFF_GROUP_LABELS: Record<StaffGroup, string> = {
  trenerske: "Trenérský štáb",
  zdravi: "Zdraví",
  provoz: "Provoz",
  scouting: "Scouting",
};

export const ROLE_DEFS: Record<StaffRole, StaffRoleDef> = {
  asistent: {
    label: "Asistent trenéra",
    primary: "coaching",
    secondary: "communication",
    group: "trenerske",
    effectDesc: "Zrychluje zlepšování hráčů při tréninku a zvedá docházku.",
  },
  trener_mladeze: {
    label: "Trenér mládeže",
    primary: "communication",
    secondary: "coaching",
    group: "trenerske",
    effectDesc: "Boost tréninku mladíků do 22 let a U21.",
  },
  trener_brankaru: {
    label: "Trenér brankářů",
    primary: "coaching",
    secondary: "judgement",
    group: "trenerske",
    effectDesc: "Boost tréninku brankářů a jejich výkon v zápase.",
  },
  kondicni_trener: {
    label: "Kondiční trenér",
    primary: "coaching",
    secondary: "work_rate",
    group: "trenerske",
    effectDesc: "Hráči ztrácejí méně kondice při tréninku i v zápase.",
  },
  maser: {
    label: "Masér",
    primary: "medicine",
    secondary: "work_rate",
    group: "zdravi",
    effectDesc: "Hráči denně regenerují víc kondice.",
  },
  lekar: {
    label: "Lékař",
    primary: "medicine",
    secondary: "judgement",
    group: "zdravi",
    effectDesc: "Zranění se hojí rychleji a nová bývají mírnější.",
  },
  psycholog: {
    label: "Psycholog",
    primary: "communication",
    secondary: "judgement",
    group: "trenerske",
    effectDesc: "Morálka týmu se drží výš.",
  },
  spravce_hriste: {
    label: "Správce hřiště",
    primary: "maintenance",
    secondary: "work_rate",
    group: "provoz",
    effectDesc: "Hřiště i vybavení se opotřebovává pomaleji.",
  },
  skaut: {
    label: "Skaut",
    primary: "judgement",
    secondary: "communication",
    group: "scouting",
    effectDesc: "Vyšší šance zahlédnout hráče soupeře + týdenní tip na talent.",
  },
  obsluha: {
    label: "Obsluha občerstvení",
    primary: "charm",
    secondary: "work_rate",
    group: "provoz",
    effectDesc: "Vyšší prodej občerstvení a spokojenější fanoušci.",
  },
  sef_fanklubu: {
    label: "Šéf fanklubu",
    primary: "communication",
    secondary: "charm",
    group: "provoz",
    effectDesc: "Vyšší návštěvnost a hlasitější domácí kotel.",
  },
  ekonom: {
    label: "Ekonom",
    primary: "judgement",
    secondary: "communication",
    group: "provoz",
    effectDesc: "Nižší provozní náklady a lepší sponzorské příjmy.",
  },
};

/** Pořadí rolí pro zobrazení slotů (seskupené). */
export const STAFF_ROLE_ORDER: StaffRole[] = [
  "asistent",
  "trener_mladeze",
  "trener_brankaru",
  "kondicni_trener",
  "psycholog",
  "maser",
  "lekar",
  "spravce_hriste",
  "obsluha",
  "sef_fanklubu",
  "ekonom",
  "skaut",
];

/** Hodnota atributu zaměstnance dle klíče (StaffAttributeKey → number). */
export function staffAttributeValue(
  m: Pick<
    StaffMember,
    "coaching" | "medicine" | "maintenance" | "judgement" | "communication" | "workRate" | "charm"
  >,
  key: StaffAttributeKey,
): number {
  switch (key) {
    case "coaching": return m.coaching;
    case "medicine": return m.medicine;
    case "maintenance": return m.maintenance;
    case "judgement": return m.judgement;
    case "communication": return m.communication;
    case "work_rate": return m.workRate;
    case "charm": return m.charm;
  }
}

/**
 * Efektivita zaměstnance v dané roli = (2×primární + sekundární) / 3, zaokrouhleno.
 * Rozsah 1–20 (jako atributy).
 */
export function staffEffectiveness(
  m: Pick<
    StaffMember,
    "coaching" | "medicine" | "maintenance" | "judgement" | "communication" | "workRate" | "charm"
  >,
  role: StaffRole,
): number {
  const def = ROLE_DEFS[role];
  const primary = staffAttributeValue(m, def.primary);
  const secondary = staffAttributeValue(m, def.secondary);
  return Math.round((2 * primary + secondary) / 3);
}
