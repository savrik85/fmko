// Fake vesničtí sponzoři pro dres — random pick generator.
// Mix hospod, řemesel, malých firem a zemědělství. Záměrně absurdní pro vesnický vibe.

export const FAKE_SPONSORS: ReadonlyArray<string> = [
  "Hospoda U Medvěda",
  "Pekárna Krátká",
  "Autoservis Novák",
  "Zelinka Frantův",
  "Pivovar U Lípy",
  "Řezník Vepřák",
  "Stavebniny Kamen",
  "Zedník Brejcha",
  "Cukrárna Markéta",
  "Klempířství Drobík",
  "Pohřební služba Klid",
  "Kominík Sazoun",
  "Truhlářství Habr",
  "Pneuservis Křížek",
  "Květinářství Konvalinka",
  "Sklenář Průzračný",
  "Knihy U Sovy",
  "Včelařství Vosk",
  "Lakovna Duha",
  "Kovárna Šeptal",
  "Mlékárna U Lišky",
  "Salon Krása",
  "Elektro Hrom",
  "Pizzerie U Pepi",
  "Sedlář Řemínek",
  "Holičství Břitva",
  "Zámečnictví Klíček",
  "Drogerie Mýdlo",
  "Trafika U Stánku",
  "Fotostudio Cvak",
  "Kemp U Rybníka",
  "Pokrývačství Šindel",
  "Prádelna Mokrá",
];

export function randomSponsor(): string {
  return FAKE_SPONSORS[Math.floor(Math.random() * FAKE_SPONSORS.length)];
}
