/**
 * Propadnutí přestupových nabídek, na které strana na tahu do lhůty neodpověděla
 * (lhůta viz offer-deadline.ts). Mlčení prodávajícího se počítá jako odmítnutí:
 * hráč, který o přestup stál, se naštve stejně, jako kdyby ho trenér odmítl.
 * Dřív šla nespokojenost obejít tím, že prodávající na nabídku prostě neodpověděl.
 */

import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { sendSystemSMS } from "../messaging/system-sms";
import { applyOfferRejectionImpact } from "./offer-rejection-impact";
import { resolveOfferClubScope } from "./offer-club-scope";

/** Kolik nabídek se zpracuje za jeden tick (D1 limity), zbytek přijde na řadu příště. */
const EXPIRY_BATCH_LIMIT = 20;
const SMS_ROLE = "Sportovní ředitel";

type OfferRow = Record<string, unknown> & {
  id: string; player_id: string; from_team_id: string; to_team_id: string;
  status: string; last_action_by: string | null; offer_type: string | null; virtual_team_data: string | null;
};

export async function expireIdleOffers(env: Bindings, now: Date = new Date()): Promise<number> {
  const db = env.DB;
  const due = await db.prepare(
    `SELECT * FROM transfer_offers
      WHERE status IN ('pending', 'countered') AND expires_at < ?
      ORDER BY expires_at ASC LIMIT ?`,
  ).bind(now.toISOString(), EXPIRY_BATCH_LIMIT).all<OfferRow>()
    .catch((e) => { logger.warn({ module: "offer-expiry" }, "fetch idle offers", e); return { results: [] as OfferRow[] }; });

  let expired = 0;
  for (const offer of due.results) {
    // Na tahu je ten, kdo neodpověděl. Pohled prodávajícího stačí: buď je na tahu on, nebo kupec.
    const scope = await resolveOfferClubScope(db, offer.to_team_id, offer)
      .catch((e) => { logger.warn({ module: "offer-expiry" }, `scope ${offer.id}`, e); return null; });
    const sellerSilent = scope?.role === "seller" && scope.onTurn;

    // Jen když se nabídka mezitím nepohnula — kdo odpověděl na poslední chvíli, má přednost.
    const closed = await db.prepare(
      `UPDATE transfer_offers SET status = 'expired', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ? AND status = ? AND last_action_by IS ?`,
    ).bind(offer.id, offer.status, offer.last_action_by).run()
      .catch((e) => { logger.warn({ module: "offer-expiry" }, `expire ${offer.id}`, e); return null; });
    if ((closed?.meta.changes ?? 0) === 0) continue;
    expired++;

    if (sellerSilent) {
      await applyOfferRejectionImpact(db, offer, "expire", env)
        .catch((e) => logger.warn({ module: "offer-expiry" }, `impact ${offer.id}`, e));
    }
    await notifyExpiry(db, offer, scope?.buyerClubTeamId ?? offer.from_team_id, scope?.sellerClubTeamId ?? offer.to_team_id, sellerSilent)
      .catch((e) => logger.warn({ module: "offer-expiry" }, `notify ${offer.id}`, e));
  }
  return expired;
}

async function notifyExpiry(
  db: D1Database, offer: OfferRow, buyerClubTeamId: string, sellerClubTeamId: string, sellerSilent: boolean,
): Promise<void> {
  const player = await db.prepare("SELECT first_name, last_name FROM players WHERE id = ?")
    .bind(offer.player_id).first<{ first_name: string; last_name: string }>()
    .catch((e) => { logger.warn({ module: "offer-expiry" }, "load player", e); return null; });
  const playerName = player ? `${player.first_name} ${player.last_name}` : "hráče";
  const deal = offer.offer_type === "loan" ? "hostování" : "přestup";

  const isVirtualBuyer = buyerClubTeamId === "virtual_ai";
  const buyerName = isVirtualBuyer
    ? (() => {
      try { return (JSON.parse(offer.virtual_team_data ?? "{}") as { name?: string }).name ?? "Klub"; }
      catch (e) { logger.warn({ module: "offer-expiry" }, "parse virtual_team_data", e); return "Klub"; }
    })()
    : (await teamName(db, buyerClubTeamId)) ?? "Klub";
  const sellerName = (await teamName(db, sellerClubTeamId)) ?? "Klub";

  if (sellerSilent) {
    await sendSystemSMS(db, sellerClubTeamId, SMS_ROLE,
      `⌛ Na nabídku od ${buyerName} na ${deal} ${playerName} jsi neodpověděl, propadla.`);
    if (!isVirtualBuyer) {
      await sendSystemSMS(db, buyerClubTeamId, SMS_ROLE,
        `⌛ ${sellerName} na tvou nabídku na ${deal} ${playerName} neodpověděl, propadla.`);
    }
    return;
  }
  if (isVirtualBuyer) return;
  await sendSystemSMS(db, buyerClubTeamId, SMS_ROLE,
    `⌛ Na protinabídku od ${sellerName} na ${deal} ${playerName} jsi neodpověděl, propadla.`);
  await sendSystemSMS(db, sellerClubTeamId, SMS_ROLE,
    `⌛ ${buyerName} na tvou protinabídku na ${deal} ${playerName} neodpověděl, propadla.`);
}

async function teamName(db: D1Database, teamId: string): Promise<string | null> {
  const row = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId).first<{ name: string }>()
    .catch((e) => { logger.warn({ module: "offer-expiry" }, "load team name", e); return null; });
  return row?.name ?? null;
}
