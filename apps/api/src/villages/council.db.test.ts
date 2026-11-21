/**
 * Zasedání zastupitelstva na skutečné D1 (Miniflare, všechny migrace): založení v pondělí,
 * pozvánka od starosty přes den, proslov přes Telefon, rozdělení banku s dotací přes
 * recordTransaction, článek a SMS od Redakce Zpravodaje. Opakovaný běh nic nezdvojí.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Hono } from "hono";
import { createSession } from "../auth/session";
import type { Bindings } from "../index";
import type { AiContext } from "../lib/ai-provider";
import { messagingRouter } from "../routes/messaging";
import { clubMinimum } from "./council";
import { createMonthlyCouncilSessions, decideCouncilSession, handleCouncilReply, tickVillageCouncil } from "./council-db";

const app = new Hono<{ Bindings: Bindings }>();
app.route("/api", messagingRouter);

let mf: Miniflare;
let db: D1Database;
let kv: KVNamespace;
let sessions: KVNamespace;
let villages: string[] = [];

const HUMAN = "human-club";
const HUMAN_2 = "human-club-2";
const AI_CLUB = "ai-club";
const AI_ELSEWHERE = "ai-elsewhere";
const LEAGUE = "l-1";
const LEAGUE_2 = "l-2";
const NEWS_DESK = "Redakce Zpravodaje";
const MONDAY = "2026-11-23";
/** Denní tick v pondělí ve čtyři ráno v Praze. */
const TICK_AT = new Date("2026-11-23T03:00:00Z");
/** Pondělí v pět ráno: starosta ještě spí. */
const NIGHT = new Date("2026-11-23T04:00:00Z");
/** Pondělí půl jedné v Praze: pozvánky už jsou na řadě. */
const NOON = new Date("2026-11-23T11:30:00Z");
const SPEECH_AT = new Date("2026-11-23T12:00:00Z");
const REPLY_RUN = new Date("2026-11-23T13:30:00Z");
/** Středa půl jedné: v den zasedání připomínka. */
const WEDNESDAY_NOON = new Date("2026-11-25T11:30:00Z");
/** Středa půl deváté večer: zasedání skončilo, výsledek do novin. */
const DECIDE_AT = new Date("2026-11-25T19:30:00Z");
/** Čtvrtek půl desáté ráno. */
const NEXT_MORNING = new Date("2026-11-26T08:30:00Z");

const GOOD_SPEECH = "Vážení zastupitelé, za peníze bychom koupili nové branky a míče pro žáky, opravili kabiny a na jaře "
  + "uspořádáme s hasiči brigádu na úklid obce. Fotbal tu hraje celá vesnice a děti mají kam chodit místo mobilu.";

async function count(sql: string, ...binds: unknown[]): Promise<number> {
  return (await db.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0;
}

async function grant(teamId: string) {
  return db.prepare("SELECT * FROM village_grants WHERE team_id = ?").bind(teamId).first<Record<string, unknown>>();
}

async function session() {
  return db.prepare("SELECT * FROM village_council_sessions").first<Record<string, unknown>>();
}

async function mayorMessages(teamId: string) {
  return (await db.prepare(
    `SELECT m.body, m.sender_type, c.title, c.participant_id, c.participant_avatar FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.team_id = ? AND c.type = 'system' AND c.participant_id LIKE 'vo-%' ORDER BY m.sent_at, m.rowid`,
  ).bind(teamId).all<{ body: string; sender_type: string; title: string; participant_id: string; participant_avatar: string | null }>()).results;
}

async function redakceMessages(teamId: string) {
  return (await db.prepare(
    `SELECT m.body, m.metadata FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.team_id = ? AND c.type = 'system' AND c.title = ?`,
  ).bind(teamId, NEWS_DESK).all<{ body: string; metadata: string }>()).results;
}

async function grants(teamId: string) {
  return (await db.prepare("SELECT amount, reference_id, game_date FROM transactions WHERE team_id = ? AND type = 'village_grant'")
    .bind(teamId).all<{ amount: number; reference_id: string; game_date: string }>()).results;
}

async function budget(teamId: string): Promise<number> {
  return (await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>())?.budget ?? 0;
}

async function mayorConvId(teamId: string): Promise<string> {
  const r = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND participant_id LIKE 'vo-%'").bind(teamId).first<{ id: string }>();
  if (!r) throw new Error(`klub ${teamId} nemá konverzaci se starostou`);
  return r.id;
}

/** Trenér napíše starostovi (zpráva v konverzaci jako z Telefonu + zpracování proslovu). */
async function coachWrites(teamId: string, text: string, at: Date) {
  const convId = await mayorConvId(teamId);
  const conv = await db.prepare("SELECT participant_id FROM conversations WHERE id = ?").bind(convId).first<{ participant_id: string }>();
  await db.prepare(
    "INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'user', 'Trenér', ?, ?)",
  ).bind(crypto.randomUUID(), convId, text, at.toISOString()).run();
  await handleCouncilReply(db, { teamId, convId, participantId: conv!.participant_id, text }, at);
}

function fakeAi(answer: (prompt: string) => unknown) {
  const prompts: string[] = [];
  const ctx = {
    provider: "workers-ai",
    ai: {
      run: async (_model: string, input: { messages: Array<{ content: string }> }) => {
        const prompt = input.messages[0]?.content ?? "";
        prompts.push(prompt);
        return { response: answer(prompt) };
      },
    },
  } as unknown as AiContext;
  return { ctx, prompts };
}

async function wipe(): Promise<void> {
  const linked = (await db.prepare(
    `SELECT DISTINCT m.name FROM sqlite_master m WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%'
       AND (EXISTS (SELECT 1 FROM pragma_table_info(m.name) p WHERE p.name IN ('team_id', 'player_id', 'conversation_id', 'village_id'))
         OR EXISTS (SELECT 1 FROM pragma_foreign_key_list(m.name) f WHERE f."table" IN ('teams', 'players', 'leagues', 'seasons', 'managers')))
       AND m.name != 'villages'`,
  ).all<{ name: string }>()).results.map((r) => r.name);
  const tables = [...new Set([...linked, "village_grants", "village_council_sessions", "village_officials", "news", "messages", "conversations", "transactions", "managers", "teams", "leagues", "seasons"])];
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

async function addTeam(id: string, userId: string, villageIdx: number, league: string, name: string) {
  await db.prepare(
    `INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date, phone_credit, phone_credit_date)
     VALUES (?, ?, ?, ?, 50000, ?, 'senior', ?, 36, ?)`,
  ).bind(id, userId, villages[villageIdx], name, league, MONDAY, MONDAY).run();
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["CACHE_KV", "SESSION_KV"],
  });
  db = await mf.getD1Database("DB");
  kv = await mf.getKVNamespace("CACHE_KV") as unknown as KVNamespace;
  sessions = await mf.getKVNamespace("SESSION_KV") as unknown as KVNamespace;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }
  villages = (await db.prepare("SELECT id FROM villages WHERE district = 'Prachatice' ORDER BY id LIMIT 2").all<{ id: string }>()).results.map((r) => r.id);
}, 120_000);

afterAll(async () => {
  await mf.dispose();
});

beforeEach(async () => {
  await wipe();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('ai', 'ai@system.local', 'none'), ('u-human', 'human@example.test', 'x'), ('u-human-2', 'human2@example.test', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('s-3', 3, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES (?, 's-3', 'Prachatice', 'Okresní přebor', 'okresni_prebor'), (?, 's-3', 'Prachatice', 'III. třída', 'okresni_soutez')")
      .bind(LEAGUE, LEAGUE_2),
  ]);
  await addTeam(HUMAN, "u-human", 0, LEAGUE, "Jiskra Husinec");
  // AI klub v obci bez lidského klubu: tam se nezasedá.
  await addTeam(AI_ELSEWHERE, "ai", 1, LEAGUE, "TJ Netolice");
});

describe("založení zasedání v pondělí", () => {
  it("jedno zasedání na obec s lidským klubem za herní měsíc, opakovaný tick nic nezdvojí", async () => {
    await addTeam(AI_CLUB, "ai", 0, LEAGUE_2, "Sokol Husinec B");
    expect(await createMonthlyCouncilSessions(db, MONDAY, TICK_AT)).toBe(1);
    const s = await session();
    expect(s).toMatchObject({ village_id: villages[0], month: "2026-11", session_date: "2026-11-25", status: "open", deadline_at: "2026-11-25T17:00:00.000Z" });
    expect(Number(s!.pot)).toBeGreaterThan(0);
    expect(s!.mayor_id).toBeTruthy();
    const rows = (await db.prepare("SELECT applicant, team_id FROM village_grants ORDER BY applicant, team_id").all()).results;
    expect(rows).toEqual([
      { applicant: "club", team_id: AI_CLUB },
      { applicant: "club", team_id: HUMAN },
      { applicant: "firefighters", team_id: null },
      { applicant: "hunters", team_id: null },
    ]);

    expect(await createMonthlyCouncilSessions(db, MONDAY, TICK_AT)).toBe(0);
    // Další pondělí téhož herního měsíce: zasedání už bylo založené.
    expect(await createMonthlyCouncilSessions(db, "2026-11-30", new Date("2026-11-30T03:00:00Z"))).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM village_council_sessions")).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM village_grants")).toBe(4);
  }, 60_000);
});

describe("pozvánka od starosty a proslov přes Telefon", () => {
  it("starosta píše přes den, ne v noci, a jen jednou; AI klubu nic nechodí", async () => {
    await addTeam(AI_CLUB, "ai", 0, LEAGUE_2, "Sokol Husinec B");
    await createMonthlyCouncilSessions(db, MONDAY, TICK_AT);

    expect((await tickVillageCouncil(db, { CACHE_KV: kv }, NIGHT, { ai: null })).invited).toBe(0);
    expect(await mayorMessages(HUMAN)).toHaveLength(0);

    expect((await tickVillageCouncil(db, { CACHE_KV: kv }, NOON, { ai: null })).invited).toBe(1);
    const msgs = await mayorMessages(HUMAN);
    expect(msgs).toHaveLength(1);
    const s = await session();
    expect(msgs[0]).toMatchObject({ sender_type: "system", participant_id: `vo-${s!.mayor_id}` });
    expect(msgs[0].title).toMatch(/^Starosta /);
    expect(msgs[0].participant_avatar).toBeTruthy();
    expect(msgs[0].body).toContain("ve středu");
    expect(msgs[0].body).toContain("Sokol Husinec B");
    expect(msgs[0].body).not.toMatch(/[—–]/);
    expect(await count("SELECT COUNT(*) AS n FROM conversations WHERE team_id = ?", AI_CLUB)).toBe(0);

    await tickVillageCouncil(db, { CACHE_KV: kv }, new Date(NOON.getTime() + 3600_000), { ai: null });
    expect(await mayorMessages(HUMAN)).toHaveLength(1);
  }, 60_000);

  it("do vlákna starosty se píše zdarma, proslov se zapíše a starosta odepíše s prodlevou", async () => {
    await createMonthlyCouncilSessions(db, MONDAY, TICK_AT);
    await tickVillageCouncil(db, { CACHE_KV: kv }, NOON, { ai: null });
    const convId = await mayorConvId(HUMAN);
    const env = { DB: db, CACHE_KV: kv, SESSION_KV: sessions } as unknown as Bindings;
    const token = await createSession(sessions, "u-human", "human@example.test", HUMAN);

    const detail = await app.request(`/api/teams/${HUMAN}/conversations/${convId}`, { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(await detail.json()).toMatchObject({ canReply: true, channel: "imessage" });

    const background: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => { background.push(p); }, passThroughOnException: () => undefined, props: {} };
    // Routa bere čas z hodin: trenér píše v pondělí v poledne, dva dny před zasedáním.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(SPEECH_AT);
    let res: Response;
    try {
      res = await app.request(`/api/teams/${HUMAN}/conversations/${convId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body: GOOD_SPEECH }),
      }, env, ctx as unknown as ExecutionContext);
      await Promise.allSettled(background);
    } finally {
      vi.useRealTimers();
    }
    expect(res.status).toBe(200);

    const g = await grant(HUMAN);
    expect(g).toMatchObject({ speech: GOOD_SPEECH, speech_by: "coach" });
    expect(g!.pending_reply).toBeTruthy();
    // Zdarma: kredit zůstal celý.
    expect((await db.prepare("SELECT phone_credit FROM teams WHERE id = ?").bind(HUMAN).first<{ phone_credit: number }>())?.phone_credit).toBe(36);
    // Odpověď ještě nepřišla, přijde s prodlevou z hodinového běhu.
    expect((await mayorMessages(HUMAN)).map((m) => m.sender_type)).toEqual(["system", "user"]);

    const r = await tickVillageCouncil(db, { CACHE_KV: kv }, REPLY_RUN, { ai: null });
    expect(r.replies).toBe(1);
    const msgs = await mayorMessages(HUMAN);
    expect(msgs.map((m) => m.sender_type)).toEqual(["system", "user", "system"]);
    expect(msgs[2].body).not.toMatch(/[—–]/);
    expect((await grant(HUMAN))!.pending_reply).toBeNull();
  }, 60_000);

  it("další SMS se připíše k proslovu, po začátku zasedání už ne", async () => {
    await createMonthlyCouncilSessions(db, MONDAY, TICK_AT);
    await tickVillageCouncil(db, { CACHE_KV: kv }, NOON, { ai: null });
    await coachWrites(HUMAN, "Chceme nové sítě na branky.", SPEECH_AT);
    await coachWrites(HUMAN, "A dresy pro žáky.", new Date(SPEECH_AT.getTime() + 60_000));
    expect((await grant(HUMAN))!.speech).toBe("Chceme nové sítě na branky.\nA dresy pro žáky.");
    // Jedna čekající odpověď, ne dvě.
    await tickVillageCouncil(db, { CACHE_KV: kv }, REPLY_RUN, { ai: null });
    expect((await mayorMessages(HUMAN)).filter((m) => m.sender_type === "system")).toHaveLength(2);

    await coachWrites(HUMAN, "Ještě jedna věc, zapomněl jsem.", new Date("2026-11-25T17:30:00Z"));
    expect((await grant(HUMAN))!.speech).toBe("Chceme nové sítě na branky.\nA dresy pro žáky.");
    expect(String((await grant(HUMAN))!.pending_reply)).toMatch(/pozdě/);
  }, 60_000);

  it("v den zasedání od poledne připomínka jen tomu, kdo nic neposlal, a jen jednou", async () => {
    await addTeam(HUMAN_2, "u-human-2", 0, LEAGUE, "Sokol Husinec");
    await createMonthlyCouncilSessions(db, MONDAY, TICK_AT);
    await tickVillageCouncil(db, { CACHE_KV: kv }, NOON, { ai: null });
    await coachWrites(HUMAN, GOOD_SPEECH, SPEECH_AT);
    await tickVillageCouncil(db, { CACHE_KV: kv }, REPLY_RUN, { ai: null });

    const first = await tickVillageCouncil(db, { CACHE_KV: kv }, WEDNESDAY_NOON, { ai: null });
    expect(first.reminded).toBe(1);
    expect((await mayorMessages(HUMAN_2)).at(-1)?.body).toMatch(/dneska v šest/);
    expect((await mayorMessages(HUMAN)).some((m) => /dneska v šest/.test(m.body))).toBe(false);
    expect((await tickVillageCouncil(db, { CACHE_KV: kv }, new Date(WEDNESDAY_NOON.getTime() + 3600_000), { ai: null })).reminded).toBe(0);
  }, 60_000);
});

describe("rozdělení banku po zasedání (AI vypnutá)", () => {
  it("bez proslovu dostane fotbal minimum; dotace, článek a SMS od Redakce; opakovaný běh = jedna dotace a jedna SMS", async () => {
    await createMonthlyCouncilSessions(db, MONDAY, TICK_AT);
    await tickVillageCouncil(db, { CACHE_KV: kv }, NOON, { ai: null });
    const pot = Number((await session())!.pot);
    const before = await budget(HUMAN);

    // Před koncem zasedání se nic nerozděluje.
    expect((await tickVillageCouncil(db, { CACHE_KV: kv }, new Date("2026-11-25T17:30:00Z"), { ai: null })).decided).toBe(0);

    const r = await tickVillageCouncil(db, { CACHE_KV: kv }, DECIDE_AT, { ai: null });
    expect(r.decided).toBe(1);
    const min = clubMinimum(pot, 1);
    expect(await grants(HUMAN)).toEqual([{ amount: min, reference_id: (await grant(HUMAN))!.id, game_date: "2026-11-25" }]);
    expect(await budget(HUMAN)).toBe(before + min);
    expect(await count("SELECT COALESCE(SUM(amount), 0) AS n FROM village_grants")).toBe(pot);
    expect(await session()).toMatchObject({ status: "closed" });

    const news = (await db.prepare("SELECT id, league_id, team_id, headline, body, season_number FROM news WHERE type = 'village_council'").all<Record<string, unknown>>()).results;
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({ league_id: LEAGUE, team_id: HUMAN, season_number: 3 });
    expect(`${news[0].headline} ${news[0].body}`).not.toMatch(/[—–]/);
    expect(String(news[0].body)).toContain("nikdo neozval");

    const sms = await redakceMessages(HUMAN);
    expect(sms).toHaveLength(1);
    expect(JSON.parse(sms[0].metadata)).toEqual({ type: "guide", href: `/zpravodaj?article=${news[0].id}`, label: "Otevřít Zpravodaj", newsId: news[0].id });

    // Opakovaný běh: hodinový tick i přímé volání nic nezopakují.
    await tickVillageCouncil(db, { CACHE_KV: kv }, NEXT_MORNING, { ai: null });
    expect(await decideCouncilSession(db, { CACHE_KV: kv }, String((await session())!.id), DECIDE_AT, { ai: null })).toBe(false);
    expect(await grants(HUMAN)).toHaveLength(1);
    expect(await redakceMessages(HUMAN)).toHaveLength(1);
    expect(await count("SELECT COUNT(*) AS n FROM news WHERE type = 'village_council'")).toBe(1);
    expect(await budget(HUMAN)).toBe(before + min);
  }, 60_000);

  it("rozjeté rozdělení po pádu převezme další běh bez dvojí výplaty a dvojí SMS", async () => {
    await createMonthlyCouncilSessions(db, MONDAY, TICK_AT);
    await tickVillageCouncil(db, { CACHE_KV: kv }, NOON, { ai: null });
    await tickVillageCouncil(db, { CACHE_KV: kv }, DECIDE_AT, { ai: null });
    // Simulace pádu po výplatě a SMS: zasedání zůstalo rozjeté se starým zámkem.
    await db.prepare("UPDATE village_council_sessions SET status = 'deciding', claimed_at = '2026-11-25T18:00:00Z'").run();
    const r = await tickVillageCouncil(db, { CACHE_KV: kv }, NEXT_MORNING, { ai: null });
    expect(r.decided).toBe(1);
    expect(await grants(HUMAN)).toHaveLength(1);
    expect(await redakceMessages(HUMAN)).toHaveLength(1);
    expect(await session()).toMatchObject({ status: "closed" });
  }, 60_000);

  it("dva kluby v jedné obci soutěží o jeden bank: kdo poslal proslov, dostane víc", async () => {
    await addTeam(HUMAN_2, "u-human-2", 0, LEAGUE_2, "Sokol Husinec");
    await createMonthlyCouncilSessions(db, MONDAY, TICK_AT);
    expect(await count("SELECT COUNT(*) AS n FROM village_council_sessions")).toBe(1);
    await tickVillageCouncil(db, { CACHE_KV: kv }, NOON, { ai: null });
    expect(await mayorMessages(HUMAN)).toHaveLength(1);
    expect(await mayorMessages(HUMAN_2)).toHaveLength(1);
    expect((await mayorMessages(HUMAN))[0].body).toContain("Sokol Husinec");
    await coachWrites(HUMAN, GOOD_SPEECH, SPEECH_AT);

    await tickVillageCouncil(db, { CACHE_KV: kv }, DECIDE_AT, { ai: null });
    const pot = Number((await session())!.pot);
    const a = (await grants(HUMAN))[0].amount;
    const b = (await grants(HUMAN_2))[0].amount;
    expect(b).toBe(clubMinimum(pot, 2));
    expect(a).toBeGreaterThan(b);
    expect(await count("SELECT COALESCE(SUM(amount), 0) AS n FROM village_grants")).toBe(pot);
    // Každá soutěž má svůj článek, každý klub jednu SMS s odkazem do své soutěže.
    const news = (await db.prepare("SELECT id, league_id FROM news WHERE type = 'village_council' ORDER BY league_id").all<{ id: string; league_id: string }>()).results;
    expect(news.map((n) => n.league_id)).toEqual([LEAGUE, LEAGUE_2]);
    const smsA = await redakceMessages(HUMAN);
    const smsB = await redakceMessages(HUMAN_2);
    expect(smsA).toHaveLength(1);
    expect(smsB).toHaveLength(1);
    expect(JSON.parse(smsA[0].metadata).newsId).toBe(news[0].id);
    expect(JSON.parse(smsB[0].metadata).newsId).toBe(news[1].id);
    // Dobrý proslov obci zalichotil.
    expect(await db.prepare("SELECT favor FROM village_team_favor WHERE team_id = ? AND official_id IS NULL").bind(HUMAN).first())
      .toEqual({ favor: 52 });
  }, 60_000);

  it("AI klub bez modelu přednese připravený proslov podle povahy a rozdělení nezasekne", async () => {
    await addTeam(AI_CLUB, "ai", 0, LEAGUE_2, "Sokol Husinec B");
    await createMonthlyCouncilSessions(db, MONDAY, TICK_AT);
    await tickVillageCouncil(db, { CACHE_KV: kv }, NOON, { ai: null });
    await tickVillageCouncil(db, { CACHE_KV: kv }, DECIDE_AT, { ai: null });
    const g = await grant(AI_CLUB);
    expect(g).toMatchObject({ speech_by: "rule" });
    expect(String(g!.speech).length).toBeGreaterThan(30);
    expect((await grants(AI_CLUB))).toHaveLength(1);
    expect(await redakceMessages(AI_CLUB)).toHaveLength(0);
    expect(await session()).toMatchObject({ status: "closed" });
  }, 60_000);
});

describe("rozdělení s modelem", () => {
  it("proslov posoudí model se zastupiteli a přízní, AI klub napíše proslov modelem, článek od modelu", async () => {
    await addTeam(AI_CLUB, "ai", 0, LEAGUE, "Sokol Husinec B");
    await createMonthlyCouncilSessions(db, MONDAY, TICK_AT);
    await tickVillageCouncil(db, { CACHE_KV: kv }, NOON, { ai: null });
    await coachWrites(HUMAN, "Chceme nové sítě a míče pro žáky, na jaře pomůžeme s úklidem obce.", SPEECH_AT);

    const { ctx, prompts } = fakeAi((prompt) => {
      if (prompt.includes("Jsi zapisovatel")) {
        return prompt.includes("sítě") ? { score: 3, reaction: "Zastupitelé tleskali a starosta kýval." } : { score: 0, reaction: "Nic moc." };
      }
      if (prompt.includes("Napiš krátký proslov")) return { speech: "Pane starosto, opravíme kabiny a uděláme den otevřených dveří pro děti z obce." };
      if (prompt.includes("Jsi redaktor")) {
        const facts = prompt.split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2)).join(" ");
        return { headline: "Fotbal na zastupitelstvu uspěl", body: `Ze zasedání. ${facts}` };
      }
      return null;
    });
    await tickVillageCouncil(db, { CACHE_KV: kv }, DECIDE_AT, { ai: ctx, coachMode: "on" });

    const judge = prompts.find((p) => p.includes("Jsi zapisovatel") && p.includes("sítě"));
    expect(judge).toBeDefined();
    expect(judge).toMatch(/starosta [^\n]+:/);
    expect(judge).toContain("Přízeň obce ke klubu Jiskra Husinec: obec je ke klubu vlažná");
    expect(await grant(AI_CLUB)).toMatchObject({ speech_by: "model", speech: "Pane starosto, opravíme kabiny a uděláme den otevřených dveří pro děti z obce." });
    expect(JSON.parse(String((await grant(HUMAN))!.verdict))).toMatchObject({ score: 3, by: "model" });
    expect((await grants(HUMAN))[0].amount).toBeGreaterThan((await grants(AI_CLUB))[0].amount);

    const news = await db.prepare("SELECT headline FROM news WHERE type = 'village_council'").first<{ headline: string }>();
    expect(news?.headline).toBe("Fotbal na zastupitelstvu uspěl");
  }, 60_000);
});
