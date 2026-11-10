/**
 * Návrat hráče z hostování ke kmenovému klubu: dva příkazy, které sdílí každá cesta zpět
 * (konec lhůty v denním ticku, stažení půjčujícím, ukončení hostujícím klubem, převzetí
 * klubu AI trenérem).
 *
 * Hostující hráč smí u hostitele do U21. Dřív každá cesta psala přesun po svém a počítala
 * s tím, že hráč sedí v áčku hostitele: smlouvu hostování hledala podle `players.team_id`
 * (ta je ale vedená na klub, ne na U21), takže zůstala otevřená, a příznaky návratu z U21
 * (`parent_club_id`, `next_match_return`) nechala být. Hráč s nimi se po dalším zápase U21
 * kmenového klubu „vrátil“ do áčka bývalého hostitele.
 */

export type LoanLeaveType = "loan_end" | "loan_recalled" | "loan_terminated";

/**
 * Přesun hráče zpět na soupisku, ze které odešel. Projde jen u hráče, který od ní pořád
 * hostuje, ať je u hostitele v áčku, nebo v U21. Příznaky návratu z U21 patřily hostiteli
 * a s hostováním končí.
 */
export function returnLoanedPlayerStmt(db: D1Database, playerId: string, lenderRosterTeamId: string): D1PreparedStatement {
  return db.prepare(
    `UPDATE players SET team_id = ?, loan_from_team_id = NULL, loan_until = NULL, parent_club_id = NULL, next_match_return = 0
      WHERE id = ? AND loan_from_team_id = ?`,
  ).bind(lenderRosterTeamId, playerId, lenderRosterTeamId);
}

/** Zavře smlouvu hostování podle hráče, ne podle soupisky, na které zrovna sedí. */
export function closeLoanContractStmt(db: D1Database, playerId: string, leftAt: string, leaveType: LoanLeaveType): D1PreparedStatement {
  return db.prepare(
    "UPDATE player_contracts SET is_active = 0, left_at = ?, leave_type = ? WHERE player_id = ? AND join_type = 'loan' AND is_active = 1",
  ).bind(leftAt, leaveType, playerId);
}
