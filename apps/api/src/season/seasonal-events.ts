/**
 * FMK-23: Sezónní eventy — zabijačka, ples, vánoční turnaj, zpravodaj.
 */

import type { Rng } from "../generators/rng";

export type SeasonalEventType = "zabijacka" | "ples" | "vanocni_turnaj" | "silvestr" | "letni_soustredeni" | "obecni_zpravodaj" | "den_obce" | "pout" | "brigada_hriste" | "sponzorsky_den" | "konec_skoly" | "hospoda" | "pratele" | "adhoc_brigada" | "stolni_fotbalek" | "sponzor_vecere" | "obecni_slavnost" | "exligovec" | "narozeniny" | "vylet_zapas" | "kontrola_svaz";

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
  {
    type: "den_obce",
    title: "Den obce",
    description: "Obec slaví své výročí. Fotbalový tým je pozván k organizaci programu.",
    gameWeek: 6,
    effects: [],
    choices: [
      {
        id: "organize",
        label: "Zorganizovat ukázkový zápas",
        effects: [
          { type: "reputation", value: 5, description: "+5 reputace" },
          { type: "morale", value: 5, description: "+5 morálka" },
          { type: "budget", value: -2000, description: "-2 000 Kč (občerstvení)" },
        ],
      },
      {
        id: "attend",
        label: "Jen se zúčastnit",
        effects: [
          { type: "reputation", value: 2, description: "+2 reputace" },
        ],
      },
      {
        id: "skip",
        label: "Nejít",
        effects: [
          { type: "reputation", value: -3, description: "-3 reputace (lidi si všimnou)" },
        ],
      },
    ],
  },
  {
    type: "pout",
    title: "Pouť",
    description: "Je pouť! Hráči se ptají jestli bude trénink nebo volno.",
    gameWeek: 10,
    effects: [],
    choices: [
      {
        id: "volno",
        label: "Dát volno — ať si užijou",
        effects: [
          { type: "morale", value: 8, description: "+8 morálka" },
          { type: "alcohol_event", value: 1, description: "Kocovina příští den" },
        ],
      },
      {
        id: "trenink",
        label: "Trénink jako vždycky",
        effects: [
          { type: "morale", value: -3, description: "-3 morálka (nemají radost)" },
        ],
      },
    ],
  },
  {
    type: "brigada_hriste",
    title: "Brigáda na hřišti",
    description: "Hřiště potřebuje údržbu. Obec nabízí materiál, ale práce je na vás.",
    gameWeek: 4,
    effects: [],
    choices: [
      {
        id: "full",
        label: "Celý tým pomůže (celý víkend)",
        effects: [
          { type: "morale", value: 5, description: "+5 morálka (teambuilding)" },
          { type: "reputation", value: 3, description: "+3 reputace" },
        ],
      },
      {
        id: "hire",
        label: "Zaplatit firmu (-5 000 Kč)",
        effects: [
          { type: "budget", value: -5000, description: "-5 000 Kč" },
        ],
      },
      {
        id: "skip",
        label: "Nechat to být",
        effects: [
          { type: "reputation", value: -2, description: "-2 reputace" },
        ],
      },
    ],
  },
  {
    type: "sponzorsky_den",
    title: "Sponzorský den",
    description: "Hlavní sponzor zve tým na firemní akci. Dobrá příležitost pro vztahy.",
    gameWeek: 14,
    effects: [],
    choices: [
      {
        id: "attend",
        label: "Celý tým se zúčastní",
        effects: [
          { type: "budget", value: 3000, description: "+3 000 Kč (bonus od sponzora)" },
          { type: "reputation", value: 2, description: "+2 reputace" },
        ],
      },
      {
        id: "captain",
        label: "Pošleme jen kapitána",
        effects: [
          { type: "budget", value: 1000, description: "+1 000 Kč" },
        ],
      },
    ],
  },
  {
    type: "konec_skoly",
    title: "Konec školy",
    description: "Končí školní rok. Mladí kluci z vesnice se ptají jestli můžou na trénink.",
    gameWeek: 22,
    effects: [
      { type: "morale", value: 3, description: "+3 morálka (svěží krev)" },
      { type: "reputation", value: 1, description: "+1 reputace" },
    ],
  },
];

// ── Ad-hoc events (random, triggered after each round) ──

const ADHOC_EVENT_POOL: SeasonalEventDef[] = [
  {
    type: "hospoda",
    title: "Posezení v hospodě",
    description: "Kluci chtějí jít po zápase do hospody. Co na to říkáš, trenére?",
    gameWeek: 0,
    effects: [],
    choices: [
      { id: "all", label: "Celý tým jde", effects: [
        { type: "morale", value: 8, description: "+8 morálka" },
        { type: "condition", value: -15, description: "-15 kondice všem" },
        { type: "budget", value: -1500, description: "-1 500 Kč (útratu platí klub)" },
      ]},
      { id: "one", label: "Jen jedno pivo", effects: [
        { type: "morale", value: 3, description: "+3 morálka" },
        { type: "condition", value: -5, description: "-5 kondice" },
        { type: "budget", value: -500, description: "-500 Kč" },
      ]},
      { id: "no", label: "Zakázat", effects: [
        { type: "morale", value: -3, description: "-3 morálka" },
      ]},
    ],
  },
  {
    type: "pratele",
    title: "Přátelák se sousední vesnicí",
    description: "Sousední obec nabízí přátelský zápas. Dobrá příprava, ale riziko zranění.",
    gameWeek: 0,
    effects: [],
    choices: [
      { id: "full", label: "Hrát naplno", effects: [
        { type: "experience", value: 5, description: "+5 zkušenost" },
        { type: "morale", value: 3, description: "+3 morálka" },
        { type: "condition", value: -10, description: "-10 kondice" },
      ]},
      { id: "easy", label: "Hrát v pohodě", effects: [
        { type: "experience", value: 2, description: "+2 zkušenost" },
        { type: "morale", value: 3, description: "+3 morálka" },
      ]},
      { id: "no", label: "Odmítnout", effects: [] },
    ],
  },
  {
    type: "adhoc_brigada",
    title: "Brigáda na hřišti",
    description: "Trávník má lepší dny za sebou. Pomůžou kluci s údržbou, nebo zaplatíme firmu?",
    gameWeek: 0,
    effects: [],
    choices: [
      { id: "team", label: "Brigáda celého týmu", effects: [
        { type: "pitch_condition", value: 15, description: "+15 stav trávníku" },
        { type: "reputation", value: 5, description: "+5 reputace" },
        { type: "morale", value: 3, description: "+3 morálka (teambuilding)" },
        { type: "condition", value: -10, description: "-10 kondice" },
      ]},
      { id: "hire", label: "Zaplatit firmu", effects: [
        { type: "pitch_condition", value: 15, description: "+15 stav trávníku" },
        { type: "budget", value: -4000, description: "-4 000 Kč" },
      ]},
      { id: "skip", label: "Nechat být", effects: [
        { type: "reputation", value: -2, description: "-2 reputace" },
      ]},
    ],
  },
  {
    type: "stolni_fotbalek",
    title: "Turnaj ve stolním fotbálku",
    description: "V místní hospodě se koná turnaj ve stolním fotbálku. Přihlásíme tým?",
    gameWeek: 0,
    effects: [],
    choices: [
      { id: "go", label: "Jdeme do toho", effects: [
        { type: "morale", value: 5, description: "+5 morálka" },
        { type: "condition", value: -5, description: "-5 kondice" },
        { type: "budget", value: -500, description: "-500 Kč (startovné)" },
      ]},
      { id: "watch", label: "Jen fandit", effects: [
        { type: "morale", value: 2, description: "+2 morálka" },
      ]},
      { id: "train", label: "Máme trénink", effects: [
        { type: "morale", value: -2, description: "-2 morálka" },
        { type: "condition", value: 5, description: "+5 kondice" },
      ]},
    ],
  },
  {
    type: "sponzor_vecere",
    title: "Sponzor zve na večeři",
    description: "Hlavní sponzor zve vedení klubu na večeři. Prý chce probrat spolupráci.",
    gameWeek: 0,
    effects: [],
    choices: [
      { id: "go", label: "Jít a jednat", effects: [
        { type: "budget", value: 2000, description: "+2 000 Kč (bonus od sponzora)" },
        { type: "reputation", value: 3, description: "+3 reputace" },
      ]},
      { id: "team", label: "Vzít i hráče", effects: [
        { type: "budget", value: 1000, description: "+1 000 Kč" },
        { type: "morale", value: 5, description: "+5 morálka" },
        { type: "condition", value: -10, description: "-10 kondice (pozdní návrat)" },
      ]},
      { id: "no", label: "Odmítnout", effects: [
        { type: "reputation", value: -2, description: "-2 reputace" },
      ]},
    ],
  },
  {
    type: "obecni_slavnost",
    title: "Obecní slavnost",
    description: "Obec pořádá slavnost a chce, aby fotbalisté pomohli s organizací.",
    gameWeek: 0,
    effects: [],
    choices: [
      { id: "full", label: "Pomůžeme celý den", effects: [
        { type: "reputation", value: 8, description: "+8 reputace" },
        { type: "condition", value: -15, description: "-15 kondice" },
        { type: "budget", value: 2000, description: "+2 000 Kč (podíl z výtěžku)" },
      ]},
      { id: "show", label: "Jen se ukázat", effects: [
        { type: "reputation", value: 3, description: "+3 reputace" },
        { type: "morale", value: 2, description: "+2 morálka" },
      ]},
      { id: "no", label: "Nemáme čas", effects: [
        { type: "reputation", value: -3, description: "-3 reputace" },
      ]},
    ],
  },
  {
    type: "exligovec",
    title: "Trénink od ex-ligovce",
    description: "Bývalý ligový hráč žijící v okolí nabízí, že povede jeden trénink.",
    gameWeek: 0,
    effects: [],
    choices: [
      { id: "pay", label: "Přijmout a zaplatit", effects: [
        { type: "experience", value: 8, description: "+8 zkušenost celému týmu" },
        { type: "budget", value: -2000, description: "-2 000 Kč" },
      ]},
      { id: "free", label: "Přijmout zdarma (přijde jen na hodinu)", effects: [
        { type: "experience", value: 3, description: "+3 zkušenost" },
      ]},
      { id: "no", label: "Nepotřebujeme", effects: [] },
    ],
  },
  {
    type: "narozeniny",
    title: "Hráč slaví narozeniny",
    description: "Jeden z hráčů má kulaté narozeniny a zve celý tým na oslavu.",
    gameWeek: 0,
    effects: [],
    choices: [
      { id: "big", label: "Velká oslava", effects: [
        { type: "morale", value: 10, description: "+10 morálka" },
        { type: "condition", value: -20, description: "-20 kondice" },
        { type: "alcohol_event", value: 1, description: "Kocovina příští den" },
      ]},
      { id: "small", label: "Skromná gratulace", effects: [
        { type: "morale", value: 3, description: "+3 morálka" },
      ]},
      { id: "skip", label: "Ignorovat", effects: [
        { type: "morale", value: -5, description: "-5 morálka (tým zklamaný)" },
      ]},
    ],
  },
  {
    type: "vylet_zapas",
    title: "Výlet na profesionální zápas",
    description: "V krajském městě hraje prvoligový tým. Pojedeme se podívat?",
    gameWeek: 0,
    effects: [],
    choices: [
      { id: "bus", label: "Celý tým autobusem", effects: [
        { type: "morale", value: 5, description: "+5 morálka" },
        { type: "experience", value: 3, description: "+3 zkušenost" },
        { type: "budget", value: -2500, description: "-2 500 Kč (autobus + lístky)" },
      ]},
      { id: "solo", label: "Kdo chce, ať jede sám", effects: [
        { type: "morale", value: 2, description: "+2 morálka" },
      ]},
      { id: "train", label: "Zůstaneme trénovat", effects: [
        { type: "condition", value: 5, description: "+5 kondice" },
      ]},
    ],
  },
  {
    type: "kontrola_svaz",
    title: "Kontrola ze svazu",
    description: "Přijela neohlášená kontrola ze svazu. Hřiště musí splňovat podmínky.",
    gameWeek: 0,
    effects: [],
    choices: [
      { id: "fix", label: "Rychle uklidit a opravit", effects: [
        { type: "budget", value: -1000, description: "-1 000 Kč" },
      ]},
      { id: "risk", label: "Nechat jak to je (riskantní)", effects: [
        { type: "budget", value: -2000, description: "-2 000 Kč (pokuta, pokud se nelíbí)" },
      ]},
      { id: "lunch", label: "Pozvat na oběd", effects: [
        { type: "budget", value: -500, description: "-500 Kč" },
        { type: "reputation", value: 2, description: "+2 reputace" },
      ]},
    ],
  },
];

/**
 * Pick a random ad-hoc event for after a match round.
 * ~30% chance of triggering.
 */
export function pickRandomAdhocEvent(rng: Rng, gameWeek: number): SeasonalEventDef | null {
  if (rng.random() > 0.3) return null;
  const event = rng.pick(ADHOC_EVENT_POOL);
  return { ...event, gameWeek };
}

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
    `${teamName} válí! Výhra nad ${lastResult.opponent} zvedla náladu v celé obci.`,
    `Jasná záležitost pro ${teamName}. V kabině teklo šampaňské (nebo aspoň pivo).`,
    `Trenér ${teamName}: "Kluci to odmakali na sto procent."`,
    `${teamName} pokračuje v sérii. ${lastResult.opponent} na ně nestačil.`,
    `U hřiště ${teamName} zavládlo nadšení. Stánek s pivem nestíhal.`,
    `${teamName} si pohlídal tři body. Soupeř odjel s prázdnou.`,
    `Výhra ${teamName} ${lastResult.homeScore}:${lastResult.awayScore}! Hospodský gratuloval jako první.`,
  ] : drew ? [
    `Remíza ${teamName} s ${lastResult.opponent}. "Bod je bod," komentuje trenér.`,
    `${teamName} si přivezl bod. U stánku se prodalo rekordních 12 piv.`,
    `Dělba bodů mezi ${teamName} a ${lastResult.opponent}. Oba trenéři spokojení. Asi.`,
    `${teamName} remizoval. "Mohli jsme vyhrát, ale i prohrát," filozofuje kapitán.`,
    `Spravedlivá remíza na hřišti ${lastResult.opponent}. ${teamName} drží sérii bez prohry.`,
    `Bod z venku pro ${teamName}. Trenér to bere, hospodský taky.`,
  ] : [
    `Těžký víkend pro ${teamName}. Prohra ${lastResult.homeScore}:${lastResult.awayScore}.`,
    `${teamName} padl. "Příště to bude lepší," slibuje kapitán v hospodě.`,
    `${lastResult.opponent} porazil ${teamName}. Trenér zvažuje taktické změny (a výměnu brankáře).`,
    `Další prohra ${teamName}. Fanoušci (oba dva) odešli před koncem.`,
    `${teamName} nestačil na ${lastResult.opponent}. V kabině bylo ticho.`,
    `Prohra ${teamName} ${lastResult.homeScore}:${lastResult.awayScore}. "Musíme se zvednout," říká trenér a objednává další pivo.`,
    `${lastResult.opponent} přejel ${teamName}. Trenér hledá útěchu na dně sklenice.`,
    `Těžká porážka. ${teamName} klesá tabulkou. Starosta obce nervózně mačká telefon.`,
    `${teamName} dostal lekci od ${lastResult.opponent}. Ale jak říká kapitán: "Ještě není konec sezóny."`,
  ];

  return rng.pick(headlines);
}
