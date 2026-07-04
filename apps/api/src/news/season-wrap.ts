/**
 * Velký článek o sezóně — ohlédnutí za celou sezónou.
 *
 * Grounded deterministickou "Sezonou v číslech" + finální tabulkou + oceněními
 * (méně halucinací). Fallback na deterministický text když Gemini selže.
 */

import { calculateStandings } from "../stats/standings";
import { computeSeasonStats, seasonStatsToLines } from "../season/season-stats";
import { callGemini } from "./gemini-helper";
import { logger } from "../lib/logger";

export async function generateSeasonWrapArticle(
  db: D1Database,
  geminiApiKey: string | undefined,
  leagueId: string,
  seasonNumber: number,
): Promise<{ created: boolean; reason?: string }> {
  const gameWeek = seasonNumber * 100;

  // Idempotence
  const existing = await db.prepare("SELECT id FROM news WHERE league_id = ? AND type = 'season_wrap' AND game_week = ?")
    .bind(leagueId, gameWeek).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: "season-wrap" }, "idempotency check", e); return null; });
  if (existing) return { created: false, reason: "already exists" };

  const standings = await calculateStandings(db, leagueId);
  if (standings.length === 0) return { created: false, reason: "no standings" };

  const teamRes = await db.prepare("SELECT id, name FROM teams WHERE league_id = ?").bind(leagueId).all()
    .catch((e) => { logger.warn({ module: "season-wrap" }, "load teams", e); return { results: [] as Record<string, unknown>[] }; });
  const teamName = new Map<string, string>();
  for (const t of teamRes.results) teamName.set(t.id as string, t.name as string);

  const leagueRow = await db.prepare("SELECT name FROM leagues WHERE id = ?").bind(leagueId).first<{ name: string }>()
    .catch((e) => { logger.warn({ module: "season-wrap" }, "load league name", e); return null; });
  const leagueName = leagueRow?.name ?? "Liga";

  const aw = await db.prepare("SELECT * FROM season_awards WHERE league_id = ? AND season_number = ?")
    .bind(leagueId, seasonNumber).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "season-wrap" }, "load awards", e); return null; });

  const stats = await computeSeasonStats(db, leagueId, seasonNumber);
  const statLines = seasonStatsToLines(stats);

  const standLines = standings.map((s) =>
    `${s.pos}. ${teamName.get(s.teamId) ?? s.teamId} — ${s.points} b (${s.wins}-${s.draws}-${s.losses}, ${s.gf}:${s.ga})`);

  const champion = standings[0] ? teamName.get(standings[0].teamId) ?? "?" : "?";

  let headline = `Ohlédnutí za ${seasonNumber}. sezónou ${leagueName}`;
  let body = "";

  if (geminiApiKey) {
    const awardLines: string[] = [];
    if (aw?.top_scorer_goals) awardLines.push(`Král střelců nastřílel ${aw.top_scorer_goals} branek.`);
    const prompt = `Jsi sportovní redaktor Okresního zpravodaje. Skončila ${seasonNumber}. sezóna ${leagueName}. Napiš velké ohlédnutí za celou sezónou.

KONEČNÁ TABULKA:
${standLines.join("\n")}

SEZONA V ČÍSLECH (ověřená fakta — používej JEN tato čísla):
${statLines.join("\n")}
${awardLines.length ? awardLines.join("\n") : ""}

ÚKOL: Napiš poutavý článek (220-320 slov) shrnující celou sezónu — kdo vládl, dramatický souboj o titul, překvapení, sestup formy, čísla sezóny. Vyzdvihni mistra (${champion}). Vesnický fotbal, hospodská atmosféra, lehký humor.

PRAVIDLA:
- Používej JEN názvy týmů z tabulky a čísla ze "Sezony v číslech"
- NEVYMÝŠLEJ jména hráčů ani konkrétní výsledky mimo uvedená čísla
- Česky, bez markdown, bez odrážek
- PRVNÍ řádek = chytlavý titulek (max 80 znaků, bez prefixu). Od druhého řádku = tělo článku`;

    const text = await callGemini(geminiApiKey, prompt, { maxOutputTokens: 2048, temperature: 0.6, module: "season-wrap" });
    if (text) {
      const lines = text.split("\n").filter((l) => l.trim().length > 0);
      if (lines.length >= 2) {
        headline = lines[0].replace(/^(titulek|headline|nadpis)\s*:?\s*/i, "").replace(/[*#]/g, "").trim() || headline;
        body = lines.slice(1).join("\n").trim();
      }
    }
  }

  if (!body) {
    // Deterministický fallback
    body = [
      `Sezóna ${leagueName} je u konce a mistrem se stává ${champion}!`,
      `Konečné pořadí:\n${standLines.join("\n")}`,
      `Sezona v číslech:\n${statLines.join("\n")}`,
    ].join("\n\n");
  }

  await db.prepare(
    "INSERT INTO news (id, league_id, type, headline, body, game_week, created_at) VALUES (?, ?, 'season_wrap', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
  ).bind(crypto.randomUUID(), leagueId, headline, body, gameWeek).run()
    .catch((e) => logger.warn({ module: "season-wrap" }, "insert news", e));

  logger.info({ module: "season-wrap" }, `wrap article league=${leagueId} s=${seasonNumber}`);
  return { created: true };
}
