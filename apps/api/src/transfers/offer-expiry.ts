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
import { computeInterestForOffer, interestOfferOf } from "./player-interest";
import { isAiTeam } from "../services/transfer-actions";

/** Kolik nabídek se zpracuje za jeden tick (D1 limity), zbytek přijde na řadu příště. */
const EXPIRY_BATCH_LIMIT = 20;
const SMS_ROLE = "Sportovní ředitel";

type OfferRow = Record<string, unknown> & {
  id: string; player_id: string; from_team_id: string; to_team_id: string;
  status: string; last_action_by: string | null; offer_type: string | null; virtual_team_data: string | null;
  expires_at: string; player_interest: number | null;
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

    // Dopad na hráče žije ve zprávách lidskému trenérovi; AI klub odpovídá do lhůty sám.
    if (sellerSilent && !(await isAiTeam(db, scope?.sellerClubTeamId ?? offer.to_team_id))) {
      await applyOfferRejectionImpact(db, offer, "expire", env)
        .catch((e) => logger.warn({ module: "offer-expiry" }, `impact ${offer.id}`, e));
    }
    await notifyExpiry(db, offer, scope?.buyerClubTeamId ?? offer.from_team_id, scope?.sellerClubTeamId ?? offer.to_team_id, sellerSilent)
      .catch((e) => logger.warn({ module: "offer-expiry" }, `notify ${offer.id}`, e));
  }
  return expired;
}

/** Připomínka chodí, když do konce lhůty zbývá nejvýš tolik hodin (tick běží jednou denně v poledne). */
const REMINDER_WINDOW_HOURS = 36;

/**
 * Připomene straně na tahu, že jí končí lhůta. Tick běží jednou denně, takže okno
 * 36 h chytí každou nabídku jednou, 12 až 36 hodin před koncem lhůty. Proti druhé
 * připomínce při ručním spuštění ticku chrání klíč v KV (s lhůtou, protinávrh ji posouvá).
 */
export async function remindIdleOffers(env: Bindings, now: Date = new Date()): Promise<number> {
  const db = env.DB;
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 3600000).toISOString();
  const due = await db.prepare(
    `SELECT * FROM transfer_offers
      WHERE status IN ('pending', 'countered') AND expires_at >= ? AND expires_at < ?
      ORDER BY expires_at ASC LIMIT ?`,
  ).bind(now.toISOString(), windowEnd, EXPIRY_BATCH_LIMIT).all<OfferRow>()
    .catch((e) => { logger.warn({ module: "offer-expiry" }, "fetch offers to remind", e); return { results: [] as OfferRow[] }; });

  let reminded = 0;
  for (const offer of due.results) {
    const key = `offer-reminder:${offer.id}:${offer.expires_at}`;
    const already = await env.CACHE_KV.get(key)
      .catch((e) => { logger.warn({ module: "offer-expiry" }, "read reminder flag", e); return null; });
    if (already) continue;

    const scope = await resolveOfferClubScope(db, offer.to_team_id, offer)
      .catch((e) => { logger.warn({ module: "offer-expiry" }, `scope ${offer.id}`, e); return null; });
    if (!scope) continue;
    const sellerOnTurn = scope.onTurn;
    const onTurnTeamId = sellerOnTurn ? scope.sellerClubTeamId : scope.buyerClubTeamId;
    if (onTurnTeamId === "virtual_ai" || await isAiTeam(db, onTurnTeamId)) continue;

    const names = await offerNames(db, offer, scope.buyerClubTeamId, scope.sellerClubTeamId);
    const deadline = new Date(offer.expires_at).toLocaleString("cs-CZ", {
      timeZone: "Europe/Prague", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit",
    });
    // Zájem hráče TEĎ, stejně jako ho přepočítá propadnutí (applyOfferRejectionImpact).
    // Uložený `player_interest` je snímek z doby nabídky a následek by sliboval podle něj.
    const interest = sellerOnTurn
      ? await computeInterestForOffer(db, offer.player_id, interestOfferOf(offer))
        .catch((e) => { logger.warn({ module: "offer-expiry" }, `interest ${offer.id}`, e); return null; })
      : null;
    const wantsOut = (interest?.level ?? 0) >= 2;
    const what = sellerOnTurn
      ? `nabídku od ${names.buyerName} na ${names.deal} ${names.playerName}`
      : `protinabídku od ${names.sellerName} na ${names.deal} ${names.playerName}`;
    const consequence = wantsOut ? `, propadne a ${names.firstName} to vezme jako odmítnutí` : ", propadne";

    await sendSystemSMS(db, onTurnTeamId, SMS_ROLE, `⏰ Na ${what} máš čas do ${deadline}. Když neodpovíš${consequence}.`);
    // Trenér hráči slíbil, že tuhle nabídku přijme („pustit ho“): hráč se ozve sám.
    if (sellerOnTurn) {
      const { remindReleasePromise } = await import("./promises");
      await remindReleasePromise(db, offer.id, names.buyerName);
    }
    try {
      const { createNotification } = await import("../community/notifications");
      const pushEnv = env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT
        ? { VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: env.VAPID_SUBJECT, DB: db }
        : undefined;
      await createNotification(db, onTurnTeamId, "transfer",
        `⏰ Odpověz do ${deadline}`,
        `Na ${what} jsi zatím neodpověděl. Když neodpovíš${consequence}.`,
        `/prestupy/nabidka/${offer.id}`, pushEnv);
    } catch (e) { logger.warn({ module: "offer-expiry" }, `reminder notification ${offer.id}`, e); }

    await env.CACHE_KV.put(key, "1", { expirationTtl: 60 * 60 * 24 * 4 })
      .catch((e) => logger.warn({ module: "offer-expiry" }, "set reminder flag", e));
    reminded++;
  }
  return reminded;
}

async function offerNames(db: D1Database, offer: OfferRow, buyerClubTeamId: string, sellerClubTeamId: string) {
  const player = await db.prepare("SELECT first_name, last_name FROM players WHERE id = ?")
    .bind(offer.player_id).first<{ first_name: string; last_name: string }>()
    .catch((e) => { logger.warn({ module: "offer-expiry" }, "load player", e); return null; });
  const isVirtualBuyer = buyerClubTeamId === "virtual_ai";
  return {
    playerName: player ? `${player.first_name} ${player.last_name}` : "hráče",
    firstName: player?.first_name ?? "hráč",
    deal: offer.offer_type === "loan" ? "hostování" : "přestup",
    isVirtualBuyer,
    buyerName: isVirtualBuyer
      ? (() => {
        try { return (JSON.parse(offer.virtual_team_data ?? "{}") as { name?: string }).name ?? "Klub"; }
        catch (e) { logger.warn({ module: "offer-expiry" }, "parse virtual_team_data", e); return "Klub"; }
      })()
      : (await teamName(db, buyerClubTeamId)) ?? "Klub",
    sellerName: (await teamName(db, sellerClubTeamId)) ?? "Klub",
  };
}

async function notifyExpiry(
  db: D1Database, offer: OfferRow, buyerClubTeamId: string, sellerClubTeamId: string, sellerSilent: boolean,
): Promise<void> {
  const { playerName, deal, isVirtualBuyer, buyerName, sellerName } = await offerNames(db, offer, buyerClubTeamId, sellerClubTeamId);
  // AI klub telefon nemá, zprávy dostávají jen lidské kluby.
  const smsToHuman = async (teamId: string, body: string) => {
    if (await isAiTeam(db, teamId)) return;
    await sendSystemSMS(db, teamId, SMS_ROLE, body);
  };

  if (sellerSilent) {
    await smsToHuman(sellerClubTeamId, `⌛ Na nabídku od ${buyerName} na ${deal} ${playerName} jsi neodpověděl, propadla.`);
    if (!isVirtualBuyer) {
      await smsToHuman(buyerClubTeamId, `⌛ ${sellerName} na tvou nabídku na ${deal} ${playerName} neodpověděl, propadla.`);
    }
    return;
  }
  if (isVirtualBuyer) return;
  await smsToHuman(buyerClubTeamId, `⌛ Na protinabídku od ${sellerName} na ${deal} ${playerName} jsi neodpověděl, propadla.`);
  await smsToHuman(sellerClubTeamId, `⌛ ${buyerName} na tvou protinabídku na ${deal} ${playerName} neodpověděl, propadla.`);
}

async function teamName(db: D1Database, teamId: string): Promise<string | null> {
  const row = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId).first<{ name: string }>()
    .catch((e) => { logger.warn({ module: "offer-expiry" }, "load team name", e); return null; });
  return row?.name ?? null;
}
