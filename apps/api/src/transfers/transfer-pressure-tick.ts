/**
 * Transfer pressure tick — vlastní denní cron pro FM-style tlak na hvězdy.
 *
 * Tři kroky:
 *  1. Expirace přestupových nabídek (přesunuto z daily-ticku) — s hookem na
 *     dopad na morálku hráče, který o přestup stál (applyOfferRejectionImpact).
 *  2. Generování CPU nabídek od virtuálních klubů (přesunuto z match ticku).
 *  3. Zpracování trucu (transferUnrest) — decay, fake injuries, pledge checks.
 *
 * Kroky 1 a 3 jsou zapojované postupně (fáze 4 plánu) — struktura tu je od začátku.
 */

import type { Bindings } from "../index";
import { createRng, cryptoSeed } from "../generators/rng";
import { logger } from "../lib/logger";

export interface TransferPressureResult {
  skipped: boolean;
  expiredOffers: number;
  aiOffers: number;
  unrestProcessed: number;
}

/** Max nabídek, na které se za jeden tick aplikuje dopad expirace (D1 limity). */
const EXPIRY_IMPACT_LIMIT = 20;

export async function executeTransferPressureTick(
  env: Bindings,
  opts: { force?: boolean } = {},
): Promise<TransferPressureResult> {
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);

  // Idempotence — stejný vzor jako daily-tick (KV flag s TTL 36 h).
  if (!opts.force) {
    const alreadyRan = await env.CACHE_KV.get(`transfer-pressure:${todayKey}`)
      .catch((e) => { logger.warn({ module: "transfer-pressure" }, "read KV flag", e); return null; });
    if (alreadyRan) {
      logger.warn({ module: "transfer-pressure" }, `SKIP — tick for ${todayKey} already ran`);
      return { skipped: true, expiredOffers: 0, aiOffers: 0, unrestProcessed: 0 };
    }
    await env.CACHE_KV.put(`transfer-pressure:${todayKey}`, "1", { expirationTtl: 60 * 60 * 36 })
      .catch((e) => logger.warn({ module: "transfer-pressure" }, "set KV flag", e));
  }

  const result: TransferPressureResult = { skipped: false, expiredOffers: 0, aiOffers: 0, unrestProcessed: 0 };

  // ── 1. Expirace nabídek s dopadem ──
  try {
    const nowIso = now.toISOString();
    const expiring = await env.DB.prepare(
      `SELECT * FROM transfer_offers WHERE status = 'pending' AND expires_at < ? LIMIT ?`
    ).bind(nowIso, EXPIRY_IMPACT_LIMIT).all<Record<string, unknown>>()
      .catch((e) => { logger.warn({ module: "transfer-pressure" }, "fetch expiring offers", e); return { results: [] as Record<string, unknown>[] }; });

    // Dopad na hráče, který o přestup stál (zapojeno ve fázi 4 — placeholder, ať se
    // expirace chová stejně jako dřív, jen na novém místě).
    // for (const offer of expiring.results) await applyOfferRejectionImpact(env, offer, "expire");

    await env.DB.prepare("UPDATE transfer_offers SET status = 'expired', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE status = 'pending' AND expires_at < ?")
      .bind(nowIso).run();
    result.expiredOffers = expiring.results.length;
  } catch (e) {
    logger.error({ module: "transfer-pressure" }, "offer expiry failed", e);
  }

  // ── 2. CPU nabídky od virtuálních klubů ──
  try {
    const { generateAiOffers } = await import("./virtual-teams");
    const rng = createRng(cryptoSeed());
    const leagues = await env.DB.prepare(
      "SELECT l.id, l.district FROM leagues l JOIN teams t ON t.league_id = l.id WHERE t.user_id != 'ai' GROUP BY l.id"
    ).all().catch((e) => { logger.warn({ module: "transfer-pressure" }, "fetch leagues", e); return { results: [] }; });
    for (const lg of leagues.results) {
      const offers = await generateAiOffers(env.DB, lg.district as string, lg.id as string, rng);
      result.aiOffers += offers;
    }
  } catch (e) {
    logger.error({ module: "transfer-pressure" }, "AI offers failed", e);
  }

  // ── 3. Truc (transferUnrest) — decay, fake injuries, pledge checks (fáze 4) ──
  // result.unrestProcessed = await processTransferUnrest(env);

  logger.info({ module: "transfer-pressure" },
    `DONE expired=${result.expiredOffers} aiOffers=${result.aiOffers} unrest=${result.unrestProcessed}`);
  return result;
}
