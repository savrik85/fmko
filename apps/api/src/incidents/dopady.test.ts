import { describe, expect, it } from "vitest";
import { zapisIncident } from "./dopady";
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
    const zapisSkody = db.dotazy.find((d) => /UPDATE club_incidents SET loss = \? WHERE id = \?/.test(d.sql));
    expect(zapisSkody?.params).toEqual([JSON.stringify(NAVRH.ztraty), "inc-test"]);
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
});
