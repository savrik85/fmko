/**
 * Reakce spoluhráčů na prodej a nákup (spec 3b, přání uživatele 2026-11-21).
 *
 * Reaguje, kdo má k přestupujícímu vazbu (rodina, kamarádi, kolega, rival), a u nákupu
 * i konkurent na stejném postu (mezi dvěma nejlepšími na něm, příchozí je zhruba stejně dobrý).
 * Dopad hned, zpráva přes stejné doručení jako „slyšel jsem…“ (strop 2 na klub a den).
 * Přestup ví celá kabina, takže se nešíří.
 *
 * Volá se po přestupu (`onPlayerTransferred` s `fromTeamId`, příchody mimo něj) a u prodeje
 * do virtuálního klubu **před** `removePlayer`, který vazby maže.
 */
import { logger } from "../lib/logger";
import { learningEffectStmts, tieGroup } from "./effects";
import { hearsayItemStmt, knowledgeStmts, newHearsayItem } from "./store";
import type { HearsayKnowledge, KnowledgeVia } from "./types";

const M = "hearsay-transfers";

/** Konkurent: příchozí má aspoň tolik méně hodnocení a pořád ho ohrožuje. */
const COMPETITOR_GAP = 2;
/** Konkurent je jen mezi tolika nejlepšími na postu. */
const COMPETITOR_TOP = 2;

export interface TransferReactionInput {
  movedPlayer: { id: string; firstName: string; lastName: string; position: string; overall: number };
  direction: "left" | "arrived";
  otherClubName: string | null;
  /** Kádr klubu bez přestupujícího. */
  squad: Array<{ id: string; position: string; overall: number }>;
  /** Vazby přestupujícího na kádr. */
  ties: Array<{ playerId: string; type: string }>;
}

export function transferReactions(i: TransferReactionInput): Array<{ playerId: string; via: KnowledgeVia }> {
  const inSquad = new Set(i.squad.map((p) => p.id));
  const out: Array<{ playerId: string; via: KnowledgeVia }> = [];
  for (const t of i.ties) {
    const via = t.type as KnowledgeVia;
    if (!inSquad.has(t.playerId) || !tieGroup(via) || out.some((o) => o.playerId === t.playerId)) continue;
    out.push({ playerId: t.playerId, via });
  }
  if (i.direction === "arrived") {
    const samePosition = i.squad.filter((p) => p.position === i.movedPlayer.position)
      .sort((a, b) => b.overall - a.overall)
      .slice(0, COMPETITOR_TOP);
    for (const p of samePosition) {
      if (out.some((o) => o.playerId === p.id)) continue;
      if (i.movedPlayer.overall >= p.overall - COMPETITOR_GAP) out.push({ playerId: p.id, via: "competitor" });
    }
  }
  return out;
}

export async function recordTransferReactions(
  db: D1Database,
  o: { playerId: string; clubTeamId: string; direction: "left" | "arrived"; otherClubName: string | null; now?: Date },
): Promise<number> {
  try {
    const now = o.now ?? new Date();
    const team = await db.prepare("SELECT id, user_id, parent_team_id, game_date FROM teams WHERE id = ?")
      .bind(o.clubTeamId).first<{ id: string; user_id: string | null; parent_team_id: string | null; game_date: string | null }>();
    if (!team || !team.user_id || team.user_id === "ai") return 0;
    const clubId = team.parent_team_id ?? team.id;

    const moved = await db.prepare("SELECT id, first_name, last_name, position, overall_rating FROM players WHERE id = ?")
      .bind(o.playerId).first<{ id: string; first_name: string; last_name: string; position: string; overall_rating: number | null }>();
    if (!moved) return 0;
    const [squad, ties] = await Promise.all([
      db.prepare(
        `SELECT id, position, overall_rating FROM players
          WHERE team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?) AND id != ? AND (status IS NULL OR status = 'active')`,
      ).bind(clubId, clubId, o.playerId).all<{ id: string; position: string; overall_rating: number | null }>(),
      db.prepare(
        `SELECT CASE WHEN player_a_id = ? THEN player_b_id ELSE player_a_id END AS player_id, type
           FROM relationships WHERE player_a_id = ? OR player_b_id = ?
          ORDER BY strength DESC`,
      ).bind(o.playerId, o.playerId, o.playerId).all<{ player_id: string; type: string }>(),
    ]);
    const reactions = transferReactions({
      movedPlayer: { id: moved.id, firstName: moved.first_name, lastName: moved.last_name, position: moved.position, overall: moved.overall_rating ?? 0 },
      direction: o.direction, otherClubName: o.otherClubName,
      squad: squad.results.map((p) => ({ id: p.id, position: p.position, overall: p.overall_rating ?? 0 })),
      ties: ties.results.map((t) => ({ playerId: t.player_id, type: t.type })),
    });
    if (reactions.length === 0) return 0;

    const name = `${moved.first_name} ${moved.last_name}`;
    const quote = o.direction === "left"
      ? `${name} přestoupil${o.otherClubName ? ` do klubu ${o.otherClubName}` : ""}`
      : `Do klubu přišel ${name}${o.otherClubName ? ` (z klubu ${o.otherClubName})` : ""}`;
    const at = now.toISOString();
    const gameDay = team.game_date ?? at.slice(0, 10);
    const stmts: D1PreparedStatement[] = [];
    let recorded = 0;
    for (const r of reactions) {
      const id = `transfer:${o.playerId}:${r.playerId}:${o.direction}`;
      // Obnova požadavku nebo druhé volání: věc už je, nic nezdvojit.
      if (await db.prepare("SELECT 1 AS x FROM squad_hearsay WHERE id = ?").bind(id).first()) continue;
      const item = newHearsayItem({
        clubTeamId: clubId, subjectPlayerId: r.playerId, kind: o.direction === "left" ? "teammate_left" : "teammate_arrived",
        origin: "transfer", recipientPlayerId: null, conversationId: null, quote, createdAt: at,
      }, id);
      const effect = await learningEffectStmts(db, { item, playerId: r.playerId, via: r.via, gameDay, now });
      const knowledge: HearsayKnowledge = {
        hearsayId: id, playerId: r.playerId, via: r.via, fromPlayerId: null, learnedAt: at,
        messageState: effect.message ? "pending" : "none", messagedAt: null,
      };
      stmts.push(hearsayItemStmt(db, item), ...knowledgeStmts(db, [knowledge]), ...effect.stmts);
      recorded++;
    }
    if (stmts.length > 0) await db.batch(stmts);
    if (recorded > 0) logger.info({ module: M, teamId: clubId }, `přestup ${name} (${o.direction}): reaguje ${recorded} hráčů`);
    return recorded;
  } catch (e) {
    logger.warn({ module: M, teamId: o.clubTeamId }, `reakce na přestup ${o.playerId}`, e);
    return 0;
  }
}
