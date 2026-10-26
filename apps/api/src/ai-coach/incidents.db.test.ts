/**
 * Incidenty AI klubů na skutečné D1 (Miniflare, všechny migrace).
 *
 * AI klubu se incidenty dějí jako lidskému, jen bez zpráv. AI trenér o nich rozhodne modelem
 * (nebo náhradním pravidlem) a provede to stejnými službami jako člověk. Lidský klub dostává
 * zprávy jako dřív.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { wipeAiClubForNewcomer } from "../ai-clubs/overwrite";
import { promluvSi, rozhodni, zeptejSe } from "../incidents/akce";
import { nahlasKradeneZbozi } from "../incidents/bazar-db";
import { zpracujIncidentyDne } from "../incidents/denni-krok";
import { oznamIncident } from "../incidents/dopady";
import type { NavrhIncidentu } from "../incidents/typy";
import { zpracujZpravuTrenera } from "../incidents/zprava-trenera";
import type { Bindings } from "../index";
import { handleAiIncidents } from "./incidents";
import { generateAiProfile, type AiCoachProfile } from "./profile";

let mf: Miniflare;
let db: D1Database;
let kv: KVNamespace;
let villages: string[] = [];

const AI = "ai-club";
const HUMAN = "human-club";
const LEAGUE = "l-1";
const TODAY = "2026-11-02";
const GAME_DATE = `${TODAY}T16:00:00.000Z`;
/** Tři dny staré: na rozhodnutí je čas (prodleva je nejvýš dva dny). */
const CREATED = "2026-10-30T16:00:00.000Z";
const DEADLINE = "2026-11-06T16:00:00.000Z";
/** 12:30 v Praze. */
const NOON = new Date("2026-11-02T11:30:00.000Z");
const START_BUDGET = 80_000;
const POSITIONS = ["GK", "GK", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD", "FWD"];

function profile(over: Partial<AiCoachProfile> = {}): AiCoachProfile {
  return { ...generateAiProfile(AI, null), ...over };
}

function env(): Bindings {
  return { DB: db, CACHE_KV: kv } as unknown as Bindings;
}

/** Falešný Workers AI: vrací pevnou odpověď a pamatuje si, co dostal. */
function fakeAi(answer: unknown) {
  const prompts: string[] = [];
  return {
    prompts,
    binding: {
      AI: {
        run: async (_model: string, input: { messages: Array<{ content: string }> }) => {
          prompts.push(input.messages[1]?.content ?? "");
          return { choices: [{ message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
        },
      },
    } as unknown as Pick<Bindings, "AI">,
  };
}

async function setGameDay(day: string): Promise<void> {
  await db.prepare("UPDATE teams SET game_date = ?").bind(`${day}T16:00:00.000Z`).run();
}

async function count(sql: string, ...binds: unknown[]): Promise<number> {
  return (await db.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0;
}

async function messagesOf(teamId: string): Promise<string[]> {
  const rows = await db.prepare(
    "SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.team_id = ? ORDER BY m.sent_at, m.id",
  ).bind(teamId).all<{ body: string }>();
  return rows.results.map((r) => r.body);
}

async function incident(id: string) {
  return db.prepare("SELECT status, resolution, resolution_data, culprit_revealed, accusations, accused FROM club_incidents WHERE id = ?")
    .bind(id).first<{ status: string; resolution: string | null; resolution_data: string | null; culprit_revealed: number; accusations: number; accused: string }>();
}

async function decisions(teamId: string) {
  return (await db.prepare(
    "SELECT kind, mode, context_ref, used_fallback, error, actions, executed FROM ai_coach_decisions WHERE team_id = ? ORDER BY created_at, id",
  ).bind(teamId).all<{ kind: string; mode: string; context_ref: string; used_fallback: number; error: string | null; actions: string; executed: string | null }>()).results;
}

interface IncidentFixture {
  id: string;
  teamId?: string;
  kind?: string;
  category?: string;
  status?: string;
  severity?: number;
  culpritType?: string | null;
  culpritId?: string | null;
  revealed?: boolean;
  subjectId?: string | null;
  loss?: unknown[];
  policeResultOn?: string | null;
}

async function insertIncident(f: IncidentFixture): Promise<void> {
  await db.prepare(
    `INSERT INTO club_incidents (id, team_id, league_id, season_number, kind, category, status, severity, game_date, deadline,
       culprit_type, culprit_player_id, culprit_revealed, subject_player_id, loss, text, police_result_on)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Někdo se vloupal do skladu.', ?)`,
  ).bind(
    f.id, f.teamId ?? AI, LEAGUE, f.kind ?? "vloupani_sklad", f.category ?? "kradez", f.status ?? "otevreny", f.severity ?? 2,
    CREATED, DEADLINE, f.culpritType === undefined ? "hrac" : f.culpritType, f.culpritId ?? null, f.revealed ? 1 : 0,
    f.subjectId ?? null, JSON.stringify(f.loss ?? [{ typ: "penize", castka: 4000 }]), f.policeResultOn ?? null,
  ).run();
}

async function insertClue(incidentId: string, pointsTo: string): Promise<void> {
  await db.prepare(
    `INSERT INTO club_incident_clues (id, incident_id, team_id, source, points_to_player_id, suspects, holder_player_id, strength, police_bonus, text, found, found_on)
     VALUES (?, ?, ?, 'spravce', ?, NULL, NULL, 2, 0.1, 'Správce ho viděl u skladu.', 1, ?)`,
  ).bind(`${incidentId}-spravce-1`, incidentId, AI, pointsTo, CREATED).run();
}

interface ClueFixture {
  id: string;
  incidentId: string;
  teamId: string;
  source: string;
  pointsTo?: string | null;
  suspects?: string[] | null;
  holder?: string | null;
  strength?: number;
  found: boolean;
  text?: string;
}

async function insertClueRow(c: ClueFixture): Promise<void> {
  await db.prepare(
    `INSERT INTO club_incident_clues (id, incident_id, team_id, source, points_to_player_id, suspects, holder_player_id, strength, police_bonus, text, found, found_on)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.1, ?, ?, ?)`,
  ).bind(
    c.id, c.incidentId, c.teamId, c.source, c.pointsTo ?? null, c.suspects ? JSON.stringify(c.suspects) : null, c.holder ?? null,
    c.strength ?? 1, c.text ?? "Soused viděl u skladu dva kluky z kádru.", c.found ? 1 : 0, c.found ? CREATED : null,
  ).run();
}

async function insertKnowledge(incidentId: string, playerId: string, teamId: string, role: string, willingness: number): Promise<void> {
  await db.prepare(
    `INSERT INTO club_incident_knowledge (incident_id, player_id, team_id, role, fact, willingness, until, season_number)
     VALUES (?, ?, ?, ?, 'Ví, kdo byl ve skladu.', ?, ?, 1)`,
  ).bind(incidentId, playerId, teamId, role, willingness, DEADLINE).run();
}

/**
 * Krádež ve skladu, pachatel hráč 7: soused viděl hráče 7 a 8 (nalezená stopa, oba podezřelí),
 * rival hráče 7 (hráč 11) ví víc (skrytá stopa a ochota 100, řekne to vždy, když se ho trenér zeptá).
 */
async function setUpAskScenario(incidentId: string, teamId: string, prefix: "ai" | "hu"): Promise<void> {
  const p = (n: number) => `${prefix}-p${n}`;
  await insertIncident({ id: incidentId, teamId, culpritId: p(7) });
  await insertClueRow({ id: `${incidentId}-soused-1`, incidentId, teamId, source: "soused", suspects: [p(7), p(8)], found: true });
  await insertClueRow({
    id: `${incidentId}-rival-1`, incidentId, teamId, source: "rival", pointsTo: p(7), holder: p(11), strength: 2, found: false,
    text: "Rival ví, že ve skladu byl hráč sedm.",
  });
  await insertKnowledge(incidentId, p(11), teamId, "rival", 100);
  await insertKnowledge(incidentId, p(7), teamId, "pachatel", 0);
  await db.prepare("INSERT INTO relationships (id, player_a_id, player_b_id, type, strength) VALUES (?, ?, ?, 'rivals', 60)")
    .bind(`rel-${incidentId}`, p(7), p(11)).run();
}

const STOLEN_JERSEYS = [{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 80, urovniDolu: 1 }];

/** Inzerát s ukradenými dresy úrovně 2 (okradený klub je pozná) v bazaru ligy. */
async function insertStolenListing(id: string, incidentId: string): Promise<void> {
  await db.prepare(
    `INSERT INTO equipment_listings (id, team_id, league_id, category, level, condition_at_listing, price, status, expires_at, is_ai_listing, seller_name, incident_id)
     VALUES (?, NULL, ?, 'jerseys', 2, 80, 900, 'active', '2099-01-01T00:00:00.000Z', 0, 'Láďa, Volary', ?)`,
  ).bind(id, LEAGUE, incidentId).run();
}

async function listingStatus(id: string): Promise<string | null> {
  return (await db.prepare("SELECT status FROM equipment_listings WHERE id = ?").bind(id).first<{ status: string }>())?.status ?? null;
}

async function interrogation(incidentId: string, playerId: string): Promise<string | null> {
  return (await db.prepare(
    "SELECT interrogation FROM club_incident_knowledge WHERE incident_id = ? AND player_id = ? AND role IN ('svedek', 'kamarad', 'rival', 'pachatel')",
  ).bind(incidentId, playerId).first<{ interrogation: string | null }>())?.interrogation ?? null;
}

async function clueFound(id: string): Promise<number | null> {
  return (await db.prepare("SELECT found FROM club_incident_clues WHERE id = ?").bind(id).first<{ found: number }>())?.found ?? null;
}

async function claimTasks(teamId: string): Promise<string[]> {
  return (await db.prepare("SELECT task FROM ai_coach_claims WHERE team_id = ? ORDER BY task").bind(teamId).all<{ task: string }>())
    .results.map((r) => r.task);
}

/** AI klub nesmí dostat žádnou zprávu, notifikaci ani konverzaci s hráčem. */
async function expectSilentAiClub(): Promise<void> {
  expect(await messagesOf(AI)).toEqual([]);
  expect(await count("SELECT COUNT(*) AS n FROM conversations WHERE team_id = ?", AI)).toBe(0);
  expect(await count("SELECT COUNT(*) AS n FROM notifications WHERE team_id = ?", AI)).toBe(0);
}

/** Úklid mezi testy: všechny tabulky s vazbou na tým nebo hráče, několik průchodů kvůli cizím klíčům. */
async function wipe(): Promise<void> {
  const linked = (await db.prepare(
    `SELECT DISTINCT m.name FROM sqlite_master m WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%'
       AND (EXISTS (SELECT 1 FROM pragma_table_info(m.name) p WHERE p.name IN ('team_id', 'player_id', 'incident_id', 'conversation_id'))
         OR EXISTS (SELECT 1 FROM pragma_foreign_key_list(m.name) f WHERE f."table" IN ('teams', 'players', 'leagues', 'seasons', 'managers')))`,
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
}, 120_000);

afterAll(async () => {
  await mf.dispose();
});

beforeEach(async () => {
  await wipe();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('ai', 'ai@system.local', 'none'), ('u-human', 'human@example.test', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('s-1', 1, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES (?, 's-1', 'Prachatice', 'Okresní přebor', 'okresni_prebor')").bind(LEAGUE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date) VALUES (?, 'ai', ?, 'TJ Netolice', ?, ?, 'senior', ?)")
      .bind(AI, villages[0], START_BUDGET, LEAGUE, GAME_DATE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date) VALUES (?, 'u-human', ?, 'Jiskra Husinec', ?, ?, 'senior', ?)")
      .bind(HUMAN, villages[1], START_BUDGET, LEAGUE, GAME_DATE),
  ]);
  const insert = db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, weekly_wage, status)
     VALUES (?, ?, 'Jan', ?, 26, ?, ?, '{}', '{}', ?, ?, '{}', 1000, 'active')`,
  );
  const personality = JSON.stringify({ leadership: 30, discipline: 50, temper: 40, alcohol: 30, patriotism: 50 });
  const lifeContext = JSON.stringify({ morale: 60, condition: 100, occupation: "Zedník" });
  await db.batch([
    ...POSITIONS.map((pos, i) => insert.bind(`ai-p${i}`, AI, `Hráč${i}`, pos, 40 - (i % 5), personality, lifeContext)),
    ...POSITIONS.map((pos, i) => insert.bind(`hu-p${i}`, HUMAN, `Člověk${i}`, pos, 40, personality, lifeContext)),
  ]);
});

describe("AI trenér a incident v klubu", () => {
  it("o trestu rozhodne model, provede ho služba člověka a AI klub nedostane zprávu", async () => {
    await insertIncident({ id: "inc-fine", culpritId: "ai-p9", revealed: true });
    const ai = fakeAi({ choice: "fine", reason: "A fine teaches him without losing him for matches." });

    const res = await handleAiIncidents(env(), AI, profile(), NOON, { mode: "on", ai: ai.binding });

    expect(res.decisions).toEqual([{ incidentId: "inc-fine", stage: "punish", choice: "fine", decidedBy: "model", executed: true }]);
    const row = await incident("inc-fine");
    expect(row?.status).toBe("uzavreny");
    expect(row?.resolution).toBe("pokuta");
    // Pokuta: nejvýš škoda, dvě týdenní mzdy a 5 000 Kč.
    expect(JSON.parse(row?.resolution_data ?? "{}")).toEqual({ castka: 2000 });
    expect(await count("SELECT COUNT(*) AS n FROM transactions WHERE team_id = ? AND type = 'incident_fine' AND amount = 2000", AI)).toBe(1);
    expect((await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(AI).first<{ budget: number }>())?.budget).toBe(START_BUDGET + 2000);

    expect(ai.prompts).toHaveLength(1);
    expect(ai.prompts[0]).toContain("CULPRIT (known): Jan Hráč9");
    expect(ai.prompts[0]).toContain("- fine: Fine him 2,000 CZK");
    const log = await decisions(AI);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ kind: "incident", mode: "on", context_ref: "inc-fine:punish", used_fallback: 0, error: null });
    expect(JSON.parse(log[0].actions)).toMatchObject({ stage: "punish", choice: "fine", decidedBy: "model" });

    expect(await messagesOf(AI)).toEqual([]);
    expect(await count("SELECT COUNT(*) AS n FROM notifications WHERE team_id = ?", AI)).toBe(0);
  }, 60_000);

  it("neplatná odpověď modelu: rozhodne náhradní pravidlo podle povahy a deník to zapíše", async () => {
    await insertIncident({ id: "inc-bad", culpritId: "ai-p9", revealed: true });
    const ai = fakeAi({ choice: "beat him up", reason: "no" });

    const res = await handleAiIncidents(env(), AI, profile({ thrift: 85, patience: 30 }), NOON, { mode: "on", ai: ai.binding });

    // Šetrný trenér strhává ze mzdy: min(škoda 4 000, 4 týdenní mzdy).
    expect(res.decisions).toEqual([{ incidentId: "inc-bad", stage: "punish", choice: "deduct", decidedBy: "fallback", executed: true }]);
    const row = await incident("inc-bad");
    expect(row?.resolution).toBe("srazka");
    expect(JSON.parse(row?.resolution_data ?? "{}")).toEqual({ celkem: 4000, tydnuZbyva: 4 });
    const log = await decisions(AI);
    expect(log[0]).toMatchObject({ used_fallback: 1, error: "neplatná odpověď modelu" });
    expect(await messagesOf(AI)).toEqual([]);
  }, 60_000);

  it("vyšetřování ve dvou krocích: přímá stopa → obvinění, další den trest bez modelu", async () => {
    await insertIncident({ id: "inc-acc", culpritId: "ai-p7" });
    await insertClue("inc-acc", "ai-p7");
    const ai = fakeAi({ choice: "accuse_1", reason: "The groundsman saw him." });

    const first = await handleAiIncidents(env(), AI, profile(), NOON, { mode: "on", ai: ai.binding });
    expect(first.decisions).toEqual([{ incidentId: "inc-acc", stage: "investigate", choice: "accuse_1", decidedBy: "model", executed: true }]);
    expect(ai.prompts[0]).toContain("your groundsman points at Jan Hráč7");
    expect(ai.prompts[0]).toContain("- police:");
    const accused = await incident("inc-acc");
    // Stopa na pachatele: přizná se, nebo ho usvědčí.
    expect(accused?.culprit_revealed).toBe(1);
    expect(accused?.accusations).toBe(1);
    expect(JSON.parse(accused?.accused ?? "[]")[0]).toMatchObject({ playerId: "ai-p7" });

    // Týž den už nic (jednou za herní den), další den trest náhradním pravidlem (režim off).
    expect((await handleAiIncidents(env(), AI, profile(), NOON, { mode: "on", ai: ai.binding })).skipped).toBe("done_today");
    await setGameDay("2026-11-03");
    const second = await handleAiIncidents(env(), AI, profile({ thrift: 85, patience: 30 }), NOON, { mode: "off" });
    expect(second.decisions).toEqual([{ incidentId: "inc-acc", stage: "punish", choice: "deduct", decidedBy: "fallback", executed: true }]);
    expect((await incident("inc-acc"))?.status).toBe("uzavreny");
    expect(ai.prompts).toHaveLength(1);
    expect(await messagesOf(AI)).toEqual([]);
  }, 60_000);

  it("záloha na mzdu: model půjčí, peníze odejdou stejnou službou jako u člověka", async () => {
    await insertIncident({ id: "inc-debt", kind: "dluhy", category: "zivotni", status: "probiha", severity: 1, culpritType: "nikdo", subjectId: "ai-p3", loss: [] });
    const ai = fakeAi({ choice: "lend", reason: "He is a good lad." });

    const res = await handleAiIncidents(env(), AI, profile(), NOON, { mode: "on", ai: ai.binding });

    expect(res.decisions).toEqual([{ incidentId: "inc-debt", stage: "advance", choice: "lend", decidedBy: "model", executed: true }]);
    const data = JSON.parse((await incident("inc-debt"))?.resolution_data ?? "{}") as { zaloha: string; celkem: number; tydnuZbyva: number };
    expect(data.zaloha).toBe("pujceno");
    expect(data.tydnuZbyva).toBe(4);
    expect(await count("SELECT COUNT(*) AS n FROM transactions WHERE team_id = ? AND type = 'incident_advance' AND amount = ?", AI, -data.celkem)).toBe(1);
    expect(await messagesOf(AI)).toEqual([]);
  }, 60_000);

  it("režim shadow rozhodne a zapíše, nic neprovede a stejnou fázi se podruhé neptá; po zapnutí provede", async () => {
    await insertIncident({ id: "inc-shadow", culpritId: "ai-p9", revealed: true });
    const ai = fakeAi({ choice: "forgive", reason: "Everyone makes mistakes." });

    const res = await handleAiIncidents(env(), AI, profile(), NOON, { mode: "shadow", ai: ai.binding });
    expect(res.decisions).toEqual([{ incidentId: "inc-shadow", stage: "punish", choice: "forgive", decidedBy: "model", executed: false }]);
    expect((await incident("inc-shadow"))?.status).toBe("otevreny");

    await setGameDay("2026-11-03");
    expect((await handleAiIncidents(env(), AI, profile(), NOON, { mode: "shadow", ai: ai.binding })).decisions).toEqual([]);
    expect(await decisions(AI)).toHaveLength(1);
    expect((await decisions(AI))[0]).toMatchObject({ mode: "shadow", executed: null });

    const on = await handleAiIncidents(env(), AI, profile(), NOON, { mode: "on", ai: ai.binding });
    expect(on.decisions[0]).toMatchObject({ choice: "forgive", executed: true });
    expect((await incident("inc-shadow"))?.resolution).toBe("odpustit");
  }, 60_000);

  it("v noci, u lidského klubu a bez rozhodnutelného incidentu nic nedělá", async () => {
    await insertIncident({ id: "inc-night", culpritId: "ai-p9", revealed: true });
    const night = new Date("2026-11-02T01:30:00.000Z");
    expect((await handleAiIncidents(env(), AI, profile(), night)).skipped).toBe("night");
    expect((await handleAiIncidents(env(), HUMAN, profile(), NOON)).skipped).toBe("not_ai");
    await db.prepare("UPDATE club_incidents SET status = 'uzavreny' WHERE id = 'inc-night'").run();
    expect((await handleAiIncidents(env(), AI, profile(), NOON)).skipped).toBe("nothing_due");
    expect(await count("SELECT COUNT(*) AS n FROM ai_coach_claims WHERE team_id = ?", AI)).toBe(0);
  }, 60_000);
});

describe("zprávy o incidentech: lidský klub beze změny, AI klub nic", () => {
  const proposal: NavrhIncidentu = {
    kind: "vloupani_sklad", category: "kradez", status: "otevreny", severity: 2, culpritType: "cizi", culpritPlayerId: null,
    culpritRevealed: false, ztraty: [], text: "Někdo se vloupal do skladu.",
  };

  it("oznámení incidentu: SMS a notifikace jen lidskému klubu", async () => {
    await oznamIncident(env(), HUMAN, proposal, { id: "inc-h", nalezeneStopy: [], odhalen: false });
    await oznamIncident(env(), AI, proposal, { id: "inc-a", nalezeneStopy: [], odhalen: false });
    expect((await messagesOf(HUMAN)).some((m) => m.includes("Někdo se vloupal do skladu."))).toBe(true);
    expect(await count("SELECT COUNT(*) AS n FROM notifications WHERE team_id = ?", HUMAN)).toBe(1);
    expect(await messagesOf(AI)).toEqual([]);
    expect(await count("SELECT COUNT(*) AS n FROM notifications WHERE team_id = ?", AI)).toBe(0);
  }, 60_000);

  it("trest lidskému klubu: hráč napíše jako dřív", async () => {
    await insertIncident({ id: "inc-human", teamId: HUMAN, culpritId: "hu-p9", revealed: true });
    const r = await rozhodni(env(), HUMAN, "inc-human", "pokuta");
    expect(r.ok).toBe(true);
    expect((await messagesOf(HUMAN)).length).toBe(1);
  }, 60_000);

  it("denní krok AI klub nepřeskočí: výsledek policie přijde, ale bez zprávy; lidský klub SMS dostane", async () => {
    await insertIncident({ id: "inc-pol-ai", status: "policie", culpritType: "cizi", policeResultOn: GAME_DATE });
    await insertIncident({ id: "inc-pol-hu", teamId: HUMAN, status: "policie", culpritType: "cizi", policeResultOn: GAME_DATE });

    await zpracujIncidentyDne(env(), { id: AI, user_id: "ai", team_type: "senior", league_id: LEAGUE }, GAME_DATE);
    await zpracujIncidentyDne(env(), { id: HUMAN, user_id: "u-human", team_type: "senior", league_id: LEAGUE }, GAME_DATE);

    expect((await incident("inc-pol-ai"))?.status).not.toBe("policie");
    expect((await incident("inc-pol-hu"))?.status).not.toBe("policie");
    expect(await messagesOf(AI)).toEqual([]);
    expect(await count("SELECT COUNT(*) AS n FROM notifications WHERE team_id = ?", AI)).toBe(0);
    expect((await messagesOf(HUMAN)).some((m) => m.startsWith("🚓"))).toBe(true);
  }, 60_000);

  it("nová registrace přepíše AI klub i s jeho incidenty", async () => {
    await insertIncident({ id: "inc-wipe", culpritId: "ai-p7" });
    await insertClue("inc-wipe", "ai-p7");
    await wipeAiClubForNewcomer(db, AI, { previousName: "TJ Netolice", now: NOON });
    expect(await count("SELECT COUNT(*) AS n FROM club_incidents WHERE team_id = ?", AI)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM club_incident_clues WHERE team_id = ?", AI)).toBe(0);
  }, 60_000);
});

describe("AI trenér se ptá hráčů bez chatu (u člověka „Zeptat se\")", () => {
  it("model se zeptá rivala podezřelého: řekne, co ví, stopa se najde, další den trenér obviní pachatele", async () => {
    await setUpAskScenario("inc-ask", AI, "ai");
    const ai = fakeAi({ choice: "ask_3", reason: "His rival will talk." });

    const res = await handleAiIncidents(env(), AI, profile(), NOON, { mode: "on", ai: ai.binding });

    expect(res.decisions).toEqual([{ incidentId: "inc-ask", stage: "investigate", choice: "ask_3", decidedBy: "model", executed: true }]);
    // Nabídka: podezřelí ze stop, pak jejich rival podle vztahů v kabině. Kdo co ví, model nevidí.
    expect(ai.prompts[0]).toMatch(/- ask_1: Ask Jan Hráč7 \(MID[^)]*\) about it in private/);
    expect(ai.prompts[0]).toMatch(/- ask_2: Ask Jan Hráč8 \(MID[^)]*\) about it in private/);
    expect(ai.prompts[0]).toMatch(/- ask_3: Ask Jan Hráč11 \(MID[^)]*\) whether he knows anything/);
    expect(ai.prompts[0]).toContain("does not get on with suspect Jan Hráč7");
    expect(ai.prompts[0]).not.toContain("Rival ví");
    expect(ai.prompts[0]).not.toContain("a rival in the squad points at");
    // Stejné následky jako po zprávě člověka v chatu: uložený výslech, nalezená stopa, rivalita sílí.
    expect(await interrogation("inc-ask", "ai-p11")).toBe("prozradil");
    expect(await clueFound("inc-ask-rival-1")).toBe(1);
    expect((await db.prepare("SELECT strength FROM relationships WHERE id = 'rel-inc-ask'").first<{ strength: number }>())?.strength).toBe(75);
    expect(await claimTasks(AI)).toContain("incident-ask:inc-ask:ai-p11");
    const log = await decisions(AI);
    expect(JSON.parse(log[0].executed ?? "{}")).toMatchObject({ ok: true, answer: "prozradil", action: "ask_3" });
    await expectSilentAiClub();

    // Další den: stopa ukazuje přímo na hráče 7, náhradní pravidlo ho obviní a usvědčí.
    await setGameDay("2026-11-03");
    const next = await handleAiIncidents(env(), AI, profile(), NOON, { mode: "off" });
    expect(next.decisions).toEqual([{ incidentId: "inc-ask", stage: "investigate", choice: "accuse_1", decidedBy: "fallback", executed: true }]);
    expect((await incident("inc-ask"))?.culprit_revealed).toBe(1);
    // Otázka hráči je nová fáze vyšetřování, proto se o incidentu rozhodlo znovu.
    const accusation = await db.prepare(
      "SELECT context_ref, input_summary FROM ai_coach_decisions WHERE team_id = ? AND json_extract(actions, '$.choice') = 'accuse_1'",
    ).bind(AI).first<{ context_ref: string; input_summary: string }>();
    expect(accusation?.context_ref).toBe("inc-ask:investigate:otevreny:a0:p-:c2:q1:l0");
    const secondPrompt = accusation?.input_summary ?? "";
    expect(secondPrompt).toContain("ALREADY ASKED: Jan Hráč11");
    expect(secondPrompt).not.toContain("Ask Jan Hráč11");
    expect(ai.prompts).toHaveLength(1);
    await expectSilentAiClub();
  }, 60_000);

  it("neplatná odpověď: náhradní pravidlo se zeptá podezřelého dřív, než by obvinilo naslepo, a ten se přizná", async () => {
    await insertIncident({ id: "inc-conf", culpritId: "ai-p5" });
    await db.prepare("UPDATE club_incidents SET police_success = 0 WHERE id = 'inc-conf'").run();
    await insertClueRow({ id: "inc-conf-soused-1", incidentId: "inc-conf", teamId: AI, source: "soused", suspects: ["ai-p5", "ai-p6"], found: true });
    await insertKnowledge("inc-conf", "ai-p5", AI, "pachatel", 0);
    // Ukázněný klidný kluk, který trenérovi věří: se stopou na sebe se přizná vždy (sancePriznani nad 100).
    await db.prepare("UPDATE players SET personality = ?, coach_relationship = 100 WHERE id = 'ai-p5'")
      .bind(JSON.stringify({ leadership: 30, discipline: 100, temper: 0, alcohol: 30, patriotism: 50 })).run();
    const ai = fakeAi({ choice: "shoot him", reason: "no" });

    const res = await handleAiIncidents(env(), AI, profile({ risk: 90 }), NOON, { mode: "on", ai: ai.binding });

    expect(res.decisions).toEqual([{ incidentId: "inc-conf", stage: "investigate", choice: "ask_1", decidedBy: "fallback", executed: true }]);
    expect(await interrogation("inc-conf", "ai-p5")).toBe("priznal");
    expect((await incident("inc-conf"))?.culprit_revealed).toBe(1);
    expect(await clueFound("inc-conf-priznani-1")).toBe(1);
    expect((await decisions(AI))[0]).toMatchObject({ used_fallback: 1, error: "neplatná odpověď modelu" });
    await expectSilentAiClub();
  }, 60_000);

  it("režim shadow: rozhodne se zeptat, ale nic neprovede ani si nic nezapamatuje", async () => {
    await setUpAskScenario("inc-ask-s", AI, "ai");
    const ai = fakeAi({ choice: "ask_3", reason: "His rival will talk." });

    const res = await handleAiIncidents(env(), AI, profile(), NOON, { mode: "shadow", ai: ai.binding });

    expect(res.decisions).toEqual([{ incidentId: "inc-ask-s", stage: "investigate", choice: "ask_3", decidedBy: "model", executed: false }]);
    expect(await interrogation("inc-ask-s", "ai-p11")).toBeNull();
    expect(await clueFound("inc-ask-s-rival-1")).toBe(0);
    expect((await claimTasks(AI)).filter((t) => t.startsWith("incident-ask:"))).toEqual([]);
    expect((await decisions(AI))[0]).toMatchObject({ mode: "shadow", executed: null });
    await expectSilentAiClub();
  }, 60_000);

  it("člověk se dál ptá přes chat: konverzace s tématem a výslech až jeho zprávou", async () => {
    await setUpAskScenario("inc-h-ask", HUMAN, "hu");

    const open = await zeptejSe(env(), HUMAN, "inc-h-ask", "hu-p11");
    expect(open.ok).toBe(true);
    if (!open.ok) return;
    expect(await count("SELECT COUNT(*) AS n FROM conversations WHERE team_id = ? AND type = 'player' AND participant_id = 'hu-p11'", HUMAN)).toBe(1);
    // Samotné otevření konverzace nic nevyslýchá.
    expect(await interrogation("inc-h-ask", "hu-p11")).toBeNull();

    const reply = await zpracujZpravuTrenera(db, { teamId: HUMAN, convId: open.conversationId, playerId: "hu-p11", text: "Nevíš, kdo vykradl sklad?" });
    expect(reply).toEqual({ incidentId: "inc-h-ask", vyslech: "prozradil" });
    expect(await clueFound("inc-h-ask-rival-1")).toBe(1);
    expect((await handleAiIncidents(env(), HUMAN, profile(), NOON)).skipped).toBe("not_ai");
  }, 60_000);
});

describe("AI trenér si promluví s hráčem, který v hospodě ohlásil čin (u člověka „Promluvit si\")", () => {
  it("model si s ním promluví: rozhovor se zapíše k hrozbě jako po zprávě člověka, druhý den už není o čem rozhodovat", async () => {
    await insertIncident({ id: "inc-threat", status: "hrozi", severity: 1, culpritId: "ai-p9", loss: [] });
    const ai = fakeAi({ choice: "talk", reason: "Better safe than sorry." });

    const res = await handleAiIncidents(env(), AI, profile(), NOON, { mode: "on", ai: ai.binding });

    expect(res.decisions).toEqual([{ incidentId: "inc-threat", stage: "threat", choice: "talk", decidedBy: "model", executed: true }]);
    expect(ai.prompts[0]).toContain("SITUATION: in the pub, Jan Hráč9");
    expect(ai.prompts[0]).toContain("- talk: Have a word with him");
    expect(JSON.parse((await incident("inc-threat"))?.resolution_data ?? "{}")).toEqual({ promluvil: TODAY });
    await expectSilentAiClub();

    await setGameDay("2026-11-03");
    expect((await handleAiIncidents(env(), AI, profile(), NOON, { mode: "on", ai: ai.binding })).decisions).toEqual([]);
    expect(ai.prompts).toHaveLength(1);
  }, 60_000);

  it("neplatná odpověď: náhradní pravidlo si s ním promluví", async () => {
    await insertIncident({ id: "inc-threat-f", status: "hrozi", severity: 1, culpritId: "ai-p9", loss: [] });
    const ai = fakeAi({ choice: "buy him a beer" });

    const res = await handleAiIncidents(env(), AI, profile(), NOON, { mode: "on", ai: ai.binding });

    expect(res.decisions).toEqual([{ incidentId: "inc-threat-f", stage: "threat", choice: "talk", decidedBy: "fallback", executed: true }]);
    expect(JSON.parse((await incident("inc-threat-f"))?.resolution_data ?? "{}")).toEqual({ promluvil: TODAY });
    expect((await decisions(AI))[0]).toMatchObject({ used_fallback: 1, error: "neplatná odpověď modelu" });
    await expectSilentAiClub();
  }, 60_000);

  it("režim shadow: rozhodne si promluvit, ale nic nezapíše", async () => {
    await insertIncident({ id: "inc-threat-s", status: "hrozi", severity: 1, culpritId: "ai-p9", loss: [] });
    const ai = fakeAi({ choice: "talk", reason: "Better safe than sorry." });

    const res = await handleAiIncidents(env(), AI, profile(), NOON, { mode: "shadow", ai: ai.binding });

    expect(res.decisions).toEqual([{ incidentId: "inc-threat-s", stage: "threat", choice: "talk", decidedBy: "model", executed: false }]);
    expect((await incident("inc-threat-s"))?.resolution_data).toBeNull();
    await expectSilentAiClub();
  }, 60_000);

  it("člověk si dál promluví přes chat: rozhovor se zapíše až jeho zprávou", async () => {
    await insertIncident({ id: "inc-h-threat", teamId: HUMAN, status: "hrozi", severity: 1, culpritId: "hu-p9", loss: [] });

    const open = await promluvSi(env(), HUMAN, "inc-h-threat");
    expect(open.ok).toBe(true);
    if (!open.ok) return;
    expect((await incident("inc-h-threat"))?.resolution_data).toBeNull();

    await zpracujZpravuTrenera(db, { teamId: HUMAN, convId: open.conversationId, playerId: "hu-p9", text: "Nedělej blbosti." });
    expect(JSON.parse((await incident("inc-h-threat"))?.resolution_data ?? "{}")).toEqual({ promluvil: TODAY });
  }, 60_000);
});

describe("AI trenér nahlásí poznaný inzerát s ukradenými věcmi policii (u člověka v bazaru)", () => {
  it("model nahlásí inzerát: policie převezme případ, inzerát zmizí z bazaru, AI klub nedostane zprávu", async () => {
    await insertIncident({ id: "inc-bazar", culpritType: "cizi", loss: STOLEN_JERSEYS });
    await insertClueRow({ id: "inc-bazar-bazar-1", incidentId: "inc-bazar", teamId: AI, source: "bazar", found: true, text: "V bazaru se objevily vaše dresy." });
    await insertStolenListing("listing-ai", "inc-bazar");
    const ai = fakeAi({ choice: "report_listing", reason: "Get the jerseys back." });

    const res = await handleAiIncidents(env(), AI, profile(), NOON, { mode: "on", ai: ai.binding });

    expect(res.decisions).toEqual([{ incidentId: "inc-bazar", stage: "investigate", choice: "report_listing", decidedBy: "model", executed: true }]);
    expect(ai.prompts[0]).toContain("- report_listing: Report the second-hand market listing with your club jerseys to the police (free): the police take over the case");
    expect(ai.prompts[0]).toContain("- police: Call the police");
    const row = await db.prepare("SELECT status, police_result_on FROM club_incidents WHERE id = 'inc-bazar'").first<{ status: string; police_result_on: string | null }>();
    expect(row?.status).toBe("policie");
    expect(row?.police_result_on).not.toBeNull();
    expect(await listingStatus("listing-ai")).toBe("withdrawn");
    await expectSilentAiClub();
  }, 60_000);

  it("neplatná odpověď, když už šetří policie: náhradní pravidlo inzerát zajistí, pak už není o čem rozhodovat", async () => {
    await insertIncident({ id: "inc-bazar-p", status: "policie", culpritType: "cizi", loss: STOLEN_JERSEYS, policeResultOn: "2026-11-05T16:00:00.000Z" });
    await insertStolenListing("listing-p", "inc-bazar-p");
    const ai = fakeAi({ choice: "call my cousin" });

    const res = await handleAiIncidents(env(), AI, profile(), NOON, { mode: "on", ai: ai.binding });

    expect(res.decisions).toEqual([{ incidentId: "inc-bazar-p", stage: "investigate", choice: "report_listing", decidedBy: "fallback", executed: true }]);
    expect(ai.prompts[0]).toContain("The police are investigating the case and report back in 3 days.");
    expect(ai.prompts[0]).toContain("become part of the police investigation");
    expect(ai.prompts[0]).not.toContain("- police:");
    expect(await listingStatus("listing-p")).toBe("withdrawn");
    expect((await incident("inc-bazar-p"))?.status).toBe("policie");
    await expectSilentAiClub();

    // Inzerát je pryč a ptát se není koho: zbývá jen čekat, model se znovu neptá.
    await setGameDay("2026-11-03");
    expect((await handleAiIncidents(env(), AI, profile(), NOON, { mode: "on", ai: ai.binding })).decisions).toEqual([]);
    expect(ai.prompts).toHaveLength(1);
  }, 60_000);

  it("režim shadow: rozhodne se nahlásit, ale inzerát zůstane a policie nepřijede", async () => {
    await insertIncident({ id: "inc-bazar-s", culpritType: "cizi", loss: STOLEN_JERSEYS });
    await insertStolenListing("listing-s", "inc-bazar-s");
    const ai = fakeAi({ choice: "report_listing", reason: "Get the jerseys back." });

    const res = await handleAiIncidents(env(), AI, profile(), NOON, { mode: "shadow", ai: ai.binding });

    expect(res.decisions).toEqual([{ incidentId: "inc-bazar-s", stage: "investigate", choice: "report_listing", decidedBy: "model", executed: false }]);
    expect(await listingStatus("listing-s")).toBe("active");
    expect((await incident("inc-bazar-s"))?.status).toBe("otevreny");
    await expectSilentAiClub();
  }, 60_000);

  it("člověk nahlásí inzerát v bazaru jako dřív a dostane SMS od policie", async () => {
    await insertIncident({ id: "inc-h-bazar", teamId: HUMAN, culpritType: "cizi", loss: STOLEN_JERSEYS });
    await insertStolenListing("listing-h", "inc-h-bazar");

    const r = await nahlasKradeneZbozi(env(), HUMAN, "listing-h");

    expect(r.ok).toBe(true);
    expect((await incident("inc-h-bazar"))?.status).toBe("policie");
    expect(await listingStatus("listing-h")).toBe("withdrawn");
    expect((await messagesOf(HUMAN)).some((m) => m.startsWith("🚓"))).toBe(true);
  }, 60_000);
});
