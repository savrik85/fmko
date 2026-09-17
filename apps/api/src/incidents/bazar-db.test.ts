import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../messaging/system-sms", () => ({ sendSystemSMS: vi.fn(async () => undefined), sendPlayerSMS: vi.fn() }));

import type { Bindings } from "../index";
import { sendSystemSMS } from "../messaging/system-sms";
import { cenaKradenehoZbozi } from "./bazar";
import { vystavKradeneZbozi } from "./bazar-db";
import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";

const DNES = "2026-09-16T16:00:00.000Z";
const TED = new Date("2026-09-16T10:00:00.000Z");
const T = { teamId: "tym-a", gameDate: DNES, seasonNumber: 4 };
const DRESY = JSON.stringify([{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }]);

const radek = (over: Record<string, unknown> = {}) => ({
  id: "inc-1", league_id: "liga-1", status: "otevreny", loss: DRESY, district: "Prachatice", ...over,
});

function prostredi(radky: unknown[], dalsi: Pravidlo[] = []) {
  const db = new FalesnaD1([
    ...dalsi,
    { sql: /FROM club_incidents i/, all: radky },
    { sql: /FROM villages/, all: [{ name: "Volary" }] },
  ]);
  return { db, env: { DB: jakoD1(db) } as unknown as Bindings };
}

beforeEach(() => vi.clearAllMocks());

describe("vystavení kradeného zboží", () => {
  it("poznatelné zboží: soukromý inzerát, stopa pro policii a SMS s odkazem", async () => {
    const { db, env } = prostredi([radek()]);
    expect(await vystavKradeneZbozi(env, T, TED)).toBe(1);
    const inzerat = db.dotazy.find((d) => /INSERT OR IGNORE INTO equipment_listings/.test(d.sql));
    expect(inzerat?.sql).toContain("VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 0, ?, ?)");
    expect(inzerat?.params).toEqual([
      "bazar-inc-1-jerseys", "liga-1", "jerseys", 2, 70, cenaKradenehoZbozi("jerseys", 2, 70),
      "2026-09-23T10:00:00.000Z", expect.stringMatching(/, Volary$/), "inc-1",
    ]);
    const stopa = db.davky.flat().find((d) => /club_incident_clues/.test(d.sql));
    expect(stopa?.params[0]).toBe("inc-1-bazar-1");
    expect(stopa?.params[3]).toBe("bazar");
    expect(stopa?.params[8]).toBe(0.3);
    expect(sendSystemSMS).toHaveBeenCalledWith(
      expect.anything(), "tym-a", "Kustod", expect.stringContaining("Dresy"), { type: "incident", incidentId: "inc-1" },
    );
  });

  it("nepoznatelné zboží: jen inzerát, okradený klub nic neví", async () => {
    const { db, env } = prostredi([radek({ loss: JSON.stringify([{ typ: "vybaveni", kategorie: "balls", uroven: 2, stav: 70, urovniDolu: 2 }]) })]);
    expect(await vystavKradeneZbozi(env, T, TED)).toBe(1);
    expect(db.pocet(/club_incident_clues/)).toBe(0);
    expect(sendSystemSMS).not.toHaveBeenCalled();
  });

  it("uzavřený incident: SMS ano, stopa ne", async () => {
    const { db, env } = prostredi([radek({ status: "uzavreny" })]);
    await vystavKradeneZbozi(env, T, TED);
    expect(db.pocet(/club_incident_clues/)).toBe(0);
    expect(sendSystemSMS).toHaveBeenCalledTimes(1);
  });

  it("inzerát už existuje: nic dalšího se nestane", async () => {
    const { db, env } = prostredi([radek()], [{ sql: /INSERT OR IGNORE INTO equipment_listings/, changes: 0 }]);
    expect(await vystavKradeneZbozi(env, T, TED)).toBe(0);
    expect(db.pocet(/club_incident_clues/)).toBe(0);
    expect(sendSystemSMS).not.toHaveBeenCalled();
  });

  it("hledá dnešní a starší den bazaru, nevrácené věci, aktuální sezónu, bez inzerátu", async () => {
    const { db, env } = prostredi([]);
    await vystavKradeneZbozi(env, T, TED);
    const dotaz = db.dotazy.find((d) => /FROM club_incidents i/.test(d.sql));
    expect(dotaz?.params).toEqual(["tym-a", 4, DNES]);
    expect(dotaz?.sql).toContain("i.recovered = 0");
    expect(dotaz?.sql).toContain("NOT EXISTS (SELECT 1 FROM equipment_listings el WHERE el.incident_id = i.id)");
  });

  it("okres rezervy hledá obce bez přípony U21", async () => {
    const { db, env } = prostredi([radek({ district: "Prachatice U21" })]);
    await vystavKradeneZbozi(env, T, TED);
    expect(db.dotazy.find((d) => /FROM villages/.test(d.sql))?.params).toEqual(["Prachatice"]);
  });
});
