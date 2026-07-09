/**
 * Hospoda U Pralesa — generator denních hospodských session.
 * Spouští se z daily-tick (idempotentní per team_id + game_date).
 *
 * Pravidla viz IDEAS.md #1. Fáze 1: attendees + 5% cross-team visit + 3 typy incidentů.
 */

import { logConditionStmt } from "../lib/condition-log";
import { logger } from "../lib/logger";
import { districtPoolFor, type DistrictPool } from "../data/flavor/district-pool";

interface PubAttendee {
  playerId: string;
  firstName: string;
  lastName: string;
  alcohol: number;
  teamId: string;
  isVisitor: boolean;
  fromTeamName?: string;
  avatar?: Record<string, unknown>;
  isCoach?: boolean;
}

interface PubEffect {
  playerId: string;
  type: "condition" | "injury" | "morale" | "hangover";
  delta?: number; // pro condition/morale
  injuryDays?: number; // pro injury
  label: string; // pro UI: "−12 kondice", "Lehké zranění (2 d)", "+3 morálka", "Ranní kocovina"
  /** Volitelný description pro injuries — defaultně "Zranění z hospodské bitky". */
  injuryDescription?: string;
  /** Volitelný subtype injury (např. "zazivaci_potize") — defaultně "obecne". */
  injuryType?: string;
}

interface PubIncident {
  type: string; // "drink_record" | "story" | "automat_win" | "cross_team_fight" | "cross_team_brotherhood" | "cross_team_provocation" | "lone_drinker"
  playerIds: string[];
  text: string;
  effects: PubEffect[];
}

interface DbPlayer {
  id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  alcohol: number;
  patriotism: number;
  temper: number;
  condition: number;
  injured: boolean;
  suspended: boolean;
  recent_pub_days: number; // počet dní co byl v hospodě v posledních 3 dnech
}

interface DbTeam {
  id: string;
  name: string;
  user_id: string;
  league_id: string | null;
  last_match_result: "win" | "loss" | "draw" | null;
  next_match_in_days: number | null;
}

const DAY_WEEKDAY_MOD: Record<number, number> = {
  0: 0.8,  // Ne
  1: 0.6,  // Po
  2: 1.0,  // Út
  3: 1.0,  // St
  4: 1.0,  // Čt
  5: 1.5,  // Pá
  6: 1.5,  // So
};

function attendanceProb(p: DbPlayer, ctx: {
  dayOfWeek: number;
  lastMatchResult: "win" | "loss" | "draw" | null;
  daysToNextMatch: number | null;
  buddiesAlreadyIn: number;
  rivalsAlreadyIn: number;
}): number {
  if (p.injured || p.suspended) return 0;
  let prob = (p.alcohol / 100) * 0.4;

  prob *= DAY_WEEKDAY_MOD[ctx.dayOfWeek] ?? 1.0;
  if (ctx.buddiesAlreadyIn > 0) prob *= 1.5;
  if (ctx.rivalsAlreadyIn > 0) prob *= 0.7;
  if (ctx.lastMatchResult === "win") prob *= 1.8;  // velká oslava
  if (ctx.lastMatchResult === "loss") prob *= 1.4; // smutný flám
  if (ctx.daysToNextMatch !== null && ctx.daysToNextMatch <= 1) prob *= 0.5;
  if (p.condition < 30) prob *= 0.3;
  if (p.recent_pub_days >= 2) prob *= 0.4; // cooldown — manželka

  return Math.min(0.85, prob);
}

const STORY_POOL: DistrictPool<string> = {
  core: [
    "{name} vyprávěl o legendárním zápase, kdy dali 7 gólů soupeři za jediný poločas.",
    "{name} stěžoval na to, že žena už dva dny neuvařila vepřové.",
    "{name} sledoval s ostatními zápas v televizi.",
    "{name} dlouho přesvědčoval ostatní, že soudce v sobotu byl podplacený.",
    "{name} rozebíral, proč se favoritovi pořád daří líp než nám. Shodli se, že mají štěstí.",
    "{name} tvrdil, že jako mladej byl rychlejší než všichni tady dohromady. Nikdo neoponoval.",
  ],
  prachatice: [
    "{name} říkal, že strejda Mlejnek mu doporučil nového kopáče z Petrovic.",
    "{name} si popovídal s hospodským o krávě, která se ztratila u sousedů.",
    "{name} vyprávěl, jak kdysi v Husinci vyhráli pouťový turnaj na penalty až po setmění.",
    "{name} přesvědčoval ostatní, že Boubínský prales je nejlepší tréninkové hřiště v republice.",
    "{name} se hádal s chlapama, jestli je lepší pivo z Vimperka nebo z Prachatic.",
    "{name} líčil, jak na Mářském vrchu chytil signál a viděl celý zápas Sparty na mobilu.",
    "{name} tvrdil, že viděl rysa nad Volary. Nikdo mu nevěřil, ale poslouchali rádi.",
    "{name} rozebíral, proč se Netolicím pořád daří líp než nám. Shodli se, že mají štěstí.",
    "{name} vykládal, jak jednou v Netolicích čekali na rozhodčího dvě hodiny — přijel na traktoru rovnou z pole a pískal v holínkách.",
    "{name} rozebíral, že kdyby se hřiště v Lhenicích neklonilo k potoku, nikdy by nedostali gól z penalty — míč prostě jede z kopce sám.",
    "{name} tvrdil, že když se fouká od Boubína, míč zatáčí sám a stačí ho jen postavit na roh a počkat.",
    "{name} vyprávěl, jak v zimě trénovali na zamrzlém rybníku ve Volarech a gólman chytal rovnou v bruslích.",
    "{name} přesvědčoval hospodu, že nejtěžší soupeř na Prachaticku není žádné mužstvo, ale ten zlatostezkový kopec za brankou.",
  ],
  praha: [
    "{name} vyprávěl, jak kdysi na Julisce viděl zápas z tribuny za stovku a bagetu.",
    "{name} rozebíral, jestli je lepší Sparta nebo Slavia. Hospoda se rozdělila na dva tábory.",
    "{name} přesvědčoval ostatní, že v Praze má fotbal na klepnutí — tři zápasy za víkend, stačí tramvaj.",
    "{name} líčil, jak přišel o dres v šatně na Strahově a našel ho pak na burze na Kolbence.",
    "{name} se hádal, jestli se dá stihnout druhý poločas, když dáš první u výčepu na Andělu.",
    "{name} tvrdil, že potkal v metru bývalého ligistu. Nikdo nevěřil, ale poslouchali rádi.",
    "{name} vykládal, jak jednou stihl derby na Letné i rozlučku na Smíchově v jednom odpoledni — jen díky sedmnáctce.",
    "{name} rozebíral, proč se na Žižkově nedá zaparkovat ani autobus s hráči — museli dojít pěšky a prohráli unavení.",
    "{name} tvrdil, že v Karlíně je tolik kaváren, že po zápase nenajdeš jedinou hospodu s pivem pod padesát.",
    "{name} přesvědčoval ostatní, že náplavka je nejlepší tribuna v Praze — vidíš na hřiště přes řeku a pivo je z bedny.",
    "{name} vyprávěl, jak na Smíchově potkal rozhodčího z minulého kola v metru a celou cestu mu vysvětloval ofsajd.",
  ],
};

const SOLO_TEMPLATES = [
  "{name} seděl sám u baru, ostatní chlapci dnes nikam nešli.",
  "Jen {name} v hospodě — pivař musí vždycky být.",
  "{name} dorazil sám, hospodský mu nalil bez ptaní.",
];

const NOBODY_TEMPLATES = [
  "Včera v hospodě nikdo nebyl, hospodský zavřel už v devět.",
  "Suchá noc — kluci asi sledovali ligu doma.",
  "Tichá středa, jen hospodský s kočkou.",
];

// Cena piva je v hospodě stálá — nedává smysl ji každý den měnit. Specials se proto
// točí kolem jídla / atmosféry, ne kolem ceny.
const DAILY_SPECIALS_POOL: DistrictPool<string> = {
  core: [
    "Specialita dne: Vepřo-knedlo-zelo",
    "Specialita dne: Smažený sýr s tatarkou",
    "Specialita dne: Klobásy na pivu",
    "Dnes: Utopenci · Polévka 25 Kč",
    "Specialita dne: Svíčková (jak od babičky)",
    "Kuchyň zavřená — hospodský dělá sám: jen utopenci a klobásy.",
    "Hospodský pustil polku z gramofonu — nikdo neprotestoval.",
    "Nová pohovka v rohu — zatím se na ni nikdo neodvažuje.",
    "Akce: páté pivo zdarma · Specialita: Žebra na Plzni",
    "Dnes čepujeme Krušovice — z dovozu od strejdy.",
    "Pan starosta sliboval, že platí pivo všem — slib nesplnil.",
    "Hospodský má nový televizor — Sport 1 v HD.",
    "Vichřice strhla cedulku, zatím vchází zadem.",
    "Specialita dne: Guláš s knedlíkem",
    "Dnes: Polévka zdarma ke každému druhému pivu",
  ],
  prachatice: [
    "Specialita dne: Zvěřinový guláš od myslivců z Volar",
    "Dnes: Borůvkové knedlíky z boubínských borůvek",
    "Hospodský pustil dechovku — Šumavanku, nikdo neprotestoval.",
    "Akce ke Slavnostem Zlaté stezky: třetí pivo za pětikorunu",
    "Dnes: Kachna s knedlíkem — recept od babičky z Lhenic",
    "Specialita dne: Pstruh z husinecké přehrady na másle",
    "Specialita dne: Houbová omáčka z boubínských hřibů, houbař ručí za všechny",
    "Dnes: Srnčí na smetaně — myslivci z Volar zvěřinu dovezli za rozbřesku",
    "Akce: ke každému pivu panák hruškovice od souseda z Netolic",
    "Hospodský naškvařil sádlo se škvarky, chleba mizí rychleji než pivo",
    "Dnes: Lhenické buchty s povidly — pekly se od rána, voní po celé návsi",
    "Specialita dne: Jitrnice a jelítka ze zabíjačky, dokud jsou teplé",
    "Traktor přivezl brambory z pole — dnes bramboráky, dokud těsto stačí",
  ],
  praha: [
    "Specialita dne: Trhané vepřové v bulce · IPA na čepu",
    "Dnes: Utopenci klasika — a k tomu točená dvanáctka",
    "Hospodský dal na čepu nový craft z minipivovaru v Karlíně.",
    "Akce: burger a hranolky za stovku · Sport na velkoplošce",
    "Dnes: Svíčková jak od babičky, i když ji vaří kluk z bistra vedle",
    "Nová kávovar za barem — flat white i k pivu, časy se mění.",
    "Akce ke šlágru kola Sparta–Slavia: třetí pivo za pětikorunu",
    "Specialita dne: Smash burger s cibulovým chutney · NEIPA z Vinohrad na čepu",
    "Dnes: Poké bowl vedle utopence — kuchař z Karlína zkouší, co štamgasti dají",
    "Akce: druhá flat white zdarma těm, co dorazí z korporátu po šichtě",
    "Hospodský dal na stůl QR menu, půlka štamgastů ho ignoruje a ukazuje prstem",
    "Dnes: Guláš v chlebu jak z náplavky, ale bez fronty a bez pražských cen",
    "Specialita dne: Tatarák s topinkami · sour ze žižkovského minipivovaru",
    "Nová várka craftu z Holešovic — prý chutná po grepu, štamgasti nevědí, co říct",
  ],
};

const CAT_INCIDENT_TEMPLATES = [
  "Hospodská kočka se otřela o {name}ovu nohu — Marcela mu doma vyčte chlupy.",
  "{name} dal kočce kus klobásy. Kočka rozhodla u koho si dnes lehne.",
  "Kočka se ztratila — půl vesnice ji hledá. Našla se nakonec v sudu.",
  "Kotě skočilo {name}ovi do klína a usnulo. Půl hodiny se nehnul.",
  "Kočka rozbila skleničku panáka. Hospodský prdí jak žába.",
];

const PRIEST_INCIDENT_TEMPLATES = [
  "Pan farář Antonín zaskočil na malé. Pokáral {name}a za fauly v sobotu.",
  "Pan farář se zastavil, dal si jeden a varoval kluky před hříchem alkoholu (sám si dal druhý).",
  "Pan farář s nadšením vyprávěl o derby z roku 78. Tehdy ještě hrál sám.",
];

const SCOUT_INCIDENT_TEMPLATES = [
  "Cizinec u baru pozoroval celý večer {name}a. Hospodský říká, že byl od pana skauta z Olomouce.",
  "Někdo v koutě si dělal poznámky pokaždé, když {name} otevřel pusu. Skaut z vyšší ligy?",
  "K {name}ovi přisedl muž v dobrém kabátě. Po půl hodině zase zmizel — vizitku nechal pod žbánkem.",
];

const WIFE_CALL_INCIDENT_TEMPLATES = [
  "Manželka volala {name}ovi. ‚Domů. Hned.‘ Sebral si bundu a šel.",
  "{name}ova žena vtrhla do hospody a odvedla ho domů za ucho. Hospodský se smál ještě hodinu.",
  "{name}ovi přišla SMS od manželky. Z výrazu bylo jasné, co tam stálo. Šel.",
];

// Žaludek si neporadí — 1 den mimo (slabé zranění typu "zazivaci_potize")
const BAD_FOOD_INCIDENT_TEMPLATES = [
  "{name} si dal guláš ze středy. Byla sobota. Ráno na klozetu složil přísahu, že už nikdy.",
  "{name} snědl utopence co stáli za barem. Hospodský o nich neví, kdy je dělal. Jeho žaludek to ví.",
  "Hospodský {name}ovi naservíroval klobásy „extra zlevněný“. Ráno se {name} omluvil — celý den válí na gauči.",
  "{name} riskl smažený sýr v deset večer. Riskl moc. Trénink ho mine.",
  "{name} sám snědl polévku, co kuchař mlel pondělím. Žaludek mu to nepustil.",
  "{name} dal sázku, že do sebe hodí 6 utopenců. Vyhrál. Žaludek prohrál.",
  "{name} si dal naložený hermelín neznámého stáří. Doma prý lezl po stěnách.",
  "Tatarák s pěti hlavami česneku — {name} ho dal celej. Tělo se mstí.",
  "Hospodský objevil v lednici buchty z minulé pouti a {name} si je nechtěl nechat ujít. Teď je nechce už ničemu ujít.",
];

// Drobné nehody v hospodě — kluzká podlaha, šipky, schody, záchod — 1-2 dny slabé zranění
const PUB_ACCIDENT_INCIDENT_TEMPLATES = [
  "{name} sklouzl po rozlitém pivu. Spadl ne moc, ale ne moc málo. Záda dělají potíže.",
  "{name} uklouzl na záchodě, hlavou do umyvadla. Bouli má jako vajíčko.",
  "{name} chtěl skočit ze schodů do sklepa pro pivo. Posledních pět schodů sjel po zadku.",
  "{name} se chytil klubu při šipkách — šipka skončila v dlani. Nic vážného, ale nepříjemné.",
  "{name} si při fotbálku na automatu lupl loktem o pípu. Druhý den ji ještě cítí.",
  "{name} chtěl předvést salto na pípu. Salto neudělal. Modřinu ano.",
  "{name} se ohnul pro mince co spadly pod hrací automat — vyrazil si záda.",
  "{name} si srazil zub o sklenici, když mu kdosi zezadu zatleskal.",
  "{name} narazil čelem do nízkého trámu jak vstával ze záchodu. Polovina hospody už si toho trámu jakž takž zvykla. {name} ne.",
  "{name} se před hospodou zhoupl na zábradlí. Zábradlí povolilo. Záda taky.",
  "{name} chtěl ukázat kotrmelec na pivním tácu. Nešlo. Lokty teď bolí.",
  "{name} zakopl o nohu židle a sletěl rovnou do nealko regálu. Skla ho jen poškrábala.",
];

// Hospodská rvačka — opilí spoluhráči se nepohodli (intra-team, jiný od cross_team_fight)
const DRUNK_FIGHT_INCIDENT_TEMPLATES = [
  "{name1} a {name2} se po desátém pivu pohádali kdo je lepší obránce. Hospodský řešil rozbitou skleničku.",
  "{name1} řekl {name2}ovi něco o jeho přítelkyni. Ulítla rána. Pak druhá. Hospodský oba vyhodil.",
  "{name1} sebral {name2}ovi posledního panáka. {name2} mu dal pár facek na pamětnou.",
  "{name1} a {name2} si dali na dvoře pěstní zápas o respekt. Oba vyhráli pár modřin.",
  "{name1} osočil {name2}a z fauly v sobotním zápase. Hospodská bitka byla intenzivnější než ten faul.",
  "{name1} a {name2} se servali u kulečníku. Tágo mělo víc poškození než hráči — ale ne moc.",
];

// Dluh na účtu — bez injury, jen narativa
const TAB_INCIDENT_TEMPLATES = [
  "Hospodský dnes vystavil dluhový kámen. {name} na něm má největší podíl.",
  "{name} dostal upozornění — pokud do pátku nezaplatí, čepuje mu hospodský jen čaj.",
  "{name} chtěl zaplatit kartou. Hospodský se zasmál a zapsal mu to.",
];

// ═══════════════════════════════════════════════
// POZITIVNÍ INCIDENTY — at to neni jen plac
// ═══════════════════════════════════════════════

// Jackpot na automatu / Sportce — větší výhra (+5 morálka jednotlivci)
const JACKPOT_INCIDENT_TEMPLATES = [
  "{name} z legrace zmáčkl Sportku — strefil 4 čísla. Tisícovka jde na pivo pro klub.",
  "{name} zatřásl automatem do roztrhání těla — a ono to zacinkalo jak Vánoce. Z hospody odcházel jako král.",
  "{name} vyhrál v tombole vepřové půlky. Půlku rozdal mužstvu, půlku domů. Hrdina večera.",
  "{name}ovi spadla mince do automatu špatně a vrátil mu trojnásobek. Zázrak. Hospoda burácela.",
  "{name} poslal poslední vsazenku „pro štěstí“ — vyhrál víc než celá výplata. Kluci ho pak nepustili domů.",
];

// Někdo platí kolo (starosta, sponzor, strejda) — všichni lokálové +1 morálka
const FREE_ROUND_POOL: DistrictPool<string> = {
  core: [
    "Starosta vlétl do hospody, vyhlásil že platí kolo. Před volbami je hodný i na fotbalisty.",
    "Sponzor zaskočil na inspekci — a za jásotu zaplatil všem druhou rundu.",
    "Hospodský má narozeniny — třetí pivo je dnes zdarma pro každého stálého zákazníka.",
    "Důchodce u stolu otevřel obálku s důchodem a hodil rundu — „za syna co nepíše“.",
  ],
  prachatice: [
    "Strejda Mlejnek se vrátil z Rakouska a hodil na pult padesátku. „Pijte, kluci, je dobře.“",
    "Cizinec ze sousední vesnice prohrál sázku a musí platit kolo — vesnické zákony.",
    "Myslivec z Volar složil divočáka a slaví — celé hospodě platí rundu.",
    "Turista z Bavorska prohrál sázku v šipkách a platí všem — euro bere hospodský rád.",
    "Chalupář z Prahy chtěl zapadnout mezi místní — hodil rundu a hned byl „náš“.",
    "Traktorista stihl svézt seno těsně před bouřkou a z čiré radosti hodil celé hospodě rundu.",
    "Řezník z Netolic prodal celé sele na pouť a z první výplaty koupil chlapům kolo.",
    "Děda přinesl první letošní slivovici na ochutnávku — po třech štamprlích platil pivo všem, aby prý bylo co zajíst.",
    "Houbař prodal bedýnku hřibů překupníkovi u silnice a rovnou v hospodě proměnil výdělek v rundu pro všechny.",
    "Chalupář konečně dostavěl plot bez pomoci vesnice — a z čistého svědomí zaplatil kolo, aby se s místními udobřil.",
  ],
  praha: [
    "Bývalý spoluhráč, co to dotáhl do korporátu, dorazil v obleku a hodil rundu — „dneska platím já“.",
    "Sponzor z Karlína zaskočil po práci a za jásotu zaplatil všem druhou rundu.",
    "Cizinec od vedlejšího stolu prohrál sázku u baru a platí všem — hospodský bere i karty.",
    "Ajťák od vedle dostal padáka i s balíkem odstupného — přišel to zapít a rundu hodil celé hospodě.",
    "Chlápek prodal byt na Vinohradech za majland, stavil se na poslední pivo do staré čtvrti a platil všem do zavíračky.",
    "Kurýr dojezdil směnu na kole a z dýšek postavil celému lokálu rundu — nohy prý stejně necítí.",
    "Bývalý barman z Karlína přišel na návštěvu a ze cti řemesla načepoval všem pivo na pult sám.",
    "Influencer natočil o hospodě story, dostal zaplaceno od pivovaru a z radosti koupil všem druhé kolo.",
  ],
};

// Vítěz pípy — šipky, kvíz, fotbálek, karaoke (+3 morálka jednotlivci)
const BAR_CHAMPION_POOL: DistrictPool<string> = {
  core: [
    "{name} hodil v šipkách 180. Hospoda zaburácela jak po gólu v derby.",
    "{name} vyhrál pivní kvíz — věděl, kolik gólů dal Bican za Slavii. Trofej: konvice piva.",
    "{name} vyhrál fotbálkový turnaj „o korunu hospody“. Pohár prý nese domů, ale spíš ho nedonese.",
    "{name} zazpíval v karaoke Michala Davida tak procítěně, že mu hospoda tleskala dvě minuty.",
    "{name} vyhrál šachy s dědou Karlem — poprvé za 5 let. Pivo dostává do konce týdne zdarma.",
    "{name} si vsadil že vypije tupelák bez nadechnutí. Vsadil dobře. Hospoda dlouho nepřestane komentovat.",
  ],
  prachatice: [
    "{name} vyhrál pivní kvíz otázkou „kterým rokem se otevřela Zlatá stezka turistům“. Trefil. Konvice piva jeho.",
    "{name} zazpíval v karaoke „Holky z naší školky“ tak, že i chlapi z Vimperka zatleskali.",
    "{name} vyhrál turnaj v prší o poslední jitrnici — poražení mlčeli ještě celý týden.",
    "{name} v páce přepral řezníka z Netolic. Hospoda nevěřila, řezník taky ne.",
    "{name} trefil v šipkách třikrát za sebou dvacítku a hospodský mu na počest pojmenoval štamprli.",
    "{name} vyhrál soutěž kdo dýl udrží plný půllitr v natažené ruce — vydržel, než dohrála celá dechovka.",
    "{name} v pivním kvízu věděl přesně, kolik metrů měří rozhledna na Libíně. Konev piva putovala k němu.",
  ],
  praha: [
    "{name} vyhrál pivní kvíz otázkou, kolik stanic má metro C. Věděl. Konvice piva jeho.",
    "{name} zazpíval v karaoke Nohavicu tak, že mu i partička z Vinohrad zatleskala.",
    "{name} vyhrál fotbálkový turnaj o pivo — poražení museli rundu objednat přes appku.",
    "{name} vyhrál kvíz otázkou, ve kterém roce padla stará sparťanská tribuna. Věděl přesně, konev byla jeho.",
    "{name} přepral v páce chlápka z posilovny na Smíchově, co si o sobě moc myslel. Hospoda skandovala.",
    "{name} zazpíval v karaoke Kabát tak procítěně, že se přidal i stůl korporátů a rozlili si latté.",
    "{name} vyhrál fotbálkový turnaj o pivo a poraženého donutil zaplatit přes hospodskou appku, co nikdo neumí.",
    "{name} v šipkách sundal místního přeborníka ze Žižkova. Přeborník od té doby chodí radši na Vinohrady.",
  ],
};

// Vesnický hrdina — hospodský / starší ho vyhlásil hráčem týdne (+3 morálka)
const VILLAGE_HERO_POOL: DistrictPool<string> = {
  core: [
    "Hospodský v rohu vyvěsil dres s {name}ovým jménem. „Náš nejlepší — pivo dnes zdarma.“",
    "Děda Karel vstal od stolu, dopil pivo a oznámil, že {name} je „budoucnost klubu“. Slza ukápla.",
    "Starosta {name}ovi přiťukl: „Tohohle si nesmíme nechat ujít, kdyby ho chtěl velkoklub, půjčíme mu vlak.“",
    "Hospodský dal {name}ovi nálepku „Stálice měsíce“ za pípou. Důstojnost, jakou si dlouho nepamatuje.",
    "Stálí hosté dali {name}ovi přezdívku po legendárním Bicanovi. Nese ji statečně.",
  ],
  prachatice: [
    "Hospodský vyvěsil {name}ův dres vedle vlajky okresu Prachatice. „Tohle je domácí poklad.“",
    "Děda Karel přirovnal {name}a k nejlepšímu kanonýrovi, co kdy z Vimperka vyšel. Pocta nejvyšší.",
    "Hospodský napsal {name}ovo jméno křídou nad pípu s hvězdičkou. Na Prachaticku vyšší pocty není.",
    "Starý pan Kubů prohlásil, že {name} kope líp než celá základka z Husince dohromady, a to už je co říct.",
    "Hospodský {name}ovi věnoval vlastní štamprli s ryskou „jen pro hrdinu kola“. Ostatní jen záviděli.",
    "Děda od vedle vylovil z peněženky zažloutlou fotku svého mužstva a přiznal, že {name} by se mezi ně vešel.",
    "Na nástěnce u hasičárny visí od pondělí {name}ovo jméno jako hráč týdne — hned vedle rozpisu služeb.",
  ],
  praha: [
    "Hospodský vyvěsil {name}ův dres vedle šály se lvíčkem. „Náš nejlepší — pivo dnes zdarma.“",
    "Stálí hosté dali {name}ovi přezdívku po pražské ligové legendě. Nese ji hrdě.",
    "Hospodský {name}ovi rezervoval štamgastskou židli u okna s cedulkou. V pražské hospodě vzácnost k nezaplacení.",
    "Starý pán od kulečníku prohlásil, že {name} by se neztratil ani na Letné. Vyšší chvála v téhle čtvrti nepadla.",
    "Barman napsal {name}ovo jméno na tabuli s denním menu místo polévky. Hospoda to brala jako poctu.",
    "Parta z Vinohrad uznala, že {name} je „ten z naší hospody, co to fakt umí“. Titul, co se nekupuje.",
    "Hospodský {name}ovi natočil první pivo dřív, než si stačil sednout. Vyšší respekt v Praze neexistuje.",
  ],
};

// Šťastné setkání — bývalý spoluhráč / otec / kamarád z dětství (+2 morálka)
const FRIENDLY_REUNION_POOL: DistrictPool<string> = {
  core: [
    "Do hospody přijel bývalý kapitán z 90. let. {name} s ním seděl do třetí — vzpomínky léčí morálku.",
    "{name}ův táta zaskočil na pivo — povídali si o starém klubu. {name} odcházel s úsměvem.",
    "{name} potkal kamaráda z dětství, kterého neviděl 15 let. Slzy v očích, pivo v ruce.",
    "{name} se setkal se svým bývalým trenérem od žáků. Dostal pochvalu — stále kope.",
    "Do hospody přišel novinář z deníku — {name}a se ptal na rozhovor. Druhý den bude v novinách.",
  ],
  prachatice: [
    "Spolužák, co se odstěhoval do Vimperka, přijel na pivo. {name} s ním vzpomínal na žákovská léta.",
    "{name} potkal kamaráda, co teď dělá průvodce na Boubíně. Slíbili si výlet, co nejspíš nebude.",
    "Přišel starý brankář, co se odstěhoval do Volar — {name} s ním do noci řešil, který gól tenkrát vlastně platil.",
    "{name} potkal souseda, co dělá na pile ve Vimperku. Vzpomínali, jak spolu jako kluci nosili dřevo a míč zároveň.",
    "Do hospody zapadl bývalý trenér žáků z Netolic. {name} od něj zase po letech slyšel „dobrá práce, chlapče“.",
    "{name}ovi zaskočil kmotr z Lhenic s demižonem vlastního moštu. Vzpomínek bylo víc než moštu.",
    "Přijel kamarád, co teď hlídá chatu na Kubově Huti. Slíbili si zimní zápas na sněhu, co se nejspíš neuskuteční.",
  ],
  praha: [
    "Do hospody dorazil kamarád, co teď dělá v centru — {name} s ním vzpomínal na žákovská léta na Pankráci.",
    "{name} potkal spoluhráče, co se odstěhoval na druhý konec Prahy. Slíbili si, že zajdou na ligu.",
    "Do hospody dorazil bývalý spolubydlící z koleje na Strahově. {name} s ním vzpomínal na zápasy mezi bloky.",
    "{name} potkal kluka, se kterým jako malý kopal na hřišti za Nuselákem. Most stojí, hřiště zmizelo, přátelství zůstalo.",
    "Přišel starý parťák, co teď dělá číšníka v Karlíně. {name} od něj dostal pivo „na účet starých časů“.",
    "{name}ovi zaskočil táta rovnou z práce v obleku — dali si jedno a probrali, proč se dneska nekope jako dřív.",
    "Do hospody zapadl bývalý spoluhráč, co teď trénuje mládež na Smíchově. {name} slíbil, že se přijde podívat.",
  ],
};

// ═══════════════════════════════════════════════
// TRENÉR INCIDENTY — for fun, generic "Trenér"
// ═══════════════════════════════════════════════

// Trenér ukáže taktiku na ubrousku — narativní, bez efektu
const COACH_TACTICS_INCIDENT_TEMPLATES = [
  "Trenér nakreslil na ubrousek 4-3-3, vysvětloval to půl hodiny. Kluci to pak nechali na stole hospodskému — ten z toho udělal jídelníček.",
  "Trenér chytil pivní tácek a začal kreslit obranou pětku. {name} mu skočil do řeči: „Ty to neumíš ani na papíře.“ Trenér se urazil.",
  "Trenér přinesl do hospody video minulého zápasu na telefonu. Kluci se dvacet minut tvářili, že to sledují.",
  "Trenér mlátil pěstí do stolu a vysvětloval pressing. Hospodský se přišel zeptat, jestli je všechno v pořádku.",
  "Trenér žádal o ticho a prezentoval „filozofii klubu na další sezónu“. Pivo dotekl až po půl hodině.",
];

// Trenér si dá s týmem — narativní + +1 morálka pro lokály
const COACH_JOINS_INCIDENT_TEMPLATES = [
  "Trenér zaskočil na jedno — dvě — tři. Po čtvrtém už zpíval s klukama. Kapitánské znaky padly.",
  "Trenér vlétl do hospody v teplákách, prý jen na kole jezdil okolo. Po hodině měl tři piva a vyprávěl o roce 96.",
  "Trenér si dal s mužstvem rundu „za dobrý trénink“. Přiznal že kluci byli dobří. Vzácný okamžik.",
  "Trenér přišel s manželkou — manželka odjela po pivu, on zůstal. Manželka se zpoždí domů víc než on.",
  "Trenér přijal výzvu kluků na panáky. Třetí už nezvládl. Druhý den jel nemocensky.",
];

// Trenér pochválí hráče — +3 morálka jednomu
const COACH_PRAISE_INCIDENT_TEMPLATES = [
  "Trenér zvedl pivo na {name}a: „Tohohle si pamatujte, kluci. Tohle je hráč.“ {name} se rozzářil.",
  "Trenér před celou hospodou prohlásil, že {name} je nejlepší investice klubu za dekádu. {name} platil další kolo z hrdosti.",
  "Trenér se zastavil u stolu, poklepal {name}ovi na rameno: „Jen tak dál, synku.“ Slza ukápla i hospodskému.",
  "Trenér vyprávěl historku jak {name} v dorostu trefil břevno z půlky. Celá hospoda se smála — i ti co u toho nebyli.",
  "Trenér přiznal, že {name} hraje líp než on kdy hrál. {name} si poprvé v životě připadal jako Bican.",
];

// Trenér vynadá hráči — −2 morálka
const COACH_SCOLD_INCIDENT_TEMPLATES = [
  "Trenér se postavil k {name}ovi: „Ty piješ víc, než běháš. Zítra dva tréninky.“ Hospoda ztichla.",
  "Trenér přistihl {name}a u sedmého piva. Zítra ho čeká individuální plán — sprinty na svahu.",
  "Trenér řekl {name}ovi nahlas, že takhle se nedostane do základu. Hospoda předstírala, že nic neslyšela.",
  "Trenér se otočil na {name}a: „Dnes bys měl spát, ne pít. Zítra ti to spočítám.“",
  "Trenér před týmem rozcuchal {name}ovi vlasy: „Tohle není hipster konference, je to mužstvo.“",
];

// Trenér prohrál sázku — narativní + +2 morálka VŠEM lokálům
const COACH_LOST_BET_INCIDENT_TEMPLATES = [
  "Trenér se vsadil s kapitánem, že vyhraje šipky. Prohrál. Platí dnes všem.",
  "Trenér se nechal vyzvat k pití piva na ex. Selhal. Penalta: kolo pro celý tým.",
  "Trenér tvrdil že vykope penaltu hospodskému přes hlavu. Trefil hodiny. Kolo pro hospodu.",
  "Trenér si vsadil že si vzpomene na všechny góly z minulé sezóny. Pamatoval si tři. Druhý den jeho výplaty bude o pár tisíc tenčí.",
  "Trenér prohrál v kameni-papíru-nůžkách s gólmanem. Hodil rundu — i s panáky.",
];

// Trenér chrápe v hospodě — narativní, jen pro pobavení
const COACH_NAPS_INCIDENT_TEMPLATES = [
  "Trenér se opřel na okamžik o pípu — usnul. Hospodský mu na čelo nakreslil tygří pruhy.",
  "Trenér tvrdil že jen na chvíli zavřel oči — byly tři ráno a hospoda zavírala.",
  "Trenér přemístil hlavu do salátu. Nikdo ho nebudil. Salát byl lehký.",
  "Trenér chrápal hlasitěji než parní lokomotiva. Hospodský musel zesílit hudbu.",
];

// ═══════════════════════════════════════════════
// LOKÁLNÍ KATEGORIE — Prachaticko / Šumava
// ═══════════════════════════════════════════════

// Myslivecký spolek — zvěřina, chlapská sešlost (+2 morálka lokálům). Venkovská záležitost,
// v Praze/ČB nefiruje (prázdné core → districtPoolFor vrátí [] a incident se přeskočí).
const HUNTERS_POOL: DistrictPool<string> = {
  core: [],
  prachatice: [
    "Myslivci z Volar přinesli srnčí — hospoda voní zvěřinou, {name} si přidal dvakrát.",
    "Myslivecký spolek slaví konec honu. {name} dostal nejlepší kus a hrdě ho nese domů.",
    "Po honu na Boubíně se myslivci stavili na jedno — z jednoho bylo deset, ale nálada výborná.",
    "Starý myslivec vyprávěl o jelenu, co mu utekl na Mářském vrchu. Příběh byl lepší než úlovek.",
    "Myslivci přinesli paroží na zeď hospody. {name} pod ním pózoval na fotku celý večer.",
    "Myslivci přinesli čerstvou klobásu z divočáka a hospoda voněla až na náves. {name} stál frontu dvakrát.",
    "Starý myslivec předváděl, jak troubí na jelena, a rozezvučel celou hospodu. {name} se přidal na lesní roh od pípy.",
    "Po honu na Lhenicku se spolek stavil na guláš — {name} snědl porci určenou pro dva.",
    "Myslivci se dohadovali, kdo trefil zajíce první. {name} spor rozhodl tím, že objednal všem rundu.",
    "Hajný přinesl srnčí hřbet a hospodský ho hned dal na pánev. {name} tvrdil, že líp nejedl ani na svatbě.",
  ],
};

// Zabíjačka — vesnické hody (+3 morálka lokálům, malý risk zažívačky). Venkovská záležitost.
const PIG_SLAUGHTER_POOL: DistrictPool<string> = {
  core: [],
  prachatice: [
    "U Vávrů byla zabíjačka — jitrnice, jelítka, ovar. {name} se přejedl tlačenky.",
    "Zabíjačkové hody v hospodě! {name} snědl tolik prejtu, že večer nedopil ani pivo.",
    "Řezník přivezl čerstvou tlačenku rovnou do hospody. {name} byl první u mísy.",
    "Sousedi ze Lhenic dělali zabíjačku a podělili se. {name} si pochvaloval ovar do prasknutí.",
    "Zabíjačková polévka voněla po celé vsi. {name} přišel za vůní a zůstal do rána.",
    "U sousedů zabíjeli a přinesli do hospody plný hrnec ovaru. {name} si nabral, ještě než stačil pozdravit.",
    "Řezník rozdával čerstvé jitrnice přímo přes pípu. {name} tvrdil, že takhle snídat by mohl klidně každý den.",
    "Zabíjačková mísa doputovala až do hospody a byla prázdná dřív, než dohrála dechovka. {name} u toho nechyběl.",
    "Po zabíjačce u Nováků voněla celá ves po škvarcích. {name} přišel na jedno a odešel s pytlíkem tlačenky.",
    "Řezník uspořádal na baru ochutnávku jelítek a jitrnic. {name} hlasoval pro jelítka — třikrát po sobě.",
  ],
};

// Zabloudilý turista — funguje všude (core), Šumava/Praha přidávají kolorit.
const LOST_TOURIST_POOL: DistrictPool<string> = {
  core: [
    "Zbloudilý turista vešel a ptal se na cestu. {name} mu to nakreslil na tácek — opačně.",
    "Promočený cyklista se schoval před deštěm. {name} mu mezitím vysvětlil pravidla mariáše.",
    "Cizinec si dal první české pivo v životě. {name} mu hned objednal druhé.",
    "Turistka se ptala, kde je nejbližší bankomat. {name} se zasmál a ukázal na kasu u hospodského.",
  ],
  prachatice: [
    "Německý turista vešel a ptal se na cestu na Boubín. {name} mu to nakreslil na tácek — opačně.",
    "Promočený cyklista ze Zlaté stezky se schoval před deštěm. {name} mu vysvětloval pravidla mariáše.",
    "Poutník z Bavorska si dal první české pivo v životě. {name} mu hned objednal druhé.",
    "Dva Holanďani hledali Churáňov. Skončili na pivu a Churáňov vzdali.",
    "Zbloudilý houbař z Prahy hledal cestu z lesa. {name} ho dovedl rovnou k pípě.",
    "Rakouský cyklista si spletl hranici a myslel, že je pořád doma. {name} ho ujistil, že pivo je tu levnější, a on zůstal.",
    "Turistka hledala vlak do Vimperka. {name} jí vysvětlil, že další jede až ráno, tak ať si sedne a dá si jedno.",
    "Skupinka skautů z Plzně zabloudila při přechodu Šumavy. {name} jim nad mapou poradil zkratku rovnou k pípě.",
    "Němec se ptal, kde tu mají „echt böhmisch“ knedlík. {name} ukázal na kuchyň a objednal mu rovnou dva.",
    "Pár z Prahy hledal romantickou chatu u jezera. {name} jim nakreslil cestu, ale nejdřív je nechal v klidu dopít.",
  ],
  praha: [
    "Ztracený cizinec hledal Airbnb, mobil vybitej. {name} mu půjčil nabíječku a pivo.",
    "Dva turisti hledali Karlův most a skončili u nás. Most vzdali, pivo ne.",
    "Zmatený návštěvník vystoupil na špatné zastávce tramvaje. {name} ho navedl rovnou k pípě.",
    "Influencerka si u nás dělala story, že objevila „autentickou pražskou hospodu“. {name} zamával do kamery.",
    "Cizinec se ptal, kde koupí lístek na metro. {name} mu vysvětloval Lítačku a pak to vzdal.",
    "Zmatený turista hledal Pražský hrad a byl si jistý, že je za rohem. {name} mu řekl, ať dopije, stejně už je zavřeno.",
    "Skupinka Italů si spletla náplavku s přístavištěm lodí. {name} jim objednal pivo a loď pustili z hlavy.",
    "Turista se ptal, proč tramvaj nejede, když má být „nonstop“. {name} mu vysvětlil výluku a pak to vzdal.",
    "Slovenka hledala nejlepší trdelník ve městě. {name} ji přesvědčil, že utopenec je lepší volba, a měl pravdu.",
    "Zabloudilý beďar s foťákem chtěl vyfotit „opravdovou Prahu“. {name} mu nastavil půllitr a byl na fotce první.",
  ],
};

// Dobrovolní hasiči — SDH po soutěži/cvičení (+2 morálka lokálům). Venkovská záležitost.
const FIREFIGHTERS_POOL: DistrictPool<string> = {
  core: [],
  prachatice: [
    "Dobrovolní hasiči z Lhenic vyhráli okrskovou soutěž — oslava se přesunula do hospody.",
    "{name} pomohl hasičům dotáhnout hadici z cvičení. Odměna: rundu platí velitel.",
    "Hasičská soutěž v požárním útoku skončila, hospoda praská ve švech.",
    "Hasiči z Netolic přijeli s pohárem a předváděli ho každému. {name} si na něj i ťukl.",
    "Po nočním výjezdu k planému poplachu se hasiči stavili na jedno. Bylo jich pět.",
    "SDH Husinec vyhrálo pohár v požárním sportu a přivezlo ho rovnou do hospody. {name} do něj na oslavu načepoval.",
    "Hasiči po celodenním cvičení vysušili hadice a zapadli na jedno. {name} platil za to, že vloni pomohli hasit stodolu.",
    "Velitel sboru vyprávěl, jak kdysi vyprošťovali traktor z rybníka. Historka rostla s každým dalším pivem.",
    "Mladí hasiči trénovali s proudnicí na návsi a pokropili kolemjdoucí. {name} to vzal s humorem a pozval je na pivo.",
    "Po výjezdu k hořícímu seníku se sbor stavil na uklidněnou. {name} jim nechal donést guláš na účet hospody.",
  ],
};

// Pouť / slavnost (+2 morálka lokálům). Šumava = Zlatá stezka, Praha = čtvrťové slavnosti.
const VILLAGE_FAIR_POOL: DistrictPool<string> = {
  core: [],
  prachatice: [
    "Začaly Slavnosti Zlaté stezky v Prachaticích — celá vesnice je v náladě, hospoda taky.",
    "Pouťové kolotoče dorazily do vsi. {name} vyhrál na střelnici plyšáka a věnoval ho hospodské.",
    "Po pouti zůstal v hospodě cukrář a rozdával zbylé perníky. {name} si dal tři.",
    "Na návsi hrála kapela, ale nejlepší atmosféra byla stejně v hospodě. {name} to potvrdil.",
    "Pouťová tombola měla hlavní cenu sele. Vyhrál ho {name} a netuší, kam ho dá.",
    "Na pouti v Husinci vyhrával flašinet a chlapi z hospody vyrazili tancovat — vrátili se s cukrovou vatou místo piva.",
    "Pouťové autodromy hučely do noci. {name} prohrál se synem tři koruny a odvetu si dal až u pípy.",
    "Na netolické pouti prodávali trdelník na každém rohu. {name} přišel navoněný skořicí a nikdo nevěřil, že nepekl.",
    "Po slavnosti zbyl u hospody stánek s klobásami — {name} dojedl vše, co pouť nezvládla.",
    "Kolotočáři po zavíračce pouti zapadli na jedno a vyprávěli, jak to chodí od Vimperka až po Sušici.",
  ],
  praha: [
    "Začala Žižkovská noc — celá čtvrť je v náladě, hospoda taky.",
    "Food festival na náplavce skončil a zbylí kuchaři dorozdávali porce. {name} si dal tři.",
    "Sousedská slavnost v parku, kapela hrála, ale nejlepší atmosféra byla stejně v hospodě.",
    "Farmářské trhy skončily a prodavači zapadli na jedno. {name} vyhandloval kýbl jahod za rundu.",
    "Po slavnosti na Výstavišti zůstal v hospodě žonglér a učil kluky triky s tácky.",
    "Vinohradské vinobraní skončilo a poslední stánkaři dorozdávali burčák. {name} si dal dva a tvrdil, že to není alkohol.",
    "Na Smíchově byla pouliční slavnost s kapelou z Balkánu. {name} se vrátil do hospody a učil chlapy tancovat kolo.",
    "Karlínské sousedské grilování rozehnal déšť. Celá čtvrť se přesunula k nám i s buřty.",
    "Po festivalu světel bloudili lidi s foťáky od výlohy k výloze. {name} jim posvítil rovnou na cestu do hospody.",
    "Žižkovský blešák sbalil stánky a trhovci zapadli na pivo. {name} vyhandloval starý dres za rundu.",
  ],
};

// Vichřice / výpadek proudu (narativ). Šumavská verze.
const STORM_BLACKOUT_POOL: DistrictPool<string> = {
  core: [],
  prachatice: [
    "Vichřice na Šumavě shodila elektriku. Hospodský čepoval při svíčkách — atmosféra jak za první republiky.",
    "Spadl strom přes silnici z Kubovy Huti. {name} uvízl v hospodě a nestěžoval si.",
    "Sněhová kalamita na Churáňově — {name} radši přečkal nečas u piva.",
    "Bouřka vyhodila pojistky. {name} tvrdil, že pivo při svíčkách chutná líp, a měl pravdu.",
    "Vichr strhl plech ze střechy. Než přijde pokrývač, hospodský nalévá na uklidněnou.",
    "Vichr shodil dráty a celá ves byla ve tmě. Hospodský vytáhl petrolejku a {name} tvrdil, že takhle bylo líp za mlada.",
    "Ledovka spolkla cestu z Vimperka a nikdo se nedostal domů. {name} přečkal noc na lavici u kamen a byl spokojený.",
    "Blesk uhodil do trafostanice a půl Prachaticka zůstalo bez proudu. {name} navrhl, že dokud netočí televize, budou točit pivo.",
    "Orkán lámal stromy nad Boubínem a hospodský radši zavřel okenice. {name} u svíčky vyprávěl strašidelné historky.",
    "Sníh zavál příjezdovku a pluh nikde. {name} pomohl odházet vchod a odměnou dostal pivo na účet podniku.",
  ],
};

// Houbaři — chlubení (narativ). Funguje všude, Boubín jako topup.
const MUSHROOM_BRAG_POOL: DistrictPool<string> = {
  core: [
    "{name} přinesl do hospody plný košík hřibů a chlubil se každému.",
    "{name} tvrdil, že našel václavky velké jak talíř. Nikdo mu nevěřil, fotka byla rozmazaná.",
    "Houbařská sezóna vrcholí — {name} prozradil své tajné místo. Ráno toho litoval.",
    "{name} vyměnil s hospodským košík klouzků za tři piva. Obchod století.",
    "{name} se vsadil, že pozná hřib od muchomůrky poslepu. Vyhrál, ale málem ne.",
  ],
  prachatice: [
    "{name} přinesl košík hřibů z pod Boubína a dušoval se, že tam roste to nejlepší v republice.",
    "{name} se dušoval, že pod Boubínem našel křemenáče, co by jim záviděl i lesník. Lesník přisvědčil, ale místo slyšet nechtěl.",
    "{name} přinesl hřiby z volarských slatí a tvrdil, že rostou jen tam, kde ví jen on a jeden jelen.",
    "{name} položil na barpult hřib velký jak bochník a prohlásil, že takový roste jen nad Zlatou stezkou.",
    "{name} vyrazil na houby ještě za tmy, aby předběhl souseda z Lhenic. Soused tam byl dřív a nechal mu na pařezu vzkaz.",
    "{name} se chlubil sušenými hřiby z pod Boubína a hospodský přiznal, že do zvěřinového guláše by je vzal hned.",
  ],
};

// Starosta / zastupitel zaskočí (+1 morálka lokálům) — předvolební ironie
const OFFICIAL_VISIT_INCIDENT_TEMPLATES = [
  "Starosta zaskočil na pivo a sliboval nové hřiště. Před volbami slibuje rád.",
  "Pan zastupitel přišel zjistit náladu mezi lidem — a zůstal do zavíračky.",
  "Starosta vyhlásil, že obec přispěje na nové dresy. Hospoda zatleskala (a nevěří).",
  "Místostarosta přinesl plán nové autobusové zastávky. {name} ho přemluvil i na lavičku u hřiště.",
  "Starosta koupil klukům kolo „za reprezentaci obce“. Reprezentovali statečně až do rána.",
];

// Politický trapas v hospodě (narativ, bez efektu) — pro pobavení
const OFFICIAL_SCANDAL_INCIDENT_TEMPLATES = [
  "Zastupitel po šestém pivu prozradil, kolik obec utratila za kruhový objezd. Ticho jak v kostele.",
  "Starosta se vsadil, že vykope penaltu — trefil okno radního auta. Zápis bude na příští schůzi.",
  "Opoziční zastupitel a starosta se pohádali o dotaci přímo u baru. Hospodský musel zasáhnout.",
  "Zastupitel slíbil, že most opraví do podzimu. Místní si tu větu zapsali na pivní tácek a schovali.",
  "Starosta omylem poslal pracovní SMS do hospodské skupiny. Půl vsi teď ví o nové vyhlášce dřív.",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateIncidents(attendees: PubAttendee[], rivalsMap: Map<string, Set<string>>, _buddiesMap: Map<string, Set<string>>, coachName: string = "Trenér", district?: string): PubIncident[] {
  const incidents: PubIncident[] = [];

  if (attendees.length === 0) {
    return [{ type: "nobody", playerIds: [], text: pickRandom(NOBODY_TEMPLATES), effects: [] }];
  }

  if (attendees.length === 1) {
    const p = attendees[0];
    return [{ type: "lone_drinker", playerIds: [p.playerId], text: pickRandom(SOLO_TEMPLATES).replaceAll("{name}", `${p.firstName} ${p.lastName}`), effects: [] }];
  }

  const visitors = attendees.filter((a) => a.isVisitor);
  const locals = attendees.filter((a) => !a.isVisitor);

  // ── Cross-team interactions (přednost) ──
  if (visitors.length > 0 && locals.length > 0) {
    for (const v of visitors) {
      const localRival = locals.find((l) => rivalsMap.get(l.playerId)?.has(v.playerId) || rivalsMap.get(v.playerId)?.has(l.playerId));
      const partner = localRival ?? pickRandom(locals);
      const fightProb = localRival ? 0.30 : 0.12;
      const roll = Math.random();

      if (roll < fightProb) {
        // Pro každého fightera: 50/50 zranění 1-3 dny | -12 condition
        const fightEffects: PubEffect[] = [];
        for (const fighter of [partner, v]) {
          if (Math.random() < 0.5) {
            const days = 1 + Math.floor(Math.random() * 3);
            fightEffects.push({ playerId: fighter.playerId, type: "injury", injuryDays: days, label: `Lehké zranění (${days} ${days === 1 ? "den" : days < 5 ? "dny" : "dní"})` });
          } else {
            fightEffects.push({ playerId: fighter.playerId, type: "condition", delta: -12, label: "−12 kondice (modřiny)" });
          }
        }
        incidents.push({
          type: "cross_team_fight",
          playerIds: [partner.playerId, v.playerId],
          text: `${partner.firstName} ${partner.lastName} a ${v.firstName} ${v.lastName} (${v.fromTeamName}) se chytli nad pivem. Hospodský je rozdělil koštětem.`,
          effects: fightEffects,
        });
      } else if (roll < fightProb + 0.20) {
        incidents.push({
          type: "cross_team_brotherhood",
          playerIds: [partner.playerId, v.playerId],
          text: `${partner.firstName} koupil ${v.firstName}ovi (${v.fromTeamName}) pivo a prokecali do dvou ráno. Žádné nepřátelství.`,
          effects: [
            { playerId: partner.playerId, type: "morale", delta: 2, label: "+2 morálka" },
          ],
        });
      } else if (roll < fightProb + 0.20 + 0.25) {
        incidents.push({
          type: "cross_team_provocation",
          playerIds: [partner.playerId, v.playerId],
          text: `${v.firstName} (${v.fromTeamName}) provokoval domácí, že vesnice neumí kopnout. Naši se nadzvedli.`,
          effects: [
            { playerId: partner.playerId, type: "morale", delta: 3, label: "+3 morálka (motivace)" },
          ],
        });
      }
    }
  }

  // ── Local incidents ──
  // Ranní kocovina — per attendee s alcohol≥50, prob 10–30% dle alcohol škály.
  // Sjednocuje "drink record" mechaniku: kdo pije moc → ráno bude těžko.
  const hangoverVictims: PubAttendee[] = [];
  for (const a of locals) {
    if (a.alcohol < 50) continue;
    const prob = 0.10 + ((a.alcohol - 50) / 50) * 0.20; // alcohol 50→10%, 75→20%, 100→30%
    if (Math.random() < prob) hangoverVictims.push(a);
  }

  // Top opilec dostane "vypil rekord" flavour text (zachová lore)
  const topDrinker = hangoverVictims.sort((a, b) => b.alcohol - a.alcohol)[0];
  if (topDrinker) {
    const beers = 14 + Math.floor(Math.random() * 14); // 14-27 piv (vesnicky pivar)
    incidents.push({
      type: "drink_record",
      playerIds: [topDrinker.playerId],
      text: `${topDrinker.firstName} ${topDrinker.lastName} vypil ${beers} piv — rekord večera.`,
      effects: [{ playerId: topDrinker.playerId, type: "hangover", label: "Ranní kocovina (−15 kondice)" }],
    });
  }

  // Ostatní opilci — souhrnný incident (méně textu)
  const others = hangoverVictims.slice(1);
  if (others.length > 0) {
    const names = others.map((o) => o.lastName).join(", ");
    incidents.push({
      type: "drink_record",
      playerIds: others.map((o) => o.playerId),
      text: `Pivař za pivařem — ${names} ${others.length === 1 ? "také pořádně přebral" : "taky pořádně přebrali"}.`,
      effects: others.map((o) => ({ playerId: o.playerId, type: "hangover" as const, label: "Ranní kocovina (−15 kondice)" })),
    });
  }

  if (Math.random() < 0.15) {
    const lucky = pickRandom(locals);
    const win = [200, 300, 500, 700, 1000][Math.floor(Math.random() * 5)];
    incidents.push({
      type: "automat_win",
      playerIds: [lucky.playerId],
      text: `${lucky.firstName} ${lucky.lastName} vyhrál na automatu ${win} Kč.`,
      effects: [{ playerId: lucky.playerId, type: "morale", delta: 2, label: "+2 morálka" }],
    });
  }

  if (Math.random() < 0.5) {
    const teller = pickRandom(locals);
    incidents.push({
      type: "story",
      playerIds: [teller.playerId],
      text: pickRandom(districtPoolFor(STORY_POOL, district)).replaceAll("{name}", `${teller.firstName} ${teller.lastName}`),
      effects: [],
    });
  }

  // ── Hospodská kočka — 5% prob ──
  if (Math.random() < 0.05) {
    const target = pickRandom(locals);
    incidents.push({
      type: "cat",
      playerIds: [target.playerId],
      text: pickRandom(CAT_INCIDENT_TEMPLATES).replaceAll("{name}", target.firstName),
      effects: [],
    });
  }

  // ── Pan farář Antonín — 5% prob, +1 morale všem attendees ──
  if (Math.random() < 0.05) {
    const target = pickRandom(locals);
    incidents.push({
      type: "priest",
      playerIds: [target.playerId],
      text: pickRandom(PRIEST_INCIDENT_TEMPLATES).replaceAll("{name}", target.firstName),
      effects: locals.map((a) => ({ playerId: a.playerId, type: "morale" as const, delta: 1, label: "+1 morálka" })),
    });
  }

  // ── Skaut z vyšší ligy — 3% prob, jen pokud je v hospodě hráč s vysokou kvalitou ──
  // (atributy nejsou přímo v PubAttendee — jako proxy bere alcohol≥60 = "kluci o kterých se ví")
  // Bez direct effect pro teď, jen warning text. Departure trigger lze navázat později.
  const scoutTarget = locals.find((a) => a.alcohol >= 60);
  if (scoutTarget && Math.random() < 0.03) {
    incidents.push({
      type: "scout",
      playerIds: [scoutTarget.playerId],
      text: pickRandom(SCOUT_INCIDENT_TEMPLATES).replaceAll("{name}", scoutTarget.firstName),
      effects: [],
    });
  }

  // ── Manželka volá — 8% prob na hráče s alcohol≥50 (proxy pro "ten, koho doma řeší") ──
  const wifeTargets = locals.filter((a) => a.alcohol >= 50);
  if (wifeTargets.length > 0 && Math.random() < 0.08) {
    const target = pickRandom(wifeTargets);
    incidents.push({
      type: "wife_call",
      playerIds: [target.playerId],
      text: pickRandom(WIFE_CALL_INCIDENT_TEMPLATES).replaceAll("{name}", target.firstName),
      effects: [{ playerId: target.playerId, type: "morale", delta: -2, label: "−2 morálka" }],
    });
  }

  // ── Zkažený guláš / kuchyňské hrůzy — 4% prob, 1 den mimo (zažívací potíže) ──
  if (locals.length > 0 && Math.random() < 0.04) {
    const target = pickRandom(locals);
    incidents.push({
      type: "bad_food",
      playerIds: [target.playerId],
      text: pickRandom(BAD_FOOD_INCIDENT_TEMPLATES).replaceAll("{name}", target.firstName),
      effects: [{
        playerId: target.playerId,
        type: "injury",
        injuryDays: 1,
        injuryType: "zazivaci_potize",
        injuryDescription: "Zažívací potíže z hospody",
        label: "Zažívací potíže (1 den mimo)",
      }],
    });
  }

  // ── Drobné hospodské nehody (uklouznutí, šipky, schody) — 4% prob, 1 den mimo ──
  if (locals.length > 0 && Math.random() < 0.04) {
    const target = pickRandom(locals);
    incidents.push({
      type: "pub_accident",
      playerIds: [target.playerId],
      text: pickRandom(PUB_ACCIDENT_INCIDENT_TEMPLATES).replaceAll("{name}", target.firstName),
      effects: [{
        playerId: target.playerId,
        type: "injury",
        injuryDays: 1,
        injuryType: "drobne",
        injuryDescription: "Úraz v hospodě",
        label: "Drobný úraz (1 den mimo)",
      }],
    });
  }

  // ── Vnitřní rvačka mezi opilými spoluhráči — 5% prob pokud sou aspoň 2 lokálové
  //    s temper-proxy (alcohol≥45) — oba dostanou 1 den injury + morálka -2 ──
  const fightCandidates = locals.filter((a) => a.alcohol >= 45);
  if (fightCandidates.length >= 2 && Math.random() < 0.05) {
    const f1 = pickRandom(fightCandidates);
    const f2 = pickRandom(fightCandidates.filter((a) => a.playerId !== f1.playerId));
    if (f2) {
      const tpl = pickRandom(DRUNK_FIGHT_INCIDENT_TEMPLATES)
        .replace("{name1}", f1.firstName)
        .replace("{name2}", f2.firstName);
      incidents.push({
        type: "drunk_fight",
        playerIds: [f1.playerId, f2.playerId],
        text: tpl,
        effects: [
          { playerId: f1.playerId, type: "injury", injuryDays: 1, injuryType: "drobne", injuryDescription: "Modřiny po hospodské rvačce", label: "Modřiny (1 den mimo)" },
          { playerId: f2.playerId, type: "injury", injuryDays: 1, injuryType: "drobne", injuryDescription: "Modřiny po hospodské rvačce", label: "Modřiny (1 den mimo)" },
          { playerId: f1.playerId, type: "morale", delta: -2, label: "−2 morálka" },
          { playerId: f2.playerId, type: "morale", delta: -2, label: "−2 morálka" },
        ],
      });
    }
  }

  // ── Dluh na účtu — 3% narativní incident (bez efektu) ──
  if (locals.length > 0 && Math.random() < 0.03) {
    const target = pickRandom(locals);
    incidents.push({
      type: "tab",
      playerIds: [target.playerId],
      text: pickRandom(TAB_INCIDENT_TEMPLATES).replaceAll("{name}", target.firstName),
      effects: [],
    });
  }

  // ── POZITIVNÍ ──

  // ── Jackpot — 2% prob, +5 morálka jednomu hráči ──
  if (locals.length > 0 && Math.random() < 0.02) {
    const target = pickRandom(locals);
    incidents.push({
      type: "jackpot",
      playerIds: [target.playerId],
      text: pickRandom(JACKPOT_INCIDENT_TEMPLATES).replaceAll("{name}", target.firstName),
      effects: [{ playerId: target.playerId, type: "morale", delta: 5, label: "+5 morálka" }],
    });
  }

  // ── Někdo platí rundu — 4% prob, +1 morálka pro VŠECHNY lokály ──
  if (locals.length > 0 && Math.random() < 0.04) {
    incidents.push({
      type: "free_round",
      playerIds: locals.map((a) => a.playerId),
      text: pickRandom(districtPoolFor(FREE_ROUND_POOL, district)),
      effects: locals.map((a) => ({ playerId: a.playerId, type: "morale" as const, delta: 1, label: "+1 morálka" })),
    });
  }

  // ── Vítěz baru (šipky / kvíz / fotbálek / karaoke) — 4% prob, +3 morálka ──
  if (locals.length > 0 && Math.random() < 0.04) {
    const target = pickRandom(locals);
    incidents.push({
      type: "bar_champion",
      playerIds: [target.playerId],
      text: pickRandom(districtPoolFor(BAR_CHAMPION_POOL, district)).replaceAll("{name}", target.firstName),
      effects: [{ playerId: target.playerId, type: "morale", delta: 3, label: "+3 morálka" }],
    });
  }

  // ── Vesnický hrdina — 3% prob, +3 morálka jednomu hráči ──
  if (locals.length > 0 && Math.random() < 0.03) {
    const target = pickRandom(locals);
    incidents.push({
      type: "village_hero",
      playerIds: [target.playerId],
      text: pickRandom(districtPoolFor(VILLAGE_HERO_POOL, district)).replaceAll("{name}", target.firstName),
      effects: [{ playerId: target.playerId, type: "morale", delta: 3, label: "+3 morálka" }],
    });
  }

  // ── Šťastné setkání — 4% prob, +2 morálka jednomu hráči ──
  if (locals.length > 0 && Math.random() < 0.04) {
    const target = pickRandom(locals);
    incidents.push({
      type: "friendly_reunion",
      playerIds: [target.playerId],
      text: pickRandom(districtPoolFor(FRIENDLY_REUNION_POOL, district)).replaceAll("{name}", target.firstName),
      effects: [{ playerId: target.playerId, type: "morale", delta: 2, label: "+2 morálka" }],
    });
  }

  // ── Myslivecký spolek — 3% prob, +2 morálka VŠEM lokálům ──
  if (locals.length > 0 && districtPoolFor(HUNTERS_POOL, district).length > 0 && Math.random() < 0.03) {
    const target = pickRandom(locals);
    incidents.push({
      type: "hunters",
      playerIds: locals.map((a) => a.playerId),
      text: pickRandom(districtPoolFor(HUNTERS_POOL, district)).replaceAll("{name}", target.firstName),
      effects: locals.map((a) => ({ playerId: a.playerId, type: "morale" as const, delta: 2, label: "+2 morálka" })),
    });
  }

  // ── Zabíjačka — 2% prob, +3 morálka VŠEM lokálům + 10% sub-roll na zažívačku targetu ──
  if (locals.length > 0 && districtPoolFor(PIG_SLAUGHTER_POOL, district).length > 0 && Math.random() < 0.02) {
    const target = pickRandom(locals);
    const effects: PubEffect[] = locals.map((a) => ({ playerId: a.playerId, type: "morale" as const, delta: 3, label: "+3 morálka" }));
    if (Math.random() < 0.10) {
      effects.push({
        playerId: target.playerId,
        type: "injury",
        injuryDays: 1,
        injuryType: "zazivaci_potize",
        injuryDescription: "Přejedl se na zabíjačce",
        label: "Zažívací potíže (1 den mimo)",
      });
    }
    incidents.push({
      type: "pig_slaughter",
      playerIds: locals.map((a) => a.playerId),
      text: pickRandom(districtPoolFor(PIG_SLAUGHTER_POOL, district)).replaceAll("{name}", target.firstName),
      effects,
    });
  }

  // ── Zabloudilý turista — 3% prob, narativ ──
  if (locals.length > 0 && Math.random() < 0.03) {
    const target = pickRandom(locals);
    incidents.push({
      type: "lost_tourist",
      playerIds: [target.playerId],
      text: pickRandom(districtPoolFor(LOST_TOURIST_POOL, district)).replaceAll("{name}", target.firstName),
      effects: [],
    });
  }

  // ── Dobrovolní hasiči — 3% prob, +2 morálka VŠEM lokálům ──
  if (locals.length > 0 && districtPoolFor(FIREFIGHTERS_POOL, district).length > 0 && Math.random() < 0.03) {
    const target = pickRandom(locals);
    incidents.push({
      type: "firefighters",
      playerIds: locals.map((a) => a.playerId),
      text: pickRandom(districtPoolFor(FIREFIGHTERS_POOL, district)).replaceAll("{name}", target.firstName),
      effects: locals.map((a) => ({ playerId: a.playerId, type: "morale" as const, delta: 2, label: "+2 morálka" })),
    });
  }

  // ── Pouť / Slavnosti Zlaté stezky — 3% prob, +2 morálka VŠEM lokálům ──
  if (locals.length > 0 && districtPoolFor(VILLAGE_FAIR_POOL, district).length > 0 && Math.random() < 0.03) {
    const target = pickRandom(locals);
    incidents.push({
      type: "village_fair",
      playerIds: locals.map((a) => a.playerId),
      text: pickRandom(districtPoolFor(VILLAGE_FAIR_POOL, district)).replaceAll("{name}", target.firstName),
      effects: locals.map((a) => ({ playerId: a.playerId, type: "morale" as const, delta: 2, label: "+2 morálka" })),
    });
  }

  // ── Šumavská vichřice / blackout — 2% prob, narativ ──
  if (locals.length > 0 && districtPoolFor(STORM_BLACKOUT_POOL, district).length > 0 && Math.random() < 0.02) {
    const target = pickRandom(locals);
    incidents.push({
      type: "storm_blackout",
      playerIds: [target.playerId],
      text: pickRandom(districtPoolFor(STORM_BLACKOUT_POOL, district)).replaceAll("{name}", target.firstName),
      effects: [],
    });
  }

  // ── Houbaři — 2% prob, narativ ──
  if (locals.length > 0 && Math.random() < 0.02) {
    const target = pickRandom(locals);
    incidents.push({
      type: "mushroom_brag",
      playerIds: [target.playerId],
      text: pickRandom(districtPoolFor(MUSHROOM_BRAG_POOL, district)).replaceAll("{name}", target.firstName),
      effects: [],
    });
  }

  // ── Starosta / zastupitel zaskočil — 4% prob, +1 morálka VŠEM lokálům ──
  if (locals.length > 0 && Math.random() < 0.04) {
    const target = pickRandom(locals);
    incidents.push({
      type: "official_visit",
      playerIds: locals.map((a) => a.playerId),
      text: pickRandom(OFFICIAL_VISIT_INCIDENT_TEMPLATES).replaceAll("{name}", target.firstName),
      effects: locals.map((a) => ({ playerId: a.playerId, type: "morale" as const, delta: 1, label: "+1 morálka" })),
    });
  }

  // ── Politický trapas — 2% prob, narativ (bez efektu) ──
  if (locals.length > 0 && Math.random() < 0.02) {
    const target = pickRandom(locals);
    incidents.push({
      type: "official_scandal",
      playerIds: [target.playerId],
      text: pickRandom(OFFICIAL_SCANDAL_INCIDENT_TEMPLATES).replaceAll("{name}", target.firstName),
      effects: [],
    });
  }

  // ── TRENÉR ZASKOČIL DO HOSPODY — 20% nocí, max 1 coach event za noc ──
  if (locals.length > 0 && Math.random() < 0.20) {
    // Pick which kind of coach event happens (vážené pravděpodobnosti)
    const roll = Math.random();
    if (roll < 0.18) {
      // Trenér se přidá k týmu — +1 morálka VŠEM
      incidents.push({
        type: "coach_joins",
        playerIds: locals.map((a) => a.playerId),
        text: pickRandom(COACH_JOINS_INCIDENT_TEMPLATES).replace(/Trenér/g, coachName),
        effects: locals.map((a) => ({ playerId: a.playerId, type: "morale" as const, delta: 1, label: "+1 morálka" })),
      });
    } else if (roll < 0.36) {
      // Trenér pochválí hráče — +3 morálka tomu hráči
      const target = pickRandom(locals);
      incidents.push({
        type: "coach_praise",
        playerIds: [target.playerId],
        text: pickRandom(COACH_PRAISE_INCIDENT_TEMPLATES).replaceAll("{name}", target.firstName).replace(/Trenér/g, coachName),
        effects: [{ playerId: target.playerId, type: "morale", delta: 3, label: "+3 morálka" }],
      });
    } else if (roll < 0.54) {
      // Trenér vynadá hráči s alcohol≥50 (pokud takový je) — −2 morálka
      const scoldTargets = locals.filter((a) => a.alcohol >= 50);
      if (scoldTargets.length > 0) {
        const target = pickRandom(scoldTargets);
        incidents.push({
          type: "coach_scold",
          playerIds: [target.playerId],
          text: pickRandom(COACH_SCOLD_INCIDENT_TEMPLATES).replaceAll("{name}", target.firstName).replace(/Trenér/g, coachName),
          effects: [{ playerId: target.playerId, type: "morale", delta: -2, label: "−2 morálka" }],
        });
      } else {
        // Fallback: tactics narativ
        const target = pickRandom(locals);
        incidents.push({
          type: "coach_tactics",
          playerIds: [target.playerId],
          text: pickRandom(COACH_TACTICS_INCIDENT_TEMPLATES).replaceAll("{name}", target.firstName).replace(/Trenér/g, coachName),
          effects: [],
        });
      }
    } else if (roll < 0.70) {
      // Trenér nakreslí taktiku — narativ, bez efektu
      const target = pickRandom(locals);
      incidents.push({
        type: "coach_tactics",
        playerIds: [target.playerId],
        text: pickRandom(COACH_TACTICS_INCIDENT_TEMPLATES).replaceAll("{name}", target.firstName).replace(/Trenér/g, coachName),
        effects: [],
      });
    } else if (roll < 0.85) {
      // Trenér prohrál sázku — +2 morálka VŠEM
      incidents.push({
        type: "coach_lost_bet",
        playerIds: locals.map((a) => a.playerId),
        text: pickRandom(COACH_LOST_BET_INCIDENT_TEMPLATES).replace(/Trenér/g, coachName),
        effects: locals.map((a) => ({ playerId: a.playerId, type: "morale" as const, delta: 2, label: "+2 morálka" })),
      });
    } else {
      // Trenér chrápe — narativ
      incidents.push({
        type: "coach_naps",
        playerIds: [],
        text: pickRandom(COACH_NAPS_INCIDENT_TEMPLATES).replace(/Trenér/g, coachName),
        effects: [],
      });
    }
  }

  return incidents;
}

/**
 * Aplikuje effects pub incidentů (kondice, morale, zranění, condition_log).
 * Single source of truth: incident.effects[]. Generator je vyrobil, applier jen aplikuje.
 */
async function applyIncidentEffects(
  db: D1Database,
  incidents: PubIncident[],
): Promise<D1PreparedStatement[]> {
  const stmts: D1PreparedStatement[] = [];

  // Sběr unique player IDs napříč všemi effects pro 1 read condition+team
  const affectedIds = new Set<string>();
  for (const inc of incidents) for (const ef of inc.effects) affectedIds.add(ef.playerId);
  if (affectedIds.size === 0) return stmts;

  const placeholders = [...affectedIds].map(() => "?").join(",");
  const rows = await db.prepare(
    `SELECT id, team_id,
       json_extract(life_context, '$.condition') as cond,
       json_extract(life_context, '$.morale') as morale
     FROM players WHERE id IN (${placeholders})`,
  ).bind(...[...affectedIds]).all<{ id: string; team_id: string; cond: number; morale: number }>()
    .catch((e) => { logger.warn({ module: "pub" }, "load player state for incidents", e); return { results: [] }; });
  const stateMap = new Map(rows.results.map((r) => [r.id, { teamId: r.team_id, cond: r.cond ?? 100, morale: r.morale ?? 50 }]));

  for (const inc of incidents) {
    for (const ef of inc.effects) {
      const cur = stateMap.get(ef.playerId);
      if (!cur) continue;

      if (ef.type === "condition" && ef.delta != null) {
        const newCond = Math.max(15, Math.min(100, cur.cond + ef.delta));
        if (newCond === cur.cond) continue;
        stmts.push(db.prepare(
          `UPDATE players SET life_context = json_set(life_context, '$.condition', ?) WHERE id = ?`,
        ).bind(newCond, ef.playerId));
        stmts.push(logConditionStmt(db, ef.playerId, cur.teamId, cur.cond, newCond, "pub", inc.text.slice(0, 100)));
        cur.cond = newCond;
      } else if (ef.type === "morale" && ef.delta != null) {
        const newMorale = Math.max(0, Math.min(100, cur.morale + ef.delta));
        if (newMorale === cur.morale) continue;
        stmts.push(db.prepare(
          `UPDATE players SET life_context = json_set(life_context, '$.morale', ?) WHERE id = ?`,
        ).bind(newMorale, ef.playerId));
        cur.morale = newMorale;
      } else if (ef.type === "hangover") {
        // Ranní kocovina: -15 condition + life_context.hangover=1 (vyčistí daily-tick).
        // V condition_logu se zaloguje jako source='hangover' (separátní od jiných pub effects).
        const newCond = Math.max(15, cur.cond - 15);
        stmts.push(db.prepare(
          `UPDATE players SET life_context = json_set(life_context, '$.condition', ?, '$.hangover', 1) WHERE id = ?`,
        ).bind(newCond, ef.playerId));
        stmts.push(logConditionStmt(db, ef.playerId, cur.teamId, cur.cond, newCond, "hangover", "Ranní kocovina po hospodě"));
        cur.cond = newCond;
      } else if (ef.type === "injury" && ef.injuryDays != null) {
        const injType = ef.injuryType ?? "obecne";
        const injDesc = ef.injuryDescription ?? "Zranění z hospodské bitky";
        stmts.push(db.prepare(
          `INSERT INTO injuries (id, player_id, team_id, type, description, severity, days_remaining, days_total) VALUES (?, ?, ?, ?, ?, 'lehke', ?, ?)`,
        ).bind(crypto.randomUUID(), ef.playerId, cur.teamId, injType, injDesc, ef.injuryDays, ef.injuryDays));
        // Plus mírný condition drop
        const newCond = Math.max(20, cur.cond - 8);
        stmts.push(db.prepare(
          `UPDATE players SET life_context = json_set(life_context, '$.condition', ?) WHERE id = ?`,
        ).bind(newCond, ef.playerId));
        stmts.push(logConditionStmt(db, ef.playerId, cur.teamId, cur.cond, newCond, "pub", `${injDesc} (${ef.injuryDays} d)`));
        cur.cond = newCond;
      }
    }
  }

  return stmts;
}

/**
 * Coach-led pub session — trenér aktivně rozhodne "Pojedeme na jedno".
 * Volá se z `POST /api/teams/:id/pub-visit`.
 * Vytvoří pub_session pro dnešek (idempotentně přepíše emergent), aplikuje effects.
 *
 * Pro choice="all": všichni active+healthy, +8 morale + −15 cond, vyšší prob hangoveru
 * Pro choice="one": hráč s nejnižší morale, +3 morale, −5 cond, žádné drama
 */
export async function createCoachLedSession(
  db: D1Database,
  teamId: string,
  gameDate: string,
  choice: "all" | "one",
): Promise<{ ok: true; attendeesCount: number; incidentsCount: number } | { ok: false; reason: string }> {
  // Načti aktivní non-injured non-suspended hráče
  const players = await db.prepare(
    `SELECT p.id, p.first_name, p.last_name,
       json_extract(p.personality, '$.alcohol') as alcohol,
       json_extract(p.life_context, '$.morale') as morale
     FROM players p
     WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active')
       AND p.id NOT IN (SELECT player_id FROM injuries WHERE days_remaining > 0)
       AND COALESCE(p.suspended_matches, 0) = 0`,
  ).bind(teamId).all<{ id: string; first_name: string; last_name: string; alcohol: number; morale: number }>()
    .catch((e) => { logger.warn({ module: "pub" }, "load players for coach-led", e); return { results: [] }; });

  if (players.results.length === 0) return { ok: false, reason: "Žádní dostupní hráči" };

  const districtRow = await db.prepare(
    "SELECT v.district FROM teams t LEFT JOIN villages v ON t.village_id = v.id WHERE t.id = ?",
  ).bind(teamId).first<{ district: string | null }>()
    .catch((e) => { logger.warn({ module: "pub" }, "load district for coach-led", e); return null; });
  const district = districtRow?.district ?? undefined;

  const attendees: PubAttendee[] = [];
  const incidents: PubIncident[] = [];

  if (choice === "all") {
    for (const p of players.results) {
      attendees.push({
        playerId: p.id, firstName: p.first_name, lastName: p.last_name,
        alcohol: p.alcohol ?? 30, teamId, isVisitor: false,
      });
    }
    // Marker incident: trenér vzal celý tým
    incidents.push({
      type: "coach_led_visit",
      playerIds: attendees.map((a) => a.playerId),
      text: `Trenér vyhlásil "Pojedeme na jedno!" Celý tým v hospodě.`,
      effects: attendees.flatMap((a) => [
        { playerId: a.playerId, type: "morale" as const, delta: 8, label: "+8 morálka" },
        { playerId: a.playerId, type: "condition" as const, delta: -15, label: "−15 kondice" },
      ]),
    });
    // Vyšší prob hangoveru — týmový binge
    for (const a of attendees) {
      if (a.alcohol < 50) continue;
      const prob = 0.25 + ((a.alcohol - 50) / 50) * 0.30; // 50→25%, 100→55%
      if (Math.random() >= prob) continue;
      incidents.push({
        type: "drink_record",
        playerIds: [a.playerId],
        text: `${a.firstName} ${a.lastName} si dal pořádně víc než ostatní.`,
        effects: [{ playerId: a.playerId, type: "hangover", label: "Ranní kocovina (−15 kondice)" }],
      });
    }
  } else {
    // choice === "one" — vyber hráče s nejnižší morale (cílená motivace)
    const target = [...players.results].sort((a, b) => (a.morale ?? 50) - (b.morale ?? 50))[0];
    attendees.push({
      playerId: target.id, firstName: target.first_name, lastName: target.last_name,
      alcohol: target.alcohol ?? 30, teamId, isVisitor: false,
    });
    incidents.push({
      type: "coach_led_one",
      playerIds: [target.id],
      text: `Trenér si pozval ${target.first_name} ${target.last_name} na pivo, probrali sezónu.`,
      effects: [
        { playerId: target.id, type: "morale", delta: 3, label: "+3 morálka" },
        { playerId: target.id, type: "condition", delta: -5, label: "−5 kondice" },
      ],
    });
  }

  // Idempotentně: pokud už dnes existuje (emergent), přepiš ji coach-led variantou.
  await db.prepare(
    `DELETE FROM pub_sessions WHERE team_id = ? AND game_date = ?`,
  ).bind(teamId, gameDate).run().catch((e) => logger.warn({ module: "pub" }, "delete existing emergent session", e));

  await db.prepare(
    `INSERT INTO pub_sessions (team_id, game_date, attendees, incidents, daily_special) VALUES (?, ?, ?, ?, ?)`,
  ).bind(teamId, gameDate, JSON.stringify(attendees), JSON.stringify(incidents), pickRandom(districtPoolFor(DAILY_SPECIALS_POOL, district))).run()
    .catch((e) => logger.warn({ module: "pub" }, "insert coach-led session", e));

  // Apply effects
  const effectStmts = await applyIncidentEffects(db, incidents);
  if (effectStmts.length > 0) await db.batch(effectStmts).catch((e) => logger.warn({ module: "pub" }, "apply coach-led effects", e));

  return { ok: true, attendeesCount: attendees.length, incidentsCount: incidents.length };
}

/**
 * Backfill — vygeneruje jednu pub_session pro daný tým pro **včerejšek** (game_date - 1 day).
 * Slouží k tomu, aby noví uživatelé / čerstvý deploy neměli prázdnou hospodu.
 * Idempotentní: skipuje pokud session pro daný den už existuje.
 *
 * Volá se z onboarding flow po vytvoření týmu, plus jako one-shot pro existing teams.
 */
export async function backfillYesterdayPubSession(
  db: D1Database,
  teamId: string,
  todayGameDate: string,
): Promise<{ created: boolean }> {
  // Včerejší game date
  const yesterday = new Date(todayGameDate);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  // Zaplň jen tento jeden den. Reuse plné generator logiky:
  const all = await generatePubSessionsForAllTeams(db, yesterdayStr);
  return { created: all.sessionsCreated > 0 };
}

export async function generatePubSessionsForAllTeams(db: D1Database, gameDate: string): Promise<{ sessionsCreated: number }> {
  // Načti všechny lidské týmy + AI týmy (visitors můžou být i AI)
  const allTeams = await db.prepare(
    `SELECT t.id, t.name, t.user_id, t.league_id, v.district FROM teams t LEFT JOIN villages v ON t.village_id = v.id`,
  ).all<{ id: string; name: string; user_id: string; league_id: string | null; district: string | null }>()
    .catch((e) => { logger.warn({ module: "pub" }, "load teams", e); return { results: [] }; });

  const humanTeams = allTeams.results.filter((t) => t.user_id !== "ai");
  if (humanTeams.length === 0) return { sessionsCreated: 0 };

  const dayOfWeek = new Date(gameDate).getDay();
  let created = 0;

  for (const team of humanTeams) {
    // Idempotence — skip pokud session pro (team, game_date) už existuje
    const existing = await db.prepare(
      `SELECT id FROM pub_sessions WHERE team_id = ? AND game_date = ?`,
    ).bind(team.id, gameDate).first().catch((e) => { logger.warn({ module: "pub" }, "check pub_session existence", e); return null; });
    if (existing) continue;

    // Načti hráče týmu s alcohol/temper/condition + injury/suspension/recent pub days
    const players = await db.prepare(
      `SELECT
         p.id, p.team_id, p.first_name, p.last_name,
         json_extract(p.personality, '$.alcohol') as alcohol,
         json_extract(p.personality, '$.patriotism') as patriotism,
         json_extract(p.personality, '$.temper') as temper,
         json_extract(p.life_context, '$.condition') as condition,
         CASE WHEN EXISTS(SELECT 1 FROM injuries WHERE player_id = p.id AND days_remaining > 0) THEN 1 ELSE 0 END as injured,
         CASE WHEN p.suspended_matches > 0 THEN 1 ELSE 0 END as suspended,
         (SELECT COUNT(*) FROM pub_sessions ps WHERE ps.team_id = p.team_id AND ps.game_date >= date(?, '-3 days')
            AND ps.attendees LIKE '%' || p.id || '%') as recent_pub_days
       FROM players p
       WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active')`,
    ).bind(gameDate, team.id).all<DbPlayer>().catch((e) => { logger.warn({ module: "pub" }, "load players for pub", e); return { results: [] }; });

    if (players.results.length === 0) continue;

    // Načti trenéra (pro coach incidenty + případný attendee); fallback "Trenér"
    const managerRow = await db.prepare("SELECT id, name, avatar FROM managers WHERE team_id = ? LIMIT 1")
      .bind(team.id).first<{ id: string; name: string; avatar: string }>()
      .catch((e) => { logger.warn({ module: "pub" }, "load manager for pub", e); return null; });
    const coachName = managerRow?.name ?? "Trenér";
    let coachAvatar: Record<string, unknown> | undefined;
    if (managerRow?.avatar) {
      try { coachAvatar = JSON.parse(managerRow.avatar); } catch (e) {
        logger.warn({ module: "pub" }, `parse manager avatar for ${team.id}`, e);
      }
    }

    // Last match result
    const lastMatch = await db.prepare(
      `SELECT home_team_id, away_team_id, home_score, away_score FROM matches
       WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'
       ORDER BY simulated_at DESC LIMIT 1`,
    ).bind(team.id, team.id).first<{ home_team_id: string; away_team_id: string; home_score: number; away_score: number }>().catch((e) => { logger.warn({ module: "pub" }, "load last match", e); return null; });
    let lastMatchResult: "win" | "loss" | "draw" | null = null;
    if (lastMatch) {
      const isHome = lastMatch.home_team_id === team.id;
      const ours = isHome ? lastMatch.home_score : lastMatch.away_score;
      const theirs = isHome ? lastMatch.away_score : lastMatch.home_score;
      lastMatchResult = ours > theirs ? "win" : ours < theirs ? "loss" : "draw";
    }

    // Next match — daysTo
    const nextMatch = await db.prepare(
      `SELECT scheduled_at FROM season_calendar sc JOIN matches m ON m.calendar_id = sc.id
       WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND sc.status = 'scheduled'
       ORDER BY sc.scheduled_at ASC LIMIT 1`,
    ).bind(team.id, team.id).first<{ scheduled_at: string }>().catch((e) => { logger.warn({ module: "pub" }, "load next match", e); return null; });
    const daysToNextMatch = nextMatch ? Math.max(0, Math.ceil((new Date(nextMatch.scheduled_at).getTime() - new Date(gameDate).getTime()) / 86400000)) : null;

    // Načti relationships pro buddies/rivals
    const playerIds = players.results.map((p) => p.id);
    const placeholders = playerIds.map(() => "?").join(",");
    const rels = await db.prepare(
      `SELECT player_a_id, player_b_id, type FROM relationships
       WHERE (player_a_id IN (${placeholders}) OR player_b_id IN (${placeholders}))
         AND type IN ('drinking_buddies', 'rivals')`,
    ).bind(...playerIds, ...playerIds).all<{ player_a_id: string; player_b_id: string; type: string }>().catch((e) => { logger.warn({ module: "pub" }, "load relationships for pub", e); return { results: [] }; });

    const buddiesMap = new Map<string, Set<string>>();
    const rivalsMap = new Map<string, Set<string>>();
    for (const r of rels.results) {
      const map = r.type === "drinking_buddies" ? buddiesMap : rivalsMap;
      if (!map.has(r.player_a_id)) map.set(r.player_a_id, new Set());
      if (!map.has(r.player_b_id)) map.set(r.player_b_id, new Set());
      map.get(r.player_a_id)!.add(r.player_b_id);
      map.get(r.player_b_id)!.add(r.player_a_id);
    }

    // Iterativně rozhodni účast (buddies bonus se aplikuje za běhu)
    const attendees: PubAttendee[] = [];
    const ctx = { dayOfWeek, lastMatchResult, daysToNextMatch };
    // Sort by alcohol DESC — top pijani jdou první → buddies bonus mají nižší
    const sorted = [...players.results].sort((a, b) => b.alcohol - a.alcohol);
    for (const p of sorted) {
      const buddiesIn = (buddiesMap.get(p.id) ?? new Set()).size > 0
        ? attendees.filter((a) => buddiesMap.get(p.id)!.has(a.playerId)).length : 0;
      const rivalsIn = (rivalsMap.get(p.id) ?? new Set()).size > 0
        ? attendees.filter((a) => rivalsMap.get(p.id)!.has(a.playerId)).length : 0;
      const prob = attendanceProb(p, { ...ctx, buddiesAlreadyIn: buddiesIn, rivalsAlreadyIn: rivalsIn });
      if (Math.random() < prob) {
        attendees.push({
          playerId: p.id, firstName: p.first_name, lastName: p.last_name,
          alcohol: p.alcohol, teamId: team.id, isVisitor: false,
        });
      }
    }

    // Cross-team visitors — 5 % per local attendee, vyber random z téže ligy
    if (attendees.length > 0 && team.league_id) {
      const otherTeams = allTeams.results.filter((t) => t.league_id === team.league_id && t.id !== team.id);
      for (let i = 0; i < attendees.length; i++) {
        if (Math.random() >= 0.05) continue;
        if (otherTeams.length === 0) break;
        const otherTeam = pickRandom(otherTeams);
        // Vyber 1 random hráče z otherTeam s alcohol >= 30 a low patriotism
        const visitor = await db.prepare(
          `SELECT id, first_name, last_name,
             json_extract(personality, '$.alcohol') as alcohol,
             json_extract(personality, '$.patriotism') as patriotism
           FROM players
           WHERE team_id = ? AND (status IS NULL OR status = 'active')
             AND json_extract(personality, '$.alcohol') >= 30
             AND json_extract(personality, '$.patriotism') <= 70
             AND NOT EXISTS(SELECT 1 FROM injuries WHERE player_id = players.id AND days_remaining > 0)
           ORDER BY RANDOM() LIMIT 1`,
        ).bind(otherTeam.id).first<{ id: string; first_name: string; last_name: string; alcohol: number }>().catch((e) => { logger.warn({ module: "pub" }, "load visitor candidate", e); return null; });
        if (visitor) {
          attendees.push({
            playerId: visitor.id, firstName: visitor.first_name, lastName: visitor.last_name,
            alcohol: visitor.alcohol, teamId: otherTeam.id, isVisitor: true, fromTeamName: otherTeam.name,
          });
        }
      }
    }

    // Generate incidents
    const incidents = generateIncidents(attendees, rivalsMap, buddiesMap, coachName, team.district ?? undefined);

    // Pokud incidents obsahují coach_*, přidej trenéra mezi attendees s avatarem
    const hasCoach = incidents.some((inc) => inc.type.startsWith("coach_"));
    if (hasCoach && managerRow) {
      const coachFirstName = coachName.split(" ")[0] ?? coachName;
      const coachLastName = coachName.split(" ").slice(1).join(" ") || "(trenér)";
      attendees.push({
        playerId: `coach-${managerRow.id}`,
        firstName: coachFirstName,
        lastName: coachLastName,
        alcohol: 60,
        teamId: team.id,
        isVisitor: false,
        avatar: coachAvatar,
        isCoach: true,
      });
    }

    // Persist session
    await db.prepare(
      `INSERT INTO pub_sessions (team_id, game_date, attendees, incidents, daily_special) VALUES (?, ?, ?, ?, ?)`,
    ).bind(team.id, gameDate, JSON.stringify(attendees), JSON.stringify(incidents), pickRandom(districtPoolFor(DAILY_SPECIALS_POOL, team.district ?? undefined))).run().catch((e) => logger.warn({ module: "pub" }, "insert pub_session", e));

    // Apply effects
    const effectStmts = await applyIncidentEffects(db, incidents);
    if (effectStmts.length > 0) await db.batch(effectStmts).catch((e) => logger.warn({ module: "pub" }, "batch incident effects", e));

    created++;
  }

  return { sessionsCreated: created };
}
