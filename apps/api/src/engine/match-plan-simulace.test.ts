import { describe, it, expect } from "vitest";
import { simulateMatch } from "./simulation";
import { createRng } from "../generators/rng";
import { createTeam } from "./test-helpers/lineup";
import type { EngineMatchPlan } from "./match-plan";
import type { MatchConfig, TeamSetup } from "./types";

/**
 * Pokyny na lavičce v běžícím zápase. Zatímco `match-plan.test.ts` hlídá
 * vyhodnocení podmínky, tohle hlídá to podstatné — že se pokyn opravdu promítne
 * do simulace: přepne taktiku, provede střídání, zapíše událost.
 */

function tymSPlanem(teamId: number, plan: EngineMatchPlan, over: Partial<TeamSetup> = {}): TeamSetup {
  return { ...createTeam(teamId, teamId === 1 ? "Domácí" : "Hosté"), plan, ...over };
}

function odehraj(home: TeamSetup, away: TeamSetup, seed = 4242) {
  const config: MatchConfig = { home, away, weather: "sunny", isHomeAdvantage: false };
  return simulateMatch(createRng(seed), config);
}

describe("změna taktiky z lavičky", () => {
  it("v zadané minutě přepne taktiku a zapíše to do zápasu", () => {
    const home = tymSPlanem(1, [
      { id: "t1", fromMinute: 55, trigger: { kind: "minute" }, action: { kind: "tactic", tactic: "offensive" } },
    ]);
    const away = createTeam(2, "Hosté");
    const r = odehraj(home, away);

    const zmena = r.events.find((e) => e.detail === "plan:tactic");
    expect(zmena).toBeDefined();
    expect(zmena!.minute).toBe(55);
    expect(zmena!.teamId).toBe(1);
    expect(zmena!.description).toContain("Útočná");
    // Mutace TeamSetup je to, co engine čte při každé šanci.
    expect(home.tactic).toBe("offensive");
  });

  it("pokyn sepne jen jednou, i když podmínka trvá celý zápas", () => {
    const home = tymSPlanem(1, [
      { id: "t1", fromMinute: 20, trigger: { kind: "minute" }, action: { kind: "tactic", tactic: "defensive" } },
    ]);
    const r = odehraj(home, createTeam(2, "Hosté"));
    expect(r.events.filter((e) => e.detail === "plan:tactic")).toHaveLength(1);
  });

  it("pokyn na taktiku, kterou tým už hraje, se do zápasu nezapíše", () => {
    const home = tymSPlanem(1, [
      { id: "t1", fromMinute: 30, trigger: { kind: "minute" }, action: { kind: "tactic", tactic: "balanced" } },
    ]);
    const r = odehraj(home, createTeam(2, "Hosté"));
    expect(r.events.filter((e) => e.detail === "plan:tactic")).toHaveLength(0);
  });

  it("událost o změně taktiky nepatří žádnému hráči — playerId 0, jméno týmu", () => {
    const home = tymSPlanem(1, [
      { id: "t1", fromMinute: 40, trigger: { kind: "minute" }, action: { kind: "tactic", tactic: "pressing" } },
    ]);
    const r = odehraj(home, createTeam(2, "Hosté"));
    const zmena = r.events.find((e) => e.detail === "plan:tactic")!;
    expect(zmena.playerId).toBe(0);
    expect(zmena.playerName).toBe("Domácí");
  });
});

describe("změna tvrdosti z lavičky", () => {
  it("přepne tvrdost hry a zapíše událost", () => {
    const home = tymSPlanem(1, [
      { id: "h1", fromMinute: 50, trigger: { kind: "minute" }, action: { kind: "hardness", hardness: "hard" } },
    ], { hardness: "normal" });
    const r = odehraj(home, createTeam(2, "Hosté"));

    const zmena = r.events.find((e) => e.detail === "plan:hardness");
    expect(zmena).toBeDefined();
    expect(zmena!.description).toContain("Do těla");
    expect(home.hardness).toBe("hard");
  });
});

describe("plánované střídání", () => {
  it("v zadané minutě pošle na hřiště určeného hráče za určeného hráče", () => {
    const home = createTeam(1, "Domácí");
    const out = home.lineup[9];   // FWD 110
    const inn = home.subs[2];     // FWD 114
    home.plan = [
      { id: "s1", fromMinute: 62, trigger: { kind: "minute" }, action: { kind: "sub", outPlayerId: out.id, inPlayerId: inn.id } },
    ];
    const r = odehraj(home, createTeam(2, "Hosté"));

    const stridani = r.events.find((e) => e.type === "substitution" && e.description.startsWith("Plánované střídání"));
    expect(stridani).toBeDefined();
    expect(stridani!.minute).toBe(62);
    expect(stridani!.description).toContain(inn.lastName);
    expect(stridani!.description).toContain(out.lastName);
    // Minuty musí sedět oběma stranám střídání.
    expect(r.playerMinutes[out.id].left).toBe(62);
    expect(r.playerMinutes[inn.id].entered).toBe(62);
  });

  it("střídání podle skóre proběhne jen když stav sedí", () => {
    // Beznadějně slabý tým proti silnému — prohrávat bude skoro jistě.
    const slaby = createTeam(1, "Domácí", 20);
    const silny = createTeam(2, "Hosté", 90);
    slaby.plan = [
      { id: "s1", fromMinute: 60, trigger: { kind: "score", state: "winning", byAtLeast: 3 },
        action: { kind: "sub", outPlayerId: slaby.lineup[9].id, inPlayerId: slaby.subs[2].id } },
    ];
    const r = odehraj(slaby, silny);
    expect(r.homeScore).toBeLessThan(r.awayScore);
    expect(r.events.some((e) => e.description.startsWith("Plánované střídání"))).toBe(false);
  });

  it("pravidlo se střídajícím hráčem mimo lavičku propadne, zápas doběhne", () => {
    const home = createTeam(1, "Domácí");
    home.plan = [
      { id: "s1", fromMinute: 60, trigger: { kind: "minute" },
        action: { kind: "sub", outPlayerId: home.lineup[9].id, inPlayerId: 99999 } },
    ];
    const r = odehraj(home, createTeam(2, "Hosté"));
    expect(r.events.some((e) => e.description.startsWith("Plánované střídání"))).toBe(false);
    expect(r.events.length).toBeGreaterThan(0);
  });

  it("plán nepřekročí limit tří střídání", () => {
    const home = createTeam(1, "Domácí");
    home.plan = [
      { id: "s1", fromMinute: 46, trigger: { kind: "minute" }, action: { kind: "sub", outPlayerId: home.lineup[1].id, inPlayerId: home.subs[0].id } },
      { id: "s2", fromMinute: 47, trigger: { kind: "minute" }, action: { kind: "sub", outPlayerId: home.lineup[5].id, inPlayerId: home.subs[1].id } },
      { id: "s3", fromMinute: 48, trigger: { kind: "minute" }, action: { kind: "sub", outPlayerId: home.lineup[9].id, inPlayerId: home.subs[2].id } },
    ];
    const r = odehraj(home, createTeam(2, "Hosté"));
    const strídání = r.events.filter((e) => e.type === "substitution" && e.teamId === 1);
    expect(strídání.length).toBeLessThanOrEqual(3);
    expect(r.events.filter((e) => e.description.startsWith("Plánované střídání"))).toHaveLength(3);
  });
});

describe("rezervace střídacích slotů", () => {
  it("automatika nespotřebuje slot, který si drží plánované střídání na konec", () => {
    // Vyčerpaný kádr, aby automatika po 60' měla koho střídat, a plán až na 88.
    const home = createTeam(1, "Domácí");
    for (const p of home.lineup) p.stamina = 5;
    home.plan = [
      { id: "s1", fromMinute: 88, trigger: { kind: "minute" },
        action: { kind: "sub", outPlayerId: home.lineup[9].id, inPlayerId: home.subs[2].id } },
      { id: "s2", fromMinute: 88, trigger: { kind: "minute" },
        action: { kind: "sub", outPlayerId: home.lineup[8].id, inPlayerId: home.subs[1].id } },
    ];
    const r = odehraj(home, createTeam(2, "Hosté", 90), 999);

    // Bez rezervace by automatika mezi 60' a 88' snadno vyčerpala všechny tři sloty.
    const planovana = r.events.filter((e) => e.description.startsWith("Plánované střídání"));
    expect(planovana).toHaveLength(2);
    expect(planovana.every((e) => e.minute === 88)).toBe(true);
  });
});

describe("pokyn opravdu mění hru, ne jen hodnotu pole", () => {
  /**
   * Simulace je na daný seed deterministická. Když se od 1. minuty přepne taktika
   * a průběh zůstane bit-identický, znamená to, že engine změnu vůbec nečte —
   * přesně ta chyba, kterou u sehranosti formace odhalilo 400 shodných zápasů.
   */
  it("stejný seed dá jiný zápas, když plán hned zkraje přepne taktiku", () => {
    const otisk = (plan: EngineMatchPlan | undefined) => {
      const home = createTeam(1, "Domácí");
      home.plan = plan;
      const r = odehraj(home, createTeam(2, "Hosté"), 20260901);
      return JSON.stringify([r.homeScore, r.awayScore, r.events.map((e) => [e.minute, e.type, e.playerId])]);
    };

    const bezPlanu = otisk(undefined);
    const sPlanem = otisk([
      { id: "t1", fromMinute: 1, trigger: { kind: "minute" }, action: { kind: "tactic", tactic: "defensive" } },
    ]);
    expect(sPlanem).not.toBe(bezPlanu);
  });

  it("pokyn na taktiku, kterou tým už hraje, průběh nezmění", () => {
    const otisk = (plan: EngineMatchPlan | undefined) => {
      const home = createTeam(1, "Domácí");
      home.plan = plan;
      const r = odehraj(home, createTeam(2, "Hosté"), 20260901);
      return JSON.stringify([r.homeScore, r.awayScore, r.events.map((e) => [e.minute, e.type, e.playerId])]);
    };

    // createTeam hraje vyrovnanou — přepnutí na vyrovnanou nesmí nic udělat.
    expect(otisk([
      { id: "t1", fromMinute: 1, trigger: { kind: "minute" }, action: { kind: "tactic", tactic: "balanced" } },
    ])).toBe(otisk(undefined));
  });
});
