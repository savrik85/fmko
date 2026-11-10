/**
 * Čtení dat klubu je soukromé, dokud cesta není na seznamu veřejných.
 *
 * Seznam GET rout se bere ze zdrojáků routerů, takže nová routa pod
 * /api/teams/:teamId se sem dostane sama a bez zápisu mezi veřejné musí
 * vracet 401 a 403.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1, type Pravidlo } from "../incidents/testovaci-d1";
import worker, { type Bindings } from "../index";
import { isPublicTeamRead, splitTeamPath } from "./team-read-guard";

const ROUTES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "routes");
/** Routery připojené rovnou na /api/teams; ostatní mají /teams/:teamId v cestě samy. */
const TEAM_MOUNTED_ROUTERS = new Set(["teamsRouter", "clubWebsiteRouter"]);

/** Všechny GET routy s id týmu v cestě, už jako cesta za /api/teams/:teamId. */
function collectTeamGetRoutes(): string[] {
  const found = new Set<string>();
  for (const file of readdirSync(ROUTES_DIR)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const source = readFileSync(join(ROUTES_DIR, file), "utf8");
    for (const match of source.matchAll(/(\w+)\.get\(\s*"([^"]+)"/g)) {
      const [, router, path] = match;
      if (TEAM_MOUNTED_ROUTERS.has(router)) {
        if (path === "/:id" || path.startsWith("/:id/")) found.add(path.slice("/:id".length));
      } else if (path === "/teams/:teamId" || path.startsWith("/teams/:teamId/")) {
        found.add(path.slice("/teams/:teamId".length));
      }
    }
  }
  return [...found].sort();
}

/** Veřejné cesty vypsané ručně: změna seznamu v guardu se tu musí potvrdit. */
const EXPECTED_PUBLIC = [
  "",
  "/players",
  "/manager",
  "/manager/history",
  "/league-teams",
  "/transfer-overview",
  "/standings",
  "/league-stats",
  "/league-schedule",
  "/players/:playerId/league-rank",
  "/match-results",
  "/achievements",
  "/stadium",
  "/sponsors",
  "/fans/chants",
  "/family",
  "/coach/education",
  "/website",
  "/website/stadium-photo/:viewpoint",
  "/website/player/:playerId",
  "/website/matches",
  "/website/program",
  "/website/coach",
  "/club/anthem/:anthemId/stream",
  "/club/mascot/:mascotId/image",
];

/** Routy z auditu 2026-11-09, které šly číst bez přihlášení. Musí zůstat zamčené jmenovitě. */
const AUDITED_PRIVATE = [
  "/lineup/:calendarId",
  "/lineup-presets",
  "/transactions",
  "/wages",
  "/budget",
  "/cash-loans",
  "/concession",
  "/concession/sales",
  "/fans",
  "/training",
  "/coach-interviews",
  "/staff",
  "/transfers",
  "/absences",
  "/relationships",
  "/players/:playerId/profile-extras",
  "/players/:playerId/training-log",
  "/search-players",
  "/watchlist",
  "/offers",
  "/market",
  "/scout",
  "/negotiations",
  "/obligations",
  "/squad-analysis",
  "/competition",
  "/relations",
];

const ALL_ROUTES = collectTeamGetRoutes();
const PRIVATE_ROUTES = ALL_ROUTES.filter((route) => !EXPECTED_PUBLIC.includes(route));

function url(route: string): string {
  return `https://api.test/api/teams/t1${route.replace(/:\w+/g, "x1")}`;
}

function bindings(rules: Pravidlo[], session: Record<string, unknown> | null): { env: Bindings; db: FalesnaD1 } {
  const db = new FalesnaD1(rules);
  const env = {
    DB: jakoD1(db),
    SESSION_KV: { get: async (key: string) => (session && key.startsWith("session:") ? JSON.stringify(session) : null) },
    CACHE_KV: { get: async () => null, put: async () => undefined },
  } as unknown as Bindings;
  return { env, db };
}

const SESSION = { userId: "u1", email: "u1@example.com", teamId: "t9", createdAt: new Date().toISOString(), renewedAt: new Date().toISOString() };
const OWNERSHIP_SQL = /SELECT id FROM teams WHERE id = \? AND user_id = \?/;
const ADMIN_SQL = /SELECT is_admin FROM users WHERE id = \?/;

async function get(route: string, env: Bindings, token?: string): Promise<Response> {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  return worker.fetch(new Request(url(route), { headers }), env);
}

describe("soupis GET rout pod /api/teams/:teamId", () => {
  it("najde routy ve zdrojácích", () => {
    expect(ALL_ROUTES.length).toBeGreaterThan(150);
  });

  it("veřejný seznam v testu sedí se seznamem v guardu", () => {
    const publicByGuard = ALL_ROUTES.filter((route) => isPublicTeamRead(route.replace(/:\w+/g, "x1")));
    expect(publicByGuard.sort()).toEqual([...EXPECTED_PUBLIC].sort());
  });

  it("každá veřejná cesta z testu opravdu existuje", () => {
    for (const route of EXPECTED_PUBLIC) expect(ALL_ROUTES, route).toContain(route);
  });

  it("routy z auditu jsou mezi soukromými", () => {
    for (const route of AUDITED_PRIVATE) expect(PRIVATE_ROUTES, route).toContain(route);
  });
});

describe("soukromé čtení: jen majitel týmu", () => {
  for (const route of PRIVATE_ROUTES) {
    it(`${route} bez přihlášení vrací 401 a nesáhne do databáze`, async () => {
      const { env, db } = bindings([], null);
      const res = await get(route, env);
      expect(res.status).toBe(401);
      expect(db.dotazy.length + db.davky.length).toBe(0);
    });

    it(`${route} s cizím tokenem vrací 403`, async () => {
      const { env, db } = bindings([
        { sql: OWNERSHIP_SQL, first: null },
        { sql: ADMIN_SQL, first: { is_admin: 0 } },
      ], SESSION);
      const res = await get(route, env, "tok");
      expect(res.status).toBe(403);
      // Kromě ověření vlastníka a admina se nic nečte.
      expect(db.dotazy.every((d) => OWNERSHIP_SQL.test(d.sql) || ADMIN_SQL.test(d.sql))).toBe(true);
      expect(db.davky.length).toBe(0);
    });
  }

  it("neplatný token vrací 401", async () => {
    const { env } = bindings([], null);
    const res = await get("/transactions", env, "expired");
    expect(res.status).toBe(401);
  });

  it("majitele guard pustí až k handleru", async () => {
    const { env, db } = bindings([{ sql: OWNERSHIP_SQL, first: { id: "t1" } }], SESSION);
    const res = await get("/wages", env, "tok");
    expect(res.status).toBe(200);
    expect(db.dotazy.some((d) => /weekly_wage|players/.test(d.sql))).toBe(true);
  });

  it("admina guard pustí i k cizímu týmu", async () => {
    const { env } = bindings([
      { sql: OWNERSHIP_SQL, first: null },
      { sql: ADMIN_SQL, first: { is_admin: 1 } },
    ], SESSION);
    const res = await get("/wages", env, "tok");
    expect(res.status).toBe(200);
  });

  it("HEAD se hlídá stejně jako GET", async () => {
    const { env } = bindings([], null);
    const res = await worker.fetch(new Request(url("/transactions"), { method: "HEAD" }), env);
    expect(res.status).toBe(401);
  });
});

describe("veřejné čtení projde bez přihlášení", () => {
  for (const route of EXPECTED_PUBLIC) {
    it(`${route || "/"} guard nezastaví`, async () => {
      const { env } = bindings([], null);
      const res = await get(route, env);
      expect([401, 403]).not.toContain(res.status);
    });
  }

  it("úspěchy cizího klubu vrací 200", async () => {
    const { env } = bindings([], null);
    const res = await get("/achievements", env);
    expect(res.status).toBe(200);
    const body = await res.json() as { totalCount: number };
    expect(body.totalCount).toBeGreaterThan(0);
  });

  it("rodina a přestupy cizího klubu vrací 200", async () => {
    const { env } = bindings([], null);
    expect((await get("/family", env)).status).toBe(200);
    expect((await get("/transfer-overview", env)).status).toBe(200);
  });
});

describe("zápisy guard nechává routerům", () => {
  it("POST bez přihlášení odmítne až router, ne guard čtení", async () => {
    const { env } = bindings([], null);
    const res = await worker.fetch(new Request(url("/watchlist/x1"), { method: "POST" }), env);
    expect(res.status).toBe(401);
  });
});

describe("splitTeamPath", () => {
  it("oddělí id týmu a zbytek cesty", () => {
    expect(splitTeamPath("/api/teams/t1/players/p1/league-rank")).toEqual({ teamId: "t1", rest: "/players/p1/league-rank" });
    expect(splitTeamPath("/api/teams/t1")).toEqual({ teamId: "t1", rest: "" });
    expect(splitTeamPath("/api/teams/t1/")).toEqual({ teamId: "t1", rest: "" });
    expect(splitTeamPath("/api/teams/sokol%20lhota/website")).toEqual({ teamId: "sokol lhota", rest: "/website" });
    expect(splitTeamPath("/api/leagues/l1/standings")).toBeNull();
  });

  it("podobná cesta se za veřejnou neschová", () => {
    expect(isPublicTeamRead("/players/p1")).toBe(false);
    expect(isPublicTeamRead("/sponsors/negotiations/n1")).toBe(false);
    expect(isPublicTeamRead("/stadium/upgrade")).toBe(false);
    expect(isPublicTeamRead("/websites")).toBe(false);
    expect(isPublicTeamRead("/club/anthem/list")).toBe(false);
  });
});
