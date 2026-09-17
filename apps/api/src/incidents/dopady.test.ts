import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import { zapisIncident } from "./dopady";
import { denBazaru } from "./bazar";
import { FalesnaD1, jakoD1 } from "./testovaci-d1";
import { PROBLEMOVY, hrac, stavKlubu } from "./testovaci-stav";
import type { NavrhIncidentu } from "./typy";

const NAVRH: NavrhIncidentu = {
  kind: "vloupani_sklad", category: "kradez", status: "otevreny", severity: 1,
  culpritType: "hrac", culpritPlayerId: "p", culpritRevealed: false,
  ztraty: [{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }],
  text: "Ze skladu zmizelo vybavení: Dresy.",
};

describe("zápis incidentu", () => {
  it("opakovaný den (incident už existuje) nezapíše škodu ani stopy", async () => {
    const db = new FalesnaD1([{ sql: /INSERT OR IGNORE INTO club_incidents/, changes: 0 }]);
    const stav = stavKlubu({ kadr: [PROBLEMOVY], vybaveni: { jerseys: 2, jerseys_condition: 70, area_security: 3, area_security_condition: 100 } });
    expect(await zapisIncident(jakoD1(db), stav, NAVRH)).toBeNull();
    expect(db.pocet(/club_incident_clues/)).toBe(0);
    expect(db.pocet(/UPDATE equipment/)).toBe(0);
    expect(db.pocet(/club_incident_knowledge/)).toBe(0);
  });

  it("kamera natočí hráče: stopa se zapíše a pachatel je hned známý", async () => {
    const db = new FalesnaD1([{ sql: /FROM staff_members/, first: { usudek: null } }]);
    const stav = stavKlubu({ kadr: [PROBLEMOVY], vybaveni: { jerseys: 2, jerseys_condition: 70, area_security: 3, area_security_condition: 100 } });
    // Úroveň 3 se stavem 100: šance 0,7 + 100/333 > 1, kamera ho natočí vždy.
    const zapsany = await zapisIncident(jakoD1(db), stav, NAVRH, "inc-test");
    expect(zapsany?.id).toBe("inc-test");
    expect(zapsany?.odhalen).toBe(true);
    expect(zapsany?.nalezeneStopy.length).toBeGreaterThan(0);
    const davka = db.davky.flat();
    expect(davka.some((d) => /UPDATE club_incidents SET loss = \?, culprit_revealed = \?/.test(d.sql) && d.params[1] === 1)).toBe(true);
    expect(davka.some((d) => /INSERT OR IGNORE INTO club_incident_clues/.test(d.sql) && d.params[3] === "kamera")).toBe(true);
  });

  it("selhání zápisu škody a stop (db.batch spadne) neoznámí nic, co se nezapsalo", async () => {
    const db = new FalesnaD1([{ sql: /FROM staff_members/, first: { usudek: null } }]);
    // FalesnaD1.batch přepínač na selhání nemá — přepíšeme instanci přímo.
    db.batch = async () => { throw new Error("D1 výpadek"); };
    const stav = stavKlubu({ kadr: [PROBLEMOVY], vybaveni: { jerseys: 2, jerseys_condition: 70, area_security: 3, area_security_condition: 100 } });
    const zapsany = await zapisIncident(jakoD1(db), stav, NAVRH, "inc-test");
    expect(zapsany?.id).toBe("inc-test");
    expect(zapsany?.nalezeneStopy).toEqual([]);
    expect(zapsany?.odhalen).toBe(false);
    // I když dávka spadla, provedená škoda se musí zapsat samostatně — jinak by v `loss`
    // zůstala nedotčená plánovaná škoda (bez `cena`, `damageId` a upravených úrovní).
    const zapisSkody = db.dotazy.find((d) => /UPDATE club_incidents SET loss = \?, bazar_on = \? WHERE id = \?/.test(d.sql));
    const bazarOn = denBazaru(NAVRH.kind, NAVRH.ztraty, stav.gameDate, createRng(seedFromString("bazar|inc-test")));
    expect(zapisSkody?.params).toEqual([JSON.stringify(NAVRH.ztraty), bazarOn, "inc-test"]);
  });

  it("znalosti: kádr, pachatel a kamarád ze zapsané stopy", async () => {
    const db = new FalesnaD1([
      { sql: /FROM staff_members/, first: { usudek: null } },
      { sql: /FROM relationships WHERE player_a_id = \? OR player_b_id = \?/, all: [{ player_a_id: "p", player_b_id: "k", type: "drinking_buddies", strength: 60 }] },
    ]);
    const stav = stavKlubu({ kadr: [PROBLEMOVY, hrac({ id: "k", jmeno: "Karel Kos" })], vybaveni: { jerseys: 2, jerseys_condition: 70 } });
    await zapisIncident(jakoD1(db), stav, NAVRH, "inc-test");
    const znalosti = db.davky.flat().filter((d) => /INSERT OR IGNORE INTO club_incident_knowledge/.test(d.sql));
    expect(znalosti.map((d) => `${d.params[1]}:${d.params[3]}`)).toEqual(["p:kadr", "k:kadr", "p:pachatel", "k:kamarad"]);
  });

  it("selhání jen první dávky (škoda a stopy): znalosti se zapíšou bez stop, kamarád chybí", async () => {
    const db = new FalesnaD1([
      { sql: /FROM staff_members/, first: { usudek: null } },
      { sql: /FROM relationships WHERE player_a_id = \? OR player_b_id = \?/, all: [{ player_a_id: "p", player_b_id: "k", type: "drinking_buddies", strength: 60 }] },
    ]);
    const puvodniBatch = db.batch.bind(db);
    let volani = 0;
    // První dávka (škoda + stopy) spadne, druhá (znalosti) proběhne normálně.
    db.batch = (async (dotazy: Parameters<typeof puvodniBatch>[0]) => {
      volani++;
      if (volani === 1) throw new Error("D1 výpadek");
      return puvodniBatch(dotazy);
    }) as typeof db.batch;
    const stav = stavKlubu({ kadr: [PROBLEMOVY, hrac({ id: "k", jmeno: "Karel Kos" })], vybaveni: { jerseys: 2, jerseys_condition: 70 } });
    await zapisIncident(jakoD1(db), stav, NAVRH, "inc-test");
    const znalosti = db.davky.flat().filter((d) => /INSERT OR IGNORE INTO club_incident_knowledge/.test(d.sql));
    expect(znalosti.map((d) => `${d.params[1]}:${d.params[3]}`)).toEqual(["p:kadr", "k:kadr", "p:pachatel"]);
  });

  it("den bazaru: prodejná krádež podle losu incidentu, poškození nikdy", async () => {
    const stav = stavKlubu({ kadr: [PROBLEMOVY], vybaveni: { jerseys: 2, jerseys_condition: 70 } });
    const ocekavany = denBazaru(NAVRH.kind, NAVRH.ztraty, stav.gameDate, createRng(seedFromString("bazar|inc-kradez")));
    const kradez = new FalesnaD1([{ sql: /FROM staff_members/, first: { usudek: null } }]);
    await zapisIncident(jakoD1(kradez), stav, NAVRH, "inc-kradez");
    const skoda = kradez.davky.flat().find((d) => /UPDATE club_incidents SET loss = \?, culprit_revealed = \?, bazar_on = \?/.test(d.sql));
    expect(skoda?.params[2]).toBe(ocekavany);

    const vandal: NavrhIncidentu = {
      kind: "vandal", category: "poskozeni", status: "otevreny", severity: 1,
      culpritType: "cizi", culpritPlayerId: null, culpritRevealed: false,
      ztraty: [{ typ: "travnik", pred: 70, po: 40 }], text: "Vandalové rozryli trávník.",
    };
    const poskozeni = new FalesnaD1([{ sql: /FROM staff_members/, first: { usudek: null } }]);
    await zapisIncident(jakoD1(poskozeni), stav, vandal, "inc-vandal");
    const skodaVandal = poskozeni.davky.flat().find((d) => /UPDATE club_incidents SET loss = \?, culprit_revealed = \?, bazar_on = \?/.test(d.sql));
    expect(skodaVandal?.params[2]).toBeNull();
  });

  describe("hrozící čin se stane (spec 9a)", () => {
    it("přechod ze stavu hrozi místo nového řádku a znalosti hrozby se nahradí znalostmi činu", async () => {
      const db = new FalesnaD1([{ sql: /FROM staff_members/, first: { usudek: null } }]);
      const stav = stavKlubu({ kadr: [PROBLEMOVY], vybaveni: { jerseys: 2, jerseys_condition: 70 } });
      const zapsany = await zapisIncident(jakoD1(db), stav, { ...NAVRH, culpritRevealed: true }, "inc-h", { zHroziciho: true });
      expect(zapsany).toMatchObject({ id: "inc-h", odhalen: true });
      expect(db.pocet(/INSERT OR IGNORE INTO club_incidents/)).toBe(0);
      const prechod = db.dotazy.find((d) => /UPDATE club_incidents SET category = \?/.test(d.sql));
      expect(prechod?.sql).toContain("status = 'hrozi'");
      expect(prechod?.params.slice(-2)).toEqual(["inc-h", "tym-a"]);
      const smazani = db.dotazy.find((d) => /DELETE FROM club_incident_knowledge/.test(d.sql));
      expect(smazani?.params).toEqual(["inc-h"]);
      expect(db.davky.some((b) => b.some((d) => /INSERT OR IGNORE INTO club_incident_knowledge/.test(d.sql)))).toBe(true);
    });

    it("už vyhodnocený hrozící čin se nezapíše; bez škody skončí jako nestalo se, ne bez škody", async () => {
      const hotovo = new FalesnaD1([{ sql: /UPDATE club_incidents SET category = \?/, changes: 0 }]);
      expect(await zapisIncident(jakoD1(hotovo), stavKlubu(), NAVRH, "inc-h", { zHroziciho: true })).toBeNull();
      expect(hotovo.pocet(/UPDATE equipment/)).toBe(0);
      expect(hotovo.pocet(/DELETE FROM club_incident_knowledge/)).toBe(0);

      const bezSkody = new FalesnaD1([{ sql: /UPDATE equipment SET/, changes: 0 }]);
      expect(await zapisIncident(jakoD1(bezSkody), stavKlubu({ vybaveni: { jerseys: 2 } }), NAVRH, "inc-h", { zHroziciho: true })).toBeNull();
      expect(bezSkody.dotazy.find((d) => /SET status = 'uzavreny'/.test(d.sql))?.params[0]).toBe("nestalo_se");
    });
  });
});
