import { describe, it, expect } from "vitest";
import { tacticHints } from "./tactic-hints";

/**
 * Tipy čtou konstanty enginu, ne vlastní kopii čísel. Tyhle testy hlídají, že
 * radí konzistentně s tím, co simulace opravdu dělá — jinak by po přeladění
 * balancu tiše začaly lhát.
 */

const zaklad = { pitchCondition: 80, pitchMoisture: 50 };

function labely(input: Parameters<typeof tacticHints>[0]) {
  return tacticHints(input).map((h) => h.label);
}

describe("tipy k sestavě podle podmínek", () => {
  it("za zatažena na dobrém hřišti není co řešit", () => {
    expect(tacticHints({ weather: "cloudy", ...zaklad })).toHaveLength(0);
  });

  it("sníh varuje před technikou, kondicí i zraněními", () => {
    const l = labely({ weather: "snow", ...zaklad });
    expect(l).toContain("Kombinační hra bude váznout");
    expect(l).toContain("Kondice půjde dolů rychleji");
    expect(l).toContain("Zvýšené riziko zranění");
  });

  it("déšť a sníh nabízejí nakopávaný balon", () => {
    expect(labely({ weather: "rain", ...zaklad })).toContain("Zvaž nakopávaný balon");
    expect(labely({ weather: "snow", ...zaklad })).toContain("Zvaž nakopávaný balon");
  });

  it("kdo už nakopávaný balon má, dostane potvrzení místo návrhu", () => {
    const l = labely({ weather: "rain", ...zaklad, tactic: "long_ball" });
    expect(l).toContain("Nakopávaný balon tu sedí");
    expect(l).not.toContain("Zvaž nakopávaný balon");
  });

  it("ve větru nakopávaný balon varuje, ale jen když ho tým má nastavený", () => {
    expect(labely({ weather: "wind", ...zaklad, tactic: "long_ball" }))
      .toContain("Nakopávat se dneska nevyplatí");
    expect(labely({ weather: "wind", ...zaklad, tactic: "balanced" }))
      .not.toContain("Nakopávat se dneska nevyplatí");
  });

  it("rozbité hřiště varuje před zraněními i za hezkého počasí", () => {
    const l = labely({ weather: "cloudy", pitchCondition: 8, pitchMoisture: 50 });
    expect(l).toContain("Zvýšené riziko zranění");
  });

  it("rozbité hřiště taky nahrává nakopávání", () => {
    expect(labely({ weather: "cloudy", pitchCondition: 5, pitchMoisture: 50 }))
      .toContain("Zvaž nakopávaný balon");
  });

  it("stav půdy se hlásí zvlášť od počasí", () => {
    expect(labely({ weather: "cloudy", pitchCondition: 80, pitchMoisture: 95 }))
      .toContain("Rozmáčený terén");
    expect(labely({ weather: "cloudy", pitchCondition: 80, pitchMoisture: 5 }))
      .toContain("Vyprahlý terén");
  });

  it("rozmáčený a vyprahlý terén se nikdy nehlásí zároveň", () => {
    for (const m of [0, 25, 50, 75, 100]) {
      const l = labely({ weather: "cloudy", pitchCondition: 80, pitchMoisture: m });
      const oba = l.includes("Rozmáčený terén") && l.includes("Vyprahlý terén");
      expect(oba).toBe(false);
    }
  });

  it("zimní výbava postihy tlumí, takže varování ubývají", () => {
    const bez = tacticHints({ weather: "snow", ...zaklad, weatherResist: 0 });
    const s = tacticHints({ weather: "snow", ...zaklad, weatherResist: 0.45 });
    const varovani = (h: typeof bez) => h.filter((x) => x.tone === "warning").length;
    expect(varovani(s)).toBeLessThanOrEqual(varovani(bez));
    expect(s.map((h) => h.label)).toContain("Zimní výbava zabírá");
  });

  it("varování jdou první, info poslední", () => {
    const h = tacticHints({ weather: "snow", pitchCondition: 10, pitchMoisture: 95, weatherResist: 0.2 });
    const poradi = h.map((x) => x.tone);
    const serazeno = [...poradi].sort((a, b) => {
      const o = { warning: 0, opportunity: 1, info: 2 } as const;
      return o[a] - o[b];
    });
    expect(poradi).toEqual(serazeno);
  });

  it("každý tip má vysvětlení, ne jen nadpis", () => {
    for (const h of tacticHints({ weather: "snow", pitchCondition: 10, pitchMoisture: 95 })) {
      expect(h.detail.length).toBeGreaterThan(20);
    }
  });

  it("chybějící údaje o hřišti tipy nerozbijí", () => {
    expect(() => tacticHints({ weather: "rain" })).not.toThrow();
    expect(tacticHints({ weather: "rain" }).length).toBeGreaterThan(0);
  });
});
