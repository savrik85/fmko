import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/manager-attrs", () => ({
  applyManagerAttrDelta: vi.fn(async () => ({ applied: 1, oldValue: 40, newValue: 41, skipped: null })),
}));
vi.mock("../messaging/system-sms", () => ({
  sendPlayerSMS: vi.fn(async () => "konverzace"),
  sendSystemSMS: vi.fn(async () => undefined),
}));

import type { Bindings } from "../index";
import { applyManagerAttrDelta } from "../lib/manager-attrs";
import { sendPlayerSMS, sendSystemSMS } from "../messaging/system-sms";
import { obvinHrace, zavolejPolicii } from "./akce";
import type { IncidentRadek } from "./incident-db";
import { SMS_ROLE_POLICIE } from "./nastaveni";
import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";
import { hracRadek, incidentRadek } from "./testovaci-stav";

const DNES = "2026-09-16T16:00:00.000Z";

function prostredi(incident: IncidentRadek, dalsi: Pravidlo[] = []) {
  const db = new FalesnaD1([
    ...dalsi,
    { sql: /FROM club_incidents WHERE id = \? AND team_id = \?/, first: incident },
    { sql: /SELECT game_date FROM teams/, first: { game_date: DNES } },
    { sql: /FROM players WHERE id = \? AND team_id = \?/, first: hracRadek("a", "Adam", "Kos") },
    { sql: /FROM relationships/, first: { n: 0 } },
  ]);
  return { db, env: { DB: jakoD1(db) } as unknown as Bindings };
}

beforeEach(() => vi.clearAllMocks());

describe("obvinění", () => {
  it("nevinný hráč: zapírá, zapíše se křivé obvinění a dopadne to na morálku", async () => {
    const { db, env } = prostredi(incidentRadek());
    expect(await obvinHrace(env, "tym-a", "inc-1", "a")).toEqual({ ok: true, vysledek: "zapira", odhalen: false });
    const narok = db.dotazy.find((d) => /UPDATE club_incidents SET accusations/.test(d.sql));
    expect(narok?.params[0]).toBe(1);
    expect(JSON.parse(String(narok?.params[1]))).toEqual([{ playerId: "a", jmeno: "Adam Kos", den: "2026-09-16", vysledek: "zapira" }]);
    expect(narok?.params[2]).toBe(0);
    const davka = db.davky.flat();
    expect(davka.some((d) => /INSERT OR REPLACE INTO club_incident_knowledge/.test(d.sql) && d.params[1] === "a")).toBe(true);
    expect(davka.filter((d) => /UPDATE players/.test(d.sql))).toHaveLength(3);
    expect(sendPlayerSMS).toHaveBeenCalledTimes(1);
  });

  it("souběh: když se incident mezitím změnil, nic dalšího se nestane", async () => {
    const { db, env } = prostredi(incidentRadek(), [{ sql: /UPDATE club_incidents SET accusations/, changes: 0 }]);
    expect(await obvinHrace(env, "tym-a", "inc-1", "a")).toMatchObject({ ok: false, kod: 409 });
    expect(db.davky).toHaveLength(0);
    expect(sendPlayerSMS).not.toHaveBeenCalled();
  });

  it("po dvou obviněních už obvinit nejde", async () => {
    const { db, env } = prostredi(incidentRadek({ accusations: 2 }));
    expect(await obvinHrace(env, "tym-a", "inc-1", "a")).toMatchObject({ ok: false, kod: 409 });
    expect(db.pocet(/UPDATE club_incidents/)).toBe(0);
  });

  it("hráč mimo kádr obvinit nejde", async () => {
    const { env } = prostredi(incidentRadek(), [{ sql: /FROM players WHERE id = \? AND team_id = \?/, first: null }]);
    expect(await obvinHrace(env, "tym-a", "inc-1", "x")).toMatchObject({ ok: false, kod: 400 });
  });

  it("pachatel, na kterého ukazuje nalezená stopa, je odhalen a vznikne stopa přiznání", async () => {
    const stopa = {
      id: "inc-1-spravce-1", source: "spravce", points_to_player_id: "p", suspects: null, holder_player_id: null,
      strength: 2, police_bonus: 0.1, text: "Správce.", found: 1,
    };
    const { db, env } = prostredi(incidentRadek(), [
      { sql: /FROM players WHERE id = \? AND team_id = \?/, first: hracRadek("p", "Pepa", "Průšvih") },
      { sql: /FROM club_incident_clues/, all: [stopa] },
    ]);
    expect(await obvinHrace(env, "tym-a", "inc-1", "p")).toMatchObject({ ok: true, odhalen: true });
    const narok = db.dotazy.find((d) => /UPDATE club_incidents SET accusations/.test(d.sql));
    expect(narok?.params[2]).toBe(1);
    expect(db.davky.flat().some((d) => /INSERT OR IGNORE INTO club_incident_clues/.test(d.sql) && d.params[3] === "priznani")).toBe(true);
  });

  it("obvinění bez přiznání sníží motivaci trenéra, přiznání/usvědčení ne", async () => {
    await obvinHrace(prostredi(incidentRadek()).env, "tym-a", "inc-1", "a");
    expect(applyManagerAttrDelta).toHaveBeenCalledWith(
      expect.anything(), "tym-a", "motivation", -1, "incident", "Obvinění bez přiznání: Adam Kos",
      { referenceId: "inc-inc-1-mgr-motivation-1", gameDate: DNES },
    );
    vi.mocked(applyManagerAttrDelta).mockClear();
    // Pachatel se stopou vedoucí na něj skončí vždy priznal/usvedcen, nikdy zapira.
    const stopa = {
      id: "inc-1-spravce-1", source: "spravce", points_to_player_id: "p", suspects: null, holder_player_id: null,
      strength: 2, police_bonus: 0.1, text: "Správce.", found: 1,
    };
    await obvinHrace(prostredi(incidentRadek(), [
      { sql: /FROM players WHERE id = \? AND team_id = \?/, first: hracRadek("p", "Pepa", "Průšvih") },
      { sql: /FROM club_incident_clues/, all: [stopa] },
    ]).env, "tym-a", "inc-1", "p");
    expect(applyManagerAttrDelta).not.toHaveBeenCalled();
  });
});

describe("policie", () => {
  it("převezme neodhalený incident a výsledek dá do 3 až 7 dní", async () => {
    const { db, env } = prostredi(incidentRadek());
    const v = await zavolejPolicii(env, "tym-a", "inc-1");
    if (!v.ok) throw new Error(v.chyba);
    const dni = (Date.parse(v.vysledekOn) - Date.parse(DNES)) / 86_400_000;
    expect(dni).toBeGreaterThanOrEqual(3);
    expect(dni).toBeLessThanOrEqual(7);
    expect(db.pocet(/UPDATE club_incidents SET status = 'policie'/)).toBe(1);
    expect(sendSystemSMS).toHaveBeenCalledWith(expect.anything(), "tym-a", SMS_ROLE_POLICIE, expect.any(String));
  });

  it("u odhaleného pachatele ani podruhé policii zavolat nejde", async () => {
    expect(await zavolejPolicii(prostredi(incidentRadek({ culprit_revealed: 1 })).env, "tym-a", "inc-1")).toMatchObject({ ok: false, kod: 409 });
    expect(await zavolejPolicii(prostredi(incidentRadek({ police_success: 0 })).env, "tym-a", "inc-1")).toMatchObject({ ok: false, kod: 409 });
  });
});
