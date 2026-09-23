/**
 * Spouštěče SMS od majitelů firem. Každý jen zařadí zprávu do fronty (idempotentně);
 * doručení a limity řeší `deliverOwnerSmsForTeam`. Háčky volají tyhle funkce ve vlastním
 * try/catch: SMS je koření, nesmí shodit zápas, rollover ani tick.
 */
import { logger } from "../lib/logger";
import {
  deliverOwnerSmsForTeam, enqueueOwnerSms, expireOwnerSmsReplies, loadRelationshipOwners, teamGameDay,
} from "./owner-sms";
import {
  addDays, LOSING_STREAK_MIN, leadingLosses, occasionForResult, pickRelationshipOwner, seasonVerdict,
} from "./owner-sms-rules";

const M = "owner-sms";

const HUMAN_TEAMS_SQL = `SELECT id FROM teams
  WHERE user_id != 'ai' AND COALESCE(team_type, 'senior') != 'u21' AND name NOT LIKE 'DELETED-%'`;

/** Po domácím zápase: majitelé, kteří seděli na tribuně (claim v settleSponsorInvitations). */
export async function enqueueAfterMatchSms(
  db: D1Database, matchId: string, homeTeamId: string, homeScore: number, awayScore: number, sponsorIds: readonly number[],
): Promise<number> {
  const occasion = occasionForResult(homeScore, awayScore);
  if (!occasion || sponsorIds.length === 0) return 0;
  const day = await teamGameDay(db, homeTeamId);
  if (!day) return 0;
  let n = 0;
  for (const sponsorId of sponsorIds) {
    const ok = await enqueueOwnerSms(db, {
      sponsorId, teamId: homeTeamId, occasion, referenceId: `match:${matchId}:${sponsorId}`, day,
      vars: { skore: `${homeScore}:${awayScore}` },
    });
    if (ok) n++;
  }
  return n;
}

/** Výtržnost domácích fanoušků: ozve se majitel se vztahem, přednost má opatrný. */
export async function enqueueRiotSms(db: D1Database, teamId: string, matchId: string): Promise<boolean> {
  const day = await teamGameDay(db, teamId);
  if (!day) return false;
  const owner = pickRelationshipOwner(await loadRelationshipOwners(db, teamId), { prefer: "cautious" });
  if (!owner) return false;
  return enqueueOwnerSms(db, { sponsorId: owner.sponsorId, teamId, occasion: "riot", referenceId: `riot:${matchId}`, day });
}

/** Den před domácím zápasem: majitelé, kteří na zítřek přijali pozvání. */
export async function enqueueMatchEveSms(db: D1Database, today: string): Promise<number> {
  const rows = await db.prepare(
    `SELECT si.id, si.sponsor_id, si.team_id FROM sponsor_invitations si
     JOIN teams t ON t.id = si.team_id
     WHERE si.status = 'accepted' AND si.match_day = ? AND t.user_id != 'ai'`,
  ).bind(addDays(today, 1)).all<{ id: string; sponsor_id: number; team_id: string }>();
  let n = 0;
  for (const r of rows.results) {
    const ok = await enqueueOwnerSms(db, {
      sponsorId: r.sponsor_id, teamId: r.team_id, occasion: "match_eve", referenceId: `eve:${r.id}`, day: today,
    });
    if (ok) n++;
  }
  return n;
}

/** Série proher: jednou za sérii (reference = první prohra série). */
export async function enqueueLosingStreakSms(db: D1Database, teamId: string, today: string): Promise<boolean> {
  const recent = await db.prepare(
    `SELECT id, CASE
              WHEN (home_team_id = ?1 AND home_score > away_score) OR (away_team_id = ?1 AND away_score > home_score) THEN 'W'
              WHEN home_score = away_score THEN 'D' ELSE 'L' END AS res
     FROM matches WHERE (home_team_id = ?1 OR away_team_id = ?1) AND status = 'simulated'
     ORDER BY simulated_at DESC LIMIT 10`,
  ).bind(teamId).all<{ id: string | number; res: "W" | "D" | "L" }>();
  const n = leadingLosses(recent.results.map((r) => r.res));
  if (n < LOSING_STREAK_MIN) return false;
  const owner = pickRelationshipOwner(await loadRelationshipOwners(db, teamId));
  if (!owner) return false;
  const firstLoss = String(recent.results[n - 1].id);
  return enqueueOwnerSms(db, {
    sponsorId: owner.sponsorId, teamId, occasion: "losing_streak", referenceId: `streak:${teamId}:${firstLoss}`,
    day: today, vars: { serie: n },
  });
}

/** Průšvih v klubu (krádež, poškození): ozve se jen opatrný majitel. */
export async function enqueueScandalSms(db: D1Database, teamId: string, today: string): Promise<boolean> {
  const inc = await db.prepare(
    `SELECT id FROM club_incidents
     WHERE team_id = ? AND category IN ('kradez','poskozeni') AND status != 'hrozi' AND severity >= 2
       AND ABS(julianday(substr(game_date, 1, 10)) - julianday(?)) <= 2
     ORDER BY game_date DESC LIMIT 1`,
  ).bind(teamId, today.slice(0, 10)).first<{ id: string }>();
  if (!inc) return false;
  const owner = pickRelationshipOwner(await loadRelationshipOwners(db, teamId), { only: "cautious" });
  if (!owner) return false;
  return enqueueOwnerSms(db, { sponsorId: owner.sponsorId, teamId, occasion: "scandal", referenceId: `scandal:${inc.id}`, day: today });
}

/** Hlavní sponzor: nový se přivítá, odcházející se rozloučí. Routy doručují hned. */
export async function enqueueMainSponsorSms(
  db: D1Database, teamId: string, sponsorId: number, occasion: "main_lost" | "main_new", referenceId: string,
  opts: { day?: string; deliverNow?: boolean } = {},
): Promise<boolean> {
  const day = opts.day ?? (await teamGameDay(db, teamId));
  if (!day) return false;
  const queued = await enqueueOwnerSms(db, { sponsorId, teamId, occasion, referenceId, day });
  if (queued && opts.deliverNow) await deliverOwnerSmsForTeam(db, teamId);
  return queued;
}

/** Konec sezóny: poděkování, nebo stížnost podle bodů na zápas ve staré sezóně. */
export async function enqueueSeasonEndSms(db: D1Database, oldSeasonNumber: number, day: string): Promise<number> {
  const rows = await db.prepare(
    `SELECT t.id AS team_id,
            SUM(CASE WHEN (m.home_team_id = t.id AND m.home_score > m.away_score)
                       OR (m.away_team_id = t.id AND m.away_score > m.home_score) THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN m.home_score = m.away_score THEN 1 ELSE 0 END) AS draws,
            COUNT(m.id) AS played
     FROM teams t
     JOIN matches m ON (m.home_team_id = t.id OR m.away_team_id = t.id) AND m.status = 'simulated'
     JOIN season_calendar sc ON sc.id = m.calendar_id AND sc.season_number = ?
     WHERE t.user_id != 'ai' AND COALESCE(t.team_type, 'senior') != 'u21' AND t.name NOT LIKE 'DELETED-%'
     GROUP BY t.id`,
  ).bind(oldSeasonNumber).all<{ team_id: string; wins: number; draws: number; played: number }>();
  let n = 0;
  for (const r of rows.results) {
    try {
      const verdict = seasonVerdict(r.wins, r.draws, r.played);
      if (!verdict) continue;
      const owner = pickRelationshipOwner(await loadRelationshipOwners(db, r.team_id));
      if (!owner) continue;
      const ok = await enqueueOwnerSms(db, {
        sponsorId: owner.sponsorId, teamId: r.team_id, occasion: verdict,
        referenceId: `season:${oldSeasonNumber}:${r.team_id}`, day,
      });
      if (ok) n++;
    } catch (e) {
      logger.warn({ module: M, teamId: r.team_id }, "SMS majitele ke konci sezóny", e);
    }
  }
  return n;
}

/** Denní běh: mlčení, den před zápasem, série proher, průšvihy a doručení všem lidským klubům. */
export async function runOwnerSmsDaily(
  db: D1Database, todayIso: string,
): Promise<{ expired: number; eve: number; queued: number; delivered: number }> {
  const today = todayIso.slice(0, 10);
  const expired = await expireOwnerSmsReplies(db, today);
  const eve = await enqueueMatchEveSms(db, today);
  const teams = await db.prepare(HUMAN_TEAMS_SQL).all<{ id: string }>();
  let queued = 0;
  let delivered = 0;
  for (const t of teams.results) {
    try {
      if (await enqueueLosingStreakSms(db, t.id, today)) queued++;
      if (await enqueueScandalSms(db, t.id, today)) queued++;
      if (await deliverOwnerSmsForTeam(db, t.id, today)) delivered++;
    } catch (e) {
      logger.warn({ module: M, teamId: t.id }, "SMS od majitelů pro klub", e);
    }
  }
  return { expired, eve, queued, delivered };
}
