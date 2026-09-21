/**
 * Trenér — API profilu: Kabina (vztah hráčů k trenérovi), historie vztahu hráče
 * a trenérská škola (kurzy, skripta, závěrečné testy).
 *
 * GET routy propouští `requireTeamOwnership` bez kontroly, proto si je hlídáme
 * přes `tymyDivaka`: vztah hráčů k trenérovi ani test cizí kluby nevidí.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { requireAdmin, requireTeamOwnership } from "../auth/middleware";
import { tymyDivaka } from "../auth/divak";
import { loadKabina, loadPlayerRelationLog } from "../coach/kabina";
import { ensureAiManager } from "../coach/ai-manager";
import {
  CourseError, loadEducation, loadExam, loadMaterials, payRetake, saveAnswer, startCourse, startExam, submitExam,
} from "../coach/courses";

export const coachRouter = new Hono<{ Bindings: Bindings }>();

coachRouter.use("/teams/:teamId/coach/*", requireTeamOwnership);
coachRouter.use("/admin/coach/*", requireAdmin);

const NOT_YOURS = "Kabinu cizího klubu nevidíš.";

/** GET /teams/:teamId/coach/kabina — vztahy vlastních hráčů k trenérovi. */
coachRouter.get("/teams/:teamId/coach/kabina", async (c) => {
  const teamId = c.req.param("teamId");
  if (!(await tymyDivaka(c)).has(teamId)) return c.json({ error: NOT_YOURS }, 403);
  try {
    return c.json(await loadKabina(c.env.DB, teamId));
  } catch (e) {
    logger.error({ module: "coach" }, `kabina ${teamId}`, e);
    return c.json({ error: "Kabinu se nepodařilo načíst." }, 500);
  }
});

/** GET /teams/:teamId/coach/relation-log?playerId= — proč se vztah hráče k trenérovi měnil. */
coachRouter.get("/teams/:teamId/coach/relation-log", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.query("playerId");
  if (!playerId) return c.json({ error: "Chybí hráč." }, 400);
  if (!(await tymyDivaka(c)).has(teamId)) return c.json({ error: NOT_YOURS }, 403);
  return c.json({ items: await loadPlayerRelationLog(c.env.DB, teamId, playerId) });
});

/**
 * POST /admin/coach/backfill-ai-managers?limit=100 — uloží trenéra každému AI klubu, který ho nemá.
 * Dřív se AI trenér ukládal jen při otevření profilu, takže většina AI klubů hrála bez
 * zápasového bonusu trenéra i bez vlivu jeho disciplíny. Idempotentní, dá se pouštět opakovaně.
 */
coachRouter.post("/admin/coach/backfill-ai-managers", async (c) => {
  // Každý klub jsou až čtyři dotazy; 100 klubů se vejde do limitu subrequestů workeru.
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 100) || 100));
  const rows = await c.env.DB.prepare(
    `SELECT t.id FROM teams t
      WHERE t.user_id = 'ai' AND t.parent_team_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM managers m WHERE m.team_id = t.id)
      LIMIT ?`,
  ).bind(limit).all<{ id: string }>()
    .catch((e) => { logger.error({ module: "coach" }, "backfill AI managers: load teams", e); return null; });
  if (!rows) return c.json({ error: "Kluby se nepodařilo načíst." }, 500);

  let created = 0;
  for (const r of rows.results) {
    if (await ensureAiManager(c.env.DB, r.id)) created++;
  }
  const left = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM teams t
      WHERE t.user_id = 'ai' AND t.parent_team_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM managers m WHERE m.team_id = t.id)`,
  ).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: "coach" }, "backfill AI managers: count left", e); return null; });
  logger.info({ module: "coach" }, `backfill AI managers: ${created} uloženo, zbývá ${left?.n ?? "?"}`);
  return c.json({ created, remaining: left?.n ?? null });
});

// ── Trenérská škola ─────────────────────────────────────────────────────────

/** Chyby kurzu mají vlastní status a českou hlášku, ostatní jsou 500 s logem. */
async function courseCall<T>(c: { json: (body: unknown, status?: number) => Response }, what: string, fn: () => Promise<T>): Promise<Response> {
  try {
    return c.json(await fn());
  } catch (e) {
    if (e instanceof CourseError) return c.json({ error: e.message }, e.status);
    logger.error({ module: "coach" }, what, e);
    return c.json({ error: "Něco se pokazilo, zkus to prosím znovu." }, 500);
  }
}

const NOT_YOUR_COURSE = "Tohle je kurz cizího trenéra.";

/** GET /teams/:teamId/coach/education — licence, kurzy, nabídka (nabídka a test jen vlastníkovi). */
coachRouter.get("/teams/:teamId/coach/education", async (c) => {
  const teamId = c.req.param("teamId");
  const isOwner = (await tymyDivaka(c)).has(teamId);
  return courseCall(c, `education ${teamId}`, () => loadEducation(c.env.DB, teamId, isOwner));
});

/** POST /teams/:teamId/coach/courses { kind, attr? } — přihláška na kurz (zaplatí se hned). */
coachRouter.post("/teams/:teamId/coach/courses", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ kind?: string; attr?: string }>().catch((e) => {
    logger.warn({ module: "coach" }, "course body", e);
    return {} as { kind?: string; attr?: string };
  });
  try {
    const course = await startCourse(c.env.DB, teamId, { kind: body.kind ?? "", attr: body.attr ?? null });
    return c.json({ course: { id: course.id, status: course.status, daysRemaining: course.days_remaining } }, 201);
  } catch (e) {
    if (e instanceof CourseError) return c.json({ error: e.message }, e.status);
    logger.error({ module: "coach" }, `start course ${teamId}`, e);
    return c.json({ error: "Kurz se nepodařilo založit." }, 500);
  }
});

/** GET /teams/:teamId/coach/courses/:courseId/materials — skripta (během testu zamčená). */
coachRouter.get("/teams/:teamId/coach/courses/:courseId/materials", async (c) => {
  const teamId = c.req.param("teamId");
  if (!(await tymyDivaka(c)).has(teamId)) return c.json({ error: NOT_YOUR_COURSE }, 403);
  return courseCall(c, `materials ${teamId}`, () => loadMaterials(c.env.DB, teamId, c.req.param("courseId")));
});

/** GET /teams/:teamId/coach/courses/:courseId/exam — běžící test, připravený test, nebo výsledek. */
coachRouter.get("/teams/:teamId/coach/courses/:courseId/exam", async (c) => {
  const teamId = c.req.param("teamId");
  if (!(await tymyDivaka(c)).has(teamId)) return c.json({ error: NOT_YOUR_COURSE }, 403);
  return courseCall(c, `exam ${teamId}`, () => loadExam(c.env.DB, teamId, c.req.param("courseId")));
});

/** POST /teams/:teamId/coach/courses/:courseId/exam/start { confirm: true } — spustí čas. */
coachRouter.post("/teams/:teamId/coach/courses/:courseId/exam/start", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ confirm?: boolean }>().catch((e) => {
    logger.warn({ module: "coach" }, "exam start body", e);
    return {} as { confirm?: boolean };
  });
  return courseCall(c, `exam start ${teamId}`, () => startExam(c.env.DB, teamId, c.req.param("courseId"), body.confirm === true));
});

/** PUT /teams/:teamId/coach/courses/:courseId/exam/answer { attemptId, questionIndex, answer } — průběžné uložení. */
coachRouter.put("/teams/:teamId/coach/courses/:courseId/exam/answer", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ attemptId?: string; questionIndex?: number; answer?: number }>().catch((e) => {
    logger.warn({ module: "coach" }, "exam answer body", e);
    return {} as { attemptId?: string; questionIndex?: number; answer?: number };
  });
  if (!body.attemptId || typeof body.questionIndex !== "number" || typeof body.answer !== "number") {
    return c.json({ error: "Neplatná odpověď." }, 400);
  }
  return courseCall(c, `exam answer ${teamId}`, () => saveAnswer(c.env.DB, teamId, c.req.param("courseId"), {
    attemptId: body.attemptId!, questionIndex: body.questionIndex!, answer: body.answer!,
  }));
});

/** POST /teams/:teamId/coach/courses/:courseId/exam/submit { attemptId } — odevzdání a výsledek. */
coachRouter.post("/teams/:teamId/coach/courses/:courseId/exam/submit", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ attemptId?: string }>().catch((e) => {
    logger.warn({ module: "coach" }, "exam submit body", e);
    return {} as { attemptId?: string };
  });
  if (!body.attemptId) return c.json({ error: "Chybí pokus." }, 400);
  return courseCall(c, `exam submit ${teamId}`, () => submitExam(c.env.DB, teamId, c.req.param("courseId"), body.attemptId!));
});

/** POST /teams/:teamId/coach/courses/:courseId/retake — zaplatí opravný termín. */
coachRouter.post("/teams/:teamId/coach/courses/:courseId/retake", async (c) => {
  const teamId = c.req.param("teamId");
  return courseCall(c, `retake ${teamId}`, async () => {
    const course = await payRetake(c.env.DB, teamId, c.req.param("courseId"));
    return { course: { id: course.id, status: course.status, examDaysRemaining: course.exam_days_remaining } };
  });
});

// ── Admin: posun kurzu v čase pro testování ─────────────────────────────────

/** POST /admin/coach/courses/:courseId/fast-forward — kurz skončí při příštím denním ticku (days_remaining = 1). */
coachRouter.post("/admin/coach/courses/:courseId/fast-forward", async (c) => {
  const res = await c.env.DB.prepare(
    "UPDATE coach_courses SET days_remaining = 1 WHERE id = ? AND status = 'in_progress'",
  ).bind(c.req.param("courseId")).run();
  return c.json({ changed: res.meta?.changes ?? 0 });
});

/** POST /admin/coach/courses/:courseId/tick — jeden den trenérské školy klubu hned. */
coachRouter.post("/admin/coach/courses/:courseId/tick", async (c) => {
  const row = await c.env.DB.prepare("SELECT team_id FROM coach_courses WHERE id = ?")
    .bind(c.req.param("courseId")).first<{ team_id: string }>();
  if (!row) return c.json({ error: "Kurz nenalezen." }, 404);
  const { tickCoachCourses } = await import("../coach/courses");
  await tickCoachCourses(c.env.DB, row.team_id, c.env);
  const course = await c.env.DB.prepare("SELECT status, days_remaining, exam_days_remaining FROM coach_courses WHERE id = ?")
    .bind(c.req.param("courseId")).first();
  return c.json({ course });
});

/** POST /admin/coach/attempts/:attemptId/expire — test „vypršel" (ověření vyhodnocení bez odevzdání). */
coachRouter.post("/admin/coach/attempts/:attemptId/expire", async (c) => {
  const res = await c.env.DB.prepare(
    "UPDATE coach_exam_attempts SET expires_at = ? WHERE id = ? AND submitted_at IS NULL",
  ).bind(new Date(Date.now() - 60_000).toISOString(), c.req.param("attemptId")).run();
  return c.json({ changed: res.meta?.changes ?? 0 });
});
