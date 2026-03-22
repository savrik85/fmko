/**
 * Centrální registr povolání — povolání dle velikosti obce.
 *
 * Každé povolání má metadata ovlivňující gameplay:
 * - villages: kde se vyskytuje
 * - weight: relativní četnost
 * - injuryRisk/overtimeRisk: vliv na absence
 * - strengthBonus: vliv na fyzické atributy
 * - excuses: profesní SMS výmluvy
 */

import type { Rng } from "./rng";

type VillageSize = "hamlet" | "village" | "town" | "small_city" | "city";

export interface Occupation {
  id: string;
  name: string;
  villages: VillageSize[];
  weight: number;
  injuryRisk: number;    // 0-1
  overtimeRisk: number;  // 0-1
  strengthBonus: number; // -2 to +3
  excuses: string[];     // Profesní SMS výmluvy
}

const ALL: VillageSize[] = ["hamlet", "village", "town", "small_city", "city"];
const RURAL: VillageSize[] = ["hamlet", "village"];
const RURAL_TOWN: VillageSize[] = ["hamlet", "village", "town"];
const TOWN_UP: VillageSize[] = ["town", "small_city", "city"];
const CITY: VillageSize[] = ["small_city", "city"];

export const OCCUPATIONS: Occupation[] = [
  // ═══════════════════════════════════════
  // VESNICKÁ POVOLÁNÍ (hamlet + village)
  // ═══════════════════════════════════════
  {
    id: "zemedelec", name: "Zemědělec", villages: RURAL, weight: 3,
    injuryRisk: 0.3, overtimeRisk: 0.5, strengthBonus: 2,
    excuses: [
      "Musim orat, vítr se otočil a jsou ideální podmínky",
      "Kráva telí, nemůžu od ní odejít",
      "Kombajn se rozbil uprostřed pole, čekám na mechanika",
      "Musím stříkat, jinak přijdu o úrodu",
      "Seno musí být dneska svezený, prší od zítřka",
    ],
  },
  {
    id: "traktorista", name: "Traktorista", villages: RURAL, weight: 2,
    injuryRisk: 0.2, overtimeRisk: 0.6, strengthBonus: 1,
    excuses: [
      "Traktor se rozbil na poli, čekám na odtah",
      "Musím dojet naftu, pumpa zavírá v pět",
      "Oru sousedovi pole, slíbil jsem mu to už třikrát",
      "Vlečka má defekt, musím to řešit",
    ],
  },
  {
    id: "lesni_delnik", name: "Lesní dělník", villages: RURAL, weight: 2,
    injuryRisk: 0.5, overtimeRisk: 0.3, strengthBonus: 3,
    excuses: [
      "Kácíme smrky, nemůžu odejít uprostřed",
      "Musím odvézt dřevo, náklaďák jede jen dneska",
      "Praskla mi motorovka, musím do servisu v Klatovech",
    ],
  },
  {
    id: "drevorubec", name: "Dřevorubec", villages: RURAL, weight: 1,
    injuryRisk: 0.6, overtimeRisk: 0.3, strengthBonus: 3,
    excuses: [
      "Spadl strom špatným směrem, musím to uklidit",
      "Mám zakázku na palivový dřevo, deadline je zítra",
    ],
  },
  {
    id: "vcelar", name: "Včelař", villages: RURAL, weight: 1,
    injuryRisk: 0.1, overtimeRisk: 0.2, strengthBonus: 0,
    excuses: [
      "Rojí se mi včely, musím je chytit než odletí",
      "Musím stáčet med, je nejvyšší čas",
      "Včely jsou agresivní, nemůžu od úlů odejít",
    ],
  },
  {
    id: "chovatel", name: "Chovatel", villages: RURAL, weight: 2,
    injuryRisk: 0.2, overtimeRisk: 0.4, strengthBonus: 1,
    excuses: [
      "Prasnice se prosila, musím být u toho",
      "Utekla mi koza, honím ji po vsi",
      "Veterinář přijede jen dneska, musím být doma",
      "Slepice přestaly nést, musím zjistit proč",
    ],
  },
  {
    id: "kombajner", name: "Kombajnér", villages: RURAL, weight: 1,
    injuryRisk: 0.2, overtimeRisk: 0.7, strengthBonus: 1,
    excuses: [
      "Žně nečekají, musím jet dokud je sucho",
      "Kombajn je objednanej, nemůžu ho vrátit",
    ],
  },
  {
    id: "myslivec", name: "Myslivec", villages: RURAL, weight: 1,
    injuryRisk: 0.15, overtimeRisk: 0.2, strengthBonus: 0,
    excuses: [
      "Mám naháňku na divočáky, je nás málo",
      "Musím na posed, dneska je říje",
      "Vlk se potlouká u vesnice, musíme hlídkovat",
    ],
  },
  {
    id: "kovar", name: "Kovář", villages: RURAL, weight: 0.5,
    injuryRisk: 0.4, overtimeRisk: 0.3, strengthBonus: 3,
    excuses: [
      "Musím dokovat mříž, slíbil jsem to na pondělí",
      "Rozjel se mi oheň ve výhni, nemůžu to nechat",
    ],
  },
  {
    id: "hajny", name: "Hajný", villages: RURAL, weight: 1,
    injuryRisk: 0.1, overtimeRisk: 0.3, strengthBonus: 1,
    excuses: [
      "Mám obchůzku, pytláci zase řádí",
      "Musím počítat zvěř pro statistiku",
      "Spadlý strom blokuje cestu, musím to řešit",
    ],
  },
  {
    id: "spravce_rybniku", name: "Správce rybníka", villages: RURAL, weight: 0.5,
    injuryRisk: 0.1, overtimeRisk: 0.2, strengthBonus: 0,
    excuses: [
      "Výlov je tento víkend, nemůžu chybět",
      "Hráz teče, musím to zastavit než to bude horší",
    ],
  },
  {
    id: "sadar", name: "Sadař", villages: RURAL, weight: 0.5,
    injuryRisk: 0.2, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      "Musím česat jablka, padaj ze stromů",
      "Stříkání stromů se nedá odložit",
    ],
  },
  {
    id: "sezonni_delnik", name: "Sezonní dělník", villages: RURAL, weight: 1.5,
    injuryRisk: 0.3, overtimeRisk: 0.5, strengthBonus: 1,
    excuses: [
      "Mám brigádu, nemůžu si dovolit přijít o prachy",
      "Šéf zavolal že mě potřebuje, nemůžu říct ne",
    ],
  },
  {
    id: "chalupar", name: "Chalupář", villages: RURAL, weight: 0.5,
    injuryRisk: 0.2, overtimeRisk: 0.1, strengthBonus: 0,
    excuses: [
      "Opravuju střechu na chalupě, musím to dodělat než zaprší",
      "Přijeli hosté na chalupu, musím se o ně postarat",
    ],
  },

  // ═══════════════════════════════════════
  // ŘEMESLNÁ POVOLÁNÍ (village+)
  // ═══════════════════════════════════════
  {
    id: "zednik", name: "Zedník", villages: ["village", "town", "small_city", "city"], weight: 2.5,
    injuryRisk: 0.4, overtimeRisk: 0.5, strengthBonus: 2,
    excuses: [
      "Lijeme beton, nemůže to čekat",
      "Musím dodělat zeď, zákazník tlačí",
      "Lešení se rozklížilo, musím to opravit",
    ],
  },
  {
    id: "tesar", name: "Tesař", villages: ["village", "town", "small_city", "city"], weight: 1.5,
    injuryRisk: 0.4, overtimeRisk: 0.4, strengthBonus: 2,
    excuses: [
      "Stavíme krov, nemůžu nechat kluky samotný",
      "Dřevo přivezli o den dřív, musím ho zpracovat",
    ],
  },
  {
    id: "truhlar", name: "Truhlář", villages: ["village", "town", "small_city", "city"], weight: 1.5,
    injuryRisk: 0.25, overtimeRisk: 0.3, strengthBonus: 1,
    excuses: [
      "Dokončuju kuchyň, zákazník si stěžuje na zpoždění",
      "Lak schne a musím nanést druhou vrstvu přesně za 4 hodiny",
    ],
  },
  {
    id: "instalater", name: "Instalatér", villages: ["village", "town", "small_city", "city"], weight: 1.5,
    injuryRisk: 0.2, overtimeRisk: 0.4, strengthBonus: 0,
    excuses: [
      "Havarijní výjezd, sousedům teče strop",
      "Musím dodělat topení, lidi by zmrzli",
    ],
  },
  {
    id: "pokryvac", name: "Pokrývač", villages: ["village", "town", "small_city", "city"], weight: 1,
    injuryRisk: 0.5, overtimeRisk: 0.4, strengthBonus: 1,
    excuses: [
      "Musím dodělat střechu, prší od zítřka",
      "Spadla mi taška, musím to hned opravit než zateče",
    ],
  },
  {
    id: "reznik", name: "Řezník", villages: ["village", "town", "small_city", "city"], weight: 1.5,
    injuryRisk: 0.3, overtimeRisk: 0.3, strengthBonus: 2,
    excuses: [
      "Přijela svině na porážku, to se nedá odložit",
      "Musím udělat klobásy na objednávku",
      "Bourám maso, přivezli ho pozdě",
    ],
  },
  {
    id: "pekar", name: "Pekař", villages: ["village", "town", "small_city", "city"], weight: 1,
    injuryRisk: 0.15, overtimeRisk: 0.5, strengthBonus: 0,
    excuses: [
      "Musím péct na ráno, těsto kyne",
      "Pec se porouchala, nemůžu odejít",
    ],
  },
  {
    id: "hospodsky", name: "Hospodský", villages: ["village", "town", "small_city", "city"], weight: 1.5,
    injuryRisk: 0.05, overtimeRisk: 0.4, strengthBonus: 0,
    excuses: [
      "Nemám záskok za bar",
      "Dneska je karaoke, nemůžu zavřít",
      "Přijela inspekce, musím být v hospodě",
    ],
  },
  {
    id: "prodavac", name: "Prodavač", villages: ["village", "town", "small_city", "city"], weight: 1.5,
    injuryRisk: 0.05, overtimeRisk: 0.3, strengthBonus: -1,
    excuses: [
      "Inventura, musím počítat zboží",
      "Kolegyně onemocněla, musím ji zastoupit",
    ],
  },
  {
    id: "automechanik", name: "Automechanik", villages: ["village", "town", "small_city", "city"], weight: 2,
    injuryRisk: 0.3, overtimeRisk: 0.4, strengthBonus: 1,
    excuses: [
      "Zákazník potřebuje auto na pondělí, musím to dodělat",
      "Rozebral jsem motor a nemůžu to nechat rozloženýho",
    ],
  },
  {
    id: "svarac", name: "Svářeč", villages: ["village", "town", "small_city", "city"], weight: 1,
    injuryRisk: 0.4, overtimeRisk: 0.4, strengthBonus: 1,
    excuses: [
      "Svařuju bránu, nemůžu to nechat napůl",
      "Musím dodělat zábradlí, slíbil jsem to na víkend",
    ],
  },
  {
    id: "malir_pokoju", name: "Malíř pokojů", villages: ["village", "town", "small_city", "city"], weight: 1,
    injuryRisk: 0.1, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      "Maluju byt, barva schne a musím nanést další vrstvu",
      "Zákazník chce hotovo do pondělka",
    ],
  },
  {
    id: "postovni", name: "Poštovní doručovatel", villages: ["village", "town", "small_city"], weight: 0.5,
    injuryRisk: 0.1, overtimeRisk: 0.2, strengthBonus: 0,
    excuses: [
      "Mám přesčas, balíků je jak o Vánocích",
      "Kolega je na nemocenský, jedu dvě trasy",
    ],
  },
  {
    id: "spravce_hriste", name: "Správce hřiště", villages: ALL, weight: 0.3,
    injuryRisk: 0.1, overtimeRisk: 0.2, strengthBonus: 0,
    excuses: [
      "Musím posekat trávník před zítřejším zápasem... mládeže",
      "Zalévám, potrubí prasklo",
    ],
  },

  // ═══════════════════════════════════════
  // MĚSTSKÁ POVOLÁNÍ (town+)
  // ═══════════════════════════════════════
  {
    id: "ridic_kamionu", name: "Řidič kamionu", villages: TOWN_UP, weight: 2,
    injuryRisk: 0.15, overtimeRisk: 0.7, strengthBonus: 0,
    excuses: [
      "Jsem v Německu, vracím se až v neděli večer",
      "Dodávka se zdržela, nemůžu odstavit kamion",
      "Šéf mě poslal na extra jízdu, nemohl jsem odmítnout",
    ],
  },
  {
    id: "elektrikar", name: "Elektrikář", villages: TOWN_UP, weight: 1.5,
    injuryRisk: 0.25, overtimeRisk: 0.4, strengthBonus: 0,
    excuses: [
      "Havarijní výjezd, někde spadl stožár",
      "Musím dodělat rozvody, jinak lidi nebudou mít proud",
    ],
  },
  {
    id: "hasic", name: "Hasič", villages: TOWN_UP, weight: 1,
    injuryRisk: 0.2, overtimeRisk: 0.3, strengthBonus: 2,
    excuses: [
      "Máme pohotovost, nemůžu odejít ze stanice",
      "Výjezd k požáru, sorry",
    ],
  },
  {
    id: "policista", name: "Policista", villages: TOWN_UP, weight: 1,
    injuryRisk: 0.15, overtimeRisk: 0.4, strengthBonus: 1,
    excuses: [
      "Mám službu, nedomluvil jsem si výměnu",
      "Vyšetřujeme případ, nemůžu odejít",
    ],
  },
  {
    id: "kuchar", name: "Kuchař", villages: TOWN_UP, weight: 1.5,
    injuryRisk: 0.15, overtimeRisk: 0.4, strengthBonus: 0,
    excuses: [
      "Máme plný restauraci, nemůžu odejít od plotny",
      "Kolega onemocněl, vařím sám",
    ],
  },
  {
    id: "cisnik", name: "Číšník", villages: TOWN_UP, weight: 1,
    injuryRisk: 0.05, overtimeRisk: 0.4, strengthBonus: -1,
    excuses: [
      "Máme svatbu v restauraci, potřebují mě",
      "Šéf mě nemůže uvolnit, je plno",
    ],
  },
  {
    id: "skladnik", name: "Skladník", villages: TOWN_UP, weight: 1.5,
    injuryRisk: 0.2, overtimeRisk: 0.5, strengthBonus: 1,
    excuses: [
      "Přijela dodávka, musím to naskladnit",
      "Inventura, nemůžu odejít",
    ],
  },
  {
    id: "zachranar", name: "Záchranář", villages: TOWN_UP, weight: 0.5,
    injuryRisk: 0.1, overtimeRisk: 0.3, strengthBonus: 1,
    excuses: [
      "Mám službu na záchrance",
      "Kolega onemocněl, musím ho zastoupit",
    ],
  },
  {
    id: "strojni_inzenyr", name: "Strojní inženýr", villages: TOWN_UP, weight: 0.5,
    injuryRisk: 0.1, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      "Mám deadline na projekt, musím to dokončit",
    ],
  },
  {
    id: "podnikatel", name: "Podnikatel", villages: TOWN_UP, weight: 1,
    injuryRisk: 0.05, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      "Mám jednání s odběratelem, nemůžu zrušit",
      "Daňový poradce přijede jen dneska",
    ],
  },

  // ═══════════════════════════════════════
  // MĚSTSKÁ / KANCELÁŘSKÁ (city)
  // ═══════════════════════════════════════
  {
    id: "programator", name: "Programátor", villages: CITY, weight: 1,
    injuryRisk: 0.02, overtimeRisk: 0.3, strengthBonus: -2,
    excuses: [
      "Mám deploy na produkci, nemůžu odejít",
      "Padl server, musím to fixnout remote",
      "Sprint review, šéf trvá na tom že musím být",
    ],
  },
  {
    id: "ucetni", name: "Účetní", villages: CITY, weight: 1,
    injuryRisk: 0.02, overtimeRisk: 0.4, strengthBonus: -2,
    excuses: [
      "Uzávěrka, počítám do noci",
      "Přiznání k DPH musí být dneska",
    ],
  },
  {
    id: "ucitel", name: "Učitel", villages: TOWN_UP, weight: 1,
    injuryRisk: 0.05, overtimeRisk: 0.2, strengthBonus: -1,
    excuses: [
      "Mám dozor na školním výletě",
      "Rodičovská schůzka, nemůžu to zrušit",
    ],
  },
  {
    id: "urednik", name: "Úředník", villages: CITY, weight: 1,
    injuryRisk: 0.02, overtimeRisk: 0.2, strengthBonus: -2,
    excuses: [
      "Musím dodělat podklady pro zastupitelstvo",
      "Audit, nemůžu chybět",
    ],
  },

  // ═══════════════════════════════════════
  // UNIVERZÁLNÍ (věkové)
  // ═══════════════════════════════════════
  {
    id: "student", name: "Student", villages: ALL, weight: 0, // Přiřazuje se dle věku
    injuryRisk: 0.1, overtimeRisk: 0.1, strengthBonus: 0,
    excuses: [
      "Mám zkoušku zítra, musím se učit",
      "Rodiče mě nepustili",
      "Mám brigádu v McDonaldu, nemůžu si vzít volno",
    ],
  },
  {
    id: "nezamestnany", name: "Nezaměstnaný", villages: ALL, weight: 0.5,
    injuryRisk: 0.05, overtimeRisk: 0.05, strengthBonus: 0,
    excuses: [
      "Mám pohovor, nemůžu přijít",
      "Musím na úřad práce",
    ],
  },
  {
    id: "duchodce", name: "Důchodce", villages: ALL, weight: 0, // Přiřazuje se dle věku
    injuryRisk: 0.15, overtimeRisk: 0.0, strengthBonus: -1,
    excuses: [
      "Doktor mi zakázal běhat",
      "Mám vyšetření v nemocnici",
      "Hlídám vnoučata",
    ],
  },
];

/**
 * Pick occupation based on village size and player age.
 */
export function pickOccupation(rng: Rng, villageSize: string, age: number): Occupation {
  // Age overrides
  if (age < 20) return OCCUPATIONS.find((o) => o.id === "student")!;
  if (age > 55 && rng.random() < 0.4) return OCCUPATIONS.find((o) => o.id === "duchodce")!;

  // Filter by village size
  const available = OCCUPATIONS.filter(
    (o) => o.weight > 0 && o.villages.includes(villageSize as VillageSize)
  );

  if (available.length === 0) {
    // Fallback
    return OCCUPATIONS.find((o) => o.id === "nezamestnany")!;
  }

  // Weighted random selection
  const weights: Record<string, number> = {};
  for (const o of available) {
    weights[o.id] = o.weight;
  }

  const selectedId = rng.weighted(weights);
  return OCCUPATIONS.find((o) => o.id === selectedId) ?? available[0];
}

/**
 * Get occupation by ID.
 */
export function getOccupation(id: string): Occupation | undefined {
  return OCCUPATIONS.find((o) => o.id === id);
}

/**
 * Get occupation by name.
 */
export function getOccupationByName(name: string): Occupation | undefined {
  return OCCUPATIONS.find((o) => o.name === name);
}
