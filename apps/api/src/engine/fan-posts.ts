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
 *
 * Každý blok drží aspoň pět vět. K jedné věci se ozvou dvě party a stav klubu
 * trvá i týden, takže ze dvou variant vznikaly na zdi dvojníci.
 */
export const PRISPEVKY_K_UDALOSTEM: Partial<Record<ClubEventKind, PostSablona[]>> = {
  prodej_opory: [
    { tone: "negativni", party: ["kotel", "parta_z_okoli"], texty: [
      "Takže {co} je pryč. Gratuluju vedení, tohle byl fakt tah. 🤡",
      "{co} se prodává uprostřed sezóny. Za koho nás mají?",
      "{co} odchází a my se máme tvářit, že je to plán.",
      "Někdo mi vysvětlete, jak nám tenhle odchod pomůže. {co} byl jistota. Počkám.",
      "{co} pryč. Za ty peníze si vedení koupí klid, my ne.",
      "{co} je prodaný. Příště rovnou celá kabina, ať to má rychlý spád.",
    ] },
    { tone: "negativni", party: ["stamgasti", "pametnici"], texty: [
      "{co} odchází. Škoda, takoví se hned tak nenajdou.",
      "{co} si odnesl kus mužstva. Doufám, že ty peníze někam dají.",
      "{co} byl pro tenhle klub víc než jméno v sestavě.",
      "{co} byl ten rozdíl. Bude to jiné, snad ne horší.",
      "Chápu, že klub peníze potřebuje. Ale na tu sestavu se bude koukat blbě.",
    ] },
  ],
  odchod_legendy: [
    { tone: "negativni", texty: [
      "{co} končí. Nebudu psát nic dalšího, nemám co.",
      "{co} dneska odešel. Tomu se nedá říkat přestup, tomu se říká konec éry.",
      "{co} pověsil kopačky na hřebík. Kdo ho nezažil, nepochopí.",
      "{co} odchází a bere si s sebou kus historie. Díky za všechno.",
      "{co}. Na tuhle větu čekal celý okres a nikdo ji slyšet nechtěl.",
    ] },
  ],
  posila: [
    { tone: "pozitivni", texty: [
      "{co} v našem dresu. No konečně něco. 💪",
      "{co} bere naše barvy. Tak ať to ukáže.",
      "{co} prý podepsal. Uvidíme v neděli.",
      "{co} je tady. Slibovat umí každý, hraje se od výkopu.",
      "{co} u nás. Kdo ho viděl hrát, ať napíše, jestli se máme těšit.",
      "{co} podepsal. Vedení aspoň jednou udělalo, co se čekalo.",
    ] },
  ],
  propusteni: [
    { tone: "neutralni", texty: [
      "{co} v kádru končí. Nikoho to snad nepřekvapilo.",
      "{co} jde pryč. Přeju mu, ať se chytne jinde.",
      "{co} skončil. Chvíli to trvalo, ale stalo se.",
      "{co} u nás končí. Bez zloby, prostě to nesedlo.",
      "{co} má padáka. Kabina bude vědět nejlíp, jestli právem.",
    ] },
  ],
  zdrazeni_vstupneho: [
    { tone: "negativni", texty: [
      "{co} za vstup. Za tenhle fotbal. Vážně?",
      "Zdražili. Dobrý, tak si to zaplatím, ale ať to vidím.",
      "Nejdřív výkony, pak ceny. Ne naopak.",
      "{co}. Za ty peníze čekám aspoň, že se bude makat.",
      "Vstupné nahoru, tabulka dolů. Hezká kombinace.",
      "Zdražení beru, když za to něco bude. Zatím nevidím co.",
    ] },
  ],
  zlevneni_vstupneho: [
    { tone: "pozitivni", texty: [
      "Slevnili vstup. To se cení, přivedu kluky z práce.",
      "{co}, za to se dá jít i na horší zápas. Dobrý krok.",
      "Levnější vstup. Konečně krok k lidem.",
      "{co}. Vezmu kluka i souseda, za tohle se to vyplatí.",
      "Díky za slevu. Na tribuně nás bude víc, to je jistý.",
    ] },
  ],
  prejmenovani_klubu: [
    { tone: "negativni", party: ["pametnici", "kotel"], texty: [
      "{co}. Můj děda by to jméno nevyslovil.",
      "Padesát let jsme byli jedno jméno. Teď jsme reklama.",
      "{co}. Na dres si to nalepím, do srdce ne.",
      "Přejmenovat si to můžete jak chcete, v hospodě se tomu bude říkat po starém.",
      "{co}. Ptal se někdo lidí, co sem chodí?",
      "Nové jméno, staré problémy.",
    ] },
  ],
  prejmenovani_stadionu: [
    { tone: "negativni", party: ["pametnici", "stamgasti"], texty: [
      "{co}. Pro mě to bude pořád hřiště.",
      "Přejmenovali nám hřiště. Budu tam chodit stejně, ale říkat to nebudu.",
      "{co}. Ať na bráně visí co chce, doma je doma.",
      "Nový název hřiště. Trávník z toho lepší nebude.",
      "{co}. Snad z toho aspoň budou nové lavičky.",
    ] },
  ],
  vyrazeni_z_poharu: [
    { tone: "negativni", texty: [
      "Konec v poháru. Aspoň se soustředíme na ligu, no.",
      "Vypadli jsme. Zase.",
      "Tohle byla šance a je pryč.",
      "Pohár skončil. Bylo to hezké, dokud to trvalo.",
      "Konec. Nikdo nečekal zázrak, ale tohle bolí.",
      "Pohár je pryč. Zbývá tabulka, a ta nevypadá o moc líp.",
    ] },
  ],
  postup_v_poharu: [
    { tone: "pozitivni", texty: [
      "Postup! Na tohle se čekalo. 🔥",
      "Jdeme dál! Kdo přijede příště?",
      "Pohár nás baví. Konečně něco, na co se jezdí.",
      "Postoupili jsme. Ať si nás los nešetří.",
      "Další kolo! Beru si volno a jedu.",
      "Tohle je ta sezóna, kdy pohár dojedeme dál než obvykle. Věřím tomu.",
    ] },
  ],
  serie_vyher: [
    { tone: "pozitivni", texty: [
      "Tohle už není náhoda. Klobouk dolů. 🟢",
      "Nepamatuju, kdy jsme naposledy takhle jeli. Užívám si to.",
      "Trenér to dal dohromady. Uznávám.",
      "Vyhrává se. Nechci to zakřiknout, ale do tabulky koukám každý den.",
      "Takhle to má vypadat. Jen ať to vydrží do jara.",
      "Kdo tvrdil, že na to nemáme, ať se ozve teď.",
    ] },
  ],
  serie_proher: [
    { tone: "negativni", texty: [
      "Kolikátá už to je? Přestal jsem počítat.",
      "Chodím tam pořád, ale baví mě to čím dál míň.",
      "Někdo za to musí vzít zodpovědnost.",
      "Takhle se to dál nedá. Tečka.",
      "Chodím sem roky a tohle je nejhorší, co pamatuju.",
      "Prohra za prohrou. Na tribuně to už nikdo nekomentuje, jen se odchází.",
    ] },
  ],
  rozhovor_kritika: [
    { tone: "negativni", party: ["kotel", "stamgasti"], texty: [
      "Prát špinavé prádlo v novinách. Skvělý nápad. 🙄",
      "Kluci si to přečtou taky, trenére.",
      "Tohle se řeší v kabině, ne přes noviny.",
      "Trenér to řekl nahlas. Odvaha to je, chytré to není.",
      "Po takovém rozhovoru se mužstvo nezvedne. Spíš naopak.",
    ] },
    { tone: "pozitivni", party: ["pametnici"], texty: [
      "Aspoň někdo řekl nahlas, jak to je.",
      "Konečně rovná řeč. Dlouho jsem na ni čekal.",
      "Trenér má pravdu a ví to i ten, koho to pálí.",
      "Radši drsná pravda než další vymluvená prohra.",
    ] },
  ],
  rozhovor_obhajoba: [
    { tone: "pozitivni", texty: [
      "Postavil se za mužstvo. Tak se to dělá. 👏",
      "Trenér drží s klukama. To si zapamatují.",
      "Když to schytává trenér a ne hráči, kabina to pozná.",
      "Za tohle si trenér koupil kabinu na celý podzim.",
      "Vzal to na sebe. Slušné.",
      "Konečně někdo, kdo hráče nehází přes palubu po první prohře.",
    ] },
  ],
  vylepseni_kotle: [
    { tone: "pozitivni", party: ["kotel", "parta_z_okoli"], texty: [
      "Nový sektor! Konečně je kam postavit bubny. 🥁",
      "Tohle vedení nemuselo. Uznávám a děkuju.",
      "Kotel dostal, co potřeboval. Bude to slyšet.",
      "Konečně se něco udělalo pro lidi, co chodí za každého počasí.",
      "Od příštího zápasu to bude jiná.",
    ] },
  ],
};

/** Reakce na výtržnost — píše se o nich, i když je způsobil někdo jiný. */
export const PRISPEVKY_K_VYTRZNOSTEM: Record<string, PostSablona[]> = {
  pyro: [
    { tone: "pozitivni", party: ["kotel"], texty: [
      "Bylo to vidět až do vsi. 🔥",
      "Za tohle se platí, ale stálo to za to.",
      "Kdo tam nebyl, ať nekecá. Vypadalo to skvěle.",
      "Fotky kolují po celém okrese. O to šlo.",
      "Pokuta přijde, vzpomínka zůstane.",
    ] },
    { tone: "negativni", party: ["rodiny", "pametnici"], texty: [
      "Zase ten dým. Beru sem vnoučata, ne na demonstraci.",
      "Chápu, že je to hezké. Nechápu, proč to platíme všichni.",
      "Půl hodiny jsem neviděl na hřiště. Díky, kluci.",
      "Malá kašlala až domů. Pro mě za mě ať si to zapálí za vsí.",
      "Hezké to bylo. Účet za to hezký nebude.",
    ] },
  ],
  bitka_kotle: [
    { tone: "negativni", party: ["rodiny", "pametnici", "stamgasti"], texty: [
      "Rvačka u plotu. Fakt jsme si tohle přáli?",
      "Přerušený zápas kvůli partě idiotů. Gratuluju.",
      "S dětma jsme odešli o půli. Díky, kluci.",
      "Kvůli deseti lidem bude mít ostudu celý klub.",
      "Tohle už není fotbal. To je hospodská rvačka s tribunou.",
    ] },
    { tone: "neutralni", party: ["kotel"], texty: [
      "Nezačali jsme to my. Tečka.",
      "Kdo přijede dělat bordel k nám, ať počítá s tím, co přijde.",
      "Bránili jsme svoje. Na to se nikdo ptát nebude.",
      "Ať si napíšou, co chtějí. My víme, jak to bylo.",
      "Nikdo z nás si to nevymyslel. Přijeli hotoví.",
    ] },
  ],
  vniknuti: [
    { tone: "negativni", texty: [
      "Někdo na hřišti během zápasu. To je vrchol.",
      "Tohle nás bude stát peníze, co měly jít na kabiny.",
      "Vyběhnout na plac. Kdo to vymyslel?",
      "Za tohle zavřou sektor a bude ticho po pěšině.",
      "Deset vteřin slávy a pokuta pro celý klub.",
    ] },
  ],
  hazeni: [
    { tone: "negativni", texty: [
      "Házet po hřišti kelímky. Sedm let a rozum žádný.",
      "Za tohle přijde pokuta a zaplatíme ji všichni.",
      "Kdo po někom hází, ať na fotbal nechodí.",
      "Trefit sudího kelímkem není odvaha, to je blbost.",
      "Jednou to někoho trefí do oka a bude po legraci.",
    ] },
  ],
  pokriky: [
    { tone: "negativni", party: ["rodiny", "pametnici"], texty: [
      "To, co se dneska ozývalo, do fotbalu nepatří.",
      "Musím dceři vysvětlovat, co to křičeli. Díky.",
      "Řvát se dá i bez tohohle.",
      "Slyšel to celý stadion a nikdo se neozval. To je to horší.",
      "Za tohle se bude klub omlouvat a my se budeme stydět.",
    ] },
  ],
  skoda: [
    { tone: "negativni", texty: [
      "{co} v troskách. Kdo to zaplatí? My. 🧾",
      "Rozbít vlastní stadion. Geniální.",
      "Za peníze na opravu mohla být půlka nového plotu.",
      "{co} je na odpis. Chodí se sem na fotbal, ne bourat.",
      "Opravovat to budou dobrovolníci. Ti, co to rozbili, mezi nimi nebudou.",
    ] },
  ],
  vyhrozovani: [
    { tone: "negativni", party: ["pametnici", "rodiny"], texty: [
      "Čekat na sudího u kabin je zbabělost.",
      "Za tohle nás bude nenávidět celý okres.",
      "Pískal blbě. To se řeší zápisem, ne u kabin.",
      "Až k nám nikdo nepřijede pískat, budeme vědět proč.",
      "Tohle přejde do papírů a klub si to odnese.",
    ] },
  ],
};

/** Kolem zápasu — výsledek zná každý, jde o to, jak ho kdo vezme. */
export const PRISPEVKY_K_ZAPASU: Record<"vyhra" | "remiza" | "prohra" | "debakl", PostSablona[]> = {
  vyhra: [
    { tone: "pozitivni", texty: [
      "Bereme! 🟢 {co}",
      "{co} a jde se na pivo.",
      "Takhle si to představuju. {co}",
      "{co}. Tři body a klid v duši.",
      "Konečně zápas, po kterém se dobře spí. {co}",
      "{co}. Zaslouženě, ať si kdo chce říká co chce.",
      "Za tohle se chodí na fotbal. {co}",
    ] },
  ],
  remiza: [
    { tone: "neutralni", texty: [
      "{co}. Bod dobrý, dva by byly lepší.",
      "Remíza. Z toho se nikdo neposadí.",
      "{co}. Mohlo to být lepší, mohlo to být horší.",
      "Bod bereme, ale doma se má vyhrávat. {co}",
      "{co}. Zase to samé: vedeme a neudržíme to.",
      "Nerozhodně. Za tohle nikdo tleskat nebude.",
    ] },
  ],
  prohra: [
    { tone: "negativni", texty: [
      "{co}. Nemám slov.",
      "Zase nic. {co}",
      "{co}, a to jsme tam měli jet vyhrát.",
      "{co}. Kolikrát ještě?",
      "Prohra jako řemen. {co}",
      "{co}. Chce to změnu, jinak to bude ještě horší.",
      "Jel jsem tam zbytečně. {co}",
    ] },
  ],
  debakl: [
    { tone: "negativni", texty: [
      "{co}. Tohle byla ostuda, ne zápas.",
      "Po {co} bych se na jejich místě styděl do dresu obléct.",
      "{co}. Odešel jsem o půli a nelituju.",
      "Takhle vysoko jsme neprohráli roky. {co}",
      "{co}. Nikdo se ani nesnažil. To bolí nejvíc.",
      "Za {co} se omluvit nestačí.",
    ] },
  ],
};

/** Když se mění miláček nebo otloukánek. */
export const PRISPEVKY_K_OBLIBENCUM: Record<"oblibenec" | "otloukanek", PostSablona[]> = {
  oblibenec: [
    { tone: "pozitivni", texty: [
      "{kdo} je novej šéf. {co}",
      "{kdo}. Tohle jméno chci mít na zádech dresu. {co}",
      "{kdo}. Konečně někdo, za koho se dá řvát.",
      "{kdo} si tribunu koupil. {co}",
      "{kdo}. Za toho dám ruku do ohně.",
      "{kdo}. Kdyby takhle makali všichni, jsme nahoře.",
    ] },
  ],
  otloukanek: [
    { tone: "negativni", texty: [
      "{kdo}. {co}",
      "Nechci nikoho jmenovat, ale {kdo}. {co}",
      "{kdo} zase. {co}",
      "{kdo}. Takhle dál ne. {co}",
      "{kdo}. Ať se chytne, nebo ať to přenechá jinému.",
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
      "Dvacet nákopů a jeden vyhraný souboj. Skvělá taktika.",
      "Nejlepším hráčem zápasu byl vítr.",
      "Kopat to dopředu umí každý. Fotbal je něco jiného.",
    ] },
    { tone: "neutralni", party: ["stamgasti", "pametnici"], texty: [
      "Hezké to není, ale body to nosí. Zatím.",
      "Na tenhle trávník je to možná jediná cesta.",
      "Krása to není. Vyhrát se tak ale dá.",
      "Hlavně ať to funguje. Na koukání to bude horší.",
    ] },
  ],
  defensive: [
    { tone: "negativni", party: ["kotel"], texty: [
      "Deset lidí vzadu a čekat. Tomuhle fandit nejde.",
      "Hrajeme doma. DOMA. A bráníme.",
      "Bránit se dá i s jedním útočníkem vepředu.",
      "Bod z nuly. Chápu to, bavit mě to nebude.",
      "Zalezli jsme od první minuty. Proti komu?",
    ] },
  ],
  possession: [
    { tone: "neutralni", texty: [
      "Držíme balon, dobře. A kdy vystřelíme?",
      "Sedmdesát procent držení a nula na tabuli. Super.",
      "Přihrávky dozadu se do statistik počítají taky, koukám.",
      "Pěkně to kolujeme. Škoda, že před vápnem to končí.",
      "Držení balonu body nedává.",
    ] },
  ],
  pressing: [
    { tone: "pozitivni", party: ["kotel", "parta_z_okoli"], texty: [
      "Takhle! Vysoko, nahoru, nedat jim dýchnout. 🔥",
      "Tohle se dá fandit. Konečně.",
      "Presink celý zápas. Kondice tam je, to se musí nechat.",
      "Nedali jim vydechnout. Takhle chci koukat každý týden.",
      "Když se takhle maká, odpustí se i prohra.",
    ] },
  ],
  offensive: [
    { tone: "pozitivni", texty: [
      "Jdeme si pro to. Přesně tak to má být.",
      "Útočíme. Klidně to prohrajeme, ale takhle.",
      "Dopředu a ať to má šťávu. Na to lidi chodí.",
      "Riskujeme, ale aspoň se něco děje.",
      "Za tohle se platí vstupné.",
    ] },
  ],
};

/** Kolik toho tým dává. Střelecká bída i smršť stojí za zmínku. */
export const PRISPEVKY_KE_STRELBE: Record<"bida" | "sucho" | "smrst", PostSablona[]> = {
  bida: [
    { tone: "negativni", texty: [
      "{co} za pět zápasů. Pět. Zápasů.",
      "Kdybychom dávali góly, byli bychom nahoře. Jenže je nedáváme.",
      "Někdo by měl klukům ukázat, kde je branka.",
      "{co}. To dá střelec za jeden zápas.",
      "Šance jsou, góly ne. Pořád dokola.",
      "Potřebujeme útočníka. To ví celá ves, jen vedení ne.",
    ] },
  ],
  sucho: [
    { tone: "negativni", party: ["kotel", "stamgasti"], texty: [
      "Zase nula. Doma. 😤",
      "Gól jsem naposled viděl v televizi.",
      "Nula. Zase. Aspoň gólman má klid.",
      "Kdo dá příští gól, tomu platím rundu.",
      "Bez gólu se vyhrát nedá. Tohle vysvětlovat nemusím.",
    ] },
  ],
  smrst: [
    { tone: "pozitivni", texty: [
      "{co} za pět zápasů! Tohle se sleduje samo. ⚽",
      "Útok nám šlape. Konečně je na co koukat.",
      "{co}. Kdo tvrdil, že neumíme dát gól?",
      "Takhle to má vypadat. Dopředu a bez brzdy.",
      "Na tenhle útok se jezdí i z okolních vsí.",
      "{co} za pět zápasů. To se hned tak nevidí.",
    ] },
  ],
};

/** Když se rozhoří rivalita. */
export const PRISPEVKY_K_RIVALITE: PostSablona[] = [
  { tone: "negativni", texty: [
    "S {soupeř} máme nevyřízené účty. Příště se uvidíme. 👀",
    "{soupeř}. Tohle se nezapomíná.",
    "Na zápas s {soupeř} se těším víc než na cokoli jinýho.",
    "{soupeř} si to od nás odnese. Dřív nebo později.",
    "Kdo byl na tom zápase, ví, proč {soupeř} nesnáší celý okres.",
    "{soupeř}. Datum odvety mám zakroužkované.",
  ] },
];

/**
 * „1 gól", „3 góly", „12 gólů".
 *
 * Šablony si číslo nesmějí lepit ke slovu samy, jinak z nich leze „3 gólů".
 */
export function goluTvar(n: number): string {
  if (n === 1) return "1 gól";
  return n < 5 ? `${n} góly` : `${n} gólů`;
}

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
 * Text, který na zdi ještě nevisí.
 *
 * K jedné věci se vyjadřují dvě party ze stejného poolu a stav klubu se ze dne
 * na den nemění, takže bez tohohle čte fanoušek tutéž větu dvakrát pod jiným
 * jménem. Když jsou všechny varianty vyčerpané, vrací `null`: mlčení je lepší
 * než třetí kopie.
 *
 * Idempotenci to neohrozí. Opakovaný běh sice sáhne po jiné variantě, ale
 * `INSERT OR IGNORE` na `reference_id` ji stejně zahodí.
 */
export function vyberText(
  texty: readonly string[],
  data: Record<string, string | undefined>,
  pouzite: ReadonlySet<string>,
  roll: number,
): string | null {
  const start = Math.floor(roll * texty.length);
  for (let i = 0; i < texty.length; i++) {
    const t = doplnText(texty[(start + i) % texty.length], data);
    if (t && !pouzite.has(t)) return t;
  }
  return null;
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
