/**
 * Jednání se sponzorem na webu: tvar API (apps/api/src/sponsors/negotiation-db.ts, NegotiationView)
 * a náhled odhadu ochoty a ceny požadavků pro formulář. Náhled jen radí, rozhoduje server.
 */

export type PromiseKind =
  | "league_position" | "promotion" | "no_relegation" | "cup_round" | "coach_licence" | "stadium_upgrade"
  | "jersey_logo" | "sector_exclusivity" | "attendance" | "youth" | "reputation" | "no_riots";

export interface PromiseParams {
  position?: number; round?: number; level?: number; facility?: string; sector?: string;
  attendance?: number; count?: number; reputation?: number;
}
export interface PromiseSpec { kind: PromiseKind; params: PromiseParams }

export interface Demands {
  monthly: number;
  winBonus: number;
  signingBonus: number;
  goalBonuses: Partial<Record<PromiseKind, number>>;
  construction: string | null;
  equipment: string | null;
  payCurrentFee: boolean;
}
export interface Proposal { seasons: number; promises: PromiseSpec[]; demands: Demands }

export interface Range { low: number; high: number }
export interface PromiseOption {
  kind: PromiseKind; params: PromiseParams; label: string; seasonal: boolean; value: Range; penalty: Range;
  /** Jde k tomuhle slibu sjednat bonus za splnění (server: GOAL_BONUS_KINDS)? Bez toho vstup nenabízet. */
  goalBonus: boolean;
  chance: number;
}
export interface GiftOption { key: string; label: string; level: number; cost: number }

export type ResponseKind = "offer" | "accept" | "counter_money" | "counter_wish" | "reject" | "insulted" | "walked_away";
/** Odpovědi, ve kterých majitel sám dává podmínky (response.counter): úvodní nabídka a protinabídky. */
export const OWNER_OFFER_KINDS: readonly ResponseKind[] = ["offer", "counter_money", "counter_wish"];
export interface NegotiationRound {
  /** U úvodní nabídky majitele (kind "offer") totéž co counter, klub nic nenavrhl. */
  proposal: Proposal;
  response: {
    kind: ResponseKind; text: string; counter?: Proposal; wish?: PromiseKind; gameDate: string;
    /** Kolo odmítnutí bylo zároveň urážkou. U "walked_away" pak platí obě pokuty náklonnosti (−3 i −5). */
    insulted?: boolean;
  };
}
export interface PromiseRowView {
  kind: PromiseKind; params: PromiseParams; label: string; season: number | null; deadlineGameDate: string | null;
  reward: number; penalty: number;
}
export type NegotiationStatus = "open" | "accepted" | "walked_away" | "expired" | "signed";

export interface NegotiationView {
  id: string;
  sponsorId: number;
  sponsorName: string;
  sponsorType: string;
  category: "main" | "stadium";
  status: NegotiationStatus;
  isRenewal: boolean;
  owner: { firstName: string; lastName: string; personality: string; faceConfig: Record<string, unknown> };
  favor: number;
  wishes: PromiseKind[];
  patience: number;
  expiresGameDate: string;
  cooldownUntil: string | null;
  estimate: { base: Range; cap: Range; cautiousSeasonBonus: number };
  winBonusFactor: number;
  monthsPerSeason: number;
  /** Skutečná délka smlouvy v měsících od dneška do konce poslední sezóny, index 0 = 1 sezóna (server: effectiveContractMonths). */
  contractMonths: number[];
  /** Délky smlouvy v sezónách, které jde teď podepsat. Na konci sezóny chybí 1 sezóna (server: allowedContractSeasons). */
  allowedSeasons?: number[];
  catalog: PromiseOption[];
  construction: GiftOption[];
  equipment: GiftOption[];
  /**
   * `clawback`: nesplacená záloha současné smlouvy, kterou klub při podpisu vrací (i při prodloužení).
   * `forfeitPenalty`: pokuty za sliby současné smlouvy, které při přechodu k jiné firmě propadnou (u prodloužení 0).
   * `terminationFee` je 0 u legacy smlouvy (`isLegacy`, bez jednání): přechod od ní je zdarma.
   */
  current: null | {
    sponsorName: string; monthlyAmount: number; winBonus: number; seasonsRemaining: number; terminationFee: number; sameSponsor: boolean;
    clawback: number; forfeitPenalty?: number; isLegacy: boolean;
  };
  rounds: NegotiationRound[];
  pending: null | {
    proposal: Proposal; promises: PromiseRowView[]; terminationFee: number; constructionCost: number;
    equipmentCost: number; currentFee: number; renamesClub: boolean; reputationPenalty: number;
  };
  season: number;
}

/** Dostupnost jednání z GET /api/sponsors/:id (myTeam.negotiation). */
export interface NegotiationAvailability { canOpen: boolean; reason: string | null; isRenewal: boolean; openId: string | null }

export const PROMISE_ORDER: readonly PromiseKind[] = [
  "league_position", "promotion", "no_relegation", "cup_round", "coach_licence", "stadium_upgrade",
  "jersey_logo", "sector_exclusivity", "attendance", "youth", "reputation", "no_riots",
];

export const PROMISE_LABELS: Record<PromiseKind, string> = {
  league_position: "Umístění v lize",
  promotion: "Postup",
  no_relegation: "Nesestup",
  cup_round: "Pohár",
  coach_licence: "Trenérská licence",
  stadium_upgrade: "Modernizace stadionu",
  jersey_logo: "Logo na rukávu",
  sector_exclusivity: "Exkluzivita oboru",
  attendance: "Návštěva",
  youth: "Mladí hráči",
  reputation: "Reputace",
  no_riots: "Klid na tribunách",
};

/** Kdy slib platí (shodně s promise-kinds.ts na API). */
export const PROMISE_TIMING: Record<PromiseKind, string> = {
  league_position: "každou sezónu od příští",
  promotion: "každou sezónu od příští",
  no_relegation: "každou sezónu od příští",
  cup_round: "každou sezónu od příští",
  coach_licence: "do 16 týdnů",
  stadium_upgrade: "do 16 týdnů",
  jersey_logo: "do 16 týdnů",
  sector_exclusivity: "po celou smlouvu",
  attendance: "každou sezónu od příští",
  youth: "každou sezónu od příští",
  reputation: "každou sezónu od příští",
  no_riots: "každou sezónu od příští",
};

export const RESPONSE_LABELS: Record<ResponseKind, string> = {
  offer: "Úvodní nabídka majitele",
  accept: "Přijal",
  counter_money: "Protinabídka",
  counter_wish: "Protinabídka za slib",
  reject: "Odmítl",
  insulted: "Odmítl a urazil se",
  walked_away: "Odešel od jednání",
};

/** Klíč parametrů slibu. Parametry vždy kopírujeme z katalogu serveru, pořadí klíčů tedy sedí. */
export function optionKey(params: PromiseParams): string {
  return JSON.stringify(params);
}

export function findOption(view: NegotiationView, spec: PromiseSpec): PromiseOption | undefined {
  const key = optionKey(spec.params);
  return view.catalog.find((o) => o.kind === spec.kind && optionKey(o.params) === key);
}

/** Odhad ochoty s vybranými sliby: rozmezí se sčítá lineárně (každá položka má stejnou šířku). */
export function estimateRange(view: NegotiationView, promises: PromiseSpec[], seasons: number): Range {
  let low = view.estimate.base.low;
  let high = view.estimate.base.high;
  for (const p of promises) {
    const o = findOption(view, p);
    if (o) { low += o.value.low; high += o.value.high; }
  }
  const mult = 1 + view.estimate.cautiousSeasonBonus * (seasons - 1);
  return {
    low: Math.min(view.estimate.cap.low, Math.round(low * mult)),
    high: Math.min(view.estimate.cap.high, Math.round(high * mult)),
  };
}

/**
 * Skutečná délka smlouvy v měsících (od dneška do konce poslední sezóny), přesně to číslo, se kterým
 * počítá server. Smlouva podepsaná pozdě v sezóně je o uplynulou část sezóny kratší.
 */
export function contractMonthsOf(view: NegotiationView, seasons: number): number {
  return view.contractMonths[seasons - 1] ?? Math.max(1, seasons * view.monthsPerSeason);
}

/** Kolik návrh sponzora stojí měsíčně, stejný vzorec jako costBreakdown na API. */
export function previewCost(view: NegotiationView, p: Proposal): number {
  const m = contractMonthsOf(view, p.seasons);
  const d = p.demands;
  let cost = d.monthly + d.winBonus * view.winBonusFactor + d.signingBonus / m;
  for (const spec of p.promises) {
    const g = d.goalBonuses[spec.kind] ?? 0;
    const o = findOption(view, spec);
    if (g > 0 && o) cost += (g * o.chance * (o.seasonal ? Math.max(0, p.seasons - 1) : 1)) / m;
  }
  if (d.construction) cost += (view.construction.find((x) => x.key === d.construction)?.cost ?? 0) / m;
  if (d.equipment) cost += (view.equipment.find((x) => x.key === d.equipment)?.cost ?? 0) / m;
  if (d.payCurrentFee && view.current && !view.current.sameSponsor) cost += view.current.terminationFee / m;
  return Math.round(cost);
}

/** Délky smlouvy, které jde teď podepsat (starší API je neposílá, pak 1 až 3 sezóny). */
export function allowedSeasonsOf(view: NegotiationView): number[] {
  return view.allowedSeasons && view.allowedSeasons.length > 0 ? view.allowedSeasons : [1, 2, 3];
}

/** Klíč množiny slibů pro porovnání bez ohledu na pořadí (server je ukládá v pořadí, v jakém přišly). */
function promiseSetKey(promises: PromiseSpec[]): string {
  return promises.map((p) => `${p.kind}:${optionKey(p.params)}`).sort().join("|");
}

/** Klíč bonusů za splnění bez nulových položek (server je taky zahazuje), pro porovnání bez ohledu na pořadí klíčů. */
function goalBonusesKey(goalBonuses: Partial<Record<PromiseKind, number>>): string {
  return Object.entries(goalBonuses)
    .filter(([, v]) => (v ?? 0) !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join("|");
}

/**
 * Shoduje se návrh s podmínkami k podpisu (pending.proposal)? Endpoint /accept podepisuje
 * pendingTerms na serveru, ne rozpracovaný formulář, proto tlačítko Podepsat smí jít zobrazit
 * jen tehdy, když se draft s podmínkami k podpisu shoduje – jinak by hráč podepsal něco jiného,
 * než co vidí ve formuláři.
 */
export function proposalsEqual(a: Proposal, b: Proposal): boolean {
  if (a.seasons !== b.seasons) return false;
  if (promiseSetKey(a.promises) !== promiseSetKey(b.promises)) return false;
  const da = a.demands;
  const db = b.demands;
  return (
    da.monthly === db.monthly
    && da.winBonus === db.winBonus
    && da.signingBonus === db.signingBonus
    && da.construction === db.construction
    && da.equipment === db.equipment
    && da.payCurrentFee === db.payCurrentFee
    && goalBonusesKey(da.goalBonuses) === goalBonusesKey(db.goalBonuses)
  );
}

/**
 * Výchozí formulář: podmínky k podpisu (pending.proposal), když jsou na stole — otevřené jednání
 * s nabídkou majitele, i přijaté (view.status "accepted") — jinak prázdný návrh. Bez withSeasons:
 * pending.proposal je hotový návrh spočítaný serverem, pozdější posun allowedSeasons (konec sezóny)
 * by mu jinak zvedl počet sezón a rozbil shodu s pending.proposal (server podepisuje uložené
 * podmínky s postupem sezóny z chvíle, kdy vznikly).
 */
export function initialDraft(view: NegotiationView): Proposal {
  return view.pending?.proposal ?? emptyProposal(view);
}

export function emptyProposal(view: NegotiationView): Proposal {
  const allowed = allowedSeasonsOf(view);
  return {
    seasons: allowed.includes(2) ? 2 : allowed[0],
    promises: [],
    demands: {
      monthly: Math.max(100, Math.round(view.estimate.base.low / 100) * 100),
      winBonus: 0, signingBonus: 0, goalBonuses: {}, construction: null, equipment: null, payCurrentFee: false,
    },
  };
}

/**
 * Sezónní sliby u smlouvy na 1 sezónu nejdou: při zkrácení je z návrhu vyhodíme i s bonusy.
 * Délka, kterou teď podepsat nejde (1 sezóna na konci sezóny), se posune na nejkratší povolenou.
 */
export function withSeasons(view: NegotiationView, p: Proposal, requested: number): Proposal {
  const allowed = allowedSeasonsOf(view);
  const seasons = allowed.includes(requested) ? requested : allowed.find((n) => n > requested) ?? allowed[allowed.length - 1];
  if (seasons >= 2) return { ...p, seasons };
  const keep = p.promises.filter((s) => !findOption(view, s)?.seasonal);
  const kinds = new Set(keep.map((s) => s.kind));
  const goalBonuses = Object.fromEntries(Object.entries(p.demands.goalBonuses).filter(([k]) => kinds.has(k as PromiseKind)));
  return { ...p, seasons, promises: keep, demands: { ...p.demands, goalBonuses } };
}

export function categoryLabel(c: "main" | "stadium"): string {
  return c === "main" ? "Hlavní sponzor" : "Název stadionu";
}

/**
 * Jednorázové peníze návrhu v Kč (podpis, stavba, vybavení, doplacená stará pokuta, bonusy za
 * splnění): jsou to záloha na celou smlouvu, při předčasném konci se nesplacená část vrací
 * (server: advanceClawback v apps/api/src/sponsors/negotiation.ts). Bonusy za sezónní sliby
 * (opakovaná platba po splnění) se do zálohy nepočítají.
 */
export function proposalOneTimeTotal(view: NegotiationView, p: Proposal): number {
  const d = p.demands;
  let total = d.signingBonus;
  if (d.construction) total += view.construction.find((x) => x.key === d.construction)?.cost ?? 0;
  if (d.equipment) total += view.equipment.find((x) => x.key === d.equipment)?.cost ?? 0;
  if (d.payCurrentFee && view.current && !view.current.sameSponsor) total += view.current.terminationFee;
  for (const spec of p.promises) {
    const bonus = d.goalBonuses[spec.kind] ?? 0;
    if (bonus <= 0 || findOption(view, spec)?.seasonal) continue;
    total += bonus;
  }
  return total;
}
