/**
 * Obal skutečného workeru pro lokální přehrávání sezóny (engine-lab/real-game).
 *
 * Proč obal a ne rovnou src/index.ts:
 *   1. Zablokuje VEŠKERÉ odchozí HTTP (Gemini, Workers AI přes fetch, Suno, web push…).
 *      Produktový kód dostane výjimku, jako by spadla síť, a pokus se zapíše do logu
 *      řádkem `HARNESS_BLOCKED_FETCH`, takže je v souhrnu vidět, že se o něco pokusil.
 *   2. Přidá pár servisních adres /__harness/* — mezi koly provede to, co by jinak udělal
 *      noční tick (regenerace kondice, hojení zranění, drift morálky, posun herního data),
 *      a hlásí stav kola, aby skript věděl, kdy fronta dodělala.
 *
 * `scheduled` a `queue` jdou BEZE ZMĚNY do produktového workeru — cron `0 16` tedy
 * rozešle zprávy do fronty a konzumer odehraje kolo přesně jako na produkci.
 *
 * Modul "prales-product-entry" je alias z vygenerované wrangler konfigurace a ukazuje
 * na <worktree>/apps/api/src/index.ts zvolené verze kódu (OLD / NEW).
 */

// @ts-ignore alias se řeší až v bundleru (wrangler [alias])
import product from "prales-product-entry";

type Env = {
  DB: D1Database;
  CACHE_KV: KVNamespace;
  [key: string]: unknown;
};

const blockedFetches: string[] = [];

globalThis.fetch = (async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  blockedFetches.push(url);
  console.error(JSON.stringify({ level: "error", mod: "harness", msg: `HARNESS_BLOCKED_FETCH ${url}` }));
  throw new Error(`harness: odchozí fetch zablokován (${url})`);
}) as typeof fetch;

/**
 * Výraz pro denní regeneraci kondice — 1:1 opsaný z season/daily-tick.ts
 * (recoveryNewCondSql). Když se v produktu změní, musí se změnit i tady.
 */
const RECOVERY_SQL = `MIN(100, json_extract(life_context, '$.condition') +
    (CASE
      WHEN COALESCE(json_extract(physical, '$.stamina'), json_extract(skills, '$.stamina'), 40) >= 75 THEN 20
      WHEN COALESCE(json_extract(physical, '$.stamina'), json_extract(skills, '$.stamina'), 40) >= 50 THEN 16
      WHEN COALESCE(json_extract(physical, '$.stamina'), json_extract(skills, '$.stamina'), 40) >= 25 THEN 13
      ELSE 10
    END)
    +
    (CASE
      WHEN age <= 21 THEN 3
      WHEN age <= 25 THEN 1
      WHEN age <= 30 THEN 0
      WHEN age <= 35 THEN -1
      ELSE -3
    END))`;

/** Jeden herní den mezi koly — výřez nočního ticku, který se týká dostupnosti hráčů. */
async function simulateRestDay(db: D1Database): Promise<{ healed: number; returned: number }> {
  // Jednodenní příznaky (omluvenka, kocovina) — daily-tick.ts je maže každé ráno.
  await db.prepare(
    "UPDATE players SET life_context = json_remove(life_context, '$.absence') WHERE json_extract(life_context, '$.absence') IS NOT NULL",
  ).run();
  await db.prepare(
    "UPDATE players SET life_context = json_remove(life_context, '$.hangover') WHERE json_extract(life_context, '$.hangover') IS NOT NULL",
  ).run();

  // Hojení zranění — stejné pořadí jako v daily-tick.ts.
  await db.prepare("UPDATE injuries SET days_remaining = days_remaining - 1 WHERE days_remaining > 0").run();
  const healed = await db.prepare(
    `SELECT i.player_id AS player_id, i.days_total AS days_total, i.is_fake AS is_fake, i.osobni_volno AS osobni_volno
       FROM injuries i WHERE i.days_remaining <= 0`,
  ).all<{ player_id: string; days_total: number | null; is_fake: number | null; osobni_volno: number | null }>();
  await db.prepare("DELETE FROM injuries WHERE days_remaining <= 0").run();

  // Regenerace kondice (stejný výraz jako produkce).
  await db.prepare(`UPDATE players SET life_context = json_set(life_context, '$.condition', ${RECOVERY_SQL})`).run();

  // Návrat po zranění: injuryReturnCondition() z injuries/injury-generator.ts.
  const returnStmts: D1PreparedStatement[] = [];
  for (const h of healed.results) {
    if (h.is_fake || h.osobni_volno) continue;
    const daysTotal = h.days_total ?? 0;
    const target = daysTotal < 7 ? 100 : Math.max(50, Math.min(90, 100 - daysTotal));
    if (target >= 100) continue;
    returnStmts.push(
      db.prepare(
        "UPDATE players SET life_context = json_set(life_context, '$.condition', ?1) WHERE id = ?2 AND json_extract(life_context, '$.condition') > ?1",
      ).bind(target, h.player_id),
    );
  }
  if (returnStmts.length > 0) await db.batch(returnStmts);

  // Drift morálky k 45–55 (základní varianta z daily-tick.ts, bez posunu pásma za gril).
  await db.prepare(
    `UPDATE players SET life_context = json_set(life_context, '$.morale',
      CASE
        WHEN json_extract(life_context, '$.morale') > 55 THEN json_extract(life_context, '$.morale') - 1
        WHEN json_extract(life_context, '$.morale') < 45 THEN json_extract(life_context, '$.morale') + 1
        ELSE json_extract(life_context, '$.morale')
      END)`,
  ).run();

  return { healed: healed.results.length, returned: returnStmts.length };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

async function handleHarness(request: Request, env: Env, path: string): Promise<Response> {
  const url = new URL(request.url);

  if (path === "/__harness/ping") {
    return json({ ok: true, blockedFetches: blockedFetches.length });
  }

  if (path === "/__harness/kv" && request.method === "POST") {
    const body = (await request.json()) as Record<string, string>;
    for (const [key, value] of Object.entries(body)) await env.CACHE_KV.put(key, value);
    const readBack: Record<string, string | null> = {};
    for (const key of Object.keys(body)) readBack[key] = await env.CACHE_KV.get(key);
    return json({ ok: true, kv: readBack });
  }

  if (path === "/__harness/advance" && request.method === "POST") {
    const body = (await request.json()) as { gameDate: string; restDays: number };
    let healed = 0;
    let returned = 0;
    for (let i = 0; i < body.restDays; i++) {
      const r = await simulateRestDay(env.DB);
      healed += r.healed;
      returned += r.returned;
    }
    const upd = await env.DB.prepare("UPDATE teams SET game_date = ? WHERE game_date IS NOT NULL").bind(body.gameDate).run();
    return json({ ok: true, healed, returned, teamsUpdated: upd.meta.changes });
  }

  if (path === "/__harness/status") {
    const day = url.searchParams.get("day") ?? "";
    const rounds = await env.DB.prepare(
      `SELECT sc.id AS id, sc.league_id AS league_id, sc.game_week AS game_week, sc.status AS status
         FROM season_calendar sc
        WHERE substr(sc.scheduled_at, 1, 10) = ?
          AND sc.season_number = (SELECT MAX(s2.season_number) FROM season_calendar s2 WHERE s2.league_id = sc.league_id)`,
    ).bind(day).all();
    const locked = await env.DB.prepare("SELECT COUNT(*) AS n FROM season_calendar WHERE status = 'lineup_locked'").first<{ n: number }>();
    const runs = await env.DB.prepare("SELECT COUNT(*) AS n FROM queue_runs").first<{ n: number }>();
    return json({ rounds: rounds.results, locked: locked?.n ?? 0, queueRuns: runs?.n ?? 0, blockedFetches: blockedFetches.length });
  }

  // Po restartu zaseknuté fronty: zámek kola se zestárne, aby ho recovery (cron 20 16,
  // recoverStuckRounds bere jen zámky starší 15 minut) smělo dohrát.
  if (path === "/__harness/age-locks" && request.method === "POST") {
    const res = await env.DB.prepare(
      "UPDATE season_calendar SET locked_at = '2000-01-01T00:00:00.000Z' WHERE status = 'lineup_locked'",
    ).run();
    return json({ ok: true, aged: res.meta.changes });
  }

  if (path === "/__harness/queue-runs") {
    const since = Number(url.searchParams.get("offset") ?? "0");
    const rows = await env.DB.prepare(
      "SELECT kind, league_id, status, matches, queries, duration_ms, attempts, lag_ms, created_at FROM queue_runs ORDER BY rowid LIMIT -1 OFFSET ?",
    ).bind(since).all();
    return json({ runs: rows.results });
  }

  return json({ error: `neznámá servisní adresa ${path}` }, 404);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/__harness/")) {
      try {
        return await handleHarness(request, env, path);
      } catch (e) {
        console.error(JSON.stringify({ level: "error", mod: "harness", msg: `servisní adresa ${path} selhala`, err: String(e) }));
        return json({ error: String(e) }, 500);
      }
    }
    return product.fetch(request, env, ctx);
  },
  scheduled: product.scheduled,
  queue: product.queue,
};
