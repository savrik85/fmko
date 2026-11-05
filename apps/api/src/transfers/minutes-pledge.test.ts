/**
 * Slib místa v sestavě se posuzuje podle zápasů hráče za klub, který ho dal.
 *
 * Případ ze Spůle (2026-11-05): Kratochvíl dostal slib 26. 10., hrál 90 minut za U21
 * a 90 minut za áčko, 2. 11. odešel na hostování do Agrokomplexu. Hra pak vzala tři
 * zápasy Agrokomplexu (dva ještě bez něj) a poslala „A já zase sedím. Tohle nemá cenu."
 */
import { describe, it, expect } from "vitest";
import { minutesPledgeVerdict, type PledgeMatch } from "./offer-rejection-impact";

const played = (teamId: string, minutes = 90): PledgeMatch => ({ teamId, inSquad: true, minutes });
const notThere = (teamId: string): PledgeMatch => ({ teamId, inSquad: false, minutes: null });
const benched = (teamId: string): PledgeMatch => ({ teamId, inSquad: true, minutes: null });

describe("slib místa v sestavě", () => {
  it("Kratochvíl na hostování: dva celé zápasy za klub = slib dodržel", () => {
    const matches = [played("spule-u21"), played("spule"), notThere("spule-u21")];
    expect(minutesPledgeVerdict(matches, "agrokomplex", { deadlinePassed: false, final: true })).toBe("kept");
  });

  it("na hostování bez zápasu za klub se nemá co posoudit", () => {
    expect(minutesPledgeVerdict([notThere("spule"), notThere("spule-u21")], "agrokomplex", { deadlinePassed: false, final: true })).toBe("void");
  });

  it("zápasy týmu klubu, ve kterém hráč není, se nepočítají", () => {
    // Hráč v áčku, U21 hraje bez něj: čekají se tři zápasy áčka.
    const matches = [played("spule"), notThere("spule-u21"), notThere("spule-u21")];
    expect(minutesPledgeVerdict(matches, "spule", { deadlinePassed: false, final: false })).toBe("pending");
  });

  it("trenér hráče v jeho týmu nepostavil: zápas se počítá a slib je porušený", () => {
    const matches = [notThere("spule"), benched("spule"), played("spule")];
    expect(minutesPledgeVerdict(matches, "spule", { deadlinePassed: false, final: false })).toBe("broken");
  });

  it("dva starty ze tří stačí, i když hráč mezitím přešel z U21 do áčka", () => {
    const matches = [played("spule-u21"), benched("spule"), played("spule")];
    expect(minutesPledgeVerdict(matches, "spule", { deadlinePassed: false, final: false })).toBe("kept");
  });

  it("start je až od 45 minut", () => {
    const matches = [played("spule", 30), played("spule", 44), played("spule", 90)];
    expect(minutesPledgeVerdict(matches, "spule", { deadlinePassed: false, final: false })).toBe("broken");
  });

  it("po termínu bez zápasu slib platí jako dodržený, s jedním zápasem stačí jeden start", () => {
    expect(minutesPledgeVerdict([], "spule", { deadlinePassed: true, final: false })).toBe("kept");
    expect(minutesPledgeVerdict([played("spule")], "spule", { deadlinePassed: true, final: false })).toBe("kept");
    expect(minutesPledgeVerdict([benched("spule")], "spule", { deadlinePassed: true, final: false })).toBe("broken");
  });
});
