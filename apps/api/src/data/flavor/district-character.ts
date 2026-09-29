/**
 * Krátký popis rázu okresu pro AI texty (reportér, preview). Okres bez záznamu
 * dostane neutrální popis — nikdy cizí kolorit (Šumava u Strakonic, tramvaje v Písku).
 */
const DISTRICT_CHARACTER: Record<string, string> = {
  Prachatice: "Šumava a její podhůří, Zlatá stezka, lesy, pily a malé vesnice pod horami",
  "Český Krumlov": "Šumava, Lipno a horní Vltava, vodáci, turisté a vesnice po odsunu dosídlené",
  "České Budějovice": "jihočeská metropole, Budvar, rybníky a roviny kolem, vesnice jihočeského baroka",
  Strakonice: "Pošumaví a Otava, dudy a Dudák, rybníky Blatenska, zemědělské vesnice a stará průmyslová tradice ČZ",
  Písek: "Otava a Kamenný most, Milevsko, lesy Píseckých hor, rybníky a zemědělské vesnice",
};

/** Okres ligy bez přípony U21 („Prachatice U21“ → „Prachatice“). */
export function baseDistrict(district: string): string {
  return district.replace(/ U21$/, "");
}

export function districtCharacter(district: string): string {
  return DISTRICT_CHARACTER[baseDistrict(district)] ?? "venkovský okres, obce, kde se každý zná, hospoda a hřiště jako střed dění";
}
