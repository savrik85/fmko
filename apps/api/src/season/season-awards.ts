/**
 * Ocenění sezóny — Hráč sezóny, Král střelců, Nejlepší jedenáctka,
 * Trenér sezóny, Objev sezóny. + AI článek s vyhlášením.
 *
 * DŮLEŽITÉ: spouštět PŘED odchody hráčů (retired hráči se mažou z players,
 * takže JOIN na players by je z ocenění vynechal). match_player_stats přežívá.
 *
 * Deterministicky: medaile (z tabulky), král střelců, nejlepší XI.
 * AI: výběr hráče/trenéra/objevu sezóny + narativ (s fallbackem na deterministiku).
 */

import { calculateStandings } from "../stats/standings";
import { callGemini } from "../news/gemini-helper";
import { logger } from "../lib/logger";

export interface BestElevenEntry {
  playerId: string;
  name: string;
  position: string;
  teamName: string;
}

export interface SeasonAwards {
  championTeamId: string | null;
  championName: string | null;
  runnerUpTeamId: string | null;
  runnerUpName: string | null;
  thirdTeamId: string | null;
  thirdName: string | null;
  playerOfSeasonId: string | null;
  playerOfSeasonName: string | null;
  topScorerId: string | null;
  topScorerName: string | null;
  topScorerGoals: number;
  managerOfSeasonTeamId: string | null;
  managerOfSeasonName: string | null;
  discoveryId: string | null;
  discoveryName: string | null;
  bestEleven: BestElevenEntry[];
  reasons: { playerOfSeason?: string; managerOfSeason?: string; discovery?: string };
  newsId: string | null;
}

interface PlayerAgg {
  playerId: string;
  name: string;
  position: string;
  age: number;
  teamId: string;
  teamName: string;
  goals: number;
  assists: number;
  avgRating: number;
  apps: number;
}

function composite(p: PlayerAgg): number {
  return p.avgRating + p.goals * 0.08 + p.assists * 0.04 + p.apps * 0.03;
}

function pickBestEleven(players: PlayerAgg[]): BestElevenEntry[] {
  const byPos: Record<string, PlayerAgg[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of players) (byPos[p.position] ?? byPos.MID).push(p);
  for (const k of Object.keys(byPos)) byPos[k].sort((a, b) => composite(b) - composite(a));
  const need: Array<[string, number]> = [["GK", 1], ["DEF", 4], ["MID", 4], ["FWD", 2]];
  const out: BestElevenEntry[] = [];
  for (const [pos, n] of need) {
    for (const p of byPos[pos].slice(0, n)) {
      out.push({ playerId: p.playerId, name: p.name, position: p.position, teamName: p.teamName });
    }
  }
  return out;
}

interface GeminiAwardOut {
  playerOfSeasonId?: string;
  playerReason?: string;
  managerOfSeasonTeamId?: string;
  managerReason?: string;
  discoveryId?: string;
  discoveryReason?: string;
  headline?: string;
  body?: string;
}

/**
 * Spočítá ocenění, vygeneruje AI článek a uloží do season_awards + news.
 * Idempotentní (UNIQUE league_id+season_number v season_awards).
 */
export async function generateSeasonAwards(
  db: D1Database,
  geminiApiKey: string | undefined,
  leagueId: string,
  seasonNumber: number,
): Promise<SeasonAwards | null> {
  // Idempotence
  const existing = await db.prepare("SELECT id FROM season_awards WHERE league_id = ? AND season_number = ?")
    .bind(leagueId, seasonNumber).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: "season-awards" }, "idempotency check", e); return null; });
  if (existing) {
    logger.info({ module: "season-awards" }, `skip — awards exist league=${leagueId} s=${seasonNumber}`);
    return null;
  }

  const standings = await calculateStandings(db, leagueId);
  const teamNameRes = await db.prepare("SELECT id, name FROM teams WHERE league_id = ?").bind(leagueId).all()
    .catch((e) => { logger.warn({ module: "season-awards" }, "load teams", e); return { results: [] as Record<string, unknown>[] }; });
  const teamName = new Map<string, string>();
  for (const t of teamNameRes.results) teamName.set(t.id as string, t.name as string);

  // Agregace hráčských statistik aktuální sezóny
  const aggRes = await db.prepare(
    `SELECT mps.player_id, p.first_name, p.last_name, p.position, p.age, p.team_id,
            SUM(mps.goals) AS goals, SUM(mps.assists) AS assists,
            AVG(mps.rating) AS avg_rating, COUNT(*) AS apps
     FROM match_player_stats mps
     JOIN players p ON p.id = mps.player_id
     JOIN matches m ON m.id = mps.match_id
     JOIN season_calendar sc ON sc.id = m.calendar_id
     WHERE m.league_id = ? AND m.status = 'simulated' AND sc.season_number = ?
     GROUP BY mps.player_id
     HAVING apps >= 1`,
  ).bind(leagueId, seasonNumber).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "season-awards" }, "load player aggregates", e); return { results: [] as Record<string, unknown>[] }; });

  const players: PlayerAgg[] = aggRes.results.map((r) => ({
    playerId: r.player_id as string,
    name: `${r.first_name} ${r.last_name}`,
    position: (r.position as string) ?? "MID",
    age: Number(r.age ?? 25),
    teamId: r.team_id as string,
    teamName: teamName.get(r.team_id as string) ?? "?",
    goals: Number(r.goals ?? 0),
    assists: Number(r.assists ?? 0),
    avgRating: Math.round(Number(r.avg_rating ?? 6) * 10) / 10,
    apps: Number(r.apps ?? 0),
  }));

  // Deterministika
  const champion = standings[0] ? { id: standings[0].teamId, name: teamName.get(standings[0].teamId) ?? "?" } : null;
  const runnerUp = standings[1] ? { id: standings[1].teamId, name: teamName.get(standings[1].teamId) ?? "?" } : null;
  const third = standings[2] ? { id: standings[2].teamId, name: teamName.get(standings[2].teamId) ?? "?" } : null;

  const byComposite = [...players].sort((a, b) => composite(b) - composite(a));
  const topScorer = [...players].sort((a, b) => b.goals - a.goals || b.avgRating - a.avgRating)[0] ?? null;
  const youngCandidates = byComposite.filter((p) => p.age <= 21).slice(0, 6);
  const bestEleven = pickBestEleven(players);

  // Deterministické defaulty (fallback i základ pro AI validaci)
  const defaultPlayer = byComposite[0] ?? null;
  const defaultManagerTeamId = champion?.id ?? null;
  const defaultDiscovery = youngCandidates[0] ?? defaultPlayer;

  // Manažeři top týmů (kandidáti na trenéra sezóny)
  const managerRes = await db.prepare(
    "SELECT m.team_id, m.name FROM managers m JOIN teams t ON t.id = m.team_id WHERE t.league_id = ? AND m.user_id = t.user_id",
  ).bind(leagueId).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "season-awards" }, "load managers", e); return { results: [] as Record<string, unknown>[] }; });
  const managerName = new Map<string, string>();
  for (const m of managerRes.results) managerName.set(m.team_id as string, m.name as string);

  let picked: GeminiAwardOut = {};
  if (geminiApiKey && players.length > 0) {
    picked = await pickWithGemini(geminiApiKey, leagueId, seasonNumber, {
      leagueName: await loadLeagueName(db, leagueId),
      standings, teamName, managerName,
      playerCandidates: byComposite.slice(0, 12),
      youngCandidates,
      topScorer,
    });
  }

  // Validace AI výběrů proti kandidátům, jinak deterministický fallback
  const candidateIds = new Set(byComposite.slice(0, 12).map((p) => p.playerId));
  const youngIds = new Set(youngCandidates.map((p) => p.playerId));
  const topTeamIds = new Set(standings.slice(0, 4).map((s) => s.teamId));

  const playerOfSeasonId = picked.playerOfSeasonId && candidateIds.has(picked.playerOfSeasonId)
    ? picked.playerOfSeasonId : defaultPlayer?.playerId ?? null;
  const managerOfSeasonTeamId = picked.managerOfSeasonTeamId && topTeamIds.has(picked.managerOfSeasonTeamId)
    ? picked.managerOfSeasonTeamId : defaultManagerTeamId;
  const discoveryId = picked.discoveryId && youngIds.has(picked.discoveryId)
    ? picked.discoveryId : defaultDiscovery?.playerId ?? null;

  const playerById = new Map(players.map((p) => [p.playerId, p]));
  const awards: SeasonAwards = {
    championTeamId: champion?.id ?? null,
    championName: champion?.name ?? null,
    runnerUpTeamId: runnerUp?.id ?? null,
    runnerUpName: runnerUp?.name ?? null,
    thirdTeamId: third?.id ?? null,
    thirdName: third?.name ?? null,
    playerOfSeasonId,
    playerOfSeasonName: playerOfSeasonId ? playerById.get(playerOfSeasonId)?.name ?? null : null,
    topScorerId: topScorer?.playerId ?? null,
    topScorerName: topScorer?.name ?? null,
    topScorerGoals: topScorer?.goals ?? 0,
    managerOfSeasonTeamId,
    managerOfSeasonName: managerOfSeasonTeamId ? managerName.get(managerOfSeasonTeamId) ?? teamName.get(managerOfSeasonTeamId) ?? null : null,
    discoveryId,
    discoveryName: discoveryId ? playerById.get(discoveryId)?.name ?? null : null,
    bestEleven,
    reasons: {
      playerOfSeason: picked.playerReason,
      managerOfSeason: picked.managerReason,
      discovery: picked.discoveryReason,
    },
    newsId: null,
  };

  // Článek (AI nebo deterministický fallback)
  const headline = picked.headline?.trim() || `Vyhlášení ocenění ${seasonNumber}. sezóny`;
  const body = picked.body?.trim() || buildFallbackArticle(awards);
  const newsId = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO news (id, league_id, type, headline, body, game_week, created_at) VALUES (?, ?, 'season_awards', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
  ).bind(newsId, leagueId, headline, body, seasonNumber * 100).run()
    .catch((e) => logger.warn({ module: "season-awards" }, "insert news", e));
  awards.newsId = newsId;

  await db.prepare(
    `INSERT INTO season_awards (id, league_id, season_number, champion_team_id, runner_up_team_id, third_team_id,
       player_of_season_id, top_scorer_id, top_scorer_goals, manager_of_season_team_id, discovery_of_season_id,
       best_eleven, reasons, news_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
  ).bind(
    crypto.randomUUID(), leagueId, seasonNumber,
    awards.championTeamId, awards.runnerUpTeamId, awards.thirdTeamId,
    awards.playerOfSeasonId, awards.topScorerId, awards.topScorerGoals,
    awards.managerOfSeasonTeamId, awards.discoveryId,
    JSON.stringify(awards.bestEleven), JSON.stringify(awards.reasons), newsId,
  ).run()
    .catch((e) => logger.warn({ module: "season-awards" }, "insert season_awards", e));

  logger.info({ module: "season-awards" }, `awards league=${leagueId} s=${seasonNumber} champ=${awards.championName} pos=${awards.playerOfSeasonName}`);
  return awards;
}

async function loadLeagueName(db: D1Database, leagueId: string): Promise<string> {
  const row = await db.prepare("SELECT name FROM leagues WHERE id = ?").bind(leagueId).first<{ name: string }>()
    .catch((e) => { logger.warn({ module: "season-awards" }, "load league name", e); return null; });
  return row?.name ?? "Liga";
}

async function pickWithGemini(
  apiKey: string,
  _leagueId: string,
  seasonNumber: number,
  ctx: {
    leagueName: string;
    standings: { teamId: string; pos: number; points: number; gf: number; ga: number }[];
    teamName: Map<string, string>;
    managerName: Map<string, string>;
    playerCandidates: PlayerAgg[];
    youngCandidates: PlayerAgg[];
    topScorer: PlayerAgg | null;
  },
): Promise<GeminiAwardOut> {
  const standLines = ctx.standings.slice(0, 6).map((s) =>
    `${s.pos}. ${ctx.teamName.get(s.teamId) ?? s.teamId} — ${s.points} b (${s.gf}:${s.ga})`);
  const playerLines = ctx.playerCandidates.map((p) =>
    `- [player_id=${p.playerId}] ${p.name} (${p.position}, ${p.teamName}) — rating ⌀${p.avgRating}, ${p.goals} gólů, ${p.assists} asist., ${p.apps} zápasů`);
  const youngLines = ctx.youngCandidates.map((p) =>
    `- [player_id=${p.playerId}] ${p.name} (${p.age} let, ${p.position}, ${p.teamName}) — rating ⌀${p.avgRating}, ${p.goals} gólů`);
  const managerLines = ctx.standings.slice(0, 4).map((s) =>
    `- [team_id=${s.teamId}] ${ctx.teamName.get(s.teamId) ?? s.teamId} (${s.pos}. místo) — trenér ${ctx.managerName.get(s.teamId) ?? "(AI)"}`);

  const prompt = `Jsi sportovní redaktor amatérské fotbalové ${ctx.leagueName}. Skončila ${seasonNumber}. sezóna. Vyhlas ocenění a napiš slavnostní článek.

KONEČNÁ TABULKA (TOP 6):
${standLines.join("\n")}

KANDIDÁTI NA HRÁČE SEZÓNY:
${playerLines.join("\n")}

KANDIDÁTI NA OBJEV SEZÓNY (mladí ≤21):
${youngLines.length ? youngLines.join("\n") : "(žádní mladí kandidáti)"}

KANDIDÁTI NA TRENÉRA SEZÓNY:
${managerLines.join("\n")}

KRÁL STŘELCŮ (už určen deterministicky): ${ctx.topScorer ? `${ctx.topScorer.name} (${ctx.topScorer.goals} gólů)` : "—"}

ÚKOL: Vyber Hráče sezóny, Objev sezóny a Trenéra sezóny. Zohledni nejen rating, ale i přínos pro tým a příběh sezóny.

Odpověz POUZE valid JSON:
{
  "playerOfSeasonId": "<player_id z kandidátů na hráče sezóny>",
  "playerReason": "<1 věta>",
  "discoveryId": "<player_id z kandidátů na objev, nebo prázdné když nikdo>",
  "discoveryReason": "<1 věta>",
  "managerOfSeasonTeamId": "<team_id z kandidátů na trenéra>",
  "managerReason": "<1 věta>",
  "headline": "<titulek, max 8 slov>",
  "body": "<článek 150-220 slov, česky, slavnostní tón. Vyhlas mistra, hráče sezóny, krále střelců, objev a trenéra sezóny. Přirozeně, jako novinové ohlédnutí.>"
}

PRAVIDLA:
- Všechna ID MUSÍ být doslova z uvedených seznamů
- Nevymýšlej jména ani čísla mimo uvedená
- Česky, přirozený tón`;

  const text = await callGemini(apiKey, prompt, { maxOutputTokens: 2048, temperature: 0.5, json: true, module: "season-awards" });
  if (!text) return {};
  try {
    return JSON.parse(text) as GeminiAwardOut;
  } catch (e) {
    logger.warn({ module: "season-awards" }, "gemini json parse", { snippet: text.slice(0, 160), error: e });
    return {};
  }
}

function buildFallbackArticle(a: SeasonAwards): string {
  const parts: string[] = [];
  if (a.championName) parts.push(`Mistrem sezóny se stává ${a.championName}! Gratulujeme k zaslouženému titulu.`);
  if (a.playerOfSeasonName) parts.push(`Hráčem sezóny byl zvolen ${a.playerOfSeasonName}.`);
  if (a.topScorerName) parts.push(`Králem střelců je ${a.topScorerName} s ${a.topScorerGoals} brankami.`);
  if (a.discoveryName) parts.push(`Objevem sezóny je ${a.discoveryName}.`);
  if (a.managerOfSeasonName) parts.push(`Trenérem sezóny se stává ${a.managerOfSeasonName}.`);
  if (a.bestEleven.length) parts.push(`Do nejlepší jedenáctky se probojovali: ${a.bestEleven.map((e) => e.name).join(", ")}.`);
  return parts.join(" ");
}
