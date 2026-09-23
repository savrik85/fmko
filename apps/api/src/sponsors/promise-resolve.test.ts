/**
 * Důsledky slibů nad falešnou D1: nárok a peníze v jedné dávce s podmínkou nároku, bonus
 * a pokuta jako transakce, náklonnost přes deník, počítadlo porušení, výpověď sponzorem
 * s vratkou zálohy a jedna SMS za smlouvu.
 */
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1, type Pravidlo, type ZaznamDotazu } from "../incidents/testovaci-d1";
import { MONTHS_PER_SEASON } from "./ambition";
import {
  applyContractOutcomes, terminateContractBySponsor, type ContractRow, type PromiseEvaluation, type PromiseRow,
} from "./promise-resolve";

const CONTRACT: ContractRow = {
  id: "c1", team_id: "t1", sponsor_id: 7, sponsor_name: "Pivovar Lhota", category: "main", seasons_remaining: 2,
};
const CTX = { gameDate: "2026-09-23T16:00:00.000Z", day: "2026-09-23" };

function row(id: string, kind: string, over: Partial<PromiseRow> = {}): PromiseRow {
  return {
    id, contract_id: "c1", team_id: "t1", sponsor_id: 7, kind, params: "{}", season: 5, deadline_game_date: null,
    reward: 0, penalty: 8000, status: "pending", ...over,
  };
}

function ev(r: PromiseRow, outcome: PromiseEvaluation["outcome"], actual: number | null = null): PromiseEvaluation {
  return { row: r, kind: r.kind as PromiseEvaluation["kind"], outcome, actual };
}

function rules(over: Pravidlo[] = []): Pravidlo[] {
  return [
    ...over,
    { sql: /SELECT breaches_season FROM sponsor_contracts/, first: { breaches_season: 1 } },
    { sql: /SELECT reputation FROM teams/, first: { reputation: 50 } },
    { sql: /FROM teams t JOIN villages v/, first: { name: "FK Pivovar Lhota Lhota", village_name: "Lhota" } },
    { sql: /SET status = 'terminated'/, all: [{ id: "c1" }] },
    { sql: /UPDATE teams SET budget = budget \+ \? WHERE id = \? RETURNING budget/, first: { budget: 1000 } },
  ];
}

const vse = (db: FalesnaD1): ZaznamDotazu[] => [...db.dotazy, ...db.davky.flat()];
const transakce = (db: FalesnaD1) => vse(db).filter((d) => /INSERT INTO transactions/.test(d.sql));
const sms = (db: FalesnaD1) => db.dotazy.filter((d) => /INSERT OR IGNORE INTO sponsor_owner_sms/.test(d.sql));
const denik = (db: FalesnaD1) => db.davky.flat().filter((d) => /INSERT INTO sponsor_favor_log/.test(d.sql));

describe("applyContractOutcomes", () => {
  it("splněný slib s bonusem: nárok, transakce, +5 do deníku a značka nároku v jedné dávce, SMS promise_kept", async () => {
    const db = new FalesnaD1(rules());
    const r = row("p1", "reputation", { params: '{"reputation":60}', reward: 12000 });
    const out = await applyContractOutcomes(jakoD1(db), CONTRACT, [ev(r, "fulfilled", 64)], CTX);
    expect(out).toEqual({ applied: [ev(r, "fulfilled", 64)], terminated: false, terminatedSponsorId: null });

    expect(db.davky).toHaveLength(1);
    const davka = db.davky[0];
    // Nárok je první, jen u čekajícího slibu aktivní smlouvy, a do resolved_at dá značku běhu.
    expect(davka[0].sql).toMatch(/UPDATE sponsor_promises SET status/);
    expect(davka[0].sql).toMatch(/status = 'pending'/);
    expect(davka[0].sql).toMatch(/sponsor_contracts WHERE id = \? AND status = 'active'/);
    const [outcome, actual, token, id, contractId] = davka[0].params;
    expect([outcome, actual, id, contractId]).toEqual(["fulfilled", 64, "p1", "c1"]);
    expect(String(token)).toMatch(/^claim:/);
    // Všechno mezi nárokem a posledním příkazem platí jen se značkou tohoto běhu.
    for (const d of davka.slice(1, -1)) {
      expect(d.sql).toMatch(/resolved_at = \?/);
      expect(d.params).toContain(token);
    }
    // Poslední příkaz přepíše značku na herní datum.
    expect(davka[davka.length - 1].params).toEqual([CTX.gameDate, "p1", token]);

    const tx = transakce(db);
    expect(tx).toHaveLength(1);
    expect(tx[0].params[2]).toBe("sponsor_bonus");
    expect(tx[0].params[3]).toBe(12000);
    expect(tx[0].params[5]).toBe("Pivovar Lhota: bonus za splněný slib (reputace aspoň 60 na konci sezóny)");
    expect(tx[0].params[6]).toBe("promise:p1");
    expect(tx[0].params[7]).toBe(CTX.gameDate);
    expect(denik(db)[0].params.slice(2, 4)).toEqual([5, "splněný slib: reputace aspoň 60 na konci sezóny"]);
    expect(db.pocet(/breaches_season = breaches_season \+ 1/)).toBe(0);
    expect(sms(db)[0].params[3]).toBe("promise_kept");
    expect(sms(db)[0].params[4]).toBe("promise:p1");
    expect(JSON.parse(sms(db)[0].params[6] as string)).toEqual({ slib: "reputace aspoň 60 na konci sezóny" });
  });

  it("splněný slib bez bonusu: žádná transakce, náklonnost ano", async () => {
    const db = new FalesnaD1(rules());
    await applyContractOutcomes(jakoD1(db), CONTRACT, [ev(row("p1", "no_riots", { reward: 0 }), "fulfilled", 0)], CTX);
    expect(transakce(db)).toHaveLength(0);
    expect(denik(db)[0].params[2]).toBe(5);
  });

  it("slib už vyřízený jiným během (nárok nic nezměnil): žádná SMS, výpověď ani čtení porušení", async () => {
    const db = new FalesnaD1(rules([{ sql: /UPDATE sponsor_promises SET status/, changes: 0 }]));
    const out = await applyContractOutcomes(jakoD1(db), CONTRACT, [ev(row("p1", "no_riots"), "broken", 1)], CTX);
    expect(out).toEqual({ applied: [], terminated: false, terminatedSponsorId: null });
    expect(sms(db)).toHaveLength(0);
    expect(db.pocet(/SELECT breaches_season/)).toBe(0);
    expect(db.pocet(/SET status = 'terminated'/)).toBe(0);
  });

  it("pád dávky: slib zůstává čekat, další slib téže smlouvy se vyřídí", async () => {
    const db = new FalesnaD1(rules());
    let first = true;
    const orig = db.batch.bind(db);
    db.batch = async (d) => {
      if (first) { first = false; throw new Error("D1 down"); }
      return orig(d);
    };
    const r2 = row("p2", "no_riots", { reward: 5000 });
    const out = await applyContractOutcomes(jakoD1(db), CONTRACT,
      [ev(row("p1", "reputation", { params: '{"reputation":60}', reward: 12000 }), "fulfilled", 64), ev(r2, "fulfilled", 0)], CTX);
    expect(out.applied).toEqual([ev(r2, "fulfilled", 0)]);
    expect(transakce(db).map((t) => t.params[3])).toEqual([5000]);
  });

  it("těsně vedle: polovina pokuty, −3, porušení se nepočítá", async () => {
    const db = new FalesnaD1(rules());
    await applyContractOutcomes(jakoD1(db), CONTRACT, [ev(row("p1", "league_position", { params: '{"position":3}', penalty: 9000 }), "partial", 4)], CTX);
    expect(transakce(db)[0].params.slice(2, 4)).toEqual(["sponsor_penalty", -4500]);
    expect(denik(db)[0].params[2]).toBe(-3);
    expect(db.pocet(/breaches_season = breaches_season \+ 1/)).toBe(0);
    expect(sms(db)[0].params[3]).toBe("promise_broken");
  });

  it("první porušení: pokuta, −8, počítadlo v téže dávce, smlouva trvá", async () => {
    const db = new FalesnaD1(rules());
    const out = await applyContractOutcomes(jakoD1(db), CONTRACT, [ev(row("p1", "league_position", { params: '{"position":3}' }), "broken", 7)], CTX);
    expect(out.terminated).toBe(false);
    expect(transakce(db)[0].params.slice(2, 4)).toEqual(["sponsor_penalty", -8000]);
    expect(denik(db)[0].params[2]).toBe(-8);
    const breach = db.davky[0].find((d) => /breaches_season = breaches_season \+ 1/.test(d.sql));
    expect(breach?.params[0]).toBe("c1");
    expect(db.pocet(/SET status = 'terminated'/)).toBe(0);
    expect(sms(db)[0].params[3]).toBe("promise_broken");
    expect(sms(db)[0].params[4]).toBe("promise:p1");
  });

  it("jedna SMS za smlouvu: porušení přebije splnění", async () => {
    const db = new FalesnaD1(rules());
    await applyContractOutcomes(jakoD1(db), CONTRACT, [
      ev(row("p1", "no_riots", { reward: 3000 }), "fulfilled", 0),
      ev(row("p2", "league_position", { params: '{"position":3}' }), "broken", 6),
    ], CTX);
    expect(db.davky).toHaveLength(2);
    expect(sms(db)).toHaveLength(1);
    expect(sms(db)[0].params[3]).toBe("promise_broken");
    expect(sms(db)[0].params[4]).toBe("promise:p2");
  });

  it("druhé porušení v sezóně: výpověď, návrat názvu, reputace −5, zpráva do ligy, jediná SMS o výpovědi", async () => {
    const db = new FalesnaD1(rules([{ sql: /SELECT breaches_season FROM sponsor_contracts/, first: { breaches_season: 2 } }]));
    const out = await applyContractOutcomes(jakoD1(db), CONTRACT, [ev(row("p1", "no_riots"), "broken", 2)], CTX);
    expect(out).toMatchObject({ terminated: true, terminatedSponsorId: 7 });
    const rename = db.davky.flat().find((d) => /UPDATE teams SET name = \? WHERE id = \?/.test(d.sql));
    expect(rename?.params).toEqual(["SK Lhota", "t1"]);
    const rep = db.davky.flat().find((d) => /INSERT INTO reputation_log/.test(d.sql));
    expect(rep?.params[3]).toBe(-5);
    expect(rep?.params[7]).toBe("sponsor-quit-c1");
    expect(db.pocet(/INSERT INTO news/)).toBe(1);
    expect(sms(db)).toHaveLength(1);
    expect(sms(db)[0].params[3]).toBe("sponsor_terminates");
    expect(sms(db)[0].params[4]).toBe("sponsor-quit:c1");
    // Klub neplatí výpovědní pokutu; smlouva bez jednání nemá zálohu, takže ani vratku.
    expect(transakce(db).map((t) => t.params[2])).toEqual(["sponsor_penalty"]);
  });

  it("porušený nesestup vypoví smlouvu hned, i jako první porušení", async () => {
    const db = new FalesnaD1(rules());
    const out = await applyContractOutcomes(jakoD1(db), CONTRACT, [ev(row("p1", "no_relegation"), "broken", 13)], CTX);
    expect(out.terminated).toBe(true);
  });

  it("těsně vedle u postupu smlouvu nevypoví", async () => {
    const db = new FalesnaD1(rules([{ sql: /SELECT breaches_season FROM sponsor_contracts/, first: { breaches_season: 5 } }]));
    const out = await applyContractOutcomes(jakoD1(db), CONTRACT, [ev(row("p1", "league_position", { params: '{"position":3}' }), "partial", 4)], CTX);
    expect(out.terminated).toBe(false);
    expect(db.pocet(/SET status = 'terminated'/)).toBe(0);
  });

  it("výpověď sponzora stadionu vrátí název stadionu, klub se nepřejmenuje", async () => {
    const db = new FalesnaD1(rules());
    await applyContractOutcomes(jakoD1(db), { ...CONTRACT, category: "stadium" }, [ev(row("p1", "promotion"), "broken", 5)], CTX);
    expect(db.dotazy.find((d) => /UPDATE teams SET stadium_name/.test(d.sql))?.params).toEqual(["Sportovní areál Lhota", "t1"]);
    expect(db.pocet(/UPDATE teams SET name = \? WHERE id = \?/)).toBe(0);
  });

  it("smlouvu už vypověděl jiný běh: žádné přejmenování ani reputace, SMS o porušení", async () => {
    const db = new FalesnaD1(rules([{ sql: /SET status = 'terminated'/, all: [] }]));
    const out = await applyContractOutcomes(jakoD1(db), CONTRACT, [ev(row("p1", "promotion"), "broken", 5)], CTX);
    expect(out).toMatchObject({ terminated: false, terminatedSponsorId: null });
    expect(db.pocet(/UPDATE teams SET name/)).toBe(0);
    expect(db.pocet(/INSERT INTO reputation_log/)).toBe(0);
    expect(sms(db)[0].params[3]).toBe("promise_broken");
  });

  it("popisek pohárového slibu bere počet kol soutěže z kontextu", async () => {
    const db = new FalesnaD1(rules());
    const r = row("p1", "cup_round", { params: '{"round":4}', reward: 1000 });
    await applyContractOutcomes(jakoD1(db), CONTRACT, [ev(r, "fulfilled", 4)], { ...CTX, cupTotalRounds: 4 });
    expect(transakce(db)[0].params[5]).toMatch(/finále/);
  });
});

describe("terminateContractBySponsor", () => {
  const ADVANCE = {
    id: "c1", seasons_total: 2, seasons_remaining: 2, signing_bonus: 60000, paid_construction: null, negotiation_id: "n1",
  };

  it("smlouva z jednání: vratka nesplacené zálohy, v rolloveru s celou odehranou sezónou", async () => {
    const db = new FalesnaD1(rules([
      { sql: /SELECT id, seasons_total, seasons_remaining/, first: ADVANCE },
      { sql: /COALESCE\(SUM\(reward\), 0\) AS total/, first: { total: 0 } },
      { sql: /UPDATE teams SET budget = budget \+ \? WHERE id = \? RETURNING budget/, first: { budget: 1000 } },
    ]));
    const ok = await terminateContractBySponsor(jakoD1(db), CONTRACT, { ...CTX, progressMonths: MONTHS_PER_SEASON });
    expect(ok).toBe(true);
    // Postup sezóny z kontextu, kalendář klubu se nečte.
    expect(db.pocet(/SELECT game_date, season_start, season_end/)).toBe(0);
    const tx = transakce(db);
    expect(tx).toHaveLength(1);
    // Odehraná 1 sezóna ze 2: vrací se polovina příspěvku za podpis.
    expect(tx[0].params.slice(2, 7)).toEqual(["sponsor_termination", -30000, 1000, "Vrácení nesplacené zálohy: Pivovar Lhota", "sponsor-clawback-c1"]);
    const smsRed = db.dotazy.find((d) => /INSERT INTO messages/.test(d.sql));
    expect(String(smsRed?.params[3])).toContain("Nesplacenou část zálohy vracíme, 30");
    expect(String(smsRed?.params[3])).not.toContain("—");
  });

  it("mimo rollover spočítá postup sezóny z kalendáře klubu", async () => {
    const db = new FalesnaD1(rules([
      { sql: /SELECT id, seasons_total, seasons_remaining/, first: ADVANCE },
      { sql: /COALESCE\(SUM\(reward\), 0\) AS total/, first: { total: 0 } },
      { sql: /SELECT game_date, season_start, season_end/, first: {
        game_date: "2026-09-01T12:00:00.000Z", season_start: "2026-09-01T00:00:00.000Z", season_end: "2026-12-01T00:00:00.000Z", league_id: "l1",
      } },
    ]));
    await terminateContractBySponsor(jakoD1(db), CONTRACT, CTX);
    expect(db.pocet(/SELECT game_date, season_start, season_end/)).toBe(1);
    // Skoro na začátku první sezóny: vrací se skoro celý příspěvek.
    const amount = transakce(db)[0].params[3] as number;
    expect(amount).toBeLessThan(-59000);
    expect(amount).toBeGreaterThanOrEqual(-60000);
  });

  it("nárok nevyšel: nic dalšího se neděje", async () => {
    const db = new FalesnaD1(rules([{ sql: /SET status = 'terminated'/, all: [] }]));
    expect(await terminateContractBySponsor(jakoD1(db), CONTRACT, CTX)).toBe(false);
    expect(db.dotazy).toHaveLength(1);
    expect(db.davky).toHaveLength(0);
  });

  it("výpověď bannerového sponzora: bez přejmenování, logo z rukávu pryč, zpráva do ligy", async () => {
    const db = new FalesnaD1(rules());
    await terminateContractBySponsor(jakoD1(db), { ...CONTRACT, category: "banner" }, CTX);
    expect(db.pocet(/UPDATE teams SET name/)).toBe(0);
    expect(db.pocet(/UPDATE teams SET stadium_name/)).toBe(0);
    expect(db.dotazy.find((d) => /sleeve_sponsor_id = NULL/.test(d.sql))?.params).toEqual(["t1", 7]);
    const news = db.dotazy.find((d) => /INSERT INTO news/.test(d.sql));
    expect(news?.params[3]).toBe("sponsor");
  });
});
