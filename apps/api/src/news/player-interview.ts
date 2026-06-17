/**
 * Player interview — Rozhovor s hráčem
 *
 * Po každém kole vyjde ve Zpravodaji jeden plně AI-generovaný rozhovor s vybraným
 * hráčem z ligy (rotace napříč týmy + výběr podle osobnosti). Hráč je NPC, takže
 * otázky i odpovědi generuje Gemini naráz (vzor round-summary.ts, ne coach interview).
 *
 * Rozhovor má dopad na kabinu: Gemini vrací strukturovaný `mood`, který deterministicky
 * mapujeme na efekt přes existující utility (shiftSquadMorale / applyRelationEvent /
 * coach_relationship). Žádná nová mechanika, žádné parsování volného textu.
 */

import { calculateStandings } from "../stats/standings";
import { logger } from "../lib/logger";

type Mood = "boost" | "rivalry" | "kabina_drama" | "klid";
const MOODS: Mood[] = ["boost", "rivalry", "kabina_drama", "klid"];

/** Kolik rozhovorů s hráči vyjde na ligu a kolo (každý z jiného týmu). */
const INTERVIEWS_PER_ROUND = 2;

interface GeminiOutput {
  headline: string;
  article: string;
  mood: Mood;
  moodReason: string;
}

interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  age: number;
  position: string;
  overall_rating: number;
  is_celebrity: number | null;
  personality: string;
  life_context: string;
  avatar: string | null;
}

// Netuctová povolání = barvitější rozhovor (bonus ke skóre zajímavosti)
const SPICY_OCCUPATIONS = [
  "řezník", "hrobník", "kominík", "myslivec", "hasič", "policajt", "policista",
  "učitel", "starosta", "kněz", "farář", "podnikatel", "hospodský", "číšník",
  "popelář", "kat", "rybář", "voják", "zedník", "kamioňák", "dělník",
];

// ─── Gemini helper (jako interview-generator.ts) ───────────────────────────────

async function callGemini(apiKey: string, prompt: string, maxTokens = 1536): Promise<string | null> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.75,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
        },
      }),
    },
  ).catch((e) => {
    logger.warn({ module: "player-interview" }, "gemini fetch failed", e);
    return null;
  });

  if (!res || !res.ok) {
    const errBody = res ? await res.text().catch(() => "") : "";
    logger.warn({ module: "player-interview" }, `Gemini API error: ${res?.status} — ${errBody.slice(0, 200)}`);
    return null;
  }

  const json = (await res.json().catch((e) => {
    logger.warn({ module: "player-interview" }, "parse gemini response", e);
    return null;
  })) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  } | null;
  if (!json) return null;

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  return parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

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
      logger.warn({ module: "player-interview" }, "load form", e);
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

// ─── Main entry point ───────────────────────────────────────────────────────────

export async function generatePlayerInterview(
  db: D1Database,
  geminiApiKey: string | undefined,
  calendarId: string,
  maxPerRound: number = INTERVIEWS_PER_ROUND,
): Promise<{ created: number; reason?: string }> {
  if (!geminiApiKey) {
    logger.warn({ module: "player-interview" }, "no gemini key, skipping");
    return { created: 0, reason: "no gemini key" };
  }

  // Load kolo
  const cal = await db
    .prepare("SELECT league_id, game_week FROM season_calendar WHERE id = ?")
    .bind(calendarId)
    .first<{ league_id: string; game_week: number }>()
    .catch((e) => {
      logger.warn({ module: "player-interview" }, "load calendar", e);
      return null;
    });
  if (!cal) return { created: 0, reason: "calendar not found" };
  const { league_id: leagueId, game_week: gameWeek } = cal;

  // Generuj až N rozhovorů na kolo, každý z jiného týmu. Počítadlo drží idempotenci
  // i při opakovaném spuštění (re-run match-runneru nepřekročí maxPerRound).
  let created = 0;
  for (let i = 0; i < maxPerRound; i++) {
    const existing = await db
      .prepare("SELECT COUNT(*) AS c FROM news WHERE league_id = ? AND game_week = ? AND type = 'player_interview'")
      .bind(leagueId, gameWeek)
      .first<{ c: number }>()
      .catch((e) => {
        logger.warn({ module: "player-interview" }, "idempotency count", e);
        return null;
      });
    if (!existing) break;
    if (existing.c >= maxPerRound) {
      logger.info({ module: "player-interview" }, `skip — ${existing.c}/${maxPerRound} exist league ${leagueId} week ${gameWeek}`);
      break;
    }
    const r = await generateOne(db, geminiApiKey, calendarId, leagueId, gameWeek);
    if (!r.created) {
      logger.info({ module: "player-interview" }, `stop after ${created} — ${r.reason}`);
      break;
    }
    created++;
  }

  return { created };
}

async function generateOne(
  db: D1Database,
  geminiApiKey: string,
  calendarId: string,
  leagueId: string,
  gameWeek: number,
): Promise<{ created: boolean; reason?: string }> {
  // Round-robin tým: tým z tohoto kola nejdéle bez rozhovoru hráče (NULLS FIRST = nikdy),
  // který v TOMTO kole ještě rozhovor nemá → dva rozhovory za kolo jsou z různých týmů.
  const teamRow = await db
    .prepare(
      `SELECT t.id, t.name FROM teams t
       WHERE t.id IN (
         SELECT home_team_id FROM matches WHERE calendar_id = ?
         UNION SELECT away_team_id FROM matches WHERE calendar_id = ?
       )
       AND NOT EXISTS (
         SELECT 1 FROM news n
         WHERE n.type = 'player_interview' AND n.team_id = t.id AND n.game_week = ?
       )
       ORDER BY (
         SELECT MAX(n.created_at) FROM news n
         WHERE n.type = 'player_interview' AND n.team_id = t.id
       ) ASC NULLS FIRST
       LIMIT 1`,
    )
    .bind(calendarId, calendarId, gameWeek)
    .first<{ id: string; name: string }>()
    .catch((e) => {
      logger.warn({ module: "player-interview" }, "round-robin team select", e);
      return null;
    });
  if (!teamRow) return { created: false, reason: "no eligible team in round" };

  // 4. Výběr hráče podle osobnosti
  const playerRows = await db
    .prepare(
      `SELECT id, first_name, last_name, nickname, age, position, overall_rating,
              is_celebrity, personality, life_context, avatar
       FROM players
       WHERE team_id = ? AND (status IS NULL OR status = 'active')`,
    )
    .bind(teamRow.id)
    .all<PlayerRow>()
    .catch((e) => {
      logger.warn({ module: "player-interview" }, "load players", e);
      return { results: [] as PlayerRow[] };
    });
  if (!playerRows.results.length) return { created: false, reason: "no players" };

  const scored = playerRows.results.map((p) => {
    const pers = safeParse<Record<string, number>>(p.personality, {});
    const lc = safeParse<Record<string, unknown>>(p.life_context, {});
    const occupation = typeof lc.occupation === "string" ? lc.occupation.toLowerCase() : "";
    const leadership = pers.leadership ?? 30;
    const temper = pers.temper ?? pers.aggression ?? 40;
    const spicyJob = SPICY_OCCUPATIONS.some((o) => occupation.includes(o)) ? 15 : 0;
    const celeb = p.is_celebrity ? 25 : 0;
    // Tie-break proti opakování stejného hráče napříč koly
    const variation = (p.overall_rating + gameWeek) % 7;
    const score = leadership + temper * 0.6 + spicyJob + celeb + p.overall_rating * 0.2 + variation;
    return { p, lc, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const chosen = scored[0];
  const player = chosen.p;
  const playerName = `${player.first_name} ${player.last_name}`;
  const occupation = typeof chosen.lc.occupation === "string" ? chosen.lc.occupation : null;

  // 5a. Zápas týmu v tomto kole → soupeř
  const matchRow = await db
    .prepare(
      `SELECT m.home_team_id, m.away_team_id, m.home_score, m.away_score,
              ht.name AS home_name, at.name AS away_name
       FROM matches m
       JOIN teams ht ON ht.id = m.home_team_id
       JOIN teams at ON at.id = m.away_team_id
       WHERE m.calendar_id = ? AND (m.home_team_id = ? OR m.away_team_id = ?)
       LIMIT 1`,
    )
    .bind(calendarId, teamRow.id, teamRow.id)
    .first<{
      home_team_id: string;
      away_team_id: string;
      home_score: number;
      away_score: number;
      home_name: string;
      away_name: string;
    }>()
    .catch((e) => {
      logger.warn({ module: "player-interview" }, "load match", e);
      return null;
    });

  let opponentTeamId: string | null = null;
  let opponentName: string | null = null;
  let resultStr: string | null = null;
  if (matchRow) {
    const isHome = matchRow.home_team_id === teamRow.id;
    opponentTeamId = isHome ? matchRow.away_team_id : matchRow.home_team_id;
    opponentName = isHome ? matchRow.away_name : matchRow.home_name;
    const my = isHome ? matchRow.home_score : matchRow.away_score;
    const opp = isHome ? matchRow.away_score : matchRow.home_score;
    const venue = isHome ? "doma" : "venku";
    resultStr = my > opp ? `výhra ${my}:${opp} (${venue})` : my < opp ? `prohra ${my}:${opp} (${venue})` : `remíza ${my}:${opp} (${venue})`;
  }

  // 5b. Trenér soupeře (jen pokud lidský — u AI nepoužíváme osobní jméno)
  let opponentManagerName: string | null = null;
  if (opponentTeamId) {
    const oppRow = await db
      .prepare(
        `SELECT t.user_id, mgr.name AS manager_name
         FROM teams t LEFT JOIN managers mgr ON mgr.team_id = t.id AND mgr.user_id = t.user_id
         WHERE t.id = ?`,
      )
      .bind(opponentTeamId)
      .first<{ user_id: string; manager_name: string | null }>()
      .catch((e) => {
        logger.warn({ module: "player-interview" }, "load opponent manager", e);
        return null;
      });
    if (oppRow && oppRow.user_id !== "ai") opponentManagerName = oppRow.manager_name ?? null;
  }

  // 5c. Výkon hráče v kole (může být null, když nehrál)
  const perf = await db
    .prepare(
      `SELECT mps.rating, mps.goals, mps.assists, mps.minutes_played
       FROM match_player_stats mps
       JOIN matches m ON m.id = mps.match_id
       WHERE mps.player_id = ? AND m.calendar_id = ?
       LIMIT 1`,
    )
    .bind(player.id, calendarId)
    .first<{ rating: number; goals: number; assists: number; minutes_played: number }>()
    .catch((e) => {
      logger.warn({ module: "player-interview" }, "load performance", e);
      return null;
    });

  // 5d. Spoluhráči (whitelist pro kabinové rýpnutí) — top 3 ostatní dle ratingu
  const teammates = scored
    .filter((s) => s.p.id !== player.id)
    .sort((a, b) => b.p.overall_rating - a.p.overall_rating)
    .slice(0, 3)
    .map((s) => `${s.p.first_name} ${s.p.last_name}`);

  // 5e. Forma + pozice v tabulce + vztah trenérů (pro tón)
  const { getRelationPromptContext } = await import("../community/manager-relations");
  const [form, standings, relation] = await Promise.all([
    loadTeamForm(db, teamRow.id),
    calculateStandings(db, leagueId).catch((e) => {
      logger.warn({ module: "player-interview" }, "calculate standings", e);
      return [];
    }),
    opponentTeamId
      ? getRelationPromptContext(db, teamRow.id, opponentTeamId).catch((e) => {
          logger.warn({ module: "player-interview" }, "relation context", e);
          return null;
        })
      : Promise.resolve(null),
  ]);
  const myStanding = standings.find((s) => s.teamId === teamRow.id);

  // 6. Prompt
  const allowedNames = [playerName, ...teammates];
  const allowedNamesStr = allowedNames.map((n) => `"${n}"`).join(", ");
  const perfStr = perf
    ? `rating ${Number(perf.rating).toFixed(1)}, ${perf.goals} gól(ů), ${perf.assists} asist., ${perf.minutes_played} min`
    : "v tomto kole nenastoupil (nehrál)";
  const opponentLine = opponentName
    ? `${opponentName}${opponentManagerName ? ` (trenér ${opponentManagerName})` : ""}`
    : "(soupeř neznámý)";
  const relationHint = relation && relation.heat >= 40
    ? ` Vztah klubů je VYHROCENÝ (${relation.label}) — klidně si do soupeře pořádně rýpni.`
    : relation && relation.respect >= 30
      ? ` Kluby se respektují (${relation.label}) — špičkování ať je kamarádské, ne jedovaté.`
      : "";

  const prompt = `Jsi bulvárnější redaktor Okresního zpravodaje — regionálního plátku, který žije vesnickým fotbalem.
Udělej krátký rozhovor s hráčem ${playerName} z týmu ${teamRow.name} po ${gameWeek}. kole a sestav z něj novinový článek.

🚨 ABSOLUTNÍ ZÁKAZ HALUCINACÍ — DŮLEŽITĚJŠÍ NEŽ COKOLI JINÉHO:
- Jediná povolená jména hráčů: ${allowedNamesStr}. Žádné jiné jméno hráče nepoužívej.
- Jediný povolený soupeř: "${opponentName ?? "(žádný)"}".${opponentManagerName ? ` Jediný povolený trenér soupeře: "${opponentManagerName}".` : " Jméno trenéra soupeře NEMÁŠ — žádné nevymýšlej."}
- NIKDY nevymýšlej čísla, skóre, góly ani statistiky mimo to, co je v kontextu níže.
- Když nemáš konkrétní fakt, napiš to obecněji — to je VŽDY lepší než si něco vycucat.

HRÁČ:
- Jméno: ${playerName}${player.nickname ? ` (přezdívka „${player.nickname}")` : ""}, ${player.age} let, pozice ${player.position}
${occupation ? `- V civilu: ${occupation}` : ""}
- Výkon v ${gameWeek}. kole: ${perfStr}
- Tým ${teamRow.name}: ${myStanding ? `${myStanding.pos}. místo, ${myStanding.points} bodů` : "(pozice neznámá)"}, forma ${form}
- Výsledek kola: ${resultStr ?? "(neznámý)"}
- Soupeř: ${opponentLine}
${teammates.length ? `- Spoluhráči (povolená jména do kabinového rýpnutí): ${teammates.join(", ")}` : ""}

STYL A OBSAH:
- Er-forma (ne otázka/odpověď), 180–280 slov, klíčové výroky hráče v uvozovkách.
- VTIP a NADSÁZKA jsou žádoucí — hospodský humor, lokální kolorit, ironie.
- ŠPIČKOVÁNÍ je vítané: hráč si může rýpnout do soupeře nebo jeho trenéra,${opponentManagerName ? " klidně jmenovitě," : ""} nebo zašťouchnout do spoluhráče v kabině (jen z povolených jmen).${relationHint}
- Peprné a pikantní výroky neškrtej, sprostá slova změkči do bulvárního jazyka, ale pointu zachovej.
- Čeština, bez markdown.

Vyber také NÁLADU (mood), jaký dopad bude mít rozhovor na kabinu:
- "boost" = hráč nakopl tým, šíří sebevědomí a dobrou náladu
- "rivalry" = hráč si rýpl do soupeře / jeho trenéra (přiostřená rivalita mezi kluby)
- "kabina_drama" = hráč šťouchl do spoluhráče nebo trenéra, v kabině to zajiskří
- "klid" = nic kontroverzního, smířlivý tón

Odpověz POUZE valid JSON:
{
  "headline": "<chytlavý titulek, max 80 znaků, klidně s hláškou hráče>",
  "article": "<tělo článku v er-formě, 180–280 slov>",
  "mood": "boost | rivalry | kabina_drama | klid",
  "moodReason": "<1 věta — co konkrétně v rozhovoru vyvolá tuhle reakci kabiny>"
}`;

  // 7. Gemini + parse
  const text = await callGemini(geminiApiKey, prompt);
  if (!text) return { created: false, reason: "gemini empty" };

  let parsed: GeminiOutput;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    logger.warn({ module: "player-interview" }, "JSON parse failed", { snippet: text.slice(0, 200), error: e });
    return { created: false, reason: "invalid json" };
  }

  const headline = parsed.headline?.trim();
  const article = parsed.article?.trim();
  if (!headline || !article) {
    logger.warn({ module: "player-interview" }, "empty headline/article");
    return { created: false, reason: "empty content" };
  }
  const mood: Mood = MOODS.includes(parsed.mood) ? parsed.mood : "klid";

  // 8. Dopad na kabinu + lidský popis (effectNote)
  const { shiftSquadMorale, applyRelationEvent } = await import("../community/manager-relations");
  let effectNote = "";
  try {
    if (mood === "boost") {
      await shiftSquadMorale(db, teamRow.id, 3);
      effectNote = "Kabina ožila (+morálka)";
    } else if (mood === "rivalry") {
      await shiftSquadMorale(db, teamRow.id, 2);
      if (opponentTeamId && opponentName) {
        await applyRelationEvent(db, teamRow.id, opponentTeamId, {
          heat: 6,
          respect: -3,
          icon: "🎤",
          text: `${playerName} (${teamRow.name}) si v rozhovoru rýpl do ${opponentName}`,
        });
      }
      effectNote = opponentName ? `Přiostřeno s ${opponentName}` : "Přiostřená rivalita";
    } else if (mood === "kabina_drama") {
      await shiftSquadMorale(db, teamRow.id, -3);
      // Rýpl do trenéra → klesne vztah hráče k trenérovi
      const reason = (parsed.moodReason ?? "").toLowerCase();
      if (reason.includes("trenér") || reason.includes("kouč") || reason.includes("trener")) {
        await db
          .prepare("UPDATE players SET coach_relationship = MAX(0, MIN(100, coach_relationship - 5)) WHERE id = ?")
          .bind(player.id)
          .run();
      }
      effectNote = "Rozruch v kabině (−morálka)";
    }
  } catch (e) {
    logger.warn({ module: "player-interview" }, "apply effect failed", e);
  }

  // 9. Insert news
  const newsId = crypto.randomUUID();
  const body = JSON.stringify({
    playerId: player.id,
    playerName,
    playerAvatar: safeParse<Record<string, unknown>>(player.avatar, {}),
    position: player.position,
    teamName: teamRow.name,
    article,
    mood,
    effectNote,
  });

  await db
    .prepare(
      `INSERT INTO news (id, league_id, team_id, type, headline, body, game_week, created_at)
       VALUES (?, ?, ?, 'player_interview', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
    )
    .bind(newsId, leagueId, teamRow.id, headline, body, gameWeek)
    .run()
    .catch((e) => {
      logger.warn({ module: "player-interview" }, "insert news", e);
    });

  logger.info(
    { module: "player-interview" },
    `created league=${leagueId} week=${gameWeek} player=${player.id} team=${teamRow.id} mood=${mood}`,
  );

  // 10. Notifikace lidským týmům v lize (konverzace "Redakce Zpravodaje")
  try {
    const humanTeams = await db
      .prepare("SELECT id FROM teams WHERE league_id = ? AND user_id != 'ai'")
      .bind(leagueId)
      .all<{ id: string }>();

    const smsBody = `🎤 Nový rozhovor ve Zpravodaji: „${headline}"`;
    for (const t of humanTeams.results) {
      const conv = await db
        .prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = 'Redakce Zpravodaje'")
        .bind(t.id)
        .first<{ id: string }>()
        .catch((e) => {
          logger.warn({ module: "player-interview" }, "fetch conv", e);
          return null;
        });

      let convId = conv?.id;
      if (!convId) {
        convId = crypto.randomUUID();
        await db
          .prepare(
            "INSERT INTO conversations (id, team_id, type, title, unread_count, last_message_text, last_message_at) VALUES (?, ?, 'system', 'Redakce Zpravodaje', 1, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
          )
          .bind(convId, t.id, smsBody.slice(0, 100))
          .run()
          .catch((e) => logger.warn({ module: "player-interview" }, "create conv", e));
      }

      if (convId) {
        await db
          .prepare(
            "INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', 'Redakce Zpravodaje', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
          )
          .bind(crypto.randomUUID(), convId, smsBody)
          .run()
          .catch((e) => logger.warn({ module: "player-interview" }, "send msg", e));
        await db
          .prepare(
            "UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
          )
          .bind(smsBody.slice(0, 100), convId)
          .run()
          .catch((e) => logger.warn({ module: "player-interview" }, "update conv", e));
      }
    }
  } catch (e) {
    logger.warn({ module: "player-interview" }, "notifications failed", e);
  }

  return { created: true };
}
