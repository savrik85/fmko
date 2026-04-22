/**
 * Round summary — po skončení kola: AI vybere Hráče a Trenéra kola a napíše článek.
 *
 * Flow:
 *   1. Idempotency (round_awards UNIQUE league_id+game_week)
 *   2. SQL — TOP 10 kandidátů hráčů + všechny výsledky kola + aktuální tabulka
 *   3. Gemini prompt — vrátí structured JSON s výběrem + článkem
 *   4. Validace (vybraný ID musí být v kandidátech)
 *   5. Insert do news + round_awards + push notifikace lidským týmům
 */

import { calculateStandings } from "../stats/standings";
import { logger } from "../lib/logger";

interface PlayerCandidate {
  playerId: string;
  firstName: string;
  lastName: string;
  position: string;
  teamId: string;
  teamName: string;
  rating: number;
  goals: number;
  assists: number;
  minutesPlayed: number;
  ownScore: number;
  oppScore: number;
  oppTeamName: string;
  oppTeamId: string;
  isHome: boolean;
}

interface MatchResult {
  homeTeamId: string;
  awayTeamId: string;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  homeManagerName: string | null;
  awayManagerName: string | null;
}

interface GeminiOutput {
  playerOfRoundId: string;
  playerReason: string;
  managerOfRoundTeamId: string;
  managerReason: string;
  headline: string;
  body: string;
}

export async function generateRoundSummary(
  db: D1Database,
  geminiApiKey: string,
  calendarId: string,
): Promise<{ awarded: boolean; reason?: string }> {
  // 1. Load calendar info
  const cal = await db.prepare(
    "SELECT league_id, game_week FROM season_calendar WHERE id = ?"
  ).bind(calendarId).first<{ league_id: string; game_week: number }>()
    .catch((e) => { logger.warn({ module: "round-summary" }, "load calendar", e); return null; });
  if (!cal) return { awarded: false, reason: "calendar not found" };

  const { league_id: leagueId, game_week: gameWeek } = cal;

  // 2. Idempotency
  const existing = await db.prepare(
    "SELECT id FROM round_awards WHERE league_id = ? AND game_week = ?"
  ).bind(leagueId, gameWeek).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: "round-summary" }, "idempotency check", e); return null; });
  if (existing) {
    logger.info({ module: "round-summary" }, `skip — already generated for league ${leagueId} week ${gameWeek}`);
    return { awarded: false, reason: "already exists" };
  }

  // 3. Load candidates (TOP 10 hráčů)
  const candidateRows = await db.prepare(`
    SELECT mps.player_id, p.first_name, p.last_name, p.position as player_pos,
           p.team_id, t.name as team_name,
           mps.rating, mps.goals, mps.assists, mps.minutes_played,
           m.home_team_id, m.away_team_id, m.home_score, m.away_score,
           ht.name as home_name, at.name as away_name
    FROM match_player_stats mps
    JOIN players p ON p.id = mps.player_id
    JOIN teams t ON t.id = p.team_id
    JOIN matches m ON m.id = mps.match_id
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    WHERE m.calendar_id = ? AND m.status = 'simulated'
    ORDER BY mps.rating DESC, mps.goals DESC, mps.assists DESC
    LIMIT 10
  `).bind(calendarId).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "round-summary" }, "load candidates", e); return { results: [] as Record<string, unknown>[] }; });

  if (candidateRows.results.length === 0) {
    logger.info({ module: "round-summary" }, `no candidates for calendar ${calendarId}`);
    return { awarded: false, reason: "no candidates" };
  }

  const candidates: PlayerCandidate[] = candidateRows.results.map((r) => {
    const isHome = r.team_id === r.home_team_id;
    return {
      playerId: r.player_id as string,
      firstName: r.first_name as string,
      lastName: r.last_name as string,
      position: r.player_pos as string,
      teamId: r.team_id as string,
      teamName: r.team_name as string,
      rating: Number(r.rating),
      goals: Number(r.goals ?? 0),
      assists: Number(r.assists ?? 0),
      minutesPlayed: Number(r.minutes_played ?? 90),
      ownScore: Number(isHome ? r.home_score : r.away_score),
      oppScore: Number(isHome ? r.away_score : r.home_score),
      oppTeamName: (isHome ? r.away_name : r.home_name) as string,
      oppTeamId: (isHome ? r.away_team_id : r.home_team_id) as string,
      isHome,
    };
  });

  // 4. Load všechny výsledky kola
  const matchRows = await db.prepare(`
    SELECT m.home_team_id, m.away_team_id, m.home_score, m.away_score,
           ht.name as home_name, at.name as away_name,
           mh.name as home_manager_name, ma.name as away_manager_name
    FROM matches m
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    LEFT JOIN managers mh ON mh.team_id = ht.id
    LEFT JOIN managers ma ON ma.team_id = at.id
    WHERE m.calendar_id = ? AND m.status = 'simulated'
  `).bind(calendarId).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "round-summary" }, "load results", e); return { results: [] as Record<string, unknown>[] }; });

  const results: MatchResult[] = matchRows.results.map((r) => ({
    homeTeamId: r.home_team_id as string,
    awayTeamId: r.away_team_id as string,
    homeName: r.home_name as string,
    awayName: r.away_name as string,
    homeScore: Number(r.home_score ?? 0),
    awayScore: Number(r.away_score ?? 0),
    homeManagerName: (r.home_manager_name as string | null) ?? null,
    awayManagerName: (r.away_manager_name as string | null) ?? null,
  }));

  // 5. Load standings + leagueName
  const standings = await calculateStandings(db, leagueId);
  const teamNameMap = new Map<string, string>();
  for (const mr of results) {
    teamNameMap.set(mr.homeTeamId, mr.homeName);
    teamNameMap.set(mr.awayTeamId, mr.awayName);
  }
  const posMap = new Map(standings.map((s) => [s.teamId, s.pos]));

  const leagueRow = await db.prepare("SELECT name FROM leagues WHERE id = ?").bind(leagueId).first<{ name: string }>()
    .catch((e) => { logger.warn({ module: "round-summary" }, "load league", e); return null; });
  const leagueName = leagueRow?.name ?? "Liga";

  // 6. Build prompt
  const playerLines = candidates.map((c) => {
    const myPos = posMap.get(c.teamId);
    const oppPos = posMap.get(c.oppTeamId);
    const outcome = c.ownScore > c.oppScore ? "výhra" : c.ownScore < c.oppScore ? "prohra" : "remíza";
    const upset = myPos != null && oppPos != null && c.ownScore > c.oppScore && myPos - oppPos >= 3
      ? " ⚡ UPSET"
      : "";
    return `- [player_id=${c.playerId}] ${c.firstName} ${c.lastName} (${c.position}, ${c.teamName}${myPos ? ` [${myPos}.]` : ""}) — rating ${c.rating.toFixed(1)}, ${c.goals} gól(ů), ${c.assists} asist., ${c.minutesPlayed} min. Zápas: ${outcome} ${c.ownScore}:${c.oppScore} ${c.isHome ? "doma vs" : "venku u"} ${c.oppTeamName}${oppPos ? ` [${oppPos}.]` : ""}${upset}`;
  });

  const resultLines = results.map((r) => {
    const hPos = posMap.get(r.homeTeamId);
    const aPos = posMap.get(r.awayTeamId);
    const homeMgr = r.homeManagerName ? ` — trenér ${r.homeManagerName}` : "";
    const awayMgr = r.awayManagerName ? ` / ${r.awayManagerName}` : "";
    const upset = hPos != null && aPos != null && (
      (r.homeScore > r.awayScore && hPos - aPos >= 3) ||
      (r.awayScore > r.homeScore && aPos - hPos >= 3)
    ) ? " ⚡ UPSET" : "";
    return `- [team_home=${r.homeTeamId}] ${r.homeName}${hPos ? ` (${hPos}.)` : ""} ${r.homeScore}:${r.awayScore} ${r.awayName}${aPos ? ` (${aPos}.)` : ""} [team_away=${r.awayTeamId}]${homeMgr}${awayMgr}${upset}`;
  });

  const standingsLines = standings.slice(0, 12).map((s) =>
    `${s.pos}. ${teamNameMap.get(s.teamId) ?? s.teamId} — ${s.points} bodů (${s.gf}:${s.ga})`
  );

  const prompt = `Jsi sportovní redaktor. Po ${gameWeek}. kole ${leagueName} vyhlásíš Hráče a Trenéra kola — STRUČNĚ, žádný obsáhlý článek o celém kole (ten má zpravodaj už jinde).

KANDIDÁTI NA HRÁČE KOLA (TOP 10 dle ratingu):
${playerLines.join("\n")}

VÝSLEDKY KOLA (pro kontext výběru trenéra):
${resultLines.join("\n")}

ÚKOL:
Vyber 1 HRÁČE KOLA a 1 TRENÉRA KOLA. Zohledni kontext — UPSET, hrdinský výkon z horšího týmu, dramatický obrat — ne jen nejvyšší rating.

Odpověz POUZE valid JSON:
{
  "playerOfRoundId": "<player_id z kandidátů>",
  "playerReason": "<1 věta>",
  "managerOfRoundTeamId": "<team_id z výsledků>",
  "managerReason": "<1 věta>",
  "headline": "<krátký titulek, max 8 slov, např. 'Hráč a trenér 17. kola'>",
  "body": "<tělo 60-100 slov. JEN 2 odstavce: prvně vyhlásíš Hráče kola s krátkým odůvodněním, druhý odstavec Trenéra kola. Žádné výsledky zápasů, žádná tabulka, žádné další hráče.>"
}

PRAVIDLA:
- playerOfRoundId a managerOfRoundTeamId MUSÍ být doslova z uvedených seznamů
- body je KRÁTKÝ (60-100 slov) — vyhlášení, ne článek o kole
- Žádné jiné hráče než oceněného
- Česky, přirozený tón`;

  // 7. Call Gemini
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.4,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
        },
      }),
    },
  ).catch((e) => { logger.warn({ module: "round-summary" }, "gemini fetch failed", e); return null; });

  if (!res || !res.ok) {
    const errBody = res ? await res.text().catch(() => "") : "";
    logger.warn({ module: "round-summary" }, `Gemini error: ${res?.status ?? "no response"} — ${errBody.slice(0, 200)}`);
    return { awarded: false, reason: "gemini http error" };
  }

  const json = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  };
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const text = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
  if (!text) {
    logger.warn({ module: "round-summary" }, "Gemini returned empty");
    return { awarded: false, reason: "gemini empty" };
  }

  // 8. Parse JSON (strict)
  let parsed: GeminiOutput;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    logger.warn({ module: "round-summary" }, "Gemini JSON parse failed", { snippet: text.slice(0, 200), error: e });
    return { awarded: false, reason: "invalid json" };
  }

  // 9. Validation
  const candidateIds = new Set(candidates.map((c) => c.playerId));
  const teamIdsInRound = new Set(results.flatMap((r) => [r.homeTeamId, r.awayTeamId]));

  if (!parsed.playerOfRoundId || !candidateIds.has(parsed.playerOfRoundId)) {
    logger.warn({ module: "round-summary" }, `invalid playerOfRoundId: ${parsed.playerOfRoundId}`);
    return { awarded: false, reason: "invalid player id" };
  }
  if (!parsed.managerOfRoundTeamId || !teamIdsInRound.has(parsed.managerOfRoundTeamId)) {
    logger.warn({ module: "round-summary" }, `invalid managerOfRoundTeamId: ${parsed.managerOfRoundTeamId}`);
    return { awarded: false, reason: "invalid manager team id" };
  }
  if (!parsed.headline?.trim() || !parsed.body?.trim()) {
    logger.warn({ module: "round-summary" }, "headline or body empty");
    return { awarded: false, reason: "empty headline/body" };
  }

  // 10. Insert news + round_awards
  const newsId = crypto.randomUUID();
  const awardId = crypto.randomUUID();

  await db.prepare(
    "INSERT INTO news (id, league_id, type, headline, body, game_week, created_at) VALUES (?, ?, 'round_summary', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
  ).bind(newsId, leagueId, parsed.headline.trim(), parsed.body.trim(), gameWeek).run()
    .catch((e) => { logger.warn({ module: "round-summary" }, "insert news", e); });

  await db.prepare(
    `INSERT INTO round_awards (id, league_id, calendar_id, game_week,
       player_of_round_id, manager_of_round_team_id,
       player_reason, manager_reason, news_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`
  ).bind(
    awardId, leagueId, calendarId, gameWeek,
    parsed.playerOfRoundId, parsed.managerOfRoundTeamId,
    parsed.playerReason ?? "", parsed.managerReason ?? "", newsId,
  ).run()
    .catch((e) => { logger.warn({ module: "round-summary" }, "insert round_awards", e); });

  logger.info({ module: "round-summary" }, `awarded league=${leagueId} week=${gameWeek} player=${parsed.playerOfRoundId} managerTeam=${parsed.managerOfRoundTeamId}`);

  // 11. Push notifikace lidským týmům
  try {
    const humanTeams = await db.prepare(
      "SELECT t.id FROM teams t WHERE t.league_id = ? AND t.user_id != 'ai'"
    ).bind(leagueId).all<{ id: string }>();

    const smsBody = `🏆 Vyšel přehled ${gameWeek}. kola: „${parsed.headline.trim()}"`;
    for (const t of humanTeams.results) {
      const tid = t.id;
      const conv = await db.prepare(
        "SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = 'Redakce Zpravodaje'"
      ).bind(tid).first<{ id: string }>()
        .catch((e) => { logger.warn({ module: "round-summary" }, "fetch conv", e); return null; });

      let convId = conv?.id;
      if (!convId) {
        convId = crypto.randomUUID();
        await db.prepare(
          "INSERT INTO conversations (id, team_id, type, title, unread_count, last_message_text, last_message_at) VALUES (?, ?, 'system', 'Redakce Zpravodaje', 1, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
        ).bind(convId, tid, smsBody.slice(0, 100)).run()
          .catch((e) => logger.warn({ module: "round-summary" }, "create conv", e));
      }

      if (convId) {
        await db.prepare(
          "INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', 'Redakce Zpravodaje', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
        ).bind(crypto.randomUUID(), convId, smsBody).run()
          .catch((e) => logger.warn({ module: "round-summary" }, "send msg", e));
        await db.prepare(
          "UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?"
        ).bind(smsBody.slice(0, 100), convId).run()
          .catch((e) => logger.warn({ module: "round-summary" }, "update conv", e));
      }
    }
  } catch (e) {
    logger.warn({ module: "round-summary" }, "notifications failed", e);
  }

  return { awarded: true };
}
