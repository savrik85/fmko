/**
 * Sazebník pokut kabiny (spec docs/superpowers/specs/2026-11-27-fine-schedule-design.md).
 *
 * Trenér si sazebník skládá z hotových položek, nic se nepíše volně. Každá položka má
 * podmínku (kdy se pokuta zapíše), hodnotu (peníze, basa, runda, kolečka, praní dresů)
 * a opakování. Sdílené pro API i web, aby formulář nabízel přesně to, co server hlídá.
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
  | "pub_fight"
  | "late_for_meetup"
  | "phone_in_dressing_room"
  | "messy_dressing_room";

export type FineItemGroup = "training" | "match" | "off_pitch" | "manual";

export type FineValueKind = "czk" | "keg" | "round" | "laps" | "kit_wash";
export type FineRepeatMode = "flat" | "double_from_second" | "first_free";
export type FineScope = "senior" | "all";

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
  /** Ruční položka: hra ji sama nepozná, trenér pokutu zadá tlačítkem nebo v SMS. */
  manual: boolean;
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
  manual: "Ruční (dáváš sám)",
};

const ONE: FineConditionDef[] = [{ key: "any", label: "Pokaždé", harshness: 1 }];

export const FINE_ITEMS: readonly FineItemDef[] = [
  {
    key: "training_missed", group: "training", label: "Vynechaný trénink", manual: false,
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
    key: "training_broken_pledge", group: "training", label: "Slíbil, že přijde, a nepřišel", manual: false,
    hint: "Hráč ti v SMS slíbil, že na trénink dorazí, a nedorazil.",
    conditions: ONE, weeklyRatePerPlayer: { any: 0.02 },
  },
  {
    key: "training_forgot_boots", group: "training", label: "Zapomenuté kopačky", manual: false,
    hint: "Nepřišel, protože si nechal boty v práci.",
    conditions: ONE, weeklyRatePerPlayer: { any: 0.01 },
  },
  {
    key: "match_excuse", group: "match", label: "Omluvenka na zápas", manual: false,
    hint: "Hráč se na zápas omluvil. Zranění a stopka se nepočítají.",
    conditions: [
      { key: "hangover", label: "Kvůli kocovině nebo alkoholu", harshness: 1 },
      { key: "match_day", label: "Až v den zápasu", harshness: 1.6 },
      { key: "any", label: "Jakákoli omluvenka", harshness: 2.5 },
    ],
    weeklyRatePerPlayer: { hangover: 0.004, match_day: 0.03, any: 0.08 },
  },
  {
    key: "match_hangover", group: "match", label: "Na zápas s kocovinou", manual: false,
    hint: "Na zápase bylo poznat, že včerejší hospoda se podepsala.",
    conditions: ONE, weeklyRatePerPlayer: { any: 0.01 },
  },
  {
    key: "yellow_card", group: "match", label: "Žlutá karta", manual: false,
    hint: "Žlutá v mistrovském zápase.",
    conditions: [
      { key: "dissent", label: "Za protesty", harshness: 1 },
      { key: "foul", label: "Za faul", harshness: 2.2 },
      { key: "any", label: "Jakákoli", harshness: 2 },
    ],
    weeklyRatePerPlayer: { dissent: 0.003, foul: 0.05, any: 0.055 },
  },
  {
    key: "red_card", group: "match", label: "Červená karta", manual: false,
    hint: "Vyloučení v mistrovském zápase.",
    conditions: [
      { key: "direct", label: "Přímá červená", harshness: 1 },
      { key: "second_yellow", label: "Druhá žlutá", harshness: 1.2 },
      { key: "any", label: "Jakákoli", harshness: 1.1 },
    ],
    weeklyRatePerPlayer: { direct: 0.003, second_yellow: 0.002, any: 0.005 },
  },
  {
    key: "suspension", group: "match", label: "Stopka za karty", manual: false,
    hint: "Hráč nemůže hrát, protože nasbíral karty.",
    conditions: ONE, weeklyRatePerPlayer: { any: 0.005 },
  },
  {
    key: "penalty_miss", group: "match", label: "Neproměněná penalta", manual: false,
    hint: "Pokuta za chybu ve hře, ne za chování. Kabina to nesnáší.",
    conditions: [{ key: "any", label: "Pokaždé", harshness: 3 }],
    weeklyRatePerPlayer: { any: 0.002 },
  },
  {
    key: "match_late", group: "match", label: "Pozdě na zápas", manual: false,
    hint: "Dorazil až po výkopu a naskočil později.",
    conditions: ONE, weeklyRatePerPlayer: { any: 0.003 },
  },
  {
    key: "pub_before_match", group: "off_pitch", label: "Hospoda večer před zápasem", manual: false,
    hint: "Hráč seděl v hospodě večer před mistrovským zápasem.",
    conditions: ONE, weeklyRatePerPlayer: { any: 0.05 },
  },
  {
    key: "pub_fight", group: "off_pitch", label: "Rvačka v hospodě", manual: false,
    hint: "Hráč se v hospodě popral.",
    conditions: ONE, weeklyRatePerPlayer: { any: 0.002 },
  },
  {
    key: "late_for_meetup", group: "manual", label: "Pozdě na sraz", manual: true,
    hint: "Hra to sama nepozná, pokutu dáš tlačítkem nebo v SMS.",
    conditions: ONE, weeklyRatePerPlayer: { any: 0.02 },
  },
  {
    key: "phone_in_dressing_room", group: "manual", label: "Mobil v kabině", manual: true,
    hint: "Hra to sama nepozná, pokutu dáš tlačítkem nebo v SMS.",
    conditions: ONE, weeklyRatePerPlayer: { any: 0.01 },
  },
  {
    key: "messy_dressing_room", group: "manual", label: "Neuklizená kabina", manual: true,
    hint: "Hra to sama nepozná, pokutu dáš tlačítkem nebo v SMS.",
    conditions: ONE, weeklyRatePerPlayer: { any: 0.01 },
  },
];

export const FINE_CZK_AMOUNTS = [20, 50, 100, 200, 500] as const;

export interface FineValueDef {
  kind: FineValueKind;
  label: string;
  /** Kolik to hráče stojí v korunách (pro zátěž). Kolečka a praní dresů nestojí peníze, ale bolí jinak. */
  czkEquivalent: number;
}

export const FINE_VALUES: Record<Exclude<FineValueKind, "czk">, FineValueDef> = {
  keg: { kind: "keg", label: "Basa piva", czkEquivalent: 600 },
  round: { kind: "round", label: "Runda pro kabinu", czkEquivalent: 350 },
  laps: { kind: "laps", label: "Kolečka na tréninku", czkEquivalent: 40 },
  kit_wash: { kind: "kit_wash", label: "Praní dresů", czkEquivalent: 60 },
};

export const FINE_REPEAT_LABELS: Record<FineRepeatMode, string> = {
  flat: "Pokaždé stejně",
  double_from_second: "Od druhého prohřešku dvojnásobek",
  first_free: "První v sezóně se promíjí",
};

export const FINE_SCOPE_LABELS: Record<FineScope, string> = {
  senior: "Jen dospělí",
  all: "I mladí do 19 let",
};

export const MAX_FINE_ITEMS = 6;

export interface FineScheduleItemInput {
  itemKey: FineItemKey;
  conditionKey: string;
  valueKind: FineValueKind;
  /** Jen u `czk`. */
  amountCzk: number | null;
  repeatMode: FineRepeatMode;
  scope: FineScope;
}

export function fineItemDef(key: string): FineItemDef | undefined {
  return FINE_ITEMS.find((i) => i.key === key);
}

/** Kolik položka stojí v korunách (pro zátěž hráče). */
export function fineCzkEquivalent(valueKind: FineValueKind, amountCzk: number | null): number {
  if (valueKind === "czk") return amountCzk ?? 0;
  return FINE_VALUES[valueKind].czkEquivalent;
}

/** Popis hodnoty pro hráče („100 Kč“, „basa piva“). */
export function fineValueLabel(valueKind: FineValueKind, amountCzk: number | null): string {
  if (valueKind === "czk") return `${(amountCzk ?? 0).toLocaleString("cs-CZ")} Kč`;
  return FINE_VALUES[valueKind].label.toLowerCase();
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
    if (it.valueKind === "czk") {
      if (!FINE_CZK_AMOUNTS.includes(it.amountCzk as (typeof FINE_CZK_AMOUNTS)[number])) return "Neplatná částka pokuty.";
    } else if (!(it.valueKind in FINE_VALUES)) return "Neplatná hodnota pokuty.";
    if (!(it.repeatMode in FINE_REPEAT_LABELS)) return "Neplatné opakování.";
    if (!(it.scope in FINE_SCOPE_LABELS)) return "Neplatný rozsah.";
  }
  return null;
}

/** Předvolba „Klasika okresu“: rozumný sazebník, který kapitán obvykle schválí. */
export const CLASSIC_FINE_SCHEDULE: readonly FineScheduleItemInput[] = [
  { itemKey: "training_missed", conditionKey: "slacking", valueKind: "czk", amountCzk: 50, repeatMode: "flat", scope: "senior" },
  { itemKey: "training_missed", conditionKey: "pub", valueKind: "czk", amountCzk: 50, repeatMode: "flat", scope: "senior" },
  { itemKey: "match_excuse", conditionKey: "hangover", valueKind: "czk", amountCzk: 100, repeatMode: "flat", scope: "senior" },
  { itemKey: "yellow_card", conditionKey: "dissent", valueKind: "czk", amountCzk: 50, repeatMode: "flat", scope: "senior" },
  { itemKey: "red_card", conditionKey: "any", valueKind: "czk", amountCzk: 100, repeatMode: "flat", scope: "senior" },
  { itemKey: "training_forgot_boots", conditionKey: "any", valueKind: "czk", amountCzk: 20, repeatMode: "flat", scope: "senior" },
];
