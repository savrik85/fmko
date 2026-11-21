/**
 * Drby o přestupech (F10), čistá pravidla: z čeho drb vznikne, kolik jich je nepravdivých,
 * texty pro hráče, rozpoznání odpovědi hospodskému a dopady (uklidnění, cena).
 */
import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import {
  classifyRumourReply, FALSE_SHARE, pickRumour, RUMOUR_CALM_UNREST_CUT, RUMOUR_HYPE_PCT, rumourArticle, rumourCalmMultiplier,
  rumourHypeMultiplier, rumourSms, type RumourWorld,
} from "./rumours";

const OWN = [
  { id: "own-mid", firstName: "Josef", lastName: "Novák", position: "MID", teamId: "home", rating: 48 },
  { id: "own-fwd", firstName: "Karel", lastName: "Dvořák", position: "FWD", teamId: "home", rating: 44 },
  { id: "own-def", firstName: "Petr", lastName: "Kolář", position: "DEF", teamId: "home", rating: 40 },
];
const FOREIGN = [
  { id: "rival-gk", firstName: "Jan", lastName: "Hájek", position: "GK", teamId: "club-a", rating: 45 },
  { id: "rival-def", firstName: "Tomáš", lastName: "Černý", position: "DEF", teamId: "club-a", rating: 41 },
  { id: "rival-mid", firstName: "Lukáš", lastName: "Veselý", position: "MID", teamId: "club-b", rating: 47 },
];
const CLUBS = [
  { id: "club-a", name: "TJ Netolice" },
  { id: "club-b", name: "SK Vimperk" },
  { id: "club-c", name: "Spartak Volary" },
];

function world(over: Partial<RumourWorld> = {}): RumourWorld {
  return {
    teamId: "home",
    ownPlayers: OWN,
    foreignPlayers: FOREIGN,
    clubs: CLUBS,
    signals: [
      { kind: "scout", playerId: "own-mid", clubId: "club-b" },
      { kind: "ai_interest", playerId: "own-fwd", clubId: "club-a" },
      { kind: "ai_sell", playerId: "rival-gk", clubId: "club-a" },
      { kind: "unhappy", playerId: "rival-mid", clubId: "club-b" },
    ],
    recentPlayers: new Set(),
    ownPending: false,
    ...over,
  };
}

/** Náhoda, která vrací pořád totéž číslo: 0 = vždy projde šance i klam. */
const constRng = (v: number) => ({ random: () => v, pick: <T>(a: readonly T[]) => a[0], int: (min: number) => min });

function run(w: RumourWorld, n: number, coach = false) {
  const out = [];
  for (let seed = 1; seed <= n; seed++) {
    const r = pickRumour(w, createRng(seed), { coach });
    if (r) out.push(r);
  }
  return out;
}

const KNOWN_NAMES = [...OWN, ...FOREIGN].map((p) => `${p.firstName} ${p.lastName}`);
const KNOWN_IDS = new Set([...OWN, ...FOREIGN].map((p) => p.id));
const CLUB_IDS = new Set(CLUBS.map((c) => c.id));

describe("drb nikdy neprozradí jméno, které neexistuje", () => {
  it("signály na neznámého hráče nebo klub se zahodí, drby mluví jen o skutečných lidech a klubech", () => {
    const w = world({
      signals: [
        ...world().signals,
        { kind: "scout", playerId: "p-ghost", clubId: "club-b" },
        { kind: "ai_interest", playerId: "own-mid", clubId: "c-ghost" },
        // Cizí hráč, který v tom klubu nehraje: tip by poslal manažera za někým jiným.
        { kind: "ai_sell", playerId: "rival-mid", clubId: "club-a" },
        { kind: "unhappy", playerId: "f-ghost", clubId: "club-c" },
      ],
    });
    const rumours = run(w, 3000, true);
    expect(rumours.length).toBeGreaterThan(500);
    for (const r of rumours) {
      expect(KNOWN_IDS.has(r.playerId)).toBe(true);
      expect(CLUB_IDS.has(r.clubId)).toBe(true);
      expect(r.text).toContain(r.playerName);
      expect(KNOWN_NAMES).toContain(r.playerName);
      expect(r.text).toContain(CLUBS.find((c) => c.id === r.clubId)!.name);
      expect(r.text).not.toMatch(/undefined|null|ghost|\{/i);
      // Jméno jen v 1. pádu: „o hráči Josef Novák“ by bylo špatně.
      expect(r.text).not.toContain(`hráči ${r.playerName}`);
      expect(r.text).not.toContain(`hráče ${r.playerName}`);
      if (r.subject === "foreign") {
        expect(FOREIGN.find((p) => p.id === r.playerId)?.teamId).toBe(r.clubId);
      } else {
        expect(OWN.some((p) => p.id === r.playerId)).toBe(true);
        expect(r.clubId).not.toBe("home");
      }
    }
  });

  it("pravdivý drb odpovídá skutečnému signálu, nepravdivý žádnému", () => {
    const w = world();
    const real = new Set(w.signals.map((s) => `${s.playerId}|${s.clubId}`));
    for (const r of run(w, 3000, true)) {
      expect(real.has(`${r.playerId}|${r.clubId}`)).toBe(r.isTrue);
    }
  });
});

describe("nepravdivý podíl drží", () => {
  it(`zhruba ${FALSE_SHARE * 100} % drbů je nepravdivých`, () => {
    const rumours = run(world(), 6000, true);
    const share = rumours.filter((r) => !r.isTrue).length / rumours.length;
    expect(rumours.length).toBeGreaterThan(1500);
    expect(share).toBeGreaterThan(FALSE_SHARE - 0.04);
    expect(share).toBeLessThan(FALSE_SHARE + 0.04);
  });

  it("podíl drží i u klubu s jediným signálem", () => {
    const rumours = run(world({ signals: [{ kind: "scout", playerId: "own-mid", clubId: "club-b" }] }), 8000, true);
    const share = rumours.filter((r) => !r.isTrue).length / rumours.length;
    expect(share).toBeGreaterThan(FALSE_SHARE - 0.04);
    expect(share).toBeLessThan(FALSE_SHARE + 0.04);
  });
});

describe("žádný drb bez signálu ani klamu", () => {
  it("bez signálu nevznikne drb, ani když hospodský lže a šance vždy projde", () => {
    expect(pickRumour(world({ signals: [] }), constRng(0), { coach: true })).toBeNull();
    expect(run(world({ signals: [] }), 2000, true)).toHaveLength(0);
  });

  it("signály jen na neexistující lidi jsou jako žádné", () => {
    const w = world({ signals: [{ kind: "scout", playerId: "p-ghost", clubId: "club-b" }, { kind: "unhappy", playerId: "f-ghost", clubId: "club-c" }] });
    expect(pickRumour(w, constRng(0), { coach: true })).toBeNull();
    expect(run(w, 2000, true)).toHaveLength(0);
  });

  it("když šance neprojde, není nic", () => {
    expect(pickRumour(world(), constRng(0.99), { coach: true })).toBeNull();
  });

  it("trenér v hospodě slyší drby zhruba dvakrát častěji", () => {
    const alone = run(world(), 4000, false).length;
    const coach = run(world(), 4000, true).length;
    expect(coach / alone).toBeGreaterThan(1.7);
    expect(coach / alone).toBeLessThan(2.3);
  });
});

describe("opakování a čekající drb", () => {
  it("čeká-li drb o vlastním hráči na rozhodnutí, nový o vlastním nevznikne, tip na trh ano", () => {
    const rumours = run(world({ ownPending: true }), 2000, true);
    expect(rumours.length).toBeGreaterThan(0);
    expect(rumours.every((r) => r.subject === "foreign")).toBe(true);
  });

  it("o hráči, o kterém se nedávno mluvilo, se nemluví znovu (ani spleteně jako zdroj)", () => {
    const w = world({ recentPlayers: new Set(["own-mid", "own-fwd", "rival-gk", "rival-mid"]) });
    expect(run(w, 2000, true)).toHaveLength(0);
  });
});

describe("texty pro hráče", () => {
  it("SMS o vlastním hráči nabízí obě možnosti slovy, bez čísel a dlouhé pomlčky", () => {
    const own = run(world(), 3000, true).find((r) => r.subject === "own")!;
    const sms = rumourSms(own);
    expect(sms).toContain(own.playerName);
    expect(sms).toMatch(/Zpravodaj/);
    expect(sms).toMatch(/promluv/);
    expect(sms).not.toMatch(/[—–]/);
    expect(sms).not.toMatch(/\d/);
  });

  it("tip na cizího hráče je bez otázky a s pozicí slovy", () => {
    const tip = run(world(), 3000, true).find((r) => r.subject === "foreign")!;
    const sms = rumourSms(tip);
    expect(sms).toContain("Tip od výčepu");
    expect(sms).toMatch(/brankář|obránce|záložník|útočník/);
    expect(sms).not.toMatch(/\?/);
    expect(sms).not.toMatch(/[—–]/);
  });

  it("článek do Zpravodaje jmenuje hráče, jeho klub i zájemce, bez dlouhé pomlčky a čísel", () => {
    for (let seed = 1; seed < 40; seed++) {
      const a = rumourArticle({ kind: seed % 2 ? "scout" : "ai_interest", playerName: "Josef Novák", clubName: "SK Vimperk", teamName: "Jiskra Husinec" }, createRng(seed));
      expect(a.headline).toContain("Josef Novák");
      expect(`${a.headline} ${a.body}`).not.toMatch(/hráč(e|i|em) Josef Novák/);
      expect(`${a.headline} ${a.body}`).toContain("SK Vimperk");
      expect(a.body).toContain("Jiskra Husinec");
      expect(`${a.headline} ${a.body}`).not.toMatch(/[—–]|\d/);
    }
  });
});

describe("odpověď hospodskému volným textem", () => {
  const cases: Array<[string, "publish" | "calm" | null]> = [
    ["pusť to do novin", "publish"],
    ["Klidně to řekni tomu chlápkovi ze zpravodeje, ať cena roste, stejně za nás moc nehraje", "publish"],
    ["jo dej to do novyn kurva, ať to ví celej okres", "publish"],
    ["Nepouštěj to nikam prosimtě, s Pepou si promluvim sám zítra po tréninku", "calm"],
    ["do prdele, nikomu to neříkej, uklidnim ho", "calm"],
    ["nech to bejt, zavolám mu a vysvětlim mu to", "calm"],
    ["Hele radši to nedávej do zpravodaje, já ho znám, rozhodilo by ho to", "calm"],
    ["mlč jak hrob", "calm"],
    ["a kolik stojí to pivo?", null],
    ["", null],
  ];
  for (const [text, expected] of cases) {
    it(`„${text}“ → ${expected ?? "nejasné"}`, () => {
      expect(classifyRumourReply(text)).toBe(expected);
    });
  }
});

describe("dopady na trhu a v kabině", () => {
  it("uklidněný hráč se po odmítnuté nabídce zlobí míň, ale jen u klubu, kde ho uklidnili, a jen do data", () => {
    const lc = { rumourCalm: { until: "2026-12-20", teamId: "home" } };
    expect(rumourCalmMultiplier(lc, "2026-12-01", "home")).toBe(1 - RUMOUR_CALM_UNREST_CUT);
    expect(rumourCalmMultiplier(lc, "2026-12-20", "home")).toBe(1 - RUMOUR_CALM_UNREST_CUT);
    expect(rumourCalmMultiplier(lc, "2026-12-21", "home")).toBe(1);
    expect(rumourCalmMultiplier(lc, "2026-12-01", "jinde")).toBe(1);
    expect(rumourCalmMultiplier({}, "2026-12-01", "home")).toBe(1);
    expect(rumourCalmMultiplier(null, "2026-12-01", "home")).toBe(1);
    expect(rumourCalmMultiplier({ rumourCalm: "rozbité" }, "2026-12-01", "home")).toBe(1);
  });

  it("drb v novinách zvedne cenu hráče jen do data", () => {
    const hype = { until: "2026-12-10", pct: RUMOUR_HYPE_PCT };
    expect(rumourHypeMultiplier(hype, "2026-12-01")).toBeCloseTo(1 + RUMOUR_HYPE_PCT);
    expect(rumourHypeMultiplier(hype, "2026-12-11")).toBe(1);
    expect(rumourHypeMultiplier(null, "2026-12-01")).toBe(1);
    // Rozbitá nebo přehnaná data cenu nevyženou.
    expect(rumourHypeMultiplier({ until: "2026-12-10", pct: 5 }, "2026-12-01")).toBeCloseTo(1 + RUMOUR_HYPE_PCT);
    expect(rumourHypeMultiplier({ until: 7, pct: "x" }, "2026-12-01")).toBe(1);
  });
});
