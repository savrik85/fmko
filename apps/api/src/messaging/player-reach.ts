/**
 * Dá se hráči z telefonu ještě napsat?
 *
 * Konverzace s hráčem v telefonu zůstává, i když hráč odešel (přestup, konec kariéry).
 * Psát mu ale dál nejde: odpověď by nepřišla a SMS by stála kredit naprázdno. Jedno
 * pravidlo pro všechna místa, která to řeší (odeslání zprávy, odpověď hráče, odložené
 * odpovědi): hráč patří ke klubu, když za něj hraje (áčko nebo U21), nebo když mu klub
 * dál patří a jinde jen hostuje.
 */

/** SQL podmínka „hráč `p` patří ke klubu týmu z parametru“. Parametr se váže dvakrát. */
const CLUB_OF_PARAM = "COALESCE((SELECT parent_team_id FROM teams WHERE id = ?), ?)";

export async function playerInClub(db: D1Database, playerId: string, teamId: string): Promise<boolean> {
  const row = await db.prepare(
    `SELECT 1 AS x
       FROM players p
       JOIN teams current_team ON current_team.id = p.team_id
       LEFT JOIN teams owner_team ON owner_team.id = p.loan_from_team_id
      WHERE p.id = ?
        AND (COALESCE(current_team.parent_team_id, current_team.id) = ${CLUB_OF_PARAM}
          OR COALESCE(owner_team.parent_team_id, owner_team.id) = ${CLUB_OF_PARAM})`,
  ).bind(playerId, teamId, teamId, teamId, teamId).first<{ x: number }>();
  return !!row;
}

/** Věta, kterou telefon ukáže místo pole pro psaní. */
export const PLAYER_GONE_HINT = "Už u nás nehraje.";
