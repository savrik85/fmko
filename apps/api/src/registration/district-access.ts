/** Jediné pravidlo pro otevření okresu, používané onboardingem i zápisem týmu. */
export async function districtAccess(db: D1Database, district: string, userId?: string): Promise<string | null> {
  const registration = await db.prepare(
    `SELECT d.status, d.founder_request_id, d.founder_team_id, r.user_id AS founder_user_id
     FROM district_registrations d LEFT JOIN league_requests r ON r.id = d.founder_request_id
     WHERE d.district = ?`
  ).bind(district).first<{ status: string; founder_request_id: string | null; founder_team_id: string | null; founder_user_id: string | null }>();
  if (registration?.status !== "ready") return "Pro tento okres právě připravujeme data. Registraci týmů otevřeme po dokončení přípravy.";
  if (userId) {
    const user = await db.prepare("SELECT registration_district FROM users WHERE id = ?")
      .bind(userId).first<{ registration_district: string | null }>();
    if (!user) return "Účet nebyl nalezen.";
    if (user.registration_district && user.registration_district !== district) return "Svůj tým můžeš založit pouze ve vybraném okrese.";
  }
  if (registration.founder_request_id && !registration.founder_team_id && registration.founder_user_id !== userId) {
    return "Okres už je připravený. Nejprve svůj klub založí zakladatel ligy, pak se připojí ostatní manažeři.";
  }
  return null;
}

/** První mandát jen rezervovanému zakladateli. Nikdy nepřebírá ani neobnovuje cizí mandát. */
export async function appointFounder(db: D1Database, userId: string, teamId: string): Promise<void> {
  const founder = await db.prepare(
    `SELECT d.district, d.founder_request_id, t.league_id, s.number AS season_number, t.game_date
     FROM district_registrations d
     JOIN league_requests r ON r.id = d.founder_request_id AND r.user_id = ? AND r.status = 'activated'
     JOIN teams t ON t.id = ? AND t.user_id = r.user_id
     JOIN villages v ON v.id = t.village_id AND v.district = d.district
     JOIN leagues l ON l.id = t.league_id JOIN seasons s ON s.id = l.season_id
     WHERE d.founder_team_id IS NULL AND d.status = 'ready'`
  ).bind(userId, teamId).first<{ district: string; founder_request_id: string; league_id: string; season_number: number; game_date: string | null }>();
  if (!founder) return;
  const mandateId = `founder:${founder.founder_request_id}`;
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO competition_officials
      (id, league_id, role, team_id, season_number, elected_game_date)
      SELECT ?, ?, 'predseda', ?, ?, ? WHERE NOT EXISTS (
        SELECT 1 FROM competition_officials WHERE league_id = ? AND role = 'predseda' AND season_number = ?
      )`).bind(mandateId, founder.league_id, teamId, founder.season_number, founder.game_date, founder.league_id, founder.season_number),
    db.prepare(`UPDATE district_registrations SET founder_team_id = ? WHERE district = ? AND founder_team_id IS NULL
      AND EXISTS (SELECT 1 FROM competition_officials WHERE id = ? AND team_id = ?)`)
      .bind(teamId, founder.district, mandateId, teamId),
    db.prepare(`UPDATE competition_elections SET status = 'decided', winner_team_id = ?, closed_game_date = ?,
      result_note = 'První mandát zakladatele ligy.' WHERE league_id = ? AND role = 'predseda' AND season_number = ?
      AND status = 'open' AND EXISTS (SELECT 1 FROM competition_officials WHERE id = ? AND team_id = ?)`)
      .bind(teamId, founder.game_date, founder.league_id, founder.season_number, mandateId, teamId),
  ]);
}
