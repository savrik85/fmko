/**
 * Pozvání majitelů firem do VIP lóže AI klubu na skutečné D1 (Miniflare, všechny migrace).
 *
 * Model vybere z majitelů, které kód nabídl (jen s použitelnou lóží, nejvýš kolik lóže pojme,
 * dárky nad rezervou), a pozvání provede stejná služba jako tlačítko člověka. Neplatná odpověď:
 * pravidlo podle povahy. Režim shadow jen rozhodne a zapíše. AI klubu nechodí žádné zprávy,
 * lidský klub vidí obsazeného majitele stejně, jako by ho pozval člověk.
 */
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Bindings } from "../index";
import { invitationAcceptedDelta, invitationGiftCost, postMatchFavorDelta, vipBoxFavorBonus } from "../sponsors/favor-math";
import { settleSponsorInvitations } from "../sponsors/hooks";
import { inviteSponsorOwner } from "../sponsors/invitations";
import { COACH_MODE_KEY } from "./mode";
import { generateAiProfile, type AiCoachProfile } from "./profile";
import { maybeInviteSponsorOwners } from "./sponsor-invites";
import { runWeeklyReview } from "./weekly";

let mf: Miniflare;
let db: D1Database;
let kv: KVNamespace;

const TEAM = "ai-box";
/** Štědrý a ambiciózní trenér: bez modelu zaplní lóži, nejdřív končící sponzor, pak největší peníze. */
const PROFILE: AiCoachProfile = { ...generateAiProfile(TEAM, null), thrift: 20, ambition: 80 };
const RESERVE = 10_000;

const BREWERY = 92001;
const BAKERY = 92002;
const GARAGE = 92003;
const ESTATE = 92004;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const MATCH_DAY = day(3);

interface RecordedCall { schemaName: string | null; user: string; input: Record<string, unknown> }

/** Falešný Workers AI: pozvání odpoví `answer` (dostane popis pro model), ostatním prázdným objektem. */
function fakeAi(answer: (prompt: string) => unknown): { calls: RecordedCall[]; env: Pick<Bindings, "AI"> } {
  const calls: RecordedCall[] = [];
  const ai = {
    run: async (_model: string, input: unknown) => {
      const req = input as { messages: Array<{ role: string; content: string }>; response_format?: { json_schema?: { name?: string } } };
      const schemaName = req.response_format?.json_schema?.name ?? null;
      const user = req.messages.find((m) => m.role === "user")?.content ?? "";
      calls.push({ schemaName, user, input: input as Record<string, unknown> });
      const content = schemaName === "sponsor_invite" ? JSON.stringify(answer(user)) : "{}";
      return { choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
    },
  };
  return { calls, env: { AI: ai } as unknown as Pick<Bindings, "AI"> };
}

/** Klíč majitele (O1…) z popisu pro model podle názvu firmy. */
function keyOf(prompt: string, firm: string): string {
  const key = prompt.split("\n").find((l) => l.includes(`: ${firm},`))?.match(/^- "(O\d+)"/)?.[1];
  if (!key) throw new Error(`firma ${firm} v nabídce chybí`);
  return key;
}

interface DecisionRow { mode: string; used_fallback: number; error: string | null; actions: string | null; executed: string | null; input_summary: string | null }

async function inviteDecisions(): Promise<DecisionRow[]> {
  return (await db.prepare(
    "SELECT mode, used_fallback, error, actions, executed, input_summary FROM ai_coach_decisions WHERE team_id = ? AND kind = 'sponsor_invite' ORDER BY created_at, rowid",
  ).bind(TEAM).all<DecisionRow>()).results;
}

async function invitations(): Promise<Array<{ sponsor_id: number; status: string; gift_cost: number }>> {
  return (await db.prepare("SELECT sponsor_id, status, gift_cost FROM sponsor_invitations WHERE team_id = ? ORDER BY sponsor_id")
    .bind(TEAM).all<{ sponsor_id: number; status: string; gift_cost: number }>()).results;
}

async function budget(): Promise<number> {
  return (await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(TEAM).first<{ budget: number }>())?.budget ?? NaN;
}

async function favorOf(sponsorId: number): Promise<number | null> {
  return (await db.prepare("SELECT favor FROM sponsor_team_favor WHERE sponsor_id = ? AND team_id = ?").bind(sponsorId, TEAM)
    .first<{ favor: number }>())?.favor ?? null;
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
  const village = (id: string) =>
    db.prepare("INSERT INTO villages (id, name, district, region, population, size, lat, lng) VALUES (?, ?, 'Lóžkov', 'JC', 900, 'village', 49.0, 14.0)")
      .bind(id, `Obec ${id}`);
  const team = (id: string, userId: string, villageId: string, name: string) =>
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, league_id, game_date) VALUES (?, ?, ?, ?, 60000, 50, 'lg-box', ?)")
      .bind(id, userId, villageId, name, `${day(0)}T05:00:00.000Z`);
  const firm = (id: number, name: string, type: string, monthlyMax: number) =>
    db.prepare(
      `INSERT INTO district_sponsors (id, district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
       VALUES (?, 'Lóžkov', ?, ?, ?, ?, 100, 500)`,
    ).bind(id, name, type, Math.round(monthlyMax / 2), monthlyMax);
  const owner = (sponsorId: number, first: string, last: string, personality: string) =>
    db.prepare("INSERT INTO sponsor_owners (sponsor_id, first_name, last_name, age, face_config, personality) VALUES (?, ?, ?, 50, '{}', ?)")
      .bind(sponsorId, first, last, personality);
  const fixture = (id: string, home: string) => [
    db.prepare("INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES (?, 'lg-box', 3, 5, 'thursday', ?, 'scheduled')")
      .bind(`cal-${id}`, `${MATCH_DAY}T16:00:00.000Z`),
    db.prepare("INSERT INTO matches (id, league_id, calendar_id, home_team_id, away_team_id, status) VALUES (?, 'lg-box', ?, ?, 'away', 'scheduled')")
      .bind(id, `cal-${id}`, home),
  ];
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u-rival', 'r@x', 'x'), ('u-away', 'a@x', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('season-3', 3, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES ('lg-box', 'season-3', 'Lóžkov', 'Okresní přebor', 'okresni_prebor')"),
    village("v-ai"), village("v-rival"), village("v-away"),
    team(TEAM, "ai", "v-ai", "Sokol Lóžkov"), team("rival", "u-rival", "v-rival", "Jiskra Soused"), team("away", "u-away", "v-away", "Hosté"),
    db.prepare("INSERT INTO managers (id, user_id, team_id, name, backstory, avatar, ai_profile) VALUES ('m-ai', 'ai', ?, 'Jan Trenér', '', '{}', ?)")
      .bind(TEAM, JSON.stringify(PROFILE)),
    firm(BREWERY, "Pivovar Lóžkov", "brewery", 20_000), firm(BAKERY, "Pekárna Kubát", "bakery", 4_000),
    firm(GARAGE, "Autoservis Novák", "car_service", 9_000), firm(ESTATE, "Velkostatek", "company", 40_000),
    owner(BREWERY, "Josef", "Sládek", "businessman"), owner(BAKERY, "Karel", "Kubát", "patriot"),
    owner(GARAGE, "Petr", "Novák", "fan"), owner(ESTATE, "Jan", "Statkář", "cautious"),
    // Velkostatek je hlavním sponzorem lidského klubu.
    db.prepare(
      `INSERT INTO sponsor_contracts (id, team_id, sponsor_name, sponsor_type, monthly_amount, seasons_total, seasons_remaining, category, sponsor_id, negotiation_id)
       VALUES ('c-rival', 'rival', 'Velkostatek', 'company', 30000, 2, 2, 'main', ?, 'n-rival')`,
    ).bind(ESTATE),
    ...fixture("m-box", TEAM), ...fixture("m-rival", "rival"),
  ]);
}, 180_000);

afterAll(async () => {
  await mf.dispose();
});

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM sponsor_invitations"),
    db.prepare("DELETE FROM sponsor_owner_sms"),
    db.prepare("DELETE FROM sponsor_favor_log"),
    db.prepare("DELETE FROM sponsor_team_favor"),
    db.prepare("INSERT INTO sponsor_team_favor (sponsor_id, team_id, favor) VALUES (?, ?, 85)").bind(BAKERY, TEAM),
    db.prepare("DELETE FROM transactions"),
    db.prepare("DELETE FROM ai_coach_decisions"),
    db.prepare("DELETE FROM sponsor_promises"),
    db.prepare("DELETE FROM sponsor_negotiations"),
    db.prepare("DELETE FROM sponsor_contracts WHERE id != 'c-rival'"),
    // Hlavní sponzor AI klubu je Autoservis, smlouva letos končí.
    db.prepare(
      `INSERT INTO sponsor_contracts (id, team_id, sponsor_name, sponsor_type, monthly_amount, seasons_total, seasons_remaining, category, sponsor_id, negotiation_id)
       VALUES ('c-ai', ?, 'Autoservis Novák', 'car_service', 9000, 2, 1, 'main', ?, 'n-ai')`,
    ).bind(TEAM, GARAGE),
    db.prepare("DELETE FROM stadiums WHERE team_id = ?").bind(TEAM),
    // VIP lóže úrovně 2 na stojících tribunách: dva hosté na zápas.
    db.prepare("INSERT INTO stadiums (id, team_id, stands, vip_box) VALUES ('st-ai', ?, 1, 2)").bind(TEAM),
    db.prepare("UPDATE teams SET budget = 60000, stadium_name = NULL WHERE id = ?").bind(TEAM),
  ]);
  await kv.delete(COACH_MODE_KEY);
});

describe("pozvání majitelů do VIP lóže: model vybírá, kód hlídá", () => {
  it("model vybere majitele, pozvání provede stejná služba jako u člověka; AI klubu nepřijde žádná zpráva", async () => {
    const ai = fakeAi((prompt) => ({ invite: [keyOf(prompt, "Pekárna Kubát")], reason: "the baker loves us" }));
    const res = await maybeInviteSponsorOwners(db, TEAM, PROFILE, { ai: ai.env, reserve: RESERVE, contextRef: "week:test", random: () => 0 });

    const gift = invitationGiftCost(85);
    expect(res).toMatchObject({ spent: gift, invited: [{ sponsorId: BAKERY, ok: true, detail: "accepted", giftCost: gift }] });
    expect(await invitations()).toEqual([{ sponsor_id: BAKERY, status: "accepted", gift_cost: gift }]);
    expect(await budget()).toBe(60000 - gift);
    const tx = await db.prepare("SELECT type, amount, description FROM transactions WHERE team_id = ?").bind(TEAM).all();
    expect(tx.results).toEqual([{ type: "event", amount: -gift, description: "Pozvání Karel Kubát na zápas" }]);
    expect(await favorOf(BAKERY)).toBe(85 + invitationAcceptedDelta("patriot"));

    // Model dostal zápas, lóži a majitele, které jde pozvat (klíče jako enum).
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0].user).toContain(`NEXT HOME MATCH: `);
    expect(ai.calls[0].user).toContain("YOUR VIP BOX (level 2) has room for 2 more guests at this match.");
    expect(ai.calls[0].user).toContain("your main sponsor, the contract ends this season");
    expect(ai.calls[0].user).toContain("Velkostatek, company; owner: a cautious owner");
    const format = ai.calls[0].input.response_format as { json_schema: { schema: { properties: { invite: { items: { enum: string[] } } } } } };
    expect(format.json_schema.schema.properties.invite.items.enum).toEqual(["O1", "O2", "O3", "O4"]);

    const [log] = await inviteDecisions();
    expect(log).toMatchObject({ mode: "on", used_fallback: 0, error: null });
    expect(json<{ decidedBy: string; reason: string; invite: Array<{ sponsorId: number }> }>(log.actions))
      .toMatchObject({ decidedBy: "model", reason: "the baker loves us", invite: [{ sponsorId: BAKERY }] });
    expect(json<unknown[]>(log.executed)).toEqual([{ sponsorId: BAKERY, name: "Pekárna Kubát", ok: true, detail: "accepted", giftCost: gift }]);

    // Po zápase stejný háček jako u člověka: náklonnost za výsledek a lóži, SMS majitele AI klub nedostane.
    await settleSponsorInvitations(db, "m-box", TEAM, 2, 0, 2);
    expect(await invitations()).toEqual([{ sponsor_id: BAKERY, status: "attended", gift_cost: gift }]);
    expect(await favorOf(BAKERY)).toBe(85 + invitationAcceptedDelta("patriot") + postMatchFavorDelta("patriot", 2, 0) + vipBoxFavorBonus(2));
    const sms = await db.prepare("SELECT COUNT(*) AS n FROM sponsor_owner_sms WHERE team_id = ?").bind(TEAM).first<{ n: number }>();
    expect(sms?.n).toBe(0);

    // Lidský klub vidí obsazeného majitele stejně, jako by ho pozval člověk.
    expect(await inviteSponsorOwner(db, "rival", BAKERY, "m-rival", () => 0))
      .toEqual({ ok: false, error: "Majitel už ten den přijal pozvání jiného klubu", status: 409 });
  }, 60_000);

  it("neplatná odpověď: rozhodne pravidlo podle povahy (zaplní lóži: končící sponzor, pak největší peníze)", async () => {
    const ai = fakeAi(() => ({ invite: ["O9"], reason: "x" }));
    const res = await maybeInviteSponsorOwners(db, TEAM, PROFILE, { ai: ai.env, reserve: RESERVE, random: () => 0.99 });

    // Oba odmítli (hod 0,99), dárky jsou zaplacené.
    expect(res.invited.map((i) => [i.sponsorId, i.detail])).toEqual([[GARAGE, "declined"], [BREWERY, "declined"]]);
    expect(await invitations()).toEqual([
      { sponsor_id: BREWERY, status: "declined", gift_cost: invitationGiftCost(40) },
      { sponsor_id: GARAGE, status: "declined", gift_cost: invitationGiftCost(40) },
    ]);
    const [log] = await inviteDecisions();
    expect(log.used_fallback).toBe(1);
    expect(log.error).toContain("majitel O9 není v nabídce");
    expect(json<{ decidedBy: string; invite: Array<{ sponsorId: number }> }>(log.actions))
      .toMatchObject({ decidedBy: "fallback", invite: [{ sponsorId: GARAGE }, { sponsorId: BREWERY }] });
  }, 60_000);

  it("víc hostů, než lóže pojme: neplatné, rozhodne pravidlo", async () => {
    const ai = fakeAi(() => ({ invite: ["O1", "O2", "O3"], reason: "everyone" }));
    await maybeInviteSponsorOwners(db, TEAM, PROFILE, { ai: ai.env, reserve: RESERVE, random: () => 0 });
    const [log] = await inviteDecisions();
    expect(log.used_fallback).toBe(1);
    expect(log.error).toBe("pozvaných 3, lóže pojme 2");
    expect((await invitations()).length).toBe(2);
  }, 60_000);

  it("režim shadow: rozhodne a zapíše, nikoho nepozve a nic nezaplatí", async () => {
    const ai = fakeAi((prompt) => ({ invite: [keyOf(prompt, "Pekárna Kubát")], reason: "the baker loves us" }));
    const res = await maybeInviteSponsorOwners(db, TEAM, PROFILE, { mode: "shadow", ai: ai.env, reserve: RESERVE, random: () => 0 });

    expect(res).toEqual({ invited: [], spent: 0, detail: "nanečisto: Pekárna Kubát" });
    expect(await invitations()).toEqual([]);
    expect(await budget()).toBe(60000);
    const [log] = await inviteDecisions();
    expect(log).toMatchObject({ mode: "shadow", executed: null, used_fallback: 0 });
    expect(json<{ invite: Array<{ sponsorId: number }> }>(log.actions).invite).toEqual([expect.objectContaining({ sponsorId: BAKERY })]);
  }, 60_000);

  it("režim off: model se neptá, pozve pravidlo podle povahy", async () => {
    const ai = fakeAi(() => ({ invite: [], reason: "x" }));
    const res = await maybeInviteSponsorOwners(db, TEAM, PROFILE, { mode: "off", ai: ai.env, reserve: RESERVE, random: () => 0 });
    expect(ai.calls).toHaveLength(0);
    expect(res.invited.map((i) => i.sponsorId)).toEqual([GARAGE, BREWERY]);
    const [log] = await inviteDecisions();
    expect(log).toMatchObject({ mode: "off", used_fallback: 1, error: null });
  }, 60_000);

  it("jen když to lóže dovolí: bez lóže nebo bez tribun se nezve, model se neptá a deník mlčí", async () => {
    const ai = fakeAi(() => ({ invite: ["O1"], reason: "x" }));
    await db.prepare("UPDATE stadiums SET stands = 0 WHERE team_id = ?").bind(TEAM).run();
    expect(await maybeInviteSponsorOwners(db, TEAM, PROFILE, { ai: ai.env, reserve: RESERVE })).toEqual({ invited: [], spent: 0, detail: "bez VIP lóže" });
    await db.prepare("UPDATE stadiums SET stands = 1, vip_box = 0 WHERE team_id = ?").bind(TEAM).run();
    expect(await maybeInviteSponsorOwners(db, TEAM, PROFILE, { ai: ai.env, reserve: RESERVE })).toEqual({ invited: [], spent: 0, detail: "bez VIP lóže" });
    expect(ai.calls).toHaveLength(0);
    expect(await inviteDecisions()).toEqual([]);
    expect(await invitations()).toEqual([]);
  }, 60_000);

  it("plná lóže: přijatá pozvání zabírají místa, model se neptá", async () => {
    await db.prepare(
      `INSERT INTO sponsor_invitations (id, sponsor_id, team_id, match_id, match_day, status, gift_cost)
       VALUES ('si-1', ?, ?, 'm-box', ?, 'accepted', 600), ('si-2', ?, ?, 'm-box', ?, 'accepted', 600)`,
    ).bind(BAKERY, TEAM, MATCH_DAY, BREWERY, TEAM, MATCH_DAY).run();
    const ai = fakeAi(() => ({ invite: ["O1"], reason: "x" }));
    expect(await maybeInviteSponsorOwners(db, TEAM, PROFILE, { ai: ai.env, reserve: RESERVE }))
      .toEqual({ invited: [], spent: 0, detail: "lóže je na zápas plná" });
    expect(ai.calls).toHaveLength(0);
  }, 60_000);

  it("majitel, který ten den jde k jinému klubu, v nabídce není; pozvání lidského klubu zůstane, jak bylo", async () => {
    await db.prepare(
      "INSERT INTO sponsor_invitations (id, sponsor_id, team_id, match_id, match_day, status, gift_cost) VALUES ('si-rival', ?, 'rival', 'm-rival', ?, 'accepted', 600)",
    ).bind(BREWERY, MATCH_DAY).run();
    const ai = fakeAi((prompt) => ({ invite: [keyOf(prompt, "Pekárna Kubát")], reason: "x" }));
    await maybeInviteSponsorOwners(db, TEAM, PROFILE, { ai: ai.env, reserve: RESERVE, random: () => 0 });

    expect(ai.calls[0].user).not.toContain("Pivovar Lóžkov");
    const rival = await db.prepare("SELECT status FROM sponsor_invitations WHERE id = 'si-rival'").first<{ status: string }>();
    expect(rival?.status).toBe("accepted");
  }, 60_000);

  it("dárek pod rezervu nesáhne: drahé pozvání se nenabídne", async () => {
    await db.prepare("UPDATE teams SET budget = ? WHERE id = ?").bind(RESERVE + 400, TEAM).run();
    const ai = fakeAi((prompt) => ({ invite: [keyOf(prompt, "Pekárna Kubát")], reason: "x" }));
    await maybeInviteSponsorOwners(db, TEAM, PROFILE, { ai: ai.env, reserve: RESERVE, random: () => 0 });
    // Nad rezervou zbývá 400 Kč: projde jen dárek Pekárně (náklonnost 85 = 300 Kč), ostatní stojí 600 Kč.
    expect(ai.calls[0].user).not.toContain("Pivovar Lóžkov");
    expect(ai.calls[0].user).toContain("gifts may cost at most 400 CZK");
    expect(await budget()).toBe(RESERVE + 400 - invitationGiftCost(85));
  }, 60_000);
});

describe("pozvání v pondělní správě", () => {
  it("týdenní správa pozve majitele do lóže a zapíše to do provedených akcí", async () => {
    const ai = fakeAi((prompt) => ({ invite: [keyOf(prompt, "Pekárna Kubát")], reason: "build favour" }));
    const env = { DB: db, CACHE_KV: kv, AI: ai.env.AI } as unknown as Bindings;
    const res = await runWeeklyReview(env, TEAM, new Date(`${day(0)}T07:00:00.000Z`));

    expect(res.executed.find((e) => e.action === "sponsor_invite")).toMatchObject({ ok: true });
    expect(ai.calls.map((c) => c.schemaName)).toContain("sponsor_invite");
    expect((await invitations()).map((i) => i.sponsor_id)).toEqual([BAKERY]);
    const [log] = await inviteDecisions();
    expect(log).toMatchObject({ mode: "on", used_fallback: 0 });
  }, 120_000);

  it("týdenní správa v režimu shadow: rozhodne, nikoho nepozve", async () => {
    await kv.put(COACH_MODE_KEY, JSON.stringify({ weekly: "shadow" }));
    const ai = fakeAi((prompt) => ({ invite: [keyOf(prompt, "Pekárna Kubát")], reason: "build favour" }));
    const env = { DB: db, CACHE_KV: kv, AI: ai.env.AI } as unknown as Bindings;
    await runWeeklyReview(env, TEAM, new Date(`${day(0)}T07:00:00.000Z`));

    expect(await invitations()).toEqual([]);
    const [log] = await inviteDecisions();
    expect(log).toMatchObject({ mode: "shadow", executed: null });
  }, 120_000);
});
