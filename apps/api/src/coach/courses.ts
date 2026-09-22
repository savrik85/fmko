/**
 * Trenérská škola: kurzy vlastností, licenční kurzy a závěrečné testy.
 *
 * Průběh: zaplatit → trenér N herních dní chybí na tréninku a čte skripta → test.
 * Test je časově omezený a bez pauzy: čas běží na serveru od spuštění, odpovědi se
 * ukládají průběžně a po vypršení se vyhodnotí to, co je uložené. Neúspěch = jeden
 * opravný termín za 20 % ceny, druhý neúspěch = kurz propadá i s penězi.
 */

import {
  COURSE_ATTRS, COURSE_ATTR_LABELS, COURSE_ATTR_TOPIC, COURSE_RULES, LICENCE_COURSES, LICENCE_LEVELS, MAX_LICENCE,
  attrCoursePrice, examRulesFor, licenceCap, licenceLabel, licenceMinReputation, retakePrice,
  type CourseAttr, type CourseKind, type CourseStatus, type ExamRules,
} from "@okresni-masina/shared";
import { logger } from "../lib/logger";
import { applyManagerAttrDelta } from "../lib/manager-attrs";
import { assertPurchaseAllowed, recordTransaction } from "../season/finance-processor";
import { sendSystemSMS } from "../messaging/system-sms";
import { createNotification } from "../community/notifications";
import { getTeamGameDate } from "../community/manager-relations";
import type { PushEnv } from "../community/web-push";
import {
  courseLessons, courseQuestionPool, drawExam, gradeExam, publicQuestions, reviewFor,
  type DrawnExam, type PublicQuestion, type ReviewItem,
} from "./quiz";

const M = "coach-courses";
const SCHOOL = "Trenérská škola";
const ACTIVE_STATUSES = "('in_progress','exam_ready','retake_available')";
/** Odpověď odeslaná těsně po limitu (latence sítě) se ještě bere. */
const ANSWER_GRACE_MS = 5_000;

export class CourseError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409 | 423, message: string) {
    super(message);
  }
}

export interface CourseRow {
  id: string;
  team_id: string;
  manager_id: string;
  kind: CourseKind;
  attr: string | null;
  target_licence: number | null;
  points: number;
  price: number;
  retake_price: number;
  status: CourseStatus;
  days_total: number;
  days_remaining: number;
  exam_days_remaining: number | null;
  attempts_used: number;
  retake_paid: number;
  best_score: number | null;
  season_number: number;
  started_game_date: string | null;
  finished_game_date: string | null;
  reminder_sent: number;
  created_at: string;
}

interface AttemptRow {
  id: string;
  course_id: string;
  team_id: string;
  attempt_no: number;
  question_ids: string;
  option_orders: string;
  answers: string;
  score: number | null;
  total: number;
  pass_score: number;
  passed: number | null;
  started_at: string;
  expires_at: string;
  submitted_at: string | null;
}

interface ManagerRow {
  id: string;
  coaching: number;
  motivation: number;
  tactics: number;
  youth_development: number;
  discipline: number;
  reputation: number;
  licence_level: number;
  licence_source: string | null;
  licence_obtained_at: string | null;
}

// ── Pomocné ──

export function courseTitle(c: Pick<CourseRow, "kind" | "attr" | "target_licence">): string {
  if (c.kind === "licence") return `Licenční kurz ${licenceLabel(c.target_licence ?? 1)}`;
  const attr = COURSE_ATTR_LABELS[c.attr as CourseAttr] ?? c.attr ?? "";
  return c.kind === "attr_basic" ? `Základní kurz: ${attr}` : `Pokročilý kurz: ${attr}`;
}

function courseTopic(c: Pick<CourseRow, "kind" | "attr" | "target_licence">): string {
  if (c.kind === "licence") return `Skripta k licenci ${licenceLabel(c.target_licence ?? 1)}`;
  return COURSE_ATTR_TOPIC[c.attr as CourseAttr] ?? "";
}

function parseJson<T>(raw: string, what: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    logger.warn({ module: M }, `parse ${what}`, e);
    return fallback;
  }
}

function examOf(a: AttemptRow): DrawnExam {
  return {
    questionIds: parseJson<string[]>(a.question_ids, `question_ids ${a.id}`, []),
    optionOrders: parseJson<number[][]>(a.option_orders, `option_orders ${a.id}`, []),
  };
}

function answersOf(a: AttemptRow): number[] {
  return parseJson<number[]>(a.answers, `answers ${a.id}`, []);
}

function isExpired(a: AttemptRow, now = Date.now()): boolean {
  return now > Date.parse(a.expires_at) + ANSWER_GRACE_MS;
}

async function loadManager(db: D1Database, teamId: string): Promise<ManagerRow | null> {
  return db.prepare(
    `SELECT id, coaching, motivation, tactics, youth_development, discipline, reputation,
            COALESCE(licence_level, 0) AS licence_level, licence_source, licence_obtained_at
       FROM managers WHERE team_id = ? LIMIT 1`,
  ).bind(teamId).first<ManagerRow>()
    .catch((e) => { logger.warn({ module: M }, `load manager ${teamId}`, e); return null; });
}

async function currentSeason(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT MAX(number) AS n FROM seasons WHERE status = 'active'").first<{ n: number | null }>()
    .catch((e) => { logger.warn({ module: M }, "current season", e); return null; });
  return row?.n ?? 0;
}

async function loadActiveCourse(db: D1Database, teamId: string): Promise<CourseRow | null> {
  return db.prepare(`SELECT * FROM coach_courses WHERE team_id = ? AND status IN ${ACTIVE_STATUSES} LIMIT 1`)
    .bind(teamId).first<CourseRow>()
    .catch((e) => { logger.warn({ module: M }, `active course ${teamId}`, e); return null; });
}

async function loadCourse(db: D1Database, teamId: string, courseId: string): Promise<CourseRow> {
  const row = await db.prepare("SELECT * FROM coach_courses WHERE id = ? AND team_id = ?")
    .bind(courseId, teamId).first<CourseRow>();
  if (!row) throw new CourseError(404, "Kurz nenalezen.");
  return row;
}

async function loadAttempts(db: D1Database, courseId: string): Promise<AttemptRow[]> {
  const rows = await db.prepare("SELECT * FROM coach_exam_attempts WHERE course_id = ? ORDER BY attempt_no")
    .bind(courseId).all<AttemptRow>();
  return rows.results;
}

function openAttempt(attempts: AttemptRow[]): AttemptRow | null {
  return attempts.find((a) => !a.submitted_at) ?? null;
}

// ── Nabídka kurzů ──

export interface CourseOffer {
  kind: CourseKind;
  attr: CourseAttr | null;
  targetLicence: number | null;
  title: string;
  topic: string;
  current: number | null;
  cap: number | null;
  points: number;
  price: number;
  days: number;
  lessons: number;
  exam: ExamRules;
  available: boolean;
  blockers: string[];
}

interface SeasonUsage {
  attr: number;
  licence: number;
}

async function seasonUsage(db: D1Database, teamId: string, season: number): Promise<SeasonUsage> {
  const row = await db.prepare(
    `SELECT SUM(CASE WHEN kind = 'licence' THEN 0 ELSE 1 END) AS attr,
            SUM(CASE WHEN kind = 'licence' THEN 1 ELSE 0 END) AS licence
       FROM coach_courses WHERE team_id = ? AND season_number = ?`,
  ).bind(teamId, season).first<{ attr: number | null; licence: number | null }>()
    .catch((e) => { logger.warn({ module: M }, `season usage ${teamId}`, e); return null; });
  return { attr: row?.attr ?? 0, licence: row?.licence ?? 0 };
}

export function buildOffers(mgr: ManagerRow, usage: SeasonUsage, hasActive: boolean): CourseOffer[] {
  const cap = licenceCap(mgr.licence_level);
  const common: string[] = [];
  if (hasActive) common.push("Trenér už je na jiném kurzu.");
  const attrLimit = usage.attr >= COURSE_RULES.maxAttrCoursesPerSeason
    ? `Letos už jsi absolvoval ${COURSE_RULES.maxAttrCoursesPerSeason} kurzy vlastností, víc jich sezóna nedovolí.`
    : null;

  const offers: CourseOffer[] = [];
  for (const kind of ["attr_basic", "attr_advanced"] as const) {
    const rules = COURSE_RULES[kind];
    for (const attr of COURSE_ATTRS) {
      const current = (mgr as unknown as Record<string, number>)[attr];
      const blockers = [...common];
      if (attrLimit) blockers.push(attrLimit);
      if (mgr.licence_level < rules.minLicence) blockers.push(`Pokročilé kurzy jsou od licence ${licenceLabel(rules.minLicence)}.`);
      if (current >= cap) blockers.push(`${COURSE_ATTR_LABELS[attr]} je na stropu tvé licence (${cap}). Nejdřív vyšší licence.`);
      offers.push({
        kind, attr, targetLicence: null,
        title: courseTitle({ kind, attr, target_licence: null }),
        topic: COURSE_ATTR_TOPIC[attr],
        current, cap,
        points: Math.min(rules.points, Math.max(0, cap - current)),
        price: attrCoursePrice(kind, current),
        days: rules.days,
        lessons: courseLessons({ kind, attr, target_licence: null }).length,
        exam: rules.exam,
        available: blockers.length === 0,
        blockers,
      });
    }
  }

  if (mgr.licence_level < MAX_LICENCE) {
    const target = (mgr.licence_level + 1) as 1 | 2 | 3 | 4;
    const blockers = [...common];
    const minRep = licenceMinReputation(target);
    if (mgr.reputation < minRep) blockers.push(`Na ${licenceLabel(target)} potřebuješ reputaci aspoň ${minRep} (máš ${mgr.reputation}).`);
    if (usage.licence >= COURSE_RULES.maxLicenceCoursesPerSeason) blockers.push("Licenční kurz jde jen jednou za sezónu.");
    offers.push({
      kind: "licence", attr: null, targetLicence: target,
      title: courseTitle({ kind: "licence", attr: null, target_licence: target }),
      topic: courseTopic({ kind: "licence", attr: null, target_licence: target }),
      current: mgr.licence_level, cap: licenceCap(target),
      points: 0,
      price: LICENCE_COURSES[target].price,
      days: LICENCE_COURSES[target].days,
      lessons: courseLessons({ kind: "licence", attr: null, target_licence: target }).length,
      exam: COURSE_RULES.licence.exam,
      available: blockers.length === 0,
      blockers,
    });
  }
  return offers;
}

// ── Přehled pro záložku Vzdělání ──

export async function loadEducation(db: D1Database, teamId: string, isOwner: boolean) {
  const mgr = await loadManager(db, teamId);
  if (!mgr) throw new CourseError(404, "Klub nemá trenéra.");
  const season = await currentSeason(db);
  const [active, usage, completedRows] = await Promise.all([
    loadActiveCourse(db, teamId),
    seasonUsage(db, teamId, season),
    db.prepare(
      `SELECT * FROM coach_courses WHERE team_id = ? AND status IN ('passed','failed')
        ORDER BY created_at DESC LIMIT 12`,
    ).bind(teamId).all<CourseRow>()
      .catch((e) => { logger.warn({ module: M }, `completed courses ${teamId}`, e); return { results: [] as CourseRow[] }; }),
  ]);

  let activeOut: Record<string, unknown> | null = null;
  if (active) {
    const attempts = await loadAttempts(db, active.id);
    const open = openAttempt(attempts);
    const last = [...attempts].reverse().find((a) => a.submitted_at);
    activeOut = {
      id: active.id,
      kind: active.kind,
      attr: active.attr,
      targetLicence: active.target_licence,
      title: courseTitle(active),
      topic: courseTopic(active),
      status: active.status,
      daysTotal: active.days_total,
      daysRemaining: active.days_remaining,
      examDaysRemaining: active.exam_days_remaining,
      price: active.price,
      retakePrice: active.retake_price,
      attemptsUsed: active.attempts_used,
      exam: examRulesFor(active.kind),
      ...(isOwner ? {
        openAttempt: open ? { id: open.id, expiresAt: open.expires_at } : null,
        lastScore: last ? { score: last.score, total: last.total, passScore: last.pass_score } : null,
      } : {}),
    };
  }

  return {
    licence: {
      level: mgr.licence_level,
      label: licenceLabel(mgr.licence_level),
      cap: licenceCap(mgr.licence_level),
      source: mgr.licence_source ?? "derived",
      obtainedAt: mgr.licence_obtained_at,
    },
    reputation: mgr.reputation,
    ladder: LICENCE_LEVELS.map((l) => ({
      level: l.level,
      label: l.label,
      cap: l.cap,
      minReputation: l.minReputation,
      price: l.level > 0 ? LICENCE_COURSES[l.level as 1 | 2 | 3 | 4].price : 0,
      days: l.level > 0 ? LICENCE_COURSES[l.level as 1 | 2 | 3 | 4].days : 0,
      reached: mgr.licence_level >= l.level,
    })),
    active: activeOut,
    offers: isOwner ? buildOffers(mgr, usage, !!active) : null,
    completed: completedRows.results.map((c) => ({
      id: c.id,
      title: courseTitle(c),
      status: c.status,
      score: c.best_score,
      total: examRulesFor(c.kind).questions,
      finishedAt: c.finished_game_date ?? c.created_at,
    })),
    season: {
      attrUsed: usage.attr,
      attrMax: COURSE_RULES.maxAttrCoursesPerSeason,
      licenceUsed: usage.licence,
      licenceMax: COURSE_RULES.maxLicenceCoursesPerSeason,
    },
  };
}

// ── Zahájení kurzu ──

export async function startCourse(
  db: D1Database,
  teamId: string,
  input: { kind: string; attr?: string | null },
): Promise<CourseRow> {
  const kind = input.kind as CourseKind;
  if (!["attr_basic", "attr_advanced", "licence"].includes(kind)) throw new CourseError(400, "Neznámý druh kurzu.");
  const attr = kind === "licence" ? null : (input.attr as CourseAttr);
  if (kind !== "licence" && !COURSE_ATTRS.includes(attr as CourseAttr)) throw new CourseError(400, "Neznámá vlastnost.");

  const mgr = await loadManager(db, teamId);
  if (!mgr) throw new CourseError(404, "Klub nemá trenéra.");
  const season = await currentSeason(db);
  const active = await loadActiveCourse(db, teamId);
  const offer = buildOffers(mgr, await seasonUsage(db, teamId, season), !!active)
    .find((o) => o.kind === kind && (kind === "licence" || o.attr === attr));
  if (!offer) throw new CourseError(400, "Tenhle kurz teď nabízet nejde.");
  if (active) throw new CourseError(409, "Trenér už je na jiném kurzu.");
  if (!offer.available) throw new CourseError(403, offer.blockers[0] ?? "Na kurz se teď přihlásit nejde.");
  if (courseQuestionPool({ kind, attr, target_licence: offer.targetLicence }).length < offer.exam.questions) {
    logger.error({ module: M }, `málo otázek pro ${kind}/${attr}/${offer.targetLicence}`);
    throw new CourseError(400, "Škola na tenhle kurz zatím nemá připravený test.");
  }

  const allowed = await assertPurchaseAllowed(db, teamId, offer.price);
  if (!allowed.ok) throw new CourseError(400, allowed.reason);

  const gameDate = await getTeamGameDate(db, teamId);
  const id = crypto.randomUUID();
  try {
    await db.prepare(
      `INSERT INTO coach_courses (id, team_id, manager_id, kind, attr, target_licence, points, price, retake_price,
                                  status, days_total, days_remaining, season_number, started_game_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, ?)`,
    ).bind(id, teamId, mgr.id, kind, attr, offer.targetLicence, offer.points, offer.price, retakePrice(offer.price),
      offer.days, offer.days, season, gameDate).run();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/UNIQUE/i.test(message)) throw new CourseError(409, "Trenér už je na jiném kurzu.");
    throw e;
  }

  try {
    await recordTransaction(db, teamId, "coach_course", -offer.price, `${SCHOOL}: ${offer.title}`, gameDate, id);
  } catch (e) {
    logger.warn({ module: M }, `platba kurzu ${id} neprošla, ruším`, e);
    await db.prepare("DELETE FROM coach_courses WHERE id = ?").bind(id).run()
      .catch((err) => logger.error({ module: M }, `zrušení nezaplaceného kurzu ${id}`, err));
    throw new CourseError(400, "Kurz se nepodařilo zaplatit.");
  }

  await sendSystemSMS(db, teamId, SCHOOL,
    `Vítej na kurzu „${offer.title}“. Skripta máš na profilu trenéra v záložce Vzdělání. `
    + `Kurz trvá ${offer.days} dní a trenér zatím chybí na tréninku. Pak tě čeká test: `
    + `${offer.exam.questions} otázek, ${offer.exam.timeLimitMin} minut, projdeš s ${offer.exam.passScore} správnými.`,
  ).catch((e) => logger.warn({ module: M }, `uvítací SMS kurzu ${id}`, e));

  return loadCourse(db, teamId, id);
}

// ── Skripta ──

export async function loadMaterials(db: D1Database, teamId: string, courseId: string) {
  const course = await loadCourse(db, teamId, courseId);
  const attempts = await loadAttempts(db, course.id);
  const open = openAttempt(attempts);
  if (open && !isExpired(open)) throw new CourseError(423, "Během testu jsou skripta zamčená.");
  if (open) await finalizeAttempt(db, course, open);
  return {
    course: { id: course.id, title: courseTitle(course), topic: courseTopic(course), status: course.status },
    lessons: courseLessons(course).map((l) => ({ id: l.id, title: l.title, body: l.body })),
  };
}

// ── Test ──

export interface ExamRunning {
  state: "running";
  attemptId: string;
  attemptNo: number;
  expiresAt: string;
  serverNow: string;
  questions: PublicQuestion[];
  answers: number[];
  rules: ExamRules;
}

export interface ExamResult {
  state: "result";
  courseTitle: string;
  courseStatus: CourseStatus;
  score: number;
  total: number;
  passScore: number;
  passed: boolean;
  review: ReviewItem[];
  retakePrice: number | null;
  reward: string | null;
}

export interface ExamReady {
  state: "ready";
  courseTitle: string;
  courseStatus: CourseStatus;
  rules: ExamRules;
  attemptNo: number;
  attemptsLeft: number;
  examDaysRemaining: number | null;
  retakePrice: number;
}

function running(a: AttemptRow, rules: ExamRules): ExamRunning {
  return {
    state: "running",
    attemptId: a.id,
    attemptNo: a.attempt_no,
    expiresAt: a.expires_at,
    serverNow: new Date().toISOString(),
    questions: publicQuestions(examOf(a)),
    answers: answersOf(a),
    rules,
  };
}

function rewardText(course: CourseRow): string {
  if (course.kind === "licence") return `Licence ${licenceLabel(course.target_licence ?? 1)} a +2 reputace`;
  return `${COURSE_ATTR_LABELS[course.attr as CourseAttr]} +${course.points}`;
}

function resultOf(course: CourseRow, a: AttemptRow): ExamResult {
  const passed = a.passed === 1;
  // Správné odpovědi se odhalí, až když je o kurzu rozhodnuto.
  const reveal = passed || course.status === "failed";
  return {
    state: "result",
    courseTitle: courseTitle(course),
    courseStatus: course.status,
    score: a.score ?? 0,
    total: a.total,
    passScore: a.pass_score,
    passed,
    review: reviewFor(examOf(a), answersOf(a), reveal),
    retakePrice: course.status === "retake_available" ? course.retake_price : null,
    reward: passed ? rewardText(course) : null,
  };
}

export async function loadExam(db: D1Database, teamId: string, courseId: string): Promise<ExamRunning | ExamResult | ExamReady> {
  let course = await loadCourse(db, teamId, courseId);
  const rules = examRulesFor(course.kind);
  const attempts = await loadAttempts(db, course.id);
  const open = openAttempt(attempts);
  if (open && !isExpired(open)) return running(open, rules);
  if (open) {
    await finalizeAttempt(db, course, open);
    course = await loadCourse(db, teamId, courseId);
  }
  if (course.status === "exam_ready") {
    return {
      state: "ready",
      courseTitle: courseTitle(course),
      courseStatus: course.status,
      rules,
      attemptNo: course.attempts_used + 1,
      attemptsLeft: 2 - course.attempts_used,
      examDaysRemaining: course.exam_days_remaining,
      retakePrice: course.retake_price,
    };
  }
  const last = [...(await loadAttempts(db, course.id))].reverse().find((a) => a.submitted_at);
  if (!last) {
    if (course.status === "in_progress") throw new CourseError(409, `Kurz ještě běží, test bude za ${course.days_remaining} d.`);
    throw new CourseError(404, "K tomuhle kurzu žádný test neproběhl.");
  }
  return resultOf(course, last);
}

export async function startExam(db: D1Database, teamId: string, courseId: string, confirmed: boolean): Promise<ExamRunning> {
  if (!confirmed) throw new CourseError(400, "Nejdřív potvrď, že jsi připravený. Test nejde přerušit.");
  const course = await loadCourse(db, teamId, courseId);
  const rules = examRulesFor(course.kind);
  const attempts = await loadAttempts(db, course.id);
  const open = openAttempt(attempts);
  if (open && !isExpired(open)) return running(open, rules);
  if (open) {
    await finalizeAttempt(db, course, open);
    throw new CourseError(409, "Čas na test vypršel, výsledek je vyhodnocený.");
  }
  if (course.status !== "exam_ready") {
    throw new CourseError(409, course.status === "in_progress"
      ? `Kurz ještě běží, test bude za ${course.days_remaining} d.`
      : course.status === "retake_available" ? "Na opravný termín se nejdřív musíš přihlásit." : "Test už je uzavřený.");
  }

  // Otázky z dřívějších pokusů tohoto kurzu až nakonec, otázky viděné v jiných kurzech klubu až po nových.
  const exclude = new Set(attempts.flatMap((a) => examOf(a).questionIds));
  const seenRows = await db.prepare("SELECT question_ids FROM coach_exam_attempts WHERE team_id = ?")
    .bind(teamId).all<{ question_ids: string }>()
    .catch((e) => { logger.warn({ module: M }, `seen questions ${teamId}`, e); return { results: [] as Array<{ question_ids: string }> }; });
  const seen = new Set(seenRows.results.flatMap((r) => parseJson<string[]>(r.question_ids, "seen question_ids", [])));
  const exam = drawExam(courseQuestionPool(course), rules.questions, exclude, seen);
  if (exam.questionIds.length < rules.questions) throw new CourseError(400, "Škola na tenhle kurz zatím nemá připravený test.");

  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + rules.timeLimitMin * 60_000);
  const attemptNo = course.attempts_used + 1;
  await db.prepare(
    `INSERT OR IGNORE INTO coach_exam_attempts (id, course_id, team_id, attempt_no, question_ids, option_orders, answers,
                                                total, pass_score, started_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), course.id, teamId, attemptNo, JSON.stringify(exam.questionIds),
    JSON.stringify(exam.optionOrders), JSON.stringify(exam.questionIds.map(() => -1)),
    rules.questions, rules.passScore, startedAt.toISOString(), expiresAt.toISOString()).run();

  // Dvojklik: druhý INSERT se ignoruje a oba dostanou tentýž pokus.
  const created = await db.prepare("SELECT * FROM coach_exam_attempts WHERE course_id = ? AND attempt_no = ?")
    .bind(course.id, attemptNo).first<AttemptRow>();
  if (!created) throw new CourseError(409, "Test se nepodařilo spustit.");
  logger.info({ module: M }, `test ${course.id} pokus ${attemptNo} spuštěn, do ${created.expires_at}`);
  return running(created, rules);
}

export async function saveAnswer(
  db: D1Database,
  teamId: string,
  courseId: string,
  input: { attemptId: string; questionIndex: number; answer: number },
): Promise<{ ok: true }> {
  const attempt = await db.prepare("SELECT * FROM coach_exam_attempts WHERE id = ? AND course_id = ? AND team_id = ?")
    .bind(input.attemptId, courseId, teamId).first<AttemptRow>();
  if (!attempt) throw new CourseError(404, "Pokus nenalezen.");
  if (attempt.submitted_at) throw new CourseError(409, "Test už je odevzdaný.");
  if (isExpired(attempt)) throw new CourseError(409, "Čas vypršel, odpověď už se nezapočítá.");
  const i = Math.floor(input.questionIndex);
  const answer = Math.floor(input.answer);
  if (!(i >= 0 && i < attempt.total) || !(answer >= -1 && answer <= 3)) throw new CourseError(400, "Neplatná odpověď.");

  const res = await db.prepare(
    `UPDATE coach_exam_attempts SET answers = json_set(answers, ?, ?)
      WHERE id = ? AND submitted_at IS NULL`,
  ).bind(`$[${i}]`, answer, attempt.id).run();
  if ((res.meta?.changes ?? 0) === 0) throw new CourseError(409, "Test už je odevzdaný.");
  return { ok: true };
}

export async function submitExam(db: D1Database, teamId: string, courseId: string, attemptId: string): Promise<ExamResult> {
  const course = await loadCourse(db, teamId, courseId);
  const attempt = await db.prepare("SELECT * FROM coach_exam_attempts WHERE id = ? AND course_id = ? AND team_id = ?")
    .bind(attemptId, courseId, teamId).first<AttemptRow>();
  if (!attempt) throw new CourseError(404, "Pokus nenalezen.");
  if (!attempt.submitted_at) await finalizeAttempt(db, course, attempt);
  const fresh = await loadCourse(db, teamId, courseId);
  const graded = await db.prepare("SELECT * FROM coach_exam_attempts WHERE id = ?").bind(attemptId).first<AttemptRow>();
  if (!graded) throw new CourseError(404, "Pokus nenalezen.");
  return resultOf(fresh, graded);
}

/**
 * Vyhodnotí pokus a posune kurz. Běží jen jednou: UPDATE s `submitted_at IS NULL`
 * pustí dál jen prvního, souběžné odevzdání a líné vyhodnocení se nepřepíšou.
 */
async function finalizeAttempt(db: D1Database, course: CourseRow, attempt: AttemptRow): Promise<void> {
  const score = gradeExam(examOf(attempt), answersOf(attempt));
  const passed = score >= attempt.pass_score;
  const claim = await db.prepare(
    "UPDATE coach_exam_attempts SET score = ?, passed = ?, submitted_at = ? WHERE id = ? AND submitted_at IS NULL",
  ).bind(score, passed ? 1 : 0, new Date().toISOString(), attempt.id).run();
  if ((claim.meta?.changes ?? 0) === 0) return;

  const attemptsUsed = course.attempts_used + 1;
  const status: CourseStatus = passed ? "passed" : attemptsUsed >= 2 ? "failed" : "retake_available";
  const gameDate = await getTeamGameDate(db, course.team_id);
  await db.prepare(
    `UPDATE coach_courses
        SET attempts_used = ?, best_score = MAX(COALESCE(best_score, 0), ?), status = ?,
            exam_days_remaining = ?, reminder_sent = 0, finished_game_date = CASE WHEN ? IN ('passed','failed') THEN ? ELSE finished_game_date END
      WHERE id = ? AND status = 'exam_ready'`,
  ).bind(attemptsUsed, score, status, status === "retake_available" ? COURSE_RULES.examWindowDays : null,
    status, gameDate, course.id).run();

  const title = courseTitle(course);
  if (passed) {
    await grantReward(db, course, score, attempt.total, gameDate);
    await sendSystemSMS(db, course.team_id, SCHOOL,
      `Gratulujeme, test „${title}“ jsi dal na ${score} z ${attempt.total}. ${rewardText(course)}.`)
      .catch((e) => logger.warn({ module: M }, `SMS úspěchu ${course.id}`, e));
  } else if (status === "retake_available") {
    await sendSystemSMS(db, course.team_id, SCHOOL,
      `Test „${title}“ nevyšel (${score} z ${attempt.total}, potřeba ${attempt.pass_score}). `
      + `Máš jeden opravný termín za ${course.retake_price.toLocaleString("cs")} Kč, přihlásit se můžeš do ${COURSE_RULES.examWindowDays} dní.`)
      .catch((e) => logger.warn({ module: M }, `SMS neúspěchu ${course.id}`, e));
  } else {
    await sendSystemSMS(db, course.team_id, SCHOOL,
      `Ani opravný termín „${title}“ nevyšel (${score} z ${attempt.total}). Kurz propadá. Zkusit to můžeš znovu od začátku.`)
      .catch((e) => logger.warn({ module: M }, `SMS propadnutí ${course.id}`, e));
  }
  logger.info({ module: M }, `test ${course.id} pokus ${attempt.attempt_no}: ${score}/${attempt.total} → ${status}`);
}

async function grantReward(db: D1Database, course: CourseRow, score: number, total: number, gameDate: string): Promise<void> {
  if (course.kind === "licence") {
    const target = course.target_licence ?? 1;
    await db.prepare(
      `UPDATE managers SET licence_level = ?, licence_source = 'course', licence_obtained_at = ?
        WHERE team_id = ? AND COALESCE(licence_level, 0) < ?`,
    ).bind(target, gameDate, course.team_id, target).run()
      .catch((e) => logger.error({ module: M }, `udělení licence ${course.id}`, e));
    await applyManagerAttrDelta(db, course.team_id, "reputation", 2, "course",
      `Nová licence ${licenceLabel(target)} (test ${score}/${total})`, { referenceId: `course-rep-${course.id}`, gameDate });
    return;
  }
  await applyManagerAttrDelta(db, course.team_id, course.attr as CourseAttr, course.points, "course",
    `${courseTitle(course)} (test ${score}/${total})`, { referenceId: `course-${course.id}`, gameDate });
}

export async function payRetake(db: D1Database, teamId: string, courseId: string): Promise<CourseRow> {
  const course = await loadCourse(db, teamId, courseId);
  if (course.status !== "retake_available") throw new CourseError(409, "Opravný termín teď není k dispozici.");
  const allowed = await assertPurchaseAllowed(db, teamId, course.retake_price);
  if (!allowed.ok) throw new CourseError(400, allowed.reason);

  const claim = await db.prepare(
    `UPDATE coach_courses SET status = 'exam_ready', retake_paid = 1, exam_days_remaining = ?, reminder_sent = 0
      WHERE id = ? AND status = 'retake_available'`,
  ).bind(COURSE_RULES.examWindowDays, course.id).run();
  if ((claim.meta?.changes ?? 0) === 0) throw new CourseError(409, "Opravný termín už je zaplacený.");

  const gameDate = await getTeamGameDate(db, teamId);
  try {
    await recordTransaction(db, teamId, "coach_exam_retake", -course.retake_price,
      `${SCHOOL}: opravný termín, ${courseTitle(course)}`, gameDate, `retake-${course.id}`);
  } catch (e) {
    logger.warn({ module: M }, `platba opravného termínu ${course.id} neprošla, vracím`, e);
    await db.prepare("UPDATE coach_courses SET status = 'retake_available', retake_paid = 0 WHERE id = ?")
      .bind(course.id).run()
      .catch((err) => logger.error({ module: M }, `vrácení opravného termínu ${course.id}`, err));
    throw new CourseError(400, "Opravný termín se nepodařilo zaplatit.");
  }
  return loadCourse(db, teamId, courseId);
}

// ── Denní odpočet (team-day) ──

/**
 * Jeden herní den trenérské školy klubu: odpočet kurzu, konec kurzu → test,
 * odpočet okna na test, připomínka, propadnutí. Vyhodnotí i test, který někdo
 * spustil a nedokončil (čas běží dál i bez něj).
 */
export async function tickCoachCourses(db: D1Database, teamId: string, env?: PushEnv): Promise<void> {
  const course = await loadActiveCourse(db, teamId);
  if (!course) return;
  const title = courseTitle(course);

  if (course.status === "in_progress") {
    const left = Math.max(0, course.days_remaining - 1);
    if (left > 0) {
      await db.prepare("UPDATE coach_courses SET days_remaining = ? WHERE id = ? AND status = 'in_progress'")
        .bind(left, course.id).run();
      return;
    }
    const gameDate = await getTeamGameDate(db, teamId);
    await db.prepare(
      `UPDATE coach_courses SET days_remaining = 0, status = 'exam_ready', exam_days_remaining = ?, finished_game_date = ?
        WHERE id = ? AND status = 'in_progress'`,
    ).bind(COURSE_RULES.examWindowDays, gameDate, course.id).run();
    const rules = examRulesFor(course.kind);
    await sendSystemSMS(db, teamId, SCHOOL,
      `Kurz „${title}“ skončil a trenér je zpátky na tréninku. Teď tě čeká závěrečný test: `
      + `${rules.questions} otázek, ${rules.timeLimitMin} minut bez pauzy, potřeba ${rules.passScore} správně. `
      + `Na test máš ${COURSE_RULES.examWindowDays} dní.`, { type: "coach_course", courseId: course.id })
      .catch((e) => logger.warn({ module: M }, `SMS konce kurzu ${course.id}`, e));
    await createNotification(db, teamId, "event", "🎓 Kurz skončil, čeká tě test",
      `${title}: ${rules.questions} otázek, ${rules.timeLimitMin} minut.`, `/trener/test?kurz=${course.id}`, env)
      .catch((e) => logger.warn({ module: M }, `notifikace konce kurzu ${course.id}`, e));
    return;
  }

  // Někdo test spustil a neodevzdal: čas vypršel, vyhodnotí se uložené odpovědi.
  const attempts = await loadAttempts(db, course.id);
  const open = openAttempt(attempts);
  if (open) {
    if (isExpired(open)) await finalizeAttempt(db, course, open);
    return;
  }

  const left = Math.max(0, (course.exam_days_remaining ?? 0) - 1);
  if (left > 0) {
    await db.prepare("UPDATE coach_courses SET exam_days_remaining = ? WHERE id = ? AND status = ?")
      .bind(left, course.id, course.status).run();
    if (left <= 2 && !course.reminder_sent) {
      await db.prepare("UPDATE coach_courses SET reminder_sent = 1 WHERE id = ?").bind(course.id).run();
      const what = course.status === "exam_ready" ? "test" : "přihlášku na opravný termín";
      await createNotification(db, teamId, "event", `🎓 Poslední ${left === 1 ? "den" : "dny"} na ${what}`,
        `${title}: zbývá ${left} ${left === 1 ? "den" : "dny"}.`, `/manazer/${teamId}?tab=vzdelani`, env)
        .catch((e) => logger.warn({ module: M }, `připomínka testu ${course.id}`, e));
    }
    return;
  }

  // Okno vypršelo.
  const gameDate = await getTeamGameDate(db, teamId);
  if (course.status === "exam_ready" && course.attempts_used === 0) {
    // Nepřišel na test = neúspěšný pokus, zbývá opravný termín.
    await db.prepare(
      `UPDATE coach_courses SET attempts_used = 1, status = 'retake_available', exam_days_remaining = ?, reminder_sent = 0
        WHERE id = ? AND status = 'exam_ready'`,
    ).bind(COURSE_RULES.examWindowDays, course.id).run();
    await sendSystemSMS(db, teamId, SCHOOL,
      `Na test „${title}“ jsi nepřišel, počítá se jako nesplněný. Zbývá opravný termín za ${course.retake_price.toLocaleString("cs")} Kč.`)
      .catch((e) => logger.warn({ module: M }, `SMS zmeškaného testu ${course.id}`, e));
    return;
  }
  await db.prepare(
    `UPDATE coach_courses SET status = 'failed', attempts_used = MAX(attempts_used, 2), finished_game_date = ?
      WHERE id = ? AND status IN ('exam_ready','retake_available')`,
  ).bind(gameDate, course.id).run();
  await sendSystemSMS(db, teamId, SCHOOL,
    `Kurz „${title}“ propadl, na test ani opravný termín už nedošlo. Peníze se nevrací.`)
    .catch((e) => logger.warn({ module: M }, `SMS propadnutí kurzu ${course.id}`, e));
}

/** Je trenér právě na kurzu (a chybí na tréninku)? Pro denní trénink. */
export async function isCoachAway(db: D1Database, clubId: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 FROM coach_courses WHERE team_id = ? AND status = 'in_progress' LIMIT 1")
    .bind(clubId).first()
    .catch((e) => { logger.warn({ module: M }, `coach away ${clubId}`, e); return null; });
  return !!row;
}
