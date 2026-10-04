/**
 * Přehled přestupů klubu: kdo přišel a kdo odešel, odkud/kam a za kolik.
 *
 * Zdrojem je `player_contracts`, kam každý přestup, výměna, podpis volného hráče i propuštění zapisují
 * řádek. Protistrana se hledá podle pořadí kontraktů téhož hráče (podle `created_at`, protože `joined_at`
 * bývá herní datum a `created_at` skutečný čas zápisu).
 */
export type TransferKind = "transfer" | "swap" | "free_agent" | "released";

export interface TransferOverviewRow {
  direction: "in" | "out";
  kind: TransferKind;
  playerId: string;
  playerName: string;
  otherTeamId: string | null;
  otherTeamName: string | null;
  fee: number;
  seasonNumber: number | null;
  date: string;
}

const PLAYER_NAME_SQL = `COALESCE(p.first_name || ' ' || p.last_name, dp.first_name || ' ' || dp.last_name, 'Neznámý hráč')`;

export async function loadTransferOverview(db: D1Database, teamId: string, limit = 50): Promise<TransferOverviewRow[]> {
  const cap = Math.max(1, Math.min(200, Math.floor(limit)));

  // Příchody: kontrakt, kterým hráč do klubu přišel. Protistrana = klub z předchozího kontraktu (jen u přestupu a výměny).
  const arrivals = await db
    .prepare(
      `SELECT pc.player_id, pc.join_type AS kind, pc.fee, pc.joined_at AS date, pc.created_at, s.number AS season_number,
              ${PLAYER_NAME_SQL} AS player_name,
              CASE WHEN pc.join_type IN ('transfer', 'swap') THEN
                (SELECT prev.team_id FROM player_contracts prev
                  WHERE prev.player_id = pc.player_id AND prev.id != pc.id AND prev.created_at <= pc.created_at
                  ORDER BY prev.created_at DESC LIMIT 1) END AS other_id
       FROM player_contracts pc
       LEFT JOIN seasons s ON s.id = pc.season_id
       LEFT JOIN players p ON p.id = pc.player_id
       LEFT JOIN departed_players dp ON dp.id = pc.player_id
       WHERE pc.team_id = ? AND pc.join_type IN ('transfer', 'swap', 'free_agent')
       ORDER BY pc.joined_at DESC LIMIT ?`,
    )
    .bind(teamId, cap)
    .all<{ player_id: string; kind: string; fee: number | null; date: string; created_at: string; season_number: number | null; player_name: string; other_id: string | null }>();

  // Odchody: kontrakt, který skončil přestupem nebo propuštěním. Protistrana, cena i sezóna patří následujícímu kontraktu (u propuštění sezóna není známá).
  const departures = await db
    .prepare(
      `SELECT pc.player_id, pc.leave_type AS kind, pc.left_at AS date, pc.created_at,
              ${PLAYER_NAME_SQL} AS player_name,
              CASE WHEN pc.leave_type = 'transfer' THEN
                (SELECT nx.team_id FROM player_contracts nx
                  WHERE nx.player_id = pc.player_id AND nx.id != pc.id AND nx.created_at >= pc.created_at AND nx.join_type IN ('transfer', 'swap')
                  ORDER BY nx.created_at ASC LIMIT 1) END AS other_id,
              CASE WHEN pc.leave_type = 'transfer' THEN
                (SELECT nx.fee FROM player_contracts nx
                  WHERE nx.player_id = pc.player_id AND nx.id != pc.id AND nx.created_at >= pc.created_at AND nx.join_type IN ('transfer', 'swap')
                  ORDER BY nx.created_at ASC LIMIT 1) END AS fee,
              CASE WHEN pc.leave_type = 'transfer' THEN
                (SELECT ns.number FROM player_contracts nx JOIN seasons ns ON ns.id = nx.season_id
                  WHERE nx.player_id = pc.player_id AND nx.id != pc.id AND nx.created_at >= pc.created_at AND nx.join_type IN ('transfer', 'swap')
                  ORDER BY nx.created_at ASC LIMIT 1) END AS season_number
       FROM player_contracts pc
       LEFT JOIN players p ON p.id = pc.player_id
       LEFT JOIN departed_players dp ON dp.id = pc.player_id
       WHERE pc.team_id = ? AND pc.left_at IS NOT NULL AND pc.leave_type IN ('transfer', 'released')
       ORDER BY pc.left_at DESC LIMIT ?`,
    )
    .bind(teamId, cap)
    .all<{ player_id: string; kind: string; fee: number | null; date: string; created_at: string; season_number: number | null; player_name: string; other_id: string | null }>();

  const otherIds = [...new Set([...arrivals.results, ...departures.results].map((r) => r.other_id).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (otherIds.length > 0) {
    const res = await db
      .prepare(`SELECT id, name FROM teams WHERE id IN (${otherIds.map(() => "?").join(",")})`)
      .bind(...otherIds)
      .all<{ id: string; name: string }>();
    for (const t of res.results) names.set(t.id, t.name);
  }

  const rows: Array<TransferOverviewRow & { createdAt: string }> = [
    ...arrivals.results.map((r) => ({
      direction: "in" as const,
      kind: r.kind as TransferKind,
      playerId: r.player_id,
      playerName: r.player_name,
      otherTeamId: r.other_id,
      otherTeamName: r.other_id ? names.get(r.other_id) ?? null : null,
      fee: r.fee ?? 0,
      seasonNumber: r.season_number,
      date: r.date,
      createdAt: r.created_at,
    })),
    ...departures.results.map((r) => ({
      direction: "out" as const,
      kind: r.kind as TransferKind,
      playerId: r.player_id,
      playerName: r.player_name,
      otherTeamId: r.other_id,
      otherTeamName: r.other_id ? names.get(r.other_id) ?? null : null,
      fee: r.fee ?? 0,
      seasonNumber: r.season_number,
      date: r.date,
      createdAt: r.created_at,
    })),
  ];
  // Podle data události (příchod = joined_at, odchod = left_at); ISO řetězce se řadí abecedně.
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  return rows.slice(0, cap).map(({ createdAt: _c, ...row }) => row);
}
