/**
 * Vlastní článek admina do Zpravodaje okresu (třeba když se trenér odporoučí a klub
 * se uvolní pro nového hráče). Vyjde jako zpráva „Z okresu“, která je týden nahoře nad
 * úvodníkem, ve všech běžících seniorských ligách okresu. Čekající liga (zavřená IV. třída)
 * a U21 ho nedostanou, okresní pohled ve Zpravodaji ho podle titulku ukáže jednou.
 */

import { logger } from "../lib/logger";

const M = "district-article";
const MAX_HEADLINE = 200;
const MAX_BODY = 4000;

export interface DistrictArticleInput {
  district: string;
  headline: string;
  body: string;
  /** Klub, kterého se článek týká (ze Zpravodaje se z něj jde na profil). */
  teamId?: string | null;
}

export type DistrictArticleResult =
  | { ok: true; dryRun: boolean; headline: string; body: string; leagues: Array<{ id: string; name: string }> }
  | { ok: false; error: string };

/** V textech pro hráče se dlouhá pomlčka nepoužívá, nahradí se čárkou. */
function cleanText(text: string): string {
  return text.replace(/[ \t]*[—–][ \t]*/g, ", ").replace(/[ \t]+\n/g, "\n").trim();
}

export async function publishDistrictArticle(
  db: D1Database, input: DistrictArticleInput, opts: { dryRun?: boolean },
): Promise<DistrictArticleResult> {
  const district = input.district?.trim() ?? "";
  const headline = cleanText(input.headline ?? "").slice(0, MAX_HEADLINE);
  const body = cleanText(input.body ?? "").slice(0, MAX_BODY);
  if (!district || !headline || !body) return { ok: false, error: "Chybí okres, titulek nebo text" };

  const season = await db.prepare("SELECT id, number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ id: string; number: number }>();
  if (!season) return { ok: false, error: "Není aktivní sezóna" };

  const leagues = await db.prepare(
    `SELECT id, name FROM leagues
      WHERE district = ? AND season_id = ? AND status = 'active' AND waiting = 0
        AND COALESCE(league_type, 'senior') = 'senior'
      ORDER BY name`,
  ).bind(district, season.id).all<{ id: string; name: string }>();
  if (leagues.results.length === 0) return { ok: false, error: `Okres ${district} nemá běžící seniorskou ligu` };

  const result = { headline, body, leagues: leagues.results };
  if (opts.dryRun) return { ok: true, dryRun: true, ...result };

  await db.batch(leagues.results.map((league) => db.prepare(
    `INSERT INTO news (id, league_id, team_id, type, headline, body, season_number, created_at)
     VALUES (?, ?, ?, 'district_event', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
  ).bind(crypto.randomUUID(), league.id, input.teamId ?? null, headline, body, season.number)));
  logger.info({ module: M }, `článek „${headline}“ v ${leagues.results.length} ligách okresu ${district}`);
  return { ok: true, dryRun: false, ...result };
}
