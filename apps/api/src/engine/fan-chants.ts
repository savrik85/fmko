/**
 * Chorály, které si fanoušci vymyslí sami.
 *
 * Chorál není hláška na jedno použití. Vzniká z konkrétního důvodu, zpívá se,
 * dokud ten důvod platí, a pak se na něj zapomene. Proto má sílu, datum vzniku
 * a stav: „zpívá se od podzimu" je něco jiného než „někdo to jednou zakřičel".
 *
 * Bez AI. Text musí sedět na stav klubu a jít zazpívat, což se dá zaručit jen
 * šablonou vázanou na konkrétní podmínku. Model by navíc u chorálů, které mají
 * být hrubé, buď uhnul, nebo přestřelil.
 *
 * Bez DB, aby to šlo testovat.
 */

import type { FanGroupKind } from "./fan-groups";

/** Na co chorál je. Na jeden druh jeden chorál, jinak by se dělila pozornost. */
export type ChantKind =
  | "domov"
  | "oblibenec" | "rival" | "trener_pro" | "trener_proti" | "vyhra" | "vzdor" | "vybaveni";

export interface ChantStav {
  /** Miláček kotle, příjmením. */
  oblibenec: string | null;
  /** Nejžhavější rival a teplota. */
  rival: { nazev: string; heat: number } | null;
  trener: string | null;
  /** Běží podpisovka za odvolání trenéra? */
  kampanProtiTreneru: boolean;
  /** Série: kladné výhry po sobě, záporné prohry. */
  serie: number;
  /** Nálada a naštvanost kotle. */
  nalada: number;
  heat: number;
  /** Nejhorší věc na stadionu, na kterou si stěžují. Prázdné = nic nevadí. */
  stiznostNaVybaveni: string | null;
  /** Název klubu do textů. */
  klub: string;
}

export interface NovyChorál {
  kind: ChantKind;
  text: string;
  duvod: string;
  /** Počáteční síla 0–100. Silnější důvod = hlasitější chorál. */
  sila: number;
}

/** Příjmení: na tribuně se křestní nekřičí. */
function prijmeni(jmeno: string): string {
  const c = jmeno.trim().split(/\s+/);
  return c[c.length - 1] ?? jmeno;
}

/**
 * Dá se to jméno vůbec skandovat?
 *
 * Testovací účty mívají trenéra „A A“ a chorál „A JE JEDEN Z NÁS!“ vypadá jako
 * rozbitý text, ne jako vtip. Pod tři znaky se jméno do chorálu nedává.
 */
function skandovatelne(jmeno: string | null): boolean {
  return !!jmeno && prijmeni(jmeno).length >= 3;
}

/**
 * Co si dnes vymysleli.
 *
 * Vrací všechny chorály, které z dnešního stavu dávají smysl. Volající je
 * porovná s tím, co se už zpívá, a rozdíl založí. Nevrací nic, když se nic
 * neděje: mlčící kotel je taky výsledek.
 */
export function vymysliChoraly(s: ChantStav, roll: number): NovyChorál[] {
  const out: NovyChorál[] = [];
  const vyber = <T,>(z: readonly T[]): T => z[Math.floor(roll * z.length) % z.length];

  if (skandovatelne(s.oblibenec)) {
    const p = prijmeni(s.oblibenec!).toUpperCase();
    out.push({
      kind: "oblibenec",
      // Jména se schválně neskloňují. „Kdo nemá rád Kolman" je patvar a
      // spolehlivě ohnout česká příjmení (Vlček → Vlčka, Petrášek → Petráška)
      // bez morfologie nejde. Šablony proto drží jméno v prvním pádě.
      text: vyber([
        `${p}, ${p}, ty jsi náš!`,
        `Jedno jméno, jeden král: ${p}!`,
        `${p}! ${p}! ${p}!`,
        `Hej, hej, ${p}, hej, hej!`,
        `Za ${p} dáme všechno, hej!`,
        `Kdo to válí? ${p}! Kdo to válí? ${p}!`,
        `${p} je náš, ${p} je náš, hej!`,
        `Ó ó ó, ${p}, ó ó ó!`,
        `Máme ${p}, vy máte prd!`,
        `${p} na hřišti, my na nohou!`,
        `Ale ale ale, ${p} dál a dál!`,
        `Náš chlap se jmenuje ${p}!`,
      ]),
      duvod: `${s.oblibenec} je miláček kotle.`,
      sila: 55,
    });
  }

  if (s.rival && s.rival.heat >= 45) {
    const r = s.rival.nazev;
    out.push({
      kind: "rival",
      text: vyber([
        `Kdo neskáče, není náš, hej, hej!`,
        `${r} do vápna, ${r} do vápna!`,
        `Celej okres ví, kdo je tady doma!`,
        `${r}, ${r}, na to se nedá koukat!`,
        `My jsme tady doma, vy jste tady hosti!`,
        `Sbalte si to, ${r}, a mažte!`,
        `Ať žije okres, ${r} ať mlčí!`,
        `Kdo je z ${r}? Nikdo! Kdo je náš? My!`,
        `Na-na-na, ${r} nikdy, na-na-na!`,
        `Vy máte dres, my máme kotel!`,
      ]),
      duvod: `Rivalita s klubem ${r} je vyhrocená.`,
      sila: Math.min(90, 40 + s.rival.heat / 2),
    });
  }

  if (s.kampanProtiTreneru && skandovatelne(s.trener)) {
    out.push({
      kind: "trener_proti",
      text: vyber([
        `${prijmeni(s.trener!).toUpperCase()}, ODEJDI!`,
        `Chceme trenéra! Tenhle ne!`,
        `${prijmeni(s.trener!).toUpperCase()} VEN! ${prijmeni(s.trener!).toUpperCase()} VEN!`,
        `Kdo to vede? Nikdo! Hej, hej!`,
        `Balte kufry, pane trenére!`,
        `My tu budem, vy tu nebudete!`,
        `Lavička je prázdná, i když na ní sedíte!`,
      ]),
      duvod: "Kotel veřejně volá po odvolání trenéra.",
      sila: 80,
    });
  } else if (s.serie >= 3 && skandovatelne(s.trener)) {
    out.push({
      kind: "trener_pro",
      text: vyber([
        `${prijmeni(s.trener!).toUpperCase()} je jeden z nás!`,
        `Máme trenéra, máme trenéra!`,
        `Hej, hej, ${prijmeni(s.trener!).toUpperCase()}, hej, hej!`,
        `Kdo nás vede? ${prijmeni(s.trener!).toUpperCase()}! A vede nás dobře!`,
        `Trenére, trenére, zůstaň tady s náma!`,
        `Ó ó ó, ${prijmeni(s.trener!).toUpperCase()}, ó ó ó!`,
      ]),
      duvod: `Tým vyhrál ${s.serie} zápasy po sobě.`,
      sila: 60,
    });
  }

  if (s.serie >= 2) {
    out.push({
      kind: "vyhra",
      text: vyber([
        `Jedeme dál, jedeme dál!`,
        `Kdo to nevidí, ať přijde příště!`,
        `Tohle je naše sezóna!`,
        `Hej, hej, jedem, hej, hej, jedem!`,
        `Kdo nás zastaví? Nikdo! Nikdo!`,
        `Vyhrát, vyhrát, a zas vyhrát!`,
        `Celej okres kouká, celej okres mlčí!`,
        `Ale ale ale, my jedem dál!`,
        `Nikdo nám to nedal, my si to vzali!`,
      ]),
      duvod: `Série ${s.serie} výher.`,
      sila: 50,
    });
  }

  // Vzdor přijde, až když je to fakt zlé. Do té doby se remcá, nezpívá.
  if (s.nalada <= 30 || s.heat >= 60) {
    out.push({
      kind: "vzdor",
      text: vyber([
        `My tu budem, až tady nikdo nebude!`,
        `Pojedem všude, kam se dá!`,
        `Vy se měníte, my ne!`,
        `V dešti, v blátě, pořád tady!`,
        `Hráči přijdou, hráči jdou, my zůstáváme!`,
        `Nikdy, nikdy se nevzdáme!`,
        `Ať to stojí co to stojí, my jsme tady!`,
        `Prohráváme? Zpíváme! Hej, hej!`,
        `Naše barvy, naše bída, naše hrdost!`,
        `Na-na-na, my neodejdem, na-na-na!`,
      ]),
      duvod: s.heat >= 60 ? "Kotel je na vedení naštvaný." : "Nálada je na dně, ale chodí dál.",
      sila: 65,
    });
  }

  if (s.stiznostNaVybaveni) {
    out.push({
      kind: "vybaveni",
      text: vyber([
        `Za naše peníze aspoň ${s.stiznostNaVybaveni}!`,
        `Chceme ${s.stiznostNaVybaveni}!`,
        `Hej, vedení! Chceme ${s.stiznostNaVybaveni}!`,
        `Platíme vstup, chceme ${s.stiznostNaVybaveni}!`,
        `Kdo nám dá ${s.stiznostNaVybaveni}? Nikdo! Hej, hej!`,
        `Máme kotel, nemáme ${s.stiznostNaVybaveni}!`,
      ]),
      duvod: `Na stadionu jim vadí: ${s.stiznostNaVybaveni}.`,
      sila: 35,
    });
  }

  return out;
}

/**
 * Nová síla chorálu po herním dni.
 *
 * Když důvod trvá, chorál sílí (zpívá se, lidi se ho učí). Když pomine,
 * rychle slábne a pod prahem se na něj zapomene.
 */
export const PRAH_ZAPOMENUTI = 15;

export function silaPo(sila: number, duvodTrva: boolean): number {
  const nova = duvodTrva ? sila + 4 : sila - 12;
  return Math.max(0, Math.min(100, nova));
}

/** Jak často se zpívá, slovem. */
export function chantSilaWord(sila: number): string {
  if (sila >= 80) return "zpívá celý kotel";
  if (sila >= 55) return "chytlo se to";
  if (sila >= 30) return "občas se ozve";
  return "dozpívává";
}

/** Která parta chorál drží. Kotel skoro vždycky, ostatní se přidají. */
export function kdoZpiva(kind: ChantKind): FanGroupKind[] {
  // Domácí chorál je o obci, ne o klubu, takže ho zvednou i ti, co na fotbal
  // chodí kvůli tomu, že je to doma.
  if (kind === "domov") return ["kotel", "stamgasti", "rodiny", "pametnici", "parta_z_okoli"];
  if (kind === "vybaveni") return ["kotel", "stamgasti", "rodiny"];
  if (kind === "vyhra") return ["kotel", "stamgasti", "parta_z_okoli", "pametnici"];
  return ["kotel", "parta_z_okoli"];
}

/**
 * Stav pro domácí chorál.
 *
 * Na rozdíl od ostatních druhů nevzniká z dění kolem klubu, ale z toho, kde
 * se hraje. Proto vlastní typ a vlastní funkce.
 */
export interface DomovStav {
  obec: string;
  okres: string | null;
  obyvatel: number | null;
  klub: string;
  prezdivkaTymu: string | null;
}

/** Obec je malá vesnice? Pod tuhle hranici se dá zpívat o tom, že jsou malí. */
export const MALA_OBEC = 1500;

/**
 * Domácí chorál: šablonová záloha.
 *
 * Název obce zůstává v PRVNÍM PÁDĚ. České místní názvy nejde spolehlivě
 * ohnout (Nebahovy → z Nebahov, Břevnov → z Břevnova, Dvory → ze Dvorů),
 * takže jsou věty postavené tak, aby se ohýbat nemusel.
 */
export function domaciChoral(s: DomovStav, roll: number): NovyChorál {
  const vyber = <T,>(z: readonly T[]): T => z[Math.floor(roll * z.length) % z.length];
  const o = s.obec;
  const obecne = [
    `${o}, ${o}, jedno srdce!`,
    `Hej, hej, ${o}, hej, hej!`,
    `Tady je doma ${o}!`,
    `${o} je náš domov, jinam nejdem!`,
    `Kdo je náš? ${o}! Kdo je náš? ${o}!`,
    `Ó ó ó, ${o}, ó ó ó!`,
    `My jsme ${o} a nikdo jinej!`,
    `Odsud jsme a tady zůstanem: ${o}!`,
  ];
  const male = [
    `Malá ves, velkej kotel: ${o}!`,
    `Je nás málo, ale jsme slyšet: ${o}!`,
    `${o} má víc srdce než celej okres!`,
  ];
  const velke = [
    `Město za náma, ${o}!`,
    `Celá liga ví, kdo je ${o}!`,
  ];
  // Okres se nechává stát samostatně. „Celej Prachatice" ani „od Prachatice"
  // není čeština a okresy se v prvním pádě liší rodem i číslem (Praha,
  // Prachatice, Brno-venkov), takže se s nimi žádná věta neshoduje.
  const sOkresem = s.okres
    ? [`${s.okres}? Tady jsme doma: ${o}!`, `${s.okres} zná jedno jméno: ${o}!`]
    : [];

  const maleObec = s.obyvatel !== null && s.obyvatel < MALA_OBEC;
  const kandidati = [
    ...obecne,
    ...(maleObec ? male : velke),
    ...sOkresem,
  ];

  return {
    kind: "domov",
    text: vyber(kandidati),
    duvod: `Domácí chorál. Hraje se v obci ${o}.`,
    // Domácí chorál umí celý stadion od začátku, proto začíná vysoko.
    sila: 70,
  };
}
