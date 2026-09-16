import { describe, expect, it } from "vitest";
import { zapisIncident } from "./dopady";
import { FalesnaD1, jakoD1 } from "./testovaci-d1";
import { PROBLEMOVY, stavKlubu } from "./testovaci-stav";
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
});
