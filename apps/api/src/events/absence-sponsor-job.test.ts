/**
 * Práce u sponzora (sponsors/player-jobs.ts): šéf hráče na zápas pustí. Směnař s takovou prací
 * chybí méně a na práci se nevymluví nikdy. Po přestupu do jiného klubu výhoda neplatí.
 */
import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { generateAbsences, hracProAbsenci, type PlayerForAbsence } from "./absence";

const shiftWorker = (sponsorJob: boolean, i: number): PlayerForAbsence => ({
  firstName: "Hráč", lastName: `Č${i}`, age: 27, occupation: "Hasič",
  discipline: 35, patriotism: 50, alcohol: 40, temper: 45, morale: 50, stamina: 70, injuryProneness: 40, commuteKm: 0,
  ...(sponsorJob ? { sponsorJob: true } : {}),
});

function run(sponsorJob: boolean): { total: number; professional: number } {
  const squad = Array.from({ length: 18 }, (_, i) => shiftWorker(sponsorJob, i));
  let total = 0;
  let professional = 0;
  for (let seed = 1; seed <= 400; seed++) {
    for (const a of generateAbsences(createRng(seed), squad, { timing: "any" })) {
      total++;
      if (a.category === "professional") professional++;
    }
  }
  return { total, professional };
}

describe("omluvenky hráčů s prací u sponzora", () => {
  it("chybí méně a nikdy se nevymluví na práci", () => {
    const without = run(false);
    const withJob = run(true);
    expect(without.professional).toBeGreaterThan(0);
    expect(withJob.professional).toBe(0);
    expect(withJob.total).toBeLessThan(without.total * 0.8);
  });

  it("práce platí jen v klubu, kde ji trenér sehnal", () => {
    const row = (teamId: string) => ({
      id: "p1", team_id: teamId, first_name: "Jan", last_name: "Novák", age: 27,
      personality: "{}", physical: "{}",
      life_context: JSON.stringify({ occupation: "Hasič", sponsorJob: { sponsorId: 1, firm: "Pila", since: "2026-11-20", previous: "Hasič", teamIds: ["club", "club-u21"] } }),
    });
    expect(hracProAbsenci(row("club")).sponsorJob).toBe(true);
    expect(hracProAbsenci(row("club-u21")).sponsorJob).toBe(true);
    expect(hracProAbsenci(row("jiny-klub")).sponsorJob).toBeUndefined();
  });
});
