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
