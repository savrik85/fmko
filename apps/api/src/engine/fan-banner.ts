/**
 * Co si kotel napíše na transparent.
 *
 * Text v sektoru dosud psal manažer. Když si ho ale píšou fanoušci, musí
 * odpovídat tomu, jak jim zrovna je: naštvaný kotel nenapíše „děkujeme".
 *
 * Bez AI schválně. Heslo na transparentu má být krátké, čitelné a hlavně
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

/**
 * Hesla podle taktiky.
 *
 * Kotel má názor na to, jak se hraje. Nakopávané a defenzivní pojetí mu vadí,
 * i když se vyhrává; presink a útočná hra ho baví.
 */
const TAKTIKA_HESLA: Record<string, { text: string; tone: Transparent["tone"]; duvod: string }> = {
  long_ball: { text: "NAKOPÁVAT UMÍ KAŽDÝ", tone: "vytka", duvod: "Kotel nesnáší nakopávaný fotbal." },
  defensive: { text: "HRAJEME NA REMÍZU?", tone: "vytka", duvod: "Kotel chce vidět, že tým jde dopředu." },
  possession: { text: "DRŽET MÍČ NESTAČÍ", tone: "vytka", duvod: "Držení míče bez gólů kotel nebaví." },
  pressing: { text: "TAKHLE SE TO HRAJE", tone: "podpora", duvod: "Presink se kotli líbí." },
  offensive: { text: "DOPŘEDU, NE DOZADU", tone: "podpora", duvod: "Útočná hra je přesně to, co kotel chce." },
};

/** Obecná podpora, když není důvod k ničemu vyhrocenějšímu. */
const PODPORA: readonly string[] = [
  "TADY JSME DOMA",
  "NAŠE BARVY, NAŠE VES",
  "VĚRNI ZŮSTANEME",
  "TADY SE NEVZDÁVÁ",
  "MY TU BUDEM VŽDYCKY",
  "JEDEN KLUB, JEDNA VES",
];

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

  // 1. Kampaň za odvolání trenéra. Nic silnějšího na transparentu není.
  if (s.kampanProtiTreneru) {
    return {
      text: prvniCoSeVejde([
        ...(pouzitelneJmeno(s.trener)
          ? [`${prijmeni(s.trener!).toUpperCase()} KONČI`, `${prijmeni(s.trener!).toUpperCase()} VEN`]
          : []),
        "TRENÉRE KONEC",
        "DOST BYLO",
      ]),
      duvod: "Běží podpisová akce za tvoje odvolání.",
      tone: "proti_treneru",
    };
  }

  // 2. Kampaň proti hráči.
  if (s.kampanProtiHraci) {
    return {
      text: prvniCoSeVejde([
        ...(pouzitelneJmeno(s.kampanProtiHraci)
          ? [`${prijmeni(s.kampanProtiHraci!).toUpperCase()} VEN`, `${prijmeni(s.kampanProtiHraci!).toUpperCase()}!`]
          : []),
        "DOST BYLO",
      ]),
      duvod: `Fanoušci sbírají podpisy proti hráči ${s.kampanProtiHraci}.`,
      tone: "proti_hraci",
    };
  }

  // 3. Vyhrocená rivalita. Na soupeře se nadává, i když se týmu daří.
  if (s.rival && s.rival.heat >= 60) {
    const nazev = s.rival.nazev.toUpperCase();
    const hesla = roll < 0.5
      ? [`${nazev} NIKDY`, `TADY NE, ${nazev}`, "TADY JSME DOMA MY"]
      : [`${nazev} DOMŮ`, `${nazev} SEM NELEZE`, "SEM NELEZTE"];
    return {
      text: prvniCoSeVejde(hesla),
      duvod: `S klubem ${s.rival.nazev} je to mezi tábory vyhrocené.`,
      tone: "proti_soupefi",
    };
  }

  // 4. Naštvanost na vedení, i bez kampaně.
  if (s.heatKotle >= 55 || s.naladaKotle <= 25) {
    const hesla = s.golyPoslednich5 <= 2
      ? ["TOHLE NENÍ FOTBAL", "ZA CO PLATÍME", "NULA GÓLŮ, NULA HRDOSTI"]
      : ["MY TADY JSME, VY NE", "VEDENÍ, MY TU BUDEM DÝL", "HANBA"];
    return { text: prvniCoSeVejde([vyber(hesla)]), duvod: "Kotel je na vedení naštvaný.", tone: "vytka" };
  }

  // 5. Série proher bolí i bez zloby na vedení.
  if (s.serie <= -3) {
    return {
      text: prvniCoSeVejde([vyber(["PADÁME, ALE JSME TU", "VĚRNI ZŮSTANEME", "V DEŠTI I V BLÁTĚ"])]),
      duvod: `Tým prohrál ${Math.abs(s.serie)} zápasy po sobě.`,
      tone: "vytka",
    };
  }

  // 6. Když se daří, kotel velebí. Trenéra jmenovitě jen při sérii výher.
  if (s.serie >= 3 && pouzitelneJmeno(s.trener)) {
    return {
      text: prvniCoSeVejde([
        `${prijmeni(s.trener!).toUpperCase()} JE JEDEN Z NÁS`,
        `${prijmeni(s.trener!).toUpperCase()} ZŮSTÁVÁ`,
        "TRENÉR JE NÁŠ",
      ]),
      duvod: `Tým vyhrál ${s.serie} zápasy po sobě a kotel to dává najevo.`,
      tone: "pro_trenera",
    };
  }

  // 7. Miláček kotle.
  if (pouzitelneJmeno(s.oblibenec) && s.naladaKotle >= 55 && roll > 0.5) {
    return {
      text: prvniCoSeVejde([
        `${prijmeni(s.oblibenec!).toUpperCase()} JE NÁŠ`,
        `JEDEN Z NÁS: ${prijmeni(s.oblibenec!).toUpperCase()}`,
        "JEDEN Z NÁS",
      ]),
      duvod: `${s.oblibenec} je miláček kotle.`,
      tone: "podpora",
    };
  }

  // 8. Názor na taktiku. Pozitivní jen když k tomu sedí i střelba.
  const tk = s.taktika ? TAKTIKA_HESLA[s.taktika] : undefined;
  if (tk && (tk.tone === "vytka" ? s.golyPoslednich5 <= 5 : s.naladaKotle >= 50)) {
    return { text: prvniCoSeVejde([tk.text]), duvod: tk.duvod, tone: tk.tone };
  }

  // 9. Nic nehoří, visí obyčejná podpora.
  return { text: prvniCoSeVejde([vyber(PODPORA)]), duvod: "Klid na stadionu, kotel prostě fandí.", tone: "podpora" };
}
