/**
 * Proč hráč chtěl odejít (2026-10-18). Ukládá se do `transferUnrest.reasons` při odmítnutí
 * nabídky, ze stejných faktorů, ze kterých se počítá jeho zájem (`computePlayerInterest`).
 * Podle důvodů se nabízejí dohody a podle nich hodnotí rozhovor i AI rozhodčí: dřív
 * dostal hráč, který chtěl peníze, stejnou nabídku jako ten, kdo chtěl hrát.
 */

import type { InterestFactor } from "./player-interest";

export type UnrestReason = "money" | "better_club" | "minutes" | "coach" | "morale";

/** Jak důvod zní v panelu u hráče a v promptu („chtěl odejít kvůli …“). */
export const REASON_LABELS: Record<UnrestReason, string> = {
  money: "penězům",
  better_club: "lepšímu klubu",
  minutes: "tomu, že málo hraje",
  coach: "vztahu s trenérem",
  morale: "špatné náladě v klubu",
};

/** Faktor zájmu → důvod. Faktory, které se dohodou řešit nedají (věk, patriotismus), chybí. */
const FACTOR_REASON: Record<string, UnrestReason> = {
  "Balík peněz": "money",
  "Lákavé peníze": "money",
  "Slušné peníze": "money",
  "Lepší klub": "better_club",
  "Fotbal v Německu": "better_club",
  "Jméno trenéra": "better_club",
  "Ambice": "better_club",
  "Skoro nehraje": "minutes",
  "Hraje málo": "minutes",
  "Vztah s trenérem": "coach",
  "Morálka": "morale",
};

/** Od kolika bodů zájmu je důvod skutečný (menší faktory hráč sám nevnímá). */
const MIN_REASON_WEIGHT = 6;

/** Důvody od nejsilnějšího, nejvýš tři. */
export function unrestReasonsFromFactors(factors: readonly InterestFactor[]): UnrestReason[] {
  const weight = new Map<UnrestReason, number>();
  for (const f of factors) {
    const reason = FACTOR_REASON[f.label];
    if (!reason || f.delta <= 0) continue;
    weight.set(reason, (weight.get(reason) ?? 0) + f.delta);
  }
  return [...weight].filter(([, w]) => w >= MIN_REASON_WEIGHT).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r]) => r);
}

/** „penězům a lepšímu klubu“ */
export function reasonsText(reasons: readonly UnrestReason[]): string {
  const labels = reasons.map((r) => REASON_LABELS[r]);
  return labels.length <= 1 ? labels.join("") : `${labels.slice(0, -1).join(", ")} a ${labels[labels.length - 1]}`;
}

/** Co dohoda znamená pro hráče (do promptu AI, ať ji bere jako hotovou věc, ne slib do větru). */
export const DEAL_TEXTS: Record<string, string> = {
  bonus: "trenér ti vyplatil prémii z klubové kasy",
  raise_wage: "trenér ti natrvalo zvedl odměny o třetinu",
  promise_minutes: "trenér ti slíbil místo v základu ve 2 ze 3 příštích zápasů",
  promise_transfer: "trenér ti dal slovo, že tě při další slušné nabídce do 30 dní pustí",
  captaincy: "trenér z tebe udělal kapitána týmu",
  personal_talk: "trenér tě pozval na pivo, sedli jste a vyříkali si to",
  appeal_loyalty: "trenér ti připomněl, co pro tebe klub znamená",
  tough_love: "trenér tě zpražil, ať přestaneš trucovat a makáš",
  release: "trenér volal do klubu, který tě chtěl, a slíbil přijmout jejich novou nabídku",
};

/** Truc hráče do promptu rozhovoru po zatrhnutém přestupu. */
export interface TransferTalk {
  reasons: string | null;
  offer: string | null;
  deals: string[];
}

/** Z `life_context.transferUnrest` (null, když hráč netrucuje). */
export function transferTalkFrom(unrest: { reasons?: UnrestReason[]; teamName?: string; offer?: { amount: number }; deals?: Array<{ id: string }> } | null | undefined): TransferTalk | undefined {
  if (!unrest) return undefined;
  return {
    reasons: unrest.reasons?.length ? reasonsText(unrest.reasons) : null,
    offer: unrest.offer?.amount ? `${unrest.teamName ?? "Klub"} nabízel ${unrest.offer.amount.toLocaleString("cs")} Kč` : null,
    deals: (unrest.deals ?? []).map((d) => DEAL_TEXTS[d.id]).filter(Boolean),
  };
}

/**
 * Věta, kterou hráč v první SMS po odmítnutí řekne, proč chtěl pryč. Důvod se manažer
 * dozví od hráče, ne z panelu (přání 2026-10-18: „ať je to vše formou SMS“).
 */
export const REASON_SMS: Record<UnrestReason, string> = {
  money: "Nabízeli víc peněz, než tady uvidím za celou sezónu.",
  better_club: "Konečně jsem si mohl zahrát pořádnou soutěž.",
  minutes: "Tady stejně skoro nehraju.",
  coach: "S vámi si stejně moc nerozumíme.",
  morale: "Poslední dobou mě to tady vůbec nebaví.",
};
