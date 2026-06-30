/**
 * Sdílené odebrání hráče z kádru s kompletním FK úklidem.
 *
 * Jediný zdroj pravdy pro mazání hráče — používá HTTP release endpoint
 * i konec sezony (důchod / rodinné důvody).
 *
 * Pořadí úklidu je odvozeno z ověřeného release endpointu (game.ts):
 * nejdřív zrušit listings/offers a vyčistit team *_id odkazy, smazat
 * FK-vázané tabulky (player_stats, injuries, relationships, watchlist),
 * AŽ POTOM atomicky DELETE FROM players.
 *
 * POZOR: match_player_stats se ZÁMĚRNĚ nemaže (nemá FK na players) —
 * drží kariérní/awards historii i po odchodu hráče.
 */

import { logger } from "../lib/logger";

export type LeaveType = "released" | "retired" | "quit" | "transfer";

export interface RemovedPlayer {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string;
  age: number;
  position: string;
  overallRating: number;
  teamId: string;
  teamName: string;
  leagueId: string | null;
}

export interface RemovePlayerResult {
  ok: boolean;
  reason?: "not_found";
  player?: RemovedPlayer;
}

export interface RemovePlayerOptions {
  /** Vložit hráče do poolu volných hráčů (jen released/transfer; důchod/quit = false). */
  toFreeAgent?: boolean;
  /** ISO expirace inzerátu volného hráče (default +7 dní). */
  faExpiresAt?: string;
  /** Omezit na konkrétní tým (ochrana proti race). */
  teamId?: string;
}

/**
 * Odebere hráče z kádru. Vrací data odebraného hráče (pro navazující news).
 */
export async function removePlayer(
  db: D1Database,
  playerId: string,
  leaveType: LeaveType,
  opts: RemovePlayerOptions = {},
): Promise<RemovePlayerResult> {
  const row = await db
    .prepare(
      `SELECT p.*, t.name AS team_name, t.league_id AS team_league_id, t.village_id AS team_village_id, v.district AS district
       FROM players p
       JOIN teams t ON p.team_id = t.id
       JOIN villages v ON t.village_id = v.id
       WHERE p.id = ?${opts.teamId ? " AND p.team_id = ?" : ""}`,
    )
    .bind(...(opts.teamId ? [playerId, opts.teamId] : [playerId]))
    .first<Record<string, unknown>>();
  if (!row) return { ok: false, reason: "not_found" };

  const teamId = row.team_id as string;

  // 1) Vyčistit reference (každá může selhat nezávisle, nekritické)
  await db.prepare("UPDATE transfer_listings SET status = 'withdrawn' WHERE player_id = ? AND status = 'active'").bind(playerId).run().catch((e) => logger.warn({ module: "remove-player" }, "withdraw listings", e));
  await db.prepare("UPDATE transfer_offers SET status = 'withdrawn' WHERE player_id = ? AND status IN ('pending','countered')").bind(playerId).run().catch((e) => logger.warn({ module: "remove-player" }, "withdraw offers", e));
  await db.prepare("UPDATE transfer_offers SET status = 'withdrawn' WHERE offered_player_id = ? AND status IN ('pending','countered')").bind(playerId).run().catch((e) => logger.warn({ module: "remove-player" }, "withdraw swap offers", e));
  await db.prepare("UPDATE teams SET captain_id = NULL WHERE captain_id = ?").bind(playerId).run().catch((e) => logger.warn({ module: "remove-player" }, "clear captain", e));
  await db.prepare("UPDATE teams SET penalty_taker_id = NULL WHERE penalty_taker_id = ?").bind(playerId).run().catch((e) => logger.warn({ module: "remove-player" }, "clear penalty taker", e));
  await db.prepare("UPDATE teams SET freekick_taker_id = NULL WHERE freekick_taker_id = ?").bind(playerId).run().catch((e) => logger.warn({ module: "remove-player" }, "clear freekick taker", e));
  await db.prepare("DELETE FROM player_stats WHERE player_id = ?").bind(playerId).run().catch((e) => logger.warn({ module: "remove-player" }, "delete player_stats", e));
  await db.prepare("DELETE FROM injuries WHERE player_id = ?").bind(playerId).run().catch((e) => logger.warn({ module: "remove-player" }, "delete injuries", e));
  await db.prepare("DELETE FROM player_watchlist WHERE player_id = ?").bind(playerId).run().catch((e) => logger.warn({ module: "remove-player" }, "delete watchlist", e));
  // FK constraint na players(id) by blokoval DELETE FROM players
  await db.prepare("DELETE FROM training_log WHERE player_id = ?").bind(playerId).run().catch((e) => logger.warn({ module: "remove-player" }, "delete training_log", e));
  await db.prepare("DELETE FROM condition_log WHERE player_id = ?").bind(playerId).run().catch((e) => logger.warn({ module: "remove-player" }, "delete condition_log", e));
  await db.prepare("UPDATE matches SET mom_player_id = NULL WHERE mom_player_id = ?").bind(playerId).run().catch((e) => logger.warn({ module: "remove-player" }, "clear mom_player_id", e));
  await db.prepare("DELETE FROM relationships WHERE player_a_id = ? OR player_b_id = ?").bind(playerId, playerId).run().catch((e) => logger.warn({ module: "remove-player" }, "delete relationships", e));

  // Aktuální globální sezóna pro archivní záznam (best-effort)
  const seasonRow = await db.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ number: number }>().catch((e) => { logger.warn({ module: "remove-player" }, "load season for archive", e); return null; });

  // 2) Atomický batch: archiv identity + (volitelně) INSERT free_agent + UPDATE contract + DELETE player
  const batch: D1PreparedStatement[] = [];

  // Archiv odešlého hráče — jméno přežije pro historické statistiky (neklikatelný záznam)
  batch.push(
    db.prepare(
      `INSERT OR REPLACE INTO departed_players
         (id, first_name, last_name, nickname, position, age, overall_rating, team_id, team_name, league_id, leave_type, season_number, left_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
    ).bind(
      playerId, row.first_name, row.last_name, row.nickname ?? null, row.position,
      row.age ?? null, row.overall_rating ?? null, teamId, row.team_name ?? null,
      (row.team_league_id as string) ?? null, leaveType, seasonRow?.number ?? null,
    ),
  );

  if (opts.toFreeAgent) {
    // free_agents.source CHECK povoluje jen 'generated' | 'released' | 'quit'
    const faSource = leaveType === "quit" ? "quit" : "released";
    let expiresAt = opts.faExpiresAt;
    if (!expiresAt) {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      expiresAt = d.toISOString();
    }
    batch.push(
      db.prepare(
        `INSERT INTO free_agents (id, district, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, hidden_talent, weekly_wage, source, released_from_team_id, village_id, expires_at, is_celebrity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(), row.district, row.first_name, row.last_name, row.nickname ?? null,
        row.age, row.position, row.overall_rating,
        row.skills, row.physical ?? "{}", row.personality ?? "{}", row.life_context ?? "{}",
        row.avatar ?? "{}", row.hidden_talent ?? 0, row.weekly_wage ?? 0,
        faSource, teamId, row.team_village_id, expiresAt, (row.is_celebrity as number) ?? 0,
      ),
    );
  }

  batch.push(
    db.prepare(
      "UPDATE player_contracts SET leave_type = ?, is_active = 0, left_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE player_id = ? AND team_id = ? AND is_active = 1",
    ).bind(leaveType, playerId, teamId),
  );
  batch.push(db.prepare("DELETE FROM players WHERE id = ?").bind(playerId));

  await db.batch(batch);

  return {
    ok: true,
    player: {
      id: playerId,
      firstName: row.first_name as string,
      lastName: row.last_name as string,
      nickname: (row.nickname as string) ?? "",
      age: row.age as number,
      position: row.position as string,
      overallRating: row.overall_rating as number,
      teamId,
      teamName: row.team_name as string,
      leagueId: (row.team_league_id as string) ?? null,
    },
  };
}
