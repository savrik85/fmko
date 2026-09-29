/**
 * Co si kotel napíše na transparent.
 *
 * Text v sektoru dosud psal manažer. Když si ho ale píšou fanoušci, musí
 * odpovídat tomu, jak jim zrovna je: naštvaný kotel nenapíše „děkujeme".
 *
 * Bez AI schválně. Model to jednu dobu psal a vyvěšoval nesmysly se sponzory
 * a patvary („SPŮLE JE NAŠE KRVOU, SRDCEM, DUŠÍ“). Heslo má být krátké, čitelné a hlavně
 * PRAVDIVÉ vzhledem ke stavu part. Model by na to potřeboval celý stav klubu
 * v promptu a stejně by občas napsal něco, co neplatí. Takhle je každé heslo
 * vázané na konkrétní podmínku, dá se otestovat a nestojí nic.
 */

import type { FanGroupKind } from "./fan-groups";

/**
 * Nejdelší nápis na plachtu.
 *
 * Dvacet dva byl odhad. Plachta se v 3D kreslí na canvas 2048 px široký a
 * písmo se samo zmenšuje až na 40 px, takže se tam vejde přes sedmdesát znaků.
 * Čtyřicet bylo málo. Skutečné plachty bývají celá věta s oslovením a
 * protikladem („X, dělej tohle, ne tamto“) a ta se přes čtyřicítku nevejde.
 * Osmačtyřicet je hranice, kde je nápis z tribuny ještě čitelný: na obrázku
 * ve Zpravodaji na něj zbývá 30 px písma.
 */
export const MAX_DELKA_TRANSPARENTU = 48;

export interface StavProTransparent {
  /** Nálada kotle 0–100. Když kotel není, bere se nejvášnivější parta. */
  naladaKotle: number;
  /** Naštvanost na vedení 0–100. */
  heatKotle: number;
  /** Běží kampaň za odvolání trenéra? */
  kampanProtiTreneru: boolean;
  /** Jméno hráče, proti kterému běží kampaň. */
  kampanProtiHraci: string | null;
  /** Jméno miláčka kotle. */
  oblibenec: string | null;
  /** Příjmení trenéra pro oslovení. */
  trener: string | null;
  /** Nejžhavější rival a jeho teplota. */
  rival: { nazev: string; heat: number } | null;
  /** Série: kladné = výhry po sobě, záporné = prohry po sobě. */
  serie: number;
  /** Kolik gólů tým dal za posledních pět zápasů. */
  golyPoslednich5: number;
  /** Taktika, kterou tým hraje. */
  taktika: string | null;
  /** Druh party, která transparent věší. */
  kind: FanGroupKind;
  /** Obec klubu. Na plachtě jen v prvním pádě, jinak by se musela ohýbat. */
  obec?: string | null;
}

export interface Transparent {
  text: string;
  /** Proč zrovna tohle. Jde do UI, aby bylo poznat, že to není náhoda. */
  duvod: string;
  tone: "podpora" | "proti_soupefi" | "proti_treneru" | "pro_trenera" | "proti_hraci" | "vytka";
}

/**
 * První varianta, která se na plachtu vejde.
 *
 * Useknuté heslo („MARTIN NEJDLOUHĚJ…") je horší než žádné, takže se nikdy
 * nic neořezává: každá větev nabídne víc variant od nejkonkrétnější po
 * nejobecnější a vezme se první, co se do limitu vejde. Poslední varianta
 * v seznamu musí být bez jména, aby vždycky nějaká zbyla.
 */
export function prvniCoSeVejde(varianty: readonly string[]): string {
  for (const v of varianty) {
    const t = v.trim();
    if (t.length > 0 && t.length <= MAX_DELKA_TRANSPARENTU) return t;
  }
  // Sem se to nedostane, dokud má každá větev bezejmennou variantu. Kdyby ano,
  // je to chyba v katalogu a ať je vidět jako prázdná plachta, ne jako patvar.
  return "";
}

/** Příjmení z celého jména. Na transparent se křestní nepíše. */
export function prijmeni(jmeno: string): string {
  const casti = jmeno.trim().split(/\s+/);
  return casti[casti.length - 1] ?? jmeno;
}

/*
 * KATALOG HESEL
 *
 * Každé heslo vychází ze skutečného nápisu z českého nebo zahraničního kotle.
 * Zdroj je v komentáři, podrobnosti a odkazy v docs/plachty-inspirace/.
 * Nic tu není vymyšlené od stolu: hesla psaná od stolu (a dřív modelem)
 * nezněla jako kotel. Vulgarity jsou záměr, fanouškovský svět takový je.
 *
 * Jména (obec, rival, trenér, hráč) stojí VŽDY v prvním pádě. Skutečné kotle
 * to řeší stejně: rovnicí („BLŠANY = ČFL“), dvojtečkou nebo holým „X VEN“.
 */

/** Hesla podle taktiky. Kotel má názor na to, jak se hraje. */
const TAKTIKA_HESLA: Record<string, { text: string; tone: Transparent["tone"]; duvod: string }> = {
  long_ball: { text: "ŽÁDNÝ KECY, MAKAT!", tone: "vytka", duvod: "Kotel nesnáší nakopávaný fotbal." }, // Feyenoord „Geen woorden maar daden“
  defensive: { text: "DEJTE ASPOŇ JEDEN GÓL!", tone: "vytka", duvod: "Kotel chce vidět, že tým jde dopředu." }, // Ferro Carril Oeste „Hagan 1 gol“
  possession: { text: "FOTBAL NENÍ DIVADLO", tone: "vytka", duvod: "Držení míče bez gólů kotel nebaví." }, // Baník
  pressing: { text: "VLÍTNĚTE NA NĚ!", tone: "podpora", duvod: "Presink se kotli líbí." }, // Bohemians
  offensive: { text: "FOTBAL JE ŽIVEL!", tone: "podpora", duvod: "Útočná hra je přesně to, co kotel chce." }, // Baník
};

/** Klid na stadionu: domov, identita, sebeironie. */
const PODPORA: readonly string[] = [
  "TADY JSME DOMA", // Mladá Boleslav
  "KLUB JSME MY", // Widzew „Widzew to My“
  "NIC NECHCEM. UŽ TEĎ JSME HRDÍ!", // Optik Rathenow
  "ZNÁME JEN JEDEN KLUB A JEDNY BARVY", // Liberec
  "MY TADY ŽIJEM", // Dulwich Hamlet „We Live Here“
  "TOHLE HŘIŠTĚ JE NAŠE", // Dulwich Hamlet „This Meadow is Ours“
  "TO JE KOTEL", // Bohemians
  "FOTBAL NENÍ DIVADLO", // Baník
  "KLOBÁSA, NE KAVIÁR", // FC United „Pies not Prawns“
  "ŽÁDNÝ KECY, MAKAT!", // Feyenoord
  "NIKDO NÁS NEMÁ RÁD. A CO.", // Millwall
  "FOTBAL? NE, DÍKY. PIVO? JO, PROSÍM.", // Inter Bratislava
  "FANDÍME VE DNE, FANDÍME V NOCI", // Astra Krotoszyn
  "PÝCHA CELÝHO OKRESU", // Dulwich Hamlet „Pride of South London“
];

/** Klid s obcí. Obec v prvním pádě, věta se kolem ní neohýbá. */
const PODPORA_OBEC: ReadonlyArray<(obec: string) => string> = [
  (o) => `${o}, TO JSME MY`, // Dinamo Záhřeb „Dinamo – to smo mi“
  (o) => `${o} = DOMOV`, // Lok Lipsko „Heimatliebe“
  (o) => `${o} LEPŠÍ NEŽ PRÁCE`, // Bohemians „Bohemians lepší než práce“
];

/** Proti rivalovi. `r` = obec rivala v prvním pádě. */
const PROTI_RIVALOVI: ReadonlyArray<(r: string) => string> = [
  () => "VÍTEJTE V PEKLE!", // Slavia
  () => "TADY JSME DOMA. VY JSTE TURISTI.", // Espanyol „Welcome to Barcelona“
  () => "U VÁS NA HŘIŠTI SE DÁ TĚŽIT ROPA", // Colón na Unión
  () => "DNES HRAJEME DŘÍV, STIHNETE VEČERNÍČEK", // Slavia na Bohemians
  () => "MY MÁME ASFALT, VY POLE", // FC Remscheid „Straße statt Acker“
  () => "MY JSME HISTORIE, VY JEN ZEMĚPIS", // Roma „Roma è storia, Lazio solo geografia“
  () => "JSTE JAK MRAKY. ZMIZTE A BUDE HEZKY.", // Roma na Lazio
  (r) => `${r} = III. TŘÍDA`, // Opava na Fulnek „DRNOVICE = IV. A TŘÍDA“
  () => "TADY VLÁDNEM MY", // Unia Oświęcim „UNIA PANY“
  () => "NEJLEPŠÍ V OKRESE", // Bohemians „Nejlepší v Praze“
];

/** Kampaň za odvolání trenéra, bez jména. */
const PROTI_TRENERU: readonly string[] = [
  "STOP LŽÍM", // Bohemians
  "RADŠI BEZ TEBE NEŽ S TEBOU NAHOŘE. ČAU.", // Racing „Prefiero que te vayas…“
  "S TOUHLE VIZÍ HRAJEM ZA ROK III. TŘÍDU", // Feyenoord „Met deze visie…“
];

/** Naštvání na vedení, když tým góly dává. */
const PROTI_VEDENI: readonly string[] = [
  "VÝBOR VEN!", // Partizan „Uprava napolje“, Dulwich „MEADOW OUT“
  "PŘED VOLBAMI SLIBY, PO VOLBÁCH VÝSMĚCH!", // Baník
  "RADŠI KELÍMKY NA TRÁVNÍKU NEŽ LEMRY VE VÝBORU", // Preußen Münster
  "S KLUKAMA V DOBRÝM I ZLÝM. BEZ VÝBORU.", // 1. FC Köln
  "KLUB ANO, VÝBOR NE", // Man Utd „Love United Hate Glazer“
  "MOC SLIBŮ, MOC DLUHŮ", // Fiorentina
  "PROBLÉMY SI DĚLÁTE SAMI", // Sparta
  "KDO LŽE, TEN KRADE!", // Baník, Bohemians
  "PŘESTAŇTE NÁM NIČIT KLUB!", // Legia
  "NE KVŮLI VÝBORU. KVŮLI BARVÁM.", // Biagio Nazzaro „solo per i colori“
  "ONI SI TO KOUPILI. MY JSME SI TO POSTAVILI.", // Darmstadt proti Hoffenheimu
  "FOTBAL BEZ LIDÍ JE K NIČEMU", // Mönchengladbach
];

/** Naštvání, když se nestřílí góly. */
const BEZ_GOLU: readonly string[] = [
  "DEJTE ASPOŇ JEDEN GÓL!", // Ferro Carril Oeste „Hagan 1 gol“
  "FOTBAL NENÍ DIVADLO", // Baník
  "VĚRNÍ, ALE NASRANÍ", // Bohemians
];

/** Série proher: věrnost v těžkých časech. */
const SERIE_PROHER: readonly string[] = [
  "VĚRNÍ, ALE NASRANÍ", // Bohemians
  "V DOBRÝM I VE ZLÝM", // Legia, Ruch Chorzów
  "NIKDY TO NEVZDÁME", // Heracles Almelo
  "NEPOLEVÍME, BOJUJEM DÁL!", // Baník
  "MY JSME TU VŽDYCKY. AŤ HRAJETE JAK HRAJETE.", // Odra Wodzisław
  "BOJ O ZÁCHRANU ZAČAL", // Bohemians
  "ŽÁDNÝ VÝMLUVY. VYHRÁT!", // Bochum
  "NECHTE TAM DUŠI!", // Bochum
];

/** Série výher. */
const SERIE_VYHER: readonly string[] = [
  "SAKRA, MY POSTOUPÍME!", // Union Berlín „Scheiße, wir steigen auf!“
  "LIGA JE NAŠE", // Zbrojovka
  "JDEM SI PRO POSTUP", // Jastrząb Bielszowice „LECIMY PO AWANS“
  "KOTEL VÁM DÁ KŘÍDLA", // Bohemians
];

/** Varianty s obcí, když ji známe, jinak jen obecná hesla. */
function podporaKlubu(obec: string | null | undefined): string[] {
  const o = obec && obec.trim().length >= 2 ? obec.trim().toUpperCase() : null;
  return [...(o ? PODPORA_OBEC.map((f) => f(o)) : []), ...PODPORA]
    .filter((t) => t.length <= MAX_DELKA_TRANSPARENTU);
}

/**
 * Vybere heslo. Pořadí je záměrné: co lidi pálí nejvíc, to visí na plachtě.
 *
 * `roll` je 0–1 z deterministického RNG, aby se stejný stav nezměnil sám od
 * sebe, ale dvě party se stejnou náladou nenapsaly totéž.
 */
/**
 * Dá se to jméno vyvěsit?
 *
 * Testovací účty mívají trenéra „A A" a plachta „DÍKY, A" vypadá jako rozbitý
 * text, ne jako vtip. Pod tři znaky se jméno na plachtu nedává a použije se
 * bezejmenná varianta.
 */
export function pouzitelneJmeno(jmeno: string | null): boolean {
  return !!jmeno && prijmeni(jmeno).length >= 3;
}

export function vyberTransparent(s: StavProTransparent, roll: number): Transparent {
  const vyber = <T,>(z: readonly T[]): T => z[Math.floor(roll * z.length) % z.length];
  const velke = (jmeno: string) => prijmeni(jmeno).toUpperCase();

  // 1. Kampaň za odvolání trenéra. Nic silnějšího na transparentu není.
  //    Se jménem vždy „X VEN!“ (Bohemians „PELTA VEN“), jinak z katalogu.
  if (s.kampanProtiTreneru) {
    return {
      text: pouzitelneJmeno(s.trener) ? `${velke(s.trener!)} VEN!` : vyber(PROTI_TRENERU),
      duvod: "Běží podpisová akce za tvoje odvolání.",
      tone: "proti_treneru",
    };
  }

  // 2. Kampaň proti hráči.
  if (s.kampanProtiHraci) {
    return {
      text: pouzitelneJmeno(s.kampanProtiHraci) ? `${velke(s.kampanProtiHraci)} VEN!` : "DOST BYLO", // Liverpool „Enough is enough“
      duvod: `Fanoušci sbírají podpisy proti hráči ${s.kampanProtiHraci}.`,
      tone: "proti_hraci",
    };
  }

  // 3. Vyhrocená rivalita. Na soupeře se nadává, i když se týmu daří.
  if (s.rival && s.rival.heat >= 60) {
    return {
      text: prvniCoSeVejde([vyber(PROTI_RIVALOVI)(s.rival.nazev.toUpperCase()), "VÍTEJTE V PEKLE!"]),
      duvod: `S klubem ${s.rival.nazev} je to mezi tábory vyhrocené.`,
      tone: "proti_soupefi",
    };
  }

  // 4. Naštvanost na vedení, i bez kampaně. Když se nestřílí, jde to na góly.
  if (s.heatKotle >= 55 || s.naladaKotle <= 25) {
    const hesla = s.golyPoslednich5 <= 2 ? BEZ_GOLU : PROTI_VEDENI;
    return { text: prvniCoSeVejde([vyber(hesla), "VÝBOR VEN!"]), duvod: "Kotel je na vedení naštvaný.", tone: "vytka" };
  }

  // 5. Série proher bolí i bez zloby na vedení.
  if (s.serie <= -3) {
    return {
      text: prvniCoSeVejde([vyber(SERIE_PROHER), "V DOBRÝM I VE ZLÝM"]),
      duvod: `Tým prohrál ${Math.abs(s.serie)} zápasy po sobě.`,
      tone: "vytka",
    };
  }

  // 6. Když se daří, kotel to dává najevo. Trenér se jménem jen někdy.
  if (s.serie >= 3 && pouzitelneJmeno(s.trener)) {
    const hesla = [`${velke(s.trener!)} ZŮSTÁVÁ`, ...SERIE_VYHER];
    return {
      text: prvniCoSeVejde([vyber(hesla), "LIGA JE NAŠE"]),
      duvod: `Tým vyhrál ${s.serie} zápasy po sobě a kotel to dává najevo.`,
      tone: "pro_trenera",
    };
  }

  // 7. Miláček kotle. Jméno a dovětek, jako vlajky pro hráče (Dulwich, Plzeň).
  if (pouzitelneJmeno(s.oblibenec) && s.naladaKotle >= 55 && roll > 0.5) {
    const p = velke(s.oblibenec!);
    return {
      text: prvniCoSeVejde([roll > 0.75 ? `${p}. NÁŠ KLUK.` : `${p}: JEDEN Z NÁS`, "JEDEN Z NÁS"]),
      duvod: `${s.oblibenec} je miláček kotle.`,
      tone: "podpora",
    };
  }

  // 8. Názor na taktiku. Pozitivní jen když k tomu sedí i nálada.
  const tk = s.taktika ? TAKTIKA_HESLA[s.taktika] : undefined;
  if (tk && (tk.tone === "vytka" ? s.golyPoslednich5 <= 5 : s.naladaKotle >= 50)) {
    return { text: prvniCoSeVejde([tk.text]), duvod: tk.duvod, tone: tk.tone };
  }

  // 9. Nic nehoří, visí obyčejná podpora.
  return { text: prvniCoSeVejde([vyber(podporaKlubu(s.obec)), "TADY JSME DOMA"]), duvod: "Klid na stadionu, kotel prostě fandí.", tone: "podpora" };
}

/**
 * Všechna hesla, která katalog pro daný stav umí vyvěsit.
 *
 * Podle toho se pozná plachta, kterou kdysi napsal model: v katalogu není,
 * a tak jde dolů, i když se důvod nezměnil. Losovací `roll` se projde celý,
 * aby byla vidět každá varianta každé větve.
 */
export function mozneTransparenty(s: StavProTransparent): string[] {
  const out = new Set<string>();
  for (let i = 0; i < 200; i++) out.add(vyberTransparent(s, i / 200).text);
  return [...out];
}
