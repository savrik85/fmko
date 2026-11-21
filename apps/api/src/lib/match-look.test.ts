import { describe, expect, it } from "vitest";
import { matchKits, playerLook } from "./match-look";

describe("vzhled hráče pro 3D záznam", () => {
  it("bere pleť a vlasy z obličeje a výšku z fyzických údajů", () => {
    const look = playerLook({
      avatar: JSON.stringify({ body: { color: "#e8c4a0" }, hair: { id: "crop-fade2", color: "#1a1a1a" } }),
      physical: JSON.stringify({ height: 182 }),
    });
    expect(look).toEqual({ skinColor: "#e8c4a0", hairColor: "#1a1a1a", height: 182 });
  });

  it("holá hlava nemá barvu vlasů", () => {
    const look = playerLook({ avatar: JSON.stringify({ body: { color: "#e8c4a0" }, hair: { id: "short-bald", color: "#1a1a1a" } }), physical: null });
    expect(look.hairColor).toBeNull();
  });

  it("hráč bez obličeje a fyzických údajů nemá nic", () => {
    expect(playerLook({ avatar: null, physical: null })).toEqual({});
  });
});

describe("dresy v zápase", () => {
  const home = { primary: "#1E5AA8", homeShorts: "#FFFFFF", homeSocks: null };

  it("domácí v domácí sadě, hosté v uložené venkovní", () => {
    const kits = matchKits(home, {
      primary: "#D94032", homeShorts: "#000000", homeSocks: "#000000",
      awayShirt: "#111111", awayShorts: "#222222", awaySocks: null,
    });
    expect(kits).toEqual({
      home_kit: { shirt: "#1E5AA8", shorts: "#FFFFFF", socks: "#1E5AA8" },
      away_kit: { shirt: "#111111", shorts: "#222222", socks: "#111111" },
    });
  });

  it("hosté bez uložené venkovní sady hrají v domácí", () => {
    const kits = matchKits(home, {
      primary: "#D94032", homeShorts: "#000000", homeSocks: null,
      awayShirt: null, awayShorts: "#222222", awaySocks: null,
    });
    expect(kits.away_kit).toEqual({ shirt: "#D94032", shorts: "#000000", socks: "#D94032" });
  });
});
