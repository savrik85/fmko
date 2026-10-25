/**
 * Konec sezóny, souboje „kdo zůstane" (season/season-departures.ts): AI trenér v každé dvojici
 * vybere, kdo zůstane, druhý odchází nadobro. Čisté funkce bez databáze: popis pro model, schéma
 * odpovědi, kontrola a náhradní pravidlo podle povahy.
 *
 * Kód hlídá jen to, co by rozumný člověk neudělal: poslední brankář áčka musí zůstat a po všech
 * soubojích musí áčku zůstat aspoň jeden brankář. Ostatní je styl a priorita trenéra.
 */

import type { AiCoachProfile } from "./profile";
import type { SquadImportance } from "./valuation";
import { styleText } from "./weekly-decision";

export type DuelSide = "A" | "B";

export interface DuelPlayerFacts {
  playerId: string;
  name: string;
  position: string;
  age: number;
  rating: number;
  importance: SquadImportance;
  /** Kolik dalších vlastních hráčů áčka hraje stejný post. */
  samePosition: number;
  /** Hráč v klubu už není (mezitím prodaný, propuštěný). */
  gone: boolean;
}

export interface DuelFacts {
  a: DuelPlayerFacts;
  b: DuelPlayerFacts;
  /** Kdo zůstat musí (poslední brankář, druhý z dvojice už v klubu není), jinak null. */
  mustKeep: DuelSide | null;
}

export interface SeasonDuelsContext {
  teamName: string;
  profile: AiCoachProfile;
  squadSize: number;
  /** Vlastní brankáři áčka před rozhodnutím. */
  goalkeepers: number;
  duels: DuelFacts[];
}

export interface SeasonDuelsDecision {
  keep: DuelSide[];
  reason: string;
}

export const SEASON_DUELS_SYSTEM_PROMPT = [
  "You are the head coach and manager of an amateur Czech district football club in a football management game.",
  "The season has ended. In each pair of players below, exactly one has to leave the club for good",
  "(he retires or moves away; the club gets no money and no replacement). You choose who STAYS in each pair.",
  "Think like a sensible real manager with YOUR personality: the squad for next season, positions, age and quality.",
  "Answer with exactly one JSON object and nothing else.",
].join(" ");

function playerText(p: DuelPlayerFacts): string {
  const role = p.importance === "key" ? "a key player" : p.importance === "rotation" ? "a rotation player" : "a fringe player";
  return `${p.name} (${p.position}, age ${p.age}, rating ${p.rating}, ${role}, ${p.samePosition} other player${p.samePosition === 1 ? "" : "s"} in his position)`;
}

function duelKey(i: number): string {
  return `duel_${i + 1}`;
}

/** Strany, které kód v souboji dovolí nechat. */
function allowedSides(d: DuelFacts): DuelSide[] {
  return d.mustKeep ? [d.mustKeep] : ["A", "B"];
}

/** Má model vůbec co rozhodovat? Když je každý souboj daný, ne. */
export function hasRealChoice(ctx: SeasonDuelsContext): boolean {
  return ctx.duels.some((d) => allowedSides(d).length > 1);
}

export function renderSeasonDuelsPrompt(ctx: SeasonDuelsContext): string {
  const p = ctx.profile;
  const L: string[] = [
    "YOUR PERSONALITY (0-100):",
    `ambition ${p.ambition}, thrift ${p.thrift}, youth focus ${p.youthFocus}, risk ${p.risk}, patience ${p.patience}.`,
    `YOUR STYLE: ${styleText(p)}`,
    "",
    `CLUB ${ctx.teamName}: ${ctx.squadSize} players in the A-team, ${ctx.goalkeepers} goalkeeper${ctx.goalkeepers === 1 ? "" : "s"}.`,
    "",
    "PAIRS (one player of each pair leaves):",
  ];
  ctx.duels.forEach((d, i) => {
    L.push(`${duelKey(i)}:`);
    L.push(`- A: ${playerText(d.a)}`);
    L.push(`- B: ${playerText(d.b)}`);
    if (d.mustKeep) {
      const leaver = d.mustKeep === "A" ? d.b : d.a;
      L.push(`  ${d.mustKeep} must stay: ${leaver.gone ? `${leaver.name} has already left the club` : "he is your last goalkeeper"}.`);
    }
  });
  L.push("");
  L.push(`Return {${ctx.duels.map((_, i) => `"${duelKey(i)}": "A" or "B"`).join(", ")}, "reason": "one short English sentence"} where "A" or "B" is the player who STAYS.`);
  return L.join("\n");
}

/** Schéma odpovědi. Každý enum má aspoň jednu hodnotu (daný souboj jen tu jednu). */
export function seasonDuelsSchema(ctx: SeasonDuelsContext): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  ctx.duels.forEach((d, i) => { properties[duelKey(i)] = { type: "string", enum: allowedSides(d) }; });
  properties.reason = { type: "string" };
  return { type: "object", properties, required: [...ctx.duels.map((_, i) => duelKey(i)), "reason"], additionalProperties: false };
}

function leaverOf(d: DuelFacts, keep: DuelSide): DuelPlayerFacts {
  return keep === "A" ? d.b : d.a;
}

/** Kolik vlastních brankářů áčku po rozhodnutí zbude. Hráč, který už v klubu není, se nepočítá. */
function goalkeepersLeft(ctx: SeasonDuelsContext, keep: DuelSide[]): number {
  return ctx.goalkeepers - ctx.duels.filter((d, i) => {
    const leaver = leaverOf(d, keep[i]);
    return leaver.position === "GK" && !leaver.gone;
  }).length;
}

/** Model smí v každém souboji vybrat jen dovolenou stranu a áčko nesmí přijít o všechny brankáře. */
export function validateSeasonDuels(raw: unknown, ctx: SeasonDuelsContext): SeasonDuelsDecision | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const keep: DuelSide[] = [];
  for (let i = 0; i < ctx.duels.length; i++) {
    const v = r[duelKey(i)];
    const side = typeof v === "string" ? v.trim().toUpperCase() : null;
    if (side !== "A" && side !== "B") return null;
    if (!allowedSides(ctx.duels[i]).includes(side)) return null;
    keep.push(side);
  }
  if (ctx.goalkeepers > 0 && goalkeepersLeft(ctx, keep) < 1) return null;
  return { keep, reason: typeof r.reason === "string" ? r.reason.trim().slice(0, 300) : "" };
}

/** Jak moc chce trenér hráče nechat: kvalita, role v kádru, prázdný post a věk podle sázky na mládež. */
function keepScore(p: DuelPlayerFacts, profile: AiCoachProfile): number {
  if (p.gone) return -1000;
  const youth = ((profile.youthFocus - 50) / 50) * Math.max(0, 27 - p.age) * 0.4;
  const role = p.importance === "key" ? 3 : p.importance === "rotation" ? 1 : 0;
  const thinPosition = p.samePosition <= 1 ? 2 : 0;
  return p.rating + youth + role + thinPosition;
}

/**
 * Náhradní pravidlo podle povahy: zůstane ten, koho trenér víc potřebuje. Rozhoduje hodnocení,
 * mládežník přidá mladším, šetří se posty s malou hloubkou. Poslední brankář zůstane vždy.
 */
export function fallbackSeasonDuels(ctx: SeasonDuelsContext): SeasonDuelsDecision {
  const keep: DuelSide[] = [];
  let goalkeepers = ctx.goalkeepers;
  for (const d of ctx.duels) {
    let side: DuelSide;
    if (d.mustKeep) {
      side = d.mustKeep;
    } else {
      const sa = keepScore(d.a, ctx.profile);
      const sb = keepScore(d.b, ctx.profile);
      side = sa !== sb ? (sa > sb ? "A" : "B") : d.a.rating !== d.b.rating ? (d.a.rating > d.b.rating ? "A" : "B") : d.a.age <= d.b.age ? "A" : "B";
      // Neodejde poslední brankář, ani když ho souboje berou jednoho po druhém.
      const leaver = leaverOf(d, side);
      if (leaver.position === "GK" && !leaver.gone && goalkeepers <= 1) side = side === "A" ? "B" : "A";
    }
    const leaver = leaverOf(d, side);
    if (leaver.position === "GK" && !leaver.gone) goalkeepers--;
    keep.push(side);
  }
  return { keep, reason: "fallback" };
}

/** Id hráčů, kteří odejdou (poražení ze soubojů). */
export function leavingPlayerIds(ctx: SeasonDuelsContext, decision: SeasonDuelsDecision): string[] {
  return ctx.duels.map((d, i) => leaverOf(d, decision.keep[i]).playerId);
}
