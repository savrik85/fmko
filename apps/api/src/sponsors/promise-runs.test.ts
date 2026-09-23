/**
 * Data a běhy vyhodnocení slibů nad falešnou D1: sezónní statistika z archivu i ze
 * zápasů, termínové sliby v ticku, sezónní v rolloveru, posun termínů, exkluzivita
 * oboru, výpis slibů a logo na rukávu.
 */
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1, type Pravidlo } from "../incidents/testovaci-d1";
import { loadDeadlineState, loadSeasonStats } from "./promise-data";
import {
  deadlinesAlreadyShifted, evaluateDeadlinePromises, evaluateSeasonPromises, exclusiveSectors, listTeamPromises,
  placeSleeveLogo, shiftPromiseDeadlinesForRollover,
} from "./promise-runs";

/** Jednotlivé dotazy i dotazy z dávek (nárok na slib jde v dávce resolvePromise). */
function vse(db: FalesnaD1) {
  return [...db.dotazy, ...db.davky.flat()];
}

const STANDINGS = JSON.stringify([{ pos: 1, teamId: "a" }, { pos: 2, teamId: "t1" }, { pos: 3, teamId: "c" }]);

const STATS_RULES: Pravidlo[] = [
  { sql: /FROM league_history/, first: { final_standings: STANDINGS } },
  { sql: /FROM cup_competitions/, first: { status: "finished", total_rounds: 6, current_round: 6, eliminated_round: 3, cup_team_id: "ct1", is_winner: 0 } },
  { sql: /AVG\(m\.attendance\)/, first: { avg: 412.4 } },
  { sql: /match_player_stats/, first: { matches: 10, young: 17 } },
  { sql: /SELECT reputation FROM teams/, first: { reputation: 61 } },
  { sql: /FROM fan_incidents/, first: { n: 1 } },
];

function pending(over: Record<string, unknown>) {
  return {
    id: "p1", contract_id: "c1", team_id: "t1", sponsor_id: 7, kind: "reputation", params: '{"reputation":60}',
    season: 5, deadline_game_date: null, reward: 0, penalty: 4000, status: "pending",
    sponsor_name: "Pivovar Lhota", category: "main", seasons_remaining: 2, ...over,
  };
}

describe("loadSeasonStats", () => {
  it("skládá sezónu z archivu tabulky, poháru, návštěvy, mladých, reputace a výtržností", async () => {
    const db = new FalesnaD1(STATS_RULES);
    const s = await loadSeasonStats(jakoD1(db), "t1", 5, { agedSinceSeason: true });
    expect(s).toEqual({
      position: 2, teamsInLeague: 3, cupReached: 3, avgHomeAttendance: 412.4, avgYouthStarters: 1.7, reputation: 61, riots: 1,
    });
    expect(db.dotazy.find((d) => /match_player_stats/.test(d.sql))?.params).toEqual(["t1", 5, 1]);
  });

  it("bez archivu spočítá tabulku ze zápasů té sezóny", async () => {
    const db = new FalesnaD1([
      { sql: /FROM league_history/, first: null },
      { sql: /SELECT id FROM teams WHERE league_id/, all: [{ id: "a" }, { id: "t1" }] },
      { sql: /SELECT m\.home_team_id/, all: [{ home_team_id: "t1", away_team_id: "a", home_score: 2, away_score: 0 }] },
      ...STATS_RULES.slice(1),
    ]);
    const s = await loadSeasonStats(jakoD1(db), "t1", 5, { agedSinceSeason: false });
    expect(s.position).toBe(1);
    expect(s.teamsInLeague).toBe(2);
  });
});

describe("loadDeadlineState", () => {
  it("licence trenéra, úrovně zařízení a logo na rukávu", async () => {
    const db = new FalesnaD1([
      { sql: /FROM managers WHERE team_id/, first: { licence_level: 2 } },
      { sql: /FROM stadiums/, first: { vip_box: 1, stands: 2, capacity: 300 } },
      { sql: /SELECT sleeve_sponsor_id FROM teams/, first: { sleeve_sponsor_id: 7 } },
    ]);
    const s = await loadDeadlineState(jakoD1(db), "t1");
    expect(s.licenceLevel).toBe(2);
    expect(s.facilities.vip_box).toBe(1);
    expect(s.facilities.stands).toBe(2);
    expect(s.facilities.roof).toBe(0);
    expect(s.facilities).not.toHaveProperty("capacity");
    expect(s.sleeveSponsorId).toBe(7);
  });
});

describe("evaluateSeasonPromises", () => {
  it("vyhodnotí sliby smlouvy, statistiku načte jednou za klub", async () => {
    const db = new FalesnaD1([
      { sql: /FROM sponsor_promises p JOIN sponsor_contracts sc/, all: [
        pending({ id: "p1" }),
        pending({ id: "p2", kind: "no_riots", params: "{}" }),
      ] },
      { sql: /UPDATE sponsor_promises SET status/, all: [{ id: "x" }] },
      ...STATS_RULES,
    ]);
    const r = await evaluateSeasonPromises(jakoD1(db), 5, { gameDate: "2026-09-23T16:00:00.000Z", day: "2026-09-23", agedSinceSeason: true, atRollover: true });
    expect(r).toEqual({ resolved: 2, skipped: 0, terminated: 0, terminatedSponsors: [] });
    expect(db.pocet(/FROM league_history/)).toBe(1);
    const claims = vse(db).filter((d) => /UPDATE sponsor_promises SET status/.test(d.sql)).map((d) => d.params.slice(0, 2));
    expect(claims).toEqual([["fulfilled", 61], ["broken", 1]]);
    const sel = db.dotazy.find((d) => /FROM sponsor_promises p JOIN sponsor_contracts sc/.test(d.sql));
    expect(sel?.sql).toContain("p.kind = 'sector_exclusivity' AND sc.seasons_remaining <= 1");
    expect(sel?.params).toEqual([5]);
  });

  it("slib bez dat zůstane čekat a započítá se jako přeskočený", async () => {
    const db = new FalesnaD1([
      { sql: /FROM sponsor_promises p JOIN sponsor_contracts sc/, all: [pending({ kind: "cup_round", params: '{"round":2}' })] },
      { sql: /FROM cup_competitions/, first: null },
      ...STATS_RULES,
    ]);
    const r = await evaluateSeasonPromises(jakoD1(db), 5, { gameDate: "2026-09-23T16:00:00.000Z", day: "2026-09-23", agedSinceSeason: true, atRollover: true });
    expect(r).toEqual({ resolved: 0, skipped: 1, terminated: 0, terminatedSponsors: [] });
    expect(db.pocet(/UPDATE sponsor_promises SET status/)).toBe(0);
  });

  it("končící smlouva v rolloveru: termínové sliby k poslednímu dni staré sezóny (R7)", async () => {
    const db = new FalesnaD1([
      { sql: /FROM sponsor_promises p JOIN sponsor_contracts sc/, all: [
        // Splněný: bonus.
        pending({ id: "p1", kind: "coach_licence", params: '{"level":2}', season: null, deadline_game_date: "2026-12-30", seasons_remaining: 1 }),
        // Nesplněný, termín až po konci sezóny: bez pokuty, zůstane čekat.
        pending({ id: "p2", kind: "stadium_upgrade", params: '{"facility":"vip_box","level":2}', season: null, deadline_game_date: "2026-11-25", seasons_remaining: 1 }),
        // Termín uplynul ve staré ose (reálné datum rolloveru je dřív): porušeno jako v ticku.
        pending({ id: "p3", kind: "jersey_logo", params: "{}", season: null, deadline_game_date: "2026-11-10", seasons_remaining: 1 }),
      ] },
      { sql: /UPDATE sponsor_promises SET status/, all: [{ id: "x" }] },
      { sql: /MAX\(substr\(sc\.scheduled_at/, first: { d: "2026-11-20" } },
      { sql: /FROM managers WHERE team_id/, first: { licence_level: 2 } },
      { sql: /FROM stadiums/, first: { vip_box: 1 } },
      { sql: /SELECT sleeve_sponsor_id FROM teams/, first: { sleeve_sponsor_id: null } },
      ...STATS_RULES,
    ]);
    const r = await evaluateSeasonPromises(jakoD1(db), 5, { gameDate: "2026-09-23T16:00:00.000Z", day: "2026-09-23", agedSinceSeason: true, atRollover: true });
    expect(r).toMatchObject({ resolved: 2, skipped: 0, terminated: 0 });
    const claims = vse(db).filter((d) => /UPDATE sponsor_promises SET status/.test(d.sql)).map((d) => [d.params[3], d.params[0]]);
    expect(claims).toEqual([["p1", "fulfilled"], ["p3", "broken"]]);
    // Sezónní statistika se pro čistě termínové sliby nenačítá.
    expect(db.pocet(/FROM league_history/)).toBe(0);
    const sel = db.dotazy.find((d) => /FROM sponsor_promises p JOIN sponsor_contracts sc/.test(d.sql));
    expect(sel?.sql).toContain("p.kind IN ('coach_licence', 'stadium_upgrade', 'jersey_logo') AND sc.seasons_remaining <= 1");
  });

  it("ruční běh během sezóny: jen sezónní sliby, končící smlouvy neuzavírá", async () => {
    const db = new FalesnaD1([
      { sql: /FROM sponsor_promises p JOIN sponsor_contracts sc/, all: [] },
    ]);
    const r = await evaluateSeasonPromises(jakoD1(db), 5, { gameDate: "2026-09-23T16:00:00.000Z", day: "2026-09-23", agedSinceSeason: false, atRollover: false });
    expect(r.resolved).toBe(0);
    const sel = db.dotazy.find((d) => /FROM sponsor_promises p JOIN sponsor_contracts sc/.test(d.sql));
    expect(sel?.sql).not.toContain("sector_exclusivity");
    expect(sel?.sql).not.toContain("seasons_remaining <= 1");
  });

  it("výpověď v rolloveru: vrátí vypovídající firmu a vratku počítá s celou sezónou", async () => {
    const db = new FalesnaD1([
      { sql: /FROM sponsor_promises p JOIN sponsor_contracts sc/, all: [pending({ id: "p1", kind: "no_riots", params: "{}" })] },
      { sql: /UPDATE sponsor_promises SET status/, all: [{ id: "x" }] },
      { sql: /SELECT breaches_season FROM sponsor_contracts/, first: { breaches_season: 2 } },
      { sql: /SET status = 'terminated'/, all: [{ id: "c1" }] },
      { sql: /SELECT id, seasons_total, seasons_remaining, signing_bonus/, first: {
        id: "c1", seasons_total: 2, seasons_remaining: 2, signing_bonus: 0, paid_construction: null, negotiation_id: null } },
      ...STATS_RULES,
    ]);
    const r = await evaluateSeasonPromises(jakoD1(db), 5, { gameDate: "2026-09-23T16:00:00.000Z", day: "2026-09-23", agedSinceSeason: true, atRollover: true });
    expect(r).toEqual({ resolved: 1, skipped: 0, terminated: 1, terminatedSponsors: [{ teamId: "t1", sponsorId: 7 }] });
    // progressMonths = MONTHS_PER_SEASON, postup sezóny klubu se nečte.
    expect(db.pocet(/SELECT game_date, season_start, season_end/)).toBe(0);
  });
});

describe("evaluateDeadlinePromises", () => {
  it("prošlý termín licence = porušeno, logo bez termínu čeká", async () => {
    const db = new FalesnaD1([
      { sql: /FROM sponsor_promises p JOIN sponsor_contracts sc/, all: [
        pending({ id: "p1", kind: "coach_licence", params: '{"level":3}', season: null, deadline_game_date: "2026-09-01" }),
        pending({ id: "p2", kind: "jersey_logo", params: "{}", season: null, deadline_game_date: null }),
      ] },
      { sql: /UPDATE sponsor_promises SET status/, all: [{ id: "x" }] },
      { sql: /FROM managers WHERE team_id/, first: { licence_level: 2 } },
      { sql: /FROM stadiums/, first: { vip_box: 0 } },
      { sql: /SELECT sleeve_sponsor_id FROM teams/, first: { sleeve_sponsor_id: null } },
    ]);
    const r = await evaluateDeadlinePromises(jakoD1(db), "2026-09-23T16:00:00.000Z");
    expect(r.resolved).toBe(1);
    const claims = vse(db).filter((d) => /UPDATE sponsor_promises SET status/.test(d.sql));
    expect(claims.map((c) => c.params[3])).toEqual(["p1"]);
    expect(claims[0].params[0]).toBe("broken");
    // Logo na rukávu patří jen aktivnímu sponzorovi.
    expect(db.pocet(/UPDATE teams SET sleeve_sponsor_id = NULL/)).toBe(1);
  });
});

describe("shiftPromiseDeadlinesForRollover", () => {
  it("posune čekající termíny o skok herního času, jednou za rollover", async () => {
    const db = new FalesnaD1([{ sql: /MAX\(substr\(sc\.scheduled_at/, first: { d: "2026-11-20" } }]);
    await shiftPromiseDeadlinesForRollover(jakoD1(db), 5, "2026-09-23T16:00:00.000Z");
    const [upd, mark] = db.davky[0];
    expect(upd.sql).toContain("UPDATE sponsor_promises");
    expect(upd.sql).toContain("NOT EXISTS (SELECT 1 FROM season_end_progress");
    expect(upd.params).toEqual(["2026-09-23", "2026-11-20", "__sponsor_promises__", 5]);
    expect(mark.sql).toContain("INSERT OR IGNORE INTO season_end_progress");
    expect(mark.params).toEqual(["__sponsor_promises__", 5]);
  });

  it("bez kalendáře staré sezóny nic neposouvá", async () => {
    const db = new FalesnaD1([{ sql: /MAX\(substr\(sc\.scheduled_at/, first: { d: null } }]);
    expect(await shiftPromiseDeadlinesForRollover(jakoD1(db), 5, "2026-09-23")).toBe(false);
    expect(db.davky).toHaveLength(0);
  });
});

describe("exclusiveSectors", () => {
  it("obor → firma, která exkluzivitu drží", async () => {
    const db = new FalesnaD1([{ sql: /p\.kind = 'sector_exclusivity'/, all: [{ type: "brewery", sponsor_name: "Pivovar Lhota" }] }]);
    expect(await exclusiveSectors(jakoD1(db), "t1")).toEqual(new Map([["brewery", "Pivovar Lhota"]]));
  });
});

describe("listTeamPromises", () => {
  it("popisek, skutečnost a možnost dát logo na rukáv", async () => {
    const db = new FalesnaD1([{ sql: /FROM sponsor_promises p JOIN sponsor_contracts sc/, all: [
      { id: "p1", contract_id: "c1", sponsor_id: 7, kind: "league_position", params: '{"position":3}', season: 5,
        deadline_game_date: null, status: "partial", reward: 0, penalty: 8000, actual_value: 4 },
      { id: "p2", contract_id: "c2", sponsor_id: 9, kind: "jersey_logo", params: "{}", season: null,
        deadline_game_date: "2026-10-05", status: "pending", reward: 2000, penalty: 3000, actual_value: null },
      { id: "p3", contract_id: "c2", sponsor_id: 9, kind: "neznamy", params: "{}", season: null,
        deadline_game_date: null, status: "pending", reward: 0, penalty: 0, actual_value: null },
    ] }]);
    const list = await listTeamPromises(jakoD1(db), "t1");
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: "p1", label: "skončit do 3. místa", status: "partial", actualText: "4. místo", canPlaceSleeveLogo: false });
    expect(list[1]).toMatchObject({ id: "p2", contractId: "c2", deadline: "2026-10-05", canPlaceSleeveLogo: true });
  });
});

describe("placeSleeveLogo", () => {
  it("jiný druh slibu odmítne", async () => {
    const db = new FalesnaD1([{ sql: /SELECT p\.id, p\.kind, p\.status/, first: { id: "p1", kind: "reputation", status: "pending", sponsor_id: 7, contract_status: "active", category: "main" } }]);
    expect(await placeSleeveLogo(jakoD1(db), "t1", "p1", "2026-09-23T16:00:00.000Z"))
      .toEqual({ ok: false, error: "Tenhle slib se logem na rukávu neplní", code: 400 });
  });

  it("smlouva bez kategorie stadion odmítne, i když jde o slib loga", async () => {
    const db = new FalesnaD1([{ sql: /SELECT p\.id, p\.kind, p\.status/, first: { id: "p1", kind: "jersey_logo", status: "pending", sponsor_id: 7, contract_status: "active", category: "main" } }]);
    expect(await placeSleeveLogo(jakoD1(db), "t1", "p1", "2026-09-23T16:00:00.000Z"))
      .toEqual({ ok: false, error: "Logo na rukáv patří sponzorovi stadionu", code: 400 });
  });

  it("rukáv už nese logo jiné aktivní smlouvy: odmítne", async () => {
    const db = new FalesnaD1([
      { sql: /SELECT p\.id, p\.kind, p\.status/, first: { id: "p1", kind: "jersey_logo", status: "pending", sponsor_id: 7, contract_status: "active", category: "stadium" } },
      { sql: /FROM teams t/, first: { exists: 1 } },
    ]);
    expect(await placeSleeveLogo(jakoD1(db), "t1", "p1", "2026-09-23T16:00:00.000Z"))
      .toEqual({ ok: false, error: "Rukáv už nese logo jiného sponzora", code: 409 });
    const check = db.dotazy.find((d) => /FROM teams t/.test(d.sql));
    expect(check?.params).toEqual(["t1", 7]);
  });

  it("čekající slib loga: logo na rukáv a hned vyhodnotit", async () => {
    const db = new FalesnaD1([
      { sql: /SELECT p\.id, p\.kind, p\.status/, first: { id: "p1", kind: "jersey_logo", status: "pending", sponsor_id: 7, contract_status: "active", category: "stadium" } },
      { sql: /SELECT status FROM sponsor_promises/, first: { status: "fulfilled" } },
    ]);
    const res = await placeSleeveLogo(jakoD1(db), "t1", "p1", "2026-09-23T16:00:00.000Z");
    expect(res).toEqual({ ok: true, status: "fulfilled" });
    expect(db.dotazy.find((d) => /UPDATE teams SET sleeve_sponsor_id = \? WHERE id = \?/.test(d.sql))?.params).toEqual([7, "t1"]);
    // Vyhodnocení termínových slibů jen pro tenhle klub (ne kontrolní SELECT slibu výše).
    const sel = db.dotazy.find((d) => /WHERE p\.status = 'pending' AND sc\.status = 'active'/.test(d.sql));
    expect(sel?.params).toEqual(["t1"]);
  });
});

describe("evaluateSeasonPromises: skipDeadlineKinds", () => {
  it("retry rolloveru s posunutými termíny končící smlouvy vůbec neuzavírá (termíny ani exkluzivitu)", async () => {
    const db = new FalesnaD1([{ sql: /FROM sponsor_promises p JOIN sponsor_contracts sc/, all: [] }]);
    await evaluateSeasonPromises(jakoD1(db), 5, {
      gameDate: "2026-09-23T16:00:00.000Z", day: "2026-09-23", agedSinceSeason: true, atRollover: true, skipDeadlineKinds: true,
    });
    const sel = db.dotazy.find((d) => /FROM sponsor_promises p JOIN sponsor_contracts sc/.test(d.sql));
    expect(sel?.sql).not.toContain("sector_exclusivity");
    expect(sel?.sql).not.toContain("coach_licence");
  });
});

describe("deadlinesAlreadyShifted", () => {
  it("true, když marker posunu termínů pro danou sezónu existuje", async () => {
    const db = new FalesnaD1([{ sql: /FROM season_end_progress WHERE league_id = \? AND season_number = \? AND phase = 'deadline_shift'/, first: { exists: 1 } }]);
    expect(await deadlinesAlreadyShifted(jakoD1(db), 5)).toBe(true);
    expect(db.dotazy[0]?.params).toEqual(["__sponsor_promises__", 5]);
  });

  it("false, když marker chybí", async () => {
    const db = new FalesnaD1([{ sql: /FROM season_end_progress WHERE league_id = \? AND season_number = \? AND phase = 'deadline_shift'/, first: null }]);
    expect(await deadlinesAlreadyShifted(jakoD1(db), 5)).toBe(false);
  });
});
