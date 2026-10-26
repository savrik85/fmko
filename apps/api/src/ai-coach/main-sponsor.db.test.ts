/**
 * Hlavní sponzor AI klubu na skutečné D1 (Miniflare, všechny migrace).
 *
 * Model vybere firmu z těch, se kterými jde teď jednat, a jednání vede tah po tahu stejnými
 * funkcemi jako člověk (openNegotiation, proposeRound, signFromState, closeNegotiation): podepsat,
 * co je na stole, poslat vlastní návrh v mezích kódu, nebo odejít. Neplatná volba nebo tah,
 * výpadek modelu a režim off: náhradní pravidlo (pořadí firem podle povahy, podpis toho, co je
 * na stole). Režim shadow jen rozhodne a zapíše.
 */
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Bindings } from "../index";
import { effectiveContractMonths, willingness, type Proposal } from "../sponsors/negotiation";
import { loadNegotiationState, pendingTerms, type NegotiationRound, type NegotiationState } from "../sponsors/negotiation-db";
import { maybeSignMainSponsor, maybeSignStadiumSponsor } from "./main-sponsor";
import { COACH_MODE_KEY } from "./mode";
import { generateAiProfile, type AiCoachProfile } from "./profile";
import { aiPromiseChoices, MAX_AI_COUNTERS } from "./sponsor-negotiation-decision";
import { runWeeklyReview } from "./weekly";

let mf: Miniflare;
let db: D1Database;
let kv: KVNamespace;

const TEAM = "ai-club";
const GAME_DATE = "2026-11-02T16:00:00.000Z";
/** Ambiciózní trenér: náhradní pravidlo jde za největšími penězi, tedy za Pivovarem. */
const PROFILE: AiCoachProfile = { ...generateAiProfile(TEAM, null), ambition: 95 };

const BIG_HELD = 90001;
const BREWERY = 90002;
const GARAGE = 90003;
const BAKERY = 90004;

interface RecordedCall {
  schemaName: string | null;
  user: string;
  input: Record<string, unknown>;
}

interface FakeAi {
  calls: RecordedCall[];
  run: (model: string, input: unknown) => Promise<unknown>;
}

/** Klíč firmy (F1…) z popisu, který model dostal. */
function keyOf(prompt: string, firmName: string): string {
  const line = prompt.split("\n").find((l) => l.includes(`: ${firmName},`));
  const key = line?.match(/^- "(F\d+)"/)?.[1];
  if (!key) throw new Error(`firma ${firmName} v nabídce chybí`);
  return key;
}

/** Odpověď modelu na tah v jednání (dostane popis pro model). */
type TurnAnswer = (prompt: string) => unknown;

/**
 * Falešný Workers AI. Výběru firmy (hlavní sponzor i název stadionu) odpoví `answer` (funkcí dostane
 * popis pro model), tahům v jednání postupně `turns` (když dojdou, prázdným objektem: rozhodne
 * pravidlo), týdenní správě prázdným objektem (ta pak jede podle náhradního pravidla).
 */
function fakeAi(answer: (prompt: string) => unknown, onSponsorCall?: () => Promise<void>, turns: TurnAnswer[] = []): FakeAi {
  const calls: RecordedCall[] = [];
  let turn = 0;
  const reply = (content: unknown) => ({
    choices: [{ message: { content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  });
  return {
    calls,
    run: async (_model: string, input: unknown) => {
      const req = input as { messages: Array<{ role: string; content: string }>; response_format?: { json_schema?: { name?: string } } };
      const schemaName = req.response_format?.json_schema?.name ?? null;
      const user = req.messages.find((m) => m.role === "user")?.content ?? "";
      calls.push({ schemaName, user, input: input as Record<string, unknown> });
      if (schemaName === "sponsor_negotiation") {
        const next = turns[turn++];
        return reply(next ? await next(user) : {});
      }
      if (schemaName !== "main_sponsor" && schemaName !== "stadium_sponsor") return { choices: [{ message: { content: "{}" } }] };
      if (onSponsorCall) await onSponsorCall();
      return reply(answer(user));
    },
  };
}

/** Běžící jednání AI klubu (načtené stejně jako pro tah modelu). */
async function openTalks(): Promise<NegotiationState> {
  const row = await db.prepare("SELECT id FROM sponsor_negotiations WHERE team_id = ? AND status IN ('open','accepted')")
    .bind(TEAM).first<{ id: string }>();
  if (!row) throw new Error("žádné běžící jednání");
  const st = await loadNegotiationState(db, TEAM, row.id);
  if ("error" in st) throw new Error(st.error);
  return st;
}

/** Klíč slibu (P1…), který model smí dát, podle začátku jeho popisu. */
function promiseKeyOf(prompt: string, text: string): string {
  const line = prompt.split("\n").find((l) => /^ {2}- "P\d+": /.test(l) && l.includes(text));
  const key = line?.match(/"(P\d+)"/)?.[1];
  if (!key) throw new Error(`slib „${text}“ v nabídce pro model chybí`);
  return key;
}

/** Meze peněz protinávrhu z popisu pro model. */
function boundsOf(prompt: string, label: "Monthly money" | "Signing bonus"): { min: number; max: number } {
  const m = prompt.match(new RegExp(`${label}: ([\\d,]+) CZK to ([\\d,]+) CZK`));
  if (!m) throw new Error(`meze ${label} v popisu chybí`);
  return { min: Number(m[1].replace(/,/g, "")), max: Number(m[2].replace(/,/g, "")) };
}

/** Sliby, které AI v tomhle jednání dodrží: exkluzivita oboru a návštěva, kterou sponzor hodnotí aspoň na 70 %. */
function keptPromiseKeys(prompt: string): string[] {
  return [promiseKeyOf(prompt, "no banner of another"), promiseKeyOf(prompt, "average home attendance of at least")];
}

const SIGN = () => ({ move: "sign", seasons: 2, monthly: 0, signingBonus: 0, promises: [], reason: "fair now" });

async function negotiationRow(): Promise<{ status: string; rounds: NegotiationRound[]; cooldown_until: string | null }> {
  const row = await db.prepare("SELECT status, rounds, cooldown_until FROM sponsor_negotiations WHERE team_id = ? ORDER BY created_at DESC LIMIT 1")
    .bind(TEAM).first<{ status: string; rounds: string; cooldown_until: string | null }>();
  if (!row) throw new Error("jednání chybí");
  return { status: row.status, rounds: JSON.parse(row.rounds) as NegotiationRound[], cooldown_until: row.cooldown_until };
}

async function mainContract(): Promise<{ monthly_amount: number; signing_bonus: number; seasons_total: number; id: string } | null> {
  return db.prepare(
    "SELECT id, monthly_amount, signing_bonus, seasons_total FROM sponsor_contracts WHERE team_id = ? AND category = 'main' AND status = 'active'",
  ).bind(TEAM).first<{ monthly_amount: number; signing_bonus: number; seasons_total: number; id: string }>();
}

const choosing = (firmName: string) => (prompt: string) => ({ choice: keyOf(prompt, firmName), reason: "fits our style" });

function aiEnv(ai: FakeAi | null): Pick<Bindings, "AI"> {
  return { AI: ai ?? undefined } as unknown as Pick<Bindings, "AI">;
}

async function activeMainSponsor(teamId: string): Promise<number | null> {
  const row = await db.prepare(
    "SELECT sponsor_id FROM sponsor_contracts WHERE team_id = ? AND category = 'main' AND status = 'active'",
  ).bind(teamId).first<{ sponsor_id: number }>();
  return row?.sponsor_id ?? null;
}

async function negotiations(): Promise<Array<{ sponsor_id: number; status: string }>> {
  return (await db.prepare("SELECT sponsor_id, status FROM sponsor_negotiations WHERE team_id = ? ORDER BY created_at")
    .bind(TEAM).all<{ sponsor_id: number; status: string }>()).results;
}

interface DecisionRow {
  mode: string; model: string | null; used_fallback: number; error: string | null; input_summary: string | null; raw_output: string | null;
  actions: string | null; executed: string | null; tokens_in: number | null; tokens_out: number | null; context_ref: string | null;
}

async function decisionsOf(kind: string): Promise<DecisionRow[]> {
  return (await db.prepare(
    `SELECT mode, model, used_fallback, error, input_summary, raw_output, actions, executed, tokens_in, tokens_out, context_ref
       FROM ai_coach_decisions WHERE team_id = ? AND kind = ? ORDER BY created_at, rowid`,
  ).bind(TEAM, kind).all<DecisionRow>()).results;
}

const sponsorDecisions = () => decisionsOf("main_sponsor");
/** Tahy v jednání (jeden záznam za tah). */
const negotiationTurns = () => decisionsOf("sponsor_negotiation");

function json<T>(raw: string | null): T {
  return JSON.parse(raw ?? "null") as T;
}

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

  const village = (id: string, name: string) =>
    db.prepare("INSERT INTO villages (id, name, district, region, population, size, lat, lng) VALUES (?, ?, 'Testov', 'JC', 800, 'village', 49.0, 14.0)")
      .bind(id, name);
  const team = (id: string, userId: string, villageId: string, name: string) =>
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date) VALUES (?, ?, ?, ?, 80000, 50, ?)")
      .bind(id, userId, villageId, name, GAME_DATE);
  const firm = (id: number, name: string, type: string, monthlyMax: number) =>
    db.prepare(
      `INSERT INTO district_sponsors (id, district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
       VALUES (?, 'Testov', ?, ?, ?, ?, 100, 500)`,
    ).bind(id, name, type, Math.round(monthlyMax / 2), monthlyMax);
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u-human', 'human@example.test', 'x'), ('u-other', 'other@example.test', 'x')"),
    village("v-ai", "Lhota"), village("v-human", "Ves"), village("v-other", "Dvůr"),
    team(TEAM, "ai", "v-ai", "Sokol Lhota"), team("human", "u-human", "v-human", "Slavoj Ves"), team("other", "u-other", "v-other", "Jiskra Dvůr"),
    db.prepare("INSERT INTO managers (id, user_id, team_id, name, backstory, avatar, ai_profile) VALUES ('m-ai', 'ai', ?, 'Jan Trenér', '', '{}', ?)")
      .bind(TEAM, JSON.stringify(PROFILE)),
    firm(BIG_HELD, "Velkostatek", "company", 40_000),
    firm(BREWERY, "Pivovar Testov", "brewery", 20_000),
    firm(GARAGE, "Autoservis Novák", "car_service", 9_000),
    firm(BAKERY, "Pekárna Kubát", "bakery", 4_000),
    // Největší firma je hlavním sponzorem lidského klubu: AI klub ji v nabídce mít nesmí (exkluzivita).
    db.prepare(
      `INSERT INTO sponsor_contracts (id, team_id, sponsor_name, sponsor_type, monthly_amount, seasons_total, seasons_remaining, category, sponsor_id, negotiation_id)
       VALUES ('c-human', 'human', 'Velkostatek', 'company', 30000, 2, 2, 'main', ?, 'n-human')`,
    ).bind(BIG_HELD),
    // Pekárna má AI klub ráda.
    db.prepare("INSERT INTO sponsor_team_favor (sponsor_id, team_id, favor) VALUES (?, ?, 90)").bind(BAKERY, TEAM),
    // Majitel Pekárny je obchodník: u hlavního sponzora chce návštěvu a exkluzivitu oboru (pevně, ať je jednání předvídatelné).
    db.prepare(
      "INSERT INTO sponsor_owners (sponsor_id, first_name, last_name, age, face_config, personality) VALUES (?, 'Karel', 'Kubát', 52, '{}', 'businessman')",
    ).bind(BAKERY),
  ]);
}, 180_000);

afterAll(async () => {
  await mf.dispose();
});

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM sponsor_promises"),
    db.prepare("DELETE FROM sponsor_contracts WHERE id != 'c-human'"),
    db.prepare("DELETE FROM sponsor_negotiations"),
    db.prepare("DELETE FROM ai_coach_decisions"),
    db.prepare(
      "UPDATE teams SET name = 'Sokol Lhota', last_main_sponsor_change_season = NULL, budget = 80000, stadium_name = NULL, sleeve_sponsor_id = NULL WHERE id = ?",
    ).bind(TEAM),
    // Urážka a odchod majitele náklonnost snižují: každý test začíná od stejné.
    db.prepare("DELETE FROM sponsor_team_favor"),
    db.prepare("INSERT INTO sponsor_team_favor (sponsor_id, team_id, favor) VALUES (?, ?, 90)").bind(BAKERY, TEAM),
  ]);
  await kv.delete(COACH_MODE_KEY);
});

describe("hlavní sponzor AI klubu: model vybírá, kód hlídá", () => {
  it("model vybere firmu z nabídky a podepíše úvodní nabídku stejným jednáním jako u člověka", async () => {
    const ai = fakeAi(choosing("Pekárna Kubát"), undefined, [SIGN]);
    const res = await maybeSignMainSponsor(db, TEAM, PROFILE, { ai: aiEnv(ai), contextRef: "week:2026-11-02" });

    expect(res.signed).toBe(true);
    expect(await activeMainSponsor(TEAM)).toBe(BAKERY);
    expect(await negotiations()).toEqual([{ sponsor_id: BAKERY, status: "signed" }]);
    const team = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(TEAM).first<{ name: string }>();
    expect(team?.name).toContain("Pekárna Kubát");

    // Model dostal jen firmy, se kterými jde jednat: obsazený Velkostatek v nabídce není.
    // Druhé volání je první tah jednání nad úvodní nabídkou majitele.
    expect(ai.calls.map((c) => c.schemaName)).toEqual(["main_sponsor", "sponsor_negotiation"]);
    expect(ai.calls[1].user).toContain("ON THE TABLE (you can sign it now)");
    const [turn] = await negotiationTurns();
    expect(json<{ move: string; decidedBy: string }>(turn.actions)).toMatchObject({ move: "sign", decidedBy: "model" });
    expect(json<{ result: string }>(turn.executed)).toMatchObject({ result: "signed" });
    const prompt = ai.calls[0].user;
    expect(prompt).toContain("Pivovar Testov");
    expect(prompt).toContain("Autoservis Novák");
    expect(prompt).toContain("favour 90/100 (loves your club)");
    expect(prompt).not.toContain("Velkostatek");
    const format = ai.calls[0].input.response_format as { json_schema: { schema: { properties: { choice: { enum: string[] } } } } };
    expect(format.json_schema.schema.properties.choice.enum).toEqual(["F1", "F2", "F3", "none"]);

    const [log] = await sponsorDecisions();
    expect(log.mode).toBe("on");
    expect(log.model).toBe("@cf/openai/gpt-oss-120b");
    expect(log.used_fallback).toBe(0);
    expect(log.error).toBeNull();
    expect(log.tokens_in).toBe(10);
    expect(log.tokens_out).toBe(5);
    expect(log.context_ref).toBe("week:2026-11-02");
    expect(log.input_summary).toBe(prompt);
    expect(json<{ decidedBy: string; sponsorId: number; reason: string }>(log.actions))
      .toMatchObject({ decidedBy: "model", sponsorId: BAKERY, reason: "fits our style" });
    expect(json<{ signed: boolean; sponsorId: number; asChosen: boolean; tried: string[] }>(log.executed))
      .toMatchObject({ signed: true, sponsorId: BAKERY, asChosen: true, tried: ["Pekárna Kubát"] });
  }, 60_000);

  it("neznámá firma v odpovědi: rozhodne pořadí náhradního pravidla (ambiciózní jde za penězi)", async () => {
    const ai = fakeAi(() => ({ choice: "F9", reason: "x" }));
    const res = await maybeSignMainSponsor(db, TEAM, PROFILE, { ai: aiEnv(ai) });

    expect(res.signed).toBe(true);
    expect(await activeMainSponsor(TEAM)).toBe(BREWERY);
    const [log] = await sponsorDecisions();
    expect(log.used_fallback).toBe(1);
    expect(log.error).toContain("F9");
    expect(log.raw_output).toContain("F9");
    expect(json<{ decidedBy: string; sponsorId: number }>(log.actions)).toMatchObject({ decidedBy: "fallback", sponsorId: BREWERY });
  }, 60_000);

  it("firma obsazená jiným klubem neprojde, ani když ji model napíše názvem", async () => {
    const ai = fakeAi(() => ({ choice: "Velkostatek", reason: "biggest money" }));
    await maybeSignMainSponsor(db, TEAM, PROFILE, { ai: aiEnv(ai) });

    expect(await activeMainSponsor(TEAM)).toBe(BREWERY);
    expect(await activeMainSponsor("human")).toBe(BIG_HELD);
    const [log] = await sponsorDecisions();
    expect(log.used_fallback).toBe(1);
    expect(log.error).toContain("Velkostatek");
  }, 60_000);

  it("„none“: tento týden nikoho, nic se neotevře ani nepodepíše", async () => {
    const ai = fakeAi(() => ({ choice: "none", reason: "waiting for a better offer" }));
    const res = await maybeSignMainSponsor(db, TEAM, PROFILE, { ai: aiEnv(ai) });

    expect(res.signed).toBe(false);
    expect(await activeMainSponsor(TEAM)).toBeNull();
    expect(await negotiations()).toEqual([]);
    const [log] = await sponsorDecisions();
    expect(log.used_fallback).toBe(0);
    expect(json<{ choice: string; sponsorId: number | null }>(log.actions)).toMatchObject({ choice: "none", sponsorId: null });
    expect(json<{ signed: boolean; tried: string[] }>(log.executed)).toEqual({ signed: false, tried: [] });
  }, 60_000);

  it("režim shadow: rozhodne a zapíše do deníku, nic neotevře ani nepodepíše", async () => {
    const ai = fakeAi(choosing("Pekárna Kubát"));
    const res = await maybeSignMainSponsor(db, TEAM, PROFILE, { mode: "shadow", ai: aiEnv(ai) });

    expect(res.signed).toBe(false);
    expect(await activeMainSponsor(TEAM)).toBeNull();
    expect(await negotiations()).toEqual([]);
    const team = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(TEAM).first<{ name: string }>();
    expect(team?.name).toBe("Sokol Lhota");
    const [log] = await sponsorDecisions();
    expect(log.mode).toBe("shadow");
    expect(log.executed).toBeNull();
    expect(log.used_fallback).toBe(0);
    expect(json<{ sponsorName: string }>(log.actions).sponsorName).toBe("Pekárna Kubát");
  }, 60_000);

  it("vybraná firma mezitím podepsala s jiným klubem: pokračuje se v pořadí náhradního pravidla", async () => {
    // Zatímco model přemýšlí, Pekárna se stane hlavním sponzorem jiného klubu.
    const ai = fakeAi(choosing("Pekárna Kubát"), async () => {
      await db.prepare(
        `INSERT INTO sponsor_contracts (id, team_id, sponsor_name, sponsor_type, monthly_amount, seasons_total, seasons_remaining, category, sponsor_id, negotiation_id)
         VALUES ('c-other', 'other', 'Pekárna Kubát', 'bakery', 4000, 2, 2, 'main', ?, 'n-other')`,
      ).bind(BAKERY).run();
    });
    const res = await maybeSignMainSponsor(db, TEAM, PROFILE, { ai: aiEnv(ai) });

    expect(res.signed).toBe(true);
    expect(await activeMainSponsor(TEAM)).toBe(BREWERY);
    expect(await activeMainSponsor("other")).toBe(BAKERY);
    const [log] = await sponsorDecisions();
    // Rozhodl model (jeho volba byla platná), provést ji ale nešlo.
    expect(log.used_fallback).toBe(0);
    expect(json<{ sponsorId: number; asChosen: boolean; tried: string[] }>(log.executed))
      .toMatchObject({ sponsorId: BREWERY, asChosen: false, tried: ["Pivovar Testov"] });
  }, 60_000);

  it("režim off: model se neptá, podepíše první firmu náhradního pravidla", async () => {
    const ai = fakeAi(choosing("Pekárna Kubát"));
    const res = await maybeSignMainSponsor(db, TEAM, PROFILE, { mode: "off", ai: aiEnv(ai) });

    expect(res.signed).toBe(true);
    expect(ai.calls).toHaveLength(0);
    expect(await activeMainSponsor(TEAM)).toBe(BREWERY);
    const [log] = await sponsorDecisions();
    expect(log.mode).toBe("off");
    expect(log.model).toBeNull();
    expect(log.used_fallback).toBe(1);
    expect(log.error).toBeNull();
    // Jednání bez modelu: dosavadní chování, podepsat úvodní nabídku; tah je v deníku taky.
    const turns = await negotiationTurns();
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ mode: "off", model: null, used_fallback: 1, error: null });
    expect(json<{ move: string; decidedBy: string }>(turns[0].actions)).toMatchObject({ move: "sign", decidedBy: "fallback" });
  }, 60_000);

  it("výpadek modelu: náhradní pravidlo podepíše a chyba je v deníku", async () => {
    const broken = { run: async () => { throw new Error("timeout 60000 ms"); } };
    const res = await maybeSignMainSponsor(db, TEAM, PROFILE, { ai: { AI: broken } as unknown as Pick<Bindings, "AI"> });

    expect(res.signed).toBe(true);
    expect(await activeMainSponsor(TEAM)).toBe(BREWERY);
    const [log] = await sponsorDecisions();
    expect(log.used_fallback).toBe(1);
    expect(log.error).toContain("timeout");
  }, 60_000);

  it("málo ambiciózní trenér bez modelu jde za firmou, která klub má ráda", async () => {
    const res = await maybeSignMainSponsor(db, TEAM, { ...PROFILE, ambition: 5 }, { mode: "off" });
    expect(res.signed).toBe(true);
    expect(await activeMainSponsor(TEAM)).toBe(BAKERY);
  }, 60_000);

  it("klub s hlavním sponzorem nic neřeší: model se neptá, deník mlčí", async () => {
    await db.prepare(
      `INSERT INTO sponsor_contracts (id, team_id, sponsor_name, sponsor_type, monthly_amount, seasons_total, seasons_remaining, category, sponsor_id, negotiation_id)
       VALUES ('c-ai', ?, 'Autoservis Novák', 'car_service', 9000, 2, 2, 'main', ?, 'n-ai')`,
    ).bind(TEAM, GARAGE).run();
    const ai = fakeAi(choosing("Pekárna Kubát"));
    const res = await maybeSignMainSponsor(db, TEAM, PROFILE, { ai: aiEnv(ai) });

    expect(res).toEqual({ signed: false, detail: "hlavní sponzor už je: Autoservis Novák" });
    expect(ai.calls).toHaveLength(0);
    expect(await sponsorDecisions()).toEqual([]);
  }, 60_000);
});

describe("jednání s majitelem: model smlouvá, kód hlídá", () => {
  it("protinávrh modelu projde stejnou službou jako návrh člověka, majitel ho stáhne na svůj rozpočet a model podepíše", async () => {
    let opening: Proposal | null = null;
    let asked = 0;
    const ai = fakeAi(choosing("Pekárna Kubát"), undefined, [
      async (prompt) => {
        const st = await openTalks();
        opening = pendingTerms(st.neg);
        const keys = keptPromiseKeys(prompt);
        const promises = aiPromiseChoices(st.ctx, st.favor).filter((c) => keys.includes(c.key)).map((c) => c.spec);
        const mine: Proposal = {
          seasons: 2, promises,
          demands: { monthly: 0, winBonus: 0, signingBonus: 0, goalBonuses: {}, construction: null, equipment: null, payCurrentFee: false },
        };
        // O desetinu víc, než majitel na tyhle podmínky má: pošle protinabídku za peníze.
        asked = Math.floor((1.1 * willingness(mine, st.ctx)) / 100) * 100;
        return { move: "counter", seasons: 2, monthly: asked, signingBonus: 0, promises: keys, reason: "we are worth more" };
      },
      SIGN,
    ]);
    const res = await maybeSignMainSponsor(db, TEAM, PROFILE, { ai: aiEnv(ai), contextRef: "week:2026-11-02" });

    expect(res.signed).toBe(true);
    const neg = await negotiationRow();
    expect(neg.status).toBe("signed");
    expect(neg.rounds.map((r) => r.response.kind)).toEqual(["offer", "counter_money"]);
    expect(neg.rounds[1].proposal).toMatchObject({ seasons: 2, demands: { monthly: asked, signingBonus: 0 } });
    expect(neg.rounds[1].proposal.promises.map((p) => p.kind).sort()).toEqual(["attendance", "sector_exclusivity"]);
    const counter = neg.rounds[1].response.counter;
    if (!counter || !opening) throw new Error("chybí protinabídka nebo úvodní nabídka");
    expect(counter.demands.monthly).toBeLessThan(asked);

    // Podepsala se protinabídka majitele, ne úvodní nabídka: víc peněz, než dávala úvodní nabídka
    // i s příspěvkem za podpis rozpočítaným na měsíce smlouvy.
    const openingTerms: Proposal = opening;
    expect(await mainContract()).toMatchObject({ monthly_amount: counter.demands.monthly, signing_bonus: 0, seasons_total: 2 });
    const openingMonthly = openingTerms.demands.monthly + openingTerms.demands.signingBonus / effectiveContractMonths(2, 0);
    expect(counter.demands.monthly).toBeGreaterThan(openingMonthly);
    const promiseRows = await db.prepare("SELECT kind, params FROM sponsor_promises WHERE team_id = ? ORDER BY kind").bind(TEAM)
      .all<{ kind: string; params: string }>();
    expect(promiseRows.results.map((r) => [r.kind, JSON.parse(r.params)])).toEqual([
      ["attendance", { attendance: 90 }], ["sector_exclusivity", { sector: "bakery" }],
    ]);

    // Druhý tah model rozhodoval už nad protinabídkou majitele.
    const turnCalls = ai.calls.filter((c) => c.schemaName === "sponsor_negotiation");
    expect(turnCalls).toHaveLength(2);
    expect(turnCalls[1].user).toContain("; he countered with 2 seasons");
    const turns = await negotiationTurns();
    expect(turns).toHaveLength(2);
    expect(turns.every((t) => t.mode === "on" && t.used_fallback === 0 && t.error === null)).toBe(true);
    expect(json<Record<string, unknown>>(turns[0].actions)).toMatchObject({
      turn: 1, move: "counter", decidedBy: "model", reason: "we are worth more", proposal: { seasons: 2, monthly: asked, signingBonus: 0 },
    });
    expect(json<Record<string, unknown>>(turns[0].executed)).toMatchObject({ result: "proposed", ownerResponse: "counter_money", status: "open" });
    expect(json<Record<string, unknown>>(turns[1].actions)).toMatchObject({ turn: 2, move: "sign", decidedBy: "model" });
    expect(json<Record<string, unknown>>(turns[1].executed)).toMatchObject({ result: "signed" });
    expect(turns[0].context_ref).toBe(turns[1].context_ref);
  }, 60_000);

  it("protinávrh mimo meze: rozhodne pravidlo, podepíše se úvodní nabídka a chyba je v deníku", async () => {
    const ai = fakeAi(choosing("Pekárna Kubát"), undefined, [
      () => ({ move: "counter", seasons: 2, monthly: 9_999_999, signingBonus: 0, promises: [], reason: "greedy" }),
    ]);
    const res = await maybeSignMainSponsor(db, TEAM, PROFILE, { ai: aiEnv(ai) });

    expect(res.signed).toBe(true);
    const neg = await negotiationRow();
    // Návrh se majiteli vůbec neposlal: podepsala se úvodní nabídka.
    expect(neg.rounds.map((r) => r.response.kind)).toEqual(["offer"]);
    expect(await mainContract()).toMatchObject({ monthly_amount: neg.rounds[0].proposal.demands.monthly });
    const [turn] = await negotiationTurns();
    expect(turn.used_fallback).toBe(1);
    expect(turn.error).toContain("mimo meze");
    expect(turn.raw_output).toContain("9999999");
    expect(json<{ move: string; decidedBy: string }>(turn.actions)).toMatchObject({ move: "sign", decidedBy: "fallback" });
  }, 60_000);

  it("neznámý tah: rozhodne pravidlo a podepíše úvodní nabídku", async () => {
    const ai = fakeAi(choosing("Pekárna Kubát"), undefined, [
      () => ({ move: "haggle", seasons: 2, monthly: 0, signingBonus: 0, promises: [], reason: "x" }),
    ]);
    await maybeSignMainSponsor(db, TEAM, PROFILE, { ai: aiEnv(ai) });

    expect(await activeMainSponsor(TEAM)).toBe(BAKERY);
    const [turn] = await negotiationTurns();
    expect(turn.used_fallback).toBe(1);
    expect(turn.error).toContain("nepřípustný tah modelu: haggle");
  }, 60_000);

  it("sliby jen z nabídky: model nedostane na výběr slib, který AI nedodrží, a když ho napíše, rozhodne pravidlo", async () => {
    const ai = fakeAi(choosing("Pekárna Kubát"), undefined, [
      (prompt) => ({
        move: "counter", seasons: 2, monthly: boundsOf(prompt, "Monthly money").max, signingBonus: 0,
        promises: [promiseKeyOf(prompt, "no banner of another"), "youth"], reason: "promise young players",
      }),
    ]);
    await maybeSignMainSponsor(db, TEAM, PROFILE, { ai: aiEnv(ai) });

    const call = ai.calls.find((c) => c.schemaName === "sponsor_negotiation");
    if (!call) throw new Error("tah se modelu nepředložil");
    const format = call.input.response_format as { json_schema: { schema: { properties: { promises: { items: { enum: string[] } } } } } };
    const offered = call.user.split("\n").filter((l) => /^ {2}- "P\d+": /.test(l));
    expect(format.json_schema.schema.properties.promises.items.enum).toEqual(offered.map((l) => l.match(/"(P\d+)"/)?.[1]));
    // Pohár do 3. kola, exkluzivita oboru, návštěva 90 % loňska: nic, co AI nemá jak splnit.
    expect(offered).toHaveLength(3);
    for (const banned of ["players aged 21", "riots", "coaching licence", "build ", "promotion", "relegation"]) {
      expect(offered.some((l) => l.includes(banned))).toBe(false);
    }

    const [turn] = await negotiationTurns();
    expect(turn.used_fallback).toBe(1);
    expect(turn.error).toContain("slib youth není v nabídce");
    expect((await negotiationRow()).rounds.map((r) => r.response.kind)).toEqual(["offer"]);
    expect(await activeMainSponsor(TEAM)).toBe(BAKERY);
  }, 60_000);

  it("strop kol: po dvou vlastních návrzích už jen podepsat, nebo odejít; další protinávrh rozhodne pravidlo", async () => {
    // Stejné peníze jako na stole, jen se sliby, které AI dodrží: majitel přijme.
    const sameMoney = async (prompt: string) => {
      const t = pendingTerms((await openTalks()).neg);
      if (!t) throw new Error("na stole nic není");
      return {
        move: "counter", seasons: t.seasons, monthly: t.demands.monthly, signingBonus: t.demands.signingBonus,
        promises: keptPromiseKeys(prompt), reason: "same money, promises we keep",
      };
    };
    const tooMany = () => ({ move: "counter", seasons: 2, monthly: 20_000, signingBonus: 0, promises: [], reason: "one more try" });
    const ai = fakeAi(choosing("Pekárna Kubát"), undefined, [sameMoney, sameMoney, tooMany]);
    const res = await maybeSignMainSponsor(db, TEAM, PROFILE, { ai: aiEnv(ai) });

    expect(res.signed).toBe(true);
    const neg = await negotiationRow();
    expect(neg.rounds.map((r) => r.response.kind)).toEqual(["offer", "accept", "accept"]);
    const turnCalls = ai.calls.filter((c) => c.schemaName === "sponsor_negotiation");
    expect(turnCalls).toHaveLength(MAX_AI_COUNTERS + 1);
    const last = turnCalls[MAX_AI_COUNTERS];
    const format = last.input.response_format as { json_schema: { schema: { properties: { move: { enum: string[] } } } } };
    expect(format.json_schema.schema.properties.move.enum).toEqual(["sign", "walk_away"]);
    expect(last.user).not.toContain('"counter": propose');

    const turns = await negotiationTurns();
    expect(turns.map((t) => json<{ move: string }>(t.actions).move)).toEqual(["counter", "counter", "sign"]);
    expect(turns[2].used_fallback).toBe(1);
    expect(turns[2].error).toContain("nepřípustný tah modelu: counter");
    // Podepsaly se přijaté podmínky AI: exkluzivita a návštěva 90 % místo plné loňské návštěvy z úvodní nabídky.
    const attendance = await db.prepare("SELECT params FROM sponsor_promises WHERE team_id = ? AND kind = 'attendance'").bind(TEAM)
      .first<{ params: string }>();
    expect(JSON.parse(attendance?.params ?? "{}")).toEqual({ attendance: 90 });
    expect(await mainContract()).toMatchObject({ monthly_amount: neg.rounds[0].proposal.demands.monthly });
  }, 60_000);

  it("podpis u první firmy selže (firmu mezitím vzal jiný klub): s další firmou dál jedná model, ne pravidlo", async () => {
    const sameMoney = async (prompt: string) => {
      const t = pendingTerms((await openTalks()).neg);
      if (!t) throw new Error("na stole nic není");
      return {
        move: "counter", seasons: t.seasons, monthly: t.demands.monthly, signingBonus: t.demands.signingBonus,
        promises: keptPromiseKeys(prompt), reason: "same money, promises we keep",
      };
    };
    // Než AI podepíše, stane se Pekárna hlavním sponzorem jiného klubu: podpis selže a AI jde k další firmě.
    const signTooLate = async () => {
      await db.prepare(
        `INSERT INTO sponsor_contracts (id, team_id, sponsor_name, sponsor_type, monthly_amount, seasons_total, seasons_remaining, category, sponsor_id, negotiation_id)
         VALUES ('c-other', 'other', 'Pekárna Kubát', 'bakery', 4000, 2, 2, 'main', ?, 'n-other')`,
      ).bind(BAKERY).run();
      return SIGN();
    };
    const ai = fakeAi(choosing("Pekárna Kubát"), undefined, [sameMoney, sameMoney, signTooLate, SIGN]);
    const res = await maybeSignMainSponsor(db, TEAM, PROFILE, { ai: aiEnv(ai) });

    expect(res.signed).toBe(true);
    expect(await activeMainSponsor(TEAM)).not.toBe(BAKERY);
    const turns = await negotiationTurns();
    expect(turns.map((t) => json<{ sponsorId: number; move: string }>(t.actions).move)).toEqual(["counter", "counter", "sign", "sign"]);
    // Tah u druhé firmy rozhodl model: všechny tahy jednoho hledání nesdílí tři tahy prvního jednání.
    expect(turns.map((t) => t.used_fallback)).toEqual([0, 0, 0, 0]);
    expect(turns.every((t) => t.error === null)).toBe(true);
    expect(json<{ sponsorId: number }>(turns[3].actions).sponsorId).not.toBe(BAKERY);
  }, 60_000);

  it("majiteli dojde trpělivost: odejde, 14 dní nejedná, smlouva není a ten týden AI nikoho dalšího neosloví", async () => {
    // Majitel klub skoro nezná: trpělivost 2, dvakrát přestřelená nabídka ho urazí a odejde.
    await db.prepare("UPDATE sponsor_team_favor SET favor = 10 WHERE sponsor_id = ? AND team_id = ?").bind(BAKERY, TEAM).run();
    const greedy = (prompt: string) => ({
      move: "counter", seasons: 2, monthly: boundsOf(prompt, "Monthly money").max, signingBonus: boundsOf(prompt, "Signing bonus").max,
      promises: [], reason: "all or nothing",
    });
    const ai = fakeAi(choosing("Pekárna Kubát"), undefined, [greedy, greedy]);
    const res = await maybeSignMainSponsor(db, TEAM, PROFILE, { ai: aiEnv(ai) });

    expect(res.signed).toBe(false);
    expect(await activeMainSponsor(TEAM)).toBeNull();
    const neg = await negotiationRow();
    expect(neg.status).toBe("walked_away");
    expect(neg.cooldown_until).not.toBeNull();
    expect(neg.rounds.map((r) => r.response.kind)).toEqual(["offer", "insulted", "walked_away"]);
    const favor = await db.prepare("SELECT favor FROM sponsor_team_favor WHERE sponsor_id = ? AND team_id = ?").bind(BAKERY, TEAM)
      .first<{ favor: number }>();
    expect(favor?.favor).toBeLessThan(10);
    expect(await negotiations()).toEqual([{ sponsor_id: BAKERY, status: "walked_away" }]);
    const [log] = await sponsorDecisions();
    expect(json<Record<string, unknown>>(log.executed)).toEqual({ signed: false, tried: ["Pekárna Kubát"], talks: "owner_walked_away" });
    const turns = await negotiationTurns();
    expect(json<Record<string, unknown>>(turns[1].executed)).toMatchObject({ ownerResponse: "walked_away", status: "walked_away" });
  }, 60_000);

  it("model jednání ukončí: bez pokuty a cooldownu, smlouva není", async () => {
    const ai = fakeAi(choosing("Pekárna Kubát"), undefined, [
      () => ({ move: "walk_away", seasons: 2, monthly: 0, signingBonus: 0, promises: [], reason: "too many promises" }),
    ]);
    const res = await maybeSignMainSponsor(db, TEAM, PROFILE, { ai: aiEnv(ai) });

    expect(res.signed).toBe(false);
    const neg = await negotiationRow();
    expect(neg).toMatchObject({ status: "expired", cooldown_until: null });
    const [log] = await sponsorDecisions();
    expect(json<Record<string, unknown>>(log.executed)).toEqual({ signed: false, tried: ["Pekárna Kubát"], talks: "ai_walked_away" });
    const favor = await db.prepare("SELECT favor FROM sponsor_team_favor WHERE sponsor_id = ? AND team_id = ?").bind(BAKERY, TEAM)
      .first<{ favor: number }>();
    expect(favor?.favor).toBe(90);
  }, 60_000);

  it("režim shadow: model rozhodne i první tah jednání a zapíše ho, nic se neotevře ani nepodepíše", async () => {
    const ai = fakeAi(choosing("Pekárna Kubát"), undefined, [
      (prompt) => ({ move: "counter", seasons: 2, monthly: boundsOf(prompt, "Monthly money").max, signingBonus: 0, promises: [], reason: "test him" }),
    ]);
    const res = await maybeSignMainSponsor(db, TEAM, PROFILE, { mode: "shadow", ai: aiEnv(ai), contextRef: "week:2026-11-02" });

    expect(res).toEqual({ signed: false, detail: "nanečisto: Pekárna Kubát, první tah counter" });
    expect(await negotiations()).toEqual([]);
    expect(await activeMainSponsor(TEAM)).toBeNull();
    const [turn] = await negotiationTurns();
    expect(turn).toMatchObject({ mode: "shadow", executed: null, used_fallback: 0, error: null, context_ref: "week:2026-11-02" });
    expect(turn.input_summary).toContain("ON THE TABLE (you can sign it now)");
    expect(json<{ move: string; decidedBy: string }>(turn.actions)).toMatchObject({ move: "counter", decidedBy: "model" });
  }, 60_000);
});

describe("název stadionu AI klubu", () => {
  it("model vybere firmu a smlouvá stejně jako u hlavního sponzora: stadion nese její jméno, klub ne, logo na rukáv AI umístí hned", async () => {
    // Stejné peníze jako na stole, sliby, které AI dodrží: logo na rukávu a exkluzivita oboru.
    const ai = fakeAi(choosing("Pekárna Kubát"), undefined, [
      async (prompt) => {
        const t = pendingTerms((await openTalks()).neg);
        if (!t) throw new Error("na stole nic není");
        return {
          move: "counter", seasons: t.seasons, monthly: t.demands.monthly, signingBonus: t.demands.signingBonus,
          promises: [promiseKeyOf(prompt, "his logo on your shirt sleeve"), promiseKeyOf(prompt, "no banner of another")],
          reason: "promises we keep for sure",
        };
      },
      SIGN,
    ]);
    const res = await maybeSignStadiumSponsor(db, TEAM, PROFILE, { ai: aiEnv(ai), contextRef: "week:2026-11-02" });

    expect(res.signed).toBe(true);
    const choiceCall = ai.calls.find((c) => c.schemaName === "stadium_sponsor");
    expect(choiceCall?.user).toContain("money for naming your stadium");
    // Velkostatek je hlavním sponzorem lidského klubu, stadion ale pojmenovat smí.
    expect(choiceCall?.user).toContain("Velkostatek");
    const turnCalls = ai.calls.filter((c) => c.schemaName === "sponsor_negotiation");
    expect(turnCalls[0].user).toContain("about naming your stadium");
    expect(turnCalls[0].user).toContain("kept for sure: you put his logo on the sleeve right after signing");

    const contract = await db.prepare(
      "SELECT id, sponsor_name, sponsor_id FROM sponsor_contracts WHERE team_id = ? AND category = 'stadium' AND status = 'active'",
    ).bind(TEAM).first<{ id: string; sponsor_name: string; sponsor_id: number }>();
    expect(contract).toMatchObject({ sponsor_name: "Pekárna Kubát Arena", sponsor_id: BAKERY });
    const team = await db.prepare("SELECT name, stadium_name, sleeve_sponsor_id FROM teams WHERE id = ?").bind(TEAM)
      .first<{ name: string; stadium_name: string | null; sleeve_sponsor_id: number | null }>();
    expect(team).toEqual({ name: "Sokol Lhota", stadium_name: "Pekárna Kubát Arena", sleeve_sponsor_id: BAKERY });
    // Slib loga na rukávu je splněný hned po podpisu (stejná služba jako tlačítko na webu).
    const logo = await db.prepare("SELECT status FROM sponsor_promises WHERE contract_id = ? AND kind = 'jersey_logo'").bind(contract?.id)
      .first<{ status: string }>();
    expect(logo?.status).toBe("fulfilled");
    expect(await activeMainSponsor(TEAM)).toBeNull();

    const [choice] = await decisionsOf("stadium_sponsor");
    expect(json<{ decidedBy: string; sponsorId: number }>(choice.actions)).toMatchObject({ decidedBy: "model", sponsorId: BAKERY });
    expect(json<{ signed: boolean; contractId: string }>(choice.executed)).toMatchObject({ signed: true, contractId: contract?.id });
    const turns = await negotiationTurns();
    expect(turns.map((t) => json<{ category: string; move: string }>(t.actions))).toEqual([
      expect.objectContaining({ category: "stadium", move: "counter" }),
      expect.objectContaining({ category: "stadium", move: "sign" }),
    ]);
    expect(json<Record<string, unknown>>(turns[1].executed)).toMatchObject({ result: "signed", sleeveLogo: true });
  }, 60_000);

  it("klub se sponzorem stadionu nic neřeší: model se neptá", async () => {
    await db.prepare(
      `INSERT INTO sponsor_contracts (id, team_id, sponsor_name, sponsor_type, monthly_amount, seasons_total, seasons_remaining, category, sponsor_id, negotiation_id)
       VALUES ('c-ai-stadium', ?, 'Autoservis Novák Arena', 'car_service', 3000, 2, 2, 'stadium', ?, 'n-ai-stadium')`,
    ).bind(TEAM, GARAGE).run();
    const ai = fakeAi(choosing("Pekárna Kubát"));
    expect(await maybeSignStadiumSponsor(db, TEAM, PROFILE, { ai: aiEnv(ai) }))
      .toEqual({ signed: false, detail: "sponzor stadionu už je: Autoservis Novák Arena" });
    expect(ai.calls).toHaveLength(0);
  }, 60_000);
});

describe("hlavní sponzor v pondělní správě", () => {
  const env = (ai: FakeAi) => ({ DB: db, CACHE_KV: kv, AI: ai } as unknown as Bindings);
  const now = new Date(GAME_DATE);

  it("režim shadow: týdenní správa hlavního sponzora jen rozhodne a zapíše", async () => {
    await kv.put(COACH_MODE_KEY, JSON.stringify({ weekly: "shadow" }));
    const ai = fakeAi(choosing("Pekárna Kubát"));
    const res = await runWeeklyReview(env(ai), TEAM, now);

    expect(res.mode).toBe("shadow");
    expect(await activeMainSponsor(TEAM)).toBeNull();
    expect(await negotiations()).toEqual([]);
    expect(ai.calls.map((c) => c.schemaName)).toContain("main_sponsor");
    const [log] = await sponsorDecisions();
    expect(log.mode).toBe("shadow");
    expect(log.executed).toBeNull();
    expect(log.context_ref).toBe("week:2026-11-02");
    expect(json<{ sponsorId: number }>(log.actions).sponsorId).toBe(BAKERY);
  }, 120_000);

  it("naostro: týdenní správa podepíše firmu, kterou vybral model", async () => {
    const ai = fakeAi(choosing("Pekárna Kubát"));
    const res = await runWeeklyReview(env(ai), TEAM, now);

    expect(res.mode).toBe("on");
    expect(await activeMainSponsor(TEAM)).toBe(BAKERY);
    expect(res.executed.find((e) => e.action === "main_sponsor")).toMatchObject({ ok: true });
    // Hned potom stejnou cestou i název stadionu.
    expect(res.executed.find((e) => e.action === "stadium_sponsor")).toMatchObject({ ok: true });
    expect(ai.calls.map((c) => c.schemaName)).toContain("stadium_sponsor");
    // Model dostal i tabulku a finance z pondělní správy.
    const call = ai.calls.find((c) => c.schemaName === "main_sponsor");
    expect(call?.user).toContain("season just started");
    expect(call?.user).toContain("Weekly running costs about");
  }, 120_000);

  it("nanečisto (admin): rozhodne, ale nic nepodepíše", async () => {
    const ai = fakeAi(choosing("Pekárna Kubát"));
    await runWeeklyReview(env(ai), TEAM, now, { dryRun: true });

    expect(await activeMainSponsor(TEAM)).toBeNull();
    const [log] = await sponsorDecisions();
    expect(log.mode).toBe("shadow");
    expect(log.executed).toBeNull();
  }, 120_000);
});
