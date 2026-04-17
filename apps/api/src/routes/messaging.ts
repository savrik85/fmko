/**
 * Messaging API — in-game phone / SMS system.
 * Konverzace: "Kabina" (skupinový), 1:1 hráči, 1:1 manažeři, systém.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { requireTeamOwnership, requireAdmin } from "../auth/middleware";

const messagingRouter = new Hono<{ Bindings: Bindings }>();

// Write operace (odesílání zpráv, mark-read, vytváření konverzací) vyžadují ownership.
messagingRouter.use("/teams/:teamId/*", requireTeamOwnership);
// Admin broadcast endpointy vyžadují admin session.
messagingRouter.use("/admin/*", requireAdmin);

function uuid(): string {
  return crypto.randomUUID();
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
      id: row.id,
      type: row.type,
      title: row.title,
      participantId: row.participant_id,
      participantAvatar: row.participant_avatar ? JSON.parse(row.participant_avatar as string) : null,
      lastMessageText: row.last_message_text,
      lastMessageAt: row.last_message_at,
      unreadCount: row.unread_count,
      pinned: row.pinned === 1,
    }));

  return c.json(convs);
});

// GET /api/teams/:teamId/conversations/:convId — zprávy v konverzaci
messagingRouter.get("/teams/:teamId/conversations/:convId", async (c) => {
  const teamId = c.req.param("teamId");
  const convId = c.req.param("convId");
  const limit = Number(c.req.query("limit") || "50");
  const before = c.req.query("before"); // cursor pagination

  // Ověřit že konverzace patří tomuto týmu
  const convOwner = await c.env.DB.prepare("SELECT team_id FROM conversations WHERE id = ?")
    .bind(convId).first<{ team_id: string }>().catch((e) => { logger.warn({ module: "messaging" }, "conv ownership check", e); return null; });
  if (!convOwner || convOwner.team_id !== teamId) return c.json({ error: "Konverzace nenalezena" }, 404);

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

  return c.json(messages);
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

  // If manager conversation, deliver to the other side
  const conv = await c.env.DB.prepare(
    "SELECT type, participant_id FROM conversations WHERE id = ?"
  ).bind(convId).first<{ type: string; participant_id: string | null }>().catch((e) => { logger.warn({ module: "messaging" }, "fetch conversation type", e); return null; });

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

  return c.json({ id: msgId, sentAt: now });
});

// GET /api/teams/:teamId/unread-count — celkový počet nepřečtených
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
  "Ahoj šéfe! Těším se na sezónu! 💪",
  "Čau trenére! Kdy je první trénink?",
  "Ahoj! Jsem připravenej makat.",
  "Zdravím! Doufám že budu hrát víc než minule.",
  "Čau! Co budeme trénovat jako první?",
  "Ahoj šéfe, počítej se mnou na všechno!",
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
  const body = await c.req.json<{ message: string }>();
  if (!body.message?.trim()) return c.json({ error: "Empty message" }, 400);

  const msg = body.message.trim();
  const roleTitle = "Předseda Přeboru";

  // Get all human teams
  const teams = await c.env.DB.prepare(
    "SELECT id FROM teams WHERE user_id != 'ai'"
  ).all().catch((e) => { logger.warn({ module: "messaging" }, "fetch human teams for broadcast", e); return { results: [] }; });

  let sent = 0;
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
  }

  return c.json({ ok: true, sent });
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
