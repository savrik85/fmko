import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../messaging/system-sms", () => ({ sendSystemSMS: vi.fn(async () => undefined), sendPlayerSMS: vi.fn() }));
vi.mock("../community/notifications", () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock("../season/finance-processor", () => ({ recordTransaction: vi.fn(async () => 0) }));

import { createRng } from "../generators/rng";
import type { Bindings } from "../index";
import { seedFromString } from "../lib/seed";
import { sendSystemSMS } from "../messaging/system-sms";
import { recordTransaction } from "../season/finance-processor";
import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";
import { incidentRadek } from "./testovaci-stav";
import { vyhodnotPolicii, zauctujSrazky, zpracujVysetrovani } from "./vysetrovani-den";

const DNES = "2026-09-16T16:00:00.000Z";
const T = { teamId: "tym-a", gameDate: DNES, seasonNumber: 4 };
const SETRENI = /i\.status = 'policie' AND i\.police_result_on <= \?/;
const SRAZKY = /i\.resolution = 'srazka'/;

/** Id incidentu, jehož los policie splní podmínku. Seed je daný id, takže se dá najít předem. */
function idSLosem(podminka: (los: number) => boolean): string {
  for (let n = 0; n < 1000; n++) {
    const id = `inc-${n}`;
    if (podminka(createRng(seedFromString(`policie|${id}`)).random())) return id;
  }
  throw new Error("žádné vhodné id");
}

function prostredi(pravidla: Pravidlo[]) {
  const db = new FalesnaD1(pravidla);
  return { db, env: { DB: jakoD1(db) } as unknown as Bindings };
}

beforeEach(() => vi.clearAllMocks());

describe("výsledek policie", () => {
  it("udání: soud dá podmínku a incident se uzavře", async () => {
    const inc = { ...incidentRadek({ status: "policie", culprit_revealed: 1, resolution: "policie", police_result_on: DNES }), first_name: "Pepa", last_name: "Průšvih" };
    const { db, env } = prostredi([{ sql: SETRENI, all: [inc] }]);
    expect(await vyhodnotPolicii(env, T)).toBe(1);
    expect(db.pocet(/SET status = 'uzavreny', police_success = 1, resolved_on = \?/)).toBe(1);
    expect(vi.mocked(sendSystemSMS).mock.calls[0][3]).toContain("Pepa Průšvih");
  });

  it("neúspěch: incident se vrátí manažerovi se lhůtou za 3 dny a jméno pachatele nepadne", async () => {
    const id = idSLosem((los) => los >= 0.9);
    const inc = { ...incidentRadek({ id, status: "policie", police_result_on: DNES }), first_name: "Pepa", last_name: "Průšvih" };
    const { db, env } = prostredi([{ sql: SETRENI, all: [inc] }]);
    await vyhodnotPolicii(env, T);
    const prechod = db.dotazy.find((d) => /SET status = 'otevreny', police_success = 0, deadline = \?/.test(d.sql));
    expect(prechod?.params).toEqual(["2026-09-19T16:00:00.000Z", id]);
    expect(vi.mocked(sendSystemSMS).mock.calls[0][3]).not.toContain("Pepa");
  });

  it("dopadený cizí zloděj: vybavení se vrátí, jen když klub nemá stejné nebo lepší", async () => {
    const id = idSLosem((los) => los < 0.15);
    const inc = { ...incidentRadek({ id, status: "policie", culprit_type: "cizi", culprit_player_id: null, police_result_on: DNES }), first_name: null, last_name: null };
    const { db, env } = prostredi([{ sql: SETRENI, all: [inc] }]);
    await vyhodnotPolicii(env, T);
    expect(db.pocet(/resolution = 'vyreseno_policii'/)).toBe(1);
    const vraceni = db.dotazy.find((d) => /UPDATE equipment SET jerseys = \?, jerseys_condition = \? WHERE team_id = \? AND jerseys < \?/.test(d.sql));
    expect(vraceni?.params).toEqual([2, 70, "tym-a", 2]);
    expect(recordTransaction).not.toHaveBeenCalled();
  });

  it("dopadený vandal zaplatí polovinu až celou škodu", async () => {
    const id = idSLosem((los) => los < 0.15);
    const inc = {
      ...incidentRadek({
        id, kind: "vandal", category: "poskozeni", status: "policie", culprit_type: "cizi", culprit_player_id: null,
        police_result_on: DNES, loss: JSON.stringify([{ typ: "travnik", pred: 70, po: 60 }]),
      }),
      first_name: null, last_name: null,
    };
    await vyhodnotPolicii(prostredi([{ sql: SETRENI, all: [inc] }]).env, T);
    const volani = vi.mocked(recordTransaction).mock.calls[0];
    expect(volani[2]).toBe("incident_recovery");
    expect(volani[3]).toBeGreaterThanOrEqual(750);
    expect(volani[3]).toBeLessThanOrEqual(1500);
    expect(volani[6]).toBe(`nahrada-${id}`);
  });

  it("když přechod mezitím proběhl, nic se neoznámí", async () => {
    const inc = { ...incidentRadek({ status: "policie", culprit_revealed: 1, resolution: "policie", police_result_on: DNES }), first_name: "Pepa", last_name: "Průšvih" };
    const { env } = prostredi([
      { sql: /UPDATE club_incidents SET status = 'uzavreny', police_success = 1/, changes: 0 },
      { sql: SETRENI, all: [inc] },
    ]);
    expect(await vyhodnotPolicii(env, T)).toBe(0);
    expect(sendSystemSMS).not.toHaveBeenCalled();
  });
});

describe("srážky ze mzdy", () => {
  const radek = (tydnuZbyva: number, jmeno: string | null = "Pepa") => ({
    id: "inc-1", resolution_data: JSON.stringify({ celkem: 437, tydnuZbyva }), first_name: jmeno, last_name: jmeno ? "Průšvih" : null,
  });

  it("strhne týdenní splátku s referencí týdne", async () => {
    const { db, env } = prostredi([{ sql: SRAZKY, all: [radek(4)] }]);
    expect(await zauctujSrazky(env, T)).toBe(1);
    const narok = db.dotazy.find((d) => /json_set\(resolution_data, '\$\.tydnuZbyva', \?\) WHERE id = \? AND/.test(d.sql));
    expect(narok?.params).toEqual([3, "inc-1", 4]);
    expect(recordTransaction).toHaveBeenCalledWith(expect.anything(), "tym-a", "incident_deduction", 109, expect.stringContaining("1/4"), DNES, "srazka-inc-1-t1");
  });

  it("poslední týden doplatí zbytek", async () => {
    await zauctujSrazky(prostredi([{ sql: SRAZKY, all: [radek(1)] }]).env, T);
    expect(recordTransaction).toHaveBeenCalledWith(expect.anything(), "tym-a", "incident_deduction", 110, expect.stringContaining("4/4"), DNES, "srazka-inc-1-t4");
  });

  it("hráč odešel: srážka končí bez platby", async () => {
    const { db, env } = prostredi([{ sql: SRAZKY, all: [radek(3, null)] }]);
    expect(await zauctujSrazky(env, T)).toBe(0);
    expect(db.pocet(/'\$\.tydnuZbyva', 0\)/)).toBe(1);
    expect(recordTransaction).not.toHaveBeenCalled();
  });

  it("když splátku už někdo zaúčtoval, podruhé se nestrhne", async () => {
    const { env } = prostredi([
      { sql: /json_set\(resolution_data, '\$\.tydnuZbyva', \?\) WHERE id = \? AND/, changes: 0 },
      { sql: SRAZKY, all: [radek(4)] },
    ]);
    expect(await zauctujSrazky(env, T)).toBe(0);
    expect(recordTransaction).not.toHaveBeenCalled();
  });

  it("mimo pondělí se srážky neúčtují", async () => {
    const { db, env } = prostredi([]);
    await zpracujVysetrovani(env, T, { pondeli: false });
    expect(db.pocet(SRAZKY)).toBe(0);
  });
});
