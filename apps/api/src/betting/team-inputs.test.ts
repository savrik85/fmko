import { describe, it, expect } from "vitest";
import { clubHomeAdvantage, lineupStrength, pickedPlayerIds, DEFAULT_STRENGTH, type SquadPlayer } from "./team-inputs";
import { matchHomeAdvantage, MATCH_HOME_ADVANTAGE } from "../season/fanbase-helpers";

/** Kádr: jedenáct hráčů s ratingem 50 a pět náhradníků s ratingem 30. */
function squad(overrides: Record<string, Partial<SquadPlayer>> = {}): SquadPlayer[] {
  const out: SquadPlayer[] = [];
  for (let i = 0; i < 11; i++) out.push({ id: `star-${i}`, rating: 50, available: true });
  for (let i = 0; i < 5; i++) out.push({ id: `sub-${i}`, rating: 30, available: true });
  return out.map((p) => ({ ...p, ...overrides[p.id] }));
}

describe("síla jedenáctky, která nastoupí", () => {
  it("bez sestavy nastupuje nejlepších jedenáct", () => {
    expect(lineupStrength(squad(), null)).toBe(50);
  });

  it("zraněný a suspendovaný se nepočítá, nahradí ho nejlepší z lavičky", () => {
    const s = squad({ "star-0": { available: false }, "star-1": { available: false } });
    // Devět padesátek a dvě třicítky.
    expect(lineupStrength(s, null)).toBeCloseTo((9 * 50 + 2 * 30) / 11, 10);
  });

  it("uložená sestava má přednost před ratingem", () => {
    // Manažer nechal pět opor na lavičce a postavil náhradníky.
    const picked = [...Array.from({ length: 6 }, (_, i) => `star-${i}`), ...Array.from({ length: 5 }, (_, i) => `sub-${i}`)];
    expect(lineupStrength(squad(), picked)).toBeCloseTo((6 * 50 + 5 * 30) / 11, 10);
  });

  it("díru po zraněném ze sestavy doplní nejlepší dostupný, stejně jako engine", () => {
    const picked = [...Array.from({ length: 6 }, (_, i) => `star-${i}`), ...Array.from({ length: 5 }, (_, i) => `sub-${i}`)];
    const s = squad({ "sub-0": { available: false } });
    // Místo zraněného náhradníka nastoupí jedna z opor, které zůstaly mimo sestavu.
    expect(lineupStrength(s, picked)).toBeCloseTo((7 * 50 + 4 * 30) / 11, 10);
  });

  it("sestava s víc než jedenácti jmény nebo s duplicitou nepřidá dvanáctého", () => {
    const picked = ["star-0", "star-0", ...Array.from({ length: 12 }, (_, i) => `sub-${i % 5}`), "star-1", "star-2", "star-3", "star-4", "star-5", "star-6"];
    // star-0, pět náhradníků a pět dalších opor = jedenáct.
    expect(lineupStrength(squad(), picked)).toBeCloseTo((6 * 50 + 5 * 30) / 11, 10);
  });

  it("míň než jedenáct zdravých: průměr těch, kdo jsou", () => {
    const s: SquadPlayer[] = [{ id: "a", rating: 40, available: true }, { id: "b", rating: 20, available: true }, { id: "c", rating: 90, available: false }];
    expect(lineupStrength(s, null)).toBe(30);
  });

  it("prázdný kádr nebo samí zranění dají výchozí sílu", () => {
    expect(lineupStrength([], null)).toBe(DEFAULT_STRENGTH);
    expect(lineupStrength([{ id: "a", rating: 80, available: false }], ["a"])).toBe(DEFAULT_STRENGTH);
  });

  it("uložená sestava se čte z players_data, nečitelná se ignoruje", () => {
    expect(pickedPlayerIds(JSON.stringify([{ playerId: "a", matchPosition: "GK" }, { playerId: "b" }]))).toEqual(["a", "b"]);
    expect(pickedPlayerIds(null)).toBeNull();
    expect(pickedPlayerIds("")).toBeNull();
    expect(pickedPlayerIds("{nesmysl")).toBeNull();
    expect(pickedPlayerIds(JSON.stringify({ playerId: "a" }))).toBeNull();
    expect(pickedPlayerIds("[]")).toBeNull();
  });
});

describe("domácí výhoda zápasu, jeden vzorec pro engine i kancelář", () => {
  it("bez fanoušků a kotle zbyde základ", () => {
    expect(matchHomeAdvantage({ fanbaseTotal: 0, noiseBonus: 0, ultrasAdvantage: 0 })).toBe(MATCH_HOME_ADVANTAGE.base);
  });

  it("fanoušci přidají nejvýš tři setiny, prázdné hřiště ubere nejvýš jednu", () => {
    expect(matchHomeAdvantage({ fanbaseTotal: 2, noiseBonus: 0, ultrasAdvantage: 0 })).toBeCloseTo(0.07, 10);
    expect(matchHomeAdvantage({ fanbaseTotal: 50, noiseBonus: 1, ultrasAdvantage: 0 })).toBeCloseTo(0.08, 10);
    expect(matchHomeAdvantage({ fanbaseTotal: -5, noiseBonus: -1, ultrasAdvantage: 0 })).toBeCloseTo(0.04, 10);
  });

  it("sektor kotle se přičítá a celek drží strop", () => {
    expect(matchHomeAdvantage({ fanbaseTotal: 50, noiseBonus: 0, ultrasAdvantage: 0.05 })).toBeCloseTo(0.13, 10);
    expect(matchHomeAdvantage({ fanbaseTotal: 50, noiseBonus: 0, ultrasAdvantage: 0.5 })).toBe(MATCH_HOME_ADVANTAGE.max);
    expect(matchHomeAdvantage({ fanbaseTotal: -50, noiseBonus: 0, ultrasAdvantage: -0.5 })).toBe(MATCH_HOME_ADVANTAGE.min);
  });
});

describe("klubová výhoda domácích pro kurzy", () => {
  const noFans = { hardcore: 0, regular: 0, casual: 0 };

  it("klub bez stadionu, fanoušků a part má základ", () => {
    expect(clubHomeAdvantage({ fanbase: noFans, stadium: null, groups: [], recentAttendance: null })).toBe(MATCH_HOME_ADVANTAGE.base);
  });

  it("tvrdé jádro zvedá výhodu, 0,04 bodu za hlavu", () => {
    // 50 skalních = 2 body = +0,02.
    const ha = clubHomeAdvantage({ fanbase: { hardcore: 50, regular: 0, casual: 0 }, stadium: { capacity: 200 }, groups: [], recentAttendance: 100 });
    expect(ha).toBeCloseTo(0.07, 10);
  });

  it("sektor kotle třetí úrovně přidá pět setin, kotel přestěhovaný za bránu nic", () => {
    const stadium = { capacity: 300, ultras_stand: 3 };
    const ultras = { kind: "kotel", size: 40, mood: 50, passion: 50, spending: 50, noise: 42, sector: "kotel", closed_matches: 0, ticket_discount: 0 };
    const withUltras = clubHomeAdvantage({ fanbase: noFans, stadium, groups: [ultras], recentAttendance: 150 });
    const moved = clubHomeAdvantage({ fanbase: noFans, stadium, groups: [{ ...ultras, sector: "za_branou" }], recentAttendance: 150 });
    const closed = clubHomeAdvantage({ fanbase: noFans, stadium, groups: [{ ...ultras, closed_matches: 2 }], recentAttendance: 150 });
    expect(withUltras - moved).toBeGreaterThan(0.04);
    expect(withUltras).toBeGreaterThan(closed);
  });

  it("vyprodáno přidá bod, prázdno půl bodu ubere, bez odehraného zápasu nic", () => {
    const base = { fanbase: noFans, stadium: { capacity: 200 }, groups: [] };
    const unknown = clubHomeAdvantage({ ...base, recentAttendance: null });
    expect(clubHomeAdvantage({ ...base, recentAttendance: 190 }) - unknown).toBeCloseTo(0.01, 10);
    expect(clubHomeAdvantage({ ...base, recentAttendance: 20 }) - unknown).toBeCloseTo(-0.005, 10);
  });
});
