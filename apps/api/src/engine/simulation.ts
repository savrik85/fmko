/**
 * FMK-33: Zápasový simulační model — matematický core.
 *
 * 90minutový cyklus simulace fotbalového zápasu pro okresní fotbal.
 */

import type { Rng } from "../generators/rng";
import type { MatchEvent, EventType } from "@okresni-masina/shared";
import type {
  MatchConfig,
  MatchResult,
  MatchPlayer,
  TeamSetup,
  Tactic,
  Weather,
} from "./types";

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Average of a stat across lineup */
function teamAvg(lineup: MatchPlayer[], stat: keyof MatchPlayer): number {
  const vals = lineup.map((p) => p[stat] as number);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Sum of a stat for a subset of lineup by position */
function positionSum(lineup: MatchPlayer[], pos: string, stat: keyof MatchPlayer): number {
  return lineup
    .filter((p) => p.position === pos)
    .reduce((sum, p) => sum + (p[stat] as number), 0);
}

/** Get player display name */
function playerName(p: MatchPlayer): string {
  return `${p.firstName} ${p.lastName}`;
}

/** Tactic modifiers */
const TACTIC_MODS: Record<Tactic, { attackMod: number; defenseMod: number; chanceMod: number; counterMod: number }> = {
  offensive:  { attackMod: 1.15, defenseMod: 0.85, chanceMod: 1.05, counterMod: 0.0 },
  balanced:   { attackMod: 1.0,  defenseMod: 1.0,  chanceMod: 1.0,  counterMod: 0.0 },
  defensive:  { attackMod: 0.75, defenseMod: 1.15, chanceMod: 0.75, counterMod: 0.03 },
  long_ball:  { attackMod: 1.05, defenseMod: 0.95, chanceMod: 0.95, counterMod: 0.0 },
};

/** Weather effects */
const WEATHER_MODS: Record<Weather, { techniqueMod: number; longBallBonus: number; injuryMod: number }> = {
  sunny:  { techniqueMod: 1.0, longBallBonus: 0, injuryMod: 1.0 },
  cloudy: { techniqueMod: 1.0, longBallBonus: 0, injuryMod: 1.0 },
  rain:   { techniqueMod: 0.8, longBallBonus: 0.15, injuryMod: 1.3 },
  wind:   { techniqueMod: 0.9, longBallBonus: -0.1, injuryMod: 1.0 },
  snow:   { techniqueMod: 0.7, longBallBonus: 0.1, injuryMod: 1.4 },
};

/**
 * Calculate possession probability for home team (0–1).
 */
function calcPossession(home: TeamSetup, away: TeamSetup, isHomeAdvantage: boolean): number {
  const homeMid = teamAvg(home.lineup.filter((p) => p.position === "MID"), "technique")
    + teamAvg(home.lineup.filter((p) => p.position === "MID"), "passing");
  const awayMid = teamAvg(away.lineup.filter((p) => p.position === "MID"), "technique")
    + teamAvg(away.lineup.filter((p) => p.position === "MID"), "passing");

  const homeBonus = isHomeAdvantage ? 0.05 : 0;
  const total = homeMid + awayMid;
  if (total === 0) return 0.5;
  return Math.min(0.7, Math.max(0.3, (homeMid / total) + homeBonus));
}

/**
 * Calculate chance probability per minute for attacking team.
 */
function calcChanceProb(
  attacking: TeamSetup,
  defending: TeamSetup,
  weather: Weather,
  formFactor: number = 1.0,
): number {
  const tacticMod = TACTIC_MODS[attacking.tactic];
  const weatherMod = WEATHER_MODS[weather];

  const outfield = attacking.lineup.filter((p) => p.position !== "GK");
  const mids = attacking.lineup.filter((p) => p.position === "MID");
  const midAndFwd = attacking.lineup.filter((p) => p.position === "MID" || p.position === "FWD");
  const defOutfield = defending.lineup.filter((p) => p.position !== "GK");
  const defs = defending.lineup.filter((p) => p.position === "DEF");

  const attackPower = (
    teamAvg(outfield, "technique") * weatherMod.techniqueMod * 0.8 +
    teamAvg(outfield, "passing") * 1.0 +
    teamAvg(outfield, "speed") * 0.7 +
    (mids.length > 0 ? teamAvg(mids, "vision") * 0.6 : 0) +
    (midAndFwd.length > 0 ? teamAvg(midAndFwd, "creativity") * 0.5 : 0) +
    teamAvg(outfield, "workRate") * 0.3
  ) / 5 * tacticMod.attackMod * formFactor;

  const defensePower = (
    teamAvg(defOutfield, "defense") * 1.0 +
    teamAvg(defOutfield, "strength") * 0.7 +
    (defs.length > 0 ? teamAvg(defs, "aggression") * 0.2 : 0) +
    teamAvg(defOutfield, "workRate") * 0.2
  ) / 3 * TACTIC_MODS[defending.tactic].defenseMod;

  // Use DIFFERENCE not ratio — so stronger teams create more chances
  // attackPower ~20 (weak) to ~35 (strong), defensePower ~18 to ~25
  const advantage = (attackPower - defensePower) / 100; // skill difference matters but not overwhelming
  const baseChance = 0.10; // neutral chance per minute — target ~3.5 goals/match
  const longBallBonus = attacking.tactic === "long_ball" ? weatherMod.longBallBonus : 0;

  // Underdog boost: weaker team gets small floor boost
  const underdogBoost = advantage < -0.05 ? 0.02 : 0;
  // Okresní přebor: skill advantage matters but not overwhelmingly
  return Math.min(0.25, Math.max(0.07, baseChance + advantage + longBallBonus + underdogBoost)) * tacticMod.chanceMod;
}

/**
 * Calculate goal probability from a chance.
 */
function calcGoalProb(
  rng: Rng,
  attacker: MatchPlayer,
  gk: MatchPlayer,
  defenseAvg: number,
  minute: number,
  scoreDiff: number,
  isSetPiece: boolean,
): number {
  // 30% šancí = hlavičky
  const isHeader = rng.random() < 0.3;
  const attackVal = isHeader
    ? (attacker.heading * 2 + attacker.strength) / 3
    : isSetPiece
      ? (attacker.setPieces * 2 + attacker.technique) / 3
      : (attacker.shooting * 2 + attacker.technique) / 3;

  const defenseVal = (gk.goalkeeping * 2 + defenseAvg) / 3;

  let ratio = attackVal / (attackVal + defenseVal);

  // Consistency modifier: 0.85-1.15
  ratio *= 0.85 + (attacker.consistency / 100) * 0.30;

  // Clutch: po 75' při těsném skóre (≤1 gól)
  if (minute >= 75 && Math.abs(scoreDiff) <= 1) {
    ratio *= 0.9 + (attacker.clutch / 100) * 0.2;
  }

  // Relationship bonuses: mentor confidence (+3%), rival grit (+2%)
  if (attacker.relationshipsInLineup) {
    const hasMentor = attacker.relationshipsInLineup.some((r) => r.type === "mentor_pupil");
    if (hasMentor) ratio *= 1.03;
  }

  // Okresní level: víc gólů (slabší brankáři, horší obrana)
  return Math.min(0.70, Math.max(0.15, ratio * 0.90));
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
    // Relationship bonus: brothers/mentor-pupil assist each other more
    const relBonus = scorer.relationshipsInLineup?.some(
      (r) => r.withId === p.id && (r.type === "brothers" || r.type === "father_son" || r.type === "mentor_pupil")
    ) ? 1.15 : 1.0;
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
function getGK(lineup: MatchPlayer[]): MatchPlayer {
  return lineup.find((p) => p.position === "GK") ?? lineup[0];
}

/**
 * Update condition for all players after a minute.
 */
function updateCondition(lineup: MatchPlayer[], minute: number, drainMod: number = 1): void {
  for (const p of lineup) {
    // Base decay: depends on stamina (0-100 škála)
    const staminaFactor = (100 - p.stamina) / 100; // Low stamina = faster decay
    const alcoholPenalty = p.alcohol > 75 ? 0.15 : p.alcohol > 50 ? 0.08 : 0;
    const lateFatigue = minute > 70 ? 0.15 : 0;

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
 * Simulate a full 90-minute match.
 */
export function simulateMatch(rng: Rng, config: MatchConfig): MatchResult {
  const { home, away, weather, isHomeAdvantage } = config;
  const events: MatchEvent[] = [];
  let homeScore = 0;
  let awayScore = 0;

  // Apply equipment bonuses to players
  const homeEq = config.homeEquipment;
  const awayEq = config.awayEquipment;
  if (homeEq) {
    for (const p of home.lineup) {
      p.technique = Math.min(100, p.technique + homeEq.techniqueMod);
      if (p.position === "GK") p.goalkeeping = Math.min(100, p.goalkeeping + homeEq.gkBonus);
      p.morale = Math.min(100, p.morale + homeEq.moraleMod);
    }
    for (const p of home.subs) {
      p.technique = Math.min(100, p.technique + homeEq.techniqueMod);
      if (p.position === "GK") p.goalkeeping = Math.min(100, p.goalkeeping + homeEq.gkBonus);
    }
  }
  if (awayEq) {
    for (const p of away.lineup) {
      p.technique = Math.min(100, p.technique + awayEq.techniqueMod);
      if (p.position === "GK") p.goalkeeping = Math.min(100, p.goalkeeping + awayEq.gkBonus);
      p.morale = Math.min(100, p.morale + awayEq.moraleMod);
    }
    for (const p of away.subs) {
      p.technique = Math.min(100, p.technique + awayEq.techniqueMod);
      if (p.position === "GK") p.goalkeeping = Math.min(100, p.goalkeeping + awayEq.gkBonus);
    }
  }

  // Equipment condition drain modifiers
  const homeCondDrainMod = 1 - (homeEq?.conditionDrainMod ?? 0);
  const awayCondDrainMod = 1 - (awayEq?.conditionDrainMod ?? 0);

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

  function addEvent(
    minute: number,
    type: EventType,
    player: MatchPlayer,
    teamId: number,
    description: string,
    detail?: string,
  ) {
    events.push({
      minute,
      type,
      playerId: player.id,
      playerName: playerName(player),
      teamId,
      description,
      detail,
    });
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

  // Minute-by-minute simulation
  for (let minute = 1; minute <= 90; minute++) {
    // Determine possession
    const homePoss = calcPossession(home, away, isHomeAdvantage);
    const isHomePossession = rng.random() < homePoss;
    const attacking = isHomePossession ? home : away;
    const defending = isHomePossession ? away : home;

    // Check for chance
    const attackForm = isHomePossession ? homeForm : awayForm;
    const chanceProb = calcChanceProb(attacking, defending, weather, attackForm);
    // Reduce chance probability when condition is low
    // Low condition has significant impact — floor at 0.45
    const conditionMod = Math.max(0.45, teamAvg(attacking.lineup, "condition") / 100);
    const adjustedChanceProb = chanceProb * conditionMod;

    if (rng.random() < adjustedChanceProb) {
      const attacker = pickAttacker(rng, attacking.lineup);
      const gk = getGK(defending.lineup);
      const defAvg = teamAvg(defending.lineup.filter((p) => p.position === "DEF"), "defense");
      const scoreDiff = isHomePossession ? homeScore - awayScore : awayScore - homeScore;
      const goalProb = calcGoalProb(rng, attacker, gk, defAvg, minute, scoreDiff, false);

      if (rng.random() < goalProb) {
        // GOAL!
        if (isHomePossession) homeScore++; else awayScore++;
        addEvent(minute, "goal", attacker, attacking.teamId,
          `Gól! ${playerName(attacker)} skóruje`,
          `${homeScore}:${awayScore}`);

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
          addEvent(minute, "special", gk, defending.teamId,
            `${playerName(gk)} chytá střelu`, "save");
        } else if (outcome === "zblokováno") {
          const blocker = rng.pick(defending.lineup.filter((p) => p.position === "DEF"));
          if (blocker) {
            addEvent(minute, "special", blocker, defending.teamId,
              `${playerName(blocker)} zblokoval šanci`, "block");
          }
        }
      }
    }

    // Counter-attack: defensive tactic team can break on opponent's possession
    const defTacticMods = TACTIC_MODS[defending.tactic];
    if (defTacticMods.counterMod > 0 && rng.random() < defTacticMods.counterMod * conditionMod) {
      const counterAttacker = pickAttacker(rng, defending.lineup);
      const counterGk = getGK(attacking.lineup);
      const counterDefAvg = teamAvg(attacking.lineup.filter((p) => p.position === "DEF"), "defense");
      const counterScoreDiff = isHomePossession ? awayScore - homeScore : homeScore - awayScore;
      const counterGoalProb = calcGoalProb(rng, counterAttacker, counterGk, counterDefAvg, minute, counterScoreDiff, false) * 0.85;

      if (rng.random() < counterGoalProb) {
        if (isHomePossession) awayScore++; else homeScore++;
        addEvent(minute, "goal", counterAttacker, defending.teamId,
          `Protiútok! ${playerName(counterAttacker)} skóruje po brejku`,
          `${homeScore}:${awayScore}`);
        if (rng.random() < 0.50) {
          const counterAssister = pickAssister(rng, defending.lineup, counterAttacker);
          if (counterAssister) {
            addEvent(minute, "assist", counterAssister, defending.teamId,
              `Asistence: ${playerName(counterAssister)}`, "");
          }
        }
        const cAttLead = teamAvg(defending.lineup, "leadership") / 100;
        const cDefLead = teamAvg(attacking.lineup, "leadership") / 100;
        for (const p of defending.lineup) p.morale = Math.min(100, p.morale + Math.round(2 + cAttLead * 2));
        for (const p of attacking.lineup) p.morale = Math.max(0, p.morale - Math.round(1 + (1 - cDefLead) * 2));
      }
    }

    // Check for foul (~8% per minute)
    if (rng.random() < 0.08) {
      const defenders = defending.lineup.filter((p) => p.position !== "GK");
      if (defenders.length > 0) {
        // Weighted pick by aggression + rival bonus
        const weights = defenders.map((p) => {
          const base = 1 + (p.aggression / 100) * 2;
          const rivalBonus = p.relationshipsInLineup?.some((r) => r.type === "rivals") ? 1.15 : 1.0;
          return base * rivalBonus;
        });
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let roll = rng.random() * totalWeight;
        let foulerIdx = 0;
        for (let fi = 0; fi < weights.length; fi++) {
          roll -= weights[fi];
          if (roll <= 0) { foulerIdx = fi; break; }
        }
        const fouler = defenders[foulerIdx];
        const temperFactor = fouler.temper / 100;
        const disciplineFactor = (100 - fouler.discipline) / 100;

        addEvent(minute, "foul", fouler, defending.teamId,
          `Faul ${playerName(fouler)}`,
        );

        // Card probability based on temper and discipline
        const cardProb = (temperFactor + disciplineFactor) / 2 * 0.4;
        if (rng.random() < cardProb) {
          if (yellowCards.has(fouler.id)) {
            // Second yellow → red
            yellowCards.delete(fouler.id);
            redCards.add(fouler.id);
            addEvent(minute, "card", fouler, defending.teamId,
              `Druhá žlutá a červená pro ${playerName(fouler)}!`,
              "red");
            // Remove from lineup + track minutes
            const idx = defending.lineup.indexOf(fouler);
            if (idx >= 0) {
              defending.lineup.splice(idx, 1);
              if (playerMinutes[fouler.id]) playerMinutes[fouler.id].left = minute;
            }
          } else {
            yellowCards.add(fouler.id);
            addEvent(minute, "card", fouler, defending.teamId,
              `Žlutá karta pro ${playerName(fouler)}`,
              "yellow");
          }
        }
      }

      // Set piece chance from foul (25%)
      if (rng.random() < 0.25) {
        const kicker = attacking.lineup
          .filter((p) => p.position !== "GK")
          .sort((a, b) => b.setPieces - a.setPieces)[0];
        if (kicker) {
          const spGk = getGK(defending.lineup);
          const spDefAvg = teamAvg(defending.lineup.filter((p) => p.position === "DEF"), "defense");
          const spScoreDiff = isHomePossession ? homeScore - awayScore : awayScore - homeScore;
          const spGoalProb = calcGoalProb(rng, kicker, spGk, spDefAvg, minute, spScoreDiff, true) * 0.7;
          if (rng.random() < spGoalProb) {
            if (isHomePossession) homeScore++; else awayScore++;
            addEvent(minute, "goal", kicker, attacking.teamId,
              `Gól ze standardní situace! ${playerName(kicker)}`,
              `${homeScore}:${awayScore}`);
            // Set piece assist (40% chance — weighted by passing/vision/creativity)
            if (rng.random() < 0.40) {
              const spAssister = pickAssister(rng, attacking.lineup, kicker);
              if (spAssister) {
                addEvent(minute, "assist", spAssister, attacking.teamId,
                  `Asistence: ${playerName(spAssister)}`, "");
              }
            }
            const attLead = teamAvg(attacking.lineup, "leadership") / 100;
            const defLead = teamAvg(defending.lineup, "leadership") / 100;
            for (const p of attacking.lineup) p.morale = Math.min(100, p.morale + Math.round(2 + attLead * 2));
            for (const p of defending.lineup) p.morale = Math.max(0, p.morale - Math.round(1 + (1 - defLead) * 2));
          }
        }
      }
    }

    // Check for injury (~1% per minute, modified by weather, pitch, equipment)
    const pitchMod = config.pitchCondition != null ? (1 + (100 - config.pitchCondition) / 50) : 1;
    const injuryProb = 0.01 * WEATHER_MODS[weather].injuryMod * pitchMod;
    if (rng.random() < injuryProb) {
      const allPlayers = [...home.lineup, ...away.lineup];
      const unlucky = rng.pick(allPlayers);
      // Equipment first-aid kit reduces injury chance for the affected team
      const teamInjMod = home.lineup.includes(unlucky) ? homeInjuryMod : awayInjuryMod;
      if (teamInjMod < 1 && rng.random() > teamInjMod) {
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
          const sub = team.subs.shift()!;
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
          const sub = teamData.team.subs.shift()!;
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
        // Argument with referee
        addEvent(minute, "special", player, teamId,
          `${playerName(player)} se hádá s rozhodčím`,
          "argument");
        if (rng.random() < 0.3) {
          yellowCards.add(player.id);
          addEvent(minute, "card", player, teamId,
            `Žlutá karta za protesty pro ${playerName(player)}`,
            "yellow");
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

    // Update condition (with equipment drain reduction)
    updateCondition(home.lineup, minute, homeCondDrainMod);
    updateCondition(away.lineup, minute, awayCondDrainMod);
  }

  // Full-time event
  const lastPlayer = rng.pick(home.lineup);
  addEvent(90, "special", lastPlayer, home.teamId,
    `Konec zápasu! ${home.teamName} ${homeScore}:${awayScore} ${away.teamName}`,
    "full_time");

  // Sort events by minute
  events.sort((a, b) => a.minute - b.minute);

  return {
    homeScore,
    awayScore,
    events,
    homeLineup: home.lineup,
    awayLineup: away.lineup,
    playerMinutes,
  };
}
