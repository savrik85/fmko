import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../messaging/system-sms", () => ({ sendSystemSMS: vi.fn(async () => undefined) }));
vi.mock("../season/finance-processor", () => ({ recordTransaction: vi.fn(async () => 1000) }));
vi.mock("../transfers/remove-player", () => ({ removePlayer: vi.fn(async () => ({ ok: true })) }));
vi.mock("../lib/reputation", () => ({ applyReputationDelta: vi.fn(async () => ({ applied: -2, oldValue: 50, newValue: 48, skipped: null })) }));
vi.mock("../fans/club-events", () => ({ recordClubEvent: vi.fn(async () => undefined) }));

import type { Bindings } from "../index";
import { recordClubEvent } from "../fans/club-events";
import { applyReputationDelta } from "../lib/reputation";
import { sendSystemSMS } from "../messaging/system-sms";
import { recordTransaction } from "../season/finance-processor";
import { removePlayer } from "../transfers/remove-player";
import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";
import { hrac, stavKlubu } from "./testovaci-stav";
import { nactiSignalyUteku, zpracujUtek } from "./utek-db";

// Seed `utek|tym-a|2026-09-09` padne pod SANCE_UTEKU (0,08): los je pevný, viz situace-db.test.ts
// pro stejnou techniku (dopředu spočítané hodnoty místo mockování rng).
const DEN_LOSU = "2026-09-09";
const GAME_DATE = `${DEN_LOSU}T16:00:00.000Z`;
const HRAC = hrac({ id: "a", jmeno: "Karel Novák", vernost: 20 });

function prostredi(dalsi: Pravidlo[] = []) {
  const db = new FalesnaD1([
    ...dalsi,
    { sql: /FROM club_incidents\s+WHERE team_id = \? AND kind = 'dluhy'/, all: [{ subject_player_id: "a", game_date: "2026-09-01T16:00:00.000Z", zaloha: "pujceno" }] },
    { sql: /FROM pub_sessions/, all: [{ incidents: JSON.stringify([{ type: "pije_na_sekeru", playerIds: ["a"], text: "..." }]) }] },
    { sql: /INSERT OR IGNORE INTO club_incidents/, changes: 1 },
    { sql: /FROM staff_members WHERE team_id = \? AND role = 'spravce_hriste'/, first: { usudek: null } },
    { sql: /FROM relationships/, all: [] },
  ]);
  return { db, env: { DB: jakoD1(db) } as unknown as Bindings };
}

const stav = (over: Partial<Parameters<typeof stavKlubu>[0]> = {}) =>
  stavKlubu({ teamId: "tym-a", gameDate: GAME_DATE, den: DEN_LOSU, kadr: [HRAC], rozpocet: 100000, utekLetos: false, ...over });

beforeEach(() => vi.clearAllMocks());

describe("nactiSignalyUteku", () => {
  it("poskládá signály z dluhů a hospodských řečí", async () => {
    const { db, env } = prostredi();
    const signaly = await nactiSignalyUteku(env.DB, "tym-a", GAME_DATE);
    expect(signaly.get("a")).toEqual({ dluhyOdeDne: "2026-09-01", zadalOZalohu: true, mluviloSeVHospode: true });
  });

  it("odmítnutá záloha je pořád žádost o zálohu (spec: nesmí vyžadovat odmítnutí)", async () => {
    const { env } = prostredi([
      { sql: /FROM club_incidents\s+WHERE team_id = \? AND kind = 'dluhy'/, all: [{ subject_player_id: "a", game_date: "2026-09-01T16:00:00.000Z", zaloha: "odmitnuto" }] },
    ]);
    const signaly = await nactiSignalyUteku(env.DB, "tym-a", GAME_DATE);
    expect(signaly.get("a")?.zadalOZalohu).toBe(true);
  });

  it("nerozhodnutá záloha (žádná žádost) není signál", async () => {
    const { env } = prostredi([
      { sql: /FROM club_incidents\s+WHERE team_id = \? AND kind = 'dluhy'/, all: [{ subject_player_id: "a", game_date: "2026-09-01T16:00:00.000Z", zaloha: null }] },
    ]);
    const signaly = await nactiSignalyUteku(env.DB, "tym-a", GAME_DATE);
    expect(signaly.get("a")?.zadalOZalohu).toBe(false);
  });
});

describe("zpracujUtek", () => {
  it("při splnění všeho zapíše incident, odepíše peníze, odejde hráč a nastaví reputaci i klubovou událost", async () => {
    const { db, env } = prostredi();
    expect(await zpracujUtek(env, stav())).toBe(true);

    expect(db.dotazy.some((d) => /INSERT OR IGNORE INTO club_incidents/.test(d.sql))).toBe(true);
    expect(recordTransaction).toHaveBeenCalledWith(
      expect.anything(), "tym-a", "incident_loss", -10000, expect.any(String), GAME_DATE, expect.stringContaining("inc-tym-a-utek_s_penezi-2026-09-09"),
    );
    expect(removePlayer).toHaveBeenCalledWith(expect.anything(), "a", "zmizel", { toFreeAgent: false, teamId: "tym-a" });
    expect(applyReputationDelta).toHaveBeenCalledWith(
      expect.anything(), "tym-a", -2, "incident", expect.any(String),
      expect.objectContaining({ referenceId: "inc-tym-a-utek_s_penezi-2026-09-09-reputace" }),
    );
    expect(recordClubEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      teamId: "tym-a", kind: "utek_s_penezi", referenceId: "inc-tym-a-utek_s_penezi-2026-09-09-udalost",
    }));
    expect(sendSystemSMS).toHaveBeenCalledWith(expect.anything(), "tym-a", "Kustod", expect.stringContaining("Karel Novák"), expect.objectContaining({ type: "incident" }));
  });

  it("podruhé týž den incident už existuje (INSERT OR IGNORE, changes 0) a hráč se nesmí odebrat", async () => {
    const { db, env } = prostredi([{ sql: /INSERT OR IGNORE INTO club_incidents/, changes: 0 }]);
    expect(await zpracujUtek(env, stav())).toBe(false);

    expect(db.dotazy.some((d) => /INSERT OR IGNORE INTO club_incidents/.test(d.sql))).toBe(true);
    expect(removePlayer).not.toHaveBeenCalled();
    expect(applyReputationDelta).not.toHaveBeenCalled();
    expect(recordClubEvent).not.toHaveBeenCalled();
    expect(sendSystemSMS).not.toHaveBeenCalled();
  });

  it("klub, kterému letos už jednou utekl hráč, je mimo hru (spec: nejvýš jednou za sezónu)", async () => {
    const { db, env } = prostredi();
    expect(await zpracujUtek(env, stav({ utekLetos: true }))).toBe(false);
    expect(db.dotazy.some((d) => /INSERT OR IGNORE INTO club_incidents/.test(d.sql))).toBe(false);
    expect(removePlayer).not.toHaveBeenCalled();
  });

  it("bez kandidáta (chybí varovný signál) nic nedělá", async () => {
    const { db, env } = prostredi([
      { sql: /FROM pub_sessions/, all: [] },
    ]);
    expect(await zpracujUtek(env, stav())).toBe(false);
    expect(db.dotazy.some((d) => /INSERT OR IGNORE INTO club_incidents/.test(d.sql))).toBe(false);
    expect(removePlayer).not.toHaveBeenCalled();
  });
});
