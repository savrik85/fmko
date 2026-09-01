/**
 * Pokyny na lavičce — vyhodnocení přednastavených scénářů za běhu zápasu.
 *
 * Manažer uloží k sestavě pravidla „podmínka → akce"; simulace je v minutové
 * smyčce vyhodnotí a podle nich přepne taktiku, tvrdost hry nebo vystřídá.
 *
 * Vyhodnocení je záměrně čistá funkce bez přístupu ke stavu simulace — provedení
 * akce (mutace `TeamSetup`, zápis události) zůstává v `simulation.ts`, kde na to
 * jsou pohromadě všechny potřebné proměnné.
 *
 * Tvar pravidel je sdílený s API a webem (`@okresni-masina/shared`), jen ID hráčů
 * jsou tady engine ID (number) místo databázových UUID — převod dělá match-runner
 * stejně jako u kapitána a exekutorů standardek.
 */

import type { MatchPlanRule } from "@okresni-masina/shared";
import type { MatchPlayer } from "./types";

export type EngineMatchPlanRule = MatchPlanRule<number>;
export type EngineMatchPlan = EngineMatchPlanRule[];

export interface PlanContext {
  minute: number;
  /** Skóre z pohledu týmu, kterému plán patří. */
  ownScore: number;
  oppScore: number;
  /** Počet hráčů na hřišti po vyloučeních — rozhoduje o oslabení a přesilovce. */
  ownOnPitch: number;
  oppOnPitch: number;
  /** Aktuální jedenáctka vlastního týmu (po dosavadních střídáních). */
  lineup: MatchPlayer[];
}

/**
 * Splňuje pravidlo v tuhle minutu svoji podmínku?
 *
 * Jednorázovost (pravidlo sepne nejvýš jednou za zápas) tady záměrně není —
 * to je stav běhu, drží ho simulace.
 */
export function ruleMatches(rule: EngineMatchPlanRule, ctx: PlanContext): boolean {
  if (ctx.minute < rule.fromMinute) return false;

  const trigger = rule.trigger;
  switch (trigger.kind) {
    case "minute":
      return true;

    case "score": {
      const diff = ctx.ownScore - ctx.oppScore;
      // Rozdíl menší než gól nedává smysl; "o 0 gólů" je remíza, na to je vlastní stav.
      const by = Math.max(1, Math.round(trigger.byAtLeast ?? 1));
      if (trigger.state === "drawing") return diff === 0;
      if (trigger.state === "losing") return -diff >= by;
      return diff >= by;
    }

    case "men": {
      const diff = ctx.ownOnPitch - ctx.oppOnPitch;
      return trigger.state === "down" ? diff < 0 : diff > 0;
    }

    case "condition": {
      // U střídání se únava měří na tom, koho má pravidlo stáhnout — jinak by
      // „když je někdo unavený, stáhni Nováka" stáhlo Nováka kvůli cizí únavě.
      // U změny taktiky se měří na komkoli v poli; brankář se nepočítá, ten
      // kondici skoro neztrácí a spustil by pravidlo leda omylem.
      const action = rule.action;
      const watched = action.kind === "sub"
        ? ctx.lineup.filter((p) => p.id === action.outPlayerId)
        : ctx.lineup.filter((p) => (p.matchPosition ?? p.position) !== "GK");
      return watched.some((p) => p.condition < trigger.below);
    }
  }
}

/** Kolik dosud nesepnutých pravidel plánu si nárokuje střídací slot. */
export function pendingPlannedSubs(plan: EngineMatchPlan | undefined, fired: ReadonlySet<string>): number {
  return plannedSubPlayers(plan, fired).outgoing.size;
}

/**
 * Hráči, které si drží dosud nesepnutá plánovaná střídání.
 *
 * Rezervovat samotný počet slotů nestačí: automatika asistenta si jinak z lavičky
 * vezme přesně toho hráče, kterého má podle plánu poslat na hřiště manažer, a
 * pokyn pak propadne, i když volný slot zbyl. Stejně tak nesmí sama stáhnout
 * hráče, kterého má plán teprve vystřídat.
 */
export function plannedSubPlayers(
  plan: EngineMatchPlan | undefined,
  fired: ReadonlySet<string>,
): { incoming: Set<number>; outgoing: Set<number> } {
  const incoming = new Set<number>();
  const outgoing = new Set<number>();
  for (const rule of plan ?? []) {
    if (rule.action.kind !== "sub" || fired.has(rule.id)) continue;
    incoming.add(rule.action.inPlayerId);
    outgoing.add(rule.action.outPlayerId);
  }
  return { incoming, outgoing };
}
