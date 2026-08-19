import { describe, expect, it } from "vitest";
import { findViolations } from "./compliance";
import { DEFAULT_RULES, type CompetitionRules } from "./defaults";

const rules = (over: Partial<CompetitionRules>): CompetitionRules =>
  ({ ...DEFAULT_RULES, ...over }) as CompetitionRules;

const klub = (over: Partial<{ id: string; name: string; pitch: number | null; squad: number }> = {}) =>
  ({ id: "t1", name: "FK Test", pitch: 50, squad: 16, ...over });

describe("kontrola pravidel soutěže", () => {
  it("výchozí sazebník nikoho netrestá", () => {
    // Zapnutí samosprávy nesmí samo o sobě nikomu nic strhnout.
    const hits = findViolations([klub({ pitch: 1, squad: 0 })], rules({}));
    expect(hits).toEqual([]);
  });

  it("hřiště pod odhlasovanou hranicí je porušení", () => {
    const hits = findViolations([klub({ pitch: 19 })], rules({ min_pitch_condition: 30 }));
    expect(hits).toHaveLength(1);
    expect(hits[0].reason).toBe("Hřiště pod hranicí soutěže");
    expect(hits[0].detail).toContain("19");
  });

  it("hřiště přesně na hranici projde", () => {
    expect(findViolations([klub({ pitch: 30 })], rules({ min_pitch_condition: 30 }))).toEqual([]);
  });

  it("klub bez stadionu se nedá potrestat za trávník", () => {
    expect(findViolations([klub({ pitch: null })], rules({ min_pitch_condition: 30 }))).toEqual([]);
  });

  it("hlídá obě hranice soupisky", () => {
    expect(findViolations([klub({ squad: 10 })], rules({ squad_min: 14 }))).toHaveLength(1);
    expect(findViolations([klub({ squad: 30 })], rules({ squad_max: 25 }))).toHaveLength(1);
    expect(findViolations([klub({ squad: 20 })], rules({ squad_min: 14, squad_max: 25 }))).toEqual([]);
  });

  it("jeden klub může porušit víc pravidel najednou", () => {
    const hits = findViolations(
      [klub({ pitch: 5, squad: 8 })],
      rules({ min_pitch_condition: 30, squad_min: 14 }),
    );
    expect(hits).toHaveLength(2);
  });
});
