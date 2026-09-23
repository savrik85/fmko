/**
 * Spouštěče SMS od majitelů nad falešnou D1: stabilní reference (idempotence přes
 * INSERT OR IGNORE), série proher jednou za sérii a den před zápasem podle zítřka.
 */
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import { enqueueAfterMatchSms, enqueueLosingStreakSms, enqueueMatchEveSms, enqueueSeasonEndSms } from "./owner-sms-triggers";

const HERNI_DEN = { sql: /SELECT game_date FROM teams WHERE id = \?/, first: { game_date: "2026-09-10T16:00:00.000Z" } };
const VZTAH = { sql: /WITH rel AS/, all: [{ sponsor_id: 7, favor: 60, has_contract: 1, is_main: 1 }] };
const MAJITEL = {
  sql: /FROM sponsor_owners WHERE sponsor_id IN/,
  all: [{ sponsor_id: 7, first_name: "Jan", last_name: "Novák", age: 50, face_config: "{}", personality: "fan" }],
};

function zarazene(db: FalesnaD1) {
  return db.dotazy.filter((d) => /INSERT OR IGNORE INTO sponsor_owner_sms/.test(d.sql));
}

describe("enqueueAfterMatchSms", () => {
  it("výhra: každý majitel z tribuny dostane vlastní referenci match:{zápas}:{sponzor}", async () => {
    const db = new FalesnaD1([HERNI_DEN]);
    expect(await enqueueAfterMatchSms(jakoD1(db), "m1", "t1", 3, 1, [7, 9])).toBe(2);
    const ins = zarazene(db);
    expect(ins.map((d) => [d.params[1], d.params[3], d.params[4]])).toEqual([
      [7, "after_win", "match:m1:7"], [9, "after_win", "match:m1:9"],
    ]);
    expect(ins[0].params[7]).toBe("2026-09-10");
  });

  it("remíza ani prázdná tribuna nic nezařadí", async () => {
    const db = new FalesnaD1([HERNI_DEN]);
    expect(await enqueueAfterMatchSms(jakoD1(db), "m1", "t1", 1, 1, [7])).toBe(0);
    expect(await enqueueAfterMatchSms(jakoD1(db), "m1", "t1", 0, 2, [])).toBe(0);
    expect(zarazene(db)).toHaveLength(0);
  });
});

describe("enqueueLosingStreakSms", () => {
  it("tři prohry v řadě: reference podle první prohry série", async () => {
    const db = new FalesnaD1([
      { sql: /FROM matches WHERE \(home_team_id/, all: [
        { id: "m5", res: "L" }, { id: "m4", res: "L" }, { id: "m3", res: "L" }, { id: "m2", res: "W" },
      ] },
      VZTAH, MAJITEL,
    ]);
    expect(await enqueueLosingStreakSms(jakoD1(db), "t1", "2026-09-10")).toBe(true);
    const ins = zarazene(db);
    expect(ins).toHaveLength(1);
    expect(ins[0].params[3]).toBe("losing_streak");
    expect(ins[0].params[4]).toBe("streak:t1:m3");
  });

  it("dvě prohry nestačí", async () => {
    const db = new FalesnaD1([
      { sql: /FROM matches WHERE \(home_team_id/, all: [{ id: "m5", res: "L" }, { id: "m4", res: "L" }, { id: "m3", res: "D" }] },
      VZTAH, MAJITEL,
    ]);
    expect(await enqueueLosingStreakSms(jakoD1(db), "t1", "2026-09-10")).toBe(false);
    expect(zarazene(db)).toHaveLength(0);
  });

  it("dotaz má široké okno (LIMIT 60) a vylučuje přátelské zápasy (league_id IS NOT NULL)", async () => {
    const db = new FalesnaD1([
      { sql: /FROM matches WHERE \(home_team_id/, all: [
        { id: "m3", res: "L" }, { id: "m2", res: "L" }, { id: "m1", res: "L" },
      ] },
      VZTAH, MAJITEL,
    ]);
    await enqueueLosingStreakSms(jakoD1(db), "t1", "2026-09-10");
    const dotaz = db.dotazy.find((d) => /FROM matches WHERE \(home_team_id/.test(d.sql));
    expect(dotaz?.sql).toContain("league_id IS NOT NULL");
    expect(dotaz?.sql).toContain("LIMIT 60");
  });

  it("série 12 proher dá stejnou referenci jako série 3 (první prohra série se nemění, i když přátelák v ní chybí)", async () => {
    // Série 3: nejstarší prohra je m1.
    const dbTri = new FalesnaD1([
      { sql: /FROM matches WHERE \(home_team_id/, all: [{ id: "m3", res: "L" }, { id: "m2", res: "L" }, { id: "m1", res: "L" }, { id: "m0", res: "W" }] },
      VZTAH, MAJITEL,
    ]);
    await enqueueLosingStreakSms(jakoD1(dbTri), "t1", "2026-09-10");
    expect(zarazene(dbTri)[0].params[4]).toBe("streak:t1:m1");

    // Série 12 (LIMIT 10 by tu useklo referenci na 10. zápas): mezi m5 a m1 chybí m2-m4 —
    // to jsou přátelské zápasy, které SQL (league_id IS NOT NULL) do výsledku vůbec nedá,
    // takže sérii nepřeruší ani nezmění, kde skutečně začala.
    const dvanactProher = [
      { id: "m16", res: "L" }, { id: "m15", res: "L" }, { id: "m14", res: "L" }, { id: "m13", res: "L" },
      { id: "m12", res: "L" }, { id: "m11", res: "L" }, { id: "m10", res: "L" }, { id: "m9", res: "L" },
      { id: "m8", res: "L" }, { id: "m7", res: "L" }, { id: "m5", res: "L" }, { id: "m1", res: "L" },
      { id: "m0", res: "W" },
    ];
    const dbDvanact = new FalesnaD1([
      { sql: /FROM matches WHERE \(home_team_id/, all: dvanactProher },
      VZTAH, MAJITEL,
    ]);
    expect(await enqueueLosingStreakSms(jakoD1(dbDvanact), "t1", "2026-09-10")).toBe(true);
    const ins = zarazene(dbDvanact);
    expect(ins[0].params[4]).toBe("streak:t1:m1");
    expect(JSON.parse(String(ins[0].params[6]))).toEqual({ serie: 12 });
  });
});

describe("enqueueMatchEveSms", () => {
  it("hledá pozvání na zítřek a referencí je pozvání", async () => {
    const db = new FalesnaD1([
      { sql: /FROM sponsor_invitations si/, all: [{ id: "inv1", sponsor_id: 7, team_id: "t1" }] },
    ]);
    expect(await enqueueMatchEveSms(jakoD1(db), "2026-09-10")).toBe(1);
    const dotaz = db.dotazy.find((d) => /FROM sponsor_invitations si/.test(d.sql));
    expect(dotaz?.params).toEqual(["2026-09-11"]);
    expect(zarazene(db)[0].params[4]).toBe("eve:inv1");
  });
});

describe("enqueueSeasonEndSms", () => {
  const STANDINGS = { sql: /SELECT t\.id AS team_id/, all: [{ team_id: "t1", wins: 10, draws: 0, played: 10 }] };

  it("bez vyloučení dostane vztahový majitel verdikt sezóny normálně", async () => {
    const db = new FalesnaD1([STANDINGS, VZTAH, MAJITEL]);
    expect(await enqueueSeasonEndSms(jakoD1(db), 5, "2026-09-10")).toBe(1);
    const ins = zarazene(db);
    expect(ins[0].params[3]).toBe("season_thanks");
    expect(ins[0].params[4]).toBe("season:5:t1");
  });

  it("majitele s právě vypršelou hlavní smlouvou vynechá, i kdyby jinak dostal verdikt sezóny", async () => {
    const db = new FalesnaD1([STANDINGS, VZTAH, MAJITEL]);
    const n = await enqueueSeasonEndSms(jakoD1(db), 5, "2026-09-10", [{ team_id: "t1", sponsor_id: 7 }]);
    expect(n).toBe(0);
    expect(zarazene(db)).toHaveLength(0);
  });

  it("vyloučení platí jen pro svůj tým, jiný tým dostane verdikt normálně", async () => {
    const db = new FalesnaD1([
      { sql: /SELECT t\.id AS team_id/, all: [{ team_id: "t1", wins: 10, draws: 0, played: 10 }, { team_id: "t2", wins: 10, draws: 0, played: 10 }] },
      VZTAH, MAJITEL,
    ]);
    const n = await enqueueSeasonEndSms(jakoD1(db), 5, "2026-09-10", [{ team_id: "t1", sponsor_id: 7 }]);
    expect(n).toBe(1);
    expect(zarazene(db)[0].params[4]).toBe("season:5:t2");
  });
});
