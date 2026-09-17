import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../messaging/system-sms", () => ({ sendSystemSMS: vi.fn(async () => undefined) }));
vi.mock("../community/notifications", () => ({ createNotification: vi.fn(async () => undefined) }));

import { createRng } from "../generators/rng";
import type { Bindings } from "../index";
import { seedFromString } from "../lib/seed";
import { sendSystemSMS } from "../messaging/system-sms";
import { vyhodnotHrozici, zaznamenejPromluvu } from "./hrozi-db";
import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";
import { hrac, stavKlubu } from "./testovaci-stav";

const DNES = "2026-09-18T16:00:00.000Z";
const FRANTA = hrac({ id: "p", jmeno: "Franta Novák", vztahKTrenerovi: 50 });
const STAV = stavKlubu({ gameDate: DNES, den: "2026-09-18", kadr: [FRANTA], vybaveni: { jerseys: 2, jerseys_condition: 70 } });

/** Id hrozícího činu, jehož los (první číslo seedu × 100) padne do [od, do). */
function idSLosem(od: number, do_: number): string {
  for (let n = 0; ; n++) {
    const id = `inc-h${n}`;
    const los = createRng(seedFromString(`hrozi|${id}`)).random() * 100;
    if (los >= od && los < do_) return id;
  }
}

const radek = (id: string, o: Record<string, unknown> = {}) => ({
  id, kind: "vloupani_sklad", culprit_player_id: "p", resolution_data: null, first_name: "Franta", last_name: "Novák", ...o,
});

function prostredi(r: Record<string, unknown>, dalsi: Pravidlo[] = []) {
  const db = new FalesnaD1([
    ...dalsi,
    { sql: /i\.status = 'hrozi' AND i\.deadline <= \?/, all: [r] },
    { sql: /FROM club_incident_absences/, all: [] },
    { sql: /FROM injuries/, all: [] },
    { sql: /FROM staff_members/, first: { usudek: null } },
  ]);
  return { db, env: { DB: jakoD1(db) } as unknown as Bindings };
}

beforeEach(() => vi.clearAllMocks());

describe("hrozící čin po lhůtě", () => {
  it("když los vyjde, čin se stane jako skutečný incident se stopou z hospody", async () => {
    const id = idSLosem(0, 50);
    const { db, env } = prostredi(radek(id));
    expect(await vyhodnotHrozici(env, STAV)).toBe(1);
    expect(db.pocet(/INSERT OR IGNORE INTO club_incidents/)).toBe(0);
    expect(db.dotazy.find((d) => /UPDATE club_incidents SET category = \?/.test(d.sql))?.sql).toContain("status = 'hrozi'");
    expect(db.pocet(/UPDATE equipment SET jerseys/)).toBe(1);
    expect(db.davky.flat().some((d) => d.params[0] === `${id}-hospoda-ohlasil`)).toBe(true);
    expect(sendSystemSMS).toHaveBeenCalledWith(expect.anything(), "tym-a", "Kustod", expect.stringContaining("Franta Novák"), { type: "incident", incidentId: id });
  });

  it("rozhovor s dobrým vztahem šanci srazí: los, který by jinak vyšel, skončí vystřízlivěním", async () => {
    // Bez rozhovoru 50 %, po rozhovoru při vztahu 50 jen 10 %.
    const id = idSLosem(10, 50);
    const { db, env } = prostredi(radek(id, { resolution_data: JSON.stringify({ promluvil: "2026-09-17" }) }));
    expect(await vyhodnotHrozici(env, STAV)).toBe(0);
    expect(db.pocet(/UPDATE equipment/)).toBe(0);
    expect(db.dotazy.find((d) => /resolution = 'nestalo_se'/.test(d.sql))?.sql).toContain("status = 'hrozi'");
    const znalosti = db.davky.flat().filter((d) => /club_incident_knowledge/.test(d.sql));
    expect(znalosti.map((d) => d.params[3])).toEqual(["kadr"]);
    expect(sendSystemSMS).toHaveBeenCalledWith(expect.anything(), "tym-a", "Kustod", expect.stringContaining("Franta Novák"), { type: "incident", incidentId: id });
  });

  it("zraněný hráč ani hráč, který z klubu odešel, nic neudělá", async () => {
    const id = idSLosem(0, 1);
    const zraneny = prostredi(radek(id), [{ sql: /FROM injuries/, all: [{ player_id: "p" }] }]);
    expect(await vyhodnotHrozici(zraneny.env, STAV)).toBe(0);
    expect(zraneny.db.pocet(/UPDATE equipment/)).toBe(0);
    const odesel = prostredi(radek(id));
    expect(await vyhodnotHrozici(odesel.env, { ...STAV, kadr: [] })).toBe(0);
    expect(odesel.db.pocet(/resolution = 'nestalo_se'/)).toBe(1);
  });

  it("už vyhodnocený čin (souběh) se neoznámí znovu", async () => {
    const { env } = prostredi(radek(idSLosem(50, 100)), [{ sql: /resolution = 'nestalo_se'/, changes: 0 }]);
    expect(await vyhodnotHrozici(env, STAV)).toBe(0);
    expect(sendSystemSMS).not.toHaveBeenCalled();
  });
});

describe("rozhovor o hrozbě", () => {
  it("zapíše se jen k hrozícímu činu toho hráče", async () => {
    const db = new FalesnaD1();
    expect(await zaznamenejPromluvu(jakoD1(db), { teamId: "tym-a", incidentId: "inc-h", playerId: "p", den: "2026-09-17" })).toBe(true);
    expect(db.dotazy[0].sql).toContain("status = 'hrozi' AND culprit_player_id = ?");
    expect(db.dotazy[0].params).toEqual(["2026-09-17", "inc-h", "tym-a", "p"]);
    const jinyHrac = new FalesnaD1([{ sql: /UPDATE club_incidents/, changes: 0 }]);
    expect(await zaznamenejPromluvu(jakoD1(jinyHrac), { teamId: "tym-a", incidentId: "inc-h", playerId: "x", den: "2026-09-17" })).toBe(false);
  });
});
