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
import type { Weather } from "../engine/types";

type VillageSize = "hamlet" | "village" | "town" | "small_city" | "city";

/**
 * Jedna profesní výmluva. Bez `weather` platí za každého počasí.
 *
 * Váže se na TOTÉŽ počasí, které hráč vidí v předpovědi u nadcházejícího
 * zápasu — `season/season-weather.ts` ho odvozuje deterministicky z kola,
 * takže předpověď, SMS i simulace pracují s jednou hodnotou. Vlastní kalendář
 * výmluvy mít nesmí, jinak by spoluhráč sháněl seno, zatímco venku sněží.
 */
export interface ProfExcuse {
  text: string;
  /** Počasí, za kterého výmluva dává smysl. Bez pole = za každého. */
  weather?: Weather[];
}

export interface Occupation {
  id: string;
  name: string;
  /** Váha výběru per velikost obce — vyšší = častější. 0 = může se stát ale velmi vzácně */
  w: Record<VillageSize, number>;
  injuryRisk: number;    // 0-1
  overtimeRisk: number;  // 0-1
  strengthBonus: number; // -2 to +3
  excuses: ProfExcuse[]; // Profesní SMS výmluvy
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
      { text: "Musim orat, vítr se otočil a jsou ideální podmínky" },
      { text: "Kráva telí, nemůžu od ní odejít" },
      { text: "Kombajn se rozbil uprostřed pole, čekám na mechanika" },
      { text: "Musím stříkat, jinak přijdu o úrodu" },
      { text: "Seno musí být dneska svezený, prší od zítřka" },
      { text: "Žně nepočkají, jedeme do tmy", weather: ["sunny", "cloudy"] },
      { text: "Sklízíme, každá hodina bez deště se počítá", weather: ["sunny"] },
      { text: "Krmím dobytek, v týhle plundře je nenechám venku", weather: ["snow", "rain"] },
    ],
  },
  {
    id: "traktorista", name: "Traktorista", w: W(4, 2.5, 0, 0, 0),
    injuryRisk: 0.2, overtimeRisk: 0.6, strengthBonus: 1,
    excuses: [
      { text: "Traktor se rozbil na poli, čekám na odtah" },
      { text: "Musím dojet naftu, pumpa zavírá v pět" },
      { text: "Oru sousedovi pole, slíbil jsem mu to už třikrát" },
      { text: "Vlečka má defekt, musím to řešit" },
      { text: "Hydraulika přestala fungovat, nezvednu radlici" },
      { text: "Musím odvézt brambory do sklepa než začnou mrznout" },
      { text: "Šéf poslal dělat cesty, nemůžu odjet" },
      { text: "Vozím obilí z pole, kombajn na mě čeká", weather: ["sunny", "cloudy"] },
      { text: "Sype se cesta, jsem na pluhu od rána", weather: ["snow"] },
    ],
  },
  {
    id: "lesni_delnik", name: "Lesní dělník", w: W(4, 2.5, 0, 0, 0),
    injuryRisk: 0.5, overtimeRisk: 0.3, strengthBonus: 3,
    excuses: [
      { text: "Kácíme smrky, nemůžu odejít uprostřed" },
      { text: "Musím odvézt dřevo, náklaďák jede jen dneska" },
      { text: "Praskla mi motorovka, musím do servisu v Klatovech" },
      { text: "Honíme kůrovce, nemůžu nechat kluky samotný" },
      { text: "Musím vyčistit paseku, revír chce hotovo do pátku" },
    ],
  },
  {
    id: "drevorubec", name: "Dřevorubec", w: W(3, 1.5, 0, 0, 0),
    injuryRisk: 0.6, overtimeRisk: 0.3, strengthBonus: 3,
    excuses: [
      { text: "Spadl strom špatným směrem, musím to uklidit" },
      { text: "Mám zakázku na palivový dřevo, deadline je zítra" },
      { text: "Zákazník si objednal pokácení, nemůžu odmítnout" },
      { text: "Dostala mě motorová pila, píchla do boty" },
      { text: "Musím štípat pro zákazníka, chce to před mrazy" },
    ],
  },
  {
    id: "vcelar", name: "Včelař", w: W(3, 1.5, 0, 0, 0),
    injuryRisk: 0.1, overtimeRisk: 0.2, strengthBonus: 0,
    excuses: [
      { text: "Rojí se mi včely, musím je chytit než odletí" },
      { text: "Musím stáčet med, je nejvyšší čas" },
      { text: "Včely jsou agresivní, nemůžu od úlů odejít" },
      { text: "Dneska mám kontrolu veterináře, musím být u úlů" },
      { text: "Jeden úl napadly sršně, řeším to celý den" },
      { text: "Roj mi utekl na hrušku, musím ho sundat", weather: ["sunny"] },
      { text: "Točím med, rozdělaný to nenechám", weather: ["sunny", "cloudy"] },
    ],
  },
  {
    id: "chovatel", name: "Chovatel", w: W(4, 2.5, 0, 0, 0),
    injuryRisk: 0.2, overtimeRisk: 0.4, strengthBonus: 1,
    excuses: [
      { text: "Prasnice se prosila, musím být u toho" },
      { text: "Utekla mi koza, honím ji po vsi" },
      { text: "Veterinář přijede jen dneska, musím být doma" },
      { text: "Slepice přestaly nést, musím zjistit proč" },
      { text: "Přijela zkontrolovat hygiena, nemůžu od ní odejít" },
      { text: "Ovce se bahní, nemůžu od nich" },
    ],
  },
  {
    id: "kombajner", name: "Kombajnér", w: W(3, 1.5, 0, 0, 0),
    injuryRisk: 0.2, overtimeRisk: 0.7, strengthBonus: 1,
    excuses: [
      { text: "Žně nečekají, musím jet dokud je sucho" },
      { text: "Kombajn je objednanej, nemůžu ho vrátit" },
      { text: "Zasekla se mi zrnovod, řeším to už druhou hodinu" },
      { text: "Družstvo tlačí na dodávku, jedu do tmy" },
      { text: "Stíhám poslední pole než přijde déšť" },
      { text: "Máme rozdělaný lán, do večera to nedáme", weather: ["sunny", "cloudy"] },
      { text: "Čekám až oschne, pak jedu do tmy", weather: ["rain"] },
    ],
  },
  {
    id: "myslivec", name: "Myslivec", w: W(3, 1.5, 0, 0, 0),
    injuryRisk: 0.15, overtimeRisk: 0.2, strengthBonus: 0,
    excuses: [
      { text: "Mám naháňku na divočáky, je nás málo" },
      { text: "Musím na posed, dneska je říje" },
      { text: "Vlk se potlouká u vesnice, musíme hlídkovat" },
      { text: "Odlovná komise přijede v sobotu, musím připravit" },
      { text: "Srnec zranil nohu na silnici, jedu ho dosledovat" },
      { text: "Máme naháňku, to se neodkládá", weather: ["snow", "wind"] },
      { text: "Jdu na čekanou, srnec chodí jen za šera", weather: ["cloudy"] },
    ],
  },
  {
    id: "kovar", name: "Kovář", w: W(2, 1, 0, 0, 0),
    injuryRisk: 0.4, overtimeRisk: 0.3, strengthBonus: 3,
    excuses: [
      { text: "Musím dokovat mříž, slíbil jsem to na pondělí" },
      { text: "Rozjel se mi oheň ve výhni, nemůžu to nechat" },
      { text: "Přivezli mi koně k okování, musím to hned" },
      { text: "Udělal jsem si spáleninu, chlupy na ruce jsou pryč" },
      { text: "Dodavatel přivezl ocel, musím ji hned zkontrolovat" },
    ],
  },
  {
    id: "hajny", name: "Hajný", w: W(3, 1.5, 0, 0, 0),
    injuryRisk: 0.1, overtimeRisk: 0.3, strengthBonus: 1,
    excuses: [
      { text: "Mám obchůzku, pytláci zase řádí" },
      { text: "Musím počítat zvěř pro statistiku" },
      { text: "Spadlý strom blokuje cestu, musím to řešit" },
      { text: "Turisti zase nechali oheň v lese, běžím to uhasit" },
      { text: "Hledám zraněnou srnu, viděl ji řidič na silnici" },
      { text: "Sázíme stromky, revír chce hotovo do mrazů", weather: ["wind", "cloudy"] },
      { text: "Krmelce se musí naplnit, než napadne víc", weather: ["snow"] },
    ],
  },
  {
    id: "spravce_rybniku", name: "Správce rybníka", w: W(2, 1, 0, 0, 0),
    injuryRisk: 0.1, overtimeRisk: 0.2, strengthBonus: 0,
    excuses: [
      { text: "Výlov je tento víkend, nemůžu chybět" },
      { text: "Hráz teče, musím to zastavit než to bude horší" },
      { text: "Stavidlo se zaseklo, rybník přetéká" },
      { text: "Zjistili jsme úhyn ryb, řeším s veterinářem" },
      { text: "Musím krmit, kapr chce jíst dvakrát denně" },
    ],
  },
  {
    id: "sadar", name: "Sadař", w: W(2, 1, 0, 0, 0),
    injuryRisk: 0.2, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      { text: "Musím česat jablka, padaj ze stromů" },
      { text: "Stříkání stromů se nedá odložit" },
      { text: "Přijela sezónní parta, musím jim vše zorganizovat" },
      { text: "Moštárna bere jen dnes, musím odvézt sběr" },
      { text: "Škůdce napadá, musím postříkat dřív než zaprší" },
      { text: "Sklízíme, jablka nepočkají", weather: ["sunny", "cloudy"] },
      { text: "Řežu stromy, než začne míza" },
    ],
  },
  {
    id: "sezonni_delnik", name: "Sezonní dělník", w: W(3.5, 2, 0, 0, 0),
    injuryRisk: 0.3, overtimeRisk: 0.5, strengthBonus: 1,
    excuses: [
      { text: "Mám brigádu, nemůžu si dovolit přijít o prachy" },
      { text: "Šéf zavolal že mě potřebuje, nemůžu říct ne" },
      { text: "Dneska platí tyden práce za dva, nemůžu to zmeškat" },
      { text: "Bus na brigádu jede od 5 ráno, vrátím se v osm večer" },
      { text: "Pronajal jsem se do chmelnic, nejde odejít" },
      { text: "Sezóna, beru každou šichtu co je", weather: ["sunny", "cloudy"] },
    ],
  },
  {
    id: "chalupar", name: "Chalupář", w: W(2, 1, 0, 0, 0),
    injuryRisk: 0.2, overtimeRisk: 0.1, strengthBonus: 0,
    excuses: [
      { text: "Opravuju střechu na chalupě, musím to dodělat než zaprší" },
      { text: "Přijeli hosté na chalupu, musím se o ně postarat" },
      { text: "Musím sundat okenice a zazimovat vodu" },
      { text: "Kamna přestala táhnout, řeším to s kominíkem" },
      { text: "Sousedi se stěžovali na divoké prase u plotu, musím to řešit" },
    ],
  },

  // ═══════════════════════════════════════
  // ŘEMESLNÁ POVOLÁNÍ (village+)
  // ═══════════════════════════════════════
  {
    id: "zednik", name: "Zedník", w: W(2, 2.5, 2.5, 2, 1.5),
    injuryRisk: 0.4, overtimeRisk: 0.5, strengthBonus: 2,
    excuses: [
      { text: "Lijeme beton, nemůže to čekat" },
      { text: "Musím dodělat zeď, zákazník tlačí" },
      { text: "Lešení se rozklížilo, musím to opravit" },
      { text: "Mix přijel s dvouhodinovým zpožděním, zdržujeme se" },
      { text: "Stěna se začala bořit, nemůžu to opustit" },
      { text: "Stavební sezóna, makáme do tmy", weather: ["sunny", "cloudy"] },
      { text: "Beton se musí dodělat, jinak mi ztuhne", weather: ["sunny"] },
      { text: "Za deště zdít nemůžu, ale musím to zaplachtovat" },
    ],
  },
  {
    id: "tesar", name: "Tesař", w: W(1.5, 1.5, 1.5, 1.5, 1),
    injuryRisk: 0.4, overtimeRisk: 0.4, strengthBonus: 2,
    excuses: [
      { text: "Stavíme krov, nemůžu nechat kluky samotný" },
      { text: "Dřevo přivezli o den dřív, musím ho zpracovat" },
      { text: "Zákazník chce krov do neděle, jedeme i v noci" },
      { text: "Přijel statik, musí mi potvrdit trámy" },
      { text: "Jeřáb je objednaný, nemůžu ho nechat čekat" },
      { text: "Krov musí být pod střechou, než přijdou deště", weather: ["cloudy", "wind"] },
      { text: "Nemůžu nechat rozdělaný krov v dešti" },
    ],
  },
  {
    id: "truhlar", name: "Truhlář", w: W(0.5, 1.5, 1.5, 1.5, 1),
    injuryRisk: 0.25, overtimeRisk: 0.3, strengthBonus: 1,
    excuses: [
      { text: "Dokončuju kuchyň, zákazník si stěžuje na zpoždění" },
      { text: "Lak schne a musím nanést druhou vrstvu přesně za 4 hodiny" },
      { text: "Zákazník si přijde pro skříň, musím ji dokončit" },
      { text: "Frézka se zasekla, dělám to ručně" },
      { text: "Objednal jsem dřevo, právě ho přivezli" },
    ],
  },
  {
    id: "instalater", name: "Instalatér", w: W(0.5, 1.5, 1.5, 1.5, 1),
    injuryRisk: 0.2, overtimeRisk: 0.4, strengthBonus: 0,
    excuses: [
      { text: "Havarijní výjezd, sousedům teče strop" },
      { text: "Musím dodělat topení, lidi by zmrzli" },
      { text: "Stará paní má prasklou trubku, voda teče do bytu" },
      { text: "Připojuju bojler, nemůžu to nechat v půlce" },
      { text: "Čekám na materiál z velkoobchodu, přijede každou chvíli" },
      { text: "Půl vesnice nemá teplo, nemůžu odejít", weather: ["snow"] },
      { text: "Zamrzly trubky u Novákových, jedu tam hned", weather: ["snow"] },
    ],
  },
  {
    id: "pokryvac", name: "Pokrývač", w: W(0.3, 1, 1, 1, 0.8),
    injuryRisk: 0.5, overtimeRisk: 0.4, strengthBonus: 1,
    excuses: [
      { text: "Musím dodělat střechu, prší od zítřka" },
      { text: "Spadla mi taška, musím to hned opravit než zateče" },
      { text: "Vítr mi odfoukl taške z půlky střechy" },
      { text: "Soused mě prosí o okamžitou opravu, teče mu do postele" },
      { text: "Přivezli tašky, musím je naskládat na střechu dřív než začne pršet" },
      { text: "V týhle plundře nelezu ze střechy dřív než ve čtyři", weather: ["snow", "wind"] },
      { text: "Krytí se mi rozteče, musím to dodělat teď", weather: ["sunny"] },
      { text: "Za deště na střechu nelezu, ale musím to zaplachtovat" },
    ],
  },
  {
    id: "reznik", name: "Řezník", w: W(0.5, 1.5, 1.5, 1.5, 1),
    injuryRisk: 0.3, overtimeRisk: 0.3, strengthBonus: 2,
    excuses: [
      { text: "Přijela svině na porážku, to se nedá odložit" },
      { text: "Musím udělat klobásy na objednávku" },
      { text: "Bourám maso, přivezli ho pozdě" },
      { text: "Zabijačka u souseda, slíbil jsem pomoct" },
      { text: "Udírna se rozběhla, musím sledovat proces" },
    ],
  },
  {
    id: "pekar", name: "Pekař", w: W(0.3, 1, 1, 1, 0.8),
    injuryRisk: 0.15, overtimeRisk: 0.5, strengthBonus: 0,
    excuses: [
      { text: "Musím péct na ráno, těsto kyne" },
      { text: "Pec se porouchala, nemůžu odejít" },
      { text: "Kvásek selhal, musím dělat nové těsto" },
      { text: "Zákaznice objednala svatební dort na víkend" },
      { text: "Přivezli špatnou mouku, dělám rekvizici" },
    ],
  },
  {
    id: "hospodsky", name: "Hospodský", w: W(0.5, 1.5, 1.5, 1.5, 1),
    injuryRisk: 0.05, overtimeRisk: 0.4, strengthBonus: 0,
    excuses: [
      { text: "Nemám záskok za bar" },
      { text: "Dneska je karaoke, nemůžu zavřít" },
      { text: "Přijela inspekce, musím být v hospodě" },
      { text: "Dovezli sud, musím ho napojit na pípu" },
      { text: "Pivní reprezentant čeká na ochutnávku nových piv" },
      { text: "Máme hody, sál je plnej", weather: ["sunny", "cloudy"] },
      { text: "Silvestr, tady je vyprodáno tři měsíce dopředu", weather: ["snow"] },
      { text: "Zahrádka je narvaná, nemůžu odejít od výčepu", weather: ["sunny"] },
    ],
  },
  {
    id: "prodavac", name: "Prodavač", w: W(0.5, 1.5, 1.5, 1.5, 1),
    injuryRisk: 0.05, overtimeRisk: 0.3, strengthBonus: -1,
    excuses: [
      { text: "Inventura, musím počítat zboží" },
      { text: "Kolegyně onemocněla, musím ji zastoupit" },
      { text: "Závoz přijel pozdě, musím to naskladnit" },
      { text: "Dneska bereme velkou objednávku, šéf trvá na mé přítomnosti" },
      { text: "Kasa se zasekla, čekám na servisáka" },
      { text: "Předvánoční šturm, šéf volno nedá", weather: ["snow"] },
    ],
  },
  {
    id: "automechanik", name: "Automechanik", w: W(1.5, 2, 2, 1.5, 1),
    injuryRisk: 0.3, overtimeRisk: 0.4, strengthBonus: 1,
    excuses: [
      { text: "Zákazník potřebuje auto na pondělí, musím to dodělat" },
      { text: "Rozebral jsem motor a nemůžu to nechat rozloženýho" },
      { text: "Dodavatel přivezl díly, musím je zabudovat hned" },
      { text: "Diagnostika hlásí chybu, už 3 hodiny hledám kde to je" },
      { text: "Zvedák se zasekl s autem nahoře, čekám na technika" },
    ],
  },
  {
    id: "svarac", name: "Svářeč", w: W(0.3, 1, 1, 1, 0.8),
    injuryRisk: 0.4, overtimeRisk: 0.4, strengthBonus: 1,
    excuses: [
      { text: "Svařuju bránu, nemůžu to nechat napůl" },
      { text: "Musím dodělat zábradlí, slíbil jsem to na víkend" },
      { text: "Dostal jsem varu do oka, musím k doktorovi" },
      { text: "Objednal jsem plyn, právě ho přivezli" },
      { text: "Zákazník čeká na garážová vrata" },
    ],
  },
  {
    id: "malir_pokoju", name: "Malíř pokojů", w: W(0.3, 1, 1, 1, 0.8),
    injuryRisk: 0.1, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      { text: "Maluju byt, barva schne a musím nanést další vrstvu" },
      { text: "Zákazník chce hotovo do pondělka" },
      { text: "Dělám výmalbu školky, děti přijdou v pondělí" },
      { text: "Udělal jsem špatný odstín, míchám to znovu" },
      { text: "Padl mi válec do barvy, čistím to hodinu" },
      { text: "Sezóna maleb, mám nabito do konce prázdnin", weather: ["sunny", "cloudy"] },
    ],
  },
  {
    id: "postovni", name: "Poštovní doručovatel", w: W(0.2, 0.5, 0.5, 0.5, 0.3),
    injuryRisk: 0.1, overtimeRisk: 0.2, strengthBonus: 0,
    excuses: [
      { text: "Mám přesčas, balíků je jak o Vánocích" },
      { text: "Kolega je na nemocenský, jedu dvě trasy" },
      { text: "Dneska je výplata důchodů, trvá to do večera" },
      { text: "Pejsek u Novákových mě zase nepustil za branku" },
      { text: "Auto se mi porouchalo na obhůzce, čekám na odtah" },
    ],
  },
  {
    id: "spravce_hriste", name: "Správce hřiště", w: W(0.3, 0.3, 0.3, 0.3, 0.3),
    injuryRisk: 0.1, overtimeRisk: 0.2, strengthBonus: 0,
    excuses: [
      { text: "Musím posekat trávník před zítřejším zápasem... mládeže" },
      { text: "Zalévám, potrubí prasklo" },
      { text: "Někdo vyrazil dveře do šaten, volám policii" },
      { text: "Zalévací systém se rozbil, musím to spravit ručně" },
      { text: "Připravuju čáry na zítřek, nemůžu to přerušit" },
      { text: "Musím zalít, jinak mi to do neděle uschne", weather: ["sunny"] },
      { text: "Odklízím sníh z hrací plochy, sám to nedám", weather: ["snow"] },
    ],
  },

  {
    id: "obchodnik", name: "Obchodník", w: W(0.5, 1, 1.5, 1.5, 1),
    injuryRisk: 0.05, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      { text: "Mám jednání s dodavatelem, nemůžu zrušit" },
      { text: "Jedu na veletrh, vracím se až večer" },
      { text: "Klient si vyžádal schůzku dnes, nemůžu odmítnout" },
      { text: "Dělám reklamaci u velkého zákazníka" },
      { text: "Prezentace pro nový kontrakt se protáhne" },
    ],
  },
  {
    id: "opravarOS", name: "Opravář", w: W(1, 1.5, 1, 0.5, 0.3),
    injuryRisk: 0.2, overtimeRisk: 0.3, strengthBonus: 1,
    excuses: [
      { text: "Opravuju čerpadlo, nemůžu to nechat rozloženýho" },
      { text: "Volali mě k havárii, musím jet hned" },
      { text: "Nefunguje výtah v paneláku, 8 pater bez něj" },
      { text: "Objednal jsem náhradní díly, právě dorazily" },
      { text: "Motor na mlýnku si vyžádal kompletní rozbor" },
    ],
  },
  {
    id: "zahradnik", name: "Zahradník", w: W(1.5, 1.5, 1, 0.5, 0.3),
    injuryRisk: 0.15, overtimeRisk: 0.2, strengthBonus: 1,
    excuses: [
      { text: "Musím zasadit stromy, přišly ze školky" },
      { text: "Stříhám živý plot, zákazník tlačí na termín" },
      { text: "Koncentrát do postřiku zasychá, musím hned stříkat" },
      { text: "Zákaznice chce mít před víkendem hotové, jedu i v neděli" },
      { text: "Sekačka mě nepustila, musím do servisu" },
      { text: "Sezóna, sekám od rána do večera", weather: ["sunny", "cloudy"] },
      { text: "Musím zabalit rostliny, než přijde mráz", weather: ["wind", "cloudy"] },
    ],
  },
  {
    id: "ridic_autobusu", name: "Řidič autobusu", w: W(0.5, 1, 1.5, 1.5, 1),
    injuryRisk: 0.05, overtimeRisk: 0.5, strengthBonus: 0,
    excuses: [
      { text: "Mám směnu, jezdím do Prachatic a zpět" },
      { text: "Kolega nepřišel, musím ho zastoupit" },
      { text: "Porouchal se autobus, čekám na servis" },
      { text: "Dělám školní zájezd, nevrátím se dřív než v sedm" },
      { text: "Dispečink mě poslal nahradit nemocného kolegu" },
    ],
  },
  {
    id: "stolar", name: "Stolař", w: W(1, 1.5, 1, 0.5, 0.3),
    injuryRisk: 0.25, overtimeRisk: 0.3, strengthBonus: 1,
    excuses: [
      { text: "Dodělávám schody, zákazník stěhuje za týden" },
      { text: "Musím nařezat materiál, fréza je volná jen dneska" },
      { text: "Zákazník přijde pro nábytek, musím ho dokončit" },
      { text: "Dřevo mi uschlo moc rychle, pracuju přes noc" },
      { text: "Chybí mi pár dílů, čekám na doručení" },
    ],
  },
  {
    id: "mistr_v_tovarne", name: "Mistr v továrně", w: W(0.3, 1, 2, 2, 1.5),
    injuryRisk: 0.15, overtimeRisk: 0.5, strengthBonus: 0,
    excuses: [
      { text: "Máme přesčas v továrně, šéf nás nepustí" },
      { text: "Porouchala se linka, musím to řešit" },
      { text: "Audit nás drží v práci déle než obvykle" },
      { text: "Kontrola kvality mi hlásí zmetky, řeším to" },
      { text: "Nemocenská v brigádě, převzal jsem dispečink" },
    ],
  },
  {
    id: "delnik_v_pile", name: "Dělník v pile", w: W(2, 1.5, 0, 0, 0),
    injuryRisk: 0.4, overtimeRisk: 0.4, strengthBonus: 2,
    excuses: [
      { text: "Pořezali jsme velkou zakázku, musíme to dodělat" },
      { text: "Přivezli kmeny, musím je zpracovat dokud je čerstvý" },
      { text: "Pás se mi zasekl, opravuji celé dopoledne" },
      { text: "Šéf nabídl dvojnásobnou sazbu, nemůžu odmítnout" },
      { text: "Musíme dokončit export do Rakouska před pátkem" },
    ],
  },
  {
    id: "delnik_v_kamenolomu", name: "Dělník v kamenolomu", w: W(1, 0.5, 0, 0, 0),
    injuryRisk: 0.5, overtimeRisk: 0.4, strengthBonus: 3,
    excuses: [
      { text: "Odstřel se posunul na dnešek, musím být na místě" },
      { text: "Nakládáme štěrk, kamion čeká" },
      { text: "Drtič se zastavil, musím pomoct s uvolněním" },
      { text: "Kontrola bezpečnosti, všichni musí být přítomni" },
      { text: "Přijela nová parta, musím jim vysvětlit postupy" },
    ],
  },

  // ═══════════════════════════════════════
  // MĚSTSKÁ POVOLÁNÍ (town+)
  // ═══════════════════════════════════════
  {
    id: "ridic_kamionu", name: "Řidič kamionu", w: W(0.2, 0.5, 2, 2, 1.5),
    injuryRisk: 0.15, overtimeRisk: 0.7, strengthBonus: 0,
    excuses: [
      { text: "Jsem v Německu, vracím se až v neděli večer" },
      { text: "Dodávka se zdržela, nemůžu odstavit kamion" },
      { text: "Šéf mě poslal na extra jízdu, nemohl jsem odmítnout" },
      { text: "Mám tacho, musím držet povinnou pauzu" },
      { text: "Zavřeli hranici, stojím v koloně" },
      { text: "Stojím v koloně, silnice jsou neprůjezdný", weather: ["snow"] },
    ],
  },
  {
    id: "elektrikar", name: "Elektrikář", w: W(0.1, 0.3, 1.5, 1.5, 1.5),
    injuryRisk: 0.25, overtimeRisk: 0.4, strengthBonus: 0,
    excuses: [
      { text: "Havarijní výjezd, někde spadl stožár" },
      { text: "Musím dodělat rozvody, jinak lidi nebudou mít proud" },
      { text: "Zkrat v panelovém domě, hlídám to" },
      { text: "Rozvaděč mi padá, jsem v objektu do večera" },
      { text: "Revize, musí být hotovo do zítřka" },
      { text: "Vypadl proud v celé ulici, hledám poruchu", weather: ["wind", "snow"] },
      { text: "Vichřice strhla dráty, jsme venku všichni" },
    ],
  },
  {
    id: "hasic", name: "Hasič", w: W(0.1, 0.3, 1, 1, 1),
    injuryRisk: 0.2, overtimeRisk: 0.3, strengthBonus: 2,
    excuses: [
      { text: "Máme pohotovost, nemůžu odejít ze stanice" },
      { text: "Výjezd k požáru, sorry" },
      { text: "Záchrana osob z auta na D4" },
      { text: "Cvičení, velitel nás nepustí" },
      { text: "Technický zásah, kosmetický salón má plyn" },
    ],
  },
  {
    id: "policista", name: "Policista", w: W(0.1, 0.3, 1, 1, 1),
    injuryRisk: 0.15, overtimeRisk: 0.4, strengthBonus: 1,
    excuses: [
      { text: "Mám službu, nedomluvil jsem si výměnu" },
      { text: "Vyšetřujeme případ, nemůžu odejít" },
      { text: "Vloupání u benzínky, zajišťuju místo činu" },
      { text: "Nasazení na fotbale v Budějcích" },
      { text: "Kolega zranil ruku, musím ho doprovodit" },
    ],
  },
  {
    id: "kuchar", name: "Kuchař", w: W(0.1, 0.3, 1.5, 1.5, 1.5),
    injuryRisk: 0.15, overtimeRisk: 0.4, strengthBonus: 0,
    excuses: [
      { text: "Máme plný restauraci, nemůžu odejít od plotny" },
      { text: "Kolega onemocněl, vařím sám" },
      { text: "Šéf objednal rauty, pracuju přesčas" },
      { text: "Přivezli špatnou dodávku, řeším reklamaci" },
      { text: "Stroj se zasekl, musím to dělat ručně" },
      { text: "Vaříme na hody, mám sto padesát porcí", weather: ["sunny", "cloudy"] },
      { text: "Vánoční večírky, kuchyň jede na plný pecky", weather: ["snow"] },
    ],
  },
  {
    id: "cisnik", name: "Číšník", w: W(0.1, 0.3, 1, 1, 1),
    injuryRisk: 0.05, overtimeRisk: 0.4, strengthBonus: -1,
    excuses: [
      { text: "Máme svatbu v restauraci, potřebují mě" },
      { text: "Šéf mě nemůže uvolnit, je plno" },
      { text: "Oslava sedmdesátin, předem objednané" },
      { text: "Kolegyně odešla v poledne, obsluhuju celý salon" },
      { text: "Pokladna se sekla, řešíme to s technikem" },
      { text: "Hody, roznáším od rána do noci", weather: ["sunny", "cloudy"] },
      { text: "Vánoční žně, šéf volno nedá", weather: ["snow"] },
    ],
  },
  {
    id: "skladnik", name: "Skladník", w: W(0.1, 0.3, 1.5, 1.5, 1.5),
    injuryRisk: 0.2, overtimeRisk: 0.5, strengthBonus: 1,
    excuses: [
      { text: "Přijela dodávka, musím to naskladnit" },
      { text: "Inventura, nemůžu odejít" },
      { text: "Vysokozdvih se rozbil, nakládáme to ručně" },
      { text: "Zákazník si vyžádal okamžitou expedici" },
      { text: "Kamion zapadl na rampě, řešíme to s technikou" },
    ],
  },
  {
    id: "zachranar", name: "Záchranář", w: W(0, 0.1, 0.5, 0.5, 0.5),
    injuryRisk: 0.1, overtimeRisk: 0.3, strengthBonus: 1,
    excuses: [
      { text: "Mám službu na záchrance" },
      { text: "Kolega onemocněl, musím ho zastoupit" },
      { text: "Výjezd na autohavárii, nekončíme do večera" },
      { text: "Převoz pacienta do Prahy, vrátím se pozdě" },
      { text: "Mimořádný výjezd na infarkt, nemůžu odejít" },
    ],
  },
  {
    id: "strojni_inzenyr", name: "Strojní inženýr", w: W(0, 0.1, 0.5, 0.5, 0.5),
    injuryRisk: 0.1, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      { text: "Mám deadline na projekt, musím to dokončit" },
      { text: "Odběratel trvá na tom, abych byl u zkušebního provozu" },
      { text: "Konstrukční výkresy mi odmítli, musím je přepracovat" },
      { text: "Klient přiletěl na prohlídku závodu, nemůžu chybět" },
      { text: "Zasedání vedení, šéf trvá na mé přítomnosti" },
    ],
  },
  {
    id: "podnikatel", name: "Podnikatel", w: W(0.1, 0.3, 1, 1, 1),
    injuryRisk: 0.05, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      { text: "Mám jednání s odběratelem, nemůžu zrušit" },
      { text: "Daňový poradce přijede jen dneska" },
      { text: "Finanční úřad volá, potřebuju odpovědět osobně" },
      { text: "Nový zákazník chce vidět provoz" },
      { text: "Zaměstnanec dal výpověď, řeším předávání" },
    ],
  },

  // ═══════════════════════════════════════
  // MĚSTSKÁ / KANCELÁŘSKÁ (city)
  // ═══════════════════════════════════════
  {
    id: "programator", name: "Programátor", w: W(0, 0.1, 0.3, 1, 1.5),
    injuryRisk: 0.02, overtimeRisk: 0.3, strengthBonus: -2,
    excuses: [
      { text: "Mám deploy na produkci, nemůžu odejít" },
      { text: "Padl server, musím to fixnout remote" },
      { text: "Sprint review, šéf trvá na tom že musím být" },
      { text: "Právě mi rozbili code review, potřebuju to přepsat" },
      { text: "Mám volání s klientem v Americe, nemůžu přesunout" },
    ],
  },
  {
    id: "ucetni", name: "Účetní", w: W(0, 0.1, 0.3, 1, 1.5),
    injuryRisk: 0.02, overtimeRisk: 0.4, strengthBonus: -2,
    excuses: [
      { text: "Uzávěrka, počítám do noci" },
      { text: "Přiznání k DPH musí být dneska" },
      { text: "Klient chce audit, řeším ho celý víkend" },
      { text: "Finanční úřad chce doplňující podklady" },
      { text: "Zasekly se mi faktury v systému, opravuji to" },
    ],
  },
  {
    id: "ucitel", name: "Učitel", w: W(0.1, 0.3, 1, 1, 1),
    injuryRisk: 0.05, overtimeRisk: 0.2, strengthBonus: -1,
    excuses: [
      { text: "Mám dozor na školním výletě" },
      { text: "Rodičovská schůzka, nemůžu to zrušit" },
      { text: "Opravuji písemky do večera" },
      { text: "Zastupuju nemocného kolegu, učím dvojnásobek" },
      { text: "Pedagogická rada se protáhla, nevrátím se včas" },
      { text: "Vysvědčení, uzavírám známky" },
      { text: "Začátek roku, mám na krku nový třídy" },
    ],
  },
  {
    id: "urednik", name: "Úředník", w: W(0, 0.1, 0.3, 1, 1.5),
    injuryRisk: 0.02, overtimeRisk: 0.2, strengthBonus: -2,
    excuses: [
      { text: "Musím dodělat podklady pro zastupitelstvo" },
      { text: "Audit, nemůžu chybět" },
      { text: "Starosta svolal mimořádnou poradu" },
      { text: "Dělám hlášení pro kraj, deadline je zítra" },
      { text: "Zákazníků je dneska strašně moc, přesčasy" },
    ],
  },

  // ═══════════════════════════════════════
  // PRAŽSKÉ / MĚSTSKÉ (town/city)
  // ═══════════════════════════════════════
  {
    id: "revizor", name: "Revizor", w: W(0, 2, 3, 2, 3),
    injuryRisk: 0.05, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      { text: "Mám kontrolní den na lince 22" },
      { text: "Revizoři mají poradu na Florenci" },
      { text: "Chytil jsem černého pasažéra, musím sepsat protokol" },
      { text: "Cestující se bránil, volám parťáky" },
      { text: "Nasazení na noční trase, končím v pět ráno" },
    ],
  },
  {
    id: "tramvajak", name: "Řidič tramvaje", w: W(0, 3, 4, 3, 4),
    injuryRisk: 0.1, overtimeRisk: 0.6, strengthBonus: 0,
    excuses: [
      { text: "Mám směnu na trojce" },
      { text: "Kolega nepřišel, musím jet za něj" },
      { text: "Výluka na Vinohradské, musím objíždět" },
      { text: "Ranní směna na Barrandov, nekončím do šesti" },
    ],
  },
  {
    id: "bezdomovec", name: "Bezdomovec", w: W(0, 0.5, 1, 1, 2),
    injuryRisk: 0.2, overtimeRisk: 0.05, strengthBonus: -1,
    excuses: [
      { text: "Někdo mi obsadil lavičku" },
      { text: "Sbírám lahve u Tesca" },
      { text: "Spím pod mostem, nepřišla mi SMS" },
      { text: "Ztratil jsem boty" },
    ],
  },
  {
    id: "ridic_boltu", name: "Řidič Boltu", w: W(0, 2, 3, 2, 4),
    injuryRisk: 0.05, overtimeRisk: 0.4, strengthBonus: 0,
    excuses: [
      { text: "Mám bonusovej cíl, ještě 3 jízdy" },
      { text: "Zákazník mě odvezl na Zličín" },
      { text: "Surge pricing, teď se nevyplatí zastavit" },
      { text: "Dostal jsem 1 hvězdu, musím napsat podpůrné odvolání" },
      { text: "Auto je v myčce, vrátím se až odpoledne" },
    ],
  },
  {
    id: "barman", name: "Barman", w: W(0, 2, 3, 2, 3),
    injuryRisk: 0.05, overtimeRisk: 0.5, strengthBonus: 0,
    excuses: [
      { text: "Máme live music večer, nemůžu odejít" },
      { text: "Kolegyně onemocněla, musím zastoupit" },
      { text: "Rozlil se sud, uklízím" },
      { text: "Hrajeme tequila párty, objednali 200 štamprlí" },
      { text: "Bezpečnostní agentura přijela až ve dvě ráno" },
      { text: "Letní scéna frčí, stojím za barem do rána", weather: ["sunny"] },
      { text: "Silvestr, tady se nedá nic vzít", weather: ["snow"] },
    ],
  },
  {
    id: "kuryr", name: "Kurýr", w: W(0, 2, 3, 2, 4),
    injuryRisk: 0.15, overtimeRisk: 0.5, strengthBonus: 0,
    excuses: [
      { text: "Mám ještě 15 balíků do konce směny" },
      { text: "Navigace mě poslala na Jižák místo Žižkov" },
      { text: "Zásilkovna plná, čekám na vyzvednutí" },
      { text: "Zákazník nebyl doma, jsem třikrát zpátky" },
      { text: "Kolo se mi rozbilo, čekám na servisák" },
    ],
  },
  {
    id: "vratny", name: "Vrátný", w: W(0, 1.5, 2.5, 1.5, 2.5),
    injuryRisk: 0.02, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      { text: "Nemůžu opustit vrátnici, čekám na zásilku" },
      { text: "Střídání nepřišlo" },
      { text: "Alarm se spustil, musím počkat na policii" },
      { text: "Ztratil se klíč od hlavních vrat, hledám" },
      { text: "Kontrola vedení budovy, nemůžu opustit post" },
    ],
  },
  {
    id: "taxikar", name: "Taxikář", w: W(0, 2, 3, 2, 3),
    injuryRisk: 0.05, overtimeRisk: 0.5, strengthBonus: 0,
    excuses: [
      { text: "Mám objednanou jízdu na letiště" },
      { text: "Stojím v koloně na magistrále" },
      { text: "Zákazník zapomněl věci, musím se vracet" },
      { text: "Píchl jsem na dálnici, řeším to" },
      { text: "Cestující mě žádá o jízdu do Plzně, nemůžu odmítnout" },
    ],
  },
  {
    id: "prodavac_trafika", name: "Prodavač v trafice", w: W(0, 1.5, 2.5, 1.5, 2.5),
    injuryRisk: 0.02, overtimeRisk: 0.3, strengthBonus: -1,
    excuses: [
      { text: "Musím zavřít krám, kolega nepřijde" },
      { text: "Přišla kontrola z finančáku" },
      { text: "Přivezli noviny pozdě, musím je roztřídit" },
      { text: "Závoz loterie se opozdil, čekám" },
      { text: "Někdo ukradl časopisy z výlohy, řeším to s policií" },
      { text: "Před svátky je tu fronta až na ulici", weather: ["snow"] },
    ],
  },
  {
    id: "metar", name: "Metař", w: W(0, 1.5, 2.5, 1.5, 2.5),
    injuryRisk: 0.15, overtimeRisk: 0.4, strengthBonus: 1,
    excuses: [
      { text: "Uklízíme po koncertu na Letné" },
      { text: "Dneska mi přidali Smíchov, nestíhám" },
      { text: "Zametám Karlák, nemůžu odejít" },
      { text: "Spadl strom přes chodník, uklízím větve" },
      { text: "Dokončujeme úklid po Silvestru — ještě v lednu" },
    ],
  },
  {
    id: "strojvedouci_metro", name: "Strojvedoucí metra", w: W(0, 2, 3, 2, 3),
    injuryRisk: 0.05, overtimeRisk: 0.6, strengthBonus: 0,
    excuses: [
      { text: "Mám noční na lince B" },
      { text: "Kolega volal nemocného, musím ho zastoupit" },
      { text: "Výluka na Florenci, chaos" },
      { text: "Zpoždění 20 minut, musím to dohnat" },
      { text: "Technická kontrola soupravy, jsem v depu" },
    ],
  },
  {
    id: "hlidac_parkoviste", name: "Hlídač parkoviště", w: W(0, 1.5, 2, 1, 1.5),
    injuryRisk: 0.02, overtimeRisk: 0.3, strengthBonus: 0,
    excuses: [
      { text: "Střídání nedorazilo" },
      { text: "Řeším nabouraný auto na P+R" },
      { text: "Závora se zasekla, čekám na technika" },
      { text: "Pokladna nefunguje, musím ručně přepočítat" },
      { text: "Volal jsem odtahovku kvůli opuštěnému autu" },
    ],
  },
  {
    id: "poulicni_muzikant", name: "Pouliční muzikant", w: W(0, 1, 1.5, 1, 2),
    injuryRisk: 0.05, overtimeRisk: 0.1, strengthBonus: -1,
    excuses: [
      { text: "Mám dobré místo na Karláku, nemůžu odejít" },
      { text: "Kytaru mi zabavil strážník, řeším to" },
      { text: "Vydělávám na nový struny" },
      { text: "Turisti dneska dávají víc, nemůžu jít" },
      { text: "Buskerská licence mi propadla, jsem na úřadě" },
    ],
  },
  {
    id: "ridic_mhd", name: "Řidič autobusu MHD", w: W(0, 2, 3, 2, 3),
    injuryRisk: 0.05, overtimeRisk: 0.6, strengthBonus: 0,
    excuses: [
      { text: "Mám směnu na 119 na letiště" },
      { text: "Kolaps na Smíchově, stojíme v koloně" },
      { text: "Ranní špička, jedeme nadoraz" },
      { text: "Cestující nám dělá problémy, volám policii" },
      { text: "Dispečink změnil rozpis, nemůžu to přehodit" },
    ],
  },
  {
    id: "uklidova_firma", name: "Uklízeč kanceláří", w: W(0, 1.5, 2.5, 1.5, 2.5),
    injuryRisk: 0.1, overtimeRisk: 0.4, strengthBonus: 0,
    excuses: [
      { text: "Uklízíme kanceláře na Pankráci, noční směna" },
      { text: "Šéf přidal extra zakázku" },
      { text: "Mytí oken v Chodovské věži, stavíme lešení" },
      { text: "Havarijní úklid po záplavě v suterénu" },
      { text: "Strojový úklid, nemůžu to přerušit" },
    ],
  },

  // ═══════════════════════════════════════
  // UNIVERZÁLNÍ (věkové)
  // ═══════════════════════════════════════
  {
    id: "student", name: "Student", w: W(0, 0, 0, 0, 0), // Přiřazuje se dle věku
    injuryRisk: 0.1, overtimeRisk: 0.1, strengthBonus: 0,
    excuses: [
      { text: "Mám zkoušku zítra, musím se učit" },
      { text: "Rodiče mě nepustili" },
      { text: "Mám brigádu v McDonaldu, nemůžu si vzít volno" },
      { text: "Seminárka je na pondělí, nestihl jsem ji" },
      { text: "Státnice mi hlásili na dneska, přesunuli to" },
      { text: "Studijní skupina se sešla, nemůžu je vynechat" },
    ],
  },
  {
    id: "nezamestnany", name: "Nezaměstnaný", w: W(0.5, 0.5, 0.5, 0.5, 0.5),
    injuryRisk: 0.05, overtimeRisk: 0.05, strengthBonus: 0,
    excuses: [
      { text: "Mám pohovor, nemůžu přijít" },
      { text: "Musím na úřad práce" },
      { text: "Přišla mi nabídka práce, rozhodujeme se doma" },
      { text: "Poradce mi domluvil schůzku, nemůžu odkládat" },
      { text: "Manželka řekla že si musím hledat práci celý den" },
    ],
  },
  {
    id: "duchodce", name: "Důchodce", w: W(0, 0, 0, 0, 0), // Přiřazuje se dle věku
    injuryRisk: 0.15, overtimeRisk: 0.0, strengthBonus: -1,
    excuses: [
      { text: "Doktor mi zakázal běhat" },
      { text: "Mám vyšetření v nemocnici" },
      { text: "Hlídám vnoučata" },
      { text: "Stará paní u vedle potřebuje pomoct s nákupem" },
      { text: "Mám klub důchodců, nemůžu vynechat" },
      { text: "Manželka trvá na tom abych opravil plot" },
    ],
  },
];

/**
 * Vybere profesní výmluvu vhodnou pro dané počasí.
 *
 * Když povětrnostní varianta nesedí, spadne se na univerzální — proto musí mít
 * každé povolání aspoň jednu bez omezení. Hlídá to test.
 */
export function pickProfessionalExcuse(
  rng: Rng,
  occ: Occupation,
  weather?: Weather,
): string {
  const fits = (e: ProfExcuse) => !e.weather || weather === undefined || e.weather.includes(weather);
  const applicable = occ.excuses.filter(fits);
  const pool = applicable.length > 0 ? applicable : occ.excuses.filter((e) => !e.weather);
  return rng.pick(pool.length > 0 ? pool : occ.excuses).text;
}

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
