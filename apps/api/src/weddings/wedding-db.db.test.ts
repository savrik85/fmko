/**
 * Svatba v kabině na skutečné D1 (Miniflare, všechny migrace včetně 0320).
 *
 * Ohlášení s datem, odpověď trenéra (model i pravidlo), dar jednou, kocovina v sestavě jako
 * incidentní absence, den po svatbě dopady, článek ve Zpravodaji se SMS od Redakce a AI klub,
 * který rozhoduje modelem a bez modelu pravidlem. Opakovaný běh nesmí nic zdvojit.
 */
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { decideAiWeddings } from "../ai-coach/weddings";
import { generateAiProfile } from "../ai-coach/profile";
import { zalozSituaci } from "../incidents/situace-db";
import { nactiStavKlubu } from "../incidents/stav-klubu";
import type { Bindings } from "../index";
import { czechDayWords } from "./wedding";
import { handleWeddingReply, processWeddingsForDay, publishWeddingArticles, recordWeddingDecision, type WeddingRow } from "./wedding-db";

let mf: Miniflare;
let db: D1Database;
let kv: KVNamespace;
let villages: string[] = [];

const HUMAN = "human-club";
const AI = "ai-club";
const LEAGUE = "l-1";
const ANNOUNCED = "2026-11-16";
const WEDDING = "2026-11-20";
const MATCH = "2026-11-21";
const START_BUDGET = 50_000;
/** 10:30 v Praze. */
const MORNING = new Date("2026-11-21T09:30:00.000Z");

const GROOM = "h-groom";
const HEAVY = ["h-heavy1", "h-heavy2", "h-heavy3"];
const MODERATE = "h-moderate";
const SOBER = "h-sober";

function env(extra: Partial<Bindings> = {}): Bindings {
  return { DB: db, CACHE_KV: kv, ...extra } as unknown as Bindings;
}

async function setGameDay(day: string): Promise<void> {
  await db.prepare("UPDATE teams SET game_date = ?").bind(`${day}T16:00:00.000Z`).run();
}

async function count(sql: string, ...binds: unknown[]): Promise<number> {
  return (await db.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0;
}

async function wedding(id: string): Promise<WeddingRow> {
  const row = await db.prepare("SELECT * FROM weddings WHERE id = ?").bind(id).first<WeddingRow>();
  if (!row) throw new Error(`svatba ${id} chybí`);
  return row;
}

async function budget(teamId: string): Promise<number> {
  return (await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>())?.budget ?? NaN;
}

async function messagesOf(teamId: string): Promise<Array<{ body: string; metadata: string | null; title: string }>> {
  return (await db.prepare(
    `SELECT m.body, m.metadata, c.title FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.team_id = ? ORDER BY m.sent_at, m.rowid`,
  ).bind(teamId).all<{ body: string; metadata: string | null; title: string }>()).results;
}

async function groomConversation(): Promise<string> {
  const id = `conv-${GROOM}`;
  await db.prepare(
    `INSERT OR IGNORE INTO conversations (id, team_id, type, title, participant_id, pinned, unread_count, last_message_text, last_message_at, created_at)
     VALUES (?, ?, 'player', 'Franta Ženich', ?, 0, 0, '', '2026-11-16T05:00:00Z', '2026-11-16T05:00:00Z')`,
  ).bind(id, HUMAN, GROOM).run();
  return id;
}

async function insertWedding(id: string, teamId: string, groomId: string, matchDate: string | null = MATCH): Promise<void> {
  await db.prepare(
    `INSERT INTO weddings (id, team_id, player_id, season_number, announced_on, wedding_date, match_date, created_at)
     VALUES (?, ?, ?, 1, ?, ?, ?, '2026-11-16T05:00:00Z')`,
  ).bind(id, teamId, groomId, ANNOUNCED, WEDDING, matchDate).run();
}

async function absences(teamId: string): Promise<Array<{ player_id: string; kind: string; od_dne: string; do_dne: string; announced_on: string }>> {
  return (await db.prepare(
    "SELECT player_id, kind, od_dne, do_dne, announced_on FROM club_incident_absences WHERE team_id = ? ORDER BY player_id",
  ).bind(teamId).all<{ player_id: string; kind: string; od_dne: string; do_dne: string; announced_on: string }>()).results;
}

async function stateOf(teamId: string, day: string) {
  const s = await nactiStavKlubu(db, { id: teamId, league_id: LEAGUE }, `${day}T16:00:00.000Z`, 1);
  if (!s) throw new Error("stav klubu se nenačetl");
  return s;
}

/** Falešný Workers AI pro chat (`{response}`) i pro AI trenéra (`choices`). */
function fakeAi(answer: unknown) {
  const prompts: string[] = [];
  return {
    prompts,
    AI: {
      run: async (_model: string, input: { messages: Array<{ role: string; content: string }> }) => {
        prompts.push(input.messages.map((m) => m.content).join("\n"));
        const content = JSON.stringify(answer);
        return { response: content, choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
      },
    } as unknown as Ai,
  };
}

/** Tabulky s vazbou na tým, hráče nebo soutěž (zjistí se jednou v beforeAll). */
let wipedTables: string[] = [];

/** Úklid mezi testy jednou dávkou, cizí klíče se kontrolují až na konci dávky. */
async function wipe(): Promise<void> {
  await db.batch([db.prepare("PRAGMA defer_foreign_keys = true"), ...wipedTables.map((t) => db.prepare(`DELETE FROM ${t}`))]);
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["CACHE_KV"],
  });
  db = await mf.getD1Database("DB");
  kv = await mf.getKVNamespace("CACHE_KV") as unknown as KVNamespace;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }
  villages = (await db.prepare("SELECT id FROM villages WHERE district = 'Prachatice' ORDER BY id LIMIT 2").all<{ id: string }>()).results.map((r) => r.id);
  const linked = (await db.prepare(
    `SELECT DISTINCT m.name FROM sqlite_master m WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%'
       AND (EXISTS (SELECT 1 FROM pragma_table_info(m.name) p WHERE p.name IN ('team_id', 'player_id', 'incident_id', 'conversation_id', 'league_id'))
         OR EXISTS (SELECT 1 FROM pragma_foreign_key_list(m.name) f WHERE f."table" IN ('teams', 'players', 'leagues', 'seasons', 'managers', 'matches', 'season_calendar')))`,
  ).all<{ name: string }>()).results.map((r) => r.name);
  wipedTables = [...new Set([...linked, "news", "matches", "season_calendar", "players", "managers", "teams", "leagues", "seasons"])];
}, 120_000);

afterAll(async () => {
  await mf.dispose();
});

beforeEach(async () => {
  await wipe();
  await kv.delete("ai_provider");
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('ai', 'ai@system.local', 'none'), ('u-human', 'human@example.test', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('s-1', 1, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES (?, 's-1', 'Prachatice', 'Okresní přebor', 'okresni_prebor')").bind(LEAGUE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date) VALUES (?, 'u-human', ?, 'Jiskra Husinec', ?, ?, 'senior', ?)")
      .bind(HUMAN, villages[0], START_BUDGET, LEAGUE, `${ANNOUNCED}T16:00:00.000Z`),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date) VALUES (?, 'ai', ?, 'TJ Netolice', ?, ?, 'senior', ?)")
      .bind(AI, villages[1], START_BUDGET, LEAGUE, `${ANNOUNCED}T16:00:00.000Z`),
    db.prepare("INSERT INTO managers (id, user_id, team_id, name, backstory, avatar, ai_profile) VALUES ('m-ai', 'ai', ?, 'Jan Trenér', '', '{}', ?)")
      .bind(AI, JSON.stringify({ ...generateAiProfile(AI, null), thrift: 50, ambition: 50 })),
    db.prepare("INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES ('cal-1', ?, 1, 5, 'saturday', ?, 'scheduled')")
      .bind(LEAGUE, `${MATCH}T16:00:00.000Z`),
    db.prepare("INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES ('cal-2', ?, 1, 6, 'saturday', ?, 'scheduled')")
      .bind(LEAGUE, "2026-11-28T16:00:00.000Z"),
    db.prepare("INSERT INTO matches (id, league_id, calendar_id, home_team_id, away_team_id, status) VALUES ('m-1', ?, 'cal-1', ?, ?, 'scheduled')").bind(LEAGUE, HUMAN, AI),
    db.prepare("INSERT INTO matches (id, league_id, calendar_id, home_team_id, away_team_id, status) VALUES ('m-2', ?, 'cal-2', ?, ?, 'scheduled')").bind(LEAGUE, AI, HUMAN),
  ]);
  const insert = db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, weekly_wage, status, coach_relationship)
     VALUES (?, ?, ?, ?, 28, 'MID', 40, '{}', '{}', ?, ?, '{}', 1000, 'active', 50)`,
  );
  const personality = (alcohol: number) => JSON.stringify({ leadership: 30, discipline: 50, temper: 40, alcohol, patriotism: 50 });
  const lifeContext = JSON.stringify({ morale: 60, condition: 100, occupation: "Zedník" });
  const squad = (prefix: string, teamId: string) => [
    insert.bind(`${prefix}-groom`, teamId, "Franta", "Ženich", personality(70), lifeContext),
    insert.bind(`${prefix}-heavy1`, teamId, "Pepa", "Pivař", personality(95), lifeContext),
    insert.bind(`${prefix}-heavy2`, teamId, "Karel", "Rum", personality(85), lifeContext),
    insert.bind(`${prefix}-heavy3`, teamId, "Jarda", "Slivovice", personality(80), lifeContext),
    insert.bind(`${prefix}-moderate`, teamId, "Tonda", "Pivko", personality(60), lifeContext),
    insert.bind(`${prefix}-sober`, teamId, "Jan", "Střízlivý", personality(10), lifeContext),
  ];
  await db.batch([...squad("h", HUMAN), ...squad("a", AI)]);
});

describe("ohlášení svatby", () => {
  it("situace svatba dostane datum a pozvánku, kocovina hned nepřijde", async () => {
    const clubState = await stateOf(HUMAN, ANNOUNCED);
    const id = await zalozSituaci(env(), clubState, {
      kind: "svatba_spoluhrace", category: "zivotni", status: "probiha", severity: 1, culpritType: "nikdo",
      culpritPlayerId: null, culpritRevealed: false, subjectPlayerId: GROOM, dniTrvani: 1, ztraty: [], text: "Franta Ženich se bude ženit.",
    });
    expect(id).toBeTruthy();
    const w = await wedding(id!);
    expect(w.wedding_date >= "2026-11-20").toBe(true);
    expect(w).toMatchObject({ team_id: HUMAN, player_id: GROOM, announced_on: ANNOUNCED, choice: null });
    if (w.match_date) expect(w.match_date).toBe(new Date(Date.parse(`${w.wedding_date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10));
    // Situace trvá do dne po svatbě, ať ji stránka nehlásí jako skončenou, než se kdo ožení.
    const inc = await db.prepare("SELECT ends_on, text FROM club_incidents WHERE id = ?").bind(id).first<{ ends_on: string; text: string }>();
    expect(inc?.ends_on.slice(0, 10)).toBe(new Date(Date.parse(`${w.wedding_date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10));
    expect(inc?.text).toContain(czechDayWords(w.wedding_date));
    const sms = await messagesOf(HUMAN);
    expect(sms).toHaveLength(1);
    expect(sms[0].body).toContain(czechDayWords(w.wedding_date));
    expect(sms[0].body).not.toContain("—");
    expect(await count("SELECT COUNT(*) AS n FROM condition_log WHERE team_id = ?", HUMAN)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM club_incident_absences WHERE team_id = ?", HUMAN)).toBe(0);
    // Stav klubu o svatbě ví (rozlučka se svobodou).
    expect((await stateOf(HUMAN, ANNOUNCED)).upcomingWedding).toEqual({ groomId: GROOM, date: w.wedding_date });
  }, 60_000);
});

describe("odpověď trenéra", () => {
  it("přijdu a pohlídám je: poloviční kocovina, vztah až po svatbě, druhá zpráva nic nezdvojí", async () => {
    await insertWedding("w-attend", HUMAN, GROOM);
    await setGameDay("2026-11-17");
    const conv = await groomConversation();

    expect(await handleWeddingReply(db, env(), conv, "Jasně že přijdu, to si nenechám ujít, a na ty magory dohlídnu")).toBe(true);
    // Další zpráva už žádnou otevřenou svatbu nenajde.
    expect(await handleWeddingReply(db, env(), conv, "Jasně že přijdu, fakt")).toBeNull();

    const w = await wedding("w-attend");
    expect(w).toMatchObject({ choice: "attend", decided_by: "coach", gift_amount: null });
    const abs = await absences(HUMAN);
    expect(abs).toEqual([{ player_id: "h-heavy1", kind: "hangover", od_dne: MATCH, do_dne: MATCH, announced_on: "2026-11-17" }]);
    expect(await count("SELECT COUNT(*) AS n FROM coach_relation_log WHERE player_id = ?", GROOM)).toBe(0);
    const notes = (await messagesOf(HUMAN)).filter((m) => m.body.startsWith("💍"));
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toContain("dohlédneš na kluky");

    // Opakované zapsání téhož rozhodnutí (dvě rychlé zprávy) projde jen jednou.
    expect((await recordWeddingDecision(db, { ...w, choice: null }, { choice: "attend", giftAmount: null, decidedBy: "coach" }, { today: "2026-11-17", gameDate: "2026-11-17T16:00:00.000Z" })).recorded).toBe(false);

    // Den po svatbě: kondice pijáků jednou, vztah ženicha jednou, poděkování jednou.
    await setGameDay(MATCH);
    await processWeddingsForDay(env(), await stateOf(HUMAN, MATCH));
    await processWeddingsForDay(env(), await stateOf(HUMAN, MATCH));
    expect((await wedding("w-attend")).settled_at).toBeTruthy();
    const drops = await db.prepare("SELECT player_id FROM condition_log WHERE team_id = ? ORDER BY player_id").bind(HUMAN).all<{ player_id: string }>();
    expect(drops.results.map((r) => r.player_id)).toEqual(["h-heavy2", "h-heavy3", "h-moderate"]);
    const rel = await db.prepare("SELECT delta, description FROM coach_relation_log WHERE player_id = ?").bind(GROOM).all<{ delta: number; description: string }>();
    expect(rel.results).toEqual([{ delta: 8, description: "Přišel jsi na jeho svatbu" }]);
    const fromGroom = (await messagesOf(HUMAN)).filter((m) => m.title === "Franta Ženich" && m.body.startsWith("Trenére"));
    expect(fromGroom).toHaveLength(1);
  }, 60_000);

  it("pošlu dar: peníze se strhnou jednou a kluci pijí naplno", async () => {
    await insertWedding("w-gift", HUMAN, GROOM);
    await setGameDay("2026-11-17");
    const conv = await groomConversation();

    expect(await handleWeddingReply(db, env(), conv, "Na svatbu nedorazím, mám šichtu, ale pošlu ti obálku, tři táce, a užijte si to")).toBe(true);
    const w = await wedding("w-gift");
    expect(w).toMatchObject({ choice: "gift", gift_amount: 3000 });
    // Druhý běh se stejným (zastaralým) řádkem nic nezaplatí.
    await recordWeddingDecision(db, { ...w, choice: null, gift_paid_at: null }, { choice: "gift", giftAmount: 3000, decidedBy: "coach" }, { today: "2026-11-17", gameDate: "2026-11-17T16:00:00.000Z" });
    expect(await count("SELECT COUNT(*) AS n FROM transactions WHERE team_id = ? AND type = 'wedding_gift'", HUMAN)).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM transactions WHERE team_id = ? AND reference_id = 'wedding-gift-w-gift' AND amount = -3000", HUMAN)).toBe(1);
    expect(await budget(HUMAN)).toBe(START_BUDGET - 3000);
    expect((await absences(HUMAN)).map((a) => a.player_id)).toEqual(HEAVY);
    const rel = await db.prepare("SELECT delta FROM coach_relation_log WHERE player_id = ?").bind(GROOM).all<{ delta: number }>();
    expect(rel.results).toEqual([{ delta: 4 }]);
    expect((await messagesOf(HUMAN)).some((m) => m.body.includes("3 000 Kč"))).toBe(true);
  }, 60_000);

  it("nedovolím pít: bez kocoviny a ženich je dotčený", async () => {
    await insertWedding("w-ban", HUMAN, GROOM);
    await setGameDay("2026-11-17");
    const conv = await groomConversation();

    expect(await handleWeddingReply(db, env(), conv, "Gratuluju, ale v sobotu hrajem o všechno, takže kluci na svatbě ani kapku, žádnej chlast, jen kofola, jasný?")).toBe(true);
    expect((await wedding("w-ban")).choice).toBe("ban");
    expect(await absences(HUMAN)).toEqual([]);
    const rel = await db.prepare("SELECT delta FROM coach_relation_log WHERE player_id = ?").bind(GROOM).all<{ delta: number }>();
    expect(rel.results.length).toBe(1);
    expect(rel.results[0].delta).toBeLessThan(0);

    await setGameDay(MATCH);
    await processWeddingsForDay(env(), await stateOf(HUMAN, MATCH));
    expect(await count("SELECT COUNT(*) AS n FROM condition_log WHERE team_id = ?", HUMAN)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM coach_relation_log WHERE player_id = ?", GROOM)).toBe(1);
  }, 60_000);

  it("model rozpozná zákaz i bez slov, která zná pravidlo", async () => {
    await insertWedding("w-model", HUMAN, GROOM);
    await setGameDay("2026-11-17");
    await kv.put("ai_provider", "workers-ai");
    const conv = await groomConversation();
    const ai = fakeAi({ attend: false, ban: true, gift: false, amount: null });

    const text = "Ať si kluci daj nanejvejš jedno, víc pít nebudou, v sobotu hrajem s Lhotou a to nechci prohrát";
    expect(await handleWeddingReply(db, env({ AI: ai.AI }), conv, text)).toBe(true);
    expect((await wedding("w-model")).choice).toBe("ban");
    expect(ai.prompts.join("\n")).toContain("<<<");
  }, 60_000);

  it("v mínusu se dar nezaplatí a rozhodnutí počká", async () => {
    await insertWedding("w-broke", HUMAN, GROOM);
    await setGameDay("2026-11-17");
    await db.prepare("UPDATE teams SET budget = 500 WHERE id = ?").bind(HUMAN).run();
    const conv = await groomConversation();

    expect(await handleWeddingReply(db, env(), conv, "pošlu ti dar 2000 Kč, gratuluju")).toBe(false);
    expect((await wedding("w-broke")).choice).toBeNull();
    expect(await count("SELECT COUNT(*) AS n FROM transactions WHERE team_id = ?", HUMAN)).toBe(0);
    expect((await messagesOf(HUMAN)).some((m) => m.body.includes("nemá peníze"))).toBe(true);
  }, 60_000);

  it("běžná zpráva ženichovi svatbu nerozhodne", async () => {
    await insertWedding("w-noise", HUMAN, GROOM);
    await setGameDay("2026-11-17");
    const conv = await groomConversation();
    expect(await handleWeddingReply(db, env(), conv, "Zítra trénink v šest, nezapomeň kopačky")).toBe(false);
    expect((await wedding("w-noise")).choice).toBeNull();
  }, 60_000);
});

describe("lhůta a den po svatbě", () => {
  it("bez odpovědi do dne před svatbou plná kocovina, opakovaný běh ji nezdvojí", async () => {
    await insertWedding("w-silent", HUMAN, GROOM);
    await setGameDay("2026-11-19");
    await processWeddingsForDay(env(), await stateOf(HUMAN, "2026-11-19"));
    await processWeddingsForDay(env(), await stateOf(HUMAN, "2026-11-19"));
    expect(await wedding("w-silent")).toMatchObject({ choice: "none", decided_by: "default" });
    const abs = await absences(HUMAN);
    expect(abs.map((a) => a.player_id)).toEqual(HEAVY);
    expect(abs.every((a) => a.announced_on === "2026-11-19" && a.od_dne === MATCH)).toBe(true);
    // Nikdo nic neslíbil, vztah se nemění.
    expect(await count("SELECT COUNT(*) AS n FROM coach_relation_log WHERE player_id = ?", GROOM)).toBe(0);

    await setGameDay(MATCH);
    await processWeddingsForDay(env(), await stateOf(HUMAN, MATCH));
    await processWeddingsForDay(env(), await stateOf(HUMAN, MATCH));
    expect(await count("SELECT COUNT(*) AS n FROM condition_log WHERE team_id = ?", HUMAN)).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM condition_log WHERE team_id = ? AND player_id = ?", HUMAN, MODERATE)).toBe(1);
    // Ženich za neodpovězenou pozvánku nepíše.
    expect((await messagesOf(HUMAN)).filter((m) => m.title === "Franta Ženich")).toEqual([]);
  }, 60_000);

  it("článek ve Zpravodaji a SMS od Redakce vyjdou jednou, i s vypnutou AI", async () => {
    await insertWedding("w-news", HUMAN, GROOM);
    await setGameDay("2026-11-17");
    const conv = await groomConversation();
    await handleWeddingReply(db, env(), conv, "Přijdu, a na kluky dohlídnu");
    await setGameDay(MATCH);
    await processWeddingsForDay(env(), await stateOf(HUMAN, MATCH));

    expect(await publishWeddingArticles(db, env(), MORNING)).toBe(1);
    expect(await publishWeddingArticles(db, env(), MORNING)).toBe(0);
    const news = await db.prepare("SELECT id, type, headline, body, team_id, league_id FROM news WHERE type = 'club_wedding'").all<{ id: string; type: string; headline: string; body: string; team_id: string; league_id: string }>();
    expect(news.results).toHaveLength(1);
    expect(news.results[0]).toMatchObject({ team_id: HUMAN, league_id: LEAGUE });
    expect(news.results[0].headline).toContain("Franta Ženich");
    const body = JSON.parse(news.results[0].body) as { article: string; playerId: string };
    expect(body.playerId).toBe(GROOM);
    expect(body.article).not.toContain("—");
    const desk = (await messagesOf(HUMAN)).filter((m) => m.title === "Redakce Zpravodaje");
    expect(desk).toHaveLength(1);
    expect(JSON.parse(desk[0].metadata ?? "{}")).toMatchObject({ type: "guide", href: `/zpravodaj?article=${news.results[0].id}` });
    expect((await wedding("w-news")).news_id).toBe(news.results[0].id);
  }, 60_000);

  it("v noci se článek nepíše", async () => {
    await insertWedding("w-night", HUMAN, GROOM);
    await db.prepare("UPDATE weddings SET choice = 'none', settled_at = '2026-11-21T04:00:00Z' WHERE id = 'w-night'").run();
    expect(await publishWeddingArticles(db, env(), new Date("2026-11-21T01:30:00.000Z"))).toBe(0);
  }, 60_000);
});

describe("AI klub", () => {
  it("rozhodne model, provede se stejnou cestou a AI klub nedostane žádnou zprávu", async () => {
    await insertWedding("w-ai", AI, "a-groom");
    await setGameDay("2026-11-17");
    const ai = fakeAi({ choice: "ban", gift: null, reason: "Big match on Saturday." });
    const profile = generateAiProfile(AI, null);

    const res = await decideAiWeddings(env(), AI, profile, MORNING, { mode: "on", ai: { AI: ai.AI } });
    expect(res).toEqual([{ weddingId: "w-ai", choice: "ban", decidedBy: "model", executed: true }]);
    expect(await wedding("w-ai")).toMatchObject({ choice: "ban", decided_by: "ai" });
    expect(ai.prompts[0]).toContain("Franta Ženich");
    expect(await count("SELECT COUNT(*) AS n FROM ai_coach_decisions WHERE team_id = ? AND kind = 'wedding'", AI)).toBe(1);
    // Druhý běh už nic nerozhoduje.
    expect(await decideAiWeddings(env(), AI, profile, MORNING, { mode: "on", ai: { AI: ai.AI } })).toEqual([]);
    expect(await messagesOf(AI)).toEqual([]);
  }, 60_000);

  it("bez modelu (ai = null) zaskočí pravidlo podle povahy a nic nespadne", async () => {
    await insertWedding("w-ai-rule", AI, "a-groom");
    await setGameDay("2026-11-17");
    const res = await decideAiWeddings(env(), AI, { ...generateAiProfile(AI, null), thrift: 20, ambition: 30 }, MORNING, { mode: "on", ai: null });
    expect(res).toEqual([{ weddingId: "w-ai-rule", choice: "gift", decidedBy: "fallback", executed: true }]);
    expect(await wedding("w-ai-rule")).toMatchObject({ choice: "gift", decided_by: "ai_fallback" });
    expect(await count("SELECT COUNT(*) AS n FROM transactions WHERE team_id = ? AND type = 'wedding_gift'", AI)).toBe(1);
    expect(await messagesOf(AI)).toEqual([]);
  }, 60_000);

  it("neplatná odpověď modelu: pravidlo; lhůta v denním ticku rozhodne i bez hodinového běhu", async () => {
    await insertWedding("w-ai-bad", AI, "a-groom");
    await setGameDay("2026-11-17");
    const ai = fakeAi({ choice: "elope", reason: "?" });
    const res = await decideAiWeddings(env(), AI, generateAiProfile(AI, null), MORNING, { mode: "on", ai: { AI: ai.AI } });
    expect(res[0]).toMatchObject({ decidedBy: "fallback", executed: true });

    await insertWedding("w-ai-late", AI, "a-heavy1");
    await setGameDay("2026-11-19");
    await processWeddingsForDay(env(), await stateOf(AI, "2026-11-19"));
    expect((await wedding("w-ai-late")).decided_by).toBe("ai_fallback");
    expect(await messagesOf(AI)).toEqual([]);
  }, 60_000);
});
