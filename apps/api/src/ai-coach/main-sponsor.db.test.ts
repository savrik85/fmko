/**
 * Hlavní sponzor AI klubu na skutečné D1 (Miniflare, všechny migrace).
 *
 * Model vybere firmu z těch, se kterými jde teď jednat, a podepíše se úvodní nabídka majitele
 * stejným jednáním jako u člověka (openNegotiation + signNegotiation). Neplatná volba, výpadek
 * modelu a režim off: pořadí náhradního pravidla podle povahy. Režim shadow jen rozhodne a zapíše.
 */
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Bindings } from "../index";
import { maybeSignMainSponsor } from "./main-sponsor";
import { COACH_MODE_KEY } from "./mode";
import { generateAiProfile, type AiCoachProfile } from "./profile";
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

/**
 * Falešný Workers AI. Výběru hlavního sponzora odpoví `answer` (funkcí dostane popis pro model),
 * týdenní správě prázdným objektem (ta pak jede podle náhradního pravidla).
 */
function fakeAi(answer: (prompt: string) => unknown, onSponsorCall?: () => Promise<void>): FakeAi {
  const calls: RecordedCall[] = [];
  return {
    calls,
    run: async (_model: string, input: unknown) => {
      const req = input as { messages: Array<{ role: string; content: string }>; response_format?: { json_schema?: { name?: string } } };
      const schemaName = req.response_format?.json_schema?.name ?? null;
      const user = req.messages.find((m) => m.role === "user")?.content ?? "";
      calls.push({ schemaName, user, input: input as Record<string, unknown> });
      if (schemaName !== "main_sponsor") return { choices: [{ message: { content: "{}" } }] };
      if (onSponsorCall) await onSponsorCall();
      return {
        choices: [{ message: { content: JSON.stringify(answer(user)) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      };
    },
  };
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

async function sponsorDecisions(): Promise<DecisionRow[]> {
  return (await db.prepare(
    `SELECT mode, model, used_fallback, error, input_summary, raw_output, actions, executed, tokens_in, tokens_out, context_ref
       FROM ai_coach_decisions WHERE team_id = ? AND kind = 'main_sponsor' ORDER BY created_at`,
  ).bind(TEAM).all<DecisionRow>()).results;
}

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
    db.prepare("UPDATE teams SET name = 'Sokol Lhota', last_main_sponsor_change_season = NULL, budget = 80000 WHERE id = ?").bind(TEAM),
  ]);
  await kv.delete(COACH_MODE_KEY);
});

describe("hlavní sponzor AI klubu: model vybírá, kód hlídá", () => {
  it("model vybere firmu z nabídky a podepíše se její úvodní nabídka stejným jednáním jako u člověka", async () => {
    const ai = fakeAi(choosing("Pekárna Kubát"));
    const res = await maybeSignMainSponsor(db, TEAM, PROFILE, { ai: aiEnv(ai), contextRef: "week:2026-11-02" });

    expect(res.signed).toBe(true);
    expect(await activeMainSponsor(TEAM)).toBe(BAKERY);
    expect(await negotiations()).toEqual([{ sponsor_id: BAKERY, status: "signed" }]);
    const team = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(TEAM).first<{ name: string }>();
    expect(team?.name).toContain("Pekárna Kubát");

    // Model dostal jen firmy, se kterými jde jednat: obsazený Velkostatek v nabídce není.
    expect(ai.calls).toHaveLength(1);
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
