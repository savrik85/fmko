/**
 * Socky: společná zeď všech okresů v telefonu.
 *
 * Číst i psát smí jen majitel klubu, za který se dívá (stejně jako zbytek Telefonu).
 * Klub je jen adresa: skrytí, lajky a limity se počítají na člověka (`teams.user_id`).
 */

import { Hono, type Context } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { requireAdmin, requirePrivateTeamRead, requireTeamOwnership } from "../auth/middleware";
import {
  CATEGORY_LABELS, COMMENTS_PER_DAY, COMMENT_MAX, POSTS_PER_DAY, POST_MAX,
  cleanUserText, mentionIds, parseTargetKey, type FeedCategory, type Mention, type Mute,
} from "../social/feed-model";
import {
  addMute, commentsToday, insertManagerComment, insertPost, insertReport, loadComments, loadFeed,
  loadFeedItem, loadMutes, loadReplyTarget, loadViewer, managerName, mentionableTeams, postsToday,
  removeMute, resolveMentions, resolveTarget, softDeleteComment, softDeletePost, toggleLike,
} from "../social/store";
import { likedWhat, notifySocial } from "../social/notify";
import { SOCIAL_AI_MODE_KEY, scheduleAiReplies, type ReplyTrigger } from "../social/ai-replies";

const M = "social-route";

export const socialRouter = new Hono<{ Bindings: Bindings }>();

socialRouter.use("/teams/:teamId/social/*", requireTeamOwnership);
socialRouter.use("/teams/:teamId/social/*", requirePrivateTeamRead);
socialRouter.use("/admin/social/*", requireAdmin);

type Ctx = Context<{ Bindings: Bindings }>;

/** Práce po odpovědi (odpovědi fanoušků). V testech bez `executionCtx` se počká rovnou. */
async function runLater(c: Ctx, work: Promise<unknown>): Promise<void> {
  const guarded = work.catch((e) => logger.warn({ module: M }, "práce po odpovědi selhala", e));
  let ctx: ExecutionContext | null = null;
  try {
    ctx = c.executionCtx;
  } catch (e) {
    logger.warn({ module: M }, "executionCtx chybí, čekám na práci rovnou", e);
  }
  if (ctx) ctx.waitUntil(guarded);
  else await guarded;
}

async function viewerOr404(c: Ctx) {
  const viewer = await loadViewer(c.env.DB, c.req.param("teamId") ?? "");
  return viewer;
}

/** Označeným klubům dá vědět. Vrací, komu už oznámení šlo. */
async function notifyMentions(c: Ctx, mentions: Mention[], key: string, actorTeamId: string, actorName: string, body: string, title: string): Promise<Set<string>> {
  const done = new Set<string>();
  for (const m of mentions) {
    await notifySocial(c.env, {
      kind: "mention", key, recipientTeamId: m.teamId, actorTeamId, actorName, body, title, push: true,
    });
    done.add(m.teamId);
  }
  return done;
}

async function readJson<T>(c: Ctx): Promise<T | null> {
  return c.req.json<T>().catch((e) => { logger.warn({ module: M }, "neplatné tělo požadavku", e); return null; });
}

socialRouter.get("/teams/:teamId/social/feed", async (c) => {
  const viewer = await viewerOr404(c);
  if (!viewer) return c.json({ error: "Klub nenalezen" }, 404);
  const feed = await loadFeed(c.env.DB, viewer, c.req.query("before") ?? null);
  return c.json(feed);
});

socialRouter.get("/teams/:teamId/social/item", async (c) => {
  const viewer = await viewerOr404(c);
  if (!viewer) return c.json({ error: "Klub nenalezen" }, 404);
  const item = await loadFeedItem(c.env.DB, viewer, c.req.query("key") ?? "");
  if (!item) return c.json({ error: "Příspěvek už není k dispozici." }, 404);
  return c.json({ item });
});

socialRouter.get("/teams/:teamId/social/comments", async (c) => {
  const viewer = await viewerOr404(c);
  if (!viewer) return c.json({ error: "Klub nenalezen" }, 404);
  const key = c.req.query("key") ?? "";
  const ref = parseTargetKey(key);
  if (!ref || ref.kind === "comment" || ref.kind === "fanpost") return c.json({ error: "Neznámý příspěvek" }, 400);
  return c.json({ comments: await loadComments(c.env.DB, key, viewer) });
});

socialRouter.post("/teams/:teamId/social/posts", async (c) => {
  const viewer = await viewerOr404(c);
  if (!viewer) return c.json({ error: "Klub nenalezen" }, 404);
  const body = await readJson<{ body?: unknown; mentions?: unknown }>(c);
  const text = cleanUserText(body?.body, POST_MAX);
  if (!text) return c.json({ error: "Napiš, co máš na srdci." }, 400);
  if (await postsToday(c.env.DB, viewer.userId) >= POSTS_PER_DAY) {
    return c.json({ error: `Dnes už jsi napsal ${POSTS_PER_DAY} příspěvků. Zítra zase.` }, 429);
  }
  const mentions = await resolveMentions(c.env.DB, text, mentionIds(body?.mentions), viewer.teamId);
  const id = await insertPost(c.env.DB, viewer, text, mentions);
  const key = `post:${id}`;
  const authorName = await managerName(c.env.DB, viewer.teamId);
  await notifyMentions(c, mentions, key, viewer.teamId, authorName, text, `příspěvek trenéra ${authorName}`);

  const trigger: ReplyTrigger = {
    key, text, authorName, authorTeamId: viewer.teamId, authorTeamName: viewer.teamName,
    commentId: null, repliedPersonaId: null, mentions,
  };
  await runLater(c, scheduleAiReplies(c.env, trigger));

  return c.json({ ok: true, key, item: await loadFeedItem(c.env.DB, viewer, key) });
});

socialRouter.delete("/teams/:teamId/social/posts/:id", async (c) => {
  const viewer = await viewerOr404(c);
  if (!viewer) return c.json({ error: "Klub nenalezen" }, 404);
  const ok = await softDeletePost(c.env.DB, viewer, c.req.param("id"));
  if (!ok) return c.json({ error: "Tenhle příspěvek smazat nemůžeš." }, 403);
  return c.json({ ok: true });
});

socialRouter.post("/teams/:teamId/social/comments", async (c) => {
  const viewer = await viewerOr404(c);
  if (!viewer) return c.json({ error: "Klub nenalezen" }, 404);
  const body = await readJson<{ key?: unknown; body?: unknown; replyToId?: unknown; mentions?: unknown }>(c);
  const key = typeof body?.key === "string" ? body.key : "";
  const ref = parseTargetKey(key);
  if (!ref || ref.kind === "comment" || ref.kind === "fanpost") return c.json({ error: "Neznámý příspěvek" }, 400);
  const text = cleanUserText(body?.body, COMMENT_MAX);
  if (!text) return c.json({ error: "Komentář je prázdný." }, 400);
  if (await commentsToday(c.env.DB, viewer.userId) >= COMMENTS_PER_DAY) {
    return c.json({ error: "Na dnešek už toho bylo dost. Zítra zase." }, 429);
  }
  const target = await resolveTarget(c.env.DB, key);
  if (!target) return c.json({ error: "Příspěvek už není k dispozici." }, 404);

  const replyToId = typeof body?.replyToId === "string" && body.replyToId ? body.replyToId : null;
  const replyTo = replyToId ? await loadReplyTarget(c.env.DB, replyToId, key) : null;
  if (replyToId && !replyTo) return c.json({ error: "Komentář, na který odpovídáš, už není." }, 404);

  const mentions = await resolveMentions(c.env.DB, text, mentionIds(body?.mentions), viewer.teamId);
  const { id, authorName } = await insertManagerComment(c.env.DB, viewer, key, text, replyTo?.id ?? null, mentions);

  // Komu dát vědět: označeným, majiteli příspěvku a tomu, komu se odpovídá (když je to jiný trenér).
  // Kdo je označený, dostane jen zmínku, ne k tomu ještě oznámení o komentáři.
  const mentioned = await notifyMentions(c, mentions, key, viewer.teamId, authorName, text, target.title);
  const notices = new Set<string>();
  if (target.ownerIsHuman && target.ownerTeamId) notices.add(target.ownerTeamId);
  if (replyTo?.authorKind === "manager" && replyTo.teamId) notices.add(replyTo.teamId);
  for (const teamId of notices) {
    if (mentioned.has(teamId)) continue;
    await notifySocial(c.env, {
      kind: "comment", key, recipientTeamId: teamId, actorTeamId: viewer.teamId, actorName: authorName,
      body: text, title: target.title, push: true,
    });
  }

  await runLater(c, scheduleAiReplies(c.env, {
    key, text, authorName, authorTeamId: viewer.teamId, authorTeamName: viewer.teamName,
    commentId: id,
    repliedPersonaId: replyTo && replyTo.authorKind !== "manager" ? replyTo.personaId : null,
    mentions,
  }));

  return c.json({ ok: true, id, comments: await loadComments(c.env.DB, key, viewer) });
});

socialRouter.delete("/teams/:teamId/social/comments/:id", async (c) => {
  const viewer = await viewerOr404(c);
  if (!viewer) return c.json({ error: "Klub nenalezen" }, 404);
  const ok = await softDeleteComment(c.env.DB, viewer, c.req.param("id"));
  if (!ok) return c.json({ error: "Tenhle komentář smazat nemůžeš." }, 403);
  return c.json({ ok: true });
});

socialRouter.post("/teams/:teamId/social/likes", async (c) => {
  const viewer = await viewerOr404(c);
  if (!viewer) return c.json({ error: "Klub nenalezen" }, 404);
  const body = await readJson<{ key?: unknown }>(c);
  const key = typeof body?.key === "string" ? body.key : "";
  const target = await resolveTarget(c.env.DB, key);
  if (!target) return c.json({ error: "Tohle už neexistuje." }, 404);
  const result = await toggleLike(c.env.DB, viewer.userId, key);
  // Lajk potěší autora: příspěvek, komentář trenéra, článek o jeho klubu. Bez pushe, jen v oznámeních.
  if (result.liked && target.ownerIsHuman && target.ownerTeamId && target.ownerTeamId !== viewer.teamId) {
    await notifySocial(c.env, {
      kind: "like", key: target.feedKey, recipientTeamId: target.ownerTeamId, actorTeamId: viewer.teamId,
      actorName: await managerName(c.env.DB, viewer.teamId), body: likedWhat(target.kind, target.snippet),
      title: target.title, push: false,
    });
  }
  return c.json(result);
});

socialRouter.get("/teams/:teamId/social/mentionable", async (c) => {
  const viewer = await viewerOr404(c);
  if (!viewer) return c.json({ error: "Klub nenalezen" }, 404);
  return c.json({ teams: await mentionableTeams(c.env.DB, viewer.teamId) });
});

socialRouter.get("/teams/:teamId/social/mutes", async (c) => {
  const viewer = await viewerOr404(c);
  if (!viewer) return c.json({ error: "Klub nenalezen" }, 404);
  return c.json({ mutes: await loadMutes(c.env.DB, viewer.userId) });
});

const MUTE_KINDS = new Set(["item", "team", "district", "category"]);

/** Popisek do seznamu skrytého. Zároveň ověří, že skrývaná věc existuje. */
async function muteLabel(db: D1Database, m: Mute): Promise<string | null> {
  if (m.kind === "category") {
    const label = CATEGORY_LABELS[m.value as FeedCategory];
    return label && m.value !== "posts" ? `všechny ${label}` : null;
  }
  if (m.kind === "team") {
    const t = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(m.value).first<{ name: string }>()
      .catch((e) => { logger.warn({ module: M }, "skrytí klubu", e); return null; });
    return t ? `klub ${t.name}` : null;
  }
  if (m.kind === "district") {
    const d = await db.prepare("SELECT 1 AS x FROM leagues WHERE district = ? LIMIT 1").bind(m.value).first<{ x: number }>()
      .catch((e) => { logger.warn({ module: M }, "skrytí okresu", e); return null; });
    return d ? `okres ${m.value}` : null;
  }
  const target = await resolveTarget(db, m.value);
  if (!target || target.kind === "comment" || target.kind === "fanpost") return null;
  const t = target.title.length > 70 ? `${target.title.slice(0, 69)}…` : target.title;
  return `příspěvek „${t}“`;
}

socialRouter.post("/teams/:teamId/social/mutes", async (c) => {
  const viewer = await viewerOr404(c);
  if (!viewer) return c.json({ error: "Klub nenalezen" }, 404);
  const body = await readJson<{ kind?: unknown; value?: unknown }>(c);
  const kind = typeof body?.kind === "string" ? body.kind : "";
  const value = typeof body?.value === "string" ? body.value : "";
  if (!MUTE_KINDS.has(kind) || !value) return c.json({ error: "Tohle skrýt nejde." }, 400);
  const mute = { kind, value } as Mute;
  if (mute.kind === "team" && value === viewer.teamId) return c.json({ error: "Vlastní klub skrýt nejde." }, 400);
  const label = await muteLabel(c.env.DB, mute);
  if (!label) return c.json({ error: "Tohle skrýt nejde." }, 400);
  await addMute(c.env.DB, viewer.userId, mute, label);
  return c.json({ ok: true, label });
});

socialRouter.post("/teams/:teamId/social/mutes/remove", async (c) => {
  const viewer = await viewerOr404(c);
  if (!viewer) return c.json({ error: "Klub nenalezen" }, 404);
  const body = await readJson<{ kind?: unknown; value?: unknown }>(c);
  const kind = typeof body?.kind === "string" ? body.kind : "";
  const value = typeof body?.value === "string" ? body.value : "";
  if (!MUTE_KINDS.has(kind) || !value) return c.json({ error: "Neznámé skrytí." }, 400);
  await removeMute(c.env.DB, viewer.userId, { kind, value } as Mute);
  return c.json({ ok: true });
});

socialRouter.post("/teams/:teamId/social/reports", async (c) => {
  const viewer = await viewerOr404(c);
  if (!viewer) return c.json({ error: "Klub nenalezen" }, 404);
  const body = await readJson<{ key?: unknown; reason?: unknown }>(c);
  const key = typeof body?.key === "string" ? body.key : "";
  const ref = parseTargetKey(key);
  if (!ref || (ref.kind !== "post" && ref.kind !== "comment")) return c.json({ error: "Nahlásit jde jen příspěvek nebo komentář." }, 400);
  const target = await resolveTarget(c.env.DB, key);
  if (!target) return c.json({ error: "Tohle už neexistuje." }, 404);
  const reason = cleanUserText(body?.reason, 300);
  const fresh = await insertReport(c.env.DB, viewer.userId, key, reason);
  return c.json({ ok: true, already: !fresh });
});

// ── Admin: nahlášené a přepínač odpovědí fanoušků ───────────────────────────

socialRouter.get("/admin/social/reports", async (c) => {
  const db = c.env.DB;
  const rows = await db.prepare(
    `SELECT r.target_key, COUNT(*) AS reports, MIN(r.created_at) AS first_at,
            GROUP_CONCAT(COALESCE(r.reason, ''), ' | ') AS reasons,
            COALESCE(p.body, cm.body) AS body,
            COALESCE((SELECT mm.name FROM managers mm WHERE mm.team_id = p.team_id ORDER BY mm.created_at LIMIT 1), cm.author_name) AS author,
            COALESCE(tp.name, tc.name) AS team_name,
            COALESCE(p.removed_at, cm.removed_at) AS removed_at,
            COALESCE(p.deleted_at, cm.deleted_at) AS deleted_at
       FROM social_reports r
       LEFT JOIN social_posts p ON r.target_key = 'post:' || p.id
       LEFT JOIN social_comments cm ON r.target_key = 'comment:' || cm.id
       LEFT JOIN teams tp ON tp.id = p.team_id
       LEFT JOIN teams tc ON tc.id = cm.team_id
      WHERE r.resolved_at IS NULL
      GROUP BY r.target_key ORDER BY first_at LIMIT 100`,
  ).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: M }, "nahlášené", e); return { results: [] as never[] }; });
  const mode = await c.env.CACHE_KV?.get(SOCIAL_AI_MODE_KEY).catch((e) => { logger.warn({ module: M }, "social_ai_mode", e); return null; });
  return c.json({ reports: rows.results, aiMode: mode === "off" ? "off" : "on" });
});

socialRouter.post("/admin/social/reports/resolve", async (c) => {
  const body = await readJson<{ key?: unknown; action?: unknown }>(c);
  const key = typeof body?.key === "string" ? body.key : "";
  const action = body?.action === "remove" ? "remove" : body?.action === "dismiss" ? "dismiss" : null;
  const ref = parseTargetKey(key);
  if (!ref || (ref.kind !== "post" && ref.kind !== "comment") || !action) return c.json({ error: "Neplatný požadavek" }, 400);
  const db = c.env.DB;
  if (action === "remove") {
    const table = ref.kind === "post" ? "social_posts" : "social_comments";
    await db.prepare(`UPDATE ${table} SET removed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ? AND removed_at IS NULL`)
      .bind(ref.id).run();
  }
  await db.prepare(
    `UPDATE social_reports SET resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), resolution = ?
      WHERE target_key = ? AND resolved_at IS NULL`,
  ).bind(action === "remove" ? "removed" : "dismissed", key).run();
  return c.json({ ok: true });
});

socialRouter.post("/admin/social/ai-mode", async (c) => {
  const body = await readJson<{ mode?: unknown }>(c);
  const mode = body?.mode === "off" ? "off" : body?.mode === "on" ? "on" : null;
  if (!mode) return c.json({ error: "mode musí být on nebo off" }, 400);
  if (!c.env.CACHE_KV) return c.json({ error: "CACHE_KV chybí" }, 500);
  await c.env.CACHE_KV.put(SOCIAL_AI_MODE_KEY, mode);
  return c.json({ ok: true, mode });
});
