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
 * Co si dnes vymysleli.
 *
 * Vrací všechny chorály, které z dnešního stavu dávají smysl. Volající je
 * porovná s tím, co se už zpívá, a rozdíl založí. Nevrací nic, když se nic
 * neděje: mlčící kotel je taky výsledek.
 */
export function vymysliChoraly(s: ChantStav, roll: number): NovyChorál[] {
  const out: NovyChorál[] = [];
  const vyber = <T,>(z: readonly T[]): T => z[Math.floor(roll * z.length) % z.length];

  if (s.oblibenec) {
    const p = prijmeni(s.oblibenec).toUpperCase();
    out.push({
      kind: "oblibenec",
      // Jména se schválně neskloňují. „Kdo nemá rád Kolman" je patvar a
      // spolehlivě ohnout česká příjmení (Vlček → Vlčka, Petrášek → Petráška)
      // bez morfologie nejde. Šablony proto drží jméno v prvním pádě.
      text: vyber([
        `${p}, ${p}, ty jsi náš!`,
        `Jedno jméno, jeden král: ${p}!`,
        `${p}! ${p}! ${p}!`,
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
      ]),
      duvod: `Rivalita s klubem ${r} je vyhrocená.`,
      sila: Math.min(90, 40 + s.rival.heat / 2),
    });
  }

  if (s.kampanProtiTreneru && s.trener) {
    out.push({
      kind: "trener_proti",
      text: vyber([
        `${prijmeni(s.trener).toUpperCase()}, ODEJDI!`,
        `Chceme trenéra! Tenhle ne!`,
      ]),
      duvod: "Kotel veřejně volá po odvolání trenéra.",
      sila: 80,
    });
  } else if (s.serie >= 3 && s.trener) {
    out.push({
      kind: "trener_pro",
      text: vyber([
        `${prijmeni(s.trener).toUpperCase()} je jeden z nás!`,
        `Máme trenéra, máme trenéra!`,
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
  if (kind === "vybaveni") return ["kotel", "stamgasti", "rodiny"];
  if (kind === "vyhra") return ["kotel", "stamgasti", "parta_z_okoli", "pametnici"];
  return ["kotel", "parta_z_okoli"];
}
