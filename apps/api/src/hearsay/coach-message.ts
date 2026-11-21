/**
 * Zpráva trenéra (1:1 nebo do kabiny) → co v ní o kom řekl se zapíše jako věc, která se
 * může roznést (spec část 1). Volá routes/messaging.ts na pozadí, odpověď hráče nečeká.
 */
import { logger } from "../lib/logger";
import type { ChatEnv } from "../messaging/ai-player-chat";
import { detectMentions, type MentionCandidate } from "./detect";
import { learningEffectStmts } from "./effects";
import { hearsayItemStmt, knowledgeStmts, newHearsayItem } from "./store";
import type { HearsayKnowledge, KnowledgeVia } from "./types";

const M = "hearsay-coach-message";

/** Jen hlavní Kabina klubu; zápasové chaty „⚽ vs …“ jsou docházka, ne hovor. */
const SQUAD_CHAT_TITLE = "Kabina";

export async function handleCoachMessageForHearsay(
  db: D1Database,
  env: ChatEnv,
  o: { teamId: string; convId: string; convType: "player" | "squad_group"; recipientPlayerId: string | null; text: string; now?: Date },
): Promise<number> {
  try {
    const now = o.now ?? new Date();
    const team = await db.prepare("SELECT id, user_id, parent_team_id FROM teams WHERE id = ?")
      .bind(o.teamId).first<{ id: string; user_id: string | null; parent_team_id: string | null }>();
    if (!team || !team.user_id || team.user_id === "ai") return 0;
    const clubId = team.parent_team_id ?? team.id;

    const squadChat = o.convType === "squad_group";
    if (squadChat) {
      const conv = await db.prepare("SELECT title FROM conversations WHERE id = ?").bind(o.convId).first<{ title: string }>();
      if (conv?.title !== SQUAD_CHAT_TITLE) return 0;
    }

    const roster = await db.prepare(
      `SELECT id, team_id, first_name, last_name, nickname FROM players
        WHERE team_id IN (?, (SELECT id FROM teams WHERE parent_team_id = ?)) AND (status IS NULL OR status = 'active')`,
    ).bind(clubId, clubId).all<{ id: string; team_id: string; first_name: string; last_name: string; nickname: string | null }>();
    const club: MentionCandidate[] = roster.results.map((p) => ({ id: p.id, firstName: p.first_name, lastName: p.last_name, nickname: p.nickname }));
    const recipient = o.recipientPlayerId ? roster.results.find((p) => p.id === o.recipientPlayerId) : undefined;

    const mentions = await detectMentions(env, {
      message: o.text, recipientName: recipient?.first_name ?? null, squadChat, club,
      excludeIds: o.recipientPlayerId ? [o.recipientPlayerId] : [],
    });
    if (mentions.length === 0) return 0;

    const gameDay = (await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(clubId).first<{ game_date: string | null }>())
      ?.game_date ?? now.toISOString().slice(0, 10);
    // Kabinu čte áčko (kabina patří týmu, kterému trenér píše).
    const inSquadChat = roster.results.filter((p) => p.team_id === o.teamId).map((p) => p.id);
    const at = now.toISOString();
    const stmts: D1PreparedStatement[] = [];
    for (const m of mentions) {
      const item = newHearsayItem({
        clubTeamId: clubId, subjectPlayerId: m.playerId, kind: m.kind, origin: squadChat ? "coach_squad" : "coach_sms",
        recipientPlayerId: o.recipientPlayerId, conversationId: o.convId, quote: m.quote, createdAt: at,
      });
      const knowers: Array<{ playerId: string; via: KnowledgeVia }> = squadChat
        ? inSquadChat.map((playerId) => ({ playerId, via: "squad_chat" as const }))
        : o.recipientPlayerId ? [{ playerId: o.recipientPlayerId, via: "direct" }] : [];
      if (squadChat && inSquadChat.includes(m.playerId)) {
        const effect = await learningEffectStmts(db, { item, playerId: m.playerId, via: "squad_chat", gameDay, now });
        stmts.push(...effect.stmts);
      }
      stmts.push(hearsayItemStmt(db, item), ...knowledgeStmts(db, knowers.map((k): HearsayKnowledge => ({
        hearsayId: item.id, playerId: k.playerId, via: k.via, fromPlayerId: null, learnedAt: at, messageState: "none", messagedAt: null,
      }))));
    }
    await db.batch(stmts);
    logger.info({ module: M, teamId: o.teamId }, `zapsáno ${mentions.length} věcí ze zprávy trenéra (${o.convType})`);
    return mentions.length;
  } catch (e) {
    logger.warn({ module: M, teamId: o.teamId }, `zmínky ve zprávě trenéra ${o.convId}`, e);
    return 0;
  }
}
