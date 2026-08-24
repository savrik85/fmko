import { describe, it, expect } from "vitest";
import type { MatchEvent } from "@okresni-masina/shared";
import { generateCommentary } from "./commentary";
import { createRng } from "../generators/rng";

/**
 * Šablony se vybírají podle tagu, který sedí na `detail` nebo `source` události.
 * Když nesedí nic, los musí sáhnout jen po obecných šablonách — ne po těch, které
 * jsou vyhrazené jiné situaci. Bez toho vypadne penaltová hláška u gólu ze hry.
 */

function ev(partial: Partial<MatchEvent> & Pick<MatchEvent, "type">): MatchEvent {
  return {
    minute: 30,
    playerId: 101,
    playerName: "Josef Novák",
    teamId: 1,
    description: "popis z enginu",
    ...partial,
  } as MatchEvent;
}

/** Posbírá všechny hlášky, které pro danou událost mohou padnout. */
function possibleLines(event: MatchEvent, tries = 400): Set<string> {
  const rng = createRng(1);
  const out = new Set<string>();
  for (let i = 0; i < tries; i++) {
    out.add(generateCommentary(rng, event, "TJ Sokol", "SK Lhota", 1, 0));
  }
  return out;
}

describe("výběr komentářových šablon", () => {
  it("gól ze hry nikdy nedostane penaltovou hlášku", () => {
    // detail u gólu je skóre, takže na žádný tag nesedne → obecný los.
    const lines = [...possibleLines(ev({ type: "goal", detail: "1:0", source: "open_play" }))];

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.toLowerCase()).not.toContain("penalt");
    }
  });

  it("dorážka se pozná podle source, ne podle detailu", () => {
    // Fallback má pro scramble vlastní šablonu; detail nese skóre, takže musí zabrat `source`.
    const lines = possibleLines(ev({ type: "goal", detail: "1:0", source: "scramble" }));

    expect(lines.size).toBe(1);
    expect([...lines][0]).toContain("doráží po vyraženém míči");
  });

  it("special událost bez vlastní šablony nesáhne po šabloně vyhrazené jiné situaci", () => {
    // `emergency_gk` v šablonách není. Jediná special šablona ve fallbacku je tagovaná
    // 'possession' — ta je vyhrazená, takže nesmí padnout a zbyde popis z enginu.
    const lines = possibleLines(ev({ type: "special", detail: "emergency_gk" }));

    expect(lines.size).toBe(1);
    expect([...lines][0]).toBe("popis z enginu");
  });

  it("událost se sedícím tagem svou šablonu dostane", () => {
    const lines = possibleLines(ev({ type: "special", detail: "possession" }));

    expect(lines.size).toBe(1);
    expect([...lines][0]).toBe("Josef Novák na míči.");
  });

  it("incidenty počasí si nesou celou větu z enginu", () => {
    for (const detail of ["weather_slip", "weather_puddle", "weather_wind"]) {
      const event = ev({ type: "special", detail, description: `varianta pro ${detail}` });
      const lines = possibleLines(event);

      expect(lines.size).toBe(1);
      expect([...lines][0]).toBe(`varianta pro ${detail}`);
    }
  });
});
