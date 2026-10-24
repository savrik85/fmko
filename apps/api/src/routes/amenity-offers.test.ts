/**
 * Nabídka vylepšení na stránkách vybavení a stadionu nese, kolik spokojenosti
 * klubu po stropu zázemí opravdu přidá. Bez spuštěného API se to tady ověřuje
 * přímo na routách nad falešnou D1.
 */
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1, type Pravidlo } from "../incidents/testovaci-d1";
import type { Bindings } from "../index";
import { gameRouter } from "./game";
import { CATEGORIES } from "../equipment/equipment-generator";

function bindings(db: FalesnaD1): Bindings {
  return {
    DB: jakoD1(db),
    CACHE_KV: { get: async () => null },
  } as unknown as Bindings;
}

/** Sociálky L2 dají samy +3, tedy celý strop zázemí. */
const stadiumRow = {
  id: "s1", team_id: "t1", capacity: 150, pitch_condition: 60, pitch_type: "natural",
  changing_rooms: 1, showers: 1, refreshments: 0, lighting: 0, stands: 1,
  stand_main: 1, stand_opposite: 0, stand_goal_west: 0, stand_goal_east: 0, stand_ext_capacity: 0,
  roof: 0, ultras_stand: 0, toilets: 2, parking: 0, fence: 1, entrance_gate: 0, security: 0, cage: 0, vip_box: 0,
  concession_mode: "external",
};

const equipmentRow: Record<string, unknown> = { id: "e1", team_id: "t1" };
for (const c of CATEGORIES) {
  equipmentRow[c] = 0;
  equipmentRow[`${c}_condition`] = 100;
}

const common: Pravidlo[] = [
  { sql: /SELECT \* FROM stadiums WHERE team_id = \?/, first: stadiumRow, all: [stadiumRow] },
  { sql: /SELECT \* FROM equipment WHERE team_id = \?/, first: equipmentRow, all: [equipmentRow] },
  { sql: /SELECT reputation(, stadium_name, game_date)? FROM teams WHERE id = \?/, all: [{ reputation: 80, stadium_name: null, game_date: "2026-10-24T16:00:00.000Z" }] },
  { sql: /COUNT\(\*\) as cnt FROM matches/, all: [{ cnt: 40 }] },
  { sql: /SELECT number FROM seasons/, all: [{ number: 3 }] },
];

describe("nabídka vylepšení a strop zázemí", () => {
  it("vybavení: ozvučení klubu se sociálkami L2 nepřidá nic a nabídka to řekne", async () => {
    const db = new FalesnaD1(common);
    const res = await gameRouter.request("/teams/t1/equipment", { method: "GET" }, bindings(db));
    expect(res.status).toBe(200);
    const body = await res.json() as { upgrades: Array<{ category: string; amenity?: { raw: number; gain: number; current: number; note: string } }> };
    const pa = body.upgrades.find((u) => u.category === "pa_system");
    expect(pa?.amenity).toMatchObject({ raw: 2, gain: 0, current: 3 });
    expect(pa?.amenity?.note).toContain("už nepřidá");
    expect(body.upgrades.find((u) => u.category === "balls")?.amenity).toBeUndefined();
  });

  it("stadion: sociálky L3 klubu na stropu nepřidají nic, pořadatelé L1 spokojenost neslibují", async () => {
    const db = new FalesnaD1(common);
    const res = await gameRouter.request("/teams/t1/stadium", { method: "GET" }, bindings(db));
    expect(res.status).toBe(200);
    const body = await res.json() as { upgrades: Array<{ facility: string; effect: string; amenity?: { raw: number; gain: number } }> };
    const toilets = body.upgrades.find((u) => u.facility === "toilets");
    expect(toilets?.effect).toContain("+3 spokojenost po domácím zápase");
    expect(toilets?.amenity).toMatchObject({ raw: 3, gain: 0 });
    expect(body.upgrades.find((u) => u.facility === "security")?.amenity).toBeUndefined();
  });
});
