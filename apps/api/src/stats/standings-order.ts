/**
 * Jediné pořadí ligové tabulky. Používá ho výpočet tabulky (stats/standings.ts,
 * league/standings.ts) i obě routy s tabulkou (routes/league.ts), takže pořadí na webu,
 * v novinách i při rozdělování odměn a postupu je vždy stejné.
 *
 * Pořadí: body, vzájemné zápasy (body a pak rozdíl skóre mezi týmy se stejným počtem bodů),
 * celkový rozdíl skóre, vstřelené góly a nakonec id týmu. Poslední klíč je jen proto, aby
 * úplná shoda nedopadla pokaždé jinak podle pořadí řádků z databáze.
 */

export interface RankedRow {
  teamId: string;
  points: number;
  gf: number;
  ga: number;
}

export interface RankedMatch {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
}

interface HeadToHead {
  points: number;
  goalDiff: number;
}

/** Minitabulka ze zápasů, které mezi sebou odehrály jen týmy ze skupiny. */
function headToHead(group: ReadonlySet<string>, matches: readonly RankedMatch[]): Map<string, HeadToHead> {
  const table = new Map<string, HeadToHead>();
  for (const id of group) table.set(id, { points: 0, goalDiff: 0 });
  for (const m of matches) {
    const home = table.get(m.homeTeamId);
    const away = table.get(m.awayTeamId);
    if (!home || !away) continue;
    home.goalDiff += m.homeScore - m.awayScore;
    away.goalDiff += m.awayScore - m.homeScore;
    if (m.homeScore > m.awayScore) home.points += 3;
    else if (m.homeScore < m.awayScore) away.points += 3;
    else { home.points += 1; away.points += 1; }
  }
  return table;
}

/** Seřadí řádky tabulky (nový seznam, vstup nemění). `matches` = odehrané zápasy téže sezóny. */
export function sortStandings<T extends RankedRow>(rows: readonly T[], matches: readonly RankedMatch[]): T[] {
  const byPoints = new Map<number, T[]>();
  for (const row of rows) {
    const group = byPoints.get(row.points);
    if (group) group.push(row);
    else byPoints.set(row.points, [row]);
  }
  const sorted: T[] = [];
  for (const points of [...byPoints.keys()].sort((a, b) => b - a)) {
    const group = byPoints.get(points)!;
    if (group.length > 1) {
      const mini = headToHead(new Set(group.map((r) => r.teamId)), matches);
      group.sort((a, b) => {
        const ha = mini.get(a.teamId)!;
        const hb = mini.get(b.teamId)!;
        return hb.points - ha.points
          || hb.goalDiff - ha.goalDiff
          || (b.gf - b.ga) - (a.gf - a.ga)
          || b.gf - a.gf
          || (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0);
      });
    }
    sorted.push(...group);
  }
  return sorted;
}

/** Řádek zápasu z databáze (sloupce tabulky matches) na vstup řazení. */
export function toRankedMatch(m: Record<string, unknown>): RankedMatch {
  return {
    homeTeamId: m.home_team_id as string,
    awayTeamId: m.away_team_id as string,
    homeScore: m.home_score as number,
    awayScore: m.away_score as number,
  };
}
