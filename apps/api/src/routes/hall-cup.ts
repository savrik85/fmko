/**
 * Vánoční sálovka: data pro stránku /salovka, soupiska trenéra a admin běh na zkoušku.
 * Přihlášky nejdou přes stránku, ale přes SMS s halou (hall-cup/db.ts).
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { requireAdmin, requireTeamOwnership } from "../auth/middleware";
import { logger } from "../lib/logger";
import { computeStandings, type PlayedMatch } from "../tournament/draw";
import { ROSTER_MAX, slotClock } from "../hall-cup/format";
import {
  loadHallCupEntrants, loadHallCupForTeam, loadHallCupMatches, parseRoster, tickHallCup, topScorer,
} from "../hall-cup/db";
import type { HallEvent } from "../hall-cup/match";

const M = "hall-cup";
const hallCupRouter = new Hono<{ Bindings: Bindings }>();

hallCupRouter.use("/teams/:teamId/hall-cup", requireTeamOwnership);
hallCupRouter.use("/teams/:teamId/hall-cup/*", requireTeamOwnership);
hallCupRouter.use("/admin/hall-cup/*", requireAdmin);

function parseEvents(raw: string | null): HallEvent[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as HallEvent[];
  } catch (e) {
    logger.warn({ module: M }, "nečitelné události zápasu sálovky", e);
    return [];
  }
}

/** Soupisku jde měnit do prvního výkopu dne turnaje. */
function rosterLocked(status: string, firstKickoff: string | null, now: Date): boolean {
  if (status === "finished" || status === "cancelled") return true;
  return !!firstKickoff && now.toISOString() >= firstKickoff;
}

// GET /api/teams/:teamId/hall-cup — ročník, moje přihláška, skupiny, zápasy, soupiska
hallCupRouter.get("/teams/:teamId/hall-cup", async (c) => {
  const teamId = c.req.param("teamId");
  const db = c.env.DB;
  const cup = await loadHallCupForTeam(db, teamId);
  if (!cup) return c.json({ cup: null });

  const [entrants, matches, myEntry] = await Promise.all([
    loadHallCupEntrants(db, cup.id),
    loadHallCupMatches(db, cup.id),
    db.prepare("SELECT status, group_code, roster, final_place, conv_id FROM hall_cup_entries WHERE cup_id = ? AND team_id = ?")
      .bind(cup.id, teamId).first<{ status: string; group_code: string | null; roster: string | null; final_place: number | null; conv_id: string | null }>(),
  ]);
  const groupsRows = await db.prepare("SELECT team_id, group_code FROM hall_cup_entries WHERE cup_id = ? AND status = 'registered'")
    .bind(cup.id).all<{ team_id: string; group_code: string | null }>();
  const nameOf = new Map(entrants.map((e) => [e.team_id, e.name]));
  const repOf = new Map(entrants.map((e) => [e.team_id, e.reputation]));

  const codes = [...new Set(groupsRows.results.map((r) => r.group_code).filter((g): g is string => !!g))].sort();
  const played: PlayedMatch[] = matches.filter((m) => m.stage === "group" && m.status === "played")
    .map((m) => ({ home: m.home_team_id, away: m.away_team_id, homeScore: m.home_score ?? 0, awayScore: m.away_score ?? 0 }));
  const groups = codes.map((code) => {
    const teams = groupsRows.results.filter((r) => r.group_code === code)
      .map((r) => ({ id: r.team_id, name: nameOf.get(r.team_id) ?? "", reputation: repOf.get(r.team_id) ?? 0 }));
    const ids = new Set(teams.map((t) => t.id));
    const table = computeStandings(teams, played.filter((m) => ids.has(m.home) && ids.has(m.away)));
    return { code, table: table.map((r) => ({ ...r, name: nameOf.get(r.teamId) ?? "" })) };
  });

  const firstKickoff = matches.length ? matches.reduce((min, m) => (m.kickoff_at < min ? m.kickoff_at : min), matches[0].kickoff_at) : null;
  const locked = rosterLocked(cup.status, firstKickoff, new Date());
  const canPickRoster = myEntry?.status === "registered" && !locked;

  let squad: Array<{ id: string; name: string; position: string; rating: number; injured: boolean }> = [];
  if (myEntry?.status === "registered") {
    const [players, injured] = await Promise.all([
      db.prepare("SELECT id, first_name, last_name, position, COALESCE(overall_rating, 0) AS rating FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') ORDER BY overall_rating DESC")
        .bind(teamId).all<{ id: string; first_name: string; last_name: string; position: string; rating: number }>(),
      db.prepare("SELECT i.player_id FROM injuries i JOIN players p ON p.id = i.player_id WHERE p.team_id = ? AND i.days_remaining > 0")
        .bind(teamId).all<{ player_id: string }>(),
    ]);
    const hurt = new Set(injured.results.map((r) => r.player_id));
    squad = players.results.map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}`, position: p.position, rating: p.rating, injured: hurt.has(p.id) }));
  }

  const scorer = topScorer(matches);
  return c.json({
    cup: {
      id: cup.id, title: cup.title, venue: cup.venue, status: cup.status, playsOn: cup.plays_on,
      registrationDeadline: cup.registration_deadline, inviteOn: cup.invite_on, entryFee: cup.entry_fee,
      pot: cup.entry_fee * entrants.length, winnerTeamId: cup.winner_team_id, winnerName: cup.winner_team_id ? nameOf.get(cup.winner_team_id) ?? null : null,
    },
    entry: myEntry ? { status: myEntry.status, groupCode: myEntry.group_code, finalPlace: myEntry.final_place, convId: myEntry.conv_id } : null,
    entrants: entrants.map((e) => ({ teamId: e.team_id, name: e.name })),
    groups,
    matches: matches.map((m) => ({
      id: m.id, stage: m.stage, groupCode: m.group_code, slot: m.slot, court: m.court, clock: slotClock(m.slot), kickoffAt: m.kickoff_at,
      homeTeamId: m.home_team_id, awayTeamId: m.away_team_id, home: nameOf.get(m.home_team_id) ?? "", away: nameOf.get(m.away_team_id) ?? "",
      status: m.status, homeScore: m.home_score, awayScore: m.away_score, homePens: m.home_pens, awayPens: m.away_pens,
      winnerTeamId: m.winner_team_id,
      goals: parseEvents(m.events).filter((e) => e.type === "goal").map((e) => ({ minute: e.minute, side: e.side, name: e.name, ownGoal: e.detail === "own_goal" })),
    })),
    topScorer: scorer ? { ...scorer, teamName: nameOf.get(scorer.teamId) ?? "" } : null,
    roster: { chosen: parseRoster(myEntry?.roster ?? null), max: ROSTER_MAX, canEdit: canPickRoster, squad },
  });
});

// PUT /api/teams/:teamId/hall-cup/roster — soupiska (nejvýš 10 hráčů), prázdná = nejlepší zdraví
hallCupRouter.put("/teams/:teamId/hall-cup/roster", async (c) => {
  const teamId = c.req.param("teamId");
  const db = c.env.DB;
  const body = await c.req.json<{ playerIds?: unknown }>().catch((e) => {
    logger.warn({ module: M }, "nečitelné tělo soupisky", e);
    return { playerIds: undefined };
  });
  if (!Array.isArray(body.playerIds) || body.playerIds.some((x) => typeof x !== "string")) {
    return c.json({ error: "Pošli seznam hráčů." }, 400);
  }
  const ids = [...new Set(body.playerIds as string[])];
  if (ids.length > ROSTER_MAX) return c.json({ error: `Na soupisku se vejde nejvýš ${ROSTER_MAX} hráčů.` }, 400);
  if (ids.length > 0 && ids.length < 6) return c.json({ error: "Na soupisce musí být aspoň šest hráčů, nebo nech výběr na automatu." }, 400);

  const cup = await loadHallCupForTeam(db, teamId);
  if (!cup) return c.json({ error: "Žádná sálovka není vypsaná." }, 404);
  const entry = await db.prepare("SELECT status FROM hall_cup_entries WHERE cup_id = ? AND team_id = ?").bind(cup.id, teamId).first<{ status: string }>();
  if (entry?.status !== "registered") return c.json({ error: "Na sálovku nejste přihlášení." }, 400);
  const first = await db.prepare("SELECT MIN(kickoff_at) AS k FROM hall_cup_matches WHERE cup_id = ?").bind(cup.id).first<{ k: string | null }>();
  if (rosterLocked(cup.status, first?.k ?? null, new Date())) return c.json({ error: "Turnaj už začal, soupiska je uzavřená." }, 409);

  if (ids.length) {
    const own = await db.prepare(
      `SELECT id FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') AND id IN (${ids.map(() => "?").join(",")})`,
    ).bind(teamId, ...ids).all<{ id: string }>();
    if (own.results.length !== ids.length) return c.json({ error: "Na soupisce je hráč, který u vás nehraje." }, 400);
  }
  await db.prepare("UPDATE hall_cup_entries SET roster = ? WHERE cup_id = ? AND team_id = ?")
    .bind(ids.length ? JSON.stringify(ids) : null, cup.id, teamId).run();
  return c.json({ ok: true, chosen: ids.length ? ids : null });
});

// POST /api/admin/hall-cup/tick?now=ISO — běh sálovky na zkoušku (testing), jinak ho pouští hodinový cron
hallCupRouter.post("/admin/hall-cup/tick", async (c) => {
  const nowParam = c.req.query("now");
  const now = nowParam ? new Date(nowParam) : new Date();
  if (Number.isNaN(now.getTime())) return c.json({ error: "Neplatné datum now" }, 400);
  const result = await tickHallCup(c.env, now);
  return c.json(result);
});

export default hallCupRouter;
