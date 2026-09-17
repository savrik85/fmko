import { describe, expect, it } from "vitest";
import { gameExpiry } from "../lib/game-time";
import { FalesnaD1, jakoD1 } from "./testovaci-d1";
import { PROBLEMOVY, stavKlubu } from "./testovaci-stav";
import type { NavrhIncidentu } from "./typy";
import type { RadekZnalostiDb } from "./znalosti";
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

  it("bez herního dne nic nenačte a netvrdí, že hráč nic neví", async () => {
    const db = new FalesnaD1([{ sql: /FROM teams t WHERE t\.id = \?/, first: null }]);
    expect(await nactiZnalostiHrace(jakoD1(db), { teamId: "tym-a", playerId: "s" })).toBeUndefined();
  });
});
