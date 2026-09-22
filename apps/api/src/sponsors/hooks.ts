/**
 * Automatické změny náklonnosti majitelů firem a setkání v hospodě.
 * Volá se z match-runneru, vyhodnocení výtržností, rolloveru a denního ticku.
 */
import { createRng } from "../generators/rng";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { hashSeed } from "../villages/officials-generator";
import { favorDeltaStmt } from "./favor";
import { DEFAULT_FAVOR, postMatchFavorDelta, SEASON_PARTNERSHIP_FAVOR } from "./favor-math";
import { isOwnerPersonality, type OwnerPersonality } from "./owners";

/** Majitelé, kteří přijali pozvání na tenhle zápas: označit jako přítomné a promítnout výsledek. */
export async function settleSponsorInvitations(
  db: D1Database, matchId: string, homeTeamId: string, homeScore: number, awayScore: number,
): Promise<void> {
  const rows = await db.prepare(
    `SELECT si.id, si.sponsor_id, so.personality FROM sponsor_invitations si
     LEFT JOIN sponsor_owners so ON so.sponsor_id = si.sponsor_id
     WHERE si.match_id = ? AND si.team_id = ? AND si.status = 'accepted'`,
  ).bind(matchId, homeTeamId).all<{ id: string; sponsor_id: number; personality: string | null }>();
  if (rows.results.length === 0) return;
  const stmts: D1PreparedStatement[] = [];
  for (const r of rows.results) {
    const p: OwnerPersonality = isOwnerPersonality(r.personality) ? r.personality : "businessman";
    stmts.push(db.prepare("UPDATE sponsor_invitations SET status = 'attended' WHERE id = ? AND status = 'accepted'").bind(r.id));
    stmts.push(favorDeltaStmt(db, r.sponsor_id, homeTeamId, postMatchFavorDelta(p, homeScore, awayScore)));
  }
  await db.batch(stmts);
  logger.info({ module: "sponsors", matchId }, `majitelé na tribuně: ${rows.results.length}`);
}

/** Výtržnost fanoušků: náklonnost klesne u všech majitelů, se kterými má klub vztah. */
export async function applyRiotFavorPenalty(db: D1Database, teamId: string): Promise<void> {
  await db.prepare(
    `UPDATE sponsor_team_favor SET
       favor = MAX(0, favor + CASE
         WHEN (SELECT personality FROM sponsor_owners so WHERE so.sponsor_id = sponsor_team_favor.sponsor_id) = 'cautious' THEN -4
         ELSE -2 END),
       updated_at = datetime('now')
     WHERE team_id = ?`,
  ).bind(teamId).run();
}

/** Rollover: sezóna spolupráce s hlavním sponzorem +5 náklonnosti. Vrací počet smluv. */
export async function rewardSeasonPartnerships(db: D1Database): Promise<number> {
  const res = await db.prepare(
    `INSERT INTO sponsor_team_favor (sponsor_id, team_id, favor, updated_at)
     SELECT sponsor_id, team_id, MIN(100, ? + ?), datetime('now') FROM sponsor_contracts
     WHERE status = 'active' AND category = 'main' AND sponsor_id IS NOT NULL
     ON CONFLICT(sponsor_id, team_id) DO UPDATE SET favor = MIN(100, favor + ?), updated_at = datetime('now')`,
  ).bind(DEFAULT_FAVOR, SEASON_PARTNERSHIP_FAVOR, SEASON_PARTNERSHIP_FAVOR).run();
  return res.meta.changes ?? 0;
}

/**
 * Týdenní: lidský klub bez aktivního setkání a bez setkání za posledních 21 dní
 * potká v hospodě majitele některé firmy z okresu. Fanoušci a patrioti chodí do hospody častěji.
 */
export async function generateSponsorPubEncounters(db: D1Database, gameDate: string): Promise<number> {
  const teams = await db.prepare(
    `SELECT t.id AS team_id, v.district FROM teams t JOIN villages v ON v.id = t.village_id
     WHERE t.user_id != 'ai' AND COALESCE(t.team_type, 'senior') != 'u21' AND t.name NOT LIKE 'DELETED-%'
       AND NOT EXISTS (SELECT 1 FROM sponsor_pub_encounters e WHERE e.team_id = t.id AND e.status = 'active')
       AND NOT EXISTS (SELECT 1 FROM sponsor_pub_encounters e WHERE e.team_id = t.id AND e.created_at > datetime(?, '-21 days'))`,
  ).bind(gameDate).all<{ team_id: string; district: string }>();

  const expiresAt = gameExpiry(gameDate, 5);
  let generated = 0;
  for (const t of teams.results) {
    const candidates = await db.prepare(
      `SELECT ds.id, COALESCE(so.personality, 'businessman') AS personality
       FROM district_sponsors ds LEFT JOIN sponsor_owners so ON so.sponsor_id = ds.id WHERE ds.district = ?`,
    ).bind(t.district).all<{ id: number; personality: string }>();
    if (candidates.results.length === 0) continue;
    const weights: Record<string, number> = {};
    for (const s of candidates.results) {
      weights[String(s.id)] = s.personality === "fan" || s.personality === "patriot" ? 3 : 1;
    }
    const rng = createRng(hashSeed(`${t.team_id}|sponsor-pub|${gameDate.slice(0, 10)}`));
    const sponsorId = Number(rng.weighted(weights));
    try {
      await db.prepare(
        `INSERT INTO sponsor_pub_encounters (id, sponsor_id, team_id, status, expires_at, created_at)
         VALUES (?, ?, ?, 'active', ?, ?)`,
      ).bind(crypto.randomUUID(), sponsorId, t.team_id, expiresAt, gameDate).run();
      generated++;
    } catch (e) {
      logger.warn({ module: "sponsors", teamId: t.team_id }, "insert sponsor pub encounter", e);
    }
  }
  return generated;
}

export async function expireSponsorPubEncounters(db: D1Database, gameDate: string): Promise<number> {
  const res = await db.prepare("UPDATE sponsor_pub_encounters SET status = 'expired' WHERE status = 'active' AND expires_at < ?")
    .bind(gameDate).run();
  return res.meta.changes ?? 0;
}
