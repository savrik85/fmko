/**
 * Role hráčů v zápase (engine/roles.ts).
 *
 * Do 2026-10-10 profil hráče zvýrazňoval vlastnosti, se kterými zápas vůbec nepočítal:
 * brankáři hrálo jen chytání, zkušenost se do zápasu nenačítala, přehled obránců
 * a útočníků nedělal nic. Tyhle testy hlídají, že každá vlastnost s vahou
 * v hodnocení (`RATING_WEIGHTS`) má na svém postu v zápase roli — a že ji opravdu
 * hraje, ne jen stojí v tabulce koeficientů.
 */
import { describe, it, expect } from "vitest";
import { RATING_WEIGHTS } from "@okresni-masina/shared";
import { createRng } from "../generators/rng";
import { simulateMatch } from "./simulation";
import { createPlayer, createTeam } from "./test-helpers/lineup";
import { gkValue, possessionShare, slotSkillUses, teamAttack, teamDefense, teamPossession, type RoleSkill, type Slot } from "./roles";
import type { MatchPlayer } from "./types";

const SLOTS: Slot[] = ["GK", "DEF", "MID", "FWD"];

function weightedSkills(slot: Slot): RoleSkill[] {
  return Object.entries(RATING_WEIGHTS[slot]).filter(([, w]) => w > 0).map(([s]) => s as RoleSkill);
}

describe("každá vlastnost s vahou má na postu roli", () => {
  for (const slot of SLOTS) {
    it(`${slot}: všechny vlastnosti z hodnocení jsou v rolích`, () => {
      const used = slotSkillUses(slot);
      const missing = weightedSkills(slot).filter((s) => !used.has(s));
      expect(missing, `${slot} má v hodnocení, ale v zápase nehraje: ${missing.join(", ")}`).toEqual([]);
    });
  }
});

describe("snížení vlastnosti změní odehraný zápas", () => {
  // Nulový vliv = identický průběh se stejnými semínky, takže se pozná přesně.
  // Standardky hrají jen u exekutora, toho určuje manažer (spec 2026-10-10).
  const SEEDS = 40;
  const baseline = Array.from({ length: SEEDS }, (_, i) => JSON.stringify(simulateMatch(createRng(52000 + i), {
    home: createTeam(1, "A"), away: createTeam(2, "B"), weather: "cloudy", isHomeAdvantage: true,
  }).events));

  for (const slot of SLOTS) {
    for (const skill of weightedSkills(slot).filter((s) => s !== "setPieces")) {
      it(`${slot} ${skill}`, () => {
        let changed = 0;
        for (let i = 0; i < SEEDS; i++) {
          const home = createTeam(1, "A");
          for (const p of home.lineup) {
            if ((p.matchPosition ?? p.position) === slot) (p as unknown as Record<string, number>)[skill] = Math.max(1, ((p as unknown as Record<string, number>)[skill] ?? 50) - 15);
          }
          const r = simulateMatch(createRng(52000 + i), { home, away: createTeam(2, "B"), weather: "cloudy", isHomeAdvantage: true });
          if (JSON.stringify(r.events) !== baseline[i]) changed++;
        }
        expect(changed, `${slot} ${skill}: snížení o 15 nezměnilo ani jeden zápas`).toBeGreaterThan(0);
      });
    }
  }
});

describe("měřítko fází", () => {
  it("průměrný tým má útok 39 a obranu 35 jako starý vzorec", () => {
    const t = createTeam(1, "A", 50);
    // createTeam má výdrž 60 a nasazení 50 → útok i obrana o stejný kousek nad referencí.
    expect(teamAttack(t.lineup) / teamDefense(t.lineup)).toBeCloseTo(39 / 35, 2);
  });

  it("stejné týmy mají míč napůl, lepší rozehrávka víc", () => {
    const a = createTeam(1, "A", 50);
    const b = createTeam(2, "B", 50);
    expect(possessionShare(teamPossession(a.lineup), teamPossession(b.lineup))).toBeCloseTo(0.5, 5);
    for (const p of a.lineup) p.passing += 10;
    expect(possessionShare(teamPossession(a.lineup), teamPossession(b.lineup))).toBeGreaterThan(0.51);
  });

  it("oslabení: vyloučený obránce ubere obranu víc než vyloučený útočník", () => {
    const full = createTeam(1, "A", 50).lineup;
    const noDef = full.filter((p) => p.id !== full.find((x) => x.position === "DEF")!.id);
    const noFwd = full.filter((p) => p.id !== full.find((x) => x.position === "FWD")!.id);
    expect(teamDefense(noDef)).toBeLessThan(teamDefense(noFwd));
    expect(teamAttack(noFwd)).toBeLessThan(teamAttack(noDef));
  });
});

describe("brankář", () => {
  const gk = (o: Partial<MatchPlayer> = {}): MatchPlayer => ({ ...createPlayer(1, "GK", 60), ...o });

  it("chytání 100 už neznamená strop: postavení, vybíhání i zkušenost rozlišují brankáře", () => {
    const weak = gk({ goalkeeping: 100, defense: 30, speed: 30, experience: 10 });
    const strong = gk({ goalkeeping: 100, defense: 80, speed: 80, experience: 90 });
    expect(gkValue(strong, "shot")).toBeGreaterThan(gkValue(weak, "shot"));
    expect(gkValue(strong, "oneOnOne")).toBeGreaterThan(gkValue(weak, "oneOnOne"));
    expect(gkValue(strong, "penalty")).toBeGreaterThan(gkValue(weak, "penalty"));
  });

  it("bonus trenéra brankářů a vybavení nepropadá u chytání 100", () => {
    const base = gk({ goalkeeping: 100 });
    expect(gkValue({ ...base, gkBonus: 6 }, "shot")).toBeGreaterThan(gkValue(base, "shot"));
  });

  it("vysoký brankář s dobrými hlavičkami a silou chytá centry líp", () => {
    const small = gk({ height: 175, heading: 30, strength: 30 });
    const tall = gk({ height: 195, heading: 60, strength: 70 });
    expect(gkValue(tall, "aerial")).toBeGreaterThan(gkValue(small, "aerial"));
    // Výška sama: stejné dovednosti, jiná postava.
    expect(gkValue(gk({ height: 195 }), "aerial")).toBeGreaterThan(gkValue(gk({ height: 175 }), "aerial"));
  });

  it("brankářova kreativita (komunikace) posílí obranu týmu", () => {
    const quiet = createTeam(1, "A", 50).lineup;
    const loud = createTeam(1, "A", 50).lineup;
    loud[0].creativity = 90;
    expect(teamDefense(loud)).toBeGreaterThan(teamDefense(quiet));
  });
});
