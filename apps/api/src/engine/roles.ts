/**
 * Role hráčů v zápase — JEDINÝ zdroj toho, která vlastnost na kterém postu co dělá.
 *
 * Do 2026-10-10 engine počítal útok a obranu z průměrů celého pole a o držení míče
 * rozhodovala jen technika a přihrávky záložníků. Profil hráče přitom zvýrazňuje
 * vlastnosti podle vah hodnocení (`RATING_WEIGHTS`) a velká část z nich v zápase
 * nedělala nic: brankáři hrálo jen chytání, zkušenost se do zápasu nenačítala vůbec,
 * přehled obránců a útočníků nic. Záloha přitom přebíjela všechno ostatní.
 *
 * Pravidlo: každá vlastnost s vahou v hodnocení má na svém postu v zápase roli
 * a její vliv odpovídá váze (spec 2026-10-10-engine-role-model-design.md).
 * Koeficienty níže jsou naladěné simulací tak, aby:
 *  - podíl vlastnosti na vlivu postu ležel mezi polovinou a dvojnásobkem jejího
 *    podílu na vahách hodnocení postu,
 *  - hráč o 10 bodů lepší přinesl na každém postu podobně (±30 %).
 *
 * Hráč se počítá podle místa v sestavě (`matchPosition`), ne podle přirozené pozice.
 * Postih za hraní mimo post mu už snížil dovednosti v simulateMatch.
 *
 * Čisté funkce, žádná DB — čte je simulace i náhled síly sestavy.
 */

import type { MatchPlayer } from "./types";
import { gkReachFactor } from "../generators/physicals";

export type Slot = "GK" | "DEF" | "MID" | "FWD";

/** Vlastnosti, které mají váhu v hodnocení (ploché názvy jako v `skills`). */
export type RoleSkill =
  | "speed" | "technique" | "shooting" | "passing" | "heading" | "defense"
  | "goalkeeping" | "vision" | "creativity" | "setPieces" | "stamina" | "strength" | "experience";

export type TeamPhase = "possession" | "attack" | "defense";

type Coeffs = Partial<Record<RoleSkill, number>>;

/**
 * Fáze hry týmu. Hodnota týmu = součet příspěvků hráčů (ne průměr řady), takže víc
 * hráčů v řadě = víc síly v její fázi a jeden záložník ve tříčlenné záloze neváží víc
 * než ve čtyřčlenné.
 *
 * - possession: kdo má v dané minutě míč (rozehrávka, kombinace, podržení míče)
 * - attack: jak snadno z držení vznikne šance
 * - defense: jak dobře tým šanci soupeře zastaví dřív, než dojde ke střele
 */
export const TEAM_PHASES: Record<TeamPhase, Record<Slot, Coeffs>> = {
  possession: {
    // Rozehrávka brankáře: krátká přihrávka na stopera, výkop na útočníka
    GK: { passing: 0.49, technique: 0.48 },
    // Rozehrávka zezadu a klid na míči pod presinkem
    DEF: { passing: 0.71, vision: 0.51, experience: 0.48, creativity: 0.43, technique: 0.32 },
    MID: { vision: 0.75, passing: 0.74, experience: 0.47, technique: 0.43, creativity: 0.43, speed: 0.4, strength: 0.22 },
    // Podržení míče zády k bráně
    FWD: { passing: 0.48, technique: 0.42, strength: 0.2, experience: 0.1 },
  },
  attack: {
    GK: {},
    // Dlouhé míče do útoku a nájezdy krajních obránců
    DEF: { vision: 0.85, speed: 0.43, passing: 0.35, technique: 0.24, shooting: 0.23 },
    MID: { vision: 0.84, creativity: 0.64, speed: 0.4, passing: 0.37, shooting: 0.37, technique: 0.21 },
    // Náběhy, poslední přihrávka, souboje v pokutovém území
    FWD: { speed: 2.42, creativity: 1.69, vision: 1.69, technique: 0.56, passing: 0.48, strength: 0.16 },
  },
  defense: {
    // Komunikace s obranou a čtení hry
    GK: { creativity: 1.98, experience: 0.44 },
    DEF: { strength: 1.82, defense: 1.81, experience: 1.19, heading: 1.01, speed: 0.58 },
    MID: { defense: 1.12, strength: 0.34, heading: 0.31, speed: 0.27 },
    // Presink
    FWD: { defense: 0.81, speed: 0.48 },
  },
};

/**
 * Výdrž a nasazení = kolik práce hráč za zápas odvede. Nejsou samostatnou položkou,
 * ale násobí všechno, co hráč na svém postu dělá: běhavý záložník je v rozehrávce
 * i v obraně víc, ten bez dechu všude míň. Středem je 50, takže tým, kde mají
 * všichni stejně, má útok i obranu ve stejném poměru jako bez nich — úroveň ligy
 * sama o sobě šance nemění (goal-calibration.test.ts).
 *
 * Hodnota = změna příspěvku na 100 bodů rozdílu od 50 (0,6 = výdrž 65 místo 50 → +9 %).
 */
export const STAMINA_EFFECT: Record<Slot, number> = { GK: 0.08, DEF: 0.31, MID: 0.29, FWD: 0.27 };
/** Nasazení (osobnost) v útoku a obraně, agresivita obránců při bránění — ze starého vzorce. */
const WORKRATE_EFFECT: Record<TeamPhase, number> = { possession: 0, attack: 0.15, defense: 0.2 };
const DEF_AGGRESSION_EFFECT = 0.3;

/**
 * Měřítko fází: průměrný tým (všechno 50, 4-4-2) má stejnou sílu útoku a obrany jako
 * podle starého vzorce (39 a 35). Šance se počítá z poměru útok / obrana, takže na
 * měřítku záleží jen to, aby poměr vyrovnaných týmů seděl na kalibraci gólů.
 */
const REFERENCE_ATTACK = 39;
const REFERENCE_DEFENSE = 35;

/** Exponent držení míče: rozdíl v rozehrávce se promítne do podílu na míči. */
export const POSSESSION_EXPONENT = 1.5;

const NEUTRAL_EXPERIENCE = 40;

export function slotOf(p: MatchPlayer): Slot {
  return (p.matchPosition ?? p.position) as Slot;
}

/** Hodnota vlastnosti hráče; zkušenost u syntetických hráčů chybí → průměr z produkce. */
export function skillOf(p: MatchPlayer, skill: RoleSkill): number {
  if (skill === "experience") return p.experience ?? NEUTRAL_EXPERIENCE;
  return p[skill] as number;
}

/**
 * Předpočítané tabulky koeficientů. Fáze se počítají každou minutu zápasu pro oba
 * týmy a match tick zpracuje všechny ligy v jedné invokaci workeru; procházet objekt
 * přes Object.entries při každém hráči a minutě dělalo simulaci 2,2× pomalejší.
 */
interface CompiledCoeffs { keys: RoleSkill[]; coefs: number[]; total: number }

function compile(c: Coeffs): CompiledCoeffs {
  const keys: RoleSkill[] = [];
  const coefs: number[] = [];
  let total = 0;
  for (const k in c) {
    const v = c[k as RoleSkill] ?? 0;
    if (v === 0) continue;
    keys.push(k as RoleSkill);
    coefs.push(v);
    total += v;
  }
  return { keys, coefs, total };
}

function valueOf(p: MatchPlayer, skill: RoleSkill): number {
  return skill === "experience" ? (p.experience ?? NEUTRAL_EXPERIENCE) : (p[skill] as number);
}

const SLOTS: readonly Slot[] = ["GK", "DEF", "MID", "FWD"];
const PHASES: readonly TeamPhase[] = ["possession", "attack", "defense"];
let phaseTables = {} as Record<TeamPhase, Record<Slot, CompiledCoeffs>>;

/**
 * Jak moc je hráč čerstvý: 1,0 při plné kondici, 0,85 úplně vyždímaný. Násobí
 * všechny jeho příspěvky — unavený hráč nestíhá v ničem, nejen v zakončení.
 */
export function freshness(p: MatchPlayer): number {
  return 0.85 + 0.15 * Math.max(0, Math.min(100, p.condition)) / 100;
}

/**
 * Příspěvek hráče do fáze. `ground` < 1 = rozbité nebo mokré hřiště a počasí ubírají
 * hře po zemi (technika a přihrávky), viz calcChanceProb.
 */
function rawContribution(p: MatchPlayer, phase: TeamPhase, ground = 1): number {
  const slot = slotOf(p);
  const t = phaseTables[phase][slot];
  let sum = 0;
  for (let i = 0; i < t.keys.length; i++) {
    const k = t.keys[i];
    let v = valueOf(p, k);
    if (ground !== 1 && (k === "technique" || k === "passing")) v *= ground;
    sum += t.coefs[i] * v;
  }
  if (sum === 0) return 0;
  let work = 1 + STAMINA_EFFECT[slot] * (p.stamina - 50) / 100 + WORKRATE_EFFECT[phase] * (p.workRate - 50) / 100;
  if (phase === "defense" && slot === "DEF") work += DEF_AGGRESSION_EFFECT * (p.aggression - 50) / 100;
  return sum * Math.max(0.5, work) * freshness(p);
}

/**
 * Hodnota týmu ve fázi = součet příspěvků hráčů na hřišti. Chybějící hráč (červená,
 * zranění bez střídání) chybí přesně tam, kde hrál: vyloučený stoper oslabí obranu,
 * vyloučený útočník útok. Paušální srážka za oslabení se proto v šancích nepoužívá.
 */
function teamPhaseRaw(lineup: MatchPlayer[], phase: TeamPhase, ground = 1): number {
  let sum = 0;
  for (let i = 0; i < lineup.length; i++) sum += rawContribution(lineup[i], phase, ground);
  return sum;
}

/** Referenční tým pro měřítko: 4-4-2, všechny dovednosti i osobnost 50, plná kondice. */
function referenceLineup(): MatchPlayer[] {
  const slots: Slot[] = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD"];
  return slots.map((s, i) => ({
    id: -1 - i, firstName: "", lastName: "", nickname: null, position: s, matchPosition: s,
    speed: 50, technique: 50, shooting: 50, passing: 50, heading: 50, defense: 50, goalkeeping: 50,
    stamina: 50, strength: 50, vision: 50, creativity: 50, setPieces: 50, experience: 50,
    discipline: 50, alcohol: 30, temper: 40, leadership: 30, workRate: 50, aggression: 50,
    consistency: 50, clutch: 50, injuryProneness: 50, condition: 100, morale: 50,
  }) as MatchPlayer);
}

const REF = referenceLineup();
let ATTACK_SCALE = 1;
let DEFENSE_SCALE = 1;
let POSSESSION_SCALE = 1;

/**
 * Předpočítá tabulky a měřítka fází z referenčního týmu. Volá se na konci modulu
 * a po ladění koeficientů (laboratoř enginu mění tabulky za běhu).
 */
export function refreshRoleScales(): void {
  const next = {} as Record<TeamPhase, Record<Slot, CompiledCoeffs>>;
  for (const phase of PHASES) {
    next[phase] = {} as Record<Slot, CompiledCoeffs>;
    for (const slot of SLOTS) next[phase][slot] = compile(TEAM_PHASES[phase][slot]);
  }
  phaseTables = next;
  gkTables = {
    shot: compile(GK_SITUATIONS.shot), aerial: compile(GK_SITUATIONS.aerial),
    oneOnOne: compile(GK_SITUATIONS.oneOnOne), penalty: compile(GK_SITUATIONS.penalty),
  };
  finishTables = {
    DEF: { shot: compile(FINISHING.DEF.shot), header: compile(FINISHING.DEF.header) },
    MID: { shot: compile(FINISHING.MID.shot), header: compile(FINISHING.MID.header) },
    FWD: { shot: compile(FINISHING.FWD.shot), header: compile(FINISHING.FWD.header) },
  };
  ATTACK_SCALE = REFERENCE_ATTACK / teamPhaseRaw(REF, "attack");
  DEFENSE_SCALE = REFERENCE_DEFENSE / teamPhaseRaw(REF, "defense");
  POSSESSION_SCALE = 50 / teamPhaseRaw(REF, "possession");
}

/** Útok týmu; `ground` < 1 ubírá technice a přihrávkám (počasí, hřiště). */
export function teamAttack(lineup: MatchPlayer[], ground = 1): number {
  return teamPhaseRaw(lineup, "attack", ground) * ATTACK_SCALE;
}

export function teamDefense(lineup: MatchPlayer[]): number {
  return teamPhaseRaw(lineup, "defense") * DEFENSE_SCALE;
}

/** Kontrola míče týmu, měřítko 50 = průměrný tým. */
export function teamPossession(lineup: MatchPlayer[]): number {
  return teamPhaseRaw(lineup, "possession") * POSSESSION_SCALE;
}

/** Podíl domácích na míči z kontroly obou týmů (bez výhody domácích a mezí). */
export function possessionShare(homeControl: number, awayControl: number): number {
  const h = Math.max(0, homeControl) ** POSSESSION_EXPONENT;
  const a = Math.max(0, awayControl) ** POSSESSION_EXPONENT;
  return h + a > 0 ? h / (h + a) : 0.5;
}

// ── Brankář ────────────────────────────────────────────────────────────────

/**
 * Zákrok brankáře na stejné škále jako chytání (0–100+). Vedle chytání rozhoduje
 * postavení (obrana), výdrž a zkušenost (soustředění celý zápas) a vybíhání (rychlost).
 * Bonus trenéra brankářů a vybavení (`gkBonus`) se přičítá až sem, takže nepropadá
 * ani u brankáře, který má chytání 100.
 */
export const GK_SITUATIONS: Record<"shot" | "aerial" | "oneOnOne" | "penalty", Coeffs> = {
  shot: { goalkeeping: 4.0, defense: 2.23, experience: 1.43, speed: 1.33 },
  /** Centr a hlavička: k chytání dosah (hlavičky + výška) a souboj o míč (síla). */
  aerial: { heading: 3.07, goalkeeping: 2.67, strength: 1.93, defense: 1.67 },
  /** Sám před brankářem po brejku: rozhoduje vybíhání a postavení. */
  oneOnOne: { speed: 7.99, goalkeeping: 2.67, defense: 2.23, experience: 1.43 },
  /** Penalta: čistý souboj, zkušený brankář nečeká a nevyskočí dřív. */
  penalty: { goalkeeping: 5.34, experience: 2.86 },
};

/**
 * Váha brankáře proti obráncům u každé střely: zákrok × váha + obrana obránců, děleno
 * (váha + 1). Do 2026-10-10 napevno 2 (brankář 2/3, obránci 1/3), naladěná hodnota je skoro stejná.
 */
export const GK_SHOT_WEIGHT = { value: 2.04 };

function weighted(p: MatchPlayer, coeffs: Coeffs): number {
  return weightedCompiled(p, compile(coeffs));
}

function weightedCompiled(p: MatchPlayer, t: CompiledCoeffs): number {
  if (t.total === 0) return 0;
  let sum = 0;
  for (let i = 0; i < t.keys.length; i++) sum += t.coefs[i] * valueOf(p, t.keys[i]);
  return sum / t.total;
}

let gkTables = {} as Record<"shot" | "aerial" | "oneOnOne" | "penalty", CompiledCoeffs>;
let finishTables = {} as Record<Exclude<Slot, "GK">, { shot: CompiledCoeffs; header: CompiledCoeffs }>;

export type GkSituation = "shot" | "header" | "oneOnOne" | "penalty" | "aerial";

export function gkValue(gk: MatchPlayer, situation: GkSituation): number {
  const bonus = gk.gkBonus ?? 0;
  // Výdrž brankáře = soustředění celý zápas, stejný princip jako u hráčů v poli.
  const focus = 1 + STAMINA_EFFECT.GK * (gk.stamina - 50) / 100;
  switch (situation) {
    case "shot": return (weightedCompiled(gk, gkTables.shot) + bonus) * focus;
    case "header":
    case "aerial": return (weightedCompiled(gk, gkTables.aerial) + bonus) * gkReachFactor(gk.height) * focus;
    case "oneOnOne": return (weightedCompiled(gk, gkTables.oneOnOne) + bonus) * focus;
    case "penalty": return (weightedCompiled(gk, gkTables.penalty) + bonus) * focus;
  }
}

// ── Zakončení ──────────────────────────────────────────────────────────────

/**
 * Zakončení podle postu, ze kterého hráč střílí. Střela nohou: střelba, technika
 * a chladná hlava (zkušenost). Hlavička: hlavičky, síla v souboji a zkušenost.
 * Brankář nestřílí (pickAttacker ho vynechává).
 */
export const FINISHING: Record<Exclude<Slot, "GK">, { shot: Coeffs; header: Coeffs }> = {
  DEF: { shot: { shooting: 2.38, experience: 0.93, technique: 0.62 }, header: { heading: 1.98, strength: 1.42, experience: 0.93 } },
  MID: { shot: { shooting: 2.29, experience: 0.72, technique: 0.53 }, header: { heading: 3.83, strength: 1.38, experience: 0.72 } },
  FWD: { shot: { shooting: 1.85, technique: 0.71, experience: 0.48 }, header: { heading: 0.97, experience: 0.48, strength: 0.39 } },
};

export function finishingValue(p: MatchPlayer, header: boolean): number {
  const slot = slotOf(p);
  const table = finishTables[slot === "GK" ? "FWD" : slot];
  return weightedCompiled(p, header ? table.header : table.shot) * freshness(p);
}

// ── Náhled síly sestavy ────────────────────────────────────────────────────

/**
 * Hodnocení hráče v jeho roli na stupnici dovedností (0–100): vážený průměr vlastností
 * podle toho, jak je jeho post v zápase používá, krát čerstvost. Brankář podle zákroků.
 */
export function playerRoleRating(p: MatchPlayer): number {
  const slot = slotOf(p);
  if (slot === "GK") {
    const team = weighted(p, { ...TEAM_PHASES.possession.GK, ...TEAM_PHASES.defense.GK });
    const save = gkValue(p, "shot") * 0.6 + gkValue(p, "aerial") * 0.2 + gkValue(p, "oneOnOne") * 0.2;
    return (save * 0.85 + team * 0.15) * freshness(p);
  }
  const merged: Coeffs = {};
  for (const phase of Object.values(TEAM_PHASES)) {
    for (const [skill, c] of Object.entries(phase[slot]) as Array<[RoleSkill, number]>) {
      merged[skill] = (merged[skill] ?? 0) + c;
    }
  }
  if (slot === "FWD") for (const [skill, c] of Object.entries(FINISHING.FWD.shot) as Array<[RoleSkill, number]>) merged[skill] = (merged[skill] ?? 0) + c;
  return weighted(p, merged) * freshness(p);
}

/** Útok týmu na stupnici náhledu: 50 = průměrný tým (všechno 50). */
export function teamAttackIndex(lineup: MatchPlayer[]): number {
  return (teamAttack(lineup) / REFERENCE_ATTACK) * 50;
}

/** Obrana týmu na stupnici náhledu: 50 = průměrný tým (všechno 50). */
export function teamDefenseIndex(lineup: MatchPlayer[]): number {
  return (teamDefense(lineup) / REFERENCE_DEFENSE) * 50;
}

/** Všechny koeficienty, ve kterých post vlastnost používá — pro hlídací test. */
export function slotSkillUses(slot: Slot): Set<RoleSkill> {
  // Výdrž násobí všechno, co hráč dělá (STAMINA_EFFECT), takže ji používá každý post.
  const used = new Set<RoleSkill>(STAMINA_EFFECT[slot] > 0 ? ["stamina"] : []);
  for (const phase of Object.values(TEAM_PHASES)) {
    for (const [skill, c] of Object.entries(phase[slot]) as Array<[RoleSkill, number]>) if (c > 0) used.add(skill);
  }
  if (slot === "GK") {
    for (const c of Object.values(GK_SITUATIONS)) {
      for (const [skill, v] of Object.entries(c) as Array<[RoleSkill, number]>) if (v > 0) used.add(skill);
    }
  } else {
    // Střílí a hlavičkuje kdokoli z pole, exekutora standardek určuje manažer.
    for (const c of [FINISHING[slot].shot, FINISHING[slot].header]) {
      for (const [skill, v] of Object.entries(c) as Array<[RoleSkill, number]>) if (v > 0) used.add(skill);
    }
    used.add("setPieces");
  }
  return used;
}

refreshRoleScales();
