/**
 * Národnosti/etnika hráčů — nízké procento cizinců + romská menšina.
 * Každá skupina má vlastní pool křestních jmen a příjmení + `ethnicity` pro avatar
 * (facesjs race: white/asian/brown) a vlajku pro UI.
 *
 * Češi jsou default (nationality "CZ", jména z district_surnames + czech-names).
 * Ostatní se losují s malou pravděpodobností v generatePlayer.
 */

export type Ethnicity = "white" | "asian" | "brown";

export interface Nationality {
  code: string; // ISO-ish kód uložený na hráči
  label: string; // český název pro UI
  flag: string; // emoji vlajka
  ethnicity: Ethnicity; // pro avatar (facesjs race)
  weight: number; // relativní váha losování (Češi mají zbytek do 1)
  firstNames: string[];
  surnames: string[];
}

/** Součet vah cizích/menšinových skupin ~0.12 → ~88 % Čechů. */
export const NATIONALITIES: Nationality[] = [
  {
    code: "SK", label: "Slovensko", flag: "🇸🇰", ethnicity: "white", weight: 0.03,
    firstNames: ["Peter", "Martin", "Marek", "Juraj", "Michal", "Ján", "Lukáš", "Matúš", "Patrik", "Jozef", "Milan", "Andrej", "Filip", "Dávid", "Roman"],
    surnames: ["Horváth", "Kováč", "Varga", "Tóth", "Nagy", "Baláž", "Molnár", "Szabó", "Lukáč", "Hudák", "Kováčik", "Šimko", "Straka", "Mikuláš", "Krajčí"],
  },
  {
    code: "UA", label: "Ukrajina", flag: "🇺🇦", ethnicity: "white", weight: 0.02,
    firstNames: ["Oleksandr", "Andrij", "Serhij", "Volodymyr", "Dmytro", "Mykola", "Ivan", "Vasyl", "Petro", "Bohdan", "Taras", "Roman", "Vitalij", "Jurij", "Oleh"],
    surnames: ["Ševčenko", "Bondarenko", "Kovalenko", "Tkačenko", "Kravčenko", "Bojko", "Melnyk", "Ševčuk", "Kovalčuk", "Poljakov", "Marčenko", "Lysenko", "Rudenko", "Moroz"],
  },
  {
    code: "PL", label: "Polsko", flag: "🇵🇱", ethnicity: "white", weight: 0.0075,
    firstNames: ["Piotr", "Krzysztof", "Tomasz", "Paweł", "Marcin", "Michał", "Jakub", "Kamil", "Mateusz", "Bartosz", "Grzegorz", "Rafał", "Adam", "Łukasz"],
    surnames: ["Nowak", "Kowalski", "Wiśniewski", "Wójcik", "Kowalczyk", "Kamiński", "Lewandowski", "Zieliński", "Szymański", "Woźniak", "Dąbrowski", "Kozłowski", "Mazur", "Jankowski"],
  },
  {
    code: "DE", label: "Německo", flag: "🇩🇪", ethnicity: "white", weight: 0.0075,
    firstNames: ["Thomas", "Michael", "Stefan", "Andreas", "Markus", "Christian", "Daniel", "Florian", "Lukas", "Sebastian", "Tobias", "Maximilian", "Felix", "Jonas"],
    surnames: ["Müller", "Schmidt", "Fischer", "Weber", "Wagner", "Becker", "Hoffmann", "Schäfer", "Koch", "Bauer", "Richter", "Klein", "Wolf", "Schröder"],
  },
  {
    code: "AT", label: "Rakousko", flag: "🇦🇹", ethnicity: "white", weight: 0.006,
    firstNames: ["Thomas", "Stefan", "Lukas", "Andreas", "Markus", "Christian", "Florian", "Sebastian", "Tobias", "Maximilian", "Fabian", "Dominik", "Bernhard", "Alexander"],
    surnames: ["Gruber", "Huber", "Bauer", "Wagner", "Steiner", "Moser", "Mayer", "Pichler", "Berger", "Fuchs", "Wimmer", "Leitner", "Weber", "Hofer"],
  },
  {
    code: "HR", label: "Chorvatsko", flag: "🇭🇷", ethnicity: "white", weight: 0.006,
    firstNames: ["Ivan", "Marko", "Luka", "Ante", "Josip", "Marin", "Domagoj", "Nikola", "Filip", "Petar", "Mateo", "Tomislav", "Dario", "Stjepan"],
    surnames: ["Horvat", "Kovačević", "Marić", "Jurić", "Novak", "Babić", "Petrović", "Knežević", "Kovačić", "Vuković", "Perić", "Matić", "Tomić", "Blažević"],
  },
  {
    code: "HU", label: "Maďarsko", flag: "🇭🇺", ethnicity: "white", weight: 0.006,
    firstNames: ["László", "István", "Gábor", "Zoltán", "Attila", "Péter", "Tamás", "Balázs", "Ádám", "Dávid", "Bence", "Máté", "Gergő", "Levente"],
    surnames: ["Nagy", "Kovács", "Tóth", "Szabó", "Horváth", "Varga", "Kiss", "Molnár", "Németh", "Farkas", "Balogh", "Papp", "Takács", "Juhász"],
  },
  {
    code: "RO", label: "Rumunsko", flag: "🇷🇴", ethnicity: "white", weight: 0.006,
    firstNames: ["Andrei", "Ionuț", "Gabriel", "Alexandru", "Cristian", "Florin", "Marius", "Bogdan", "Mihai", "Daniel", "Răzvan", "Ștefan", "Cătălin", "Vlad"],
    surnames: ["Popescu", "Ionescu", "Popa", "Radu", "Dumitru", "Stoica", "Munteanu", "Constantin", "Marin", "Gheorghe", "Stan", "Rusu", "Matei", "Florea"],
  },
  {
    code: "VN", label: "Vietnam", flag: "🇻🇳", ethnicity: "asian", weight: 0.015,
    firstNames: ["Minh", "Anh", "Hùng", "Nam", "Tuấn", "Dũng", "Long", "Hải", "Quang", "Đức", "Thanh", "Bình", "Sơn", "Huy", "Khoa"],
    surnames: ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý"],
  },
  {
    // Romové jsou čeští občané (nationality "CZ"), ale mají vlastní pool jmen a snědý avatar.
    code: "CZ-ROMA", label: "Česko", flag: "🇨🇿", ethnicity: "brown", weight: 0.04,
    firstNames: ["René", "Robert", "Milan", "Emil", "Ladislav", "Denis", "Kevin", "Nikolas", "Josef", "Ján", "Dušan", "Marián", "Julius", "Rudolf", "Erik"],
    surnames: ["Horváth", "Gaži", "Bihári", "Danihel", "Dužda", "Čureja", "Kotlár", "Giňa", "Balog", "Lakatoš", "Berky", "Ferko", "Demeter", "Sivák", "Žiga", "Oláh"],
  },
];

export interface ForeignName {
  firstName: string;
  lastName: string;
  /** Kód uložený na hráči (Romové → "CZ", protože jsou čeští občané). */
  nationality: string;
  ethnicity: Ethnicity;
}

/**
 * S malou pravděpodobností vrátí cizí/menšinové jméno + etnikum; jinak null (Čech).
 * Potřebuje rng s .random() (0-1) a .pick(arr).
 */
export function pickForeignName(rng: { random: () => number; pick: <T>(a: T[]) => T }): ForeignName | null {
  const roll = rng.random();
  let acc = 0;
  for (const n of NATIONALITIES) {
    acc += n.weight;
    if (roll < acc) {
      return {
        firstName: rng.pick(n.firstNames),
        lastName: rng.pick(n.surnames),
        nationality: n.code === "CZ-ROMA" ? "CZ" : n.code,
        ethnicity: n.ethnicity,
      };
    }
  }
  return null;
}
