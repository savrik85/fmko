export interface TransferSearchPlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  age: number;
  position: string;
  overall_rating: number;
  weekly_wage: number;
  skills: string;
  physical: string;
  avatar: string;
  squad_number: number | null;
  nationality: string | null;
  team_id: string;
  team_name: string;
}

export interface TransferSearchContext {
  leagueId: string;
  rootTeamId: string;
}

/** Normalizuje A-tým i jeho U21 na společný mateřský klub a seniorskou ligu. */
export async function resolveTransferSearchContext(
  db: D1Database,
  teamId: string,
): Promise<TransferSearchContext | null> {
  const row = await db.prepare(
    `SELECT COALESCE(l.parent_league_id, t.league_id) AS league_id,
     COALESCE(t.parent_team_id, t.id) AS root_team_id
     FROM teams t LEFT JOIN leagues l ON l.id = t.league_id
     WHERE t.id = ?`,
  ).bind(teamId).first<{ league_id: string | null; root_team_id: string }>();

  if (!row?.league_id) return null;
  return { leagueId: row.league_id, rootTeamId: row.root_team_id };
}

/**
 * Hráči soupeřů z vybrané A-ligy i její navázané U21 ligy.
 *
 * Filtrování jména, věku a pozice probíhá až ve webu, proto tento dotaz nesmí
 * ořezat výsledky pevným limitem — nízké ratingy U21 by se k hledání nedostaly.
 */
export async function findTransferSearchPlayerRows(
  db: D1Database,
  targetLeagueId: string,
  requestingTeamId: string,
): Promise<TransferSearchPlayerRow[]> {
  const rows = await db.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.nickname, p.age, p.position, p.overall_rating, p.weekly_wage,
     p.skills, p.physical, p.avatar, p.squad_number, p.nationality,
     t.id as team_id, t.name as team_name
     FROM players p JOIN teams t ON p.team_id = t.id
     WHERE t.league_id IN (
       SELECT id FROM leagues
       WHERE id = ? OR (parent_league_id = ? AND league_type = 'u21')
     )
       AND COALESCE(t.parent_team_id, t.id) != ?
       AND t.user_id != 'ai'
       AND (p.status IS NULL OR p.status = 'active')
     ORDER BY p.overall_rating DESC`,
  ).bind(targetLeagueId, targetLeagueId, requestingTeamId).all<TransferSearchPlayerRow>();

  return rows.results;
}
