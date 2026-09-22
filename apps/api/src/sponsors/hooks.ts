/**
 * Automatické změny náklonnosti majitelů firem a setkání v hospodě.
 * Volá se z match-runneru, vyhodnocení výtržností, rolloveru a denního ticku.
 */
import { createRng } from "../generators/rng";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { hashSeed } from "../villages/officials-generator";
import { favorDeltaStmt } from "./favor";
import { DEFAULT_FAVOR, postMatchFavorDelta, riotFavorDelta, SEASON_PARTNERSHIP_FAVOR, vipBoxFavorBonus } from "./favor-math";
import { isOwnerPersonality, type OwnerPersonality } from "./owners";

/**
 * Majitelé, kteří přijali pozvání na tenhle zápas: označit jako přítomné a promítnout výsledek.
 *
 * Nárok na každou pozvánku bere podmíněný UPDATE (`WHERE status = 'accepted'`) samostatně,
 * teprve pak se počítá náklonnost — souběžné dvojí odehrání téhož zápasu tak strhne dopad
 * jen jednou (druhý běh najde `changes === 0` a řádek přeskočí). Stejný princip jako claim
 * v `fans/resolve-match-incidents.ts`.
 *
 * VIP lóže (úroveň 0–3) přidá každému přítomnému majiteli vipBoxFavorBonus.
 */
export async function settleSponsorInvitations(
  db: D1Database, matchId: string, homeTeamId: string, homeScore: number, awayScore: number,
  vipBoxLevel = 0,
): Promise<void> {
  const rows = await db.prepare(
    `SELECT si.id, si.sponsor_id, so.personality FROM sponsor_invitations si
     LEFT JOIN sponsor_owners so ON so.sponsor_id = si.sponsor_id
     WHERE si.match_id = ? AND si.team_id = ? AND si.status = 'accepted'`,
  ).bind(matchId, homeTeamId).all<{ id: string; sponsor_id: number; personality: string | null }>();
  if (rows.results.length === 0) return;
  // Majitel pozvaný na domácí zápas sedí v lóži, pokud ji klub má. Výsledek
  // mu pohne náklonností jako dřív, lóže k tomu přidá pevný bonus.
  const vipBonus = vipBoxFavorBonus(vipBoxLevel);
  let claimed = 0;
  for (const r of rows.results) {
    const claim = await db.prepare(
      "UPDATE sponsor_invitations SET status = 'attended' WHERE id = ? AND status = 'accepted'",
    ).bind(r.id).run();
    if ((claim.meta?.changes ?? 0) !== 1) continue;
    claimed++;
    const p: OwnerPersonality = isOwnerPersonality(r.personality) ? r.personality : "businessman";
    await favorDeltaStmt(db, r.sponsor_id, homeTeamId, postMatchFavorDelta(p, homeScore, awayScore) + vipBonus).run();
  }
  logger.info({ module: "sponsors", matchId }, `majitelé na tribuně: ${claimed}, bonus lóže ${vipBonus}`);
}

/** Výtržnost fanoušků: náklonnost klesne u všech majitelů, se kterými má klub vztah. */
export async function applyRiotFavorPenalty(db: D1Database, teamId: string): Promise<void> {
  await db.prepare(
    `UPDATE sponsor_team_favor SET
       favor = MAX(0, favor + CASE
         WHEN (SELECT personality FROM sponsor_owners so WHERE so.sponsor_id = sponsor_team_favor.sponsor_id) = 'cautious' THEN ?
         ELSE ? END),
       updated_at = datetime('now')
     WHERE team_id = ?`,
  ).bind(riotFavorDelta("cautious"), riotFavorDelta("fan"), teamId).run();
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
       AND NOT EXISTS (SELECT 1 FROM sponsor_pub_encounters e WHERE e.team_id = t.id AND datetime(e.created_at) > datetime(?, '-21 days'))`,
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
      logger.warn({ module: "sponsors", teamId: t.team_id }, `insert sponsor pub encounter sponsor=${sponsorId}`, e);
    }
  }
  return generated;
}

export async function expireSponsorPubEncounters(db: D1Database, gameDate: string): Promise<number> {
  const res = await db.prepare("UPDATE sponsor_pub_encounters SET status = 'expired' WHERE status = 'active' AND expires_at < ?")
    .bind(gameDate).run();
  return res.meta.changes ?? 0;
}
