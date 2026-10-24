/**
 * Routy registrované dřív než obecná kontrola vlastníka (`gameRouter.use("/teams/:teamId/*")`)
 * a admina (`gameRouter.use("/admin/*")`) se musí hlídat samy. Handler, který odpoví dřív,
 * pozdější middleware v Hono nikdy nespustí. Tady se ověřuje, že bez přihlášení neprojdou.
 */
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import type { Bindings } from "../index";
import { teamsRouter } from "./teams";
import { matchesRouter } from "./matches";
import { messagingRouter } from "./messaging";
import { groupChatsRouter } from "./group-chats";

function bindings(db: FalesnaD1, session: Record<string, unknown> | null): Bindings {
  return {
    DB: jakoD1(db),
    SESSION_KV: { get: async () => (session ? JSON.stringify(session) : null) },
  } as unknown as Bindings;
}

const BUS_BODY = JSON.stringify({ sourceVillageId: "v2", busSize: "karosa" });

describe("autobus na zápas: jen majitel klubu", () => {
  it("bez přihlášení vrací 401 a nic nestrhne", async () => {
    const db = new FalesnaD1([]);
    const res = await teamsRouter.request(
      "/t1/match/m1/bus",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: BUS_BODY },
      bindings(db, null),
    );
    expect(res.status).toBe(401);
    expect(db.dotazy.some((d) => /bus_subsidies|transactions|UPDATE teams/.test(d.sql))).toBe(false);
  });

  it("přihlášený trenér cizího klubu dostane 403", async () => {
    const db = new FalesnaD1([
      { sql: /SELECT user_id FROM teams WHERE id = \?/, first: { user_id: "owner" } },
    ]);
    const res = await teamsRouter.request(
      "/t1/match/m1/bus",
      { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer tok" }, body: BUS_BODY },
      bindings(db, { userId: "someone-else" }),
    );
    expect(res.status).toBe(403);
    expect(db.dotazy.some((d) => /bus_subsidies|transactions/.test(d.sql))).toBe(false);
  });
});

describe("admin přepočty statistik: jen admin", () => {
  for (const path of ["/admin/backfill-match-stats", "/admin/backfill-assists"]) {
    it(`${path} bez přihlášení vrací 401`, async () => {
      const db = new FalesnaD1([]);
      const res = await matchesRouter.request(path, { method: "POST" }, bindings(db, null));
      expect(res.status).toBe(401);
    });

    it(`${path} pro hráče bez admina vrací 403`, async () => {
      const db = new FalesnaD1([
        { sql: /SELECT is_admin FROM users WHERE id = \?/, first: { is_admin: 0 } },
      ]);
      const res = await matchesRouter.request(
        path,
        { method: "POST", headers: { Authorization: "Bearer tok" } },
        bindings(db, { userId: "u1" }),
      );
      expect(res.status).toBe(403);
    });
  }
});

describe("Telefon a chaty manažerů: číst smí jen majitel týmu", () => {
  const PRIVATE_PATHS: Array<[string, typeof messagingRouter]> = [
    ["/teams/t1/conversations", messagingRouter],
    ["/teams/t1/conversations/c1", messagingRouter],
    ["/teams/t1/unread-count", messagingRouter],
    ["/teams/t1/notifications", messagingRouter],
    ["/teams/t1/voice-messages/m1/audio", messagingRouter],
    ["/teams/t1/photos/m1", messagingRouter],
    ["/teams/t1/group-chats", groupChatsRouter],
    ["/teams/t1/group-chats/g1/messages", groupChatsRouter],
  ];

  for (const [path, router] of PRIVATE_PATHS) {
    it(`${path} bez přihlášení vrací 401 a nic nečte`, async () => {
      const db = new FalesnaD1([]);
      const res = await router.request(path, { method: "GET" }, bindings(db, null));
      expect(res.status).toBe(401);
      expect(db.dotazy.some((d) => /conversations|messages|group_chat/.test(d.sql))).toBe(false);
    });

    it(`${path} s cizím týmem vrací 403`, async () => {
      const db = new FalesnaD1([
        { sql: /SELECT id FROM teams WHERE id = \? AND user_id = \?/, first: null },
      ]);
      const res = await router.request(path, { method: "GET", headers: { Authorization: "Bearer tok" } }, bindings(db, { userId: "someone-else" }));
      expect(res.status).toBe(403);
    });
  }

  it("majitel svůj Telefon přečte", async () => {
    const db = new FalesnaD1([
      { sql: /SELECT id FROM teams WHERE id = \? AND user_id = \?/, first: { id: "t1" } },
    ]);
    const res = await messagingRouter.request("/teams/t1/unread-count", { method: "GET", headers: { Authorization: "Bearer tok" } }, bindings(db, { userId: "owner" }));
    expect(res.status).toBe(200);
  });
});
