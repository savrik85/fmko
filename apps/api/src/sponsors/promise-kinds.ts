/**
 * Druhy slibů, které klub dává sponzorovi při jednání. Klíče i tvar `params` čte
 * i vyhodnocení slibů (etapa 3) ze sloupce sponsor_promises.params, neměnit bez migrace dat.
 *
 * params podle druhu:
 *   league_position {position}   promotion {}            no_relegation {}
 *   cup_round {round}            coach_licence {level}   stadium_upgrade {facility, level}
 *   jersey_logo {}               sector_exclusivity {sector}
 *   attendance {attendance}      youth {count}           reputation {reputation}
 *   no_riots {}
 */
export const PROMISE_KINDS = [
  "league_position", "promotion", "no_relegation", "cup_round", "coach_licence", "stadium_upgrade",
  "jersey_logo", "sector_exclusivity", "attendance", "youth", "reputation", "no_riots",
] as const;
export type PromiseKind = (typeof PROMISE_KINDS)[number];

export function isPromiseKind(v: unknown): v is PromiseKind {
  return typeof v === "string" && (PROMISE_KINDS as readonly string[]).includes(v);
}

export interface PromiseParams {
  position?: number;
  round?: number;
  level?: number;
  facility?: string;
  sector?: string;
  attendance?: number;
  count?: number;
  reputation?: number;
}

export interface PromiseSpec {
  kind: PromiseKind;
  params: PromiseParams;
}

/** Sezónní sliby platí až od příští sezóny, jeden řádek za každou sezónu smlouvy od N+1. */
export const SEASONAL_KINDS: ReadonlySet<PromiseKind> = new Set<PromiseKind>([
  "league_position", "promotion", "no_relegation", "cup_round", "attendance", "youth", "reputation", "no_riots",
]);

/** Termínové sliby platí hned a mají termín splnění. */
export const DEADLINE_KINDS: ReadonlySet<PromiseKind> = new Set<PromiseKind>(["coach_licence", "stadium_upgrade", "jersey_logo"]);

/** „Výsledky nad nesestup": opatrnému majiteli jsou jedno. */
export const RESULT_KINDS: ReadonlySet<PromiseKind> = new Set<PromiseKind>(["league_position", "promotion", "cup_round"]);

/** Základ hodnoty slibu jako podíl rozpočtu B. Licence a stavba se násobí počtem stupňů (negotiation.ts). */
export const PROMISE_BASE_SHARE: Record<PromiseKind, number> = {
  league_position: 0.15,
  promotion: 0.20,
  no_relegation: 0.08,
  cup_round: 0.08,
  coach_licence: 0.05,
  stadium_upgrade: 0.05,
  jersey_logo: 0.10,
  sector_exclusivity: 0.05,
  // 7,5 % × ambice 0,67 až 1,33 = 5 až 10 % podle toho, jak vysoko je cíl proti minulé sezóně.
  attendance: 0.075,
  youth: 0.05,
  reputation: 0.05,
  no_riots: 0.05,
};

/** Velké stavby: slib jejich modernizace má dvojnásobný základ za úroveň. */
export const BIG_FACILITIES: ReadonlySet<string> = new Set(["stands", "lighting", "roof"]);

/** Termín termínových slibů: 16 herních týdnů od podpisu. */
export const PROMISE_DEADLINE_DAYS = 112;

/** Vybavení, které může sponzor klubu koupit o úroveň výš. */
export const EQUIPMENT_GIFTS: readonly string[] = ["balls", "jerseys"];
