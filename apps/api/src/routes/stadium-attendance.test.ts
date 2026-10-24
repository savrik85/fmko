/**
 * Stránka stadionu dostává k nabídce tribun a přístaveb návštěvu posledních
 * domácích zápasů, ať je vidět vedle kapacity. Ověřeno na routě nad falešnou D1.
 */
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import type { Bindings } from "../index";
import { gameRouter } from "./game";

const stadiumRow = {
  id: "s1", team_id: "t1", capacity: 150, pitch_condition: 60, pitch_type: "natural",
  stands: 2, stand_main: 2, stand_opposite: 2, stand_goal_west: 2, stand_goal_east: 2, stand_ext_capacity: 0,
  toilets: 0, fence: 1, security: 0, vip_box: 0, concession_mode: "external",
};

describe("stadion: návštěva vedle kapacity", () => {
  it("vrací průměr a nejvyšší návštěvu posledních domácích zápasů", async () => {
    const db = new FalesnaD1([
      { sql: /SELECT \* FROM stadiums WHERE team_id = \?/, first: stadiumRow, all: [stadiumRow] },
      { sql: /SELECT reputation, stadium_name, game_date FROM teams/, all: [{ reputation: 60, stadium_name: null, game_date: "2026-10-24T16:00:00.000Z" }] },
      { sql: /COUNT\(\*\) as cnt FROM matches/, all: [{ cnt: 40 }] },
      { sql: /SELECT number FROM seasons/, all: [{ number: 3 }] },
      { sql: /FROM cup_matches cm\s+JOIN cup_teams hc/, all: [{ attendance: 230 }, { attendance: 250 }, { attendance: 190 }] },
    ]);
    const res = await gameRouter.request("/teams/t1/stadium", { method: "GET" }, {
      DB: jakoD1(db),
      CACHE_KV: { get: async () => null },
    } as unknown as Bindings);
    expect(res.status).toBe(200);
    const body = await res.json() as { capacity: number; homeAttendance: { matches: number; average: number; max: number } };
    // Čtyři strany L2 = 150 + 290 míst
    expect(body.capacity).toBe(440);
    expect(body.homeAttendance).toEqual({ matches: 3, average: 223, max: 250 });
  });
});
