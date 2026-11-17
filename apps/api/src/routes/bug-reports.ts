/**
 * Hlášení chyb ze hry.
 *
 * Hráč pošle screen, nepovinný komentář a technické podrobnosti (POST /bug-reports).
 * Admin je vidí v administraci, odpoví a odpověď odejde hráči jako SMS od „Tvůrce hry“.
 * Admin cesty hlídá globální `requireAdmin` na /api/admin/* (index.ts).
 */

import { Hono, type Context } from "hono";
import type { Bindings } from "../index";
import { requireAuth } from "../auth/middleware";
import { logger } from "../lib/logger";
import { createNotification } from "../community/notifications";
import { sendSystemSMS } from "../messaging/system-sms";

const M = "bug-reports";

export const BUG_REPORT_SENDER = "Tvůrce hry";
const MAX_COMMENT = 2_000;
const MAX_URL = 500;
const MAX_CONTEXT = 30_000;
const MAX_REPLY = 2_000;
/** iPhone screen z galerie má i 3–5 MB, focení stránky do ~2 MB. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REPORTS_PER_HOUR = 10;
const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const ADMIN_LINK = "/admin?tab=hlaseni";

type Session = { userId: string; teamId: string | null };

function sessionOf(c: Context<{ Bindings: Bindings }>): Session {
  return c.get("session" as never) as Session;
}

function excerpt(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export const bugReportsRouter = new Hono<{ Bindings: Bindings }>();

bugReportsRouter.use("/bug-reports", requireAuth);

bugReportsRouter.post("/bug-reports", async (c) => {
  const db = c.env.DB;
  const session = sessionOf(c);

  const recent = await db.prepare(
    "SELECT COUNT(*) AS n FROM bug_reports WHERE user_id = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 hour')",
  ).bind(session.userId).first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAX_REPORTS_PER_HOUR) {
    return c.json({ error: "Hlášení posíláš moc rychle za sebou, zkus to za chvíli." }, 429);
  }

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch (e) {
    logger.warn({ module: M }, "hlášení: neplatný formulář", e);
    return c.json({ error: "Hlášení se nepodařilo přečíst." }, 400);
  }

  const pageUrl = String(form.get("pageUrl") ?? "").slice(0, MAX_URL);
  if (!pageUrl) return c.json({ error: "Chybí stránka." }, 400);
  const comment = String(form.get("comment") ?? "").trim().slice(0, MAX_COMMENT) || null;
  const context = sanitizeContext(String(form.get("context") ?? "").slice(0, MAX_CONTEXT));
  const image = form.get("image");
  const hasImage = image instanceof File && image.size > 0;
  if (!hasImage && !comment) return c.json({ error: "Přidej screen nebo napiš, co se stalo." }, 400);

  // Klub bereme jen ten, který hráči opravdu patří.
  const claimedTeam = String(form.get("teamId") ?? "");
  const team = claimedTeam
    ? await db.prepare("SELECT id, name FROM teams WHERE id = ? AND user_id = ?")
      .bind(claimedTeam, session.userId).first<{ id: string; name: string }>()
    : null;

  const id = crypto.randomUUID();
  let imageKey: string | null = null;
  if (hasImage) {
    const ext = IMAGE_TYPES[image.type];
    if (!ext) return c.json({ error: "Screen musí být obrázek JPG, PNG nebo WebP." }, 400);
    if (image.size > MAX_IMAGE_BYTES) return c.json({ error: "Screen je moc velký (nejvýš 8 MB)." }, 400);
    imageKey = `bug-reports/${id}.${ext}`;
    await c.env.SEED_DATA.put(imageKey, await image.arrayBuffer(), { httpMetadata: { contentType: image.type } });
  }

  await db.prepare(
    "INSERT INTO bug_reports (id, user_id, team_id, page_url, comment, image_key, context) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(id, session.userId, team?.id ?? null, pageUrl, comment, imageKey, context).run();

  await notifyAdmins(c.env, team?.name ?? null, comment, pageUrl);
  return c.json({ id });
});

const REPLAY_ORIGIN = "https://eu.posthog.com";

/**
 * Kontext posílá hráč, takže mu nevěříme: musí to být JSON objekt a odkaz na nahrávku
 * se nechá jen na PostHog přes https. Jinak by v adminu šel podstrčit odkaz
 * `javascript:` nebo na cizí web, na který autor klikne.
 */
function sanitizeContext(raw: string): string | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    logger.warn({ module: M }, "kontext hlášení není JSON, zahazuji ho", e);
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const ctx = parsed as Record<string, unknown>;
  if (!isReplayUrl(ctx.replayUrl)) ctx.replayUrl = null;
  return JSON.stringify(ctx);
}

export function isReplayUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).origin === REPLAY_ORIGIN;
  } catch (e) {
    logger.warn({ module: M }, "odkaz na nahrávku není URL", e);
    return false;
  }
}

/** Oznámení (s pushem) na hlavní klub každého admina. */
async function notifyAdmins(env: Bindings, teamName: string | null, comment: string | null, pageUrl: string): Promise<void> {
  const admins = await env.DB.prepare(
    `SELECT t.id FROM teams t JOIN users u ON u.id = t.user_id
      WHERE u.is_admin = 1 AND t.parent_team_id IS NULL`,
  ).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, "admini pro hlášení chyby", e); return { results: [] as Array<{ id: string }> }; });
  const who = teamName ?? "Hráč";
  const what = comment ? `„${excerpt(comment, 80)}“` : "bez komentáře";
  for (const admin of admins.results) {
    try {
      await createNotification(env.DB, admin.id, "system", "Nové hlášení chyby", `${who} na ${excerpt(pageUrl, 60)}: ${what}`, ADMIN_LINK, env);
    } catch (e) {
      logger.warn({ module: M }, `oznámení adminovi ${admin.id} o hlášení chyby`, e);
    }
  }
}

// ── Admin ───────────────────────────────────────────────────

interface ReportRow {
  id: string;
  user_id: string;
  team_id: string | null;
  team_name: string | null;
  email: string | null;
  page_url: string;
  comment: string | null;
  image_key: string | null;
  context: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

bugReportsRouter.get("/admin/bug-reports", async (c) => {
  const status = c.req.query("status") ?? "new";
  const where = status === "all" ? "" : "WHERE r.status = ?";
  const stmt = c.env.DB.prepare(
    `SELECT r.id, r.user_id, r.team_id, t.name AS team_name, u.email, r.page_url, r.comment,
            r.image_key, r.context, r.status, r.created_at, r.resolved_at
       FROM bug_reports r
       LEFT JOIN teams t ON t.id = r.team_id
       LEFT JOIN users u ON u.id = r.user_id
       ${where}
      ORDER BY r.created_at DESC
      LIMIT 100`,
  );
  const reports = await (status === "all" ? stmt : stmt.bind(status)).all<ReportRow>();
  const ids = reports.results.map((r) => r.id);
  const replies = ids.length
    ? await c.env.DB.prepare(
      `SELECT id, report_id, body, created_at FROM bug_report_replies
        WHERE report_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at`,
    ).bind(...ids).all<{ id: string; report_id: string; body: string; created_at: string }>()
    : { results: [] };
  const open = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM bug_reports WHERE status = 'new'").first<{ n: number }>();
  return c.json({
    openCount: open?.n ?? 0,
    reports: reports.results.map((r) => ({
      ...r,
      context: r.context ? safeJson(r.context) : null,
      hasImage: r.image_key != null,
      replies: replies.results.filter((x) => x.report_id === r.id),
    })),
  });
});

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (e) {
    logger.warn({ module: M }, "kontext hlášení není JSON", e);
    return { raw: text };
  }
}

bugReportsRouter.get("/admin/bug-reports/:id/image", async (c) => {
  const row = await c.env.DB.prepare("SELECT image_key FROM bug_reports WHERE id = ?")
    .bind(c.req.param("id")).first<{ image_key: string | null }>();
  if (!row?.image_key) return c.json({ error: "Hlášení nemá screen." }, 404);
  const obj = await c.env.SEED_DATA.get(row.image_key);
  if (!obj) return c.json({ error: "Screen v úložišti chybí." }, 404);
  return new Response(obj.body, {
    headers: { "Content-Type": obj.httpMetadata?.contentType ?? "image/jpeg", "Cache-Control": "private, max-age=3600" },
  });
});

/**
 * Kam doručit odpověď: klub, ze kterého hráč hlásil, pokud ho pořád vede; jinak jeho
 * hlavní klub (původní mohl převzít AI trenér). Bez klubu odpověď nejde doručit.
 */
async function replyTeam(db: D1Database, userId: string, reportTeamId: string | null): Promise<string | null> {
  if (reportTeamId) {
    const still = await db.prepare("SELECT id FROM teams WHERE id = ? AND user_id = ?").bind(reportTeamId, userId).first<{ id: string }>();
    if (still) return still.id;
  }
  const main = await db.prepare(
    "SELECT id FROM teams WHERE user_id = ? ORDER BY (parent_team_id IS NOT NULL), created_at LIMIT 1",
  ).bind(userId).first<{ id: string }>();
  return main?.id ?? null;
}

bugReportsRouter.post("/admin/bug-reports/:id/reply", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const body = await c.req.json<{ text?: string }>().catch((e) => {
    logger.warn({ module: M }, "odpověď na hlášení: neplatné JSON", e);
    return {} as { text?: string };
  });
  const text = String(body.text ?? "").trim().slice(0, MAX_REPLY);
  if (!text) return c.json({ error: "Napiš odpověď." }, 400);

  const report = await db.prepare("SELECT user_id, team_id, comment, created_at FROM bug_reports WHERE id = ?")
    .bind(id).first<{ user_id: string; team_id: string | null; comment: string | null; created_at: string }>();
  if (!report) return c.json({ error: "Hlášení neexistuje." }, 404);

  const teamId = await replyTeam(db, report.user_id, report.team_id);
  if (!teamId) return c.json({ error: "Hráč teď nevede žádný klub, odpověď nejde doručit." }, 409);

  const date = new Date(report.created_at).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", timeZone: "Europe/Prague" });
  const about = report.comment ? `K tvému hlášení z ${date} („${excerpt(report.comment, 60)}“):` : `K tvému hlášení z ${date}:`;
  await sendSystemSMS(db, teamId, BUG_REPORT_SENDER, `${about}\n${text}`);
  await db.prepare("INSERT INTO bug_report_replies (id, report_id, body, team_id) VALUES (?, ?, ?, ?)")
    .bind(crypto.randomUUID(), id, text, teamId).run();
  return c.json({ ok: true, teamId });
});

bugReportsRouter.post("/admin/bug-reports/:id/status", async (c) => {
  const body = await c.req.json<{ status?: string }>().catch((e) => {
    logger.warn({ module: M }, "stav hlášení: neplatné JSON", e);
    return {} as { status?: string };
  });
  if (body.status !== "new" && body.status !== "resolved") return c.json({ error: "Neznámý stav." }, 400);
  await c.env.DB.prepare(
    "UPDATE bug_reports SET status = ?, resolved_at = CASE WHEN ? = 'resolved' THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ELSE NULL END WHERE id = ?",
  ).bind(body.status, body.status, c.req.param("id")).run();
  return c.json({ ok: true });
});
