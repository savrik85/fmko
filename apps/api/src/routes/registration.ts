import { Hono } from "hono";
import { REGISTRATION_DISTRICTS } from "@okresni-masina/shared";
import type { Bindings } from "../index";
import { requireAdmin, requireAuth } from "../auth/middleware";
import { createSession, type Session } from "../auth/session";
import { hashPassword } from "../auth/password";
import { districtAccess } from "../registration/district-access";
import {
  DISTRICT_FULL_CODE, createCapacityLookup, districtFullMessage, listOpenDistricts,
} from "../registration/district-capacity";
import { logger } from "../lib/logger";

/**
 * Neplatné tělo požadavku. Hláška chyby z JSON.parse obsahuje kus vstupu a tady
 * jde o hesla a aktivační tokeny, proto se loguje jen druh chyby.
 */
function logBodyError(e: unknown): void {
  logger.warn({ module: "registration" }, `neplatné tělo požadavku (${e instanceof Error ? e.name : typeof e})`);
}

export const registrationRouter = new Hono<{ Bindings: Bindings }>();

export async function hashActivationToken(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}

function newToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
}

/** Nejvýš 5 registrací za hodinu z jedné IP adresy (otisk, ne samotná adresa). */
async function rateLimited(kv: KVNamespace, ip: string | undefined): Promise<boolean> {
  if (!ip) return false;
  const key = `registration-rate:${await hashActivationToken(ip)}:${Math.floor(Date.now() / 3600000)}`;
  const count = Number(await kv.get(key) ?? 0);
  if (count >= 5) return true;
  await kv.put(key, String(count + 1), { expirationTtl: 3600 });
  return false;
}

function validPassword(password: unknown): password is string {
  return typeof password === "string" && password.length >= 8 && password.length <= 128
    && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password);
}

registrationRouter.get("/districts", async c => {
  // founderFree: připravený okres bez zakladatele a bez lidských klubů, první hráč v něm povede ligu.
  const { results } = await c.env.DB.prepare(`SELECT d.district, d.status,
      d.founder_request_id IS NULL AND d.founder_team_id IS NULL AND NOT EXISTS (
        SELECT 1 FROM teams t JOIN villages v ON v.id = t.village_id
        WHERE v.district = d.district AND t.user_id <> 'ai' AND COALESCE(t.team_type, 'senior') <> 'u21'
      ) AS founder_free
    FROM district_registrations d`).all<{ district: string; status: string; founder_free: number }>();
  const rows = new Map(results.map(row => [row.district, row]));
  // Plný nebo ručně zavřený okres v seznamu zůstává, jen nové kluby nepřijímá.
  const capacityOf = createCapacityLookup(c.env.DB);
  const managers = await c.env.DB.prepare(`SELECT v.district, COUNT(DISTINCT t.user_id) AS managers
      FROM teams t JOIN villages v ON v.id = t.village_id
      WHERE t.user_id <> 'ai' AND COALESCE(t.team_type, 'senior') <> 'u21' GROUP BY v.district`)
    .all<{ district: string; managers: number }>()
    .catch((e) => { logger.warn({ module: "registration" }, "počty manažerů v okresech", e); return { results: [] as Array<{ district: string; managers: number }> }; });
  const managersOf = new Map(managers.results.map(row => [row.district, row.managers]));
  const list = [];
  for (const name of REGISTRATION_DISTRICTS) {
    const row = rows.get(name);
    const capacity = row?.status === "ready" ? await capacityOf(name) : null;
    list.push({
      name, status: row?.status ?? "available",
      founderFree: row?.status === "ready" && !capacity?.full && Boolean(row.founder_free),
      full: Boolean(capacity?.full), freeSlots: capacity ? capacity.freeSlots : null,
      managers: managersOf.get(name) ?? 0,
    });
  }
  return c.json(list);
});

registrationRouter.post("/requests", async c => {
  const body = await c.req.json().catch((e) => { logBodyError(e); return null; });
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
  if (await rateLimited(c.env.CACHE_KV, c.req.header("CF-Connecting-IP"))) {
    return c.json({ error: "Příliš mnoho žádostí. Zkus to prosím za hodinu." }, 429);
  }
  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").bind(email).first();
  if (existing) return c.json({ error: "Pro tento e-mail už účet existuje. Přihlas se ke svému účtu." }, 409);
  // Žádost do plného okresu je zápis na čekací listinu: žádná příprava dat ani aktivační odkaz.
  const waitlist = (await createCapacityLookup(c.env.DB)(district)).full;
  const id = crypto.randomUUID();
  // Jediná dávka: duplicita nikdy nepřepíše kontakt ani rezervaci zakladatele.
  const result = await c.env.DB.batch([
    c.env.DB.prepare("INSERT OR IGNORE INTO league_requests (id, name, email, district) VALUES (?, ?, ?, ?)").bind(id, name, email, district),
    c.env.DB.prepare(`INSERT OR IGNORE INTO district_registrations (district, founder_request_id)
      SELECT district, id FROM league_requests WHERE id = ?`).bind(id),
  ]);
  if (!result[0].meta.changes) {
    return c.json({ error: waitlist
      ? "Tenhle e-mail už na čekací listině nebo mezi žádostmi máme. Ozveme se, až se místo uvolní."
      : "Žádost pro tento e-mail už máme. Vyčkej na aktivační odkaz; pokud nedorazí do 24 hodin, napiš na admin@prales.fun." }, 409);
  }
  return c.json({ accepted: true, waitlist }, 201);
});

/**
 * Okamžitá registrace do PŘIPRAVENÉHO okresu: účet vznikne hned, bez ruční aktivace.
 * První hráč prázdného okresu (bez lidských týmů a bez zakladatele) se stává zakladatelem
 * a po založení klubu dostane první předsednický mandát. Nepřipravený okres jde dál přes /requests.
 */
registrationRouter.post("/join", async c => {
  const body = await c.req.json().catch((e) => { logBodyError(e); return null; });
  if (!body || typeof body.name !== "string" || typeof body.email !== "string" || typeof body.district !== "string") {
    return c.json({ error: "Vyplň jméno, e-mail, heslo a okres." }, 400);
  }
  const name = body.name.trim();
  const email = body.email.trim().toLowerCase();
  const district = body.district;
  if (name.length < 2 || name.length > 80 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !(REGISTRATION_DISTRICTS as readonly string[]).includes(district)) {
    return c.json({ error: "Zkontroluj jméno (2–80 znaků), platný e-mail a výběr okresu." }, 400);
  }
  if (!validPassword(body.password)) return c.json({ error: "Heslo musí mít 8–128 znaků, malé i velké písmeno a číslo." }, 400);
  if (await rateLimited(c.env.CACHE_KV, c.req.header("CF-Connecting-IP"))) {
    return c.json({ error: "Příliš mnoho žádostí. Zkus to prosím za hodinu." }, 429);
  }
  const ready = await c.env.DB.prepare("SELECT 1 FROM district_registrations WHERE district = ? AND status = 'ready'").bind(district).first();
  if (!ready) return c.json({ error: "district_not_ready", message: "Tenhle okres ještě připravujeme. Pošli žádost a ozveme se." }, 409);
  // Plný nebo ručně zavřený okres odmítnout dřív, než vznikne účet, který by klub nezaložil.
  const capacityOf = createCapacityLookup(c.env.DB);
  if ((await capacityOf(district)).full) {
    const openDistricts = await listOpenDistricts(c.env.DB, capacityOf)
      .catch((e) => { logger.warn({ module: "registration" }, "nabídka otevřených okresů", e); return []; });
    return c.json({ error: DISTRICT_FULL_CODE, message: districtFullMessage(district), openDistricts }, 409);
  }
  if (await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ? COLLATE NOCASE").bind(email).first()) {
    return c.json({ error: "Pro tento e-mail už účet existuje. Přihlas se ke svému účtu." }, 409);
  }
  // Dřívější nevyřízená žádost se stejným e-mailem se použije (může nést rezervaci zakladatele).
  const previous = await c.env.DB.prepare("SELECT id, district, status FROM league_requests WHERE email = ?")
    .bind(email).first<{ id: string; district: string; status: string }>();
  // Kdo čeká na místo v plném okrese, smí si mezitím vybrat jiný otevřený.
  const previousOnWaitlist = previous && previous.district !== district && previous.status !== "activated"
    && (await capacityOf(previous.district)).full;
  if (previous && previous.district !== district && !previousOnWaitlist) {
    return c.json({ error: `Tvoje žádost je vedená pro okres ${previous.district}. Vyber ho, nebo napiš na admin@prales.fun.` }, 409);
  }
  if (previous?.status === "activated") return c.json({ error: "Účet je už aktivovaný. Přihlas se." }, 409);
  const requestId = previous?.id ?? crypto.randomUUID();
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(body.password);
  const result = await c.env.DB.batch([
    c.env.DB.prepare("INSERT OR IGNORE INTO league_requests (id, name, email, district) VALUES (?, ?, ?, ?)").bind(requestId, name, email, district),
    c.env.DB.prepare(`INSERT INTO users (id, email, display_name, password_hash, registration_district)
      SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = ? COLLATE NOCASE)`)
      .bind(userId, email, name, passwordHash, district, email),
    c.env.DB.prepare(`UPDATE league_requests SET name = ?, district = ?, status = 'activated', user_id = ?, activated_at = ?, activation_hash = NULL
      WHERE id = ? AND status <> 'activated' AND EXISTS (SELECT 1 FROM users WHERE id = ?)`)
      .bind(name, district, userId, now, requestId, userId),
    // Zakladatel jen v úplně prázdném okrese; rozehrané okresy a jejich předsedy nepřepisujeme.
    c.env.DB.prepare(`UPDATE district_registrations SET founder_request_id = ?
      WHERE district = ? AND founder_request_id IS NULL AND founder_team_id IS NULL
        AND EXISTS (SELECT 1 FROM users WHERE id = ?)
        AND NOT EXISTS (SELECT 1 FROM teams t JOIN villages v ON v.id = t.village_id
          WHERE v.district = ? AND t.user_id <> 'ai' AND COALESCE(t.team_type, 'senior') <> 'u21')`)
      .bind(requestId, district, userId, district),
  ]);
  if (!result[1].meta.changes) return c.json({ error: "Pro tento e-mail už účet existuje. Přihlas se ke svému účtu." }, 409);
  const token = await createSession(c.env.SESSION_KV, userId, email, null);
  c.header("Cache-Control", "no-store");
  return c.json({ token, user: { id: userId, email, teamId: null, teamName: null } }, 201);
});

registrationRouter.get("/access", requireAuth, async c => {
  const session = c.get("session" as never) as Session;
  const user = await c.env.DB.prepare("SELECT display_name, registration_district FROM users WHERE id = ?")
    .bind(session.userId).first<{ display_name: string | null; registration_district: string | null }>();
  const { results } = await c.env.DB.prepare("SELECT district FROM district_registrations WHERE status = 'ready'").all<{ district: string }>();
  const capacityOf = createCapacityLookup(c.env.DB);
  const districts: string[] = [];
  for (const row of results) {
    if (!await districtAccess(c.env.DB, row.district, session.userId, capacityOf)) districts.push(row.district);
  }
  const home = user?.registration_district ?? null;
  // Účet zamčený na plný okres: web mu řekne proč a nabídne ostatní otevřené okresy,
  // nejživější první, ať nováček vidí ligu s lidmi.
  const homeFull = home ? (await capacityOf(home)).full : false;
  if (homeFull) {
    const open = await listOpenDistricts(c.env.DB, capacityOf)
      .catch((e) => { logger.warn({ module: "registration" }, "pořadí otevřených okresů", e); return []; });
    const order = new Map(open.map((d, i) => [d.name, i]));
    districts.sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
  }
  return c.json({ district: home, name: user?.display_name ?? "", districts, homeFull });
});

registrationRouter.use("/admin/*", requireAdmin);
registrationRouter.get("/admin/requests", async c => {
  const { results } = await c.env.DB.prepare(`SELECT r.id, r.name, r.email, r.district, r.status, r.created_at,
    r.activation_expires_at, d.status AS district_status, d.founder_request_id = r.id AS is_founder
    FROM league_requests r JOIN district_registrations d ON d.district = r.district
    ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'invited' THEN 1 ELSE 2 END, r.created_at LIMIT 200`).all();
  return c.json(results);
});

/**
 * Ruční zavření okresu pro nové registrace (a zpět). Parametry `district` a `closed` (0/1)
 * v těle nebo v adrese. Okres zůstává na úvodní stránce i ve statistikách, jen nepřijímá
 * nové kluby. Vrací stav před a po.
 */
registrationRouter.post("/admin/districts/close", async c => {
  const body = await c.req.json().catch((e) => { logBodyError(e); return null; }) as { district?: unknown; closed?: unknown } | null;
  const district = typeof body?.district === "string" ? body.district : c.req.query("district");
  const closedRaw = body?.closed ?? c.req.query("closed");
  const closed = closedRaw === 1 || closedRaw === "1" || closedRaw === true ? 1
    : closedRaw === 0 || closedRaw === "0" || closedRaw === false ? 0 : null;
  if (!district || closed === null) return c.json({ error: "Zadej district a closed (0 nebo 1)." }, 400);
  const before = await c.env.DB.prepare("SELECT district, status, registration_closed FROM district_registrations WHERE district = ?")
    .bind(district).first<{ district: string; status: string; registration_closed: number }>();
  if (!before) return c.json({ error: "Okres v registracích není." }, 404);
  await c.env.DB.prepare("UPDATE district_registrations SET registration_closed = ? WHERE district = ?").bind(closed, district).run();
  // Úvodní stránka drží data v KV; bez smazání by zavřený okres dál zval k registraci.
  const { LANDING_CACHE_KEY } = await import("./public-landing");
  await c.env.CACHE_KV.delete(LANDING_CACHE_KEY)
    .catch((e) => logger.warn({ module: "registration" }, "smazání cache úvodní stránky", e));
  const capacity = await createCapacityLookup(c.env.DB)(district);
  return c.json({
    district,
    before: { status: before.status, registrationClosed: Boolean(before.registration_closed) },
    after: { status: before.status, registrationClosed: Boolean(closed), full: capacity.full, freeSlots: capacity.freeSlots },
  });
});

registrationRouter.post("/admin/requests/:id/approve", async c => {
  const request = await c.env.DB.prepare("SELECT id, email, district, status FROM league_requests WHERE id = ?")
    .bind(c.req.param("id")).first<{ id: string; email: string; district: string; status: string }>();
  if (!request) return c.json({ error: "Žádost nebyla nalezena." }, 404);
  if (request.status === "activated") return c.json({ error: "Účet je už aktivovaný." }, 409);
  const body = await c.req.json().catch((e) => { logBodyError(e); return null; });
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
  const body = await c.req.json().catch((e) => { logBodyError(e); return null; });
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
  const body = await c.req.json().catch((e) => { logBodyError(e); return null; });
  if (!body || typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token) || !validPassword(body.password)) {
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
