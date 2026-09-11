/**
 * Messaging API — in-game phone / SMS system.
 * Konverzace: "Kabina" (skupinový), 1:1 hráči, 1:1 manažeři, systém.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { requireTeamOwnership, requireAdmin } from "../auth/middleware";
import { listGroupChatsForTeam } from "./group-chats";
import { sendWebPushToTeam, getNotificationPreferences } from "../community/web-push";

const messagingRouter = new Hono<{ Bindings: Bindings }>();

// Write operace (odesílání zpráv, mark-read, vytváření konverzací) vyžadují ownership.
messagingRouter.use("/teams/:teamId/*", requireTeamOwnership);
// Admin broadcast endpointy vyžadují admin session.
messagingRouter.use("/admin/*", requireAdmin);

function uuid(): string {
  return crypto.randomUUID();
}

function parseAiThreadState(raw: unknown): { awaiting: "coach" | "player" | "done"; scenarioId?: string; resolution?: { summary?: string; tone?: string; offended?: boolean } | null } | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      awaiting: parsed.awaiting,
      scenarioId: parsed.scenario_id,
      resolution: parsed.resolution ?? null,
    };
  } catch (e) {
    logger.warn({ module: "messaging" }, "parseAiThreadState", e);
    return null;
  }
}

// GET /api/teams/:teamId/conversations — seznam konverzací
messagingRouter.get("/teams/:teamId/conversations", async (c) => {
  const teamId = c.req.param("teamId");

  let result = await c.env.DB.prepare(
    `SELECT * FROM conversations WHERE team_id = ? ORDER BY pinned DESC, REPLACE(last_message_at, 'T', ' ') DESC`
  ).bind(teamId).all().catch((e) => { logger.warn({ module: "messaging" }, "fetch conversations", e); return { results: [] }; });

  // Auto-init conversations if none exist
  if (result.results.length === 0) {
    const players = await c.env.DB.prepare(
      "SELECT id, first_name, last_name, nickname, avatar FROM players WHERE team_id = ?"
    ).bind(teamId).all().catch((e) => { logger.warn({ module: "messaging" }, "fetch players for init", e); return { results: [] }; });

    if (players.results.length > 0) {
      const playerData = players.results.map((p) => ({
        id: p.id as string,
        firstName: p.first_name as string,
        lastName: p.last_name as string,
        nickname: (p.nickname as string) || undefined,
        avatar: p.avatar as string,
      }));
      await initTeamConversations(c.env.DB, teamId, playerData).catch((e) => logger.warn({ module: "messaging" }, "auto-init conversations", e));

      result = await c.env.DB.prepare(
        `SELECT * FROM conversations WHERE team_id = ? ORDER BY pinned DESC, REPLACE(last_message_at, 'T', ' ') DESC`
      ).bind(teamId).all().catch((e) => { logger.warn({ module: "messaging" }, "re-fetch conversations after init", e); return { results: [] }; });
    }
  }

  const convs = result.results
    .filter((row) => row.last_message_text && (row.last_message_text as string).length > 0)
    .map((row) => ({
      id: row.id as string,
      type: row.type as string,
      title: row.title as string,
      participantId: row.participant_id as string | null,
      participantAvatar: row.participant_avatar ? JSON.parse(row.participant_avatar as string) : null,
      lastMessageText: row.last_message_text as string | null,
      lastMessageAt: row.last_message_at as string | null,
      unreadCount: row.unread_count as number,
      pinned: row.pinned === 1,
      aiThreadActive: (row.ai_thread_active as number) === 1,
      aiThreadState: parseAiThreadState(row.ai_thread_state),
    }));

  // Merge group chats (globální + ligový). Vždy zobrazit, i prázdné.
  const groupChats = await listGroupChatsForTeam(c.env.DB, teamId)
    .catch((e) => { logger.warn({ module: "messaging" }, "list group chats for merge", e); return []; });

  const merged = [...convs, ...groupChats];
  // Pinned v existujících konverzacích zachovat nahoře, ostatní podle last_message_at DESC.
  merged.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return bt - at;
  });

  return c.json(merged);
});

// GET /api/teams/:teamId/conversations/:convId — zprávy v konverzaci
/**
 * Dá se do téhle konverzace psát, a co to stojí?
 *
 * `sms` = odpovídá model a strhává se kredit (hráči, kabina).
 * `imessage` = odpovídá člověk nebo deterministická logika, tedy zdarma
 * (druhý trenér, vůdce kotle s otevřeným vláknem).
 * `canReply: false` = jednosměrné oznámení, vstupní pole nemá co dělat.
 */
function odpovidatLze(
  type: string,
  threadActive: boolean,
  opts: { title?: string; participantId?: string | null } = {},
): {
  canReply: boolean;
  channel: "sms" | "imessage" | null;
  replyHint?: string;
  replyHintHref?: string;
} {
  if (type === "player" || type === "squad_group") return { canReply: true, channel: "sms" };
  if (type === "manager") return { canReply: true, channel: "imessage" };
  // Vůdce fanoušků čeká na odpověď jen dokud vlákno běží; pak už se nemá kdo ozvat.
  if (type === "system" && threadActive) return { canReply: true, channel: "imessage" };

  // Vůdce party není úřad — s ním konverzace skončila, ale jednat se s ním dá dál.
  if (opts.participantId?.startsWith("fl-")) {
    return {
      canReply: false,
      channel: null,
      replyHint: "Tahle výměna skončila. Domluvit se s partou můžeš na stránce Fanoušci.",
      replyHintHref: "/dashboard/fans",
    };
  }
  return {
    canReply: false,
    channel: null,
    replyHint: `${opts.title ?? "Odesílatel"} posílá jen oznámení — odpovídat nejde.`,
  };
}

messagingRouter.get("/teams/:teamId/conversations/:convId", async (c) => {
  const teamId = c.req.param("teamId");
  const convId = c.req.param("convId");
  const limit = Number(c.req.query("limit") || "50");
  const before = c.req.query("before"); // cursor pagination

  // Ověřit že konverzace patří tomuto týmu + načíst AI thread state
  const convOwner = await c.env.DB.prepare(
    "SELECT team_id, type, title, participant_id, participant_avatar, ai_thread_active, ai_thread_state FROM conversations WHERE id = ?",
  ).bind(convId).first<{
    team_id: string; type: string; title: string; participant_id: string | null;
    participant_avatar: string | null; ai_thread_active: number; ai_thread_state: string | null;
  }>()
    .catch((e) => { logger.warn({ module: "messaging" }, "conv ownership check", e); return null; });
  if (!convOwner || convOwner.team_id !== teamId) return c.json({ error: "Konverzace nenalezena" }, 404);

  // Trucující hráč (transferUnrest) → konkrétní dohody (chips na FE).
  // Primární kanál je živá konverzace (AI thread po odmítnuté nabídce) — dohody
  // se nabízejí až když řeči nestačily: vážný truc (≥40) a žádný aktivní thread.
  let unrest: { level: number; teamName?: string; mood: string; actions: { id: string; label: string; description: string }[] } | null = null;
  if (convOwner.type === "player" && convOwner.participant_id && convOwner.ai_thread_active !== 1) {
    try {
      const playerRow = await c.env.DB.prepare(
        `SELECT p.life_context
         FROM players p
         JOIN teams current_team ON current_team.id = p.team_id
         LEFT JOIN teams owner_team ON owner_team.id = p.loan_from_team_id
         WHERE p.id = ? AND (
           COALESCE(current_team.parent_team_id, current_team.id) = ?
           OR COALESCE(owner_team.parent_team_id, owner_team.id) = ?
         )`,
      ).bind(convOwner.participant_id, teamId, teamId).first<{ life_context: string | null }>();
      const lc = playerRow?.life_context ? JSON.parse(playerRow.life_context) : {};
      if (lc?.transferUnrest?.level >= 40) {
        const { availableActions, unrestMoodQuote } = await import("../transfers/unrest");
        const seasonRow = await c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
          .first<{ number: number }>().catch((e) => { logger.warn({ module: "messaging" }, "load season for unrest", e); return null; });
        unrest = {
          level: lc.transferUnrest.level,
          teamName: lc.transferUnrest.teamName,
          mood: unrestMoodQuote(convOwner.participant_id, lc.transferUnrest.level, lc.transferUnrest.teamName),
          actions: availableActions(lc.transferUnrest, lc, seasonRow?.number ?? null)
            .map((a) => ({ id: a.id, label: a.label, description: a.description })),
        };
      }
    } catch (e) { logger.warn({ module: "messaging" }, "load unrest for conversation", e); }
  }

  let query = "SELECT * FROM messages WHERE conversation_id = ?";
  const binds: unknown[] = [convId];

  if (before) {
    query += " AND sent_at < ?";
    binds.push(before);
  }

  query += " ORDER BY sent_at DESC LIMIT ?";
  binds.push(limit);

  const result = await c.env.DB.prepare(query).bind(...binds).all().catch((e) => { logger.warn({ module: "messaging" }, "fetch messages", e); return { results: [] }; });

  const messages = result.results.map((row) => ({
    id: row.id,
    senderType: row.sender_type,
    senderId: row.sender_id,
    senderName: row.sender_name,
    body: row.body,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
    sentAt: row.sent_at,
    read: row.read === 1,
  })).reverse(); // chronological order

  // Mark as read
  await c.env.DB.prepare(
    "UPDATE messages SET read = 1 WHERE conversation_id = ? AND read = 0"
  ).bind(convId).run().catch((e) => logger.warn({ module: "messaging" }, "mark messages read", e));
  await c.env.DB.prepare(
    "UPDATE conversations SET unread_count = 0 WHERE id = ?"
  ).bind(convId).run().catch((e) => logger.warn({ module: "messaging" }, "reset unread count", e));

  return c.json({
    messages,
    // Hlavička konverzace jde s detailem, ne ze seznamu. Čerstvě založená
    // konverzace v cachovaném seznamu být nemusí a stránka pak místo jména
    // hráče ukázala otazník.
    conversation: {
      id: convId,
      type: convOwner.type,
      title: convOwner.title,
      participantId: convOwner.participant_id,
      participantAvatar: (() => {
        if (!convOwner.participant_avatar) return null;
        try { return JSON.parse(convOwner.participant_avatar); } catch (e) {
          logger.warn({ module: "messaging" }, "nečitelný avatar konverzace", e);
          return null;
        }
      })(),
    },
    // Kdo na druhé straně vůbec odpoví — rozhoduje server, ne frontend.
    // Většina systémových konverzací je jednosměrné oznámení (svaz, pořadatel,
    // sportovní ředitel); psát do nich by znamenalo mluvit do zdi.
    ...odpovidatLze(convOwner.type, convOwner.ai_thread_active === 1, {
      title: convOwner.title,
      participantId: convOwner.participant_id,
    }),
    aiThreadActive: convOwner.ai_thread_active === 1,
    aiThreadState: parseAiThreadState(convOwner.ai_thread_state),
    participantId: convOwner.participant_id,
    unrest,
  });
});

// POST /api/teams/:teamId/player-conversation/:playerId — najdi/založ 1:1 konverzaci s hráčem
// (pro CTA "Promluvit si" z profilu hráče / kádru)
messagingRouter.post("/teams/:teamId/player-conversation/:playerId", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");
  const player = await c.env.DB.prepare(
    "SELECT id, first_name, last_name, nickname, avatar FROM players WHERE id = ? AND team_id = ?"
  ).bind(playerId, teamId).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "messaging" }, "load player for conversation", e); return null; });
  if (!player) return c.json({ error: "Hráč nenalezen" }, 404);

  const { getOrCreatePlayerConversation } = await import("../messaging/ai-player-spawn");
  const convId = await getOrCreatePlayerConversation(c.env.DB, teamId, {
    id: player.id as string,
    firstName: player.first_name as string,
    lastName: player.last_name as string,
    nickname: player.nickname as string | null,
    avatar: player.avatar as string | null,
  });
  return c.json({ conversationId: convId });
});

// POST /api/teams/:teamId/conversations/:convId — odeslat zprávu
messagingRouter.post("/teams/:teamId/conversations/:convId", async (c) => {
  const teamId = c.req.param("teamId");
  const convId = c.req.param("convId");
  const body = await c.req.json<{ body: string }>();

  if (!body.body?.trim()) return c.json({ error: "Empty message" }, 400);

  // Ověřit že konverzace patří tomuto týmu
  const convOwner = await c.env.DB.prepare("SELECT team_id FROM conversations WHERE id = ?")
    .bind(convId).first<{ team_id: string }>().catch((e) => { logger.warn({ module: "messaging" }, "conv ownership check on send", e); return null; });
  if (!convOwner || convOwner.team_id !== teamId) return c.json({ error: "Konverzace nenalezena" }, 404);

  // Konverzace se načte DŘÍV než se zpráva zapíše — podle typu se pozná, jestli
  // na ni bude odpovídat model, a jestli tedy stojí kredit.
  const conv = await c.env.DB.prepare(
    "SELECT type, participant_id, ai_thread_active FROM conversations WHERE id = ?"
  ).bind(convId).first<{ type: string; participant_id: string | null; ai_thread_active: number }>()
    .catch((e) => { logger.warn({ module: "messaging" }, "fetch conversation type", e); return null; });

  // Stejné pravidlo jako u čtení — kdyby platilo jen na frontendu, obešel by
  // ho kdokoli přímým voláním API a psal by do zdi.
  const pravidlo = odpovidatLze(conv?.type ?? "", conv?.ai_thread_active === 1);
  if (!pravidlo.canReply) {
    return c.json({ error: "Do téhle konverzace se odpovídat nedá — je to jen oznámení." }, 400);
  }
  const platiSeKredit = pravidlo.channel === "sms";

  const { loadCredit, spendCredit } = await import("../messaging/phone-credit");
  if (platiSeKredit) {
    // Vypnuté generování textu se musí poznat DŘÍV, než se strhne kredit —
    // jinak by hráč platil za odpověď, která nepřijde. Přepínač `ai_provider`
    // dosud platil jen pro crony, tohle je ta samá brzda pro požadavky.
    const { isAiEnabled } = await import("../lib/ai-provider");
    if (!(await isAiEnabled(c.env))) {
      return c.json({ error: "Telefon je bez signálu — odpovídání je dočasně vypnuté." }, 503);
    }
    // Bez argumentu se strhne cena jedné SMS — modul je jediný, kdo ji zná.
    const ok = await spendCredit(c.env.DB, teamId);
    if (!ok) {
      const stav = await loadCredit(c.env.DB, teamId);
      return c.json({
        error: `Na SMS ti nezbývá kredit — máš ${stav.zbyva} Kč a zpráva stojí ${stav.cenaSms} Kč. Dobije se zítra ráno.`,
        credit: stav,
      }, 400);
    }
  }

  // Get team name for sender
  const team = await c.env.DB.prepare("SELECT name FROM teams WHERE id = ?")
    .bind(teamId).first<{ name: string }>();
  const senderName = team?.name ?? "Trenér";

  const msgId = uuid();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    "INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, sent_at, read) VALUES (?, ?, 'user', ?, ?, ?, ?, 1)"
  ).bind(msgId, convId, teamId, senderName, body.body.trim(), now).run();

  // Update conversation
  const trimmedText = body.body.trim().slice(0, 100);
  await c.env.DB.prepare(
    "UPDATE conversations SET last_message_text = ?, last_message_at = ? WHERE id = ?"
  ).bind(trimmedText, now, convId).run();

  // AI player chat hook: pokud je thread aktivní a čeká na trenéra,
  // atomic UPDATE awaiting='player' (race guard) a spustíme generování reply v pozadí.
  if (conv?.type === "player" && conv.ai_thread_active === 1) {
    const updateRes = await c.env.DB.prepare(
      `UPDATE conversations
       SET ai_thread_state = json_set(ai_thread_state, '$.awaiting', 'player')
       WHERE id = ?
         AND ai_thread_active = 1
         AND json_extract(ai_thread_state, '$.awaiting') = 'coach'`,
    ).bind(convId).run().catch((e) => { logger.warn({ module: "messaging" }, "atomic awaiting update", e); return null; });

    if (updateRes && (updateRes.meta?.changes ?? 0) > 0) {
      const { handleAiPlayerReply } = await import("../messaging/ai-player-spawn");
      c.executionCtx.waitUntil(
        handleAiPlayerReply(c.env.DB, c.env, convId)
          .catch((e) => logger.error({ module: "messaging" }, "handleAiPlayerReply failed", e)),
      );
    }
  }

  // Trenér napsal hráči sám od sebe — dosud zpráva zapadla bez reakce.
  if (conv?.type === "player" && conv.ai_thread_active !== 1 && conv.participant_id) {
    const { startCoachThread } = await import("../messaging/coach-initiated");
    c.executionCtx.waitUntil(
      startCoachThread(c.env.DB, c.env, {
        convId, teamId, playerId: conv.participant_id, coachMessage: body.body.trim(),
      }).catch((e) => logger.error({ module: "messaging" }, "konverzace zahájená trenérem", e)),
    );
  }

  // Zpráva do kabiny — ozve se jeden hráč.
  if (conv?.type === "squad_group") {
    const { replyInSquadGroup } = await import("../messaging/coach-initiated");
    c.executionCtx.waitUntil(
      replyInSquadGroup(c.env.DB, c.env, { convId, teamId, coachMessage: body.body.trim() })
        .catch((e) => logger.error({ module: "messaging" }, "reakce v kabině", e)),
    );
  }

  // Vůdce fanouškovské party čeká na odpověď. Používá stejné sloupce jako AI
  // thready hráčů, jen s vlastním `kind` — a vyhodnocuje se bez modelu.
  if (conv?.type === "system" && conv.ai_thread_active === 1) {
    const { handleFanLeaderReply } = await import("../fans/fan-leader-reply");
    await handleFanLeaderReply(c.env.DB, convId, body.body.trim())
      .catch((e) => logger.warn({ module: "messaging" }, "odpověď vůdci fanoušků", e));
  }

  if (conv?.type === "manager" && conv.participant_id) {
    const otherTeamId = conv.participant_id;

    // Get or create conversation on the other side
    let otherConv = await c.env.DB.prepare(
      "SELECT id FROM conversations WHERE team_id = ? AND type = 'manager' AND participant_id = ?"
    ).bind(otherTeamId, teamId).first<{ id: string }>().catch((e) => { logger.warn({ module: "messaging" }, "fetch other side conversation", e); return null; });

    if (!otherConv) {
      // Create conversation on recipient's side
      const myManager = await c.env.DB.prepare(
        "SELECT name, avatar FROM managers WHERE team_id = ?"
      ).bind(teamId).first<{ name: string; avatar: string }>().catch((e) => { logger.warn({ module: "messaging" }, "fetch manager for cross-delivery", e); return null; });

      const otherConvId = uuid();
      const title = myManager?.name ?? senderName;
      const avatar = myManager?.avatar ?? "{}";

      await c.env.DB.prepare(
        "INSERT INTO conversations (id, team_id, type, title, participant_id, participant_avatar, last_message_text, last_message_at, unread_count, created_at) VALUES (?, ?, 'manager', ?, ?, ?, ?, ?, 1, ?)"
      ).bind(otherConvId, otherTeamId, title, teamId, avatar, trimmedText, now, now).run();

      otherConv = { id: otherConvId };
    } else {
      // Update existing conversation
      await c.env.DB.prepare(
        "UPDATE conversations SET last_message_text = ?, last_message_at = ?, unread_count = unread_count + 1 WHERE id = ?"
      ).bind(trimmedText, now, otherConv.id).run();
    }

    // Insert message copy on recipient's side
    await c.env.DB.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, sent_at, read) VALUES (?, ?, 'manager', ?, ?, ?, ?, 0)"
    ).bind(uuid(), otherConv.id, teamId, senderName, body.body.trim(), now).run();
  }

  return c.json({ id: msgId, sentAt: now, credit: await loadCredit(c.env.DB, teamId) });
});

// GET /api/teams/:teamId/unread-count — celkový počet nepřečtených
/**
 * Oznámení do telefonu.
 *
 * Tabulka `notifications` se plnila od začátku, ale v aplikaci ji nikdo
 * nezobrazoval — kdo neměl zapnutý push, nedozvěděl se nic. Telefon je jediné
 * místo, kam přirozeně patří.
 *
 * Vrací i přečtená (do historie), ale nepřečtená první.
 */
messagingRouter.get("/teams/:teamId/notifications", async (c) => {
  const teamId = c.req.param("teamId");
  const limit = Math.max(1, Math.min(50, Number(c.req.query("limit")) || 30));

  const rows = await c.env.DB.prepare(
    `SELECT id, type, title, body, read, action_url, created_at FROM notifications
     WHERE team_id = ? ORDER BY read ASC, created_at DESC LIMIT ?`,
  ).bind(teamId, limit).all<{
    id: string; type: string; title: string; body: string;
    read: number; action_url: string | null; created_at: string;
  }>().catch((e) => { logger.warn({ module: "messaging" }, "načtení oznámení", e); return { results: [] }; });

  const items = rows.results.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    read: r.read === 1,
    actionUrl: r.action_url,
    createdAt: r.created_at,
  }));

  // Počet se musí spočítat mimo stránku — odznak v hlavičce se tahá
  // s `limit=1` a z vrácené stránky by z něj vyšla vždycky jednička.
  const pocet = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM notifications WHERE team_id = ? AND read = 0",
  ).bind(teamId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: "messaging" }, "počet nepřečtených oznámení", e); return null; });

  return c.json({ items, unread: pocet?.n ?? items.filter((i) => !i.read).length });
});

/** Odbaví jedno oznámení, nebo všechna, když `id` nepřijde. */
messagingRouter.post("/teams/:teamId/notifications/read", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ id?: string }>().catch(() => ({} as { id?: string }));

  const stmt = body.id
    ? c.env.DB.prepare("UPDATE notifications SET read = 1 WHERE team_id = ? AND id = ?").bind(teamId, body.id)
    : c.env.DB.prepare("UPDATE notifications SET read = 1 WHERE team_id = ? AND read = 0").bind(teamId);

  const res = await stmt.run()
    .catch((e) => { logger.warn({ module: "messaging" }, "označení oznámení", e); return null; });
  return c.json({ ok: true, changed: res?.meta?.changes ?? 0 });
});

/**
 * Adresář telefonu — kdo všechno se dá oslovit, v jedné odpovědi.
 *
 * Skládat to na frontendu by znamenalo čtyři requesty (skupinové chaty, kádr,
 * soupeři v lize, vlastní konverzace) a čtyři příležitosti, jak se rozejít
 * s tím, co server považuje za zapisovatelné. Kanál i cena chodí rovnou s ním.
 */
messagingRouter.get("/teams/:teamId/contacts", async (c) => {
  const teamId = c.req.param("teamId");
  const db = c.env.DB;

  const [kabina, skupiny, hraci, tym] = await Promise.all([
    db.prepare(
      `SELECT id FROM conversations WHERE team_id = ? AND type = 'squad_group'
       ORDER BY last_message_at DESC LIMIT 1`,
    ).bind(teamId).first<{ id: string }>()
      .catch((e) => { logger.warn({ module: "messaging" }, "kabina do adresáře", e); return null; }),
    (async () => {
      const { listGroupChatsForTeam } = await import("./group-chats");
      return listGroupChatsForTeam(db, teamId)
        .catch((e) => { logger.warn({ module: "messaging" }, "skupiny do adresáře", e); return []; });
    })(),
    db.prepare(
      `SELECT id, first_name, last_name, nickname, position, avatar FROM players
       WHERE team_id = ? AND (status IS NULL OR status = 'active')
       ORDER BY CASE position WHEN 'GK' THEN 0 WHEN 'DEF' THEN 1 WHEN 'MID' THEN 2 ELSE 3 END, last_name`,
    ).bind(teamId).all<{
      id: string; first_name: string; last_name: string; nickname: string | null;
      position: string; avatar: string | null;
    }>().catch((e) => { logger.warn({ module: "messaging" }, "kádr do adresáře", e); return { results: [] }; }),
    db.prepare("SELECT league_id FROM teams WHERE id = ?").bind(teamId)
      .first<{ league_id: string | null }>()
      .catch((e) => { logger.warn({ module: "messaging" }, "liga týmu", e); return null; }),
  ]);

  // Jen kluby vedené člověkem — AI týmu zprávu doručit nejde a endpoint ji
  // odmítne. Nabízet ho v adresáři by znamenalo slibovat konverzaci, která
  // skončí chybou.
  const soupeři = tym?.league_id
    ? await db.prepare(
      `SELECT t.id, t.name AS team_name, m.name AS manager_name, m.avatar AS manager_avatar
       FROM teams t LEFT JOIN managers m ON m.team_id = t.id
       WHERE t.league_id = ? AND t.id != ? AND t.user_id != 'ai' ORDER BY t.name`,
    ).bind(tym.league_id, teamId).all<{
      id: string; team_name: string; manager_name: string | null; manager_avatar: string | null;
    }>().catch((e) => { logger.warn({ module: "messaging" }, "soupeři do adresáře", e); return { results: [] } })
    : { results: [] };

  return c.json({
    skupiny: [
      ...(kabina ? [{ id: kabina.id, title: "Kabina", podtitul: "Celý tým", channel: "sms" as const }] : []),
      ...skupiny.map((g) => ({
        id: g.id,
        title: g.title,
        podtitul: g.type === "league_group" ? "Trenéři v lize" : "Všichni trenéři",
        channel: "imessage" as const,
      })),
    ],
    hraci: hraci.results.map((p) => ({
      playerId: p.id,
      name: p.nickname ? `${p.first_name} „${p.nickname}" ${p.last_name}` : `${p.first_name} ${p.last_name}`,
      position: p.position,
      avatar: safeAvatar(p.avatar),
    })),
    manazeri: soupeři.results.map((t) => ({
      teamId: t.id,
      name: t.manager_name ?? t.team_name,
      teamName: t.team_name,
      avatar: safeAvatar(t.manager_avatar),
    })),
  });
});

function safeAvatar(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as Record<string, unknown>; } catch (e) {
    logger.warn({ module: "messaging" }, "nečitelný avatar v adresáři", e);
    return null;
  }
}

// GET /api/teams/:teamId/phone-credit — kolik odpovědí dnes ještě zbývá
messagingRouter.get("/teams/:teamId/phone-credit", async (c) => {
  const { loadCredit, creditWord } = await import("../messaging/phone-credit");
  const stav = await loadCredit(c.env.DB, c.req.param("teamId"));
  return c.json({ ...stav, label: creditWord(stav.zbyva, stav.denni) });
});

messagingRouter.get("/teams/:teamId/unread-count", async (c) => {
  const teamId = c.req.param("teamId");

  const row = await c.env.DB.prepare(
    "SELECT COALESCE(SUM(unread_count), 0) as total FROM conversations WHERE team_id = ?"
  ).bind(teamId).first<{ total: number }>().catch((e) => { logger.warn({ module: "messaging" }, "fetch unread count", e); return null; });

  return c.json({ unread: row?.total ?? 0 });
});

// POST /api/teams/:teamId/mark-read/:convId — označit jako přečtené
messagingRouter.post("/teams/:teamId/mark-read/:convId", async (c) => {
  const convId = c.req.param("convId");

  await c.env.DB.prepare(
    "UPDATE messages SET read = 1 WHERE conversation_id = ? AND read = 0"
  ).bind(convId).run().catch((e) => logger.warn({ module: "messaging" }, "mark-read messages", e));
  await c.env.DB.prepare(
    "UPDATE conversations SET unread_count = 0 WHERE id = ?"
  ).bind(convId).run().catch((e) => logger.warn({ module: "messaging" }, "mark-read reset unread", e));

  return c.json({ ok: true });
});

// POST /api/teams/:teamId/conversation-with/:otherTeamId — get or create manager-to-manager conversation
messagingRouter.post("/teams/:teamId/conversation-with/:otherTeamId", async (c) => {
  const teamId = c.req.param("teamId");
  const otherTeamId = c.req.param("otherTeamId");

  // Check if conversation already exists
  const existing = await c.env.DB.prepare(
    "SELECT id FROM conversations WHERE team_id = ? AND type = 'manager' AND participant_id = ?"
  ).bind(teamId, otherTeamId).first<{ id: string }>().catch((e) => { logger.warn({ module: "messaging" }, "check existing conversation", e); return null; });

  if (existing) return c.json({ conversationId: existing.id });

  // Get other team info + manager
  const otherTeam = await c.env.DB.prepare(
    "SELECT t.name, t.user_id FROM teams t WHERE t.id = ?"
  ).bind(otherTeamId).first<{ name: string; user_id: string }>().catch((e) => { logger.warn({ module: "messaging" }, "fetch other team info", e); return null; });

  if (!otherTeam || otherTeam.user_id === "ai") return c.json({ error: "Not a player team" }, 400);

  const otherManager = await c.env.DB.prepare(
    "SELECT name, avatar FROM managers WHERE team_id = ?"
  ).bind(otherTeamId).first<{ name: string; avatar: string }>().catch((e) => { logger.warn({ module: "messaging" }, "fetch other manager", e); return null; });

  const title = otherManager?.name ?? otherTeam.name;
  const avatar = otherManager?.avatar ?? "{}";
  const now = new Date().toISOString();
  const convId = uuid();

  await c.env.DB.prepare(
    "INSERT INTO conversations (id, team_id, type, title, participant_id, participant_avatar, last_message_at, unread_count, created_at) VALUES (?, ?, 'manager', ?, ?, ?, ?, 0, ?)"
  ).bind(convId, teamId, title, otherTeamId, avatar, now, now).run();

  return c.json({ conversationId: convId });
});

// POST /api/teams/:teamId/init-conversations — seed conversations for existing team
messagingRouter.post("/teams/:teamId/init-conversations", async (c) => {
  const teamId = c.req.param("teamId");

  // Check if already has conversations
  const existing = await c.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM conversations WHERE team_id = ?"
  ).bind(teamId).first<{ cnt: number }>().catch((e) => { logger.warn({ module: "messaging" }, "check conversation count", e); return null; });

  if (existing && existing.cnt > 0) return c.json({ ok: true, message: "Already initialized" });

  // Get players
  const players = await c.env.DB.prepare(
    "SELECT id, first_name, last_name, nickname, avatar FROM players WHERE team_id = ?"
  ).bind(teamId).all().catch((e) => { logger.warn({ module: "messaging" }, "fetch players for manual init", e); return { results: [] }; });

  const playerData = players.results.map((p) => ({
    id: p.id as string,
    firstName: p.first_name as string,
    lastName: p.last_name as string,
    nickname: (p.nickname as string) || undefined,
    avatar: p.avatar as string,
  }));

  await initTeamConversations(c.env.DB, teamId, playerData);

  return c.json({ ok: true, conversations: playerData.length + 1 });
});

// ── Helper: create conversation + initial messages for a new team ──

export async function initTeamConversations(
  db: D1Database,
  teamId: string,
  players: Array<{ id: string; firstName: string; lastName: string; nickname?: string; avatar: string }>,
) {
  const now = new Date().toISOString();

  // 1. Skupinový chat "Kabina" (pinned, bez uvítací zprávy)
  const groupId = uuid();
  await db.prepare(
    "INSERT INTO conversations (id, team_id, type, title, pinned, last_message_text, last_message_at, unread_count, created_at) VALUES (?, ?, 'squad_group', 'Kabina', 1, '', ?, 0, ?)"
  ).bind(groupId, teamId, now, now).run();

  // 1:1 konverzace s hráči se nevytvářejí při onboardingu — vzniknou až na vyžádání
}

const GREETINGS = [
  "Ahoj trenére! Těším se na sezónu! 💪",
  "Čau trenére! Kdy je první trénink?",
  "Ahoj! Jsem připravenej makat.",
  "Zdravím! Doufám že budu hrát víc než minule.",
  "Čau! Co budeme trénovat jako první?",
  "Ahoj trenére, počítej se mnou na všechno!",
  "Nazdar! Jsem fit a připravenej.",
  "Ahoj! Těším se na novou sezónu.",
  "Čau trenére, snad to letos vyjde!",
  "Ahoj! Kdy začínáme?",
];

function pickGreeting(firstName: string): string {
  // deterministic pick based on name
  let hash = 0;
  for (let i = 0; i < firstName.length; i++) hash = ((hash << 5) - hash + firstName.charCodeAt(i)) | 0;
  return GREETINGS[Math.abs(hash) % GREETINGS.length];
}

// ── Admin: Broadcast message to all human teams ──

messagingRouter.post("/admin/broadcast", async (c) => {
  const body = await c.req.json<{ message: string; pushTitle?: string; pushBody?: string }>();
  if (!body.message?.trim()) return c.json({ error: "Empty message" }, 400);

  const msg = body.message.trim();
  const roleTitle = "Předseda Přeboru";

  // Push na mobil — bez něj si zprávy všimne jen ten, kdo appku sám otevře.
  // Krátký text jde poslat zvlášť; jinak se ořízne začátek zprávy.
  const pushTitle = body.pushTitle?.trim() || roleTitle;
  const pushBody = body.pushBody?.trim() || (msg.length > 120 ? `${msg.slice(0, 117)}...` : msg);

  // Get all human teams
  const teams = await c.env.DB.prepare(
    "SELECT id FROM teams WHERE user_id != 'ai'"
  ).all().catch((e) => { logger.warn({ module: "messaging" }, "fetch human teams for broadcast", e); return { results: [] }; });

  let sent = 0;
  let pushed = 0;
  const now = new Date().toISOString();

  for (const team of teams.results) {
    const teamId = team.id as string;

    // Find or create conversation
    let convId = await c.env.DB.prepare(
      "SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = ?"
    ).bind(teamId, roleTitle).first<{ id: string }>().then((r) => r?.id).catch((e) => { logger.warn({ module: "messaging" }, "fetch broadcast conv", e); return null; });

    if (!convId) {
      convId = uuid();
      await c.env.DB.prepare(
        "INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_text, last_message_at, created_at) VALUES (?, ?, 'system', ?, 0, 0, '', ?, ?)"
      ).bind(convId, teamId, roleTitle, now, now).run().catch((e) => logger.warn({ module: "messaging" }, "insert broadcast conv", e));
    }

    await c.env.DB.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', ?, ?, ?)"
    ).bind(uuid(), convId, roleTitle, msg, now).run().catch((e) => logger.warn({ module: "messaging" }, "insert broadcast msg", e));

    await c.env.DB.prepare(
      "UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = ? WHERE id = ?"
    ).bind(msg.slice(0, 100), now, convId).run().catch((e) => logger.warn({ module: "messaging" }, "update broadcast conv unread", e));

    sent++;

    // Push notifikace — respektuje vypnuté systémové notifikace. Selhání push
    // nesmí shodit rozeslání zpráv, proto se jen loguje.
    const prefs = await getNotificationPreferences(c.env.DB, teamId)
      .catch((e) => { logger.warn({ module: "messaging" }, `load push prefs for team ${teamId}`, e); return null; });
    if (prefs?.system !== false) {
      await sendWebPushToTeam(c.env, teamId, pushTitle, pushBody, "/dashboard/phone")
        .then(() => { pushed++; })
        .catch((e) => logger.warn({ module: "messaging" }, `broadcast push for team ${teamId}`, e));
    }
  }

  return c.json({ ok: true, sent, pushed });
});

// ── Admin: Get replies to broadcast messages ──

messagingRouter.get("/admin/broadcast-replies", async (c) => {
  const roleTitle = "Předseda Přeboru";

  // Find all conversations with title "Předseda Přeboru" and get user replies
  const replies = await c.env.DB.prepare(
    `SELECT m.body, m.sent_at, t.name as team_name, t.id as team_id
     FROM messages m
     JOIN conversations c ON m.conversation_id = c.id
     JOIN teams t ON c.team_id = t.id
     WHERE c.type = 'system' AND c.title = ? AND m.sender_type = 'user'
     ORDER BY m.sent_at DESC
     LIMIT 100`
  ).bind(roleTitle).all().catch((e) => { logger.warn({ module: "messaging" }, "fetch broadcast replies", e); return { results: [] }; });

  const result = replies.results.map((r) => ({
    teamName: r.team_name as string,
    teamId: r.team_id as string,
    message: r.body as string,
    sentAt: r.sent_at as string,
  }));

  return c.json(result);
});

// ── Admin: Reply to a specific team's conversation ──

messagingRouter.post("/admin/broadcast-reply/:teamId", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ message: string }>();
  if (!body.message?.trim()) return c.json({ error: "Empty message" }, 400);

  const msg = body.message.trim();
  const roleTitle = "Předseda Přeboru";
  const now = new Date().toISOString();

  // Find existing conversation
  let convId = await c.env.DB.prepare(
    "SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = ?"
  ).bind(teamId, roleTitle).first<{ id: string }>().then((r) => r?.id).catch((e) => { logger.warn({ module: "messaging" }, "fetch reply conv", e); return null; });

  if (!convId) {
    convId = uuid();
    await c.env.DB.prepare(
      "INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_text, last_message_at, created_at) VALUES (?, ?, 'system', ?, 0, 0, '', ?, ?)"
    ).bind(convId, teamId, roleTitle, now, now).run().catch((e) => logger.warn({ module: "messaging" }, "insert reply conv", e));
  }

  await c.env.DB.prepare(
    "INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', ?, ?, ?)"
  ).bind(uuid(), convId, roleTitle, msg, now).run().catch((e) => logger.warn({ module: "messaging" }, "insert reply msg", e));

  await c.env.DB.prepare(
    "UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = ? WHERE id = ?"
  ).bind(msg.slice(0, 100), now, convId).run().catch((e) => logger.warn({ module: "messaging" }, "update reply conv unread", e));

  return c.json({ ok: true });
});

export { messagingRouter };
