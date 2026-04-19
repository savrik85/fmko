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
    id: "zemedelec", name: "Zemědělec", w: W(5, 3, 0, 0, 0),
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
    id: "traktorista", name: "Traktorista", w: W(4, 2.5, 0, 0, 0),
    injuryRisk: 0.2, overtimeRisk: 0.6, strengthBonus: 1,
    excuses: [
      "Traktor se rozbil na poli, čekám na odtah",
      "Musím dojet naftu, pumpa zavírá v pět",
      "Oru sousedovi pole, slíbil jsem mu to už třikrát",
      "Vlečka má defekt, musím to řešit",
      "Hydraulika přestala fungovat, nezvednu radlici",
      "Musím odvézt brambory do sklepa než začnou mrznout",
      "Šéf poslal dělat cesty, nemůžu odjet",
    ],
  },
  {
    id: "lesni_delnik", name: "Lesní dělník", w: W(4, 2.5, 0, 0, 0),
    injuryRisk: 0.5, overtimeRisk: 0.3, strengthBonus: 3,
    excuses: [
      "Kácíme smrky, nemůžu odejít uprostřed",
      "Musím odvézt dřevo, náklaďák jede jen dneska",
      "Praskla mi motorovka, musím do servisu v Klatovech",
      "Honíme kůrovce, nemůžu nechat kluky samotný",
      "Musím vyčistit paseku, revír chce hotovo do pátku",
    ],
  },
  {
    id: "drevorubec", name: "Dřevorubec", w: W(3, 1.5, 0, 0, 0),
    injuryRisk: 0.6, overtimeRisk: 0.3, strengthBonus: 3,
    excuses: [
      "Spadl strom špatným směrem, musím to uklidit",
      "Mám zakázku na palivový dřevo, deadline je zítra",
      "Zákazník si objednal pokácení, nemůžu odmítnout",
      "Dostala mě motorová pila, píchla do boty",
      "Musím štípat pro zákazníka, chce to před mrazy",
    ],
  },
  {
    id: "vcelar", name: "Včelař", w: W(3, 1.5, 0, 0, 0),
    injuryRisk: 0.1, overtimeRisk: 0.2, strengthBonus: 0,
    excuses: [
      "Rojí se mi včely, musím je chytit než odletí",
      "Musím stáčet med, je nejvyšší čas",
      "Včely jsou agresivní, nemůžu od úlů odejít",
      "Dneska mám kontrolu veterináře, musím být u úlů",
      "Jeden úl napadly sršně, řeším to celý den",
    ],
  },
  {
    id: "chovatel", name: "Chovatel", w: W(4, 2.5, 0, 0, 0),
    injuryRisk: 0.2, overtimeRisk: 0.4, strengthBonus: 1,
    excuses: [
      "Prasnice se prosila, musím být u toho",
      "Utekla mi koza, honím ji po vsi",
      "Veterinář přijede jen dneska, musím být doma",
      "Slepice přestaly nést, musím zjistit proč",
      "Přijela zkontrolovat hygiena, nemůžu od ní odejít",
    ],
  },
  {
    id: "kombajner", name: "Kombajnér", w: W(3, 1.5, 0, 0, 0),
    injuryRisk: 0.2, overtimeRisk: 0.7, strengthBonus: 1,
    excuses: [
      "Žně nečekají, musím jet dokud je sucho",
      "Kombajn je objednanej, nemůžu ho vrátit",
      "Zasekla se mi zrnovod, řeším to už druhou hodinu",
      "Družstvo tlačí na dodávku, jedu do tmy",
      "Stíhám poslední pole než přijde déšť",
    ],
  },
  {
    id: "myslivec", name: "Myslivec", w: W(3, 1.5, 0, 0, 0),
    injuryRisk: 0.15, overtimeRisk: 0.2, strengthBonus: 0,
    excuses: [
      "Mám naháňku na divočáky, je nás málo",
      "Musím na posed, dneska je říje",
      "Vlk se potlouká u vesnice, musíme hlídkovat",
      "Odlovná komise přijede v sobotu, musím připravit",
      "Srnec zranil nohu na silnici, jedu ho dosledovat",
    ],
  },
  {
    id: "kovar", name: "Kovář", w: W(2, 1, 0, 0, 0),
    injuryRisk: 0.4, overtimeRisk: 0.3, strengthBonus: 3,
    excuses: [
      "Musím dokovat mříž, slíbil jsem to na pondělí",
      "Rozjel se mi oheň ve výhni, nemůžu to nechat",
      "Přivezli mi koně k okování, musím to hned",
      "Udělal jsem si spáleninu, chlupy na ruce jsou pryč",
      "Dodavatel přivezl ocel, musím ji hned zkontrolovat",
    ],
  },
  {
    id: "hajny", name: "Hajný", w: W(3, 1.5, 0, 0, 0),
    injuryRisk: 0.1, overtimeRisk: 0.3, strengthBonus: 1,
    excuses: [
      "Mám obchůzku, pytláci zase řádí",
      "Musím počítat zvěř pro statistiku",
      "Spadlý strom blokuje cestu, musím to řešit",
      "Turisti zase nechali oheň v lese, běžím to uhasit",
      "Hledám zraněnou srnu, viděl ji řidič na silnici",
    ],
  },
  {
    id: "spravce_rybniku", name: "Správce rybníka", w: W(2, 1, 0, 0, 0),
    injuryRisk: 0.1, overtimeRisk: 0.2, strengthBonus: 0,
    excuses: [
      "Výlov je tento víkend, nemůžu chybět",
      "Hráz teče, musím to zastavit než to bude horší",
      "Stavidlo se zaseklo, rybník přetéká",
      "Zjistili jsme úhyn ryb, řeším s veterinářem",
      "Musím krmit, kapr chce jíst dvakrát denně",
    ],
  },
  {
    id: "sadar", name: "Sadař", w: W(2, 1, 0, 0, 0),
    injuryRisk: 0.2, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      "Musím česat jablka, padaj ze stromů",
      "Stříkání stromů se nedá odložit",
      "Přijela sezónní parta, musím jim vše zorganizovat",
      "Moštárna bere jen dnes, musím odvézt sběr",
      "Škůdce napadá, musím postříkat dřív než zaprší",
    ],
  },
  {
    id: "sezonni_delnik", name: "Sezonní dělník", w: W(3.5, 2, 0, 0, 0),
    injuryRisk: 0.3, overtimeRisk: 0.5, strengthBonus: 1,
    excuses: [
      "Mám brigádu, nemůžu si dovolit přijít o prachy",
      "Šéf zavolal že mě potřebuje, nemůžu říct ne",
      "Dneska platí tyden práce za dva, nemůžu to zmeškat",
      "Bus na brigádu jede od 5 ráno, vrátím se v osm večer",
      "Pronajal jsem se do chmelnic, nejde odejít",
    ],
  },
  {
    id: "chalupar", name: "Chalupář", w: W(2, 1, 0, 0, 0),
    injuryRisk: 0.2, overtimeRisk: 0.1, strengthBonus: 0,
    excuses: [
      "Opravuju střechu na chalupě, musím to dodělat než zaprší",
      "Přijeli hosté na chalupu, musím se o ně postarat",
      "Musím sundat okenice a zazimovat vodu",
      "Kamna přestala táhnout, řeším to s kominíkem",
      "Sousedi se stěžovali na divoké prase u plotu, musím to řešit",
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
      "Mix přijel s dvouhodinovým zpožděním, zdržujeme se",
      "Stěna se začala bořit, nemůžu to opustit",
    ],
  },
  {
    id: "tesar", name: "Tesař", w: W(1.5, 1.5, 1.5, 1.5, 1),
    injuryRisk: 0.4, overtimeRisk: 0.4, strengthBonus: 2,
    excuses: [
      "Stavíme krov, nemůžu nechat kluky samotný",
      "Dřevo přivezli o den dřív, musím ho zpracovat",
      "Zákazník chce krov do neděle, jedeme i v noci",
      "Přijel statik, musí mi potvrdit trámy",
      "Jeřáb je objednaný, nemůžu ho nechat čekat",
    ],
  },
  {
    id: "truhlar", name: "Truhlář", w: W(0.5, 1.5, 1.5, 1.5, 1),
    injuryRisk: 0.25, overtimeRisk: 0.3, strengthBonus: 1,
    excuses: [
      "Dokončuju kuchyň, zákazník si stěžuje na zpoždění",
      "Lak schne a musím nanést druhou vrstvu přesně za 4 hodiny",
      "Zákazník si přijde pro skříň, musím ji dokončit",
      "Frézka se zasekla, dělám to ručně",
      "Objednal jsem dřevo, právě ho přivezli",
    ],
  },
  {
    id: "instalater", name: "Instalatér", w: W(0.5, 1.5, 1.5, 1.5, 1),
    injuryRisk: 0.2, overtimeRisk: 0.4, strengthBonus: 0,
    excuses: [
      "Havarijní výjezd, sousedům teče strop",
      "Musím dodělat topení, lidi by zmrzli",
      "Stará paní má prasklou trubku, voda teče do bytu",
      "Připojuju bojler, nemůžu to nechat v půlce",
      "Čekám na materiál z velkoobchodu, přijede každou chvíli",
    ],
  },
  {
    id: "pokryvac", name: "Pokrývač", w: W(0.3, 1, 1, 1, 0.8),
    injuryRisk: 0.5, overtimeRisk: 0.4, strengthBonus: 1,
    excuses: [
      "Musím dodělat střechu, prší od zítřka",
      "Spadla mi taška, musím to hned opravit než zateče",
      "Vítr mi odfoukl taške z půlky střechy",
      "Soused mě prosí o okamžitou opravu, teče mu do postele",
      "Přivezli tašky, musím je naskládat na střechu dřív než začne pršet",
    ],
  },
  {
    id: "reznik", name: "Řezník", w: W(0.5, 1.5, 1.5, 1.5, 1),
    injuryRisk: 0.3, overtimeRisk: 0.3, strengthBonus: 2,
    excuses: [
      "Přijela svině na porážku, to se nedá odložit",
      "Musím udělat klobásy na objednávku",
      "Bourám maso, přivezli ho pozdě",
      "Zabijačka u souseda, slíbil jsem pomoct",
      "Udírna se rozběhla, musím sledovat proces",
    ],
  },
  {
    id: "pekar", name: "Pekař", w: W(0.3, 1, 1, 1, 0.8),
    injuryRisk: 0.15, overtimeRisk: 0.5, strengthBonus: 0,
    excuses: [
      "Musím péct na ráno, těsto kyne",
      "Pec se porouchala, nemůžu odejít",
      "Kvásek selhal, musím dělat nové těsto",
      "Zákaznice objednala svatební dort na víkend",
      "Přivezli špatnou mouku, dělám rekvizici",
    ],
  },
  {
    id: "hospodsky", name: "Hospodský", w: W(0.5, 1.5, 1.5, 1.5, 1),
    injuryRisk: 0.05, overtimeRisk: 0.4, strengthBonus: 0,
    excuses: [
      "Nemám záskok za bar",
      "Dneska je karaoke, nemůžu zavřít",
      "Přijela inspekce, musím být v hospodě",
      "Dovezli sud, musím ho napojit na pípu",
      "Pivní reprezentant čeká na ochutnávku nových piv",
    ],
  },
  {
    id: "prodavac", name: "Prodavač", w: W(0.5, 1.5, 1.5, 1.5, 1),
    injuryRisk: 0.05, overtimeRisk: 0.3, strengthBonus: -1,
    excuses: [
      "Inventura, musím počítat zboží",
      "Kolegyně onemocněla, musím ji zastoupit",
      "Závoz přijel pozdě, musím to naskladnit",
      "Dneska bereme velkou objednávku, šéf trvá na mé přítomnosti",
      "Kasa se zasekla, čekám na servisáka",
    ],
  },
  {
    id: "automechanik", name: "Automechanik", w: W(1.5, 2, 2, 1.5, 1),
    injuryRisk: 0.3, overtimeRisk: 0.4, strengthBonus: 1,
    excuses: [
      "Zákazník potřebuje auto na pondělí, musím to dodělat",
      "Rozebral jsem motor a nemůžu to nechat rozloženýho",
      "Dodavatel přivezl díly, musím je zabudovat hned",
      "Diagnostika hlásí chybu, už 3 hodiny hledám kde to je",
      "Zvedák se zasekl s autem nahoře, čekám na technika",
    ],
  },
  {
    id: "svarac", name: "Svářeč", w: W(0.3, 1, 1, 1, 0.8),
    injuryRisk: 0.4, overtimeRisk: 0.4, strengthBonus: 1,
    excuses: [
      "Svařuju bránu, nemůžu to nechat napůl",
      "Musím dodělat zábradlí, slíbil jsem to na víkend",
      "Dostal jsem varu do oka, musím k doktorovi",
      "Objednal jsem plyn, právě ho přivezli",
      "Zákazník čeká na garážová vrata",
    ],
  },
  {
    id: "malir_pokoju", name: "Malíř pokojů", w: W(0.3, 1, 1, 1, 0.8),
    injuryRisk: 0.1, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      "Maluju byt, barva schne a musím nanést další vrstvu",
      "Zákazník chce hotovo do pondělka",
      "Dělám výmalbu školky, děti přijdou v pondělí",
      "Udělal jsem špatný odstín, míchám to znovu",
      "Padl mi válec do barvy, čistím to hodinu",
    ],
  },
  {
    id: "postovni", name: "Poštovní doručovatel", w: W(0.2, 0.5, 0.5, 0.5, 0.3),
    injuryRisk: 0.1, overtimeRisk: 0.2, strengthBonus: 0,
    excuses: [
      "Mám přesčas, balíků je jak o Vánocích",
      "Kolega je na nemocenský, jedu dvě trasy",
      "Dneska je výplata důchodů, trvá to do večera",
      "Pejsek u Novákových mě zase nepustil za branku",
      "Auto se mi porouchalo na obhůzce, čekám na odtah",
    ],
  },
  {
    id: "spravce_hriste", name: "Správce hřiště", w: W(0.3, 0.3, 0.3, 0.3, 0.3),
    injuryRisk: 0.1, overtimeRisk: 0.2, strengthBonus: 0,
    excuses: [
      "Musím posekat trávník před zítřejším zápasem... mládeže",
      "Zalévám, potrubí prasklo",
      "Někdo vyrazil dveře do šaten, volám policii",
      "Zalévací systém se rozbil, musím to spravit ručně",
      "Připravuju čáry na zítřek, nemůžu to přerušit",
    ],
  },

  {
    id: "obchodnik", name: "Obchodník", w: W(0.5, 1, 1.5, 1.5, 1),
    injuryRisk: 0.05, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      "Mám jednání s dodavatelem, nemůžu zrušit",
      "Jedu na veletrh, vracím se až večer",
      "Klient si vyžádal schůzku dnes, nemůžu odmítnout",
      "Dělám reklamaci u velkého zákazníka",
      "Prezentace pro nový kontrakt se protáhne",
    ],
  },
  {
    id: "opravarOS", name: "Opravář", w: W(1, 1.5, 1, 0.5, 0.3),
    injuryRisk: 0.2, overtimeRisk: 0.3, strengthBonus: 1,
    excuses: [
      "Opravuju čerpadlo, nemůžu to nechat rozloženýho",
      "Volali mě k havárii, musím jet hned",
      "Nefunguje výtah v paneláku, 8 pater bez něj",
      "Objednal jsem náhradní díly, právě dorazily",
      "Motor na mlýnku si vyžádal kompletní rozbor",
    ],
  },
  {
    id: "zahradnik", name: "Zahradník", w: W(1.5, 1.5, 1, 0.5, 0.3),
    injuryRisk: 0.15, overtimeRisk: 0.2, strengthBonus: 1,
    excuses: [
      "Musím zasadit stromy, přišly ze školky",
      "Stříhám živý plot, zákazník tlačí na termín",
      "Koncentrát do postřiku zasychá, musím hned stříkat",
      "Zákaznice chce mít před víkendem hotové, jedu i v neděli",
      "Sekačka mě nepustila, musím do servisu",
    ],
  },
  {
    id: "ridic_autobusu", name: "Řidič autobusu", w: W(0.5, 1, 1.5, 1.5, 1),
    injuryRisk: 0.05, overtimeRisk: 0.5, strengthBonus: 0,
    excuses: [
      "Mám směnu, jezdím do Prachatic a zpět",
      "Kolega nepřišel, musím ho zastoupit",
      "Porouchal se autobus, čekám na servis",
      "Dělám školní zájezd, nevrátím se dřív než v sedm",
      "Dispečink mě poslal nahradit nemocného kolegu",
    ],
  },
  {
    id: "stolar", name: "Stolař", w: W(1, 1.5, 1, 0.5, 0.3),
    injuryRisk: 0.25, overtimeRisk: 0.3, strengthBonus: 1,
    excuses: [
      "Dodělávám schody, zákazník stěhuje za týden",
      "Musím nařezat materiál, fréza je volná jen dneska",
      "Zákazník přijde pro nábytek, musím ho dokončit",
      "Dřevo mi uschlo moc rychle, pracuju přes noc",
      "Chybí mi pár dílů, čekám na doručení",
    ],
  },
  {
    id: "mistr_v_tovarne", name: "Mistr v továrně", w: W(0.3, 1, 2, 2, 1.5),
    injuryRisk: 0.15, overtimeRisk: 0.5, strengthBonus: 0,
    excuses: [
      "Máme přesčas v továrně, šéf nás nepustí",
      "Porouchala se linka, musím to řešit",
      "Audit nás drží v práci déle než obvykle",
      "Kontrola kvality mi hlásí zmetky, řeším to",
      "Nemocenská v brigádě, převzal jsem dispečink",
    ],
  },
  {
    id: "delnik_v_pile", name: "Dělník v pile", w: W(2, 1.5, 0, 0, 0),
    injuryRisk: 0.4, overtimeRisk: 0.4, strengthBonus: 2,
    excuses: [
      "Pořezali jsme velkou zakázku, musíme to dodělat",
      "Přivezli kmeny, musím je zpracovat dokud je čerstvý",
      "Pás se mi zasekl, opravuji celé dopoledne",
      "Šéf nabídl dvojnásobnou sazbu, nemůžu odmítnout",
      "Musíme dokončit export do Rakouska před pátkem",
    ],
  },
  {
    id: "delnik_v_kamenolomu", name: "Dělník v kamenolomu", w: W(1, 0.5, 0, 0, 0),
    injuryRisk: 0.5, overtimeRisk: 0.4, strengthBonus: 3,
    excuses: [
      "Odstřel se posunul na dnešek, musím být na místě",
      "Nakládáme štěrk, kamion čeká",
      "Drtič se zastavil, musím pomoct s uvolněním",
      "Kontrola bezpečnosti, všichni musí být přítomni",
      "Přijela nová parta, musím jim vysvětlit postupy",
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
      "Mám tacho, musím držet povinnou pauzu",
      "Zavřeli hranici, stojím v koloně",
    ],
  },
  {
    id: "elektrikar", name: "Elektrikář", w: W(0.1, 0.3, 1.5, 1.5, 1.5),
    injuryRisk: 0.25, overtimeRisk: 0.4, strengthBonus: 0,
    excuses: [
      "Havarijní výjezd, někde spadl stožár",
      "Musím dodělat rozvody, jinak lidi nebudou mít proud",
      "Zkrat v panelovém domě, hlídám to",
      "Rozvaděč mi padá, jsem v objektu do večera",
      "Revize, musí být hotovo do zítřka",
    ],
  },
  {
    id: "hasic", name: "Hasič", w: W(0.1, 0.3, 1, 1, 1),
    injuryRisk: 0.2, overtimeRisk: 0.3, strengthBonus: 2,
    excuses: [
      "Máme pohotovost, nemůžu odejít ze stanice",
      "Výjezd k požáru, sorry",
      "Záchrana osob z auta na D4",
      "Cvičení, velitel nás nepustí",
      "Technický zásah, kosmetický salón má plyn",
    ],
  },
  {
    id: "policista", name: "Policista", w: W(0.1, 0.3, 1, 1, 1),
    injuryRisk: 0.15, overtimeRisk: 0.4, strengthBonus: 1,
    excuses: [
      "Mám službu, nedomluvil jsem si výměnu",
      "Vyšetřujeme případ, nemůžu odejít",
      "Vloupání u benzínky, zajišťuju místo činu",
      "Nasazení na fotbale v Budějcích",
      "Kolega zranil ruku, musím ho doprovodit",
    ],
  },
  {
    id: "kuchar", name: "Kuchař", w: W(0.1, 0.3, 1.5, 1.5, 1.5),
    injuryRisk: 0.15, overtimeRisk: 0.4, strengthBonus: 0,
    excuses: [
      "Máme plný restauraci, nemůžu odejít od plotny",
      "Kolega onemocněl, vařím sám",
      "Šéf objednal rauty, pracuju přesčas",
      "Přivezli špatnou dodávku, řeším reklamaci",
      "Stroj se zasekl, musím to dělat ručně",
    ],
  },
  {
    id: "cisnik", name: "Číšník", w: W(0.1, 0.3, 1, 1, 1),
    injuryRisk: 0.05, overtimeRisk: 0.4, strengthBonus: -1,
    excuses: [
      "Máme svatbu v restauraci, potřebují mě",
      "Šéf mě nemůže uvolnit, je plno",
      "Oslava sedmdesátin, předem objednané",
      "Kolegyně odešla v poledne, obsluhuju celý salon",
      "Pokladna se sekla, řešíme to s technikem",
    ],
  },
  {
    id: "skladnik", name: "Skladník", w: W(0.1, 0.3, 1.5, 1.5, 1.5),
    injuryRisk: 0.2, overtimeRisk: 0.5, strengthBonus: 1,
    excuses: [
      "Přijela dodávka, musím to naskladnit",
      "Inventura, nemůžu odejít",
      "Vysokozdvih se rozbil, nakládáme to ručně",
      "Zákazník si vyžádal okamžitou expedici",
      "Kamion zapadl na rampě, řešíme to s technikou",
    ],
  },
  {
    id: "zachranar", name: "Záchranář", w: W(0, 0.1, 0.5, 0.5, 0.5),
    injuryRisk: 0.1, overtimeRisk: 0.3, strengthBonus: 1,
    excuses: [
      "Mám službu na záchrance",
      "Kolega onemocněl, musím ho zastoupit",
      "Výjezd na autohavárii, nekončíme do večera",
      "Převoz pacienta do Prahy, vrátím se pozdě",
      "Mimořádný výjezd na infarkt, nemůžu odejít",
    ],
  },
  {
    id: "strojni_inzenyr", name: "Strojní inženýr", w: W(0, 0.1, 0.5, 0.5, 0.5),
    injuryRisk: 0.1, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      "Mám deadline na projekt, musím to dokončit",
      "Odběratel trvá na tom, abych byl u zkušebního provozu",
      "Konstrukční výkresy mi odmítli, musím je přepracovat",
      "Klient přiletěl na prohlídku závodu, nemůžu chybět",
      "Zasedání vedení, šéf trvá na mé přítomnosti",
    ],
  },
  {
    id: "podnikatel", name: "Podnikatel", w: W(0.1, 0.3, 1, 1, 1),
    injuryRisk: 0.05, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      "Mám jednání s odběratelem, nemůžu zrušit",
      "Daňový poradce přijede jen dneska",
      "Finanční úřad volá, potřebuju odpovědět osobně",
      "Nový zákazník chce vidět provoz",
      "Zaměstnanec dal výpověď, řeším předávání",
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
      "Právě mi rozbili code review, potřebuju to přepsat",
      "Mám volání s klientem v Americe, nemůžu přesunout",
    ],
  },
  {
    id: "ucetni", name: "Účetní", w: W(0, 0.1, 0.3, 1, 1.5),
    injuryRisk: 0.02, overtimeRisk: 0.4, strengthBonus: -2,
    excuses: [
      "Uzávěrka, počítám do noci",
      "Přiznání k DPH musí být dneska",
      "Klient chce audit, řeším ho celý víkend",
      "Finanční úřad chce doplňující podklady",
      "Zasekly se mi faktury v systému, opravuji to",
    ],
  },
  {
    id: "ucitel", name: "Učitel", w: W(0.1, 0.3, 1, 1, 1),
    injuryRisk: 0.05, overtimeRisk: 0.2, strengthBonus: -1,
    excuses: [
      "Mám dozor na školním výletě",
      "Rodičovská schůzka, nemůžu to zrušit",
      "Opravuji písemky do večera",
      "Zastupuju nemocného kolegu, učím dvojnásobek",
      "Pedagogická rada se protáhla, nevrátím se včas",
    ],
  },
  {
    id: "urednik", name: "Úředník", w: W(0, 0.1, 0.3, 1, 1.5),
    injuryRisk: 0.02, overtimeRisk: 0.2, strengthBonus: -2,
    excuses: [
      "Musím dodělat podklady pro zastupitelstvo",
      "Audit, nemůžu chybět",
      "Starosta svolal mimořádnou poradu",
      "Dělám hlášení pro kraj, deadline je zítra",
      "Zákazníků je dneska strašně moc, přesčasy",
    ],
  },

  // ═══════════════════════════════════════
  // PRAŽSKÉ / MĚSTSKÉ (town/city)
  // ═══════════════════════════════════════
  {
    id: "revizor", name: "Revizor", w: W(0, 2, 3, 2, 3),
    injuryRisk: 0.05, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      "Mám kontrolní den na lince 22",
      "Revizoři mají poradu na Florenci",
      "Chytil jsem černého pasažéra, musím sepsat protokol",
      "Cestující se bránil, volám parťáky",
      "Nasazení na noční trase, končím v pět ráno",
    ],
  },
  {
    id: "tramvajak", name: "Řidič tramvaje", w: W(0, 3, 4, 3, 4),
    injuryRisk: 0.1, overtimeRisk: 0.6, strengthBonus: 0,
    excuses: [
      "Mám směnu na trojce",
      "Kolega nepřišel, musím jet za něj",
      "Výluka na Vinohradské, musím objíždět",
      "Ranní směna na Barrandov, nekončím do šesti",
    ],
  },
  {
    id: "bezdomovec", name: "Bezdomovec", w: W(0, 0.5, 1, 1, 2),
    injuryRisk: 0.2, overtimeRisk: 0.05, strengthBonus: -1,
    excuses: [
      "Někdo mi obsadil lavičku",
      "Sbírám lahve u Tesca",
      "Spím pod mostem, nepřišla mi SMS",
      "Ztratil jsem boty",
    ],
  },
  {
    id: "ridic_boltu", name: "Řidič Boltu", w: W(0, 2, 3, 2, 4),
    injuryRisk: 0.05, overtimeRisk: 0.4, strengthBonus: 0,
    excuses: [
      "Mám bonusovej cíl, ještě 3 jízdy",
      "Zákazník mě odvezl na Zličín",
      "Surge pricing, teď se nevyplatí zastavit",
      "Dostal jsem 1 hvězdu, musím napsat podpůrné odvolání",
      "Auto je v myčce, vrátím se až odpoledne",
    ],
  },
  {
    id: "barman", name: "Barman", w: W(0, 2, 3, 2, 3),
    injuryRisk: 0.05, overtimeRisk: 0.5, strengthBonus: 0,
    excuses: [
      "Máme live music večer, nemůžu odejít",
      "Kolegyně onemocněla, musím zastoupit",
      "Rozlil se sud, uklízím",
      "Hrajeme tequila párty, objednali 200 štamprlí",
      "Bezpečnostní agentura přijela až ve dvě ráno",
    ],
  },
  {
    id: "kuryr", name: "Kurýr", w: W(0, 2, 3, 2, 4),
    injuryRisk: 0.15, overtimeRisk: 0.5, strengthBonus: 0,
    excuses: [
      "Mám ještě 15 balíků do konce směny",
      "Navigace mě poslala na Jižák místo Žižkov",
      "Zásilkovna plná, čekám na vyzvednutí",
      "Zákazník nebyl doma, jsem třikrát zpátky",
      "Kolo se mi rozbilo, čekám na servisák",
    ],
  },
  {
    id: "vratny", name: "Vrátný", w: W(0, 1.5, 2.5, 1.5, 2.5),
    injuryRisk: 0.02, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      "Nemůžu opustit vrátnici, čekám na zásilku",
      "Střídání nepřišlo",
      "Alarm se spustil, musím počkat na policii",
      "Ztratil se klíč od hlavních vrat, hledám",
      "Kontrola vedení budovy, nemůžu opustit post",
    ],
  },
  {
    id: "taxikar", name: "Taxikář", w: W(0, 2, 3, 2, 3),
    injuryRisk: 0.05, overtimeRisk: 0.5, strengthBonus: 0,
    excuses: [
      "Mám objednanou jízdu na letiště",
      "Stojím v koloně na magistrále",
      "Zákazník zapomněl věci, musím se vracet",
      "Píchl jsem na dálnici, řeším to",
      "Cestující mě žádá o jízdu do Plzně, nemůžu odmítnout",
    ],
  },
  {
    id: "prodavac_trafika", name: "Prodavač v trafice", w: W(0, 1.5, 2.5, 1.5, 2.5),
    injuryRisk: 0.02, overtimeRisk: 0.3, strengthBonus: -1,
    excuses: [
      "Musím zavřít krám, kolega nepřijde",
      "Přišla kontrola z finančáku",
      "Přivezli noviny pozdě, musím je roztřídit",
      "Závoz loterie se opozdil, čekám",
      "Někdo ukradl časopisy z výlohy, řeším to s policií",
    ],
  },
  {
    id: "metar", name: "Metař", w: W(0, 1.5, 2.5, 1.5, 2.5),
    injuryRisk: 0.15, overtimeRisk: 0.4, strengthBonus: 1,
    excuses: [
      "Uklízíme po koncertu na Letné",
      "Dneska mi přidali Smíchov, nestíhám",
      "Zametám Karlák, nemůžu odejít",
      "Spadl strom přes chodník, uklízím větve",
      "Dokončujeme úklid po Silvestru — ještě v lednu",
    ],
  },
  {
    id: "strojvedouci_metro", name: "Strojvedoucí metra", w: W(0, 2, 3, 2, 3),
    injuryRisk: 0.05, overtimeRisk: 0.6, strengthBonus: 0,
    excuses: [
      "Mám noční na lince B",
      "Kolega volal nemocného, musím ho zastoupit",
      "Výluka na Florenci, chaos",
      "Zpoždění 20 minut, musím to dohnat",
      "Technická kontrola soupravy, jsem v depu",
    ],
  },
  {
    id: "hlidac_parkoviste", name: "Hlídač parkoviště", w: W(0, 1.5, 2, 1, 1.5),
    injuryRisk: 0.02, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      "Střídání nedorazilo",
      "Řeším nabouraný auto na P+R",
      "Závora se zasekla, čekám na technika",
      "Pokladna nefunguje, musím ručně přepočítat",
      "Volal jsem odtahovku kvůli opuštěnému autu",
    ],
  },
  {
    id: "poulicni_muzikant", name: "Pouliční muzikant", w: W(0, 1, 1.5, 1, 2),
    injuryRisk: 0.05, overtimeRisk: 0.1, strengthBonus: -1,
    excuses: [
      "Mám dobré místo na Karláku, nemůžu odejít",
      "Kytaru mi zabavil strážník, řeším to",
      "Vydělávám na nový struny",
      "Turisti dneska dávají víc, nemůžu jít",
      "Buskerská licence mi propadla, jsem na úřadě",
    ],
  },
  {
    id: "ridic_mhd", name: "Řidič autobusu MHD", w: W(0, 2, 3, 2, 3),
    injuryRisk: 0.05, overtimeRisk: 0.6, strengthBonus: 0,
    excuses: [
      "Mám směnu na 119 na letiště",
      "Kolaps na Smíchově, stojíme v koloně",
      "Ranní špička, jedeme nadoraz",
      "Cestující nám dělá problémy, volám policii",
      "Dispečink změnil rozpis, nemůžu to přehodit",
    ],
  },
  {
    id: "uklidova_firma", name: "Uklízeč kanceláří", w: W(0, 1.5, 2.5, 1.5, 2.5),
    injuryRisk: 0.1, overtimeRisk: 0.4, strengthBonus: 0,
    excuses: [
      "Uklízíme kanceláře na Pankráci, noční směna",
      "Šéf přidal extra zakázku",
      "Mytí oken v Chodovské věži, stavíme lešení",
      "Havarijní úklid po záplavě v suterénu",
      "Strojový úklid, nemůžu to přerušit",
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
      "Seminárka je na pondělí, nestihl jsem ji",
      "Státnice mi hlásili na dneska, přesunuli to",
      "Studijní skupina se sešla, nemůžu je vynechat",
    ],
  },
  {
    id: "nezamestnany", name: "Nezaměstnaný", w: W(0.5, 0.5, 0.5, 0.5, 0.5),
    injuryRisk: 0.05, overtimeRisk: 0.05, strengthBonus: 0,
    excuses: [
      "Mám pohovor, nemůžu přijít",
      "Musím na úřad práce",
      "Přišla mi nabídka práce, rozhodujeme se doma",
      "Poradce mi domluvil schůzku, nemůžu odkládat",
      "Manželka řekla že si musím hledat práci celý den",
    ],
  },
  {
    id: "duchodce", name: "Důchodce", w: W(0, 0, 0, 0, 0), // Přiřazuje se dle věku
    injuryRisk: 0.15, overtimeRisk: 0.0, strengthBonus: -1,
    excuses: [
      "Doktor mi zakázal běhat",
      "Mám vyšetření v nemocnici",
      "Hlídám vnoučata",
      "Stará paní u vedle potřebuje pomoct s nákupem",
      "Mám klub důchodců, nemůžu vynechat",
      "Manželka trvá na tom abych opravil plot",
    ],
  },
];

/**
 * Pick occupation based on village size and player age.
 */
// Rural occupation IDs — only in non-Praha districts
const RURAL_ONLY = new Set([
  "zemedelec", "traktorista", "lesni_delnik", "drevorubec", "vcelar",
  "chovatel", "kombajner", "myslivec", "kovar", "hajny",
  "spravce_rybniku", "sadar", "sezonni_delnik", "chalupar",
  "delnik_v_pile", "delnik_v_kamenolomu",
]);

// Urban occupation IDs — only in Praha
const URBAN_ONLY = new Set([
  "revizor", "tramvajak", "bezdomovec", "ridic_boltu", "kuryr",
  "vratny", "taxikar", "prodavac_trafika", "metar", "strojvedouci_metro",
  "hlidac_parkoviste", "poulicni_muzikant", "ridic_mhd", "uklidova_firma",
]);

export function pickOccupation(rng: Rng, villageSize: string, age: number, district?: string): Occupation {
  // Age overrides
  if (age < 20) return OCCUPATIONS.find((o) => o.id === "student")!;
  if (age > 55 && rng.random() < 0.4) return OCCUPATIONS.find((o) => o.id === "duchodce")!;

  const size = (villageSize as VillageSize) || "village";
  const isPraha = district === "Praha";

  const weights: Record<string, number> = {};
  for (const o of OCCUPATIONS) {
    // Praha: skip rural, non-Praha: skip urban
    if (isPraha && RURAL_ONLY.has(o.id)) continue;
    if (!isPraha && URBAN_ONLY.has(o.id)) continue;
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
