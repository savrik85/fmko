/**
 * Sliby sponzorům: vyhodnocení podle druhu, „těsně vedle", důsledky, pravidlo výpovědi,
 * české popisky a pomocné výpočty tabulky a poháru. Bez DB.
 */
import { describe, expect, it } from "vitest";
import {
  averagePerMatch, cupRoundReached, evaluateDeadlinePromise, evaluateSeasonalPromise, parsePromiseParams,
  positionFromStandings, PROMISE_KINDS, promiseActualText, promiseConsequence, promiseFavorReason, promiseLabel,
  promiseSmsPlan, promiseTransactionText, rankTable, sectorBlockMessage, sponsorTerminates,
  type DeadlineState, type PromiseParams, type SeasonStats,
} from "./promise-eval";

const STATS: SeasonStats = {
  position: 4, teamsInLeague: 14, cupReached: 3, avgHomeAttendance: 380, avgYouthStarters: 1.6, reputation: 68, riots: 0,
};

describe("evaluateSeasonalPromise", () => {
  it("umístění: cíl splněný, o místo hůř těsně vedle, jinak porušeno", () => {
    expect(evaluateSeasonalPromise("league_position", { position: 4 }, STATS)).toEqual({ outcome: "fulfilled", actual: 4 });
    expect(evaluateSeasonalPromise("league_position", { position: 6 }, STATS)?.outcome).toBe("fulfilled");
    expect(evaluateSeasonalPromise("league_position", { position: 3 }, STATS)).toEqual({ outcome: "partial", actual: 4 });
    expect(evaluateSeasonalPromise("league_position", { position: 2 }, STATS)).toEqual({ outcome: "broken", actual: 4 });
  });

  it("postup = první dvě místa, těsně vedle neexistuje", () => {
    expect(evaluateSeasonalPromise("promotion", {}, { ...STATS, position: 2 })?.outcome).toBe("fulfilled");
    expect(evaluateSeasonalPromise("promotion", {}, { ...STATS, position: 3 })).toEqual({ outcome: "broken", actual: 3 });
  });

  it("nesestup = mimo poslední dvě místa", () => {
    expect(evaluateSeasonalPromise("no_relegation", {}, { ...STATS, position: 12 })?.outcome).toBe("fulfilled");
    expect(evaluateSeasonalPromise("no_relegation", {}, { ...STATS, position: 13 })?.outcome).toBe("broken");
  });

  it("pohár: odehrané kolo aspoň cílové", () => {
    expect(evaluateSeasonalPromise("cup_round", { round: 3 }, STATS)?.outcome).toBe("fulfilled");
    expect(evaluateSeasonalPromise("cup_round", { round: 4 }, STATS)).toEqual({ outcome: "broken", actual: 3 });
    expect(evaluateSeasonalPromise("cup_round", { round: 1 }, { ...STATS, cupReached: 0 })?.outcome).toBe("broken");
  });

  it("návštěva: do 10 % pod cílem je těsně vedle", () => {
    expect(evaluateSeasonalPromise("attendance", { attendance: 380 }, STATS)?.outcome).toBe("fulfilled");
    expect(evaluateSeasonalPromise("attendance", { attendance: 420 }, STATS)).toEqual({ outcome: "partial", actual: 380 });
    expect(evaluateSeasonalPromise("attendance", { attendance: 425 }, STATS)?.outcome).toBe("broken");
  });

  it("mladí: průměr na zápas aspoň cíl, zaokrouhlený na desetiny", () => {
    expect(evaluateSeasonalPromise("youth", { count: 1.5 }, STATS)).toEqual({ outcome: "fulfilled", actual: 1.6 });
    expect(evaluateSeasonalPromise("youth", { count: 2 }, STATS)).toEqual({ outcome: "broken", actual: 1.6 });
  });

  it("reputace: do 3 bodů pod cílem je těsně vedle", () => {
    expect(evaluateSeasonalPromise("reputation", { reputation: 68 }, STATS)?.outcome).toBe("fulfilled");
    expect(evaluateSeasonalPromise("reputation", { reputation: 71 }, STATS)).toEqual({ outcome: "partial", actual: 68 });
    expect(evaluateSeasonalPromise("reputation", { reputation: 72 }, STATS)?.outcome).toBe("broken");
  });

  it("výtržnosti: jediná stačí k porušení", () => {
    expect(evaluateSeasonalPromise("no_riots", {}, STATS)).toEqual({ outcome: "fulfilled", actual: 0 });
    expect(evaluateSeasonalPromise("no_riots", {}, { ...STATS, riots: 2 })).toEqual({ outcome: "broken", actual: 2 });
  });

  it("exkluzivita oboru se na konci smlouvy uzná", () => {
    expect(evaluateSeasonalPromise("sector_exclusivity", {}, STATS)).toEqual({ outcome: "fulfilled", actual: null });
  });

  it("chybějící data nebo parametr = nejde vyhodnotit", () => {
    expect(evaluateSeasonalPromise("league_position", { position: 3 }, { ...STATS, position: null })).toBeNull();
    expect(evaluateSeasonalPromise("league_position", {}, STATS)).toBeNull();
    expect(evaluateSeasonalPromise("cup_round", { round: 2 }, { ...STATS, cupReached: null })).toBeNull();
    expect(evaluateSeasonalPromise("attendance", { attendance: 300 }, { ...STATS, avgHomeAttendance: null })).toBeNull();
    expect(evaluateSeasonalPromise("coach_licence", { level: 2 }, STATS)).toBeNull();
  });
});

describe("evaluateDeadlinePromise", () => {
  const STATE: DeadlineState = { licenceLevel: 2, facilities: { vip_box: 1, stands: 2 }, sleeveSponsorId: 7 };

  it("splněno hned, jakmile platí, i po termínu", () => {
    expect(evaluateDeadlinePromise("coach_licence", { level: 2 }, STATE, 7, "2026-12-01", "2026-10-05"))
      .toEqual({ outcome: "fulfilled", actual: 2 });
    expect(evaluateDeadlinePromise("stadium_upgrade", { facility: "stands", level: 2 }, STATE, 7, "2026-10-01", "2026-10-05"))
      .toEqual({ outcome: "fulfilled", actual: 2 });
    expect(evaluateDeadlinePromise("jersey_logo", {}, STATE, 7, "2026-10-01", "2026-10-05"))
      .toEqual({ outcome: "fulfilled", actual: 1 });
  });

  it("před termínem i v den termínu čeká, den po termínu porušeno", () => {
    expect(evaluateDeadlinePromise("coach_licence", { level: 3 }, STATE, 7, "2026-10-01", "2026-10-05")).toBe("pending");
    expect(evaluateDeadlinePromise("coach_licence", { level: 3 }, STATE, 7, "2026-10-05", "2026-10-05T00:00:00.000Z")).toBe("pending");
    expect(evaluateDeadlinePromise("coach_licence", { level: 3 }, STATE, 7, "2026-10-06", "2026-10-05"))
      .toEqual({ outcome: "broken", actual: 2 });
    expect(evaluateDeadlinePromise("jersey_logo", {}, STATE, 8, "2026-10-06", "2026-10-05"))
      .toEqual({ outcome: "broken", actual: 0 });
  });

  it("bez termínu se porušit nedá", () => {
    expect(evaluateDeadlinePromise("stadium_upgrade", { facility: "vip_box", level: 2 }, STATE, 7, "2030-01-01", null)).toBe("pending");
  });

  it("neznámé zařízení nebo chybějící licence = nejde vyhodnotit", () => {
    expect(evaluateDeadlinePromise("stadium_upgrade", { facility: "bazen", level: 1 }, STATE, 7, "2026-10-01", null)).toBeNull();
    expect(evaluateDeadlinePromise("coach_licence", { level: 1 }, { ...STATE, licenceLevel: null }, 7, "2026-10-01", null)).toBeNull();
    expect(evaluateDeadlinePromise("league_position", { position: 1 }, STATE, 7, "2026-10-01", null)).toBeNull();
  });
});

describe("promiseConsequence", () => {
  it("splněno: bonus, +5, žádné porušení", () => {
    expect(promiseConsequence("fulfilled", 12000, 8000)).toEqual({ money: 12000, txType: "sponsor_bonus", favorDelta: 5, breach: false });
    expect(promiseConsequence("fulfilled", 0, 8000)).toEqual({ money: 0, txType: null, favorDelta: 5, breach: false });
  });

  it("těsně vedle: polovina pokuty, −3, nepočítá se jako porušení", () => {
    expect(promiseConsequence("partial", 0, 9001)).toEqual({ money: -4501, txType: "sponsor_penalty", favorDelta: -3, breach: false });
  });

  it("porušeno: celá pokuta, −8, porušení", () => {
    expect(promiseConsequence("broken", 5000, 8000)).toEqual({ money: -8000, txType: "sponsor_penalty", favorDelta: -8, breach: true });
    expect(promiseConsequence("broken", 0, 0)).toEqual({ money: 0, txType: null, favorDelta: -8, breach: true });
  });
});

describe("sponsorTerminates", () => {
  it("druhé porušení v sezóně nebo porušený postup či nesestup", () => {
    expect(sponsorTerminates(1, ["league_position"])).toBe(false);
    expect(sponsorTerminates(2, ["league_position"])).toBe(true);
    expect(sponsorTerminates(1, ["no_relegation"])).toBe(true);
    expect(sponsorTerminates(0, ["promotion"])).toBe(true);
    expect(sponsorTerminates(3, [])).toBe(false);
  });
});

describe("promiseSmsPlan", () => {
  const items = [
    { id: "a", outcome: "fulfilled" as const, label: "reputace klubu aspoň 60" },
    { id: "b", outcome: "partial" as const, label: "umístění do 3. místa" },
  ];

  it("jedna SMS za smlouvu, nejhorší výsledek vyhrává", () => {
    expect(promiseSmsPlan(items, false)).toEqual({ occasion: "promise_broken", promiseId: "b", label: "umístění do 3. místa" });
    expect(promiseSmsPlan([items[0]], false)).toEqual({ occasion: "promise_kept", promiseId: "a", label: "reputace klubu aspoň 60" });
    expect(promiseSmsPlan([...items, { id: "c", outcome: "broken" as const, label: "postupové místo" }], true))
      .toEqual({ occasion: "sponsor_terminates", promiseId: "c", label: "postupové místo" });
    expect(promiseSmsPlan([], false)).toBeNull();
  });
});

describe("popisky", () => {
  const SAMPLE: Record<string, PromiseParams> = {
    league_position: { position: 3 }, cup_round: { round: 4 }, coach_licence: { level: 2 },
    stadium_upgrade: { facility: "vip_box", level: 2 }, attendance: { attendance: 400 }, youth: { count: 2 },
    reputation: { reputation: 70 },
  };

  it("každý druh má český popisek bez dlouhé pomlčky", () => {
    for (const k of PROMISE_KINDS) {
      const label = promiseLabel(k, SAMPLE[k] ?? {});
      expect(label.length, k).toBeGreaterThan(3);
      expect(label).not.toContain("—");
      expect(label).not.toMatch(/[{}]/);
    }
  });

  // Stejné znění, jaké hráč viděl při podpisu (proposal.ts promiseLabelByKind, jediný zdroj
  // pravdy). Pohárové kolo má vlastní describe blok níž (potřebuje cupTotalRounds).
  it("konkrétní tvary", () => {
    expect(promiseLabel("league_position", { position: 3 })).toBe("skončit do 3. místa");
    expect(promiseLabel("coach_licence", { level: 2 })).toBe("trenér s licencí UEFA B");
    expect(promiseLabel("stadium_upgrade", { facility: "vip_box", level: 2 })).toBe("VIP lóže na úroveň 2");
    expect(promiseLabel("youth", { count: 1 })).toBe("průměrně 1 hráč do 21 let v sestavě");
    expect(promiseLabel("youth", { count: 2 })).toBe("průměrně 2 hráči do 21 let v sestavě");
    expect(promiseLabel("youth", { count: 5 })).toBe("průměrně 5 hráčů do 21 let v sestavě");
    // count je vždycky celé číslo 2 až 4 (validateProposal), zlomek se u tohohle slibu v datech
    // nevyskytne, proto se netestuje.
    expect(promiseLabel("attendance", { attendance: 400 })).toBe("průměrně aspoň 400 diváků doma");
  });

  // roundName potřebuje celkový počet kol soutěže (proposal.ts:204), tady jako volitelný
  // parametr cupTotalRounds. Testováno na kolech 2, 3 a total−2 s total 7 (DEFAULT_CUP_ROUNDS),
  // aby to pokrylo předkolo, obyčejné číslované kolo i pojmenované kolo (čtvrtfinále).
  it("pohárové kolo: stejné pojmenování jako při podpisu (roundName)", () => {
    expect(promiseLabel("cup_round", { round: 2 }, 7)).toBe("v poháru aspoň 2. předkolo");
    expect(promiseLabel("cup_round", { round: 3 }, 7)).toBe("v poháru aspoň 1. kolo");
    expect(promiseLabel("cup_round", { round: 5 }, 7)).toBe("v poháru aspoň čtvrtfinále");
    // Bez třetího argumentu použije výchozí DEFAULT_CUP_ROUNDS, což je 7.
    expect(promiseLabel("cup_round", { round: 5 })).toBe("v poháru aspoň čtvrtfinále");

    expect(promiseActualText("cup_round", 0, 7)).toBe("klub v poháru nehrál");
    expect(promiseActualText("cup_round", 2, 7)).toBe("2. předkolo");
    expect(promiseActualText("cup_round", 3, 7)).toBe("1. kolo");
    expect(promiseActualText("cup_round", 5, 7)).toBe("čtvrtfinále");
  });

  it("chybějící povinný parametr: obecný popisek, nikdy „undefined\"", () => {
    const label = promiseLabel("league_position", {});
    expect(label).not.toContain("undefined");
    expect(label).toBe("umístění v tabulce");
  });

  it("skutečnost česky", () => {
    expect(promiseActualText("league_position", 4)).toBe("4. místo");
    expect(promiseActualText("no_riots", 0)).toBe("bez výtržností");
    expect(promiseActualText("no_riots", 1)).toBe("1 výtržnost");
    expect(promiseActualText("no_riots", 3)).toBe("3 výtržnosti");
    expect(promiseActualText("no_riots", 5)).toBe("5 výtržností");
    expect(promiseActualText("attendance", 380)).toBe("380 diváků v průměru");
    expect(promiseActualText("youth", 1.6)).toBe("1,6 hráče do 21 let v průměru");
    expect(promiseActualText("reputation", 68)).toBe("reputace 68");
    expect(promiseActualText("coach_licence", 2)).toBe("UEFA B");
    expect(promiseActualText("stadium_upgrade", 1)).toBe("úroveň 1");
    expect(promiseActualText("jersey_logo", 1)).toBeNull();
    expect(promiseActualText("reputation", null)).toBeNull();
  });

  it("transakce, deník náklonnosti a blok oboru bez dlouhé pomlčky", () => {
    expect(promiseTransactionText("fulfilled", "Pivovar Lhota", "postupové místo")).toBe("Pivovar Lhota: bonus za splněný slib (postupové místo)");
    expect(promiseTransactionText("partial", "Pivovar Lhota", "x")).toContain("polovina pokuty");
    expect(promiseTransactionText("broken", "Pivovar Lhota", "x")).toContain("pokuta za porušený slib");
    expect(promiseFavorReason("broken", "postupové místo")).toBe("porušený slib: postupové místo");
    for (const t of [promiseTransactionText("partial", "A", "b"), promiseFavorReason("partial", "b"), sectorBlockMessage("Pivovar Lhota")]) {
      expect(t).not.toContain("—");
    }
  });
});

describe("pomocné výpočty", () => {
  it("parametry slibu", () => {
    expect(parsePromiseParams(null)).toEqual({});
    expect(parsePromiseParams('{"position":3}')).toEqual({ position: 3 });
    expect(parsePromiseParams("[1]")).toBeNull();
    expect(parsePromiseParams("nesmysl")).toBeNull();
  });

  it("pořadí z archivované tabulky", () => {
    const json = JSON.stringify([{ pos: 1, teamId: "a" }, { pos: 2, teamId: "b" }, { pos: 3, teamId: "c" }]);
    expect(positionFromStandings(json, "b")).toEqual({ position: 2, teams: 3 });
    expect(positionFromStandings(json, "x")).toBeNull();
    expect(positionFromStandings("{", "a")).toBeNull();
  });

  it("tabulka ze zápasů: body, rozdíl skóre, vstřelené góly", () => {
    const ranks = rankTable(["a", "b", "c"], [
      { home_team_id: "a", away_team_id: "b", home_score: 1, away_score: 0 },
      { home_team_id: "c", away_team_id: "b", home_score: 3, away_score: 0 },
      { home_team_id: "a", away_team_id: "c", home_score: 0, away_score: 0 },
    ]);
    // a i c mají 4 body, c má lepší rozdíl skóre (+3 proti +1) → c první
    expect([...ranks.entries()]).toEqual([["c", 1], ["a", 2], ["b", 3]]);
  });

  it("dosažené kolo poháru", () => {
    const base = { status: "finished", total_rounds: 6, current_round: 6, eliminated_round: null, cup_team_id: "ct1", is_winner: 0 };
    expect(cupRoundReached(null)).toBeNull();
    expect(cupRoundReached({ ...base, cup_team_id: null })).toBe(0);
    expect(cupRoundReached({ ...base, eliminated_round: 2 })).toBe(2);
    expect(cupRoundReached({ ...base, is_winner: 1 })).toBe(6);
    expect(cupRoundReached({ ...base, status: "active", current_round: 4 })).toBe(4);
  });

  it("průměr na zápas", () => {
    expect(averagePerMatch(17, 10)).toBe(1.7);
    expect(averagePerMatch(0, 0)).toBeNull();
  });
});
