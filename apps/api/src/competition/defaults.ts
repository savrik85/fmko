/**
 * Výchozí sazebník soutěže a tvrdé limity samosprávy.
 *
 * DEFAULT_RULES je zároveň fallback pro každou cestu, která běží bez samosprávy
 * (liga pod prahem, U21, pohár, přátelák, recovery endpoint). Hodnoty proto MUSÍ
 * odpovídat tomu, co měl kód natvrdo před zavedením samosprávy:
 *   - win 500 / draw 150      → season/finance-processor.ts (leagueBonus)
 *   - 150000 × 0,80^(pos−1), floor 6000 → season/season-rewards.ts
 *   - referee_fee 1150        → střed dosavadního rozsahu 800–1500
 *   - interleague_fee_pct 20  → dosavadní meziligový poplatek
 */

export const DEFAULT_RULES = {
  win_bonus: 500,
  draw_bonus: 150,
  place_top: 150_000,
  place_decay: 0.8,
  place_floor: 6_000,
  entry_fee: 15_000,
  referee_fee: 1_150,
  fine_mult: 1.0,
  interleague_fee_pct: 20,
  ban_own_owner_transfers: 0,
  levy_concession_pct: 0,
  levy_gate_pct: 0,
  levy_transfer_pct: 0,
  levy_cup_pct: 0,
} as const;

export type CompetitionRules = { -readonly [K in keyof typeof DEFAULT_RULES]: number };

/** Násobič odměn podle úrovně soutěže. Zrcadlí LEVEL_MULT v season/season-rewards.ts. */
export const LEVEL_MULT: Record<string, number> = {
  okresni_soutez: 0.85,
  okresni_prebor: 1.0,
  ib_trida: 1.2,
  ia_trida: 1.45,
  krajsky_prebor: 1.75,
};

/** Od kolika lidských klubů se samospráva zapíná. Vyhodnocuje se JEN při rolloveru. */
export const MIN_HUMAN_CLUBS = 5;

/** Od kolika lidských klubů existují všechny čtyři funkce (níž jen předseda + hospodářská). */
export const FULL_BOARD_CLUBS = 9;

/** Den schůze: středa. Liga hraje po+čt, pohár v sobotu, vesnický cyklus v pondělí. */
export const MEETING_DAY_OF_WEEK = 3;

/**
 * Rezerva, kterou musí projekce rozpočtu na příští sezónu ustát.
 *
 * Je nula ZÁMĚRNĚ: bezpečnostní polštář je už zabudovaný ve vzorci svazové dotace
 * (SUBSIDY_CUSHION), který drží výchozí bilanci na +2,7 %. Samostatná rezerva navrch
 * by ho počítala podruhé — a protože výchozí sazby dávají přebytek jen kolem 15 000 Kč,
 * jakákoli rezerva vyšší než to by zablokovala i návrh, který nic nemění.
 * Pravidlo tedy zní prostě: pokladna nesmí jít do mínusu.
 */
export const MIN_RESERVE = 0;

/** Polštář ve vzorci svazové dotace — drží výchozí bilanci lehce kladnou. */
export const SUBSIDY_CUSHION = 1.03;

/** Očekávaná výplata prémie na zápas při ~25 % remíz: 0,75 × win + 0,25 × 2 × draw. */
export const EXPECTED_BONUS_PER_MATCH = 450;

/** Kauce za podání návrhu. Vrací se, když návrh projde. */
export const PROPOSAL_DEPOSIT = 500;

/** Kvórum se nikdy nespočítá níž než tohle — jinak by rozhodoval jeden člověk. */
export const MIN_QUORUM_VOTES = 3;

/** Kolik posledních schůzí se dívá zpět při určování „aktivního" klubu. */
export const ACTIVITY_WINDOW_MEETINGS = 3;

export const SIMPLE_MAJORITY = 0.5;
export const QUALIFIED_MAJORITY = 2 / 3;

export type Gesce = "soutez" | "hospodarska" | "disciplinarni" | "rozhodcich" | "zadna";
export type OfficialRole = "predseda" | "hospodarska" | "disciplinarni" | "rozhodcich";

export const ROLE_LABEL: Record<OfficialRole, string> = {
  predseda: "Předseda soutěže",
  hospodarska: "Předseda hospodářské komise",
  disciplinarni: "Předseda disciplinární komise",
  rozhodcich: "Předseda komise rozhodčích",
};

/** Která gesce patří které funkci. Předseda soutěže zastupuje neobsazené. */
export const GESCE_ROLE: Record<Exclude<Gesce, "zadna">, OfficialRole> = {
  soutez: "predseda",
  hospodarska: "hospodarska",
  disciplinarni: "disciplinarni",
  rozhodcich: "rozhodcich",
};

export interface ProposalSpec {
  /** Klíč do competition_rules, pokud návrh mění sazebník. */
  rulesField?: keyof CompetitionRules;
  gesce: Gesce;
  label: string;
  majority: number;
  /** Sazebníkové změny platí až od příští sezóny; ostatní se aplikují hned. */
  nextSeason: boolean;
  min?: number;
  max?: number;
}

/**
 * Katalog typů návrhů. Rozsahy jsou tvrdé — server je ořezává nezávisle na UI.
 */
export const PROPOSAL_KINDS: Record<string, ProposalSpec> = {
  win_bonus: { rulesField: "win_bonus", gesce: "hospodarska", label: "Odměna za výhru", majority: SIMPLE_MAJORITY, nextSeason: true, min: 0, max: 3000 },
  draw_bonus: { rulesField: "draw_bonus", gesce: "hospodarska", label: "Odměna za remízu", majority: SIMPLE_MAJORITY, nextSeason: true, min: 0, max: 1000 },
  place_top: { rulesField: "place_top", gesce: "hospodarska", label: "Odměna za 1. místo", majority: SIMPLE_MAJORITY, nextSeason: true, min: 50_000, max: 250_000 },
  place_decay: { rulesField: "place_decay", gesce: "hospodarska", label: "Klíč rozdělení odměn", majority: SIMPLE_MAJORITY, nextSeason: true, min: 0.7, max: 0.95 },
  entry_fee: { rulesField: "entry_fee", gesce: "hospodarska", label: "Startovné", majority: SIMPLE_MAJORITY, nextSeason: true, min: 0, max: 60_000 },
  referee_fee: { rulesField: "referee_fee", gesce: "rozhodcich", label: "Odměna rozhodčím za zápas", majority: SIMPLE_MAJORITY, nextSeason: true, min: 600, max: 2500 },
  fine_mult: { rulesField: "fine_mult", gesce: "disciplinarni", label: "Sazebník pokut", majority: SIMPLE_MAJORITY, nextSeason: true, min: 0.5, max: 2.0 },
  interleague_fee_pct: { rulesField: "interleague_fee_pct", gesce: "hospodarska", label: "Meziligový přestupní poplatek", majority: SIMPLE_MAJORITY, nextSeason: true, min: 0, max: 50 },
  levy_concession_pct: { rulesField: "levy_concession_pct", gesce: "hospodarska", label: "Odvod z občerstvení", majority: SIMPLE_MAJORITY, nextSeason: true, min: 0, max: 10 },
  levy_gate_pct: { rulesField: "levy_gate_pct", gesce: "hospodarska", label: "Odvod ze vstupného", majority: SIMPLE_MAJORITY, nextSeason: true, min: 0, max: 10 },
  levy_transfer_pct: { rulesField: "levy_transfer_pct", gesce: "hospodarska", label: "Odvod z přestupu uvnitř soutěže", majority: SIMPLE_MAJORITY, nextSeason: true, min: 0, max: 10 },
  levy_cup_pct: { rulesField: "levy_cup_pct", gesce: "hospodarska", label: "Odvod z pohárových odměn", majority: SIMPLE_MAJORITY, nextSeason: true, min: 0, max: 20 },
  ban_own_owner_transfers: { rulesField: "ban_own_owner_transfers", gesce: "soutez", label: "Zákaz transferů mezi kluby stejného majitele", majority: QUALIFIED_MAJORITY, nextSeason: true, min: 0, max: 1 },
};

/** Sazebníkové návrhy, u kterých se musí ověřit projekce rozpočtu. */
export const BUDGET_KINDS = new Set([
  "win_bonus", "draw_bonus", "place_top", "place_decay", "entry_fee", "referee_fee",
]);
