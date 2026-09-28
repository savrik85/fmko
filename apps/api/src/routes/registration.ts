import { Hono } from "hono";
import { REGISTRATION_DISTRICTS } from "@okresni-masina/shared";
import type { Bindings } from "../index";
import { requireAdmin, requireAuth } from "../auth/middleware";
import { createSession, type Session } from "../auth/session";
import { hashPassword } from "../auth/password";
import { districtAccess } from "../registration/district-access";

export const registrationRouter = new Hono<{ Bindings: Bindings }>();

export async function hashActivationToken(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}

function newToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
}

registrationRouter.get("/districts", async c => {
  const { results } = await c.env.DB.prepare("SELECT district, status FROM district_registrations").all<{ district: string; status: string }>();
  const statuses = new Map(results.map(row => [row.district, row.status]));
  return c.json(REGISTRATION_DISTRICTS.map(name => ({ name, status: statuses.get(name) ?? "available" })));
});

registrationRouter.post("/requests", async c => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.name !== "string" || typeof body.email !== "string" || typeof body.district !== "string") {
    return c.json({ error: "Vyplň jméno, e-mail a okres." }, 400);
  }
  const name = body.name.trim();
  const email = body.email.trim().toLowerCase();
  const district = body.district;
  if (name.length < 2 || name.length > 80 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !(REGISTRATION_DISTRICTS as readonly string[]).includes(district)) {
    return c.json({ error: "Zkontroluj jméno (2–80 znaků), platný e-mail a výběr okresu." }, 400);
  }
  const ip = c.req.header("CF-Connecting-IP");
  if (ip) {
    const key = `registration-rate:${await hashActivationToken(ip)}:${Math.floor(Date.now() / 3600000)}`;
    const count = Number(await c.env.CACHE_KV.get(key) ?? 0);
    if (count >= 5) return c.json({ error: "Příliš mnoho žádostí. Zkus to prosím za hodinu." }, 429);
    await c.env.CACHE_KV.put(key, String(count + 1), { expirationTtl: 3600 });
  }
  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").bind(email).first();
  if (existing) return c.json({ error: "Pro tento e-mail už účet existuje. Přihlas se ke svému účtu." }, 409);
  const id = crypto.randomUUID();
  // Jediná dávka: duplicita nikdy nepřepíše kontakt ani rezervaci zakladatele.
  const result = await c.env.DB.batch([
    c.env.DB.prepare("INSERT OR IGNORE INTO league_requests (id, name, email, district) VALUES (?, ?, ?, ?)").bind(id, name, email, district),
    c.env.DB.prepare(`INSERT OR IGNORE INTO district_registrations (district, founder_request_id)
      SELECT district, id FROM league_requests WHERE id = ?`).bind(id),
  ]);
  if (!result[0].meta.changes) return c.json({ error: "Žádost pro tento e-mail už máme. Vyčkej na aktivační odkaz; pokud nedorazí do 24 hodin, napiš na admin@prales.fun." }, 409);
  return c.json({ accepted: true }, 201);
});

registrationRouter.get("/access", requireAuth, async c => {
  const session = c.get("session" as never) as Session;
  const user = await c.env.DB.prepare("SELECT display_name, registration_district FROM users WHERE id = ?")
    .bind(session.userId).first<{ display_name: string | null; registration_district: string | null }>();
  const { results } = await c.env.DB.prepare("SELECT district FROM district_registrations WHERE status = 'ready'").all<{ district: string }>();
  const districts: string[] = [];
  for (const row of results) {
    if (!await districtAccess(c.env.DB, row.district, session.userId)) districts.push(row.district);
  }
  return c.json({ district: user?.registration_district ?? null, name: user?.display_name ?? "", districts });
});

registrationRouter.use("/admin/*", requireAdmin);
registrationRouter.get("/admin/requests", async c => {
  const { results } = await c.env.DB.prepare(`SELECT r.id, r.name, r.email, r.district, r.status, r.created_at,
    r.activation_expires_at, d.status AS district_status, d.founder_request_id = r.id AS is_founder
    FROM league_requests r JOIN district_registrations d ON d.district = r.district
    ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'invited' THEN 1 ELSE 2 END, r.created_at LIMIT 200`).all();
  return c.json(results);
});

registrationRouter.post("/admin/requests/:id/approve", async c => {
  const request = await c.env.DB.prepare("SELECT id, email, district, status FROM league_requests WHERE id = ?")
    .bind(c.req.param("id")).first<{ id: string; email: string; district: string; status: string }>();
  if (!request) return c.json({ error: "Žádost nebyla nalezena." }, 404);
  if (request.status === "activated") return c.json({ error: "Účet je už aktivovaný." }, 409);
  const body = await c.req.json().catch(() => null);
  if (body?.dataReady !== true) return c.json({ error: "Nejdřív potvrď dokončení místních dat." }, 400);
  // Kontrola základních dat; obsah a kvalitu správce potvrzuje v administraci.
  const data = await c.env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM villages WHERE district = ?) AS villages,
    (SELECT COUNT(*) FROM district_surnames WHERE district = ?) AS surnames,
    (SELECT COUNT(*) FROM district_sponsors WHERE district = ?) AS sponsors`)
    .bind(request.district, request.district, request.district).first<{ villages: number; surnames: number; sponsors: number }>();
  if (!data?.villages || !data.surnames || !data.sponsors) return c.json({ error: "Okres ještě nemá obce, místní příjmení a sponzory. Nejprve doplň data." }, 409);
  const activationToken = newToken();
  const hash = await hashActivationToken(activationToken);
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE district_registrations SET status = 'ready', ready_at = COALESCE(ready_at, ?)
      WHERE district = ?`).bind(new Date().toISOString(), request.district),
    c.env.DB.prepare(`UPDATE league_requests SET status = 'invited', activation_hash = ?, activation_expires_at = ?
      WHERE id = ? AND status <> 'activated'`).bind(hash, expiresAt, request.id),
  ]);
  // Odkaz dostává jen přihlášený správce; veřejná odpověď žádosti není přihlášení.
  c.header("Cache-Control", "no-store");
  return c.json({ activationToken, email: request.email, expiresAt });
});

registrationRouter.post("/activation", async c => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token)) return c.json({ error: "Neplatný aktivační odkaz." }, 400);
  const hash = await hashActivationToken(body.token);
  const request = await c.env.DB.prepare(`SELECT r.id, r.name, r.email, r.district, d.founder_request_id = r.id AS is_founder
    FROM league_requests r JOIN district_registrations d ON d.district = r.district
    WHERE r.activation_hash = ? AND r.status = 'invited' AND r.activation_expires_at > ? AND d.status = 'ready'`)
    .bind(hash, new Date().toISOString()).first<{ id: string; name: string; email: string; district: string; is_founder: number }>();
  c.header("Cache-Control", "no-store");
  if (!request) return c.json({ error: "Odkaz vypršel nebo už byl použit. Přihlas se, nebo požádej na admin@prales.fun o nový." }, 410);
  return c.json({ name: request.name, email: request.email, district: request.district, isFounder: Boolean(request.is_founder) });
});

registrationRouter.post("/activate", async c => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token) || typeof body.password !== "string"
    || body.password.length < 8 || body.password.length > 128 || !/[a-z]/.test(body.password) || !/[A-Z]/.test(body.password) || !/[0-9]/.test(body.password)) {
    return c.json({ error: "Heslo musí mít 8–128 znaků, malé i velké písmeno a číslo. Použij platný aktivační odkaz." }, 400);
  }
  const hash = await hashActivationToken(body.token);
  const now = new Date().toISOString();
  const request = await c.env.DB.prepare(`SELECT r.* FROM league_requests r
    JOIN district_registrations d ON d.district = r.district AND d.status = 'ready'
    WHERE r.activation_hash = ? AND r.status = 'invited' AND r.activation_expires_at > ?`)
    .bind(hash, now).first<{ id: string; name: string; email: string; district: string }>();
  if (!request) return c.json({ error: "Odkaz vypršel nebo už byl použit. Požádej o nový aktivační odkaz." }, 410);
  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(body.password);
  // Podmíněný INSERT a spotřeba tokenu v jedné D1 transakci odolávají dvojímu odeslání.
  const result = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO users (id, email, display_name, password_hash, registration_district)
      SELECT ?, email, name, ?, district FROM league_requests
      WHERE id = ? AND status = 'invited' AND activation_hash = ? AND activation_expires_at > ?`)
      .bind(userId, passwordHash, request.id, hash, new Date().toISOString()),
    c.env.DB.prepare(`UPDATE league_requests SET status = 'activated', user_id = ?, activated_at = ?, activation_hash = NULL
      WHERE id = ? AND status = 'invited' AND EXISTS (SELECT 1 FROM users WHERE id = ?)`)
      .bind(userId, now, request.id, userId),
  ]);
  if (!result[0].meta.changes) return c.json({ error: "Odkaz už byl použit. Přihlas se ke svému účtu." }, 410);
  const token = await createSession(c.env.SESSION_KV, userId, request.email, null);
  c.header("Cache-Control", "no-store");
  return c.json({ token, user: { id: userId, email: request.email, teamId: null, teamName: null } }, 201);
});
