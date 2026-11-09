/**
 * /api/admin/* chrání `app.use` přímo v index.ts, ne pořadí připojení routerů.
 * Seznam admin rout se bere ze zdrojáků, nová routa se sem dostane sama.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1, type Pravidlo } from "../incidents/testovaci-d1";
import worker, { type Bindings } from "../index";

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES_DIR = join(SRC_DIR, "routes");
/** Routery připojené jinam než na /api: jejich /admin cesty hlídá router sám. */
const MOUNTED_ELSEWHERE = new Set(["teamsRouter", "clubWebsiteRouter", "villagesRouter", "registrationRouter", "authRouter", "publicLandingRouter"]);
/** Routery připojené na /api/admin/<prefix>. */
const ADMIN_MOUNTS: Record<string, string> = { adminAiClubsRouter: "/ai-clubs", adminAiCoachRouter: "/ai-coach" };

function collectAdminRoutes(): Array<{ method: string; path: string }> {
  const found = new Map<string, { method: string; path: string }>();
  for (const file of readdirSync(ROUTES_DIR)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const source = readFileSync(join(ROUTES_DIR, file), "utf8");
    for (const match of source.matchAll(/(\w+)\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g)) {
      const [, router, method, path] = match;
      if (MOUNTED_ELSEWHERE.has(router)) continue;
      let full: string | null = null;
      if (router in ADMIN_MOUNTS) full = `/api/admin${ADMIN_MOUNTS[router]}${path === "/" ? "" : path}`;
      else if (path.startsWith("/admin/")) full = `/api${path}`;
      if (full) found.set(`${method} ${full}`, { method: method.toUpperCase(), path: full.replace(/:\w+/g, "x1") });
    }
  }
  return [...found.values()];
}

const ADMIN_ROUTES = collectAdminRoutes();

function bindings(rules: Pravidlo[], session: Record<string, unknown> | null): { env: Bindings; db: FalesnaD1 } {
  const db = new FalesnaD1(rules);
  const env = {
    DB: jakoD1(db),
    SESSION_KV: { get: async (key: string) => (session && key.startsWith("session:") ? JSON.stringify(session) : null) },
    CACHE_KV: { get: async () => null, put: async () => undefined },
  } as unknown as Bindings;
  return { env, db };
}

const SESSION = { userId: "u1", email: "u1@example.com", teamId: "t1", createdAt: new Date().toISOString(), renewedAt: new Date().toISOString() };
const ADMIN_SQL = /SELECT is_admin FROM users WHERE id = \?/;

function request(route: { method: string; path: string }, token?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const hasBody = route.method !== "GET" && route.method !== "DELETE";
  return new Request(`https://api.test${route.path}`, { method: route.method, headers, body: hasBody ? "{}" : undefined });
}

describe("admin routy pod /api/admin", () => {
  it("soupis ze zdrojáků není prázdný", () => {
    expect(ADMIN_ROUTES.length).toBeGreaterThan(100);
  });

  it("index.ts hlídá /api/admin/* dřív, než připojí první router", () => {
    const index = readFileSync(join(SRC_DIR, "index.ts"), "utf8");
    const guardAt = index.indexOf('app.use("/api/admin/*", requireAdmin)');
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(index.indexOf("app.route("));
  });

  for (const route of ADMIN_ROUTES) {
    it(`${route.method} ${route.path} bez přihlášení vrací 401 a nesáhne do databáze`, async () => {
      const { env, db } = bindings([], null);
      const res = await worker.fetch(request(route), env);
      expect(res.status).toBe(401);
      expect(db.dotazy.length + db.davky.length).toBe(0);
    });

    it(`${route.method} ${route.path} pro hráče bez admina vrací 403`, async () => {
      const { env, db } = bindings([{ sql: ADMIN_SQL, first: { is_admin: 0 } }], SESSION);
      const res = await worker.fetch(request(route, "tok"), env);
      expect(res.status).toBe(403);
      expect(db.dotazy.every((d) => ADMIN_SQL.test(d.sql))).toBe(true);
    });
  }

  it("neexistující admin cesta bez přihlášení taky končí 401, ne 404", async () => {
    const { env } = bindings([], null);
    const res = await worker.fetch(new Request("https://api.test/api/admin/does-not-exist"), env);
    expect(res.status).toBe(401);
  });

  it("admina pustí až k handleru", async () => {
    const { env } = bindings([{ sql: ADMIN_SQL, first: { is_admin: 1 } }], SESSION);
    const res = await worker.fetch(new Request("https://api.test/api/admin/queue/mode", { headers: { Authorization: "Bearer tok" } }), env);
    expect(res.status).toBe(200);
  });
});
