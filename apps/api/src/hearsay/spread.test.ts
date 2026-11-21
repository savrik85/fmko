/**
 * Šíření po vazbách (spec část 2, plán Task 7): čistý krok, deterministický podle hodiny.
 */
import { describe, expect, it } from "vitest";
import { spreadStep, type SpreadInput, type SpreadPlayer, type SpreadTie } from "./spread";
import type { HearsayItem, HearsayKind, HearsayKnowledge } from "./types";

const CREATED = "2026-11-20T10:00:00.000Z";
const avg: Omit<SpreadPlayer, "id"> = { temper: 50, discipline: 50, leadership: 30 };

function item(kind: HearsayKind, id = "i1"): HearsayItem {
  return {
    id, clubTeamId: "club", subjectPlayerId: "x", kind, origin: "coach_sms", recipientPlayerId: "a",
    conversationId: null, quote: "věta", createdAt: CREATED, expiresAt: "2026-12-11T10:00:00.000Z",
  };
}
const knows = (hearsayId: string, playerId: string): HearsayKnowledge => ({
  hearsayId, playerId, via: "direct", fromPlayerId: null, learnedAt: CREATED, messageState: "none", messagedAt: null,
});
/** Hodina uvnitř sedmidenního okna šíření; různé vzorky se liší id věci, ne časem. */
const HOUR = "2026-11-21T10";
const hour = (i: number) => new Date(Date.parse("2026-11-21T00:00:00Z") + (i % 100) * 3_600_000).toISOString().slice(0, 13);

function input(o: { kind: HearsayKind; ties: SpreadTie[]; players?: SpreadPlayer[]; knowers?: string[]; hourKey: string; pub?: string[]; itemId?: string }): SpreadInput {
  const it = item(o.kind, o.itemId);
  return {
    items: [it],
    knowledge: (o.knowers ?? ["a"]).map((p) => knows(it.id, p)),
    players: o.players ?? [{ id: "a", ...avg }, { id: "x", ...avg }],
    ties: o.ties,
    pubPairs: new Set(o.pub ?? []),
    hourKey: o.hourKey,
  };
}

/** Kolikrát z `n` hodin se dotčený `x` dozvěděl od `a`. */
function reached(kind: HearsayKind, ties: SpreadTie[], n = 3000): number {
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (spreadStep(input({ kind, ties, hourKey: HOUR, itemId: `i${i}` })).some((k) => k.playerId === "x")) count++;
  }
  return count;
}

describe("šíření po vazbách", () => {
  it("bratr předá kritiku dotčenému častěji než kolega", () => {
    const brother = reached("criticism", [{ a: "a", b: "x", type: "brothers", strength: 50 }]);
    const coworker = reached("criticism", [{ a: "a", b: "x", type: "coworkers", strength: 50 }]);
    expect(brother).toBeGreaterThan(2 * coworker);
    expect(coworker).toBeGreaterThan(0);
  });

  it("pochvala a kritika po stejné vazbě stejně často", () => {
    const tie = [{ a: "a", b: "x", type: "drinking_buddies", strength: 60 }];
    const praise = reached("praise", tie);
    const criticism = reached("criticism", tie);
    expect(Math.abs(praise - criticism)).toBeLessThan(0.1 * criticism);
  });

  it("rival nese kritiku, pochvalu skoro ne", () => {
    const tie = [{ a: "a", b: "x", type: "rivals", strength: 50 }];
    expect(reached("criticism", tie)).toBeGreaterThan(5 * reached("praise", tie));
  });

  it("bez vazby se to dozví jen občas, jako spoluhráč", () => {
    const k = (i: number) => spreadStep(input({ kind: "criticism", ties: [], hourKey: HOUR, itemId: `i${i}` })).find((r) => r.playerId === "x");
    const hits = Array.from({ length: 3000 }, (_, i) => k(i)).filter(Boolean);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((r) => r!.via === "teammate" && r!.fromPlayerId === "a")).toBe(true);
  });

  it("dotčený o sobě nešíří", () => {
    for (let i = 0; i < 500; i++) {
      const out = spreadStep(input({
        kind: "criticism", knowers: ["x"], hourKey: hour(i),
        ties: [{ a: "x", b: "a", type: "brothers", strength: 100 }],
      }));
      expect(out).toEqual([]);
    }
  });

  it("hráč mimo kádr se nedozví ani nešíří", () => {
    for (let i = 0; i < 500; i++) {
      // „x“ už v kádru není (odešel, hostuje jinde): nedozví se.
      expect(spreadStep(input({ kind: "criticism", hourKey: hour(i), players: [{ id: "a", ...avg }], ties: [{ a: "a", b: "x", type: "brothers", strength: 100 }] }))).toEqual([]);
      // „a“ odešel: co ví, už nikomu v kádru neřekne.
      expect(spreadStep(input({ kind: "criticism", hourKey: hour(i), players: [{ id: "x", ...avg }, { id: "b", ...avg }], ties: [{ a: "a", b: "x", type: "brothers", strength: 100 }] }))).toEqual([]);
    }
  });

  it("deterministické pro stejný hourKey", () => {
    const i1 = input({ kind: "praise", ties: [{ a: "a", b: "x", type: "brothers", strength: 90 }], hourKey: hour(7), pub: ["a|x"] });
    expect(spreadStep(i1)).toEqual(spreadStep(i1));
  });

  it("nejvýš tři noví na věc a běh", () => {
    const many: SpreadPlayer[] = [{ id: "a", temper: 100, discipline: 0, leadership: 0 }, { id: "x", ...avg },
      ...Array.from({ length: 30 }, (_, i) => ({ id: `t${i}`, ...avg }))];
    const ties = many.filter((p) => p.id !== "a").map((p) => ({ a: "a", b: p.id, type: "brothers", strength: 100 }));
    const pub = many.filter((p) => p.id !== "a").map((p) => ["a", p.id].sort().join("|"));
    for (let i = 0; i < 20; i++) {
      const out = spreadStep(input({ kind: "decision_against", players: many, ties, pub, hourKey: hour(i) }));
      expect(out.length).toBeLessThanOrEqual(3);
      expect(new Set(out.map((r) => r.playerId)).size).toBe(out.length);
    }
  });

  it("v hospodě se to šíří víc a cesta je hospoda", () => {
    const tie = [{ a: "a", b: "x", type: "coworkers", strength: 50 }];
    const run = (pub: string[]) => Array.from({ length: 3000 }, (_, i) => spreadStep(input({ kind: "criticism", ties: tie, hourKey: HOUR, pub, itemId: `i${i}` })))
      .flat().filter((r) => r.playerId === "x");
    const withPub = run(["a|x"]);
    expect(withPub.length).toBeGreaterThan(run([]).length);
    expect(withPub.some((r) => r.via === "pub")).toBe(true);
  });

  it("stará věc se už nešíří", () => {
    const old = { ...item("criticism"), createdAt: "2026-11-01T10:00:00.000Z" };
    for (let i = 0; i < 300; i++) {
      expect(spreadStep({ ...input({ kind: "criticism", ties: [{ a: "a", b: "x", type: "brothers", strength: 100 }], hourKey: hour(i) }), items: [old] })).toEqual([]);
    }
  });
});
