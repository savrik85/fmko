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
  // Konkrétní výše strojově udělovaných pokut. Nahrazují násobič fine_mult:
  // o trestu se hlasuje částkou, ne koeficientem. Hodnoty jsou nastavené tak,
  // aby se bez samosprávy nezměnilo dnešní chování ani o korunu.
  fine_referee_abuse: 1_200,
  fine_admin: 900,
  fine_rule: 1_000,
  // Pravidla soutěže. 0 = vypnuto, takže spuštění samosprávy nikomu nic nestrhne.
  min_pitch_condition: 0,
  squad_min: 0,
  squad_max: 0,
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

/**
 * Tituly jsou schválně o číslo nabubřelejší, než na okresní přebor patří —
 * přesně tak, jak se okresní funkcionáři sami berou. Kódy rolí zůstávají
 * beze změny, mění se jen to, co vidí hráč.
 */
export const ROLE_LABEL: Record<OfficialRole, string> = {
  predseda: "Prezident soutěže",
  hospodarska: "Generální sekretář",
  disciplinarni: "Předseda disciplinární rady",
  rozhodcich: "Komisař rozhodčích",
};

/**
 * Co která funkce spravuje a co smí. Jediný zdroj — čte to UI i zápis, takže
 * v soutěži nemůže viset pravomoc, kterou kód neumí. Když sem něco přibude,
 * musí k tomu existovat endpoint.
 */
export const ROLE_SCOPE: Record<OfficialRole, {
  gesce: Gesce;
  agenda: string;
  powers: string[];
}> = {
  predseda: {
    gesce: "soutez",
    agenda: "Pravidla soutěže — zákaz transferů mezi kluby stejného majitele, stav hřiště, velikost soupisky.",
    powers: [
      "Při rovnosti hlasů rozhoduje jeho hlas.",
      "Zastupuje každou neobsazenou funkci a čerpá u ní vlastní počítadlo.",
      "Pozastaví pravomoc jinému předsedovi — tím rovnou otevře hlasování o jeho odvolání. Když neprojde, pravomoc se vrátí a prezident přijde o pět bodů reputace.",
      "Je nadřízený ostatním předsedům.",
    ],
  },
  hospodarska: {
    gesce: "hospodarska",
    agenda: "Odměny za zápasy i za umístění, startovné, odvody z tržeb a meziligové poplatky.",
    powers: [
      "Vidí projekci rozpočtu na příští sezónu i rozpis závazků rozehrané sezóny.",
      "Návrhy v jeho gesci mění peníze celé soutěže — platí vždy až od příští sezóny.",
    ],
  },
  disciplinarni: {
    gesce: "disciplinarni",
    agenda: "Pokuty klubům a výše trestů, které padají samy — za kritiku rozhodčího, za nepořádek, za porušení pravidla soutěže.",
    powers: [
      "Uloží pokutu sám, bez hlasování, do 3 000 Kč a nejvýš čtyřikrát za sezónu.",
      "Vlastnímu klubu pokutu uložit nemůže, ani klubu, se kterým má vyhrocený vztah.",
      "Klub se proti každé jeho pokutě může odvolat k zasedání.",
    ],
  },
  rozhodcich: {
    gesce: "rozhodcich",
    agenda: "Listina rozhodčích okresu a jejich odměna za odpískaný zápas.",
    powers: [
      "Vyškrtne rozhodčího sám, bez hlasování. Jediná brzda je minimální velikost listiny.",
      "Vidí známky rozhodčích a to, jak si soutěž stojí s minimální velikostí listiny.",
      "Vyškrtnutý sudí se po sezóně vrátí a bude si pamatovat, kdo ho škrtl.",
    ],
  },
};

/**
 * Funkce ve 4. pádu: „napiš prezidentovi soutěže", „soukromá linka na komisaře".
 * Bez toho v UI stálo „Soukromá linka na generální sekretář".
 */
export const ROLE_LABEL_AKUZATIV: Record<OfficialRole, string> = {
  predseda: "prezidenta soutěže",
  hospodarska: "generálního sekretáře",
  disciplinarni: "předsedu disciplinární rady",
  rozhodcich: "komisaře rozhodčích",
};

/** Název celého orgánu. */
export const BODY_NAME = "Grémium soutěže";

/** Která gesce patří které funkci. Předseda soutěže zastupuje neobsazené. */
export const GESCE_ROLE: Record<Exclude<Gesce, "zadna">, OfficialRole> = {
  soutez: "predseda",
  hospodarska: "hospodarska",
  disciplinarni: "disciplinarni",
  rozhodcich: "rozhodcich",
};

/**
 * Jak se hodnota návrhu píše a zadává.
 *
 * Bez tohohle se vypínač ptal číslem („Nová hodnota (zrušit – zavést): 0"),
 * což nikdo nepochopil. Formulář i titulek návrhu se řídí výhradně jednotkou,
 * ne názvem typu.
 */
export type ProposalUnit = "czk" | "pct" | "switch" | "ratio" | "count";

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
  unit: ProposalUnit;
  /** Co ta hodnota v praxi znamená — jde do formuláře i do karty návrhu. */
  note?: string;
  /** Jednotka pro počty: „hráč / hráči / hráčů". */
  counted?: [string, string, string];
}

/**
 * Katalog typů návrhů. Rozsahy jsou tvrdé — server je ořezává nezávisle na UI.
 */
export const PROPOSAL_KINDS: Record<string, ProposalSpec> = {
  // ── Generální sekretář: peníze ───────────────────────────────────────────
  win_bonus: { rulesField: "win_bonus", gesce: "hospodarska", label: "Odměna za výhru", majority: SIMPLE_MAJORITY, nextSeason: true, min: 0, max: 3000, unit: "czk" },
  draw_bonus: { rulesField: "draw_bonus", gesce: "hospodarska", label: "Odměna za remízu", majority: SIMPLE_MAJORITY, nextSeason: true, min: 0, max: 1000, unit: "czk" },
  place_top: { rulesField: "place_top", gesce: "hospodarska", label: "Odměna za 1. místo", majority: SIMPLE_MAJORITY, nextSeason: true, min: 50_000, max: 250_000, unit: "czk" },
  place_decay: { rulesField: "place_decay", gesce: "hospodarska", label: "Klíč rozdělení odměn", majority: SIMPLE_MAJORITY, nextSeason: true, min: 0.7, max: 0.95, unit: "ratio", note: "Čím nižší číslo, tím strmější rozdíl mezi prvním a posledním." },
  entry_fee: { rulesField: "entry_fee", gesce: "hospodarska", label: "Startovné", majority: SIMPLE_MAJORITY, nextSeason: true, min: 0, max: 60_000, unit: "czk" },
  interleague_fee_pct: { rulesField: "interleague_fee_pct", gesce: "hospodarska", label: "Meziligový přestupní poplatek", majority: SIMPLE_MAJORITY, nextSeason: true, min: 0, max: 50, unit: "pct" },
  levy_concession_pct: { rulesField: "levy_concession_pct", gesce: "hospodarska", label: "Odvod z občerstvení", majority: SIMPLE_MAJORITY, nextSeason: true, min: 0, max: 10, unit: "pct" },
  levy_gate_pct: { rulesField: "levy_gate_pct", gesce: "hospodarska", label: "Odvod ze vstupného", majority: SIMPLE_MAJORITY, nextSeason: true, min: 0, max: 10, unit: "pct" },
  levy_transfer_pct: { rulesField: "levy_transfer_pct", gesce: "hospodarska", label: "Odvod z přestupu uvnitř soutěže", majority: SIMPLE_MAJORITY, nextSeason: true, min: 0, max: 10, unit: "pct" },
  levy_cup_pct: { rulesField: "levy_cup_pct", gesce: "hospodarska", label: "Odvod z pohárových odměn", majority: SIMPLE_MAJORITY, nextSeason: true, min: 0, max: 20, unit: "pct" },

  // ── Komisař rozhodčích ───────────────────────────────────────────────────
  referee_fee: { rulesField: "referee_fee", gesce: "rozhodcich", label: "Odměna rozhodčím za zápas", majority: SIMPLE_MAJORITY, nextSeason: true, min: 600, max: 2500, unit: "czk" },

  // ── Disciplinární rada: výše pokut, které padají samy ────────────────────
  fine_referee_abuse: { rulesField: "fine_referee_abuse", gesce: "disciplinarni", label: "Pokuta za kritiku rozhodčího", majority: SIMPLE_MAJORITY, nextSeason: true, min: 0, max: 6000, unit: "czk", note: "Sazba za středně ostrou kritiku v pozápasovém rozhovoru. Mírnější stojí tři čtvrtiny, ta nejostřejší o čtvrtinu víc." },
  fine_admin: { rulesField: "fine_admin", gesce: "disciplinarni", label: "Svazová pokuta za nepořádek", majority: SIMPLE_MAJORITY, nextSeason: true, min: 0, max: 5000, unit: "czk", note: "Pozdní soupiska, neuklizené kabiny, nedodaný zápis. Skutečná částka kolísá kolem sazby." },
  fine_rule: { rulesField: "fine_rule", gesce: "disciplinarni", label: "Pokuta za porušení pravidla soutěže", majority: SIMPLE_MAJORITY, nextSeason: true, min: 0, max: 8000, unit: "czk", note: "Platí na pravidla, která si soutěž odhlasovala — stav hřiště a velikost soupisky. Kontrola běží před každým zasedáním." },

  // ── Prezident soutěže: pravidla soutěže ──────────────────────────────────
  ban_own_owner_transfers: { rulesField: "ban_own_owner_transfers", gesce: "soutez", label: "Zákaz transferů mezi kluby stejného majitele", majority: QUALIFIED_MAJORITY, nextSeason: false, min: 0, max: 1, unit: "switch", note: "Obchod projde, ale objeví se na programu nejbližšího zasedání jako disciplinární bod." },
  min_pitch_condition: { rulesField: "min_pitch_condition", gesce: "soutez", label: "Minimální stav hřiště", majority: QUALIFIED_MAJORITY, nextSeason: false, min: 0, max: 60, unit: "count", counted: ["bod", "body", "bodů"], note: "Kdo pod tuhle hranici spadne, dostane pokutu za porušení pravidla. Nula znamená, že se stav hřiště nehlídá." },
  squad_min: { rulesField: "squad_min", gesce: "soutez", label: "Minimální počet hráčů na soupisce", majority: QUALIFIED_MAJORITY, nextSeason: false, min: 0, max: 18, unit: "count", counted: ["hráč", "hráči", "hráčů"], note: "Proti klubům, které pustí kádr pod hranici únosnosti. Nula znamená bez omezení." },
  squad_max: { rulesField: "squad_max", gesce: "soutez", label: "Maximální počet hráčů na soupisce", majority: QUALIFIED_MAJORITY, nextSeason: false, min: 0, max: 40, unit: "count", counted: ["hráč", "hráči", "hráčů"], note: "Proti hromadění hráčů na lavici. Nula znamená bez omezení." },
};

/** Sazebníkové návrhy, u kterých se musí ověřit projekce rozpočtu. */
export const BUDGET_KINDS = new Set([
  "win_bonus", "draw_bonus", "place_top", "place_decay", "entry_fee", "referee_fee",
]);
