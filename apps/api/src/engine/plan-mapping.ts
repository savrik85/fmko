/**
 * Převod pokynů na lavičce z databázového tvaru do enginu.
 *
 * V databázi jsou hráči UUID, v enginu čísla přidělená při stavbě sestavy —
 * stejný rozdíl, jaký už řeší kapitán (`captain_id`) a exekutoři standardek.
 *
 * Pravidlo, jehož hráč do zápasu vůbec nenastoupil (omluvenka, zranění, stopka),
 * se zahodí rovnou tady. Engine by ho stejně nedokázal provést a rezervovalo by
 * zbytečně střídací slot, na který by asistent celý zápas nesměl sáhnout.
 */

import { parseStoredPlan } from "../lib/match-plan-validation";
import type { EngineMatchPlan } from "./match-plan";

/** DB ID hráče → engine ID. `idMap` je engine ID → DB ID, takže se hledá zpětně. */
function engineIdOf(idMap: Map<number, string>, dbId: string): number | undefined {
  for (const [engineId, mapped] of idMap) {
    if (mapped === dbId) return engineId;
  }
  return undefined;
}

export function toEnginePlan(idMap: Map<number, string>, rawColumn: string | null | undefined): EngineMatchPlan {
  const stored = parseStoredPlan(rawColumn);
  const plan: EngineMatchPlan = [];

  for (const rule of stored) {
    if (rule.action.kind !== "sub") {
      plan.push({ id: rule.id, fromMinute: rule.fromMinute, trigger: rule.trigger, action: rule.action });
      continue;
    }
    const out = engineIdOf(idMap, rule.action.outPlayerId);
    const inn = engineIdOf(idMap, rule.action.inPlayerId);
    if (out === undefined || inn === undefined) continue;
    plan.push({
      id: rule.id,
      fromMinute: rule.fromMinute,
      trigger: rule.trigger,
      action: { kind: "sub", outPlayerId: out, inPlayerId: inn },
    });
  }

  return plan;
}
