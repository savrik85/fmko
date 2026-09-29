import { Hono } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";

/**
 * Veřejná data pro vstupní stránku: čísla ze hry, poslední výsledky a titulky zpravodaje.
 * Bez přihlášení, proto jen rubriky o vymyšlených hráčích a bez titulků se jménem
 * skutečného manažera. Výsledek se drží 10 minut v KV, stránku může navštívit hodně lidí z reklamy.
 */
export const publicLandingRouter = new Hono<{ Bindings: Bindings }>();

const CACHE_KEY = "public-landing:v2";
const CACHE_TTL_S = 600;
/** Rubriky psané o vymyšlených hráčích a klubech, ne o lidech za klávesnicí. */
const SAFE_NEWS_TYPES = ["ai_report", "player_interview", "ultras_report", "season_wrap", "celebrity_arrival", "legend_farewell"];

export interface LandingData {
  stats: { matches: number; players: number; villages: number; districts: number };
  results: Array<{ home: string; away: string; homeScore: number; awayScore: number; league: string; at: string }>;
  headlines: Array<{ headline: string; league: string; type: string }>;
  districts: Array<{ name: string; villages: number; managers: number; founderFree: boolean }>;
}

/** Slova ze jmen manažerů (4+ znaky), podle kterých se vyřadí titulek. */
export function managerNameTokens(names: Array<string | null>): string[] {
  const tokens = new Set<string>();
  for (const name of names) {
    for (const word of (name ?? "").split(/[\s.,]+/)) {
      if (word.length >= 4) tokens.add(word.toLocaleLowerCase("cs"));
    }
  }
  return [...tokens];
}

export function mentionsManager(headline: string, tokens: string[]): boolean {
  const words = headline.toLocaleLowerCase("cs").split(/[^\p{L}]+/u);
  return tokens.some((t) => words.some((w) => w.startsWith(t)));
}

async function loadLandingData(db: D1Database): Promise<LandingData> {
  const stats = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM matches WHERE status = 'simulated') AS matches,
      (SELECT COUNT(*) FROM players) AS players,
      (SELECT COUNT(*) FROM villages v JOIN district_registrations d ON d.district = v.district AND d.status = 'ready') AS villages,
      (SELECT COUNT(*) FROM district_registrations WHERE status = 'ready') AS districts`)
    .first<LandingData["stats"]>();

  // Jen ligy, kde hrají lidé (aspoň tři kluby), a nejvýš dva zápasy z každé, ať je vidět víc soutěží.
  const results = await db.prepare(`SELECT home, away, homeScore, awayScore, league, at FROM (
      SELECT h.name AS home, a.name AS away, m.home_score AS homeScore, m.away_score AS awayScore,
        l.name AS league, sc.scheduled_at AS at,
        ROW_NUMBER() OVER (PARTITION BY l.id ORDER BY sc.scheduled_at DESC, m.id) AS rn
      FROM matches m
      JOIN season_calendar sc ON sc.id = m.calendar_id
      JOIN leagues l ON l.id = m.league_id AND l.league_type = 'senior'
      JOIN teams h ON h.id = m.home_team_id JOIN teams a ON a.id = m.away_team_id
      WHERE m.status = 'simulated' AND sc.scheduled_at <= ?
        AND (SELECT COUNT(*) FROM teams t WHERE t.league_id = l.id AND t.user_id <> 'ai') >= 3
    ) WHERE rn <= 2 ORDER BY at DESC LIMIT 6`)
    .bind(new Date().toISOString()).all<LandingData["results"][number]>();

  const managers = await db.prepare("SELECT display_name FROM users WHERE display_name IS NOT NULL")
    .all<{ display_name: string | null }>();
  const tokens = managerNameTokens(managers.results.map((m) => m.display_name));
  const news = await db.prepare(`SELECT n.headline, n.type, l.name AS league FROM news n
      JOIN leagues l ON l.id = n.league_id
      WHERE n.type IN (${SAFE_NEWS_TYPES.map(() => "?").join(",")})
      ORDER BY n.created_at DESC LIMIT 40`)
    .bind(...SAFE_NEWS_TYPES).all<LandingData["headlines"][number]>();
  const seen = new Set<string>();
  const headlines = news.results.filter((n) => {
    if (seen.has(n.type) || mentionsManager(n.headline, tokens)) return false;
    seen.add(n.type);
    return true;
  }).slice(0, 4);

  const districts = await db.prepare(`SELECT d.district AS name,
        (SELECT COUNT(*) FROM villages v WHERE v.district = d.district) AS villages,
        (SELECT COUNT(DISTINCT t.user_id) FROM teams t JOIN villages v ON v.id = t.village_id
          WHERE v.district = d.district AND t.user_id <> 'ai' AND COALESCE(t.team_type, 'senior') <> 'u21') AS managers,
        d.founder_request_id IS NULL AND d.founder_team_id IS NULL AS founderFree
      FROM district_registrations d WHERE d.status = 'ready' ORDER BY d.district`)
    .all<{ name: string; villages: number; managers: number; founderFree: number }>();

  return {
    stats: stats ?? { matches: 0, players: 0, villages: 0, districts: 0 },
    // Volný = bez zakladatele i bez lidských klubů; první hráč v něm povede ligu.
    districts: districts.results.map((d) => ({ ...d, founderFree: Boolean(d.founderFree) && d.managers === 0 })),
    results: results.results,
    headlines,
  };
}

publicLandingRouter.get("/landing", async (c) => {
  const cached = await c.env.CACHE_KV.get(CACHE_KEY, "json")
    .catch((e) => { logger.warn({ module: "public-landing" }, "čtení cache", e); return null; });
  if (cached) return c.json(cached);
  const data = await loadLandingData(c.env.DB);
  await c.env.CACHE_KV.put(CACHE_KEY, JSON.stringify(data), { expirationTtl: CACHE_TTL_S })
    .catch((e) => logger.warn({ module: "public-landing" }, "zápis cache", e));
  c.header("Cache-Control", "public, max-age=300");
  return c.json(data);
});
