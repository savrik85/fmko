/**
 * Sdílená utilita pro výpočet ligové tabulky.
 * Jediný zdroj pravdy — používat VŠUDE kde se počítá pozice v lize.
 */

export interface StandingEntry {
  teamId: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  played: number;
  gf: number;
  ga: number;
  gd: number;
  pos: number;
}

/**
 * Vypočítá ligovou tabulku z odehraných zápasů.
 * Řazení: body DESC → skóre rozdíl DESC → vstřelené góly DESC
 */
export async function calculateStandings(
  db: D1Database,
  leagueId: string,
): Promise<StandingEntry[]> {
  // Get all teams in league
  const teamsResult = await db.prepare(
    "SELECT id FROM teams WHERE league_id = ?"
  ).bind(leagueId).all();

  const teamIds = teamsResult.results.map((t) => t.id as string);
  if (teamIds.length === 0) return [];

  // Init stats
  const stats: Record<string, { w: number; d: number; l: number; gf: number; ga: number }> = {};
  for (const tid of teamIds) stats[tid] = { w: 0, d: 0, l: 0, gf: 0, ga: 0 };

  // Get simulated matches — JEN z aktuální (nejvyšší) sezóny dané ligy.
  // league_id se reusuje napříč sezónami, takže bez filtru na season_number
  // by se do tabulky počítaly i staré odehrané sezóny. JOIN na season_calendar
  // zároveň implicitně vyžaduje calendar_id IS NOT NULL.
  const matches = await db.prepare(
    `SELECT m.home_team_id, m.away_team_id, m.home_score, m.away_score
     FROM matches m
     JOIN season_calendar sc ON sc.id = m.calendar_id
     WHERE m.league_id = ? AND m.status = 'simulated'
       AND sc.season_number = (SELECT MAX(season_number) FROM season_calendar WHERE league_id = ?)`
  ).bind(leagueId, leagueId).all();

  for (const m of matches.results) {
    const hid = m.home_team_id as string;
    const aid = m.away_team_id as string;
    const hs = m.home_score as number;
    const as_ = m.away_score as number;
    if (!stats[hid] || !stats[aid]) continue;

    stats[hid].gf += hs;
    stats[hid].ga += as_;
    stats[aid].gf += as_;
    stats[aid].ga += hs;

    if (hs > as_) { stats[hid].w++; stats[aid].l++; }
    else if (hs < as_) { stats[aid].w++; stats[hid].l++; }
    else { stats[hid].d++; stats[aid].d++; }
  }

  // Build standings
  const standings: StandingEntry[] = teamIds.map((tid) => {
    const s = stats[tid];
    const points = s.w * 3 + s.d;
    return {
      teamId: tid,
      points,
      wins: s.w,
      draws: s.d,
      losses: s.l,
      played: s.w + s.d + s.l,
      gf: s.gf,
      ga: s.ga,
      gd: s.gf - s.ga,
      pos: 0,
    };
  });

  // Sort: points DESC → goal difference DESC → goals for DESC
  standings.sort((a, b) => {
    const pd = b.points - a.points;
    if (pd !== 0) return pd;
    const gd = b.gd - a.gd;
    if (gd !== 0) return gd;
    return b.gf - a.gf;
  });

  // Assign positions
  standings.forEach((s, i) => { s.pos = i + 1; });

  return standings;
}

/**
 * Vrátí pozici konkrétního týmu v lize.
 */
export async function getTeamPosition(
  db: D1Database,
  leagueId: string,
  teamId: string,
): Promise<number> {
  const standings = await calculateStandings(db, leagueId);
  const entry = standings.find((s) => s.teamId === teamId);
  return entry?.pos ?? 0;
}
