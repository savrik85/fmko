/**
 * Kdo se dívá. GET routy nechává `requireTeamOwnership` projít bez kontroly,
 * takže vlastnictví podle `:teamId` v URL si může kdokoli podvrhnout. Tady se
 * odvozuje ze session: týmy, které přihlášený uživatel skutečně řídí
 * (áčko i jeho rezerva mají stejné `user_id`).
 */

import type { Context } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { getSession, getTokenFromRequest } from "./session";

/** Id týmů přihlášeného uživatele. Bez přihlášení prázdná množina. */
export async function tymyDivaka(c: Context<{ Bindings: Bindings }>): Promise<Set<string>> {
  const token = getTokenFromRequest(c);
  if (!token) return new Set();
  const session = await getSession(c.env.SESSION_KV, token)
    .catch((e) => { logger.warn({ module: "divak" }, "načtení session", e); return null; });
  if (!session) return new Set();
  const rows = await c.env.DB.prepare("SELECT id FROM teams WHERE user_id = ?")
    .bind(session.userId).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: "divak" }, "týmy diváka", e); return { results: [] as Array<{ id: string }> }; });
  return new Set(rows.results.map((r) => r.id));
}

/**
 * Pro GET routy s neveřejnými daty klubu. `requireTeamOwnership` GET propouští bez kontroly
 * (většina herních dat je veřejná), tohle ne. Vrací chybovou odpověď (401 bez přihlášení,
 * 403 cizí klub), nebo null, když se dívá majitel `teamId`.
 */
export async function rejectUnlessOwner(c: Context<{ Bindings: Bindings }>, teamId: string): Promise<Response | null> {
  if (!getTokenFromRequest(c)) return c.json({ error: "Nepřihlášen" }, 401);
  if (!(await tymyDivaka(c)).has(teamId)) return c.json({ error: "Přístup odepřen" }, 403);
  return null;
}
