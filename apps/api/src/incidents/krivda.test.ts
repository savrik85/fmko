import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/ai-provider", () => ({ isAiEnabled: vi.fn(async () => true) }));
vi.mock("../messaging/ai-player-spawn", () => ({ getOrCreatePlayerConversation: vi.fn(async () => "konv-1") }));
vi.mock("../messaging/system-sms", () => ({ sendPlayerSMS: vi.fn(async () => "konv-1"), sendSystemSMS: vi.fn() }));

import type { Bindings } from "../index";
import { isAiEnabled } from "../lib/ai-provider";
import { sendPlayerSMS } from "../messaging/system-sms";
import { nazevIncidentu } from "./katalog";
import { ozviSeObvineni } from "./krivda";
import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";

const DNES = "2026-09-16T16:00:00.000Z";
const T = { teamId: "tym-a", gameDate: DNES, seasonNumber: 4 };

function prostredi(obvineni: unknown[], dalsi: Pravidlo[] = []) {
  const db = new FalesnaD1([
    ...dalsi,
    { sql: /FROM club_incidents/, all: [{ id: "inc-1", kind: "vloupani_sklad", accused: JSON.stringify(obvineni) }] },
    { sql: /FROM players/, first: { id: "a", first_name: "Adam", last_name: "Kos", nickname: null, avatar: "{}" } },
  ]);
  return { db, env: { DB: jakoD1(db) } as unknown as Bindings };
}

const obvineni = (den: string, vysledek = "zapira") => ({ playerId: "a", jmeno: "Adam Kos", den, vysledek });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAiEnabled).mockResolvedValue(true);
});

describe("den po obvinění", () => {
  it("kdo včera zapíral, napíše trenérovi a otevře se vlákno křivdy", async () => {
    const { db, env } = prostredi([obvineni("2026-09-15")]);
    expect(await ozviSeObvineni(env, T)).toBe(1);
    const vlakno = db.dotazy.find((d) => /UPDATE conversations SET ai_thread_active = 1/.test(d.sql));
    expect(JSON.parse(String(vlakno?.params[1]))).toMatchObject({ scenario_id: "krivde_obvineny", awaiting: "coach", player_id: "a", max_replies: 2 });
    expect(sendPlayerSMS).toHaveBeenCalledWith(
      expect.anything(), "tym-a", expect.objectContaining({ id: "a" }),
      expect.stringContaining(nazevIncidentu("vloupani_sklad")), { type: "incident", incidentId: "inc-1" },
    );
  });

  it("hledá obvinění jen v aktuální sezóně a oknu 45 dní", async () => {
    const { db, env } = prostredi([]);
    await ozviSeObvineni(env, T);
    expect(db.dotazy.find((d) => /FROM club_incidents/.test(d.sql))?.params).toEqual(["tym-a", 4, "2026-08-02T16:00:00.000Z"]);
  });

  it("dnešní obvinění, přiznání a usvědčení se neozvou", async () => {
    const { env } = prostredi([obvineni("2026-09-16"), obvineni("2026-09-15", "priznal"), obvineni("2026-09-15", "usvedcen")]);
    expect(await ozviSeObvineni(env, T)).toBe(0);
    expect(sendPlayerSMS).not.toHaveBeenCalled();
  });

  it("běžící rozhovor se nepřebíjí", async () => {
    const { env } = prostredi([obvineni("2026-09-15")], [{ sql: /UPDATE conversations SET ai_thread_active = 1/, changes: 0 }]);
    expect(await ozviSeObvineni(env, T)).toBe(0);
    expect(sendPlayerSMS).not.toHaveBeenCalled();
  });

  it("hráč, který už v kádru není, se neozve", async () => {
    const { env } = prostredi([obvineni("2026-09-15")], [{ sql: /FROM players/, first: null }]);
    expect(await ozviSeObvineni(env, T)).toBe(0);
  });

  it("bez generování textu se nic neotevře ani nečte", async () => {
    vi.mocked(isAiEnabled).mockResolvedValue(false);
    const { db, env } = prostredi([obvineni("2026-09-15")]);
    expect(await ozviSeObvineni(env, T)).toBe(0);
    expect(db.dotazy).toHaveLength(0);
  });

  it("admin může ozvání spustit pro dnešní obvinění", async () => {
    const { env } = prostredi([obvineni("2026-09-16")]);
    expect(await ozviSeObvineni(env, T, { denObvineni: "2026-09-16" })).toBe(1);
  });

  it("odhalený pachatel se neozve, nevinný u téhož odhaleného incidentu ano", async () => {
    const db = new FalesnaD1([
      { sql: /FROM club_incidents/, all: [{
        id: "inc-1", kind: "vloupani_sklad",
        accused: JSON.stringify([obvineni("2026-09-15"), { playerId: "b", jmeno: "Petr Malý", den: "2026-09-15", vysledek: "zapira" }]),
        culprit_revealed: 1, culprit_player_id: "a",
      }] },
      { sql: /FROM players/, first: { id: "b", first_name: "Petr", last_name: "Malý", nickname: null, avatar: "{}" } },
    ]);
    const env = { DB: jakoD1(db) } as unknown as Bindings;
    expect(await ozviSeObvineni(env, T)).toBe(1);
    expect(sendPlayerSMS).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendPlayerSMS).mock.calls[0][2]).toMatchObject({ id: "b" });
  });
});
