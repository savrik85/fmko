import { describe, expect, it } from "vitest";
import { loadMatchLook, playerLook } from "./match-look";

type TeamRow = {
  id: string;
  primary_color: string | null;
  secondary_color?: string | null;
  home_shorts_color?: string | null;
  home_socks_color?: string | null;
  away_primary_color?: string | null;
  away_shorts_color?: string | null;
  away_socks_color?: string | null;
};
type PlayerRow = { id: string; avatar: string | null; physical: string | null };

/** Malá náhrada D1: tabulky teams a players v paměti, filtr podle id z bind(). */
function fakeDb(teams: TeamRow[], players: PlayerRow[] = []): D1Database {
  return {
    prepare: (sql: string) => ({
      bind: (...ids: string[]) => ({
        all: async () => {
          const source: Array<{ id: string }> = sql.includes("FROM teams")
            ? teams.map((t) => ({
                secondary_color: null, home_shorts_color: null, home_socks_color: null,
                away_primary_color: null, away_shorts_color: null, away_socks_color: null, ...t,
              }))
            : players;
          return { results: source.filter((r) => ids.includes(r.id)) };
        },
      }),
    }),
  } as unknown as D1Database;
}

const HOME: TeamRow = { id: "h", primary_color: "#1E5AA8", home_shorts_color: "#FFFFFF" };

async function kitsFor(away: TeamRow, home: TeamRow = HOME) {
  return loadMatchLook(fakeDb([home, away]), { teamId: home.id }, { teamId: away.id }, null, null);
}

describe("vzhled hráče pro 3D záznam", () => {
  it("bere pleť a vlasy z obličeje a výšku z fyzických údajů", () => {
    const avatar = { body: { color: "#e8c4a0" }, hair: { id: "crop-fade2", color: "#1a1a1a" } };
    const look = playerLook({ avatar: JSON.stringify(avatar), physical: JSON.stringify({ height: 182 }) });
    expect(look).toEqual({ avatar, skinColor: "#e8c4a0", hairColor: "#1a1a1a", height: 182 });
  });

  it("hráč bez obličeje a fyzických údajů nemá nic", () => {
    expect(playerLook({ avatar: null, physical: null })).toEqual({});
  });
});

describe("dresy v zápase", () => {
  it("domácí v domácí sadě, hosté v uložené venkovní, když se liší", async () => {
    const kits = await kitsFor({
      id: "a", primary_color: "#D94032", away_primary_color: "#F2C200", away_shorts_color: "#222222",
    });
    expect(kits).toEqual({
      home_kit: { shirt: "#1E5AA8", shorts: "#FFFFFF", socks: "#1E5AA8" },
      away_kit: { shirt: "#F2C200", shorts: "#222222", socks: "#F2C200" },
    });
  });

  it("venkovní sada podobná domácím → hosté v domácí sadě", async () => {
    const kits = await kitsFor({
      id: "a", primary_color: "#D94032", home_shorts_color: "#000000", away_primary_color: "#2060B0",
    });
    expect(kits.away_kit).toEqual({ shirt: "#D94032", shorts: "#000000", socks: "#D94032" });
  });

  it("domácí sada hostů podobná domácím → sekundární barva", async () => {
    const kits = await kitsFor({ id: "a", primary_color: "#1A50A0", secondary_color: "#F2C200" });
    expect(kits.away_kit).toEqual({ shirt: "#F2C200", shorts: "#F2C200", socks: "#F2C200" });
  });

  it("všechno podobné → bílá", async () => {
    const kits = await kitsFor({ id: "a", primary_color: "#1A50A0", secondary_color: "#2266BB", away_primary_color: "#1E5AA8" });
    expect(kits.away_kit.shirt).toBe("#FFFFFF");
  });

  it("domácí v bílém a hosté v podobných barvách → černá", async () => {
    const kits = await kitsFor(
      { id: "a", primary_color: "#F0F0F0", secondary_color: "#EEEEEE" },
      { id: "h", primary_color: "#FFFFFF" },
    );
    expect(kits.away_kit.shirt).toBe("#111111");
  });

  it("nevyplněné barvy → výchozí zelená a červená", async () => {
    const kits = await kitsFor({ id: "a", primary_color: null }, { id: "h", primary_color: null });
    expect(kits).toEqual({
      home_kit: { shirt: "#2D5F2D", shorts: "#2D5F2D", socks: "#2D5F2D" },
      away_kit: { shirt: "#D94032", shorts: "#D94032", socks: "#D94032" },
    });
  });

  it("pohárový klub bez řádku v teams hraje v barvě z cup_teams", async () => {
    const kits = await loadMatchLook(fakeDb([HOME]), { teamId: "h" }, { teamId: null, fallbackColor: "#7A1F5C" }, null, null);
    expect(kits.away_kit).toEqual({ shirt: "#7A1F5C", shorts: "#7A1F5C", socks: "#7A1F5C" });
  });
});

describe("vzhled hráčů v sestavách", () => {
  const avatar = (hairId: string) => JSON.stringify({ body: { color: "#e8c4a0" }, hair: { id: hairId, color: "#1a1a1a" } });

  it("doplní vzhled nalezeným hráčům, nenalezené nechá být, holá hlava nemá vlasy", async () => {
    const db = fakeDb([HOME], [
      { id: "p1", avatar: avatar("crop-fade2"), physical: JSON.stringify({ height: 182 }) },
      { id: "p2", avatar: avatar("short-bald"), physical: null },
    ]);
    const homeLineup = { starters: [{ id: "p1" }], subs: [{ id: "p2" }] };
    const awayLineup = { starters: [{ id: "ghost" }], subs: [] };
    await loadMatchLook(db, { teamId: "h" }, { teamId: null }, homeLineup, awayLineup);
    expect(homeLineup.starters[0]).toEqual({ id: "p1", avatar: JSON.parse(avatar("crop-fade2")), skinColor: "#e8c4a0", hairColor: "#1a1a1a", height: 182 });
    expect(homeLineup.subs[0]).toEqual({ id: "p2", avatar: JSON.parse(avatar("short-bald")), skinColor: "#e8c4a0", hairColor: null });
    expect(awayLineup.starters[0]).toEqual({ id: "ghost" });
  });

  it("nečitelný JSON vzhledu je chyba", async () => {
    const db = fakeDb([], [{ id: "bad", avatar: "{nope", physical: null }]);
    await expect(loadMatchLook(db, { teamId: null }, { teamId: null }, { starters: [{ id: "bad" }], subs: [] }, null)).rejects.toThrow(SyntaxError);
  });
});
