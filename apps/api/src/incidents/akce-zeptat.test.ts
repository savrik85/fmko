import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../messaging/ai-player-spawn", () => ({ getOrCreatePlayerConversation: vi.fn(async () => "konv-1") }));

import type { Bindings } from "../index";
import { getOrCreatePlayerConversation } from "../messaging/ai-player-spawn";
import { promluvSi, zeptejSe } from "./akce";
import type { IncidentRadek } from "./incident-db";
import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";
import { incidentRadek } from "./testovaci-stav";

const DNES = "2026-09-16T16:00:00.000Z";

function prostredi(incident: IncidentRadek, dalsi: Pravidlo[] = []) {
  const db = new FalesnaD1([
    ...dalsi,
    { sql: /FROM club_incidents WHERE id = \? AND team_id = \?/, first: incident },
    { sql: /SELECT game_date FROM teams/, first: { game_date: DNES } },
    { sql: /SELECT id, first_name, last_name, nickname, avatar FROM players/, first: { id: "s", first_name: "Jan", last_name: "Svědek", nickname: null, avatar: "{}" } },
  ]);
  return { db, env: { DB: jakoD1(db) } as unknown as Bindings };
}

beforeEach(() => vi.clearAllMocks());

describe("zeptat se hráče", () => {
  it("otevře konverzaci a nastaví téma na dnešní herní den", async () => {
    const { db, env } = prostredi(incidentRadek());
    expect(await zeptejSe(env, "tym-a", "inc-1", "s")).toEqual({ ok: true, conversationId: "konv-1" });
    expect(getOrCreatePlayerConversation).toHaveBeenCalledWith(expect.anything(), "tym-a", expect.objectContaining({ id: "s", firstName: "Jan" }));
    const tema = db.dotazy.find((d) => /UPDATE conversations SET ai_thread_state = CASE WHEN ai_thread_active = 1/.test(d.sql));
    // Obě větve: json_set pro běžící vlákno, json_object pro nahrazení starého stavu.
    expect(tema?.sql).toContain("json_set");
    expect(tema?.sql).toContain("json_object");
    expect(tema?.params).toEqual(["inc-1", "2026-09-16", "inc-1", "2026-09-16", "konv-1"]);
  });

  it("jde i během šetření policie", async () => {
    expect((await zeptejSe(prostredi(incidentRadek({ status: "policie" })).env, "tym-a", "inc-1", "s")).ok).toBe(true);
  });

  it("odhalený nebo uzavřený incident: 409", async () => {
    expect(await zeptejSe(prostredi(incidentRadek({ culprit_revealed: 1 })).env, "tym-a", "inc-1", "s")).toMatchObject({ ok: false, kod: 409 });
    expect(await zeptejSe(prostredi(incidentRadek({ status: "uzavreny" })).env, "tym-a", "inc-1", "s")).toMatchObject({ ok: false, kod: 409 });
  });

  it("hráč mimo kádr: 400 a žádná konverzace", async () => {
    const { env } = prostredi(incidentRadek(), [{ sql: /FROM players/, first: null }]);
    expect(await zeptejSe(env, "tym-a", "inc-1", "cizi")).toMatchObject({ ok: false, kod: 400 });
    expect(getOrCreatePlayerConversation).not.toHaveBeenCalled();
  });
});

describe("promluvit si s tím, kdo v hospodě ohlásil čin (spec 9a)", () => {
  it("otevře konverzaci s ním a nastaví téma", async () => {
    const { db, env } = prostredi(incidentRadek({ status: "hrozi", culprit_player_id: "s", loss: "[]" }));
    expect(await promluvSi(env, "tym-a", "inc-1")).toEqual({ ok: true, conversationId: "konv-1" });
    expect(db.dotazy.find((d) => /FROM players/.test(d.sql))?.params[0]).toBe("s");
    expect(db.pocet(/UPDATE conversations SET ai_thread_state/)).toBe(1);
  });

  it("jen u hrozícího činu a jen s hráčem, který je pořád v kádru", async () => {
    expect(await promluvSi(prostredi(incidentRadek()).env, "tym-a", "inc-1")).toMatchObject({ ok: false, kod: 409 });
    const odesel = prostredi(incidentRadek({ status: "hrozi" }), [{ sql: /FROM players/, first: null }]);
    expect(await promluvSi(odesel.env, "tym-a", "inc-1")).toMatchObject({ ok: false, kod: 409 });
    expect(getOrCreatePlayerConversation).not.toHaveBeenCalled();
  });
});
