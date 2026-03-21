/**
 * FMK-52: Denní tick — automatická simulace mezi zápasy.
 *
 * Spouští se cron triggerem v 4:00 CET každý den.
 * Zpracovává: trénink, regeneraci, eventy, decay skillů.
 */

import type { Rng } from "../generators/rng";

export interface DailyTickResult {
  trainingResults: string[];
  events: string[];
  recoveries: string[];
  decays: string[];
}

export interface DailyTickContext {
  teamId: string;
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
  hasMatchToday: boolean;
  lastMatchResult?: "win" | "draw" | "loss";
}

/**
 * Process a daily tick for a team.
 * This is a high-level orchestrator — each sub-system
 * has its own detailed logic in respective modules.
 */
export function processDailyTick(
  rng: Rng,
  ctx: DailyTickContext,
): DailyTickResult {
  const result: DailyTickResult = {
    trainingResults: [],
    events: [],
    recoveries: [],
    decays: [],
  };

  // No training on match days
  if (ctx.hasMatchToday) {
    result.trainingResults.push("Dnes se nehraje — zápasový den.");
    return result;
  }

  // Training happens Mon-Fri (not weekends except if no match)
  const isTrainingDay = ctx.dayOfWeek >= 1 && ctx.dayOfWeek <= 5;
  if (isTrainingDay) {
    result.trainingResults.push("Trénink proběhl dle plánu.");
    // Actual skill changes handled by skills/training.ts
  }

  // Injury recovery (countdown -1)
  result.recoveries.push("Zranění hráčů: countdown -1 den.");

  // Condition recovery (post-match)
  result.recoveries.push("Kondice hráčů se regeneruje.");

  // Morale drift (slowly toward 50)
  result.decays.push("Morálka se pomalu vrací k neutrální.");

  // Random event chance (~10% per day)
  if (rng.random() < 0.10) {
    const eventTypes = [
      "Hráč se zranil při práci na zahradě.",
      "Sponzor se ozval s novou nabídkou.",
      "V obci se mluví o víkendovém zápase.",
      "Trenér mládeže hlásí nadějného dorostence.",
    ];
    result.events.push(rng.pick(eventTypes));
  }

  return result;
}
