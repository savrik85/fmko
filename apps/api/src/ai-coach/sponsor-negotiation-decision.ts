/**
 * Jednání AI klubu s majitelem firmy modelem (hlavní sponzor i název stadionu). Čisté funkce
 * bez databáze: přípustné tahy a meze vlastního návrhu, popis situace pro model, schéma
 * odpovědi, kontrola odpovědi a náhradní pravidlo.
 *
 * Model navrhuje, kód hlídá. Tahy jsou stejné jako u člověka: podepsat, co je na stole (úvodní
 * nabídka, protinabídka majitele nebo přijatý návrh), poslat vlastní návrh, nebo jednání ukončit
 * (bez pokuty, jako tlačítko „Ukončit jednání“). Meze návrhu počítá kód z toho, co člověk vidí
 * (odhad rozpočtu firmy podle náklonnosti, katalog slibů); návrh pak projde stejnou validací
 * a stejným vyhodnocením majitele jako návrh člověka (sponsors/negotiation-round.ts).
 *
 * AI sama slíbí jen to, co opravdu dodrží: exkluzivitu oboru (banner stejného oboru hra nepustí),
 * u stadionu logo na rukávu (AI ho umístí hned po podpisu) a výsledek jen tam, kde mu sám sponzor
 * dává aspoň MIN_KEEP_CHANCE; postup a nesestup nikdy (jejich nesplnění smlouvu hned ukončí).
 * Podepsat podmínky majitele s jeho přáními smí, model u každého slibu vidí, jak ho klub dodrží.
 * Vlastních návrhů je nejvýš MAX_AI_COUNTERS, potom zbývá podepsat, nebo odejít. Bez platné
 * odpovědi platí dosavadní chování: podepsat, co je na stole.
 */

import { budgetEstimateRange } from "../sponsors/budget";
import {
  allowedContractSeasons, BASE_WILLINGNESS, buildPromiseRows, CAUTIOUS_SEASON_BONUS, effectiveContractMonths, MAX_PROMISES,
  promiseChance, promiseValueShare, proposalMonths, WILLINGNESS_CAP,
  type NegotiationCategory, type NegotiationContext, type Proposal,
} from "../sponsors/negotiation";
import { pendingTerms, type Negotiation, type NegotiationRound } from "../sponsors/negotiation-db";
import { MAX_NEGOTIATION_ROUNDS } from "../sponsors/negotiation-round";
import { favorBand } from "../sponsors/overview";
import type { OwnerPersonality } from "../sponsors/owners";
import { FATAL_KINDS } from "../sponsors/promise-eval";
import { PROMISE_KINDS, type PromiseKind, type PromiseSpec } from "../sponsors/promise-kinds";
import { promiseCatalog, type PromiseOption, type Range } from "../sponsors/proposal";
import { cleanReason, czk, isRecord, toAmount } from "./buy-decision";
import { FAVOR_TEXT, OWNER_TEXT } from "./main-sponsor-decision";
import type { AiCoachProfile } from "./profile";
import { styleText } from "./weekly-decision";

/** Kolik vlastních návrhů AI v jednom jednání nejvýš pošle. */
export const MAX_AI_COUNTERS = 2;
/** Nejmenší šance splnění (jak ji počítá sponzor, promiseChance), se kterou AI slíbí výsledek. */
export const MIN_KEEP_CHANCE = 0.7;
/** Příspěvek za podpis nejvýš za tolik měsíců horní meze měsíční podpory. */
export const SIGNING_BONUS_MAX_MONTHS = 2;
const EPS = 1e-9;

export const SPONSOR_MOVES = ["sign", "counter", "walk_away"] as const;
export type SponsorMove = (typeof SPONSOR_MOVES)[number];

/**
 * Jak AI klub slib dodrží: `kept` sám (hru nebo AI to zařídí), `results` výsledkem na hřišti,
 * `out_of_hand` vůbec (AI nemá jak: kurzy licencí, plánovaná stavba, mladí v sestavě, fanoušci).
 */
export type PromiseKeep = "kept" | "results" | "out_of_hand";

export function promiseKeep(kind: PromiseKind, category: NegotiationCategory): PromiseKeep {
  switch (kind) {
    case "sector_exclusivity":
      return "kept";
    case "jersey_logo":
      return category === "stadium" ? "kept" : "out_of_hand";
    case "league_position":
    case "promotion":
    case "no_relegation":
    case "cup_round":
    case "attendance":
    case "reputation":
      return "results";
    case "coach_licence":
    case "stadium_upgrade":
    case "youth":
    case "no_riots":
      return "out_of_hand";
  }
}

/** Slib, který AI smí sama nabídnout. */
export interface PromiseChoice {
  /** Klíč pro model (P1, P2…). */
  key: string;
  spec: PromiseSpec;
  keep: Exclude<PromiseKeep, "out_of_hand">;
  /** Šance splnění, jak ji počítá sponzor (0–1). */
  chance: number;
  seasonal: boolean;
  /** Přínos k rozpočtu firmy, Kč měsíčně (rozmezí podle náklonnosti, jako na webu). */
  value: Range;
  /** Pokuta za nesplnění, u sezónních za každou sezónu (rozmezí jako na webu). */
  penalty: Range;
}

/**
 * Sliby, které AI smí sama nabídnout: jen z katalogu (teď platné), jen ty, které dodrží (`kept`,
 * nebo výsledek se šancí aspoň MIN_KEEP_CHANCE, nikdy postup ani nesestup), jen s nenulovým
 * přínosem. Od každého druhu jeden, ten s největším přínosem.
 */
export function aiPromiseChoices(ctx: NegotiationContext, favor: number): PromiseChoice[] {
  const best = new Map<PromiseKind, { option: PromiseOption; share: number; chance: number; keep: PromiseChoice["keep"] }>();
  for (const option of promiseCatalog(ctx, favor)) {
    const keep = promiseKeep(option.kind, ctx.category);
    if (keep === "out_of_hand" || FATAL_KINDS.includes(option.kind)) continue;
    const spec: PromiseSpec = { kind: option.kind, params: option.params };
    const share = promiseValueShare(spec, ctx);
    if (share <= 0) continue;
    const chance = promiseChance(spec, ctx);
    if (keep === "results" && chance + EPS < MIN_KEEP_CHANCE) continue;
    const current = best.get(option.kind);
    if (!current || share > current.share + EPS) best.set(option.kind, { option, share, chance, keep });
  }
  return PROMISE_KINDS.flatMap((kind) => {
    const b = best.get(kind);
    return b ? [b] : [];
  }).map((b, i) => ({
    key: `P${i + 1}`, spec: { kind: b.option.kind, params: b.option.params }, keep: b.keep, chance: b.chance,
    seasonal: b.option.seasonal, value: b.option.value, penalty: b.option.penalty,
  }));
}

/** Meze vlastního návrhu AI. */
export interface CounterBounds {
  seasons: number[];
  monthly: { min: number; max: number };
  signingBonus: { min: number; max: number };
  promises: PromiseChoice[];
  countersLeft: number;
}

/** Dolů na stovky (EPS kvůli plovoucí čárce), pod stovku dolů na koruny. */
function floorHundreds(v: number): number {
  return v >= 100 ? Math.floor(v / 100 + EPS) * 100 : Math.max(0, Math.floor(v + EPS));
}

/**
 * Meze vlastního návrhu z toho, co člověk vidí: měsíčně od spodku odhadu bez slibů (nebo méně,
 * když je na stole méně) po horní okraj odhadu bez slibů plus přínos všech slibů, které AI smí
 * dát (nikdy nad strop odhadu se sliby); příspěvek za podpis do SIGNING_BONUS_MAX_MONTHS měsíců
 * horní meze (nebo kolik je na stole). null = další návrh už nejde.
 */
export function counterBounds(i: {
  ctx: NegotiationContext; favor: number; pending: Proposal | null; countersLeft: number;
}): CounterBounds | null {
  if (i.countersLeft <= 0) return null;
  const { ctx, favor, pending } = i;
  const base = budgetEstimateRange(BASE_WILLINGNESS * ctx.budgetB, favor);
  const cap = budgetEstimateRange(WILLINGNESS_CAP * ctx.budgetB, favor);
  const promises = aiPromiseChoices(ctx, favor);
  const promised = promises.reduce((s, p) => s + p.value.high, 0);
  const floor = Math.max(1, floorHundreds(base.low));
  const min = Math.max(1, Math.min(pending?.demands.monthly ?? floor, floor));
  const max = Math.max(min, floorHundreds(Math.min(cap.high, base.high + promised)));
  const signingMax = Math.max(pending?.demands.signingBonus ?? 0, floorHundreds(SIGNING_BONUS_MAX_MONTHS * max));
  return {
    seasons: allowedContractSeasons(ctx.seasonProgressMonths),
    monthly: { min, max },
    signingBonus: { min: 0, max: signingMax },
    promises,
    countersLeft: i.countersLeft,
  };
}

/** Slib v podmínkách na stole (s pokutou, jak ji počítá podpis). */
export interface PromiseOnTable {
  spec: PromiseSpec;
  keep: PromiseKeep;
  chance: number;
  /** Pokuta za jeden nesplněný řádek (u sezónních za sezónu). */
  penalty: number;
  /** Kolik řádků slib založí (sezónní jeden za každou sezónu od příští). */
  rows: number;
}

/** Podmínky, které jde teď podepsat. */
export interface TermsOnTable {
  seasons: number;
  /** Skutečné měsíce plateb (od dneška do konce poslední sezóny). */
  months: number;
  monthly: number;
  signingBonus: number;
  winBonus: number;
  construction: string | null;
  equipment: string | null;
  promises: PromiseOnTable[];
}

export function termsOnTable(p: Proposal, ctx: NegotiationContext, gameDate: string): TermsOnTable {
  const rows = buildPromiseRows(p, ctx, gameDate);
  return {
    seasons: p.seasons, months: proposalMonths(p, ctx), monthly: p.demands.monthly, signingBonus: p.demands.signingBonus,
    winBonus: p.demands.winBonus, construction: p.demands.construction, equipment: p.demands.equipment,
    promises: p.promises.map((spec) => {
      const own = rows.filter((r) => r.kind === spec.kind);
      return {
        spec, keep: promiseKeep(spec.kind, ctx.category), chance: promiseChance(spec, ctx),
        penalty: own[0]?.penalty ?? 0, rows: own.length,
      };
    }),
  };
}

export interface SponsorTalksContext {
  teamName: string;
  profile: AiCoachProfile;
  budget: number;
  sponsorName: string;
  sponsorType: string;
  owner: OwnerPersonality;
  favor: number;
  patience: number;
  /** Prodloužení se současnou (nebo právě vypršelou) firmou: klub ani stadion se nepřejmenují. */
  renewal: boolean;
  /** Kontext jednání ze serveru (kategorie, rozpočet B, liga, katalog slibů). */
  deal: NegotiationContext;
  /** Odhad rozpočtu firmy, jaký vidí člověk: bez slibů a strop se sliby. */
  estimate: { base: Range; cap: Range };
  /** Co jde teď podepsat; null = nic (majitel zatím nic nenabídl ani nepřijal). */
  table: TermsOnTable | null;
  /** Dosavadní kola jednání (anglicky, pro model). */
  history: string[];
  /** Meze vlastního návrhu; null = další návrh už nejde. */
  counter: CounterBounds | null;
}

/** Tahy, ze kterých model vybírá. „walk_away“ jde vždycky, výčet tedy nikdy není prázdný. */
export function sponsorTalksMoves(c: Pick<SponsorTalksContext, "table" | "counter">): SponsorMove[] {
  return [...(c.table ? ["sign" as const] : []), ...(c.counter ? ["counter" as const] : []), "walk_away"];
}

/** Kolik vlastních návrhů klub v jednání už poslal (každé kolo kromě úvodní nabídky majitele). */
export function clubProposals(rounds: readonly NegotiationRound[]): number {
  return rounds.filter((r) => r.response.kind !== "offer").length;
}

export interface SponsorTalksInput {
  neg: Negotiation;
  deal: NegotiationContext;
  owner: OwnerPersonality;
  favor: number;
  sponsorName: string;
  sponsorType: string;
  renewal: boolean;
  gameDate: string;
  teamName: string;
  budget: number;
  profile: AiCoachProfile;
}

/** Situace jednání pro tah AI z načteného stavu (stejná data, jaká vidí člověk na stránce jednání). */
export function sponsorTalksContext(i: SponsorTalksInput): SponsorTalksContext {
  const live = i.neg.status === "open" || i.neg.status === "accepted";
  const pending = live ? pendingTerms(i.neg) : null;
  const countersLeft = live && i.neg.rounds.length < MAX_NEGOTIATION_ROUNDS ? Math.max(0, MAX_AI_COUNTERS - clubProposals(i.neg.rounds)) : 0;
  return {
    teamName: i.teamName, profile: i.profile, budget: i.budget, sponsorName: i.sponsorName, sponsorType: i.sponsorType,
    owner: i.owner, favor: i.favor, patience: i.neg.patience, renewal: i.renewal, deal: i.deal,
    estimate: {
      base: budgetEstimateRange(BASE_WILLINGNESS * i.deal.budgetB, i.favor),
      cap: budgetEstimateRange(WILLINGNESS_CAP * i.deal.budgetB, i.favor),
    },
    table: pending ? termsOnTable(pending, i.deal, i.gameDate) : null,
    history: historyLines(i.neg.rounds, i.deal),
    counter: counterBounds({ ctx: i.deal, favor: i.favor, pending, countersLeft }),
  };
}

// ---------------------------------------------------------------------------------------------
// Popis pro model (anglicky, jako ostatní rozhodnutí AI trenéra)

/** Slib anglicky, s měřítkem, podle kterého se dá posoudit (liga, poslední návštěva, reputace). */
export function promiseText(spec: PromiseSpec, ctx: NegotiationContext): string {
  const p = spec.params;
  switch (spec.kind) {
    case "league_position":
      return `finish in the top ${p.position} of the league (${ctx.leagueTeams} teams, you are expected around place ${ctx.expectedPosition})`;
    case "promotion": return "win promotion (top 2 of the league)";
    case "no_relegation": return "avoid relegation";
    case "cup_round": return `reach cup round ${p.round} of ${ctx.cupTotalRounds}`;
    case "coach_licence": return `get coaching licence level ${p.level}`;
    case "stadium_upgrade": return `build ${(p.facility ?? "a facility").replace(/_/g, " ")} up to level ${p.level}`;
    case "jersey_logo": return "his logo on your shirt sleeve";
    case "sector_exclusivity": return `no banner of another ${(p.sector ?? ctx.sponsorType).replace(/_/g, " ")} company`;
    case "attendance": return `average home attendance of at least ${p.attendance} (last season ${ctx.lastAvgAttendance})`;
    case "youth": return `on average ${p.count} players aged 21 or younger in your starting eleven`;
    case "reputation": return `club reputation of at least ${p.reputation} at the end of each season (now ${ctx.reputation})`;
    case "no_riots": return "no riots by your fans";
  }
}

/** Jak AI klub slib dodrží, slovy pro model. */
export function keepText(spec: PromiseSpec, keep: PromiseKeep, chance: number): string {
  if (keep === "kept") {
    return spec.kind === "jersey_logo"
      ? "kept for sure: you put his logo on the sleeve right after signing"
      : "kept for sure: the game itself will not let you sign such a banner";
  }
  if (keep === "results") {
    const fatal = FATAL_KINDS.includes(spec.kind) ? "; missing it ends the contract at once" : "";
    return `depends on your results, he rates the chance at about ${Math.round(chance * 100)} %${fatal}`;
  }
  switch (spec.kind) {
    case "coach_licence": return "you cannot keep it: you do not take coaching courses";
    case "stadium_upgrade": return "nobody plans this build for you, so expect to break it";
    case "youth": return "your lineups pick the strongest players, so expect to break it";
    case "no_riots": return "you cannot control your fans, it is luck";
    default: return "you cannot steer it";
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function months(n: number): string {
  return `${Math.round(n * 10) / 10} months`;
}

function moneyText(d: { monthly: number; signingBonus: number; winBonus: number; construction: string | null; equipment: string | null }): string {
  const parts = [`${czk(d.monthly)} a month`, `signing bonus ${czk(d.signingBonus)}`];
  if (d.winBonus > 0) parts.push(`${czk(d.winBonus)} for every win`);
  if (d.construction) parts.push(`he pays your ${d.construction.replace(/_/g, " ")} upgrade`);
  if (d.equipment) parts.push(`he buys you new ${d.equipment.replace(/_/g, " ")}`);
  return parts.join(", ");
}

/** Návrh jednou větou: délka, peníze, sliby. */
export function proposalText(p: Proposal, ctx: NegotiationContext): string {
  const promises = p.promises.length ? `promises: ${p.promises.map((s) => promiseText(s, ctx)).join("; ")}` : "no promises";
  return `${plural(p.seasons, "season")}, ${moneyText(p.demands)}, ${promises}`;
}

/** Dosavadní kola jednání pro model: úvodní nabídka majitele, návrhy klubu a jeho odpovědi. */
export function historyLines(rounds: readonly NegotiationRound[], ctx: NegotiationContext): string[] {
  return rounds.map((r) => {
    if (r.response.kind === "offer") return `- his opening offer: ${proposalText(r.proposal, ctx)}`;
    const you = `- you proposed ${proposalText(r.proposal, ctx)}`;
    const said = r.response.complaint ? ` (he said in Czech: "${r.response.complaint}")` : "";
    switch (r.response.kind) {
      case "accept": return `${you}; he accepted it`;
      case "counter_money": return `${you}; he countered with ${r.response.counter ? proposalText(r.response.counter, ctx) : "less money"}`;
      case "counter_wish": {
        const wish = r.response.counter?.promises.find((s) => s.kind === r.response.wish);
        return `${you}; he agrees if you also promise ${wish ? promiseText(wish, ctx) : "one of his wishes"}`;
      }
      case "reject": return `${you}; he rejected it${said}`;
      case "insulted": return `${you}; he rejected it and was insulted${said}`;
      case "walked_away": return `${you}; he walked away${said}`;
    }
  });
}

const CATEGORY_TEXT: Record<NegotiationCategory, { talks: string; renewal: string }> = {
  main: {
    talks: "becoming your main sponsor: its name goes into the club name",
    renewal: "renewing its main sponsorship of your club (the club keeps its name)",
  },
  stadium: {
    talks: "naming your stadium: the stadium will carry its name, the club keeps its own",
    renewal: "renewing its naming of your stadium (the stadium keeps its name)",
  },
};

export const SPONSOR_TALKS_SYSTEM_PROMPT = [
  "You are the head coach and manager of an amateur Czech district football club in a football management game.",
  "You are negotiating a sponsorship contract with the owner of a local company, the same way a human manager does:",
  "each turn you either sign the terms on the table, propose your own terms, or end the talks.",
  "The owner accepts a proposal that fits his budget, counters when you ask a little too much, rejects it when you ask far too much",
  "and is insulted when you ask for much more than he can pay; every rejection costs his patience, and when it runs out he walks away.",
  "A promise you give raises what he is willing to pay, but a broken promise costs a penalty and his favour.",
  "Decide like a sensible real manager with YOUR personality. The game has already checked the rules, so every listed option is allowed.",
  "Answer with exactly one JSON object and nothing else.",
].join(" ");

export function renderSponsorTalksPrompt(c: SponsorTalksContext): string {
  const p = c.profile;
  const d = c.deal;
  const what = c.renewal ? CATEGORY_TEXT[d.category].renewal : CATEGORY_TEXT[d.category].talks;
  const seasons = allowedContractSeasons(d.seasonProgressMonths);
  const L: string[] = [
    "YOUR PERSONALITY (0-100):",
    `ambition ${p.ambition}, thrift ${p.thrift}, risk ${p.risk}, patience ${p.patience}, youth focus ${p.youthFocus}.`,
    `YOUR STYLE: ${styleText(p)}`,
    "",
    `CLUB ${c.teamName}: budget ${czk(c.budget)}, reputation ${d.reputation}/100.`,
    `TALKS with ${c.sponsorName} (${c.sponsorType.replace(/_/g, " ")}) about ${what}.`,
    `OWNER: ${OWNER_TEXT[c.owner]}; favour ${c.favor}/100 (${FAVOR_TEXT[favorBand(c.favor)]}). `
      + `His patience: ${plural(c.patience, "more rejected proposal")} and he walks away and will not talk to you for 14 days.`,
    `HIS BUDGET for a contract, estimated as a human manager sees it: about ${czk(c.estimate.base.low)} to ${czk(c.estimate.base.high)} a month`
      + ` without promises, at most ${czk(c.estimate.cap.high)} a month with promises.`
      + (c.owner === "cautious" ? ` He adds about ${Math.round(CAUTIOUS_SEASON_BONUS * 100)} % for every season beyond the first.` : ""),
    `CONTRACT LENGTH: ${seasons.map((s) => `${plural(s, "season")} = ${months(effectiveContractMonths(s, d.seasonProgressMonths))} of payments`).join(", ")}.`
      + " A signing bonus costs him as much as the same money spread over those months.",
    "",
  ];
  if (c.table) {
    const t = c.table;
    L.push(`ON THE TABLE (you can sign it now): ${plural(t.seasons, "season")} (${months(t.months)} of payments), ${moneyText(t)}.`);
    if (t.promises.length) {
      L.push("Promises in these terms (a broken one costs the penalty and his favour; two broken promises in one season end the contract):");
      for (const pr of t.promises) {
        const per = pr.rows > 1 ? ` per season (${pr.rows} seasons)` : "";
        L.push(`- ${promiseText(pr.spec, d)}: penalty ${czk(pr.penalty)}${per} if broken; ${keepText(pr.spec, pr.keep, pr.chance)}`);
      }
    } else {
      L.push("No promises in these terms.");
    }
  } else {
    L.push("ON THE TABLE: nothing you can sign yet, he waits for your proposal.");
  }
  if (c.history.length) L.push("", "TALKS SO FAR:", ...c.history);
  L.push("", "OPTIONS:");
  if (c.table) L.push('- "sign": sign the terms on the table.');
  if (c.counter) {
    const b = c.counter;
    L.push(`- "counter": propose your own terms; you can do it ${plural(b.countersLeft, "more time")}. Seasons: one of ${b.seasons.join(", ")}.`
      + ` Monthly money: ${czk(b.monthly.min)} to ${czk(b.monthly.max)}. Signing bonus: ${czk(b.signingBonus.min)} to ${czk(b.signingBonus.max)}.`
      + " He compares the monthly money plus the signing bonus spread over the months of payments with his budget for your terms:"
      + " within it he accepts, a little above it he counters (with less money, or asking you to add one of his wishes as a promise),"
      + " far above it he rejects, and more than about one and a half times his budget insults him and costs his favour.");
    if (b.promises.length) {
      L.push("  Promises you can give (each raises his budget; seasonal ones count once per season from next season and need a contract of at least 2 seasons):");
      for (const pc of b.promises) {
        L.push(`  - "${pc.key}": ${promiseText(pc.spec, d)}: adds about ${czk(pc.value.low)} to ${czk(pc.value.high)} a month,`
          + ` penalty about ${czk(pc.penalty.low)} to ${czk(pc.penalty.high)}${pc.seasonal ? " per season" : ""} if broken; ${keepText(pc.spec, pc.keep, pc.chance)}`);
      }
      L.push("  Promises on the table are not included automatically: list every promise you give. You cannot give any other promise.");
    } else {
      L.push("  You cannot give any promise in these talks, only ask for money and seasons.");
    }
  }
  L.push('- "walk_away": end the talks without a contract; no penalty, you can talk to him again another week.');
  L.push(
    "",
    'Return {"move": one of the options, "seasons": contract seasons, "monthly": monthly money in CZK, "signingBonus": signing bonus in CZK,'
      + ' "promises": keys of the promises you give, "reason": "one short English sentence"}.'
      + ` When you do not counter, use seasons ${(c.counter?.seasons ?? seasons)[0]}, monthly 0, signingBonus 0 and promises [].`,
  );
  return L.join("\n");
}

/** Enumy nikdy nejsou prázdné (Workers AI nesplnitelné schéma odmítne): tah „walk_away“ jde vždy, sezóny taky. */
export function sponsorTalksSchema(c: SponsorTalksContext): Record<string, unknown> {
  const keys = c.counter?.promises.map((pc) => pc.key) ?? [];
  const seasons = c.counter?.seasons ?? allowedContractSeasons(c.deal.seasonProgressMonths);
  return {
    type: "object",
    properties: {
      move: { type: "string", enum: sponsorTalksMoves(c) },
      seasons: { type: "integer", enum: [...seasons] },
      monthly: { type: "integer" },
      signingBonus: { type: "integer" },
      promises: { type: "array", items: keys.length > 0 ? { type: "string", enum: keys } : { type: "string" } },
      reason: { type: "string" },
    },
    required: ["move", "seasons", "monthly", "signingBonus", "promises", "reason"],
    additionalProperties: false,
  };
}

export type SponsorTalksDecision =
  | { move: "sign"; reason: string }
  | { move: "walk_away"; reason: string }
  | { move: "counter"; seasons: number; monthly: number; signingBonus: number; promiseKeys: string[]; reason: string };

export type SponsorTalksCheck = { ok: true; decision: SponsorTalksDecision } | { ok: false; reason: string };

/**
 * Model smí jen přípustný tah a návrh v mezích: sezóny z nabídky, peníze v rozpětí, sliby jen
 * z nabídnutých klíčů (sezónní jen se smlouvou aspoň na 2 sezóny). Jinak důvod pro deník
 * a rozhodne náhradní pravidlo.
 */
export function checkSponsorTalks(raw: unknown, c: SponsorTalksContext): SponsorTalksCheck {
  if (!isRecord(raw)) return { ok: false, reason: "odpověď není objekt" };
  const move = typeof raw.move === "string" ? raw.move.trim().toLowerCase() : "";
  if (!(sponsorTalksMoves(c) as string[]).includes(move)) return { ok: false, reason: `nepřípustný tah modelu: ${move.slice(0, 40) || "žádný"}` };
  const reason = cleanReason(raw.reason);
  if (move === "sign" || move === "walk_away") return { ok: true, decision: { move, reason } };

  const b = c.counter;
  if (!b) return { ok: false, reason: "další návrh už nejde" };
  const seasons = toAmount(raw.seasons);
  if (seasons === null || !b.seasons.includes(seasons)) return { ok: false, reason: `délka smlouvy ${String(raw.seasons)} mimo ${b.seasons.join("/")}` };
  const monthly = toAmount(raw.monthly);
  if (monthly === null || monthly < b.monthly.min || monthly > b.monthly.max) {
    return { ok: false, reason: `měsíční podpora ${String(raw.monthly)} mimo meze ${b.monthly.min} až ${b.monthly.max}` };
  }
  const signingBonus = toAmount(raw.signingBonus);
  if (signingBonus === null || signingBonus < b.signingBonus.min || signingBonus > b.signingBonus.max) {
    return { ok: false, reason: `příspěvek za podpis ${String(raw.signingBonus)} mimo meze ${b.signingBonus.min} až ${b.signingBonus.max}` };
  }
  if (!Array.isArray(raw.promises)) return { ok: false, reason: "sliby nejsou seznam" };
  const promiseKeys: string[] = [];
  for (const item of raw.promises) {
    const key = typeof item === "string" ? item.trim().toUpperCase() : "";
    const choice = b.promises.find((pc) => pc.key === key);
    if (!choice) return { ok: false, reason: `slib ${String(item).slice(0, 40)} není v nabídce` };
    if (choice.seasonal && seasons < 2) return { ok: false, reason: `sezónní slib ${key} potřebuje smlouvu aspoň na 2 sezóny` };
    if (!promiseKeys.includes(key)) promiseKeys.push(key);
  }
  if (promiseKeys.length > MAX_PROMISES) return { ok: false, reason: `víc než ${MAX_PROMISES} slibů` };
  return { ok: true, decision: { move: "counter", seasons, monthly, signingBonus, promiseKeys, reason } };
}

/** Návrh AI ve tvaru, jaký posílá web (POST .../propose): bez bonusů, staveb a vybavení. */
export function counterProposal(d: Extract<SponsorTalksDecision, { move: "counter" }>, c: SponsorTalksContext): Proposal {
  const promises = d.promiseKeys.flatMap((key) => {
    const choice = c.counter?.promises.find((pc) => pc.key === key);
    return choice ? [choice.spec] : [];
  });
  return {
    seasons: d.seasons,
    promises,
    demands: {
      monthly: d.monthly, winBonus: 0, signingBonus: d.signingBonus, goalBonuses: {}, construction: null, equipment: null,
      payCurrentFee: false,
    },
  };
}

/** Náhradní pravidlo (výpadek, neplatná odpověď, režim off): dosavadní chování, podepsat, co je na stole. */
export function fallbackSponsorTalks(c: Pick<SponsorTalksContext, "table">): SponsorTalksDecision {
  return c.table ? { move: "sign", reason: "fallback" } : { move: "walk_away", reason: "fallback" };
}
