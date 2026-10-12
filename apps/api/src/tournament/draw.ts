/**
 * Los Turnaje P-Mobile: rozpis ligové fáze, rozdělení na hřiště, pavouk play-off.
 * Čisté funkce bez DB — testy v draw.test.ts.
 *
 * Ligová fáze: každý tým odehraje přesně K zápasů proti K různým soupeřům, nejvýš jeden
 * zápas denně. Základ je metoda kruhu (každé kolo = všichni hrají najednou):
 *   - sudý počet týmů: N−1 kol, vybere se K z nich → K hracích dnů,
 *   - lichý počet: kruh s volným losem dá N kol; vybere se K kol (K sudé) a týmy, které
 *     v nich měly volno (je jich přesně K), se utkají mezi sebou v dni K+1.
 * Z mnoha náhodných pokusů vyhraje rozpis s nejvíc zápasy mezi okresy a nejvyrovnanější
 * silou soupeřů.
 *
 * Skupiny: 4 skupiny (do čtvrtfinále první dva z každé), nebo 3 skupiny (první dva z každé
 * a dva nejlepší ze třetích míst). Ve skupině každý s každým.
 */

import { createRng, type Rng } from "../generators/rng";

export interface DrawTeam {
  id: string;
  district: string | null;
  reputation: number;
  /** Obec klubu: kluby ze stejné obce los dává do různých skupin. */
  village?: string | null;
}

export interface DrawPair {
  home: string;
  away: string;
}

/** Ligová fáze: dny (index 0 = den 1), v každém dni zápasy. */
export type LeagueSchedule = DrawPair[][];

export interface DrawVenue {
  id: string;
  capacity: number;
  isMain: boolean;
}

/** Kolik hracích dnů zabere ligová fáze s K zápasy na tým. */
export function leagueDays(teamCount: number, matchesPerTeam: number): number {
  return teamCount % 2 === 0 ? matchesPerTeam : matchesPerTeam + 1;
}

/** Play-off: od čtvrtfinále pro 8+ týmů, jinak od semifinále (4–7 týmů). */
export function playoffStages(teamCount: number): Array<"qf" | "sf" | "final"> {
  return teamCount >= 8 ? ["qf", "sf", "final"] : ["sf", "final"];
}

export const MIN_TEAMS = 4;
// 7 až 12 dní celkem (propozice) → ligová fáze má 4 až 9 hracích dnů s play-off od čtvrtfinále.
const MIN_MATCHES = 3;
const MAX_MATCHES = 9;

export type DrawFormat = "league" | "groups";

export interface DrawOption {
  format: DrawFormat;
  /** U skupin nejvyšší počet zápasů na tým (menší skupiny hrají o zápas méně). */
  matchesPerTeam: number;
  leagueDays: number;
  totalDays: number;
  roundRobin: boolean;
  groupSizes?: number[];
}

/** Možnosti pro admin po uzávěrce: jedna tabulka s K zápasy nebo skupiny, a výsledná délka turnaje. */
export function drawOptions(teamCount: number): DrawOption[] {
  if (teamCount < MIN_TEAMS) return [];
  const all = allDrawOptions(teamCount);
  // Propozice slibují 7 až 12 dní; u malého turnaje, kde to nejde, se nabídne, co jde.
  const promised = all.filter((o) => o.totalDays >= 7 && o.totalDays <= 12);
  const groups = GROUP_COUNTS.map((n) => groupsOption(teamCount, n)).filter((o): o is DrawOption => o != null);
  return [...(promised.length > 0 ? promised : all), ...groups];
}

// ── Skupiny ──

export const GROUP_COUNT = 4;
/** Nabízené počty skupin: 4 (postupují první dva) a 3 (první dva a dva nejlepší třetí). */
export const GROUP_COUNTS = [4, 3] as const;
/** Z každé skupiny postupují první dva; u 3 skupin k nim dva nejlepší ze třetích míst → 8 do čtvrtfinále. */
export const GROUP_ADVANCING = 2;
export const BEST_THIRDS = 2;

export function groupCode(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Velikosti skupin: větší skupiny jsou první (18 týmů → 5, 5, 4, 4). */
export function groupSizes(teamCount: number, groupCount = GROUP_COUNT): number[] {
  const base = Math.floor(teamCount / groupCount);
  const extra = teamCount % groupCount;
  return Array.from({ length: groupCount }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Kola skupiny každý s každým: při lichém počtu má v každém kole jeden tým volno. */
function groupRounds(size: number): number {
  return size % 2 === 0 ? size - 1 : size;
}

/**
 * Skupiny se nabídnou, jen když v každé jsou aspoň 3 týmy (u 3 skupin aspoň 4, ať je co
 * porovnávat mezi třetími) a turnaj vyjde na slíbených 7 až 12 dní.
 */
function groupsOption(teamCount: number, groupCount: number): DrawOption | null {
  const sizes = groupSizes(teamCount, groupCount);
  if (sizes.some((n) => n < (groupCount === 3 ? 4 : 3))) return null;
  const days = Math.max(...sizes.map(groupRounds));
  const totalDays = days + playoffStages(teamCount).length;
  if (totalDays < 7 || totalDays > 12) return null;
  return { format: "groups", matchesPerTeam: Math.max(...sizes) - 1, leagueDays: days, totalDays, roundRobin: true, groupSizes: sizes };
}

/** Penalizace rozdělení: nerovnoměrné okresy (hlavní) a kluby ze stejné obce v jedné skupině. */
function groupPenalty(groups: DrawTeam[][], districtShare: Map<string, number>): number {
  let spread = 0;
  let sameVillage = 0;
  for (const g of groups) {
    for (const [district, share] of districtShare) {
      const n = g.filter((t) => (t.district ?? "") === district).length;
      spread += (n - share * g.length) ** 2;
    }
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        if (g[i].village && g[i].village === g[j].village) sameVillage++;
      }
    }
  }
  return spread * 10 + sameVillage * 3;
}

/**
 * Los do skupin z košů podle reputace. Koš má tolik týmů, kolik je skupin, takže
 * nejsilnější kluby jsou nasazení každý do jiné skupiny. Neúplný poslední koš (nejslabší)
 * se dolosuje do větších skupin. Z mnoha pokusů vyhraje rozdělení s okresy rozprostřenými
 * rovnoměrně a kluby ze stejné obce v různých skupinách. Deterministický podle `seed`.
 * Vrací id týmů po skupinách (index 0 = skupina A).
 */
export function drawGroups(teams: DrawTeam[], seed: number, groupCount = GROUP_COUNT, attempts = 3000): string[][] {
  const sizes = groupSizes(teams.length, groupCount);
  if (sizes.some((n) => n < 3)) throw new Error(`Na ${groupCount} skupiny je potřeba aspoň ${groupCount * 3} týmů`);
  const rng = createRng(seed);
  // Při shodné reputaci rozhodne o koši los (sort je stabilní, pořadí po zamíchání zůstane).
  const ranked = rng.shuffle([...teams]).sort((a, b) => b.reputation - a.reputation);
  const pots: DrawTeam[][] = [];
  for (let i = 0; i < ranked.length; i += groupCount) pots.push(ranked.slice(i, i + groupCount));

  const districtShare = new Map<string, number>();
  for (const t of teams) districtShare.set(t.district ?? "", (districtShare.get(t.district ?? "") ?? 0) + 1 / teams.length);

  let best: DrawTeam[][] | null = null;
  let bestPenalty = Infinity;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const groups: DrawTeam[][] = sizes.map(() => []);
    for (const pot of pots) {
      // Neúplný koš jde jen do prvních (větších) skupin.
      const slots = rng.shuffle(Array.from({ length: pot.length }, (_, i) => i));
      pot.forEach((t, i) => groups[slots[i]].push(t));
    }
    const penalty = groupPenalty(groups, districtShare);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      best = groups;
    }
  }
  return (best as DrawTeam[][]).map((g) => g.map((t) => t.id));
}

/**
 * Rozpis skupin: v každé každý s každým (metoda kruhu). Skupina s méně koly hraje ob den,
 * aby všechny skupiny začínaly i končily ve stejný den (18 týmů: pětky hrají 5 dní,
 * čtyřky 1., 3. a 5. den). Index dne 0 = den 1.
 */
export function buildGroupSchedule(groups: string[][], seed: number): LeagueSchedule {
  const rng = createRng(seed);
  const days = Math.max(...groups.map((g) => groupRounds(g.length)));
  const schedule: LeagueSchedule = Array.from({ length: days }, () => []);
  for (const group of groups) {
    const rounds = circleRounds<string>(rng.shuffle([...group]));
    rounds.forEach((pairs, i) => {
      const day = rounds.length === 1 ? days - 1 : Math.round((i * (days - 1)) / (rounds.length - 1));
      for (const [a, b] of pairs) {
        if (a != null && b != null) schedule[day].push({ home: a, away: b });
      }
    });
  }
  return schedule;
}

/** Pořadí týmů z různých skupin (třetí místa, nasazení do čtvrtfinále): body, rozdíl skóre, góly. */
export function compareAcrossGroups(x: StandingRow, y: StandingRow): number {
  return y.points - x.points
    || (y.goalsFor - y.goalsAgainst) - (x.goalsFor - x.goalsAgainst)
    || y.goalsFor - x.goalsFor;
}

/**
 * Čtvrtfinále ze 3 skupin (tabulky seřazené, index 0 = 1. místo; při shodě rozhoduje pořadí
 * `reputationOrder`, vyšší reputace první). Postupují vítězové, druzí a dva nejlepší třetí.
 * Nasazení: vítězové 1.–3., druzí 4.–6., třetí 7.–8. (vždy podle compareAcrossGroups).
 * Pavouk 1–8, 4–5 | 2–7, 3–6 jako playoffSeeding; když by se potkaly týmy ze stejné skupiny,
 * prohodí se spodní nasazení tak, aby se od pavouka odchýlila co nejméně.
 */
export function threeGroupPlayoffSeeding(tables: StandingRow[][], reputationOrder: string[] = []): { pairs: DrawPair[]; bestThirds: string[] } {
  const groupOf = new Map<string, number>();
  tables.forEach((t, g) => t.forEach((r) => groupOf.set(r.teamId, g)));
  const rep = (id: string) => {
    const i = reputationOrder.indexOf(id);
    return i < 0 ? Infinity : i;
  };
  const rank = (rows: StandingRow[]) => [...rows].sort((x, y) => compareAcrossGroups(x, y) || rep(x.teamId) - rep(y.teamId));
  const winners = rank(tables.map((t) => t[0]));
  const runners = rank(tables.map((t) => t[1]));
  const thirds = rank(tables.map((t) => t[2])).slice(0, BEST_THIRDS);
  const seeds = [...winners, ...runners, ...thirds].map((r) => r.teamId);
  const top = [0, 3, 1, 2];
  const ideal = [7, 4, 6, 5];
  let best: number[] = ideal;
  let bestCost = Infinity;
  const permute = (rest: number[], acc: number[]) => {
    if (rest.length === 0) {
      if (acc.some((b, i) => groupOf.get(seeds[top[i]]) === groupOf.get(seeds[b]))) return;
      const cost = acc.reduce((sum, b, i) => sum + Math.abs(b - ideal[i]), 0);
      if (cost < bestCost) { bestCost = cost; best = acc; }
      return;
    }
    rest.forEach((b, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, b]));
  };
  permute(ideal, []);
  return {
    pairs: top.map((t, i) => ({ home: seeds[t], away: seeds[best[i]] })),
    bestThirds: thirds.map((r) => r.teamId),
  };
}

/**
 * Čtvrtfinále ze 4 skupin (pořadí ve skupině, index 0 = 1. místo): A1–B2, C1–D2, B1–A2, D1–C2.
 * Vítězové 1. a 2. čtvrtfinále hrají spolu semifinále, stejně 3. a 4., takže týmy ze stejné
 * skupiny se znovu potkají nejdřív ve finále.
 */
export function groupPlayoffSeeding(rankings: string[][]): DrawPair[] {
  const [a, b, c, d] = rankings;
  return [
    { home: a[0], away: b[1] },
    { home: c[0], away: d[1] },
    { home: b[0], away: a[1] },
    { home: d[0], away: c[1] },
  ];
}

function allDrawOptions(teamCount: number): DrawOption[] {
  const out: DrawOption[] = [];
  for (let k = MIN_MATCHES; k <= Math.min(MAX_MATCHES, teamCount - 1); k++) {
    // Lichý počet týmů: N·K zápasových účastí musí jít spárovat → K sudé.
    if (teamCount % 2 === 1 && k % 2 === 1) continue;
    const days = leagueDays(teamCount, k);
    out.push({ format: "league", matchesPerTeam: k, leagueDays: days, totalDays: days + playoffStages(teamCount).length, roundRobin: k === teamCount - 1 });
  }
  return out;
}

/** Metoda kruhu: kola úplných párování. Null = volný los. */
export function circleRounds<T>(items: readonly (T | null)[]): Array<Array<[T | null, T | null]>> {
  const list = [...items];
  if (list.length % 2 === 1) list.push(null);
  const n = list.length;
  const rounds: Array<Array<[T | null, T | null]>> = [];
  const rot = list.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const order = [list[0], ...rot];
    const pairs: Array<[T | null, T | null]> = [];
    for (let i = 0; i < n / 2; i++) {
      // Střídání pořadí, ať první tým není pořád „domácí".
      const a = order[i];
      const b = order[n - 1 - i];
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    rot.unshift(rot.pop() as T | null);
  }
  return rounds;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Dokonalé párování skupiny týmů bez soupeřů, se kterými už hráli (backtracking). */
function matchWithoutRepeats(ids: string[], played: Set<string>, rng: Rng): DrawPair[] | null {
  if (ids.length === 0) return [];
  const [first, ...rest] = ids;
  const candidates = rng.shuffle([...rest]);
  for (const other of candidates) {
    if (played.has(pairKey(first, other))) continue;
    const remaining = rest.filter((x) => x !== other);
    const sub = matchWithoutRepeats(remaining, played, rng);
    if (sub) return [{ home: first, away: other }, ...sub];
  }
  return null;
}

function scoreSchedule(schedule: LeagueSchedule, teams: Map<string, DrawTeam>): number {
  let cross = 0;
  const oppRep = new Map<string, number[]>();
  for (const day of schedule) {
    for (const m of day) {
      const h = teams.get(m.home);
      const a = teams.get(m.away);
      if (!h || !a) continue;
      if ((h.district ?? "") !== (a.district ?? "")) cross++;
      oppRep.set(h.id, [...(oppRep.get(h.id) ?? []), a.reputation]);
      oppRep.set(a.id, [...(oppRep.get(a.id) ?? []), h.reputation]);
    }
  }
  // Vyrovnanost: rozptyl průměrné reputace soupeřů napříč týmy (menší = spravedlivější los).
  const avgs = [...oppRep.values()].map((r) => r.reduce((s, x) => s + x, 0) / r.length);
  const mean = avgs.reduce((s, x) => s + x, 0) / Math.max(1, avgs.length);
  const variance = avgs.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, avgs.length);
  return cross * 10 - Math.sqrt(variance);
}

/**
 * Rozpis ligové fáze. Deterministický podle `seed`.
 * Vyhodí chybu, když K pro daný počet týmů nedává smysl (viz drawOptions).
 */
export function buildLeagueSchedule(teams: DrawTeam[], matchesPerTeam: number, seed: number, attempts = 300): LeagueSchedule {
  const n = teams.length;
  const k = matchesPerTeam;
  if (n < MIN_TEAMS) throw new Error(`Na turnaj je potřeba aspoň ${MIN_TEAMS} týmů`);
  if (k < 1 || k > n - 1) throw new Error(`Počet zápasů ${k} nejde odehrát s ${n} týmy`);
  if (n % 2 === 1 && k % 2 === 1) throw new Error("Při lichém počtu týmů musí být počet zápasů sudý");

  const byId = new Map(teams.map((t) => [t.id, t]));
  const rng = createRng(seed);
  let best: LeagueSchedule | null = null;
  let bestScore = -Infinity;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const order = rng.shuffle(teams.map((t) => t.id));
    const rounds = circleRounds<string>(order);
    // Kola s víc zápasy mezi okresy mají přednost; mezi stejnými rozhodne náhoda.
    const crossIn = (r: number) => rounds[r].filter(([a, b]) =>
      a != null && b != null && (byId.get(a)?.district ?? "") !== (byId.get(b)?.district ?? "")).length;
    const tieBreak = new Map(rounds.map((_, i) => [i, rng.random()]));
    const chosen = rounds.map((_, i) => i)
      .sort((a, b) => crossIn(b) - crossIn(a) || (tieBreak.get(a) ?? 0) - (tieBreak.get(b) ?? 0))
      .slice(0, k)
      .sort((a, b) => a - b);

    const schedule: LeagueSchedule = [];
    const played = new Set<string>();
    const resting: string[] = [];
    for (const r of chosen) {
      const day: DrawPair[] = [];
      for (const [a, b] of rounds[r]) {
        if (a == null || b == null) {
          resting.push((a ?? b) as string);
          continue;
        }
        day.push({ home: a, away: b });
        played.add(pairKey(a, b));
      }
      schedule.push(day);
    }

    if (n % 2 === 1) {
      // Týmy s volnem dohrají svůj K-tý zápas v posledním dni, každý s novým soupeřem.
      const extra = matchWithoutRepeats(resting, played, rng);
      if (!extra) continue;
      schedule.push(extra);
    }

    const score = scoreSchedule(schedule, byId);
    if (score > bestScore) {
      bestScore = score;
      best = schedule;
    }
  }

  if (!best) throw new Error("Rozpis se nepodařilo sestavit, zkus jiný počet zápasů");
  return best;
}

/**
 * Hřiště pro zápasy jednoho dne. Na hlavní stadion jde zápas s nejvíc týmy, které tam
 * ještě nehrály, mezi nimi ten nejatraktivnější (součet reputací). Ostatní zápasy podle
 * atraktivity dostanou hřiště, na kterém jejich týmy byly nejméně (při shodě větší), ať
 * kluby během turnaje poznají víc hřišť. `history` (tým → hřiště → počet) se doplňuje.
 */
export function assignVenues(
  day: DrawPair[],
  venues: DrawVenue[],
  reputation: Map<string, number>,
  history: Map<string, Map<string, number>>,
): string[] {
  const main = venues.find((v) => v.isMain);
  const side = venues.filter((v) => !v.isMain).sort((a, b) => b.capacity - a.capacity);
  if (!main) throw new Error("Areál nemá hlavní stadion");
  if (day.length > side.length + 1) throw new Error(`Na ${day.length} souběžných zápasů nestačí ${side.length + 1} hřišť`);

  const visits = (team: string, venue: string) => history.get(team)?.get(venue) ?? 0;
  const visit = (team: string, venue: string) => {
    const per = history.get(team) ?? new Map<string, number>();
    per.set(venue, (per.get(venue) ?? 0) + 1);
    history.set(team, per);
  };
  const appeal = (m: DrawPair) => (reputation.get(m.home) ?? 0) + (reputation.get(m.away) ?? 0);
  const fresh = (m: DrawPair) => (visits(m.home, main.id) === 0 ? 1 : 0) + (visits(m.away, main.id) === 0 ? 1 : 0);

  const order = day.map((m, i) => ({ m, i })).sort((a, b) => appeal(b.m) - appeal(a.m));
  const onMain = [...order].sort((a, b) => fresh(b.m) - fresh(a.m) || appeal(b.m) - appeal(a.m))[0];

  const result: string[] = new Array(day.length);
  if (onMain) {
    result[onMain.i] = main.id;
    visit(onMain.m.home, main.id);
    visit(onMain.m.away, main.id);
  }
  const free = [...side];
  for (const { m, i } of order) {
    if (onMain && i === onMain.i) continue;
    let bestIdx = 0;
    for (let k = 1; k < free.length; k++) {
      const score = visits(m.home, free[k].id) + visits(m.away, free[k].id);
      const best = visits(m.home, free[bestIdx].id) + visits(m.away, free[bestIdx].id);
      if (score < best) bestIdx = k;
    }
    const v = free.splice(bestIdx, 1)[0];
    result[i] = v.id;
    visit(m.home, v.id);
    visit(m.away, v.id);
  }
  return result;
}

/** Hřiště pro play-off: hlavní stadion, pak vedlejší od největšího. */
export function playoffVenues(count: number, venues: DrawVenue[]): string[] {
  const main = venues.find((v) => v.isMain);
  const side = venues.filter((v) => !v.isMain).sort((a, b) => b.capacity - a.capacity);
  if (!main) throw new Error("Areál nemá hlavní stadion");
  return [main, ...side].slice(0, count).map((v) => v.id);
}

/** Pavouk: kdo s kým podle pořadí v tabulce (index 0 = 1. místo). */
export function playoffSeeding(ranked: string[], stage: "qf" | "sf"): DrawPair[] {
  if (stage === "qf") {
    const [s1, s2, s3, s4, s5, s6, s7, s8] = ranked;
    // Pozice 1+2 → semifinále 1, pozice 3+4 → semifinále 2 (1. a 2. se potkají až ve finále).
    return [
      { home: s1, away: s8 },
      { home: s4, away: s5 },
      { home: s2, away: s7 },
      { home: s3, away: s6 },
    ];
  }
  const [s1, s2, s3, s4] = ranked;
  return [
    { home: s1, away: s4 },
    { home: s2, away: s3 },
  ];
}

export interface StandingRow {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface PlayedMatch {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
}

/**
 * Tabulka ligové fáze i skupiny. Pořadí (stejně jako v Info turnaje):
 *   1. body,
 *   2. body ze vzájemných zápasů týmů se stejným počtem bodů,
 *   3. rozdíl skóre ze vzájemných zápasů,
 *   4. vstřelené góly ze vzájemných zápasů,
 *   5. celkový rozdíl skóre,
 *   6. celkem vstřelené góly,
 *   7. vyšší reputace klubu (pak jméno, ať je pořadí vždy stejné).
 */
export function computeStandings(
  teams: Array<{ id: string; name: string; reputation: number }>,
  matches: PlayedMatch[],
): StandingRow[] {
  const table = (ids: Set<string>) => {
    const rows = new Map<string, StandingRow>([...ids].map((id) => [id, {
      teamId: id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0,
    }]));
    for (const m of matches) {
      const h = rows.get(m.home);
      const a = rows.get(m.away);
      if (!h || !a) continue;
      h.played++; a.played++;
      h.goalsFor += m.homeScore; h.goalsAgainst += m.awayScore;
      a.goalsFor += m.awayScore; a.goalsAgainst += m.homeScore;
      if (m.homeScore > m.awayScore) { h.won++; a.lost++; h.points += 3; }
      else if (m.homeScore < m.awayScore) { a.won++; h.lost++; a.points += 3; }
      else { h.drawn++; a.drawn++; h.points++; a.points++; }
    }
    return rows;
  };
  const rows = table(new Set(teams.map((t) => t.id)));
  // Vzájemné zápasy: minitabulka jen ze zápasů mezi týmy se stejným počtem bodů.
  const headToHead = new Map<string, StandingRow>();
  for (const pts of new Set([...rows.values()].map((r) => r.points))) {
    const tied = [...rows.values()].filter((r) => r.points === pts);
    if (tied.length < 2) continue;
    for (const [id, r] of table(new Set(tied.map((r) => r.teamId)))) headToHead.set(id, r);
  }
  const meta = new Map(teams.map((t) => [t.id, t]));
  const h2h = (id: string) => headToHead.get(id) ?? { points: 0, goalsFor: 0, goalsAgainst: 0 };
  return [...rows.values()].sort((x, y) =>
    y.points - x.points
    || h2h(y.teamId).points - h2h(x.teamId).points
    || (h2h(y.teamId).goalsFor - h2h(y.teamId).goalsAgainst) - (h2h(x.teamId).goalsFor - h2h(x.teamId).goalsAgainst)
    || h2h(y.teamId).goalsFor - h2h(x.teamId).goalsFor
    || (y.goalsFor - y.goalsAgainst) - (x.goalsFor - x.goalsAgainst)
    || y.goalsFor - x.goalsFor
    || (meta.get(y.teamId)?.reputation ?? 0) - (meta.get(x.teamId)?.reputation ?? 0)
    || (meta.get(x.teamId)?.name ?? "").localeCompare(meta.get(y.teamId)?.name ?? "", "cs"));
}

/** Body za výsledek z pohledu týmu (3 výhra, 1 remíza). */
export function pointsFor(myScore: number, oppScore: number): number {
  return myScore > oppScore ? 3 : myScore === oppScore ? 1 : 0;
}
