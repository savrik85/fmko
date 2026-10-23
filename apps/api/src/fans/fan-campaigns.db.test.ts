/**
 * Splněná kampaň „trenér ven" musí jednou skončit.
 *
 * Proti hráči skončí, když hráč odejde. Trenér odejít nemůže, takže kampaň
 * zůstávala ve stavu `splnena` napořád a s ní transparent, chorál (obnovovaný
 * na sílu 100 a s placenou nahrávkou), otázky v rozhovorech i zmeškané hovory.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { nactiKampane, tikKampani } from "./fan-campaigns";
import { prepoctiTransparent } from "./fan-banner";
import { tikChoralu } from "./fan-chants";
import { kandidatiNaNahravku } from "./fan-chant-audio";
import type { FanGroupRow } from "./fan-group-generator";

let miniflare: Miniflare;
let db: D1Database;

/** Spokojený kotel: nová kampaň nevznikne, běžící nemá z čeho sílit. */
const ultras: FanGroupRow = {
  id: "g1", team_id: "t1", kind: "kotel", name: "Kotel", share: 0.3, size: 400, mood: 60, heat: 20,
  passion: 70, aggression: 30, loyalty: 60, spending: 40, noise: 50, sector: "sever",
  closed_matches: 0, ticket_discount: 0, core: 10, leader_id: null,
};

const FULFILLED_ON = "2026-10-01T16:00:00.000Z";
const day = (offset: number) => new Date(Date.parse(FULFILLED_ON) + offset * 86_400_000).toISOString();
/** Dva herní týdny po splnění, jak to schválil majitel hry. */
const CLOSE_AFTER_DAYS = 14;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT, district TEXT)",
    "CREATE TABLE users (id TEXT PRIMARY KEY, last_activity_at TEXT)",
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, village_id TEXT, tactic TEXT, league_id TEXT, user_id TEXT, team_type TEXT)",
    `CREATE TABLE stadiums (team_id TEXT PRIMARY KEY, ultras_text TEXT, ultras_text_duvod TEXT, ultras_stand INTEGER,
      toilets INTEGER, roof INTEGER, refreshments INTEGER, stands INTEGER, pitch_condition INTEGER)`,
    "CREATE TABLE fan_group_players (group_id TEXT, team_id TEXT, player_id TEXT, stance TEXT, duvod TEXT)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, status TEXT)",
    "CREATE TABLE managers (team_id TEXT PRIMARY KEY, name TEXT)",
    "CREATE TABLE fan_rivalries (id TEXT, team_a TEXT, team_b TEXT, heat INTEGER, fights INTEGER, incidents INTEGER, last_game_date TEXT, history TEXT)",
    "CREATE TABLE matches (home_team_id TEXT, away_team_id TEXT, home_score INTEGER, away_score INTEGER, simulated_at TEXT, created_at TEXT)",
    `CREATE TABLE fan_campaigns (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, kind TEXT NOT NULL, target_player_id TEXT,
      target_name TEXT NOT NULL, duvod TEXT NOT NULL DEFAULT '', podpisy INTEGER NOT NULL DEFAULT 0,
      prah INTEGER NOT NULL DEFAULT 100, status TEXT NOT NULL DEFAULT 'sbira', last_game_date TEXT,
      started_game_date TEXT, ended_game_date TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
    `CREATE TABLE fan_chants (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, group_id TEXT, kind TEXT NOT NULL,
      text TEXT NOT NULL, duvod TEXT NOT NULL DEFAULT '', sila INTEGER NOT NULL DEFAULT 40, since_game_date TEXT,
      last_game_date TEXT, status TEXT NOT NULL DEFAULT 'zpiva', updated_at TEXT,
      audio_task_id TEXT, audio_a TEXT, audio_b TEXT, audio_vybrana TEXT)`,
  ]) await db.prepare(sql).run();

  await db.batch([
    db.prepare("INSERT INTO villages VALUES ('v1', 'Podolí', 'Praha')"),
    db.prepare("INSERT INTO users VALUES ('u1', '2099-01-01')"),
    db.prepare("INSERT INTO teams VALUES ('t1', 'SK Podolí', 'v1', NULL, 'l1', 'u1', 'senior')"),
    // Stadion bez chyby a s kotlem, ať plachta i chorály řeší jen kampaň.
    db.prepare("INSERT INTO stadiums VALUES ('t1', NULL, NULL, 1, 1, 1, 1, 1, 80)"),
    db.prepare("INSERT INTO managers VALUES ('t1', 'Josef Novotný')"),
    db.prepare(
      `INSERT INTO fan_campaigns (id, team_id, kind, target_player_id, target_name, duvod, podpisy, prah, status,
         last_game_date, started_game_date, ended_game_date)
       VALUES ('kmp-coach', 't1', 'trener_ven', NULL, 'Josef Novotný', 'Nálada je pod bodem mrazu.', 60, 40, 'splnena', ?, ?, ?)`,
    ).bind(FULFILLED_ON, day(-6), FULFILLED_ON),
    // Chorál proti trenérovi, který kampaň obnovovala na plnou sílu. Nahrávku ještě nemá.
    db.prepare(
      `INSERT INTO fan_chants (id, team_id, group_id, kind, text, duvod, sila, since_game_date, last_game_date, status)
       VALUES ('ch-coach', 't1', 'g1', 'trener_proti', 'NOVOTNÝ, ODEJDI!', 'Kotel veřejně volá po odvolání trenéra.', 100, ?, ?, 'zpiva')`,
    ).bind(day(-6), FULFILLED_ON),
  ]);
});

afterAll(async () => {
  await miniflare.dispose();
});

const banner = () => db.prepare("SELECT ultras_text, ultras_text_duvod FROM stadiums WHERE team_id = 't1'")
  .first<{ ultras_text: string | null; ultras_text_duvod: string | null }>();
const coachChant = () => db.prepare("SELECT sila, status FROM fan_chants WHERE id = 'ch-coach'")
  .first<{ sila: number; status: string }>();

describe("splněná kampaň proti trenérovi", () => {
  it("dokud běží, visí transparent a chorál má nárok na nahrávku", async () => {
    await tikKampani(db, "t1", [ultras], day(1));
    await prepoctiTransparent(db, "t1", [ultras], day(1));
    expect((await banner())?.ultras_text).toBe("NOVOTNÝ VEN!");
    expect((await kandidatiNaNahravku(db)).map((c) => c.id)).toContain("ch-coach");
  });

  it(`den před uplynutím ${CLOSE_AFTER_DAYS} dní pořád běží`, async () => {
    const out = await tikKampani(db, "t1", [ultras], day(CLOSE_AFTER_DAYS - 1));
    expect(out.closed).toEqual([]);
    expect((await nactiKampane(db, "t1")).map((k) => k.id)).toEqual(["kmp-coach"]);
  });

  it(`skončí ${CLOSE_AFTER_DAYS} herních dní po splnění`, async () => {
    const out = await tikKampani(db, "t1", [ultras], day(CLOSE_AFTER_DAYS));
    expect(out.closed.map((k) => k.id)).toEqual(["kmp-coach"]);
    // Stránka fanoušků, otázky v rozhovorech i hovory berou jen sbira/splnena.
    expect(await nactiKampane(db, "t1")).toEqual([]);
  });

  it("po konci zmizí transparent, chorál se neobnoví a nahrávka se neobjedná", async () => {
    await prepoctiTransparent(db, "t1", [ultras], day(CLOSE_AFTER_DAYS));
    const after = await banner();
    expect(after?.ultras_text).not.toBe("NOVOTNÝ VEN!");
    expect(after?.ultras_text_duvod).not.toBe("Běží podpisová akce za tvoje odvolání.");

    await tikChoralu(db, "t1", [ultras], day(CLOSE_AFTER_DAYS));
    const chant = await coachChant();
    expect(chant?.sila).toBeLessThan(100);
    expect(chant?.sila).toBeGreaterThanOrEqual(80);
    expect((await kandidatiNaNahravku(db)).map((c) => c.id)).not.toContain("ch-coach");
  });

  it("další den se o kampani nic nového neděje", async () => {
    const out = await tikKampani(db, "t1", [ultras], day(CLOSE_AFTER_DAYS + 1));
    expect(out).toEqual({ zalozene: [], splnene: [], vysumele: [], closed: [] });
  });
});
