/**
 * Lhůta na odpověď v přestupovém jednání. Běží od posledního tahu (nabídka,
 * protinávrh): kdo je na tahu a do lhůty neodpoví, nabídka propadne
 * (`expireIdleOffers` v transfer-pressure ticku). Prodávající, který nechá
 * propadnout nabídku za hráče, co chtěl odejít, dopadne stejně, jako by ji odmítl.
 */
export const OFFER_REPLY_DAYS = 3;

export function offerReplyDeadline(from: Date = new Date()): string {
  return new Date(from.getTime() + OFFER_REPLY_DAYS * 86400000).toISOString();
}
