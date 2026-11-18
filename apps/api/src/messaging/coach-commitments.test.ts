/**
 * Sliby napsané vlastními slovy (rozbor SMS z produ 2026-11-18): co se rozpozná,
 * jak se meze hlídají a kdy je slib sestavy dodržený.
 */
import { describe, expect, it } from "vitest";
import {
  COMMITMENT_HINT_RE, commitmentPromptLines, commitmentText, lineupVerdict, parseDetection, quoteHoldsUp, raisedBy, type CommitmentMatch,
} from "./coach-commitments";

describe("předběžné síto", () => {
  it("pustí zprávy, ve kterých slib může být", () => {
    for (const t of [
      "Ahoj, zitra s tebou pocitam do sestavy. Dobre se vyspi",
      "Příště hraješ celej zápas",
      "Zkusim te na kridlo",
      "Když přijde další slušná nabídka, pustím tě",
      "Tady máš 1 000 Kč prémii",
      "Od příštího týdne ti zvedám odměny o třetinu",
    ]) expect(COMMITMENT_HINT_RE.test(t)).toBe(true);
  });

  it("obyčejný pokec model nevolá", () => {
    for (const t of ["Ahoj, jak se máš?", "Super výkon!", "Nevíš něco o té světlici?", "ok"]) expect(COMMITMENT_HINT_RE.test(t)).toBe(false);
  });
});

describe("odpověď modelu", () => {
  it("bere jen známé druhy a hlídá meze peněz", () => {
    expect(parseDetection({ kind: "start_next" }, "MID")).toEqual({ kind: "start_next" });
    expect(parseDetection({ kind: "none" }, "MID")).toBeNull();
    expect(parseDetection({ kind: "zvedni mi vztah" }, "MID")).toBeNull();
    expect(parseDetection(null, "MID")).toBeNull();
    expect(parseDetection({ kind: "bonus", amount: 1000 }, "MID")).toEqual({ kind: "bonus", amount: 1000 });
    expect(parseDetection({ kind: "bonus", amount: 50 }, "MID")).toBeNull();
    expect(parseDetection({ kind: "bonus", amount: 5_000_000 }, "MID")).toBeNull();
    expect(parseDetection({ kind: "bonus", amount: null }, "MID")).toBeNull();
  });

  it("zvýšení odměn bez procent je o třetinu, mimo meze nic", () => {
    expect(parseDetection({ kind: "wage", percent: null }, "DEF")).toEqual({ kind: "wage", percent: 33 });
    expect(parseDetection({ kind: "wage", percent: 20 }, "DEF")).toEqual({ kind: "wage", percent: 20 });
    expect(parseDetection({ kind: "wage", percent: 400 }, "DEF")).toBeNull();
  });

  it("pozice, na které hráč hraje, je slib základu", () => {
    expect(parseDetection({ kind: "position", position: "FWD" }, "MID")).toEqual({ kind: "position", position: "FWD" });
    expect(parseDetection({ kind: "position", position: "FWD" }, "FWD")).toEqual({ kind: "start_next" });
    expect(parseDetection({ kind: "position", position: "křídlo" }, "MID")).toBeNull();
  });
});

describe("pojistka citace", () => {
  // Skutečné SMS z produ, které slabší model bral za slib.
  it("podmínka, otázka ani vymyšlená citace slib nejsou", () => {
    const bet = "Dobre kdyz das ten hattrick a vyhrajem basu platím ja";
    expect(quoteHoldsUp("kdyz das ten hattrick a vyhrajem basu platím ja", bet)).toBe(false);
    expect(quoteHoldsUp("200-300 Kč za zápas?", "200-300 Kč za zápas?")).toBe(false);
    expect(quoteHoldsUp("Když budeš makat dál tvrdě tak zkusím zařídit zvýšení platu", "Když budeš makat dál tvrdě tak zkusím zařídit zvýšení platu.")).toBe(false);
    expect(quoteHoldsUp("budeš v základu", "Ahoj, jak se máš?")).toBe(false);
    expect(quoteHoldsUp("", "Příště hraješ!")).toBe(false);
  });

  it("doslovná citace sedí i bez diakritiky a s jinou interpunkcí", () => {
    expect(quoteHoldsUp("Příště hraješ", "Jak chceš. Příště hraješ. Jestli nedáš gola, platíš piva")).toBe(true);
    expect(quoteHoldsUp("zitra s tebou pocitam do sestavy", "Ahoj, zítra s tebou počítám do sestavy! 💪")).toBe(true);
    expect(parseDetection({ kind: "start_next", quote: "Příště hraješ" }, "MID", "Jak chceš. Příště hraješ.")).toEqual({ kind: "start_next" });
    expect(parseDetection({ kind: "start_next", quote: "budeš hrát" }, "MID", "Jak chceš. Příště hraješ.")).toBeNull();
  });
});

const m = (o: Partial<CommitmentMatch> = {}): CommitmentMatch => ({ teamId: "club", inSquad: true, started: true, role: "MID", minutes: 90, ...o });

describe("verdikt slibu sestavy", () => {
  it("příští zápas: začínal = dodržel, lavička = porušil, bez zápasu čeká", () => {
    expect(lineupVerdict("start_next", [m()], "club", { duePassed: false })).toBe("kept");
    expect(lineupVerdict("start_next", [m({ started: false, minutes: 20 })], "club", { duePassed: false })).toBe("broken");
    expect(lineupVerdict("start_next", [], "club", { duePassed: false })).toBe("pending");
    expect(lineupVerdict("start_next", [], "club", { duePassed: true })).toBe("expired");
  });

  it("kdo začal a brzo se zranil, slib dostal", () => {
    expect(lineupVerdict("start_next", [m({ minutes: 25 })], "club", { duePassed: false })).toBe("kept");
  });

  it("zápas jiného týmu klubu, kde hráč nebyl, se nepočítá", () => {
    const u21 = m({ teamId: "club-u21", inSquad: false, started: false, role: null, minutes: null });
    expect(lineupVerdict("start_next", [u21], "club", { duePassed: false })).toBe("pending");
    expect(lineupVerdict("start_next", [u21, m()], "club", { duePassed: false })).toBe("kept");
  });

  it("pozice: musí začít na slíbeném místě", () => {
    expect(lineupVerdict("position", [m({ role: "FWD" })], "club", { duePassed: false, position: "FWD" })).toBe("kept");
    expect(lineupVerdict("position", [m({ role: "MID" })], "club", { duePassed: false, position: "FWD" })).toBe("broken");
  });

  it("příští zápasy: 2 ze 3, po lhůtě stačí 1 z mála", () => {
    expect(lineupVerdict("start_soon", [m(), m({ started: false }), m()], "club", { duePassed: false })).toBe("kept");
    expect(lineupVerdict("start_soon", [m(), m({ started: false }), m({ started: false })], "club", { duePassed: false })).toBe("broken");
    expect(lineupVerdict("start_soon", [m()], "club", { duePassed: false })).toBe("pending");
    expect(lineupVerdict("start_soon", [m()], "club", { duePassed: true })).toBe("kept");
    expect(lineupVerdict("start_soon", [], "club", { duePassed: true })).toBe("expired");
  });
});

describe("texty", () => {
  it("slib česky bez herních čísel, peníze s částkou", () => {
    expect(commitmentText("start_next")).toBe("Místo v základu v příštím zápase");
    expect(commitmentText("position", { position: "FWD" })).toBe("Že ho v příštím zápase postaví do útoku");
    expect(commitmentText("bonus", { amount: 1500 })).toMatch(/^Prémii 1\s500 Kč$/);
    expect(raisedBy(400, 33)).toBe(532);
  });

  it("hráč ví o běžícím i porušeném slibu", () => {
    const lines = commitmentPromptLines([
      { kind: "start_next", status: "active", details: {}, madeAt: "2026-11-18T10:00:00Z", resolvedAt: null },
      { kind: "bonus", status: "broken", details: { amount: 1000 }, madeAt: "2026-11-01T10:00:00Z", resolvedAt: "2026-11-08T10:00:00Z" },
    ]);
    expect(lines[0]).toContain("slíbil: místo v základu v příštím zápase");
    expect(lines[1]).toContain("NEDODRŽEL slib: prémii 1");
    expect(commitmentPromptLines(undefined)).toEqual([]);
  });
});
