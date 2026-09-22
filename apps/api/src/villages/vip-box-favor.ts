/**
 * VIP lóže a zastupitelé obce.
 *
 * Kdo z pozvaných zastupitelů zápas opravdu prosedí (pozvánka `attended`),
 * tomu přibude osobní přízeň podle úrovně lóže. Volá se z match-runneru až
 * za zámkem zápasu, takže se za jeden zápas připíše nejvýš jednou.
 */
import { logger } from "../lib/logger";
import { calculateFacilityEffects } from "../stadium/stadium-generator";

export async function applyVipBoxVillageFavor(
  db: D1Database,
  matchId: string,
  homeTeamId: string,
  vipBoxLevel: number,
  now: string = new Date().toISOString(),
): Promise<number> {
  // vipBoxLevel sem přichází už jako efektivní úroveň z match-runneru (0, pokud
  // klub nemá tribuny) — stands: 1 tu jen zabrání, aby calculateFacilityEffects
  // level znovu nevynulovalo kvůli chybějícím tribunám ve vstupu.
  const bonus = calculateFacilityEffects({ vip_box: vipBoxLevel, stands: 1 }).vipBoxVillageFavorBonus;
  if (bonus <= 0) return 0;

  const rows = await db.prepare(
    `SELECT vi.official_id, vo.village_id
     FROM village_invitations vi
     JOIN village_officials vo ON vo.id = vi.official_id
     WHERE vi.match_id = ? AND vi.team_id = ? AND vi.status = 'attended'`,
  ).bind(matchId, homeTeamId).all<{ official_id: string; village_id: string }>();

  let applied = 0;
  for (const r of rows.results) {
    try {
      const existing = await db.prepare(
        "SELECT id FROM village_team_favor WHERE team_id = ? AND official_id = ?",
      ).bind(homeTeamId, r.official_id).first<{ id: string }>();
      if (existing) {
        await db.prepare(
          `UPDATE village_team_favor
           SET favor = MIN(100, favor + ?), last_interaction_at = ?, updated_at = ?
           WHERE id = ?`,
        ).bind(bonus, now, now, existing.id).run();
      } else {
        // Osobní řádek se zakládá líně z výchozích 50, stejně jako u brigád.
        await db.prepare(
          `INSERT INTO village_team_favor (id, village_id, team_id, official_id, favor, trust, last_interaction_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 50, ?, ?)`,
        ).bind(crypto.randomUUID(), r.village_id, homeTeamId, r.official_id, Math.min(100, 50 + bonus), now, now).run();
      }
      applied++;
    } catch (e) {
      logger.warn({ module: "villages", matchId, teamId: homeTeamId }, `přízeň zastupitele ${r.official_id} z VIP lóže`, e);
    }
  }
  logger.info({ module: "villages", matchId, teamId: homeTeamId }, `VIP lóže: zastupitelů v lóži ${applied}, +${bonus} přízně`);
  return applied;
}
