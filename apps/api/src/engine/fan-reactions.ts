/**
 * Jak fanoušci berou to, co se kolem klubu děje — katalog a čistá matematika.
 *
 * Každá parta to bere jinak, a v tom je celý vtip: pamětníky urazí přejmenování
 * klubu po sponzorovi, kotel ne. Kotel ocení, že ses v rozhovoru postavil
 * rozhodčímu, pamětníky to zahanbí. Prodej opory vezme jako zradu celý stadion.
 *
 * Bez DB, aby to šlo testovat.
 */

import type { FanGroupKind } from "./fan-groups";

export type ClubEventKind =
  | "prodej_opory" | "prodej_hrace" | "odchod_legendy" | "posila" | "propusteni"
  | "hostovani_pryc" | "navrat_z_hostovani"
  | "zdrazeni_vstupneho" | "zlevneni_vstupneho"
  | "prejmenovani_klubu" | "prejmenovani_stadionu"
  | "vyrazeni_z_poharu" | "postup_v_poharu"
  | "serie_vyher" | "serie_proher"
  | "rozhovor_kritika" | "rozhovor_obhajoba"
  | "vylepseni_kotle";

/** Jak se parta po události posune. Chybí-li klíč, ta parta to neřeší. */
export interface DopadNaPartu {
  mood: number;
  heat: number;
}

export interface ClubEventDef {
  /** Krátký popis do výpisu „co se dělo". */
  label: string;
  dopad: Partial<Record<FanGroupKind, DopadNaPartu>>;
  /** Která parta se k tomu ozve SMS. Bez klíče nikdo nepíše. */
  pise?: FanGroupKind;
  /**
   * Texty zprávy od vůdce. `{co}` se nahradí detailem z payloadu (jméno hráče,
   * částka), `{klub}` názvem klubu.
   *
   * Stejná pravidla jako u textů výtržností: po `{vudce}` se tu nic neohýbá,
   * protože vůdce je odesílatel, ne podmět ve větě.
   */
  texty?: readonly string[];
  /** Zpráva čeká na odpověď — manažer se může ozvat zpátky. */
  ptaSe?: boolean;
}

/**
 * Síla události 0–1 škáluje dopad. Prodej náhradníka a prodej kapitána
 * nemůže bolet stejně.
 */
export const CLUB_EVENTS: Record<ClubEventKind, ClubEventDef> = {
  prodej_opory: {
    label: "Prodej opory",
    dopad: {
      kotel: { mood: -18, heat: 22 },
      stamgasti: { mood: -12, heat: 14 },
      pametnici: { mood: -10, heat: 8 },
      parta_z_okoli: { mood: -10, heat: 10 },
      rodiny: { mood: -4, heat: 2 },
    },
    pise: "kotel",
    ptaSe: true,
    texty: [
      "Tak {co} je pryč. Můžeš mi vysvětlit, za co máme příští sobotu fandit?",
      "Prodals {co}. V kotli se o tom mluví a není to hezký. Co na to řekneš?",
      "{co} byl důvod, proč tam půlka z nás chodila. Tak co teď?",
    ],
  },
  prodej_hrace: {
    label: "Odchod hráče",
    dopad: {
      kotel: { mood: -5, heat: 5 },
      stamgasti: { mood: -4, heat: 3 },
    },
  },
  odchod_legendy: {
    label: "Odchod klubové legendy",
    dopad: {
      pametnici: { mood: -22, heat: 20 },
      stamgasti: { mood: -14, heat: 12 },
      kotel: { mood: -12, heat: 10 },
      parta_z_okoli: { mood: -8, heat: 6 },
      rodiny: { mood: -6, heat: 4 },
    },
    pise: "pametnici",
    ptaSe: true,
    texty: [
      "{co} nám odchází. Chodím sem od roku 1974 a tohle je jeden z těch dnů, co si budu pamatovat. Ne v dobrém.",
      "Takže {co} končí. Doufám, že jste mu aspoň poděkovali. My ano.",
    ],
  },
  posila: {
    label: "Posila do kádru",
    dopad: {
      kotel: { mood: 12, heat: -6 },
      stamgasti: { mood: 10, heat: -5 },
      rodiny: { mood: 6, heat: -2 },
      parta_z_okoli: { mood: 8, heat: -4 },
      pametnici: { mood: 5, heat: -2 },
    },
    pise: "kotel",
    texty: [
      "{co}! Tak tohle je konečně nákup, za kterej stojí přijít. Chystáme choreo.",
      "Slyšeli jsme o {co}. Kotel bude v sobotu narvanej.",
    ],
  },
  propusteni: {
    label: "Propuštění hráče",
    dopad: {
      kotel: { mood: -4, heat: 4 },
      stamgasti: { mood: -3, heat: 3 },
    },
  },
  hostovani_pryc: {
    label: "Hráč jde na hostování",
    dopad: {
      kotel: { mood: -4, heat: 3 },
      pametnici: { mood: -3, heat: 2 },
    },
  },
  navrat_z_hostovani: {
    label: "Návrat z hostování",
    dopad: {
      kotel: { mood: 4, heat: -2 },
      stamgasti: { mood: 3, heat: -1 },
    },
  },
  zdrazeni_vstupneho: {
    label: "Zdražení vstupného",
    dopad: {
      stamgasti: { mood: -12, heat: 14 },
      rodiny: { mood: -14, heat: 12 },
      kotel: { mood: -8, heat: 10 },
      parta_z_okoli: { mood: -10, heat: 10 },
      pametnici: { mood: -6, heat: 8 },
    },
    pise: "stamgasti",
    ptaSe: true,
    texty: [
      "Viděl jsem novou cenu vstupenky. {co}. To si u nás v hospodě někdo rozmyslí, jestli vůbec půjde.",
      "Zdražils. {co}. Chlapi u výčepu reptají a já jim nemám co říct.",
    ],
  },
  zlevneni_vstupneho: {
    label: "Zlevnění vstupného",
    dopad: {
      stamgasti: { mood: 10, heat: -8 },
      rodiny: { mood: 12, heat: -8 },
      kotel: { mood: 6, heat: -5 },
      parta_z_okoli: { mood: 8, heat: -6 },
      pametnici: { mood: 5, heat: -4 },
    },
    pise: "stamgasti",
    texty: [
      "Vstupné dolů. {co}. To se počítá, díky.",
      "Slyšel jsem o nový ceně. {co}. Přijde nás víc, to ti garantuju.",
    ],
  },
  prejmenovani_klubu: {
    label: "Přejmenování klubu po sponzorovi",
    dopad: {
      pametnici: { mood: -25, heat: 28 },
      kotel: { mood: -14, heat: 16 },
      stamgasti: { mood: -8, heat: 8 },
      parta_z_okoli: { mood: -5, heat: 4 },
    },
    pise: "pametnici",
    ptaSe: true,
    texty: [
      "Tak už se nejmenujeme, jak jsme se jmenovali osmdesát let. {co}. Na plachtě budeme mít pořád to staré jméno, ať děláte, co chcete.",
      "{co}. Chápu, že peníze jsou potřeba. Ale tohle jméno neslo tři generace.",
    ],
  },
  prejmenovani_stadionu: {
    label: "Přejmenování stadionu",
    dopad: {
      pametnici: { mood: -12, heat: 14 },
      kotel: { mood: -6, heat: 6 },
    },
    pise: "pametnici",
    texty: ["Hřiště se teď jmenuje {co}. Pro nás to zůstane u plotu za školou."],
  },
  vyrazeni_z_poharu: {
    label: "Vyřazení z poháru",
    dopad: {
      kotel: { mood: -14, heat: 8 },
      stamgasti: { mood: -10, heat: 5 },
      parta_z_okoli: { mood: -10, heat: 5 },
      pametnici: { mood: -6, heat: 2 },
      rodiny: { mood: -5, heat: 1 },
    },
  },
  postup_v_poharu: {
    label: "Postup v poháru",
    dopad: {
      kotel: { mood: 15, heat: -8 },
      stamgasti: { mood: 12, heat: -6 },
      parta_z_okoli: { mood: 12, heat: -6 },
      pametnici: { mood: 8, heat: -4 },
      rodiny: { mood: 8, heat: -3 },
    },
    pise: "kotel",
    texty: ["Postup! Na další kolo jedeme v plným počtu, sháníme autobus."],
  },
  serie_vyher: {
    label: "Série výher",
    dopad: {
      kotel: { mood: 14, heat: -10 },
      stamgasti: { mood: 10, heat: -7 },
      rodiny: { mood: 8, heat: -4 },
      parta_z_okoli: { mood: 10, heat: -6 },
      pametnici: { mood: 8, heat: -5 },
    },
    pise: "kotel",
    texty: ["Tohle je jízda. Kotel bude v sobotu narvanej, přines si špunty do uší."],
  },
  serie_proher: {
    label: "Série proher",
    dopad: {
      kotel: { mood: -16, heat: 14 },
      stamgasti: { mood: -12, heat: 10 },
      rodiny: { mood: -8, heat: 4 },
      parta_z_okoli: { mood: -12, heat: 9 },
      pametnici: { mood: -8, heat: 5 },
    },
    pise: "kotel",
    ptaSe: true,
    texty: [
      "Pátá prohra. V kotli se mluví o tom, že se přestane fandit. Máš pro nás něco?",
      "Takhle už to dál nejde. Co s tím chceš dělat?",
    ],
  },
  rozhovor_kritika: {
    label: "Kritika rozhodčího v rozhovoru",
    // Tady se party rozcházejí nejvíc: kotel má radost, že ses postavil,
    // pamětníci se stydí. Přesně o tom to má být.
    dopad: {
      kotel: { mood: 9, heat: -7 },
      parta_z_okoli: { mood: 6, heat: -4 },
      stamgasti: { mood: 4, heat: -2 },
      pametnici: { mood: -7, heat: 5 },
      rodiny: { mood: -4, heat: 2 },
    },
    pise: "kotel",
    texty: ["Četl jsem, cos řekl o sudím. Přesně tak. Konečně někdo."],
  },
  rozhovor_obhajoba: {
    label: "Zastání se rozhodčího",
    dopad: {
      pametnici: { mood: 8, heat: -6 },
      rodiny: { mood: 5, heat: -3 },
      kotel: { mood: -6, heat: 5 },
      parta_z_okoli: { mood: -4, heat: 3 },
    },
    pise: "pametnici",
    texty: ["Zastal ses sudího. To se dnes nevidí a já si toho vážím."],
  },
  vylepseni_kotle: {
    label: "Vylepšení sektoru kotle",
    dopad: {
      kotel: { mood: 22, heat: -18 },
      parta_z_okoli: { mood: 10, heat: -6 },
    },
    pise: "kotel",
    texty: ["Viděli jsme ten novej sektor. Za tohle ti patří dík — bude to peklo."],
  },
};

export const CLUB_EVENT_KINDS = Object.keys(CLUB_EVENTS) as ClubEventKind[];

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Dopad události na jednu partu, zeslabený její povahou a silou události.
 *
 * Vášnivá parta to prožívá víc, loajální parta špatné zprávy tlumí — stejná
 * logika jako u nálady po výsledku, jinak by se ty dvě věci chovaly rozdílně.
 */
export function dopadUdalosti(
  kind: ClubEventKind,
  groupKind: FanGroupKind,
  opts: { severity: number; passion: number; loyalty: number },
): DopadNaPartu {
  const zaklad = CLUB_EVENTS[kind]?.dopad[groupKind];
  if (!zaklad) return { mood: 0, heat: 0 };

  const sila = clamp01(opts.severity);
  const vasen = 0.75 + (Math.max(0, Math.min(100, opts.passion)) / 100) * 0.5;
  // Loajalita tlumí jen to špatné — z dobré zprávy má radost každý stejně.
  const tlumeni = zaklad.mood < 0 ? 1 - Math.max(0, Math.min(100, opts.loyalty)) / 250 : 1;

  return {
    mood: Math.round(zaklad.mood * sila * vasen * tlumeni),
    heat: Math.round(zaklad.heat * sila * vasen * tlumeni),
  };
}

/** Jak silná je událost podle toho, jak dobrý hráč odchází nebo přichází. */
export function silaPodleHrace(rating: number, jeKapitan = false): number {
  const z = Math.max(0, Math.min(100, rating));
  // Náhradník s ratingem 40 skoro nikoho nezajímá, opora se 75 zamává celým stadionem.
  const zaklad = clamp01((z - 35) / 45);
  return clamp01(jeKapitan ? zaklad + 0.25 : zaklad);
}

/** Jak silná je změna ceny vstupného. 20 % a víc už je plná dávka. */
export function silaZmenyCeny(stara: number, nova: number): number {
  if (stara <= 0) return nova > 0 ? 0.5 : 0;
  return clamp01(Math.abs(nova - stara) / stara / 0.2);
}

// ── Odpověď manažera vůdci ───────────────────────────────────────────────────

export type OdpovedPostoj = "uklidnit" | "postavit_se" | "vyhnout_se";

/**
 * Do jaké polohy manažer odpověděl.
 *
 * Lexikálně, bez modelu — stejný přístup jako `classifyRefereeStance`
 * u pozápasových rozhovorů. Model by tu byl drahý a nespolehlivý u dvou vět.
 */
export function klasifikujOdpoved(text: string): OdpovedPostoj {
  const t = text.toLowerCase();
  if (t.trim().length < 8) return "vyhnout_se";

  const smir = ["chápu", "chapu", "omlouv", "promiň", "prominte", "promiňte", "mrzí", "mrzi",
    "rozumím", "rozumim", "máte pravdu", "mate pravdu", "slibuj", "napravím", "napravim",
    "děkuj", "dekuj", "vážím", "vazim", "sejdeme", "poslouchám", "poslroucham", "poslouchám"];
  const tvrde = ["rozhoduju", "rozhoduji", "moje věc", "moje vec", "nebudu", "nemám co", "nemam co",
    "je to tak", "trpět", "trpet", "vyhazov", "zákaz", "zakaz", "koho zajímá", "koho zajima",
    "kdo tady", "vedu to", "hotovo", "konec debaty", "nediskut"];

  const skoreSmir = smir.filter((w) => t.includes(w)).length;
  const skoreTvrde = tvrde.filter((w) => t.includes(w)).length;

  if (skoreSmir > skoreTvrde) return "uklidnit";
  if (skoreTvrde > skoreSmir) return "postavit_se";
  return "vyhnout_se";
}

export interface DopadOdpovedi {
  sentiment: number;
  mood: number;
  heat: number;
  /** Co vůdce odepíše. */
  odpoved: string;
}

/**
 * Jak odpověď dopadne.
 *
 * Není tu „správná" volba. Smířlivost sedí vyjednavači a urazí radikála, tvrdost
 * naopak: kápo respektuje, když si za něčím stojíš. Mlčet je vždycky nejhorší —
 * to je jediné pravidlo, které platí napříč.
 */
export function dopadOdpovedi(
  postoj: OdpovedPostoj,
  opts: { vyjednavani: number; radikalnost: number },
): DopadOdpovedi {
  const ochota = Math.max(0, Math.min(100, opts.vyjednavani)) / 100;
  const radikal = Math.max(0, Math.min(100, opts.radikalnost)) / 100;

  if (postoj === "vyhnout_se") {
    return {
      sentiment: -6,
      mood: -5,
      heat: 6,
      odpoved: "Jasně. Tak nic.",
    };
  }

  if (postoj === "uklidnit") {
    // Vyjednavač to ocení, radikál v tom vidí měkkost.
    const zisk = Math.round(-4 + ochota * 20 - radikal * 8);
    return {
      sentiment: zisk,
      mood: Math.round(zisk * 0.7),
      heat: -Math.round(zisk / 2),
      odpoved: zisk > 0
        ? "Dobře. Beru to a řeknu to klukům."
        : "Hezký slova. My potřebujeme vidět činy.",
    };
  }

  // postavit_se
  const zisk = Math.round(-6 + radikal * 18 - ochota * 6);
  return {
    sentiment: zisk,
    mood: Math.round(zisk * 0.7),
    heat: -Math.round(zisk / 2),
    odpoved: zisk > 0
      ? "Aspoň víme, na čem jsme. To se cení víc než kecy."
      : "Tak takhle ty s náma. Dobře, zapamatujeme si to.",
  };
}
