/**
 * Kdo ti dneska marně volal.
 *
 * V Čechách je hromada nepřijatých hovorů od jednoho člověka univerzální
 * znamení, že máš průšvih. Sponzor volal pětkrát a ty nevíš proč, ale víš,
 * že to nebude nic dobrého. Tohle je přesně ten pocit.
 *
 * Bez AI a bez náhody. Každý hovor je navázaný na konkrétní stav klubu,
 * stejně jako chorály a plachta: pětkrát volající sponzor musí znamenat, že
 * se opravdu něco stalo, jinak by to byl jen šum, který se naučíš ignorovat.
 *
 * Bez DB, aby to šlo testovat.
 */

/** Kdo volá. Na jeden druh jeden hovor za den. */
export type Volajici = "kotel" | "sponzor" | "starosta" | "komise" | "hrac" | "novinar";

export interface StavHovoru {
  /** Jméno vůdce kotle, pokud ho klub má. */
  vudceKotle: string | null;
  /** Naštvanost kotle na vedení 0-100. */
  heatKotle: number;
  /** Běží podpisovka za odvolání trenéra? */
  kampanProtiTreneru: boolean;
  /** Série: kladné výhry po sobě, záporné prohry. */
  serie: number;
  /** Hlavní sponzor, pokud nějaký je. */
  sponzor: string | null;
  /** Pokuta za výtržnosti fanoušků za poslední zápas, v korunách. */
  pokutaZaBordel: number;
  /** Jméno hráče, který dlouho nehrál a má nejhorší náladu. */
  nastvanyHrac: string | null;
  /** Obec, ať starosta volá odněkud. */
  obec: string | null;
}

export interface Hovor {
  volajici: Volajici;
  jmeno: string;
  duvod: string;
  /** Kolikrát zvonil. Víc zvonění = větší průšvih. */
  pocet: number;
}

/**
 * Kdo dneska volal.
 *
 * Vrací jen hovory, které z dnešního stavu dávají smysl. Když je klid,
 * nezvoní nikdo, a to je taky informace.
 */
export function kdoVolal(s: StavHovoru, roll: number): Hovor[] {
  const out: Hovor[] = [];
  const vyber = <T,>(z: readonly T[]): T => z[Math.floor(roll * z.length) % z.length];

  // Kotel volá, když je naštvaný. Při podpisovce za odvolání nedá pokoj.
  if (s.kampanProtiTreneru && s.vudceKotle) {
    out.push({
      volajici: "kotel",
      jmeno: s.vudceKotle,
      duvod: vyber([
        "Chtěl ti prý něco vysvětlit ohledně té podpisovky.",
        "Volal šestkrát. Asi ne proto, aby ti poděkoval.",
        "Nechal vzkaz: „Ať si to vezme, ví o co jde.“",
      ]),
      pocet: 6,
    });
  } else if (s.heatKotle >= 55 && s.vudceKotle) {
    out.push({
      volajici: "kotel",
      jmeno: s.vudceKotle,
      duvod: vyber([
        "Kotel je naštvaný a on to chce probrat po svém.",
        "Zkoušel to třikrát během půl hodiny.",
        "Volal z hospody. Kolem něj bylo slyšet celou partu.",
        "Tři zmeškané a žádný vzkaz.",
      ]),
      pocet: 3,
    });
  }

  // Sponzor volá, když se nedaří. Peníze chtějí vidět výsledky.
  if (s.sponzor && s.serie <= -3) {
    out.push({
      volajici: "sponzor",
      jmeno: s.sponzor,
      duvod: vyber([
        `Po ${Math.abs(s.serie)} prohrách po sobě si chce popovídat o smlouvě.`,
        "Marketingové oddělení mělo dotaz. Nezvedl jsi to.",
        "Volali z centrály. Dvakrát. Pak to vzdali.",
      ]),
      pocet: 5,
    });
  }

  // Starosta řeší, co obec stálo tvoje fanouškovstvo.
  if (s.pokutaZaBordel > 0) {
    out.push({
      volajici: "starosta",
      jmeno: s.obec ? `Starosta, ${s.obec}` : "Starosta obce",
      duvod: vyber([
        `Prý „jen tak, na kus řeči". Ta pokuta ${s.pokutaZaBordel.toLocaleString("cs")} Kč s tím nesouvisí.`,
        "Ptal se, jestli ještě bude fotbal, nebo už jenom rvačky.",
      ]),
      pocet: 2,
    });
  }

  // Komise volá k disciplinárce.
  if (s.pokutaZaBordel >= 8000) {
    out.push({
      volajici: "komise",
      jmeno: "Sportovně-technická komise",
      duvod: "Volali z pevné linky. Nikdo se neozval, když jsi volal zpátky.",
      pocet: 1,
    });
  }

  // Hráč, co nehraje. Klasika.
  if (s.nastvanyHrac) {
    out.push({
      volajici: "hrac",
      jmeno: s.nastvanyHrac,
      duvod: vyber([
        "Nejspíš se chtěl zeptat, proč zase nehrál.",
        "Volal večer. Podle hluku v pozadí byl v hospodě.",
        "Zmeškaný hovor a žádný vzkaz. To nikdy neznamená nic dobrého.",
        "Volal, položil, a za minutu znovu.",
        "Prý to není nic důležitého. Volal dvakrát.",
      ]),
      pocet: 2,
    });
  }

  // Novinář po velkém výsledku. Jediný hovor, který není průšvih.
  if (s.serie >= 4) {
    out.push({
      volajici: "novinar",
      jmeno: "Redakce Zpravodaje",
      duvod: `Po ${s.serie} výhrách po sobě chtěli rozhovor. Nezvedl jsi to.`,
      pocet: 1,
    });
  }

  return out;
}

/** Popisek volajícího do seznamu hovorů. */
export const VOLAJICI_LABEL: Record<Volajici, string> = {
  kotel: "vůdce kotle",
  sponzor: "sponzor",
  starosta: "obec",
  komise: "soutěž",
  hrac: "hráč",
  novinar: "novinář",
};
