/**
 * Kabinet — interní vlákno vedení soutěže.
 *
 * Čte a píše do něj JEN ten, kdo v soutěži právě zastává funkci. Pozastavený
 * předseda přístup neztrácí — dokud ho kluby neodvolají, do vedení pořád patří
 * a má právo se hájit.
 *
 * Jméno i role se u zprávy ukládají jako snapshot: až pisateli skončí mandát,
 * musí u staré zprávy zůstat, kým byl, když ji psal.
 */

import { logger } from "../lib/logger";
import { ROLE_LABEL, type OfficialRole } from "./defaults";

const M = "competition-board";

export const BOARD_MESSAGE_MAX = 500;

export interface BoardSeat {
  role: OfficialRole;
  roleLabel: string;
  status: string;
}

/** Zastává tenhle klub v soutěži funkci? Vrací null, když ne. */
export async function seatOf(
  db: D1Database, leagueId: string, teamId: string, seasonNumber: number,
): Promise<BoardSeat | null> {
  const row = await db.prepare(
    `SELECT role, status FROM competition_officials
      WHERE league_id = ? AND team_id = ? AND season_number = ?
        AND status IN ('active','suspended')
      LIMIT 1`
  ).bind(leagueId, teamId, seasonNumber).first<{ role: string; status: string }>()
    .catch((e) => { logger.warn({ module: M }, "místo ve vedení", e); return null; });
  if (!row) return null;
  return {
    role: row.role as OfficialRole,
    roleLabel: ROLE_LABEL[row.role as OfficialRole] ?? row.role,
    status: row.status,
  };
}

export interface BoardMessage {
  id: string;
  teamId: string;
  senderName: string;
  senderRole: string;
  body: string;
  sentAt: string;
}

export async function listMessages(
  db: D1Database, leagueId: string, limit = 60,
): Promise<BoardMessage[]> {
  const rows = await db.prepare(
    `SELECT id, team_id, sender_name, sender_role, body, sent_at
       FROM competition_board_messages
      WHERE league_id = ? ORDER BY sent_at DESC LIMIT ?`
  ).bind(leagueId, limit).all<{
    id: string; team_id: string; sender_name: string; sender_role: string;
    body: string; sent_at: string;
  }>().catch((e) => { logger.warn({ module: M }, "výpis kabinetu", e); return { results: [] }; });

  // Nejstarší nahoře — vlákno se čte odshora dolů jako rozhovor.
  return rows.results.reverse().map((r) => ({
    id: r.id, teamId: r.team_id, senderName: r.sender_name,
    senderRole: ROLE_LABEL[r.sender_role as OfficialRole] ?? r.sender_role,
    body: r.body, sentAt: r.sent_at,
  }));
}

export async function postMessage(db: D1Database, opts: {
  leagueId: string; seasonNumber: number; teamId: string;
  senderName: string; seat: BoardSeat; body: string;
}): Promise<string | null> {
  const body = opts.body.trim().slice(0, BOARD_MESSAGE_MAX);
  if (!body) return null;

  const id = crypto.randomUUID();
  const res = await db.prepare(
    `INSERT INTO competition_board_messages
      (id, league_id, season_number, team_id, sender_name, sender_role, body)
     VALUES (?,?,?,?,?,?,?)`
  ).bind(id, opts.leagueId, opts.seasonNumber, opts.teamId, opts.senderName, opts.seat.role, body)
    .run().catch((e) => { logger.error({ module: M }, "zápis do kabinetu", e); return null; });
  if (!res) return null;

  await markRead(db, opts.leagueId, opts.teamId);
  return id;
}

export async function markRead(db: D1Database, leagueId: string, teamId: string): Promise<void> {
  await db.prepare(
    `INSERT INTO competition_board_reads (league_id, team_id, last_read_at)
     VALUES (?,?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
     ON CONFLICT(league_id, team_id) DO UPDATE SET last_read_at = excluded.last_read_at`
  ).bind(leagueId, teamId).run()
    .catch((e) => logger.warn({ module: M }, "označení kabinetu za přečtený", e));
}

/** Kolik zpráv přibylo od posledního přečtení. */
export async function unreadCount(
  db: D1Database, leagueId: string, teamId: string,
): Promise<number> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM competition_board_messages m
      WHERE m.league_id = ? AND m.team_id != ?
        AND m.sent_at > COALESCE(
          (SELECT last_read_at FROM competition_board_reads WHERE league_id = ? AND team_id = ?),
          '')`
  ).bind(leagueId, teamId, leagueId, teamId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "nepřečtené v kabinetu", e); return null; });
  return row?.n ?? 0;
}
