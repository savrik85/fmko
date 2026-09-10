/**
 * Fanouškovské party — API.
 *
 * `routes/game.ts` má přes devět tisíc řádků a fanouškovská ekonomika (vstupné,
 * občerstvení, spokojenost) tam zůstává; party a jejich vůdci dostávají vlastní
 * router, aby ten soubor dál nerostl. Vzor je `routes/referees.ts`.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { requireAdmin } from "../auth/middleware";
import {
  FAN_GROUPS, SECTOR_LABELS, fanLeaderArchetypeLabel, moodWord, heatWord,
  type FanGroupKind, type FanSector,
} from "../engine/fan-groups";
import { fanLeaderFullName, type FanGroupRow, type FanLeaderRow } from "../fans/fan-group-generator";
import { syncFanGroups } from "../fans/fan-group-state";

export const fansRouter = new Hono<{ Bindings: Bindings }>();

const M = "fans-api";

interface IncidentRow {
  id: string;
  match_id: string | null;
  group_id: string | null;
  kind: string;
  severity: number;
  minute: number | null;
  text: string;
  fine: number;
  sector_closed_matches: number;
  fans_lost: number;
  game_date: string | null;
  created_at: string;
}

function safeJson(raw: string | null): unknown {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) {
    logger.warn({ module: M }, "nečitelný JSON avataru vůdce", e);
    return null;
  }
}

function leaderView(l: FanLeaderRow) {
  return {
    id: l.id,
    name: fanLeaderFullName(l),
    firstName: l.first_name,
    lastName: l.last_name,
    nickname: l.nickname,
    age: l.age,
    occupation: l.occupation,
    archetype: l.archetype,
    archetypeLabel: fanLeaderArchetypeLabel(l.archetype, l.gender),
    bio: l.bio,
    hlaska: l.hlaska,
    sentiment: l.sentiment,
    duvod: l.duvod,
    charisma: l.charisma,
    radikalnost: l.radikalnost,
    vyjednavani: l.vyjednavani,
    avatar: safeJson(l.avatar),
  };
}

function groupView(g: FanGroupRow, leader: FanLeaderRow | undefined) {
  const def = FAN_GROUPS[g.kind as FanGroupKind];
  return {
    id: g.id,
    kind: g.kind,
    kindLabel: def?.label ?? g.kind,
    popis: def?.popis ?? "",
    name: g.name,
    size: g.size,
    mood: g.mood,
    moodWord: moodWord(g.mood),
    heat: g.heat,
    heatWord: heatWord(g.heat),
    passion: g.passion,
    aggression: g.aggression,
    loyalty: g.loyalty,
    spending: g.spending,
    noise: g.noise,
    sector: g.sector,
    sectorLabel: SECTOR_LABELS[g.sector as FanSector] ?? g.sector,
    sectorClosed: g.closed_matches > 0,
    closedMatches: g.closed_matches,
    ticketDiscount: g.ticket_discount,
    leader: leader ? leaderView(leader) : null,
  };
}

function incidentView(i: IncidentRow) {
  return {
    id: i.id,
    matchId: i.match_id,
    groupId: i.group_id,
    kind: i.kind,
    severity: i.severity,
    minute: i.minute,
    text: i.text,
    fine: i.fine,
    sectorClosedMatches: i.sector_closed_matches,
    fansLost: i.fans_lost,
    gameDate: i.game_date,
    createdAt: i.created_at,
  };
}

async function teamGameDate(db: D1Database, teamId: string): Promise<string> {
  const row = await db.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "herní datum týmu", e); return null; });
  return row?.game_date ?? new Date().toISOString().slice(0, 10);
}

async function loadLeaders(db: D1Database, teamId: string): Promise<Map<string, FanLeaderRow>> {
  const rows = await db
    .prepare("SELECT * FROM fan_leaders WHERE team_id = ? AND status = 'active'")
    .bind(teamId).all<FanLeaderRow>()
    .catch((e) => { logger.warn({ module: M }, "načtení vůdců", e); return null; });
  return new Map((rows?.results ?? []).map((l) => [l.id, l]));
}

/**
 * Party klubu i s vůdci a posledními výtržnostmi.
 *
 * Velikosti se před odpovědí srovnají s fanbází (`drift: false` — náladou hýbe
 * jedině denní tick, jinak by ji hráč posouval refreshem stránky).
 */
fansRouter.get("/teams/:teamId/fans/groups", async (c) => {
  const teamId = c.req.param("teamId");
  const db = c.env.DB;

  const groups = await syncFanGroups(db, teamId, { drift: false });
  if (groups.length === 0) return c.json({ error: "Tým nenalezen" }, 404);

  const [leaders, gameDate, incidents, security] = await Promise.all([
    loadLeaders(db, teamId),
    teamGameDate(db, teamId),
    db.prepare(
      `SELECT id, match_id, group_id, kind, severity, minute, text, fine,
              sector_closed_matches, fans_lost, game_date, created_at
       FROM fan_incidents WHERE team_id = ? ORDER BY created_at DESC LIMIT 10`,
    ).bind(teamId).all<IncidentRow>()
      .catch((e) => { logger.warn({ module: M }, "poslední výtržnosti", e); return null; }),
    db.prepare("SELECT security FROM stadiums WHERE team_id = ?")
      .bind(teamId).first<{ security: number }>()
      .catch((e) => { logger.warn({ module: M }, "úroveň pořadatelské služby", e); return null; }),
  ]);

  return c.json({
    groups: groups.map((g) => groupView(g, g.leader_id ? leaders.get(g.leader_id) : undefined)),
    recentIncidents: (incidents?.results ?? []).map(incidentView),
    securityLevel: security?.security ?? 0,
    gameDate,
  });
});

/** Detail jedné party — plná historie jejích výtržností a manažerských zásahů. */
fansRouter.get("/teams/:teamId/fans/groups/:groupId", async (c) => {
  const teamId = c.req.param("teamId");
  const groupId = c.req.param("groupId");
  const db = c.env.DB;

  const groups = await syncFanGroups(db, teamId, { drift: false });
  const group = groups.find((g) => g.id === groupId);
  if (!group) return c.json({ error: "Parta nenalezena" }, 404);

  const [leaders, gameDate, incidents, actions] = await Promise.all([
    loadLeaders(db, teamId),
    teamGameDate(db, teamId),
    db.prepare(
      `SELECT id, match_id, group_id, kind, severity, minute, text, fine,
              sector_closed_matches, fans_lost, game_date, created_at
       FROM fan_incidents WHERE group_id = ? ORDER BY created_at DESC LIMIT 30`,
    ).bind(groupId).all<IncidentRow>()
      .catch((e) => { logger.warn({ module: M }, "výtržnosti party", e); return null; }),
    db.prepare(
      "SELECT id, action, cost, game_date, created_at FROM fan_group_actions WHERE group_id = ? ORDER BY created_at DESC LIMIT 30",
    ).bind(groupId).all<{ id: string; action: string; cost: number; game_date: string; created_at: string }>()
      .catch((e) => { logger.warn({ module: M }, "historie zásahů", e); return null; }),
  ]);

  return c.json({
    group: groupView(group, group.leader_id ? leaders.get(group.leader_id) : undefined),
    incidents: (incidents?.results ?? []).map(incidentView),
    actions: (actions?.results ?? []).map((a) => ({
      id: a.id, action: a.action, cost: a.cost, gameDate: a.game_date, createdAt: a.created_at,
    })),
    gameDate,
  });
});

/** Profil vůdce. Vrací i partu, kterou vede — bez ní ten člověk nedává smysl. */
fansRouter.get("/fan-leaders/:leaderId", async (c) => {
  const db = c.env.DB;
  const leader = await db
    .prepare("SELECT * FROM fan_leaders WHERE id = ?")
    .bind(c.req.param("leaderId")).first<FanLeaderRow>()
    .catch((e) => { logger.warn({ module: M }, "načtení vůdce", e); return null; });
  if (!leader) return c.json({ error: "Vůdce nenalezen" }, 404);

  const [group, team, gameDate] = await Promise.all([
    db.prepare("SELECT * FROM fan_groups WHERE id = ?")
      .bind(leader.group_id).first<FanGroupRow>()
      .catch((e) => { logger.warn({ module: M }, "parta vůdce", e); return null; }),
    db.prepare("SELECT id, name FROM teams WHERE id = ?")
      .bind(leader.team_id).first<{ id: string; name: string }>()
      .catch((e) => { logger.warn({ module: M }, "klub vůdce", e); return null; }),
    teamGameDate(db, leader.team_id),
  ]);

  return c.json({
    leader: leaderView(leader),
    group: group ? groupView(group, leader) : null,
    team: team ? { id: team.id, name: team.name } : null,
  });
});

/** Kronika bordelu — co se stalo a kolik to stálo. */
fansRouter.get("/teams/:teamId/fans/incidents", async (c) => {
  const teamId = c.req.param("teamId");
  const limit = Math.max(1, Math.min(100, Number(c.req.query("limit")) || 20));

  const rows = await c.env.DB.prepare(
    `SELECT i.id, i.match_id, i.group_id, i.kind, i.severity, i.minute, i.text, i.fine,
            i.sector_closed_matches, i.fans_lost, i.game_date, i.created_at,
            g.name AS group_name
     FROM fan_incidents i LEFT JOIN fan_groups g ON g.id = i.group_id
     WHERE i.team_id = ? ORDER BY i.created_at DESC LIMIT ?`,
  ).bind(teamId, limit).all<IncidentRow & { group_name: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "kronika výtržností", e); return null; });

  const items = (rows?.results ?? []).map((r) => ({ ...incidentView(r), groupName: r.group_name }));

  // Součet za sezónu se počítá zvlášť — výpis je stránkovaný a sečíst ho na FE by lhalo.
  const suma = await c.env.DB.prepare(
    "SELECT COUNT(*) AS pocet, COALESCE(SUM(fine),0) AS pokuty FROM fan_incidents WHERE team_id = ?",
  ).bind(teamId).first<{ pocet: number; pokuty: number }>()
    .catch((e) => { logger.warn({ module: M }, "součet pokut", e); return null; });

  return c.json({
    items,
    total: suma?.pocet ?? items.length,
    finesTotal: suma?.pokuty ?? 0,
  });
});

// ── Dev trigger ──────────────────────────────────────────────────────────────

/**
 * Vynutí vyhodnocení výtržností u odehraného zápasu.
 *
 * Jinak se čeká na zápasový tick a mechanika se nedá otestovat. `reset=1` smaže
 * nárok i zapsané incidenty toho zápasu, aby šlo losovat znovu — pokuta se ale
 * podruhé nestrhne, o to se stará reference_id v disciplinárce.
 */
fansRouter.post("/admin/force-fan-incident", requireAdmin, async (c) => {
  const db = c.env.DB;
  const matchId = c.req.query("matchId");
  if (!matchId) return c.json({ error: "Chybí matchId" }, 400);

  const m = await db
    .prepare(
      `SELECT m.id, m.home_team_id, m.away_team_id, m.home_score, m.away_score,
              m.attendance, m.calendar_id, m.league_id, m.referee_id, m.scheduled_at, m.status
       FROM matches m WHERE m.id = ?`,
    )
    .bind(matchId)
    .first<{
      id: string; home_team_id: string; away_team_id: string;
      home_score: number | null; away_score: number | null; attendance: number | null;
      calendar_id: string | null; league_id: string | null; referee_id: string | null;
      scheduled_at: string | null; status: string;
    }>()
    .catch((e) => { logger.warn({ module: M }, "načtení zápasu pro dev trigger", e); return null; });
  if (!m) return c.json({ error: "Zápas nenalezen" }, 404);
  if (m.status !== "simulated") return c.json({ error: "Zápas ještě není odehraný" }, 400);

  if (c.req.query("reset") === "1") {
    await db.batch([
      db.prepare("UPDATE matches SET fan_incidents = NULL WHERE id = ?").bind(matchId),
      db.prepare("DELETE FROM fan_incidents WHERE match_id = ?").bind(matchId),
    ]).catch((e) => { logger.warn({ module: M }, "reset nároku", e); });
  }

  const cal = m.calendar_id
    ? await db.prepare("SELECT season_number, league_id FROM season_calendar WHERE id = ?")
        .bind(m.calendar_id).first<{ season_number: number; league_id: string }>()
        .catch((e) => { logger.warn({ module: M }, "kalendář pro dev trigger", e); return null; })
    : null;

  const { getRelation } = await import("../community/manager-relations");
  const rel = await getRelation(db, m.home_team_id, m.away_team_id)
    .catch((e) => { logger.warn({ module: M }, "vztah manažerů", e); return null; });

  const { resolveMatchIncidents } = await import("../fans/resolve-match-incidents");
  const res = await resolveMatchIncidents(db, {
    matchId: m.id,
    homeTeamId: m.home_team_id,
    awayTeamId: m.away_team_id,
    homeScore: m.home_score ?? 0,
    awayScore: m.away_score ?? 0,
    attendance: m.attendance ?? 0,
    preMatchHeat: rel?.heat ?? 0,
    leagueId: cal?.league_id ?? m.league_id ?? null,
    seasonNumber: cal?.season_number ?? 0,
    gameDate: m.scheduled_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    sporneVerdikty: c.req.query("sporne") === "1",
    refereeId: m.referee_id,
  });

  return c.json(res);
});
