/**
 * Sazebník pokut kabiny (spec docs/superpowers/specs/2026-11-27-fine-schedule-design.md).
 *
 * Trenér si sazebník skládá z hotových položek, nic se nepíše volně. Každá položka má
 * podmínku (kdy se pokuta zapíše), částku a opakování. Jen prohřešky, které hra sama pozná. Sdílené pro API i web, aby formulář nabízel přesně to, co server hlídá.
 */

export type FineItemKey =
  | "training_missed"
  | "training_broken_pledge"
  | "training_forgot_boots"
  | "match_excuse"
  | "match_hangover"
  | "yellow_card"
  | "red_card"
  | "suspension"
  | "penalty_miss"
  | "match_late"
  | "pub_before_match"
  | "pub_fight";

export type FineItemGroup = "training" | "match" | "off_pitch";

/** Pokuta je vždy v korunách (sloupec value_kind v DB zůstává kvůli starým záznamům). */
export type FineValueKind = "czk";
export type FineRepeatMode = "flat" | "double_from_second" | "first_free";

export interface FineConditionDef {
  key: string;
  label: string;
  /** Jak moc podmínka kabinu štve nad rámec částky (1 = rozumná, víc = past). */
  harshness: number;
}

export interface FineItemDef {
  key: FineItemKey;
  group: FineItemGroup;
  label: string;
  /** Jedna věta, co se pokutuje. */
  hint: string;
  conditions: FineConditionDef[];
  /**
   * Kolikrát za týden se prohřešek v průměrném kádru stane (z prod dat 11-27, na jednoho hráče).
   * Slouží k odhadu zátěže při předložení kapitánovi.
   */
  weeklyRatePerPlayer: Record<string, number>;
}

export const FINE_GROUP_LABELS: Record<FineItemGroup, string> = {
  training: "Trénink",
  match: "Zápas",
  off_pitch: "Mimo hřiště",
};

const ONE: FineConditionDef[] = [{ key: "any", label: "Pokaždé", harshness: 1 }];

export const FINE_ITEMS: readonly FineItemDef[] = [
  {
    key: "training_missed", group: "training", label: "Vynechaný trénink",
    hint: "Hráč nepřišel na trénink. Volno od trenéra a zranění se nikdy nepokutují.",
    conditions: [
      { key: "slacking", label: "Z flákání (zaspal, zapomněl, nebere telefon)", harshness: 1 },
      { key: "pub", label: "Kvůli hospodě", harshness: 1 },
      { key: "unexcused", label: "Jakýkoli neomluvený (flákání i hospoda)", harshness: 1.1 },
      { key: "any", label: "Úplně jakýkoli, i práce, rodina a škola", harshness: 2.5 },
    ],
    // ~0,65 flákání + ~0,7 hospoda na trénink a tým (18 hráčů), 2 tréninky týdně.
    weeklyRatePerPlayer: { slacking: 0.07, pub: 0.08, unexcused: 0.15, any: 0.75 },
  },
  {
    key: "training_broken_pledge", group: "training", label: "Slíbil, že přijde, a nepřišel",
    hint: "Hráč ti v SMS slíbil, že na trénink dorazí, a nedorazil.",
    conditions: ONE, weeklyRatePerPlayer: { any: 0.02 },
  },
  {
    key: "training_forgot_boots", group: "training", label: "Zapomenuté kopačky",
    hint: "Nepřišel, protože si nechal boty v práci.",
    conditions: ONE, weeklyRatePerPlayer: { any: 0.01 },
  },
  {
    key: "match_excuse", group: "match", label: "Omluvenka na zápas",
    hint: "Hráč se na zápas omluvil. Zranění, nemoc a stopka se nikdy nepokutují.",
    conditions: [
      { key: "hangover", label: "Kvůli kocovině nebo alkoholu", harshness: 1 },
      { key: "match_day", label: "Až v den zápasu", harshness: 1.6 },
      { key: "any", label: "Jakákoli omluvenka", harshness: 2.5 },
    ],
    weeklyRatePerPlayer: { hangover: 0.004, match_day: 0.03, any: 0.08 },
  },
  {
    key: "match_hangover", group: "match", label: "Na zápas s kocovinou",
    hint: "Na zápase bylo poznat, že včerejší hospoda se podepsala.",
    conditions: ONE, weeklyRatePerPlayer: { any: 0.01 },
  },
  {
    key: "yellow_card", group: "match", label: "Žlutá karta",
    hint: "Žlutá v mistrovském zápase.",
    conditions: [
      { key: "dissent", label: "Za protesty", harshness: 1 },
      { key: "foul", label: "Za faul", harshness: 2.2 },
      { key: "any", label: "Jakákoli", harshness: 2 },
    ],
    weeklyRatePerPlayer: { dissent: 0.003, foul: 0.05, any: 0.055 },
  },
  {
    key: "red_card", group: "match", label: "Červená karta",
    hint: "Vyloučení v mistrovském zápase.",
    conditions: [
      { key: "direct", label: "Přímá červená", harshness: 1 },
      { key: "second_yellow", label: "Druhá žlutá", harshness: 1.2 },
      { key: "any", label: "Jakákoli", harshness: 1.1 },
    ],
    weeklyRatePerPlayer: { direct: 0.003, second_yellow: 0.002, any: 0.005 },
  },
  {
    key: "suspension", group: "match", label: "Stopka za karty",
    hint: "Hráč nemůže hrát, protože nasbíral karty.",
    conditions: ONE, weeklyRatePerPlayer: { any: 0.005 },
  },
  {
    key: "penalty_miss", group: "match", label: "Neproměněná penalta",
    hint: "Pokuta za chybu ve hře, ne za chování. Kabina to nesnáší.",
    conditions: [{ key: "any", label: "Pokaždé", harshness: 3 }],
    weeklyRatePerPlayer: { any: 0.002 },
  },
  {
    key: "match_late", group: "match", label: "Pozdě na zápas",
    hint: "Dorazil až po výkopu a naskočil později.",
    conditions: ONE, weeklyRatePerPlayer: { any: 0.003 },
  },
  {
    key: "pub_before_match", group: "off_pitch", label: "Hospoda večer před zápasem",
    hint: "Hráč seděl v hospodě večer před mistrovským zápasem.",
    conditions: ONE, weeklyRatePerPlayer: { any: 0.05 },
  },
  {
    key: "pub_fight", group: "off_pitch", label: "Rvačka v hospodě",
    hint: "Hráč se v hospodě popral.",
    conditions: ONE, weeklyRatePerPlayer: { any: 0.002 },
  },
];

export const FINE_CZK_AMOUNTS = [20, 50, 100, 200, 500] as const;

export const FINE_REPEAT_LABELS: Record<FineRepeatMode, string> = {
  flat: "Pokaždé stejně",
  double_from_second: "Od druhého prohřešku dvojnásobek",
  first_free: "První v sezóně se promíjí",
};

export const MAX_FINE_ITEMS = 6;

export interface FineScheduleItemInput {
  itemKey: FineItemKey;
  conditionKey: string;
  valueKind: FineValueKind;
  amountCzk: number | null;
  repeatMode: FineRepeatMode;
}

export function fineItemDef(key: string): FineItemDef | undefined {
  return FINE_ITEMS.find((i) => i.key === key);
}

/** Kolik položka stojí v korunách (pro zátěž hráče). Staré záznamy v jiné hodnotě než korunách se počítají jako 0. */
export function fineCzkEquivalent(valueKind: string, amountCzk: number | null): number {
  return valueKind === "czk" ? amountCzk ?? 0 : 0;
}

/** Popis částky pro hráče („100 Kč“). */
export function fineValueLabel(_valueKind: string, amountCzk: number | null): string {
  return `${(amountCzk ?? 0).toLocaleString("cs-CZ")}\u00a0Kč`;
}

/** Chyba vstupu sazebníku, nebo null, když je v pořádku. */
export function validateFineItems(items: readonly FineScheduleItemInput[]): string | null {
  if (items.length > MAX_FINE_ITEMS) return `Sazebník může mít nejvýš ${MAX_FINE_ITEMS} položek.`;
  const seen = new Set<string>();
  for (const it of items) {
    const def = fineItemDef(it.itemKey);
    if (!def) return "Neznámá položka sazebníku.";
    if (!def.conditions.some((c) => c.key === it.conditionKey)) return `Neznámá podmínka u položky ${def.label}.`;
    const key = `${it.itemKey}|${it.conditionKey}`;
    if (seen.has(key)) return `Položka ${def.label} je v sazebníku dvakrát.`;
    seen.add(key);
    if (it.valueKind !== "czk" || !FINE_CZK_AMOUNTS.includes(it.amountCzk as (typeof FINE_CZK_AMOUNTS)[number])) return "Neplatná částka pokuty.";
    if (!(it.repeatMode in FINE_REPEAT_LABELS)) return "Neplatné opakování.";
  }
  return null;
}

/** Předvolba „Klasika okresu“: rozumný sazebník, který kapitán obvykle schválí. */
export const CLASSIC_FINE_SCHEDULE: readonly FineScheduleItemInput[] = [
  { itemKey: "training_missed", conditionKey: "slacking", valueKind: "czk", amountCzk: 50, repeatMode: "flat" },
  { itemKey: "training_missed", conditionKey: "pub", valueKind: "czk", amountCzk: 50, repeatMode: "flat" },
  { itemKey: "match_excuse", conditionKey: "hangover", valueKind: "czk", amountCzk: 100, repeatMode: "flat" },
  { itemKey: "yellow_card", conditionKey: "dissent", valueKind: "czk", amountCzk: 50, repeatMode: "flat" },
  { itemKey: "red_card", conditionKey: "any", valueKind: "czk", amountCzk: 100, repeatMode: "flat" },
  { itemKey: "training_forgot_boots", conditionKey: "any", valueKind: "czk", amountCzk: 20, repeatMode: "flat" },
];
