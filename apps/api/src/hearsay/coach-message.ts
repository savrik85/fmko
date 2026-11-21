/**
 * Zpráva trenéra (1:1 nebo do kabiny) → co v ní o kom řekl se zapíše jako věc, která se
 * může roznést (spec část 1). Volá routes/messaging.ts na pozadí, odpověď hráče nečeká.
 */
import { logger } from "../lib/logger";
import type { ChatEnv } from "../messaging/ai-player-chat";
import { detectMentions, type MentionCandidate } from "./detect";
import { learningEffectStmts } from "./effects";
import { isPostSpeechWindow } from "../messaging/match-speech";
import { hearsayItemStmt, knowledgeStmts, newHearsayItem } from "./store";
import type { HearsayKnowledge, KnowledgeVia } from "./types";

const M = "hearsay-coach-message";

/** Jen hlavní Kabina klubu; zápasové chaty „⚽ vs …“ jsou docházka, ne hovor. */
const SQUAD_CHAT_TITLE = "Kabina";

export interface CoachMessageInput {
  teamId: string; convId: string; convType: "player" | "squad_group"; recipientPlayerId: string | null; text: string; now?: Date;
}

/** Zpráva, kterou rozpoznání ještě nedodělalo (KV `hearsay_pending:…`), dodělá ji hodinový běh. */
const PENDING_PREFIX = "hearsay_pending:";
/** Hodinový běh sahá jen na záznamy starší než tohle: mladší ještě může zpracovávat požadavek. */
const PENDING_MIN_AGE_MS = 5 * 60_000;
const PENDING_TTL_S = 86_400;

/** Varianta, která chyby nepolyká: volající rozhodne, jestli zprávu nechá na později. */
async function recordMentions(db: D1Database, env: ChatEnv, o: CoachMessageInput): Promise<number> {
  {
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
    const recipient = o.recipientPlayerId ? roster.results.find((p) => p.id === o.recipientPlayerId) : undefined;
    // Vazby adresáta na spoluhráče: „tvůj brácha Lukáš“ pak model rozliší mezi Lukáši.
    const ties = new Map<string, string>();
    if (recipient) {
      const rows = await db.prepare(
        `SELECT CASE WHEN player_a_id = ? THEN player_b_id ELSE player_a_id END AS other, type
           FROM relationships WHERE player_a_id = ? OR player_b_id = ? ORDER BY strength DESC`,
      ).bind(recipient.id, recipient.id, recipient.id).all<{ other: string; type: string }>();
      for (const r of rows.results) if (!ties.has(r.other)) ties.set(r.other, r.type);
    }
    const club: MentionCandidate[] = roster.results.map((p) => ({
      id: p.id, firstName: p.first_name, lastName: p.last_name, nickname: p.nickname, ...(ties.has(p.id) ? { tieToRecipient: ties.get(p.id) } : {}),
    }));

    const mentions = await detectMentions(env, {
      message: o.text, recipientName: recipient ? `${recipient.first_name} ${recipient.last_name}` : null, squadChat, club,
      excludeIds: o.recipientPlayerId ? [o.recipientPlayerId] : [],
    });
    if (mentions.length === 0) return 0;

    const gameDay = (await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(clubId).first<{ game_date: string | null }>())
      ?.game_date ?? now.toISOString().slice(0, 10);
    // Kabinu čte áčko (kabina patří týmu, kterému trenér píše).
    const inSquadChat = roster.results.filter((p) => p.team_id === o.teamId).map((p) => p.id);
    const at = now.toISOString();
    // Proslov po zápase dává jmenovaným dopad sám (messaging/match-speech.ts): tady jen kdo co ví.
    const speechTakesIt = squadChat && await isPostSpeechWindow(db, o.teamId, o.text, now);
    // Dvě zmínky téhož hráče v jedné zprávě: strop a „to už vím“ platí i uvnitř zprávy.
    const runState = new Set<string>();
    const stmts: D1PreparedStatement[] = [];
    // Id podle zprávy: druhé zpracování téže zprávy (hodinový běh po pozdě doběhlém požadavku) nic nezdvojí.
    const idOf = (m: { playerId: string; kind: string }) => `msg:${o.convId}:${Date.parse(at)}:${m.playerId}:${m.kind}`;
    const existing = new Set((await db.prepare(
      `SELECT id FROM squad_hearsay WHERE id IN (${mentions.map(() => "?").join(",")})`,
    ).bind(...mentions.map(idOf)).all<{ id: string }>()).results.map((r) => r.id));
    let recorded = 0;
    for (const m of mentions) {
      if (existing.has(idOf(m))) continue;
      recorded++;
      const item = newHearsayItem({
        clubTeamId: clubId, subjectPlayerId: m.playerId, kind: m.kind, origin: squadChat ? "coach_squad" : "coach_sms",
        recipientPlayerId: o.recipientPlayerId, conversationId: o.convId, quote: m.quote, createdAt: at,
      }, idOf(m));
      const knowers: Array<{ playerId: string; via: KnowledgeVia }> = squadChat
        ? inSquadChat.map((playerId) => ({ playerId, via: "squad_chat" as const }))
        : o.recipientPlayerId ? [{ playerId: o.recipientPlayerId, via: "direct" }] : [];
      if (squadChat && inSquadChat.includes(m.playerId) && !speechTakesIt) {
        const effect = await learningEffectStmts(db, { item, playerId: m.playerId, via: "squad_chat", gameDay, now, runState });
        stmts.push(...effect.stmts);
      }
      stmts.push(hearsayItemStmt(db, item), ...knowledgeStmts(db, knowers.map((k): HearsayKnowledge => ({
        hearsayId: item.id, playerId: k.playerId, via: k.via, fromPlayerId: null, learnedAt: at, messageState: "none", messagedAt: null,
      }))));
    }
    if (stmts.length > 0) await db.batch(stmts);
    logger.info({ module: M, teamId: o.teamId }, `zapsáno ${recorded} věcí ze zprávy trenéra (${o.convType})`);
    return recorded;
  }
}

/** Rozpoznání a zápis; chyba se jen zaloguje (vrací 0). */
export async function handleCoachMessageForHearsay(db: D1Database, env: ChatEnv, o: CoachMessageInput): Promise<number> {
  try {
    return await recordMentions(db, env, o);
  } catch (e) {
    logger.warn({ module: M, teamId: o.teamId }, `zmínky ve zprávě trenéra ${o.convId}`, e);
    return 0;
  }
}

/**
 * Volá route po zprávě trenéra. Práce na pozadí má po odpovědi jen ~30 s a kabina v tu
 * chvíli pouští i odpovědi hráčů a hodnocení proslovu: dlouhá zpráva se na testu (Workers AI)
 * nestihla. Proto se zpráva nejdřív zapíše jako čekající a smaže se, až rozpoznání doběhne;
 * co utne limit nebo výpadek modelu, dodělá hodinový běh (`processPendingDetections`).
 */
export async function detectCoachMessage(db: D1Database, env: ChatEnv, o: CoachMessageInput): Promise<number> {
  const sentAt = (o.now ?? new Date()).toISOString();
  const key = `${PENDING_PREFIX}${o.convId}:${Date.parse(sentAt)}`;
  await env.CACHE_KV?.put(key, JSON.stringify({ ...o, now: sentAt }), { expirationTtl: PENDING_TTL_S })
    .catch((e) => logger.warn({ module: M, teamId: o.teamId }, "čekající rozpoznání do KV", e));
  try {
    const n = await recordMentions(db, env, { ...o, now: new Date(sentAt) });
    await env.CACHE_KV?.delete(key).catch((e) => logger.warn({ module: M, teamId: o.teamId }, "smazání čekajícího rozpoznání", e));
    return n;
  } catch (e) {
    logger.warn({ module: M, teamId: o.teamId }, `rozpoznání zmínek ${o.convId} nechávám hodinovému běhu`, e);
    return 0;
  }
}

/** Hodinový běh: dodělá rozpoznání, které v požadavku nedoběhlo. Vrací počet dodělaných zpráv. */
export async function processPendingDetections(db: D1Database, env: ChatEnv, now: Date = new Date()): Promise<number> {
  if (!env.CACHE_KV) return 0;
  const list = await env.CACHE_KV.list({ prefix: PENDING_PREFIX })
    .catch((e) => { logger.warn({ module: M }, "seznam čekajících rozpoznání", e); return null; });
  let done = 0;
  for (const { name } of list?.keys ?? []) {
    const raw = await env.CACHE_KV.get(name)
      .catch((e) => { logger.warn({ module: M }, `čekající rozpoznání ${name}`, e); return null; });
    if (!raw) continue;
    let o: CoachMessageInput & { now: string };
    try { o = JSON.parse(raw) as CoachMessageInput & { now: string }; } catch (e) {
      logger.warn({ module: M }, `čekající rozpoznání ${name} není JSON`, e);
      await env.CACHE_KV.delete(name).catch((err) => logger.warn({ module: M }, "smazání vadného záznamu", err));
      continue;
    }
    if (Date.parse(o.now) > now.getTime() - PENDING_MIN_AGE_MS) continue;
    try {
      await recordMentions(db, env, { ...o, now: new Date(o.now) });
      await env.CACHE_KV.delete(name);
      done++;
    } catch (e) {
      // Model pořád nejde: zkusí se příští hodinu, KV záznam sám vyprší za den.
      logger.warn({ module: M, teamId: o.teamId }, `dodělání rozpoznání ${name}`, e);
    }
  }
  if (done > 0) logger.info({ module: M }, `dodělané rozpoznání zmínek: ${done}`);
  return done;
}
