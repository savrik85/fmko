import { describe, expect, it } from "vitest";
import { rankSponsorCandidates, type SponsorCandidate } from "./main-sponsor";
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
