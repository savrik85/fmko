/**
 * Data pro sekce „Tiskové středisko“ a „Historie klubu“ bez jakéhokoli vzhledu.
 * Vzhled si každá šablona dělá sama svými lištami, tabulkami a články, aby sekce
 * vypadaly jako vždycky součást webu (ne jako cizí karty vložené zvenku).
 */

import type {
  ClubWebsiteData,
  ClubWebsiteHistory,
  ClubWebsiteHistoryAward,
  ClubWebsiteHistoryCupRun,
  ClubWebsiteHistoryTrophy,
} from "@okresni-masina/shared";

export type Interview = ClubWebsiteData["interviews"][number];
export type NewsItem = ClubWebsiteData["news"][number];

// ── Tiskové středisko ────────────────────────────────────────────────────────

/**
 * Zprávy, které patří na veřejný web klubu, a jejich rubrika. Ostatní typy zůstávají jen ve hře
 * (surový JSON s herními čísly, ceny z přestupové listiny, sázkovka). Nový typ se na web
 * dostane, jen když ho sem někdo vědomě přidá (a do filtru v API).
 */
export const PRESS_NEWS_TYPES: ReadonlyMap<string, string> = new Map([
  ["promotion", "Pozvánka na zápas"],
  ["manager_arrival", "Nový trenér"],
  ["manager_feud", "Slovo trenéra"],
  ["legend_farewell", "Rozlučka"],
]);

export function pressInterviews(data: ClubWebsiteData): Interview[] {
  return (data.interviews ?? []).filter((iv) => iv.questions.length > 0);
}

export function pressNews(data: ClubWebsiteData): NewsItem[] {
  return (data.news ?? []).filter(
    (n) => PRESS_NEWS_TYPES.has(n.type) && n.headline.trim() && !n.body.trimStart().startsWith("{"),
  );
}

export function hasPressContent(data: ClubWebsiteData): boolean {
  return pressInterviews(data).length > 0 || pressNews(data).length > 0;
}

/** Titulek rozhovoru jako v novinách: „Rozhovor po 10. kole“. */
export function interviewHeadline(iv: Interview): string {
  const gw = iv.gameWeek;
  if (iv.kind === "season_wrap" || (gw >= 100 && gw % 100 === 0)) {
    return `Ohlédnutí za ${Math.max(1, Math.round(gw / 100))}. sezónou`;
  }
  if (iv.kind === "pre_match") return `Rozhovor před ${gw}. kolem`;
  if (iv.kind === "post_match") return `Rozhovor po ${gw}. kole`;
  return `Rozhovor, ${gw}. kolo`;
}

/** Kdo rozhovor dal: trenér, který tehdy vedl tým, ne nutně ten dnešní. */
export function interviewCoach(iv: Interview, data: ClubWebsiteData): string {
  return iv.managerName || data.manager?.name || "Trenér";
}

/** Otázky a odpovědi v páru; chybějící odpověď = „Bez komentáře.“ */
export function interviewPairs(iv: Interview): Array<{ question: string; answer: string }> {
  return iv.questions.map((question, i) => ({
    question,
    answer: iv.answers[i]?.trim() || "Bez komentáře.",
  }));
}

// ── Historie klubu ───────────────────────────────────────────────────────────

export function hasHistory(h: ClubWebsiteHistory | null | undefined): h is ClubWebsiteHistory {
  return !!h && (h.seasons.length > 0 || h.trophies.length > 0 || h.awards.length > 0 || h.cup.length > 0 || h.topScorers.length > 0);
}

export function trophyTitle(t: ClubWebsiteHistoryTrophy): string {
  switch (t.kind) {
    case "league_champion": return `Vítěz soutěže ${t.competitionName}`;
    case "league_runner_up": return `2. místo, ${t.competitionName}`;
    case "league_third": return `3. místo, ${t.competitionName}`;
    case "cup_winner": return `Vítěz poháru ${t.competitionName}`;
  }
}

export const AWARD_TITLES: Record<ClubWebsiteHistoryAward["kind"], string> = {
  player_of_season: "Hráč sezóny",
  top_scorer: "Král střelců",
  manager_of_season: "Trenér sezóny",
  discovery: "Objev sezóny",
  best_eleven: "Nejlepší jedenáctka sezóny",
};

/** Ocenění po sezónách; nejlepší jedenáctka sloučená do jednoho řádku se jmény. */
export function awardsBySeason(h: ClubWebsiteHistory) {
  const seasons = [...new Set(h.awards.map((a) => a.seasonNumber))].sort((a, b) => b - a);
  return seasons.map((seasonNumber) => {
    const list = h.awards.filter((a) => a.seasonNumber === seasonNumber);
    return {
      seasonNumber,
      leagueName: list[0]?.leagueName ?? "",
      single: list.filter((a) => a.kind !== "best_eleven"),
      bestEleven: list.filter((a) => a.kind === "best_eleven"),
    };
  });
}

/** Výsledek pohárového tažení jednou větou: „Postup do finále, hraje se“. */
export function cupResultText(run: ClubWebsiteHistoryCupRun): string {
  if (run.status === "won") return "Vítěz poháru";
  if (run.status === "running") return `Stále ve hře: ${run.reachedRoundName}`;
  return `Konec v kole ${run.reachedRoundName}`;
}

export function cupMatchText(run: ClubWebsiteHistoryCupRun): string | null {
  const m = run.decidingMatch;
  if (!m) return null;
  const pens = m.pensFor !== null && m.pensAgainst !== null ? `, na penalty ${m.pensFor}:${m.pensAgainst}` : "";
  return `${m.goalsFor}:${m.goalsAgainst}${pens} ${m.isHome ? "doma" : "venku"} s ${m.opponentName}`;
}

/** Krátká kronika do úvodu sekce: počet sezón a nejlepší umístění. */
export function historyIntro(h: ClubWebsiteHistory, clubName: string): string {
  const n = h.seasons.length;
  if (n === 0) return `Kronika oddílu ${clubName} se teprve píše.`;
  const best = [...h.seasons].sort((a, b) => a.position - b.position)[0];
  const seasonsWord = n === 1 ? "sezónu" : n >= 2 && n <= 4 ? "sezóny" : "sezón";
  return `${clubName} má za sebou ${n} ${seasonsWord} v soutěži. Nejlepší umístění: ${best.position}. místo (${best.leagueName}, ${best.seasonNumber}. sezóna).`;
}
