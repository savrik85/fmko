/**
 * Group chats API — sdílené chaty per liga + globální.
 * Liší se od /conversations tím že záznam není per-team (1 chat = N týmů).
 * Unread tracking je per-team přes group_chat_reads.last_read_at.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { requireTeamOwnership } from "../auth/middleware";

const groupChatsRouter = new Hono<{ Bindings: Bindings }>();

groupChatsRouter.use("/teams/:teamId/group-chats/*", requireTeamOwnership);
groupChatsRouter.use("/teams/:teamId/group-chats", requireTeamOwnership);

const GLOBAL_CHAT_ID = "global";

function leagueChatId(leagueId: string): string {
  return `league:${leagueId}`;
}

async function ensureGlobalChat(db: D1Database): Promise<void> {
  await db.prepare(
    `INSERT OR IGNORE INTO group_chats (id, scope, scope_id, title)
     VALUES (?, 'global', NULL, ?)`
  ).bind(GLOBAL_CHAT_ID, "Globální chat").run();
}

async function ensureLeagueChat(db: D1Database, leagueId: string): Promise<string | null> {
  const league = await db.prepare("SELECT id, name FROM leagues WHERE id = ?")
    .bind(leagueId).first<{ id: string; name: string }>()
    .catch((e) => { logger.warn({ module: "group-chats" }, "fetch league for chat init", e); return null; });
  if (!league) return null;
  const chatId = leagueChatId(leagueId);
  await db.prepare(
    `INSERT OR IGNORE INTO group_chats (id, scope, scope_id, title)
     VALUES (?, 'league', ?, ?)`
  ).bind(chatId, leagueId, league.name).run();
  return chatId;
}

type GroupChatRow = {
  id: string;
  scope: string;
  scope_id: string | null;
  title: string;
  last_message_text: string | null;
  last_message_at: string | null;
};

type GroupChatItem = {
  id: string;
  type: "global_group" | "league_group";
  title: string;
  participantId: string | null;
  participantAvatar: null;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  pinned: boolean;
};

async function unreadCountFor(db: D1Database, chatId: string, teamId: string): Promise<number> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS cnt FROM group_messages gm
     WHERE gm.group_chat_id = ?
       AND gm.sender_team_id != ?
       AND gm.sent_at > COALESCE(
         (SELECT last_read_at FROM group_chat_reads WHERE group_chat_id = gm.group_chat_id AND team_id = ?),
         '1970-01-01'
       )`
  ).bind(chatId, teamId, teamId).first<{ cnt: number }>()
    .catch((e) => { logger.warn({ module: "group-chats" }, "unread count", e); return null; });
  return row?.cnt ?? 0;
}

/**
 * Vrátí seznam group chatů relevantních pro daný tým: globální + chat aktuální ligy.
 * Volá se i z messaging.ts při merge do /conversations.
 */
export async function listGroupChatsForTeam(
  db: D1Database,
  teamId: string,
): Promise<GroupChatItem[]> {
  const team = await db.prepare("SELECT league_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ league_id: string | null }>()
    .catch((e) => { logger.warn({ module: "group-chats" }, "fetch team league", e); return null; });

  await ensureGlobalChat(db);

  const ids: string[] = [GLOBAL_CHAT_ID];
  if (team?.league_id) {
    const lc = await ensureLeagueChat(db, team.league_id);
    if (lc) ids.push(lc);
  }

  const placeholders = ids.map(() => "?").join(",");
  const result = await db.prepare(
    `SELECT id, scope, scope_id, title, last_message_text, last_message_at
     FROM group_chats WHERE id IN (${placeholders})`
  ).bind(...ids).all<GroupChatRow>()
    .catch((e) => { logger.warn({ module: "group-chats" }, "fetch group chats", e); return { results: [] as GroupChatRow[] }; });

  const items: GroupChatItem[] = [];
  for (const row of result.results) {
    const unread = await unreadCountFor(db, row.id, teamId);
    items.push({
      id: row.id,
      type: row.scope === "global" ? "global_group" : "league_group",
      title: row.title,
      participantId: row.scope_id,
      participantAvatar: null,
      lastMessageText: row.last_message_text,
      lastMessageAt: row.last_message_at,
      unreadCount: unread,
      pinned: false,
    });
  }
  return items;
}

/**
 * Validace: může daný tým psát/číst do daného chatu?
 * Globální = vždy ano. Liga = jen pokud teams.league_id == group_chats.scope_id.
 */
async function canAccessChat(db: D1Database, teamId: string, chatId: string): Promise<boolean> {
  const chat = await db.prepare("SELECT scope, scope_id FROM group_chats WHERE id = ?")
    .bind(chatId).first<{ scope: string; scope_id: string | null }>()
    .catch((e) => { logger.warn({ module: "group-chats" }, "fetch chat for access check", e); return null; });
  if (!chat) return false;
  if (chat.scope === "global") return true;
  if (chat.scope === "league" && chat.scope_id) {
    const team = await db.prepare("SELECT league_id FROM teams WHERE id = ?")
      .bind(teamId).first<{ league_id: string | null }>()
      .catch((e) => { logger.warn({ module: "group-chats" }, "fetch team for access check", e); return null; });
    return team?.league_id === chat.scope_id;
  }
  return false;
}

groupChatsRouter.get("/teams/:teamId/group-chats", async (c) => {
  const teamId = c.req.param("teamId");
  const items = await listGroupChatsForTeam(c.env.DB, teamId);
  return c.json(items);
});

groupChatsRouter.get("/teams/:teamId/group-chats/:groupId/messages", async (c) => {
  const teamId = c.req.param("teamId");
  const groupId = c.req.param("groupId");
  const limit = Number(c.req.query("limit") || "50");
  const before = c.req.query("before");

  if (!(await canAccessChat(c.env.DB, teamId, groupId))) {
    return c.json({ error: "Chat nenalezen" }, 404);
  }

  let query = `
    SELECT gm.id, gm.body, gm.sent_at, gm.sender_team_id, gm.sender_name,
           t.name AS team_name,
           m.name AS manager_name, m.avatar AS manager_avatar
    FROM group_messages gm
    LEFT JOIN teams t ON t.id = gm.sender_team_id
    LEFT JOIN managers m ON m.team_id = gm.sender_team_id
    WHERE gm.group_chat_id = ?
  `;
  const binds: unknown[] = [groupId];
  if (before) {
    query += " AND gm.sent_at < ?";
    binds.push(before);
  }
  query += " ORDER BY gm.sent_at DESC LIMIT ?";
  binds.push(limit);

  const result = await c.env.DB.prepare(query).bind(...binds).all()
    .catch((e) => { logger.warn({ module: "group-chats" }, "fetch group messages", e); return { results: [] }; });

  const messages = result.results.map((row) => {
    let managerAvatar: Record<string, unknown> | null = null;
    if (row.manager_avatar) {
      try { managerAvatar = JSON.parse(row.manager_avatar as string); }
      catch (e) { logger.warn({ module: "group-chats" }, "parse manager avatar", e); }
    }
    return {
      id: row.id as string,
      body: row.body as string,
      sentAt: row.sent_at as string,
      senderTeamId: row.sender_team_id as string,
      senderName: row.sender_name as string,
      senderTeamName: row.team_name as string | null,
      senderManagerName: (row.manager_name as string | null) ?? null,
      senderManagerAvatar: managerAvatar,
    };
  }).reverse();

  await c.env.DB.prepare(
    `INSERT INTO group_chat_reads (group_chat_id, team_id, last_read_at) VALUES (?, ?, ?)
     ON CONFLICT(group_chat_id, team_id) DO UPDATE SET last_read_at = excluded.last_read_at`
  ).bind(groupId, teamId, new Date().toISOString()).run()
    .catch((e) => logger.warn({ module: "group-chats" }, "upsert read marker", e));

  return c.json(messages);
});

groupChatsRouter.post("/teams/:teamId/group-chats/:groupId/messages", async (c) => {
  const teamId = c.req.param("teamId");
  const groupId = c.req.param("groupId");
  const body = await c.req.json<{ body: string }>();
  if (!body.body?.trim()) return c.json({ error: "Empty message" }, 400);

  if (!(await canAccessChat(c.env.DB, teamId, groupId))) {
    return c.json({ error: "Chat nenalezen" }, 404);
  }

  const team = await c.env.DB.prepare("SELECT name FROM teams WHERE id = ?")
    .bind(teamId).first<{ name: string }>();
  const senderName = team?.name ?? "Tým";

  const msgId = crypto.randomUUID();
  const now = new Date().toISOString();
  const text = body.body.trim();

  await c.env.DB.prepare(
    "INSERT INTO group_messages (id, group_chat_id, sender_team_id, sender_name, body, sent_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(msgId, groupId, teamId, senderName, text, now).run();

  await c.env.DB.prepare(
    "UPDATE group_chats SET last_message_text = ?, last_message_at = ? WHERE id = ?"
  ).bind(text.slice(0, 100), now, groupId).run();

  // Odesilatel má svůj chat rovnou jako přečtený.
  await c.env.DB.prepare(
    `INSERT INTO group_chat_reads (group_chat_id, team_id, last_read_at) VALUES (?, ?, ?)
     ON CONFLICT(group_chat_id, team_id) DO UPDATE SET last_read_at = excluded.last_read_at`
  ).bind(groupId, teamId, now).run()
    .catch((e) => logger.warn({ module: "group-chats" }, "upsert sender read marker", e));

  return c.json({ id: msgId, sentAt: now });
});

groupChatsRouter.post("/teams/:teamId/group-chats/:groupId/mark-read", async (c) => {
  const teamId = c.req.param("teamId");
  const groupId = c.req.param("groupId");

  if (!(await canAccessChat(c.env.DB, teamId, groupId))) {
    return c.json({ error: "Chat nenalezen" }, 404);
  }

  await c.env.DB.prepare(
    `INSERT INTO group_chat_reads (group_chat_id, team_id, last_read_at) VALUES (?, ?, ?)
     ON CONFLICT(group_chat_id, team_id) DO UPDATE SET last_read_at = excluded.last_read_at`
  ).bind(groupId, teamId, new Date().toISOString()).run()
    .catch((e) => logger.warn({ module: "group-chats" }, "mark-read", e));

  return c.json({ ok: true });
});

export { groupChatsRouter };
