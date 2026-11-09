/**
 * Založení klubu hráčem: jeden uživatel smí mít jedno áčko.
 *
 * Na `teams.user_id` není unikátní index (jeden uživatel má áčko i U21 a `ai` vlastní
 * všechny AI kluby), takže kontrola „už tým má?“ a vložení byly dva kroky a dva souběžné
 * POST /api/teams založily dva kluby. Tady je podmínka součástí jednoho INSERTu.
 */

export interface NewHumanTeam {
  id: string;
  userId: string;
  villageId: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  budget: number;
  jerseyPattern: string;
  badgePattern: string;
  stadiumName: string | null;
}

/** Stejná podmínka jako kontrola duplicity v POST /api/teams: U21 se nepočítá. */
const HAS_SENIOR_TEAM = "SELECT 1 FROM teams WHERE user_id = ? AND COALESCE(team_type, 'senior') <> 'u21'";

/** Vloží tým, jen když uživatel ještě žádné áčko nemá. Vrací, jestli se vložil. */
export async function insertHumanTeamOnce(db: D1Database, team: NewHumanTeam): Promise<boolean> {
  if (team.userId === "ai") throw new Error("insertHumanTeamOnce není pro AI kluby");
  const result = await db.prepare(
    `INSERT INTO teams (id, user_id, village_id, name, primary_color, secondary_color, budget, jersey_pattern, badge_pattern, stadium_name)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (${HAS_SENIOR_TEAM})`,
  ).bind(
    team.id, team.userId, team.villageId, team.name, team.primaryColor, team.secondaryColor,
    team.budget, team.jerseyPattern, team.badgePattern, team.stadiumName, team.userId,
  ).run();
  return (result.meta.changes ?? 0) > 0;
}
