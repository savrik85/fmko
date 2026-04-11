/**
 * FMK-18: Přátelské výzvy mezi hráčskými týmy.
 */

export interface ChallengeData {
  challengerTeamId: string;
  challengedTeamId: string;
  message?: string;
  expiresInHours?: number;
}

/**
 * Create a friendly match challenge.
 */
export async function createChallenge(
  db: D1Database,
  data: ChallengeData,
): Promise<string> {
  const id = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + (data.expiresInHours ?? 48));

  await db.prepare(
    "INSERT INTO challenges (id, challenger_team_id, challenged_team_id, message, expires_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, data.challengerTeamId, data.challengedTeamId, data.message ?? "", expiresAt.toISOString()).run();

  return id;
}

/**
 * Accept a challenge — creates a match.
 */
export async function acceptChallenge(
  db: D1Database,
  challengeId: string,
): Promise<string> {
  const challenge = await db.prepare(
    "SELECT * FROM challenges WHERE id = ? AND status = 'pending'"
  ).bind(challengeId).first<Record<string, unknown>>();

  if (!challenge) throw new Error("Challenge not found or already resolved");

  // Check not expired
  if (new Date(challenge.expires_at as string) < new Date()) {
    await db.prepare("UPDATE challenges SET status = 'expired' WHERE id = ?").bind(challengeId).run();
    throw new Error("Challenge expired");
  }

  // Create match
  const matchId = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO matches (id, home_team_id, away_team_id, status) VALUES (?, ?, ?, 'lineups_open')"
  ).bind(matchId, challenge.challenger_team_id, challenge.challenged_team_id).run();

  // Update challenge
  await db.prepare(
    "UPDATE challenges SET status = 'accepted', match_id = ? WHERE id = ?"
  ).bind(matchId, challengeId).run();

  return matchId;
}

/**
 * Decline a challenge.
 */
export async function declineChallenge(
  db: D1Database,
  challengeId: string,
): Promise<void> {
  await db.prepare(
    "UPDATE challenges SET status = 'declined' WHERE id = ? AND status = 'pending'"
  ).bind(challengeId).run();
}

/**
 * Get pending challenges for a team.
 */
export async function getPendingChallenges(
  db: D1Database,
  teamId: string,
): Promise<unknown[]> {
  const result = await db.prepare(
    `SELECT c.*, t.name as challenger_name, v.name as challenger_village
     FROM challenges c
     JOIN teams t ON c.challenger_team_id = t.id
     JOIN villages v ON t.village_id = v.id
     WHERE c.challenged_team_id = ? AND c.status = 'pending' AND c.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
     ORDER BY c.created_at DESC`
  ).bind(teamId).all();
  return result.results;
}
