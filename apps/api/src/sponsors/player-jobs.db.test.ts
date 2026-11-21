/**
 * Sežeň mu práci (F8) na skutečné D1 (Miniflare, všechny migrace): trenér píše majiteli,
 * hráč se ptá sám, dohoda s nespokojeným. Opakovaný běh nesmí dát dvojí efekt ani dvojí SMS,
 * bez modelu (ai_provider=off) rozhodnou pravidla. Model je podvržený.
 */
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ai = vi.hoisted(() => ({
  provider: "off" as "off" | "gemini",
  respond: (_prompt: string): string | null => null,
}));

vi.mock("../lib/ai-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/ai-provider")>()),
  isAiEnabled: vi.fn(async () => ai.provider !== "off"),
  aiContextFromEnv: vi.fn(async () => ({ provider: ai.provider })),
  generateText: vi.fn(async (_ctx: unknown, prompt: string) => ai.respond(prompt)),
}));

import { handleCoachMessageForJobTip, openJobTip } from "../messaging/job-tip";
import { ownerConversationId } from "../messaging/system-sms";
import { applyOfferRejectionImpact } from "../transfers/offer-rejection-impact";
import type { TransferUnrest } from "../transfers/offer-rejection-impact";
import { availableActions, performUnrestAction } from "../transfers/unrest";
import { deliverOwnerSmsForTeam, handleOwnerSmsReply } from "./owner-sms";
import { requestPlayerJob } from "./player-jobs-db";
import { handleOwnerText } from "./requests-db";

let mf: Miniflare;
let db: D1Database;
let kv: KVNamespace;

const TEAM = "t-job";
const DAY = "2026-11-20";
const SAWMILL = 93001;
const PUB = 93002;
const SOFTWARE = 93003;
const NOVAK = "p-novak";
const DVORAK = "p-dvorak";
const STUDENT = "p-student";

const owners: Record<number, { name: string; firm: string }> = {
  [SAWMILL]: { name: "Karel Kučera", firm: "Pila Kučera" },
  [PUB]: { name: "Josef Kubíček", firm: "Hospoda U Kubíčka" },
  [SOFTWARE]: { name: "Jan Bajt", firm: "Softík" },
};

function player(id: string, first: string, last: string, age: number, lc: Record<string, unknown>): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, weekly_wage)
     VALUES (?, ?, ?, ?, ?, 'MID', 50, '{}', '{}', ?, ?, '{}', 300)`,
  ).bind(id, TEAM, first, last, age, JSON.stringify({ discipline: 50, patriotism: 60, temper: 40 }), JSON.stringify({ morale: 50, ...lc }));
}

async function lifeOf(id: string): Promise<Record<string, unknown>> {
  const row = await db.prepare("SELECT life_context FROM players WHERE id = ?").bind(id).first<{ life_context: string }>();
  return JSON.parse(row?.life_context ?? "{}") as Record<string, unknown>;
}

async function count(sql: string, ...binds: unknown[]): Promise<number> {
  return (await db.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0;
}

async function ownerConv(sponsorId: number): Promise<string> {
  return ownerConversationId(db, TEAM, { sponsorId, name: owners[sponsorId].name, firmName: owners[sponsorId].firm, avatar: "{}" });
}

/** Trenér pošle SMS majiteli: zpráva se uloží (jako routa) a vyřídí ji handleOwnerText. */
async function coachWrites(sponsorId: number, text: string): Promise<{ handled: boolean; convId: string }> {
  const convId = await ownerConv(sponsorId);
  await db.prepare(
    "INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, sent_at, read) VALUES (?, ?, 'user', ?, 'Trenér', ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), 1)",
  ).bind(crypto.randomUUID(), convId, TEAM, text).run();
  const handled = await handleOwnerText(db, { CACHE_KV: kv }, TEAM, convId, sponsorId, text, false);
  return { handled, convId };
}

async function ownerMessages(convId: string): Promise<Array<{ body: string; metadata: string | null; sender_type: string }>> {
  return (await db.prepare("SELECT body, metadata, sender_type FROM messages WHERE conversation_id = ? ORDER BY sent_at, rowid")
    .bind(convId).all<{ body: string; metadata: string | null; sender_type: string }>()).results;
}

async function playerSms(playerId: string): Promise<string[]> {
  return (await db.prepare("SELECT body FROM messages WHERE sender_type = 'player' AND sender_id = ?").bind(playerId).all<{ body: string }>())
    .results.map((r) => r.body);
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
}, 180_000);

afterAll(async () => {
  await mf.dispose();
});

beforeEach(async () => {
  ai.provider = "off";
  ai.respond = () => null;
  await kv.delete(`open_job_tip:conv-tip`);
  for (const t of [
    "notifications", "injuries", "sponsor_jobs", "sponsor_owner_sms", "sponsor_favor_log", "sponsor_team_favor", "sponsor_contracts", "sponsor_owners",
    "sponsor_requests", "district_sponsors", "messages", "conversations", "players", "club_incidents", "coach_relation_log",
    "transactions", "teams", "villages", "users", "seasons",
  ]) await db.prepare(`DELETE FROM ${t}`).run();
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u-job', 'job@example.test', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('season-5', 5, 'active')"),
    db.prepare("INSERT INTO villages (id, name, district, region, population, size, lat, lng) VALUES ('v-job', 'Dvory', 'Prachatice', 'JC', 600, 'village', 49.0, 14.0)"),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date) VALUES (?, 'u-job', 'v-job', 'TJ Dvory', 50000, 50, ?)")
      .bind(TEAM, `${DAY}T05:00:00.000Z`),
    ...[[SAWMILL, "woodwork", "patriot"], [PUB, "pub", "fan"], [SOFTWARE, "it", "businessman"]].flatMap(([id, type, personality]) => [
      db.prepare(
        `INSERT INTO district_sponsors (id, district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
         VALUES (?, 'Prachatice', ?, ?, 1000, 4000, 100, 300)`,
      ).bind(id, owners[id as number].firm, type),
      db.prepare("INSERT INTO sponsor_owners (sponsor_id, first_name, last_name, age, face_config, personality) VALUES (?, ?, ?, 50, '{}', ?)")
        .bind(id, ...owners[id as number].name.split(" "), personality),
    ]),
    // Pila je hlavní sponzor, hospodský klubu fandí bez smlouvy, softwarová firma ho nemusí.
    db.prepare(
      `INSERT INTO sponsor_contracts (id, team_id, sponsor_name, sponsor_type, monthly_amount, seasons_total, seasons_remaining, category, sponsor_id, negotiation_id)
       VALUES ('c-sawmill', ?, 'Pila Kučera', 'woodwork', 3000, 2, 2, 'main', ?, 'n-sawmill')`,
    ).bind(TEAM, SAWMILL),
    db.prepare("INSERT INTO sponsor_team_favor (sponsor_id, team_id, favor) VALUES (?, ?, 70), (?, ?, 85), (?, ?, 30)")
      .bind(SAWMILL, TEAM, PUB, TEAM, SOFTWARE, TEAM),
    player(NOVAK, "Jan", "Novák", 29, { occupation: "Hasič" }),
    player(DVORAK, "Petr", "Dvořák", 31, { occupation: "Hospodský" }),
    player(STUDENT, "Lukáš", "Marek", 19, { occupation: "Student" }),
    db.prepare(
      `INSERT INTO club_incidents (id, team_id, season_number, kind, category, status, game_date, ends_on, culprit_type, subject_player_id, text)
       VALUES ('inc-lost-job', ?, 5, 'prisel_o_praci', 'zivotni', 'probiha', ?, '2026-12-10', 'nikdo', ?, 'Novák přišel o práci')`,
    ).bind(TEAM, DAY, NOVAK),
  ]);
});

describe("requestPlayerJob: zápis a opakovaný běh", () => {
  it("hlavní sponzor vezme hráče: povolání, práce u sponzora, nálada, konec ztráty práce, vztah, protislužba za týden", async () => {
    const out = await requestPlayerJob(db, { teamId: TEAM, sponsorId: SAWMILL, playerId: NOVAK, source: "coach_sms" });
    expect(out.kind).toBe("hired");
    const lc = await lifeOf(NOVAK);
    expect(lc.occupation).toBe("Truhlář");
    expect(lc.sponsorJob).toMatchObject({ sponsorId: SAWMILL, firm: "Pila Kučera", since: DAY, previous: "Hasič" });
    expect(lc.morale).toBe(58);
    const inc = await db.prepare("SELECT status, resolution FROM club_incidents WHERE id = 'inc-lost-job'").first<{ status: string; resolution: string }>();
    expect(inc).toEqual({ status: "uzavreny", resolution: "found_job" });
    expect(await count("SELECT COUNT(*) AS n FROM coach_relation_log WHERE player_id = ? AND source = 'job'", NOVAK)).toBe(1);
    const favor = await db.prepare("SELECT occasion, created_day, status, vars FROM sponsor_owner_sms WHERE team_id = ?").bind(TEAM).first<{
      occasion: string; created_day: string; status: string; vars: string;
    }>();
    expect(favor).toMatchObject({ occasion: "job_favor", created_day: "2026-11-27", status: "pending" });
    expect(JSON.parse(favor!.vars)).toEqual({ player: "Jan Novák" });
  });

  it("druhá žádost týž den: nic se nezapíše podruhé (nálada, vztah, protislužba)", async () => {
    await requestPlayerJob(db, { teamId: TEAM, sponsorId: SAWMILL, playerId: NOVAK, source: "coach_sms" });
    const again = await requestPlayerJob(db, { teamId: TEAM, sponsorId: SAWMILL, playerId: NOVAK, source: "coach_sms" });
    expect(again.kind).toBe("duplicate");
    expect(await count("SELECT COUNT(*) AS n FROM sponsor_jobs")).toBe(1);
    expect((await lifeOf(NOVAK)).morale).toBe(58);
    expect(await count("SELECT COUNT(*) AS n FROM coach_relation_log WHERE source = 'job'")).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM sponsor_owner_sms")).toBe(1);
  });

  it("bez obliby firma odmítne a hráči se nic nezmění", async () => {
    const out = await requestPlayerJob(db, { teamId: TEAM, sponsorId: SOFTWARE, playerId: DVORAK, source: "coach_sms" });
    expect(out).toMatchObject({ kind: "refused", refusal: "stranger" });
    expect((await lifeOf(DVORAK)).occupation).toBe("Hospodský");
    expect(await count("SELECT COUNT(*) AS n FROM sponsor_jobs WHERE status = 'refused'")).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM sponsor_owner_sms")).toBe(0);
  });
});

describe("trenér píše majiteli (bez modelu)", () => {
  it("dlouhá hovorová SMS s překlepy: majitel vezme Nováka, odpoví a hráč poděkuje; druhá stejná SMS nic nezdvojí", async () => {
    const text = "Dobrej den pane Kučero, nemate nahodou u vas na pile nejaky misto pro Nováka? Kluk prisel o fleka a doma ma maly decka";
    const first = await coachWrites(SAWMILL, text);
    expect(first.handled).toBe(true);
    const replies = (await ownerMessages(first.convId)).filter((m) => m.sender_type === "system");
    expect(replies).toHaveLength(1);
    expect(replies[0].body).toContain("Jan Novák");
    expect(replies[0].body).not.toMatch(/—/);
    expect((await lifeOf(NOVAK)).occupation).toBe("Truhlář");
    expect(await playerSms(NOVAK)).toHaveLength(1);

    await coachWrites(SAWMILL, text);
    const after = (await ownerMessages(first.convId)).filter((m) => m.sender_type === "system");
    expect(after).toHaveLength(2);
    expect(after[1].body).toMatch(/dnes/);
    expect(await count("SELECT COUNT(*) AS n FROM sponsor_jobs")).toBe(1);
    expect(await playerSms(NOVAK)).toHaveLength(1);
  });

  it("prosba o peníze zůstane prosbou o peníze", async () => {
    await coachWrites(SAWMILL, "Dobrý den, potřebovali bychom 20 tisíc na nový dresy, starý jsou už fakt na hadry, pomohl byste nám prosím?");
    expect(await count("SELECT COUNT(*) AS n FROM sponsor_jobs")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM sponsor_requests")).toBe(1);
  });

  it("bez jména se majitel doptá a jméno v další SMS stačí", async () => {
    await db.prepare("UPDATE club_incidents SET status = 'uzavreny' WHERE id = 'inc-lost-job'").run();
    const ask = await coachWrites(SAWMILL, "Zdravím, nesháníte náhodou lidi do dílny? Mám tu kluka, co by makal, spolehlivej je.");
    const msgs = (await ownerMessages(ask.convId)).filter((m) => m.sender_type === "system");
    expect(msgs).toHaveLength(1);
    expect(JSON.parse(msgs[0].metadata ?? "{}").type).toBe("sponsor_job_ask");
    expect(await count("SELECT COUNT(*) AS n FROM sponsor_jobs")).toBe(0);

    await coachWrites(SAWMILL, "pro Dvořáka");
    expect((await lifeOf(DVORAK)).occupation).toBe("Truhlář");
    expect((await lifeOf(DVORAK)).sponsorJob).toBeTruthy();
  });

  it("student: majitel odmítne a nic se nezmění", async () => {
    await coachWrites(SAWMILL, "Dobrý den, nevzal byste Marka k sobě do dílny? Kluk by potřeboval přivydělat, je šikovnej");
    expect(await count("SELECT COUNT(*) AS n FROM sponsor_jobs WHERE status = 'refused' AND refusal = 'student'")).toBe(1);
    expect((await lifeOf(STUDENT)).occupation).toBe("Student");
  });
});

describe("trenér píše majiteli (s modelem)", () => {
  it("model pozná záměr i hráče a napíše odpověď; odpověď bez jména hráče se nahradí připravenou větou", async () => {
    ai.provider = "gemini";
    ai.respond = (prompt) => prompt.includes("shání práci ve firmě")
      ? JSON.stringify({ wants_job: true, player: "Jan Novák" })
      : prompt.includes("CO MÁŠ V ODPOVĚDI SDĚLIT") ? JSON.stringify({ body: "Platí, ať se Novák staví v pondělí." }) : null;
    const { convId } = await coachWrites(SAWMILL, "šéfe, ten náš honza by potřeboval nějakou robotu, nešlo by to u vás?");
    const replies = (await ownerMessages(convId)).filter((m) => m.sender_type === "system");
    expect(replies[0].body).toBe("Platí, ať se Novák staví v pondělí.");
    expect((await lifeOf(NOVAK)).sponsorJob).toBeTruthy();

    // Model popletl hráče: připravená věta s jeho jménem.
    ai.respond = (prompt) => prompt.includes("shání práci ve firmě")
      ? JSON.stringify({ wants_job: true, player: "Petr Dvořák" })
      : prompt.includes("CO MÁŠ V ODPOVĚDI SDĚLIT") ? JSON.stringify({ body: "Platí, ať se staví v pondělí." }) : null;
    const second = await coachWrites(SAWMILL, "A co Dvořák, nevzal byste i jeho? Hospoda ho ničí");
    const last = (await ownerMessages(second.convId)).filter((m) => m.sender_type === "system").pop();
    expect(last?.body).toContain("Petr Dvořák");
  });
});

describe("protislužba za práci (vzor slibu pořadatelské služby)", () => {
  it("přijde až za týden, jen jednou, a odbytí stojí dvojnásob", async () => {
    await requestPlayerJob(db, { teamId: TEAM, sponsorId: PUB, playerId: DVORAK, source: "coach_sms" });
    expect(await deliverOwnerSmsForTeam(db, TEAM, DAY)).toBe(false);
    expect(await deliverOwnerSmsForTeam(db, TEAM, "2026-11-27")).toBe(true);
    expect(await deliverOwnerSmsForTeam(db, TEAM, "2026-11-28")).toBe(false);
    const sms = await db.prepare("SELECT status, body, conversation_id FROM sponsor_owner_sms WHERE occasion = 'job_favor'")
      .first<{ status: string; body: string; conversation_id: string }>();
    expect(sms?.status).toBe("awaiting");
    expect(sms?.body).toContain("Petr Dvořák");

    const before = await count("SELECT favor AS n FROM sponsor_team_favor WHERE sponsor_id = ? AND team_id = ?", PUB, TEAM);
    expect(await handleOwnerSmsReply(db, sms!.conversation_id, "Na to teď nemáme čas.", "dismissive")).toBe(true);
    const after = await count("SELECT favor AS n FROM sponsor_team_favor WHERE sponsor_id = ? AND team_id = ?", PUB, TEAM);
    expect(before - after).toBe(8);
    const log = await db.prepare("SELECT reason FROM sponsor_favor_log WHERE sponsor_id = ? ORDER BY rowid DESC LIMIT 1").bind(PUB)
      .first<{ reason: string }>();
    expect(log?.reason).toMatch(/vzal tvého hráče/);
  });
});

describe("hráč se ptá sám (casual_job_tip)", () => {
  it("trenér slíbí, že se zeptá u Kubíčka: hospodský hráče vezme, vlákno s majitelem, poděkování; podruhé nic", async () => {
    await openJobTip(kv, "conv-tip", { teamId: TEAM, playerId: NOVAK, playerFirstName: "Jan" });
    const text = "neboj kamo, zeptam se u Kubicka v hospode, ten porad nekoho hleda na vypomoc";
    expect(await handleCoachMessageForJobTip(db, { CACHE_KV: kv }, "conv-tip", text)).toBe(true);
    expect((await lifeOf(NOVAK)).sponsorJob).toMatchObject({ sponsorId: PUB });
    expect((await lifeOf(NOVAK)).occupation).toBe("Číšník");
    const thread = await ownerMessages(await ownerConv(PUB));
    expect(thread.map((m) => m.sender_type)).toEqual(["user", "system"]);
    expect(await playerSms(NOVAK)).toHaveLength(1);

    expect(await handleCoachMessageForJobTip(db, { CACHE_KV: kv }, "conv-tip", text)).toBe(false);
    expect(await count("SELECT COUNT(*) AS n FROM sponsor_jobs")).toBe(1);
    expect(await playerSms(NOVAK)).toHaveLength(1);
  });

  it("soucit bez slibu nic nespustí a otázka čeká dál", async () => {
    await openJobTip(kv, "conv-tip", { teamId: TEAM, playerId: NOVAK, playerFirstName: "Jan" });
    expect(await handleCoachMessageForJobTip(db, { CACHE_KV: kv }, "conv-tip", "To je blbý, drž se, hlavně přijď v sobotu na zápas")).toBe(false);
    expect(await kv.get("open_job_tip:conv-tip")).not.toBeNull();
    expect(await count("SELECT COUNT(*) AS n FROM sponsor_jobs")).toBe(0);
  });
});

describe("soupeř láká prací", () => {
  it("odmítnutá nabídka s prací na pile: hráč bez práce chtěl odejít i kvůli práci a nabídne se dohoda", async () => {
    const offer = {
      id: "off-job", player_id: NOVAK, from_team_id: "virtual_ai", to_team_id: TEAM, offer_amount: 60_000, offer_type: "transfer",
      virtual_team_data: JSON.stringify({ name: "TJ Blatná", rating: 55, job: { occupation: "Dělník v pile", label: "práci na pile" } }),
    };
    await applyOfferRejectionImpact(db, offer, "reject");
    const lc = await lifeOf(NOVAK);
    const unrest = lc.transferUnrest as TransferUnrest | undefined;
    expect(unrest?.reasons).toContain("job");
    // V panelu u hráče se nabídne dohoda „Sehnat mu práci u sponzora“.
    const ctx = { seasonNumber: 5, patriotism: 60, discipline: 50, leadership: 30, coachRelationship: 50, isCaptain: false, ownedHere: true };
    expect(availableActions(unrest!, lc, ctx).map((a) => a.id)).toContain("find_job");
  });
});

describe("dohoda s nespokojeným: sehnat mu práci u sponzora", () => {
  const unrest = (level: number) => ({
    level, reason: "rejected_offer", teamName: "TJ Blatná", reasons: ["job"], deals: [],
    offer: { amount: 40_000, fromTeamId: "virtual_ai", virtualTeamData: JSON.stringify({ name: "TJ Blatná", job: { occupation: "Dělník v pile", label: "práci na pile" } }), at: `${DAY}T08:00:00.000Z` },
  });

  it("firma ho vezme: uklidní se, má práci u sponzora; druhá dohoda týž den neprojde", async () => {
    await db.prepare("UPDATE players SET life_context = json_set(life_context, '$.transferUnrest', json(?)) WHERE id = ?")
      .bind(JSON.stringify(unrest(60)), DVORAK).run();
    const res = await performUnrestAction(db, {}, TEAM, DVORAK, "find_job");
    expect(res.ok).toBe(true);
    const lc = await lifeOf(DVORAK);
    expect(lc.occupation).toBe("Truhlář");
    expect(lc.sponsorJob).toMatchObject({ sponsorId: SAWMILL });
    expect((lc.transferUnrest as { level: number }).level).toBe(20);
    const again = await performUnrestAction(db, {}, TEAM, DVORAK, "find_job");
    expect(again.ok).toBe(false);
    expect(await count("SELECT COUNT(*) AS n FROM sponsor_jobs")).toBe(1);
  });

  it("žádná firma ho nevezme: dohoda neprojde a nic se nezmění", async () => {
    await db.batch([
      db.prepare("UPDATE sponsor_team_favor SET favor = 20 WHERE team_id = ?").bind(TEAM),
      db.prepare("UPDATE players SET life_context = json_set(life_context, '$.transferUnrest', json(?)) WHERE id = ?")
        .bind(JSON.stringify(unrest(60)), DVORAK),
    ]);
    const res = await performUnrestAction(db, {}, TEAM, DVORAK, "find_job");
    expect(res).toMatchObject({ ok: false, status: 409 });
    const lc = await lifeOf(DVORAK);
    expect(lc.occupation).toBe("Hospodský");
    expect((lc.transferUnrest as { level: number }).level).toBe(60);
  });
});
