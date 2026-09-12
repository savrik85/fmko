/**
 * Tribuna — jak zní fanoušci, když o klubu píšou.
 *
 * Katalog šablon a hlasů. Bez DB a bez modelu: příspěvek se skládá ze šablony,
 * kterou vybere deterministický RNG ze seedu události. Dvakrát zpracovaný zápas
 * tedy napíše totéž a nestojí to nic.
 *
 * Proč vlastní vrstva a ne prostý výpis událostí: nálada party je číslo, které
 * si nikdo neumí představit. „Kotel má náladu 34" nic neřekne — „zase to samý,
 * doma s posledním a bez šance" ano.
 */

import type { FanGroupKind } from "./fan-groups";
import type { ClubEventKind } from "./fan-reactions";

export type PostTone = "pozitivni" | "negativni" | "neutralni";
export type PostTopic = "club_event" | "incident" | "zapas" | "oblibenec" | "rivalita";
export type AuthorKind = "vudce" | "fanousek" | "novinar" | "rival" | "klub";

/**
 * Jak která parta mluví. Používá se na jména účtů i na výběr šablon —
 * pamětník nepíše jako devatenáctiletý z kotle.
 */
export const HLAS_PARTY: Record<FanGroupKind, { handle: string; podpis: string }> = {
  kotel: { handle: "kotel", podpis: "kotel za brankou" },
  stamgasti: { handle: "hospoda", podpis: "od výčepu" },
  rodiny: { handle: "tribuna", podpis: "hlavní tribuna" },
  pametnici: { handle: "pametnik", podpis: "chodím sem od nepaměti" },
  parta_z_okoli: { handle: "prespolni", podpis: "přespolní" },
};

/** Přezdívky běžných fanoušků — deterministicky vybrané, ne generovaná jména. */
export const PREZDIVKY: readonly string[] = [
  "Pepa od plotu", "Véna", "Fanda 1971", "Maruška z bufetu", "Standa",
  "Zdenda", "Lojza", "Bára", "Ota", "Jarda s bubnem", "Milan", "Hanka",
  "Tonda", "Radek", "Iva", "Franta od vedle",
];

export interface PostSablona {
  tone: PostTone;
  /** `{co}`, `{kdo}`, `{klub}`, `{soupeř}` se nahrazují z payloadu. */
  texty: readonly string[];
  /** Které party tohle napíšou. Prázdné = kterákoli. */
  party?: readonly FanGroupKind[];
}

/**
 * Reakce na dění kolem klubu. Klíče jsou tytéž jako v `CLUB_EVENTS`, takže
 * co hne náladou, se objeví i na síti — a nemůže vzniknout událost, o které
 * se nepíše, ani příspěvek o něčem, co se nestalo.
 */
export const PRISPEVKY_K_UDALOSTEM: Partial<Record<ClubEventKind, PostSablona[]>> = {
  prodej_opory: [
    { tone: "negativni", party: ["kotel", "parta_z_okoli"], texty: [
      "Takže {co} je pryč. Gratuluju vedení, tohle byl fakt tah. 🤡",
      "Prodat {co} uprostřed sezóny. Za koho nás mají?",
      "{co} odchází a my se máme tvářit, že je to plán.",
    ] },
    { tone: "negativni", party: ["stamgasti", "pametnici"], texty: [
      "Škoda {co}. Takoví se hned tak nenajdou.",
      "S {co} odešel kus mužstva. Doufám, že ty peníze někam dají.",
    ] },
  ],
  odchod_legendy: [
    { tone: "negativni", texty: [
      "{co} končí. Nebudu psát nic dalšího, nemám co.",
      "Dneska odešel {co}. Tomu se nedá říkat přestup, tomu se říká konec éry.",
    ] },
  ],
  posila: [
    { tone: "pozitivni", texty: [
      "{co} v našem dresu. No konečně něco. 💪",
      "Tak {co} bere naše barvy. Tak ať to ukáže.",
      "{co} prý podepsal. Uvidíme v neděli.",
    ] },
  ],
  propusteni: [
    { tone: "neutralni", texty: [
      "{co} v kádru končí. Nikoho to snad nepřekvapilo.",
      "Tak {co} jde. Přeju mu, ať se chytne jinde.",
    ] },
  ],
  zdrazeni_vstupneho: [
    { tone: "negativni", texty: [
      "{co} za vstup. Za tenhle fotbal. Vážně?",
      "Zdražili. Dobrý, tak si to zaplatím, ale ať to vidím.",
      "Nejdřív výkony, pak ceny. Ne naopak.",
    ] },
  ],
  zlevneni_vstupneho: [
    { tone: "pozitivni", texty: [
      "Slevnili vstup. To se cení, přivedu kluky z práce.",
      "{co}, za to se dá jít i na horší zápas. Dobrý krok.",
    ] },
  ],
  prejmenovani_klubu: [
    { tone: "negativni", party: ["pametnici", "kotel"], texty: [
      "{co}. Můj děda by to jméno nevyslovil.",
      "Padesát let jsme byli jedno jméno. Teď jsme reklama.",
      "{co}. Na dres si to nalepím, do srdce ne.",
    ] },
  ],
  prejmenovani_stadionu: [
    { tone: "negativni", party: ["pametnici", "stamgasti"], texty: [
      "{co}. Pro mě to bude pořád hřiště.",
      "Přejmenovali nám hřiště. Budu tam chodit stejně, ale říkat to nebudu.",
    ] },
  ],
  vyrazeni_z_poharu: [
    { tone: "negativni", texty: [
      "Konec v poháru. Aspoň se soustředíme na ligu, no.",
      "Vypadli jsme. Zase.",
      "Tohle byla šance a je pryč.",
    ] },
  ],
  postup_v_poharu: [
    { tone: "pozitivni", texty: [
      "Postup! Na tohle se čekalo. 🔥",
      "Jdeme dál! Kdo přijede příště?",
      "Pohár nás baví. Konečně něco, na co se jezdí.",
    ] },
  ],
  serie_vyher: [
    { tone: "pozitivni", texty: [
      "Tohle už není náhoda. Klobouk dolů. 🟢",
      "Nepamatuju, kdy jsme naposledy takhle jeli. Užívám si to.",
      "Trenér to dal dohromady. Uznávám.",
    ] },
  ],
  serie_proher: [
    { tone: "negativni", texty: [
      "Kolikátá už to je? Přestal jsem počítat.",
      "Chodím tam pořád, ale baví mě to čím dál míň.",
      "Někdo za to musí vzít zodpovědnost.",
    ] },
  ],
  rozhovor_kritika: [
    { tone: "negativni", party: ["kotel", "stamgasti"], texty: [
      "Prát špinavé prádlo v novinách. Skvělý nápad. 🙄",
      "Kluci si to přečtou taky, trenére.",
    ] },
    { tone: "pozitivni", party: ["pametnici"], texty: [
      "Aspoň někdo řekl nahlas, jak to je.",
    ] },
  ],
  rozhovor_obhajoba: [
    { tone: "pozitivni", texty: [
      "Postavil se za mužstvo. Tak se to dělá. 👏",
      "Trenér drží s klukama. To si zapamatují.",
    ] },
  ],
  vylepseni_kotle: [
    { tone: "pozitivni", party: ["kotel", "parta_z_okoli"], texty: [
      "Nový sektor! Konečně je kam postavit bubny. 🥁",
      "Tohle vedení nemuselo. Uznávám a děkuju.",
    ] },
  ],
};

/** Reakce na výtržnost — píše se o nich, i když je způsobil někdo jiný. */
export const PRISPEVKY_K_VYTRZNOSTEM: Record<string, PostSablona[]> = {
  pyro: [
    { tone: "pozitivni", party: ["kotel"], texty: ["Bylo to vidět až do vsi. 🔥", "Za tohle se platí, ale stálo to za to."] },
    { tone: "negativni", party: ["rodiny", "pametnici"], texty: [
      "Zase ten dým. Beru sem vnoučata, ne na demonstraci.",
      "Chápu, že je to hezké. Nechápu, proč to platíme všichni.",
    ] },
  ],
  bitka_kotle: [
    { tone: "negativni", party: ["rodiny", "pametnici", "stamgasti"], texty: [
      "Rvačka u plotu. Fakt jsme si tohle přáli?",
      "Přerušený zápas kvůli partě idiotů. Gratuluju.",
      "S dětma jsme odešli o půli. Díky, kluci.",
    ] },
    { tone: "neutralni", party: ["kotel"], texty: [
      "Nezačali jsme to my. Tečka.",
      "Kdo přijede dělat bordel k nám, ať počítá s tím, co přijde.",
    ] },
  ],
  vniknuti: [
    { tone: "negativni", texty: ["Někdo na hřišti během zápasu. To je vrchol.", "Tohle nás bude stát peníze, co měly jít na kabiny."] },
  ],
  hazeni: [
    { tone: "negativni", texty: ["Házet po hřišti kelímky. Sedm let a rozum žádný.", "Za tohle přijde pokuta a zaplatíme ji všichni."] },
  ],
  pokriky: [
    { tone: "negativni", party: ["rodiny", "pametnici"], texty: ["To, co se dneska ozývalo, do fotbalu nepatří.", "Musím dceři vysvětlovat, co to křičeli. Díky."] },
  ],
  skoda: [
    { tone: "negativni", texty: [
      "{co} v troskách. Kdo to zaplatí? My. 🧾",
      "Rozbít vlastní stadion. Geniální.",
      "Za peníze na opravu mohla být půlka nového plotu.",
    ] },
  ],
  vyhrozovani: [
    { tone: "negativni", party: ["pametnici", "rodiny"], texty: ["Čekat na sudího u kabin je zbabělost.", "Za tohle nás bude nenávidět celý okres."] },
  ],
};

/** Kolem zápasu — výsledek zná každý, jde o to, jak ho kdo vezme. */
export const PRISPEVKY_K_ZAPASU: Record<"vyhra" | "remiza" | "prohra" | "debakl", PostSablona[]> = {
  vyhra: [
    { tone: "pozitivni", texty: [
      "Bereme! 🟢 {co}",
      "{co} a jde se na pivo.",
      "Takhle si to představuju. {co}",
    ] },
  ],
  remiza: [
    { tone: "neutralni", texty: [
      "{co}. Bod dobrý, dva by byly lepší.",
      "Remíza. Z toho se nikdo neposadí.",
    ] },
  ],
  prohra: [
    { tone: "negativni", texty: [
      "{co}. Nemám slov.",
      "Zase nic. {co}",
      "{co}, a to jsme tam měli jet vyhrát.",
    ] },
  ],
  debakl: [
    { tone: "negativni", texty: [
      "{co}. Tohle byla ostuda, ne zápas.",
      "Po {co} bych se na jejich místě styděl do dresu obléct.",
    ] },
  ],
};

/** Když se mění miláček nebo otloukánek. */
export const PRISPEVKY_K_OBLIBENCUM: Record<"oblibenec" | "otloukanek", PostSablona[]> = {
  oblibenec: [
    { tone: "pozitivni", texty: [
      "{kdo} je novej king. {co}",
      "Od teď chci na zádech {kdo}. {co}",
      "{kdo}. Konečně někdo, za koho se dá řvát.",
    ] },
  ],
  otloukanek: [
    { tone: "negativni", texty: [
      "{kdo}. {co}",
      "Nechci nikoho jmenovat, ale {kdo}. {co}",
    ] },
  ],
};

/**
 * Názor na to, jak se hraje.
 *
 * Kotel nechce jen výsledky, chce vidět fotbal. Nakopávaná mu vadí i při
 * výhrách, presink se mu líbí i při prohře. Štamgasti to berou pragmaticky.
 */
export const PRISPEVKY_K_TAKTICE: Record<string, PostSablona[]> = {
  long_ball: [
    { tone: "negativni", party: ["kotel", "parta_z_okoli"], texty: [
      "Nakopnout to dopředu a modlit se. To je náš plán? 🙄",
      "Za tohle se chodí na hřiště koukat? Balon nad hlavou celý zápas.",
    ] },
    { tone: "neutralni", party: ["stamgasti", "pametnici"], texty: [
      "Hezké to není, ale body to nosí. Zatím.",
    ] },
  ],
  defensive: [
    { tone: "negativni", party: ["kotel"], texty: [
      "Deset lidí vzadu a čekat. Tomuhle fandit nejde.",
      "Hrajeme doma. DOMA. A bráníme.",
    ] },
  ],
  possession: [
    { tone: "neutralni", texty: [
      "Držíme balon, dobře. A kdy vystřelíme?",
      "Sedmdesát procent držení a nula na tabuli. Super.",
    ] },
  ],
  pressing: [
    { tone: "pozitivni", party: ["kotel", "parta_z_okoli"], texty: [
      "Takhle! Vysoko, nahoru, nedat jim dýchnout. 🔥",
      "Tohle se dá fandit. Konečně.",
    ] },
  ],
  offensive: [
    { tone: "pozitivni", texty: [
      "Jdeme si pro to. Přesně tak to má být.",
      "Útočíme. Klidně to prohrajeme, ale takhle.",
    ] },
  ],
};

/** Kolik toho tým dává. Střelecká bída i smršť stojí za zmínku. */
export const PRISPEVKY_KE_STRELBE: Record<"bida" | "sucho" | "smrst", PostSablona[]> = {
  bida: [
    { tone: "negativni", texty: [
      "{co} gólů za pět zápasů. Pět. Zápasů.",
      "Kdybychom dávali góly, byli bychom nahoře. Jenže je nedáváme.",
      "Někdo by měl klukům ukázat, kde je branka.",
    ] },
  ],
  sucho: [
    { tone: "negativni", party: ["kotel", "stamgasti"], texty: [
      "Zase nula. Doma. 😤",
      "Gól jsem naposled viděl v televizi.",
    ] },
  ],
  smrst: [
    { tone: "pozitivni", texty: [
      "{co} gólů za pět zápasů! Tohle se sleduje samo. ⚽",
      "Útok nám šlape. Konečně je na co koukat.",
    ] },
  ],
};

/** Když se rozhoří rivalita. */
export const PRISPEVKY_K_RIVALITE: PostSablona[] = [
  { tone: "negativni", texty: [
    "S {soupeř} máme nevyřízené účty. Příště se uvidíme. 👀",
    "{soupeř}. Tohle se nezapomíná.",
    "Na zápas s {soupeř} se těším víc než na cokoli jinýho.",
  ] },
];

/** Dosadí detaily do šablony. Chybějící klíč nechá prázdno, ne „undefined". */
export function doplnText(sablona: string, data: Record<string, string | undefined>): string {
  return sablona
    .replace(/\{co\}/g, data.co ?? "")
    .replace(/\{kdo\}/g, data.kdo ?? "")
    .replace(/\{klub\}/g, data.klub ?? "")
    .replace(/\{soupeř\}/g, data.souper ?? "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Kolik lajků příspěvek dostane.
 *
 * Odvozeno od velikosti party a toho, jestli mluví z duše — souhlasný příspěvek
 * naštvané party sbírá víc než smířlivý. Číslo je ozdoba, ale nesmí být náhodné:
 * hráč podle něj čte, jak silně parta cítí.
 */
export function lajky(opts: { size: number; tone: PostTone; mood: number; roll: number }): number {
  const naladaSedi = opts.tone === "negativni" ? (100 - opts.mood) : opts.tone === "pozitivni" ? opts.mood : 50;
  const zaklad = Math.max(1, Math.round(opts.size * 0.12 * (naladaSedi / 60)));
  return Math.max(0, Math.round(zaklad * (0.6 + opts.roll * 0.8)));
}
