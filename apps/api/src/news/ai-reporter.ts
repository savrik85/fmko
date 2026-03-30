/**
 * AI Redaktor — generuje zpravodajské články po každém kole přes Gemini.
 */

import { calculateStandings, type StandingEntry } from "../stats/standings";
import { logger } from "../lib/logger";

interface MatchEvent {
  minute: number;
  type: string;
  playerName: string;
  teamId: number;
  description: string;
  detail?: string;
}

const VILLAGE_FLAVOR: Record<string, string> = {
  "Vlachovo Březí": "městečko s barokním zámkem a pivovarem z roku 1670, městská památková zóna",
  "Vimperk": "brána Šumavy, město knihtisku a sklářství, pod gotickým zámkem",
  "Čkyně": "městečko na řece Volyňce z roku 1243, s gotickým kostelem sv. Maří Magdaleny a keltským hradištěm Věnec",
  "Spůle": "malá šumavská vesnička u Čkyně s 60 obyvateli, první zmínka z roku 1544",
  "Bohumilice": "obec v podhůří Šumavy u řeky Volyňky, se zámkem Skalice z roku 1549",
  "Prachatice": "historické město na Zlaté stezce s renesančním náměstím",
  "Netolice": "jedno z nejstarších měst v Čechách (zmínka z roku 981), rodiště zakladatele rybníkářství Štěpánka Netolického",
  "Lhenice": "městys proslulý třešňovými sady, založený roku 1283",
  "Bavorov": "město s gotickým kostelem a zříceninou hradu Helfenburk, proslulé jahodami",
  "Strunkovice nad Blanicí": "městys na řece Blanici, kde místní říkají Mexiko — v roce 1864 se odtud muži vydali bojovat za císaře Maxmiliána",
  "Stachy": "šumavská obec známá běžkařskými tratěmi",
  "Zdíkov": "obec pod Šumavou s tradicí dřevařství",
  "Horní Vltavice": "šumavská obec u pramenů Vltavy",
};

const WEATHER_CZ: Record<string, string> = {
  sunny: "slunečno",
  cloudy: "zataženo",
  rain: "déšť",
  wind: "vítr",
  snow: "sněžení",
};

export async function generateAiRoundReport(
  db: D1Database,
  geminiApiKey: string,
  leagueId: string,
  calendarId: string,
  gameWeek: number,
  standingsBefore: StandingEntry[],
): Promise<void> {
  // 1. Zápasy kola s názvy týmů a obcí
  const matchRows = await db.prepare(
    `SELECT m.id, m.home_score, m.away_score, m.events, m.attendance, m.stadium_name, m.weather, m.pitch_condition,
            t1.name as home_name, t2.name as away_name,
            v1.name as home_village, v2.name as away_village
     FROM matches m
     JOIN teams t1 ON m.home_team_id = t1.id
     JOIN teams t2 ON m.away_team_id = t2.id
     LEFT JOIN villages v1 ON t1.village_id = v1.id
     LEFT JOIN villages v2 ON t2.village_id = v2.id
     WHERE m.calendar_id = ? AND m.status = 'simulated'`
  ).bind(calendarId).all();

  if (matchRows.results.length === 0) return;

  // 2. Individuální statistiky
  const matchIds = matchRows.results.map((m) => m.id as string);
  const placeholders = matchIds.map(() => "?").join(",");
  const statsRows = await db.prepare(
    `SELECT mps.match_id, mps.goals, mps.assists, mps.yellow_cards, mps.red_cards, mps.rating,
            p.first_name, p.last_name, t.name as team_name
     FROM match_player_stats mps
     JOIN players p ON mps.player_id = p.id
     JOIN teams t ON mps.team_id = t.id
     WHERE mps.match_id IN (${placeholders})
     ORDER BY mps.rating DESC`
  ).bind(...matchIds).all();

  // 3. Tabulka po kole
  const standingsAfter = await calculateStandings(db, leagueId);

  // Jména týmů pro tabulku
  const teamNames = await db.prepare(
    "SELECT id, name FROM teams WHERE league_id = ?"
  ).bind(leagueId).all();
  const nameMap: Record<string, string> = {};
  for (const t of teamNames.results) nameMap[t.id as string] = t.name as string;

  // === Sestavení promptu ===

  // Výsledky
  const resultLines: string[] = [];
  for (const m of matchRows.results) {
    const homeName = m.home_name as string;
    const awayName = m.away_name as string;
    const homeVillage = m.home_village as string | null;
    const awayVillage = m.away_village as string | null;
    const hs = m.home_score as number;
    const as_ = m.away_score as number;
    const weather = WEATHER_CZ[(m.weather as string) ?? ""] ?? (m.weather as string);
    const attendance = m.attendance as number | null;
    const stadium = m.stadium_name as string | null;

    // Góly z events
    let events: MatchEvent[] = [];
    try { events = JSON.parse((m.events as string) ?? "[]"); } catch { /* */ }
    const goals = events.filter((e) => e.type === "goal");
    const cards = events.filter((e) => e.type === "card");

    const goalStr = goals.length > 0
      ? goals.map((g) => `${g.playerName} ${g.minute}'`).join(", ")
      : "bez gólů";
    const cardStr = cards.length > 0
      ? cards.map((c) => `${c.playerName} (${c.detail === "red" ? "ČK" : "ŽK"})`).join(", ")
      : "";

    const homeFlavor = homeVillage ? VILLAGE_FLAVOR[homeVillage] : null;
    const awayFlavor = awayVillage ? VILLAGE_FLAVOR[awayVillage] : null;
    const homeDesc = homeFlavor ? ` (${homeVillage} — ${homeFlavor})` : homeVillage ? ` (${homeVillage})` : "";
    const awayDesc = awayFlavor ? ` (${awayVillage} — ${awayFlavor})` : awayVillage ? ` (${awayVillage})` : "";

    let line = `${homeName}${homeDesc} ${hs}:${as_} ${awayName}${awayDesc} — góly: ${goalStr}`;
    if (cardStr) line += `; karty: ${cardStr}`;
    if (attendance) line += `; diváků: ${attendance}`;
    if (stadium) line += `; stadion: ${stadium}`;
    if (weather) line += `; počasí: ${weather}`;

    resultLines.push(line);
  }

  // Tabulka s pohybem
  const beforePosMap: Record<string, number> = {};
  for (const s of standingsBefore) beforePosMap[s.teamId] = s.pos;

  const tableLines: string[] = [];
  for (const s of standingsAfter) {
    const name = nameMap[s.teamId] ?? s.teamId;
    const prevPos = beforePosMap[s.teamId] ?? s.pos;
    const diff = prevPos - s.pos;
    const arrow = diff > 0 ? `↑${diff}` : diff < 0 ? `↓${Math.abs(diff)}` : "=";
    tableLines.push(`${s.pos}. ${name} — ${s.points} bodů, ${s.played} zápasů, skóre ${s.gf}:${s.ga} (${arrow})`);
  }

  // Zajímavosti
  const highlights: string[] = [];

  // Top rating
  const topRated = statsRows.results.filter((r) => (r.rating as number) >= 7.5).slice(0, 3);
  for (const r of topRated) {
    highlights.push(`${r.first_name} ${r.last_name} (${r.team_name}) — rating ${(r.rating as number).toFixed(1)}, ${r.goals} gólů, ${r.assists} asistencí`);
  }

  // Hattrick
  const hatTricks = statsRows.results.filter((r) => (r.goals as number) >= 3);
  for (const h of hatTricks) {
    highlights.push(`HATTRICK: ${h.first_name} ${h.last_name} (${h.team_name}) — ${h.goals} gólů!`);
  }

  // Červené karty
  const redCards = statsRows.results.filter((r) => (r.red_cards as number) > 0);
  for (const rc of redCards) {
    highlights.push(`Červená karta: ${rc.first_name} ${rc.last_name} (${rc.team_name})`);
  }

  const prompt = `Jsi sportovní redaktor okresního zpravodaje v Prachaticích. Napiš článek o ${gameWeek}. kole okresního přeboru.

VÝSLEDKY ${gameWeek}. KOLA:
${resultLines.join("\n")}

TABULKA PO ${gameWeek}. KOLE:
${tableLines.join("\n")}

ZAJÍMAVOSTI:
${highlights.length > 0 ? highlights.join("\n") : "Žádné výrazné individuální výkony"}

Pravidla:
- Piš česky, styl místního okresního zpravodaje, 200-400 slov
- První řádek = titulek článku (bez uvozovek, bez "Titulek:")
- Zbytek = tělo článku
- Vypíchni překvapení, zajímavé výkony, vývoj tabulky
- Piš barvitě s humorem, jako reportér co zná každého v okrese
- Používej místní kolorit — zmiňuj obce, jejich charakter, šumavskou atmosféru
- Nemusíš popsat každý zápas, vyber ty nejzajímavější`;

  // Volání Gemini
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.85 },
      }),
    },
  );

  if (!res.ok) {
    logger.warn({ module: "ai-reporter" }, `Gemini API error: ${res.status} ${res.statusText}`);
    return;
  }

  const json = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    logger.warn({ module: "ai-reporter" }, "Gemini returned empty response");
    return;
  }

  // Parsování: první řádek = headline, zbytek = body
  const lines = text.trim().split("\n");
  const headline = lines[0].replace(/^#+\s*/, "").replace(/^\*+/, "").replace(/\*+$/, "").trim();
  const body = lines.slice(1).join("\n").trim();

  if (!headline || !body) {
    logger.warn({ module: "ai-reporter" }, "Could not parse headline/body from Gemini response");
    return;
  }

  // Uložení do news
  await db.prepare(
    "INSERT INTO news (id, league_id, type, headline, body, game_week, created_at) VALUES (?, ?, 'ai_report', ?, ?, ?, datetime('now'))"
  ).bind(crypto.randomUUID(), leagueId, headline, body, gameWeek).run();

  logger.info({ module: "ai-reporter" }, `AI report generated for game week ${gameWeek}: "${headline}"`);
}
