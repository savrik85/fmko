/**
 * Pokyny na lavičce a vybraná lavička musí sedět na sestavu, se kterou se zápas hraje.
 *
 * Sestava se ale mění i bez manažera: automat nahradí omluvené, hráč mezitím odejde
 * z klubu. Uložený pokyn nebo náhradník pak odkazuje na někoho, kdo nehraje, a API
 * takovou sestavu při uložení odmítne. Pravidla jsou stejná jako validace při uložení
 * (apps/api/src/lib/match-plan-validation.ts a lineup-bench.ts), čte je API i web.
 */

import type { MatchPlan, MatchPlanRule } from "./match-plan";

export interface LineupIds {
  /** Základní jedenáctka. */
  starterIds: ReadonlySet<string>;
  /** Kádr, ze kterého smí přijít náhradník. */
  squadIds: ReadonlySet<string>;
}

/** Proč střídání na sestavu nesedí. */
export type SubMismatch = "out_not_starting" | "in_not_in_squad" | "in_already_starting";

function subMismatch(rule: MatchPlanRule, lineup: LineupIds): SubMismatch | null {
  if (rule.action.kind !== "sub") return null;
  if (!lineup.starterIds.has(rule.action.outPlayerId)) return "out_not_starting";
  if (!lineup.squadIds.has(rule.action.inPlayerId)) return "in_not_in_squad";
  if (lineup.starterIds.has(rule.action.inPlayerId)) return "in_already_starting";
  return null;
}

/** Rozdělí plán na pokyny, které na sestavu sedí, a zrušená střídání i s důvodem. */
export function splitPlanByLineup(
  plan: MatchPlan,
  lineup: LineupIds,
): { kept: MatchPlan; dropped: Array<{ rule: MatchPlanRule; reason: SubMismatch }> } {
  const kept: MatchPlan = [];
  const dropped: Array<{ rule: MatchPlanRule; reason: SubMismatch }> = [];
  for (const rule of plan) {
    const reason = subMismatch(rule, lineup);
    if (reason) dropped.push({ rule, reason });
    else kept.push(rule);
  }
  return { kept, dropped };
}

/** Lavička bez hráčů ze základu a bez těch, kdo v kádru nejsou. `null` (vybírá automat) zůstává. */
export function benchForLineup(bench: readonly string[] | null, lineup: LineupIds): string[] | null {
  if (!bench) return null;
  return bench.filter((id) => lineup.squadIds.has(id) && !lineup.starterIds.has(id));
}
