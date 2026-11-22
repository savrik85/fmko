/**
 * Hospoda jen ten večer a noc (prod 22. 11.): opilá hlasovka pub_voice odešla ve 23:40 UTC,
 * hráč ráno v 10:31 poslal střízlivou omluvu „hlava mi třeští“, a na odpověď trenéra v 10:50
 * napsal zase opile „doraz za nama na jednoo 🍺🍺“. Scénář s `atPub` platil po celé vlákno.
 */
import { describe, expect, it } from "vitest";
import { getScenarioById } from "./ai-player-scenarios";
import { CASUAL_TOPICS } from "./casual-topics";
import { pubNightUntil, pubThreadScenario } from "./pub-night";

/** Pražský čas v listopadu (zimní čas, UTC+1). */
const prague = (day: number, hour: number, minute = 0) => new Date(Date.UTC(2026, 10, day, hour - 1, minute));

describe("hospoda jen ten večer a noc", () => {
  const voice = getScenarioById("pub_voice")!;
  const start = prague(21, 23, 40);

  it("hlasovka ve 23:40: v 0:30 pořád sedí v hospodě a píše opile", () => {
    const r = pubThreadScenario(voice, start.toISOString(), prague(22, 0, 30));
    expect(r.atPub).toBe(true);
    expect(r.scenario).toBe(voice);
  });

  it("v 9:40 ráno je střízlivý, mluví o včerejšku a do hospody nezve", () => {
    const r = pubThreadScenario(voice, start.toISOString(), prague(22, 9, 40));
    expect(r.atPub).toBe(false);
    expect(r.scenario.id).toBe("pub_voice");
    expect(r.scenario.atPub).toBe(false);
    expect(r.scenario.invite).toBeUndefined();
    expect(r.scenario.description).toContain("Včera večer");
    expect(r.scenario.description).toContain("jsi střízlivý");
    expect(r.scenario.description).toContain("Do hospody teď nezveš");
    expect(r.scenario.description).not.toContain("máš v sobě dost piv");
  });

  it("druhý den v 21:00 podle běžného kontextu, ne natvrdo v hospodě", () => {
    const r = pubThreadScenario(voice, start.toISOString(), prague(22, 21, 0));
    expect(r.atPub).toBe(false);
    expect(r.scenario.description).toContain("Včera večer");
    // Po dvou dnech už to není „včera“.
    expect(pubThreadScenario(voice, start.toISOString(), prague(24, 12, 0)).scenario.description).toContain("Před pár dny");
  });

  it("hospoda končí ve 4 ráno, nejpozději 8 hodin po první zprávě", () => {
    expect(pubNightUntil(prague(21, 23, 40)).toISOString()).toBe(prague(22, 4, 0).toISOString());
    expect(pubNightUntil(prague(21, 18, 0)).toISOString()).toBe(prague(22, 2, 0).toISOString());
    expect(pubNightUntil(prague(22, 1, 30)).toISOString()).toBe(prague(22, 4, 0).toISOString());
    // Letní čas: 4:00 v Praze je 2:00 UTC.
    expect(pubNightUntil(new Date("2026-07-10T21:00:00Z")).toISOString()).toBe("2026-07-11T02:00:00.000Z");
  });

  it("totéž pozvánka do hospody a témata „jen tak“ z hospody", () => {
    const pubTopics = [getScenarioById("pub_invite")!, ...CASUAL_TOPICS.filter((t) => t.atPub)];
    expect(pubTopics.length).toBeGreaterThanOrEqual(3);
    for (const s of pubTopics) {
      const r = pubThreadScenario(s, start.toISOString(), prague(22, 10, 50));
      expect(r.atPub, s.id).toBe(false);
      expect(r.scenario.invite, s.id).toBeUndefined();
      expect(r.scenario.description, s.id).toContain("jsi střízlivý");
    }
    // Scénář bez hospody se nemění.
    const plain = getScenarioById("coach_initiated")!;
    expect(pubThreadScenario(plain, start.toISOString(), prague(22, 0, 30))).toEqual({ scenario: plain, atPub: false });
  });
});
