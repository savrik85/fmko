/**
 * Propagační článek — Gemini generuje lákavý text pro domácí zápas.
 * Volá se z POST /api/teams/:teamId/matches/:matchId/promote.
 * Fallback na statický pool v matches.ts pokud AI selže.
 */

import { calculateStandings } from "../stats/standings";
import { logger } from "../lib/logger";
import { VILLAGE_FLAVOR, WEATHER_CZ } from "./ai-reporter";

interface TopPlayer {
  name: string;
  position: string;
  rating: number;
  age: number;
  isCelebrity: boolean;
  celebrityLabel?: string;
}

interface InjuredPlayer {
  name: string;
  position: string;
  reason: string;
}

interface TeamFormEntry {
  result: "W" | "D" | "L";
}

/**
 * Načte top N hráčů týmu podle `overall_rating` (bez zraněných).
 */
async function loadTopPlayers(
  db: D1Database,
  teamId: string,
  limit = 5,
): Promise<TopPlayer[]> {
  const rows = await db
    .prepare(
      `SELECT p.id, p.first_name, p.last_name, p.position, p.age, p.overall_rating,
              p.is_celebrity, p.personality
       FROM players p
       WHERE p.team_id = ?
         AND p.id NOT IN (
           SELECT player_id FROM injuries WHERE team_id = ? AND days_remaining > 0
         )
       ORDER BY p.overall_rating DESC
       LIMIT ?`,
    )
    .bind(teamId, teamId, limit)
    .all<{
      id: string;
      first_name: string;
      last_name: string;
      position: string;
      age: number;
      overall_rating: number;
      is_celebrity: number;
      personality: string | null;
    }>()
    .catch((e) => {
      logger.warn({ module: "promo-generator" }, "load top players", e);
      return { results: [] };
    });

  return (rows.results ?? []).map((r) => {
    let celebrityLabel: string | undefined;
    if (r.is_celebrity === 1 && r.personality) {
      try {
        const p = JSON.parse(r.personality);
        const tierLabels: Record<string, string> = {
          S: "bývalá legenda",
          A: "bývalý prvoligový hráč",
          B: "bývalý druholigový hráč",
          C: "krajský přeborník",
        };
        if (p.celebrityType === "legend") celebrityLabel = tierLabels[p.celebrityTier] ?? "známá tvář";
        else if (p.celebrityType === "fallen_star") celebrityLabel = "pád profíka";
        else if (p.celebrityType === "glass_man") celebrityLabel = "talent zastavený zraněními";
      } catch {
        /* ignore */
      }
    }
    return {
      name: `${r.first_name} ${r.last_name}`,
      position: r.position,
      rating: r.overall_rating,
      age: r.age,
      isCelebrity: r.is_celebrity === 1,
      celebrityLabel,
    };
  });
}

/**
 * Načte aktuálně zraněné klíčové hráče (top rating > 60 nebo celebrita).
 */
async function loadInjuredKeyPlayers(
  db: D1Database,
  teamId: string,
): Promise<InjuredPlayer[]> {
  const rows = await db
    .prepare(
      `SELECT p.first_name, p.last_name, p.position, p.overall_rating, p.is_celebrity,
              i.type as injury_type, i.severity
       FROM injuries i
       JOIN players p ON p.id = i.player_id
       WHERE i.team_id = ? AND i.days_remaining > 0
       ORDER BY p.overall_rating DESC`,
    )
    .bind(teamId)
    .all<{
      first_name: string;
      last_name: string;
      position: string;
      overall_rating: number;
      is_celebrity: number;
      injury_type: string;
      severity: string;
    }>()
    .catch((e) => {
      logger.warn({ module: "promo-generator" }, "load injuries", e);
      return { results: [] };
    });

  const severityLabel: Record<string, string> = {
    lehke: "lehké zranění",
    stredni: "zranění",
    tezke: "těžké zranění",
  };

  return (rows.results ?? [])
    .filter((r) => r.overall_rating >= 60 || r.is_celebrity === 1)
    .slice(0, 4)
    .map((r) => ({
      name: `${r.first_name} ${r.last_name}`,
      position: r.position,
      reason: `${severityLabel[r.severity] ?? "zranění"} (${r.injury_type})`,
    }));
}

/**
 * Spočte formu týmu — posledních 5 simulated zápasů jako pole výsledků.
 */
async function loadForm(db: D1Database, teamId: string): Promise<TeamFormEntry[]> {
  const rows = await db
    .prepare(
      `SELECT home_team_id, home_score, away_score FROM matches
       WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'
       ORDER BY simulated_at DESC LIMIT 5`,
    )
    .bind(teamId, teamId)
    .all<{ home_team_id: string; home_score: number; away_score: number }>()
    .catch((e) => {
      logger.warn({ module: "promo-generator" }, "load form", e);
      return { results: [] };
    });

  return (rows.results ?? [])
    .map((r) => {
      const isHome = r.home_team_id === teamId;
      const my = isHome ? r.home_score : r.away_score;
      const opp = isHome ? r.away_score : r.home_score;
      if (my > opp) return { result: "W" as const };
      if (my < opp) return { result: "L" as const };
      return { result: "D" as const };
    })
    .reverse(); // chronologicky od nejstaršího
}

/**
 * Hlavní entry point — načte kontext, zavolá Gemini, vrátí { headline, body } nebo null.
 */
export async function generatePromotionalArticle(
  db: D1Database,
  geminiApiKey: string | undefined,
  matchId: string,
  homeTeamId: string,
): Promise<{ headline: string; body: string } | null> {
  if (!geminiApiKey) {
    logger.warn({ module: "promo-generator" }, "no gemini key, skipping AI generation");
    return null;
  }

  // 1. Match metadata — home/away teams, stadium, scheduled_at
  const match = await db
    .prepare(
      `SELECT m.id, m.home_team_id, m.away_team_id, m.league_id, sc.scheduled_at,
              ht.name as home_name, ht.stadium_name, ht.league_id as league_id2,
              at.name as away_name,
              hv.name as home_village, hv.size as home_size, hv.population as home_pop, hv.district as home_district,
              av.name as away_village, av.size as away_size,
              s.capacity as stadium_capacity
       FROM matches m
       JOIN teams ht ON m.home_team_id = ht.id
       JOIN teams at ON m.away_team_id = at.id
       LEFT JOIN villages hv ON ht.village_id = hv.id
       LEFT JOIN villages av ON at.village_id = av.id
       LEFT JOIN season_calendar sc ON sc.id = m.calendar_id
       LEFT JOIN stadiums s ON s.team_id = ht.id
       WHERE m.id = ?`,
    )
    .bind(matchId)
    .first<{
      home_team_id: string;
      away_team_id: string;
      league_id: string;
      league_id2: string;
      scheduled_at: string | null;
      home_name: string;
      stadium_name: string | null;
      away_name: string;
      home_village: string;
      home_size: string;
      home_pop: number;
      home_district: string;
      away_village: string;
      away_size: string;
      stadium_capacity: number | null;
    }>()
    .catch((e) => {
      logger.warn({ module: "promo-generator" }, "load match for promo", e);
      return null;
    });

  if (!match) return null;

  // 2. Standings pro obě týmy
  const leagueId = match.league_id ?? match.league_id2;
  const standings = await calculateStandings(db, leagueId).catch((e) => {
    logger.warn({ module: "promo-generator" }, "calculate standings", e);
    return [];
  });
  const homeStand = standings.find((s) => s.teamId === match.home_team_id);
  const awayStand = standings.find((s) => s.teamId === match.away_team_id);

  // 3. Top hráči domácích
  const topPlayers = await loadTopPlayers(db, match.home_team_id, 5);

  // 4. Zranění klíčových hráčů
  const injured = await loadInjuredKeyPlayers(db, match.home_team_id);

  // 5. Forma obou týmů
  const [homeForm, awayForm] = await Promise.all([
    loadForm(db, match.home_team_id),
    loadForm(db, match.away_team_id),
  ]);

  // 6. Village flavor
  const homeFlavor = VILLAGE_FLAVOR[match.home_village] ?? "tradiční česká obec se smyslem pro fotbal";
  const awayFlavor = VILLAGE_FLAVOR[match.away_village] ?? "";

  const isPraha = match.home_district === "Praha";
  const localHint = isPraha
    ? "Piš jako pražský čtvrťový reportér — zmiňuj tramvaje, hospody, atmosféru."
    : "Piš jako reportér z okresu, co zná každého v obci.";

  // 7. Formátování kontextu pro prompt
  const formStr = (f: TeamFormEntry[]) => f.map((e) => e.result).join("") || "bez zápasů";
  const topStr = topPlayers
    .map((p) => {
      const celeb = p.celebrityLabel ? ` — ${p.celebrityLabel}` : "";
      return `  - ${p.name} (${p.position}, ${p.age} let, rating ${p.rating})${celeb}`;
    })
    .join("\n");
  const injuredStr = injured.length > 0
    ? injured.map((i) => `  - ${i.name} (${i.position}, ${i.reason})`).join("\n")
    : "  žádné klíčové absence";

  const stadiumName = match.stadium_name ?? `stadion v ${match.home_village}`;
  const capacity = match.stadium_capacity ?? 200;

  const prompt = `Jsi sportovní komentátor ${isPraha ? "pražského" : "okresního"} fotbalu. Napiš krátký propagační článek
(maximálně 150 slov) z pohledu domácího týmu ${match.home_name}, který zve fanoušky
na nadcházející zápas s ${match.away_name}. Má být lákavý, motivující a realistický pro
úroveň okresního fotbalu — ne bombastický.

STRIKTNĚ:
- Bez uvozovek kolem textu, bez markdown, bez "Titulek:" ani "Headline:"
- První řádek = headline (max 90 znaků)
- Od druhého řádku = body (max 150 slov)
- Čeština, lehký humor, živý jazyk
- NEVYMÝŠLEJ čísla — použij jen ta v kontextu níže
- Pokud chybí klíčový hráč (zranění), zmiň to stručně jako motivaci „i přes oslabení"
- ${localHint}

KONTEXT ZÁPASU:
Datum: ${match.scheduled_at ?? "blízká budoucnost"}

DOMÁCÍ: ${match.home_name}
  Obec: ${match.home_village} (${match.home_pop} obyv.) — ${homeFlavor}
  Stadion: ${stadiumName}, kapacita ${capacity}
  Pozice v tabulce: ${homeStand ? `${homeStand.pos}. místo, ${homeStand.points} bodů (${homeStand.wins}V ${homeStand.draws}R ${homeStand.losses}P, skóre ${homeStand.gf}:${homeStand.ga})` : "start sezóny"}
  Forma (posledních 5): ${formStr(homeForm)}
  Klíčoví hráči:
${topStr || "  (nedostatek dat)"}
  Zranění / absence klíčových hráčů:
${injuredStr}

HOSTÉ: ${match.away_name}
  Obec: ${match.away_village}${awayFlavor ? ` — ${awayFlavor}` : ""}
  Pozice v tabulce: ${awayStand ? `${awayStand.pos}. místo, ${awayStand.points} bodů` : "start sezóny"}
  Forma: ${formStr(awayForm)}
`;

  // 8. Volání Gemini
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.9,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  ).catch((e) => {
    logger.warn({ module: "promo-generator" }, "gemini fetch failed", e);
    return null;
  });

  if (!res || !res.ok) {
    const errBody = res ? await res.text().catch(() => "") : "";
    logger.warn({ module: "promo-generator" }, `Gemini API error: ${res?.status} — ${errBody.slice(0, 200)}`);
    return null;
  }

  const json = (await res.json().catch((e) => {
    logger.warn({ module: "promo-generator" }, "parse gemini response", e);
    return null;
  })) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  } | null;
  if (!json) return null;

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const text = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("");
  if (!text) {
    logger.warn({ module: "promo-generator" }, "Gemini returned empty response");
    return null;
  }

  // 9. Parsování: první řádek = headline, zbytek = body
  const lines = text.trim().split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;
  const headline = lines[0]
    .replace(/^#+\s*/, "")
    .replace(/^\*+/, "")
    .replace(/\*+$/, "")
    .replace(/^["„]|["""]$/g, "")
    .trim();
  const body = lines
    .slice(1)
    .map((l) => l.replace(/^\*+/, "").replace(/\*+$/, "").trim())
    .filter(Boolean)
    .join("\n");

  if (!headline || !body) {
    logger.warn({ module: "promo-generator" }, "could not parse headline/body");
    return null;
  }

  return { headline, body };
}
