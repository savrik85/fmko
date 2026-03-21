/**
 * FMK-23: Sezónní eventy — zabijačka, ples, vánoční turnaj, zpravodaj.
 */

import type { Rng } from "../generators/rng";

export type SeasonalEventType = "zabijacka" | "ples" | "vanocni_turnaj" | "silvestr" | "letni_soustredeni" | "obecni_zpravodaj";

export interface SeasonalEventDef {
  type: SeasonalEventType;
  title: string;
  description: string;
  gameWeek: number; // Kdy v sezóně se event spustí
  effects: Array<{ type: string; value: number; description: string }>;
  choices?: Array<{ id: string; label: string; effects: Array<{ type: string; value: number; description: string }> }>;
}

const EVENT_TEMPLATES: SeasonalEventDef[] = [
  {
    type: "zabijacka",
    title: "Zabijačka",
    description: "Tradice je tradice. Zabijačka přinese peníze do klubové kasy, ale kluci budou mít kocovinu.",
    gameWeek: 12,
    effects: [
      { type: "budget", value: 5000, description: "+5 000 Kč do rozpočtu" },
      { type: "morale", value: 10, description: "+10 morálka (dobrá nálada)" },
    ],
    choices: [
      {
        id: "big",
        label: "Velká zabijačka (víc peněz, víc kocoviny)",
        effects: [
          { type: "budget", value: 10000, description: "+10 000 Kč" },
          { type: "alcohol_event", value: 1, description: "Hráči s alkohol > 60 mají 50% šanci na absenci příští zápas" },
        ],
      },
      {
        id: "small",
        label: "Malá zabijačka (méně peněz, bez následků)",
        effects: [
          { type: "budget", value: 3000, description: "+3 000 Kč" },
        ],
      },
      {
        id: "skip",
        label: "Letos ne (hráči s vysokým patriotismem budou zklamaní)",
        effects: [
          { type: "morale", value: -5, description: "-5 morálka" },
        ],
      },
    ],
  },
  {
    type: "ples",
    title: "Fotbalový ples",
    description: "Příležitost pro klub vylepšit reputaci a naplnit kasu. Ale taky riziko hádek po pár pivech.",
    gameWeek: 20,
    effects: [
      { type: "budget", value: 8000, description: "+8 000 Kč ze vstupného a tomboly" },
      { type: "reputation", value: 5, description: "+5 reputace" },
    ],
    choices: [
      {
        id: "fancy",
        label: "Velký ples s kapelou (+reputace, dražší)",
        effects: [
          { type: "budget", value: 3000, description: "+3 000 Kč (po odečtení kapely)" },
          { type: "reputation", value: 10, description: "+10 reputace" },
        ],
      },
      {
        id: "basic",
        label: "Skromný ples (levnější, bez rizika)",
        effects: [
          { type: "budget", value: 6000, description: "+6 000 Kč" },
          { type: "reputation", value: 3, description: "+3 reputace" },
        ],
      },
    ],
  },
  {
    type: "vanocni_turnaj",
    title: "Vánoční halový turnaj",
    description: "Speciální halový turnaj během zimní přestávky. Menší týmy, kratší zápasy, vánoční atmosféra.",
    gameWeek: 16, // Zimní přestávka
    effects: [
      { type: "experience", value: 5, description: "Hráči získají zkušenosti" },
      { type: "morale", value: 5, description: "+5 morálka" },
    ],
  },
  {
    type: "silvestr",
    title: "Silvestrovská jedenáctka",
    description: "Exhibiční zápas na přelomu roku. Vtipné sestavy, žádný tlak, jen zábava.",
    gameWeek: 17,
    effects: [
      { type: "morale", value: 10, description: "+10 morálka" },
      { type: "alcohol_event", value: 1, description: "Celý tým má kocovinu (ale je to tradice)" },
    ],
  },
  {
    type: "letni_soustredeni",
    title: "Letní soustředění",
    description: "Volitelné soustředění před novou sezónou. Boost pro přípravu, ale stojí peníze.",
    gameWeek: 0, // Před sezónou
    effects: [],
    choices: [
      {
        id: "full",
        label: "Kompletní soustředění (3 dny, -8 000 Kč)",
        effects: [
          { type: "budget", value: -8000, description: "-8 000 Kč" },
          { type: "stamina_boost", value: 5, description: "+5 vytrvalost pro všechny" },
          { type: "morale", value: 10, description: "+10 morálka" },
        ],
      },
      {
        id: "light",
        label: "Víkendový kemp (-3 000 Kč)",
        effects: [
          { type: "budget", value: -3000, description: "-3 000 Kč" },
          { type: "stamina_boost", value: 2, description: "+2 vytrvalost" },
        ],
      },
      {
        id: "skip",
        label: "Letos bez soustředění",
        effects: [],
      },
    ],
  },
  {
    type: "obecni_zpravodaj",
    title: "Obecní zpravodaj",
    description: "V obecním zpravodaji vyšel článek o vašem týmu.",
    gameWeek: 8,
    effects: [
      { type: "reputation", value: 2, description: "+2 reputace" },
    ],
  },
];

/**
 * Get events that should trigger for a given game week.
 */
export function getSeasonalEventsForWeek(
  rng: Rng,
  gameWeek: number,
): SeasonalEventDef[] {
  return EVENT_TEMPLATES.filter((e) => e.gameWeek === gameWeek);
}

/**
 * Generate a newspaper article about the round results.
 */
export function generateNewspaperArticle(
  rng: Rng,
  teamName: string,
  position: number,
  lastResult: { opponent: string; homeScore: number; awayScore: number; isHome: boolean },
): string {
  const won = lastResult.isHome
    ? lastResult.homeScore > lastResult.awayScore
    : lastResult.awayScore > lastResult.homeScore;
  const drew = lastResult.homeScore === lastResult.awayScore;

  const headlines = won ? [
    `${teamName} slaví výhru! "${lastResult.opponent} neměl šanci," říká trenér.`,
    `Parádní víkend pro ${teamName}. Fanoušci (oba dva) jsou nadšení.`,
    `${teamName} stoupá tabulkou. Na ${position}. místě a s chutí do dalšího kola.`,
  ] : drew ? [
    `Remíza ${teamName} s ${lastResult.opponent}. "Bod je bod," komentuje trenér.`,
    `${teamName} si přivezl bod. U stánku se prodalo rekordních 12 piv.`,
  ] : [
    `Těžký víkend pro ${teamName}. Prohra ${lastResult.homeScore}:${lastResult.awayScore}.`,
    `${teamName} padl. "Příště to bude lepší," slibuje kapitán v hospodě.`,
    `${lastResult.opponent} porazil ${teamName}. Trenér zvažuje taktické změny (a výměnu brankáře).`,
  ];

  return rng.pick(headlines);
}
