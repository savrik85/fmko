/**
 * FMK-20: Okresní chat — zprávy v rámci ligy.
 */

export interface ChatMessage {
  id: string;
  leagueId: string;
  teamId: string;
  teamName: string;
  message: string;
  isSystem: boolean;
  createdAt: string;
}

/**
 * Send a chat message.
 */
export async function sendMessage(
  db: D1Database,
  leagueId: string,
  teamId: string,
  teamName: string,
  message: string,
): Promise<string> {
  const id = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO chat_messages (id, league_id, team_id, team_name, message) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, leagueId, teamId, teamName, message).run();
  return id;
}

/**
 * Send a system message (match results, season events).
 */
export async function sendSystemMessage(
  db: D1Database,
  leagueId: string,
  message: string,
): Promise<void> {
  await db.prepare(
    "INSERT INTO chat_messages (id, league_id, team_id, team_name, message, is_system) VALUES (?, ?, 'system', 'Obecní rozhlas', ?, 1)"
  ).bind(crypto.randomUUID(), leagueId, message).run();
}

/**
 * Get recent chat messages for a league.
 */
export async function getMessages(
  db: D1Database,
  leagueId: string,
  limit: number = 50,
  before?: string,
): Promise<ChatMessage[]> {
  let sql = "SELECT * FROM chat_messages WHERE league_id = ?";
  const params: unknown[] = [leagueId];

  if (before) {
    sql += " AND created_at < ?";
    params.push(before);
  }

  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);

  const result = await db.prepare(sql).bind(...params).all();
  return result.results.map((r) => ({
    id: r.id as string,
    leagueId: r.league_id as string,
    teamId: r.team_id as string,
    teamName: r.team_name as string,
    message: r.message as string,
    isSystem: !!(r.is_system as number),
    createdAt: r.created_at as string,
  }));
}

/**
 * Post match results as system messages.
 */
export async function postMatchResults(
  db: D1Database,
  leagueId: string,
  results: Array<{ homeTeam: string; awayTeam: string; homeScore: number; awayScore: number }>,
): Promise<void> {
  const lines = results.map((r) =>
    `${r.homeTeam} ${r.homeScore}:${r.awayScore} ${r.awayTeam}`
  );
  const message = `⚽ Výsledky kola:\n${lines.join("\n")}`;
  await sendSystemMessage(db, leagueId, message);
}
