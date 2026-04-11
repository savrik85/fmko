/**
 * Interview generátor — Rozhovor kola
 *
 * Před každým zápasem dostane jeden lidský trenér (round-robin) žádost o rozhovor.
 * Gemini vygeneruje 3–4 otázky, trenér napíše odpovědi, AI sestaví novinový článek.
 */

import { logger } from "../lib/logger";
import { calculateStandings } from "../stats/standings";
import { VILLAGE_FLAVOR } from "./ai-reporter";

interface MatchContext {
  teamName: string;
  opponentName: string;
  isHome: boolean;
  lastMatchResult: string | null; // "výhra 3:1 nad X" nebo null
  formStr: string; // "WWDL..."
  leaguePos: number | null;
  leaguePoints: number | null;
  topPlayers: Array<{ name: string; position: string; goals?: number }>;
  injuredStr: string | null;
  villageFlavor: string;
  gameWeek: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loadTeamForm(db: D1Database, teamId: string): Promise<string> {
  const rows = await db
    .prepare(
      `SELECT home_team_id, home_score, away_score FROM matches
       WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'
       ORDER BY simulated_at DESC LIMIT 5`,
    )
    .bind(teamId, teamId)
    .all<{ home_team_id: string; home_score: number; away_score: number }>()
    .catch((e) => {
      logger.warn({ module: "interview-generator" }, "load form", e);
      return { results: [] };
    });

  const form = (rows.results ?? [])
    .map((r) => {
      const isHome = r.home_team_id === teamId;
      const my = isHome ? r.home_score : r.away_score;
      const opp = isHome ? r.away_score : r.home_score;
      if (my > opp) return "V";
      if (my < opp) return "P";
      return "R";
    })
    .reverse()
    .join("");

  return form || "–";
}

async function loadLastMatchResult(db: D1Database, teamId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT m.home_team_id, m.home_score, m.away_score,
              ht.name as home_name, at.name as away_name
       FROM matches m
       JOIN teams ht ON m.home_team_id = ht.id
       JOIN teams at ON m.away_team_id = at.id
       WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'simulated'
       ORDER BY m.simulated_at DESC LIMIT 1`,
    )
    .bind(teamId, teamId)
    .first<{
      home_team_id: string;
      home_score: number;
      away_score: number;
      home_name: string;
      away_name: string;
    }>()
    .catch((e) => {
      logger.warn({ module: "interview-generator" }, "load last match", e);
      return null;
    });

  if (!row) return null;

  const isHome = row.home_team_id === teamId;
  const my = isHome ? row.home_score : row.away_score;
  const opp = isHome ? row.away_score : row.home_score;
  const opponent = isHome ? row.away_name : row.home_name;
  const venue = isHome ? "doma" : "venku";

  if (my > opp) return `výhra ${my}:${opp} nad ${opponent} (${venue})`;
  if (my < opp) return `prohra ${my}:${opp} s ${opponent} (${venue})`;
  return `remíza ${my}:${opp} s ${opponent} (${venue})`;
}

async function loadTopPlayers(
  db: D1Database,
  teamId: string,
): Promise<Array<{ name: string; position: string; goals?: number }>> {
  const rows = await db
    .prepare(
      `SELECT p.first_name, p.last_name, p.position,
              COALESCE(SUM(json_extract(ps.stats, "$.goals")), 0) as goals
       FROM players p
       LEFT JOIN player_stats ps ON ps.player_id = p.id AND ps.season = (
         SELECT season FROM leagues l JOIN teams t ON t.league_id = l.id WHERE t.id = ?
       )
       WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active')
       GROUP BY p.id
       ORDER BY p.overall_rating DESC LIMIT 3`,
    )
    .bind(teamId, teamId)
    .all<{ first_name: string; last_name: string; position: string; goals: number }>()
    .catch((e) => {
      logger.warn({ module: "interview-generator" }, "load top players", e);
      return { results: [] };
    });

  return (rows.results ?? []).map((r) => ({
    name: `${r.first_name} ${r.last_name}`,
    position: r.position,
    goals: r.goals > 0 ? r.goals : undefined,
  }));
}

async function loadInjuredText(db: D1Database, teamId: string): Promise<string | null> {
  const rows = await db
    .prepare(
      `SELECT p.first_name, p.last_name, i.type as injury_type
       FROM injuries i
       JOIN players p ON p.id = i.player_id
       WHERE i.team_id = ? AND i.days_remaining > 0 AND p.overall_rating >= 55
       ORDER BY p.overall_rating DESC LIMIT 3`,
    )
    .bind(teamId)
    .all<{ first_name: string; last_name: string; injury_type: string }>()
    .catch((e) => {
      logger.warn({ module: "interview-generator" }, "load injuries", e);
      return { results: [] };
    });

  if (!rows.results?.length) return null;
  return rows.results.map((r) => `${r.first_name} ${r.last_name} (${r.injury_type})`).join(", ");
}

// ─── Gemini helper ────────────────────────────────────────────────────────────

async function callGemini(
  apiKey: string,
  prompt: string,
  maxTokens = 1024,
): Promise<string | null> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.85,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  ).catch((e) => {
    logger.warn({ module: "interview-generator" }, "gemini fetch failed", e);
    return null;
  });

  if (!res || !res.ok) {
    const errBody = res ? await res.text().catch(() => "") : "";
    logger.warn(
      { module: "interview-generator" },
      `Gemini API error: ${res?.status} — ${errBody.slice(0, 200)}`,
    );
    return null;
  }

  const json = (await res.json().catch((e) => {
    logger.warn({ module: "interview-generator" }, "parse gemini response", e);
    return null;
  })) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  } | null;

  if (!json) return null;

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}

// ─── Question generation ──────────────────────────────────────────────────────

export async function generateInterviewQuestions(
  apiKey: string,
  ctx: MatchContext,
): Promise<string[] | null> {
  const topStr = ctx.topPlayers
    .map((p) => `${p.name} (${p.position}${p.goals ? `, ${p.goals} gólů` : ""})`)
    .join(", ");

  const prompt = `Jsi redaktor Okresního zpravodaje v Čechách. Napiš přesně 3 otázky pro trenéra
fotbalového týmu ${ctx.teamName} před zápasem ${ctx.isHome ? "doma" : "venku"} s ${ctx.opponentName} (kolo ${ctx.gameWeek}).

INSTRUKCE:
- KAŽDÁ otázka musí být konkrétní — zmiň jméno hráče, přesný výsledek, nebo konkrétního soupeře
- Nepokládej obecné otázky jako "jak hodnotíte formu" nebo "co od zápasu čekáte" — to je nuda
- Střídej témata: 1 otázka o soupeři nebo nadcházejícím zápase, 1 o konkrétním hráči nebo výkonu, 1 o situaci v tabulce nebo formě
- Otázky piš jednu per řádek, bez číslování, bez odrážek, bez markdown
- Jazyk: hovorová čeština, novinářský tón, vykání trenéru
- Délka každé otázky: 1–2 věty max
- PŘESNĚ 3 otázky

KONTEXT (používej konkrétní data z toho níže):
- Tým: ${ctx.teamName} (${ctx.villageFlavor}), ${ctx.isHome ? "hraje doma" : "hraje venku"}
- Soupeř: ${ctx.opponentName}
- Kolo: ${ctx.gameWeek}
- Pozice v tabulce: ${ctx.leaguePos ? `${ctx.leaguePos}. místo, ${ctx.leaguePoints} bodů` : "start sezóny"}
- Forma posledních 5 zápasů: ${ctx.formStr} (V=výhra, R=remíza, P=prohra)
- Poslední výsledek: ${ctx.lastMatchResult ?? "první zápas sezóny"}
- Klíčoví hráči: ${topStr || "info nedostupné"}
${ctx.injuredStr ? `- Zranění: ${ctx.injuredStr}` : ""}

Příklady DOBRÉ otázky: "Po výhře 3:1 nad Lokomotivou přichází těžší soupeř — čím vás ${ctx.opponentName} může překvapit?"
Příklady ŠPATNÉ otázky: "Jaká je forma týmu?" nebo "Co od zápasu čekáte?"

Napiš pouze 3 otázky, každou na samostatném řádku.`;

  const text = await callGemini(apiKey, prompt, 512);
  if (!text) return null;

  const questions = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 10)
    .slice(0, 4);

  if (questions.length < 2) return null;
  return questions;
}

// ─── Article generation ───────────────────────────────────────────────────────

export async function generateInterviewArticle(
  apiKey: string,
  qa: Array<{ q: string; a: string }>,
  managerName: string,
  teamName: string,
  opponentName: string,
): Promise<{ headline: string; body: string } | null> {
  const qaPairs = qa
    .map((pair, i) => `Otázka ${i + 1}: ${pair.q}\nOdpověď: ${pair.a}`)
    .join("\n\n");

  const prompt = `Jsi zkušený redaktor Okresního zpravodaje. Dostal jsi přepis rozhovoru s trenérem
${managerName} z týmu ${teamName} před zápasem s ${opponentName}. Sestav z toho novinový článek.

PRAVIDLA:
- Piš v er-formě (ne Q&A formát, ne otázky a odpovědi)
- Délka: 180–250 slov
- Používej přímou řeč v uvozovkách pro klíčové výroky trenéra
- Pokud jsou odpovědi vulgární nebo obsahují nadávky: přepiš je novinářsky (zachovej smysl, odstraň vulgaritu)
- Pokud jsou odpovědi nesmyslné nebo příliš krátké: novinářsky je doplň realistickým kontextem
- Tón: vážný novinář regionálního sportu, lehký humor kde to sedí
- Čeština, bez markdown, bez odrážek
- Bez uvozovek kolem celého textu
- STRIKTNĚ: první řádek = titulek (max 80 znaků, bez "Titulek:" prefixu)
- Od druhého řádku = body článku

PŘEPIS ROZHOVORU:
${qaPairs}`;

  const text = await callGemini(apiKey, prompt, 1024);
  if (!text) return null;

  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;

  const headline = lines[0]
    .replace(/^(titulek|headline|nadpis)\s*:?\s*/i, "")
    .replace(/[*#]/g, "")
    .trim();
  const body = lines.slice(1).join("\n").trim();

  if (!headline || !body) return null;
  return { headline, body };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Vybere dalšího trenéra v round-robin pořadí, který ještě nemá interview
 * pro daný zápas (team_id + match_calendar_id), a vytvoří žádost o rozhovor
 * s Gemini-generovanými otázkami. Volat opakovaně = každý lidský tým dostane svůj.
 */
export async function tryCreateInterviewRequest(
  db: D1Database,
  geminiApiKey: string | undefined,
  ctx: { leagueId: string; calendarId: string; gameWeek: number },
): Promise<void> {
  if (!geminiApiKey) {
    logger.warn({ module: "interview-generator" }, "no gemini key, skipping");
    return;
  }

  // 1. Round-robin výběr: lidský tým, který pro tento zápas ještě nemá interview
  //    (seřazeno podle nejstaršího posledního rozhovoru — NULLS FIRST = kdo ještě nikdy nedostal)
  const teamRow = await db
    .prepare(
      `SELECT t.id as team_id, t.user_id, t.name as team_name, t.village_id, t.league_id,
              m.id as manager_id, m.name as manager_name, m.avatar as manager_avatar
       FROM teams t
       JOIN managers m ON m.team_id = t.id
       WHERE t.league_id = ? AND t.user_id != 'ai'
         AND NOT EXISTS (
           SELECT 1 FROM coach_interviews ci
           WHERE ci.team_id = t.id AND ci.match_calendar_id = ?
         )
       ORDER BY (
         SELECT MAX(ci.created_at) FROM coach_interviews ci WHERE ci.team_id = t.id
       ) ASC NULLS FIRST
       LIMIT 1`,
    )
    .bind(ctx.leagueId, ctx.calendarId)
    .first<{
      team_id: string;
      user_id: string;
      team_name: string;
      village_id: string | null;
      league_id: string;
      manager_id: string;
      manager_name: string;
      manager_avatar: string | null;
    }>()
    .catch((e) => {
      logger.warn({ module: "interview-generator" }, "round-robin team select", e);
      return null;
    });

  if (!teamRow) return; // Vsichni lidsti treneri uz maji interview pro tento zapas

  // 3. Načti expires_at ze season_calendar
  const calRow = await db
    .prepare("SELECT scheduled_at FROM season_calendar WHERE id = ?")
    .bind(ctx.calendarId)
    .first<{ scheduled_at: string }>()
    .catch((e) => {
      logger.warn({ module: "interview-generator" }, "load calendar row", e);
      return null;
    });

  if (!calRow) return;
  const expiresAt = calRow.scheduled_at;

  // 4. Zápas (soupeř)
  const matchRow = await db
    .prepare(
      `SELECT m.home_team_id, m.away_team_id,
              ht.name as home_name, at.name as away_name
       FROM matches m
       JOIN teams ht ON m.home_team_id = ht.id
       JOIN teams at ON m.away_team_id = at.id
       WHERE m.calendar_id = ?
         AND (m.home_team_id = ? OR m.away_team_id = ?)
       LIMIT 1`,
    )
    .bind(ctx.calendarId, teamRow.team_id, teamRow.team_id)
    .first<{
      home_team_id: string;
      away_team_id: string;
      home_name: string;
      away_name: string;
    }>()
    .catch((e) => {
      logger.warn({ module: "interview-generator" }, "load match row", e);
      return null;
    });

  if (!matchRow) return;

  const isHome = matchRow.home_team_id === teamRow.team_id;
  const opponentName = isHome ? matchRow.away_name : matchRow.home_name;

  // 5. Village flavor
  let villageFlavor = "tradiční fotbalový klub";
  if (teamRow.village_id) {
    const villageRow = await db
      .prepare("SELECT name FROM villages WHERE id = ?")
      .bind(teamRow.village_id)
      .first<{ name: string }>()
      .catch((e) => { logger.warn({ module: "interview-generator" }, "load village name", e); return null; });
    if (villageRow) {
      villageFlavor = VILLAGE_FLAVOR[villageRow.name] ?? `obec ${villageRow.name}`;
    }
  }

  // 6. Kontext pro otázky
  const [form, lastMatch, topPlayers, injuredStr, standings] = await Promise.all([
    loadTeamForm(db, teamRow.team_id),
    loadLastMatchResult(db, teamRow.team_id),
    loadTopPlayers(db, teamRow.team_id),
    loadInjuredText(db, teamRow.team_id),
    calculateStandings(db, ctx.leagueId).catch(() => []),
  ]);

  const myStanding = standings.find((s) => s.teamId === teamRow.team_id);

  const matchCtx: MatchContext = {
    teamName: teamRow.team_name,
    opponentName,
    isHome,
    lastMatchResult: lastMatch,
    formStr: form,
    leaguePos: myStanding?.pos ?? null,
    leaguePoints: myStanding?.points ?? null,
    topPlayers,
    injuredStr,
    villageFlavor,
    gameWeek: ctx.gameWeek,
  };

  // 7. Generuj otázky přes Gemini
  const questions = await generateInterviewQuestions(geminiApiKey, matchCtx);
  if (!questions || questions.length === 0) {
    logger.warn({ module: "interview-generator" }, "failed to generate questions", teamRow.team_id);
    return;
  }

  // 8. Vytvoř záznam v DB
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO coach_interviews
         (id, league_id, team_id, manager_id, match_calendar_id, game_week, questions, status, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
    )
    .bind(
      id,
      ctx.leagueId,
      teamRow.team_id,
      teamRow.manager_id,
      ctx.calendarId,
      ctx.gameWeek,
      JSON.stringify(questions),
      expiresAt,
    )
    .run()
    .catch((e) => {
      logger.warn({ module: "interview-generator" }, "insert coach_interview", e);
    });

  // 9. Notifikace — zpráva v "Redakce Zpravodaje" konverzaci
  try {
    const convTitle = "Redakce Zpravodaje";
    let convId: string | null = null;

    const existingConv = await db
      .prepare(
        `SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = ? LIMIT 1`,
      )
      .bind(teamRow.team_id, convTitle)
      .first<{ id: string }>();

    if (existingConv) {
      convId = existingConv.id;
    } else {
      convId = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_at, created_at)
           VALUES (?, ?, 'system', ?, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
        )
        .bind(convId, teamRow.team_id, convTitle)
        .run();
    }

    const msgBody = `📰 Redaktor Zpravodaje se chce zeptat před zápasem s ${opponentName}. Odpověz na 3 otázky ve svých Událostech — článek vyjde ve Zpravodaji.`;
    const msgId = crypto.randomUUID();

    await db
      .prepare(
        `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at)
         VALUES (?, ?, 'system', 'Redakce Zpravodaje', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
      )
      .bind(msgId, convId, msgBody, JSON.stringify({ type: "interview_request", interviewId: id }))
      .run();

    await db
      .prepare(
        `UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`,
      )
      .bind(msgBody.slice(0, 100), convId)
      .run();
  } catch (e) {
    logger.warn({ module: "interview-generator" }, "send interview notification", e);
  }

  logger.info(
    { module: "interview-generator", teamId: teamRow.team_id },
    `interview request created for ${teamRow.manager_name} vs ${opponentName} (week ${ctx.gameWeek})`,
  );
}
