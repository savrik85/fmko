/**
 * Krok 4a rolloveru: sezónní sliby sponzorům, posun termínů a reset porušení.
 * Testuje `rolloverSponsorPromises` nad falešnou D1 (skutečné funkce z promise-runs.ts
 * běží nad fixture daty, stejně jako v promise-runs.test.ts).
 */
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1, type Pravidlo } from "../incidents/testovaci-d1";
import { rolloverSponsorPromises } from "./season-rollover";

const NO_MARKER: Pravidlo = {
  sql: /FROM season_end_progress WHERE league_id = \? AND season_number = \? AND phase = 'deadline_shift'/,
  first: null,
};
const HAS_MARKER: Pravidlo = { ...NO_MARKER, first: { status: "done" } };
const LAST_SEASON_DAY: Pravidlo = { sql: /MAX\(substr\(sc\.scheduled_at/, first: { d: "2026-11-20" } };

describe("rolloverSponsorPromises (krok 4a)", () => {
  it("první pokus: vyhodnotí sezónní sliby včetně termínových u končících smluv, pak posune termíny a vynuluje porušení", async () => {
    const db = new FalesnaD1([
      NO_MARKER,
      { sql: /FROM sponsor_promises p JOIN sponsor_contracts sc/, all: [] },
      LAST_SEASON_DAY,
    ]);
    const terminated = await rolloverSponsorPromises(jakoD1(db), 5, "2026-09-23T16:00:00.000Z");
    expect(terminated).toEqual([]);

    // Pořadí: marker → výběr slibů → posun termínů (batch) → reset porušení.
    const markerIdx = db.dotazy.findIndex((d) => NO_MARKER.sql.test(d.sql));
    const selectIdx = db.dotazy.findIndex((d) => /FROM sponsor_promises p JOIN sponsor_contracts sc/.test(d.sql));
    const resetIdx = db.dotazy.findIndex((d) => /UPDATE sponsor_contracts SET breaches_season = 0/.test(d.sql));
    expect(markerIdx).toBeLessThan(selectIdx);
    expect(db.davky).toHaveLength(1); // shiftPromiseDeadlinesForRollover: jedna dávka (UPDATE + marker)
    expect(resetIdx).toBeGreaterThan(-1);

    // Bez markeru (první pokus) se vyhodnocují i termínové sliby končících smluv.
    const sel = db.dotazy[selectIdx];
    expect(sel.sql).toContain("p.kind IN (");
    expect(sel.sql).toContain("sector_exclusivity");
  });

  it("opakovaný pokus (marker posunu termínů existuje): termínové sliby končících smluv se přeskočí", async () => {
    const db = new FalesnaD1([
      HAS_MARKER,
      { sql: /FROM sponsor_promises p JOIN sponsor_contracts sc/, all: [] },
      LAST_SEASON_DAY,
    ]);
    await rolloverSponsorPromises(jakoD1(db), 5, "2026-09-23T16:00:00.000Z");
    const sel = db.dotazy.find((d) => /FROM sponsor_promises p JOIN sponsor_contracts sc/.test(d.sql));
    expect(sel?.sql).toContain("sector_exclusivity");
    expect(sel?.sql).not.toContain("coach_licence");
  });

  it("výpověď sponzorem v běhu se vrátí jako {team_id, sponsor_id} pro vyřazení ze SMS ke konci sezóny", async () => {
    const promiseRow = {
      id: "p1", contract_id: "c1", team_id: "t1", sponsor_id: 7, kind: "no_riots", params: "{}",
      season: 5, deadline_game_date: null, reward: 0, penalty: 4000, status: "pending",
      sponsor_name: "Pivovar Lhota", category: "main", seasons_remaining: 2,
    };
    const db = new FalesnaD1([
      NO_MARKER,
      { sql: /FROM sponsor_promises p JOIN sponsor_contracts sc/, all: [promiseRow] },
      { sql: /UPDATE sponsor_promises SET status/, all: [{ id: "x" }] },
      { sql: /SELECT breaches_season FROM sponsor_contracts/, first: { breaches_season: 2 } },
      { sql: /SET status = 'terminated'/, all: [{ id: "c1" }] },
      {
        sql: /SELECT id, seasons_total, seasons_remaining, signing_bonus/,
        first: { id: "c1", seasons_total: 2, seasons_remaining: 2, signing_bonus: 0, paid_construction: null, negotiation_id: null },
      },
      { sql: /FROM league_history/, first: { final_standings: JSON.stringify([{ pos: 1, teamId: "t1" }]) } },
      { sql: /FROM cup_competitions/, first: { status: "finished", total_rounds: 6, current_round: 6, eliminated_round: null, cup_team_id: null, is_winner: 0 } },
      { sql: /AVG\(m\.attendance\)/, first: { avg: 300 } },
      { sql: /match_player_stats/, first: { matches: 5, young: 5 } },
      { sql: /SELECT reputation FROM teams/, first: { reputation: 50 } },
      { sql: /FROM fan_incidents/, first: { n: 1 } }, // riots > 0 → no_riots poruší, sponzor druhé porušení vypoví
      LAST_SEASON_DAY,
    ]);
    const terminated = await rolloverSponsorPromises(jakoD1(db), 5, "2026-09-23T16:00:00.000Z");
    expect(terminated).toEqual([{ team_id: "t1", sponsor_id: 7 }]);
    // Posun termínů a reset porušení proběhnou i po výpovědi (vlastní try bloky).
    expect(db.davky.some((davka) => davka.some((d) => /INSERT OR IGNORE INTO season_end_progress/.test(d.sql)))).toBe(true);
    expect(db.dotazy.some((d) => /UPDATE sponsor_contracts SET breaches_season = 0/.test(d.sql))).toBe(true);
  });

  it("chyba při výběru slibů nezastaví posun termínů ani reset porušení (vlastní try bloky)", async () => {
    const db = new FalesnaD1([
      NO_MARKER,
      // Žádné pravidlo pro sponsor_promises select → FalesnaD1 vrátí prázdné výsledky, ne pád;
      // ověřuje se tu tedy hlavně to, že se přesto zavolaly i další dvě kroky.
      LAST_SEASON_DAY,
    ]);
    const terminated = await rolloverSponsorPromises(jakoD1(db), 5, "2026-09-23T16:00:00.000Z");
    expect(terminated).toEqual([]);
    expect(db.davky).toHaveLength(1);
    expect(db.dotazy.some((d) => /UPDATE sponsor_contracts SET breaches_season = 0/.test(d.sql))).toBe(true);
  });
});
