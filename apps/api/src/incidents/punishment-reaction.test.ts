/**
 * Reakce hráče na trest: postoj, co model ví a kdy jeho text nejde použít.
 * Turek (Výškovice, 13. 10.) v 5:02 napsal „Seru na to!“ a v 5:07 přišlo „Zaplatím to.
 * Zasloužil jsem si to.“
 */
import { describe, expect, it } from "vitest";
import {
  PUNISHMENT_REPLIES, deniesPunishment, punishmentInstruction, refusedIn, replyStance, type PunishmentKind, type ReplyStance,
} from "./punishment-reaction";

describe("předem napsané reakce", () => {
  it("každý trest má pokornou, vzdornou i ironickou, aspoň tři, bez dlouhé pomlčky", () => {
    for (const kind of Object.keys(PUNISHMENT_REPLIES) as PunishmentKind[]) {
      const all = Object.values(PUNISHMENT_REPLIES[kind]).flat();
      expect(all.length, kind).toBeGreaterThanOrEqual(8);
      for (const stance of ["humble", "defiant", "ironic"] as ReplyStance[]) {
        expect(PUNISHMENT_REPLIES[kind][stance].length, `${kind} ${stance}`).toBeGreaterThanOrEqual(3);
      }
      for (const t of all) {
        expect(t).not.toContain("—");
        // Předem napsaná reakce trest nikdy nepopírá.
        expect(deniesPunishment(t, kind), t).toBeNull();
      }
    }
  });
});

describe("postoj", () => {
  it("kdo před chvílí trest odmítal, vezme ho vzdorně (dobrý vztah a klidná povaha: ironicky)", () => {
    expect(refusedIn(["Trenére, jsem v práci.", "Seru na to! 😠"])).toBe(true);
    expect(refusedIn(["Já za sprchy neplatím, jasný?"])).toBe(true);
    expect(refusedIn(["Dobře, trenére."])).toBe(false);
    expect(replyStance({ relationship: 40, morale: 50, temper: 70 }, true)).toBe("defiant");
    expect(replyStance({ relationship: 70, morale: 50, temper: 30 }, true)).toBe("ironic");
  });

  it("jinak podle vztahu, nálady a povahy", () => {
    expect(replyStance({ relationship: 70, morale: 60, temper: 40 }, false)).toBe("humble");
    expect(replyStance({ relationship: 30, morale: 60, temper: 40 }, false)).toBe("defiant");
    expect(replyStance({ relationship: 50, morale: 50, temper: 80 }, false)).toBe("defiant");
    expect(replyStance({ relationship: 45, morale: 50, temper: 50 }, false)).toBe("ironic");
  });
});

describe("co model ví", () => {
  it("trest a částka, za co, odmítání v historii a zákaz popřít trest", () => {
    const text = punishmentInstruction({ kind: "srazka", amount: 776, matches: null, offence: "Poháry z vitríny", stance: "defiant", refusedRecently: true });
    expect(text).toContain("Poháry z vitríny");
    expect(text).toMatch(/srážku ze mzdy 776 Kč/);
    expect(text).toContain("že na to sereš");
    expect(text).toContain("netvrď opak");
    expect(text).not.toContain("—");
  });

  it("vyřazení na počet zápasů a odpuštění bez trestu", () => {
    expect(punishmentInstruction({ kind: "vyradit", amount: null, matches: 2, offence: "Kopnuté dveře", stance: "humble", refusedRecently: false }))
      .toContain("na 2 zápasy");
    expect(punishmentInstruction({ kind: "odpustit", amount: null, matches: null, offence: "Oslava v kabině", stance: "humble", refusedRecently: false }))
      .toContain("odpustil");
  });

  it("text, který trest popírá, se nepoužije", () => {
    expect(deniesPunishment("Nic platit nebudu, trenére.", "pokuta")).not.toBeNull();
    expect(deniesPunishment("Klidně, ale já to nezaplatím.", "srazka")).not.toBeNull();
    expect(deniesPunishment("No tak si to strhněte, radost z toho nemám.", "srazka")).toBeNull();
    expect(deniesPunishment("Díky, že jste mi to odpustil.", "odpustit")).toBeNull();
    expect(deniesPunishment("Zaplatím tu pokutu, jasně.", "odpustit")).not.toBeNull();
  });
});
