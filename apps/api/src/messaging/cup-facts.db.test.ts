/**
 * Pohár v kontextu hráče nad skutečnou D1 (Miniflare).
 *
 * Mikeš (Čkyně 2026-11-14) v poledne odchytal pohár s nulou a odpoledne trenérovi tvrdil
 * „Jakej pohár? Dneska se nic nehrálo“: prompt znal jen ligový zápas, ve kterém neseděl
 * ani na lavičce. Pešek den předem „Zítra pohár? O tom nic nevím“.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";

vi.mock("../stats/standings", () => ({ calculateStandings: vi.fn(async () => []) }));

import { loadLastMatchContext, loadPlayerSnapshot, loadTeamContext } from "./ai-player-spawn";
import { buildLastMatchFacts, buildPreviousMatchFacts, buildSystemPrompt } from "./ai-player-chat";
import { cupOutcome, describeLastCupMatch, describeNextCupMatch, withinPreviousWindow, type LastCupMatch } from "./cup-facts";
import { pragueTomorrow } from "./next-match";

let miniflare: Miniflare;
let db: D1Database;

/**
 * Zítřek podle pražského kalendáře. Dřív `Date.now() + 1 den` v UTC: mezi 00:00 a 01:00
 * v Praze (23:xx UTC) z toho vyšlo dnešní pražské datum a test čekal „zítra“ u dnešního zápasu.
 */
const tomorrow = `${pragueTomorrow(new Date())}T11:00:00Z`;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT, size TEXT, district TEXT)",
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, village_id TEXT, league_id TEXT, team_type TEXT, parent_team_id TEXT, game_date TEXT)",
    "CREATE TABLE managers (team_id TEXT, name TEXT)",
    "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, scheduled_at TEXT, status TEXT)",
    "CREATE TABLE matches (id TEXT PRIMARY KEY, calendar_id TEXT, home_team_id TEXT, away_team_id TEXT, home_score INTEGER, away_score INTEGER, status TEXT, simulated_at TEXT, home_lineup_data TEXT, away_lineup_data TEXT, absences TEXT, created_at TEXT)",
    "CREATE TABLE match_player_stats (match_id TEXT, player_id TEXT, minutes_played INTEGER, goals INTEGER, assists INTEGER, yellow_cards INTEGER, red_cards INTEGER, rating REAL)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, status TEXT, overall_rating INTEGER)",
    "CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT)",
    "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, body TEXT, metadata TEXT, sent_at TEXT)",
    "CREATE TABLE cup_competitions (id TEXT PRIMARY KEY, name TEXT)",
    "CREATE TABLE cup_teams (id TEXT PRIMARY KEY, cup_id TEXT, team_id TEXT, name TEXT)",
    `CREATE TABLE cup_matches (id TEXT PRIMARY KEY, cup_id TEXT, round INTEGER, home_cup_team_id TEXT, away_cup_team_id TEXT,
      home_score INTEGER, away_score INTEGER, home_pens INTEGER, away_pens INTEGER, status TEXT, scheduled_at TEXT, simulated_at TEXT,
      home_lineup_data TEXT, away_lineup_data TEXT, absences TEXT)`,
  ]) await db.prepare(sql).run();
  const cupLineup = JSON.stringify({ starters: [{ id: "mikes" }], subs: [] });
  await db.batch([
    db.prepare("INSERT INTO villages VALUES ('v1', 'Čkyně', 'village', 'Prachatice')"),
    db.prepare(`INSERT INTO teams VALUES
      ('ckyne', 'KMP Čkyně', 'v1', 'l1', 'main', NULL, '2026-11-14'),
      ('volary', 'FK Volary', NULL, 'l1', 'main', NULL, NULL),
      ('vrsovice', 'Vršovice', NULL, 'l1', 'main', NULL, NULL)`),
    db.prepare("INSERT INTO players VALUES ('mikes', 'ckyne', 'Jan', 'Mikeš', 'active', 50), ('pesek', 'vrsovice', 'Filip', 'Pešek', 'active', 50)"),
    // Liga 12. 11.: Mikeš nebyl ani na lavičce. Pohár 14. 11. v poledne: chytal celý zápas.
    db.prepare("INSERT INTO matches VALUES ('liga', NULL, 'ckyne', 'volary', 0, 2, 'simulated', '2026-11-12 17:05:00', ?, NULL, NULL, NULL)")
      .bind(JSON.stringify({ starters: [{ id: "jiny" }], subs: [] })),
    db.prepare("INSERT INTO cup_competitions VALUES ('cup', 'Okresní pohár')"),
    db.prepare("INSERT INTO cup_teams VALUES ('ct-ckyne', 'cup', 'ckyne', 'KMP Čkyně'), ('ct-cb', 'cup', NULL, 'SK České Budějovice'), ('ct-vrs', 'cup', 'vrsovice', 'Vršovice'), ('ct-vim', 'cup', NULL, 'FK Vimperk')"),
    db.prepare(`INSERT INTO cup_matches VALUES
      ('pohar', 'cup', 1, 'ct-cb', 'ct-ckyne', 0, 1, NULL, NULL, 'simulated', '2026-11-14T16:00:00Z', '2026-11-14T11:10:00Z', NULL, ?, NULL),
      ('pohar-2', 'cup', 1, 'ct-vim', 'ct-vrs', NULL, NULL, NULL, NULL, 'scheduled', ?, NULL, NULL, NULL, NULL)`).bind(cupLineup, tomorrow),
    db.prepare("INSERT INTO match_player_stats VALUES ('pohar', 'mikes', 90, 0, 0, 0, 0, 8.3)"),
  ]);
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

const row = { id: "mikes", first_name: "Jan", last_name: "Mikeš", age: 24, position: "GK", personality: "{}", life_context: "{}" };

describe("hráč zná pohár", () => {
  it("poslední zápas je pohár, když se hrál po lize, a hráč v něm hrál", async () => {
    const ctx = await loadLastMatchContext(db, "ckyne");
    expect(ctx).toMatchObject({ matchId: "pohar", kind: "cup", lastOutcome: "win" });
    const p = loadPlayerSnapshot(row, ctx);
    expect(p.playedLastMatch).toBe(true);
    expect(p.lastMatchRating).toBe(8.3);
    // Liga dva dny před pohárem: hráč ví, že v ní nehrál.
    expect(p.previousMatch).toEqual({ kind: "league", played: false, minutes: 0, goals: 0 });
  });

  it("prompt říká, že šlo o pohár, a zná i mistrovský zápas předtím", async () => {
    const team = await loadTeamContext(db, "ckyne");
    expect(team.lastMatchResult).toBe("pohárový zápas (Okresní pohár, 1. kolo): výhra 1:0 venku s SK České Budějovice, postupujeme");
    expect(team.previousMatchResult).toBe("mistrovský zápas: prohra 0:2 doma s FK Volary");
    const p = loadPlayerSnapshot(row, await loadLastMatchContext(db, "ckyne"));
    const prompt = buildSystemPrompt(p, team);
    // S dnem zápasu (next-match.ts playedDayLabel), ať model neříká „včera“ o dnešku.
    expect(prompt).toMatch(/Poslední zápas \(hrál se [^)]+\): pohárový zápas \(Okresní pohár, 1\. kolo\)/);
    expect(buildLastMatchFacts(p, team.lastMatchResult)).toContain("V posledním zápase jsi nastoupil, pohárový zápas");
    expect(buildPreviousMatchFacts(p, team.previousMatchResult)).toContain("V tom předchozím mistrovském zápase jsi NEHRÁL");
    expect(prompt).toContain("Kromě mistrovských zápasů se hraje i pohár");
  });

  it("den před pohárem hráč ví, že zítra hraje pohár", async () => {
    const team = await loadTeamContext(db, "vrsovice");
    expect(team.nextCupMatch).toMatch(/^zítra \(.+\) v poledne venku s FK Vimperk \(Okresní pohár\)$/);
    expect(buildSystemPrompt(loadPlayerSnapshot({ ...row, id: "pesek" }), team)).toContain("Příští pohárový zápas: zítra");
  });

  it("tým bez poháru má kontext jako dřív", async () => {
    const team = await loadTeamContext(db, "volary");
    expect(team.nextCupMatch).toBeUndefined();
    expect(team.previousMatchResult).toBeUndefined();
    expect((await loadLastMatchContext(db, "volary")).kind).toBe("league");
  });
});

describe("popis pohárového zápasu", () => {
  const base: LastCupMatch = {
    id: "x", cupTeamId: "c", isHome: true, myScore: 2, oppScore: 2, myPens: 4, oppPens: 3,
    opponent: "Lhota", cupName: "Okresní pohár", round: 2, lineupData: null, absences: null, simulatedAt: "2026-11-14T11:00:00Z",
  };

  it("remíza s penaltami rozhoduje o postupu", () => {
    expect(cupOutcome(base)).toBe("win");
    expect(describeLastCupMatch(base)).toBe("pohárový zápas (Okresní pohár, 2. kolo): remíza 2:2 doma s Lhota, na penalty jsme vyhráli 4:3, postupujeme");
    expect(cupOutcome({ ...base, myPens: 2, oppPens: 4 })).toBe("loss");
  });

  it("zítra se počítá od pražské půlnoci, ne od UTC", () => {
    // 23:30 UTC 22. 11. je v Praze už 23. 11. 0:30: zápas 24. 11. je zítra, 23. 11. dnes.
    const now = new Date("2026-11-22T23:30:00Z");
    expect(describeNextCupMatch({ scheduledAt: "2026-11-24T11:00:00Z", isHome: false, opponent: "FK Vimperk", cupName: null }, now))
      .toBe("zítra (úterý 24. 11.) v poledne venku s FK Vimperk");
    expect(describeNextCupMatch({ scheduledAt: "2026-11-23T11:00:00Z", isHome: false, opponent: "FK Vimperk", cupName: null }, now))
      .toMatch(/^DNES \(pondělí 23\. 11\.\)/);
  });

  it("zítra platí i v noci přechodu na zimní a letní čas", () => {
    // 25. 10. 2026 0:30 v Praze (letní čas): den má 25 hodin, „teď + 24 h“ by byl pořád 25. 10.
    expect(describeNextCupMatch({ scheduledAt: "2026-10-26T11:00:00Z", isHome: true, opponent: "Lhota", cupName: null }, new Date("2026-10-24T22:30:00Z")))
      .toMatch(/^zítra \(pondělí 26\. 10\.\)/);
    // 27. 3. 2027 23:30 v Praze: další den má 23 hodin, „teď + 24 h“ by byl už 29. 3.
    const beforeSpring = new Date("2027-03-27T22:30:00Z");
    expect(describeNextCupMatch({ scheduledAt: "2027-03-28T10:00:00Z", isHome: true, opponent: "Lhota", cupName: null }, beforeSpring))
      .toMatch(/^zítra \(neděle 28\. 3\.\)/);
    expect(describeNextCupMatch({ scheduledAt: "2027-03-29T10:00:00Z", isHome: true, opponent: "Lhota", cupName: null }, beforeSpring))
      .toMatch(/^pondělí 29\. 3\./);
  });

  it("neznámý soupeř dalšího kola", () => {
    expect(describeNextCupMatch({ scheduledAt: "2026-11-28T11:00:00Z", isHome: true, opponent: "", cupName: null }, new Date("2026-11-20T10:00:00Z")))
      .toBe("sobota 28. 11. v poledne, soupeř se teprve rozhodne");
  });

  it("předchozí zápas jen do 4 dnů, ligové časy bez zóny jsou UTC", () => {
    expect(withinPreviousWindow("2026-11-12 17:05:00", "2026-11-14T11:10:00Z")).toBe(true);
    expect(withinPreviousWindow("2026-11-08 17:05:00", "2026-11-14T11:10:00Z")).toBe(false);
    expect(withinPreviousWindow("2026-11-15T11:10:00Z", "2026-11-14 17:00:00")).toBe(false);
  });
});
