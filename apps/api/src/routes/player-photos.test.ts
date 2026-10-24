import { describe, expect, it } from "vitest";
import type { Bindings } from "../index";
import { messagingRouter } from "./messaging";

const ID = "20b9098c-e8d1-4b5a-8cf6-9ffbb6c21df1";

function bindings(stored: Record<string, string>): Bindings {
  return {
    SEED_DATA: {
      get: async (key: string) => (key in stored ? { body: stored[key], httpMetadata: { contentType: "image/jpeg" } } : null),
    },
  } as unknown as Bindings;
}

describe("fotka od hráče přes odkaz", () => {
  it("vrátí fotku bez přihlášení, ať ji přehraje i nahrávka v PostHogu", async () => {
    const res = await messagingRouter.request(`/player-photos/${ID}`, {}, bindings({ [`photos/${ID}.jpg`]: "jpeg" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Cache-Control")).toContain("public");
    expect(await res.text()).toBe("jpeg");
  });

  it("neexistující fotka je 404, cokoli jiného než id fotky 400", async () => {
    expect((await messagingRouter.request(`/player-photos/${ID}`, {}, bindings({}))).status).toBe(404);
    expect((await messagingRouter.request("/player-photos/abc", {}, bindings({}))).status).toBe(400);
  });
});
