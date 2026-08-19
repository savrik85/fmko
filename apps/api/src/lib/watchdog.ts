/**
 * Hlídač zpracování.
 *
 * Cloudflare umí poslat upozornění, když Worker vyhodí chybu. Neumí ale
 * upozornit na TICHO — a „zápasový tick vůbec neproběhl" nebo „nedohraná kola
 * se hromadí" žádnou výjimku nevyhodí. Přesně tyhle případy jsou přitom
 * nejzákeřnější: hra se tváří, že běží, jen se v ní nic neděje.
 *
 * Hlídač proto sám kontroluje, co se DĚLO, ne co spadlo. Když najde problém:
 *   1. zaloguje ho jako `console.error` s výrazným prefixem — tím ho zachytí
 *      Workers Logs i případné upozornění Cloudflare na chyby
 *   2. pošle notifikaci adminům (mají push subscriptions jako každý manažer)
 */

import type { Bindings } from "../index";
import { logger } from "./logger";

/** Prefix, na který se dá navěsit upozornění v Cloudflare. */
export const WATCHDOG_MARKER = "PRALES_WATCHDOG_ALERT";

export interface WatchdogProblem {
  kod: string;
  popis: string;
  hodnota: number | string;
}

export interface WatchdogResult {
  ok: boolean;
  problemy: WatchdogProblem[];
}

async function scalar(db: D1Database, sql: string, popis: string): Promise<number | null> {
  const row = await db.prepare(sql).first<{ n: number }>().catch((e) => {
    logger.warn({ module: "watchdog" }, `dotaz "${popis}" selhal`, e);
    return null;
  });
  return row?.n ?? null;
}

/**
 * Projde kontroly a vrátí nalezené problémy. Nic nemění — jen čte a hlásí.
 */
export async function runWatchdog(env: Bindings): Promise<WatchdogResult> {
  const problemy: WatchdogProblem[] = [];

  // ── 1. TICHO: kdy naposledy proběhlo kolo? ──
  // Nejdůležitější kontrola. Cloudflare tenhle stav nikdy nenahlásí, protože
  // se nic nepokazilo — prostě se nic nestalo.
  const hodinOdKola = await scalar(
    env.DB,
    `SELECT CAST((julianday('now') - julianday(MAX(created_at))) * 24 AS INTEGER) AS n
       FROM queue_runs WHERE kind = 'league_round' AND status = 'done'`,
    "hodin od posledního kola",
  );
  if (hodinOdKola !== null && hodinOdKola > 26) {
    problemy.push({
      kod: "zadne_kolo",
      popis: "Poslední odsimulované kolo je starší než 26 hodin — tick zřejmě neběží",
      hodnota: `${hodinOdKola} h`,
    });
  }

  // ── 2. Zaseklá kola ──
  // Simulace spadla v půlce a kolo zůstalo v 'lineup_locked'. recoverStuckRounds
  // to sice příště dohraje, ale opakovaný výskyt znamená, že něco padá pravidelně.
  const zaseklá = await scalar(
    env.DB,
    "SELECT COUNT(*) AS n FROM season_calendar WHERE status = 'lineup_locked'",
    "zaseklá kola",
  );
  if (zaseklá && zaseklá > 0) {
    problemy.push({ kod: "zaseklá_kola", popis: "Kola uvízlá v 'lineup_locked'", hodnota: zaseklá });
  }

  // ── 3. Dead-letter fronta ──
  const dlq = await scalar(
    env.DB,
    "SELECT COUNT(*) AS n FROM queue_failures WHERE resolved = 0",
    "dead-letter fronta",
  );
  if (dlq && dlq > 0) {
    problemy.push({ kod: "dlq", popis: "Zprávy, které selhaly i po opakování", hodnota: dlq });
  }

  // ── 4. Rostoucí backlog ──
  // Ligy bez ligy v `leagues` se nepočítají — producent je stejně nikdy nezařadí.
  const backlog = await scalar(
    env.DB,
    `SELECT COUNT(*) AS n FROM season_calendar sc
       JOIN leagues l ON l.id = sc.league_id
      WHERE sc.status = 'scheduled'
        AND sc.season_number = (SELECT MAX(season_number) FROM season_calendar x WHERE x.league_id = sc.league_id)
        AND sc.scheduled_at <= (SELECT MAX(game_date) FROM teams t WHERE t.league_id = sc.league_id)`,
    "nedohraná splatná kola",
  );
  if (backlog !== null && backlog > 15) {
    problemy.push({
      kod: "backlog",
      popis: "Nedohraných splatných kol je moc — tick nestíhá tempo herního času",
      hodnota: backlog,
    });
  }

  // ── 5. Opakované pokusy ──
  const retry = await scalar(
    env.DB,
    "SELECT COUNT(*) AS n FROM queue_runs WHERE attempts > 1 AND created_at > datetime('now', '-1 day')",
    "retry za 24 h",
  );
  if (retry && retry > 0) {
    problemy.push({ kod: "retry", popis: "Zprávy se musely doručovat opakovaně", hodnota: retry });
  }

  return { ok: problemy.length === 0, problemy };
}

/**
 * Spustí kontrolu a když najde problém, zaloguje ho a pošle adminům notifikaci.
 * Nikdy nevyhodí — hlídač nesmí shodit tick, který hlídá.
 */
export async function runWatchdogAndAlert(env: Bindings): Promise<WatchdogResult> {
  const vysledek = await runWatchdog(env).catch((e) => {
    logger.error({ module: "watchdog" }, "hlídač sám selhal", e);
    return { ok: true, problemy: [] as WatchdogProblem[] };
  });

  if (vysledek.ok) {
    logger.info({ module: "watchdog" }, "kontrola v pořádku");
    return vysledek;
  }

  const souhrn = vysledek.problemy.map((p) => `${p.kod}=${p.hodnota}`).join(", ");
  // Výrazný prefix, ať se na něj dá navěsit upozornění v Cloudflare.
  console.error(`${WATCHDOG_MARKER}: ${souhrn}`);
  for (const p of vysledek.problemy) {
    logger.error({ module: "watchdog" }, `${p.popis}: ${p.hodnota}`);
  }

  // Notifikace adminům — mají tým jako každý jiný manažer, takže i push.
  try {
    const admini = await env.DB.prepare(
      "SELECT t.id AS team_id FROM teams t JOIN users u ON u.id = t.user_id WHERE u.is_admin = 1 AND t.user_id != 'ai'",
    ).all<{ team_id: string }>();

    if (admini.results.length === 0) {
      logger.warn({ module: "watchdog" }, "žádný admin s týmem — notifikace nemá kam jít");
      return vysledek;
    }

    const { createNotification } = await import("../community/notifications");
    const pushEnv = {
      VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY,
      VAPID_SUBJECT: env.VAPID_SUBJECT,
      DB: env.DB,
    };
    for (const a of admini.results) {
      await createNotification(
        env.DB,
        a.team_id,
        "event",
        "⚠️ Zpracování hry hlásí problém",
        vysledek.problemy.map((p) => `${p.popis} (${p.hodnota})`).join(" · "),
        "/dashboard",
        pushEnv,
      ).catch((e) => logger.warn({ module: "watchdog" }, "notifikace adminovi selhala", e));
    }
  } catch (e) {
    logger.error({ module: "watchdog" }, "rozeslání notifikací selhalo", e);
  }

  return vysledek;
}
