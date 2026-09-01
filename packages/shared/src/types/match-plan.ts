/**
 * Pokyny na lavičce — přednastavené scénáře zápasu.
 *
 * Manažer zadá pravidla „podmínka → akce", engine je v minutové smyčce
 * vyhodnocuje a mění taktiku, tvrdost hry nebo střídá.
 *
 * Typy i whitelisty žijí tady, protože je čte engine (simulace), API (validace
 * uloženého plánu) i web (formulář). Dřív existoval `VALID_TACTICS` zvlášť
 * v `routes/game.ts` a `Tactic` zvlášť v enginu; třetí kopie by se rozešla.
 */

export const PLAN_TACTICS = ["offensive", "balanced", "defensive", "long_ball", "possession", "pressing"] as const;
export type PlanTactic = typeof PLAN_TACTICS[number];

export const PLAN_HARDNESS = ["fair", "normal", "hard"] as const;
export type PlanHardness = typeof PLAN_HARDNESS[number];

/** Nejvýš tolik pravidel na plán. Víc už se na mobilu nedá přehlédnout. */
export const MAX_PLAN_RULES = 5;

/** Kondice, pod kterou smí spouštěč `condition` reagovat. Nad 60 by sepnul skoro vždy. */
export const PLAN_CONDITION_MIN = 10;
export const PLAN_CONDITION_MAX = 60;

export type PlanTrigger =
  /** Stav zápasu z pohledu vlastního týmu. `byAtLeast` = rozdíl gólů (default 1). */
  | { kind: "score"; state: "losing" | "drawing" | "winning"; byAtLeast?: number }
  /** Bez další podmínky — rozhoduje jen `fromMinute`. */
  | { kind: "minute" }
  /** Početní stav na hřišti po červených kartách. */
  | { kind: "men"; state: "down" | "up" }
  /** Kondice pod hranicí. U střídání se týká střídaného hráče, jinak kohokoli v poli. */
  | { kind: "condition"; below: number };

export type PlanTriggerKind = PlanTrigger["kind"];

export type PlanAction<PlayerId = string> =
  | { kind: "tactic"; tactic: PlanTactic }
  | { kind: "hardness"; hardness: PlanHardness }
  | { kind: "sub"; outPlayerId: PlayerId; inPlayerId: PlayerId };

export type PlanActionKind = PlanAction["kind"];

/**
 * Jedno pravidlo plánu. `PlayerId` je v DB a API string (UUID hráče),
 * v enginu number (engine ID) — převod dělá match-runner stejně jako u kapitána.
 */
export interface MatchPlanRule<PlayerId = string> {
  id: string;
  /** 1–90. Dřív než tuhle minutu pravidlo nesepne. */
  fromMinute: number;
  trigger: PlanTrigger;
  action: PlanAction<PlayerId>;
}

export type MatchPlan<PlayerId = string> = MatchPlanRule<PlayerId>[];

export const PLAN_MINUTE_MIN = 1;
export const PLAN_MINUTE_MAX = 90;

/**
 * Názvy voleb v češtině. Znění se shoduje s přepínači na stránce sestavy
 * (`TACTIC_INFO`, `HARDNESS`) — engine je používá do popisu události v zápase,
 * takže „Pokyn z lavičky: Vysoký presink" sedí na to, co si manažer naklikal.
 */
export const PLAN_TACTIC_LABELS: Record<PlanTactic, string> = {
  offensive: "Útočná",
  balanced: "Vyrovnaná",
  defensive: "Defenzivní",
  long_ball: "Nakopávané",
  possession: "Držení míče",
  pressing: "Vysoký presink",
};

export const PLAN_HARDNESS_LABELS: Record<PlanHardness, string> = {
  fair: "Na férovku",
  normal: "Normálně",
  hard: "Do těla",
};
