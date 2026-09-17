import { describe, expect, it, vi } from "vitest";

vi.mock("../auth/divak", () => ({ tymyDivaka: vi.fn(async () => new Set(["tym-a"])) }));

import { FalesnaD1, jakoD1, type Pravidlo } from "../incidents/testovaci-d1";
import { incidentRadek } from "../incidents/testovaci-stav";
import type { Bindings } from "../index";
import { incidentsRouter } from "./incidents";

function env(pravidla: Pravidlo[]): Bindings {
  return { DB: jakoD1(new FalesnaD1(pravidla)), SESSION_KV: { get: async () => null } } as unknown as Bindings;
}

const NENALEZENA = {
  id: "inc-1-svedek-1", source: "svedek", points_to_player_id: "p", suspects: null, holder_player_id: "a",
  strength: 2, police_bonus: 0.1, text: "TAJNA_STOPA.", found: 0,
};
const NALEZENA = {
  id: "inc-1-soused-1", source: "soused", points_to_player_id: null, suspects: '["p","a"]', holder_player_id: null,
  strength: 1, police_bonus: 0.15, text: "Soused něco viděl.", found: 1,
};
const KADR = [
  { id: "a", first_name: "Adam", last_name: "Kos", weekly_wage: 90 },
  { id: "p", first_name: "Pepa", last_name: "Průšvih", weekly_wage: 100 },
];

describe("detail incidentu", () => {
  it("cizí tým detail neuvidí", async () => {
    const res = await incidentsRouter.request("/teams/tym-b/incidents/inc-1", {}, env([]));
    expect(res.status).toBe(403);
  });

  it("neprozradí neodhaleného pachatele, nenalezenou stopu ani držitele stop", async () => {
    const res = await incidentsRouter.request("/teams/tym-a/incidents/inc-1", {}, env([
      { sql: /FROM club_incidents i/, first: { ...incidentRadek(), jmeno: "Pepa", prijmeni: "Průšvih" } },
      { sql: /FROM club_incident_clues/, all: [NENALEZENA, NALEZENA] },
      { sql: /FROM players WHERE team_id = \?/, all: KADR },
    ]));
    expect(res.status).toBe(200);
    const telo = await res.json() as Record<string, any>;
    expect(telo.incident.pachatel).toBeNull();
    expect(JSON.stringify(telo)).not.toContain("TAJNA_STOPA");
    expect(telo.stopy).toEqual([{ zdroj: "soused", text: "Soused něco viděl.", sila: 1 }]);
    expect(telo.vysetrovani).toEqual({
      stav: "podezreli",
      podezreli: [{ playerId: "a", jmeno: "Adam Kos" }, { playerId: "p", jmeno: "Pepa Průšvih" }],
    });
    expect(telo.akce).toEqual({ obvinit: true, policie: true, tresty: [], zeptat: true, promluvit: false });
    expect(telo.zbyvaObvineni).toBe(2);
    expect(telo.kadr).toHaveLength(2);
    expect(telo.castky).toBeNull();
  });

  it("u odhaleného pachatele v kádru nabídne tresty s částkami", async () => {
    const res = await incidentsRouter.request("/teams/tym-a/incidents/inc-1", {}, env([
      { sql: /FROM club_incidents i/, first: { ...incidentRadek({ culprit_revealed: 1 }), jmeno: "Pepa", prijmeni: "Průšvih" } },
      { sql: /FROM players WHERE team_id = \?/, all: KADR },
    ]));
    const telo = await res.json() as Record<string, any>;
    expect(telo.incident.pachatel).toEqual({ playerId: "p", jmeno: "Pepa Průšvih" });
    expect(telo.akce.tresty).toContain("pokuta");
    expect(telo.castky).toEqual({ srazka: 400, pokuta: 200, tydnu: 4 });
    expect(telo.kadr).toEqual([]);
  });

  it("akce bez přihlášení neprojdou", async () => {
    for (const cesta of ["obvinit", "policie", "rozhodnuti"]) {
      const res = await incidentsRouter.request(`/teams/tym-a/incidents/inc-1/${cesta}`, { method: "POST", body: "{}" }, env([]));
      expect(res.status).toBe(401);
    }
  });
});
