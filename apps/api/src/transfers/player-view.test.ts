import { describe, expect, it } from "vitest";
import { buildPlayerView, ocistiRadekProCizi, verejnyZivotHrace } from "./player-view";

const RADEK = {
  id: "p1", team_id: "tym-a", first_name: "Franta", last_name: "Novák", age: 27, position: "MID",
  overall_rating: 41,
  skills: JSON.stringify({ passing: 43, shooting: 38 }),
  physical: JSON.stringify({ stamina: 62 }),
  personality: JSON.stringify({ discipline: 23, alcohol: 81 }),
  life_context: JSON.stringify({
    occupation: "Zedník", condition: 87, morale: 34,
    transferUnrest: { level: 55 }, skillsMax: { passing: 70 }, celebrityTransportCost: 900,
    wageRaisedSeason: 3, absence: { reason: "Práce" }, hangover: 1, trainingRest: 1,
  }),
  avatar: "{}",
  skills_max: JSON.stringify({ vision: { current: 47, max: 71 }, passing: { current: 43, max: 68 } }),
  gk_skills: JSON.stringify({ reflexes: 12 }),
  gk_skills_max: JSON.stringify({ reflexes: { current: 12, max: 30 } }),
  hidden_talent: 38, coach_relationship: 71, weekly_wage: 250, squad_number: 8,
};

describe("co vidí cizí klub", () => {
  it("z life_context jen povolání a zaokrouhlenou kondici s morálkou", () => {
    expect(verejnyZivotHrace(JSON.parse(RADEK.life_context))).toEqual({
      occupation: "Zedník", condition: 90, morale: 30,
    });
  });

  it("řádek bez potenciálu, skrytého talentu, vztahu k trenérovi a mzdy", () => {
    const { row, doplnitDoSkills } = ocistiRadekProCizi(RADEK);
    expect(row).not.toHaveProperty("skills_max");
    expect(row).not.toHaveProperty("gk_skills_max");
    expect(row).not.toHaveProperty("hidden_talent");
    expect(row).not.toHaveProperty("coach_relationship");
    expect(row.weekly_wage).toBeNull();
    expect(JSON.parse(row.gk_skills as string)).toEqual({ reflexes: 10 });
    // Aktuální hodnoty ze skills_max smí ven (zamlžené), maximum ne.
    expect(doplnitDoSkills).toEqual({ vision: 45, passing: 45 });
    expect(JSON.stringify({ row, doplnitDoSkills })).not.toContain("71");
    expect(JSON.stringify({ row, doplnitDoSkills })).not.toContain("68");
  });

  it("buildPlayerView pro cizí klub nepustí interní klíče life_context", () => {
    const v = buildPlayerView(RADEK, "tym-b");
    expect(v.isOwn).toBe(false);
    expect(Object.keys(v.lifeContext).sort()).toEqual(["condition", "morale", "occupation"]);
  });

  it("vlastní klub vidí všechno beze změny", () => {
    const v = buildPlayerView(RADEK, "tym-a");
    expect(v.isOwn).toBe(true);
    expect(v.lifeContext).toEqual(JSON.parse(RADEK.life_context));
    expect(v.weekly_wage).toBe(250);
  });
});
