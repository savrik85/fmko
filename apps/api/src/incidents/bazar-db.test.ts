import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../messaging/system-sms", () => ({ sendSystemSMS: vi.fn(async () => undefined), sendPlayerSMS: vi.fn() }));

import type { Bindings } from "../index";
import { sendSystemSMS } from "../messaging/system-sms";
import { cenaKradenehoZbozi } from "./bazar";
import { idInzeratu, nahlasKradeneZbozi, poNakupuKradeneho, vystavHned, vystavKradeneZbozi } from "./bazar-db";
import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";
import { incidentRadek } from "./testovaci-stav";

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

describe("id inzerátu kradeného zboží", () => {
  it("má tvar bazar- a 32 hex znaků, neprozrazuje incident ani tým", async () => {
    const id = await idInzeratu("inc-tym-a-vloupani-2026-09-16", "jerseys");
    expect(id).toMatch(/^bazar-[0-9a-f]{32}$/);
    expect(id).not.toContain("tym-a");
    expect(id).not.toContain("inc-tym-a-vloupani-2026-09-16");
  });

  it("stejný vstup dá stejné id, jiná kategorie jiné", async () => {
    expect(await idInzeratu("inc-1", "jerseys")).toBe(await idInzeratu("inc-1", "jerseys"));
    expect(await idInzeratu("inc-1", "jerseys")).not.toBe(await idInzeratu("inc-1", "team_van"));
  });
});

describe("vystavení kradeného zboží", () => {
  it("poznatelné zboží: soukromý inzerát, stopa pro policii a SMS s odkazem", async () => {
    const { db, env } = prostredi([radek()]);
    expect(await vystavKradeneZbozi(env, T, TED)).toBe(1);
    const inzerat = db.dotazy.find((d) => /INSERT OR IGNORE INTO equipment_listings/.test(d.sql));
    expect(inzerat?.sql).toContain("VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 0, ?, ?)");
    expect(inzerat?.params).toEqual([
      await idInzeratu("inc-1", "jerseys"), "liga-1", "jerseys", 2, 70, cenaKradenehoZbozi("jerseys", 2, 70),
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

describe("nákup kradeného zboží", () => {
  const nakup = (over: Partial<{ kupecTeamId: string; kategorie: string; uroven: number }> = {}) => ({
    incidentId: "inc-1", kategorie: "jerseys", uroven: 2, kupecTeamId: "tym-a", kupecNazev: "TJ Sokol Lhota", gameDate: DNES, ...over,
  });
  const sIncidentem = (incident: unknown, dalsi: Pravidlo[] = []) => {
    const db = new FalesnaD1([...dalsi, { sql: /SELECT id, team_id, status FROM club_incidents/, first: incident }]);
    return { db, env: { DB: jakoD1(db) } as unknown as Bindings };
  };

  it("okradený klub koupil věci zpátky: vráceno a SMS", async () => {
    const { db, env } = sIncidentem({ id: "inc-1", team_id: "tym-a", status: "otevreny" });
    expect(await poNakupuKradeneho(env, nakup())).toBe("vraceno");
    expect(db.dotazy.find((d) => /UPDATE club_incidents SET recovered = 1/.test(d.sql))?.params).toEqual(["inc-1"]);
    expect(sendSystemSMS).toHaveBeenCalledWith(expect.anything(), "tym-a", "Kustod", expect.stringContaining("Dresy"), { type: "incident", incidentId: "inc-1" });
  });

  it("nepoznatelné zboží koupil okradený klub zpátky: vráceno, ale beze SMS (M3)", async () => {
    const { db, env } = sIncidentem({ id: "inc-1", team_id: "tym-a", status: "otevreny" });
    expect(await poNakupuKradeneho(env, nakup({ kategorie: "balls" }))).toBe("vraceno");
    expect(db.dotazy.find((d) => /UPDATE club_incidents SET recovered = 1/.test(d.sql))?.params).toEqual(["inc-1"]);
    expect(sendSystemSMS).not.toHaveBeenCalled();
  });

  it("věci už byly vrácené: nic dalšího", async () => {
    const { env } = sIncidentem({ id: "inc-1", team_id: "tym-a", status: "otevreny" }, [{ sql: /UPDATE club_incidents SET recovered = 1/, changes: 0 }]);
    expect(await poNakupuKradeneho(env, nakup())).toBeNull();
    expect(sendSystemSMS).not.toHaveBeenCalled();
  });

  it("poznatelné zboží koupil jiný klub: stopa s dalším pořadím a SMS okradenému", async () => {
    const { db, env } = sIncidentem({ id: "inc-1", team_id: "tym-a", status: "otevreny" });
    expect(await poNakupuKradeneho(env, nakup({ kupecTeamId: "tym-b" }))).toBe("koupil_jiny");
    const stopa = db.davky.flat().find((d) => /club_incident_clues/.test(d.sql));
    expect(stopa?.params[0]).toBe("inc-1-bazar-2");
    expect(stopa?.params[2]).toBe("tym-a");
    expect(String(stopa?.params[9])).toContain("TJ Sokol Lhota");
    expect(sendSystemSMS).toHaveBeenCalledWith(expect.anything(), "tym-a", "Kustod", expect.stringContaining("TJ Sokol Lhota"), { type: "incident", incidentId: "inc-1" });
  });

  it("nepoznatelné zboží koupil jiný klub: okradený klub se nic nedozví", async () => {
    const { db, env } = sIncidentem({ id: "inc-1", team_id: "tym-a", status: "otevreny" });
    expect(await poNakupuKradeneho(env, nakup({ kupecTeamId: "tym-b", kategorie: "balls" }))).toBeNull();
    expect(db.davky).toHaveLength(0);
    expect(sendSystemSMS).not.toHaveBeenCalled();
  });

  it("uzavřený incident: SMS ano, stopa ne", async () => {
    const { db, env } = sIncidentem({ id: "inc-1", team_id: "tym-a", status: "uzavreny" });
    expect(await poNakupuKradeneho(env, nakup({ kupecTeamId: "tym-b" }))).toBe("koupil_jiny");
    expect(db.davky).toHaveLength(0);
    expect(sendSystemSMS).toHaveBeenCalledTimes(1);
  });
});

describe("nahlášení inzerátu policii", () => {
  const INZERAT = { id: "bazar-inc-1-jerseys", category: "jerseys", level: 2, status: "active", incident_id: "inc-1" };
  function sInzeratem(inzerat: unknown, incident: unknown, dalsi: Pravidlo[] = []) {
    const db = new FalesnaD1([
      ...dalsi,
      { sql: /FROM equipment_listings WHERE id = \?/, first: inzerat },
      { sql: /FROM club_incidents WHERE id = \? AND team_id = \?/, first: incident },
      { sql: /SELECT game_date FROM teams/, first: { game_date: DNES } },
    ]);
    return { db, env: { DB: jakoD1(db) } as unknown as Bindings };
  }
  const nahlas = (env: Bindings) => nahlasKradeneZbozi(env, "tym-a", "bazar-inc-1-jerseys");

  it("policie ještě nešetřila: inzerát zmizí a policie případ převezme", async () => {
    const { db, env } = sInzeratem(INZERAT, incidentRadek());
    const v = await nahlas(env);
    expect(v.ok).toBe(true);
    expect(v.ok && v.vysledekOn).toMatch(/^2026-09-/);
    expect(db.dotazy.find((d) => /UPDATE equipment_listings SET status = 'withdrawn'/.test(d.sql))?.params.slice(1)).toEqual(["bazar-inc-1-jerseys"]);
    expect(db.pocet(/UPDATE club_incidents SET status = 'policie'/)).toBe(1);
  });

  it("policie mezitím převzala případ jinudy (souběh): 409 a inzerát zůstane (M1)", async () => {
    const { db, env } = sInzeratem(INZERAT, incidentRadek(), [
      { sql: /UPDATE club_incidents SET status = 'policie'/, changes: 0 },
    ]);
    expect(await nahlas(env)).toMatchObject({ ok: false, kod: 409 });
    expect(db.pocet(/UPDATE equipment_listings SET status = 'withdrawn'/)).toBe(0);
  });

  it("policie případ převzala, ale inzerát mezitím koupil někdo jiný: hlásí se úspěch", async () => {
    const { db, env } = sInzeratem(INZERAT, incidentRadek(), [
      { sql: /UPDATE equipment_listings SET status = 'withdrawn'/, changes: 0 },
    ]);
    const v = await nahlas(env);
    expect(v.ok).toBe(true);
    expect(db.pocet(/UPDATE club_incidents SET status = 'policie'/)).toBe(1);
  });

  it("policie právě šetří: inzerát se zajistí bez nového šetření", async () => {
    const { db, env } = sInzeratem(INZERAT, incidentRadek({ status: "policie", police_result_on: "2026-09-19T16:00:00.000Z" }));
    expect(await nahlas(env)).toEqual({ ok: true, vysledekOn: "2026-09-19T16:00:00.000Z" });
    expect(db.pocet(/UPDATE equipment_listings SET status = 'withdrawn'/)).toBe(1);
    expect(db.pocet(/UPDATE club_incidents SET status = 'policie'/)).toBe(0);
    expect(sendSystemSMS).toHaveBeenCalledWith(expect.anything(), "tym-a", "Policie ČR, obvodní oddělení", expect.stringContaining("Dresy"), { type: "incident", incidentId: "inc-1" });
  });

  it("cizí incident, obyčejný inzerát nebo nepoznatelné zboží: 404 a nic se nestáhne", async () => {
    for (const [inzerat, incident] of [
      [INZERAT, null],
      [{ ...INZERAT, incident_id: null }, incidentRadek()],
      [{ ...INZERAT, category: "balls" }, incidentRadek()],
    ] as const) {
      const { db, env } = sInzeratem(inzerat, incident);
      expect(await nahlas(env)).toMatchObject({ ok: false, kod: 404 });
      expect(db.pocet(/UPDATE equipment_listings/)).toBe(0);
    }
  });

  it("policie už šetřila nebo je incident uzavřený: 409 a inzerát zůstane", async () => {
    for (const incident of [
      incidentRadek({ police_success: 0 }), incidentRadek({ status: "uzavreny" }), incidentRadek({ culprit_revealed: 1 }),
      // M2: udání už odhaleného pachatele nechá incident v 'policie', ale nahlásit se přesto nedá.
      incidentRadek({ status: "policie", culprit_revealed: 1, resolution: "policie" }),
    ]) {
      const { db, env } = sInzeratem(INZERAT, incident);
      expect(await nahlas(env)).toMatchObject({ ok: false, kod: 409 });
      expect(db.pocet(/UPDATE equipment_listings/)).toBe(0);
    }
  });

  it("inzerát už není aktivní: 409", async () => {
    const { env } = sInzeratem({ ...INZERAT, status: "sold" }, incidentRadek());
    expect(await nahlas(env)).toMatchObject({ ok: false, kod: 409 });
  });
});

describe("admin: vystavit hned", () => {
  it("přepíše den bazaru u otevřených prodejných krádeží bez inzerátu a vystaví", async () => {
    const { db, env } = prostredi([radek()]);
    expect(await vystavHned(env, T)).toBe(1);
    const prepis = db.dotazy.find((d) => /UPDATE club_incidents SET bazar_on = \?/.test(d.sql));
    expect(prepis?.params).toEqual([DNES, "tym-a", 4, "vloupani_sklad", "vitrina", "dodavka_ukradena", "kradez_kamery"]);
    expect(prepis?.sql).toContain("status != 'uzavreny'");
  });
});
