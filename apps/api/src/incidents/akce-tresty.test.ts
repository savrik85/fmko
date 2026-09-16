import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../messaging/system-sms", () => ({
  sendPlayerSMS: vi.fn(async () => "konverzace"),
  sendSystemSMS: vi.fn(async () => undefined),
}));
vi.mock("../season/finance-processor", () => ({ recordTransaction: vi.fn(async () => 0) }));
vi.mock("../transfers/remove-player", () => ({ removePlayer: vi.fn(async () => ({ ok: true })) }));

import type { Bindings } from "../index";
import { sendPlayerSMS, sendSystemSMS } from "../messaging/system-sms";
import { recordTransaction } from "../season/finance-processor";
import { removePlayer } from "../transfers/remove-player";
import { rozhodni } from "./akce";
import type { IncidentRadek } from "./incident-db";
import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";
import { hracRadek, incidentRadek } from "./testovaci-stav";

const DNES = "2026-09-16T16:00:00.000Z";
const ODHALENY = incidentRadek({ culprit_revealed: 1 });

function prostredi(incident: IncidentRadek, dalsi: Pravidlo[] = []) {
  const db = new FalesnaD1([
    ...dalsi,
    { sql: /FROM club_incidents WHERE id = \? AND team_id = \?/, first: incident },
    { sql: /SELECT game_date FROM teams/, first: { game_date: DNES } },
    { sql: /FROM players WHERE id = \? AND team_id = \?/, first: hracRadek("p", "Pepa", "Průšvih") },
    { sql: /FROM relationships/, first: { n: 0 } },
  ]);
  return { db, env: { DB: jakoD1(db) } as unknown as Bindings };
}

beforeEach(() => vi.clearAllMocks());

describe("tresty", () => {
  it("pokuta: uzavře incident, klub dostane peníze a hráč odpoví", async () => {
    const { db, env } = prostredi(ODHALENY);
    expect(await rozhodni(env, "tym-a", "inc-1", "pokuta")).toEqual({ ok: true, castka: 200 });
    const narok = db.dotazy.find((d) => /UPDATE club_incidents SET status = 'uzavreny'/.test(d.sql));
    expect(narok?.params.slice(0, 3)).toEqual(["pokuta", JSON.stringify({ castka: 200 }), DNES]);
    expect(recordTransaction).toHaveBeenCalledWith(expect.anything(), "tym-a", "incident_fine", 200, expect.any(String), DNES, "pokuta-inc-1");
    expect(sendPlayerSMS).toHaveBeenCalledTimes(1);
  });

  it("srážka: rozloží se do 4 týdnů a teď se nic nestrhne", async () => {
    const { db, env } = prostredi(ODHALENY);
    expect(await rozhodni(env, "tym-a", "inc-1", "srazka")).toEqual({ ok: true, castka: 400 });
    const narok = db.dotazy.find((d) => /UPDATE club_incidents SET status = 'uzavreny'/.test(d.sql));
    expect(narok?.params.slice(0, 2)).toEqual(["srazka", JSON.stringify({ celkem: 400, tydnuZbyva: 4 })]);
    expect(recordTransaction).not.toHaveBeenCalled();
  });

  it("vyhodit: hráč jde mezi volné hráče", async () => {
    const { env } = prostredi(ODHALENY);
    expect(await rozhodni(env, "tym-a", "inc-1", "vyhodit")).toEqual({ ok: true, castka: null });
    expect(removePlayer).toHaveBeenCalledWith(expect.anything(), "p", "released", { toFreeAgent: true, teamId: "tym-a" });
  });

  it("když vyhazov selže, incident se vrátí k rozhodnutí", async () => {
    vi.mocked(removePlayer).mockResolvedValueOnce({ ok: false, reason: "not_found" });
    const { db, env } = prostredi(ODHALENY);
    expect(await rozhodni(env, "tym-a", "inc-1", "vyhodit")).toMatchObject({ ok: false, kod: 500 });
    expect(db.pocet(/SET status = 'otevreny', resolution = NULL/)).toBe(1);
  });

  it("vyřadit: bez platného počtu zápasů 400 a nic se nestane", async () => {
    for (const zapasu of [undefined, 0, 4, 1.5]) {
      const { db, env } = prostredi(ODHALENY);
      expect(await rozhodni(env, "tym-a", "inc-1", "vyradit", { zapasu })).toMatchObject({ ok: false, kod: 400 });
      expect(db.pocet(/UPDATE club_incidents/)).toBe(0);
    }
  });

  it("vyřadit: incident se uzavře a hráč dostane vyřazení na zvolený počet kol", async () => {
    const { db, env } = prostredi(ODHALENY);
    expect(await rozhodni(env, "tym-a", "inc-1", "vyradit", { zapasu: 2 })).toEqual({ ok: true, castka: null });
    const narok = db.dotazy.find((d) => /UPDATE club_incidents SET status = 'uzavreny'/.test(d.sql));
    expect(narok?.params.slice(0, 2)).toEqual(["vyradit", JSON.stringify({ zapasu: 2 })]);
    const absence = db.davky.flat().find((d) => /INSERT OR IGNORE INTO club_incident_absences/.test(d.sql));
    expect(absence?.params.slice(0, 8)).toEqual(["inc-1-abs-3", "inc-1", "tym-a", "p", "vyrazen", null, null, 2]);
    expect(sendPlayerSMS).toHaveBeenCalledTimes(1);
  });

  it("předat policii: výslech za 2 dny a soud v den výsledku", async () => {
    const { db, env } = prostredi(ODHALENY);
    await rozhodni(env, "tym-a", "inc-1", "policie");
    const vysledekOn = String(db.dotazy.find((d) => /SET status = 'policie', resolution = 'policie'/.test(d.sql))?.params[0]).slice(0, 10);
    const absence = db.davky.flat().filter((d) => /club_incident_absences/.test(d.sql));
    expect(absence.map((d) => [d.params[4], d.params[5]])).toEqual([["vyslech", "2026-09-18"], ["soud", vysledekOn]]);
  });

  it("předat policii: incident čeká na soud, nic se neuzavře", async () => {
    const { db, env } = prostredi(ODHALENY);
    expect(await rozhodni(env, "tym-a", "inc-1", "policie")).toEqual({ ok: true, castka: null });
    expect(db.pocet(/SET status = 'policie', resolution = 'policie'/)).toBe(1);
    expect(db.pocet(/SET status = 'uzavreny'/)).toBe(0);
    expect(sendSystemSMS).toHaveBeenCalledTimes(1);
  });

  it("neodhalený pachatel se trestat nedá", async () => {
    const { db, env } = prostredi(incidentRadek());
    expect(await rozhodni(env, "tym-a", "inc-1", "pokuta")).toMatchObject({ ok: false, kod: 409 });
    expect(db.pocet(/UPDATE club_incidents/)).toBe(0);
  });

  it("souběh: druhé kliknutí nic nestrhne", async () => {
    const { env } = prostredi(ODHALENY, [{ sql: /UPDATE club_incidents SET status = 'uzavreny'/, changes: 0 }]);
    expect(await rozhodni(env, "tym-a", "inc-1", "pokuta")).toMatchObject({ ok: false, kod: 409 });
    expect(recordTransaction).not.toHaveBeenCalled();
    expect(sendPlayerSMS).not.toHaveBeenCalled();
  });
});
