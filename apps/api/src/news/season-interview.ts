/**
 * Rozhovor s trenérem o sezóně — interaktivní (coach_interviews).
 *
 * Vytvoří pending žádost s otázkami reflektujícími celou sezónu pro každý
 * lidský senior tým. Trenér odpoví v UI (Události) přes existující answer
 * endpoint, který pozná season-wrap (match_calendar_id obsahuje "-wrap") a
 * vygeneruje článek přes generateSeasonInterviewArticle (níže).
 *
 * Idempotence: NOT EXISTS na coach_interviews(team_id, match_calendar_id).
 */

import { calculateStandings, type StandingEntry } from "../stats/standings";
import { callGemini } from "./gemini-helper";
import { logger } from "../lib/logger";

function wrapCalendarId(seasonNumber: number): string {
  return `season-${seasonNumber}-wrap`;
}

async function loadTopPlayerNames(db: D1Database, teamId: string): Promise<string[]> {
  const rows = await db.prepare(
    "SELECT first_name, last_name FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') ORDER BY overall_rating DESC LIMIT 3",
  ).bind(teamId).all<{ first_name: string; last_name: string }>()
    .catch((e) => { logger.warn({ module: "season-interview" }, "load top players", e); return { results: [] as { first_name: string; last_name: string }[] }; });
  return rows.results.map((r) => `${r.first_name} ${r.last_name}`);
}

async function generateSeasonInterviewQuestions(
  apiKey: string,
  ctx: { teamName: string; leagueName: string; seasonNumber: number; pos: number | null; points: number | null; record: string; topPlayers: string[] },
): Promise<string[] | null> {
  const allowed = ctx.topPlayers.length ? ctx.topPlayers.map((n) => `"${n}"`).join(", ") : "(žádná jména hráčů nejsou povolena)";
  const prompt = `Jsi redaktor Okresního zpravodaje. Skončila ${ctx.seasonNumber}. sezóna ${ctx.leagueName}. Napiš PŘESNĚ 3 otázky pro trenéra týmu ${ctx.teamName} — OHLÉDNUTÍ ZA CELOU SEZÓNOU (ne před zápasem).

KONTEXT:
- Konečné umístění: ${ctx.pos ? `${ctx.pos}. místo, ${ctx.points} bodů` : "neznámé"}
- Bilance sezóny: ${ctx.record}
- Klíčoví hráči (JEDINÁ POVOLENÁ JMÉNA): ${allowed}

PRAVIDLA:
- NIKDY si nevymýšlej jména hráčů mimo povolený seznam, ani konkrétní výsledky
- Otázky o CELÉ sezóně: hodnocení umístění, nejlepší moment/zklamání, klíčový hráč, plány na příští sezónu
- Otázky piš jednu per řádek, bez číslování, bez markdown
- Hovorová čeština, vykání trenéru, 1-2 věty na otázku
- PŘESNĚ 3 otázky`;

  const text = await callGemini(apiKey, prompt, { maxOutputTokens: 512, temperature: 0.85, module: "season-interview" });
  if (!text) return null;
  const questions = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 10).slice(0, 3);
  return questions.length >= 2 ? questions : null;
}

/**
 * Článek z odpovědí — sezónní ohlédnutí (er-forma). Volá answer endpoint.
 */
export async function generateSeasonInterviewArticle(
  apiKey: string,
  qa: Array<{ q: string; a: string }>,
  managerName: string,
  teamName: string,
  seasonNumber: number,
): Promise<{ headline: string; body: string } | null> {
  const qaPairs = qa.map((p, i) => `Otázka ${i + 1}: ${p.q}\nOdpověď: ${p.a}`).join("\n\n");
  const prompt = `Jsi redaktor Okresního zpravodaje. Dostal jsi přepis ohlédnutí trenéra ${managerName} (${teamName}) za ${seasonNumber}. sezónou. Sestav novinový článek — bilanci sezóny.

PRAVIDLA:
- Píš v er-formě (ne Q&A), 180-280 slov
- Používej přímou řeč v uvozovkách pro šťavnaté výroky trenéra
- KRITICKÉ: NIKDY nevymýšlej obsah odpovědí — vycházej VÝHRADNĚ z toho, co trenér řekl
- NIKDY neopravuj pravopis v citacích trenéra
- Pikantní/bulvární obsah zachovej, sprostá slova změkči do novinového jazyka
- Pokud jsou odpovědi strohé, napiš že byl trenér stručný
- Tón: bulvárnější regionální zpravodaj s humorem, ohlédnutí za sezónou
- Čeština, bez markdown
- PRVNÍ řádek = titulek (max 80 znaků, bez prefixu). Od druhého řádku = tělo

PŘEPIS:
${qaPairs}`;

  const text = await callGemini(apiKey, prompt, { maxOutputTokens: 1024, temperature: 0.85, module: "season-interview" });
  if (!text) return null;
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;
  const headline = lines[0].replace(/^(titulek|headline|nadpis)\s*:?\s*/i, "").replace(/[*#]/g, "").trim();
  const body = lines.slice(1).join("\n").trim();
  if (!headline || !body) return null;
  return { headline, body };
}

/**
 * Vytvoří season-wrap rozhovory pro všechny lidské senior týmy v lize.
 * Vrací počet vytvořených žádostí.
 */
export async function createSeasonWrapInterviews(
  db: D1Database,
  geminiApiKey: string | undefined,
  leagueId: string,
  seasonNumber: number,
  limit = Infinity,
): Promise<{ created: number; remaining: number }> {
  if (!geminiApiKey) {
    logger.warn({ module: "season-interview" }, "no gemini key, skipping season interviews");
    return { created: 0, remaining: 0 };
  }

  const calId = wrapCalendarId(seasonNumber);
  const leagueRow = await db.prepare("SELECT name FROM leagues WHERE id = ?").bind(leagueId).first<{ name: string }>()
    .catch((e) => { logger.warn({ module: "season-interview" }, "load league name", e); return null; });
  const leagueName = leagueRow?.name ?? "Liga";

  const standings = await calculateStandings(db, leagueId);
  const standMap = new Map<string, StandingEntry>();
  for (const s of standings) standMap.set(s.teamId, s);

  const humanRes = await db.prepare(
    `SELECT t.id AS team_id, t.name AS team_name, m.id AS manager_id, m.name AS manager_name
     FROM teams t JOIN managers m ON m.team_id = t.id AND m.user_id = t.user_id
     WHERE t.league_id = ? AND t.user_id != 'ai'`,
  ).bind(leagueId).all<{ team_id: string; team_name: string; manager_id: string; manager_name: string }>()
    .catch((e) => { logger.warn({ module: "season-interview" }, "load human teams", e); return { results: [] as { team_id: string; team_name: string; manager_id: string; manager_name: string }[] }; });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  const expiresIso = expiresAt.toISOString();

  // Jen týmy bez existujícího season-wrap rozhovoru (idempotence)
  const pending: typeof humanRes.results = [];
  for (const t of humanRes.results) {
    const existing = await db.prepare(
      "SELECT 1 FROM coach_interviews WHERE team_id = ? AND match_calendar_id = ? LIMIT 1",
    ).bind(t.team_id, calId).first()
      .catch((e) => { logger.warn({ module: "season-interview" }, "idempotency check", e); return null; });
    if (!existing) pending.push(t);
  }

  const todo = pending.slice(0, limit === Infinity ? pending.length : limit);
  let created = 0;
  for (const t of todo) {
    const s = standMap.get(t.team_id);
    const record = s ? `${s.wins} výher, ${s.draws} remíz, ${s.losses} proher (${s.gf}:${s.ga})` : "neznámá";
    const topPlayers = await loadTopPlayerNames(db, t.team_id);

    const questions = await generateSeasonInterviewQuestions(geminiApiKey, {
      teamName: t.team_name, leagueName, seasonNumber,
      pos: s?.pos ?? null, points: s?.points ?? null, record, topPlayers,
    });
    if (!questions) {
      logger.warn({ module: "season-interview" }, `failed questions for ${t.team_id}`);
      continue;
    }

    const id = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO coach_interviews (id, league_id, team_id, manager_id, match_calendar_id, game_week, questions, status, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
    ).bind(id, leagueId, t.team_id, t.manager_id, calId, seasonNumber * 100, JSON.stringify(questions), expiresIso).run()
      .catch((e) => logger.warn({ module: "season-interview" }, "insert coach_interview", e));

    await notifyManager(db, t.team_id, id, seasonNumber).catch((e) => logger.warn({ module: "season-interview" }, "notify", e));
    created++;
  }

  const remaining = pending.length - todo.length;
  logger.info({ module: "season-interview" }, `created ${created} season-wrap interviews league=${leagueId}, remaining ${remaining}`);
  return { created, remaining };
}

async function notifyManager(db: D1Database, teamId: string, interviewId: string, seasonNumber: number): Promise<void> {
  const convTitle = "Redakce Zpravodaje";
  let convId: string | null = null;
  const existingConv = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = ? LIMIT 1")
    .bind(teamId, convTitle).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: "season-interview" }, "load conv", e); return null; });
  if (existingConv) {
    convId = existingConv.id;
  } else {
    convId = crypto.randomUUID();
    await db.prepare(
      "INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_at, created_at) VALUES (?, ?, 'system', ?, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
    ).bind(convId, teamId, convTitle).run()
      .catch((e) => logger.warn({ module: "season-interview" }, "create conv", e));
  }

  const msgBody = `📰 Redaktor Zpravodaje se chce ohlédnout za ${seasonNumber}. sezónou. Odpověz na otázky ve svých Událostech — vyjde bilanční rozhovor.`;
  await db.prepare(
    "INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at) VALUES (?, ?, 'system', 'Redakce Zpravodaje', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
  ).bind(crypto.randomUUID(), convId, msgBody, JSON.stringify({ type: "interview_request", interviewId }))
    .run()
    .catch((e) => logger.warn({ module: "season-interview" }, "insert message", e));
  await db.prepare(
    "UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
  ).bind(msgBody.slice(0, 100), convId).run()
    .catch((e) => logger.warn({ module: "season-interview" }, "update conv", e));
}
