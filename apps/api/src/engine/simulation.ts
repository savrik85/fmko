/**
 * FMK-33: Zápasový simulační model — matematický core.
 *
 * 90minutový cyklus simulace fotbalového zápasu pro okresní fotbal.
 */

import type { Rng } from "../generators/rng";
import type { MatchEvent, EventType, GoalSource } from "@okresni-masina/shared";
import type {
  MatchConfig,
  MatchResult,
  MatchPlayer,
  TeamSetup,
  Tactic,
  Weather,
} from "./types";
import { calcTacticEffectiveness, tacticDrainMod, formationChemistryFactor, TACTIC_MODS, effMod } from "./tactics";
import { squadChemistryFactor } from "./squad-chemistry";
import { hardnessMods, hardEff, intimidationPenalty, type Hardness } from "./hardness";
import {
  NEUTRAL_REFEREE, PETTY_CARD_MUL,
  severeFoulProb, pettyFoulProb, advantageProb, cardMultiplier,
  penaltyZone, freekickZone, crossZone, directRedProb, protestYellowProb,
  refFatigue, planRefereeError, incidentText, gradeReferee, cardMemoryMod,
  type RefereeIncident, type RefereeProfile,
} from "./referee";

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Prázdná sada karet — pro volání calcChanceProb mimo běžící zápas (náhled). */
const EMPTY_BOOKED: ReadonlySet<number> = new Set<number>();

/** Average of a stat across lineup */
function teamAvg(lineup: MatchPlayer[], stat: keyof MatchPlayer): number {
  const vals = lineup.map((p) => p[stat] as number);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Get player display name */
function playerName(p: MatchPlayer): string {
  return `${p.firstName} ${p.lastName}`;
}

export interface WeatherMod {
  techniqueMod: number;
  longBallBonus: number;
  injuryMod: number;
  conditionDrainMod: number;
  gkHandlingMod: number;
  slipChance: number;
  puddleChance: number;
  windGustChance: number;
}

/** Weather effects */
export const WEATHER_MODS: Record<Weather, WeatherMod> = {
  sunny:  { techniqueMod: 1.0,  longBallBonus: 0,     injuryMod: 1.0,  conditionDrainMod: 1.0,  gkHandlingMod: 1.0,  slipChance: 0,     puddleChance: 0,     windGustChance: 0 },
  cloudy: { techniqueMod: 1.0,  longBallBonus: 0,     injuryMod: 1.0,  conditionDrainMod: 1.0,  gkHandlingMod: 1.0,  slipChance: 0,     puddleChance: 0,     windGustChance: 0 },
  rain:   { techniqueMod: 0.8,  longBallBonus: 0.15,  injuryMod: 1.3,  conditionDrainMod: 1.12, gkHandlingMod: 0.82, slipChance: 0.005, puddleChance: 0.008, windGustChance: 0.003 },
  wind:   { techniqueMod: 0.9,  longBallBonus: -0.1,  injuryMod: 1.0,  conditionDrainMod: 1.04, gkHandlingMod: 0.92, slipChance: 0,     puddleChance: 0,     windGustChance: 0.008 },
  snow:   { techniqueMod: 0.7,  longBallBonus: 0.1,   injuryMod: 1.4,  conditionDrainMod: 1.20, gkHandlingMod: 0.76, slipChance: 0.008, puddleChance: 0,     windGustChance: 0.004 },
};

/**
 * Calculate possession probability for home team (0–1).
 */
function calcPossession(home: TeamSetup, away: TeamSetup, homeAdvantage: number): number {
  const homeMid = teamAvg(home.lineup.filter((p) => p.position === "MID"), "technique")
    + teamAvg(home.lineup.filter((p) => p.position === "MID"), "passing");
  const awayMid = teamAvg(away.lineup.filter((p) => p.position === "MID"), "technique")
    + teamAvg(away.lineup.filter((p) => p.position === "MID"), "passing");

  const total = homeMid + awayMid;
  if (total === 0) return 0.5;
  return Math.min(0.7, Math.max(0.3, (homeMid / total) + homeAdvantage));
}

/**
 * Calculate chance probability per minute for attacking team.
 */
function calcChanceProb(
  attacking: TeamSetup,
  defending: TeamSetup,
  weather: Weather,
  formFactor: number = 1.0,
  /** Delegovaný rozhodčí — přísnost škáluje výplatu tvrdé hry. */
  referee?: RefereeProfile,
  /** Kdo už má žlutou. Pokartovaný tým z tvrdosti postupně nic nemá. */
  booked?: { attacking: ReadonlySet<number>; defending: ReadonlySet<number> },
): number {
  // Defensive — pokud se neznámá tactic prolomi (data corruption), použij balanced
  const tacticMod = TACTIC_MODS[attacking.tactic] ?? TACTIC_MODS.balanced;
  const baseWeatherMod = WEATHER_MODS[weather];
  // Zimní výbava lavičky tlumí postih počasí (1 - penalizace se zmenší o resist)
  const weatherResist = attacking.weatherResist ?? 0;
  const weatherMod = {
    ...baseWeatherMod,
    techniqueMod: 1 - (1 - baseWeatherMod.techniqueMod) * (1 - weatherResist),
  };

  // Effectiveness: skill-fit × formation synergy × familiarity (taktika + formace).
  // Pokud je taktika neumělá / formace nesedí / tým ji nehrál → effectiveness < 1 → modifikátory se ztlumí k 1.0.
  const attEff = calcTacticEffectiveness(attacking.lineup, attacking.tactic, attacking.formation, attacking.formationFamiliarity);
  const defEff = calcTacticEffectiveness(defending.lineup, defending.tactic, defending.formation, defending.formationFamiliarity);

  const outfield = attacking.lineup.filter((p) => p.position !== "GK");
  const mids = attacking.lineup.filter((p) => p.position === "MID");
  const midAndFwd = attacking.lineup.filter((p) => p.position === "MID" || p.position === "FWD");
  const defOutfield = defending.lineup.filter((p) => p.position !== "GK");
  const defs = defending.lineup.filter((p) => p.position === "DEF");

  // Morálka týmu: 0.94–1.06 (neutrální při 50) — sebevědomý tým hraje odvážněji,
  // zlomený tým se bojí. Díky tomu má reálný efekt i kapitán, vůdcovství a motivace
  // trenéra (vše se propisuje do morálky před/během zápasu).
  const attMoraleMod = 0.94 + (teamAvg(attacking.lineup, "morale") / 100) * 0.12;
  const defMoraleMod = 0.94 + (teamAvg(defending.lineup, "morale") / 100) * 0.12;

  // Sehranost formace a chemie kabiny — obojí přímo na útočnou sílu, nezávisle na taktice.
  const famMod = formationChemistryFactor(attacking.formationFamiliarity);
  const chemMod = squadChemistryFactor(attacking.lineup);

  // Tvrdost hry. Benefit se škáluje kádrem, sudím a počtem karet na kontě;
  // riziko (fauly, karty, zranění) se neškáluje nikde — v tom je celý balanc.
  const defHard = defending.hardness ?? "normal";
  const defHardMods = hardnessMods(defHard);
  const defHardEff = hardEff(defending.lineup, defHard, referee, booked?.defending ?? EMPTY_BOOKED);
  const hardDefenseMod = effMod(defHardMods.defenseMod, defHardEff);
  // Zastrašení: tvrdá hra srazí útok soupeře podle toho, jak měkký má kádr.
  const intimidation = intimidationPenalty(defHard, defHardEff, attacking.lineup);

  const attackPower = (
    teamAvg(outfield, "technique") * weatherMod.techniqueMod * 0.8 +
    teamAvg(outfield, "passing") * 1.0 +
    teamAvg(outfield, "speed") * 0.7 +
    (mids.length > 0 ? teamAvg(mids, "vision") * 0.6 : 0) +
    (midAndFwd.length > 0 ? teamAvg(midAndFwd, "creativity") * 0.5 : 0) +
    teamAvg(outfield, "workRate") * 0.3
  ) / 5 * effMod(tacticMod.attackMod, attEff) * formFactor * attMoraleMod * famMod * chemMod
    * manpowerFactor(attacking.lineup).attack * (1 - intimidation);

  const defensePower = (
    teamAvg(defOutfield, "defense") * 1.0 +
    teamAvg(defOutfield, "strength") * 0.7 +
    (defs.length > 0 ? teamAvg(defs, "aggression") * 0.2 : 0) +
    teamAvg(defOutfield, "workRate") * 0.2
  ) / 3 * effMod((TACTIC_MODS[defending.tactic] ?? TACTIC_MODS.balanced).defenseMod, defEff) * defMoraleMod
    * manpowerFactor(defending.lineup).defense * hardDefenseMod;

  // Use DIFFERENCE not ratio — so stronger teams create more chances
  // attackPower ~20 (weak) to ~35 (strong), defensePower ~18 to ~25
  const advantage = (attackPower - defensePower) / 100; // skill difference matters but not overwhelming
  const baseChance = 0.10; // neutral chance per minute — target ~3.5 goals/match
  const longBallBonus = attacking.tactic === "long_ball" ? weatherMod.longBallBonus : 0;

  // Underdog boost: weaker team gets small floor boost
  const underdogBoost = advantage < -0.05 ? 0.02 : 0;
  // Okresní přebor: skill advantage matters but not overwhelmingly
  return Math.min(0.25, Math.max(0.07, baseChance + advantage + longBallBonus + underdogBoost)) * effMod(tacticMod.chanceMod, attEff);
}

/**
 * Otevřená hra dává o něco méně gólů než dřív — rozdíl přebraly standardky
 * (penalty, přímáky, rohy), aby celková gólovost zápasu zůstala stejná.
 */
const OPEN_PLAY_GOAL_SCALE = 0.855;

/**
 * Calculate goal probability from an open-play chance.
 * Standardky mají vlastní matematiku (calcPenaltyProb / calcFreekickProb / calcAerialProb).
 */
function calcGoalProb(
  rng: Rng,
  attacker: MatchPlayer,
  gk: MatchPlayer,
  defenseAvg: number,
  minute: number,
  scoreDiff: number,
): number {
  // 30% šancí = hlavičky (centr ze hry)
  const isHeader = rng.random() < 0.3;
  const attackVal = isHeader
    ? (attacker.heading * 2 + attacker.strength) / 3
    : (attacker.shooting * 2 + attacker.technique) / 3;

  const defenseVal = (gk.goalkeeping * 2 + defenseAvg) / 3;

  let ratio = attackVal / (attackVal + defenseVal);

  // Consistency modifier: 0.85-1.15
  ratio *= 0.85 + (attacker.consistency / 100) * 0.30;

  // Morálka střelce: 0.95-1.05 (neutrální při 50) — hráč v pohodě zakončuje líp
  ratio *= 0.95 + (attacker.morale / 100) * 0.10;

  // Clutch: po 75' při těsném skóre (≤1 gól)
  if (minute >= 75 && Math.abs(scoreDiff) <= 1) {
    ratio *= 0.9 + (attacker.clutch / 100) * 0.2;
  }

  // Mentorská dvojice na hřišti dodá klid oběma — bonus škáluje síla vztahu.
  const mentorRel = attacker.relationshipsInLineup?.find((r) => r.type === "mentor_pupil");
  if (mentorRel) ratio *= 1 + 0.03 * ((mentorRel.strength ?? 50) / 50);

  // Okresní level: víc gólů (slabší brankáři, horší obrana)
  return Math.min(0.70, Math.max(0.15, ratio * 0.90)) * OPEN_PLAY_GOAL_SCALE;
}

/**
 * Pick attacker weighted by position + skill quality.
 */
function pickAttacker(rng: Rng, lineup: MatchPlayer[]): MatchPlayer {
  const candidates = lineup.filter((p) => p.position !== "GK");
  if (candidates.length === 0) return rng.pick(lineup);

  const weights = candidates.map((p) => {
    const posW = p.position === "FWD" ? 4.0 : p.position === "MID" ? 1.0 : 0.3;
    const skillFactor = 0.5 + ((p.shooting * 0.5 + p.speed * 0.3 + p.heading * 0.2)) / 100;
    const workFactor = 0.9 + (p.workRate / 100) * 0.2;
    return posW * skillFactor * workFactor;
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let roll = rng.random() * totalWeight;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/**
 * Pick assist provider weighted by passing/vision/creativity.
 */
function pickAssister(rng: Rng, lineup: MatchPlayer[], scorer: MatchPlayer): MatchPlayer | null {
  const candidates = lineup.filter((p) => p !== scorer && p.position !== "GK");
  if (candidates.length === 0) return null;

  const weights = candidates.map((p) => {
    const posW = p.position === "MID" ? 2.0 : p.position === "FWD" ? 1.5 : 0.8;
    const rawSkill = (p.passing * 0.4 + p.vision * 0.35 + p.creativity * 0.25);
    const skillFactor = (rawSkill / 50) ** 1.5; // exponential — star playmakers dominate
    // Bratři/otec-syn/mentor si nahrávají častěji (+15 %), spolužáci jsou sehraní
    // ze školy (+10 %). Bonus škáluje síla vztahu — blízká dvojice se hledá víc.
    const rel = scorer.relationshipsInLineup?.find((r) => r.withId === p.id
      && (r.type === "brothers" || r.type === "father_son" || r.type === "mentor_pupil" || r.type === "classmates"));
    const relBase = rel ? (rel.type === "classmates" ? 0.10 : 0.15) : 0;
    const relBonus = rel ? 1 + relBase * ((rel.strength ?? 50) / 50) : 1.0;
    return posW * skillFactor * relBonus;
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let roll = rng.random() * totalWeight;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/**
 * Pick goalkeeper.
 */
/**
 * Kdo chytá. Nejdřív hráč postavený do brány, pak přirozený gólman, a teprve
 * když ani jeden není (vyloučený brankář bez náhrady), ten s nejlepším
 * gólmanským uměním — dřív se v takovém případě vracel prostě `lineup[0]`,
 * tedy náhodný hráč v poli, a postih byl brutální a nekontrolovaný.
 */
function getGK(lineup: MatchPlayer[]): MatchPlayer {
  const inGoal = lineup.find((p) => (p.matchPosition ?? p.position) === "GK");
  if (inGoal) return inGoal;
  const natural = lineup.find((p) => p.position === "GK");
  if (natural) return natural;
  return lineup.reduce((best, p) => (p.goalkeeping > best.goalkeeping ? p : best), lineup[0]);
}

/**
 * Hra v oslabení.
 *
 * Bez tohohle faktoru je červená karta kosmetika: `attackPower` i `defensePower`
 * počítají `teamAvg`, takže odebrání vyloučeného z jedenáctky sílu týmu nezmění.
 * Útok padá víc než obrana — deset lidí ubrání skoro totéž, ale dopředu už nemá
 * kdo běhat. Deset hráčů od poločasu vyjde zhruba na −0,7 gólu rozdílu za zápas,
 * což odpovídá reálné ceně vyloučení.
 *
 * Při jedenácti hráčích je faktor přesně 1,0, takže zápasy bez vyloučení
 * zůstávají identické s dřívějškem.
 */
function manpowerFactor(lineup: MatchPlayer[]): { attack: number; defense: number } {
  // Pod sedm hráčů se zápas v reálu kontumuje; engine tam nedojde, clamp jen drží vzorec konečný.
  const missing = Math.max(0, Math.min(4, 11 - lineup.length));
  return { attack: 1 - 0.075 * missing, defense: 1 - 0.055 * missing };
}

/**
 * Exekutor standardky. Preferuje roli nastavenou manažerem, ale jen když je
 * hráč pořád na hřišti — po vystřídání nebo červené kope nejlepší zbylý.
 * Proto se volá při KAŽDÉ standardce znovu, ne jednou na začátku zápasu.
 */
function pickTaker(lineup: MatchPlayer[], preferredId?: number): MatchPlayer | null {
  const outfield = lineup.filter((p) => p.position !== "GK");
  if (outfield.length === 0) return null;
  if (preferredId != null) {
    const preferred = outfield.find((p) => p.id === preferredId);
    if (preferred) return preferred;
  }
  return outfield.reduce((best, p) => (p.setPieces > best.setPieces ? p : best), outfield[0]);
}

/**
 * Kdo naskočí na centr. Do vápna chodí útočníci a stopeři, záložníci míň,
 * brankář nikdy. Váha roste s hlavičkami a důrazem — malý technik se nahoru
 * neprosadí ani ve slabé lize.
 */
function pickHeader(rng: Rng, lineup: MatchPlayer[], exclude: MatchPlayer): MatchPlayer | null {
  const candidates = lineup.filter((p) => p !== exclude && p.position !== "GK");
  if (candidates.length === 0) return null;

  const weights = candidates.map((p) => {
    const pos = p.matchPosition ?? p.position;
    const posW = pos === "FWD" ? 2.2 : pos === "DEF" ? 1.6 : 0.8;
    return posW * (((p.heading * 0.65 + p.strength * 0.35) / 50) ** 1.6);
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let roll = rng.random() * totalWeight;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/**
 * Proměnění penalty — čistý souboj střelce s brankářem, obrana do toho nemluví.
 * Při průměrných hodnotách vychází ~0,74, což sedí na reálnou úspěšnost.
 * V závěru těsného zápasu rozhoduje clutch: nervák ji zahodí, chladnokrevný dá.
 */
function calcPenaltyProb(
  kicker: MatchPlayer,
  gk: MatchPlayer,
  minute: number,
  scoreDiff: number,
): number {
  const skill = kicker.setPieces * 0.5 + kicker.technique * 0.3 + kicker.shooting * 0.2;
  let prob = 0.60 + (skill / 100) * 0.28;
  prob -= ((gk.goalkeeping - 50) / 100) * 0.12;
  prob *= 0.92 + (kicker.consistency / 100) * 0.16;
  prob *= 0.96 + (kicker.morale / 100) * 0.08;
  if (minute >= 75 && Math.abs(scoreDiff) <= 1) {
    prob *= 0.85 + (kicker.clutch / 100) * 0.30;
  }
  return Math.max(0.35, Math.min(0.93, prob));
}

/**
 * Přímý kop napřímo na branku. Schválně vzácný — v okresu padne přímák
 * málokdy a od toho se odvíjí i cena dobrého exekutora.
 */
function calcFreekickProb(
  kicker: MatchPlayer,
  gk: MatchPlayer,
  defenseAvg: number,
  weather: Weather,
): number {
  const skill = kicker.setPieces * 0.6 + kicker.technique * 0.4;
  let prob = 0.02 + (skill / 100) * 0.14;
  prob -= ((gk.goalkeeping - 50) / 100) * 0.05;
  prob -= ((defenseAvg - 50) / 100) * 0.02;  // zeď
  // Mokrý a rozfoukaný míč se hůř zvedá přes zeď
  prob *= WEATHER_MODS[weather].techniqueMod;
  return Math.max(0.01, Math.min(0.22, prob));
}

/**
 * Hlavička po centru ze standardky. Kvalita centru (setPieces kopajícího)
 * se potkává s důrazem hlavičkáře proti obraně a brankáři. Při samých
 * padesátkách vyjde přesně base — od toho se ladí gólovost standardek.
 */
function calcAerialProb(
  kicker: MatchPlayer,
  header: MatchPlayer,
  gk: MatchPlayer,
  defending: TeamSetup,
  isCorner: boolean,
  weather: Weather,
): number {
  const delivery = (kicker.setPieces * 0.7 + kicker.passing * 0.3) / 100;
  const attack = (header.heading * 0.65 + header.strength * 0.35) / 100;
  const defenders = defending.lineup.filter((p) => p.position === "DEF");
  const cover = defenders.length > 0
    ? (teamAvg(defenders, "heading") * 0.5 + teamAvg(defenders, "strength") * 0.3 + gk.goalkeeping * 0.2) / 100
    : gk.goalkeeping / 100;

  // Těžký míč nahrává hlavičkářům — brankáři se centry drží hůř. Vítr naopak
  // centr rozhodí dřív, než doletí.
  const weatherMod = weather === "rain" ? 1.08 : weather === "snow" ? 1.12 : weather === "wind" ? 0.92 : 1.0;

  const base = isCorner ? 0.065 : 0.12;
  const ratio = (delivery * 0.45 + attack * 0.55) / Math.max(0.2, cover);
  return Math.max(0.01, Math.min(isCorner ? 0.16 : 0.26, base * ratio * weatherMod));
}

/**
 * Update condition for all players after a minute.
 */
function updateCondition(lineup: MatchPlayer[], minute: number, drainMod: number = 1, lateFatigueMod: number = 0): void {
  for (const p of lineup) {
    // Base decay: depends on stamina (0-100 škála)
    const staminaFactor = (100 - p.stamina) / 100; // Low stamina = faster decay
    const alcoholPenalty = p.alcohol > 75 ? 0.15 : p.alcohol > 50 ? 0.08 : 0;
    // Závěr zápasu bere všem stejně; iontové nápoje a gely na lavičce to tlumí.
    const lateFatigue = minute > 70 ? 0.15 * (1 - lateFatigueMod) : 0;

    const decay = (0.3 + staminaFactor * 0.5 + alcoholPenalty + lateFatigue) * drainMod;
    p.condition = round2(Math.max(0, p.condition - decay));
  }
}

/** Out-of-position penalties */
type Pos = "GK" | "DEF" | "MID" | "FWD";
interface PosPenalty { speed: number; technique: number; shooting: number; passing: number; heading: number; defense: number; goalkeeping: number; vision: number; creativity: number }
const ZERO_PEN: PosPenalty = { speed: 0, technique: 0, shooting: 0, passing: 0, heading: 0, defense: 0, goalkeeping: 0, vision: 0, creativity: 0 };

function getPositionPenalty(natural: Pos, playing: Pos): PosPenalty {
  if (natural === playing) return ZERO_PEN;
  if (natural === "GK" || playing === "GK") return { speed: 0.4, technique: 0.4, shooting: 0.4, passing: 0.4, heading: 0.4, defense: 0.4, goalkeeping: 0.4, vision: 0.4, creativity: 0.4 };
  const key = `${natural}→${playing}`;
  switch (key) {
    case "DEF→MID": return { ...ZERO_PEN, passing: 0.15, vision: 0.15, technique: 0.10 };
    case "DEF→FWD": return { ...ZERO_PEN, shooting: 0.25, creativity: 0.25, technique: 0.15 };
    case "MID→DEF": return { ...ZERO_PEN, defense: 0.10 };
    case "MID→FWD": return { ...ZERO_PEN, shooting: 0.10 };
    case "FWD→MID": return { ...ZERO_PEN, passing: 0.15, vision: 0.15 };
    case "FWD→DEF": return { ...ZERO_PEN, defense: 0.30, heading: 0.15 };
    default: return { ...ZERO_PEN, technique: 0.10 };
  }
}

/**
 * Vybrat ze střídaček nejvhodnějšího hráče dle pozice zraněného/vyčerpaného.
 * Preferuje stejnou pozici, pak sousední (DEF↔MID↔FWD). Brankář se NIKDY
 * nepostaví do pole, pokud zraněný není sám brankář — to by byla katastrofa.
 * Vrací index v subs poli, nebo −1 pokud žádný vhodný kandidát.
 */
type Position = MatchPlayer["position"];

function pickSubIndexForPosition(subs: MatchPlayer[], outPos: Position): number {
  // Preferenční pořadí pozic od ideálního po nouzové. GK je vždy poslední,
  // takže DEF/MID/FWD se nikdy nenahradí brankářem (kromě situace, kdy
  // na lavičce už nikdo jiný není a tým by jinak hrál o člověka méně).
  const preferences: Position[] = outPos === "GK"
    ? ["GK", "DEF", "MID", "FWD"] // při zranění GK vyber GK; nouzově pole
    : outPos === "DEF" ? ["DEF", "MID", "FWD", "GK"]
    : outPos === "MID" ? ["MID", "DEF", "FWD", "GK"]
    : /* FWD */         ["FWD", "MID", "DEF", "GK"];

  for (const pref of preferences) {
    // Preferuj match position (jak hraje v sestavě), fallback na natural position
    const idx = subs.findIndex((s) => (s.matchPosition ?? s.position) === pref);
    if (idx >= 0) return idx;
  }
  // Lavička je úplně prázdná
  return -1;
}

/**
 * Simulate a full 90-minute match.
 */
export function simulateMatch(rng: Rng, config: MatchConfig): MatchResult {
  const { home, away, weather, isHomeAdvantage } = config;
  const homeAdvantage = config.homeAdvantage ?? (isHomeAdvantage ? 0.05 : 0);
  const events: MatchEvent[] = [];
  let homeScore = 0;
  let awayScore = 0;

  // ── Rozhodčí ──
  // Multiplikátory se předpočítají MIMO minutovou smyčku — volaly by se 90× a match tick
  // zpracovává všechny ligy v jedné invokaci, takže CPU workeru je reálné omezení.
  const ref = config.referee ?? NEUTRAL_REFEREE;
  const refSevere = severeFoulProb(ref);
  const refPetty = pettyFoulProb(ref);
  const refAdv = advantageProb(ref);
  const refCardMul = cardMultiplier(ref);
  // Tlak kotle: prázdné hlediště sudím netřese, vyprodáno ano. Bez návštěvy neutrální 1,0.
  const crowdFactor = config.attendance != null
    ? Math.min(1.4, Math.max(0.6, 0.7 + config.attendance / 500))
    : 1.0;
  const refereeIncidents: RefereeIncident[] = [];
  // Naplánovaná sporná situace — nejvýš jedna na zápas, strukturálně.
  let plannedError = planRefereeError(rng, ref);
  // Když sudí neuznal gól, škrtne se PRVNÍ gól poškozeného týmu, který po tom padne.
  let disallowGoalFor: number | null = null;
  let refFouls = 0;
  let refCards = 0;
  let refLateEvents = 0;

  // Apply equipment bonuses to players
  const homeEq = config.homeEquipment;
  const awayEq = config.awayEquipment;
  if (homeEq) {
    for (const p of home.lineup) {
      p.technique = Math.min(100, p.technique + homeEq.techniqueMod);
      if (p.position === "GK") p.goalkeeping = Math.min(100, p.goalkeeping + homeEq.gkBonus);
      p.morale = Math.min(100, p.morale + homeEq.moraleMod);
      p.setPieces = Math.min(100, p.setPieces + (homeEq.setPiecesMod ?? 0));
    }
    for (const p of home.subs) {
      p.technique = Math.min(100, p.technique + homeEq.techniqueMod);
      if (p.position === "GK") p.goalkeeping = Math.min(100, p.goalkeeping + homeEq.gkBonus);
      p.setPieces = Math.min(100, p.setPieces + (homeEq.setPiecesMod ?? 0));
    }
    home.weatherResist = homeEq.weatherResistMod ?? 0;
  }
  if (awayEq) {
    for (const p of away.lineup) {
      p.technique = Math.min(100, p.technique + awayEq.techniqueMod);
      if (p.position === "GK") p.goalkeeping = Math.min(100, p.goalkeeping + awayEq.gkBonus);
      p.morale = Math.min(100, p.morale + awayEq.moraleMod);
      p.setPieces = Math.min(100, p.setPieces + (awayEq.setPiecesMod ?? 0));
    }
    for (const p of away.subs) {
      p.technique = Math.min(100, p.technique + awayEq.techniqueMod);
      if (p.position === "GK") p.goalkeeping = Math.min(100, p.goalkeeping + awayEq.gkBonus);
      p.setPieces = Math.min(100, p.setPieces + (awayEq.setPiecesMod ?? 0));
    }
    away.weatherResist = awayEq.weatherResistMod ?? 0;
  }

  // Equipment condition drain modifiers
  const homeCondDrainMod = 1 - (homeEq?.conditionDrainMod ?? 0);
  const awayCondDrainMod = 1 - (awayEq?.conditionDrainMod ?? 0);
  const homeLateFatigueMod = homeEq?.lateFatigueMod ?? 0;
  const awayLateFatigueMod = awayEq?.lateFatigueMod ?? 0;

  // Equipment injury modifiers
  const homeInjuryMod = 1 - (homeEq?.injurySeverityMod ?? 0);
  const awayInjuryMod = 1 - (awayEq?.injurySeverityMod ?? 0);

  // Apply out-of-position penalties
  for (const p of [...home.lineup, ...home.subs, ...away.lineup, ...away.subs]) {
    const mp = p.matchPosition ?? p.position;
    if (mp !== p.position) {
      const pen = getPositionPenalty(p.position, mp);
      p.speed = Math.max(5, Math.round(p.speed * (1 - pen.speed)));
      p.technique = Math.max(5, Math.round(p.technique * (1 - pen.technique)));
      p.shooting = Math.max(5, Math.round(p.shooting * (1 - pen.shooting)));
      p.passing = Math.max(5, Math.round(p.passing * (1 - pen.passing)));
      p.heading = Math.max(5, Math.round(p.heading * (1 - pen.heading)));
      p.defense = Math.max(5, Math.round(p.defense * (1 - pen.defense)));
      p.goalkeeping = Math.max(5, Math.round(p.goalkeeping * (1 - pen.goalkeeping)));
      p.vision = Math.max(5, Math.round(p.vision * (1 - pen.vision)));
      p.creativity = Math.max(5, Math.round(p.creativity * (1 - pen.creativity)));
    }
  }

  // Track cards per player to avoid double yellow → red
  const yellowCards = new Set<number>();
  const redCards = new Set<number>();

  // Track minutes per player + substitutions used
  const playerMinutes: Record<number, { entered: number; left: number | null }> = {};
  for (const p of home.lineup) playerMinutes[p.id] = { entered: 0, left: null };
  for (const p of away.lineup) playerMinutes[p.id] = { entered: 0, left: null };
  let homeSubsUsed = 0;
  let awaySubsUsed = 0;
  const MAX_SUBS = 3;

  // Match-day form: random factor 0.75-1.25 applied to attack power
  const homeForm = 0.75 + rng.random() * 0.50;
  const awayForm = 0.75 + rng.random() * 0.50;

  // Accumulate per-minute possession to compute final 0-100 figure
  let homePossSum = 0;

  function addEvent(
    minute: number,
    type: EventType,
    player: MatchPlayer,
    teamId: number,
    description: string,
    detail?: string,
    source?: GoalSource,
  ) {
    events.push({
      minute,
      type,
      playerId: player.id,
      playerName: playerName(player),
      teamId,
      description,
      detail,
      source,
    });
  }

  /** Tým na hřišti podle engine ID — pro převod naplánované chyby na konkrétní sestavu. */
  function teamById(id: number): TeamSetup {
    return home.teamId === id ? home : away;
  }

  function teamName(id: number): string {
    return teamById(id).teamName;
  }

  /**
   * Sudí gól neuznal. Vrací true, když se gól nemá započítat.
   *
   * Volá se ze `scoreGoal` i z inline gólu v otevřené hře — ten má navíc kapitánský
   * a vztahový morálkový blok, takže se obě cesty sjednotit nedají bez rizika.
   */
  function goalDisallowed(minute: number, scorer: MatchPlayer, attacking: TeamSetup): boolean {
    if (disallowGoalFor !== attacking.teamId) return false;
    disallowGoalFor = null;
    const opponent = attacking === home ? away : home;
    const text = incidentText("neuznany_gol", playerName(scorer), attacking.teamName);
    addEvent(minute, "special", scorer, attacking.teamId, text, "ref_error:neuznany_gol");
    refereeIncidents.push({
      minute, kind: "neuznany_gol", severity: "high",
      againstTeamId: attacking.teamId, favourTeamId: opponent.teamId,
      playerName: playerName(scorer), text,
    });
    for (const p of attacking.lineup) p.morale = Math.max(0, p.morale - 4);
    for (const p of opponent.lineup) p.morale = Math.min(100, p.morale + 2);
    return true;
  }

  /**
   * Zapíše gól: skóre, událost a rozhoupání morálky na obou stranách.
   * Vůdcovské typy zvednou svůj tým víc a soupeřův srazí míň.
   */
  function scoreGoal(
    minute: number,
    scorer: MatchPlayer,
    attacking: TeamSetup,
    defending: TeamSetup,
    description: string,
    source: GoalSource,
  ) {
    if (goalDisallowed(minute, scorer, attacking)) return;
    if (attacking === home) homeScore++; else awayScore++;
    addEvent(minute, "goal", scorer, attacking.teamId, description,
      `${homeScore}:${awayScore}`, source);
    const attLead = teamAvg(attacking.lineup, "leadership") / 100;
    const defLead = teamAvg(defending.lineup, "leadership") / 100;
    for (const p of attacking.lineup) p.morale = Math.min(100, p.morale + Math.round(2 + attLead * 2));
    for (const p of defending.lineup) p.morale = Math.max(0, p.morale - Math.round(1 + (1 - defLead) * 2));
  }

  /**
   * Vyloučení: odebere hráče ze hřiště a uzavře mu odehrané minuty.
   *
   * Když jde o brankáře, tým musí něco udělat s prázdnou brankou: buď obětuje
   * střídání a pošle náhradního gólmana, nebo mezi tyče postaví toho, kdo z pole
   * chytá nejlíp. Postih pak vznikne sám nízkým `goalkeeping` v `calcGoalProb`.
   */
  function sendOff(player: MatchPlayer, team: TeamSetup, minute: number) {
    redCards.add(player.id);
    const idx = team.lineup.indexOf(player);
    if (idx >= 0) {
      team.lineup.splice(idx, 1);
      if (playerMinutes[player.id]) playerMinutes[player.id].left = minute;
    }

    const wasKeeper = (player.matchPosition ?? player.position) === "GK";
    if (!wasKeeper || team.lineup.length === 0) return;

    const subsUsed = team === home ? homeSubsUsed : awaySubsUsed;
    const benchKeeperIdx = team.subs.findIndex((p) => p.position === "GK");

    if (benchKeeperIdx >= 0 && subsUsed < MAX_SUBS) {
      // Náhradní gólman dovnitř za nejvyčerpanějšího hráče v poli — tým dohraje
      // v deseti, ale aspoň s někým, kdo chytat umí.
      const keeper = team.subs.splice(benchKeeperIdx, 1)[0];
      const sacrificed = team.lineup.reduce((worst, p) => (p.condition < worst.condition ? p : worst), team.lineup[0]);
      const sIdx = team.lineup.indexOf(sacrificed);
      keeper.matchPosition = "GK";
      team.lineup[sIdx] = keeper;
      playerMinutes[sacrificed.id] = { ...playerMinutes[sacrificed.id], left: minute };
      playerMinutes[keeper.id] = { entered: minute, left: null };
      if (team === home) homeSubsUsed++; else awaySubsUsed++;
      addEvent(minute, "substitution", keeper, team.teamId,
        `Střídání: ${playerName(keeper)} jde do brány za vyloučeného gólmana, ven jde ${playerName(sacrificed)}`);
      return;
    }

    const standIn = team.lineup.reduce((best, p) => (p.goalkeeping > best.goalkeeping ? p : best), team.lineup[0]);
    standIn.matchPosition = "GK";
    addEvent(minute, "special", standIn, team.teamId,
      `Rukavice bere ${playerName(standIn)} — náhradní gólman není k dispozici`, "emergency_gk");
  }

  /**
   * Žlutá karta se správnou eskalací na druhou žlutou.
   *
   * Dřív eskalaci uměla jen cesta přes faul; protesty přidávaly žlutou přes holé
   * `yellowCards.add()` bez kontroly, takže hráč mohl nasbírat dvě žluté a dohrát.
   */
  function giveYellow(player: MatchPlayer, team: TeamSetup, minute: number, description: string) {
    refCards++;
    if (minute > 70) refLateEvents++;
    if (yellowCards.has(player.id)) {
      yellowCards.delete(player.id);
      addEvent(minute, "card", player, team.teamId,
        `Druhá žlutá a červená pro ${playerName(player)}!`, "red");
      sendOff(player, team, minute);
    } else {
      yellowCards.add(player.id);
      addEvent(minute, "card", player, team.teamId, description, "yellow");
    }
  }

  /**
   * Přímá červená. `detail` zůstává "red" — nový detail by se ve statistikách tiše
   * počítal jako žlutá a ve frontendu vykreslil žlutě. Rozlišení nese popis události.
   */
  function giveDirectRed(player: MatchPlayer, team: TeamSetup, minute: number, description: string) {
    refCards++;
    if (minute > 70) refLateEvents++;
    addEvent(minute, "card", player, team.teamId, description, "red");
    sendOff(player, team, minute);
  }

  /** Kdo faul spáchal — váží agresivita a přítomnost rivala na hřišti. */
  function pickFouler(defending: TeamSetup): MatchPlayer | null {
    const defenders = defending.lineup.filter((p) => p.position !== "GK");
    if (defenders.length === 0) return null;
    // Rival musí být pořád na hřišti — po červené kartě už dusno nedělá.
    const onPitch = new Set(defending.lineup.map((p) => p.id).filter((id) => !redCards.has(id)));
    const weights = defenders.map((p) => {
      const base = 1 + (p.aggression / 100) * 2;
      const rival = p.relationshipsInLineup?.find((r) => r.type === "rivals" && onPitch.has(r.withId));
      const rivalBonus = rival ? 1 + 0.15 * ((rival.strength ?? 50) / 50) : 1.0;
      return base * rivalBonus;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = rng.random() * total;
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return defenders[i];
    }
    return defenders[0];
  }

  /**
   * Odehraje standardní situaci od rozehrání po zakončení.
   * `cross` je centr ze standardky z boku, `corner` roh — obojí končí hlavičkou
   * někoho jiného než kopajícího, ten dostane asistenci.
   */
  function playSetPiece(
    minute: number,
    kind: "penalty" | "freekick" | "cross" | "corner",
    attacking: TeamSetup,
    defending: TeamSetup,
  ) {
    const gk = getGK(defending.lineup);
    const defAvg = teamAvg(defending.lineup.filter((p) => p.position === "DEF"), "defense");
    const scoreDiff = attacking === home ? homeScore - awayScore : awayScore - homeScore;

    if (kind === "penalty") {
      const kicker = pickTaker(attacking.lineup, attacking.penaltyTakerId);
      if (!kicker) return;
      addEvent(minute, "penalty", kicker, attacking.teamId,
        `Penalta! Na puntík si to staví ${playerName(kicker)}`, "awarded");

      if (rng.random() < calcPenaltyProb(kicker, gk, minute, scoreDiff)) {
        scoreGoal(minute, kicker, attacking, defending,
          `Proměněno! ${playerName(kicker)} z penalty`, "penalty");
      } else {
        // Zahozená penalta bolí dvakrát: střelce na hlavě, soupeře nakopne
        const saved = rng.random() < 0.55;
        addEvent(minute, "chance", kicker, attacking.teamId,
          saved
            ? `Penalta! ${playerName(kicker)} — a brankář ji chytá!`
            : `Penalta! ${playerName(kicker)} — a mimo!`,
          saved ? "penalty_saved" : "penalty_missed");
        if (saved) {
          addEvent(minute, "special", gk, defending.teamId,
            `${playerName(gk)} chytil penaltu!`, "penalty_save");
        }
        kicker.morale = Math.max(0, kicker.morale - 8);
        for (const p of defending.lineup) p.morale = Math.min(100, p.morale + 2);
      }
      return;
    }

    const kicker = pickTaker(attacking.lineup, attacking.freekickTakerId);
    if (!kicker) return;

    if (kind === "freekick") {
      addEvent(minute, "freekick", kicker, attacking.teamId,
        `Přímý kop z dobré pozice, míč si bere ${playerName(kicker)}`, "direct");
      if (rng.random() < calcFreekickProb(kicker, gk, defAvg, weather)) {
        scoreGoal(minute, kicker, attacking, defending,
          `Přímý kop přesně k tyči! ${playerName(kicker)}`, "freekick");
      } else {
        addEvent(minute, "chance", kicker, attacking.teamId,
          `${playerName(kicker)} pálí přímák — ${rng.pick(["do zdi", "nad břevno", "těsně vedle", "brankář vyráží"])}`,
          "freekick_missed");
      }
      return;
    }

    // Centr do vápna — kope jeden, hlavičkuje druhý
    const header = pickHeader(rng, attacking.lineup, kicker);
    if (!header) return;
    const isCorner = kind === "corner";

    addEvent(minute, isCorner ? "corner" : "freekick", kicker, attacking.teamId,
      isCorner
        ? `Roh zahrává ${playerName(kicker)}`
        : `Standardka z boku, centruje ${playerName(kicker)}`,
      isCorner ? "taken" : "cross");

    if (rng.random() < calcAerialProb(kicker, header, gk, defending, isCorner, weather)) {
      scoreGoal(minute, header, attacking, defending,
        isCorner
          ? `Gól po rohu! Hlavou ${playerName(header)}`
          : `Gól ze standardky! ${playerName(header)}`,
        isCorner ? "corner" : "cross");
      // U centru asistuje vždycky ten, kdo kopal — nikdo jiný se míče nedotkl
      addEvent(minute, "assist", kicker, attacking.teamId,
        `Asistence: ${playerName(kicker)}`, "");
    } else if (rng.random() < 0.45) {
      addEvent(minute, "chance", header, attacking.teamId,
        `${playerName(header)} hlavičkuje — ${rng.pick(["nad břevno", "vedle", "chytil brankář", "zblokováno"])}`,
        "header_missed");
    }
  }

  // Check for late arrivals (low discipline)
  for (const p of [...home.lineup, ...away.lineup]) {
    if (p.discipline <= 20 && rng.random() < 0.15) {
      const lateMinute = rng.int(5, 20);
      const teamId = home.lineup.includes(p) ? home.teamId : away.teamId;
      addEvent(lateMinute, "special", p, teamId,
        `${playerName(p)} přiběhl na hřiště pozdě`,
        `Dorazil až v ${lateMinute}. minutě`);
    }
  }

  /**
   * Provede naplánovanou spornou situaci. Volá se nejvýš jednou za zápas.
   * Neuznaný gól se jen „nabije" — projeví se až u prvního gólu poškozeného týmu,
   * a když žádný nepadne, tiše se neprojeví vůbec (což je realistické).
   */
  function applyPlannedError(minute: number, plan: NonNullable<typeof plannedError>) {
    const favour = plan.favourHome ? home : away;
    const victim = plan.favourHome ? away : home;

    const push = (player: MatchPlayer, text: string) => {
      refereeIncidents.push({
        minute, kind: plan.kind, severity: plan.severity,
        againstTeamId: victim.teamId, favourTeamId: favour.teamId,
        playerName: playerName(player), text,
      });
      for (const p of victim.lineup) p.morale = Math.max(0, p.morale - 4);
      for (const p of favour.lineup) p.morale = Math.min(100, p.morale + 2);
    };

    switch (plan.kind) {
      case "neuznany_gol":
        // Nabít — škrtne se první gól poškozeného, který po téhle minutě padne.
        disallowGoalFor = victim.teamId;
        return;

      case "vymyslena_penalta": {
        const player = pickFouler(victim) ?? victim.lineup[0];
        if (!player) return;
        const text = incidentText(plan.kind, playerName(player), victim.teamName);
        addEvent(minute, "special", player, victim.teamId, text, "ref_error:vymyslena_penalta");
        push(player, text);
        playSetPiece(minute, "penalty", favour, victim);
        return;
      }

      case "sporny_primak": {
        const player = pickFouler(victim) ?? victim.lineup[0];
        if (!player) return;
        const text = incidentText(plan.kind, playerName(player), victim.teamName);
        addEvent(minute, "special", player, victim.teamId, text, "ref_error:sporny_primak");
        push(player, text);
        playSetPiece(minute, "freekick", favour, victim);
        return;
      }

      case "neodpiskana_penalta": {
        const player = pickAttacker(rng, victim.lineup);
        const text = incidentText(plan.kind, playerName(player), victim.teamName);
        addEvent(minute, "special", player, victim.teamId, text, "ref_error:neodpiskana_penalta");
        push(player, text);
        return;
      }

      case "chybna_cervena": {
        const player = pickFouler(victim);
        if (!player) return;
        const text = incidentText(plan.kind, playerName(player), victim.teamName);
        addEvent(minute, "special", player, victim.teamId, text, "ref_error:chybna_cervena");
        push(player, text);
        // Emituje i skutečnou červenou událost — jinak by se rozpadly stopky,
        // ratingy a matches.total_cards.
        giveDirectRed(player, victim, minute, `Červená karta pro ${playerName(player)} — a nikdo neví za co!`);
        return;
      }

      case "prehlednuta_cervena": {
        const player = pickFouler(favour);
        const hurt = pickAttacker(rng, victim.lineup);
        if (!player) return;
        const text = incidentText(plan.kind, playerName(hurt), victim.teamName);
        addEvent(minute, "special", player, favour.teamId, text, "ref_error:prehlednuta_cervena");
        push(hurt, text);
        giveYellow(player, favour, minute, `Jen žlutá pro ${playerName(player)} — a lavička nevěří vlastním očím`);
        return;
      }
    }
  }

  // Minute-by-minute simulation
  for (let minute = 1; minute <= 90; minute++) {
    // Sporná situace — strop „nejvýš jedna na zápas" je strukturální: po použití se plán zahodí.
    if (plannedError && minute === plannedError.minute) {
      applyPlannedError(minute, plannedError);
      plannedError = null;
    }

    // Determine possession
    const homePoss = calcPossession(home, away, homeAdvantage);
    homePossSum += homePoss;
    const isHomePossession = rng.random() < homePoss;
    const attacking = isHomePossession ? home : away;
    const defending = isHomePossession ? away : home;

    // Check for chance
    const attackForm = isHomePossession ? homeForm : awayForm;
    const chanceProb = calcChanceProb(attacking, defending, weather, attackForm, ref, {
      attacking: yellowCards, defending: yellowCards,
    });
    // Reduce chance probability when condition is low
    // Low condition has significant impact — floor at 0.45
    const conditionMod = Math.max(0.45, teamAvg(attacking.lineup, "condition") / 100);
    const adjustedChanceProb = chanceProb * conditionMod;

    if (rng.random() < adjustedChanceProb) {
      const attacker = pickAttacker(rng, attacking.lineup);
      const gk = getGK(defending.lineup);
      const defAvg = teamAvg(defending.lineup.filter((p) => p.position === "DEF"), "defense");
      const scoreDiff = isHomePossession ? homeScore - awayScore : awayScore - homeScore;
      const goalProb = calcGoalProb(rng, attacker, gk, defAvg, minute, scoreDiff);

      const scored = rng.random() < goalProb;

      if (scored && goalDisallowed(minute, attacker, attacking)) {
        // Gól neuznán — událost i morálka jsou zapsané v goalDisallowed.
        // Záměrně nenásleduje ani asistence, ani „zahozená šance".
      } else if (scored) {
        // GOAL!
        if (isHomePossession) homeScore++; else awayScore++;
        const isScramble = (weather === "snow" || weather === "rain") && rng.random() < 0.25;
        const goalSource: GoalSource = isScramble ? "scramble" : "open_play";
        const goalDesc = isScramble
          ? `Gól! ${playerName(attacker)} pohotově dorazil vyražený míč do sítě`
          : `Gól! ${playerName(attacker)} skóruje`;

        addEvent(minute, "goal", attacker, attacking.teamId,
          goalDesc, `${homeScore}:${awayScore}`, goalSource);

        // Assist — 65% chance, weighted by passing/vision/creativity
        if (rng.random() < 0.65) {
          const assister = pickAssister(rng, attacking.lineup, attacker);
          if (assister) {
            addEvent(minute, "assist", assister, attacking.teamId,
              `Asistence: ${playerName(assister)}`, "");
          }
        }

        // Morale boost modulated by leadership (reduced snowball)
        const attLeadership = teamAvg(attacking.lineup, "leadership") / 100;
        const defLeadership = teamAvg(defending.lineup, "leadership") / 100;
        const moraleBoost = Math.round(2 + attLeadership * 2); // 2-4 (was 3-7)
        const moraleHit = Math.round(1 + (1 - defLeadership) * 2); // 1-3 (was 2-5)
        for (const p of attacking.lineup) p.morale = Math.min(100, p.morale + moraleBoost);
        for (const p of defending.lineup) p.morale = Math.max(0, p.morale - moraleHit);

        // ── Captain morale bonus ──
        const attCaptain = attacking.captainId ? attacking.lineup.find((p) => p.id === attacking.captainId) : null;
        if (attCaptain && attCaptain.leadership >= 65) {
          const captainBonus = attCaptain.leadership >= 80 ? 2 : 1;
          for (const p of attacking.lineup) p.morale = Math.min(100, p.morale + captainBonus);
        }
        const defCaptain = defending.captainId ? defending.lineup.find((p) => p.id === defending.captainId) : null;
        if (defCaptain && defCaptain.leadership < 35) {
          for (const p of defending.lineup) p.morale = Math.max(0, p.morale - 1);
        }

        // ── Relationship morale bonuses after goal ──
        if (attacker.relationshipsInLineup) {
          for (const rel of attacker.relationshipsInLineup) {
            const teammate = attacking.lineup.find((p) => p.id === rel.withId);
            if (!teammate) continue;
            if (rel.type === "brothers" || rel.type === "father_son") {
              teammate.morale = Math.min(100, teammate.morale + 1);
              attacker.morale = Math.min(100, attacker.morale + 1);
            } else if (rel.type === "mentor_pupil") {
              teammate.morale = Math.min(100, teammate.morale + 1);
            } else if (rel.type === "drinking_buddies") {
              teammate.morale = Math.min(100, teammate.morale + 1);
            }
          }
        }
      } else {
        // Missed chance — credit GK save or defensive block
        const outcomes = ["vedle", "břevno", "tyč", "chytil brankář", "zblokováno"];
        const outcome = rng.pick(outcomes);
        addEvent(minute, "chance", attacker, attacking.teamId,
          `Šance! ${playerName(attacker)} — ${outcome}`,
          outcome);

        // Save/block events for rating
        if (outcome === "chytil brankář") {
          const isDifficultWeather = weather === "snow" || weather === "rain";
          const saveDesc = isDifficultWeather && rng.random() < 0.4
            ? `${playerName(gk)} s námahou vyrazil kluzký míč`
            : `${playerName(gk)} chytá střelu`;
          addEvent(minute, "special", gk, defending.teamId,
            saveDesc, "save");
        } else if (outcome === "zblokováno") {
          const blocker = rng.pick(defending.lineup.filter((p) => p.position === "DEF"));
          if (blocker) {
            addEvent(minute, "special", blocker, defending.teamId,
              `${playerName(blocker)} zblokoval šanci`, "block");
          }
        }

        // Vyražená nebo zblokovaná střela často skončí za lajnou → roh
        if (rng.random() < 0.62) playSetPiece(minute, "corner", attacking, defending);
      }
    }

    // Rohy nevznikají jen po vyložených šancích — tlak na obranu jich vyrobí víc.
    // Váha kopíruje šance, takže silnější tým rohů vykope víc.
    if (rng.random() < adjustedChanceProb * 0.62) {
      playSetPiece(minute, "corner", attacking, defending);
    }

    // Counter-attack: defensive tactic team can break on opponent's possession
    const defTacticMods = TACTIC_MODS[defending.tactic] ?? TACTIC_MODS.balanced;
    const defEffForCounter = calcTacticEffectiveness(defending.lineup, defending.tactic, defending.formation, defending.formationFamiliarity);
    // Oslabený tým se dostane do brejku hůř — dopředu už nemá kdo běhat.
    // Tvrdá hra naopak vyrábí zisky míče, ze kterých brejk vzniká.
    const counterHardBonus = hardnessMods(defending.hardness).counterBonus
      * hardEff(defending.lineup, defending.hardness ?? "normal", ref, yellowCards);
    const effectiveCounterMod = (defTacticMods.counterMod * defEffForCounter + counterHardBonus)
      * manpowerFactor(defending.lineup).attack;
    if (effectiveCounterMod > 0 && rng.random() < effectiveCounterMod * conditionMod) {
      const counterAttacker = pickAttacker(rng, defending.lineup);
      const counterGk = getGK(attacking.lineup);
      const counterDefAvg = teamAvg(attacking.lineup.filter((p) => p.position === "DEF"), "defense");
      const counterScoreDiff = isHomePossession ? awayScore - homeScore : homeScore - awayScore;
      const counterGoalProb = calcGoalProb(rng, counterAttacker, counterGk, counterDefAvg, minute, counterScoreDiff) * 0.85;

      if (rng.random() < counterGoalProb) {
        scoreGoal(minute, counterAttacker, defending, attacking,
          `Protiútok! ${playerName(counterAttacker)} skóruje po brejku`, "counter");
        if (rng.random() < 0.50) {
          const counterAssister = pickAssister(rng, defending.lineup, counterAttacker);
          if (counterAssister) {
            addEvent(minute, "assist", counterAssister, defending.teamId,
              `Asistence: ${playerName(counterAssister)}`, "");
          }
        }
      }
    }

    // ── Ostrý souboj ──
    // Frekvence i následky určuje delegovaný rozhodčí. Benevolentní sudí spoustu
    // soubojů pustí (výhoda), přísný odpíská skoro všechno.
    const defHardMods = hardnessMods(defending.hardness);
    if (rng.random() < refSevere * defHardMods.foulMod) {
      const fouler = pickFouler(defending);
      if (fouler) {
        if (rng.random() < refAdv) {
          // Sudí nechává hrát — z faulu není standardka ani karta.
          addEvent(minute, "special", fouler, defending.teamId,
            `Faul ${playerName(fouler)}, ale sudí nechává hrát — výhoda!`, "advantage");
        } else {
          refFouls++;
          if (minute > 70) refLateEvents++;
          addEvent(minute, "foul", fouler, defending.teamId, `Faul ${playerName(fouler)}`);

          const fatigue = refFatigue(ref, minute);
          const baseCard = (fouler.temper / 100 + (100 - fouler.discipline) / 100) / 2 * 0.4;

          if (rng.random() < directRedProb(ref, fouler.aggression) * defHardMods.redMod) {
            giveDirectRed(fouler, defending, minute,
              `Červená karta pro ${playerName(fouler)}! Zezadu do kotníku a sudí nezaváhal`);
          } else if (rng.random() < Math.min(0.55,
            baseCard * refCardMul * fatigue * defHardMods.cardMod * cardMemoryMod(ref, defending === home))) {
            giveYellow(fouler, defending, minute, `Žlutá karta pro ${playerName(fouler)}`);
          }

          // Kde se faulovalo, z toho plyne co z faulu bude. Šířku zóny penalty určuje
          // přísnost sudího a jeho náchylnost k domácímu prostředí (crowdFactor je tlak kotle).
          const pz = penaltyZone(ref, attacking === home, crowdFactor);
          const fz = freekickZone(pz);
          const cz = crossZone(fz);
          const zone = rng.random();
          if (zone < pz) {
            playSetPiece(minute, "penalty", attacking, defending);
          } else if (zone < fz) {
            playSetPiece(minute, "freekick", attacking, defending);
          } else if (zone < cz) {
            playSetPiece(minute, "cross", attacking, defending);
          }
        }
      }
    }

    // ── Malichernost ──
    // Faul, který by benevolentní sudí vůbec neodpískal. Nikdy z něj není penalta —
    // jinak by přísný rozhodčí ztrojnásobil počet penalt a rozbil gólovost zápasu.
    if (refPetty > 0 && rng.random() < refPetty * defHardMods.foulMod) {
      const fouler = pickFouler(defending);
      if (fouler) {
        refFouls++;
        if (minute > 70) refLateEvents++;
        addEvent(minute, "foul", fouler, defending.teamId,
          `${playerName(fouler)} — a sudí píská i tohle`, "petty");
        const baseCard = (fouler.temper / 100 + (100 - fouler.discipline) / 100) / 2 * 0.4;
        if (rng.random() < baseCard * refCardMul * PETTY_CARD_MUL * refFatigue(ref, minute)
            * defHardMods.cardMod * cardMemoryMod(ref, defending === home)) {
          giveYellow(fouler, defending, minute, `Žlutá karta pro ${playerName(fouler)}`);
        }
        // Žádná standardka — malichernost se z definice píská tam, kde to nikomu nepomůže.
      }
    }

    // Check for injury (~1% per minute, modified by weather, pitch, equipment)
    const pitchMod = config.pitchCondition != null ? (1 + (100 - config.pitchCondition) / 50) : 1;
    // Tvrdá hra bolí obě strany: vlastní hráči chodí do soubojů naostro a soupeř
    // schytává fauly. Násobí se globální pravděpodobnost i váhy — bez toho by se
    // zranění jen přerozdělila mezi týmy a celkem by jich nepřibylo.
    const injFactor = (own: TeamSetup, opp: TeamSetup) =>
      hardnessMods(own.hardness).selfInjuryMod * hardnessMods(opp.hardness).oppInjuryMod;
    const homeInjFactor = injFactor(home, away);
    const awayInjFactor = injFactor(away, home);
    const meanInjFactor = (homeInjFactor + awayInjFactor) / 2;

    const injuryProb = 0.01 * WEATHER_MODS[weather].injuryMod * pitchMod * meanInjFactor;
    if (rng.random() < injuryProb) {
      const allPlayers = [...home.lineup, ...away.lineup];
      // Koho zranění potká, váží náchylnost (injuryProneness 0-100, default 50) —
      // křehký hráč (100) má ~3× vyšší riziko než železný (0). Dřív čistá náhoda,
      // přestože UI atribut "Náchylnost" zobrazuje.
      const homeCount = home.lineup.length;
      const proneWeights = allPlayers.map((p, i) =>
        (0.5 + ((p.injuryProneness ?? 50) / 100)) * (i < homeCount ? homeInjFactor : awayInjFactor));
      const totalProne = proneWeights.reduce((a, b) => a + b, 0);
      let proneRoll = rng.random() * totalProne;
      let unlucky = allPlayers[allPlayers.length - 1];
      for (let i = 0; i < allPlayers.length; i++) {
        proneRoll -= proneWeights[i];
        if (proneRoll <= 0) { unlucky = allPlayers[i]; break; }
      }
      // Equipment first-aid kit reduces injury chance for the affected team
      const teamInjMod = home.lineup.includes(unlucky) ? homeInjuryMod : awayInjuryMod;
      // Zimní výbava tlumí NAVÝŠENÍ rizika zranění z počasí (základní 1% riziko nechává)
      const wResist = (home.lineup.includes(unlucky) ? home.weatherResist : away.weatherResist) ?? 0;
      const wInjMod = WEATHER_MODS[weather].injuryMod;
      const weatherSkipChance = wInjMod > 1 && wResist > 0 ? ((wInjMod - 1) * wResist) / wInjMod : 0;
      if (weatherSkipChance > 0 && rng.random() < weatherSkipChance) {
        // Zimní výbava zabránila zranění z počasí — skip
      } else if (teamInjMod < 1 && rng.random() > teamInjMod) {
        // Equipment prevented this injury — skip
      } else {
        const teamId = home.lineup.includes(unlucky) ? home.teamId : away.teamId;
        const injuries = ["natažený sval", "podvrtnutý kotník", "křeče", "koleno", "naraženina"];
        const injury = rng.pick(injuries);
        addEvent(minute, "injury", unlucky, teamId,
          `${playerName(unlucky)} — ${injury}`,
          injury);

        // Try substitution (injury — doesn't count toward tactical sub limit)
        const team = teamId === home.teamId ? home : away;
        const subsUsed = teamId === home.teamId ? homeSubsUsed : awaySubsUsed;
        if (team.subs.length > 0 && subsUsed < MAX_SUBS) {
          const subIdx = pickSubIndexForPosition(team.subs, unlucky.matchPosition ?? unlucky.position);
          if (subIdx >= 0) {
            const sub = team.subs.splice(subIdx, 1)[0];
            const idx = team.lineup.indexOf(unlucky);
            if (idx >= 0) {
              sub.matchPosition = unlucky.matchPosition;
              team.lineup[idx] = sub;
              playerMinutes[unlucky.id] = { ...playerMinutes[unlucky.id], left: minute };
              playerMinutes[sub.id] = { entered: minute, left: null };
              if (teamId === home.teamId) homeSubsUsed++; else awaySubsUsed++;
              addEvent(minute, "substitution", sub, teamId,
                `Střídání: ${playerName(sub)} za ${playerName(unlucky)}`);
            }
          }
        }
      }
    }

    // Tactical substitutions (after 60')
    if (minute >= 60) {
      for (const teamData of [{ team: home, teamId: home.teamId, subsUsed: homeSubsUsed, isHome: true },
                               { team: away, teamId: away.teamId, subsUsed: awaySubsUsed, isHome: false }]) {
        if (teamData.subsUsed >= MAX_SUBS || teamData.team.subs.length === 0) continue;

        // Condition-based: stáhnout vyčerpaného hráče
        const exhausted = teamData.team.lineup
          .filter((p) => (p.matchPosition ?? p.position) !== "GK" && p.condition < 25)
          .sort((a, b) => a.condition - b.condition)[0];

        if (exhausted && rng.random() < 0.3) {
          const subIdx = pickSubIndexForPosition(teamData.team.subs, exhausted.matchPosition ?? exhausted.position);
          if (subIdx >= 0) {
            const sub = teamData.team.subs.splice(subIdx, 1)[0];
            const idx = teamData.team.lineup.indexOf(exhausted);
            if (idx >= 0) {
              sub.matchPosition = exhausted.matchPosition;
              teamData.team.lineup[idx] = sub;
              playerMinutes[exhausted.id] = { ...playerMinutes[exhausted.id], left: minute };
              playerMinutes[sub.id] = { entered: minute, left: null };
              if (teamData.isHome) homeSubsUsed++; else awaySubsUsed++;
              addEvent(minute, "substitution", sub, teamData.teamId,
                `Střídání: ${playerName(sub)} za ${playerName(exhausted)}`);
              continue;
            }
          }
        }

        // Tactical: prohrávající tým po 75' → útočník za obránce
        if (minute >= 75) {
          const scoreDiff = teamData.isHome ? homeScore - awayScore : awayScore - homeScore;
          if (scoreDiff < 0 && rng.random() < 0.4) {
            const fwdSub = teamData.team.subs.find((p) => p.position === "FWD");
            const defOut = teamData.team.lineup
              .filter((p) => (p.matchPosition ?? p.position) === "DEF")
              .sort((a, b) => a.condition - b.condition)[0];
            if (fwdSub && defOut) {
              const subIdx = teamData.team.subs.indexOf(fwdSub);
              teamData.team.subs.splice(subIdx, 1);
              const lineupIdx = teamData.team.lineup.indexOf(defOut);
              fwdSub.matchPosition = defOut.matchPosition;
              teamData.team.lineup[lineupIdx] = fwdSub;
              playerMinutes[defOut.id] = { ...playerMinutes[defOut.id], left: minute };
              playerMinutes[fwdSub.id] = { entered: minute, left: null };
              if (teamData.isHome) homeSubsUsed++; else awaySubsUsed++;
              addEvent(minute, "substitution", fwdSub, teamData.teamId,
                `Taktické střídání: ${playerName(fwdSub)} za ${playerName(defOut)}`);
            }
          }
        }
      }
    }

    // Special events for okresní fotbal (~4% per minute)
    if (rng.random() < 0.04) {
      const allPlayers = [...home.lineup, ...away.lineup];
      const player = rng.pick(allPlayers);
      const teamId = home.lineup.includes(player) ? home.teamId : away.teamId;

      const specialRoll = rng.random();

      if (specialRoll < 0.25 && player.condition < 30) {
        // Player exhausted
        addEvent(minute, "special", player, teamId,
          `${playerName(player)} se drží za kolena a nemůže dál`,
          "exhausted");
      } else if (specialRoll < 0.45 && player.temper >= 70) {
        // Hádka s rozhodčím. Jak snadno z toho bude karta, závisí na jeho karetní ruce.
        addEvent(minute, "special", player, teamId,
          `${playerName(player)} se hádá s rozhodčím`,
          "argument");
        if (rng.random() < protestYellowProb(ref)) {
          // Přes giveYellow, aby druhá žlutá eskalovala na červenou — dřív se tady
          // volalo holé yellowCards.add() a hráč mohl mít dvě žluté a dohrát.
          giveYellow(player, teamById(teamId), minute,
            `Žlutá karta za protesty pro ${playerName(player)}`);
        }
      } else if (specialRoll < 0.55 && player.alcohol >= 75) {
        // Hangover effect
        addEvent(minute, "special", player, teamId,
          `${playerName(player)} vypadá, že včerejší hospoda se podepsala`,
          "hangover");
        player.condition = round2(Math.max(0, player.condition - 10));
      } else if (specialRoll < 0.65) {
        // Random crowd event
        addEvent(minute, "special", player, teamId,
          "Divák u lajny komentuje situaci lépe než trenér",
          "crowd");
      } else if (specialRoll < 0.75 && minute > 75) {
        // GK hero moment for weak GKs
        const gk = getGK(home.lineup.includes(player) ? home.lineup : away.lineup);
        if (gk.goalkeeping <= 40) {
          addEvent(minute, "special", gk, teamId,
            `${playerName(gk)} předvedl zákrok sezóny!`,
            "gk_hero");
        }
      }
    }

    // ── Dynamické incidenty počasí ──
    // Každý typ má vlastní roll řízený svou hodnotou ve WEATHER_MODS[weather]; počasí,
    // které danou šanci má na 0, větev nikdy neotevře. Dřív byly větve přivázané na
    // konkrétní počasí a četly WEATHER_MODS.snow/.rain/.wind natvrdo, takže se tři
    // z devíti naladěných hodnot nikdy nepoužily (déšť neuklouzl, ve sněhu nefoukalo).
    const weatherMod = WEATHER_MODS[weather];

    /** Náhodný hráč na hřišti i s týmem, ke kterému patří. */
    function pickIncidentPlayer(): { player: MatchPlayer; team: TeamSetup } {
      const player = rng.pick([...home.lineup, ...away.lineup]);
      return { player, team: home.lineup.includes(player) ? home : away };
    }

    if (rng.random() < weatherMod.slipChance) {
      const { player, team } = pickIncidentPlayer();
      // Zimní výbava (weatherResist) podklouznutí tlumí. Random se losuje vždy, i při
      // resistu 0 — jinak by se RNG proudy týmů s výbavou a bez ní rozešly.
      if (rng.random() >= (team.weatherResist ?? 0)) {
        const slipTexts = weather === "snow"
          ? [
              `${playerName(player)} na zasněženém trávníku nečekaně podklouzl!`,
              `${playerName(player)} na zmrzlém podkladu ztratil rovnováhu a poroučel se k zemi.`,
              `Dlouhý skluz na sněhu vynesl ${playerName(player)} až za postranní čáru.`,
              `${playerName(player)} se zvedá ze zasněženého trávníku a oklepává si sníh z dresu.`,
            ]
          : [
              `${playerName(player)} uklouzl na mokrém trávníku a natáhl se jak široký tak dlouhý!`,
              `${playerName(player)} podklouzl v rozbředlém vápně a míč mu utekl do autu.`,
              `Kopačky na mokru nedržely — ${playerName(player)} skončil na zemi.`,
              `${playerName(player)} se sbírá z promáčeného trávníku a ždímá si dres.`,
            ];
        addEvent(minute, "special", player, team.teamId, rng.pick(slipTexts), "weather_slip");
        player.condition = round2(Math.max(0, player.condition - 1.5));
      }
    }

    if ((config.pitchCondition ?? 80) < 70 && rng.random() < weatherMod.puddleChance) {
      const { player, team } = pickIncidentPlayer();
      const puddleTexts = [
        `Přihrávka do běhu se zastavila v hluboké kaluži na vápně!`,
        `Míč uvízl v rozbahněném terénu uprostřed hřiště a vznikl nečekaný souboj.`,
        `${playerName(player)} se pokusil o kličku, ale míč zůstal stát ve vodě.`,
        `Voda stříká od kopaček při každém došlapu, trávník se mění v oraniště.`,
      ];
      addEvent(minute, "special", player, team.teamId, rng.pick(puddleTexts), "weather_puddle");
    }

    if (rng.random() < weatherMod.windGustChance) {
      const { player, team } = pickIncidentPlayer();
      const windTexts = [
        `Silný poryv větru stočil centr daleko za bránu.`,
        `Odkop od brány sfoukl protivítr zpátky na polovinu hřiště.`,
        `Míč ve vzduchu zaplaval a ${playerName(player)} ho v silném větru netrefil.`,
        `Poryv bočního větru srazil dlouhý pas do autu.`,
      ];
      addEvent(minute, "special", player, team.teamId, rng.pick(windTexts), "weather_wind");
    }

    // Possession/atmosphere events (~25% per minute — keeps match alive, ~45 events/match)
    if (rng.random() < 0.25) {
      const isHomeAtt = rng.random() < homePoss;
      const att = isHomeAtt ? home : away;
      const def = isHomeAtt ? away : home;
      const attPlayer = rng.pick(att.lineup.filter((p) => p.position === "MID" || p.position === "FWD"));
      if (attPlayer) {
        const possTexts = [
          `${att.teamName} kombinují přes střed hřiště.`,
          `${att.teamName} kontrolují tempo hry.`,
          `Tvrdý pressing ${att.teamName}, ${def.teamName} se nemůžou dostat z vlastní půlky.`,
          `${playerName(attPlayer)} rozehrává z hloubky pole.`,
          `${att.teamName} si nahrávají na polovině soupeře.`,
          `${def.teamName} stahují obranu, ${att.teamName} hledají prostor.`,
          `Dlouhý míč od ${playerName(attPlayer)}, ${att.teamName} zrychlují.`,
          `Hra se přesouvá na polovinu ${def.teamName}.`,
        ];
        addEvent(minute, "special", attPlayer, att.teamId,
          rng.pick(possTexts), "possession");
      }
    }

    // Half-time event + recovery
    if (minute === 45) {
      const p = rng.pick(home.lineup);
      addEvent(45, "special", p, home.teamId,
        `Poločas ${homeScore}:${awayScore}`,
        "half_time");
      // Half-time recovery: +5 condition
      for (const pl of [...home.lineup, ...away.lineup]) {
        pl.condition = Math.min(100, pl.condition + 5);
      }
    }

    // Update condition (equipment drain reduction × tactic drain × weather drain — pressing = +30 %, snow/freeze = +20 %)
    const homeWeatherDrain = 1 + (WEATHER_MODS[weather].conditionDrainMod - 1) * (1 - (home.weatherResist ?? 0));
    const awayWeatherDrain = 1 + (WEATHER_MODS[weather].conditionDrainMod - 1) * (1 - (away.weatherResist ?? 0));

    updateCondition(home.lineup, minute,
      homeCondDrainMod * tacticDrainMod(home.tactic) * hardnessMods(home.hardness).drainMod * homeWeatherDrain, homeLateFatigueMod);
    updateCondition(away.lineup, minute,
      awayCondDrainMod * tacticDrainMod(away.tactic) * hardnessMods(away.hardness).drainMod * awayWeatherDrain, awayLateFatigueMod);
  }

  // Full-time event
  const lastPlayer = rng.pick(home.lineup);
  addEvent(90, "special", lastPlayer, home.teamId,
    `Konec zápasu! ${home.teamName} ${homeScore}:${awayScore} ${away.teamName}`,
    "full_time");

  // Sort events by minute
  events.sort((a, b) => a.minute - b.minute);

  const possessionHome = Math.max(30, Math.min(70, Math.round((homePossSum / 90) * 100)));

  // Známka rozhodčího za celý zápas — jako by ji dal delegát okresní komise.
  const worstIncident = refereeIncidents.reduce<RefereeIncident["severity"] | null>((acc, i) => {
    if (acc === "high" || i.severity === "high") return "high";
    if (acc === "medium" || i.severity === "medium") return "medium";
    return i.severity;
  }, null);
  const refereeGrade = gradeReferee(ref, {
    fouls: refFouls,
    cards: refCards,
    incidentSeverity: worstIncident,
    lateEventShare: refFouls + refCards > 0 ? refLateEvents / (refFouls + refCards) : 0,
  });

  return {
    homeScore,
    awayScore,
    events,
    homeLineup: home.lineup,
    awayLineup: away.lineup,
    playerMinutes,
    possessionHome,
    refereeIncidents,
    refereeGrade,
  };
}
