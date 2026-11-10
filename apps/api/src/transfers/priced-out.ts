/**
 * Protinávrh s absurdní cenou jako skryté odmítnutí.
 *
 * Mlčení prodávajícího se počítá jako odmítnutí (offer-expiry.ts). Šlo to ale obejít:
 * prodávající poslal protinávrh za nesmyslnou cenu, kupec ho odmítl, stáhl nabídku nebo
 * nechal propadnout, a jednání tím skončilo „na straně kupce“. Hráč, který chtěl odejít,
 * se nenaštval, a kupec po vlastním odmítnutí ještě dostal desetidenní blokaci.
 *
 * Když tedy jednání skončí u kupce hned po protinávrhu prodávajícího, který byl nad
 * dvojnásobkem poslední nabídky kupce nebo nad dvojnásobkem tržní hodnoty hráče, bere se to
 * jako odmítnutí prodávajícím: kupec blokaci nedostane a hráč se zájmem o přestup (úroveň 2+)
 * reaguje stejně jako na běžné odmítnutí.
 */

import { marketValue } from "@okresni-masina/shared";
import { logger } from "../lib/logger";
import { applyOfferRejectionImpact } from "./offer-rejection-impact";
import { computeInterestForOffer } from "./player-interest";

const M = "priced-out";

/** Kolikanásobek nabídky kupce nebo tržní hodnoty už není vážně míněný protinávrh. */
export const PRICED_OUT_MULTIPLE = 2;
/** Od jaké úrovně zájmu (0–3) hráč o přestup stojí. */
const WANTS_TO_LEAVE_LEVEL = 2;

/**
 * Je protinávrh prodávajícího absurdní? `buyerAmount` = poslední částka kupce (nula u čisté
 * výměny hráčů se s ničím srovnat nedá), `value` = tržní hodnota hráče.
 */
export function isPricedOutCounter(counterAmount: number, buyerAmount: number, value: number): boolean {
  if (buyerAmount > 0 && counterAmount > buyerAmount * PRICED_OUT_MULTIPLE) return true;
  return value > 0 && counterAmount > value * PRICED_OUT_MULTIPLE;
}

export interface EndedOffer {
  id: string;
  player_id: string;
  from_team_id: string;
  to_team_id: string;
  offer_amount: number;
  counter_amount: number | null;
  /** Stav PŘED ukončením (pending / countered). */
  status: string;
  offer_type?: string | null;
  virtual_team_data?: string | null;
}

export interface EndedOfferScope {
  buyerClubTeamId: string;
  sellerClubTeamId: string;
  lastActionClubTeamId: string | null;
}

/** Poslední částka, kterou v jednání navrhl kupec. Bez záznamu tahů úvodní nabídka. */
async function lastBuyerAmount(db: D1Database, offer: EndedOffer, buyerClubTeamId: string): Promise<number> {
  const rows = await db.prepare(
    `SELECT e.amount, COALESCE(t.parent_team_id, t.id, e.team_id) AS club
       FROM transfer_offer_events e LEFT JOIN teams t ON t.id = e.team_id
      WHERE e.offer_id = ? AND e.event_type IN ('offer', 'counter') AND e.amount IS NOT NULL
      ORDER BY e.created_at DESC, e.rowid DESC LIMIT 20`,
  ).bind(offer.id).all<{ amount: number; club: string }>();
  return rows.results.find((r) => r.club === buyerClubTeamId)?.amount ?? offer.offer_amount;
}

/**
 * Skončilo jednání u kupce po absurdním protinávrhu prodávajícího? Vrací poslední částku
 * kupce, nebo `null`, když se pravidlo netýká (poslední tah nebyl protinávrh prodávajícího,
 * cena byla v mezích, kupuje klub mimo hru).
 */
export async function pricedOutBuyerAmount(db: D1Database, offer: EndedOffer, scope: EndedOfferScope): Promise<number | null> {
  if (offer.status !== "countered" || offer.counter_amount == null) return null;
  if (scope.buyerClubTeamId === "virtual_ai" || scope.lastActionClubTeamId !== scope.sellerClubTeamId) return null;
  const buyerAmount = await lastBuyerAmount(db, offer, scope.buyerClubTeamId);
  const player = await db.prepare("SELECT overall_rating, age, position FROM players WHERE id = ?")
    .bind(offer.player_id).first<{ overall_rating: number; age: number; position: string | null }>();
  const value = player ? marketValue(player.overall_rating, player.age, player.position) : 0;
  return isPricedOutCounter(offer.counter_amount, buyerAmount, value) ? buyerAmount : null;
}

/**
 * Volat poté, co jednání ukončil KUPEC (odmítl protinávrh, stáhl nabídku, nechal propadnout).
 * Když ho k tomu prodávající dotlačil absurdním protinávrhem, kupec nedostane blokaci
 * (`cooldown_waived`) a hráč, který chtěl odejít, to vezme jako odmítnutí prodávajícím.
 * Vrací, jestli se pravidlo uplatnilo. Chyba se jen zapíše: konec jednání už platí.
 */
export async function settleBuyerSideEnd(
  db: D1Database,
  offer: EndedOffer,
  scope: EndedOfferScope,
  env?: Parameters<typeof applyOfferRejectionImpact>[3],
): Promise<boolean> {
  try {
    const buyerAmount = await pricedOutBuyerAmount(db, offer, scope);
    if (buyerAmount == null) return false;
    await db.prepare("UPDATE transfer_offers SET cooldown_waived = 1 WHERE id = ?").bind(offer.id).run();

    const interest = await computeInterestForOffer(db, offer.player_id, { fromTeamId: scope.buyerClubTeamId, offerAmount: buyerAmount });
    if ((interest?.level ?? 0) >= WANTS_TO_LEAVE_LEVEL) {
      // Hráč posuzuje nabídku kupce, ne nesmyslný protinávrh svého klubu.
      await applyOfferRejectionImpact(db, { ...offer, offer_amount: buyerAmount, counter_amount: null }, "reject", env);
    }
    logger.info({ module: M }, `nabídka ${offer.id}: protinávrh ${offer.counter_amount} proti ${buyerAmount} od kupce se počítá jako odmítnutí prodávajícím`);
    return true;
  } catch (e) {
    logger.warn({ module: M }, `konec jednání po protinávrhu, nabídka ${offer.id}`, e);
    return false;
  }
}
