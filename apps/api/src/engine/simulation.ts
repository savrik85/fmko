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
  return p.nickname ?? `${p.firstName} ${p.lastName}`;
}

/** Tactic modifiers */
const TACTIC_MODS: Record<Tactic, { attackMod: number; defenseMod: number; chanceMod: number }> = {
  offensive:  { attackMod: 1.3, defenseMod: 0.8, chanceMod: 1.2 },
  balanced:   { attackMod: 1.0, defenseMod: 1.0, chanceMod: 1.0 },
  defensive:  { attackMod: 0.7, defenseMod: 1.3, chanceMod: 0.8 },
  long_ball:  { attackMod: 1.1, defenseMod: 0.9, chanceMod: 0.9 },
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
): number {
  const tacticMod = TACTIC_MODS[attacking.tactic];
  const weatherMod = WEATHER_MODS[weather];

  const attackPower = (
    teamAvg(attacking.lineup, "technique") * weatherMod.techniqueMod +
    teamAvg(attacking.lineup, "passing") +
    teamAvg(attacking.lineup, "speed")
  ) / 3 * tacticMod.attackMod;

  const defensePower = (
    teamAvg(defending.lineup, "defense") +
    teamAvg(defending.lineup, "strength")
  ) / 2 * TACTIC_MODS[defending.tactic].defenseMod;

  // Base chance probability per minute: ~3-8%
  const ratio = attackPower / (attackPower + defensePower);
  const longBallBonus = attacking.tactic === "long_ball" ? weatherMod.longBallBonus : 0;

  return Math.min(0.12, Math.max(0.02, ratio * 0.08 + longBallBonus)) * tacticMod.chanceMod;
}

/**
 * Calculate goal probability from a chance.
 */
function calcGoalProb(
  attacker: MatchPlayer,
  gk: MatchPlayer,
  defenseAvg: number,
): number {
  const attackVal = (attacker.shooting * 2 + attacker.technique) / 3;
  const defenseVal = (gk.goalkeeping * 2 + defenseAvg) / 3;

  // Base conversion rate: ~20-40% for okresní fotbal
  const ratio = attackVal / (attackVal + defenseVal);
  return Math.min(0.5, Math.max(0.1, ratio * 0.5));
}

/**
 * Pick a random attacker (FWD/MID weighted).
 */
function pickAttacker(rng: Rng, lineup: MatchPlayer[]): MatchPlayer {
  const fwds = lineup.filter((p) => p.position === "FWD");
  const mids = lineup.filter((p) => p.position === "MID");
  const pool = [
    ...fwds, ...fwds, ...fwds, // FWD 3x weighted
    ...mids, ...mids,          // MID 2x weighted
  ];
  return pool.length > 0 ? rng.pick(pool) : rng.pick(lineup);
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
function updateCondition(lineup: MatchPlayer[], minute: number): void {
  for (const p of lineup) {
    // Base decay: 0.5-1.5 per minute depending on stamina
    const staminaFactor = (20 - p.stamina) / 20; // Low stamina = faster decay
    const alcoholPenalty = p.alcohol > 14 ? 0.3 : p.alcohol > 10 ? 0.15 : 0;
    const lateFatigue = minute > 70 ? 0.2 : 0;

    const decay = 0.5 + staminaFactor * 0.8 + alcoholPenalty + lateFatigue;
    p.condition = round2(Math.max(0, p.condition - decay));
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

  // Track cards per player to avoid double yellow → red
  const yellowCards = new Set<number>();
  const redCards = new Set<number>();

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
    if (p.discipline <= 4 && rng.random() < 0.15) {
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
    const chanceProb = calcChanceProb(attacking, defending, weather);
    // Reduce chance probability when condition is low
    const conditionMod = Math.max(0.5, teamAvg(attacking.lineup, "condition") / 100);
    const adjustedChanceProb = chanceProb * conditionMod;

    if (rng.random() < adjustedChanceProb) {
      const attacker = pickAttacker(rng, attacking.lineup);
      const gk = getGK(defending.lineup);
      const defAvg = teamAvg(defending.lineup.filter((p) => p.position === "DEF"), "defense");
      const goalProb = calcGoalProb(attacker, gk, defAvg);

      if (rng.random() < goalProb) {
        // GOAL!
        if (isHomePossession) homeScore++; else awayScore++;
        addEvent(minute, "goal", attacker, attacking.teamId,
          `Gól! ${playerName(attacker)} skóruje`,
          `${homeScore}:${awayScore}`);

        // Morale boost for scoring team
        for (const p of attacking.lineup) p.morale = Math.min(100, p.morale + 5);
        for (const p of defending.lineup) p.morale = Math.max(0, p.morale - 3);
      } else {
        // Missed chance
        const outcomes = ["vedle", "břevno", "tyč", "chytil brankář", "zblokováno"];
        const outcome = rng.pick(outcomes);
        addEvent(minute, "chance", attacker, attacking.teamId,
          `Šance! ${playerName(attacker)} — ${outcome}`,
          outcome);
      }
    }

    // Check for foul (~5% per minute)
    if (rng.random() < 0.05) {
      const defenders = defending.lineup.filter((p) => p.position !== "GK");
      if (defenders.length > 0) {
        const fouler = rng.pick(defenders);
        const temperFactor = fouler.temper / 20;
        const disciplineFactor = (20 - fouler.discipline) / 20;

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
            // Remove from lineup
            const idx = defending.lineup.indexOf(fouler);
            if (idx >= 0) defending.lineup.splice(idx, 1);
          } else {
            yellowCards.add(fouler.id);
            addEvent(minute, "card", fouler, defending.teamId,
              `Žlutá karta pro ${playerName(fouler)}`,
              "yellow");
          }
        }
      }
    }

    // Check for injury (~1% per minute, modified by weather)
    const injuryProb = 0.01 * WEATHER_MODS[weather].injuryMod;
    if (rng.random() < injuryProb) {
      const allPlayers = [...home.lineup, ...away.lineup];
      const unlucky = rng.pick(allPlayers);
      const teamId = home.lineup.includes(unlucky) ? home.teamId : away.teamId;
      const injuries = ["natažený sval", "podvrtnutý kotník", "křeče", "koleno", "naraženina"];
      const injury = rng.pick(injuries);
      addEvent(minute, "injury", unlucky, teamId,
        `${playerName(unlucky)} — ${injury}`,
        injury);

      // Try substitution
      const team = teamId === home.teamId ? home : away;
      if (team.subs.length > 0) {
        const sub = team.subs.shift()!;
        const idx = team.lineup.indexOf(unlucky);
        if (idx >= 0) {
          team.lineup[idx] = sub;
          addEvent(minute, "substitution", sub, teamId,
            `Střídání: ${playerName(sub)} za ${playerName(unlucky)}`);
        }
      }
    }

    // Special events for okresní fotbal (~2% per minute)
    if (rng.random() < 0.02) {
      const allPlayers = [...home.lineup, ...away.lineup];
      const player = rng.pick(allPlayers);
      const teamId = home.lineup.includes(player) ? home.teamId : away.teamId;

      const specialRoll = rng.random();

      if (specialRoll < 0.25 && player.condition < 30) {
        // Player exhausted
        addEvent(minute, "special", player, teamId,
          `${playerName(player)} se drží za kolena a nemůže dál`,
          "exhausted");
      } else if (specialRoll < 0.45 && player.temper >= 14) {
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
      } else if (specialRoll < 0.55 && player.alcohol >= 15) {
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
        if (gk.goalkeeping <= 8) {
          addEvent(minute, "special", gk, teamId,
            `${playerName(gk)} předvedl zákrok sezóny!`,
            "gk_hero");
        }
      }
    }

    // Half-time event
    if (minute === 45) {
      const p = rng.pick(home.lineup);
      addEvent(45, "special", p, home.teamId,
        `Poločas ${homeScore}:${awayScore}`,
        "half_time");
    }

    // Update condition
    updateCondition(home.lineup, minute);
    updateCondition(away.lineup, minute);
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
  };
}
