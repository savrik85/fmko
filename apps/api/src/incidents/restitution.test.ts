/**
 * Přemluvit pachatele, ať to vrátí nebo zaplatí: kdy kývne a co se pak stane.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { amendsRequestOf, isRestitutionRequest, promisedAmendsOf, recordPromisedAmends, restitutionChance, tryRestitution } from "./restitution";
import { amendsDeliveryChance, resaleValue, settleAmendsTask, type AmendsTaskRow } from "./amends";

describe("žádost a šance", () => {
  it("pozná „vrať to“ a „zaplať škodu“", () => {
    expect(isRestitutionRequest("Vrať ty dresy a nebudu to řešit")).toBe(true);
    expect(isRestitutionRequest("Zaplatíš tu škodu na sprchách")).toBe(true);
    expect(isRestitutionRequest("Nevíš něco o té světlici?")).toBe(false);
  });

  it("pozná opravu brigádou (Turek 11. 10.), ne „opravdu“ ani „uklidni se“", () => {
    expect([...amendsRequestOf("Hospodský. Tak si uděláte brigádu a opravíte to")]).toContain("repair");
    expect([...amendsRequestOf("Není jednodušší to dojít uklidit a opravit?")]).toContain("repair");
    expect([...amendsRequestOf("Vrátíš ty poháry?")]).toEqual(["return"]);
    expect(amendsRequestOf("Opravdu? Tak se uklidni.").size).toBe(0);
  });

  it("žádost o vrácení i jinými slovy (E2E 22. 11.: Procházka „Dáš to klukům zpátky?“)", () => {
    for (const t of [
      "Ptám se znovu. Dáš to klukům zpátky, nebo nic?", "Dáš ty peníze zpátky?", "Radku, vrátíš to?",
      "Přineseš ty poháry zpátky?", "Doneseš to zpátky do klubu?", "Přineseš ty dresy, nebo ne?",
    ]) expect([...amendsRequestOf(t)], t).toContain("return");
    for (const t of ["Přineseš to pivo na grilovačku?", "Dáš si pivo?", "Dáš mi vědět, jestli přijdeš?", "Vrátil ses už z práce?"]) {
      expect(amendsRequestOf(t).has("return"), t).toBe(false);
    }
  });

  it("slib vrácení v odpovědi hráče (věty z E2E 22. 11.)", () => {
    for (const t of [
      "Jasně, dám to zpátky. Kdy to potřebujete?", "Trenére, beru to jako vyřízený. Dám to zpátky, až budete potřebovat.",
      "Jo, vrátím je, trenére.", "Trenére, vrátím to, slibuju. Peníze z tomboly dám zpátky 23. 11.",
      "Jasně že je přinesu zpátky… V pondělí je máš v kabině.",
    ]) expect([...promisedAmendsOf(t)], t).toEqual(["return"]);
    expect([...promisedAmendsOf("Opravíme to s klukama do pondělí, slibuju.")]).toEqual(["repair"]);
    for (const t of [
      "Nic nevrátím.", "Proč bych to vracel?", "Mám to vrátit?", "Vrátím se na trénink v úterý.",
      "Kdybych to měl, vrátím to.", "To jsem nebral, nemám co vracet.",
    ]) expect(promisedAmendsOf(t).size, t).toBe(0);
  });

  it("slib splní spíš ukázněný hráč s dobrým vztahem, brigádu i pracovitý", () => {
    expect(amendsDeliveryChance({ discipline: 90, relationship: 80, workRate: 50 }, "task_return")).toBeGreaterThan(80);
    expect(amendsDeliveryChance({ discipline: 10, relationship: 20, workRate: 50 }, "task_return")).toBeLessThanOrEqual(40);
    expect(amendsDeliveryChance({ discipline: 50, relationship: 50, workRate: 90 }, "task_repair"))
      .toBeGreaterThan(amendsDeliveryChance({ discipline: 50, relationship: 50, workRate: 10 }, "task_repair"));
  });

  it("odhalený, se stopou a s mírností kývne spíš, urážka uškodí", () => {
    const p = { disciplina: 50, temperament: 50, vztahKTrenerovi: 50 };
    const plainChance = restitutionChance(p, { revealed: false, clueOnHim: false, leniency: false, insult: false });
    expect(restitutionChance(p, { revealed: true, clueOnHim: true, leniency: true, insult: false })).toBeGreaterThan(plainChance + 40);
    expect(restitutionChance(p, { revealed: false, clueOnHim: false, leniency: false, insult: true })).toBeLessThan(plainChance);
    expect(restitutionChance({ disciplina: 100, temperament: 0, vztahKTrenerovi: 100 }, { revealed: true, clueOnHim: true, leniency: true, insult: false })).toBe(90);
  });
});

let mf: Miniflare;
let db: D1Database;

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await mf.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE club_incidents (id TEXT PRIMARY KEY, team_id TEXT, kind TEXT, category TEXT, status TEXT, loss TEXT, culprit_type TEXT, culprit_player_id TEXT, culprit_revealed INTEGER, resolution TEXT, resolution_data TEXT, resolved_on TEXT, game_date TEXT, recovered INTEGER NOT NULL DEFAULT 0)",
    "CREATE TABLE club_incident_knowledge (incident_id TEXT, player_id TEXT, team_id TEXT, role TEXT, fact TEXT, willingness INTEGER, interrogation TEXT, interrogated_on TEXT, tactics TEXT)",
    "CREATE TABLE club_incident_clues (id TEXT PRIMARY KEY, incident_id TEXT, source TEXT, points_to_player_id TEXT, suspects TEXT, holder_player_id TEXT, strength REAL, police_bonus REAL, text TEXT, found INTEGER, found_on TEXT)",
    "CREATE TABLE teams (id TEXT PRIMARY KEY, budget INTEGER, user_id TEXT, game_date TEXT)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, personality TEXT, life_context TEXT, coach_relationship INTEGER, weekly_wage INTEGER, age INTEGER, status TEXT)",
    "CREATE TABLE equipment (team_id TEXT, balls INTEGER, balls_condition INTEGER, trophy_case INTEGER, trophy_case_condition INTEGER)",
    "CREATE TABLE coach_commitments (id TEXT PRIMARY KEY, team_id TEXT, player_id TEXT, conversation_id TEXT, kind TEXT, status TEXT, made_at TEXT, due_at TEXT, resolved_at TEXT, quote TEXT, details TEXT, last_reminder_key TEXT)",
    "CREATE TABLE stadium_damage (id TEXT PRIMARY KEY, team_id TEXT, facility TEXT, levels INTEGER, repair_cost INTEGER, popis TEXT, game_date TEXT, repaired_at TEXT)",
    "CREATE TABLE stadiums (team_id TEXT, showers INTEGER, pitch_condition INTEGER)",
    "CREATE TABLE transactions (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, amount INTEGER, balance_after INTEGER, description TEXT, reference_id TEXT, game_date TEXT)",
    "CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, participant_id TEXT, participant_avatar TEXT, last_message_text TEXT, last_message_at TEXT, unread_count INTEGER DEFAULT 0, pinned INTEGER DEFAULT 0, created_at TEXT)",
    "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT, read INTEGER DEFAULT 0)",
    "CREATE TABLE relationships (id TEXT, player_a_id TEXT, player_b_id TEXT, type TEXT, strength INTEGER)",
  ]) await db.prepare(sql).run();
}, 30_000);

afterAll(async () => { await mf.dispose(); });

beforeEach(async () => {
  for (const t of ["club_incidents", "club_incident_knowledge", "club_incident_clues", "teams", "players", "equipment", "transactions", "messages", "conversations", "coach_commitments", "stadium_damage", "stadiums"]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  await db.batch([
    db.prepare("INSERT INTO teams VALUES ('tym', 1000, 'u1', '2026-11-12T16:00:00.000Z')"),
    // Hodný a poslušný kluk: přemluvit ho jde skoro jistě.
    db.prepare("INSERT INTO players VALUES ('p', 'tym', 'Pepa', 'Průšvih', ?, '{}', 100, 400, 22, 'active')")
      .bind(JSON.stringify({ discipline: 100, temper: 0, workRate: 100 })),
    db.prepare("INSERT INTO players VALUES ('n', 'tym', 'Nevinný', 'Hráč', '{}', '{}', 50, 300, 25, 'active')"),
    db.prepare("INSERT INTO equipment VALUES ('tym', 1, 40, 1, 60)"),
    db.prepare("INSERT INTO stadiums VALUES ('tym', 1, 70)"),
  ]);
});

const incident = (o: { category: string; loss: unknown[]; revealed?: number }) => db.batch([
  db.prepare(`INSERT INTO club_incidents (id, team_id, kind, category, status, loss, culprit_type, culprit_player_id, culprit_revealed, resolution, resolution_data, resolved_on, game_date)
    VALUES ('inc', 'tym', 'kradez_balonu', ?, 'otevreny', ?, 'hrac', 'p', ?, NULL, NULL, NULL, '2026-11-10')`)
    .bind(o.category, JSON.stringify(o.loss), o.revealed ?? 1),
  db.prepare("INSERT INTO club_incident_knowledge VALUES ('inc', 'p', 'tym', 'pachatel', 'Vzal jsi balony.', 0, NULL, NULL, NULL)"),
]);

describe("přemluvení pachatele", () => {
  it("krádež: vrátí balony i hotovost, přizná se a incident je vyřešený", async () => {
    await incident({ category: "kradez", loss: [{ typ: "vybaveni", kategorie: "balls", uroven: 3, urovniDolu: 2, stav: 80 }, { typ: "penize", castka: 700 }] });
    expect(await tryRestitution(db, { teamId: "tym", playerId: "p", text: "Pepo, vrať ty balony a nebudu to řešit.", gameDate: "2026-11-12" }))
      .toEqual({ outcome: "returned", amount: 700 });
    expect(await db.prepare("SELECT balls, balls_condition FROM equipment").first()).toEqual({ balls: 3, balls_condition: 80 });
    expect(await db.prepare("SELECT status, resolution FROM club_incidents").first()).toEqual({ status: "uzavreny", resolution: "vratil" });
    expect((await db.prepare("SELECT budget FROM teams").first<{ budget: number }>())?.budget).toBe(1700);
    const k = await db.prepare("SELECT interrogation, fact FROM club_incident_knowledge").first<{ interrogation: string; fact: string }>();
    expect(k?.interrogation).toBe("priznal");
    expect(k?.fact).toContain("všechno vrátil");
    expect((await db.prepare("SELECT body FROM messages").first<{ body: string }>())?.body).toMatch(/^✋ Pepa Průšvih se přiznal/);
    // Podruhé už nic.
    expect(await tryRestitution(db, { teamId: "tym", playerId: "p", text: "vrať to", gameDate: "2026-11-12" })).toBeNull();
  });

  it("poškození: zaplatí škodu ze svého, nejvýš čtyři týdenní odměny", async () => {
    await incident({ category: "poskozeni", loss: [{ typ: "stadion", zarizeni: "sprchy", urovni: 1, cena: 5000 }] });
    expect(await tryRestitution(db, { teamId: "tym", playerId: "p", text: "Zaplatíš tu škodu na sprchách.", gameDate: "2026-11-12" }))
      .toEqual({ outcome: "paid", amount: 1600 });
    expect(await db.prepare("SELECT resolution FROM club_incidents").first()).toEqual({ resolution: "nahradil" });
  });

  it("nevinného se to netýká a obyčejná zpráva nic nespustí", async () => {
    await incident({ category: "kradez", loss: [{ typ: "penize", castka: 700 }] });
    expect(await tryRestitution(db, { teamId: "tym", playerId: "n", text: "Vrať to!", gameDate: "2026-11-12" })).toBeNull();
    expect(await tryRestitution(db, { teamId: "tym", playerId: "p", text: "Jak se máš?", gameDate: "2026-11-12" })).toBeNull();
    expect(await db.prepare("SELECT status FROM club_incidents").first()).toEqual({ status: "otevreny" });
  });
});

const closedTheft = (culprit = "p") => db.batch([
  // Turek: poháry z vitríny, srážka 23. 10., lup zůstal u něj.
  db.prepare(`INSERT INTO club_incidents (id, team_id, kind, category, status, loss, culprit_type, culprit_player_id, culprit_revealed, resolution, resolution_data, resolved_on, game_date, recovered)
    VALUES ('vit', 'tym', 'vitrina', 'kradez', 'uzavreny', ?, 'hrac', ?, 1, 'srazka', '{"celkem":776,"tydnuZbyva":4}', '2026-11-11T16:00:00.000Z', '2026-11-11T16:00:00.000Z', 0)`)
    .bind(JSON.stringify([{ typ: "vybaveni", kategorie: "trophy_case", uroven: 2, stav: 80, urovniDolu: 1 }]), culprit),
  db.prepare("INSERT INTO club_incident_knowledge VALUES ('vit', ?, 'tym', 'pachatel', 'Vybral jsi vitrínu s poháry.', 0, NULL, NULL, NULL)").bind(culprit),
]);
const task = async (kind: string) => db.prepare(
  `SELECT cc.id, cc.team_id, cc.player_id, cc.kind, cc.details, p.first_name, p.last_name, NULL AS nickname, NULL AS avatar, t.user_id AS club_user_id
     FROM coach_commitments cc JOIN players p ON p.id = cc.player_id JOIN teams t ON t.id = cc.team_id WHERE cc.kind = ?`,
).bind(kind).first<AmendsTaskRow>();

describe("vrácení po uzavřeném incidentu (Turek a poháry, 23.–24. 10.)", () => {
  it("„Vrátíš ty poháry?“: hráč slíbí, vznikne úkol s lhůtou a do promptu jde, co slíbil", async () => {
    await closedTheft();
    expect(await tryRestitution(db, { teamId: "tym", playerId: "p", text: "Vrátíš ty poháry?", gameDate: "2026-11-12T16:00:00.000Z" }))
      .toEqual({ outcome: "promised", task: "task_return", dueOn: "2026-11-14" });
    const t = await task("task_return");
    expect(JSON.parse(t!.details!)).toEqual({ incidentId: "vit", dueOn: "2026-11-14" });
    expect((await db.prepare("SELECT fact FROM club_incident_knowledge").first<{ fact: string }>())?.fact).toContain("vrátíš nejpozději v sobotu 14. 11.");
    // Sedláček (STS Čkyně, E2E 22. 11.): „…nejpozději v pondělí 23. 11..“ s dvojitou tečkou.
    expect((await db.prepare("SELECT fact FROM club_incident_knowledge").first<{ fact: string }>())?.fact).not.toContain("14. 11..");
    // Trest platí dál, vrátí se až po lhůtě.
    expect(await db.prepare("SELECT resolution, recovered FROM club_incidents").first()).toEqual({ resolution: "srazka", recovered: 0 });
    expect(await db.prepare("SELECT trophy_case FROM equipment").first()).toEqual({ trophy_case: 1 });
  });

  it("po lhůtě poháry opravdu vrátí: vitrína zpátky, lup v klubu, hráč i kustod napíšou", async () => {
    await closedTheft();
    await tryRestitution(db, { teamId: "tym", playerId: "p", text: "Vrátíš ty poháry?", gameDate: "2026-11-12T16:00:00.000Z" });
    expect(await settleAmendsTask(db, (await task("task_return"))!, new Date("2026-11-14T10:00:00Z"))).toBe("kept");
    expect(await db.prepare("SELECT trophy_case, trophy_case_condition FROM equipment").first()).toEqual({ trophy_case: 2, trophy_case_condition: 80 });
    expect(await db.prepare("SELECT recovered, resolution FROM club_incidents").first()).toEqual({ recovered: 1, resolution: "srazka" });
    const bodies = (await db.prepare("SELECT sender_type, body FROM messages ORDER BY rowid").all<{ sender_type: string; body: string }>()).results;
    expect(bodies.find((m) => m.sender_type === "player")?.body).toContain("poháry z vitríny");
    expect(bodies.find((m) => m.sender_type === "system")?.body).toMatch(/^✋ Pepa Průšvih vrátil, co vzal/);
    expect((await db.prepare("SELECT status FROM coach_commitments").first<{ status: string }>())?.status).toBe("kept");
    expect((await db.prepare("SELECT fact FROM club_incident_knowledge").first<{ fact: string }>())?.fact).toContain("opravdu vrátil");
    // Úkol už je vyřízený.
    expect(await settleAmendsTask(db, (await task("task_return"))!, new Date("2026-11-15T10:00:00Z"))).toBeNull();
  });

  it("neukázněný hráč slib nesplní: výmluva, vitrína prázdná, v promptu ví, že to nevrátil", async () => {
    // Radek Lajdák: kývne díky odhalení a mírnosti (šance 58 %), ale splní jen s šancí 30 %.
    await db.prepare("INSERT INTO players VALUES ('r', 'tym', 'Radek', 'Lajdák', ?, '{}', 0, 300, 27, 'active')")
      .bind(JSON.stringify({ discipline: 0, temper: 0 })).run();
    await closedTheft("r");
    expect(await tryRestitution(db, { teamId: "tym", playerId: "r", text: "Vrať ty poháry a nebudu to řešit.", gameDate: "2026-11-12T16:00:00.000Z" }))
      .toMatchObject({ outcome: "promised", task: "task_return" });
    expect(await settleAmendsTask(db, (await task("task_return"))!, new Date("2026-11-14T10:00:00Z"))).toBe("broken");
    expect(await db.prepare("SELECT trophy_case FROM equipment").first()).toEqual({ trophy_case: 1 });
    expect(await db.prepare("SELECT recovered FROM club_incidents").first()).toEqual({ recovered: 0 });
    expect((await db.prepare("SELECT body FROM messages WHERE sender_type = 'player'").first<{ body: string }>())?.body)
      .toMatch(/nevrátil|nestihl|nezvládl|nevyšlo|není zpátky|doma/i);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE sender_type = 'system'").first()).toEqual({ n: 0 });
    expect((await db.prepare("SELECT fact FROM club_incident_knowledge").first<{ fact: string }>())?.fact).toContain("nevrátil jsi to");
  });

  it("odmítne: v promptu ví, že odmítl, a nic nevznikne", async () => {
    await db.prepare("UPDATE players SET personality = ?, coach_relationship = 0 WHERE id = 'p'").bind(JSON.stringify({ discipline: 0, temper: 100 })).run();
    await closedTheft();
    expect(await tryRestitution(db, { teamId: "tym", playerId: "p", text: "Vrať ty poháry, ty zloději!", gameDate: "2026-11-12T16:00:00.000Z" }))
      .toEqual({ outcome: "refused" });
    expect(await task("task_return")).toBeNull();
    expect((await db.prepare("SELECT fact FROM club_incident_knowledge").first<{ fact: string }>())?.fact).toContain("Odmítl jsi to");
  });

  it("Procházka (E2E 22. 11.): na „Je to pro tebe vyřízený?“ sám napsal „Dám to zpátky“: slib se zapíše a má lhůtu", async () => {
    await closedTheft();
    expect(await tryRestitution(db, { teamId: "tym", playerId: "p", text: "Tome, jak to teď bereš? Je to pro tebe vyřízený?", gameDate: "2026-11-12T16:00:00.000Z" })).toBeNull();
    expect(await recordPromisedAmends(db, { teamId: "tym", playerId: "p", reply: "Trenére, beru to jako vyřízený. Dám to zpátky, až budete potřebovat.", now: new Date("2026-11-12T12:00:00Z") }))
      .toEqual({ task: "task_return", dueOn: "2026-11-14", willFail: false });
    expect((await db.prepare("SELECT fact FROM club_incident_knowledge").first<{ fact: string }>())?.fact).toContain("Sám jsi trenérovi slíbil, že to vrátíš nejpozději v sobotu 14. 11.");
    expect(await settleAmendsTask(db, (await task("task_return"))!, new Date("2026-11-14T10:00:00Z"))).toBe("kept");
    expect(await db.prepare("SELECT trophy_case FROM equipment").first()).toEqual({ trophy_case: 2 });
  });

  it("slib bez provaleného průšvihu nebo bez čeho vracet nic nezapíše", async () => {
    await closedTheft("n");
    await db.prepare("UPDATE club_incidents SET culprit_revealed = 0").run();
    expect(await recordPromisedAmends(db, { teamId: "tym", playerId: "n", reply: "Jo, vrátím to.", now: new Date("2026-11-12T12:00:00Z") })).toBeNull();
    expect(await recordPromisedAmends(db, { teamId: "tym", playerId: "p", reply: "Jo, vrátím to.", now: new Date("2026-11-12T12:00:00Z") })).toBeNull();
    expect(await task("task_return")).toBeNull();
  });

  it("starší, než si pachatel průšvih pamatuje (60 dní), nebo už vrácené: nic", async () => {
    await closedTheft();
    await db.prepare("UPDATE club_incidents SET resolved_on = '2026-09-10T16:00:00.000Z'").run();
    expect(await tryRestitution(db, { teamId: "tym", playerId: "p", text: "Vrať ty poháry.", gameDate: "2026-11-12T16:00:00.000Z" })).toBeNull();
    await db.prepare("UPDATE club_incidents SET resolved_on = '2026-11-11T16:00:00.000Z', recovered = 1").run();
    expect(await tryRestitution(db, { teamId: "tym", playerId: "p", text: "Vrať ty poháry.", gameDate: "2026-11-12T16:00:00.000Z" })).toBeNull();
  });
});

describe("Turek a poháry podle kopie produ 22. 11. (C3a)", () => {
  // Fezko Výškovice: vitrína ukradená 22. 10., srážka 23. 10., klub vitrínu 24. 10. dokoupil
  // na úroveň 2. Turek: disciplína 17, vztah 1, los přemluvení 98,34 (strop šance 90).
  const TEAM = "56efc60a-962a-4581-bd6e-9986bdc34f8f";
  const TUREK = "f9df01f5-18d6-4cd2-a701-671eafcc6ac1";
  const INC = `inc-${TEAM}-vitrina-2026-10-22-hrozi-${TUREK}`;
  const LOSS = [{ typ: "vybaveni", kategorie: "trophy_case", uroven: 2, stav: 86, urovniDolu: 1 }];
  const turekTask = () => db.prepare(
    `SELECT cc.id, cc.team_id, cc.player_id, cc.kind, cc.details, p.first_name, p.last_name, NULL AS nickname, NULL AS avatar, t.user_id AS club_user_id
       FROM coach_commitments cc JOIN players p ON p.id = cc.player_id JOIN teams t ON t.id = cc.team_id WHERE cc.player_id = ?`,
  ).bind(TUREK).first<AmendsTaskRow>();
  const fact = async () => (await db.prepare("SELECT fact FROM club_incident_knowledge WHERE player_id = ?").bind(TUREK).first<{ fact: string }>())?.fact ?? "";

  beforeEach(async () => {
    await db.batch([
      db.prepare("INSERT INTO teams VALUES (?, 30000, 'u-fezko', '2026-11-21T16:00:00.000Z')").bind(TEAM),
      db.prepare("INSERT INTO players VALUES (?, ?, 'Radek', 'Turek', ?, '{}', 1, 198, 27, 'active')")
        .bind(TUREK, TEAM, JSON.stringify({ discipline: 17, temper: 24 })),
      db.prepare("INSERT INTO equipment VALUES (?, 0, 0, 2, 85)").bind(TEAM),
      db.prepare(`INSERT INTO club_incidents (id, team_id, kind, category, status, loss, culprit_type, culprit_player_id, culprit_revealed, resolution, resolution_data, resolved_on, game_date, recovered)
        VALUES (?, ?, 'vitrina', 'kradez', 'uzavreny', ?, 'hrac', ?, 1, 'srazka', '{}', '2026-10-23T16:00:00.000Z', '2026-10-23T16:00:00.000Z', 0)`)
        .bind(INC, TEAM, JSON.stringify(LOSS), TUREK),
      db.prepare("INSERT INTO club_incident_knowledge VALUES (?, ?, ?, 'pachatel', 'Tohle jsi udělal ty: Poháry z vitríny.', 0, NULL, NULL, NULL)").bind(INC, TUREK, TEAM),
    ]);
  });

  it("klub vitrínu dokoupil: žádost o vrácení má smysl dál, Turek podle losu odmítne", async () => {
    expect(await tryRestitution(db, { teamId: TEAM, playerId: TUREK, text: "Radku, ještě k vitríně. Vrátíš ty poháry?", gameDate: "2026-11-21T16:00:00.000Z" }))
      .toEqual({ outcome: "refused" });
    expect(await fact()).toContain("Odmítl jsi to");
  });

  it("„Jo, vrátím je, trenére.“ po odmítnutí: zapsaný slib, který v termínu nesplní (výmluva, škoda trvá)", async () => {
    await tryRestitution(db, { teamId: TEAM, playerId: TUREK, text: "Vrátíš ty poháry?", gameDate: "2026-11-21T16:00:00.000Z" });
    expect(await recordPromisedAmends(db, { teamId: TEAM, playerId: TUREK, reply: "Jo, vrátím je, trenére.", now: new Date("2026-11-22T11:31:00Z") }))
      .toEqual({ task: "task_return", dueOn: "2026-11-23", willFail: true });
    expect(await fact()).toContain("Sám jsi trenérovi slíbil, že to vrátíš nejpozději v pondělí 23. 11.");
    expect(await fact()).not.toContain("23. 11..");
    expect(await settleAmendsTask(db, (await turekTask())!, new Date("2026-11-24T10:00:00Z"))).toBe("broken");
    expect(await db.prepare("SELECT recovered FROM club_incidents").first()).toEqual({ recovered: 0 });
    expect((await db.prepare("SELECT body FROM messages WHERE sender_type = 'player'").first<{ body: string }>())?.body)
      .toMatch(/nevrátil|nestihl|nezvládl|nevyšlo|není zpátky|doma/i);
    expect(await fact()).toContain("nevrátil jsi to");
    // Druhý slib k témuž incidentu už nic nezapíše.
    expect(await recordPromisedAmends(db, { teamId: TEAM, playerId: TUREK, reply: "Vrátím je, slibuju.", now: new Date("2026-11-24T11:00:00Z") })).toBeNull();
  });

  it("kdo kývne a poháry vrátí, když klub už má novou vitrínu: vrácené jde do zastavárny, peníze do kasy", async () => {
    // Stejný incident, ale pachatel poslušný kluk (Turek by podle losu odmítl vždycky).
    await db.batch([
      db.prepare("INSERT INTO players VALUES ('hodny', ?, 'Pepa', 'Hodný', ?, '{}', 90, 300, 22, 'active')").bind(TEAM, JSON.stringify({ discipline: 100, temper: 0, workRate: 100 })),
      db.prepare("UPDATE club_incidents SET culprit_player_id = 'hodny'"),
      db.prepare("UPDATE club_incident_knowledge SET player_id = 'hodny'"),
    ]);
    expect(await tryRestitution(db, { teamId: TEAM, playerId: "hodny", text: "Vrať ty poháry a nebudu to řešit.", gameDate: "2026-11-21T16:00:00.000Z" }))
      .toMatchObject({ outcome: "promised", task: "task_return" });
    const row = await db.prepare(
      `SELECT cc.id, cc.team_id, cc.player_id, cc.kind, cc.details, p.first_name, p.last_name, NULL AS nickname, NULL AS avatar, t.user_id AS club_user_id
         FROM coach_commitments cc JOIN players p ON p.id = cc.player_id JOIN teams t ON t.id = cc.team_id WHERE cc.player_id = 'hodny'`,
    ).first<AmendsTaskRow>();
    expect(await settleAmendsTask(db, row!, new Date("2026-11-24T10:00:00Z"))).toBe("kept");
    const resold = resaleValue(LOSS[0] as never);
    expect(resold).toBeGreaterThan(0);
    expect((await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(TEAM).first<{ budget: number }>())?.budget).toBe(30000 + resold);
    expect(await db.prepare("SELECT trophy_case FROM equipment WHERE team_id = ?").bind(TEAM).first()).toEqual({ trophy_case: 2 });
    expect(await db.prepare("SELECT recovered FROM club_incidents").first()).toEqual({ recovered: 1 });
    const kustod = (await db.prepare("SELECT body FROM messages WHERE sender_type = 'system'").first<{ body: string }>())?.body;
    expect(kustod).toContain("poháry z vitríny");
    expect(kustod).toContain("prodal do zastavárny");
  });
});

describe("oprava brigádou (Turek a sprchy, 11. 10.)", () => {
  const brokenShowers = (status = "otevreny", revealed = 0) => db.batch([
    db.prepare("INSERT INTO stadium_damage VALUES ('dmg', 'tym', 'showers', 1, 5000, 'oslava', '2026-11-10', NULL)"),
    db.prepare(`INSERT INTO club_incidents (id, team_id, kind, category, status, loss, culprit_type, culprit_player_id, culprit_revealed, resolution, resolved_on, game_date)
      VALUES ('osl', 'tym', 'oslava_v_kabine', 'poskozeni', ?, ?, 'hrac', 'p', ?, ?, ?, '2026-11-10T16:00:00.000Z')`)
      .bind(status, JSON.stringify([{ typ: "stadion", zarizeni: "showers", urovni: 1, damageId: "dmg", cena: 5000 }]), revealed,
        status === "uzavreny" ? "pokuta" : null, status === "uzavreny" ? "2026-11-11T16:00:00.000Z" : null),
    db.prepare("INSERT INTO club_incident_knowledge VALUES ('osl', 'p', 'tym', 'pachatel', 'Rozbil jsi sprchy.', 0, NULL, NULL, NULL)"),
  ]);

  it("„uděláte brigádu a opravíte to“: slíbí opravu, přizná se, po lhůtě je opraveno a je unavený", async () => {
    await brokenShowers();
    expect(await tryRestitution(db, { teamId: "tym", playerId: "p", text: "Tak si uděláte brigádu a opravíte to", gameDate: "2026-11-12T16:00:00.000Z" }))
      .toMatchObject({ outcome: "promised", task: "task_repair" });
    expect(await db.prepare("SELECT culprit_revealed, status FROM club_incidents").first()).toEqual({ culprit_revealed: 1, status: "otevreny" });
    expect((await db.prepare("SELECT interrogation FROM club_incident_knowledge").first<{ interrogation: string }>())?.interrogation).toBe("priznal");
    expect(await settleAmendsTask(db, (await task("task_repair"))!, new Date("2026-11-14T10:00:00Z"))).toBe("kept");
    expect((await db.prepare("SELECT repaired_at FROM stadium_damage").first<{ repaired_at: string | null }>())?.repaired_at).not.toBeNull();
    expect(await db.prepare("SELECT showers FROM stadiums").first()).toEqual({ showers: 2 });
    expect(await db.prepare("SELECT status, resolution FROM club_incidents").first()).toEqual({ status: "uzavreny", resolution: "opravil" });
    expect(JSON.parse((await db.prepare("SELECT life_context FROM players WHERE id = 'p'").first<{ life_context: string }>())!.life_context).condition).toBe(90);
    expect((await db.prepare("SELECT body FROM messages WHERE sender_type = 'system'").first<{ body: string }>())?.body).toMatch(/^🔧 Pepa Průšvih s brigádou opravil/);
  });

  it("po pokutě jde opravit taky: incident zůstane uzavřený pokutou, škoda zmizí", async () => {
    await brokenShowers("uzavreny", 1);
    expect(await tryRestitution(db, { teamId: "tym", playerId: "p", text: "Opravíš ty sprchy?", gameDate: "2026-11-12T16:00:00.000Z" }))
      .toMatchObject({ outcome: "promised", task: "task_repair" });
    expect(await settleAmendsTask(db, (await task("task_repair"))!, new Date("2026-11-14T10:00:00Z"))).toBe("kept");
    expect(await db.prepare("SELECT status, resolution FROM club_incidents").first()).toEqual({ status: "uzavreny", resolution: "pokuta" });
  });

  it("když už je opraveno, „oprav to“ u otevřeného incidentu znamená zaplatit jako dřív", async () => {
    await brokenShowers();
    await db.prepare("UPDATE stadium_damage SET repaired_at = '2026-11-11'").run();
    expect(await tryRestitution(db, { teamId: "tym", playerId: "p", text: "Oprav to.", gameDate: "2026-11-12T16:00:00.000Z" }))
      .toMatchObject({ outcome: "paid" });
  });
});
