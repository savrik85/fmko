/**
 * Sdílený pool českých mužských křestních jmen, vážený dle dekády narození.
 * Váhy nemusí dávat součet 1 — rng.weighted() je normalizuje.
 * Jeden zdroj pro všechny generátory (kádry, volní hráči, U21, celebrity, nabídky).
 */
export const FIRSTNAMES: Record<string, Record<string, number>> = {
  "1960s": {
    "Jiří": 0.08, "Jan": 0.07, "Petr": 0.06, "Josef": 0.06, "Jaroslav": 0.05, "Milan": 0.05,
    "Zdeněk": 0.05, "Miroslav": 0.05, "František": 0.05, "Václav": 0.04, "Karel": 0.04, "Vladimír": 0.04,
    "Ladislav": 0.03, "Antonín": 0.03, "Stanislav": 0.03, "Bohumil": 0.02, "Rudolf": 0.02, "Oldřich": 0.02,
    "Jaromír": 0.02, "Vlastimil": 0.02, "Pavel": 0.03, "Ivan": 0.02, "Luboš": 0.02, "Alois": 0.02,
  },
  "1970s": {
    "Petr": 0.08, "Jan": 0.07, "Martin": 0.06, "Jiří": 0.06, "Pavel": 0.05, "Tomáš": 0.05,
    "Roman": 0.04, "Michal": 0.04, "Zdeněk": 0.04, "Jaroslav": 0.04, "Marek": 0.04, "David": 0.03,
    "Radek": 0.04, "Aleš": 0.03, "Miroslav": 0.03, "Milan": 0.03, "Kamil": 0.02, "Libor": 0.02,
    "Robert": 0.02, "Richard": 0.02, "Vít": 0.02, "Josef": 0.03, "Ivan": 0.02, "Daniel": 0.02,
  },
  "1980s": {
    "Jan": 0.08, "Martin": 0.07, "Tomáš": 0.06, "Pavel": 0.05, "Michal": 0.05, "David": 0.05,
    "Lukáš": 0.05, "Jakub": 0.04, "Petr": 0.04, "Ondřej": 0.04, "Marek": 0.04, "Filip": 0.03,
    "Daniel": 0.03, "Roman": 0.03, "Radek": 0.03, "Aleš": 0.02, "Jaroslav": 0.02, "Vít": 0.02,
    "Josef": 0.02, "Zdeněk": 0.02, "Robert": 0.02, "Kamil": 0.02, "Miloš": 0.02, "Patrik": 0.02,
  },
  "1990s": {
    "Jan": 0.09, "Tomáš": 0.07, "Jakub": 0.06, "David": 0.06, "Lukáš": 0.05, "Ondřej": 0.05,
    "Filip": 0.05, "Martin": 0.04, "Michal": 0.04, "Petr": 0.04, "Daniel": 0.03, "Adam": 0.03,
    "Marek": 0.03, "Matěj": 0.03, "Dominik": 0.03, "Vojtěch": 0.03, "Patrik": 0.02, "Pavel": 0.02,
    "Jiří": 0.02, "Štěpán": 0.02, "Denis": 0.02, "Vít": 0.02, "Radek": 0.02, "Šimon": 0.02,
  },
  "2000s": {
    "Jakub": 0.08, "Jan": 0.07, "Adam": 0.06, "Matěj": 0.06, "Ondřej": 0.05, "Filip": 0.05,
    "Vojtěch": 0.05, "Tomáš": 0.04, "David": 0.04, "Lukáš": 0.04, "Dominik": 0.03, "Šimon": 0.03,
    "Daniel": 0.03, "Matyáš": 0.03, "Štěpán": 0.03, "Kryštof": 0.03, "Martin": 0.02, "Marek": 0.02,
    "Michal": 0.02, "Václav": 0.02, "Antonín": 0.02, "Josef": 0.02, "Patrik": 0.02, "Denis": 0.02,
  },
  "2010s": {
    "Jakub": 0.07, "Jan": 0.07, "Adam": 0.06, "Vojtěch": 0.05, "Filip": 0.05, "Tomáš": 0.05,
    "Šimon": 0.05, "Matyáš": 0.05, "Matěj": 0.04, "Ondřej": 0.04, "David": 0.04, "Kryštof": 0.04,
    "Antonín": 0.03, "Václav": 0.03, "Jáchym": 0.03, "Tobiáš": 0.03, "Štěpán": 0.03, "Daniel": 0.02,
    "Dominik": 0.02, "Josef": 0.02, "Sebastian": 0.02, "Oliver": 0.02, "Mikuláš": 0.02, "Marek": 0.02,
  },
};
