/**
 * Vyhodnocení pozvánek majitelů po zápase: bonus za VIP lóži a jednorázovost.
 */
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import { settleSponsorInvitations } from "./hooks";

const POZVANKA = { sql: /FROM sponsor_invitations si/, all: [{ id: "i1", sponsor_id: 7, personality: "businessman" }] };

function zapsanaDelta(db: FalesnaD1): unknown {
  // Zápis do sponsor_team_favor teď jede v dávce (spolu s logem do deníku), ne samostatně.
  return [...db.dotazy, ...db.davky.flat()].find((d) => /INSERT INTO sponsor_team_favor/.test(d.sql))?.params[3];
}

describe("settleSponsorInvitations", () => {
  it("výhra bez lóže: +4", async () => {
    const db = new FalesnaD1([POZVANKA, { sql: /UPDATE sponsor_invitations SET status = 'attended'/, changes: 1 }]);
    await settleSponsorInvitations(jakoD1(db), "m1", "t1", 2, 1);
    expect(zapsanaDelta(db)).toBe(4);
  });

  it("výhra s lóží L2: +4 a +2 za lóži", async () => {
    const db = new FalesnaD1([POZVANKA, { sql: /UPDATE sponsor_invitations SET status = 'attended'/, changes: 1 }]);
    await settleSponsorInvitations(jakoD1(db), "m1", "t1", 2, 1, 2);
    expect(zapsanaDelta(db)).toBe(6);
  });

  it("prohra s lóží L3: −1 a +3 za lóži", async () => {
    const db = new FalesnaD1([POZVANKA, { sql: /UPDATE sponsor_invitations SET status = 'attended'/, changes: 1 }]);
    await settleSponsorInvitations(jakoD1(db), "m1", "t1", 0, 1, 3);
    expect(zapsanaDelta(db)).toBe(2);
  });

  it("pozvánku už vyhodnotil jiný běh: nic se nepřičte", async () => {
    const db = new FalesnaD1([POZVANKA, { sql: /UPDATE sponsor_invitations SET status = 'attended'/, changes: 0 }]);
    await settleSponsorInvitations(jakoD1(db), "m1", "t1", 2, 1, 3);
    expect(db.pocet(/INSERT INTO sponsor_team_favor/)).toBe(0);
  });
});
