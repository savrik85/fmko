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

/** Transparent má sloupec na 22 znaků. Delší se nevejde do sektoru. */
export const MAX_DELKA_TRANSPARENTU = 22;

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
  offensive: { text: "DOPŘEDU A BEZ STRACHU", tone: "podpora", duvod: "Útočná hra je přesně to, co kotel chce." },
};

/** Obecná podpora, když není důvod k ničemu vyhrocenějšímu. */
const PODPORA: readonly string[] = [
  "DO TOHO, KLUCI",
  "SRDCE NA DRESU",
  "ZA VÁMI VŽDYCKY",
  "NAŠE BARVY",
  "TADY SE NEVZDÁVÁ",
];

/**
 * Vybere heslo. Pořadí je záměrné: co lidi pálí nejvíc, to visí na plachtě.
 *
 * `roll` je 0–1 z deterministického RNG, aby se stejný stav nezměnil sám od
 * sebe, ale dvě party se stejnou náladou nenapsaly totéž.
 */
export function vyberTransparent(s: StavProTransparent, roll: number): Transparent {
  const vyber = <T,>(z: readonly T[]): T => z[Math.floor(roll * z.length) % z.length];

  // 1. Kampaň za odvolání trenéra. Nic silnějšího na transparentu není.
  if (s.kampanProtiTreneru && s.trener) {
    return {
      text: prvniCoSeVejde([
        `${prijmeni(s.trener).toUpperCase()} KONČI`,
        `${prijmeni(s.trener).toUpperCase()} VEN`,
        "TRENÉRE, KONČI",
        "CHCEME ZMĚNU",
      ]),
      duvod: "Běží podpisová akce za tvoje odvolání.",
      tone: "proti_treneru",
    };
  }

  // 2. Kampaň proti hráči.
  if (s.kampanProtiHraci) {
    return {
      text: prvniCoSeVejde([
        `${prijmeni(s.kampanProtiHraci).toUpperCase()} VEN`,
        `${prijmeni(s.kampanProtiHraci).toUpperCase()}!`,
        "TAKHLE UŽ NE",
      ]),
      duvod: `Fanoušci sbírají podpisy proti hráči ${s.kampanProtiHraci}.`,
      tone: "proti_hraci",
    };
  }

  // 3. Vyhrocená rivalita. Na soupeře se nadává, i když se týmu daří.
  if (s.rival && s.rival.heat >= 60) {
    const nazev = s.rival.nazev.toUpperCase();
    const hesla = roll < 0.5
      ? [`${nazev} NIKDY`, `${nazev}, NE`, "TADY VYHRÁVÁME MY"]
      : [`${nazev} DOMŮ`, `${nazev}, NE`, "SEM NEPATŘÍTE"];
    return {
      text: prvniCoSeVejde(hesla),
      duvod: `S klubem ${s.rival.nazev} je to mezi tábory vyhrocené.`,
      tone: "proti_soupefi",
    };
  }

  // 4. Naštvanost na vedení, i bez kampaně.
  if (s.heatKotle >= 55 || s.naladaKotle <= 25) {
    const hesla = s.golyPoslednich5 <= 2
      ? ["CHCEME VIDĚT GÓLY", "TOHLE NENÍ FOTBAL", "ZA CO PLATÍME?"]
      : ["CHCEME VIDĚT SRDCE", "TOHLE NENÍ NAŠE LIGA", "VEDENÍ, PROBUĎ SE"];
    return { text: prvniCoSeVejde([vyber(hesla)]), duvod: "Kotel je na vedení naštvaný.", tone: "vytka" };
  }

  // 5. Série proher bolí i bez zloby na vedení.
  if (s.serie <= -3) {
    return {
      text: prvniCoSeVejde([vyber(["PADÁME, ALE JSME TU", "ZVEDNĚTE HLAVY", "NEKLESAT"])]),
      duvod: `Tým prohrál ${Math.abs(s.serie)} zápasy po sobě.`,
      tone: "vytka",
    };
  }

  // 6. Když se daří, kotel velebí. Trenéra jmenovitě jen při sérii výher.
  if (s.serie >= 3 && s.trener) {
    return {
      text: prvniCoSeVejde([
        `DÍKY, ${prijmeni(s.trener).toUpperCase()}`,
        `${prijmeni(s.trener).toUpperCase()}, DÍKY`,
        "DÍKY, TRENÉRE",
      ]),
      duvod: `Tým vyhrál ${s.serie} zápasy po sobě a kotel to dává najevo.`,
      tone: "pro_trenera",
    };
  }

  // 7. Miláček kotle.
  if (s.oblibenec && s.naladaKotle >= 55 && roll > 0.5) {
    return {
      text: prvniCoSeVejde([
        `${prijmeni(s.oblibenec).toUpperCase()}, JSI NÁŠ`,
        `${prijmeni(s.oblibenec).toUpperCase()} ❤`,
        "JEDEME ZA VÁMI",
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
