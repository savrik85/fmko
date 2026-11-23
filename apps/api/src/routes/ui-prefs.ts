/**
 * Předvolby zobrazení účtu (sloupec users.ui_prefs, JSON). Patří účtu, ne prohlížeči,
 * takže platí na mobilu i na počítači. Zatím jen výchozí pohled záznamu zápasu:
 * Plánek (2D tracker) nebo Video (3D). Další předvolby se přidají jako další klíče JSONu.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { getSession, getTokenFromRequest } from "../auth/session";
import { logger } from "../lib/logger";

const M = "ui-prefs";

export type ReplayView = "2d" | "3d";

export interface UiPrefs {
  /** Jak se záznam zápasu otevře: Plánek (2D), nebo rovnou Video (3D). */
  replayView: ReplayView;
}

export const DEFAULT_UI_PREFS: UiPrefs = { replayView: "2d" };

function isReplayView(value: unknown): value is ReplayView {
  return value === "2d" || value === "3d";
}

/**
 * Uložený JSON z users.ui_prefs. Poškozený nebo jiný než objekt se zaloguje a bere se jako prázdný:
 * hráč pak dostane výchozí předvolby a další uložení záznam přepíše.
 */
function storedPrefs(raw: string | null, userId: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    logger.warn({ module: M }, `users.ui_prefs uživatele ${userId} není objekt, platí výchozí`);
  } catch (e) {
    logger.warn({ module: M }, `users.ui_prefs uživatele ${userId} není platný JSON, platí výchozí`, e);
  }
  return {};
}

/** Předvolby z uloženého JSONu; co chybí nebo nedává smysl, má výchozí hodnotu. */
export function uiPrefsFrom(stored: Record<string, unknown>): UiPrefs {
  return { replayView: isReplayView(stored.replayView) ? stored.replayView : DEFAULT_UI_PREFS.replayView };
}

async function loadStored(db: D1Database, userId: string): Promise<Record<string, unknown> | null> {
  const row = await db.prepare("SELECT ui_prefs FROM users WHERE id = ?").bind(userId).first<{ ui_prefs: string | null }>();
  return row ? storedPrefs(row.ui_prefs, userId) : null;
}

const uiPrefsRouter = new Hono<{ Bindings: Bindings }>();

/** GET /api/me/ui-prefs — předvolby zobrazení přihlášeného účtu. */
uiPrefsRouter.get("/me/ui-prefs", async (c) => {
  const token = getTokenFromRequest(c);
  if (!token) return c.json({ error: "Nepřihlášen" }, 401);
  const session = await getSession(c.env.SESSION_KV, token);
  if (!session) return c.json({ error: "Neplatná session" }, 401);

  const stored = await loadStored(c.env.DB, session.userId);
  if (!stored) return c.json({ error: "Účet nenalezen" }, 404);
  return c.json(uiPrefsFrom(stored));
});

/** PUT /api/me/ui-prefs — uloží předvolbu; ostatní klíče uloženého JSONu zůstanou. */
uiPrefsRouter.put("/me/ui-prefs", async (c) => {
  const token = getTokenFromRequest(c);
  if (!token) return c.json({ error: "Nepřihlášen" }, 401);
  const session = await getSession(c.env.SESSION_KV, token);
  if (!session) return c.json({ error: "Neplatná session" }, 401);

  let body: { replayView?: unknown };
  try {
    body = await c.req.json();
  } catch (e) {
    logger.warn({ module: M }, "parse ui-prefs body", e);
    return c.json({ error: "Neplatné tělo požadavku" }, 400);
  }
  if (!isReplayView(body?.replayView)) return c.json({ error: "Vyber Plánek, nebo Video" }, 400);

  const stored = await loadStored(c.env.DB, session.userId);
  if (!stored) return c.json({ error: "Účet nenalezen" }, 404);
  const next = { ...stored, replayView: body.replayView };
  await c.env.DB.prepare("UPDATE users SET ui_prefs = ? WHERE id = ?").bind(JSON.stringify(next), session.userId).run();
  return c.json(uiPrefsFrom(next));
});

export { uiPrefsRouter };
