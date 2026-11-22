import { describe, expect, it } from "vitest";
import { gameExpiry } from "../lib/game-time";
import { FalesnaD1, jakoD1 } from "./testovaci-d1";
import { PROBLEMOVY, stavKlubu } from "./testovaci-stav";
import type { NavrhIncidentu } from "./typy";
import { BEZ_ZNALOSTI, blokZnalosti, type RadekZnalostiDb } from "./znalosti";
import { nactiZnalostiHrace, zapisZnalosti } from "./znalosti-db";

const DNES = "2026-09-16T16:00:00.000Z";
const NAVRH: NavrhIncidentu = {
  kind: "vloupani_sklad", category: "kradez", status: "otevreny", severity: 1,
  culpritType: "hrac", culpritPlayerId: "p", culpritRevealed: false,
  ztraty: [{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }],
  text: "Ze skladu zmizelo vybavení: Dresy.",
};

describe("zápis znalostí", () => {
  it("jedna dávka INSERT OR IGNORE s rolí a sezónou", async () => {
    const db = new FalesnaD1();
    expect(await zapisZnalosti(jakoD1(db), stavKlubu({ kadr: [PROBLEMOVY] }), NAVRH, "inc-1", [])).toBe(true);
    expect(db.davky).toHaveLength(1);
    expect(db.davky[0].map((d) => d.params[3])).toEqual(["kadr", "pachatel"]);
    expect(db.davky[0][0].sql).toContain("INSERT OR IGNORE INTO club_incident_knowledge");
    expect(db.davky[0][0].params).toEqual(["inc-1", "p", "tym-a", "kadr", NAVRH.text, 50, gameExpiry(DNES, 14), 4]);
  });

  it("selhání dávky vrátí false a nevyhodí", async () => {
    const db = new FalesnaD1();
    db.batch = async () => { throw new Error("D1 výpadek"); };
    expect(await zapisZnalosti(jakoD1(db), stavKlubu({ kadr: [PROBLEMOVY] }), NAVRH, "inc-1", [])).toBe(false);
  });
});

function radekDb(over: Partial<RadekZnalostiDb> = {}): RadekZnalostiDb {
  return {
    incident_id: "inc-1", role: "kadr", fact: NAVRH.text, interrogation: null,
    kind: "vloupani_sklad", category: "kradez", severity: 1, game_date: "2026-09-13T16:00:00.000Z", status: "otevreny",
    resolution: null, culprit_revealed: 0, culprit_player_id: "p", pachatel_jmeno: null, pachatel_prijmeni: null,
    ...over,
  };
}

const sRadky = (radky: RadekZnalostiDb[]) => new FalesnaD1([
  { sql: /FROM teams t WHERE t\.id = \?/, first: { game_date: DNES, sezona: 4 } },
  { sql: /FROM club_incident_knowledge k/, all: radky },
]);

describe("načtení znalostí hráče", () => {
  it("platnost podle herního dne, sezóny a uzavření incidentu", async () => {
    const db = sRadky([]);
    expect(await nactiZnalostiHrace(jakoD1(db), { teamId: "tym-a", playerId: "s" })).toEqual([]);
    const dotaz = db.dotazy.find((d) => /FROM club_incident_knowledge k/.test(d.sql));
    expect(dotaz?.params).toEqual(["s", "tym-a", 4, DNES, gameExpiry(DNES, -7)]);
    expect(dotaz?.sql).toContain("i.status != 'uzavreny' OR i.resolved_on >= ?");
  });

  it("téma platí jen v herní den, kdy se nastavilo", async () => {
    const radky = [radekDb(), radekDb({ role: "svedek" })];
    const dnes = await nactiZnalostiHrace(jakoD1(sRadky(radky)), { teamId: "tym-a", playerId: "s", tema: { incidentId: "inc-1", den: "2026-09-16" } });
    expect(dnes?.map((r) => r.role)).toEqual(["kadr", "svedek"]);
    const vcera = await nactiZnalostiHrace(jakoD1(sRadky(radky)), { teamId: "tym-a", playerId: "s", tema: { incidentId: "inc-1", den: "2026-09-15" } });
    expect(vcera?.map((r) => r.role)).toEqual(["kadr"]);
  });

  it("odhalenému pachateli po vypršení veřejné znalosti zůstane vlastní průšvih i bez tématu", async () => {
    // Dotaz už řádek kádru nevrátí (until vypršel), pachatelův platí 60 dní.
    const rows = [radekDb({ role: "pachatel", fact: "Tohle jsi udělal ty: Vloupání do skladu.", status: "uzavreny", resolution: "pokuta", culprit_revealed: 1 })];
    const loaded = await nactiZnalostiHrace(jakoD1(sRadky(rows)), { teamId: "tym-a", playerId: "p" });
    expect(loaded?.map((r) => r.role)).toEqual(["pachatel"]);
    expect(blokZnalosti(loaded)).not.toBe(BEZ_ZNALOSTI);
    expect(blokZnalosti(loaded)).toContain("Trenér ti dal pokutu.");
  });

  it("Hrdlička: dřívější zapírání v SMS od incidentu pozná, starší SMS ne", async () => {
    const own = radekDb({
      role: "pachatel", fact: "Tohle jsi udělal ty: Vloupání do skladu.", status: "uzavreny", resolution: "srazka", culprit_revealed: 1,
      created_at: "2026-11-03T02:00:00Z", loss: JSON.stringify(NAVRH.ztraty),
    });
    const withSms = (bodies: Array<[string, string]>) => new FalesnaD1([
      { sql: /FROM teams t WHERE t\.id = \?/, first: { game_date: DNES, sezona: 4 } },
      { sql: /FROM club_incident_knowledge k/, all: [own] },
      { sql: /m\.sender_type = 'player'/, all: bodies.map(([body, sent_at]) => ({ body, sent_at })) },
    ]);
    const denied = await nactiZnalostiHrace(jakoD1(withSms([["Jaký dresy proboha… Nic jsem neukradl", "2026-11-21 18:02:11"]])), { teamId: "tym-a", playerId: "p" });
    expect(blokZnalosti(denied)).toContain("Dřív jsi to trenérovi zapíral, to už neplatí: přiznej, že jsi lhal.");
    expect(blokZnalosti(denied)).toContain("Vzal jsi: dresy.");
    const before = await nactiZnalostiHrace(jakoD1(withSms([["Nic jsem neukradl", "2026-11-01T10:00:00Z"]])), { teamId: "tym-a", playerId: "p" });
    expect(blokZnalosti(before)).not.toContain("Dřív jsi to trenérovi zapíral,");
  });

  it("bez herního dne nic nenačte a netvrdí, že hráč nic neví", async () => {
    const db = new FalesnaD1([{ sql: /FROM teams t WHERE t\.id = \?/, first: null }]);
    expect(await nactiZnalostiHrace(jakoD1(db), { teamId: "tym-a", playerId: "s" })).toBeUndefined();
  });
});
