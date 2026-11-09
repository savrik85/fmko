/**
 * Předplacenka nad skutečnou D1 (Miniflare): dobití jen jednou a jen dopředu,
 * vrácení SMS nejvýš jednou a pravidlo, komu z telefonu ještě jde napsat.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { CENA_SMS, DENNI_KREDIT, loadCredit, refundCoachSms, spendCredit } from "./phone-credit";
import { playerInClub } from "./player-reach";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  await db.exec("CREATE TABLE teams (id TEXT PRIMARY KEY, parent_team_id TEXT, team_type TEXT, game_date TEXT, phone_credit INTEGER, phone_credit_date TEXT)");
  await db.exec("CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, loan_from_team_id TEXT)");
  await db.exec("CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, body TEXT, metadata TEXT, sent_at TEXT)");
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM teams"),
    db.prepare("DELETE FROM players"),
    db.prepare("DELETE FROM messages"),
    db.prepare(`INSERT INTO teams (id, parent_team_id, team_type, game_date, phone_credit, phone_credit_date) VALUES
      ('club', NULL, 'main', '2026-11-09T05:00:00Z', 6, '2026-11-09'),
      ('club-u21', 'club', 'u21', '2026-11-09T05:00:00Z', NULL, NULL),
      ('rival', NULL, 'main', '2026-11-09T05:00:00Z', NULL, NULL),
      ('rival-u21', 'rival', 'u21', '2026-11-09T05:00:00Z', NULL, NULL)`),
  ]);
});

const credit = async () =>
  (await db.prepare("SELECT phone_credit AS c, phone_credit_date AS d FROM teams WHERE id = 'club'").first<{ c: number; d: string }>())!;
const setDay = (day: string) => db.prepare("UPDATE teams SET game_date = ? WHERE id = 'club'").bind(`${day}T05:00:00Z`).run();

describe("denní dobití", () => {
  it("týž den nedobíjí, nový den dobije právě jednou i při souběhu", async () => {
    expect((await loadCredit(db, "club")).zbyva).toBe(6);
    await setDay("2026-11-10");
    const states = await Promise.all(Array.from({ length: 8 }, () => loadCredit(db, "club")));
    expect(states.every((s) => s.zbyva === DENNI_KREDIT)).toBe(true);
    expect(await credit()).toEqual({ c: DENNI_KREDIT, d: "2026-11-10" });
  });

  it("souběžná útrata po půlnoci nepřečerpá a dobití ji nepřepíše", async () => {
    await setDay("2026-11-10");
    const spent = await Promise.all(Array.from({ length: 20 }, () => spendCredit(db, "club")));
    expect(spent.filter(Boolean)).toHaveLength(DENNI_KREDIT / CENA_SMS);
    expect((await credit()).c).toBe(0);
    // Další čtení týž den nesmí dobít znovu.
    expect((await loadCredit(db, "club")).zbyva).toBe(0);
  }, 30_000);

  it("herní den posunutý zpět kredit nedobije", async () => {
    await db.prepare("UPDATE teams SET phone_credit = 3 WHERE id = 'club'").run();
    await setDay("2026-11-08");
    expect((await loadCredit(db, "club")).zbyva).toBe(3);
    expect(await credit()).toEqual({ c: 3, d: "2026-11-09" });
    // A po návratu na původní den taky ne.
    await setDay("2026-11-09");
    expect((await loadCredit(db, "club")).zbyva).toBe(3);
  });

  it("tým, který kredit ještě nikdy neměl, dostane první dobití", async () => {
    expect((await loadCredit(db, "rival")).zbyva).toBe(DENNI_KREDIT);
  });
});

describe("vrácení SMS", () => {
  const addCoachSms = (id: string, sentAt: string, metadata: string | null = null) =>
    db.prepare("INSERT INTO messages (id, conversation_id, sender_type, body, metadata, sent_at) VALUES (?, 'c1', 'user', 'ahoj', ?, ?)")
      .bind(id, metadata, sentAt).run();

  it("vrátí cenu jedné SMS a tutéž zprávu podruhé nevrací", async () => {
    await addCoachSms("m1", "2026-11-09T10:00:00Z");
    const results = await Promise.all(Array.from({ length: 5 }, () => refundCoachSms(db, "club", "c1", "test")));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await credit()).c).toBe(6 + CENA_SMS);
    expect(await refundCoachSms(db, "club", "c1", "test")).toBe(false);
  });

  it("značka se přidá k metadatům hlasovky a novější zpráva má vlastní vratku", async () => {
    await addCoachSms("m1", "2026-11-09T10:00:00Z", JSON.stringify({ type: "voice", audioKey: "k" }));
    expect(await refundCoachSms(db, "club", "c1", "test")).toBe(true);
    const meta = await db.prepare("SELECT metadata FROM messages WHERE id = 'm1'").first<{ metadata: string }>();
    expect(JSON.parse(meta!.metadata)).toEqual({ type: "voice", audioKey: "k", creditRefunded: 1 });
    await addCoachSms("m2", "2026-11-09T10:05:00Z");
    expect(await refundCoachSms(db, "club", "c1", "test")).toBe(true);
    expect((await credit()).c).toBe(6 + 2 * CENA_SMS);
  });

  it("nikdy nevrátí nad denní dobití a bez zprávy trenéra nevrací nic", async () => {
    expect(await refundCoachSms(db, "club", "c1", "test")).toBe(false);
    await db.prepare("UPDATE teams SET phone_credit = ? WHERE id = 'club'").bind(DENNI_KREDIT - 1).run();
    await addCoachSms("m1", "2026-11-09T10:00:00Z");
    expect(await refundCoachSms(db, "club", "c1", "test")).toBe(true);
    expect((await credit()).c).toBe(DENNI_KREDIT);
  });
});

describe("playerInClub", () => {
  beforeEach(async () => {
    await db.prepare(`INSERT INTO players (id, team_id, loan_from_team_id) VALUES
      ('p-first', 'club', NULL),
      ('p-u21', 'club-u21', NULL),
      ('p-loaned-out', 'rival', 'club'),
      ('p-loaned-out-u21', 'rival-u21', 'club-u21'),
      ('p-loaned-in', 'club', 'rival'),
      ('p-sold', 'rival', NULL),
      ('p-free', NULL, NULL)`).run();
  });

  it("áčko, U21, hráč půjčený jinam i hostující u nás ke klubu patří", async () => {
    for (const id of ["p-first", "p-u21", "p-loaned-out", "p-loaned-out-u21", "p-loaned-in"]) {
      expect(await playerInClub(db, id, "club"), id).toBe(true);
    }
  });

  it("prodaný, volný a neexistující hráč ne", async () => {
    for (const id of ["p-sold", "p-free", "p-missing"]) {
      expect(await playerInClub(db, id, "club"), id).toBe(false);
    }
  });

  it("konverzace vedená z U21 týmu se počítá ke stejnému klubu", async () => {
    expect(await playerInClub(db, "p-first", "club-u21")).toBe(true);
    expect(await playerInClub(db, "p-sold", "club-u21")).toBe(false);
  });
});
