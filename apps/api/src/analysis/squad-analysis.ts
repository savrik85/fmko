/**
 * Rozbor kádru od asistenta trenéra (záložka Rozbor v Kádru).
 *
 * Počítá se z modelu rolí, který hraje zápasy (engine/roles.ts): síla řad, co tým drží
 * a co brzdí, kde posílit, jaký styl kádru sedí a na co si dát pozor. Hráč nevidí čísla
 * ani vzorce, jen slova a pruhy.
 *
 * Asistent je ten, kdo rozbor píše, takže jeho přesnost záleží na něm:
 *  - slabý asistent odhaduje řady s velkým rozptylem (může prohodit sousední verdikty),
 *    mluví hrubší škálou, řekne méně postřehů, jmenuje míň hráčů a vlastností a může
 *    minout post, kde by posila pomohla nejvíc,
 *  - dobrý asistent je přesný a úplný.
 * Rozptyl je stabilní pro tým, asistenta a herní týden (posun ze `stableOffset`, výběr
 * vět z `createRng`), takže obnovení stránky nic nezmění a nedá se „vyrolovat“.
 *
 * Čisté funkce, žádná DB. Načtení dat dělá squad-analysis-data.ts.
 */

import type { MatchPlayer, Tactic } from "../engine/types";
import {
  FINISHING, GK_SHOT_WEIGHT, GK_SITUATIONS, TEAM_PHASES,
  finishingValue, gkValue, playerRoleRating, possessionShare, skillOf, slotOf, slotSkillUses,
  teamAttack, teamDefense, teamPossession,
  type RoleSkill, type Slot,
} from "../engine/roles";
import { RATING_WEIGHTS } from "@okresni-masina/shared";
import { TACTIC_CATALOG, calcTacticEffectiveness } from "../engine/tactics";
import { calcHardnessFit } from "../engine/hardness";
import type { WeightCategory } from "../generators/physicals";
import { createRng, type Rng } from "../generators/rng";
import { stableOffset, stableSeed } from "../lib/scout-estimate";
import { rowEffectiveness, type StaffEffectRow } from "../staff/staff-effects";
import {
  ASPECT_TEXTS, LINE_FORMS, SKILL_FORMS, STRONG_PLAYER_TEMPLATES, TACTIC_LABELS, WEAK_PLAYER_TEMPLATES,
  groupGen, joinCs, skillForms, skillsIns, skillsLoc, skillsNom, verdictPhrase,
  type AnalysisSkill, type LineVerdict,
} from "./squad-analysis-text";

export type { LineVerdict } from "./squad-analysis-text";

// ── Vstup ──────────────────────────────────────────────────────────────────

/** Hráč vlastního kádru: engine pohled (postava už započtená) a to, co hráč vidí. */
export interface SquadMember {
  id: string;
  name: string;
  /** Přirozený post. */
  position: Slot;
  /** Hráč pro engine; `matchPosition` = kde hraje v sestavě. */
  player: MatchPlayer;
  /** Dnešní kondice 0–100. Rozbor počítá s čerstvým mužstvem, kondice jde do varování. */
  condition: number;
  weightCategory: WeightCategory | null;
  injured: boolean;
}

export interface LeagueTeam {
  id: string;
  name: string;
  eleven: MatchPlayer[];
}

export interface AssistantProfile {
  id: string;
  name: string;
  firstName: string;
  female: boolean;
  /** 0–1, viz `assistantQuality`. */
  quality: number;
}

export interface SquadAnalysisInput {
  teamId: string;
  eleven: SquadMember[];
  /** Zbytek kádru (lavička, náhradníci) — hledá se v něm náhrada za nejslabší článek. */
  others: SquadMember[];
  lineupSource: "lineup" | "best11";
  formation: string;
  formationFamiliarity: Record<string, number>;
  /** Ostatní týmy ligy s celou jedenáctkou. */
  opponents: LeagueTeam[];
  assistant: AssistantProfile;
  /** Klíč herního týdne (pondělí), drží rozbor stejný celý týden. */
  week: string;
  /** Přírůstek dovedností z tréninku za poslední 4 týdny podle hráče (training_log). */
  growth?: Record<string, number>;
}

// ── Výstup ─────────────────────────────────────────────────────────────────

export type TextPart =
  | { kind: "text"; text: string }
  | { kind: "player"; id: string; name: string }
  | { kind: "team"; id: string; name: string };

export type AssistantLevel = "weak" | "average" | "good" | "excellent";

export interface LineReport {
  line: Slot;
  label: string;
  verdict: LineVerdict;
  /** Vágní asistent mluví jen třemi stupni (spíš silná / průměrná / spíš slabá). */
  vague: boolean;
  text: TextPart[];
  /** Kdo má v lize tuhle řadu nejsilnější (jen když to nejsme my a asistent to umí posoudit). */
  bestTeam: { id: string; name: string } | null;
  /** Pruh na škále ligy (0–1): odhad asistenta jako rozmezí, průměr soupeřů a nejlepší tým. */
  bar: { low: number; high: number; average: number; best: number };
}

export type AspectKey =
  | "gkSaves" | "gkAerial" | "gkCommand" | "gkDistribution"
  | "defBuildUp" | "defDuels" | "defSupport"
  | "midControl" | "midCreation" | "midDefending" | "midShooting"
  | "fwdMovement" | "fwdFinishing" | "fwdHoldUp" | "fwdPressing"
  | "workRate" | "experience";

export interface Insight {
  aspect: AspectKey;
  line: Slot | null;
  /** Proti komu: průměr soupeřů, špička ligy (slabiny silného týmu), chvost ligy (síly slabého). */
  scope: "league" | "top" | "bottom";
  title: string;
  text: TextPart[];
}

export interface Reinforcement {
  line: Slot;
  priority: "high" | "medium" | "low";
  text: TextPart[];
  /** Názvy vlastností, jak je hráč zná z profilu. */
  attributes: string[];
}

export type FitVerdict = "great" | "good" | "manageable" | "poor";

export interface TacticFit {
  tactic: Tactic;
  label: string;
  verdict: FitVerdict;
  /** Patří k tomu, co kádru sedí nejvíc (zvýrazní se v přehledu). */
  recommended: boolean;
  reason: string | null;
}

export interface StyleReport {
  summary: string;
  tactics: TacticFit[];
  hardness: { verdict: FitVerdict; text: string };
  formation: { formation: string; familiarity: "high" | "medium" | "low"; text: string };
}

export type WarningKind = "injured" | "outOfPosition" | "overweight" | "tired" | "lowStamina" | "inexperienced";

export interface Warning {
  kind: WarningKind;
  text: TextPart[];
}

export interface SquadAnalysisReport {
  status: "ready";
  assistant: { name: string; female: boolean; level: AssistantLevel; note: string };
  /** Verdikt asistenta dvěma až třemi větami: celkový dojem, o co se opřít, kam posilu. */
  headline: TextPart[];
  basis: { source: "lineup" | "best11"; formation: string };
  lines: LineReport[];
  strengths: Insight[];
  weaknesses: Insight[];
  reinforcements: Reinforcement[];
  style: StyleReport;
  warnings: Warning[];
  /** Klíčové vlastnosti každé řady: naši hráči proti průměru a špičce ligy. */
  lineTables: LineTable[];
  /** Věk, zkušenost, kdo roste a kdo stárne. */
  outlook: SquadOutlook;
}

export type AttributeVerdict = "strong" | "even" | "weak";

export interface LineAttribute {
  skill: AnalysisSkill;
  /** Průměr naší řady v základní sestavě. */
  ours: number;
  /** Průměr ligy na tomhle postu, jak ho asistent odhadne. */
  league: number;
  /** Průměr špičky ligy, jen když to asistent umí posoudit. */
  top: number | null;
  verdict: AttributeVerdict;
}

export interface LinePlayer {
  id: string;
  name: string;
  age: number | null;
  starter: boolean;
  injured: boolean;
  outOfPosition: boolean;
  values: Array<{ skill: AnalysisSkill; value: number; verdict: AttributeVerdict }>;
}

export interface LineTable {
  line: Slot;
  attributes: LineAttribute[];
  players: LinePlayer[];
  /** Co řadě z klíčových vlastností chybí a co hledat. */
  lookFor: TextPart[];
}

export interface SquadOutlook {
  verdict: TextPart[];
  /** Počty v celém kádru; průměr je základní sestavy proti sestavám soupeřů. */
  ages: { under21: number; prime: number; over30: number; average: number; leagueAverage: number };
  experience: { ours: number; league: number; verdict: AttributeVerdict };
  growing: Array<{ id: string; name: string; age: number | null; pace: "fast" | "steady" }>;
  veterans: Array<{ id: string; name: string; age: number | null }>;
  youngsters: Array<{ id: string; name: string; age: number | null; starter: boolean }>;
}

// ── Kvalita asistenta ──────────────────────────────────────────────────────

/**
 * Jak dobře asistent čte hru (0–1): ze tří čtvrtin jeho efektivita v roli (trénování
 * a komunikace, stejně jako u tréninku), ze čtvrtiny úsudek. Posun −2 a dělení 16
 * roztáhne skutečné asistenty z produkce (efektivita 6–18) zhruba na 0,2–0,85.
 */
export function assistantQuality(row: StaffEffectRow): number {
  const eff = rowEffectiveness(row, "asistent");
  const blended = 0.75 * eff + 0.25 * (typeof row.judgement === "number" ? row.judgement : 5);
  return clamp01((blended - 2) / 16);
}

export function assistantLevel(quality: number): AssistantLevel {
  if (quality < 0.35) return "weak";
  if (quality < 0.55) return "average";
  if (quality < 0.75) return "good";
  return "excellent";
}

interface Precision {
  level: AssistantLevel;
  /** Jen tři stupně (spíš silná / průměrná / spíš slabá). */
  vague: boolean;
  /** Pět stupňů, bez „nejlepší / nejslabší v lize“. */
  coarse: boolean;
  /** Pruh: polovina šířky rozmezí jako podíl rozpětí ligy. */
  bandHalfWidth: number;
  insights: number;
  attributes: number;
  players: number;
  /** Násobná chyba odhadu vlivu (0,5 = až ±50 %), mění pořadí, nikdy znaménko. */
  effectNoise: number;
  reinforcements: number;
  reinforcementAttributes: number;
  benchHint: boolean;
  bestTeam: boolean;
  tacticReasons: "all" | "extremes" | "none";
  fitNoise: number;
  warningKinds: ReadonlySet<WarningKind>;
  maxWarnings: number;
}

const ALL_WARNINGS: WarningKind[] = ["injured", "outOfPosition", "overweight", "tired", "lowStamina", "inexperienced"];

function precisionFor(quality: number): Precision {
  const level = assistantLevel(quality);
  const q = clamp01(quality);
  const common = {
    level,
    bandHalfWidth: 0.05 + 0.35 * (1 - q),
    effectNoise: 0.7 * (1 - q),
    fitNoise: 0.08 * (1 - q),
  };
  switch (level) {
    case "weak":
      return {
        ...common, vague: true, coarse: true, insights: 2, attributes: 1, players: 0,
        reinforcements: 2, reinforcementAttributes: 1, benchHint: false, bestTeam: false, tacticReasons: "none",
        warningKinds: new Set<WarningKind>(["injured", "outOfPosition", "overweight"]), maxWarnings: 3,
      };
    case "average":
      return {
        ...common, vague: false, coarse: true, insights: 3, attributes: 1, players: 1,
        reinforcements: 3, reinforcementAttributes: 2, benchHint: true, bestTeam: true, tacticReasons: "extremes",
        warningKinds: new Set<WarningKind>(["injured", "outOfPosition", "overweight", "tired"]), maxWarnings: 5,
      };
    case "good":
      return {
        ...common, vague: false, coarse: false, insights: 3, attributes: 2, players: 2,
        reinforcements: 4, reinforcementAttributes: 3, benchHint: true, bestTeam: true, tacticReasons: "all",
        warningKinds: new Set<WarningKind>(ALL_WARNINGS), maxWarnings: 8,
      };
    case "excellent":
      return {
        ...common, vague: false, coarse: false, insights: 4, attributes: 2, players: 2,
        reinforcements: 4, reinforcementAttributes: 3, benchHint: true, bestTeam: true, tacticReasons: "all",
        warningKinds: new Set<WarningKind>(ALL_WARNINGS), maxWarnings: 8,
      };
  }
}

// ── Model zápasu (zjednodušený, deterministický) ───────────────────────────

/**
 * Převod na góly za zápas: 90 minut × základní šance (BASE_CHANCE 0,105) × proměňování
 * otevřené hry (0,9 × OPEN_PLAY_GOAL_SCALE 0,74) ze simulation.ts. Slouží jen k prahům
 * „stojí to za zmínku“, pořadí na něm nezávisí.
 */
const GOALS_PER_UNIT = 90 * 0.105 * 0.9 * 0.74;
/** Šance rostou s odmocninou poměru útok / obrana (STRENGTH_EXPONENT v simulation.ts). */
const STRENGTH_EXPONENT = 0.5;
/** Kdo střílí: útočník 4×, záložník 1×, obránce 0,3× (jako pickAttacker v simulation.ts). */
const SHOOTER_WEIGHT: Record<Slot, number> = { GK: 0, DEF: 0.3, MID: 1, FWD: 4 };
/** Podíl hlaviček mezi šancemi ze hry (calcGoalProb). */
const HEADER_SHARE = 0.3;

type Channel = "possession" | "attack" | "defense" | "keeper" | "finishing";

interface SideStats {
  possession: number;
  attack: number;
  defense: number;
  save: number;
  finishing: number;
  /** Průměrná obrana obránců, pomáhá brankáři u střel (calcGoalProb). */
  defLine: number;
}

function keeperOf(lineup: readonly MatchPlayer[]): MatchPlayer | undefined {
  return lineup.find((p) => slotOf(p) === "GK") ?? [...lineup].sort((a, b) => b.goalkeeping - a.goalkeeping)[0];
}

function keeperSave(lineup: readonly MatchPlayer[]): number {
  const gk = keeperOf(lineup);
  if (!gk) return 0;
  return (1 - HEADER_SHARE - 0.1) * gkValue(gk, "shot") + HEADER_SHARE * gkValue(gk, "header") + 0.1 * gkValue(gk, "oneOnOne");
}

function finishingPower(lineup: readonly MatchPlayer[]): number {
  let sum = 0;
  let weight = 0;
  for (const p of lineup) {
    const w = SHOOTER_WEIGHT[slotOf(p)] ?? 0;
    if (w === 0) continue;
    sum += w * ((1 - HEADER_SHARE) * finishingValue(p, false) + HEADER_SHARE * finishingValue(p, true));
    weight += w;
  }
  return weight > 0 ? sum / weight : 0;
}

function defLineOf(lineup: readonly MatchPlayer[]): number {
  const defs = lineup.filter((p) => slotOf(p) === "DEF");
  return defs.length > 0 ? defs.reduce((s, p) => s + p.defense, 0) / defs.length : 0;
}

function sideStats(lineup: MatchPlayer[]): SideStats {
  return {
    possession: teamPossession(lineup),
    attack: teamAttack(lineup),
    defense: teamDefense(lineup),
    save: keeperSave(lineup),
    finishing: finishingPower(lineup),
    defLine: defLineOf(lineup),
  };
}

/** Statistiky, kde se změna sestavy projeví jen ve vybraných fázích hry. */
function mixedStats(base: SideStats, modified: MatchPlayer[], channels: readonly Channel[] | "all"): SideStats {
  if (channels === "all") return sideStats(modified);
  const has = (c: Channel) => channels.includes(c);
  return {
    possession: has("possession") ? teamPossession(modified) : base.possession,
    attack: has("attack") ? teamAttack(modified) : base.attack,
    defense: has("defense") ? teamDefense(modified) : base.defense,
    save: has("keeper") ? keeperSave(modified) : base.save,
    finishing: has("finishing") ? finishingPower(modified) : base.finishing,
    defLine: has("defense") ? defLineOf(modified) : base.defLine,
  };
}

function conversion(finishing: number, save: number, defLine: number): number {
  const w = GK_SHOT_WEIGHT.value;
  const stop = (save * w + defLine) / (w + 1);
  return finishing + stop > 0 ? finishing / (finishing + stop) : 0;
}

/**
 * Očekávaný gólový rozdíl na zápas proti soupeři: kdo má míč (possessionShare), kolik
 * z držení vznikne šancí (poměr útok / obrana) a kolik se jich promění (zakončení proti
 * brankáři a obráncům). Bez taktiky, počasí a formy: rozbor hodnotí kádr, ne konkrétní zápas.
 */
function outlook(own: SideStats, opp: SideStats): number {
  const share = Math.min(0.7, Math.max(0.3, possessionShare(own.possession, opp.possession)));
  const chancesFor = (own.attack / Math.max(1e-6, opp.defense)) ** STRENGTH_EXPONENT;
  const chancesAgainst = (opp.attack / Math.max(1e-6, own.defense)) ** STRENGTH_EXPONENT;
  return GOALS_PER_UNIT * (
    share * chancesFor * conversion(own.finishing, opp.save, opp.defLine)
    - (1 - share) * chancesAgainst * conversion(opp.finishing, own.save, own.defLine)
  );
}

function leagueOutlook(own: SideStats, opponents: readonly SideStats[]): number {
  if (opponents.length === 0) return 0;
  return opponents.reduce((s, o) => s + outlook(own, o), 0) / opponents.length;
}

// ── Vlastnosti hráčů ───────────────────────────────────────────────────────

function readSkill(p: MatchPlayer, skill: AnalysisSkill): number | undefined {
  switch (skill) {
    case "height": return p.height;
    case "workRate": return p.workRate;
    case "aggression": return p.aggression;
    default: return skillOf(p, skill as RoleSkill);
  }
}

function withSkills(p: MatchPlayer, values: ReadonlyArray<[AnalysisSkill, number | undefined]>): MatchPlayer {
  const copy = { ...p } as MatchPlayer & Record<string, unknown>;
  for (const [skill, value] of values) {
    if (value === undefined) continue;
    copy[skill] = value;
  }
  return copy;
}

/** Rozbor hodnotí kádr, ne dnešní únavu: všichni s plnou kondicí. */
function fresh(p: MatchPlayer): MatchPlayer {
  return { ...p, condition: 100 };
}

type SlotAverages = Record<Slot, Partial<Record<AnalysisSkill, number>>>;

const TRACKED_SKILLS: AnalysisSkill[] = [
  "speed", "technique", "shooting", "passing", "heading", "defense", "goalkeeping", "stamina", "strength",
  "vision", "creativity", "setPieces", "experience", "workRate", "aggression", "height",
];

function slotAverages(teams: readonly MatchPlayer[][]): SlotAverages {
  const sums: Record<Slot, Partial<Record<AnalysisSkill, { sum: number; n: number }>>> = { GK: {}, DEF: {}, MID: {}, FWD: {} };
  for (const team of teams) {
    for (const p of team) {
      const slot = slotOf(p);
      for (const skill of TRACKED_SKILLS) {
        const v = readSkill(p, skill);
        if (typeof v !== "number" || !Number.isFinite(v)) continue;
        const cell = sums[slot][skill] ?? { sum: 0, n: 0 };
        cell.sum += v;
        cell.n += 1;
        sums[slot][skill] = cell;
      }
    }
  }
  const out: SlotAverages = { GK: {}, DEF: {}, MID: {}, FWD: {} };
  for (const slot of Object.keys(sums) as Slot[]) {
    for (const [skill, cell] of Object.entries(sums[slot]) as Array<[AnalysisSkill, { sum: number; n: number }]>) {
      if (cell.n > 0) out[slot][skill] = cell.sum / cell.n;
    }
  }
  return out;
}

function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

// ── Vlastnosti hry (co nás drží a co brzdí) ────────────────────────────────

interface AspectDef {
  key: AspectKey;
  line: Slot | null;
  who: (p: MatchPlayer) => boolean;
  skills: AnalysisSkill[];
  channels: readonly Channel[] | "all";
}

/** Zkušenost a výdrž mají vlastní položku, v ostatních by se počítaly dvakrát. */
function roleSkills(coeffs: object): AnalysisSkill[] {
  return Object.keys(coeffs).filter((k) => k !== "experience" && k !== "stamina") as AnalysisSkill[];
}

function union(...lists: AnalysisSkill[][]): AnalysisSkill[] {
  return [...new Set(lists.flat())];
}

const inLine = (slot: Slot) => (p: MatchPlayer) => slotOf(p) === slot;
const GK_SAVE_SKILLS = union(roleSkills(GK_SITUATIONS.shot), roleSkills(GK_SITUATIONS.oneOnOne));

/** Vlastnosti hry přímo z koeficientů modelu rolí — když se přeladí, rozbor se posune s ním. */
const ASPECTS: AspectDef[] = [
  { key: "gkSaves", line: "GK", who: inLine("GK"), skills: GK_SAVE_SKILLS, channels: ["keeper"] },
  {
    key: "gkAerial", line: "GK", who: inLine("GK"),
    skills: [...roleSkills(GK_SITUATIONS.aerial).filter((s) => !GK_SAVE_SKILLS.includes(s)), "height"],
    channels: ["keeper"],
  },
  { key: "gkCommand", line: "GK", who: inLine("GK"), skills: roleSkills(TEAM_PHASES.defense.GK), channels: ["defense"] },
  { key: "gkDistribution", line: "GK", who: inLine("GK"), skills: roleSkills(TEAM_PHASES.possession.GK), channels: ["possession"] },
  { key: "defBuildUp", line: "DEF", who: inLine("DEF"), skills: roleSkills(TEAM_PHASES.possession.DEF), channels: ["possession"] },
  { key: "defDuels", line: "DEF", who: inLine("DEF"), skills: roleSkills(TEAM_PHASES.defense.DEF), channels: ["defense"] },
  { key: "defSupport", line: "DEF", who: inLine("DEF"), skills: roleSkills(TEAM_PHASES.attack.DEF), channels: ["attack"] },
  { key: "midControl", line: "MID", who: inLine("MID"), skills: roleSkills(TEAM_PHASES.possession.MID), channels: ["possession"] },
  { key: "midCreation", line: "MID", who: inLine("MID"), skills: roleSkills(TEAM_PHASES.attack.MID), channels: ["attack"] },
  { key: "midDefending", line: "MID", who: inLine("MID"), skills: roleSkills(TEAM_PHASES.defense.MID), channels: ["defense"] },
  { key: "midShooting", line: "MID", who: inLine("MID"), skills: roleSkills(FINISHING.MID.shot), channels: ["finishing"] },
  { key: "fwdMovement", line: "FWD", who: inLine("FWD"), skills: roleSkills(TEAM_PHASES.attack.FWD), channels: ["attack"] },
  {
    key: "fwdFinishing", line: "FWD", who: inLine("FWD"),
    skills: union(roleSkills(FINISHING.FWD.shot), roleSkills(FINISHING.FWD.header)), channels: ["finishing"],
  },
  { key: "fwdHoldUp", line: "FWD", who: inLine("FWD"), skills: roleSkills(TEAM_PHASES.possession.FWD), channels: ["possession"] },
  { key: "fwdPressing", line: "FWD", who: inLine("FWD"), skills: roleSkills(TEAM_PHASES.defense.FWD), channels: ["defense"] },
  { key: "workRate", line: null, who: (p) => slotOf(p) !== "GK", skills: ["stamina", "workRate"], channels: "all" },
  { key: "experience", line: null, who: () => true, skills: ["experience"], channels: "all" },
];

/** Jaký by byl tým, kdyby vybraní hráči měli dané vlastnosti jako průměr soupeřů na svém postu. */
function toLeagueAverage(
  lineup: MatchPlayer[],
  who: (p: MatchPlayer) => boolean,
  skills: readonly AnalysisSkill[],
  avg: SlotAverages,
): MatchPlayer[] {
  return lineup.map((p) => (who(p) ? withSkills(p, skills.map((s) => [s, avg[slotOf(p)][s]])) : p));
}

interface AspectEffect {
  def: AspectDef;
  /** Kolik gólů za zápas nám vlastnost přidává (+) nebo bere (−) proti průměru soupeřů. */
  effect: number;
  bySkill: Array<{ skill: AnalysisSkill; effect: number }>;
  byPlayer: Array<{ player: MatchPlayer; effect: number }>;
}

function aspectEffects(lineup: MatchPlayer[], base: SideStats, baseOutlook: number, opponents: SideStats[], avg: SlotAverages): AspectEffect[] {
  const effectOf = (modified: MatchPlayer[], channels: readonly Channel[] | "all") =>
    baseOutlook - leagueOutlook(mixedStats(base, modified, channels), opponents);

  return ASPECTS
    .filter((def) => lineup.some(def.who))
    .map((def) => {
      const effect = effectOf(toLeagueAverage(lineup, def.who, def.skills, avg), def.channels);
      const bySkill = def.skills.map((skill) => ({
        skill,
        effect: effectOf(toLeagueAverage(lineup, def.who, [skill], avg), def.channels),
      }));
      const byPlayer = lineup.filter(def.who).map((player) => ({
        player,
        effect: effectOf(toLeagueAverage(lineup, (p) => p === player, def.skills, avg), def.channels),
      }));
      return { def, effect, bySkill, byPlayer };
    });
}

// ── Pomocné ────────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

const txt = (text: string): TextPart => ({ kind: "text", text });

function playerParts(members: readonly SquadMember[]): TextPart[] {
  const parts: TextPart[] = [];
  members.forEach((m, i) => {
    if (i > 0) parts.push(txt(i === members.length - 1 ? " a " : ", "));
    parts.push({ kind: "player", id: m.id, name: m.name });
  });
  return parts;
}

const LINES: Slot[] = ["GK", "DEF", "MID", "FWD"];

// ── Rozbor ─────────────────────────────────────────────────────────────────

export function buildSquadAnalysis(input: SquadAnalysisInput): SquadAnalysisReport {
  const { assistant } = input;
  const precision = precisionFor(assistant.quality);
  const seed = `${input.teamId}:${assistant.id}:${input.week}`;
  /** Stabilní posun −1…1 pro danou položku (jako odhady skauta). */
  const noise = (key: string) => stableOffset(`${seed}:${key}`);
  const rng = createRng(stableSeed(seed));

  const memberByPlayer = new Map<MatchPlayer, SquadMember>();
  const lineup = input.eleven.map((m) => {
    const p = fresh(m.player);
    memberByPlayer.set(p, m);
    return p;
  });
  const opponentLineups = input.opponents.map((t) => t.eleven.map(fresh));
  const avg = slotAverages(opponentLineups);
  const opponentStats = opponentLineups.map(sideStats);
  const base = sideStats(lineup);
  const baseOutlook = leagueOutlook(base, opponentStats);

  const lines = lineReports(input, lineup, opponentLineups, precision, noise);

  // Špička a chvost ligy podle průměrného hodnocení rolí v jedenáctce.
  const byStrength = opponentLineups
    .map((team) => ({ team, rating: team.reduce((s, p) => s + playerRoleRating(p), 0) / Math.max(1, team.length) }))
    .sort((a, b) => b.rating - a.rating)
    .map((x) => x.team);
  const edge = Math.min(3, Math.max(1, Math.floor(byStrength.length / 3)));
  const { strengths, weaknesses } = insights(
    aspectEffects(lineup, base, baseOutlook, opponentStats, avg),
    () => aspectEffects(lineup, base, baseOutlook, opponentStats, slotAverages(byStrength.slice(0, edge))),
    () => aspectEffects(lineup, base, baseOutlook, opponentStats, slotAverages(byStrength.slice(-edge))),
    memberByPlayer, precision, noise, rng,
  );

  const reinforcements = reinforcementReports(
    input, lineup, memberByPlayer, baseOutlook, opponentStats, signingTargets(opponentLineups), precision, noise, rng,
  );
  const style = styleReport(input, lineup, precision, noise);
  const warnings = warningReports(input, opponentLineups, precision);
  const lineTables = buildLineTables(input, lineup, avg, slotAverages(byStrength.slice(0, edge)), precision, noise);
  const outlook = buildOutlook(input, opponentLineups, precision, noise);

  return {
    status: "ready",
    assistant: { name: assistant.name, female: assistant.female, level: precision.level, note: assistantNote(assistant, precision.level) },
    headline: headlineFor(lines, weaknesses, reinforcements, assistant.female),
    basis: { source: input.lineupSource, formation: input.formation },
    lines,
    strengths,
    weaknesses,
    reinforcements,
    style,
    warnings,
    lineTables,
    outlook,
  };
}

const VERDICT_RANK: Record<LineVerdict, number> = {
  best: 6, top: 5, aboveAverage: 4, average: 3, belowAverage: 2, bottom: 1, worst: 0,
};
/** Řada ve 4. pádě („opřít se o zálohu“) a v 1. pádě malým písmenem. */
const LINE_ACC: Record<Slot, string> = { GK: "brankáře", DEF: "obranu", MID: "zálohu", FWD: "útok" };
const LINE_NOM: Record<Slot, string> = { GK: "brankář", DEF: "obrana", MID: "záloha", FWD: "útok" };
const LINE_INTO: Record<Slot, string> = { GK: "do branky", DEF: "do obrany", MID: "do zálohy", FWD: "do útoku" };

/**
 * Verdikt nahoře v záložce: celkový dojem z kádru, o kterou řadu se opřít a která drží
 * zpátky, a kam by asistent hledal posilu. Skládá se z toho, co asistent vidí (verdikty
 * řad už jsou rozmazané podle jeho kvality), takže slabý asistent řekne i hrubší větu.
 */
export function headlineFor(lines: LineReport[], weaknesses: Insight[], reinforcements: Reinforcement[], female: boolean): TextPart[] {
  const ranked = lines.map((l) => ({ line: l.line, rank: VERDICT_RANK[l.verdict] })).sort((a, b) => b.rank - a.rank);
  const avg = ranked.reduce((s, l) => s + l.rank, 0) / Math.max(1, ranked.length);
  const overall = avg >= 5.5 ? "Máme jeden z nejsilnějších kádrů ligy."
    : avg >= 4.5 ? "Kádr patří k lepším v lize."
      : avg >= 3.5 ? "Kádr je o kousek nad průměrem ligy."
        : avg >= 2.5 ? "Kádr je průměrný."
          : avg >= 1.5 ? "Kádr je pod průměrem ligy."
            : "Kádr patří k nejslabším v lize.";
  const parts: string[] = [overall];
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  if (best && worst && best.rank - worst.rank >= 2) {
    parts.push(`Nejvíc se můžeme opřít o ${LINE_ACC[best.line]}, zpátky nás drží ${LINE_NOM[worst.line]}.`);
  } else if (weaknesses[0]) {
    const t = weaknesses[0].title;
    parts.push(`Nejvíc nás brzdí tohle: ${t.charAt(0).toLowerCase()}${t.slice(1)}.`);
  } else {
    parts.push("Řady máme vyrovnané.");
  }
  const signing = reinforcements[0];
  if (signing && signing.priority !== "low") {
    parts.push(`Posilu bych ${female ? "hledala" : "hledal"} ${LINE_INTO[signing.line]}.`);
  }
  return [{ kind: "text", text: parts.join(" ") }];
}

/** Poctivá věta o tom, jak moc se dá rozboru věřit. */
export function assistantNote(a: Pick<AssistantProfile, "firstName">, level: AssistantLevel): string {
  switch (level) {
    case "weak":
      return `${a.firstName} se snaží, ale hru čte jen zhruba. Ber rozbor s rezervou, lepší asistent by viděl víc a přesněji.`;
    case "average":
      return `Rozbor je slušný, ale některé věci ${a.firstName} přehlédne nebo odhadne vedle. Lepší asistent by viděl víc.`;
    case "good":
      return `${a.firstName} vidí hru dobře, většině postřehů se dá věřit.`;
    case "excellent":
      return `${a.firstName} čte hru jako málokdo. Rozbor je přesný a úplný.`;
  }
}

// ── Síla řad ───────────────────────────────────────────────────────────────

function lineValue(lineup: readonly MatchPlayer[], line: Slot): number | null {
  const players = lineup.filter((p) => slotOf(p) === line);
  if (players.length === 0) return null;
  return players.reduce((s, p) => s + playerRoleRating(p), 0) / players.length;
}

function verdictFor(estimate: number, others: readonly number[], precision: Precision): LineVerdict {
  const below = others.filter((v) => v < estimate).length;
  const share = others.length > 0 ? below / others.length : 0.5;
  let verdict: LineVerdict;
  if (others.length > 0 && estimate > Math.max(...others)) verdict = "best";
  else if (others.length > 0 && estimate < Math.min(...others)) verdict = "worst";
  else if (share >= 0.75) verdict = "top";
  else if (share >= 0.55) verdict = "aboveAverage";
  else if (share >= 0.4) verdict = "average";
  else if (share >= 0.2) verdict = "belowAverage";
  else verdict = "bottom";
  if (precision.coarse) {
    if (verdict === "best") verdict = "top";
    if (verdict === "worst") verdict = "bottom";
  }
  if (precision.vague) {
    if (verdict === "top") verdict = "aboveAverage";
    if (verdict === "bottom") verdict = "belowAverage";
  }
  return verdict;
}

function lineReports(
  input: SquadAnalysisInput,
  lineup: MatchPlayer[],
  opponentLineups: MatchPlayer[][],
  precision: Precision,
  noise: (key: string) => number,
): LineReport[] {
  const reports: LineReport[] = [];
  for (const line of LINES) {
    const own = lineValue(lineup, line);
    if (own === null) continue;
    const others = opponentLineups
      .map((team, i) => ({ team: input.opponents[i], value: lineValue(team, line) }))
      .filter((x): x is { team: LeagueTeam; value: number } => x.value !== null);
    const values = others.map((o) => o.value);
    const all = [...values, own];
    const range = Math.max(1, Math.max(...all) - Math.min(...all));

    // Rozmezí jako u skauta: skutečná hodnota v něm leží vždy, jen ne vždy uprostřed.
    const half = precision.bandHalfWidth * range;
    const estimate = own + noise(`line:${line}`) * 0.8 * half;
    const verdict = verdictFor(estimate, values, precision);

    const lo = Math.min(...all, estimate - half) - 0.08 * range;
    const hi = Math.max(...all, estimate + half) + 0.08 * range;
    const scale = (v: number) => clamp01((v - lo) / Math.max(1e-6, hi - lo));
    const average = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : own;
    const best = others.length > 0 ? others.reduce((a, b) => (b.value > a.value ? b : a)) : null;

    const forms = LINE_FORMS[line];
    const text: TextPart[] = [txt(`${forms.label} ${verdictPhrase(verdict, forms.feminine, precision.vague)}.`)];
    const bestTeam = precision.bestTeam && best && verdict !== "best" && best.value > estimate
      ? { id: best.team.id, name: best.team.name }
      : null;
    if (bestTeam) text.push(txt(` ${forms.bestAcc} má `), { kind: "team", ...bestTeam }, txt("."));

    reports.push({
      line,
      label: forms.label,
      verdict,
      vague: precision.vague,
      text,
      bestTeam,
      bar: {
        low: scale(estimate - half),
        high: scale(estimate + half),
        average: scale(average),
        best: scale(best ? best.value : own),
      },
    });
  }
  return reports;
}

// ── Co nás drží a co brzdí ─────────────────────────────────────────────────

/** Pod tímhle vlivem (góly za zápas) asistent vlastnost nezmiňuje. */
const MIN_ASPECT_EFFECT = 0.03;
/** Kolik postřehů na každou stranu chce asistent mít, než sáhne po srovnání se špičkou / chvostem ligy. */
const MIN_INSIGHTS = 2;

type InsightScope = Insight["scope"];

interface RankedEffect extends AspectEffect {
  perceived: number;
  scope: InsightScope;
}

function rankEffects(effects: AspectEffect[], scope: InsightScope, precision: Precision, noise: (key: string) => number): RankedEffect[] {
  return effects.map((e) => ({
    ...e,
    scope,
    // Násobná chyba: slabý asistent přecení nebo podcení, ale sílu za slabinu nevydává.
    perceived: e.effect * (1 + noise(`aspect:${scope}:${e.def.key}`) * precision.effectNoise),
  }));
}

function strongest(ranked: RankedEffect[], positive: boolean): RankedEffect[] {
  const sign = positive ? 1 : -1;
  return ranked.filter((e) => e.perceived * sign >= MIN_ASPECT_EFFECT).sort((a, b) => (b.perceived - a.perceived) * sign);
}

const SCOPE_LEAD: Record<InsightScope, string> = {
  league: "",
  top: "Proti špičce ligy: ",
  bottom: "Proti slabším týmům ligy: ",
};

function buildInsight(
  e: RankedEffect,
  positive: boolean,
  memberByPlayer: Map<MatchPlayer, SquadMember>,
  precision: Precision,
  rng: Rng,
): Insight {
  const sign = positive ? 1 : -1;
  const keeper = e.def.line === "GK";
  const texts = ASPECT_TEXTS[e.def.key];
  const title = rng.pick(positive ? texts.strong : texts.weak);

  const skills = e.bySkill.filter((s) => s.effect * sign > 0).sort((a, b) => (b.effect - a.effect) * sign);
  const topSkill = Math.abs(skills[0]?.effect ?? 0);
  const namedSkills = skills
    .filter((s) => Math.abs(s.effect) >= 0.25 * topSkill)
    .slice(0, precision.attributes)
    .map((s) => s.skill);

  const players = e.byPlayer.filter((p) => p.effect * sign > 0).sort((a, b) => (b.effect - a.effect) * sign);
  const topPlayer = Math.abs(players[0]?.effect ?? 0);
  const named = players
    .filter((p) => Math.abs(p.effect) >= 0.3 * topPlayer)
    .slice(0, precision.players)
    .map((p) => memberByPlayer.get(p.player))
    .filter((m): m is SquadMember => !!m);

  const text: TextPart[] = SCOPE_LEAD[e.scope] ? [txt(SCOPE_LEAD[e.scope])] : [];
  if (namedSkills.length === 0) {
    text.push(txt(positive ? "Tady jsme silnější než soupeři." : "Tady za soupeři zaostáváme."));
  } else if (named.length === 0 && e.def.key === "experience") {
    // Nadpis už zkušenost jmenuje, „Chybí zkušenost.“ by ho jen opakovalo.
    text.push(txt(positive ? "Ostřílení hráči drží tým v klidu i v koncovce." : "Hodně kluků v sestavě nemá odehráno dost zápasů."));
  } else if (named.length === 0) {
    text.push(txt(positive ? `Síla je ${skillsLoc(namedSkills, keeper)}.` : `Chybí ${skillsNom(namedSkills, keeper)}.`));
  } else {
    const verb = rng.pick(positive ? STRONG_PLAYER_TEMPLATES : WEAK_PLAYER_TEMPLATES);
    text.push(...playerParts(named), txt(` ${named.length === 1 ? verb.one : verb.many} ${skillsLoc(namedSkills, keeper)}.`));
  }
  return { aspect: e.def.key, line: e.def.line, scope: e.scope, title, text };
}

/**
 * Silné a slabé stránky proti průměru soupeřů. Tým, který je nad průměrem skoro všude,
 * by neslyšel nic o slabinách, a přitom chce vědět, co mu chybí na čelo ligy. Proto
 * když je postřehů málo, asistent doplní srovnání se špičkou (slabiny) nebo s chvostem
 * ligy (síly).
 */
function insights(
  league: AspectEffect[],
  vsTop: () => AspectEffect[],
  vsBottom: () => AspectEffect[],
  memberByPlayer: Map<MatchPlayer, SquadMember>,
  precision: Precision,
  noise: (key: string) => number,
  rng: Rng,
): { strengths: Insight[]; weaknesses: Insight[] } {
  const ranked = rankEffects(league, "league", precision, noise);
  const pick = (positive: boolean, fallback: () => AspectEffect[], scope: InsightScope): RankedEffect[] => {
    const chosen = strongest(ranked, positive).slice(0, precision.insights);
    if (chosen.length >= MIN_INSIGHTS) return chosen;
    const used = new Set(chosen.map((e) => e.def.key));
    const extra = strongest(rankEffects(fallback(), scope, precision, noise), positive).filter((e) => !used.has(e.def.key));
    return [...chosen, ...extra].slice(0, Math.max(MIN_INSIGHTS, chosen.length));
  };
  const strong = pick(true, vsBottom, "bottom");
  const weak = pick(false, vsTop, "top");
  return {
    strengths: distinct(strong.map((e) => buildInsight(e, true, memberByPlayer, precision, rng))),
    weaknesses: distinct(weak.map((e) => buildInsight(e, false, memberByPlayer, precision, rng))),
  };
}

/** Dvě vlastnosti hry, které by řekly totéž (stejný hráč, stejná věta), asistent neopakuje. */
function distinct(list: Insight[]): Insight[] {
  const seen = new Set<string>();
  return list.filter((i) => {
    const key = i.text.map((p) => (p.kind === "text" ? p.text : p.id)).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Kde posílit ────────────────────────────────────────────────────────────

/**
 * Posila = hráč, jakého v lize mají lepší týmy: na místo nejslabšího hráče řady dostane
 * každou vlastnost, kterou jeho post v zápase používá, na úrovni horní čtvrtiny hráčů
 * ligy na tom postu (co už má lepší, zůstane). Přírůstek +10 bodů by nic nerozlišil:
 * model rolí je naladěný tak, aby hráč o 10 lepší přinesl na každém postu skoro stejně.
 * Takhle vyjde nejvíc tam, kde je proti lize největší díra.
 */
const SIGNING_PERCENTILE = 0.75;
const MIN_UPGRADE_GAIN = 0.01;
/** O kolik musí být hráč z kádru v roli lepší, aby ho asistent doporučil místo posily. */
const BENCH_MARGIN = 1.5;

type SlotTargets = Record<Slot, Partial<Record<AnalysisSkill, number>>>;

function signingTargets(opponentLineups: readonly MatchPlayer[][]): SlotTargets {
  const out: SlotTargets = { GK: {}, DEF: {}, MID: {}, FWD: {} };
  const players = opponentLineups.flat();
  for (const slot of LINES) {
    const inSlot = players.filter((p) => slotOf(p) === slot);
    for (const skill of TRACKED_SKILLS) {
      const v = percentile(inSlot.map((p) => readSkill(p, skill)).filter((x): x is number => typeof x === "number"), SIGNING_PERCENTILE);
      if (v !== null) out[slot][skill] = v;
    }
  }
  return out;
}

function signed(p: MatchPlayer, skills: readonly AnalysisSkill[], targets: SlotTargets): MatchPlayer {
  const slot = slotOf(p);
  return withSkills(p, skills.map((s) => {
    const own = readSkill(p, s);
    const target = targets[slot][s];
    if (typeof target !== "number") return [s, undefined];
    return [s, typeof own === "number" ? Math.max(own, target) : target];
  }));
}

/** Vlastnosti, které post v zápase používá (bez standardek, ty model zápasu nevidí). */
function lineSkills(line: Slot): AnalysisSkill[] {
  return [...slotSkillUses(line)].filter((s) => s !== "setPieces") as AnalysisSkill[];
}

function upgradeOptions(lineup: MatchPlayer[], baseOutlook: number, opponents: SideStats[], targets: SlotTargets) {
  const gainOf = (modified: MatchPlayer[]) => leagueOutlook(sideStats(modified), opponents) - baseOutlook;
  return LINES.flatMap((line) => {
    const players = lineup.filter((p) => slotOf(p) === line);
    if (players.length === 0) return [];
    const weakest = players.reduce((a, b) => (playerRoleRating(b) < playerRoleRating(a) ? b : a));
    const uses = lineSkills(line);
    const swap = (q: MatchPlayer) => lineup.map((p) => (p === weakest ? q : p));
    const gain = gainOf(swap(signed(weakest, uses, targets)));
    const skills = uses
      .map((s) => ({ s, g: gainOf(swap(signed(weakest, [s], targets))) }))
      .filter((x) => x.g > 0.002)
      .sort((a, b) => b.g - a.g)
      .map((x) => x.s);
    return [{ line, weakest, gain, skills }];
  });
}

function reinforcementReports(
  input: SquadAnalysisInput,
  lineup: MatchPlayer[],
  memberByPlayer: Map<MatchPlayer, SquadMember>,
  baseOutlook: number,
  opponents: SideStats[],
  targets: SlotTargets,
  precision: Precision,
  noise: (key: string) => number,
  rng: Rng,
): Reinforcement[] {
  const options = upgradeOptions(lineup, baseOutlook, opponents, targets)
    .map((o) => ({ ...o, perceived: o.gain * (1 + noise(`upgrade:${o.line}`) * precision.effectNoise) }));

  const ranked = options.filter((o) => o.gain >= MIN_UPGRADE_GAIN).sort((a, b) => b.perceived - a.perceived)
    .slice(0, precision.reinforcements);
  const top = ranked[0]?.perceived ?? 0;

  // Věta o zkušenosti zazní jen jednou, u dalších řad zůstane jen štítek.
  let experienceSaid = false;
  return ranked.map((o, i): Reinforcement => {
    const priority = i === 0 ? "high" : o.perceived >= 0.6 * top ? "medium" : "low";
    const forms = LINE_FORMS[o.line];
    const keeper = o.line === "GK";
    const member = memberByPlayer.get(o.weakest);
    // Zkušenost se nedá natrénovat ani koupit jako vlastnost, jen jako starší hráč: proto zvlášť.
    const wantsExperience = o.skills.slice(0, precision.reinforcementAttributes).includes("experience");
    const skills = o.skills.filter((s) => s !== "experience").slice(0, precision.reinforcementAttributes);
    const several = lineup.filter((p) => slotOf(p) === o.line).length > 1;

    const text: TextPart[] = [];
    if (priority === "high") text.push(txt(`Lepší ${forms.playerNom} by přidal nejvíc. `));
    else if (priority === "medium") text.push(txt(`Pomohl by i lepší ${forms.playerNom}. `));
    else text.push(txt(`Lepší ${forms.playerNom} by přidal méně. `));
    if (member && several) {
      text.push({ kind: "player", id: member.id, name: member.name }, txt(` je ${forms.where} nejslabší článek. `));
    }
    if (skills.length > 0) text.push(txt(`Hledej ${forms.playerAcc} ${skillsIns(skills, keeper)}.`));
    if (wantsExperience && !experienceSaid && o.skills.slice(0, 2).includes("experience")) {
      text.push(txt(" Ať má za sebou nějaké zápasy, zkušenost tu chybí."));
      experienceSaid = true;
    }
    if (member && !several) text.push(txt(" Musí být lepší, než je "), { kind: "player", id: member.id, name: member.name }, txt("."));

    if (precision.benchHint && member) {
      const weakestRating = playerRoleRating(o.weakest);
      const candidate = input.others
        .filter((m) => !m.injured && m.position === o.line)
        .map((m) => ({ m, rating: playerRoleRating(fresh({ ...m.player, matchPosition: o.line })) }))
        .sort((a, b) => b.rating - a.rating)[0];
      if (candidate && candidate.rating > weakestRating + BENCH_MARGIN) {
        const phrase = rng.pick(["Než začneš shánět posilu, podívej se do kádru: ", "Posila možná nebude potřeba: "]);
        text.push(
          txt(` ${phrase}`),
          { kind: "player", id: candidate.m.id, name: candidate.m.name },
          txt(" by tam hrál líp než "),
          { kind: "player", id: member.id, name: member.name },
          txt("."),
        );
      }
    }

    return {
      line: o.line,
      priority,
      text,
      attributes: [...skills, ...(wantsExperience ? ["experience" as const] : [])].map((s) => SKILL_FORMS[s].ui),
    };
  });
}

// ── Jaký styl nám sedí ─────────────────────────────────────────────────────

function fitVerdict(fit: number): FitVerdict {
  if (fit >= 1.07) return "great";
  if (fit >= 0.98) return "good";
  if (fit >= 0.88) return "manageable";
  return "poor";
}

/** Strop poměru jako ve `fitFromRequirements` (engine/tactics.ts): nad ním už navíc nic. */
const REQUIREMENT_RATIO_CAP = 1.3;

function requirementRatios(lineup: readonly MatchPlayer[], tactic: Tactic) {
  return TACTIC_CATALOG[tactic].requirements
    .map((req) => {
      const players = lineup.filter((p) => req.positions.includes(slotOf(p)));
      if (players.length === 0) return null;
      const avg = players.reduce((s, p) => s + ((p[req.skill] as number) ?? 50), 0) / players.length;
      return {
        skill: req.skill as AnalysisSkill,
        positions: req.positions,
        weight: req.weight,
        ratio: Math.min(REQUIREMENT_RATIO_CAP, avg / req.threshold),
      };
    })
    .filter((r): r is { skill: AnalysisSkill; positions: Slot[]; weight: number; ratio: number } => r !== null && r.skill in SKILL_FORMS);
}

const quoted = (tactic: Tactic) => `„${TACTIC_LABELS[tactic] ?? tactic}“`;

function styleReport(input: SquadAnalysisInput, lineup: MatchPlayer[], precision: Precision, noise: (key: string) => number): StyleReport {
  const female = input.assistant.female;
  const fits = (Object.keys(TACTIC_CATALOG) as Tactic[]).map((tactic) => {
    const real = calcTacticEffectiveness(lineup, tactic, input.formation);
    const perceived = tactic === "balanced" ? 1 : real + noise(`tactic:${tactic}`) * precision.fitNoise;
    return { tactic, perceived, verdict: tactic === "balanced" ? "good" as FitVerdict : fitVerdict(perceived) };
  });
  const special = fits.filter((f) => f.tactic !== "balanced").sort((a, b) => b.perceived - a.perceived);
  const best = special[0];
  const worst = special[special.length - 1];

  const reasonFor = (tactic: Tactic, verdict: FitVerdict): string | null => {
    if (tactic === "balanced") return "Nic zvláštního nevyžaduje.";
    const ratios = requirementRatios(lineup, tactic);
    if (ratios.length === 0) return null;
    // Důvod podle váhy požadavku: vedlejší požadavek (hlavičky brankáře u nakopávaných)
    // nesmí přebít hlavní, jen protože ho kádr plní s velkou rezervou.
    if (verdict === "great" || verdict === "good") {
      const top = ratios.reduce((a, b) => ((b.ratio - 1) * b.weight > (a.ratio - 1) * a.weight ? b : a));
      return `Opora: ${skillForms(top.skill).nom} ${groupGen(top.positions)}.`;
    }
    const low = ratios.reduce((a, b) => ((1 - b.ratio) * b.weight > (1 - a.ratio) * a.weight ? b : a));
    return `Chybí: ${skillForms(low.skill).nom} ${groupGen(low.positions)}.`;
  };
  const showReason = (tactic: Tactic) =>
    precision.tacticReasons === "all" || (precision.tacticReasons === "extremes" && (tactic === best?.tactic || tactic === worst?.tactic));

  // Taktiky, které kádr zvládne skoro stejně dobře jako tu nejlepší, se jmenují spolu.
  const topGroup = special.filter((f) => best && f.perceived >= best.perceived - 0.03 && f.perceived >= 0.98);
  const recommended = new Set<Tactic>(topGroup.length > 0 ? topGroup.map((f) => f.tactic) : ["balanced"]);

  const tactics: TacticFit[] = fits.map((f) => ({
    tactic: f.tactic,
    label: TACTIC_LABELS[f.tactic] ?? f.tactic,
    verdict: f.verdict,
    recommended: recommended.has(f.tactic),
    reason: showReason(f.tactic) ? reasonFor(f.tactic, f.verdict) : null,
  }));
  let summary: string;
  if (!best || best.perceived < 0.98) {
    summary = `Na žádnou zvláštní taktiku kádr nemá, nejjistější je ${quoted("balanced")}.`;
  } else if (topGroup.length >= 4) {
    summary = "Kádr zvládne naplno skoro každou taktiku, vybírej podle soupeře.";
  } else if (topGroup.length >= 2) {
    summary = `Kádru nejvíc sedí taktiky ${joinCs(topGroup.map((f) => quoted(f.tactic)))}.`;
  } else {
    summary = `Kádru nejvíc sedí taktika ${quoted(best.tactic)}.`;
  }
  if (worst && worst !== best && worst.verdict === "poor") {
    summary += ` Taktiku ${quoted(worst.tactic)} bych nezkoušel${female ? "a" : ""}.`;
  }

  const hardFit = calcHardnessFit(lineup, "hard") + noise("hardness") * precision.fitNoise;
  const hardVerdict = fitVerdict(hardFit);
  const hardText: Record<FitVerdict, string> = {
    great: "Na hru do těla máme partu, postava i povaha sedí. Pozor jen na přísné sudí.",
    good: "Do těla to jde, ale jen u benevolentního sudího.",
    manageable: `Do těla bych hrál${female ? "a" : ""} jen výjimečně, kádr na to moc nemá.`,
    poor: "Do těla nehrát. Kádr na to nemá postavu ani povahu, sbírali bychom jen karty.",
  };

  const familiarity = input.formationFamiliarity[input.formation] ?? 15;
  const famLevel = familiarity >= 60 ? "high" : familiarity >= 35 ? "medium" : "low";
  let famText = famLevel === "high"
    ? `Rozestavění ${input.formation} máme sehrané.`
    : famLevel === "medium"
      ? `Rozestavění ${input.formation} je sehrané napůl, každý zápas v něm pomůže.`
      : `V rozestavění ${input.formation} jsme nesehraní.`;
  const known = Object.entries(input.formationFamiliarity).sort((a, b) => b[1] - a[1])[0];
  if (known && known[0] !== input.formation && known[1] >= familiarity + 15) {
    famText += ` Nejvíc sehraní jsme v rozestavění ${known[0]}.`;
  }

  return {
    summary,
    tactics,
    hardness: { verdict: hardVerdict, text: hardText[hardVerdict] },
    formation: { formation: input.formation, familiarity: famLevel, text: famText },
  };
}

// ── Na co si dát pozor ─────────────────────────────────────────────────────

const TIRED_CONDITION = 70;
const EXHAUSTED_CONDITION = 50;

/** Varování jedné kategorie: věta pro jednoho hráče a pro víc hráčů (jména jsou podmět). */
interface WarningGroup {
  kind: WarningKind;
  one: string;
  many: string;
}

const WARNING_GROUPS = {
  injured: { kind: "injured", one: " je zraněný, a přesto je v uložené sestavě.", many: " jsou zranění, a přesto jsou v uložené sestavě." },
  obese: { kind: "overweight", one: " má velkou nadváhu, je pomalý a rychle se zadýchá.", many: " mají velkou nadváhu, jsou pomalí a rychle se zadýchají." },
  over: { kind: "overweight", one: " má nadváhu, bere mu to rychlost a výdrž.", many: " mají nadváhu, bere jim to rychlost a výdrž." },
  exhausted: { kind: "tired", one: " je vyždímaný, potřebuje odpočinek.", many: " jsou vyždímaní, potřebují odpočinek." },
  tired: { kind: "tired", one: " je unavený, v zápase nebude stíhat.", many: " jsou unavení, v zápase nebudou stíhat." },
  lowStamina: { kind: "lowStamina", one: " nemá výdrž, ve druhém poločase odpadá.", many: " nemají výdrž, ve druhém poločase odpadají." },
  inexperienced: { kind: "inexperienced", one: " je v sestavě nováček, v těsném zápase může zaváhat.", many: " jsou v sestavě nováčci, v těsném zápase můžou zaváhat." },
} satisfies Record<string, WarningGroup>;

function warningReports(input: SquadAnalysisInput, opponentLineups: MatchPlayer[][], precision: Precision): Warning[] {
  const leagueOutfield = opponentLineups.flat().filter((p) => slotOf(p) !== "GK");
  const leaguePlayers = opponentLineups.flat();
  const staminaFloor = percentile(leagueOutfield.map((p) => p.stamina), 0.2);
  // Nováček = zkušenost jako nejméně ostřílená sedmina hráčů ligy, aspoň 20.
  const experienceFloor = Math.max(20, percentile(leaguePlayers.map((p) => skillOf(p, "experience")), 0.15) ?? 0);

  const grouped = new Map<WarningGroup, SquadMember[]>();
  const out: Warning[] = [];
  const add = (group: WarningGroup, m: SquadMember) => {
    if (precision.warningKinds.has(group.kind)) grouped.set(group, [...(grouped.get(group) ?? []), m]);
  };

  for (const m of input.eleven) {
    const slot = (m.player.matchPosition ?? m.position) as Slot;
    if (m.injured && input.lineupSource === "lineup") add(WARNING_GROUPS.injured, m);
    // Mimo post se píše po jednom: každý hraje jinde.
    if (input.lineupSource === "lineup" && slot !== m.position && precision.warningKinds.has("outOfPosition")) {
      out.push({
        kind: "outOfPosition",
        text: [{ kind: "player", id: m.id, name: m.name }, txt(` je přirozeně ${LINE_FORMS[m.position].playerNom}, v sestavě hraje ${LINE_FORMS[slot].where}.`)],
      });
    }
    if (m.weightCategory === "obese") add(WARNING_GROUPS.obese, m);
    else if (m.weightCategory === "over") add(WARNING_GROUPS.over, m);
    if (m.condition < EXHAUSTED_CONDITION) add(WARNING_GROUPS.exhausted, m);
    else if (m.condition < TIRED_CONDITION) add(WARNING_GROUPS.tired, m);
    if (slot !== "GK" && staminaFloor !== null && m.player.stamina < staminaFloor) add(WARNING_GROUPS.lowStamina, m);
    if (skillOf(m.player, "experience") < experienceFloor) add(WARNING_GROUPS.inexperienced, m);
  }

  for (const [group, members] of grouped) {
    out.push({ kind: group.kind, text: [...playerParts(members), txt(members.length === 1 ? group.one : group.many)] });
  }
  const order = new Map(ALL_WARNINGS.map((k, i) => [k, i]));
  return out.sort((a, b) => (order.get(a.kind) ?? 9) - (order.get(b.kind) ?? 9)).slice(0, precision.maxWarnings);
}

// ── Měření bez asistenta ───────────────────────────────────────────────────

export interface RawSquadEffects {
  /** Vliv vlastností hry proti průměru soupeřů (góly za zápas, + = síla). */
  aspects: Array<{ aspect: AspectKey; effect: number }>;
  /** Zisk z posily (nejslabší hráč řady na úrovni lepších hráčů ligy), góly za zápas. */
  upgrades: Array<{ line: Slot; gain: number }>;
  /** Hodnota řad (průměr hodnocení rolí) vlastní a soupeřů. */
  lines: Array<{ line: Slot; own: number; opponents: number[] }>;
}

/** Skutečné hodnoty, ze kterých asistent vychází — pro testy a ladění prahů. */
export function measureSquad(input: SquadAnalysisInput): RawSquadEffects {
  const lineup = input.eleven.map((m) => fresh(m.player));
  const opponentLineups = input.opponents.map((t) => t.eleven.map(fresh));
  const opponentStats = opponentLineups.map(sideStats);
  const base = sideStats(lineup);
  const baseOutlook = leagueOutlook(base, opponentStats);
  const aspects = aspectEffects(lineup, base, baseOutlook, opponentStats, slotAverages(opponentLineups))
    .map((e) => ({ aspect: e.def.key, effect: e.effect }));
  const upgrades = upgradeOptions(lineup, baseOutlook, opponentStats, signingTargets(opponentLineups))
    .map((o) => ({ line: o.line, gain: o.gain }));
  const lines = LINES.flatMap((line) => {
    const own = lineValue(lineup, line);
    if (own === null) return [];
    return [{ line, own, opponents: opponentLineups.map((t) => lineValue(t, line)).filter((v): v is number => v !== null) }];
  });
  return { aspects, upgrades, lines };
}

// ── Týden ──────────────────────────────────────────────────────────────────

/** Klíč herního týdne: pondělí týdne, do kterého herní datum patří (YYYY-MM-DD). */
export function gameWeekKey(gameDate: string | null | undefined): string {
  const d = new Date(gameDate ?? Date.now());
  const valid = Number.isNaN(d.getTime()) ? new Date() : d;
  const day = valid.getUTCDay() || 7;
  const monday = new Date(Date.UTC(valid.getUTCFullYear(), valid.getUTCMonth(), valid.getUTCDate() - day + 1));
  return monday.toISOString().slice(0, 10);
}

// ── Tabulky řad a perspektiva kádru ────────────────────────────────────────

/**
 * Jak přesně asistent odhadne průměr ligy: výborný přesně, dobrý o pár bodů vedle,
 * slabší zaokrouhlí na pětky a víc se splete. Vlastní hráče vidí přesně vždy.
 */
function blurLeague(value: number, precision: Precision, n: number): number {
  switch (precision.level) {
    case "excellent": return Math.round(value);
    case "good": return Math.round(value + 2 * n);
    case "average": return Math.round((value + 4 * n) / 5) * 5;
    case "weak": return Math.round((value + 8 * n) / 5) * 5;
  }
}

function attributeVerdict(value: number, league: number): AttributeVerdict {
  if (value >= league + 5) return "strong";
  if (value <= league - 5) return "weak";
  return "even";
}

/** Klíčové vlastnosti postu: váha v hodnocení 2 a víc, seřazené podle váhy (jako zvýraznění v profilu). */
function keySkills(slot: Slot): AnalysisSkill[] {
  return Object.entries(RATING_WEIGHTS[slot])
    .filter(([, w]) => w >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k as AnalysisSkill);
}

function buildLineTables(
  input: SquadAnalysisInput,
  lineup: MatchPlayer[],
  avg: SlotAverages,
  top: SlotAverages,
  precision: Precision,
  noise: (key: string) => number,
): LineTable[] {
  const out: LineTable[] = [];
  for (const slot of ["GK", "DEF", "MID", "FWD"] as Slot[]) {
    const skills = keySkills(slot);
    const starters = input.eleven.filter((m) => slotOf(m.player) === slot);
    const bench = input.others.filter((m) => m.position === slot);
    if (starters.length === 0 && bench.length === 0) continue;
    const startersPlayers = lineup.filter((p) => slotOf(p) === slot);

    const attributes: LineAttribute[] = skills.map((skill) => {
      const values = startersPlayers.map((p) => readSkill(p, skill)).filter((v): v is number => typeof v === "number");
      const ours = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
      const league = blurLeague(avg[slot][skill] ?? ours, precision, noise(`lt:${slot}:${skill}`));
      const topValue = precision.bestTeam && top[slot][skill] !== undefined
        ? blurLeague(top[slot][skill] as number, precision, noise(`tt:${slot}:${skill}`))
        : null;
      return { skill, ours, league, top: topValue, verdict: attributeVerdict(ours, league) };
    });
    const leagueBySkill = new Map(attributes.map((a) => [a.skill, a.league]));

    const toRow = (m: SquadMember, starter: boolean): LinePlayer => ({
      id: m.id,
      name: m.name,
      age: m.player.age ?? null,
      starter,
      injured: m.injured,
      outOfPosition: starter && m.position !== slot,
      values: skills.map((skill) => {
        const value = Math.round(readSkill(m.player, skill) ?? 0);
        return { skill, value, verdict: attributeVerdict(value, leagueBySkill.get(skill) ?? value) };
      }),
    });
    const players = [
      ...starters.map((m) => toRow(m, true)),
      ...bench.map((m) => toRow(m, false)),
    ];

    out.push({ line: slot, attributes, players, lookFor: lookForText(slot, attributes, precision) });
  }
  return out;
}

/** „Útoku chybí hlavně střelba a přehled, posila by měla vynikat právě v nich.“ */
function lookForText(slot: Slot, attributes: LineAttribute[], precision: Precision): TextPart[] {
  const forms = LINE_FORMS[slot];
  const keeper = slot === "GK";
  const weights = RATING_WEIGHTS[slot] as Record<string, number>;
  const gaps = attributes
    .map((a) => ({ a, gap: (a.league - a.ours) * (weights[a.skill] ?? 1) }))
    .sort((x, y) => y.gap - x.gap);
  const weak = gaps.filter((g) => g.a.verdict === "weak").slice(0, Math.max(1, precision.reinforcementAttributes)).map((g) => g.a.skill);
  const whom = slot === "GK" ? "Brankáři" : slot === "DEF" ? "Obraně" : slot === "MID" ? "Záloze" : "Útoku";
  if (weak.length > 0) {
    return [{ kind: "text", text: `${whom} chybí hlavně ${skillsNom(weak, keeper)}. Posila by měla vynikat právě tady.` }];
  }
  const strong = attributes.filter((a) => a.verdict === "strong").map((a) => a.skill);
  const toTop = attributes
    .filter((a) => a.top !== null && a.ours < (a.top as number) - 3)
    .sort((x, y) => ((y.top as number) - y.ours) - ((x.top as number) - x.ours))
    .slice(0, 2)
    .map((a) => a.skill);
  const base = strong.length >= Math.ceil(attributes.length / 2)
    ? `${forms.label} má klíčové vlastnosti nad úrovní ligy.`
    : `${forms.label} má klíčové vlastnosti na úrovni ligy.`;
  const topPart = toTop.length > 0 ? ` Na špičku ztrácí hlavně ${skillsNom(toTop, keeper)}.` : "";
  return [{ kind: "text", text: base + topPart }];
}

function buildOutlook(
  input: SquadAnalysisInput,
  opponentLineups: MatchPlayer[][],
  precision: Precision,
  noise: (key: string) => number,
): SquadOutlook {
  const squad = [...input.eleven, ...input.others];
  const ageOf = (m: SquadMember) => m.player.age ?? null;
  const ages = squad.map(ageOf).filter((a): a is number => typeof a === "number");
  const leagueAges = opponentLineups.flat().map((p) => p.age).filter((a): a is number => typeof a === "number");
  const mean = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const round1 = (v: number) => Math.round(v * 10) / 10;

  const xiExp = mean(input.eleven.map((m) => skillOf(m.player, "experience")));
  const leagueExp = mean(opponentLineups.flat().map((p) => skillOf(p, "experience")));
  const perceivedLeagueExp = blurLeague(leagueExp, precision, noise("exp:league"));

  const growth = input.growth ?? {};
  const growing = squad
    .map((m) => ({ m, g: growth[m.id] ?? 0 }))
    .filter((x) => x.g >= 6)
    .sort((a, b) => b.g - a.g)
    .slice(0, precision.level === "weak" ? 2 : 4)
    .map(({ m, g }) => ({ id: m.id, name: m.name, age: ageOf(m), pace: (g >= 15 ? "fast" : "steady") as "fast" | "steady" }));
  const veterans = input.eleven
    .filter((m) => (ageOf(m) ?? 0) >= 31)
    .sort((a, b) => (ageOf(b) ?? 0) - (ageOf(a) ?? 0))
    .map((m) => ({ id: m.id, name: m.name, age: ageOf(m) }));
  const starterIds = new Set(input.eleven.map((m) => m.id));
  const youngsters = squad
    .filter((m) => (ageOf(m) ?? 99) <= 21)
    .sort((a, b) => (ageOf(a) ?? 0) - (ageOf(b) ?? 0))
    .map((m) => ({ id: m.id, name: m.name, age: ageOf(m), starter: starterIds.has(m.id) }));

  // Věk se srovnává sestava se sestavami soupeřů — o ty jde v zápase.
  const xiAverage = round1(mean(input.eleven.map(ageOf).filter((a): a is number => typeof a === "number")));
  const leagueAverage = round1(mean(leagueAges));
  const under21 = ages.filter((a) => a <= 21).length;
  const over30 = ages.filter((a) => a >= 30).length;
  const prime = ages.length - under21 - over30;

  const sentences: string[] = [];
  if (xiAverage <= leagueAverage - 1.5) sentences.push(`Základní sestava je mladší než u soupeřů (průměr ${years(xiAverage)} proti ${years(leagueAverage)}).`);
  else if (xiAverage >= leagueAverage + 1.5) sentences.push(`Základní sestava je starší než u soupeřů (průměr ${years(xiAverage)} proti ${years(leagueAverage)}).`);
  else sentences.push(`Věkem je sestava jako u soupeřů (průměr ${years(xiAverage)}).`);
  if (growing.some((g) => g.pace === "fast")) sentences.push("Pár kluků teď na tréninku roste rychle.");
  if (veterans.length >= 3) sentences.push(`V základní sestavě ${playersOver30(veterans.length)}, s dalším rokem začnou ztrácet.`);
  else if (under21 >= 4) sentences.push(`Do 21 let máme ${under21} hráčů, je na čem stavět.`);

  return {
    verdict: [{ kind: "text", text: sentences.join(" ") }],
    ages: { under21, prime, over30, average: xiAverage, leagueAverage },
    experience: { ours: Math.round(xiExp), league: perceivedLeagueExp, verdict: attributeVerdict(xiExp, perceivedLeagueExp) },
    growing,
    veterans,
    youngsters,
  };
}

/** „27,2 roku“: u desetinného čísla je roku, ne let. */
function years(v: number): string {
  return `${v.toFixed(1).replace(".", ",")} roku`;
}

/** „jsou 3 hráči přes 30“ / „je 5 hráčů přes 30“. */
function playersOver30(n: number): string {
  return n >= 2 && n <= 4 ? `jsou ${n} hráči přes 30` : `je ${n} hráčů přes 30`;
}
