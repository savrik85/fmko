/**
 * Kdo co vidí na trhu: volní hráči a inzeráty. Jedna pravidla pro manažera (routy Přestupů)
 * i pro AI trenéra, ať AI klub nevidí nic, co člověk nevidí, a naopak.
 *
 * Od 2026-10-25 jsou AI kluby na trhu jako ostatní kluby ve hře: jejich inzeráty jsou vidět
 * i z jiných soutěží a hráči, které propustily, i z jiných okresů. Vygenerovaní volní hráči
 * a inzeráty klubů mimo hru (`is_ai_listing`) zůstávají ve svém okrese a své lize, jinak by je
 * soutěže s víc manažery vyzobaly ostatním.
 */

import { logger } from "../lib/logger";

function rejectedBy(raw: unknown, what: string): string[] {
  try {
    const parsed: unknown = JSON.parse((raw as string) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch (e) {
    logger.warn({ module: "market-visibility" }, `parse rejected_by (${what})`, e);
    return [];
  }
}

/**
 * Volní hráči, které klub vidí: z vlastního okresu všichni, z jiných okresů jen propuštění
 * klubem ve hře jiného majitele. Hráč, který klub už odmítl, se mu nenabízí.
 */
export async function findVisibleFreeAgents(
  db: D1Database,
  team: { id: string; district: string; userId: string | null },
): Promise<Record<string, unknown>[]> {
  const agents = await db.prepare(
    `SELECT fa.*, v.lat as v_lat, v.lng as v_lon, v.name as village_name
       FROM free_agents fa
       LEFT JOIN villages v ON fa.village_id = v.id
       LEFT JOIN teams rt ON rt.id = fa.released_from_team_id
      WHERE fa.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        AND (fa.district = ?
             OR (fa.source IN ('released', 'quit') AND rt.user_id IS NOT NULL
                 AND (rt.user_id = 'ai' OR rt.user_id != ?)))
      ORDER BY fa.overall_rating DESC`,
  ).bind(team.district, team.userId ?? "").all<Record<string, unknown>>();
  return agents.results.filter((fa) => !rejectedBy(fa.rejected_by, "free agent").includes(team.id));
}

/**
 * Aktivní inzeráty, které klub vidí: ve své lize všechny (i kluby mimo hru), z ostatních
 * soutěží inzeráty klubů ve hře (lidských i AI). Vlastní inzeráty a ty, u kterých klub
 * hráč už odmítl, se vynechají.
 */
export async function findVisibleListings(db: D1Database, team: { id: string; leagueId: string }): Promise<Record<string, unknown>[]> {
  const listings = await db.prepare(
    `SELECT tl.id, tl.player_id, tl.team_id, tl.asking_price, tl.expires_at, tl.is_ai_listing, tl.ai_player_data, tl.rejected_by,
     tl.league_id, l.name as league_name, l.district as league_district,
     p.first_name, p.last_name, p.age, p.position, p.overall_rating, p.avatar as player_avatar, p.skills, p.nationality,
     t.name as team_name, t.user_id as team_user_id, i.days_remaining as injury_days
     FROM transfer_listings tl
     LEFT JOIN players p ON tl.player_id = p.id AND tl.is_ai_listing = 0
     LEFT JOIN teams t ON tl.team_id = t.id AND tl.is_ai_listing = 0
     LEFT JOIN leagues l ON l.id = tl.league_id
     LEFT JOIN injuries i ON p.id = i.player_id AND i.days_remaining > 0 AND tl.is_ai_listing = 0
     WHERE tl.status = 'active' AND tl.team_id != ?
       AND (tl.league_id = ? OR (tl.is_ai_listing = 0 AND t.id IS NOT NULL))
     ORDER BY CASE WHEN tl.league_id = ? THEN 0 ELSE 1 END, tl.created_at DESC`,
  ).bind(team.id, team.leagueId, team.leagueId).all<Record<string, unknown>>();
  return listings.results.filter((l) => !rejectedBy(l.rejected_by, "listing").includes(team.id));
}
