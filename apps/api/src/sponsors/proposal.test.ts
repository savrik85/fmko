/**
 * Validace návrhu (anti-podvrh) a katalog slibů pro klienta.
 */
import { describe, expect, it } from "vitest";
import type { NegotiationContext } from "./negotiation";
import { constructionOptions, promiseCatalog, validateProposal } from "./proposal";

const CTX: NegotiationContext = {
  category: "main", personality: "fan", wishes: ["league_position"], budgetB: 10000, season: 3, leagueTeams: 14,
  expectedPosition: 7, cupTotalRounds: 7, lastAvgAttendance: 200, reputation: 50, licenceLevel: 1,
  sponsorType: "pub", sectorBannerActive: false,
  facilities: [
    { facility: "stands", currentLevel: 1, locked: false, costs: [0, 55000, 170000, 450000] },
    { facility: "roof", currentLevel: 0, locked: true, costs: [0, 30000, 90000, 230000] },
  ],
  equipment: [{ category: "balls", currentLevel: 1, nextLevel: 2, cost: 8000, locked: false }],
  currentTerminationFee: 0,
};

const ok = (raw: unknown) => validateProposal(raw, CTX);
const demands = { monthly: 6000, winBonus: 0, signingBonus: 0, goalBonuses: {}, construction: null, equipment: null, payCurrentFee: false };

describe("validateProposal", () => {
  it("platný návrh projde a parametry se očistí", () => {
    const r = ok({ seasons: 2, promises: [{ kind: "league_position", params: { position: 3, hack: 1 } }], demands });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.proposal.promises[0].params).toEqual({ position: 3 });
  });
  it("délka 1 až 3 sezóny", () => {
    expect(ok({ seasons: 4, promises: [], demands }).ok).toBe(false);
    expect(ok({ seasons: 1.5, promises: [], demands }).ok).toBe(false);
  });
  it("sezónní slib u smlouvy na 1 sezónu neprojde", () => {
    const r = ok({ seasons: 1, promises: [{ kind: "no_riots", params: {} }], demands });
    expect(r).toEqual({ ok: false, error: "Sezónní sliby platí až od příští sezóny, smlouva musí být aspoň na 2 sezóny" });
  });
  it("stejný druh slibu dvakrát neprojde", () => {
    const r = ok({ seasons: 2, promises: [{ kind: "no_riots", params: {} }, { kind: "no_riots", params: {} }], demands });
    expect(r.ok).toBe(false);
  });
  it("podvržené částky: záporné, necelé, přes strop", () => {
    expect(ok({ seasons: 2, promises: [], demands: { ...demands, monthly: -5 } }).ok).toBe(false);
    expect(ok({ seasons: 2, promises: [], demands: { ...demands, monthly: 100.5 } }).ok).toBe(false);
    expect(ok({ seasons: 2, promises: [], demands: { ...demands, monthly: 30001 } }).ok).toBe(false);
    expect(ok({ seasons: 2, promises: [], demands: { ...demands, signingBonus: 120001 } }).ok).toBe(false);
  });
  it("bonus za splnění jen u slíbeného druhu", () => {
    const r = ok({ seasons: 2, promises: [], demands: { ...demands, goalBonuses: { promotion: 1000 } } });
    expect(r.ok).toBe(false);
  });
  it("zamčená stavba neprojde, odemčená ano", () => {
    expect(ok({ seasons: 2, promises: [], demands: { ...demands, construction: "roof" } }).ok).toBe(false);
    expect(ok({ seasons: 2, promises: [], demands: { ...demands, construction: "stands" } }).ok).toBe(true);
  });
  it("stavbu nejde zaplatit i slíbit", () => {
    const r = ok({
      seasons: 2, promises: [{ kind: "stadium_upgrade", params: { facility: "stands", level: 3 } }],
      demands: { ...demands, construction: "stands" },
    });
    expect(r.ok).toBe(false);
  });
  it("logo na rukávu jen u stadionu, výpovědní pokuta jen když je co platit", () => {
    expect(ok({ seasons: 2, promises: [{ kind: "jersey_logo", params: {} }], demands }).ok).toBe(false);
    expect(ok({ seasons: 2, promises: [], demands: { ...demands, payCurrentFee: true } }).ok).toBe(false);
  });
  it("sponzor stadionu nedává bonus za výhru", () => {
    const r = validateProposal({ seasons: 2, promises: [], demands: { ...demands, winBonus: 500 } }, { ...CTX, category: "stadium" });
    expect(r.ok).toBe(false);
  });
  it("licence nad maximum a pod současnou neprojde", () => {
    expect(ok({ seasons: 2, promises: [{ kind: "coach_licence", params: { level: 5 } }], demands }).ok).toBe(false);
    expect(ok({ seasons: 2, promises: [{ kind: "coach_licence", params: { level: 1 } }], demands }).ok).toBe(false);
  });
});

describe("promiseCatalog", () => {
  const cat = promiseCatalog(CTX, 50);
  it("umístění pro všechna místa ligy, přání má vyšší hodnotu", () => {
    const lp = cat.filter((o) => o.kind === "league_position");
    expect(lp).toHaveLength(14);
    const seventh = lp.find((o) => o.params.position === 7)!;
    expect(seventh.value).toEqual({ low: 1856, high: 2644 });
    expect(seventh.seasonal).toBe(true);
  });
  it("bez loga na rukávu u hlavního sponzora, bez zamčené stavby", () => {
    expect(cat.some((o) => o.kind === "jersey_logo")).toBe(false);
    expect(cat.some((o) => o.kind === "stadium_upgrade" && o.params.facility === "roof")).toBe(false);
    expect(cat.filter((o) => o.kind === "stadium_upgrade").map((o) => o.params.level)).toEqual([2, 3]);
  });
  it("stavba zaplacená sponzorem: jen odemčená, o úroveň", () => {
    expect(constructionOptions(CTX)).toEqual([{ key: "stands", label: "Tribuny", level: 2, cost: 170000 }]);
  });
});
