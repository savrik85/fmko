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

/**
 * Tým, za který hráč právě hraje, pokud je to klub konverzace nebo jeho U21. Hráč na hostování
 * jinde nebo cizí hráč: null. Všechno, co trenér hráči „zařídí“ textem v chatu (slib docházky,
 * kolečka, poslední šance, odměna), smí dopadnout jen na vlastní kádr: jinak by trenér klubu A
 * vyrobil omluvenku nebo vynechaný trénink hráči, který teď hraje za klub B.
 */
export async function ownSquadTeamId(db: D1Database, playerId: string, clubTeamId: string): Promise<string | null> {
  const row = await db.prepare(
    `SELECT p.team_id FROM players p JOIN teams t ON t.id = p.team_id
      WHERE p.id = ?1 AND (p.status IS NULL OR p.status = 'active')
        AND (t.id = ?2 OR (t.parent_team_id = ?2 AND t.team_type = 'u21'))`,
  ).bind(playerId, clubTeamId).first<{ team_id: string }>();
  return row?.team_id ?? null;
}
