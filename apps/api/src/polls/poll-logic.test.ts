import { describe, expect, it } from "vitest";
import {
  fallbackVote, matchVote, pickNominees, plainBlurb, pollSchedule, tallyBallots, type SeasonPlayer, type VoteCandidate,
} from "./poll-logic";

const sp = (playerId: string, teamId: string, avgRating: number, goals = 0): SeasonPlayer => ({
  playerId, name: `Hráč ${playerId}`, nickname: null, teamId, teamName: `Klub ${teamId}`, position: "MID", goals, assists: 0, avgRating, apps: 20,
});

describe("anketa: nominace", () => {
  it("nejvýš dva z klubu, doplní se podle sezóny", () => {
    const list = [sp("a1", "A", 8), sp("a2", "A", 7.9), sp("a3", "A", 7.8), ...Array.from({ length: 12 }, (_, i) => sp(`x${i}`, `T${i}`, 7 - i * 0.1))];
    const picked = pickNominees(list);
    expect(picked).toHaveLength(10);
    expect(picked.filter((p) => p.teamId === "A")).toHaveLength(2);
    expect(picked.map((p) => p.playerId)).not.toContain("a3");
  });

  it("výběr redaktora má přednost, neplatná id a třetí z klubu se zahodí", () => {
    const list = [sp("a1", "A", 8), sp("a2", "A", 7.9), sp("a3", "A", 5), ...Array.from({ length: 12 }, (_, i) => sp(`x${i}`, `T${i}`, 7 - i * 0.1))];
    const picked = pickNominees(list, ["x11", "a3", "nope", "a1", "a2"]);
    expect(picked[0].playerId).toBe("x11");
    expect(picked.map((p) => p.playerId)).toEqual(expect.arrayContaining(["a3", "a1"]));
    expect(picked.filter((p) => p.teamId === "A")).toHaveLength(2);
  });

  it("popisek bez modelu", () => {
    expect(plainBlurb({ goals: 12, assists: 3, apps: 22, position: "FWD" })).toBe("12 gólů, 3 asist., 22 zápasů");
    expect(plainBlurb({ goals: 2, assists: 0, apps: 3, position: "DEF" })).toBe("2 góly, 3 zápasy");
    expect(plainBlurb({ goals: 0, assists: 0, apps: 20, position: "GK" })).toBe("20 zápasů v bráně");
  });
});

const C: VoteCandidate[] = [
  { playerId: "horak", name: "Jan Horák", teamName: "SK Volary", rank: 1 },
  { playerId: "novak", name: "Josef Novák", nickname: "Pepan", teamName: "Sokol Lhenice", rank: 2 },
  { playerId: "novak2", name: "Petr Novák", teamName: "Baník Vimperk", rank: 3 },
  { playerId: "kucera", name: "Tomáš Kučera", teamName: "Jiskra Netolice", rank: 4 },
];

describe("anketa: rozpoznání hlasu", () => {
  it.each([
    ["dávám Horáka z Volar", "horak"],
    ["Hlas jde Kučerovi, kluk má sezónu jak blázen", "kucera"],
    ["jednoznačně Pepan, ten nám dal dva góly a ještě se smál", "novak"],
    ["Petra Nováka z Vimperka", "novak2"],
    ["dávám 4", "kucera"],
    ["trojka", "novak2"],
    ["hlasuju pro Horaka", "horak"],
  ])("%s → %s", (text, id) => {
    expect(matchVote(text, C)).toBe(id);
  });

  it("dva Nováci bez upřesnění = nejasné", () => {
    expect(matchVote("Nováka", C)).toBe("ambiguous");
  });

  it("nikdo ze seznamu", () => {
    expect(matchVote("nevím, všichni jsou to lemry", C)).toBeNull();
    expect(matchVote("Messi", C)).toBeNull();
  });
});

describe("anketa: sčítání", () => {
  it("kotel váží polovinu, remízu rozhodne lepší nominace", () => {
    const rows = tallyBallots([
      { voterKind: "team", voterId: "t1", playerId: "novak", weight: 1 },
      { voterKind: "fan_group", voterId: "f1", playerId: "horak", weight: 0.5 },
      { voterKind: "fan_group", voterId: "f2", playerId: "horak", weight: 0.5 },
      { voterKind: "team", voterId: "t2", playerId: null, weight: 1 },
    ], C);
    expect(rows[0]).toEqual({ playerId: "horak", points: 1, votes: 2 });
    expect(rows[1].playerId).toBe("novak");
  });
});

describe("anketa: termíny a hlasy bez modelu", () => {
  it("konec 28. 1. → nominace 4. 1., uzávěrka 27. 1.", () => {
    expect(pollSchedule("2027-01-28")).toEqual({ nominateOn: "2027-01-04", closeOn: "2027-01-27" });
  });

  it("kotel volí svého, klub nejlepšího cizího", () => {
    const cands = [{ playerId: "a", teamId: "A", rank: 1 }, { playerId: "b", teamId: "B", rank: 2 }];
    expect(fallbackVote({ kind: "fan_group", teamId: "B" }, cands)).toBe("b");
    expect(fallbackVote({ kind: "team", teamId: "A" }, cands)).toBe("b");
    expect(fallbackVote({ kind: "team", teamId: "C" }, cands)).toBe("a");
  });
});
