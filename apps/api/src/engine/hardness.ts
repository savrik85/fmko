/**
 * Tvrdost hry — třetí taktická osa vedle formace a taktiky.
 *
 * Jediný zdroj pravdy pro simulaci, náhled síly sestavy i predikci rizika karet
 * v UI. Čisté funkce, žádná DB.
 *
 * Celé jádro balancu je v tom, že **benefit se škáluje a riziko ne**:
 *
 *   hardEff = fit(kádr) × benefitScale(sudí) × careFactor(karty na kontě)
 *
 * Bez `benefitScale` je tvrdá hra výhodná i proti nejpřísnějšímu sudímu
 * (spočítáno: +0,17 rozdílu skóre), takže by volba fakticky neexistovala —
 * vždycky by se hrálo naostro. S ním se znaménko otočí uvnitř jednoho zápasu
 * a k tomu se přidají náklady, které simulace jednoho utkání ani nevidí:
 * stopky za karty, zranění a nižší hodnocení hráčů.
 *
 * Technický kádr, který si zvolí „Do těla", tedy dostane fauly a karty v plné
 * výši, ale zisk jen kolem sedmdesáti procent. Volba tvrdosti se tím stává
 * součástí stavby kádru, ne obecně výhodným přepínačem.
 */

import type { MatchPlayer } from "./types";
import { fitFromRequirements, type SkillRequirement } from "./tactics";
import type { RefereeProfile } from "./referee";

export type Hardness = "fair" | "normal" | "hard";

export const HARDNESS_KEYS: readonly Hardness[] = ["fair", "normal", "hard"];

export interface HardnessMods {
  /** × defensePower — benefit, škáluje se. */
  defenseMod: number;
  /** + counterMod za minutu — benefit, škáluje se. */
  counterBonus: number;
  /** Maximální srážka útoku soupeře — benefit, škáluje se. */
  intimidation: number;
  /** × frekvence faulů — riziko, NEškáluje se. */
  foulMod: number;
  /** × pravděpodobnost karty — riziko. */
  cardMod: number;
  /** × pravděpodobnost přímé červené — riziko. */
  redMod: number;
  /** × váha vlastních hráčů při losu zraněného (souboje naostro bolí i toho, kdo do nich jde). */
  selfInjuryMod: number;
  /** × váha soupeřových hráčů při losu zraněného (tvrdé zákroky odnese hlavně soupeř). */
  oppInjuryMod: number;
  /** × úbytek kondice. */
  drainMod: number;
}

export const HARDNESS_MODS: Record<Hardness, HardnessMods> = {
  fair: {
    defenseMod: 0.97, counterBonus: 0, intimidation: 0,
    foulMod: 0.70, cardMod: 0.80, redMod: 0.50,
    selfInjuryMod: 0.92, oppInjuryMod: 0.85, drainMod: 0.97,
  },
  normal: {
    defenseMod: 1.00, counterBonus: 0, intimidation: 0,
    foulMod: 1.00, cardMod: 1.00, redMod: 1.00,
    selfInjuryMod: 1.00, oppInjuryMod: 1.00, drainMod: 1.00,
  },
  hard: {
    // 4 % na obraně vypadá málo, ale defensePower se dělí třemi a rozdíl
    // útok−obrana stem — reálně je to kolem −11 % šancí soupeře.
    defenseMod: 1.04, counterBonus: 0.012, intimidation: 0.05,
    foulMod: 1.45, cardMod: 1.35, redMod: 1.80,
    // Soupeř odnese víc než my — tvrdé zákroky dopadají hlavně na toho, kdo je
    // schytává. Vlastní hráči si taky ubližují, ale míň. Zranění soupeře je tím
    // pádem další benefit tvrdé hry, jen se projeví až v jeho dalších zápasech.
    selfInjuryMod: 1.20, oppInjuryMod: 1.35, drainMod: 1.06,
  },
};

export function hardnessMods(h: Hardness | undefined): HardnessMods {
  return HARDNESS_MODS[h as Hardness] ?? HARDNESS_MODS.normal;
}

const OUTFIELD = ["DEF", "MID", "FWD"] as const;

/**
 * Co musí kádr umět, aby mu tvrdá hra něco přinesla.
 *
 * `discipline` tu schválně není — ta už působí na riziko u každého faulujícího
 * zvlášť, takže by disciplinovaný kádr dostal bezrizikovou řezničinu.
 */
const HARD_REQUIREMENTS: readonly SkillRequirement[] = [
  { skill: "aggression", positions: [...OUTFIELD], threshold: 55, weight: 1.0 },
  { skill: "strength", positions: [...OUTFIELD], threshold: 55, weight: 0.8 },
  { skill: "workRate", positions: [...OUTFIELD], threshold: 55, weight: 0.4 },
];

/** Umí to ten kádr? 0,70 (technický) – 1,15 (dřevorubci). */
export function calcHardnessFit(lineup: MatchPlayer[], h: Hardness): number {
  // Opatrnou hru zvládne každý — nefaulovat nevyžaduje talent.
  if (h !== "hard") return 1.0;
  return fitFromRequirements(lineup, HARD_REQUIREMENTS);
}

/**
 * Dovolí to sudí? 1,45 (benevolentní) – 0,25 (nejpřísnější).
 *
 * Fyzikálně poctivé: přísný rozhodčí pískne dřív, než souboj dohraješ, takže
 * tvrdost nevyrobí zisk míče — jen faul.
 */
export function benefitScale(referee: RefereeProfile | undefined): number {
  const strictness = referee?.strictness ?? 50;
  return Math.min(1.45, Math.max(0.25, 1.75 - 1.5 * (strictness / 100)));
}

/**
 * Kolik už máš na kontě? Hráč se žlutou nohu stáhne, takže tým s pokartovanou
 * sestavou z tvrdé hry postupně nic nemá — ale riziko mu zůstane.
 */
export function careFactor(lineup: MatchPlayer[], booked: ReadonlySet<number>): number {
  const outfield = lineup.filter((p) => (p.matchPosition ?? p.position) !== "GK");
  if (outfield.length === 0) return 1;
  const bookedCount = outfield.filter((p) => booked.has(p.id)).length;
  return 1 - 0.9 * (bookedCount / outfield.length);
}

/** Složený škálovač benefitní strany. Riziková strana se jím NIKDY nenásobí. */
export function hardEff(
  lineup: MatchPlayer[],
  h: Hardness,
  referee: RefereeProfile | undefined,
  booked: ReadonlySet<number>,
): number {
  const eff = calcHardnessFit(lineup, h) * benefitScale(referee) * careFactor(lineup, booked);
  return Math.min(1.45, Math.max(0.15, eff));
}

/**
 * Otrlost hráče 0–100 — kdo se nenechá zastrašit.
 *
 * Záměrně bez `temper` (vznětlivý není odolný, spíš dostane kartu) a bez
 * `morale` (ta už působí vlastním kanálem, bylo by to dvojí započtení).
 */
export function grit(p: MatchPlayer): number {
  return p.strength * 0.30 + p.aggression * 0.25 + p.consistency * 0.25 + p.leadership * 0.20;
}

/** Náchylnost sestavy na zastrašení 0–1. Otrlost 75+ neotřese nic, 25− plná srážka. */
export function susceptibility(lineup: MatchPlayer[]): number {
  const outfield = lineup.filter((p) => (p.matchPosition ?? p.position) !== "GK");
  if (outfield.length === 0) return 0;
  const avg = outfield.reduce((s, p) => s + grit(p), 0) / outfield.length;
  return Math.min(1, Math.max(0, (75 - avg) / 50));
}

/**
 * Kolik tvrdý tým ubere soupeři z útočné síly. Strop 5 % je tvrdý — ani nejměkčí
 * kádr proti nejtvrdší hře nepřijde o víc. Nikdy se to nedotkne zakončení,
 * jen počtu vzniklých šancí.
 */
export function intimidationPenalty(
  defenderHardness: Hardness,
  defenderEff: number,
  attackingLineup: MatchPlayer[],
): number {
  const mods = hardnessMods(defenderHardness);
  if (mods.intimidation === 0) return 0;
  return mods.intimidation * defenderEff * susceptibility(attackingLineup);
}

// ── Predikce rizika pro UI ───────────────────────────────────────────────────

export interface DisciplinePrediction {
  fouls: number;
  cards: number;
  reds: number;
  level: "nízké" | "střední" | "vysoké";
}

/**
 * Odhad kartové bilance pro náhled sestavy.
 *
 * Počítá se na serveru, aby to nebyl další vzorec zduplikovaný na frontendu —
 * jednu takovou duplicitu tenhle projekt už měl a musela se rušit.
 */
export function predictDiscipline(
  lineup: MatchPlayer[],
  h: Hardness,
  referee: RefereeProfile | undefined,
  refereeMods: { severeFoul: number; petty: number; advantage: number; cardMul: number; redBase: number },
): DisciplinePrediction {
  const outfield = lineup.filter((p) => (p.matchPosition ?? p.position) !== "GK");
  const mods = hardnessMods(h);

  // Zhruba polovinu zápasu tým brání, tedy má šanci faulovat.
  const defendingMinutes = 45;
  const severe = defendingMinutes * refereeMods.severeFoul * mods.foulMod * (1 - refereeMods.advantage);
  const petty = defendingMinutes * refereeMods.petty * mods.foulMod;
  const fouls = severe + petty;

  const avgCardProb = outfield.length > 0
    ? outfield.reduce((s, p) => s + (p.temper / 100 + (100 - p.discipline) / 100) / 2 * 0.4, 0) / outfield.length
    : 0.18;
  const cards = Math.min(0.55, avgCardProb * refereeMods.cardMul * mods.cardMod) * (severe + petty * 0.35);
  const reds = severe * refereeMods.redBase * mods.redMod;

  return {
    fouls: Math.round(fouls * 10) / 10,
    cards: Math.round(cards * 100) / 100,
    reds: Math.round(reds * 1000) / 1000,
    level: cards < 0.9 ? "nízké" : cards < 1.6 ? "střední" : "vysoké",
  };
}

// ── Volba tvrdosti u AI týmů ─────────────────────────────────────────────────

export interface AiHardnessInput {
  /** Průměrná agresivita sestavy. */
  squadAggression: number;
  /** Přísnost delegovaného sudího; 50 když není delegovaný. */
  refStrictness: number;
  /** Rozdíl síly: soupeř − my. Kladné = jsme slabší. */
  strengthGap: number;
  /** Kolik hráčů je jednu žlutou od stopky. */
  playersOneYellowFromBan: number;
  isDerby: boolean;
  isU21: boolean;
}

/**
 * Jakou tvrdost zvolí AI tým. Bez RNG — stejné vstupy dají vždy stejnou volbu,
 * takže se to dá otestovat a nekolísá to mezi běhy cronu.
 */
export function decideAiHardness(i: AiHardnessInput): Hardness {
  if (i.isU21) return "normal"; // s dorostem se do těla nehraje

  let score = (i.squadAggression - 45) / 10;   // −4 … +5
  score -= (i.refStrictness - 50) / 12;         // ±4
  if (i.strengthGap >= 8) score += 1;           // outsider kope
  if (i.strengthGap <= -12) score -= 0.5;       // favorit nemá důvod riskovat
  // Každý hráč jednu žlutou od stopky tvrdost tlumí. Pevný postih −1 byl slabý:
  // agresivní kádr proti benevolentnímu sudímu šel naostro i se čtyřmi ohroženými.
  score -= Math.min(2.5, 0.6 * i.playersOneYellowFromBan);
  if (i.isDerby) score += 0.5;

  return score >= 1.5 ? "hard" : score <= -1.5 ? "fair" : "normal";
}
