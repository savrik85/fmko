/**
 * Rozhodnutí na úkor, která hra zná bez modelu (spec část 3): přišel o kapitánskou pásku.
 *
 * - Změna kapitána klubu (`teams.captain_id`): dohoda „captaincy“ (transfers/unrest.ts)
 *   i obrazovka rolí (services/lineup.ts `setTeamRoles`).
 * - Kapitán zápasu (sestava) je jiný než klubový kapitán, který hraje v základu.
 *
 * Zpočátku to ví jen nový kapitán, starý se to dozví šířením (rozhodnutí se šíří ×1,4).
 */
import { logger } from "../lib/logger";
import { hearsayItemStmt, knowledgeStmts, newHearsayItem } from "./store";
import type { HearsayOrigin } from "./types";

const M = "hearsay-captain";

async function clubOf(db: D1Database, teamId: string): Promise<string | null> {
  const team = await db.prepare("SELECT id, user_id, parent_team_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ id: string; user_id: string | null; parent_team_id: string | null }>();
  if (!team || !team.user_id || team.user_id === "ai") return null;
  return team.parent_team_id ?? team.id;
}

async function fullName(db: D1Database, playerId: string): Promise<string | null> {
  const p = await db.prepare("SELECT first_name, last_name FROM players WHERE id = ?").bind(playerId).first<{ first_name: string; last_name: string }>();
  return p ? `${p.first_name} ${p.last_name}` : null;
}

async function recordLostArmband(db: D1Database, o: {
  id: string; clubId: string; loserId: string; winnerId: string; origin: HearsayOrigin; quote: string; now: Date;
}): Promise<void> {
  const at = o.now.toISOString();
  const item = newHearsayItem({
    clubTeamId: o.clubId, subjectPlayerId: o.loserId, kind: "decision_against", origin: o.origin,
    recipientPlayerId: null, conversationId: null, quote: o.quote, createdAt: at,
  }, o.id);
  await db.batch([
    hearsayItemStmt(db, item),
    ...knowledgeStmts(db, [{ hearsayId: item.id, playerId: o.winnerId, via: "teammate", fromPlayerId: null, learnedAt: at, messageState: "none", messagedAt: null }]),
  ]);
}

export async function recordCaptainChange(
  db: D1Database,
  o: { teamId: string; oldCaptainId: string | null; newCaptainId: string | null; now?: Date },
): Promise<void> {
  try {
    if (!o.oldCaptainId || !o.newCaptainId || o.oldCaptainId === o.newCaptainId) return;
    const clubId = await clubOf(db, o.teamId);
    const newName = clubId ? await fullName(db, o.newCaptainId) : null;
    if (!clubId || !newName) return;
    const now = o.now ?? new Date();
    await recordLostArmband(db, {
      id: `captain:${o.teamId}:${o.oldCaptainId}:${o.newCaptainId}:${now.toISOString().slice(0, 10)}`,
      clubId, loserId: o.oldCaptainId, winnerId: o.newCaptainId, origin: "captain_change", quote: `Kapitánem je teď ${newName}`, now,
    });
  } catch (e) {
    logger.warn({ module: M, teamId: o.teamId }, "změna kapitána", e);
  }
}

export async function recordArmbandSnub(
  db: D1Database,
  o: { teamId: string; clubCaptainId: string | null; matchCaptainId: string | null; starterIds: string[]; matchKey: string; now?: Date },
): Promise<void> {
  try {
    if (!o.clubCaptainId || !o.matchCaptainId || o.clubCaptainId === o.matchCaptainId) return;
    if (!o.starterIds.includes(o.clubCaptainId)) return;
    const clubId = await clubOf(db, o.teamId);
    const name = clubId ? await fullName(db, o.matchCaptainId) : null;
    if (!clubId || !name) return;
    await recordLostArmband(db, {
      id: `armband:${o.matchKey}:${o.clubCaptainId}`,
      clubId, loserId: o.clubCaptainId, winnerId: o.matchCaptainId, origin: "lineup_armband", quote: `Pásku na zápas má ${name}`, now: o.now ?? new Date(),
    });
  } catch (e) {
    logger.warn({ module: M, teamId: o.teamId }, "páska na zápas", e);
  }
}
