/**
 * Nákup AI klubu na skutečné D1 (Miniflare, všechny migrace): jednání s klubem mimo hru
 * stejnou službou jako člověk, strop ceny, úkol pro skauta a zamlžený odhad z hlášení.
 *
 * Model navrhuje, kód hlídá: výběr hráče a částky modelem (falešný binding Workers AI),
 * neplatná odpověď a režim off rozhodne pravidlo, shadow jen zapíše, přijetí nad strop neprojde.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { marketValue } from "@okresni-masina/shared";
import type { Bindings } from "../index";
import { COACH_MODEL } from "./llm";
import { COACH_MODE_KEY } from "./mode";
import { generateAiProfile, type AiCoachProfile } from "./profile";
import {
  loadScoutReportCandidates, maybeStartScoutTask, negotiateOutsidePurchase, outsideCandidateFromListing,
} from "./outside-buy";
import { runTransferMarket } from "./transfer-market";

let mf: Miniflare;
let db: D1Database;
let kv: KVNamespace;

const AI_CLUB = "ai-buyer";
const LEAGUE = "l-op";
const START_BUDGET = 200_000;
const GAME_DATE = "2026-10-26T16:00:00.000Z";
const FUTURE = "2099-01-01T00:00:00.000Z";

/** Neobchodník (nic nevystaví) se šetrností pod 60 (pravidlo si nepůjčuje), formace 4-4-2. */
const PROFILE: AiCoachProfile = { ...generateAiProfile(AI_CLUB, null), ambition: 60, thrift: 30, trading: 40, patience: 50, favouriteFormations: ["4-4-2"] };
const CLUB = { teamId: AI_CLUB, name: "Sokol Vlachovo Březí", profile: PROFILE, spendable: 150_000 };

const SKILLS = {
  speed: 40, technique: 45, shooting: 42, passing: 44, heading: 38, defense: 35, goalkeeping: 10,
  stamina: 50, strength: 45, vision: 40, creativity: 41, setPieces: 30,
};

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["CACHE_KV"],
  });
  db = await mf.getD1Database("DB");
  kv = (await mf.getKVNamespace("CACHE_KV")) as unknown as KVNamespace;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }
  // `transfer_listings.rejected_by` má produkce, ale žádná migrace ho nezakládá (přidán ručně).
  const hasRejectedBy = await db.prepare("SELECT 1 FROM pragma_table_info('transfer_listings') WHERE name = 'rejected_by'").first();
  if (!hasRejectedBy) await db.exec("ALTER TABLE transfer_listings ADD COLUMN rejected_by TEXT");
}, 120_000);

afterAll(async () => { await mf.dispose(); });

function virtualPlayer(position: string, rating: number) {
  return {
    firstName: "Marek", lastName: `Mimo${position}`, age: 25, position, overallRating: rating,
    skills: SKILLS, physical: { height: 180, weight: 78, preferredFoot: "right" },
    personality: { workRate: 70, loyalty: 55, alcohol: 20, temper: 40, leadership: 50, discipline: 60 },
    weeklyWage: 200, fromTeam: "TJ Mimo hru", fromCity: "Netolice", fromDistrict: "Prachatice",
  };
}

async function insertListing(id: string, position: string, rating: number, askingPrice: number) {
  await db.prepare(
    `INSERT INTO transfer_listings (id, player_id, team_id, asking_price, league_id, status, expires_at, is_ai_listing, ai_player_data)
     VALUES (?, 'virtual_ai', 'virtual_ai', ?, ?, 'active', ?, 1, ?)`,
  ).bind(id, askingPrice, LEAGUE, FUTURE, JSON.stringify(virtualPlayer(position, rating))).run();
}

async function listingRow(id: string): Promise<Record<string, unknown>> {
  return (await db.prepare("SELECT * FROM transfer_listings WHERE id = ?").bind(id).first<Record<string, unknown>>())!;
}

async function budget(): Promise<number> {
  return (await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(AI_CLUB).first<{ budget: number }>())!.budget;
}

async function squadSize(): Promise<number> {
  return (await db.prepare("SELECT COUNT(*) AS n FROM players WHERE team_id = ?").bind(AI_CLUB).first<{ n: number }>())!.n;
}

/**
 * Úklid mezi testy: nákup zapíše hráče, smlouvu, transakce, zprávy i novinky, takže se mažou
 * všechny tabulky s vazbou na tým, hráče nebo jednání, v několika průchodech kvůli cizím klíčům.
 */
async function wipe(): Promise<void> {
  const linked = (await db.prepare(
    `SELECT DISTINCT m.name FROM sqlite_master m WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%'
       AND (EXISTS (SELECT 1 FROM pragma_table_info(m.name) p
                     WHERE p.name IN ('team_id', 'player_id', 'buyer_team_id', 'seller_team_id', 'from_team_id', 'to_team_id', 'negotiation_id', 'assignment_id'))
         OR EXISTS (SELECT 1 FROM pragma_foreign_key_list(m.name) f
                     WHERE f."table" IN ('teams', 'players', 'leagues', 'seasons', 'managers', 'staff_members', 'scout_assignments', 'ai_negotiations',
                                         'transfer_listings', 'transfer_offers', 'conversations')))`,
  ).all<{ name: string }>()).results.map((r) => r.name);
  const tables = [...new Set([...linked, "players", "managers", "teams", "leagues", "seasons"])];
  let lastError = "";
  for (let pass = 0; pass < 6; pass++) {
    const failed: string[] = [];
    for (const t of tables) {
      try {
        await db.prepare(`DELETE FROM ${t}`).run();
      } catch (e) {
        failed.push(t);
        lastError = `${t}: ${String(e)}`;
      }
    }
    if (failed.length === 0) return;
  }
  throw new Error(`úklid testovací databáze se nepovedl: ${lastError}`);
}

beforeEach(async () => {
  await wipe();
  // Volní hráči nemají vazbu na tým, úklid je nesebere; přepínač AI trenérů zpátky na výchozí.
  await db.prepare("DELETE FROM free_agents").run();
  await kv.delete(COACH_MODE_KEY);
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('ai', 'ai@system.local', 'none')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('s-1', 1, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES (?, 's-1', 'Prachatice', 'Okresní přebor', 'okresni_prebor')").bind(LEAGUE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date) VALUES (?, 'ai', 'p06', 'Sokol Vlachovo Březí', ?, ?, 'senior', ?)")
      .bind(AI_CLUB, START_BUDGET, LEAGUE, GAME_DATE),
  ]);
  const players: D1PreparedStatement[] = [];
  for (let i = 0; i < 14; i++) {
    players.push(db.prepare(
      `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, status)
       VALUES (?, ?, 'Jan', ?, 26, ?, 30, ?, '{}', '{}', '{}', '{}', 'active')`,
    ).bind(`p${i}`, AI_CLUB, `Hráč${i}`, ["GK", "DEF", "MID", "FWD"][i % 4], JSON.stringify(SKILLS)));
  }
  await db.batch(players);
});

describe("AI klub kupuje od klubu mimo hru", () => {
  it("inzerát: jedná do stropu stejnou službou jako člověk a nikdy nezaplatí víc než strop", async () => {
    // Hráč se při podpisu rozhoduje seedovaně podle inzerátu: pár inzerátů, ať projde i podpis.
    let signedOnce = false;
    for (let i = 1; i <= 6 && !signedOnce; i++) {
      const id = `vl-fwd-${i}`;
      await insertListing(id, "FWD", 45, 6000);
      const cand = outsideCandidateFromListing(await listingRow(id));
      expect(cand).toMatchObject({ source: "listing", position: "FWD", rating: 45, askingPrice: 6000 });
      const before = { budget: await budget(), squad: await squadSize() };
      const res = await negotiateOutsidePurchase(db, CLUB, cand!, 4500, 7000, new Date());
      expect(["signed", "refused"]).toContain(res.result);
      const neg = await db.prepare("SELECT status FROM ai_negotiations WHERE team_id = ? AND listing_id = ?").bind(AI_CLUB, id).first<{ status: string }>();
      if (res.result === "signed") {
        signedOnce = true;
        expect(res.amount).toBeLessThanOrEqual(7000);
        expect(neg?.status).toBe("signed");
        expect(await budget()).toBe(before.budget - res.amount);
        expect(await squadSize()).toBe(before.squad + 1);
      } else {
        // Hráč odmítl (dojíždění, síla klubu): nic se nezaplatilo ani nepřesunulo.
        expect(neg?.status).toBe("refused");
        expect(await budget()).toBe(before.budget);
        expect(await squadSize()).toBe(before.squad);
      }
    }
    expect(signedOnce).toBe(true);
  });

  it("nad strop jednání ukončí a nic nezaplatí", async () => {
    await insertListing("vl-mid", "MID", 50, 20_000);
    const cand = outsideCandidateFromListing(await listingRow("vl-mid"))!;
    const res = await negotiateOutsidePurchase(db, CLUB, cand, 3000, 3500, new Date());
    expect(["too_expensive", "broken_off"]).toContain(res.result);
    const neg = await db.prepare("SELECT status FROM ai_negotiations WHERE team_id = ?").bind(AI_CLUB).first<{ status: string }>();
    expect(["withdrawn", "broken_off"]).toContain(neg?.status);
    expect(await budget()).toBe(START_BUDGET);
    expect(await squadSize()).toBe(14);
  });

  it("hlášení skauta: AI vidí jen střed odhadu, ne skutečné hodnocení", async () => {
    await db.prepare(
      `INSERT INTO scout_reports (id, team_id, source, club_name, district, distance_km, player_data, first_name, last_name, age, position,
         rating_lo, rating_hi, ask_hint, status, expires_at, created_game_date)
       VALUES ('sr-1', ?, 'village_club', 'TJ Mimo hru', 'Prachatice', 12, ?, 'Marek', 'Skrytý', 24, 'DEF', 40, 50, 9000, 'active', ?, '2026-10-26')`,
    ).bind(AI_CLUB, JSON.stringify(virtualPlayer("DEF", 60)), FUTURE).run();
    const cands = await loadScoutReportCandidates(db, AI_CLUB, new Date());
    expect(cands).toEqual([{
      source: "scout_report", sourceId: "sr-1", position: "DEF", age: 24, rating: 45, ratingRange: { lo: 40, hi: 50 }, askingPrice: 9000,
    }]);
  });

  it("skaut bez práce vyjede na post, kde klub hledá; na stejný post druhý úkol nedostane", async () => {
    await db.prepare(
      `INSERT INTO staff_members (id, district, team_id, role, profession, first_name, last_name, age, judgement, communication, weekly_wage, signing_fee, avatar, hired_at)
       VALUES ('sc-1', 'Prachatice', ?, 'skaut', 'skaut', 'Karel', 'Skaut', 50, 14, 12, 300, 1000, '{}', '2026-10-01')`,
    ).bind(AI_CLUB).run();
    const profile = generateAiProfile(AI_CLUB, null);
    expect(await maybeStartScoutTask(db, { teamId: AI_CLUB, profile, spendable: 1000 }, "FWD", "2026-10-26"))
      .toMatchObject({ started: false });
    const started = await maybeStartScoutTask(db, { teamId: AI_CLUB, profile, spendable: 50_000 }, "FWD", "2026-10-26");
    expect(started).toMatchObject({ started: true, position: "FWD" });
    const task = await db.prepare("SELECT positions, weeks_total, status FROM scout_assignments WHERE team_id = ?").bind(AI_CLUB)
      .first<{ positions: string; weeks_total: number; status: string }>();
    expect(task).toMatchObject({ positions: '["FWD"]', weeks_total: 2, status: "active" });
    expect(await maybeStartScoutTask(db, { teamId: AI_CLUB, profile, spendable: 50_000 }, "FWD", "2026-10-26"))
      .toEqual({ started: false, reason: "skaut už post hledá" });
  });
});

interface FakeCall {
  name: string;
  choices: string[];
  prompt: string;
}

/**
 * Falešný binding Workers AI: odpověď podle schématu (`buy_pick` = výběr hráče, `buy_negotiation`
 * = tah v jednání) a podle toho, kolikrát už se na totéž ptal. Zaznamená každé volání.
 */
function fakeAi(respond: (call: FakeCall & { n: number }) => unknown) {
  const calls: FakeCall[] = [];
  const run = async (_model: string, input: {
    messages: Array<{ role: string; content: string }>;
    response_format?: { json_schema?: { name?: string; schema?: { properties?: Record<string, { enum?: string[] }> } } };
  }) => {
    const js = input.response_format?.json_schema;
    const props = js?.schema?.properties ?? {};
    const call: FakeCall = {
      name: js?.name ?? "", choices: props.choice?.enum ?? props.action?.enum ?? [],
      prompt: input.messages.find((m) => m.role === "user")?.content ?? "",
    };
    calls.push(call);
    const answer = respond({ ...call, n: calls.filter((c) => c.name === call.name).length });
    return { choices: [{ message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
  };
  return { binding: { run }, calls };
}

function marketEnv(ai?: unknown): Bindings {
  return { DB: db, CACHE_KV: kv, AI: ai } as unknown as Bindings;
}

function modelUse(ai: { binding: unknown }) {
  return { useModel: true, ai: { AI: ai.binding } as unknown as Pick<Bindings, "AI">, mode: "on" as const };
}

async function runMarket(env: Bindings) {
  return runTransferMarket(env, AI_CLUB, new Date(), { profile: PROFILE, ignoreSchedule: true });
}

interface MarketLog {
  mode: string; model: string | null; used_fallback: number; error: string | null; raw_output: string | null; tokens_in: number | null;
}

async function marketLog(): Promise<MarketLog> {
  const row = await db.prepare("SELECT mode, model, used_fallback, error, raw_output, tokens_in FROM ai_coach_decisions WHERE team_id = ? AND kind = 'transfer_market'")
    .bind(AI_CLUB).first<MarketLog>();
  if (!row) throw new Error("trh nezapsal rozhodnutí do deníku");
  return row;
}

/** Návrhy AI klubu v jednání o inzerátu klubu mimo hru, od prvního. */
async function buyerBids(listingId: string): Promise<number[]> {
  const rows = await db.prepare(
    `SELECT e.amount FROM ai_negotiation_events e JOIN ai_negotiations n ON n.id = e.negotiation_id
      WHERE n.team_id = ? AND n.listing_id = ? AND e.actor = 'buyer' AND e.event_type = 'offer' ORDER BY e.created_at, e.rowid`,
  ).bind(AI_CLUB, listingId).all<{ amount: number }>();
  return rows.results.map((r) => r.amount);
}

async function count(sql: string, ...binds: unknown[]): Promise<number> {
  return (await db.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0;
}

/** Odpověď na výběr: dokud je hráč `c1` v nabídce, vezme ho za `bid`, pak už nic; v jednání odejde. */
function pickC1(bid: number) {
  return ({ name, choices }: FakeCall) => name === "buy_pick"
    ? (choices.includes("c1") ? { choice: "c1", bid, reason: "good value" } : { choice: "none", bid: 0, reason: "nothing else" })
    : { action: "withdraw", amount: 0, reason: "too expensive" };
}

// Kádr 14 hráčů po 30 bodech a formace 4-4-2: nejvíc chybí záložník (potřeba 1,0, posila od hodnocení 22).
describe("AI klub vybírá posilu modelem: model navrhuje, kód hlídá", () => {
  it("platný výběr a částku modelu provede kód stejnou službou jako u člověka a zapíše do deníku", async () => {
    await insertListing("vl-mid", "MID", 45, 6000);
    const ai = fakeAi(pickC1(5000));
    const res = await runMarket(marketEnv(ai.binding));
    expect(res.mode).toBe("on");

    const pick = ai.calls.find((c) => c.name === "buy_pick");
    expect(pick?.choices).toContain("c1");
    expect(pick?.choices).toContain("none");
    expect(pick?.prompt).toContain("Transfer-listed by a club outside the game for 6,000 CZK");
    // Strop z inzerátu (6 000), dole 70 % ceny z inzerátu.
    expect(pick?.prompt).toContain("Bid between 4,200 CZK and 6,000 CZK.");

    expect(res.actions.find((a) => a.kind === "outside_buy")).toMatchObject({ amount: 5000, decidedBy: "model", reason: "good value", position: "MID" });
    expect((await buyerBids("vl-mid"))[0]).toBe(5000);
    const log = await marketLog();
    expect(log).toMatchObject({ mode: "on", model: COACH_MODEL, used_fallback: 0 });
    expect(log.raw_output).toContain('"choice":"c1"');
    expect(log.tokens_in).toBeGreaterThanOrEqual(10);
  });

  it("částka mimo rozpětí: model neplatí, rozhodne pravidlo (cena z inzerátu) a dokončí den bez modelu", async () => {
    await insertListing("vl-mid", "MID", 45, 6000);
    const ai = fakeAi(({ name }) => name === "buy_pick" ? { choice: "c1", bid: 50_000, reason: "overpay" } : { action: "withdraw", amount: 0, reason: "" });
    const res = await runMarket(marketEnv(ai.binding));
    expect(res.actions.find((a) => a.kind === "outside_buy")).toMatchObject({ amount: 6000, decidedBy: "fallback", reason: "rules" });
    expect((await buyerBids("vl-mid"))[0]).toBe(6000);
    expect(ai.calls.filter((c) => c.name === "buy_pick")).toHaveLength(1);
    const log = await marketLog();
    expect(log).toMatchObject({ model: COACH_MODEL, used_fallback: 1 });
    expect(log.error).toContain("neplatná odpověď modelu");
  });

  it("neznámý hráč: model neplatí, rozhodne pravidlo", async () => {
    await insertListing("vl-mid", "MID", 45, 6000);
    const ai = fakeAi(() => ({ choice: "c7", bid: 5000, reason: "invented" }));
    const res = await runMarket(marketEnv(ai.binding));
    expect(res.actions.find((a) => a.kind === "outside_buy")).toMatchObject({ amount: 6000, decidedBy: "fallback" });
    expect((await marketLog()).used_fallback).toBe(1);
  });

  it("model řekne „nic“: žádná nabídka, jednání ani poptávka", async () => {
    await insertListing("vl-mid", "MID", 45, 6000);
    const ai = fakeAi(() => ({ choice: "none", bid: 0, reason: "keep the money" }));
    const res = await runMarket(marketEnv(ai.binding));
    expect(res.actions.find((a) => a.kind === "no_buy")).toMatchObject({ decidedBy: "model", reason: "keep the money", position: "MID" });
    expect(res.actions.some((a) => ["outside_buy", "bid", "offer", "demand", "loan_request", "sign_free_agent"].includes(a.kind))).toBe(false);
    expect(await count("SELECT COUNT(*) AS n FROM ai_negotiations WHERE team_id = ?", AI_CLUB)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM transfer_demands WHERE team_id = ?", AI_CLUB)).toBe(0);
    expect((await marketLog()).used_fallback).toBe(0);
  });

  it("režim shadow: model rozhodne a zapíše se to, ale nic se neprovede", async () => {
    await kv.put(COACH_MODE_KEY, JSON.stringify({ market: "shadow" }));
    await insertListing("vl-mid", "MID", 45, 6000);
    const ai = fakeAi(pickC1(5000));
    const res = await runMarket(marketEnv(ai.binding));
    expect(res.mode).toBe("shadow");
    expect(res.actions.find((a) => a.kind === "outside_buy")).toMatchObject({ result: "shadow", amount: 5000, decidedBy: "model" });
    expect(await count("SELECT COUNT(*) AS n FROM ai_negotiations WHERE team_id = ?", AI_CLUB)).toBe(0);
    expect(await budget()).toBe(START_BUDGET);
    const log = await marketLog();
    expect(log).toMatchObject({ mode: "shadow", model: COACH_MODEL, used_fallback: 0 });
    expect(log.raw_output).toContain('"choice":"c1"');
  });

  it("režim off: model se nevolá, rozhoduje pravidlo", async () => {
    await kv.put(COACH_MODE_KEY, JSON.stringify({ market: "off" }));
    await insertListing("vl-mid", "MID", 45, 6000);
    const ai = fakeAi(pickC1(5000));
    const res = await runMarket(marketEnv(ai.binding));
    expect(ai.calls).toHaveLength(0);
    expect(res.actions.find((a) => a.kind === "outside_buy")).toMatchObject({ amount: 6000, decidedBy: "fallback" });
    expect(await marketLog()).toMatchObject({ mode: "off", model: "rules", used_fallback: 1, error: null });
  });

  it("chybí binding Workers AI: rozhoduje pravidlo bez chyby", async () => {
    await insertListing("vl-mid", "MID", 45, 6000);
    const res = await runMarket(marketEnv(undefined));
    expect(res.actions.find((a) => a.kind === "outside_buy")).toMatchObject({ amount: 6000, decidedBy: "fallback" });
    expect(await marketLog()).toMatchObject({ mode: "on", model: "rules", used_fallback: 1, error: null });
  });

  it("přímá nabídka hráči lidského klubu v lize: částku z rozpětí pošle stejnou službou jako člověk", async () => {
    const village = (await db.prepare("SELECT id FROM villages WHERE district = 'Prachatice' AND id != 'p06' ORDER BY id LIMIT 1").first<{ id: string }>())!.id;
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('u-human', 'human@example.test', 'x')"),
      db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date) VALUES ('human-club', 'u-human', ?, 'Jiskra Lhenice', 50000, ?, 'senior', ?)")
        .bind(village, LEAGUE, GAME_DATE),
      db.prepare(
        `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, status)
         VALUES ('h-mid', 'human-club', 'Petr', 'Záložník', 26, 'MID', 40, ?, '{}', '{}', '{}', '{}', 'active')`,
      ).bind(JSON.stringify(SKILLS)),
    ]);
    // 80 % tržní hodnoty: nad urážlivou mezí (70 %) a pod stropem (aspoň 90 %).
    const bid = Math.floor((marketValue(40, 26, "MID") * 0.8) / 100) * 100;
    const ai = fakeAi(pickC1(bid));
    const res = await runMarket(marketEnv(ai.binding));
    expect(ai.calls[0]?.prompt).toContain("Plays for a club managed by a human player and is not transfer-listed");
    expect(res.actions.find((a) => a.kind === "offer")).toMatchObject({ playerId: "h-mid", amount: bid, result: "sent", decidedBy: "model" });
    const offer = await db.prepare("SELECT from_team_id, to_team_id, offer_amount, status FROM transfer_offers WHERE player_id = 'h-mid'").first();
    expect(offer).toEqual({ from_team_id: AI_CLUB, to_team_id: "human-club", offer_amount: bid, status: "pending" });
  });

  it("volný hráč na post: model nabídne mzdu z rozpětí, podpis jde přes stejnou službu", async () => {
    // 16 hráčů (dva obránci navíc): pod minimem kádru by volného hráče podepsalo nouzové pravidlo.
    await db.batch(["p14", "p15"].map((id) => db.prepare(
      `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, status)
       VALUES (?, ?, 'Jan', 'Obránce', 26, 'DEF', 30, ?, '{}', '{}', '{}', '{}', 'active')`,
    ).bind(id, AI_CLUB, JSON.stringify(SKILLS))));
    await db.prepare(
      `INSERT INTO free_agents (id, district, first_name, last_name, age, position, overall_rating, weekly_wage, village_id, expires_at)
       VALUES ('fa-mid', 'Prachatice', 'Volný', 'Záložník', 24, 'MID', 40, 200, 'p06', ?)`,
    ).bind(FUTURE).run();
    const ai = fakeAi(pickC1(230));
    const res = await runMarket(marketEnv(ai.binding));
    expect(ai.calls[0]?.prompt).toContain("Free agent without a club");
    expect(ai.calls[0]?.prompt).toContain("Offer a weekly wage between 200 CZK and 250 CZK.");
    const sign = res.actions.find((a) => a.kind === "sign_free_agent");
    expect(sign).toMatchObject({ playerId: "fa-mid", amount: 230, decidedBy: "model" });
    expect(["signed", "refused"]).toContain(sign?.result);
    if (sign?.result === "signed") {
      expect(await count("SELECT COUNT(*) AS n FROM players WHERE team_id = ? AND first_name = 'Volný' AND weekly_wage = 230", AI_CLUB)).toBe(1);
    }
  });
});

describe("jednání s klubem mimo hru modelem: přijetí nikdy nad strop", () => {
  it("přijetí nebo protinávrh nad strop model neprosadí: kód ho zahodí a pravidlo nabídne strop", async () => {
    const bad = [
      ["vl-exp-1", { action: "accept", amount: 0, reason: "just sign him" }],
      ["vl-exp-2", { action: "counter", amount: 9000, reason: "a bit more" }],
    ] as const;
    for (const [id, answer] of bad) {
      await insertListing(id, "MID", 50, 20_000);
      const cand = outsideCandidateFromListing(await listingRow(id))!;
      const ai = fakeAi(() => answer);
      const res = await negotiateOutsidePurchase(db, CLUB, cand, 6000, 7000, new Date(), modelUse(ai));
      expect(res.result).not.toBe("signed");
      // Přijmout 20 000 nad strop 7 000 model ani nedostal na výběr.
      expect(ai.calls[0]?.choices).toEqual(["counter", "withdraw"]);
      const neg = await db.prepare("SELECT id FROM ai_negotiations WHERE listing_id = ?").bind(id).first<{ id: string }>();
      const steps = (await db.prepare(
        "SELECT actions, used_fallback, error FROM ai_coach_decisions WHERE kind = 'transfer_negotiation' AND context_ref = ? ORDER BY created_at, rowid",
      ).bind(neg!.id).all<{ actions: string; used_fallback: number; error: string | null }>()).results;
      expect(steps.length).toBeGreaterThan(0);
      expect(JSON.parse(steps[0].actions)).toMatchObject({ kind: "counter", amount: 7000, decidedBy: "fallback", ask: 20_000, maxPrice: 7000 });
      expect(steps[0]).toMatchObject({ used_fallback: 1, error: "neplatná odpověď modelu" });
      for (const s of steps) {
        const a = JSON.parse(s.actions) as { kind: string; ask: number; amount?: number };
        if (a.kind === "accept") expect(a.ask).toBeLessThanOrEqual(7000);
        if (a.kind === "counter") expect(a.amount).toBeLessThanOrEqual(7000);
      }
    }
    expect(await budget()).toBe(START_BUDGET);
    expect(await squadSize()).toBe(14);
  });

  it("model přihodí v mezích a protinávrh klubu do stropu podepíše; každý tah je v deníku", async () => {
    await insertListing("vl-deal", "MID", 45, 6000);
    const cand = outsideCandidateFromListing(await listingRow("vl-deal"))!;
    const ai = fakeAi(({ n }) => n === 1 ? { action: "counter", amount: 4000, reason: "meet in the middle" } : { action: "accept", amount: 0, reason: "fair now" });
    const before = { budget: await budget(), squad: await squadSize() };
    const res = await negotiateOutsidePurchase(db, CLUB, cand, 3000, 7000, new Date(), modelUse(ai));
    expect(["signed", "refused"]).toContain(res.result);
    expect((await buyerBids("vl-deal")).slice(0, 2)).toEqual([3000, 4000]);
    if (res.result === "signed") {
      expect(res.amount).toBeLessThanOrEqual(7000);
      expect(await budget()).toBe(before.budget - res.amount);
      expect(await squadSize()).toBe(before.squad + 1);
    }
    const steps = (await db.prepare(
      `SELECT d.actions, d.used_fallback, d.model, d.tokens_in, d.raw_output FROM ai_coach_decisions d JOIN ai_negotiations n ON n.id = d.context_ref
        WHERE d.kind = 'transfer_negotiation' AND n.listing_id = 'vl-deal' ORDER BY d.created_at, d.rowid`,
    ).all<{ actions: string; used_fallback: number; model: string; tokens_in: number; raw_output: string }>()).results;
    expect(steps.length).toBeGreaterThan(0);
    expect(JSON.parse(steps[0].actions)).toMatchObject({ kind: "counter", amount: 4000, decidedBy: "model", maxPrice: 7000 });
    for (const s of steps) {
      expect(s).toMatchObject({ used_fallback: 0, model: COACH_MODEL, tokens_in: 10 });
      const a = JSON.parse(s.actions) as { kind: string; ask: number };
      if (a.kind === "accept") expect(a.ask).toBeLessThanOrEqual(7000);
    }
  });
});
