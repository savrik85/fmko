import { attributeImportance } from "@okresni-masina/shared";

// Popisy atributů hráčů — pro tooltipy v UI. Středně transparentní:
// vysvětlí *co atribut dělá* a *pro koho je důležitý*, bez konkrétních vzorců.

export type AttrKey =
  | "rat" | "spd" | "tec" | "sho" | "pas" | "hea" | "def" | "gk"
  | "vis" | "exp" | "cre" | "set"
  | "sta" | "str" | "cond" | "mor" | "wage" | "age";

export type Pos = "GK" | "DEF" | "MID" | "FWD";

export interface AttrInfo {
  label: string;        // krátký label do tooltipu (Czech)
  description: string;  // 1–2 věty: co dělá + pro koho
  relevantFor: Pos[];   // pro které pozice je nejvíc relevantní
}

export const ATTRIBUTE_INFO: Record<AttrKey, AttrInfo> = {
  rat: {
    label: "Celkové hodnocení",
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
    description: "Rychlost běhu. Hlavní zbraň útočníka při náběhu, záložníkům pomáhá v rozehrávce i dozadu. U brankáře znamená vybíhání.",
    relevantFor: ["DEF", "MID", "FWD"],
  },
  tec: {
    label: "Technika",
    description: "Práce s míčem, kličky, klid v zakončení. Důležitá hlavně pro záložníky a útočníky.",
    relevantFor: ["MID", "FWD"],
  },
  sho: {
    label: "Střelba",
    description: "Přesnost a síla střely. Dobrý střelec se do šance dostane častěji a víc jich promění. Klíčová pro útočníky.",
    relevantFor: ["FWD", "MID"],
  },
  pas: {
    label: "Přihrávky",
    description: "Přesnost přihrávek. Rozhoduje hlavně o tom, kdo má míč, a pomáhá z něj vytvořit šanci. Déšť, sníh a rozbité hřiště ji srážejí.",
    relevantFor: ["MID", "DEF"],
  },
  hea: {
    label: "Hlavičky",
    description: "Hra hlavou. Necelá třetina šancí ze hry končí hlavičkou, k tomu rohy a centry. Obráncům pomáhá bránit, brankáři dosáhnout na centr.",
    relevantFor: ["DEF", "FWD"],
  },
  def: {
    label: "Obrana",
    description: "Bránění a postavení. Klíčová pro obránce, záložníkům a útočníkům pomáhá v napadání. U brankáře znamená postavení v bráně.",
    relevantFor: ["DEF", "MID"],
  },
  vis: {
    label: "Přehled",
    description: "Čtení hry a výběr správného řešení s míčem. Nejvíc rozhoduje u záložníků.",
    relevantFor: ["DEF", "MID", "FWD"],
  },
  exp: {
    label: "Zkušenost",
    description: "Herní zkušenost a rozvaha. Počítá se do hodnocení všech postů.",
    relevantFor: ["GK", "DEF", "MID"],
  },
  cre: {
    label: "Kreativita",
    description: "Nápady s míčem a nečekaná řešení. U brankáře jde o komunikaci s obranou.",
    relevantFor: ["GK", "MID", "FWD"],
  },
  set: {
    label: "Standardky",
    description: "Zahrávání standardek. V zápase rozhoduje u hráče, který kope penalty, přímé kopy a rohy. Na hodnocení má malý vliv.",
    relevantFor: ["MID", "FWD"],
  },
  gk: {
    label: "Brankář",
    description: "Chytání a reflexy. Hlavní dovednost brankáře, hodnotí se jen u něj. Vedle ní mu pomáhá postavení, vybíhání, dosah a zkušenost.",
    relevantFor: ["GK"],
  },
  sta: {
    label: "Výdrž",
    description: "Výdrž. Zpomaluje únavu během zápasu a zrychluje noční regeneraci kondice (při výdrži 75 a víc +20 denně).",
    relevantFor: ["GK", "DEF", "MID", "FWD"],
  },
  str: {
    label: "Síla",
    description: "Síla v soubojích. Nejdůležitější pro obránce, útočníkovi pomáhá podržet míč a vyhrát hlavičku. Potřebuje ji i tvrdá hra.",
    relevantFor: ["DEF", "MID", "FWD"],
  },
  cond: {
    label: "Kondice",
    description: "Aktuální nabití (0–100 %). Unavený hráč dělá na hřišti míň a tým s nižší průměrnou kondicí si vytvoří méně šancí.",
    relevantFor: ["GK", "DEF", "MID", "FWD"],
  },
  mor: {
    label: "Morálka",
    description: "Nálada hráče. Mění se hlavně během zápasu: gól ji zvedne, inkasovaný sníží. Nízká morálka snižuje výkon.",
    relevantFor: ["GK", "DEF", "MID", "FWD"],
  },
  wage: {
    label: "Týdenní mzda",
    description: "Kolik hráč týdně bere. Větší mzda = vyšší hodnocení, ale větší zátěž na rozpočet.",
    relevantFor: ["GK", "DEF", "MID", "FWD"],
  },
};

// Klíčové posty dovedností se berou z vah hodnocení (`attributeImportance` = "key"), na které
// je naladěný i engine. Ručně psané seznamy se s nimi rozešly (nápověda 2026-11-18).
const SKILL_FIELD: Partial<Record<AttrKey, string>> = {
  spd: "speed", tec: "technique", sho: "shooting", pas: "passing", hea: "heading", def: "defense",
  vis: "vision", exp: "experience", cre: "creativity", set: "setPieces", gk: "goalkeeping",
  sta: "stamina", str: "strength",
};
const ALL_POSITIONS: Pos[] = ["GK", "DEF", "MID", "FWD"];
for (const [key, field] of Object.entries(SKILL_FIELD) as Array<[AttrKey, string]>) {
  ATTRIBUTE_INFO[key].relevantFor = ALL_POSITIONS.filter((pos) => attributeImportance(pos, field) === "key");
}

// Zkrácený tooltip do `title=` HTML attributu (jednořádkový)
export function getTooltip(key: AttrKey): string {
  const info = ATTRIBUTE_INFO[key];
  if (!info) return "";
  const positions = info.relevantFor.length === 4 ? "Pro všechny pozice" :
    info.relevantFor.length === 0 ? "Klíčová není pro žádný post" :
    `Klíčové pro: ${info.relevantFor.map(positionLabel).join(", ")}`;
  return `${info.label} ${info.description}\n${positions}`;
}

function positionLabel(p: Pos): string {
  return p === "GK" ? "brankáře" : p === "DEF" ? "obránce" : p === "MID" ? "záložníky" : "útočníky";
}
