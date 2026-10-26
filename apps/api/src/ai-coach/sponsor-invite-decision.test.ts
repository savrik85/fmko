/**
 * Pozvání majitelů do VIP lóže AI klubu modelem: místa v lóži, kontrola odpovědi, schéma,
 * náhradní pravidlo podle povahy a popis pro model (bez databáze).
 */
import { describe, expect, it } from "vitest";
import { generateAiProfile, type AiCoachProfile } from "./profile";
import {
  checkInvite, fallbackInvite, guestSeats, inviteSchema, renderInvitePrompt, type InviteContext, type InviteOption,
} from "./sponsor-invite-decision";

function option(key: string, over: Partial<InviteOption> = {}): InviteOption {
  return {
    key, sponsorId: Number(key.slice(1)), name: `Firma ${key}`, type: "bakery", owner: "patriot", favor: 40, giftCost: 600,
    relation: null, contractEnding: false, mainElsewhere: false, mainMonthly: { low: 8000, high: 12000 }, ...over,
  };
}

const OPTIONS: InviteOption[] = [
  option("O1", { name: "Pivovar", type: "brewery", owner: "businessman", relation: "main", contractEnding: false, mainMonthly: { low: 20000, high: 30000 } }),
  option("O2", { name: "Pekárna", favor: 85, giftCost: 300, mainMonthly: { low: 5000, high: 7000 } }),
  option("O3", { name: "Autoservis", owner: "fan", favor: 20, giftCost: 800, mainMonthly: { low: 14000, high: 21000 } }),
  option("O4", { name: "Velkostatek", owner: "cautious", mainElsewhere: true, mainMonthly: { low: 40000, high: 60000 } }),
];

function context(profile: Partial<AiCoachProfile> = {}, over: Partial<InviteContext> = {}): InviteContext {
  return {
    teamName: "Sokol Lóžkov", profile: { ...generateAiProfile("team-box", null), ...profile }, budget: 60_000, spendable: 20_000,
    match: { matchId: "m1", day: "2026-11-05", opponentName: "Jiskra Dvůr", daysAhead: 3 },
    vipBoxLevel: 2, seats: 2, vipAcceptancePoints: 10, vipFavorBonus: 2, recentLosses: 1, options: OPTIONS, ...over,
  };
}

describe("místa v lóži", () => {
  it("bez lóže nikdo, jinak úroveň lóže minus už přijatá pozvání", () => {
    expect(guestSeats(0, 0)).toBe(0);
    expect(guestSeats(1, 0)).toBe(1);
    expect(guestSeats(2, 1)).toBe(1);
    expect(guestSeats(3, 5)).toBe(0);
  });
});

describe("kontrola odpovědi modelu", () => {
  it("nabídnutí majitelé do počtu míst a v penězích projdou, opakovaný klíč se sloučí, nikdo je taky volba", () => {
    expect(checkInvite({ invite: ["o2", "O1", "O2"], reason: " build favour " }, context()))
      .toEqual({ ok: true, decision: { keys: ["O2", "O1"], reason: "build favour" } });
    expect(checkInvite({ invite: [], reason: "save money" }, context())).toEqual({ ok: true, decision: { keys: [], reason: "save money" } });
  });

  it("neznámý majitel, víc hostů, než lóže pojme, nebo dárky nad možnosti: neplatné", () => {
    expect(checkInvite({ invite: ["O9"] }, context())).toMatchObject({ ok: false, reason: expect.stringContaining("není v nabídce") });
    expect(checkInvite({ invite: ["O1", "O2", "O3"] }, context())).toMatchObject({ ok: false, reason: "pozvaných 3, lóže pojme 2" });
    expect(checkInvite({ invite: ["O1", "O3"] }, context({}, { spendable: 1000 }))).toMatchObject({ ok: false, reason: expect.stringContaining("nad možnosti") });
    expect(checkInvite({ invite: "O1" }, context()).ok).toBe(false);
    expect(checkInvite(null, context()).ok).toBe(false);
  });

  it("schéma: klíče majitelů jako enum, nikdy prázdný", () => {
    const schema = inviteSchema(context()) as { properties: { invite: { items: { enum?: string[] } } }; required: string[] };
    expect(schema.properties.invite.items.enum).toEqual(["O1", "O2", "O3", "O4"]);
    expect(schema.required).toEqual(["invite", "reason"]);
    const empty = inviteSchema(context({}, { options: [] })) as typeof schema;
    expect(empty.properties.invite.items.enum).toBeUndefined();
  });
});

describe("náhradní pravidlo podle povahy", () => {
  it("šetrný trenér nezve nikoho", () => {
    expect(fallbackInvite(context({ thrift: 80 }))).toEqual({ keys: [], reason: "fallback" });
  });

  it("štědrý ambiciózní zaplní lóži: nejdřív vlastní hlavní sponzor, pak největší peníze; hlavní sponzor jiného klubu až nakonec", () => {
    expect(fallbackInvite(context({ thrift: 20, ambition: 80 })).keys).toEqual(["O1", "O3"]);
  });

  it("málo ambiciózní zve ty, kdo klub mají rádi; průměrně šetrný jen jednoho", () => {
    expect(fallbackInvite(context({ thrift: 20, ambition: 30 })).keys).toEqual(["O1", "O2"]);
    expect(fallbackInvite(context({ thrift: 50, ambition: 30 })).keys).toEqual(["O1"]);
  });

  it("firma, které letos končí smlouva, má přednost; dárky jen do peněz nad rezervou", () => {
    const ending = OPTIONS.map((o) => (o.key === "O2" ? { ...o, relation: "banner" as const } : o.key === "O3" ? { ...o, relation: "stadium" as const, contractEnding: true } : o));
    expect(fallbackInvite(context({ thrift: 20, ambition: 80 }, { options: ending })).keys).toEqual(["O3", "O1"]);
    expect(fallbackInvite(context({ thrift: 20, ambition: 80 }, { spendable: 700 })).keys).toEqual(["O1"]);
  });
});

describe("popis pro model", () => {
  it("zápas, lóže a místa, peníze nad rezervou, majitelé s klíči, náklonností, dárkem a vztahem ke klubu", () => {
    const prompt = renderInvitePrompt(context());
    expect(prompt).toContain("NEXT HOME MATCH: Thursday 2026-11-05 against Jiskra Dvůr, in 3 days. You lost 1 of your last 5 matches.");
    expect(prompt).toContain("YOUR VIP BOX (level 2) has room for 2 more guests at this match.");
    expect(prompt).toContain("(+10 percentage points) and gains 2 more favour after the match");
    expect(prompt).toContain("gifts may cost at most 20,000 CZK this week");
    expect(prompt).toContain('- "O1": Pivovar, brewery; owner: a businessman');
    expect(prompt).toContain("gift 600 CZK; your main sponsor");
    expect(prompt).toContain('- "O2": Pekárna, bakery; owner: a patriot');
    expect(prompt).toContain("favour 85/100 (loves your club); gift 300 CZK; no contract with you yet; could pay about 5,000 CZK to 7,000 CZK a month as your main sponsor");
    expect(prompt).toContain("Velkostatek, bakery; owner: a cautious owner");
    expect(prompt).toContain("main sponsor of another club");
    expect(prompt).toContain("Invite at most 2 owners, or nobody.");
    expect(prompt).not.toMatch(/[—–]/);
  });
});
