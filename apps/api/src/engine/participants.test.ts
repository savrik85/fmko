import { describe, expect, it } from "vitest";
import { simulateMatch } from "./simulation";
import { createRng } from "../generators/rng";
import { createTeam } from "./test-helpers/lineup";
import type { MatchResult, TeamSetup } from "./types";

/**
 * Kdo v zápase nastoupil, musí být ve výsledku, i když hřiště opustil dřív.
 *
 * `result.homeLineup` drží jen ty, kdo dohráli. Runnery z něj dřív zapisovaly únavu,
 * takže vystřídaný nebo vyloučený hráč odešel ze zápasu odpočatý (kolo 1. 10. na produ:
 * únava u 0 ze 70 vystřídaných) a střídat v 60. minutě bylo zadarmo.
 */

function play(home: TeamSetup, away: TeamSetup, seed: number): MatchResult {
  return simulateMatch(createRng(seed), { home, away, weather: "sunny", isHomeAdvantage: false });
}

describe("vystřídaný hráč", () => {
  it("zůstane ve výsledku s únavou za odehrané minuty, střídající taky", () => {
    const home = createTeam(1, "Domácí");
    const subbedOff = home.lineup[9];   // FWD 110
    const stayer = home.lineup[8];      // MID 109, hraje celý zápas
    const subIn = home.subs[2];         // FWD 114
    home.plan = [
      { id: "s1", fromMinute: 30, trigger: { kind: "minute" }, action: { kind: "sub", outPlayerId: subbedOff.id, inPlayerId: subIn.id } },
    ];
    const r = play(home, createTeam(2, "Hosté"), 4242);

    expect(r.events.some((e) => e.type === "substitution" && e.minute === 30 && e.playerId === subIn.id)).toBe(true);
    // Dohrát mohl jen střídající, vystřídaný z konečné sestavy vypadl.
    expect(r.homeLineup.some((p) => p.id === subbedOff.id)).toBe(false);

    const out = r.homeParticipants.find((p) => p.id === subbedOff.id);
    const inn = r.homeParticipants.find((p) => p.id === subIn.id);
    const full = r.homeParticipants.find((p) => p.id === stayer.id);
    expect(out, "vystřídaný chybí mezi těmi, kdo nastoupili").toBeDefined();
    expect(inn, "střídající chybí mezi těmi, kdo nastoupili").toBeDefined();

    expect(r.kickoffCondition[subbedOff.id]).toBe(100);
    expect(r.kickoffCondition[subIn.id]).toBe(100);
    // Za 30 minut únava je, ale menší než za celý zápas.
    expect(out!.condition).toBeLessThan(100);
    expect(out!.condition).toBeGreaterThan(full!.condition);
    // Střídající hrál 60 minut: unavený, ale míň než ten, kdo hrál devadesát.
    expect(inn!.condition).toBeLessThan(100);
    expect(inn!.condition).toBeGreaterThan(full!.condition);
  });

  it("mezi těmi, kdo nastoupili, jsou přesně hráči s odehranými minutami", () => {
    for (const seed of [1, 7, 4242, 9001]) {
      const r = play(createTeam(1, "Domácí"), createTeam(2, "Hosté"), seed);
      const appeared = [...r.homeParticipants, ...r.awayParticipants].map((p) => p.id).sort((a, b) => a - b);
      const withMinutes = Object.keys(r.playerMinutes).map(Number).sort((a, b) => a - b);
      expect(appeared, `seed ${seed}`).toEqual(withMinutes);
    }
  });

  it("hráč z lavičky, který nenastoupil, mezi nimi není", () => {
    const home = createTeam(1, "Domácí");
    const benchIds = home.subs.map((p) => p.id);
    const r = play(home, createTeam(2, "Hosté"), 7);
    for (const id of benchIds) {
      const played = r.playerMinutes[id] !== undefined;
      expect(r.homeParticipants.some((p) => p.id === id), `hráč ${id}`).toBe(played);
    }
  });
});

describe("vyloučený hráč", () => {
  it("zůstane ve výsledku s únavou do chvíle, kdy šel ven", () => {
    // Hrubiáni do těla: červená v některém ze zápasů padne určitě.
    const rough = (): TeamSetup => {
      const t = createTeam(1, "Domácí");
      for (const p of [...t.lineup, ...t.subs]) {
        p.temper = 100; p.discipline = 0; p.aggression = 100;
      }
      return { ...t, hardness: "hard" };
    };

    let checked = false;
    for (let seed = 1; seed <= 400 && !checked; seed++) {
      const r = play(rough(), createTeam(2, "Hosté"), seed);
      const red = r.events.find((e) => e.type === "card" && e.detail === "red" && e.teamId === 1 && e.minute >= 10);
      if (!red) continue;
      checked = true;

      expect(r.homeLineup.some((p) => p.id === red.playerId)).toBe(false);
      const sentOff = r.homeParticipants.find((p) => p.id === red.playerId);
      expect(sentOff, `seed ${seed}: vyloučený chybí mezi těmi, kdo nastoupili`).toBeDefined();
      expect(sentOff!.condition).toBeLessThan(r.kickoffCondition[red.playerId]);
      expect(r.playerMinutes[red.playerId].left).toBe(red.minute);
    }
    expect(checked, "v žádném zápase nepadla červená domácím").toBe(true);
  });
});
