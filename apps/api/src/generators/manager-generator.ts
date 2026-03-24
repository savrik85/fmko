import type { Rng } from "./rng";
import type { ManagerBackstory } from "@okresni-masina/shared";

const FIRST_NAMES = [
  "Jan", "Petr", "Martin", "Tomáš", "Josef", "Miroslav", "Karel",
  "Pavel", "Jiří", "Zdeněk", "Jaroslav", "Ladislav", "Stanislav",
  "Milan", "Vladimír", "František", "Václav", "Oldřich", "Radek",
  "Aleš", "Luboš", "Roman", "David", "Marek", "Michal",
];

const LAST_NAMES = [
  "Novák", "Svoboda", "Novotný", "Dvořák", "Černý", "Procházka",
  "Kučera", "Veselý", "Horák", "Němec", "Pokorný", "Marek",
  "Pospíšil", "Hájek", "Jelínek", "Král", "Růžička", "Beneš",
  "Fiala", "Sedláček", "Doležal", "Zeman", "Kolář", "Navrátil",
  "Čermák", "Vaněk", "Urban", "Blažek", "Kříž", "Kopecký",
];

const BACKSTORIES: ManagerBackstory[] = [
  "byvaly_hrac", "mistni_ucitel", "pristehovalec", "syn_trenera", "hospodsky",
];

const BACKSTORY_LABELS: Record<ManagerBackstory, string> = {
  byvaly_hrac: "Bývalý hráč",
  mistni_ucitel: "Místní učitel",
  pristehovalec: "Přistěhovalec",
  syn_trenera: "Syn předchozího trenéra",
  hospodsky: "Hospodský",
};

const BIOS: Record<ManagerBackstory, string[]> = {
  byvaly_hrac: [
    "Odklopal si okresní přebor jako záložník a teď předává zkušenosti mladším.",
    "Po konci aktivní kariéry se vrátil ke klubu jako trenér. Kluci ho respektují.",
    "Bývalý střední záložník, co si pamatuje každé hřiště v okresu.",
  ],
  mistni_ucitel: [
    "Učí tělocvik na základce a po škole běží rovnou na tréninky.",
    "Zná všechny rodiny v obci, což mu pomáhá s komunikací v kabině.",
    "Ve škole učí dějepis, na hřišti historii okresního fotbalu.",
  ],
  pristehovalec: [
    "Přišel z města a musí si důvěru vesnice teprve získat.",
    "Nový v obci, ale přináší čerstvý pohled na taktiku.",
    "Nikdo ho tu nezná, ale jeho metody přinášejí výsledky.",
  ],
  syn_trenera: [
    "Otec tu trénoval dvacet let. Teď je řada na něm.",
    "Vyrostl v kabině, zná každý kout šatny i hřiště.",
    "Mladý a ambiciózní, ale někteří pamětníci jsou skeptičtí.",
  ],
  hospodsky: [
    "Po zápase je vždycky plno — a trenér za barem.",
    "Vlastní místní hospodu a po výhrách nechává pivo zadarmo.",
    "Kluci ho mají rádi, zvlášť ty, co rádi zajdou na jedno.",
  ],
};

interface GeneratedManager {
  name: string;
  age: number;
  backstory: ManagerBackstory;
  coaching: number;
  motivation: number;
  tactics: number;
  youthDevelopment: number;
  discipline: number;
  reputation: number;
  bio: string;
  birthplace: string;
  avatar: Record<string, unknown>;
}

const BIRTHPLACES = [
  "Vimperk", "Prachatice", "Netolice", "Husinec", "Volary", "Vlachovo Březí",
  "Čkyně", "Lhenice", "Stachy", "Zbytiny", "České Budějovice", "Český Krumlov",
  "Strakonice", "Písek", "Tábor", "Klatovy", "Sušice", "Plzeň", "Brno", "Praha",
];

/** Generate a random AI manager for an AI-controlled team */
export function generateAiManager(rng: Rng): GeneratedManager {
  const firstName = FIRST_NAMES[rng.int(0, FIRST_NAMES.length - 1)];
  const lastName = LAST_NAMES[rng.int(0, LAST_NAMES.length - 1)];
  const backstory = BACKSTORIES[rng.int(0, BACKSTORIES.length - 1)];
  const bios = BIOS[backstory];
  const bio = bios[rng.int(0, bios.length - 1)];

  // Age based on backstory
  let age: number;
  switch (backstory) {
    case "syn_trenera": age = rng.int(25, 35); break;
    case "byvaly_hrac": age = rng.int(35, 55); break;
    case "mistni_ucitel": age = rng.int(30, 55); break;
    case "hospodsky": age = rng.int(35, 60); break;
    case "pristehovalec": age = rng.int(28, 50); break;
  }

  // Attributes: 20-70 range for AI managers, shaped by backstory
  const base = () => rng.int(25, 55);
  let coaching = base();
  let motivation = base();
  let tactics = base();
  let youthDevelopment = base();
  let discipline = base();

  switch (backstory) {
    case "byvaly_hrac": coaching += 10; tactics += 5; break;
    case "mistni_ucitel": youthDevelopment += 10; motivation += 5; break;
    case "pristehovalec": tactics += 10; discipline += 5; break;
    case "syn_trenera": youthDevelopment += 5; coaching += 5; break;
    case "hospodsky": motivation += 10; discipline -= 5; break;
  }

  const clamp = (v: number) => Math.min(70, Math.max(15, v));
  coaching = clamp(coaching);
  motivation = clamp(motivation);
  tactics = clamp(tactics);
  youthDevelopment = clamp(youthDevelopment);
  discipline = clamp(discipline);

  const reputation = rng.int(20, 50);

  // Birthplace — pristehovalec je z daleka, ostatní z okolí
  const localPlaces = BIRTHPLACES.slice(0, 12);
  const distantPlaces = BIRTHPLACES.slice(12);
  const birthplace = backstory === "pristehovalec"
    ? distantPlaces[rng.int(0, distantPlaces.length - 1)]
    : localPlaces[rng.int(0, localPlaces.length - 1)];

  return {
    name: `${firstName} ${lastName}`,
    age,
    backstory,
    coaching,
    motivation,
    tactics,
    youthDevelopment,
    discipline,
    reputation,
    bio,
    birthplace,
    avatar: generateManagerFace(rng),
  };
}

/** Generate attributes for a player-created manager based on backstory */
export function generateManagerAttributes(
  backstory: ManagerBackstory,
  rng: Rng,
): { age: number; coaching: number; motivation: number; tactics: number; youthDevelopment: number; discipline: number; reputation: number; bio: string; birthplace: string } {
  const bios = BIOS[backstory];
  const bio = bios[rng.int(0, bios.length - 1)];

  let age: number;
  switch (backstory) {
    case "syn_trenera": age = rng.int(25, 35); break;
    case "byvaly_hrac": age = rng.int(35, 55); break;
    case "mistni_ucitel": age = rng.int(30, 55); break;
    case "hospodsky": age = rng.int(35, 60); break;
    case "pristehovalec": age = rng.int(28, 50); break;
  }

  const base = () => rng.int(30, 55);
  let coaching = base();
  let motivation = base();
  let tactics = base();
  let youthDevelopment = base();
  let discipline = base();

  switch (backstory) {
    case "byvaly_hrac": coaching += 12; tactics += 5; break;
    case "mistni_ucitel": youthDevelopment += 12; motivation += 5; break;
    case "pristehovalec": tactics += 12; discipline += 5; break;
    case "syn_trenera": youthDevelopment += 8; coaching += 8; break;
    case "hospodsky": motivation += 12; discipline -= 5; break;
  }

  const clamp = (v: number) => Math.min(75, Math.max(15, v));

  const localPlaces = BIRTHPLACES.slice(0, 12);
  const distantPlaces = BIRTHPLACES.slice(12);
  const birthplace = backstory === "pristehovalec"
    ? distantPlaces[rng.int(0, distantPlaces.length - 1)]
    : localPlaces[rng.int(0, localPlaces.length - 1)];

  return {
    age,
    coaching: clamp(coaching),
    motivation: clamp(motivation),
    tactics: clamp(tactics),
    youthDevelopment: clamp(youthDevelopment),
    discipline: clamp(discipline),
    reputation: rng.int(25, 50),
    bio,
    birthplace,
  };
}

function generateManagerFace(rng: Rng): Record<string, unknown> {
  const pick = <T,>(arr: T[]): T => arr[rng.int(0, arr.length - 1)];
  const r01 = () => rng.int(0, 100) / 100;

  const skinColors = ["#f2d6cb", "#ddb7a0", "#e8c4a0", "#f5d5c0", "#d4a882"];
  const hairColors = ["#3b2214", "#5b3a1a", "#8b6e3e", "#8e8e8e", "#b0b0b0"];
  const headIds = ["head1", "head3", "head6", "head8", "head9", "head10", "head11", "head13"];
  const eyeIds = ["eye1", "eye3", "eye6", "eye9", "eye11", "eye13"];
  const noseIds = ["nose1", "nose2", "nose6", "nose9", "nose13", "honker"];
  const mouthIds = ["mouth", "mouth2", "mouth3", "smile3", "straight", "closed"];
  const hairIds = ["short-fade", "crop-fade2", "spike4", "short-bald"];
  const earIds = ["ear1", "ear2", "ear3"];
  const eyebrowIds = ["eyebrow2", "eyebrow3", "eyebrow7", "eyebrow10", "eyebrow14"];

  const skinColor = pick(skinColors);
  const bald = r01() < 0.35;

  return {
    fatness: 0.3 + r01() * 0.35,
    teamColors: ["#555555", "#FFFFFF", "#333333"],
    hairBg: { id: "none" },
    body: { id: pick(["body", "body2", "body3"]), color: skinColor, size: 0.95 + r01() * 0.1 },
    jersey: { id: "jersey" },
    ear: { id: pick(earIds), size: 0.6 + r01() * 0.4 },
    head: { id: pick(headIds), shave: "rgba(0,0,0,0)", fatness: 0.3 + r01() * 0.3 },
    eyeLine: { id: pick(["line1", "line2", "line3"]) },
    smileLine: { id: pick(["line1", "line2"]), size: 0.9 + r01() * 0.3 },
    miscLine: { id: "none" },
    facialHair: { id: r01() < 0.4 ? pick(["goatee3", "goatee4", "fullgoatee2"]) : "none" },
    eye: { id: pick(eyeIds), angle: -3 + r01() * 6 },
    eyebrow: { id: pick(eyebrowIds), angle: -3 + r01() * 6 },
    hair: { id: bald ? "short-bald" : pick(hairIds), color: pick(hairColors), flip: r01() < 0.5 },
    mouth: { id: pick(mouthIds), flip: r01() < 0.5 },
    nose: { id: pick(noseIds), flip: r01() < 0.5, size: 0.7 + r01() * 0.5 },
    glasses: { id: r01() < 0.15 ? "glasses1" : "none" },
    accessories: { id: "none" },
  };
}
