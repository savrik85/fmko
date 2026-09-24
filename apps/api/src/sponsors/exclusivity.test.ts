/**
 * Přednost u sponzorů s končící hlavní smlouvou (rollover), hlavně u firem sdílených
 * z doby před exkluzivitou: kdo si firmu letos podepsal jednáním, ten ji má.
 */
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import { assignMainPriorities, blockedMainSponsorIds } from "./exclusivity";

const ENDING = /sc\.seasons_remaining <= 1 AND sc\.sponsor_id IS NOT NULL/;
const HELD = /sc\.seasons_remaining > 1 AND sc\.sponsor_id IS NOT NULL/;
const PRIORITY = /UPDATE district_sponsors SET priority_team_id/;

const row = (teamId: string, teamName: string, reputation: number) =>
  ({ sponsor_id: 7, team_id: teamId, sponsor_name: "Löffler", team_name: teamName, reputation });

describe("assignMainPriorities", () => {
  it("podepsaná smlouva z jednání má přednost před sdílenými zbytky bez ohledu na reputaci (řazení v SQL)", async () => {
    const d = new FalesnaD1([{ sql: ENDING, all: [] }, { sql: HELD, all: [] }]);
    await assignMainPriorities(jakoD1(d), 6);
    const q = d.dotazy.find((x) => ENDING.test(x.sql))!;
    expect(q.sql).toMatch(/ORDER BY sc\.sponsor_id, \(sc\.negotiation_id IS NULL\), t\.reputation DESC/);
  });

  it("jednosezónní prodloužení u sdílené firmy: přednost dostane klub, který podepsal, druhý dostane zprávu", async () => {
    // SQL už seřadilo: nejdřív smlouva z jednání (Spůle), pak sdílený zbytek (Hradčany, vyšší reputace).
    const d = new FalesnaD1([
      { sql: ENDING, all: [row("t1", "FK Löffler Spůle", 40), row("t2", "FK Löffler Hradčany", 80)] },
      { sql: HELD, all: [] },
    ]);
    const losses = await assignMainPriorities(jakoD1(d), 6);
    const upd = d.davky.flat().find((x) => PRIORITY.test(x.sql))!;
    expect(upd.params).toEqual(["t1", 6, 7]);
    expect(losses).toEqual([{ teamId: "t2", sponsorName: "Löffler", winnerTeamName: "FK Löffler Spůle" }]);
  });

  it("prodloužení na víc sezón: firma je obsazená, přednost se nedává a ostatním sdíleným klubům jde zpráva", async () => {
    const d = new FalesnaD1([
      { sql: ENDING, all: [row("t2", "FK Löffler Hradčany", 80), row("t3", "SK Třetí", 50)] },
      { sql: HELD, all: [{ sponsor_id: 7, team_id: "t1", team_name: "FK Löffler Spůle" }] },
    ]);
    const losses = await assignMainPriorities(jakoD1(d), 6);
    expect(d.davky).toHaveLength(0);
    expect(losses).toEqual([
      { teamId: "t2", sponsorName: "Löffler", winnerTeamName: "FK Löffler Spůle" },
      { teamId: "t3", sponsorName: "Löffler", winnerTeamName: "FK Löffler Spůle" },
    ]);
  });

  it("běžná končící smlouva jednoho klubu: přednost jemu, nikdo bez přednosti", async () => {
    const d = new FalesnaD1([{ sql: ENDING, all: [row("t1", "FK Lhota", 50)] }, { sql: HELD, all: [] }]);
    expect(await assignMainPriorities(jakoD1(d), 6)).toEqual([]);
    expect(d.davky.flat().find((x) => PRIORITY.test(x.sql))!.params).toEqual(["t1", 6, 7]);
  });
});

describe("blockedMainSponsorIds", () => {
  it("výjimka pro sdílený zbytek a pořadí parametrů", async () => {
    const d = new FalesnaD1();
    await blockedMainSponsorIds(jakoD1(d), "okres1", "t1", 5);
    const q = d.dotazy[0];
    expect(q.sql).toContain("AND NOT ((sc.seasons_remaining <= 1 AND sc.negotiation_id IS NULL) AND EXISTS");
    expect(q.params).toEqual(["okres1", "t1", "t1", 5, "t1"]);
  });
});
