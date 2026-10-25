/**
 * Transfer pressure tick — vlastní denní cron pro FM-style tlak na hvězdy.
 *
 * Tři kroky:
 *  1. Propadnutí nabídek, na které strana na tahu do lhůty neodpověděla
 *     (offer-expiry.ts); mlčení prodávajícího má dopad jako odmítnutí.
 *  2. Generování CPU nabídek od virtuálních klubů (přesunuto z match ticku)
 *     a poptávek klubů mimo hru (demands.ts).
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
  remindedOffers: number;
  aiOffers: number;
  clubDemands: number;
  unrestProcessed: number;
}

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
      logger.warn({ module: "transfer-pressure" }, `SKIP, tick for ${todayKey} already ran`);
      return { skipped: true, expiredOffers: 0, remindedOffers: 0, aiOffers: 0, clubDemands: 0, unrestProcessed: 0 };
    }
    await env.CACHE_KV.put(`transfer-pressure:${todayKey}`, "1", { expirationTtl: 60 * 60 * 36 })
      .catch((e) => logger.warn({ module: "transfer-pressure" }, "set KV flag", e));
  }

  const result: TransferPressureResult = { skipped: false, expiredOffers: 0, remindedOffers: 0, aiOffers: 0, clubDemands: 0, unrestProcessed: 0 };

  // ── 1. Propadnutí nabídek bez odpovědi (mlčení prodávajícího = odmítnutí) ──
  try {
    const { expireIdleOffers, remindIdleOffers } = await import("./offer-expiry");
    result.expiredOffers = await expireIdleOffers(env, now);
    // Kdo je na tahu a lhůta mu brzy skončí, dostane připomínku.
    result.remindedOffers = await remindIdleOffers(env, now);
  } catch (e) {
    logger.error({ module: "transfer-pressure" }, "offer expiry failed", e);
  }

  // ── 2. CPU nabídky od virtuálních klubů (na hráče lidských i AI klubů) ──
  try {
    const { generateAiOffers } = await import("./virtual-teams");
    const rng = createRng(cryptoSeed());
    const leagues = await env.DB.prepare(
      "SELECT l.id, l.district FROM leagues l JOIN teams t ON t.league_id = l.id GROUP BY l.id"
    ).all().catch((e) => { logger.warn({ module: "transfer-pressure" }, "fetch leagues", e); return { results: [] }; });
    for (const lg of leagues.results) {
      const offers = await generateAiOffers(env.DB, lg.district as string, lg.id as string, rng);
      result.aiOffers += offers;
    }
  } catch (e) {
    logger.error({ module: "transfer-pressure" }, "AI offers failed", e);
  }

  // ── 2b. Poptávky klubů mimo hru (jednou za okres, U21 soutěže pod okresem áčka) ──
  // Okresy se seniorskými kluby ve hře, lidskými i AI: AI kluby k poptávkám nabízejí hráče taky.
  try {
    const { generateClubDemands } = await import("./demands");
    const rng = createRng(cryptoSeed());
    const districts = await env.DB.prepare(
      "SELECT DISTINCT l.district FROM leagues l JOIN teams t ON t.league_id = l.id WHERE t.user_id IS NOT NULL AND t.parent_team_id IS NULL",
    ).all<{ district: string }>();
    for (const d of districts.results) {
      if (d.district) result.clubDemands += await generateClubDemands(env.DB, d.district, rng);
    }
  } catch (e) {
    logger.error({ module: "transfer-pressure" }, "club demands failed", e);
  }

  // ── 3. Truc (transferUnrest) — decay, fake injuries, fyzio hint, pledge checks ──
  try {
    const { processTransferUnrest } = await import("./offer-rejection-impact");
    result.unrestProcessed = await processTransferUnrest(env.DB);
    // Sliby hráčů, kteří z klubu odešli: prodej splněn, sestava vypršela.
    const { settleDepartedPromises } = await import("./promises");
    await settleDepartedPromises(env.DB);
  } catch (e) {
    logger.error({ module: "transfer-pressure" }, "unrest processing failed", e);
  }

  logger.info({ module: "transfer-pressure" },
    `DONE expired=${result.expiredOffers} reminded=${result.remindedOffers} aiOffers=${result.aiOffers} clubDemands=${result.clubDemands} unrest=${result.unrestProcessed}`);
  return result;
}
