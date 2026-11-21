/**
 * Obálka pro sudího nad SQLite (Miniflare): založení po delegaci jen na derby s úplatným sudím,
 * SMS od sudího přes den a jen jednou, zaplacení jen jednou a jen pro jeden zápas, nahlášení
 * (stopka bez komisaře, SMS s důkazem lidskému komisaři), propadnutí a revize účetnictví v okně
 * 60 dní.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Miniflare } from "miniflare";
import { NEUTRAL_REFEREE } from "../engine/referee";
import { windowStart } from "../competition/club-audit";
import { pickEnvelopeTarget, shouldOfferEnvelope } from "./envelope";
import {
  findEnvelopePayments, handleRefereeEnvelopeReply, planRefereeEnvelopes, recordEnvelopeChoice, sanctionEnvelopePayments,
  tickRefereeEnvelopes, withRefereeEnvelope, type EnvelopeRow,
} from "./envelope-db";

let miniflare: Miniflare;
let db: D1Database;

const TODAY = "2026-11-20T16:00:00.000Z";
const KICKOFF = "2026-11-22T17:00:00.000Z";
/** 10:00 v Praze (v listopadu UTC+1). */
const DAYTIME = new Date("2026-11-20T09:00:00.000Z");
/** 2:00 v Praze. */
const NIGHT = new Date("2026-11-20T01:00:00.000Z");

/** Zápasy, kde úplatný sudí (90) na horkém derby obálku opravdu nabídne. */
const offered = Array.from({ length: 200 }, (_, i) => `m-${i}`).filter((id) => shouldOfferEnvelope(id, 90, 80));
const HUMAN_MATCH = offered[0];
const AI_MATCH = offered[1];
const CALM_MATCH = offered[2];
const HONEST_MATCH = offered[3];

const SCHEMA = [
  "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, league_id TEXT, game_date TEXT, budget INTEGER, user_id TEXT, parent_team_id TEXT, team_type TEXT)",
  "CREATE TABLE leagues (id TEXT PRIMARY KEY, name TEXT, level TEXT, district TEXT, league_type TEXT, season_id TEXT, status TEXT)",
  "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER, game_week INTEGER, scheduled_at TEXT, status TEXT)",
  "CREATE TABLE matches (id TEXT PRIMARY KEY, league_id TEXT, calendar_id TEXT, home_team_id TEXT, away_team_id TEXT, status TEXT, referee_id TEXT)",
  `CREATE TABLE referees (id TEXT PRIMARY KEY, district TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, nickname TEXT,
     gender TEXT NOT NULL DEFAULT 'm', archetype TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'active')`,
  `CREATE TABLE fan_rivalries (id TEXT PRIMARY KEY, team_a TEXT, team_b TEXT, heat INTEGER, fights INTEGER DEFAULT 0, incidents INTEGER DEFAULT 0,
     last_game_date TEXT, history TEXT, updated_at TEXT, UNIQUE(team_a, team_b))`,
  `CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, participant_id TEXT, participant_avatar TEXT,
     ai_thread_active INTEGER DEFAULT 0, ai_thread_state TEXT, pinned INTEGER, unread_count INTEGER DEFAULT 0, last_message_text TEXT, last_message_at TEXT, created_at TEXT)`,
  "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT, read INTEGER DEFAULT 0)",
  "CREATE TABLE transactions (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, amount INTEGER, balance_after INTEGER, description TEXT, reference_id TEXT, game_date TEXT, created_at TEXT)",
  `CREATE TABLE competition_referee_suspensions (id TEXT PRIMARY KEY, league_id TEXT NOT NULL, referee_id TEXT NOT NULL, season_number INTEGER NOT NULL,
     from_week INTEGER NOT NULL, until_week INTEGER NOT NULL, reason TEXT NOT NULL DEFAULT '', issued_by_team_id TEXT, game_date TEXT NOT NULL)`,
  "CREATE TABLE competition_referee_bans (id TEXT PRIMARY KEY, league_id TEXT, referee_id TEXT, season_number INTEGER, until_season INTEGER)",
  "CREATE TABLE referee_team_relations (id TEXT PRIMARY KEY, referee_id TEXT, team_id TEXT, sentiment INTEGER DEFAULT 0, duvod TEXT, updated_at TEXT, UNIQUE(referee_id, team_id))",
  "CREATE TABLE competition_governance (league_id TEXT PRIMARY KEY, enabled INTEGER, balance_cache INTEGER DEFAULT 0, balance_synced_at TEXT)",
  "CREATE TABLE competition_officials (id TEXT PRIMARY KEY, league_id TEXT, role TEXT, team_id TEXT, season_number INTEGER, status TEXT)",
  `CREATE TABLE competition_sanctions (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER, team_id TEXT, kind TEXT, amount INTEGER,
     reason TEXT, evidence TEXT, issued_by TEXT, issued_by_team_id TEXT, proposal_id TEXT, status TEXT NOT NULL DEFAULT 'issued',
     appeal_deadline_gd TEXT, game_date TEXT, reference_id TEXT UNIQUE, created_at TEXT)`,
  `CREATE TABLE competition_ledger (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER, type TEXT, amount INTEGER, description TEXT,
     team_id TEXT, game_date TEXT, reference_id TEXT UNIQUE, balance_after INTEGER)`,
];

const env = () => ({ DB: db });

async function envelope(matchId: string): Promise<EnvelopeRow> {
  const row = await db.prepare("SELECT * FROM referee_envelopes WHERE match_id = ?").bind(matchId).first<EnvelopeRow>();
  if (!row) throw new Error(`obálka ${matchId} chybí`);
  return row;
}

async function messagesIn(convId: string): Promise<Array<{ body: string; metadata: string | null; sender_name: string }>> {
  return (await db.prepare("SELECT body, metadata, sender_name FROM messages WHERE conversation_id = ? ORDER BY rowid").bind(convId).all<{ body: string; metadata: string | null; sender_name: string }>()).results;
}

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
  for (const sql of SCHEMA) await db.prepare(sql).run();
  const migration = readFileSync(join(__dirname, "../../migrations/0331_referee_envelopes.sql"), "utf8")
    .replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
  for (const sql of migration) await db.prepare(sql).run();

  const teams = [
    ["t1", "Volary", "u1"], ["t2", "Lhenice", "u2"], ["t3", "Vimperk B", "ai"], ["t4", "Husinec", "ai"],
    ["t5", "Zbytiny", "u5"], ["t6", "Strunkovice", "u6"], ["t7", "Netolice", "u7"], ["t8", "Bavorov", "u8"],
  ];
  const stmts = [
    db.prepare("INSERT INTO leagues VALUES ('l1', 'Okresní přebor', 'okresni_prebor', 'Prachatice', 'senior', 's1', 'active')"),
    db.prepare("INSERT INTO season_calendar VALUES ('c10', 'l1', 3, 10, ?, 'scheduled'), ('c11', 'l1', 3, 11, '2026-11-26T17:00:00.000Z', 'scheduled')").bind(KICKOFF),
    ...teams.map(([id, name, user]) => db.prepare("INSERT INTO teams VALUES (?, ?, 'l1', ?, 50000, ?, NULL, 'senior')").bind(id, name, TODAY, user)),
    db.prepare(`INSERT INTO referees (id, district, first_name, last_name, nickname, gender, archetype, corruptibility) VALUES
      ('ref-baf', 'Prachatice', 'Josef', 'Novák', NULL, 'm', 'bafunar', 90),
      ('ref-amb', 'Prachatice', 'Petr', 'Kos', NULL, 'm', 'ambiciozni', 90),
      ('ref-baf2', 'Prachatice', 'Jana', 'Malá', NULL, 'f', 'bafunar', 90),
      ('ref-pun', 'Prachatice', 'Karel', 'Přesný', NULL, 'm', 'puntickar', NULL)`),
    db.prepare(`INSERT INTO matches VALUES
      (?, 'l1', 'c10', 't1', 't2', 'scheduled', 'ref-baf'),
      (?, 'l1', 'c10', 't3', 't4', 'scheduled', 'ref-amb'),
      (?, 'l1', 'c10', 't5', 't6', 'scheduled', 'ref-baf2'),
      (?, 'l1', 'c10', 't7', 't8', 'scheduled', 'ref-pun'),
      ('m-later', 'l1', 'c11', 't1', 't2', 'scheduled', 'ref-baf')`).bind(HUMAN_MATCH, AI_MATCH, CALM_MATCH, HONEST_MATCH),
    // Horké derby u všech dvojic kromě t5/t6 (vlažná rivalita).
    ...[["t1", "t2", 80], ["t3", "t4", 80], ["t5", "t6", 20], ["t7", "t8", 80]].map(([a, b, heat]) => {
      const [x, y] = String(a) < String(b) ? [a, b] : [b, a];
      return db.prepare("INSERT INTO fan_rivalries (id, team_a, team_b, heat, last_game_date, history) VALUES (?, ?, ?, ?, '2026-11-19', '[]')")
        .bind(`riv-${x}-${y}`, x, y, heat);
    }),
  ];
  // Okresní listina, aby automatická stopka nesrazila počet sudích pod minimum.
  for (let i = 0; i < 20; i++) {
    stmts.push(db.prepare("INSERT INTO referees (id, district, first_name, last_name, archetype) VALUES (?, 'Prachatice', 'Sudí', ?, 'klidny_veteran')").bind(`ref-pool-${i}`, `Číslo${i}`));
  }
  await db.batch(stmts);
});

afterAll(async () => {
  await miniflare.dispose();
});

describe("založení obálky po delegaci", () => {
  it("jen na horké derby s úplatným sudím, opakovaný běh nic nezdvojí", async () => {
    expect(await planRefereeEnvelopes(db, TODAY)).toBe(2);
    expect(await planRefereeEnvelopes(db, TODAY)).toBe(0);
    const rows = (await db.prepare("SELECT match_id, status, amount, reference_id FROM referee_envelopes ORDER BY match_id").all<{ match_id: string; status: string; amount: number; reference_id: string }>()).results;
    expect(rows.map((r) => r.match_id).sort()).toEqual([AI_MATCH, HUMAN_MATCH].sort());
    expect(rows.every((r) => r.status === "planned" && r.amount >= 3000 && r.reference_id.startsWith("envelope-"))).toBe(true);
    const human = await envelope(HUMAN_MATCH);
    expect(human.team_id).toBe(pickEnvelopeTarget(HUMAN_MATCH, { id: "t1", human: true }, { id: "t2", human: true }));
  });
});

describe("SMS od sudího", () => {
  it("v noci nepíše, přes den jednou SMS s tlačítky; AI klub rozhodne pravidlem", async () => {
    const night = await tickRefereeEnvelopes(env(), NIGHT);
    expect(night.sent).toBe(0);
    expect((await envelope(HUMAN_MATCH)).status).toBe("planned");
    expect(night.decided).toBe(1);
    const ai = await envelope(AI_MATCH);
    expect(["paid", "ignored", "reported"]).toContain(ai.status);
    expect(ai.decided_by).toBe("ai_fallback");
    expect(ai.message).toContain("Kč");

    const day = await tickRefereeEnvelopes(env(), DAYTIME);
    expect(day.sent).toBe(1);
    await tickRefereeEnvelopes(env(), DAYTIME);

    const e = await envelope(HUMAN_MATCH);
    expect(e.status).toBe("pending");
    expect(e.conv_id).toBeTruthy();
    const conv = await db.prepare("SELECT participant_id, ai_thread_active, title FROM conversations WHERE id = ?").bind(e.conv_id).first<{ participant_id: string; ai_thread_active: number; title: string }>();
    // Vlákno zůstává neaktivní: aktivní vlákno bez hráče by klubu blokovalo rozhovory od hráčů.
    expect(conv).toEqual({ participant_id: "rf-ref-baf", ai_thread_active: 0, title: "Josef Novák" });
    const msgs = await messagesIn(e.conv_id!);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].body).toBe(e.message);
    expect(JSON.parse(msgs[0].metadata!).options.map((o: { id: string }) => o.id)).toEqual(["pay", "ignore", "report"]);
  });
});

describe("odpověď trenéra", () => {
  it("nejasný text: sudí se zeptá znovu a obálka čeká", async () => {
    const e = await envelope(HUMAN_MATCH);
    await handleRefereeEnvelopeReply(env(), e.conv_id!, e.team_id, "Hmm, uvidíme", null);
    expect((await envelope(HUMAN_MATCH)).status).toBe("pending");
    const msgs = await messagesIn(e.conv_id!);
    expect(msgs.at(-1)?.body).toContain("domluvíme se");
    // Tlačítka nese poslední zpráva sudího, dokud obálka čeká.
    expect(JSON.parse(msgs.at(-1)!.metadata!).options).toHaveLength(3);
  });

  it("zaplacení volným textem strhne peníze jednou, i při opakování", async () => {
    const e = await envelope(HUMAN_MATCH);
    const before = (await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(e.team_id).first<{ budget: number }>())!.budget;
    await handleRefereeEnvelopeReply(env(), e.conv_id!, e.team_id, "Dobře, zaplatím, ať je to v neděli v klidu", null);
    await handleRefereeEnvelopeReply(env(), e.conv_id!, e.team_id, "Dobře, zaplatím", null);
    expect((await recordEnvelopeChoice(env(), e, "pay", "coach")).recorded).toBe(false);

    const paid = await envelope(HUMAN_MATCH);
    expect(paid.status).toBe("paid");
    expect(paid.decided_by).toBe("coach");
    const tx = (await db.prepare("SELECT amount, type, reference_id FROM transactions WHERE team_id = ?").bind(e.team_id).all<{ amount: number; type: string; reference_id: string }>()).results;
    expect(tx).toEqual([{ amount: -e.amount, type: "referee_envelope", reference_id: e.reference_id }]);
    const after = (await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(e.team_id).first<{ budget: number }>())!.budget;
    expect(after).toBe(before - e.amount);
    const msgs = await messagesIn(e.conv_id!);
    expect(msgs.filter((m) => m.body.includes("rozumíme si"))).toHaveLength(1);
    // Po rozhodnutí poslední zpráva tlačítka nenese a další psaní sudí jen odbude.
    expect(msgs.at(-1)?.metadata).toBeNull();
    await handleRefereeEnvelopeReply(env(), e.conv_id!, e.team_id, "A co příště?", null);
    expect((await messagesIn(e.conv_id!)).at(-1)?.body).toContain("Uvidíme se na hřišti");
  });

  it("zaplacení nakloní jen ten jeden zápas a jen u sudího, kterému se platilo", async () => {
    const e = await envelope(HUMAN_MATCH);
    const profile = { ...NEUTRAL_REFEREE, id: "ref-baf" };
    const tilted = await withRefereeEnvelope(db, profile, HUMAN_MATCH, "t1", "t2");
    expect(tilted.envelopeSide).toBe(e.team_id === "t1" ? "home" : "away");
    expect((await withRefereeEnvelope(db, profile, "m-later", "t1", "t2")).envelopeSide).toBeUndefined();
    expect((await withRefereeEnvelope(db, { ...profile, id: "ref-pool-1" }, HUMAN_MATCH, "t1", "t2")).envelopeSide).toBeUndefined();
    expect((await withRefereeEnvelope(db, profile, HONEST_MATCH, "t7", "t8")).envelopeSide).toBeUndefined();
  });
});

describe("nahlášení komisaři", () => {
  async function pendingEnvelope(id: string, matchId: string, teamId: string, refereeId: string): Promise<EnvelopeRow> {
    const convId = `conv-${id}`;
    await db.batch([
      db.prepare(`INSERT INTO matches VALUES (?, 'l1', 'c10', ?, 't8', 'scheduled', ?)`).bind(matchId, teamId, refereeId),
      db.prepare(`INSERT INTO conversations (id, team_id, type, title, participant_id, ai_thread_active) VALUES (?, ?, 'system', 'Sudí', ?, 1)`)
        .bind(convId, teamId, `rf-${refereeId}`),
      db.prepare(`INSERT INTO referee_envelopes (id, referee_id, team_id, match_id, league_id, season_number, game_week, amount, status, reference_id, conv_id, message)
        VALUES (?, ?, ?, ?, 'l1', 3, 10, 4000, 'pending', ?, ?, 'Za 4 000 Kč na guláš bych si dal větší pozor.')`)
        .bind(id, refereeId, teamId, matchId, `envelope-${matchId}`, convId),
    ]);
    return envelope(matchId);
  }

  it("bez komisaře dostane sudí automatickou stopku od dalšího kola", async () => {
    const e = await pendingEnvelope("env-rep1", "m-rep1", "t5", "ref-baf2");
    await handleRefereeEnvelopeReply(env(), e.conv_id!, "t5", "", "report");
    expect((await envelope("m-rep1")).status).toBe("reported");
    const susp = await db.prepare("SELECT from_week, until_week, issued_by_team_id FROM competition_referee_suspensions WHERE referee_id = 'ref-baf2'")
      .first<{ from_week: number; until_week: number; issued_by_team_id: string }>();
    expect(susp).toEqual({ from_week: 11, until_week: 13, issued_by_team_id: "t5" });
    const commission = await db.prepare(
      "SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.team_id = 't5' AND c.title = 'Komise rozhodčích OFS'",
    ).first<{ body: string }>();
    expect(commission?.body).toContain("stopku");
    const ref = await db.prepare("SELECT corruptibility FROM referees WHERE id = 'ref-baf2'").first<{ corruptibility: number }>();
    expect(ref?.corruptibility).toBe(60);
  });

  it("s lidským komisařem dostane komisař SMS s důkazem a stopka nepadne", async () => {
    await db.batch([
      db.prepare("INSERT INTO competition_governance (league_id, enabled) VALUES ('l1', 1)"),
      db.prepare("INSERT INTO competition_officials VALUES ('o1', 'l1', 'rozhodcich', 't7', 3, 'active')"),
    ]);
    const e = await pendingEnvelope("env-rep2", "m-rep2", "t6", "ref-amb");
    await handleRefereeEnvelopeReply(env(), e.conv_id!, "t6", "Tohle jde rovnou komisaři, vy šmejde", null);
    expect((await envelope("m-rep2")).status).toBe("reported");
    expect(await db.prepare("SELECT 1 AS x FROM competition_referee_suspensions WHERE referee_id = 'ref-amb'").first()).toBeNull();
    const toCommissioner = await db.prepare(
      "SELECT m.body, m.metadata FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.team_id = 't7' AND c.title = 'Komise rozhodčích OFS'",
    ).first<{ body: string; metadata: string }>();
    expect(toCommissioner?.body).toContain("guláš");
    expect(toCommissioner?.body).toContain("Strunkovice");
    expect(JSON.parse(toCommissioner!.metadata).href).toBe("/soutez");
  });

  it("zaplatit bez peněz nejde: sudí odepíše a obálka dál čeká", async () => {
    await db.prepare("UPDATE teams SET budget = 1000 WHERE id = 't2'").run();
    const e = await pendingEnvelope("env-poor", "m-poor", "t2", "ref-pool-2");
    await handleRefereeEnvelopeReply(env(), e.conv_id!, "t2", "", "pay");
    expect((await envelope("m-poor")).status).toBe("pending");
    expect(await db.prepare("SELECT 1 AS x FROM transactions WHERE reference_id = 'envelope-m-poor'").first()).toBeNull();
    expect((await messagesIn(e.conv_id!)).at(-1)?.body).toContain("nemáte");
  });
});

describe("AI klub s modelem", () => {
  it("rozhodne podle modelu přes Workers AI a nahlášení dojde lidskému komisaři", async () => {
    await db.batch([
      db.prepare("INSERT INTO matches VALUES ('m-ai2', 'l1', 'c10', 't4', 't8', 'scheduled', 'ref-pool-3')"),
      db.prepare(`INSERT INTO referee_envelopes (id, referee_id, team_id, match_id, league_id, season_number, game_week, amount, status, reference_id)
        VALUES ('env-ai2', 'ref-pool-3', 't4', 'm-ai2', 'l1', 3, 10, 3500, 'planned', 'envelope-m-ai2')`),
    ]);
    const calls: unknown[] = [];
    const ai = { run: async (_model: string, input: unknown) => { calls.push(input); return { response: { choice: "report", reason: "fair play first" } }; } };
    const r = await tickRefereeEnvelopes({ DB: db, AI: ai as unknown as Ai }, NIGHT);
    expect(r.decided).toBe(1);
    expect(calls).toHaveLength(1);
    const e = await envelope("m-ai2");
    expect(e.status).toBe("reported");
    expect(e.decided_by).toBe("ai");
    const toCommissioner = (await db.prepare(
      "SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.team_id = 't7' AND c.title = 'Komise rozhodčích OFS' ORDER BY m.rowid DESC",
    ).first<{ body: string }>())?.body;
    expect(toCommissioner).toContain("Husinec");
    expect(toCommissioner).toContain("3 500 Kč");
  });
});

describe("propadnutí", () => {
  it("neodpovězená obálka propadne při výkopu i v hodinovém běhu po odehrání", async () => {
    await db.batch([
      db.prepare("INSERT INTO matches VALUES ('m-exp1', 'l1', 'c10', 't1', 't8', 'scheduled', 'ref-baf')"),
      db.prepare("INSERT INTO matches VALUES ('m-exp2', 'l1', 'c10', 't2', 't8', 'simulated', 'ref-baf')"),
      db.prepare(`INSERT INTO referee_envelopes (id, referee_id, team_id, match_id, league_id, season_number, game_week, amount, status, reference_id)
        VALUES ('env-exp1', 'ref-baf', 't1', 'm-exp1', 'l1', 3, 10, 3000, 'pending', 'envelope-m-exp1'),
               ('env-exp2', 'ref-baf', 't2', 'm-exp2', 'l1', 3, 10, 3000, 'pending', 'envelope-m-exp2')`),
    ]);
    const profile = await withRefereeEnvelope(db, { ...NEUTRAL_REFEREE, id: "ref-baf" }, "m-exp1", "t1", "t8");
    expect(profile.envelopeSide).toBeUndefined();
    expect((await envelope("m-exp1")).status).toBe("expired");
    const r = await tickRefereeEnvelopes(env(), DAYTIME);
    expect(r.expired).toBe(1);
    expect((await envelope("m-exp2")).status).toBe("expired");
  });
});

describe("revize účetnictví", () => {
  it("najde platbu v okně 60 dní a uloží za ni pokutu jednou; starší platbu nenajde", async () => {
    const audit = "2026-11-20T16:00:00.000Z";
    await db.batch([
      db.prepare("INSERT INTO teams VALUES ('t9', 'Lažiště', 'l1', ?, 60000, 'u9', NULL, 'senior')").bind(audit),
      db.prepare(`INSERT INTO referee_envelopes (id, referee_id, team_id, match_id, league_id, season_number, game_week, amount, status, reference_id)
        VALUES ('env-a1', 'ref-baf', 't9', 'm-a1', 'l1', 3, 8, 5000, 'paid', 'envelope-m-a1'),
               ('env-a2', 'ref-baf', 't9', 'm-a2', 'l1', 3, 2, 6000, 'paid', 'envelope-m-a2')`),
      db.prepare(`INSERT INTO transactions (id, team_id, type, amount, description, reference_id, game_date) VALUES
        ('tx-a1', 't9', 'referee_envelope', -5000, 'Výběr hotovosti bez dokladu', 'envelope-m-a1', '2026-10-21T16:00:00.000Z'),
        ('tx-a2', 't9', 'referee_envelope', -6000, 'Výběr hotovosti bez dokladu', 'envelope-m-a2', '2026-09-11T16:00:00.000Z')`),
    ]);
    const since = windowStart(audit);
    const found = await findEnvelopePayments(db, "t9", since);
    expect(found.map((p) => p.envelopeId)).toEqual(["env-a1"]);
    expect(found[0].refereeName).toBe("Josef Novák");

    const opts = { leagueId: "l1", seasonNumber: 3, targetTeamId: "t9", auditorTeamId: "t7", gameDate: audit, since };
    expect(await sanctionEnvelopePayments(db, opts)).toEqual({ found: 1, issued: 1 });
    expect(await sanctionEnvelopePayments(db, opts)).toEqual({ found: 1, issued: 0 });

    const sanctions = (await db.prepare("SELECT kind, amount, reference_id, issued_by_team_id FROM competition_sanctions WHERE team_id = 't9'").all()).results;
    expect(sanctions).toEqual([{ kind: "bribery", amount: 10000, reference_id: "bribery-env-a1", issued_by_team_id: "t7" }]);
    const fines = (await db.prepare("SELECT amount FROM transactions WHERE team_id = 't9' AND type = 'disciplinary_fine'").all<{ amount: number }>()).results;
    expect(fines).toEqual([{ amount: -10000 }]);
    const env1 = await db.prepare("SELECT sanction_id FROM referee_envelopes WHERE id = 'env-a1'").first<{ sanction_id: string | null }>();
    expect(env1?.sanction_id).toBeTruthy();
  });
});
