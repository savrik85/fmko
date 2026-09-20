/**
 * Správa přečtených / viděných přestupových nabídek.
 * Ukládá otisk (fingerprint) stavu nabídek do localStorage,
 * aby notifikační odznak nesvítil trvale poté, co uživatel nabídku viděl
 * a nedošlo k žádné nové změně (protinabídce).
 */

export interface OfferLike {
  id: string;
  status?: string;
  offer_amount?: number;
  amount?: number;
  counter_amount?: number | null;
  last_action_by?: string | null;
  last_action_club_id?: string | null;
  on_turn?: boolean;
}

export interface OffersPayload {
  incoming?: OfferLike[] | null;
  outgoing?: OfferLike[] | null;
  incomingBids?: OfferLike[] | null;
  outgoingBids?: OfferLike[] | null;
}

const STORAGE_PREFIX = "fmko_seen_offers_";

/**
 * Otisk stavu nabídky — pokud protistrana pošle protinabídku,
 * změní se counter_amount, status nebo last_action, čímž vznikne nový otisk.
 */
export function getOfferFingerprint(offer: OfferLike): string {
  const amount = offer.counter_amount ?? offer.offer_amount ?? offer.amount ?? 0;
  const lastAction = offer.last_action_club_id ?? offer.last_action_by ?? "";
  const status = offer.status ?? "";
  return `${offer.id}:${status}:${amount}:${lastAction}`;
}

function getSeenOffersMap(teamId: string): Record<string, string> {
  if (typeof window === "undefined" || !teamId) return {};
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${teamId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSeenOffersMap(teamId: string, map: Record<string, string>): void {
  if (typeof window === "undefined" || !teamId) return;
  try {
    // Udržet maximálně posledních 100 záznamů pro prevenci nafukování storage
    const entries = Object.entries(map);
    const trimmed = entries.length > 100 ? Object.fromEntries(entries.slice(-100)) : map;
    localStorage.setItem(`${STORAGE_PREFIX}${teamId}`, JSON.stringify(trimmed));
  } catch (e) {
    console.warn("saveSeenOffersMap error:", e);
  }
}

/**
 * Spočítá počet aktivních nabídek/bidů, kde:
 * 1) Uživatel je na tahu (`on_turn === true`). Pokud uživatel čeká na protistranu, odznak nesvítí.
 * 2) Stav nabídky dosud nebyl uživatelem viděn (otisk neodpovídá záznamu v localStorage).
 */
export function getUnseenOffersCount(teamId: string, offersData: OffersPayload): number {
  if (typeof window === "undefined" || !teamId) return 0;

  const seenMap = getSeenOffersMap(teamId);
  let unseenCount = 0;

  const checkList = (list?: OfferLike[] | null) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      // Pokud nejsme na tahu, nabídka nevyžaduje naši akci a nemá spouštět odznak
      if (!item.on_turn) continue;

      const fp = getOfferFingerprint(item);
      if (seenMap[item.id] !== fp) {
        unseenCount++;
      }
    }
  };

  checkList(offersData.incoming);
  checkList(offersData.outgoing);
  checkList(offersData.incomingBids);
  checkList(offersData.outgoingBids);

  return unseenCount;
}

/**
 * Označí všechny aktuální nabídky jako viděné v jejich nynějším stavu.
 */
export function markOffersSeen(teamId: string, offersData: OffersPayload): void {
  if (typeof window === "undefined" || !teamId) return;

  try {
    const seenMap = getSeenOffersMap(teamId);
    let changed = false;

    const processList = (list?: OfferLike[] | null) => {
      if (!Array.isArray(list)) return;
      for (const item of list) {
        if (!item.id) continue;
        const fp = getOfferFingerprint(item);
        if (seenMap[item.id] !== fp) {
          seenMap[item.id] = fp;
          changed = true;
        }
      }
    };

    processList(offersData.incoming);
    processList(offersData.outgoing);
    processList(offersData.incomingBids);
    processList(offersData.outgoingBids);

    if (changed) {
      saveSeenOffersMap(teamId, seenMap);
    }
  } catch (e) {
    console.warn("markOffersSeen error:", e);
  }
}

/**
 * Označí konkrétní nabídku jako viděnou (např. při otevření jejího detailu).
 */
export function markSingleOfferSeen(teamId: string, offer: OfferLike): void {
  if (typeof window === "undefined" || !teamId || !offer.id) return;
  try {
    const seenMap = getSeenOffersMap(teamId);
    const fp = getOfferFingerprint(offer);
    if (seenMap[offer.id] !== fp) {
      seenMap[offer.id] = fp;
      saveSeenOffersMap(teamId, seenMap);
    }
  } catch (e) {
    console.warn("markSingleOfferSeen error:", e);
  }
}
