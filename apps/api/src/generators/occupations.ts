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
  /** Váha výběru per velikost obce — vyšší = častější. 0 = může se stát ale velmi vzácně */
  w: Record<VillageSize, number>;
  injuryRisk: number;    // 0-1
  overtimeRisk: number;  // 0-1
  strengthBonus: number; // -2 to +3
  excuses: string[];     // Profesní SMS výmluvy
}

// Shortcut pro váhy: hamlet, village, town, small_city, city
function W(h: number, v: number, t: number, s: number, c: number): Record<VillageSize, number> {
  return { hamlet: h, village: v, town: t, small_city: s, city: c };
}

export const OCCUPATIONS: Occupation[] = [
  // ═══════════════════════════════════════
  // PŘEVÁŽNĚ VESNICKÁ (vysoká váha hamlet/village, nízká město)
  //                       hamlet  village town  s_city city
  // ═══════════════════════════════════════
  {
    id: "zemedelec", name: "Zemědělec", w: W(5, 3, 1, 0.3, 0.1),
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
    id: "traktorista", name: "Traktorista", w: W(4, 2.5, 0.5, 0.2, 0.1),
    injuryRisk: 0.2, overtimeRisk: 0.6, strengthBonus: 1,
    excuses: [
      "Traktor se rozbil na poli, čekám na odtah",
      "Musím dojet naftu, pumpa zavírá v pět",
      "Oru sousedovi pole, slíbil jsem mu to už třikrát",
      "Vlečka má defekt, musím to řešit",
    ],
  },
  {
    id: "lesni_delnik", name: "Lesní dělník", w: W(4, 2.5, 0.5, 0.2, 0.1),
    injuryRisk: 0.5, overtimeRisk: 0.3, strengthBonus: 3,
    excuses: [
      "Kácíme smrky, nemůžu odejít uprostřed",
      "Musím odvézt dřevo, náklaďák jede jen dneska",
      "Praskla mi motorovka, musím do servisu v Klatovech",
    ],
  },
  {
    id: "drevorubec", name: "Dřevorubec", w: W(3, 1.5, 0.3, 0.1, 0),
    injuryRisk: 0.6, overtimeRisk: 0.3, strengthBonus: 3,
    excuses: [
      "Spadl strom špatným směrem, musím to uklidit",
      "Mám zakázku na palivový dřevo, deadline je zítra",
    ],
  },
  {
    id: "vcelar", name: "Včelař", w: W(3, 1.5, 0.3, 0.1, 0),
    injuryRisk: 0.1, overtimeRisk: 0.2, strengthBonus: 0,
    excuses: [
      "Rojí se mi včely, musím je chytit než odletí",
      "Musím stáčet med, je nejvyšší čas",
      "Včely jsou agresivní, nemůžu od úlů odejít",
    ],
  },
  {
    id: "chovatel", name: "Chovatel", w: W(4, 2.5, 0.5, 0.2, 0.1),
    injuryRisk: 0.2, overtimeRisk: 0.4, strengthBonus: 1,
    excuses: [
      "Prasnice se prosila, musím být u toho",
      "Utekla mi koza, honím ji po vsi",
      "Veterinář přijede jen dneska, musím být doma",
      "Slepice přestaly nést, musím zjistit proč",
    ],
  },
  {
    id: "kombajner", name: "Kombajnér", w: W(3, 1.5, 0.3, 0.1, 0),
    injuryRisk: 0.2, overtimeRisk: 0.7, strengthBonus: 1,
    excuses: [
      "Žně nečekají, musím jet dokud je sucho",
      "Kombajn je objednanej, nemůžu ho vrátit",
    ],
  },
  {
    id: "myslivec", name: "Myslivec", w: W(3, 1.5, 0.3, 0.1, 0),
    injuryRisk: 0.15, overtimeRisk: 0.2, strengthBonus: 0,
    excuses: [
      "Mám naháňku na divočáky, je nás málo",
      "Musím na posed, dneska je říje",
      "Vlk se potlouká u vesnice, musíme hlídkovat",
    ],
  },
  {
    id: "kovar", name: "Kovář", w: W(2, 1, 0.2, 0.1, 0),
    injuryRisk: 0.4, overtimeRisk: 0.3, strengthBonus: 3,
    excuses: [
      "Musím dokovat mříž, slíbil jsem to na pondělí",
      "Rozjel se mi oheň ve výhni, nemůžu to nechat",
    ],
  },
  {
    id: "hajny", name: "Hajný", w: W(3, 1.5, 0.3, 0.1, 0),
    injuryRisk: 0.1, overtimeRisk: 0.3, strengthBonus: 1,
    excuses: [
      "Mám obchůzku, pytláci zase řádí",
      "Musím počítat zvěř pro statistiku",
      "Spadlý strom blokuje cestu, musím to řešit",
    ],
  },
  {
    id: "spravce_rybniku", name: "Správce rybníka", w: W(2, 1, 0.2, 0.1, 0),
    injuryRisk: 0.1, overtimeRisk: 0.2, strengthBonus: 0,
    excuses: [
      "Výlov je tento víkend, nemůžu chybět",
      "Hráz teče, musím to zastavit než to bude horší",
    ],
  },
  {
    id: "sadar", name: "Sadař", w: W(2, 1, 0.2, 0.1, 0),
    injuryRisk: 0.2, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      "Musím česat jablka, padaj ze stromů",
      "Stříkání stromů se nedá odložit",
    ],
  },
  {
    id: "sezonni_delnik", name: "Sezonní dělník", w: W(3.5, 2, 0.5, 0.2, 0.1),
    injuryRisk: 0.3, overtimeRisk: 0.5, strengthBonus: 1,
    excuses: [
      "Mám brigádu, nemůžu si dovolit přijít o prachy",
      "Šéf zavolal že mě potřebuje, nemůžu říct ne",
    ],
  },
  {
    id: "chalupar", name: "Chalupář", w: W(2, 1, 0.2, 0.1, 0),
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
    id: "zednik", name: "Zedník", w: W(2, 2.5, 2.5, 2, 1.5),
    injuryRisk: 0.4, overtimeRisk: 0.5, strengthBonus: 2,
    excuses: [
      "Lijeme beton, nemůže to čekat",
      "Musím dodělat zeď, zákazník tlačí",
      "Lešení se rozklížilo, musím to opravit",
    ],
  },
  {
    id: "tesar", name: "Tesař", w: W(1.5, 1.5, 1.5, 1.5, 1),
    injuryRisk: 0.4, overtimeRisk: 0.4, strengthBonus: 2,
    excuses: [
      "Stavíme krov, nemůžu nechat kluky samotný",
      "Dřevo přivezli o den dřív, musím ho zpracovat",
    ],
  },
  {
    id: "truhlar", name: "Truhlář", w: W(0.5, 1.5, 1.5, 1.5, 1),
    injuryRisk: 0.25, overtimeRisk: 0.3, strengthBonus: 1,
    excuses: [
      "Dokončuju kuchyň, zákazník si stěžuje na zpoždění",
      "Lak schne a musím nanést druhou vrstvu přesně za 4 hodiny",
    ],
  },
  {
    id: "instalater", name: "Instalatér", w: W(0.5, 1.5, 1.5, 1.5, 1),
    injuryRisk: 0.2, overtimeRisk: 0.4, strengthBonus: 0,
    excuses: [
      "Havarijní výjezd, sousedům teče strop",
      "Musím dodělat topení, lidi by zmrzli",
    ],
  },
  {
    id: "pokryvac", name: "Pokrývač", w: W(0.3, 1, 1, 1, 0.8),
    injuryRisk: 0.5, overtimeRisk: 0.4, strengthBonus: 1,
    excuses: [
      "Musím dodělat střechu, prší od zítřka",
      "Spadla mi taška, musím to hned opravit než zateče",
    ],
  },
  {
    id: "reznik", name: "Řezník", w: W(0.5, 1.5, 1.5, 1.5, 1),
    injuryRisk: 0.3, overtimeRisk: 0.3, strengthBonus: 2,
    excuses: [
      "Přijela svině na porážku, to se nedá odložit",
      "Musím udělat klobásy na objednávku",
      "Bourám maso, přivezli ho pozdě",
    ],
  },
  {
    id: "pekar", name: "Pekař", w: W(0.3, 1, 1, 1, 0.8),
    injuryRisk: 0.15, overtimeRisk: 0.5, strengthBonus: 0,
    excuses: [
      "Musím péct na ráno, těsto kyne",
      "Pec se porouchala, nemůžu odejít",
    ],
  },
  {
    id: "hospodsky", name: "Hospodský", w: W(0.5, 1.5, 1.5, 1.5, 1),
    injuryRisk: 0.05, overtimeRisk: 0.4, strengthBonus: 0,
    excuses: [
      "Nemám záskok za bar",
      "Dneska je karaoke, nemůžu zavřít",
      "Přijela inspekce, musím být v hospodě",
    ],
  },
  {
    id: "prodavac", name: "Prodavač", w: W(0.5, 1.5, 1.5, 1.5, 1),
    injuryRisk: 0.05, overtimeRisk: 0.3, strengthBonus: -1,
    excuses: [
      "Inventura, musím počítat zboží",
      "Kolegyně onemocněla, musím ji zastoupit",
    ],
  },
  {
    id: "automechanik", name: "Automechanik", w: W(1.5, 2, 2, 1.5, 1),
    injuryRisk: 0.3, overtimeRisk: 0.4, strengthBonus: 1,
    excuses: [
      "Zákazník potřebuje auto na pondělí, musím to dodělat",
      "Rozebral jsem motor a nemůžu to nechat rozloženýho",
    ],
  },
  {
    id: "svarac", name: "Svářeč", w: W(0.3, 1, 1, 1, 0.8),
    injuryRisk: 0.4, overtimeRisk: 0.4, strengthBonus: 1,
    excuses: [
      "Svařuju bránu, nemůžu to nechat napůl",
      "Musím dodělat zábradlí, slíbil jsem to na víkend",
    ],
  },
  {
    id: "malir_pokoju", name: "Malíř pokojů", w: W(0.3, 1, 1, 1, 0.8),
    injuryRisk: 0.1, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      "Maluju byt, barva schne a musím nanést další vrstvu",
      "Zákazník chce hotovo do pondělka",
    ],
  },
  {
    id: "postovni", name: "Poštovní doručovatel", w: W(0.2, 0.5, 0.5, 0.5, 0.3),
    injuryRisk: 0.1, overtimeRisk: 0.2, strengthBonus: 0,
    excuses: [
      "Mám přesčas, balíků je jak o Vánocích",
      "Kolega je na nemocenský, jedu dvě trasy",
    ],
  },
  {
    id: "spravce_hriste", name: "Správce hřiště", w: W(0.3, 0.3, 0.3, 0.3, 0.3),
    injuryRisk: 0.1, overtimeRisk: 0.2, strengthBonus: 0,
    excuses: [
      "Musím posekat trávník před zítřejším zápasem... mládeže",
      "Zalévám, potrubí prasklo",
    ],
  },

  {
    id: "obchodnik", name: "Obchodník", w: W(0.5, 1, 1.5, 1.5, 1),
    injuryRisk: 0.05, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      "Mám jednání s dodavatelem, nemůžu zrušit",
      "Jedu na veletrh, vracím se až večer",
    ],
  },
  {
    id: "opravarOS", name: "Opravář", w: W(1, 1.5, 1, 0.5, 0.3),
    injuryRisk: 0.2, overtimeRisk: 0.3, strengthBonus: 1,
    excuses: [
      "Opravuju čerpadlo, nemůžu to nechat rozloženýho",
      "Volali mě k havárii, musím jet hned",
    ],
  },
  {
    id: "zahradnik", name: "Zahradník", w: W(1.5, 1.5, 1, 0.5, 0.3),
    injuryRisk: 0.15, overtimeRisk: 0.2, strengthBonus: 1,
    excuses: [
      "Musím zasadit stromy, přišly ze školky",
      "Stříhám živý plot, zákazník tlačí na termín",
    ],
  },
  {
    id: "ridic_autobusu", name: "Řidič autobusu", w: W(0.5, 1, 1.5, 1.5, 1),
    injuryRisk: 0.05, overtimeRisk: 0.5, strengthBonus: 0,
    excuses: [
      "Mám směnu, jezdím do Prachatic a zpět",
      "Kolega nepřišel, musím ho zastoupit",
    ],
  },
  {
    id: "stolar", name: "Stolař", w: W(1, 1.5, 1, 0.5, 0.3),
    injuryRisk: 0.25, overtimeRisk: 0.3, strengthBonus: 1,
    excuses: [
      "Dodělávám schody, zákazník stěhuje za týden",
      "Musím nařezat materiál, fréza je volná jen dneska",
    ],
  },
  {
    id: "mistr_v_tovarne", name: "Mistr v továrně", w: W(0.3, 1, 2, 2, 1.5),
    injuryRisk: 0.15, overtimeRisk: 0.5, strengthBonus: 0,
    excuses: [
      "Máme přesčas v továrně, šéf nás nepustí",
      "Porouchala se linka, musím to řešit",
    ],
  },
  {
    id: "delnik_v_pile", name: "Dělník v pile", w: W(2, 1.5, 0.5, 0.2, 0),
    injuryRisk: 0.4, overtimeRisk: 0.4, strengthBonus: 2,
    excuses: [
      "Pořezali jsme velkou zakázku, musíme to dodělat",
      "Přivezli kmeny, musím je zpracovat dokud je čerstvý",
    ],
  },
  {
    id: "delnik_v_kamenolomu", name: "Dělník v kamenolomu", w: W(1, 0.5, 0.3, 0.1, 0),
    injuryRisk: 0.5, overtimeRisk: 0.4, strengthBonus: 3,
    excuses: [
      "Odstřel se posunul na dnešek, musím být na místě",
      "Nakládáme štěrk, kamion čeká",
    ],
  },

  // ═══════════════════════════════════════
  // MĚSTSKÁ POVOLÁNÍ (town+)
  // ═══════════════════════════════════════
  {
    id: "ridic_kamionu", name: "Řidič kamionu", w: W(0.2, 0.5, 2, 2, 1.5),
    injuryRisk: 0.15, overtimeRisk: 0.7, strengthBonus: 0,
    excuses: [
      "Jsem v Německu, vracím se až v neděli večer",
      "Dodávka se zdržela, nemůžu odstavit kamion",
      "Šéf mě poslal na extra jízdu, nemohl jsem odmítnout",
    ],
  },
  {
    id: "elektrikar", name: "Elektrikář", w: W(0.1, 0.3, 1.5, 1.5, 1.5),
    injuryRisk: 0.25, overtimeRisk: 0.4, strengthBonus: 0,
    excuses: [
      "Havarijní výjezd, někde spadl stožár",
      "Musím dodělat rozvody, jinak lidi nebudou mít proud",
    ],
  },
  {
    id: "hasic", name: "Hasič", w: W(0.1, 0.3, 1, 1, 1),
    injuryRisk: 0.2, overtimeRisk: 0.3, strengthBonus: 2,
    excuses: [
      "Máme pohotovost, nemůžu odejít ze stanice",
      "Výjezd k požáru, sorry",
    ],
  },
  {
    id: "policista", name: "Policista", w: W(0.1, 0.3, 1, 1, 1),
    injuryRisk: 0.15, overtimeRisk: 0.4, strengthBonus: 1,
    excuses: [
      "Mám službu, nedomluvil jsem si výměnu",
      "Vyšetřujeme případ, nemůžu odejít",
    ],
  },
  {
    id: "kuchar", name: "Kuchař", w: W(0.1, 0.3, 1.5, 1.5, 1.5),
    injuryRisk: 0.15, overtimeRisk: 0.4, strengthBonus: 0,
    excuses: [
      "Máme plný restauraci, nemůžu odejít od plotny",
      "Kolega onemocněl, vařím sám",
    ],
  },
  {
    id: "cisnik", name: "Číšník", w: W(0.1, 0.3, 1, 1, 1),
    injuryRisk: 0.05, overtimeRisk: 0.4, strengthBonus: -1,
    excuses: [
      "Máme svatbu v restauraci, potřebují mě",
      "Šéf mě nemůže uvolnit, je plno",
    ],
  },
  {
    id: "skladnik", name: "Skladník", w: W(0.1, 0.3, 1.5, 1.5, 1.5),
    injuryRisk: 0.2, overtimeRisk: 0.5, strengthBonus: 1,
    excuses: [
      "Přijela dodávka, musím to naskladnit",
      "Inventura, nemůžu odejít",
    ],
  },
  {
    id: "zachranar", name: "Záchranář", w: W(0, 0.1, 0.5, 0.5, 0.5),
    injuryRisk: 0.1, overtimeRisk: 0.3, strengthBonus: 1,
    excuses: [
      "Mám službu na záchrance",
      "Kolega onemocněl, musím ho zastoupit",
    ],
  },
  {
    id: "strojni_inzenyr", name: "Strojní inženýr", w: W(0, 0.1, 0.5, 0.5, 0.5),
    injuryRisk: 0.1, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      "Mám deadline na projekt, musím to dokončit",
    ],
  },
  {
    id: "podnikatel", name: "Podnikatel", w: W(0.1, 0.3, 1, 1, 1),
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
    id: "programator", name: "Programátor", w: W(0, 0.1, 0.3, 1, 1.5),
    injuryRisk: 0.02, overtimeRisk: 0.3, strengthBonus: -2,
    excuses: [
      "Mám deploy na produkci, nemůžu odejít",
      "Padl server, musím to fixnout remote",
      "Sprint review, šéf trvá na tom že musím být",
    ],
  },
  {
    id: "ucetni", name: "Účetní", w: W(0, 0.1, 0.3, 1, 1.5),
    injuryRisk: 0.02, overtimeRisk: 0.4, strengthBonus: -2,
    excuses: [
      "Uzávěrka, počítám do noci",
      "Přiznání k DPH musí být dneska",
    ],
  },
  {
    id: "ucitel", name: "Učitel", w: W(0.1, 0.3, 1, 1, 1),
    injuryRisk: 0.05, overtimeRisk: 0.2, strengthBonus: -1,
    excuses: [
      "Mám dozor na školním výletě",
      "Rodičovská schůzka, nemůžu to zrušit",
    ],
  },
  {
    id: "urednik", name: "Úředník", w: W(0, 0.1, 0.3, 1, 1.5),
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
    id: "student", name: "Student", w: W(0, 0, 0, 0, 0), // Přiřazuje se dle věku
    injuryRisk: 0.1, overtimeRisk: 0.1, strengthBonus: 0,
    excuses: [
      "Mám zkoušku zítra, musím se učit",
      "Rodiče mě nepustili",
      "Mám brigádu v McDonaldu, nemůžu si vzít volno",
    ],
  },
  {
    id: "nezamestnany", name: "Nezaměstnaný", w: W(0.5, 0.5, 0.5, 0.5, 0.5),
    injuryRisk: 0.05, overtimeRisk: 0.05, strengthBonus: 0,
    excuses: [
      "Mám pohovor, nemůžu přijít",
      "Musím na úřad práce",
    ],
  },
  {
    id: "duchodce", name: "Důchodce", w: W(0, 0, 0, 0, 0), // Přiřazuje se dle věku
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

  const size = (villageSize as VillageSize) || "village";

  // All occupations available everywhere — just with different weights
  const weights: Record<string, number> = {};
  for (const o of OCCUPATIONS) {
    const w = o.w[size] ?? 0;
    if (w > 0) weights[o.id] = w;
  }

  const selectedId = rng.weighted(weights);
  return OCCUPATIONS.find((o) => o.id === selectedId) ?? OCCUPATIONS.find((o) => o.id === "nezamestnany")!;
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
