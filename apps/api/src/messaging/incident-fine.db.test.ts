/**
 * „Strhnu ti to z výplaty“ odhalenému pachateli nad skutečnou D1 (Miniflare): trest za incident
 * se dává u incidentu, chatová pokuta vedle něj nevznikne.
 *
 * E2E 22. 11. (B2a, Adam Turek, FaSta Vimperk): „Adame, kamera tě natočila u tomboly. Strhnu ti to
 * z výplaty.“ založilo slib „⚖️ Adam: pokuta 293 Kč. Udělit ji musíš sám…“ a trenér pak měl vedle
 * srážky z incidentu (1 172 Kč) ještě tlačítko na další pokutu za totéž.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";

const model = vi.hoisted(() => ({ askModelJson: vi.fn() }));
vi.mock("./ai-player-chat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ai-player-chat")>()),
  askModelJson: model.askModelJson,
}));

import { handleCoachMessageForCommitment } from "./coach-commitments";

let miniflare: Miniflare;
let db: D1Database;
const TEXT = "Adame, kamera tě natočila u tomboly. Strhnu ti to z výplaty.";

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
  const migration = (name: string) => readFileSync(new URL(`../../migrations/${name}`, import.meta.url), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
  await db.exec(migration("0316_coach_commitments.sql"));
  await db.exec(migration("0204_incidenty_zaklad.sql").replace(/ALTER TABLE equipment[^;]*;/g, ""));
  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, parent_team_id TEXT, team_type TEXT NOT NULL DEFAULT 'senior', budget INTEGER, game_date TEXT)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, nickname TEXT, avatar TEXT, position TEXT, weekly_wage INTEGER, life_context TEXT, coach_relationship INTEGER, loan_from_team_id TEXT, status TEXT)",
    "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT, read INTEGER DEFAULT 0)",
  ]) await db.prepare(sql).run();
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  model.askModelJson.mockReset();
  model.askModelJson.mockResolvedValue({ kind: "fine", quote: "Strhnu ti to z výplaty" });
  for (const t of ["coach_commitments", "teams", "players", "messages", "club_incidents"]) await db.prepare(`DELETE FROM ${t}`).run();
  await db.batch([
    db.prepare("INSERT INTO teams (id, name, user_id, budget, game_date) VALUES ('club', 'FK FaSta Vimperk', 'u1', 5000, '2026-11-22T16:00:00.000Z')"),
    db.prepare(`INSERT INTO players (id, team_id, first_name, last_name, position, weekly_wage, life_context, coach_relationship) VALUES
      ('turek', 'club', 'Adam', 'Turek', 'MID', 293, '{"morale":50}', 50)`),
  ]);
});

const incident = (o: { status: string; revealed?: number; resolution?: string | null; resolvedOn?: string | null }) => db.prepare(
  `INSERT INTO club_incidents (id, team_id, season_number, kind, category, status, game_date, culprit_type, culprit_player_id, culprit_revealed,
     loss, resolution, resolved_on, text)
   VALUES ('inc-tombola', 'club', 4, 'tombola', 'kradez', ?, '2026-11-21T16:00:00.000Z', 'hrac', 'turek', ?, '[]', ?, ?, 'Okradená tombola.')`,
).bind(o.status, o.revealed ?? 1, o.resolution ?? null, o.resolvedOn ?? null).run();

const send = () => handleCoachMessageForCommitment(db, {}, { teamId: "club", convId: "c1", playerId: "turek", text: TEXT });
const fines = async () => (await db.prepare("SELECT COUNT(*) AS n FROM coach_commitments WHERE kind = 'fine'").first<{ n: number }>())?.n;
const notes = async () => (await db.prepare("SELECT body, metadata FROM messages WHERE sender_type = 'system'").all<{ body: string; metadata: string }>()).results;

describe("pokuta z SMS a incident", () => {
  it("odhalený pachatel otevřeného incidentu: pokuta z SMS nevznikne, trenér dostane odkaz na incident", async () => {
    await incident({ status: "otevreny" });
    expect(await send()).toBeNull();
    expect(await fines()).toBe(0);
    const [note] = await notes();
    expect(note.body).toContain("Adam Turek je odhalený pachatel (Okradená tombola)");
    expect(note.body).toContain("u incidentu");
    expect(note.body).not.toContain("—");
    expect(JSON.parse(note.metadata)).toMatchObject({ type: "coach_claim_note", href: "/incidenty?id=inc-tombola", label: "Otevřít incident" });
  });

  it("incident právě uzavřený srážkou: druhá pokuta za totéž nevznikne", async () => {
    await incident({ status: "uzavreny", resolution: "srazka", resolvedOn: "2026-11-22T16:00:00.000Z" });
    expect(await send()).toBeNull();
    expect(await fines()).toBe(0);
    expect((await notes())[0].body).toContain("už za incident (Okradená tombola) trest má");
  });

  it("starý uzavřený incident, neodhalený pachatel nebo žádný incident: pokuta z SMS se zapíše jako dřív", async () => {
    await incident({ status: "uzavreny", resolution: "srazka", resolvedOn: "2026-11-10T16:00:00.000Z" });
    expect(await send()).toBeTruthy();
    expect(await fines()).toBe(1);

    await db.prepare("DELETE FROM coach_commitments").run();
    await db.prepare("DELETE FROM club_incidents").run();
    await incident({ status: "otevreny", revealed: 0 });
    expect(await send()).toBeTruthy();

    await db.prepare("DELETE FROM coach_commitments").run();
    await db.prepare("DELETE FROM club_incidents").run();
    expect(await send()).toBeTruthy();
    expect(await fines()).toBe(1);
  });
});
