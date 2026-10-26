/**
 * Nabídky místních hráčů (hospodský, trenér dorostu, kapitán, starosta) jako služby: jedna
 * implementace pro routu (člověk) i pro AI trenéra (ai-coach/player-offers.ts).
 *
 * Vytaženo beze změny z `routes/game.ts`: přijetí založí stejného hráče (talent, strop rozvoje,
 * bydliště, vazby na spoluhráče, vztah k trenérovi), smlouvu a strhne stejnou registraci.
 * Při přijetí ani odmítnutí se nikomu nic nepíše (ani dřív se nepsalo).
 */

import { createRng, cryptoSeed } from "../generators/rng";
import { logger } from "../lib/logger";
import { mustSeason } from "../lib/season";
import { recordTransaction } from "../season/finance-processor";

const M = "player-offer-actions";

/** Registrace hráče z nabídky. */
export const PLAYER_OFFER_SIGNING_FEE = 500;

export interface PlayerOfferFailure {
  ok: false;
  status: 404 | 409;
  error: string;
}

export type AcceptPlayerOfferResult =
  | { ok: true; playerId: string; player: Record<string, unknown> | null }
  | PlayerOfferFailure;

/** POST /teams/:teamId/player-offers/:offerId/accept: podpis nabídnutého hráče. */
export async function acceptPlayerOffer(db: D1Database, teamId: string, offerId: string): Promise<AcceptPlayerOfferResult> {
  const offer = await db.prepare("SELECT * FROM player_offers WHERE id = ? AND team_id = ? AND status = 'pending'")
    .bind(offerId, teamId).first<Record<string, unknown>>();
  if (!offer) return { ok: false, status: 404, error: "Nabídka nenalezena" };

  // Atomicky claimni offer — pokud někdo souběžně už přijal, claim selže a nevytvoříme duplicitního hráče.
  const claim = await db.prepare("UPDATE player_offers SET status = 'accepted' WHERE id = ? AND team_id = ? AND status = 'pending'")
    .bind(offerId, teamId).run();
  if (claim.meta.changes === 0) {
    return { ok: false, status: 409, error: "Nabídka už byla zpracována" };
  }

  const playerId = crypto.randomUUID();
  // Skrytý talent z nabídky se musí propsat do sloupce hidden_talent — jinak by
  // zobrazený badge "✨ Talent" byl fikce (dřívější bug: INSERT ho zahazoval → default 0).
  const offerPersonality = (() => { try { return JSON.parse((offer.personality as string) ?? "{}"); } catch (e) { logger.warn({ module: M }, "parse offer personality", e); return {}; } })();
  const hiddenTalent = Math.max(0, Math.round(offerPersonality.hiddenTalent ?? 0));
  // Strop rozvoje (skills_max) dodal při vzniku nabídky společný generátor a leží
  // v `life_context.skillsMax`. Starší nabídky (před sjednocením generátorů) ho nemají,
  // pro ty zůstává dřívější dopočet z talentu.
  const offerLifeContext = (() => { try { return JSON.parse((offer.life_context as string) ?? "{}"); } catch (e) { logger.warn({ module: M }, "parse offer life_context", e); return {}; } })();
  const { skillsMax: generatedSkillsMax, ...lifeContextWithoutCaps } = offerLifeContext as { skillsMax?: Record<string, { current: number; maxPotential: number }> } & Record<string, unknown>;
  const offerSkills = (() => { try { return JSON.parse((offer.skills as string) ?? "{}"); } catch (e) { logger.warn({ module: M }, "parse offer skills", e); return {}; } })();
  const skillsMax: Record<string, { current: number; maxPotential: number }> = generatedSkillsMax ?? {};
  if (!generatedSkillsMax) {
    const headroom = 10 + Math.round(hiddenTalent * 0.6); // talent 0 → +10, talent 65 → +49
    for (const [attr, val] of Object.entries(offerSkills)) {
      if (typeof val !== "number") continue;
      skillsMax[attr] = { current: val, maxPotential: Math.min(100, val + headroom) };
    }
  }
  await db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, weekly_wage, status, nationality, hidden_talent, skills_max)
     VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
  ).bind(playerId, teamId, offer.first_name, offer.last_name, offer.age, offer.position, offer.overall_rating,
    offer.skills, offer.physical, offer.personality, JSON.stringify(lifeContextWithoutCaps), offer.avatar, offer.weekly_wage,
    (offer.nationality as string) ?? "CZ", hiddenTalent, JSON.stringify(skillsMax)).run();

  // Set residence
  const { generateResidence } = await import("../generators/residence");
  const teamVillage = await db.prepare("SELECT v.name, v.size, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?")
    .bind(teamId).first<{ name: string; size: string; district: string }>().catch((e) => { logger.warn({ module: M }, "db op failed", e); return null; });
  if (teamVillage) {
    const resRng = createRng(cryptoSeed());
    const res = generateResidence(resRng, teamVillage.name, teamVillage.size, teamVillage.district);
    await db.prepare("UPDATE players SET residence = ?, commute_km = ? WHERE id = ?")
      .bind(res.residence, res.commuteKm, playerId).run().catch((e) => logger.warn({ module: M }, "db op failed", e));
  }

  // Vazby na spoluhráče — dorostenec z vesnice většinou někoho zná
  const { attachNewcomerRelations } = await import("../transfers/attach-relations");
  await attachNewcomerRelations(db, teamId, playerId);
  const { initNewcomerCoachRelation } = await import("../lib/coach-relation");
  await initNewcomerCoachRelation(db, teamId, playerId);

  // Contract
  const season = await db.prepare("SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1").first<{ id: string }>().catch((e) => { logger.warn({ module: M }, "db op failed", e); return null; });
  await db.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (?, ?, ?, ?, ?, 0, 1)")
    .bind(crypto.randomUUID(), playerId, teamId, mustSeason(season?.id), offer.source).run().catch((e) => logger.warn({ module: M }, "db op failed", e));

  // Registration fee
  const team = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string }>().catch((e) => { logger.warn({ module: M }, "db op failed", e); return null; });
  await recordTransaction(db, teamId, "signing_fee", -PLAYER_OFFER_SIGNING_FEE, `Registrace: ${offer.first_name} ${offer.last_name}`, team?.game_date ?? new Date().toISOString());

  // Return full player data for reveal card
  const newPlayer = await db.prepare("SELECT * FROM players WHERE id = ?").bind(playerId).first<Record<string, unknown>>();
  const player = newPlayer ? {
    ...newPlayer,
    skills: JSON.parse((newPlayer.skills as string) ?? "{}"),
    physical: JSON.parse((newPlayer.physical as string) ?? "{}"),
    personality: JSON.parse((newPlayer.personality as string) ?? "{}"),
    lifeContext: JSON.parse((newPlayer.life_context as string) ?? "{}"),
    avatar: JSON.parse((newPlayer.avatar as string) ?? "{}"),
  } : null;

  return { ok: true, playerId, player };
}

/** POST /teams/:teamId/player-offers/:offerId/reject: odmítnutí nabídky. */
export async function rejectPlayerOffer(db: D1Database, teamId: string, offerId: string): Promise<{ ok: true }> {
  await db.prepare("UPDATE player_offers SET status = 'rejected' WHERE id = ? AND team_id = ?").bind(offerId, teamId).run();
  return { ok: true };
}
