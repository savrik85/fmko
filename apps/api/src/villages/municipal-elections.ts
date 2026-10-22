/**
 * Komunální volby: kompletní obměna vedení všech obcí s lidským týmem, reset přízně na 50,
 * článek do Zpravodaje a SMS každému lidskému klubu s novým starostou. Pouští je admin
 * tlačítko a od 2026-10-20 i konec sezóny (`season-rollover.ts`).
 */

import { logger } from "../lib/logger";

export async function holdMunicipalElections(db: D1Database): Promise<{
  villagesProcessed: number; officialsReplaced: number; favorRowsReset: number; articlesPublished: number; teamsNotified: number;
}> {
  const now = new Date();
  const nowIso = now.toISOString();
  // Volební nonce = nové seedy → zaručeně noví lidé (generátor je jinak deterministický).
  const nonce = String(Date.now());
  const termEnd = new Date(now);
  termEnd.setFullYear(termEnd.getFullYear() + 4);
  const termEndIso = termEnd.toISOString();
  // Sezónní ordinal pro seed (stejný vzorec jako officials-store.computeCurrentSeason).
  const currentSeason = now.getFullYear() * 2 + (now.getMonth() < 6 ? 0 : 1);

  const { generateOfficialsForVillage } = await import("./officials-generator");

  const villages = await db.prepare(
    `SELECT DISTINCT v.id FROM villages v
     JOIN teams t ON t.village_id = v.id
     WHERE t.user_id != 'ai'`
  ).all<{ id: string }>();

  const mayors = new Map<string, string>();
  let villagesProcessed = 0;
  let officialsReplaced = 0;

  for (const v of villages.results ?? []) {
    // Obměna vedení UPDATE-in-place: zachová id zastupitele (a tím i FK vazby z
    // historie/brigád/pozvánek), jen přepíše personu + termín. Delete+insert by
    // u obcí s nahromaděnou historií padal na FK a následně na UNIQUE(village_id, role).
    const generated = generateOfficialsForVillage(v.id, currentSeason, nonce);
    const mayor = generated.find((g) => g.role === "starosta");
    if (mayor) mayors.set(v.id, `${mayor.firstName} ${mayor.lastName}`);
    for (const g of generated) {
      try {
        const res = await db.prepare(
          `UPDATE village_officials
             SET first_name = ?, last_name = ?, age = ?, occupation = ?,
                 face_config = ?, personality = ?, portfolio = ?, preferences = ?,
                 term_start_at = ?, term_end_at = ?
           WHERE village_id = ? AND role = ?`
        ).bind(
          g.firstName, g.lastName, g.age, g.occupation,
          JSON.stringify(g.faceConfig), g.personality,
          JSON.stringify(g.portfolio), JSON.stringify(g.preferences),
          nowIso, termEndIso, v.id, g.role,
        ).run();
        if ((res.meta?.changes ?? 0) === 0) {
          // Role v obci chyběla — doplň nového zastupitele.
          await db.prepare(
            `INSERT INTO village_officials
              (id, village_id, role, first_name, last_name, age, occupation,
               face_config, personality, portfolio, preferences, term_start_at, term_end_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            crypto.randomUUID(), v.id, g.role, g.firstName, g.lastName, g.age, g.occupation,
            JSON.stringify(g.faceConfig), g.personality,
            JSON.stringify(g.portfolio), JSON.stringify(g.preferences),
            nowIso, termEndIso,
          ).run();
        }
        officialsReplaced++;
      } catch (e) {
        logger.warn({ module: "villages" }, `replace official ${g.role} for village ${v.id}`, e);
      }
    }

    await db.prepare(
      `INSERT INTO village_history (id, village_id, team_id, official_id, event_type, description, impact, game_date, created_at)
       VALUES (?, ?, NULL, NULL, 'election_held', ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(), v.id,
      "Proběhly komunální volby, obec má nové vedení.",
      JSON.stringify({ nonce }), nowIso, nowIso,
    ).run().catch((e) => logger.warn({ module: "villages" }, "election history", e));

    villagesProcessed++;
  }

  // Blanket reset přízně na neutrál (nové vedení = vztahy od nuly).
  const favorReset = await db.prepare(
    "UPDATE village_team_favor SET favor = 50, trust = 50, updated_at = ?"
  ).bind(nowIso).run().catch((e) => {
    logger.warn({ module: "villages" }, "reset favor", e);
    return null;
  });
  const favorRowsReset = favorReset?.meta?.changes ?? 0;

  // Článek do Zpravodaje per liga (jen ligy s lidským týmem).
  const leagues = await db.prepare(
    `SELECT DISTINCT t.league_id as id FROM teams t
     WHERE t.user_id != 'ai' AND t.league_id IS NOT NULL`
  ).all<{ id: string }>();

  const headline = "Komunální volby: v obcích se mění vedení";
  const body = "V obcích proběhly komunální volby a na mnoha místech se vyměnilo vedení, noví starostové, místostarostové i zastupitelé. Vztahy klubů s radnicemi tak začínají nanovo a přízeň obce si každý tým musí získat od začátku.";
  let articlesPublished = 0;
  for (const lg of leagues.results ?? []) {
    try {
      await db.prepare(
        "INSERT INTO news (id, league_id, type, headline, body, created_at) VALUES (?, ?, 'municipal_elections', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
      ).bind(crypto.randomUUID(), lg.id, headline, body).run();
      articlesPublished++;
    } catch (e) {
      logger.warn({ module: "villages" }, `insert election news for league ${lg.id}`, e);
    }
  }

  // Každý lidský klub se dozví, kdo je u něj nový starosta: bez zprávy se o volbách
  // dozvěděl jen ten, kdo zrovna četl Zpravodaj (2026-10-20).
  const { sendSystemSMS } = await import("../messaging/system-sms");
  const clubs = await db.prepare(
    `SELECT t.id, t.village_id, v.name AS village FROM teams t JOIN villages v ON v.id = t.village_id
     WHERE t.user_id IS NOT NULL AND t.user_id != 'ai' AND t.parent_team_id IS NULL`,
  ).all<{ id: string; village_id: string; village: string }>()
    .catch((e) => { logger.warn({ module: "villages" }, "kluby pro oznámení komunálních voleb", e); return { results: [] as Array<{ id: string; village_id: string; village: string }> }; });
  let teamsNotified = 0;
  for (const club of clubs.results) {
    const mayor = mayors.get(club.village_id);
    const text = mayor
      ? `🏛️ V obci ${club.village} proběhly komunální volby. Novým starostou je ${mayor}. Vztahy s radnicí začínají nanovo, přízeň obce si musíme získat znovu.`
      : `🏛️ V obci ${club.village} proběhly komunální volby a radnice má nové vedení. Přízeň obce si musíme získat znovu.`;
    await sendSystemSMS(db, club.id, "Obecní úřad", text, { type: "village" });
    teamsNotified++;
  }

  return { villagesProcessed, officialsReplaced, favorRowsReset, articlesPublished, teamsNotified };
}
