/**
 * Úlohy AI trenérů ve frontě (MATCH_QUEUE, zpráva `ai_coach`).
 *
 * Jeden klub = jedna zpráva = jedna invokace, takže pomalý model nebo velký počet
 * klubů nikdy nezdrží zápasový ani denní tick. Fronta doručuje aspoň jednou, proto
 * každá úloha nejdřív zabere nárok v `ai_coach_claims` (tým, úloha, den): druhé
 * doručení už nic neudělá (žádná dvojí týdenní správa, dvojí nákup ani dvě sestavy).
 *
 * Bez bindingu fronty (lokální vývoj) se úlohy zpracují rovnou v cronu.
 */

import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import type { AiCoachQueueMessage, CoachTask } from "../queue/messages";
import { claimCoachTask, releaseCoachTask } from "./claims";
import { HOURLY_HOOKS } from "./hourly-hooks";
import { findTodaysFixtures, prepareAiLineup } from "./match";
import { ensureAiProfile } from "./profile";
import { runWeeklyReview } from "./weekly";

const M = "ai-coach-jobs";
const MAX_BATCH = 100;

/** Herní den (YYYY-MM-DD) AI klubů; všechny týmy mají stejné herní datum. */
export async function currentGameDay(db: D1Database): Promise<string | null> {
  const row = await db.prepare("SELECT MAX(game_date) AS d FROM teams WHERE game_date IS NOT NULL")
    .first<{ d: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "herní datum", e); return null; });
  return row?.d ? row.d.slice(0, 10) : null;
}

/** AI áčka, která hrají soutěž (U21 si sestavu staví automat, ty se nepočítají). */
export async function listAiClubs(db: D1Database): Promise<string[]> {
  const rows = await db.prepare(
    `SELECT id FROM teams WHERE user_id = 'ai' AND parent_team_id IS NULL AND league_id IS NOT NULL
        AND COALESCE(team_type, 'senior') != 'u21' ORDER BY id`,
  ).all<{ id: string }>()
    .catch((e) => { logger.error({ module: M }, "seznam AI klubů", e); return { results: [] as Array<{ id: string }> }; });
  return rows.results.map((r) => r.id);
}

/** Klíč dne úlohy: herní den, u hodinové úlohy i reálná hodina (UTC). */
export function taskDay(task: CoachTask, gameDay: string, now: Date): string {
  return task === "hourly" ? `${gameDay}T${String(now.getUTCHours()).padStart(2, "0")}` : gameDay;
}

/** Je herní den pondělí (týdenní finance proběhly v nočním ticku)? */
export function isGameMonday(gameDay: string): boolean {
  return new Date(`${gameDay}T12:00:00Z`).getUTCDay() === 1;
}

export interface EnqueueResult {
  task: CoachTask;
  teams: number;
  queued: number;
  inline: number;
  skipped: string | null;
}

/**
 * Zařadí úlohu pro AI kluby. `match` jen pro kluby, které dnes hrají, `weekly` jen v herní
 * pondělí. Bez fronty se úlohy zpracují hned (sériově).
 */
export async function enqueueAiCoachJobs(env: Bindings, task: CoachTask, now: Date): Promise<EnqueueResult> {
  const gameDay = await currentGameDay(env.DB);
  if (!gameDay) return { task, teams: 0, queued: 0, inline: 0, skipped: "chybí herní datum" };
  if (task === "weekly" && !isGameMonday(gameDay)) return { task, teams: 0, queued: 0, inline: 0, skipped: "není herní pondělí" };

  let teams = await listAiClubs(env.DB);
  if (task === "match") {
    const withFixture: string[] = [];
    for (const id of teams) {
      if ((await findTodaysFixtures(env.DB, id, gameDay)).length > 0) withFixture.push(id);
    }
    teams = withFixture;
  }
  if (task === "hourly" && HOURLY_HOOKS.length === 0) return { task, teams: 0, queued: 0, inline: 0, skipped: "žádné hodinové části" };
  const day = taskDay(task, gameDay, now);
  const enqueuedAt = now.toISOString();
  const bodies: AiCoachQueueMessage[] = teams.map((teamId) => ({ kind: "ai_coach", teamId, task, day, enqueuedAt }));

  if (env.MATCH_QUEUE) {
    let queued = 0;
    for (let i = 0; i < bodies.length; i += MAX_BATCH) {
      const chunk = bodies.slice(i, i + MAX_BATCH);
      try {
        await env.MATCH_QUEUE.sendBatch(chunk.map((body) => ({ body })));
        queued += chunk.length;
      } catch (e) {
        logger.error({ module: M }, `zařazení ${chunk.length} úloh ${task} selhalo`, e);
      }
    }
    return { task, teams: teams.length, queued, inline: 0, skipped: null };
  }

  let inline = 0;
  for (const body of bodies) {
    try {
      await handleAiCoachMessage(env, body, now);
      inline++;
    } catch (e) {
      logger.error({ module: M, teamId: body.teamId }, `úloha ${task} (bez fronty) selhala`, e);
    }
  }
  return { task, teams: teams.length, queued: 0, inline, skipped: null };
}

export interface CoachTaskResult {
  status: "done" | "duplicate" | "stale" | "not_ai" | "nothing";
  detail: unknown;
}

async function isAiClub(db: D1Database, teamId: string): Promise<boolean> {
  const row = await db.prepare("SELECT user_id, parent_team_id FROM teams WHERE id = ?").bind(teamId)
    .first<{ user_id: string; parent_team_id: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "kontrola AI klubu", e); return null; });
  return !!row && row.user_id === "ai" && !row.parent_team_id;
}

/**
 * Provede úlohu pro jeden klub. `claims: false` (admin nanečisto) nároky nezabírá.
 * Výjimka z části úlohy nárok uvolní, aby šla úloha zopakovat (retry fronty).
 */
export async function runAiCoachTask(
  env: Bindings,
  teamId: string,
  task: CoachTask,
  day: string,
  now: Date,
  opts: { dryRun?: boolean; claims?: boolean; model?: string } = {},
): Promise<CoachTaskResult> {
  const db = env.DB;
  const useClaims = opts.claims ?? !opts.dryRun;
  if (!(await isAiClub(db, teamId))) return { status: "not_ai", detail: null };
  const gameDay = day.slice(0, 10);

  if (task === "weekly") {
    if (useClaims && !(await claimCoachTask(db, teamId, "weekly", day))) return { status: "duplicate", detail: null };
    try {
      const res = await runWeeklyReview(env, teamId, now, { dryRun: opts.dryRun, model: opts.model });
      return { status: "done", detail: res };
    } catch (e) {
      if (useClaims) await releaseCoachTask(db, teamId, "weekly", day);
      throw e;
    }
  }

  if (task === "match") {
    const fixtures = await findTodaysFixtures(db, teamId, gameDay);
    if (fixtures.length === 0) return { status: "nothing", detail: null };
    const done: Array<{ fixture: string; used: string; lineupId: string | null } | { fixture: string; status: "duplicate" }> = [];
    for (const f of fixtures) {
      const claimKey = `match:${f.calendarId}`;
      if (useClaims && !(await claimCoachTask(db, teamId, claimKey, gameDay))) {
        done.push({ fixture: f.calendarId, status: "duplicate" });
        continue;
      }
      try {
        const r = await prepareAiLineup(env, teamId, f, { dryRun: opts.dryRun, model: opts.model });
        done.push({ fixture: f.calendarId, used: r.used, lineupId: r.lineupId });
      } catch (e) {
        if (useClaims) await releaseCoachTask(db, teamId, claimKey, gameDay);
        throw e;
      }
    }
    const allDuplicate = done.every((d) => "status" in d && d.status === "duplicate");
    return { status: allDuplicate ? "duplicate" : "done", detail: done };
  }

  // hourly: projdou se všechny části (přáteláky, přestupy…); chyba jedné nezastaví ostatní.
  if (useClaims && !(await claimCoachTask(db, teamId, "hourly", day))) return { status: "duplicate", detail: null };
  if (opts.dryRun) return { status: "done", detail: { hooks: HOURLY_HOOKS.map((h) => h.name), dryRun: true } };
  const profile = await ensureAiProfile(db, teamId);
  const results: Array<{ hook: string; ok: boolean }> = [];
  for (const hook of HOURLY_HOOKS) {
    try {
      await hook.run(env, teamId, profile, now);
      results.push({ hook: hook.name, ok: true });
    } catch (e) {
      logger.error({ module: M, teamId }, `hodinová část ${hook.name} selhala`, e);
      results.push({ hook: hook.name, ok: false });
    }
  }
  return { status: "done", detail: results };
}

/**
 * Konzumer zprávy `ai_coach`. Zastaralá zpráva (herní den se mezitím posunul) se zahodí:
 * sestava na včerejší zápas ani včerejší pondělní správa už nemají smysl.
 */
export async function handleAiCoachMessage(env: Bindings, msg: AiCoachQueueMessage, now: Date = new Date()): Promise<CoachTaskResult> {
  const gameDay = await currentGameDay(env.DB);
  if (gameDay && msg.day.slice(0, 10) !== gameDay) {
    logger.warn({ module: M, teamId: msg.teamId }, `zastaralá úloha ${msg.task} pro ${msg.day}, teď je ${gameDay}`);
    return { status: "stale", detail: null };
  }
  const res = await runAiCoachTask(env, msg.teamId, msg.task, msg.day, now);
  logger.info({ module: M, teamId: msg.teamId }, `úloha ${msg.task} (${msg.day}): ${res.status}`);
  return res;
}
