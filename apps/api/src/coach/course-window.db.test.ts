/**
 * Trenérská škola: okno na závěrečný test a připomínka. Okno bylo 7 herních dní a na jeho
 * konec upozorňovala jen notifikace, takže licenční kurzy propadaly bez jediného pokusu.
 * Teď je 14 dní a 3 dny před koncem přijde SMS od Trenérské školy.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { COURSE_RULES } from "@okresni-masina/shared";
import { EXAM_REMINDER_DAYS, examReminderText, tickCoachCourses } from "./courses";

let mf: Miniflare;
let db: D1Database;
const GAME_DATE = "2026-11-02T05:00:00.000Z";

async function schoolSms(teamId: string): Promise<string[]> {
  const res = await db.prepare(
    `SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.team_id = ? AND c.title = 'Trenérská škola' ORDER BY m.rowid`,
  ).bind(teamId).all<{ body: string }>();
  return res.results.map((r) => r.body);
}

async function course(teamId: string) {
  return db.prepare("SELECT status, days_remaining, exam_days_remaining, attempts_used, reminder_sent FROM coach_courses WHERE team_id = ? ORDER BY rowid DESC LIMIT 1")
    .bind(teamId).first<{ status: string; days_remaining: number; exam_days_remaining: number | null; attempts_used: number; reminder_sent: number }>();
}

async function addClub(id: string, status: string, daysRemaining: number, examDays: number | null, attemptsUsed = 0): Promise<void> {
  const village = await db.prepare("SELECT id FROM villages WHERE district = 'Prachatice' LIMIT 1").first<{ id: string }>();
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, 'x')").bind(`u-${id}`, `${id}@example.test`),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date) VALUES (?, ?, ?, ?, 100000, 50, ?)")
      .bind(id, `u-${id}`, village!.id, `Klub ${id}`, GAME_DATE),
    db.prepare(
      `INSERT INTO coach_courses (id, team_id, manager_id, kind, target_licence, price, retake_price, status, days_total, days_remaining, exam_days_remaining, attempts_used)
       VALUES (?, ?, 'mgr', 'licence', 1, 25000, 5000, ?, 10, ?, ?, ?)`,
    ).bind(`course-${id}`, id, status, daysRemaining, examDays, attemptsUsed),
  ]);
}

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await mf.getD1Database("DB");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  }
}, 180_000);

afterAll(async () => { await mf?.dispose(); });

describe("okno na test po kurzu", () => {
  it("má 14 herních dní a připomínka chodí 3 dny před koncem", () => {
    expect(COURSE_RULES.examWindowDays).toBe(14);
    expect(EXAM_REMINDER_DAYS).toBe(3);
  });

  it("konec kurzu otevře okno na test v plné délce a SMS řekne, kolik dní je", async () => {
    await addClub("ending", "in_progress", 1, null);
    await tickCoachCourses(db, "ending");
    expect(await course("ending")).toMatchObject({ status: "exam_ready", days_remaining: 0, exam_days_remaining: COURSE_RULES.examWindowDays });
    const sms = await schoolSms("ending");
    expect(sms).toHaveLength(1);
    expect(sms[0]).toContain(`Na test máš ${COURSE_RULES.examWindowDays} dní.`);
  });

  it("SMS s připomínkou přijde jednou, když zbývají 3 dny", async () => {
    await addClub("waiting", "exam_ready", 0, 5);
    await tickCoachCourses(db, "waiting"); // zbývají 4
    expect(await schoolSms("waiting")).toEqual([]);
    await tickCoachCourses(db, "waiting"); // zbývají 3
    const sms = await schoolSms("waiting");
    expect(sms).toHaveLength(1);
    expect(sms[0]).toContain("zbývají 3 dny");
    expect(sms[0]).toMatch(/opravný termín za 5\s000 Kč/);
    expect(sms[0]).not.toMatch(/[—–]/);
    expect(await course("waiting")).toMatchObject({ exam_days_remaining: 3, reminder_sent: 1 });
    await tickCoachCourses(db, "waiting"); // zbývají 2, podruhé už ne
    await tickCoachCourses(db, "waiting"); // zbývá 1
    expect(await schoolSms("waiting")).toHaveLength(1);
    expect(await course("waiting")).toMatchObject({ status: "exam_ready", exam_days_remaining: 1 });
  });

  it("zmeškaný test dá opravný termín s novým plným oknem a vlastní připomínkou", async () => {
    await tickCoachCourses(db, "waiting"); // okno vypršelo
    expect(await course("waiting")).toMatchObject({ status: "retake_available", attempts_used: 1, exam_days_remaining: COURSE_RULES.examWindowDays, reminder_sent: 0 });
    await db.prepare("UPDATE coach_courses SET exam_days_remaining = 4 WHERE team_id = 'waiting'").run();
    await tickCoachCourses(db, "waiting"); // zbývají 3
    const sms = await schoolSms("waiting");
    expect(sms[sms.length - 1]).toContain("opravný termín");
    expect(sms[sms.length - 1]).toContain("propadne i s penězi");
  });

  it("text připomínky podle stavu kurzu", () => {
    expect(examReminderText({ status: "exam_ready", attempts_used: 0, retake_price: 5000 }, "Licence C", 1)).toContain("zbývá poslední den");
    expect(examReminderText({ status: "exam_ready", attempts_used: 1, retake_price: 5000 }, "Licence C", 2)).toContain("kurz propadne i s penězi");
    expect(examReminderText({ status: "retake_available", attempts_used: 1, retake_price: 5000 }, "Licence C", 3)).toContain("Na přihlášku na opravný termín „Licence C“ zbývají 3 dny");
  });
});
