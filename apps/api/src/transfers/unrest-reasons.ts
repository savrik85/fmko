/**
 * Proč hráč chtěl odejít (2026-10-18). Ukládá se do `transferUnrest.reasons` při odmítnutí
 * nabídky, ze stejných faktorů, ze kterých se počítá jeho zájem (`computePlayerInterest`).
 * Podle důvodů se nabízejí dohody a podle nich hodnotí rozhovor i AI rozhodčí: dřív
 * dostal hráč, který chtěl peníze, stejnou nabídku jako ten, kdo chtěl hrát.
 */

import type { InterestFactor } from "./player-interest";

export type UnrestReason = "money" | "better_club" | "minutes" | "coach" | "morale";

/**
 * Jak důvod zní v promptu („chtěl odejít kvůli …“). „Peníze“ znamenají, kolik za hráče
 * klub nabídl (faktor zájmu se počítá z odstupného), ne jeho výplatu: s „penězi“ si
 * hráč myslel, že odstupné by dostal on (2026-10-19).
 */
export const REASON_LABELS: Record<UnrestReason, string> = {
  money: "velkému zájmu klubu",
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
  /** Jakou soutěž klub hraje proti hráčově, ať si ji model nevymýšlí. */
  league: string | null;
  deals: string[];
}

/** Z `life_context.transferUnrest` (null, když hráč netrucuje). */
export function transferTalkFrom(unrest: { reasons?: UnrestReason[]; teamName?: string; offer?: { amount: number }; leagueNote?: string; deals?: Array<{ id: string }> } | null | undefined): TransferTalk | undefined {
  if (!unrest) return undefined;
  return {
    reasons: unrest.reasons?.length ? reasonsText(unrest.reasons) : null,
    // Odstupné patří klubu; dřív „X nabízel 14 000 Kč“ a hráč tvrdil, že ty peníze nabízeli jemu.
    offer: unrest.offer?.amount
      ? `${unrest.teamName ?? "Klub"} za tebe nabídl tvému klubu ${unrest.offer.amount.toLocaleString("cs")} Kč odstupné. Ty peníze by dostal klub, ne ty. Jaký plat bys tam měl, nevíš, tak si ho nevymýšlej.`
      : null,
    league: unrest.leagueNote ?? null,
    deals: (unrest.deals ?? []).map((d) => DEAL_TEXTS[d.id]).filter(Boolean),
  };
}

/**
 * Kam by hráč přestupem šel (2026-10-19). Podle toho první SMS mluví o soutěži jen tam,
 * kde je opravdu vyšší: „pořádnou soutěž“ hráč z U21 psal i o klubu ze stejného přeboru.
 */
export type ClubStep = "higher_league" | "seniors" | "abroad" | "stronger_team";

const BETTER_CLUB_SMS: Record<ClubStep, string> = {
  higher_league: "Konečně jsem si mohl zahrát pořádnou soutěž.",
  seniors: "Konečně jsem mohl hrát mezi dospělými.",
  abroad: "Hrát v Německu, to se nenaskytne každý den.",
  stronger_team: "Mají prostě silnější tým než my.",
};

/** Věta o důvodu do první SMS; u lepšího klubu podle toho, kam by hráč šel. */
export function reasonSms(reason: UnrestReason, step: ClubStep | undefined): string {
  return reason === "better_club" ? BETTER_CLUB_SMS[step ?? "stronger_team"] : REASON_SMS[reason];
}

/**
 * Věta, kterou hráč v první SMS po odmítnutí řekne, proč chtěl pryč. Důvod se manažer
 * dozví od hráče, ne z panelu (přání 2026-10-18: „ať je to vše formou SMS“).
 */
export const REASON_SMS: Record<UnrestReason, string> = {
  money: "Dávali za mě takové peníze, že mě tam fakt chtěli.",
  better_club: BETTER_CLUB_SMS.stronger_team,
  minutes: "Tady stejně skoro nehraju.",
  coach: "S vámi si stejně moc nerozumíme.",
  morale: "Poslední dobou mě to tady vůbec nebaví.",
};
