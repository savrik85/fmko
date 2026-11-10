/**
 * Čtení dat klubu: výchozí stav je „jen majitel“.
 *
 * `requireTeamOwnership` v jednotlivých routerech pouští GET bez kontroly, takže
 * každý nový GET pod /api/teams/:teamId byl veřejný, dokud si ho handler sám
 * nezamkl. Tady je to obráceně: GET a HEAD pod /api/teams/:teamId projde bez
 * přihlášení jen tehdy, když je cesta na seznamu `PUBLIC_TEAM_READS`. Všechno
 * ostatní smí číst majitel týmu (áčko i jeho U21 mají stejné `user_id`) a admin.
 *
 * Věší se v `index.ts` před připojením routerů. Zápisy (POST, PUT, PATCH, DELETE)
 * tudy jen procházejí, ty dál hlídají routery a handlery.
 */

import { createMiddleware } from "hono/factory";
import type { Bindings } from "../index";
import { getSession, getTokenFromRequest } from "./session";
import { logger } from "../lib/logger";

/**
 * Cesty za `/api/teams/:teamId`, které hra legitimně ukazuje i cizím lidem.
 * U každé je důvod: kdo ji volá s cizím id nebo bez přihlášení. Nová veřejná
 * routa sem musí přibýt výslovně.
 */
export const PUBLIC_TEAM_READS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /^$/, reason: "profil klubu (soupeř, pozvánka, obec); finance vynechává handler" },
  { pattern: /^\/players$/, reason: "kádr soupeře; cizím zamlžený, bez mezd a povahy" },
  { pattern: /^\/manager$/, reason: "profil trenéra, pozvánka bez přihlášení" },
  { pattern: /^\/manager\/history$/, reason: "profil cizího trenéra" },
  { pattern: /^\/league-teams$/, reason: "přepínač klubů na profilu soupeře" },
  { pattern: /^\/transfer-overview$/, reason: "přestupy na profilu soupeře" },
  { pattern: /^\/standings$/, reason: "tabulka, pozvánka bez přihlášení" },
  { pattern: /^\/league-stats$/, reason: "statistiky soutěže" },
  { pattern: /^\/league-schedule$/, reason: "rozpis soutěže" },
  { pattern: /^\/players\/[^/]+\/league-rank$/, reason: "pořadí hráče v soutěži na profilu cizího hráče" },
  { pattern: /^\/match-results$/, reason: "výsledky na profilu soupeře" },
  { pattern: /^\/achievements$/, reason: "úspěchy na profilu cizího trenéra" },
  { pattern: /^\/stadium$/, reason: "stadion soupeře a zápasový den" },
  { pattern: /^\/sponsors$/, reason: "reklamy na stadionu soupeře; cizím jen názvy bannerů" },
  { pattern: /^\/fans\/chants$/, reason: "chorály kotle na stadionu soupeře" },
  { pattern: /^\/family$/, reason: "rodina na profilu cizího trenéra" },
  { pattern: /^\/coach\/education$/, reason: "licence na profilu cizího trenéra; kurzy jen majiteli" },
  { pattern: /^\/website(\/.*)?$/, reason: "klubový web bez přihlášení, :teamId může být i adresa klubu" },
  { pattern: /^\/club\/anthem\/[^/]+\/stream$/, reason: "<audio src> neumí poslat token" },
  { pattern: /^\/club\/mascot\/[^/]+\/image$/, reason: "<img src> neumí poslat token" },
];

const TEAM_PATH = /^\/api\/teams\/([^/]+)(\/.*)?$/;

/** Rozdělí cestu na id týmu a zbytek za ním (bez koncového lomítka). Mimo /api/teams vrací null. */
export function splitTeamPath(path: string): { teamId: string; rest: string } | null {
  const match = TEAM_PATH.exec(path);
  if (!match) return null;
  let teamId = match[1];
  try {
    teamId = decodeURIComponent(teamId);
  } catch (e) {
    // Rozbité kódování nechá id tak, jak přišlo: soukromá cesta stejně skončí 403.
    logger.warn({ module: "team-read-guard" }, "nečitelné id týmu v adrese", e);
  }
  return { teamId, rest: (match[2] ?? "").replace(/\/+$/, "") };
}

export function isPublicTeamRead(rest: string): boolean {
  return PUBLIC_TEAM_READS.some((entry) => entry.pattern.test(rest));
}

export const guardTeamReads = createMiddleware<{ Bindings: Bindings }>(async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") return next();
  const target = splitTeamPath(c.req.path);
  if (!target || isPublicTeamRead(target.rest)) return next();

  const token = getTokenFromRequest(c);
  if (!token) return c.json({ error: "Nepřihlášen" }, 401);
  const session = await getSession(c.env.SESSION_KV, token);
  if (!session) return c.json({ error: "Neplatná session" }, 401);

  const ownTeam = await c.env.DB.prepare(
    "SELECT id FROM teams WHERE id = ? AND user_id = ?",
  ).bind(target.teamId, session.userId).first();
  if (!ownTeam) {
    const user = await c.env.DB.prepare(
      "SELECT is_admin FROM users WHERE id = ?",
    ).bind(session.userId).first<{ is_admin: number }>();
    if (!user?.is_admin) return c.json({ error: "Přístup odepřen" }, 403);
  }

  c.set("session" as never, session as never);
  return next();
});
