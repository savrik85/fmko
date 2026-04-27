/**
 * League API routes — standings from real DB data.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";

const leagueRouter = new Hono<{ Bindings: Bindings }>();

function deriveInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const cleaned = String(name).replace(/^FK\s+/i, "").replace(/^SK\s+/i, "").replace(/^TJ\s+/i, "").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 3).map((w) => w[0] ?? "").join("").toUpperCase();
}

// GET /api/teams/:teamId/standings — real standings from DB
leagueRouter.get("/teams/:teamId/standings", async (c) => {
  const teamId = c.req.param("teamId");

  const team = await c.env.DB.prepare(
    "SELECT t.*, v.name as village_name, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(teamId).first<Record<string, unknown>>();
  if (!team) return c.json({ error: "Team not found" }, 404);

  const leagueId = team.league_id as string | null;
  if (!leagueId) return c.json({ leagueName: "", standings: [], season: null });

  // Get league + season info
  const leagueInfo = await c.env.DB.prepare(
    "SELECT l.name, l.level, s.number as season_number FROM leagues l JOIN seasons s ON l.season_id = s.id WHERE l.id = ?"
  ).bind(leagueId).first<{ name: string; level: string; season_number: number }>().catch((e) => { logger.warn({ module: "league" }, "fetch league info", e); return null; });

  // Get all teams in league
  const leagueTeams = await c.env.DB.prepare(
    "SELECT t.id, t.name, t.user_id, t.primary_color, t.secondary_color, t.badge_pattern, v.name as village_name FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.league_id = ? ORDER BY t.name"
  ).bind(leagueId).all();

  const teamIds = leagueTeams.results.map((t) => t.id as string);
  const teamMeta = Object.fromEntries(leagueTeams.results.map((t) => [t.id as string, {
    name: t.name as string,
    isAi: t.user_id === "ai",
    primaryColor: t.primary_color as string || "#2D5F2D",
    secondaryColor: t.secondary_color as string || "#FFFFFF",
    badgePattern: t.badge_pattern as string || "shield",
  }]));

  // Get all simulated matches in this league
  const placeholders = teamIds.map(() => "?").join(",");
  const matches = await c.env.DB.prepare(
    `SELECT * FROM matches WHERE status = 'simulated' AND calendar_id IS NOT NULL AND (home_team_id IN (${placeholders}) OR away_team_id IN (${placeholders}))`
  ).bind(...teamIds, ...teamIds).all().catch((e) => { logger.warn({ module: "league" }, "fetch simulated matches", e); return { results: [] }; });

  // Calculate standings
  const stats: Record<string, { wins: number; draws: number; losses: number; gf: number; ga: number; form: string[] }> = {};
  for (const tid of teamIds) {
    stats[tid] = { wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, form: [] };
  }

  for (const m of matches.results) {
    const homeId = m.home_team_id as string;
    const awayId = m.away_team_id as string;
    const hs = m.home_score as number;
    const as_ = m.away_score as number;

    if (!stats[homeId] || !stats[awayId]) continue;

    stats[homeId].gf += hs;
    stats[homeId].ga += as_;
    stats[awayId].gf += as_;
    stats[awayId].ga += hs;

    if (hs > as_) {
      stats[homeId].wins++;
      stats[homeId].form.push("W");
      stats[awayId].losses++;
      stats[awayId].form.push("L");
    } else if (hs < as_) {
      stats[awayId].wins++;
      stats[awayId].form.push("W");
      stats[homeId].losses++;
      stats[homeId].form.push("L");
    } else {
      stats[homeId].draws++;
      stats[homeId].form.push("D");
      stats[awayId].draws++;
      stats[awayId].form.push("D");
    }
  }

  // Build standings array
  const standings = teamIds.map((tid) => {
    const s = stats[tid];
    const m = teamMeta[tid];
    const played = s.wins + s.draws + s.losses;
    return {
      teamId: tid,
      team: m.name,
      played,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      gf: s.gf,
      ga: s.ga,
      points: s.wins * 3 + s.draws,
      form: s.form.slice(-5).reverse(),
      isPlayer: tid === teamId,
      isAi: m.isAi,
      primaryColor: m.primaryColor,
      secondaryColor: m.secondaryColor,
      badgePattern: m.badgePattern,
    };
  });

  // Sort: points DESC, goal diff DESC, goals for DESC
  standings.sort((a, b) => {
    const pd = b.points - a.points;
    if (pd !== 0) return pd;
    const gd = (b.gf - b.ga) - (a.gf - a.ga);
    if (gd !== 0) return gd;
    return b.gf - a.gf;
  });

  // Assign positions
  standings.forEach((s, i) => { (s as Record<string, unknown>).pos = i + 1; });

  return c.json({
    leagueName: leagueInfo?.name ?? `Okresní přebor ${team.district}`,
    leagueLevel: leagueInfo?.level ?? "okresni_prebor",
    season: leagueInfo?.season_number ?? 1,
    standings,
  });
});

// GET /api/teams/:teamId/league-stats — top scorers + assists across the league
leagueRouter.get("/teams/:teamId/league-stats", async (c) => {
  const teamId = c.req.param("teamId");

  const team = await c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ league_id: string | null }>();
  if (!team?.league_id) return c.json({ topScorers: [], topAssists: [] });

  // Get active season
  const season = await c.env.DB.prepare(
    "SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"
  ).first<{ id: string }>().catch((e) => { logger.warn({ module: "league" }, "fetch active season for stats", e); return null; });
  const seasonId = season?.id ?? "season-1";

  const stats = await c.env.DB.prepare(
    `SELECT ps.goals, ps.assists, ps.appearances, ps.man_of_match as motm,
       ps.yellow_cards, ps.red_cards, ps.avg_rating, ps.clean_sheets,
       p.id as player_id, p.first_name, p.last_name, p.position, ps.team_id,
       t.name as team_name, t.primary_color, t.secondary_color, t.badge_pattern
     FROM player_stats ps
     JOIN players p ON ps.player_id = p.id
     JOIN teams t ON ps.team_id = t.id
     WHERE ps.season_id = ? AND t.league_id = ?
     ORDER BY ps.goals DESC, ps.assists DESC`
  ).bind(seasonId, team.league_id).all().catch((e) => { logger.error({ module: "league" }, "fetch league stats", e); return { results: [] }; });

  const rows = stats.results.map((r) => ({
    playerId: r.player_id as string,
    name: `${r.first_name} ${r.last_name}`,
    position: r.position as string,
    teamId: r.team_id as string,
    teamName: r.team_name as string,
    teamColor: (r.primary_color as string) || "#2D5F2D",
    teamSecondary: (r.secondary_color as string) || "#FFFFFF",
    teamBadge: (r.badge_pattern as string) || "shield",
    goals: (r.goals as number) ?? 0,
    assists: (r.assists as number) ?? 0,
    appearances: (r.appearances as number) ?? 0,
    motm: (r.motm as number) ?? 0,
    yellowCards: (r.yellow_cards as number) ?? 0,
    redCards: (r.red_cards as number) ?? 0,
    avgRating: (r.avg_rating as number) ?? 0,
    cleanSheets: (r.clean_sheets as number) ?? 0,
    isMyTeam: r.team_id === teamId,
  }));

  return c.json({
    topScorers: [...rows].sort((a, b) => b.goals - a.goals || b.assists - a.assists).filter((r) => r.goals > 0).slice(0, 15),
    topAssists: [...rows].sort((a, b) => b.assists - a.assists || b.goals - a.goals).filter((r) => r.assists > 0).slice(0, 15),
    topRated: [...rows].filter((r) => r.appearances >= 3 && r.avgRating > 0).sort((a, b) => b.avgRating - a.avgRating).slice(0, 10),
    mostCards: [...rows].filter((r) => r.yellowCards + r.redCards > 0).sort((a, b) => (b.yellowCards + b.redCards * 3) - (a.yellowCards + a.redCards * 3)).slice(0, 10),
    mostAppearances: [...rows].sort((a, b) => b.appearances - a.appearances).filter((r) => r.appearances > 0).slice(0, 10),
  });
});

// GET /api/leagues — seznam všech aktivních lig (pro league picker v UI)
leagueRouter.get("/leagues", async (c) => {
  const leagues = await c.env.DB.prepare(
    "SELECT l.id, l.name, l.level, l.district, l.season_id, s.number as season_number, (SELECT COUNT(*) FROM teams t WHERE t.league_id = l.id) as team_count FROM leagues l JOIN seasons s ON l.season_id = s.id WHERE l.status = 'active' AND l.district IN ('Prachatice', 'Praha') ORDER BY l.name"
  ).all().catch((e) => { logger.error({ module: "league" }, "fetch leagues", e); return { results: [] }; });

  return c.json({ leagues: leagues.results });
});

// GET /api/leagues/:leagueId/standings — tabulka libovolné ligy
leagueRouter.get("/leagues/:leagueId/standings", async (c) => {
  const leagueId = c.req.param("leagueId");

  const leagueInfo = await c.env.DB.prepare(
    "SELECT l.name, l.level, l.district, s.number as season_number FROM leagues l JOIN seasons s ON l.season_id = s.id WHERE l.id = ?"
  ).bind(leagueId).first<{ name: string; level: string; district: string; season_number: number }>();
  if (!leagueInfo) return c.json({ error: "League not found" }, 404);

  const leagueTeams = await c.env.DB.prepare(
    "SELECT t.id, t.name, t.user_id, t.primary_color, t.secondary_color, t.badge_pattern, v.name as village_name FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.league_id = ? ORDER BY t.name"
  ).bind(leagueId).all();

  const teamIds = leagueTeams.results.map((t) => t.id as string);
  if (teamIds.length === 0) return c.json({ leagueName: leagueInfo.name, standings: [], season: leagueInfo.season_number });

  const matches = await c.env.DB.prepare(
    "SELECT home_team_id, away_team_id, home_score, away_score FROM matches WHERE league_id = ? AND status = 'simulated' AND calendar_id IS NOT NULL"
  ).bind(leagueId).all();

  const stats: Record<string, { wins: number; draws: number; losses: number; gf: number; ga: number; form: string[] }> = {};
  for (const tid of teamIds) stats[tid] = { wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, form: [] };

  for (const m of matches.results) {
    const homeId = m.home_team_id as string;
    const awayId = m.away_team_id as string;
    const hs = m.home_score as number;
    const as_ = m.away_score as number;
    if (!stats[homeId] || !stats[awayId]) continue;
    stats[homeId].gf += hs; stats[homeId].ga += as_;
    stats[awayId].gf += as_; stats[awayId].ga += hs;
    if (hs > as_) { stats[homeId].wins++; stats[homeId].form.push("W"); stats[awayId].losses++; stats[awayId].form.push("L"); }
    else if (hs < as_) { stats[awayId].wins++; stats[awayId].form.push("W"); stats[homeId].losses++; stats[homeId].form.push("L"); }
    else { stats[homeId].draws++; stats[homeId].form.push("D"); stats[awayId].draws++; stats[awayId].form.push("D"); }
  }

  const standings = teamIds.map((tid) => {
    const s = stats[tid];
    const t = leagueTeams.results.find(r => r.id === tid)!;
    return {
      teamId: tid, team: t.name as string,
      played: s.wins + s.draws + s.losses, wins: s.wins, draws: s.draws, losses: s.losses,
      gf: s.gf, ga: s.ga, points: s.wins * 3 + s.draws,
      form: s.form.slice(-5).reverse(),
      isAi: t.user_id === "ai",
      primaryColor: (t.primary_color as string) || "#2D5F2D",
      secondaryColor: (t.secondary_color as string) || "#FFFFFF",
      badgePattern: (t.badge_pattern as string) || "shield",
    };
  });

  standings.sort((a, b) => (b.points - a.points) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf));
  standings.forEach((s, i) => { (s as Record<string, unknown>).pos = i + 1; });

  return c.json({ leagueName: leagueInfo.name, leagueLevel: leagueInfo.level, season: leagueInfo.season_number, standings });
});

// GET /api/leagues/:leagueId/results — výsledky zápasů
leagueRouter.get("/leagues/:leagueId/results", async (c) => {
  const leagueId = c.req.param("leagueId");
  const gameWeek = c.req.query("gameWeek");

  let query = "SELECT m.id, m.round, m.home_score, m.away_score, m.status, m.attendance, m.weather, sc.game_week, sc.scheduled_at, t1.name as home_name, t1.primary_color as home_color, t2.name as away_name, t2.primary_color as away_color FROM matches m JOIN teams t1 ON m.home_team_id = t1.id JOIN teams t2 ON m.away_team_id = t2.id LEFT JOIN season_calendar sc ON m.calendar_id = sc.id WHERE m.league_id = ? AND m.status = 'simulated'";
  const binds: unknown[] = [leagueId];
  if (gameWeek) { query += " AND sc.game_week = ?"; binds.push(parseInt(gameWeek)); }
  query += " ORDER BY sc.game_week DESC, m.round";

  const results = await c.env.DB.prepare(query).bind(...binds).all()
    .catch((e) => { logger.error({ module: "league" }, "fetch results", e); return { results: [] }; });

  return c.json({ results: results.results });
});

// GET /api/leagues/:leagueId/news — zpravodaj cizí ligy
leagueRouter.get("/leagues/:leagueId/news", async (c) => {
  const leagueId = c.req.param("leagueId");

  const newsRows = await c.env.DB.prepare(
    "SELECT id, type, headline, body, game_week, created_at FROM news WHERE league_id = ? ORDER BY created_at DESC LIMIT 30"
  ).bind(leagueId).all().catch((e) => { logger.error({ module: "league" }, "fetch league news", e); return { results: [] }; });

  const iconMap: Record<string, string> = {
    round_results: "\u26BD", ai_report: "\u270D\uFE0F", transfer: "\u{1F91D}",
    seasonal: "\u{1F389}", manager_arrival: "\u{1F4CB}",
  };

  const articles = newsRows.results.map((n) => ({
    id: n.id as string, type: n.type as string,
    headline: (n.headline ?? n.type) as string, body: (n.body ?? "") as string,
    icon: iconMap[n.type as string] ?? "\u{1F4F0}",
    date: n.created_at as string, gameWeek: n.game_week as number | null,
  }));

  return c.json({ articles });
});

// GET /api/leagues/:leagueId/transfers-overview — přehled přestupů v lize
leagueRouter.get("/leagues/:leagueId/transfers-overview", async (c) => {
  const leagueId = c.req.param("leagueId");

  // All completed transfers in this league (either buyer or seller is in league)
  // Get new contracts (join_type='transfer') and resolve the "from team" from previous contract
  const transfersRes = await c.env.DB.prepare(
    `SELECT
       pc.player_id, pc.team_id as to_team_id, pc.fee, pc.joined_at,
       p.first_name, p.last_name, p.avatar as player_avatar, p.age, p.position,
       t_to.name as to_team_name, t_to.league_id as to_league_id,
       t_to.badge_primary_color as to_badge_primary, t_to.badge_secondary_color as to_badge_secondary,
       t_to.badge_pattern as to_badge_pattern, t_to.badge_initials as to_badge_initials, t_to.badge_symbol as to_badge_symbol,
       t_to.primary_color as to_primary_color, t_to.secondary_color as to_secondary_color,
       (SELECT pc2.team_id FROM player_contracts pc2
        WHERE pc2.player_id = pc.player_id
        AND pc2.is_active = 0
        AND pc2.leave_type = 'transfer'
        AND pc2.left_at <= pc.joined_at
        ORDER BY pc2.left_at DESC LIMIT 1) as from_team_id
     FROM player_contracts pc
     JOIN players p ON pc.player_id = p.id
     JOIN teams t_to ON pc.team_id = t_to.id
     WHERE pc.join_type = 'transfer'
     ORDER BY pc.joined_at DESC`
  ).all().catch((e) => { logger.error({ module: "league" }, "fetch transfers", e); return { results: [] }; });

  // Get team names + league_ids for from teams (batch)
  const fromTeamIds = Array.from(new Set(
    (transfersRes.results as any[]).map((r) => r.from_team_id).filter(Boolean)
  ));
  let fromTeamsMap: Record<string, { name: string; leagueId: string | null; badgePrimary: string | null; badgeSecondary: string | null; badgePattern: string | null; badgeInitials: string | null; badgeSymbol: string | null }> = {};
  if (fromTeamIds.length > 0) {
    const placeholders = fromTeamIds.map(() => "?").join(",");
    const fromTeamsRows = await c.env.DB.prepare(
      `SELECT id, name, league_id, badge_primary_color, badge_secondary_color, badge_pattern, badge_initials, badge_symbol, primary_color, secondary_color FROM teams WHERE id IN (${placeholders})`
    ).bind(...fromTeamIds).all().catch(() => ({ results: [] }));
    for (const r of fromTeamsRows.results as any[]) {
      fromTeamsMap[r.id] = {
        name: r.name, leagueId: r.league_id,
        badgePrimary: r.badge_primary_color ?? r.primary_color,
        badgeSecondary: r.badge_secondary_color ?? r.secondary_color,
        badgePattern: r.badge_pattern,
        badgeInitials: r.badge_initials ?? deriveInitials(r.name),
        badgeSymbol: r.badge_symbol,
      };
    }
  }

  // Filter: transfers where either buyer or seller is in this league
  const leagueTransfers = (transfersRes.results as any[])
    .filter((r) => {
      const toInLeague = r.to_league_id === leagueId;
      const fromInLeague = r.from_team_id && fromTeamsMap[r.from_team_id]?.leagueId === leagueId;
      return toInLeague || fromInLeague;
    })
    .map((r) => {
      const fromTeam = r.from_team_id ? fromTeamsMap[r.from_team_id] : null;
      const isCrossLeague = fromTeam && fromTeam.leagueId !== r.to_league_id;
      const avatar = (() => { try { return JSON.parse(r.player_avatar as string); } catch (e) { logger.warn({ module: "league" }, `parse player avatar: ${e}`); return {}; } })();
      const fromBadge = fromTeam ? {
        primary: fromTeam.badgePrimary ?? "#374151",
        secondary: fromTeam.badgeSecondary ?? "#9ca3af",
        pattern: fromTeam.badgePattern ?? "shield",
        initials: fromTeam.badgeInitials ?? "?",
        symbol: fromTeam.badgeSymbol ?? null,
      } : null;
      const toBadge = {
        primary: (r.to_badge_primary as string | null) ?? (r.to_primary_color as string | null) ?? "#374151",
        secondary: (r.to_badge_secondary as string | null) ?? (r.to_secondary_color as string | null) ?? "#9ca3af",
        pattern: (r.to_badge_pattern as string | null) ?? "shield",
        initials: (r.to_badge_initials as string | null) ?? deriveInitials(r.to_team_name as string),
        symbol: (r.to_badge_symbol as string | null) ?? null,
      };
      return {
        playerId: r.player_id as string,
        playerName: `${r.first_name} ${r.last_name}`,
        playerAvatar: avatar,
        age: (r.age as number) ?? 0,
        position: (r.position as string) ?? "",
        fromTeamId: r.from_team_id as string | null,
        fromTeam: fromTeam?.name ?? null,
        fromTeamBadge: fromBadge,
        toTeamId: r.to_team_id as string,
        toTeam: r.to_team_name as string,
        toTeamBadge: toBadge,
        fee: (r.fee as number) ?? 0,
        date: r.joined_at as string,
        isCrossLeague: !!isCrossLeague,
      };
    });

  const totalTransfers = leagueTransfers.length;
  const totalValue = leagueTransfers.reduce((s, t) => s + t.fee, 0);
  const avgFee = totalTransfers > 0 ? Math.round(totalValue / totalTransfers) : 0;
  const crossLeagueCount = leagueTransfers.filter((t) => t.isCrossLeague).length;

  // Free agent signings in this league
  const faRes = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM player_contracts pc
     JOIN teams t ON pc.team_id = t.id
     WHERE pc.join_type = 'free_agent' AND t.league_id = ?`
  ).bind(leagueId).first<{ cnt: number }>().catch(() => ({ cnt: 0 }));

  // Cross-league admin fee total (from transactions)
  const adminFeeRes = await c.env.DB.prepare(
    `SELECT SUM(ABS(amount)) as total FROM transactions tx
     JOIN teams t ON tx.team_id = t.id
     WHERE tx.type = 'transfer_admin_fee' AND t.league_id = ?`
  ).bind(leagueId).first<{ total: number }>().catch(() => ({ total: 0 }));

  // Top 10 biggest transfers
  const biggest = [...leagueTransfers].sort((a, b) => b.fee - a.fee).slice(0, 10);

  // Top sellers (most earned) — aggregate by fromTeamId
  type TeamBadge = { primary: string; secondary: string; pattern: string; initials: string; symbol: string | null };
  const sellersMap = new Map<string, { teamId: string; teamName: string; badge: TeamBadge | null; earned: number; count: number }>();
  for (const t of leagueTransfers) {
    if (!t.fromTeamId || !t.fromTeam) continue;
    const existing = sellersMap.get(t.fromTeamId);
    if (existing) { existing.earned += t.fee; existing.count++; }
    else sellersMap.set(t.fromTeamId, { teamId: t.fromTeamId, teamName: t.fromTeam, badge: t.fromTeamBadge, earned: t.fee, count: 1 });
  }
  const topSellers = [...sellersMap.values()].sort((a, b) => b.earned - a.earned).slice(0, 5);

  // Top buyers (most spent) — aggregate by toTeamId
  const buyersMap = new Map<string, { teamId: string; teamName: string; badge: TeamBadge | null; spent: number; count: number }>();
  for (const t of leagueTransfers) {
    const existing = buyersMap.get(t.toTeamId);
    if (existing) { existing.spent += t.fee; existing.count++; }
    else buyersMap.set(t.toTeamId, { teamId: t.toTeamId, teamName: t.toTeam, badge: t.toTeamBadge, spent: t.fee, count: 1 });
  }
  const topBuyers = [...buyersMap.values()].sort((a, b) => b.spent - a.spent).slice(0, 5);

  // Most active (in + out combined)
  const activeMap = new Map<string, { teamId: string; teamName: string; badge: TeamBadge | null; in: number; out: number; total: number }>();
  for (const t of leagueTransfers) {
    const buyer = activeMap.get(t.toTeamId) ?? { teamId: t.toTeamId, teamName: t.toTeam, badge: t.toTeamBadge, in: 0, out: 0, total: 0 };
    buyer.in++; buyer.total++;
    activeMap.set(t.toTeamId, buyer);
    if (t.fromTeamId && t.fromTeam) {
      const seller = activeMap.get(t.fromTeamId) ?? { teamId: t.fromTeamId, teamName: t.fromTeam, badge: t.fromTeamBadge, in: 0, out: 0, total: 0 };
      seller.out++; seller.total++;
      activeMap.set(t.fromTeamId, seller);
    }
  }
  const mostActive = [...activeMap.values()].sort((a, b) => b.total - a.total).slice(0, 5);

  // Recent 20
  const recent = leagueTransfers.slice(0, 20);

  // Spekulace — 5 nejnověji watched hráčů z týmů v této lize (sledování od jiných týmů)
  const speculationsRes = await c.env.DB.prepare(
    `SELECT
       pw.player_id,
       p.first_name, p.last_name, p.avatar as player_avatar, p.position, p.overall_rating,
       pc.team_id as current_team_id,
       t.name as current_team_name,
       t.badge_primary_color as cur_badge_primary, t.badge_secondary_color as cur_badge_secondary,
       t.badge_pattern as cur_badge_pattern, t.badge_initials as cur_badge_initials, t.badge_symbol as cur_badge_symbol,
       t.primary_color as cur_primary_color, t.secondary_color as cur_secondary_color,
       COUNT(DISTINCT pw.team_id) as watcher_count,
       MAX(pw.created_at) as latest_watched_at
     FROM player_watchlist pw
     JOIN players p ON pw.player_id = p.id
     JOIN player_contracts pc ON pc.player_id = p.id AND pc.is_active = 1
     JOIN teams t ON pc.team_id = t.id
     WHERE t.league_id = ?
       AND pw.team_id != pc.team_id
     GROUP BY pw.player_id
     ORDER BY latest_watched_at DESC
     LIMIT 5`
  ).bind(leagueId).all().catch((e) => { logger.warn({ module: "league" }, "fetch speculations", e); return { results: [] }; });

  const speculations = (speculationsRes.results as any[]).map((r) => ({
    playerId: r.player_id as string,
    playerName: `${r.first_name} ${r.last_name}`,
    playerAvatar: (() => { try { return JSON.parse(r.player_avatar as string); } catch (e) { logger.warn({ module: "league" }, `parse spec avatar: ${e}`); return {}; } })(),
    position: r.position as string,
    overallRating: (r.overall_rating as number) ?? 0,
    currentTeamId: r.current_team_id as string,
    currentTeamName: r.current_team_name as string,
    currentTeamBadge: {
      primary: (r.cur_badge_primary as string | null) ?? (r.cur_primary_color as string | null) ?? "#374151",
      secondary: (r.cur_badge_secondary as string | null) ?? (r.cur_secondary_color as string | null) ?? "#9ca3af",
      pattern: (r.cur_badge_pattern as string | null) ?? "shield",
      initials: (r.cur_badge_initials as string | null) ?? deriveInitials(r.current_team_name as string),
      symbol: (r.cur_badge_symbol as string | null) ?? null,
    },
    watcherCount: (r.watcher_count as number) ?? 0,
    latestWatchedAt: r.latest_watched_at as string,
  }));

  return c.json({
    stats: {
      totalTransfers,
      totalValue,
      avgFee,
      freeAgentSignings: faRes?.cnt ?? 0,
      crossLeagueCount,
      crossLeagueAdminTotal: adminFeeRes?.total ?? 0,
    },
    biggest,
    topSellers,
    topBuyers,
    mostActive,
    recent,
    speculations,
  });
});

export { leagueRouter };
