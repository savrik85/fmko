/**
 * Pachatel průšvihu z minulé sezóny po odmítnutí nápravy čin nezapírá. Data podle kopie produ
 * 22. 11. (Kohoutek, AC ČEZ Klamovka) nad D1 se všemi migracemi.
 *
 * E2E 22. 11. (final3 Chyba 1): Kohoutek vykradl sklad 15. 10. (sezóna 2), odhalený, lup
 * u sebe. Náprava incident našla (60 dní od uzavření, bez ohledu na sezónu), hra rozhodla
 * „odmítl“, ale znalosti do promptu braly jen sezónu 3. Model znal jen cizí nevyřešené vloupání
 * („Kdo to byl, se v klubu neví“) a 0 ze 3 pokusů: „nic nevím o žádnym vykradenym skladu, asi
 * to bude nějakej omyl, proč bych měl něco vracet?“.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { amendsDecisionFromLife, amendsDecisionLine } from "./amends-decision";
import { tryRestitution } from "./restitution";
import { blokZnalosti, deniesOffence } from "./znalosti";
import { nactiZnalostiHrace } from "./znalosti-db";

const TEAM = "63b61977-542a-46db-9949-788a97582ee7";
const KOHOUTEK = "1bd6c1cb-a0be-4f6b-9855-b1b2a6aa7610";
const OWN = `inc-${TEAM}-vloupani_sklad-2026-10-14-hrozi-${KOHOUTEK}`;
const OTHER = `inc-${TEAM}-vloupani_sklad-2026-11-19`;
const STALE_SQUAD = `inc-${TEAM}-kasa_obcerstveni-2026-09-22`;
/** Herní neděle 29. 11. z E2E (offset 7). */
const GAME_DATE = "2026-11-29T16:00:00.000Z";
/** První výzva z E2E. „Zloději“ je urážka: šance 37 %, los 53, odmítl (log r8 18:47:06). */
const COACH = "Marku, ty zloději, vím, žes vykradl sklad. Ty věci vrátíš, rozumíš?";

let mf: Miniflare;
let db: D1Database;

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await mf.getD1Database("DB");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  }
}, 120_000);

afterAll(async () => { await mf.dispose(); });

beforeEach(async () => {
  for (const t of ["club_incident_knowledge", "club_incident_clues", "club_incidents", "coach_commitments", "messages", "conversations", "equipment", "players", "teams", "seasons", "users"]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('user-klamovka', 'klamovka@example.test', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('s2', 2, 'finished')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('s3', 3, 'active')"),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, game_date) VALUES (?, 'user-klamovka', 'p06', 'AC ČEZ Klamovka', 30000, ?)")
      .bind(TEAM, GAME_DATE),
    db.prepare(
      `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, status, coach_relationship, weekly_wage)
       VALUES (?, ?, 'Marek', 'Kohoutek', 29, 'MID', 40, '{}', '{}', ?, '{}', '{}', 'active', 47, 274)`,
    ).bind(KOHOUTEK, TEAM, JSON.stringify({
      discipline: 29, patriotism: 62, alcohol: 94, temper: 64, leadership: 64, workRate: 52, aggression: 53, consistency: 28, clutch: 69,
    })),
    db.prepare("INSERT INTO conversations (id, team_id, type, title, participant_id) VALUES ('conv-kohoutek', ?, 'player', 'Marek Kohoutek', ?)").bind(TEAM, KOHOUTEK),
    // Klub tréninkové pomůcky dokoupil zpátky na úroveň 3: vrátit je pořád jde (prodá je).
    db.prepare("INSERT INTO equipment (id, team_id, training_cones) VALUES ('eq-klamovka', ?, 3)").bind(TEAM),
    // Sezóna 2: vykradl sklad, chlubil se tím v hospodě, odhalený, uzavřeno koncem sezóny, lup u něj.
    db.prepare(
      `INSERT INTO club_incidents (id, team_id, season_number, kind, category, status, severity, game_date, culprit_type, culprit_player_id,
         culprit_revealed, loss, resolution, resolved_on, recovered, text, created_at)
       VALUES (?, ?, 2, 'vloupani_sklad', 'kradez', 'uzavreny', 2, '2026-10-15T16:00:00.000Z', 'hrac', ?, 1, ?, 'konec_sezony',
         '2026-10-22T16:00:00.000Z', 0, 'Řeči z hospody se naplnily.', '2026-10-14T03:07:22Z')`,
    ).bind(OWN, TEAM, KOHOUTEK, JSON.stringify([{ typ: "vybaveni", kategorie: "training_cones", uroven: 3, stav: 86, urovniDolu: 3 }])),
    db.prepare(
      `INSERT INTO club_incident_clues (id, incident_id, team_id, source, points_to_player_id, strength, police_bonus, text, found, found_on)
       VALUES (?, ?, ?, 'hospoda', ?, 3, 0, 'Marek Kohoutek se tím v hospodě chlubil ještě předtím, než to udělal.', 1, '2026-10-15T16:00:00.000Z')`,
    ).bind(`${OWN}-hospoda-ohlasil`, OWN, TEAM, KOHOUTEK),
    db.prepare(
      `INSERT INTO club_incident_knowledge (incident_id, player_id, team_id, role, fact, willingness, until, season_number)
       VALUES (?, ?, ?, 'pachatel', 'Tohle jsi udělal ty: Vloupání do skladu.', 0, '2026-12-14T16:00:00.000Z', 2)`,
    ).bind(OWN, KOHOUTEK, TEAM),
    db.prepare(
      `INSERT INTO club_incident_knowledge (incident_id, player_id, team_id, role, fact, willingness, until, season_number)
       VALUES (?, ?, ?, 'kadr', 'Řeči z hospody se naplnily, Marek Kohoutek to opravdu udělal. Ráno chybělo ve skladu vybavení: Tréninkové pomůcky. Po vloupání nejsou žádné stopy.', 50, '2026-10-29T16:00:00.000Z', 2)`,
    ).bind(OWN, KOHOUTEK, TEAM),
    // Sezóna 3: cizí vloupání, které v promptu jako jediné bylo.
    db.prepare(
      `INSERT INTO club_incidents (id, team_id, season_number, kind, category, status, severity, game_date, culprit_type, culprit_revealed, loss, text)
       VALUES (?, ?, 3, 'vloupani_sklad', 'kradez', 'otevreny', 2, '2026-11-19T16:00:00.000Z', 'cizi', 0, ?, 'Vloupání.')`,
    ).bind(OTHER, TEAM, JSON.stringify([{ typ: "vybaveni", kategorie: "first_aid", uroven: 2, stav: 70, urovniDolu: 1 }])),
    db.prepare(
      `INSERT INTO club_incident_knowledge (incident_id, player_id, team_id, role, fact, willingness, until, season_number)
       VALUES (?, ?, ?, 'kadr', 'Někdo se v noci vloupal do skladu. Pryč je vybavení: Brankářské vybavení.', 50, '2026-12-03T16:00:00.000Z', 3)`,
    ).bind(OTHER, KOHOUTEK, TEAM),
    // Sezóna 2, cizí průšvih, který kádr zná: z minulé sezóny do promptu nepatří ani s platným `until`.
    db.prepare(
      `INSERT INTO club_incidents (id, team_id, season_number, kind, category, status, severity, game_date, culprit_type, culprit_revealed, loss, text)
       VALUES (?, ?, 2, 'kasa_obcerstveni', 'kradez', 'uzavreny', 1, '2026-09-22T16:00:00.000Z', 'zamestnanec', 1, '[]', 'Kasa.')`,
    ).bind(STALE_SQUAD, TEAM),
    db.prepare(
      `INSERT INTO club_incident_knowledge (incident_id, player_id, team_id, role, fact, willingness, until, season_number)
       VALUES (?, ?, ?, 'kadr', 'Obsluha schovala z tržby u občerstvení 388 Kč dřív, než ji odevzdala.', 50, '2026-12-31T16:00:00.000Z', 2)`,
    ).bind(STALE_SQUAD, KOHOUTEK, TEAM),
  ]);
});

describe("Kohoutek (Klamovka): vlastní provalený průšvih z minulé sezóny", () => {
  it("znalost pachatele ze sezóny 2 jde do promptu, dokud platí; cizí znalost kádru z minulé sezóny ne", async () => {
    const rows = await nactiZnalostiHrace(db, { teamId: TEAM, playerId: KOHOUTEK });
    expect(rows?.map((r) => `${r.incidentId}|${r.role}`)).toEqual([`${OWN}|pachatel`, `${OTHER}|kadr`]);
    const block = blokZnalosti(rows);
    expect(block).toContain("Tohle jsi udělal ty: Vloupání do skladu. Vzal jsi: tréninkové pomůcky.");
    expect(block).toContain("Přišlo se na to, že jsi to byl ty.");
    expect(block).toContain("nezapírej");
    expect(block).not.toContain("388 Kč");

    // Po `until` (14. 12.) si to nepamatuje.
    await db.prepare("UPDATE teams SET game_date = '2026-12-15T16:00:00.000Z' WHERE id = ?").bind(TEAM).run();
    const later = await nactiZnalostiHrace(db, { teamId: TEAM, playerId: KOHOUTEK });
    expect(later?.some((r) => r.incidentId === OWN)).toBe(false);
  });

  it("neodhalený pachatel z minulé sezóny v promptu nic nemá (prozradilo by mu to, že se ví)", async () => {
    await db.prepare("UPDATE club_incidents SET culprit_revealed = 0 WHERE id = ?").bind(OWN).run();
    const rows = await nactiZnalostiHrace(db, { teamId: TEAM, playerId: KOHOUTEK });
    expect(rows?.some((r) => r.incidentId === OWN)).toBe(false);
  });

  it("odmítnutí nápravy: pokyn jmenuje čin, kdy a co vzal", async () => {
    expect(await tryRestitution(db, { teamId: TEAM, playerId: KOHOUTEK, text: COACH, gameDate: GAME_DATE, now: new Date("2026-11-22T18:47:06Z") }))
      .toEqual({ outcome: "refused", incidentId: OWN });
    const life = JSON.parse((await db.prepare("SELECT life_context FROM players WHERE id = ?").bind(KOHOUTEK).first<{ life_context: string }>())!.life_context);
    const line = amendsDecisionLine(amendsDecisionFromLife(life, new Date("2026-11-22T18:47:10Z"))!);
    expect(line).toContain("Tohle jsi udělal ty: Vloupání do skladu, před 45 dny (15. 10.). Vzal jsi: tréninkové pomůcky.");
    expect(line).toContain("Rozhodl ses: NEUDĚLÁŠ to");
    expect(line).toContain("čin nezapírej");
    expect(line).not.toContain("—");
  });

  it("dřívější zapírání z E2E se pozná: v promptu pak „Dřív jsi to trenérovi zapíral“", async () => {
    for (const t of [
      "trenére, nevim o čem mluvíš, nic nevím o žádnym vykradenym skladu, nechápu o co jde",
      "Fakt nevím co chceš, nikdy jsem nic neukradl, asi to bude nějakej omyl",
      "trenere ty si fakt myslíš že jsem něco ukradl nevim o čem mluvíš",
    ]) expect(deniesOffence(t), t).toBe(true);
    await db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES ('m-deny', 'conv-kohoutek', 'player', 'Marek', ?, '2026-11-22T18:47:19Z')",
    ).bind("trenére, nevim o čem mluvíš, nic nevím o žádnym vykradenym skladu, nechápu o co jde").run();
    const block = blokZnalosti(await nactiZnalostiHrace(db, { teamId: TEAM, playerId: KOHOUTEK }));
    expect(block).toContain("Dřív jsi to trenérovi zapíral, to už neplatí: přiznej, že jsi lhal.");
  });
});
