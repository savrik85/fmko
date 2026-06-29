/**
 * Archiv sezóny — síň slávy.
 *
 * Zapíše finální tabulku + ocenění + "Sezona v číslech" do league_history,
 * přidá trofeje k týmům (teams.trophies) a jednorázové achievementy.
 *
 * DŮLEŽITÉ: spouštět PŘED odchody hráčů — aby šlo resolvnout jména oceněných
 * (retired hráči se mažou z players). Idempotentní (guard na league_history).
 */

import { calculateStandings } from "../stats/standings";
import { computeSeasonStats } from "./season-stats";
import { awardSeasonEnd } from "../services/achievements";
import { logger } from "../lib/logger";

interface TrophyEntry {
  seasonNumber: number;
  leagueId: string;
  leagueName: string;
  place: number;
  title: string;
}

const PLACE_TITLE: Record<number, string> = { 1: "Mistr ligy", 2: "Stříbro", 3: "Bronz" };

async function playerName(db: D1Database, id: string | null): Promise<string | null> {
  if (!id) return null;
  const r = await db.prepare("SELECT first_name, last_name FROM players WHERE id = ?").bind(id)
    .first<{ first_name: string; last_name: string }>()
    .catch((e) => { logger.warn({ module: "season-archive" }, "resolve player name", e); return null; });
  return r ? `${r.first_name} ${r.last_name}` : null;
}

async function appendTrophy(db: D1Database, teamId: string, entry: TrophyEntry): Promise<void> {
  const row = await db.prepare("SELECT trophies FROM teams WHERE id = ?").bind(teamId)
    .first<{ trophies: string }>()
    .catch((e) => { logger.warn({ module: "season-archive" }, "load trophies", e); return null; });
  let list: TrophyEntry[] = [];
  try { list = JSON.parse(row?.trophies ?? "[]") as TrophyEntry[]; } catch { list = []; }
  // Idempotence: neopakovat stejnou sezónu+ligu+místo
  if (list.some((t) => t.seasonNumber === entry.seasonNumber && t.leagueId === entry.leagueId && t.place === entry.place)) return;
  list.push(entry);
  await db.prepare("UPDATE teams SET trophies = ? WHERE id = ?").bind(JSON.stringify(list), teamId).run()
    .catch((e) => logger.warn({ module: "season-archive" }, "update trophies", e));
}

export async function archiveLeagueSeason(db: D1Database, leagueId: string, seasonNumber: number): Promise<void> {
  const existing = await db.prepare("SELECT id FROM league_history WHERE league_id = ? AND season_number = ?")
    .bind(leagueId, seasonNumber).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: "season-archive" }, "guard", e); return null; });

  const standings = await calculateStandings(db, leagueId);
  const teamRes = await db.prepare("SELECT id, name FROM teams WHERE league_id = ?").bind(leagueId).all()
    .catch((e) => { logger.warn({ module: "season-archive" }, "load teams", e); return { results: [] as Record<string, unknown>[] }; });
  const teamName = new Map<string, string>();
  for (const t of teamRes.results) teamName.set(t.id as string, t.name as string);

  const leagueRow = await db.prepare("SELECT name FROM leagues WHERE id = ?").bind(leagueId).first<{ name: string }>()
    .catch((e) => { logger.warn({ module: "season-archive" }, "load league name", e); return null; });
  const leagueName = leagueRow?.name ?? "Liga";

  const finalStandings = standings.map((s) => ({
    pos: s.pos, teamId: s.teamId, teamName: teamName.get(s.teamId) ?? s.teamId,
    points: s.points, wins: s.wins, draws: s.draws, losses: s.losses,
    gf: s.gf, ga: s.ga, gd: s.gd, played: s.played,
  }));

  // Rich snapshot ocenění (s jmény — resolvujeme PŘED odchody)
  const aw = await db.prepare("SELECT * FROM season_awards WHERE league_id = ? AND season_number = ?")
    .bind(leagueId, seasonNumber).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "season-archive" }, "load awards", e); return null; });

  let awardsSnapshot: Record<string, unknown> | null = null;
  if (aw) {
    const mgrTeamId = aw.manager_of_season_team_id as string | null;
    let mgrName: string | null = null;
    if (mgrTeamId) {
      const m = await db.prepare("SELECT m.name FROM managers m JOIN teams t ON t.id = m.team_id WHERE m.team_id = ? AND m.user_id = t.user_id")
        .bind(mgrTeamId).first<{ name: string }>()
        .catch((e) => { logger.warn({ module: "season-archive" }, "resolve manager", e); return null; });
      mgrName = m?.name ?? teamName.get(mgrTeamId) ?? null;
    }
    let reasons: Record<string, string> = {};
    try { reasons = JSON.parse((aw.reasons as string) ?? "{}"); } catch { reasons = {}; }
    let bestEleven: unknown[] = [];
    try { bestEleven = JSON.parse((aw.best_eleven as string) ?? "[]"); } catch { bestEleven = []; }
    awardsSnapshot = {
      champion: aw.champion_team_id ? { teamId: aw.champion_team_id, name: teamName.get(aw.champion_team_id as string) ?? null } : null,
      runnerUp: aw.runner_up_team_id ? { teamId: aw.runner_up_team_id, name: teamName.get(aw.runner_up_team_id as string) ?? null } : null,
      third: aw.third_team_id ? { teamId: aw.third_team_id, name: teamName.get(aw.third_team_id as string) ?? null } : null,
      playerOfSeason: { id: aw.player_of_season_id, name: await playerName(db, aw.player_of_season_id as string | null), reason: reasons.playerOfSeason ?? null },
      topScorer: { id: aw.top_scorer_id, name: await playerName(db, aw.top_scorer_id as string | null), goals: aw.top_scorer_goals ?? 0 },
      managerOfSeason: { teamId: mgrTeamId, name: mgrName, reason: reasons.managerOfSeason ?? null },
      discovery: { id: aw.discovery_of_season_id, name: await playerName(db, aw.discovery_of_season_id as string | null), reason: reasons.discovery ?? null },
      bestEleven,
    };
  }

  const seasonStats = await computeSeasonStats(db, leagueId, seasonNumber);

  if (!existing) {
    await db.prepare(
      `INSERT INTO league_history (id, league_id, final_standings, season_number, awards, season_stats, created_at)
       VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
    ).bind(
      crypto.randomUUID(), leagueId, JSON.stringify(finalStandings), seasonNumber,
      awardsSnapshot ? JSON.stringify(awardsSnapshot) : null,
      JSON.stringify(seasonStats),
    ).run()
      .catch((e) => logger.warn({ module: "season-archive" }, "insert league_history", e));
  }

  // Trofeje pro medailové pozice (idempotentní)
  for (const s of standings.slice(0, 3)) {
    await appendTrophy(db, s.teamId, {
      seasonNumber, leagueId, leagueName, place: s.pos,
      title: `${PLACE_TITLE[s.pos] ?? `${s.pos}. místo`} — ${leagueName} (${seasonNumber}. sezóna)`,
    });
  }

  // Jednorázové achievementy (dokončení sezóny všem, mistr vítězi)
  for (const s of standings) {
    await awardSeasonEnd(db, s.teamId, { champion: s.pos === 1 })
      .catch((e) => logger.warn({ module: "season-archive" }, "award season end", e));
  }

  logger.info({ module: "season-archive" }, `archived league=${leagueId} s=${seasonNumber} teams=${standings.length}`);
}
