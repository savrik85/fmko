/**
 * Kalibrace gólovosti.
 *
 * Do 2026-10-10 rostly šance s úrovní hráčů a taktika s počasím se sčítaly
 * napevno. Produkce pak měla v Praze a Prachaticích 6,5–7 gólů na zápas, víc
 * než hokej. Tenhle test hlídá, že se to nevrátí: vyrovnaný zápas dává ~4 góly
 * na jakékoli úrovni a ani taktika, počasí nebo rozdíl v síle z fotbalu hokej
 * neudělají. Viz calcChanceProb v simulation.ts.
 */
import { describe, it, expect } from "vitest";
import { createRng } from "../generators/rng";
import { simulateMatch } from "./simulation";
import { createTeam } from "./test-helpers/lineup";
import type { Tactic, Weather } from "./types";

const N = 1000;
const SLOW = 120_000;

interface Setup {
  home: number; away: number;
  homeTactic?: Tactic; awayTactic?: Tactic;
  weather?: Weather; pitch?: number; moisture?: number;
}

function play(s: Setup): { home: number; away: number; total: number } {
  let home = 0;
  let away = 0;
  for (let i = 0; i < N; i++) {
    const h = createTeam(1, "D", s.home);
    const a = createTeam(2, "H", s.away);
    h.tactic = s.homeTactic ?? "balanced";
    a.tactic = s.awayTactic ?? "balanced";
    h.formationFamiliarity = 60;
    a.formationFamiliarity = 60;
    const r = simulateMatch(createRng(60000 + i), {
      home: h, away: a, weather: s.weather ?? "cloudy", isHomeAdvantage: true,
      pitchCondition: s.pitch ?? 60, pitchMoisture: s.moisture ?? 50,
    });
    home += r.homeScore;
    away += r.awayScore;
  }
  return { home: home / N, away: away / N, total: (home + away) / N };
}

describe("kalibrace gólovosti", () => {
  it("vyrovnaný zápas dává 3,7–4,5 gólu, ať hrají dvacítky, nebo padesátky", () => {
    const low = play({ home: 22, away: 22 }).total;
    const high = play({ home: 50, away: 50 }).total;
    for (const g of [low, high]) {
      expect(g).toBeGreaterThan(3.7);
      expect(g).toBeLessThan(4.5);
    }
    // Dřív: 3,6 proti 5,2. Úroveň ligy nesmí sama o sobě přidávat góly.
    expect(Math.abs(high - low) / low).toBeLessThan(0.10);
  }, SLOW);

  it("nakopávaný balon v dešti pomáhá, ale z deště neudělá přestřelku", () => {
    const rain = { weather: "rain" as const, pitch: 50, moisture: 70 };
    const balanced = play({ home: 45, away: 45, ...rain });
    const oneLong = play({ home: 45, away: 45, homeTactic: "long_ball", ...rain });
    const bothLong = play({ home: 45, away: 45, homeTactic: "long_ball", awayTactic: "long_ball", ...rain });
    expect(oneLong.home).toBeGreaterThan(balanced.home);
    // Dřív +73 % (oba long ball v dešti 8,4 gólu).
    expect(bothLong.total / balanced.total).toBeLessThan(1.35);
  }, SLOW);

  it("ve větru se nakopávaný balon nevyplatí", () => {
    const balanced = play({ home: 40, away: 40, weather: "wind" });
    const longBall = play({ home: 40, away: 40, homeTactic: "long_ball", weather: "wind" });
    expect(longBall.home).toBeLessThan(balanced.home);
  }, SLOW);

  it("dvě útočné taktiky přidají góly, ale ne dvojnásobek", () => {
    const balanced = play({ home: 45, away: 45 });
    const offensive = play({ home: 45, away: 45, homeTactic: "offensive", awayTactic: "offensive" });
    expect(offensive.total).toBeGreaterThan(balanced.total);
    // Dřív +70 % na téhle úrovni.
    expect(offensive.total / balanced.total).toBeLessThan(1.5);
  }, SLOW);

  it("velký rozdíl v síle vyhraje favorit jasně, ale ne hokejovým skóre", () => {
    const r = play({ home: 25, away: 40 });
    expect(r.away).toBeGreaterThan(r.home * 2.5);
    // Dřív 6,3 gólu (0,9 : 5,4).
    expect(r.total).toBeLessThan(5.5);
  }, SLOW);
});
