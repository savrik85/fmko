/**
 * Validace pokynů na lavičce před uložením do DB.
 *
 * Plán jde do enginu, kde už se nekontroluje — neplatná taktika nebo minuta mimo
 * rozsah by tam prošla tiše a projevila se až podivným průběhem zápasu. Proto se
 * všechno zachytí tady, na hranici API.
 *
 * Whitelisty se berou ze sdílených typů, ne z lokální kopie: `VALID_TACTICS`
 * v `routes/game.ts` je duplikát enginu a třetí kopie by se dřív nebo později
 * rozešla.
 */

import { logger } from "./logger";
import {
  PLAN_TACTICS, PLAN_HARDNESS, MAX_PLAN_RULES,
  PLAN_MINUTE_MIN, PLAN_MINUTE_MAX, PLAN_CONDITION_MIN, PLAN_CONDITION_MAX,
  type MatchPlan, type MatchPlanRule, type PlanTactic, type PlanHardness,
} from "@okresni-masina/shared";

export type PlanValidation =
  | { ok: true; plan: MatchPlan }
  | { ok: false; error: string };

interface PlanContextIds {
  /** ID hráčů v základní jedenáctce — odtud se smí střídat ven. */
  starterIds: Set<string>;
  /** ID všech hráčů kádru — střídající musí být z něj a mimo jedenáctku. */
  squadIds: Set<string>;
}

/**
 * Zkontroluje plán z těla requestu. `undefined` znamená „klient plán neposílá"
 * a vrací prázdný plán, ne chybu — starší verze webu o pokynech nevědí.
 */
export function validateMatchPlan(raw: unknown, ctx: PlanContextIds): PlanValidation {
  if (raw === undefined || raw === null) return { ok: true, plan: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "Pokyny na lavičce musí být seznam pravidel" };
  if (raw.length > MAX_PLAN_RULES) {
    return { ok: false, error: `Pokynů na lavičce může být nejvýš ${MAX_PLAN_RULES}` };
  }

  const plan: MatchPlan = [];
  const seenIds = new Set<string>();

  for (const [i, item] of raw.entries()) {
    const cislo = i + 1;
    if (typeof item !== "object" || item === null) {
      return { ok: false, error: `Pokyn ${cislo} má neplatný tvar` };
    }
    const rule = item as Partial<MatchPlanRule>;

    if (typeof rule.id !== "string" || rule.id.length === 0 || rule.id.length > 64) {
      return { ok: false, error: `Pokyn ${cislo} nemá platné id` };
    }
    if (seenIds.has(rule.id)) return { ok: false, error: `Pokyn ${cislo} má duplicitní id` };
    seenIds.add(rule.id);

    const minute = Number(rule.fromMinute);
    if (!Number.isInteger(minute) || minute < PLAN_MINUTE_MIN || minute > PLAN_MINUTE_MAX) {
      return { ok: false, error: `Pokyn ${cislo}: minuta musí být ${PLAN_MINUTE_MIN}–${PLAN_MINUTE_MAX}` };
    }

    const trigger = validateTrigger(rule.trigger, cislo);
    if ("error" in trigger) return { ok: false, error: trigger.error };

    const action = validateAction(rule.action, cislo, ctx);
    if ("error" in action) return { ok: false, error: action.error };

    plan.push({ id: rule.id, fromMinute: minute, trigger: trigger.value, action: action.value });
  }

  return { ok: true, plan };
}

type Checked<T> = { value: T } | { error: string };

function validateTrigger(raw: unknown, cislo: number): Checked<MatchPlanRule["trigger"]> {
  if (typeof raw !== "object" || raw === null) return { error: `Pokyn ${cislo}: chybí podmínka` };
  const t = raw as Record<string, unknown>;

  switch (t.kind) {
    case "minute":
      return { value: { kind: "minute" } };

    case "score": {
      if (t.state !== "losing" && t.state !== "drawing" && t.state !== "winning") {
        return { error: `Pokyn ${cislo}: neplatný stav zápasu` };
      }
      if (t.state === "drawing") return { value: { kind: "score", state: "drawing" } };
      const by = t.byAtLeast === undefined ? 1 : Number(t.byAtLeast);
      // Nad tři góly rozdílu se pravidlo v okresním fotbale prakticky nespustí.
      if (!Number.isInteger(by) || by < 1 || by > 3) {
        return { error: `Pokyn ${cislo}: rozdíl gólů musí být 1–3` };
      }
      return { value: { kind: "score", state: t.state, byAtLeast: by } };
    }

    case "men": {
      if (t.state !== "down" && t.state !== "up") {
        return { error: `Pokyn ${cislo}: neplatný početní stav` };
      }
      return { value: { kind: "men", state: t.state } };
    }

    case "condition": {
      const below = Number(t.below);
      if (!Number.isInteger(below) || below < PLAN_CONDITION_MIN || below > PLAN_CONDITION_MAX) {
        return { error: `Pokyn ${cislo}: kondice musí být ${PLAN_CONDITION_MIN}–${PLAN_CONDITION_MAX}` };
      }
      return { value: { kind: "condition", below } };
    }

    default:
      return { error: `Pokyn ${cislo}: neznámá podmínka` };
  }
}

function validateAction(raw: unknown, cislo: number, ctx: PlanContextIds): Checked<MatchPlanRule["action"]> {
  if (typeof raw !== "object" || raw === null) return { error: `Pokyn ${cislo}: chybí akce` };
  const a = raw as Record<string, unknown>;

  switch (a.kind) {
    case "tactic": {
      if (!PLAN_TACTICS.includes(a.tactic as PlanTactic)) {
        return { error: `Pokyn ${cislo}: neplatná taktika` };
      }
      return { value: { kind: "tactic", tactic: a.tactic as PlanTactic } };
    }

    case "hardness": {
      if (!PLAN_HARDNESS.includes(a.hardness as PlanHardness)) {
        return { error: `Pokyn ${cislo}: neplatná tvrdost hry` };
      }
      return { value: { kind: "hardness", hardness: a.hardness as PlanHardness } };
    }

    case "sub": {
      const out = a.outPlayerId;
      const inn = a.inPlayerId;
      if (typeof out !== "string" || typeof inn !== "string") {
        return { error: `Pokyn ${cislo}: střídání musí mít oba hráče` };
      }
      if (out === inn) return { error: `Pokyn ${cislo}: hráč nemůže střídat sám sebe` };
      if (!ctx.starterIds.has(out)) {
        return { error: `Pokyn ${cislo}: střídaný hráč není v základní sestavě` };
      }
      if (!ctx.squadIds.has(inn)) {
        return { error: `Pokyn ${cislo}: střídající hráč není v kádru` };
      }
      if (ctx.starterIds.has(inn)) {
        return { error: `Pokyn ${cislo}: střídající hráč už je v základní sestavě` };
      }
      return { value: { kind: "sub", outPlayerId: out, inPlayerId: inn } };
    }

    default:
      return { error: `Pokyn ${cislo}: neznámá akce` };
  }
}

/** Bezpečné načtení plánu z DB sloupce — poškozené JSON nesmí shodit zápas. */
export function parseStoredPlan(rawColumn: string | null | undefined): MatchPlan {
  if (!rawColumn) return [];
  try {
    const parsed = JSON.parse(rawColumn);
    return Array.isArray(parsed) ? parsed as MatchPlan : [];
  } catch (e) {
    logger.warn({ module: "match-plan" }, "nečitelný plán v DB, hraje se bez pokynů", e);
    return [];
  }
}
