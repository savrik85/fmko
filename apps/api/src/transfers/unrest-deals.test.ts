import { describe, expect, it } from "vitest";
import type { TransferUnrest } from "./offer-rejection-impact";
import { availableActions, bonusAmount, pledgeText, unrestChangeText, unrestMoodText, type UnrestContext } from "./unrest";
import { reasonSms, reasonsText, transferTalkFrom, unrestReasonsFromFactors } from "./unrest-reasons";
import { clubStepFor } from "./offer-rejection-impact";

const CTX: UnrestContext = { seasonNumber: 4, patriotism: 50, discipline: 50, leadership: 30, coachRelationship: 50, isCaptain: false, ownedHere: true, now: new Date("2026-10-18T12:00:00Z") };
const ids = (u: TransferUnrest, lc: Record<string, unknown> = {}, ctx: Partial<UnrestContext> = {}) =>
  availableActions(u, lc, { ...CTX, ...ctx }).map((a) => a.id);
const unrest = (o: Partial<TransferUnrest> = {}): TransferUnrest => ({ level: 50, ...o });
const VIRTUAL_OFFER = { amount: 60_000, fromTeamId: "virtual_ai", virtualTeamData: JSON.stringify({ name: "SV Grafenau", rating: 60, country: "DE" }), at: "2026-10-16T12:00:00Z" };

describe("proč hráč chtěl odejít", () => {
  it("důvody z faktorů zájmu, od nejsilnějšího, drobnosti a brzdy se nepočítají", () => {
    expect(unrestReasonsFromFactors([
      { label: "Lepší klub", delta: 13 }, { label: "Balík peněz", delta: 22 }, { label: "Fotbal v Německu", delta: 10 },
      { label: "Hraje málo", delta: 4 }, { label: "Vztah k obci", delta: 8 }, { label: "Morálka", delta: -6 },
    ])).toEqual(["better_club", "money"]);
    expect(unrestReasonsFromFactors([{ label: "Skoro nehraje", delta: 15 }, { label: "Vztah s trenérem", delta: 7 }])).toEqual(["minutes", "coach"]);
    expect(unrestReasonsFromFactors([])).toEqual([]);
  });

  it("text důvodů pro panel a prompt", () => {
    expect(reasonsText(["money"])).toBe("velkému zájmu klubu");
    expect(reasonsText(["money", "better_club", "minutes"])).toBe("velkému zájmu klubu, lepšímu klubu a tomu, že málo hraje");
  });

  it("první SMS: soutěž jen tam, kde je opravdu vyšší; peníze nejsou jeho výplata", () => {
    expect(reasonSms("better_club", "higher_league")).toContain("pořádnou soutěž");
    expect(reasonSms("better_club", "seniors")).toContain("mezi dospělými");
    expect(reasonSms("better_club", "abroad")).toContain("Německu");
    for (const step of ["stronger_team", undefined] as const) expect(reasonSms("better_club", step)).not.toContain("soutěž");
    expect(reasonSms("money", undefined)).not.toMatch(/uvidím|výplat|plat/);
  });
});

describe("dohody podle důvodu", () => {
  it("peníze: prémie a vyšší plat, ne místo v sestavě", () => {
    expect(ids(unrest({ reasons: ["money"] }))).toEqual(["bonus", "raise_wage"]);
    // Plat už letos zvedl: zbude prémie.
    expect(ids(unrest({ reasons: ["money"] }), { wageRaisedSeason: 4 })).toEqual(["bonus"]);
  });

  it("málo hraje: místo v sestavě; lepší klub: slib prodeje a u lídra páska", () => {
    expect(ids(unrest({ reasons: ["minutes"] }))).toEqual(["promise_minutes"]);
    expect(ids(unrest({ reasons: ["better_club"] }))).toEqual(["promise_transfer"]);
    expect(ids(unrest({ reasons: ["better_club"] }), {}, { leadership: 70 })).toEqual(["promise_transfer", "captaincy"]);
    expect(ids(unrest({ reasons: ["better_club"] }), {}, { leadership: 70, isCaptain: true })).toEqual(["promise_transfer"]);
  });

  it("vztah s trenérem nebo nálada: pivo", () => {
    expect(ids(unrest({ reasons: ["coach"] }))).toEqual(["personal_talk"]);
    expect(ids(unrest({ reasons: ["morale", "coach"] }))).toEqual(["personal_talk"]);
  });

  it("srdcař a zpražení jen tam, kde zaberou", () => {
    expect(ids(unrest({ reasons: ["money"] }), {}, { patriotism: 80 })).toContain("appeal_loyalty");
    expect(ids(unrest({ reasons: ["money"] }), {}, { discipline: 75 })).toContain("tough_love");
    expect(ids(unrest({ reasons: ["money"] }))).not.toContain("appeal_loyalty");
    expect(ids(unrest({ reasons: ["money"] }))).not.toContain("tough_love");
  });

  it("pustit ho: jen u cizího klubu a do 7 dní od odmítnutí, ne dvakrát", () => {
    expect(ids(unrest({ reasons: ["money"], offer: VIRTUAL_OFFER }))).toContain("release");
    expect(ids(unrest({ reasons: ["money"], offer: { ...VIRTUAL_OFFER, at: "2026-10-05T12:00:00Z" } }))).not.toContain("release");
    expect(ids(unrest({ reasons: ["money"], offer: { ...VIRTUAL_OFFER, fromTeamId: "team-1", virtualTeamData: null } }))).not.toContain("release");
    expect(ids(unrest({
      reasons: ["money"], offer: VIRTUAL_OFFER,
      pledge: { type: "release", madeAt: "2026-10-17T12:00:00Z", deadline: "2026-10-21T12:00:00Z", offerId: "o1" },
    }))).not.toContain("release");
  });

  it("hráč na hostování: páska ani „pustit ho“ (obojí by zapsalo do cizího týmu)", () => {
    const u = unrest({ reasons: ["better_club", "money"], offer: VIRTUAL_OFFER });
    expect(ids(u, {}, { leadership: 70 })).toEqual(expect.arrayContaining(["captaincy", "release"]));
    expect(ids(u, {}, { leadership: 70, ownedHere: false })).not.toContain("captaincy");
    expect(ids(u, {}, { leadership: 70, ownedHere: false })).not.toContain("release");
  });

  it("uzavřená dohoda se v tomtéž truci znovu nenabízí", () => {
    expect(ids(unrest({ reasons: ["money"], deals: [{ id: "bonus", at: "2026-10-17T12:00:00Z" }] }))).toEqual(["raise_wage"]);
  });

  it("starší truc bez důvodů: nabídka na nejčastější důvody", () => {
    expect(ids(unrest())).toEqual(["bonus", "raise_wage", "promise_minutes", "promise_transfer"]);
  });

  it("popisy mají doplněnou částku a klub, bez dlouhé pomlčky", () => {
    const acts = availableActions(unrest({ reasons: ["money", "coach"], offer: VIRTUAL_OFFER }), {}, CTX);
    const bonus = acts.find((a) => a.id === "bonus")!;
    expect(bonus.description).toContain(`${(9_000).toLocaleString("cs")} Kč`);
    expect(acts.find((a) => a.id === "release")!.description).toContain("SV Grafenau");
    expect(acts.find((a) => a.id === "personal_talk")!.description).toContain("500 Kč");
    for (const a of acts) {
      expect(a.description).not.toMatch(/[{}]|—/);
      expect(a.label).not.toMatch(/Kč/);
    }
  });
});

describe("prémie, sliby a texty pro AI", () => {
  it("prémie je 15 % z odmítnuté nabídky v mezích 1 000 až 50 000 Kč", () => {
    expect(bonusAmount({ offer: { ...VIRTUAL_OFFER, amount: 60_000 } })).toBe(9_000);
    expect(bonusAmount({ offer: { ...VIRTUAL_OFFER, amount: 2_000 } })).toBe(1_000);
    expect(bonusAmount({ offer: { ...VIRTUAL_OFFER, amount: 900_000 } })).toBe(50_000);
    expect(bonusAmount({})).toBe(5_000);
  });

  it("platný slib je v panelu česky", () => {
    expect(pledgeText(unrest())).toBeNull();
    expect(pledgeText(unrest({ pledge: { type: "minutes", madeAt: "x", deadline: "2026-11-01T00:00:00Z" } }))).toContain("místo v sestavě");
    expect(pledgeText(unrest({ offer: VIRTUAL_OFFER, pledge: { type: "release", madeAt: "x", deadline: "2026-10-22T00:00:00Z", offerId: "o" } })))
      .toContain("nabídku od SV Grafenau");
  });

  it("AI zná důvody, nabídku a uzavřené dohody", () => {
    const t = transferTalkFrom({ reasons: ["money"], teamName: "SV Grafenau", offer: { amount: 60_000 }, leagueNote: "SV Grafenau je bavorský klub.", deals: [{ id: "bonus" }] })!;
    expect(t.reasons).toBe("velkému zájmu klubu");
    // Odstupné patří klubu: hráč si dřív myslel, že ty peníze nabízeli jemu.
    expect(t.offer).toContain(`nabídl tvému klubu ${(60_000).toLocaleString("cs")} Kč odstupné`);
    expect(t.offer).toContain("dostal klub, ne ty");
    expect(t.league).toBe("SV Grafenau je bavorský klub.");
    expect(t.deals).toEqual(["trenér ti vyplatil prémii z klubové kasy"]);
    expect(transferTalkFrom(undefined)).toBeUndefined();
  });

  it("nálada a změna slovy, bez čísel", () => {
    expect(unrestMoodText(90)).toBe("Je hodně naštvaný a hlavou je jinde");
    expect(unrestMoodText(50)).toBe("Je naštvaný");
    expect(unrestMoodText(5)).toBe("Už se skoro uklidnil");
    expect(unrestChangeText(60, 0)).toBe("Uklidnil se");
    expect(unrestChangeText(60, 25)).toBe("Výrazně se uklidnil");
    expect(unrestChangeText(60, 45)).toBe("Trochu se uklidnil");
    expect(unrestChangeText(40, 50)).toBe("Naštval se ještě víc");
    for (const t of [unrestMoodText(77), unrestChangeText(80, 10)]) expect(t).not.toMatch(/\d/);
  });
});

describe("kam by hráč přestupem šel", () => {
  const stubDb = (row: Record<string, unknown> | null) => ({
    prepare: () => ({ bind: () => ({ first: async () => row }) }),
  }) as unknown as D1Database;
  const base = { fromTeamId: "B", rosterTeamId: "S", teamName: "FK Seznam Dvorce", virtualCountry: null };

  it("U21 hráč a nabídka áčka ze stejného přeboru: mezi dospělé, ne „pořádná soutěž“", async () => {
    const r = await clubStepFor(stubDb({ buyer_parent: null, buyer_level: "okresni_prebor", buyer_league: "Přebor Prahy", roster_parent: "S0", roster_level: "okresni_prebor" }), base);
    expect(r.step).toBe("seniors");
    expect(r.note).toContain("mezi dospělými");
  });

  it("stejná soutěž: jen silnější tým, model nesmí tvrdit vyšší soutěž", async () => {
    const r = await clubStepFor(stubDb({ buyer_parent: null, buyer_level: "okresni_prebor", buyer_league: "Přebor Prahy", roster_parent: null, roster_level: "okresni_prebor" }), base);
    expect(r.step).toBe("stronger_team");
    expect(r.note).toContain("není vyšší soutěž");
  });

  it("přebor proti III. třídě: vyšší soutěž", async () => {
    const r = await clubStepFor(stubDb({ buyer_parent: null, buyer_level: "okresni_prebor", buyer_league: "Okresní přebor Prachatice", roster_parent: null, roster_level: "okresni_soutez" }), base);
    expect(r.step).toBe("higher_league");
  });

  it("klub mimo hru: Německo, český z jiného okresu bez vymýšlení soutěže", async () => {
    expect((await clubStepFor(stubDb(null), { ...base, fromTeamId: "virtual_ai", virtualCountry: "DE" })).step).toBe("abroad");
    const cz = await clubStepFor(stubDb(null), { ...base, fromTeamId: "virtual_ai" });
    expect(cz.step).toBe("stronger_team");
    expect(cz.note).toContain("nevymýšlej");
  });
});
