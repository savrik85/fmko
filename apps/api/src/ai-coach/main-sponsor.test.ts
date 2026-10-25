import { describe, expect, it } from "vitest";
import { optionCheckOrder, rankSponsorCandidates, type SponsorCandidate } from "./main-sponsor";
import {
  mainSponsorSchema, NO_SPONSOR_CHOICE, renderMainSponsorPrompt, validateMainSponsorChoice,
  type MainSponsorContext, type MainSponsorOption,
} from "./main-sponsor-decision";
import { generateAiProfile } from "./profile";

const firms: SponsorCandidate[] = [
  { id: 1, name: "Malá firma, má klub ráda", monthlyMax: 5_000, favor: 90 },
  { id: 2, name: "Velká firma, chladná", monthlyMax: 40_000, favor: 30 },
  { id: 3, name: "Střední firma", monthlyMax: 15_000, favor: 50 },
];

describe("hlavní sponzor AI klubu", () => {
  it("ambiciózní trenér jde nejdřív za největšími penězi", () => {
    const profile = { ...generateAiProfile("team-a", null), ambition: 95 };
    expect(rankSponsorCandidates(firms, profile)[0].id).toBe(2);
  });

  it("málo ambiciózní trenér jde nejdřív za firmou, která klub má ráda", () => {
    const profile = { ...generateAiProfile("team-b", null), ambition: 5 };
    expect(rankSponsorCandidates(firms, profile)[0].id).toBe(1);
  });

  it("pořadí nic neztratí ani nezdvojí", () => {
    const profile = generateAiProfile("team-c", null);
    const ranked = rankSponsorCandidates(firms, profile);
    expect(ranked.map((f) => f.id).sort()).toEqual([1, 2, 3]);
  });
});

describe("pořadí ověřování firem pro model", () => {
  const rule = [{ id: 3 }, { id: 1 }, { id: 2 }];
  const money = [{ id: 2 }, { id: 3 }, { id: 1 }];
  const favour = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it("střídá pravidlo, peníze a náklonnost bez opakování", () => {
    expect(optionCheckOrder([rule, money, favour], null).map((f) => f.id)).toEqual([3, 2, 1]);
  });

  it("dosavadní hlavní sponzor jde první, neznámé id se přeskočí", () => {
    expect(optionCheckOrder([rule, money, favour], 2).map((f) => f.id)).toEqual([2, 3, 1]);
    expect(optionCheckOrder([rule, money, favour], 99).map((f) => f.id)).toEqual([3, 2, 1]);
  });

  it("prázdné seznamy nic nedají", () => {
    expect(optionCheckOrder<{ id: number }>([[], []], null)).toEqual([]);
  });
});

const OPTIONS: MainSponsorOption[] = [
  {
    key: "F1", sponsorId: 11, name: "Pivovar Testov", type: "brewery", ownerPersonality: "businessman", favor: 40,
    monthlyLow: 12_000, monthlyHigh: 18_000, monthlyCap: 30_000, renewal: false,
  },
  {
    key: "F2", sponsorId: 12, name: "Pekárna Kubát", type: "bakery", ownerPersonality: "patriot", favor: 85,
    monthlyLow: 4_000, monthlyHigh: 4_500, monthlyCap: 8_000, renewal: true,
  },
];

function context(over: Partial<MainSponsorContext> = {}): MainSponsorContext {
  return {
    teamName: "Sokol Testov", profile: generateAiProfile("team-d", null), budget: 80_000, reputation: 45,
    league: { position: 3, teams: 14, points: 20, played: 10 }, weeklyRunningCost: 9_000, weeklyIncome: 7_000,
    options: OPTIONS,
    ...over,
  };
}

describe("výběr hlavního sponzora modelem", () => {
  it("platná volba klíčem nebo přesným názvem firmy", () => {
    expect(validateMainSponsorChoice({ choice: "F2", reason: "  likes us " }, context())).toEqual({ key: "F2", sponsorId: 12, reason: "likes us" });
    expect(validateMainSponsorChoice({ choice: "f1", reason: "money" }, context())?.sponsorId).toBe(11);
    expect(validateMainSponsorChoice({ choice: "pivovar testov", reason: "" }, context())?.sponsorId).toBe(11);
  });

  it("„none“ znamená tento týden nikoho", () => {
    expect(validateMainSponsorChoice({ choice: "none", reason: "wait" }, context())).toEqual({ key: NO_SPONSOR_CHOICE, sponsorId: null, reason: "wait" });
  });

  it("firma mimo nabídku nebo nesmysl je neplatná odpověď", () => {
    expect(validateMainSponsorChoice({ choice: "F3", reason: "x" }, context())).toBeNull();
    expect(validateMainSponsorChoice({ choice: "Velká firma", reason: "x" }, context())).toBeNull();
    expect(validateMainSponsorChoice({ choice: 1, reason: "x" }, context())).toBeNull();
    expect(validateMainSponsorChoice({ reason: "x" }, context())).toBeNull();
    expect(validateMainSponsorChoice(["F1"], context())).toBeNull();
    expect(validateMainSponsorChoice(null, context())).toBeNull();
  });

  it("schéma nabízí jen klíče firem a „none“", () => {
    const schema = mainSponsorSchema(context()) as { properties: { choice: { enum: string[] } }; required: string[] };
    expect(schema.properties.choice.enum).toEqual(["F1", "F2", "none"]);
    expect(schema.required).toEqual(["choice", "reason"]);
    // I bez firem enum prázdný není (Workers AI by schéma odmítlo).
    const empty = mainSponsorSchema(context({ options: [] })) as { properties: { choice: { enum: string[] } } };
    expect(empty.properties.choice.enum).toEqual(["none"]);
  });

  it("popis pro model: firmy s klíči, majitel, náklonnost, peníze, prodloužení a možnost nikoho", () => {
    const prompt = renderMainSponsorPrompt(context());
    expect(prompt).toContain('"F1": Pivovar Testov, brewery; owner: a businessman');
    expect(prompt).toContain("favour 85/100 (loves your club)");
    expect(prompt).toContain("about 12,000 CZK to 18,000 CZK a month without promises, up to 30,000 CZK a month with promises");
    expect(prompt).toContain("your previous main sponsor, renewing keeps the club name");
    expect(prompt).toContain("table position 3/14, 20 pts after 10 matches");
    expect(prompt).toContain("Weekly running costs about 9,000 CZK, weekly income about 7,000 CZK");
    expect(prompt).toContain('"none"');
    expect(prompt.split("\n").filter((l) => l.startsWith('- "F'))).toHaveLength(2);
  });

  it("bez tabulky a financí z pondělní správy popis jen vynechá", () => {
    const prompt = renderMainSponsorPrompt(context({ league: null, weeklyRunningCost: null, weeklyIncome: null }));
    expect(prompt).toContain("CLUB Sokol Testov: reputation 45/100.");
    expect(prompt).toContain("MONEY: budget 80,000 CZK.");
    expect(prompt).not.toContain("Weekly running costs");
  });
});
