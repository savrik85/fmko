/**
 * Vánoční sálovka: čisté funkce bez databáze.
 *
 * Jednodenní turnaj 5+1 v hale okresního města na dvou hřištích, zápasy 2 × 10 minut
 * po 25 minutách od 9:00. Skupiny podle počtu přihlášených, pak play-off, o třetí místo
 * a finále. Bank ze startovného dostanou první tři (50/30/20 %).
 */

import type { MatchFormat } from "../engine/types";
import {
  buildGroupSchedule, computeStandings, groupCode, groupPlayoffSeeding, threeGroupPlayoffSeeding,
  type DrawPair, type PlayedMatch, type StandingRow,
} from "../tournament/draw";

/** 5+1, dva poločasy po deseti minutách. Víc šancí než venku: malé hřiště, rychlé zakončení. */
export const HALL_FORMAT: MatchFormat = { squadSize: 6, durationMinutes: 20, chanceScale: 1.3 };
export const MIN_ENTRANTS = 4;
export const MAX_ENTRANTS = 16;
export const ROSTER_MAX = 10;
export const ENTRY_FEE = 1000;
export const PRIZE_SHARES = [0.5, 0.3, 0.2] as const;
export const COURTS = 2;
/** První výkop v 9:00 pražského času, další po 25 minutách. */
export const FIRST_KICKOFF_MINUTES = 9 * 60;
export const SLOT_MINUTES = 25;

export type HallStage = "group" | "qf" | "sf" | "third" | "final";
export type KnockoutStage = Exclude<HallStage, "group">;

export interface PlannedMatch {
  stage: HallStage;
  groupCode: string | null;
  bracketPos: number;
  slot: number;
  court: number;
  home: string;
  away: string;
}

/** Kolik skupin: 4–5 týmů jedna, 6–8 dvě, 9–11 tři, 12–16 čtyři (vždy aspoň 3 v každé). */
export function groupCountFor(teams: number): 1 | 2 | 3 | 4 {
  if (teams < MIN_ENTRANTS || teams > MAX_ENTRANTS) throw new Error(`Sálovka je pro ${MIN_ENTRANTS} až ${MAX_ENTRANTS} týmů, ne ${teams}`);
  if (teams <= 5) return 1;
  if (teams <= 8) return 2;
  if (teams <= 11) return 3;
  return 4;
}

/** Fáze po skupinách v pořadí, jak se hrají. */
export function knockoutStagesFor(teams: number): KnockoutStage[] {
  const groups = groupCountFor(teams);
  if (groups === 1) return ["third", "final"];
  if (groups === 2) return ["sf", "third", "final"];
  return ["qf", "sf", "third", "final"];
}

const STAGE_SIZE: Record<KnockoutStage, number> = { qf: 4, sf: 2, third: 1, final: 1 };

/**
 * Skupiny do časového plánu: kolo po kole, dva zápasy na slot (dvě hřiště). V jednom kole
 * hraje každý tým nejvýš jednou, takže nikdo nehraje na obou hřištích zároveň.
 */
export function scheduleGroupStage(groups: string[][], seed: number): PlannedMatch[] {
  const rounds = buildGroupSchedule(groups, seed);
  const groupOf = new Map<string, string>();
  groups.forEach((g, i) => g.forEach((id) => groupOf.set(id, groupCode(i))));
  const out: PlannedMatch[] = [];
  let index = 0;
  for (const round of rounds) {
    // Nové kolo začíná na novém slotu, ať tým z konce kola nehraje hned znovu na druhém hřišti.
    if (index % COURTS !== 0) index++;
    for (const pair of round) {
      out.push({
        stage: "group", groupCode: groupOf.get(pair.home) ?? null, bracketPos: out.length,
        slot: Math.floor(index / COURTS), court: (index % COURTS) + 1, home: pair.home, away: pair.away,
      });
      index++;
    }
  }
  return out;
}

/**
 * Sloty play-off po posledním slotu skupin. Čtvrtfinále a semifinále na obou hřištích,
 * o třetí místo a finále každé zvlášť na hlavním hřišti, finále jako poslední zápas dne.
 */
export function knockoutSlots(teams: number, lastGroupSlot: number): Record<KnockoutStage, Array<{ slot: number; court: number }>> {
  const out = { qf: [], sf: [], third: [], final: [] } as Record<KnockoutStage, Array<{ slot: number; court: number }>>;
  let slot = lastGroupSlot + 1;
  for (const stage of knockoutStagesFor(teams)) {
    const n = STAGE_SIZE[stage];
    if (stage === "third" || stage === "final") {
      out[stage].push({ slot, court: 1 });
      slot++;
      continue;
    }
    for (let i = 0; i < n; i++) {
      out[stage].push({ slot: slot + Math.floor(i / COURTS), court: (i % COURTS) + 1 });
    }
    slot += Math.ceil(n / COURTS);
  }
  return out;
}

/** Pražský čas dne `date` (YYYY-MM-DD), `minutes` od půlnoci, jako UTC ISO. */
export function pragueTimeToUtc(date: string, minutes: number): string {
  const naive = Date.parse(`${date}T00:00:00Z`) + minutes * 60_000;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(naive));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(naive - (wall - naive)).toISOString();
}

export function slotKickoff(playsOn: string, slot: number): string {
  return pragueTimeToUtc(playsOn, FIRST_KICKOFF_MINUTES + slot * SLOT_MINUTES);
}

/** Čas výkopu pro hráče: „9:25“. */
export function slotClock(slot: number): string {
  const m = FIRST_KICKOFF_MINUTES + slot * SLOT_MINUTES;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

export interface GroupTeam {
  id: string;
  name: string;
  reputation: number;
}

/** Tabulky skupin (index 0 = A) z odehraných zápasů. */
export function groupTables(groups: GroupTeam[][], played: PlayedMatch[]): StandingRow[][] {
  return groups.map((g) => {
    const ids = new Set(g.map((t) => t.id));
    return computeStandings(g, played.filter((m) => ids.has(m.home) && ids.has(m.away)));
  });
}

/**
 * První fáze play-off ze skupin. Jedna skupina: finále 1.–2. a o třetí místo 3.–4.
 * Dvě skupiny: semifinále A1–B2 a B1–A2. Tři: čtvrtfinále s dvěma nejlepšími třetími.
 * Čtyři: čtvrtfinále A1–B2, C1–D2, B1–A2, D1–C2.
 */
export function firstKnockoutPairs(tables: StandingRow[][], reputationOrder: string[]): { stage: KnockoutStage; pairs: DrawPair[] }[] {
  const ids = tables.map((t) => t.map((r) => r.teamId));
  if (tables.length === 1) {
    const [first, second, third, fourth] = ids[0];
    return [
      { stage: "third", pairs: [{ home: third, away: fourth }] },
      { stage: "final", pairs: [{ home: first, away: second }] },
    ];
  }
  if (tables.length === 2) {
    const [a, b] = ids;
    return [{ stage: "sf", pairs: [{ home: a[0], away: b[1] }, { home: b[0], away: a[1] }] }];
  }
  if (tables.length === 3) return [{ stage: "qf", pairs: threeGroupPlayoffSeeding(tables, reputationOrder).pairs }];
  return [{ stage: "qf", pairs: groupPlayoffSeeding(ids) }];
}

export interface DecidedTie {
  bracketPos: number;
  winner: string;
  loser: string;
}

/**
 * Další fáze z dohraných zápasů: ze čtvrtfinále semifinále (vítězové 1.+2. a 3.+4.),
 * ze semifinále finále vítězů a o třetí místo poražených.
 */
export function nextKnockoutPairs(stage: "qf" | "sf", ties: DecidedTie[]): { stage: KnockoutStage; pairs: DrawPair[] }[] {
  const by = [...ties].sort((a, b) => a.bracketPos - b.bracketPos);
  if (stage === "qf") {
    return [{ stage: "sf", pairs: [{ home: by[0].winner, away: by[1].winner }, { home: by[2].winner, away: by[3].winner }] }];
  }
  return [
    { stage: "third", pairs: [{ home: by[0].loser, away: by[1].loser }] },
    { stage: "final", pairs: [{ home: by[0].winner, away: by[1].winner }] },
  ];
}

/** Bank po celých korunách: zbytek po zaokrouhlení dostane vítěz, rozdá se přesně celý. */
export function splitPot(pot: number): [number, number, number] {
  const second = Math.floor(pot * PRIZE_SHARES[1]);
  const third = Math.floor(pot * PRIZE_SHARES[2]);
  return [pot - second - third, second, third];
}

export type HallReply = "register" | "decline";

const NOT_LETTER = "(?:^|[^\\p{L}])";
const END = "(?=$|[^\\p{L}])";
const DECLINE_RE = new RegExp(
  `${NOT_LETTER}(ne|nee+|nn|letos ne|tentokr[aá]t ne|nep[řr]ihl\\p{L}*|nejdem\\p{L}*|nebudem\\p{L}*|nehrajem\\p{L}*|nem[aá]me|nem[uů][žz]em\\p{L}*|nedoraz\\p{L}*|odhla[sš]\\p{L}*|bez n[aá]s|vynech\\p{L}*|nepojedem\\p{L}*|nikam)${END}`,
  "iu",
);
const REGISTER_RE = new RegExp(
  `${NOT_LETTER}(ano|jo|jj|jasn\\p{L}*|ur[čc]it\\p{L}*|p[řr]ihl\\p{L}*|hl[aá]s[ií]me|jdem\\p{L}*|bereme|beru|budem\\p{L}*|doraz[ií]me|po[čc][ií]tej\\p{L}*|zapi[šs]\\p{L}*|jsme tam|jsme v tom|m[aá]te n[aá]s|sem s t[ií]m|hrajem\\p{L}*|pojedem\\p{L}*|ok|oki|okej|platí|plat[ií]m)${END}`,
  "iu",
);

/**
 * Odpověď trenéra na pozvánku haly. Odmítnutí má přednost („jo, ale letos ne“).
 * Null = nedá se poznat, hala se doptá.
 */
export function classifyHallReply(text: string): HallReply | null {
  const t = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (DECLINE_RE.test(t)) return "decline";
  if (REGISTER_RE.test(t)) return "register";
  return null;
}

export interface RosterCandidate {
  id: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  rating: number;
  goalkeeping: number;
}

export type HallSlot = "GK" | "DEF" | "MID" | "FWD";

export interface HallRoster<T extends RosterCandidate> {
  lineup: Array<T & { slot: HallSlot }>;
  subs: T[];
}

/** 5+1 na hřišti: brankář, dva vzadu, jeden uprostřed, dva vpředu. */
const OUTFIELD_SLOTS: HallSlot[] = ["DEF", "DEF", "MID", "FWD", "FWD"];

/**
 * Šest do základu a čtyři na lavičku. Trenér může vybrat soupisku (`chosen`, nejvýš 10),
 * jinak jedou nejlepší zdraví. Když z vybraných zbude míň než šest, doplní se nejlepšími
 * ostatními, ať klub nemusí kontumovat. Méně než pět hráčů celkem = kontumace (prázdná sestava).
 */
export function pickHallRoster<T extends RosterCandidate>(available: T[], chosen: string[] | null): HallRoster<T> {
  const byRating = [...available].sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id));
  const chosenSet = chosen?.length ? new Set(chosen.slice(0, ROSTER_MAX)) : null;
  let pool = chosenSet ? byRating.filter((p) => chosenSet.has(p.id)) : byRating.slice();
  if (pool.length < HALL_FORMAT.squadSize) {
    const extra = byRating.filter((p) => !pool.includes(p)).slice(0, HALL_FORMAT.squadSize - pool.length);
    pool = [...pool, ...extra];
  }
  if (pool.length < HALL_FORMAT.squadSize - 1) return { lineup: [], subs: [] };

  const taken = new Set<string>();
  const keepers = pool.filter((p) => p.position === "GK").sort((a, b) => b.goalkeeping - a.goalkeeping);
  const gk = keepers[0] ?? [...pool].sort((a, b) => b.goalkeeping - a.goalkeeping)[0];
  taken.add(gk.id);
  const lineup: Array<T & { slot: HallSlot }> = [{ ...gk, slot: "GK" }];
  for (const slot of OUTFIELD_SLOTS) {
    const pick = pool.find((p) => !taken.has(p.id) && p.position === slot)
      ?? pool.find((p) => !taken.has(p.id) && p.position !== "GK")
      ?? pool.find((p) => !taken.has(p.id));
    if (!pick) break;
    taken.add(pick.id);
    lineup.push({ ...pick, slot });
  }
  const rest = pool.filter((p) => !taken.has(p.id));
  const backupKeeper = rest.find((p) => p.position === "GK");
  const subs = [...(backupKeeper ? [backupKeeper] : []), ...rest.filter((p) => p !== backupKeeper)].slice(0, ROSTER_MAX - lineup.length);
  return { lineup, subs };
}
