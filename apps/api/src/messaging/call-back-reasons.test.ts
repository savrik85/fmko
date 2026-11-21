/**
 * Zavolat zpátky (F9): proč hráč volal a co řekne, když AI nejede.
 *
 * Důvod musí sedět na skutečný stav hráče. Kdyby zraněný hráč v hlasovce chtěl hrát
 * a spokojený nadával, zpětný hovor by byl jen šum.
 */
import { describe, expect, it } from "vitest";
import { getScenarioById, type PlayerSnapshot } from "./ai-player-scenarios";
import {
  CALL_BACK_SCENARIOS, callBackScenario, isCallableCaller, leaderCallBackText, pickCallBackReason,
  playerFallbackText, sponsorCallBackText, type CallBackReason,
} from "./call-back-reasons";

const BASE: PlayerSnapshot = {
  id: "p-1", firstName: "Franta", lastName: "Novák", age: 27, position: "MID",
  morale: 60, condition: 90, coachRelationship: 55,
  discipline: 50, patriotism: 50, alcohol: 30, temper: 40, leadership: 30, workRate: 50, aggression: 40,
  recentMinutes: 300, recentRatingAvg: 6.8, isCelebrity: false,
  lastMatchSquad: "played", injury: null,
};
const SOBER = { situation: "volno" as const, drinksAt: null };
const reason = (p: Partial<PlayerSnapshot>, now: Parameters<typeof pickCallBackReason>[1] = SOBER) =>
  pickCallBackReason({ ...BASE, ...p }, now);

describe("proč hráč volal", () => {
  it("truc po přestupu je nespokojenost", () => {
    expect(reason({ transferUnrest: 60 })).toBe("unrest");
  });

  it("hodně špatná nálada je nespokojenost, i když nechce odejít", () => {
    expect(reason({ morale: 20 })).toBe("unrest");
  });

  it("zraněný volá kvůli zranění", () => {
    expect(reason({ injury: { description: "Natažený sval", daysLeft: 6, volno: false, fake: false } })).toBe("injury");
  });

  it("kdo sedí na lavičce nebo nejel, chce hrát", () => {
    expect(reason({ lastMatchSquad: "bench" })).toBe("wants_to_play");
    expect(reason({ lastMatchSquad: "out" })).toBe("wants_to_play");
  });

  it("bez sestavy u zápasu rozhodnou minuty za poslední měsíc", () => {
    expect(reason({ lastMatchSquad: undefined, recentMinutes: 20 })).toBe("wants_to_play");
    expect(reason({ lastMatchSquad: undefined, recentMinutes: 400 })).toBe("chat");
  });

  it("hráč na osobním volnu si nestěžuje, že nehraje", () => {
    expect(reason({ lastMatchSquad: "out", injury: { description: "Svatba", daysLeft: 2, volno: true, fake: false } })).not.toBe("wants_to_play");
  });

  it("kdo zrovna pije nebo rád pije, volal kvůli hospodě", () => {
    expect(reason({}, { situation: "pije", drinksAt: "hospoda" })).toBe("pub");
    expect(reason({ alcohol: 85 })).toBe("pub");
  });

  it("spokojený hráč bez starostí volal jen tak", () => {
    expect(reason({})).toBe("chat");
  });

  it("nespokojenost má přednost před zraněním i lavičkou", () => {
    expect(reason({ transferUnrest: 70, lastMatchSquad: "bench", injury: { description: "Koleno", daysLeft: 9, volno: false, fake: false } })).toBe("unrest");
  });
});

describe("scénáře zpětného hovoru", () => {
  it("každý důvod má scénář, který najde i odpověď hráče", () => {
    const reasons: CallBackReason[] = ["unrest", "injury", "wants_to_play", "pub", "chat"];
    for (const r of reasons) {
      const s = callBackScenario(r);
      expect(getScenarioById(s.id)).toBe(s);
      // Náhodný spawn je nevylosuje, patří jen zpětnému hovoru.
      expect(s.weight(BASE)).toBe(0);
    }
    expect(CALL_BACK_SCENARIOS).toHaveLength(reasons.length);
  });
});

describe("záložní texty bez AI", () => {
  const facts = { injuryDescription: "Natažený sval", injuryDaysLeft: 5, transferTeam: "TJ Netolice", drinkingNow: false };

  it("zranění zmíní, co hráče trápí, dobu jen slovy", () => {
    const text = playerFallbackText("injury", facts, "seed-1");
    expect(text).toContain("natažený sval");
    expect(text).not.toMatch(/\d/);
  });

  it("truc po přestupu zmíní klub, kam chtěl", () => {
    expect(playerFallbackText("unrest", facts, "seed-2")).toContain("TJ Netolice");
  });

  it("hospoda se liší podle toho, jestli zrovna sedí u piva", () => {
    const now = playerFallbackText("pub", { ...facts, drinkingNow: true }, "s");
    const after = playerFallbackText("pub", { ...facts, drinkingNow: false }, "s");
    expect(now).not.toBe(after);
  });

  it("žádný text nemá dlouhou pomlčku ani číslo", () => {
    const reasons: CallBackReason[] = ["unrest", "injury", "wants_to_play", "pub", "chat"];
    const texts = [
      ...reasons.flatMap((r) => ["a", "b", "c", "d"].map((seed) => playerFallbackText(r, { ...facts, transferTeam: null }, seed))),
      ...["a", "b", "c"].flatMap((seed) => [
        sponsorCallBackText({ losingStreak: 4 }, seed), sponsorCallBackText({ losingStreak: 0 }, seed),
        leaderCallBackText({ campaign: true, heat: 80 }, seed), leaderCallBackText({ campaign: false, heat: 70 }, seed),
        leaderCallBackText({ campaign: false, heat: 10 }, seed),
      ]),
    ];
    for (const t of texts) {
      expect(t).not.toMatch(/[—–]/);
      expect(t).not.toMatch(/\d/);
      expect(t.length).toBeGreaterThan(20);
    }
  });

  it("stejný seed dá stejný text, ať opakovaný požadavek nemluví jinak", () => {
    expect(playerFallbackText("chat", facts, "x")).toBe(playerFallbackText("chat", facts, "x"));
  });

  it("sponzor po sérii proher řeší prohry, jinak ne", () => {
    expect(sponsorCallBackText({ losingStreak: 4 }, "s")).toMatch(/prohr/);
    expect(sponsorCallBackText({ losingStreak: 0 }, "s")).not.toMatch(/prohrách|proher/);
  });

  it("vůdce kotle při podpisovce mluví o podpisovce", () => {
    expect(leaderCallBackText({ campaign: true, heat: 30 }, "s")).toMatch(/podpis/i);
  });
});

describe("komu jde volat zpátky", () => {
  it("hráči, sponzorovi a vůdci kotle ano, úřadům a novinám ne", () => {
    expect(["hrac", "sponzor", "kotel"].every(isCallableCaller)).toBe(true);
    expect(["starosta", "komise", "novinar", "xyz"].some(isCallableCaller)).toBe(false);
  });
});
