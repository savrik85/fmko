// Popisy atributů hráčů — pro tooltipy v UI. Středně transparentní:
// vysvětlí *co atribut dělá* a *pro koho je důležitý*, bez konkrétních vzorců.

export type AttrKey =
  | "rat" | "spd" | "tec" | "sho" | "pas" | "hea" | "def" | "gk"
  | "sta" | "str" | "cond" | "mor" | "wage" | "age";

export type Pos = "GK" | "DEF" | "MID" | "FWD";

export interface AttrInfo {
  label: string;        // krátký label do tooltipu (Czech)
  description: string;  // 1–2 věty: co dělá + pro koho
  relevantFor: Pos[];   // pro které pozice je nejvíc relevantní
}

export const ATTRIBUTE_INFO: Record<AttrKey, AttrInfo> = {
  rat: {
    label: "Celkový rating",
    description: "Souhrnné hodnocení hráče (0–100). Vážený průměr všech dovedností podle pozice.",
    relevantFor: ["GK", "DEF", "MID", "FWD"],
  },
  age: {
    label: "Věk",
    description: "Hráči pod 22 let se rychleji zlepšují, nad 30 atributy klesají.",
    relevantFor: ["GK", "DEF", "MID", "FWD"],
  },
  spd: {
    label: "Rychlost",
    description: "Rychlost běhu. Kritická pro útočníky a krajní obránce, méně pro stopery a brankáře.",
    relevantFor: ["DEF", "MID", "FWD"],
  },
  tec: {
    label: "Technika",
    description: "Práce s míčem, kličky, klid v zakončení. Důležitá hlavně pro záložníky a útočníky.",
    relevantFor: ["MID", "FWD"],
  },
  sho: {
    label: "Střelba",
    description: "Přesnost a síla střely. Klíčový atribut útočníků, sekundární pro ofenzivní záložníky.",
    relevantFor: ["FWD", "MID"],
  },
  pas: {
    label: "Přihrávky",
    description: "Přesnost a tah přihrávek. Páteř hry pro záložníky, sekundárně pro obránce.",
    relevantFor: ["MID", "DEF"],
  },
  hea: {
    label: "Hlavičky",
    description: "Hra hlavou. Důležitá pro stopery a vysoké útočníky, hlavně při standardkách.",
    relevantFor: ["DEF", "FWD"],
  },
  def: {
    label: "Obrana",
    description: "Schopnost ubránit soupeře, čtení hry. Klíčová pro obránce a defenzivní záložníky.",
    relevantFor: ["DEF", "MID"],
  },
  gk: {
    label: "Brankář",
    description: "Chytání, výběh, reflexy. Jediný atribut, který se hodnotí pouze u brankářů.",
    relevantFor: ["GK"],
  },
  sta: {
    label: "Výdrž",
    description: "Jak rychle se po zápase a tréninku regeneruje kondice. Vysoká stamina = +18 kondice/den.",
    relevantFor: ["GK", "DEF", "MID", "FWD"],
  },
  str: {
    label: "Síla",
    description: "Fyzická síla v soubojích. Důležitá pro stopery, útočníky a defenzivní záložníky.",
    relevantFor: ["DEF", "MID", "FWD"],
  },
  cond: {
    label: "Kondice",
    description: "Aktuální nabití (0–100 %). Pod 60 % výrazně padá výkon v zápase (až na 0.6× síly).",
    relevantFor: ["GK", "DEF", "MID", "FWD"],
  },
  mor: {
    label: "Morálka",
    description: "Nálada hráče. Výhra +3 až +7, prohra −2 až −5. Nízká morálka snižuje výkon.",
    relevantFor: ["GK", "DEF", "MID", "FWD"],
  },
  wage: {
    label: "Týdenní mzda",
    description: "Kolik hráč týdně bere. Větší mzda = vyšší rating, ale větší zátěž na rozpočet.",
    relevantFor: ["GK", "DEF", "MID", "FWD"],
  },
};

// Zkrácený tooltip do `title=` HTML attributu (jednořádkový)
export function getTooltip(key: AttrKey): string {
  const info = ATTRIBUTE_INFO[key];
  if (!info) return "";
  const positions = info.relevantFor.length === 4 ? "Pro všechny pozice" :
    `Klíčové pro: ${info.relevantFor.map(positionLabel).join(", ")}`;
  return `${info.label} — ${info.description}\n${positions}`;
}

function positionLabel(p: Pos): string {
  return p === "GK" ? "brankáře" : p === "DEF" ? "obránce" : p === "MID" ? "záložníky" : "útočníky";
}
