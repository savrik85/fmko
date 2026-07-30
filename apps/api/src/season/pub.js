"use strict";
/**
 * Hospoda U Pralesa — generator denních hospodských session.
 * Spouští se z daily-tick (idempotentní per team_id + game_date).
 *
 * Pravidla viz IDEAS.md #1. Fáze 1: attendees + 5% cross-team visit + 3 typy incidentů.
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCoachLedSession = createCoachLedSession;
exports.backfillYesterdayPubSession = backfillYesterdayPubSession;
exports.generatePubSessionsForAllTeams = generatePubSessionsForAllTeams;
var condition_log_1 = require("../lib/condition-log");
var logger_1 = require("../lib/logger");
var district_pool_1 = require("../data/flavor/district-pool");
var DAY_WEEKDAY_MOD = {
    0: 0.8, // Ne
    1: 0.6, // Po
    2: 1.0, // Út
    3: 1.0, // St
    4: 1.0, // Čt
    5: 1.5, // Pá
    6: 1.5, // So
};
function attendanceProb(p, ctx) {
    var _a;
    if (p.injured || p.suspended)
        return 0;
    var prob = (p.alcohol / 100) * 0.4;
    prob *= (_a = DAY_WEEKDAY_MOD[ctx.dayOfWeek]) !== null && _a !== void 0 ? _a : 1.0;
    if (ctx.buddiesAlreadyIn > 0)
        prob *= 1.5;
    if (ctx.rivalsAlreadyIn > 0)
        prob *= 0.7;
    if (ctx.lastMatchResult === "win")
        prob *= 1.8; // velká oslava
    if (ctx.lastMatchResult === "loss")
        prob *= 1.4; // smutný flám
    if (ctx.daysToNextMatch !== null && ctx.daysToNextMatch <= 1)
        prob *= 0.5;
    if (p.condition < 30)
        prob *= 0.3;
    if (p.recent_pub_days >= 2)
        prob *= 0.4; // cooldown — manželka
    return Math.min(0.85, prob);
}
var STORY_POOL = {
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
var SOLO_TEMPLATES = [
    "{name} seděl sám u baru, ostatní chlapci dnes nikam nešli.",
    "Jen {name} v hospodě — pivař musí vždycky být.",
    "{name} dorazil sám, hospodský mu nalil bez ptaní.",
];
var NOBODY_TEMPLATES = [
    "Včera v hospodě nikdo nebyl, hospodský zavřel už v devět.",
    "Suchá noc — kluci asi sledovali ligu doma.",
    "Tichá středa, jen hospodský s kočkou.",
];
// Cena piva je v hospodě stálá — nedává smysl ji každý den měnit. Specials se proto
// točí kolem jídla / atmosféry, ne kolem ceny.
var DAILY_SPECIALS_POOL = {
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
var CAT_INCIDENT_TEMPLATES = [
    "Hospodská kočka se otřela o {name}ovu nohu — Marcela mu doma vyčte chlupy.",
    "{name} dal kočce kus klobásy. Kočka rozhodla u koho si dnes lehne.",
    "Kočka se ztratila — půl vesnice ji hledá. Našla se nakonec v sudu.",
    "Kotě skočilo {name}ovi do klína a usnulo. Půl hodiny se nehnul.",
    "Kočka rozbila skleničku panáka. Hospodský prdí jak žába.",
];
var PRIEST_INCIDENT_TEMPLATES = [
    "Pan farář Antonín zaskočil na malé. Pokáral {name}a za fauly v sobotu.",
    "Pan farář se zastavil, dal si jeden a varoval kluky před hříchem alkoholu (sám si dal druhý).",
    "Pan farář s nadšením vyprávěl o derby z roku 78. Tehdy ještě hrál sám.",
];
var SCOUT_INCIDENT_TEMPLATES = [
    "Cizinec u baru pozoroval celý večer {name}a. Hospodský říká, že byl od pana skauta z Olomouce.",
    "Někdo v koutě si dělal poznámky pokaždé, když {name} otevřel pusu. Skaut z vyšší ligy?",
    "K {name}ovi přisedl muž v dobrém kabátě. Po půl hodině zase zmizel — vizitku nechal pod žbánkem.",
];
var WIFE_CALL_INCIDENT_TEMPLATES = [
    "Manželka volala {name}ovi. ‚Domů. Hned.‘ Sebral si bundu a šel.",
    "{name}ova žena vtrhla do hospody a odvedla ho domů za ucho. Hospodský se smál ještě hodinu.",
    "{name}ovi přišla SMS od manželky. Z výrazu bylo jasné, co tam stálo. Šel.",
];
// Žaludek si neporadí — 1 den mimo (slabé zranění typu "zazivaci_potize")
var BAD_FOOD_INCIDENT_TEMPLATES = [
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
var PUB_ACCIDENT_INCIDENT_TEMPLATES = [
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
var DRUNK_FIGHT_INCIDENT_TEMPLATES = [
    "{name1} a {name2} se po desátém pivu pohádali kdo je lepší obránce. Hospodský řešil rozbitou skleničku.",
    "{name1} řekl {name2}ovi něco o jeho přítelkyni. Ulítla rána. Pak druhá. Hospodský oba vyhodil.",
    "{name1} sebral {name2}ovi posledního panáka. {name2} mu dal pár facek na pamětnou.",
    "{name1} a {name2} si dali na dvoře pěstní zápas o respekt. Oba vyhráli pár modřin.",
    "{name1} osočil {name2}a z fauly v sobotním zápase. Hospodská bitka byla intenzivnější než ten faul.",
    "{name1} a {name2} se servali u kulečníku. Tágo mělo víc poškození než hráči — ale ne moc.",
];
// Dluh na účtu — bez injury, jen narativa
var TAB_INCIDENT_TEMPLATES = [
    "Hospodský dnes vystavil dluhový kámen. {name} na něm má největší podíl.",
    "{name} dostal upozornění — pokud do pátku nezaplatí, čepuje mu hospodský jen čaj.",
    "{name} chtěl zaplatit kartou. Hospodský se zasmál a zapsal mu to.",
];
// ═══════════════════════════════════════════════
// POZITIVNÍ INCIDENTY — at to neni jen plac
// ═══════════════════════════════════════════════
// Jackpot na automatu / Sportce — větší výhra (+5 morálka jednotlivci)
var JACKPOT_INCIDENT_TEMPLATES = [
    "{name} z legrace zmáčkl Sportku — strefil 4 čísla. Tisícovka jde na pivo pro klub.",
    "{name} zatřásl automatem do roztrhání těla — a ono to zacinkalo jak Vánoce. Z hospody odcházel jako král.",
    "{name} vyhrál v tombole vepřové půlky. Půlku rozdal mužstvu, půlku domů. Hrdina večera.",
    "{name}ovi spadla mince do automatu špatně a vrátil mu trojnásobek. Zázrak. Hospoda burácela.",
    "{name} poslal poslední vsazenku „pro štěstí“ — vyhrál víc než celá výplata. Kluci ho pak nepustili domů.",
];
// Někdo platí kolo (starosta, sponzor, strejda) — všichni lokálové +1 morálka
var FREE_ROUND_POOL = {
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
var BAR_CHAMPION_POOL = {
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
var VILLAGE_HERO_POOL = {
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
var FRIENDLY_REUNION_POOL = {
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
var COACH_TACTICS_INCIDENT_TEMPLATES = [
    "Trenér nakreslil na ubrousek 4-3-3, vysvětloval to půl hodiny. Kluci to pak nechali na stole hospodskému — ten z toho udělal jídelníček.",
    "Trenér chytil pivní tácek a začal kreslit obranou pětku. {name} mu skočil do řeči: „Ty to neumíš ani na papíře.“ Trenér se urazil.",
    "Trenér přinesl do hospody video minulého zápasu na telefonu. Kluci se dvacet minut tvářili, že to sledují.",
    "Trenér mlátil pěstí do stolu a vysvětloval pressing. Hospodský se přišel zeptat, jestli je všechno v pořádku.",
    "Trenér žádal o ticho a prezentoval „filozofii klubu na další sezónu“. Pivo dotekl až po půl hodině.",
];
// Trenér si dá s týmem — narativní + +1 morálka pro lokály
var COACH_JOINS_INCIDENT_TEMPLATES = [
    "Trenér zaskočil na jedno — dvě — tři. Po čtvrtém už zpíval s klukama. Kapitánské znaky padly.",
    "Trenér vlétl do hospody v teplákách, prý jen na kole jezdil okolo. Po hodině měl tři piva a vyprávěl o roce 96.",
    "Trenér si dal s mužstvem rundu „za dobrý trénink“. Přiznal že kluci byli dobří. Vzácný okamžik.",
    "Trenér přišel s manželkou — manželka odjela po pivu, on zůstal. Manželka se zpoždí domů víc než on.",
    "Trenér přijal výzvu kluků na panáky. Třetí už nezvládl. Druhý den jel nemocensky.",
];
// Trenér pochválí hráče — +3 morálka jednomu
var COACH_PRAISE_INCIDENT_TEMPLATES = [
    "Trenér zvedl pivo na {name}a: „Tohohle si pamatujte, kluci. Tohle je hráč.“ {name} se rozzářil.",
    "Trenér před celou hospodou prohlásil, že {name} je nejlepší investice klubu za dekádu. {name} platil další kolo z hrdosti.",
    "Trenér se zastavil u stolu, poklepal {name}ovi na rameno: „Jen tak dál, synku.“ Slza ukápla i hospodskému.",
    "Trenér vyprávěl historku jak {name} v dorostu trefil břevno z půlky. Celá hospoda se smála — i ti co u toho nebyli.",
    "Trenér přiznal, že {name} hraje líp než on kdy hrál. {name} si poprvé v životě připadal jako Bican.",
];
// Trenér vynadá hráči — −2 morálka
var COACH_SCOLD_INCIDENT_TEMPLATES = [
    "Trenér se postavil k {name}ovi: „Ty piješ víc, než běháš. Zítra dva tréninky.“ Hospoda ztichla.",
    "Trenér přistihl {name}a u sedmého piva. Zítra ho čeká individuální plán — sprinty na svahu.",
    "Trenér řekl {name}ovi nahlas, že takhle se nedostane do základu. Hospoda předstírala, že nic neslyšela.",
    "Trenér se otočil na {name}a: „Dnes bys měl spát, ne pít. Zítra ti to spočítám.“",
    "Trenér před týmem rozcuchal {name}ovi vlasy: „Tohle není hipster konference, je to mužstvo.“",
];
// Trenér prohrál sázku — narativní + +2 morálka VŠEM lokálům
var COACH_LOST_BET_INCIDENT_TEMPLATES = [
    "Trenér se vsadil s kapitánem, že vyhraje šipky. Prohrál. Platí dnes všem.",
    "Trenér se nechal vyzvat k pití piva na ex. Selhal. Penalta: kolo pro celý tým.",
    "Trenér tvrdil že vykope penaltu hospodskému přes hlavu. Trefil hodiny. Kolo pro hospodu.",
    "Trenér si vsadil že si vzpomene na všechny góly z minulé sezóny. Pamatoval si tři. Druhý den jeho výplaty bude o pár tisíc tenčí.",
    "Trenér prohrál v kameni-papíru-nůžkách s gólmanem. Hodil rundu — i s panáky.",
];
// Trenér chrápe v hospodě — narativní, jen pro pobavení
var COACH_NAPS_INCIDENT_TEMPLATES = [
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
var HUNTERS_POOL = {
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
var PIG_SLAUGHTER_POOL = {
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
var LOST_TOURIST_POOL = {
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
var FIREFIGHTERS_POOL = {
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
var VILLAGE_FAIR_POOL = {
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
var STORM_BLACKOUT_POOL = {
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
var MUSHROOM_BRAG_POOL = {
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
var OFFICIAL_VISIT_INCIDENT_TEMPLATES = [
    "Starosta zaskočil na pivo a sliboval nové hřiště. Před volbami slibuje rád.",
    "Pan zastupitel přišel zjistit náladu mezi lidem — a zůstal do zavíračky.",
    "Starosta vyhlásil, že obec přispěje na nové dresy. Hospoda zatleskala (a nevěří).",
    "Místostarosta přinesl plán nové autobusové zastávky. {name} ho přemluvil i na lavičku u hřiště.",
    "Starosta koupil klukům kolo „za reprezentaci obce“. Reprezentovali statečně až do rána.",
];
// Politický trapas v hospodě (narativ, bez efektu) — pro pobavení
var OFFICIAL_SCANDAL_INCIDENT_TEMPLATES = [
    "Zastupitel po šestém pivu prozradil, kolik obec utratila za kruhový objezd. Ticho jak v kostele.",
    "Starosta se vsadil, že vykope penaltu — trefil okno radního auta. Zápis bude na příští schůzi.",
    "Opoziční zastupitel a starosta se pohádali o dotaci přímo u baru. Hospodský musel zasáhnout.",
    "Zastupitel slíbil, že most opraví do podzimu. Místní si tu větu zapsali na pivní tácek a schovali.",
    "Starosta omylem poslal pracovní SMS do hospodské skupiny. Půl vsi teď ví o nové vyhlášce dřív.",
];
function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
function generateIncidents(attendees, rivalsMap, _buddiesMap, coachName, district) {
    if (coachName === void 0) { coachName = "Trenér"; }
    var incidents = [];
    if (attendees.length === 0) {
        return [{ type: "nobody", playerIds: [], text: pickRandom(NOBODY_TEMPLATES), effects: [] }];
    }
    if (attendees.length === 1) {
        var p = attendees[0];
        return [{ type: "lone_drinker", playerIds: [p.playerId], text: pickRandom(SOLO_TEMPLATES).replaceAll("{name}", "".concat(p.firstName, " ").concat(p.lastName)), effects: [] }];
    }
    var visitors = attendees.filter(function (a) { return a.isVisitor; });
    var locals = attendees.filter(function (a) { return !a.isVisitor; });
    // ── Cross-team interactions (přednost) ──
    if (visitors.length > 0 && locals.length > 0) {
        var _loop_1 = function (v) {
            var localRival = locals.find(function (l) { var _a, _b; return ((_a = rivalsMap.get(l.playerId)) === null || _a === void 0 ? void 0 : _a.has(v.playerId)) || ((_b = rivalsMap.get(v.playerId)) === null || _b === void 0 ? void 0 : _b.has(l.playerId)); });
            var partner = localRival !== null && localRival !== void 0 ? localRival : pickRandom(locals);
            var fightProb = localRival ? 0.30 : 0.12;
            var roll = Math.random();
            if (roll < fightProb) {
                // Pro každého fightera: 50/50 zranění 1-3 dny | -12 condition
                var fightEffects = [];
                for (var _b = 0, _c = [partner, v]; _b < _c.length; _b++) {
                    var fighter = _c[_b];
                    if (Math.random() < 0.5) {
                        var days = 1 + Math.floor(Math.random() * 3);
                        fightEffects.push({ playerId: fighter.playerId, type: "injury", injuryDays: days, label: "Lehk\u00E9 zran\u011Bn\u00ED (".concat(days, " ").concat(days === 1 ? "den" : days < 5 ? "dny" : "dní", ")") });
                    }
                    else {
                        fightEffects.push({ playerId: fighter.playerId, type: "condition", delta: -12, label: "−12 kondice (modřiny)" });
                    }
                }
                incidents.push({
                    type: "cross_team_fight",
                    playerIds: [partner.playerId, v.playerId],
                    text: "".concat(partner.firstName, " ").concat(partner.lastName, " a ").concat(v.firstName, " ").concat(v.lastName, " (").concat(v.fromTeamName, ") se chytli nad pivem. Hospodsk\u00FD je rozd\u011Blil ko\u0161t\u011Btem."),
                    effects: fightEffects,
                });
            }
            else if (roll < fightProb + 0.20) {
                incidents.push({
                    type: "cross_team_brotherhood",
                    playerIds: [partner.playerId, v.playerId],
                    text: "".concat(partner.firstName, " koupil ").concat(v.firstName, "ovi (").concat(v.fromTeamName, ") pivo a prokecali do dvou r\u00E1no. \u017D\u00E1dn\u00E9 nep\u0159\u00E1telstv\u00ED."),
                    effects: [
                        { playerId: partner.playerId, type: "morale", delta: 2, label: "+2 morálka" },
                    ],
                });
            }
            else if (roll < fightProb + 0.20 + 0.25) {
                incidents.push({
                    type: "cross_team_provocation",
                    playerIds: [partner.playerId, v.playerId],
                    text: "".concat(v.firstName, " (").concat(v.fromTeamName, ") provokoval dom\u00E1c\u00ED, \u017Ee vesnice neum\u00ED kopnout. Na\u0161i se nadzvedli."),
                    effects: [
                        { playerId: partner.playerId, type: "morale", delta: 3, label: "+3 morálka (motivace)" },
                    ],
                });
            }
        };
        for (var _i = 0, visitors_1 = visitors; _i < visitors_1.length; _i++) {
            var v = visitors_1[_i];
            _loop_1(v);
        }
    }
    // ── Local incidents ──
    // Ranní kocovina — per attendee s alcohol≥50, prob 10–30% dle alcohol škály.
    // Sjednocuje "drink record" mechaniku: kdo pije moc → ráno bude těžko.
    var hangoverVictims = [];
    for (var _a = 0, locals_1 = locals; _a < locals_1.length; _a++) {
        var a = locals_1[_a];
        if (a.alcohol < 50)
            continue;
        var prob = 0.10 + ((a.alcohol - 50) / 50) * 0.20; // alcohol 50→10%, 75→20%, 100→30%
        if (Math.random() < prob)
            hangoverVictims.push(a);
    }
    // Top opilec dostane "vypil rekord" flavour text (zachová lore)
    var topDrinker = hangoverVictims.sort(function (a, b) { return b.alcohol - a.alcohol; })[0];
    if (topDrinker) {
        var beers = 14 + Math.floor(Math.random() * 14); // 14-27 piv (vesnicky pivar)
        incidents.push({
            type: "drink_record",
            playerIds: [topDrinker.playerId],
            text: "".concat(topDrinker.firstName, " ").concat(topDrinker.lastName, " vypil ").concat(beers, " piv \u2014 rekord ve\u010Dera."),
            effects: [{ playerId: topDrinker.playerId, type: "hangover", label: "Ranní kocovina (−15 kondice)" }],
        });
    }
    // Ostatní opilci — souhrnný incident (méně textu)
    var others = hangoverVictims.slice(1);
    if (others.length > 0) {
        var names = others.map(function (o) { return o.lastName; }).join(", ");
        incidents.push({
            type: "drink_record",
            playerIds: others.map(function (o) { return o.playerId; }),
            text: "Piva\u0159 za piva\u0159em \u2014 ".concat(names, " ").concat(others.length === 1 ? "také pořádně přebral" : "taky pořádně přebrali", "."),
            effects: others.map(function (o) { return ({ playerId: o.playerId, type: "hangover", label: "Ranní kocovina (−15 kondice)" }); }),
        });
    }
    if (Math.random() < 0.15) {
        var lucky = pickRandom(locals);
        var win = [200, 300, 500, 700, 1000][Math.floor(Math.random() * 5)];
        incidents.push({
            type: "automat_win",
            playerIds: [lucky.playerId],
            text: "".concat(lucky.firstName, " ").concat(lucky.lastName, " vyhr\u00E1l na automatu ").concat(win, " K\u010D."),
            effects: [{ playerId: lucky.playerId, type: "morale", delta: 2, label: "+2 morálka" }],
        });
    }
    if (Math.random() < 0.5) {
        var teller = pickRandom(locals);
        incidents.push({
            type: "story",
            playerIds: [teller.playerId],
            text: pickRandom((0, district_pool_1.districtPoolFor)(STORY_POOL, district)).replaceAll("{name}", "".concat(teller.firstName, " ").concat(teller.lastName)),
            effects: [],
        });
    }
    // ── Hospodská kočka — 5% prob ──
    if (Math.random() < 0.05) {
        var target = pickRandom(locals);
        incidents.push({
            type: "cat",
            playerIds: [target.playerId],
            text: pickRandom(CAT_INCIDENT_TEMPLATES).replaceAll("{name}", target.firstName),
            effects: [],
        });
    }
    // ── Pan farář Antonín — 5% prob, +1 morale všem attendees ──
    if (Math.random() < 0.05) {
        var target = pickRandom(locals);
        incidents.push({
            type: "priest",
            playerIds: [target.playerId],
            text: pickRandom(PRIEST_INCIDENT_TEMPLATES).replaceAll("{name}", target.firstName),
            effects: locals.map(function (a) { return ({ playerId: a.playerId, type: "morale", delta: 1, label: "+1 morálka" }); }),
        });
    }
    // ── Skaut z vyšší ligy — 3% prob, jen pokud je v hospodě hráč s vysokou kvalitou ──
    // (atributy nejsou přímo v PubAttendee — jako proxy bere alcohol≥60 = "kluci o kterých se ví")
    // Bez direct effect pro teď, jen warning text. Departure trigger lze navázat později.
    var scoutTarget = locals.find(function (a) { return a.alcohol >= 60; });
    if (scoutTarget && Math.random() < 0.03) {
        incidents.push({
            type: "scout",
            playerIds: [scoutTarget.playerId],
            text: pickRandom(SCOUT_INCIDENT_TEMPLATES).replaceAll("{name}", scoutTarget.firstName),
            effects: [],
        });
    }
    // ── Manželka volá — 8% prob na hráče s alcohol≥50 (proxy pro "ten, koho doma řeší") ──
    var wifeTargets = locals.filter(function (a) { return a.alcohol >= 50; });
    if (wifeTargets.length > 0 && Math.random() < 0.08) {
        var target = pickRandom(wifeTargets);
        incidents.push({
            type: "wife_call",
            playerIds: [target.playerId],
            text: pickRandom(WIFE_CALL_INCIDENT_TEMPLATES).replaceAll("{name}", target.firstName),
            effects: [{ playerId: target.playerId, type: "morale", delta: -2, label: "−2 morálka" }],
        });
    }
    // ── Zkažený guláš / kuchyňské hrůzy — 4% prob, 1 den mimo (zažívací potíže) ──
    if (locals.length > 0 && Math.random() < 0.04) {
        var target = pickRandom(locals);
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
        var target = pickRandom(locals);
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
    var fightCandidates = locals.filter(function (a) { return a.alcohol >= 45; });
    if (fightCandidates.length >= 2 && Math.random() < 0.05) {
        var f1_1 = pickRandom(fightCandidates);
        var f2 = pickRandom(fightCandidates.filter(function (a) { return a.playerId !== f1_1.playerId; }));
        if (f2) {
            var tpl = pickRandom(DRUNK_FIGHT_INCIDENT_TEMPLATES)
                .replace("{name1}", f1_1.firstName)
                .replace("{name2}", f2.firstName);
            incidents.push({
                type: "drunk_fight",
                playerIds: [f1_1.playerId, f2.playerId],
                text: tpl,
                effects: [
                    { playerId: f1_1.playerId, type: "injury", injuryDays: 1, injuryType: "drobne", injuryDescription: "Modřiny po hospodské rvačce", label: "Modřiny (1 den mimo)" },
                    { playerId: f2.playerId, type: "injury", injuryDays: 1, injuryType: "drobne", injuryDescription: "Modřiny po hospodské rvačce", label: "Modřiny (1 den mimo)" },
                    { playerId: f1_1.playerId, type: "morale", delta: -2, label: "−2 morálka" },
                    { playerId: f2.playerId, type: "morale", delta: -2, label: "−2 morálka" },
                ],
            });
        }
    }
    // ── Dluh na účtu — 3% narativní incident (bez efektu) ──
    if (locals.length > 0 && Math.random() < 0.03) {
        var target = pickRandom(locals);
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
        var target = pickRandom(locals);
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
            playerIds: locals.map(function (a) { return a.playerId; }),
            text: pickRandom((0, district_pool_1.districtPoolFor)(FREE_ROUND_POOL, district)),
            effects: locals.map(function (a) { return ({ playerId: a.playerId, type: "morale", delta: 1, label: "+1 morálka" }); }),
        });
    }
    // ── Vítěz baru (šipky / kvíz / fotbálek / karaoke) — 4% prob, +3 morálka ──
    if (locals.length > 0 && Math.random() < 0.04) {
        var target = pickRandom(locals);
        incidents.push({
            type: "bar_champion",
            playerIds: [target.playerId],
            text: pickRandom((0, district_pool_1.districtPoolFor)(BAR_CHAMPION_POOL, district)).replaceAll("{name}", target.firstName),
            effects: [{ playerId: target.playerId, type: "morale", delta: 3, label: "+3 morálka" }],
        });
    }
    // ── Vesnický hrdina — 3% prob, +3 morálka jednomu hráči ──
    if (locals.length > 0 && Math.random() < 0.03) {
        var target = pickRandom(locals);
        incidents.push({
            type: "village_hero",
            playerIds: [target.playerId],
            text: pickRandom((0, district_pool_1.districtPoolFor)(VILLAGE_HERO_POOL, district)).replaceAll("{name}", target.firstName),
            effects: [{ playerId: target.playerId, type: "morale", delta: 3, label: "+3 morálka" }],
        });
    }
    // ── Šťastné setkání — 4% prob, +2 morálka jednomu hráči ──
    if (locals.length > 0 && Math.random() < 0.04) {
        var target = pickRandom(locals);
        incidents.push({
            type: "friendly_reunion",
            playerIds: [target.playerId],
            text: pickRandom((0, district_pool_1.districtPoolFor)(FRIENDLY_REUNION_POOL, district)).replaceAll("{name}", target.firstName),
            effects: [{ playerId: target.playerId, type: "morale", delta: 2, label: "+2 morálka" }],
        });
    }
    // ── Myslivecký spolek — 3% prob, +2 morálka VŠEM lokálům ──
    if (locals.length > 0 && (0, district_pool_1.districtPoolFor)(HUNTERS_POOL, district).length > 0 && Math.random() < 0.03) {
        var target = pickRandom(locals);
        incidents.push({
            type: "hunters",
            playerIds: locals.map(function (a) { return a.playerId; }),
            text: pickRandom((0, district_pool_1.districtPoolFor)(HUNTERS_POOL, district)).replaceAll("{name}", target.firstName),
            effects: locals.map(function (a) { return ({ playerId: a.playerId, type: "morale", delta: 2, label: "+2 morálka" }); }),
        });
    }
    // ── Zabíjačka — 2% prob, +3 morálka VŠEM lokálům + 10% sub-roll na zažívačku targetu ──
    if (locals.length > 0 && (0, district_pool_1.districtPoolFor)(PIG_SLAUGHTER_POOL, district).length > 0 && Math.random() < 0.02) {
        var target = pickRandom(locals);
        var effects = locals.map(function (a) { return ({ playerId: a.playerId, type: "morale", delta: 3, label: "+3 morálka" }); });
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
            playerIds: locals.map(function (a) { return a.playerId; }),
            text: pickRandom((0, district_pool_1.districtPoolFor)(PIG_SLAUGHTER_POOL, district)).replaceAll("{name}", target.firstName),
            effects: effects,
        });
    }
    // ── Zabloudilý turista — 3% prob, narativ ──
    if (locals.length > 0 && Math.random() < 0.03) {
        var target = pickRandom(locals);
        incidents.push({
            type: "lost_tourist",
            playerIds: [target.playerId],
            text: pickRandom((0, district_pool_1.districtPoolFor)(LOST_TOURIST_POOL, district)).replaceAll("{name}", target.firstName),
            effects: [],
        });
    }
    // ── Dobrovolní hasiči — 3% prob, +2 morálka VŠEM lokálům ──
    if (locals.length > 0 && (0, district_pool_1.districtPoolFor)(FIREFIGHTERS_POOL, district).length > 0 && Math.random() < 0.03) {
        var target = pickRandom(locals);
        incidents.push({
            type: "firefighters",
            playerIds: locals.map(function (a) { return a.playerId; }),
            text: pickRandom((0, district_pool_1.districtPoolFor)(FIREFIGHTERS_POOL, district)).replaceAll("{name}", target.firstName),
            effects: locals.map(function (a) { return ({ playerId: a.playerId, type: "morale", delta: 2, label: "+2 morálka" }); }),
        });
    }
    // ── Pouť / Slavnosti Zlaté stezky — 3% prob, +2 morálka VŠEM lokálům ──
    if (locals.length > 0 && (0, district_pool_1.districtPoolFor)(VILLAGE_FAIR_POOL, district).length > 0 && Math.random() < 0.03) {
        var target = pickRandom(locals);
        incidents.push({
            type: "village_fair",
            playerIds: locals.map(function (a) { return a.playerId; }),
            text: pickRandom((0, district_pool_1.districtPoolFor)(VILLAGE_FAIR_POOL, district)).replaceAll("{name}", target.firstName),
            effects: locals.map(function (a) { return ({ playerId: a.playerId, type: "morale", delta: 2, label: "+2 morálka" }); }),
        });
    }
    // ── Šumavská vichřice / blackout — 2% prob, narativ ──
    if (locals.length > 0 && (0, district_pool_1.districtPoolFor)(STORM_BLACKOUT_POOL, district).length > 0 && Math.random() < 0.02) {
        var target = pickRandom(locals);
        incidents.push({
            type: "storm_blackout",
            playerIds: [target.playerId],
            text: pickRandom((0, district_pool_1.districtPoolFor)(STORM_BLACKOUT_POOL, district)).replaceAll("{name}", target.firstName),
            effects: [],
        });
    }
    // ── Houbaři — 2% prob, narativ ──
    if (locals.length > 0 && Math.random() < 0.02) {
        var target = pickRandom(locals);
        incidents.push({
            type: "mushroom_brag",
            playerIds: [target.playerId],
            text: pickRandom((0, district_pool_1.districtPoolFor)(MUSHROOM_BRAG_POOL, district)).replaceAll("{name}", target.firstName),
            effects: [],
        });
    }
    // ── Starosta / zastupitel zaskočil — 4% prob, +1 morálka VŠEM lokálům ──
    if (locals.length > 0 && Math.random() < 0.04) {
        var target = pickRandom(locals);
        incidents.push({
            type: "official_visit",
            playerIds: locals.map(function (a) { return a.playerId; }),
            text: pickRandom(OFFICIAL_VISIT_INCIDENT_TEMPLATES).replaceAll("{name}", target.firstName),
            effects: locals.map(function (a) { return ({ playerId: a.playerId, type: "morale", delta: 1, label: "+1 morálka" }); }),
        });
    }
    // ── Politický trapas — 2% prob, narativ (bez efektu) ──
    if (locals.length > 0 && Math.random() < 0.02) {
        var target = pickRandom(locals);
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
        var roll = Math.random();
        if (roll < 0.18) {
            // Trenér se přidá k týmu — +1 morálka VŠEM
            incidents.push({
                type: "coach_joins",
                playerIds: locals.map(function (a) { return a.playerId; }),
                text: pickRandom(COACH_JOINS_INCIDENT_TEMPLATES).replace(/Trenér/g, coachName),
                effects: locals.map(function (a) { return ({ playerId: a.playerId, type: "morale", delta: 1, label: "+1 morálka" }); }),
            });
        }
        else if (roll < 0.36) {
            // Trenér pochválí hráče — +3 morálka tomu hráči
            var target = pickRandom(locals);
            incidents.push({
                type: "coach_praise",
                playerIds: [target.playerId],
                text: pickRandom(COACH_PRAISE_INCIDENT_TEMPLATES).replaceAll("{name}", target.firstName).replace(/Trenér/g, coachName),
                effects: [{ playerId: target.playerId, type: "morale", delta: 3, label: "+3 morálka" }],
            });
        }
        else if (roll < 0.54) {
            // Trenér vynadá hráči s alcohol≥50 (pokud takový je) — −2 morálka
            var scoldTargets = locals.filter(function (a) { return a.alcohol >= 50; });
            if (scoldTargets.length > 0) {
                var target = pickRandom(scoldTargets);
                incidents.push({
                    type: "coach_scold",
                    playerIds: [target.playerId],
                    text: pickRandom(COACH_SCOLD_INCIDENT_TEMPLATES).replaceAll("{name}", target.firstName).replace(/Trenér/g, coachName),
                    effects: [{ playerId: target.playerId, type: "morale", delta: -2, label: "−2 morálka" }],
                });
            }
            else {
                // Fallback: tactics narativ
                var target = pickRandom(locals);
                incidents.push({
                    type: "coach_tactics",
                    playerIds: [target.playerId],
                    text: pickRandom(COACH_TACTICS_INCIDENT_TEMPLATES).replaceAll("{name}", target.firstName).replace(/Trenér/g, coachName),
                    effects: [],
                });
            }
        }
        else if (roll < 0.70) {
            // Trenér nakreslí taktiku — narativ, bez efektu
            var target = pickRandom(locals);
            incidents.push({
                type: "coach_tactics",
                playerIds: [target.playerId],
                text: pickRandom(COACH_TACTICS_INCIDENT_TEMPLATES).replaceAll("{name}", target.firstName).replace(/Trenér/g, coachName),
                effects: [],
            });
        }
        else if (roll < 0.85) {
            // Trenér prohrál sázku — +2 morálka VŠEM
            incidents.push({
                type: "coach_lost_bet",
                playerIds: locals.map(function (a) { return a.playerId; }),
                text: pickRandom(COACH_LOST_BET_INCIDENT_TEMPLATES).replace(/Trenér/g, coachName),
                effects: locals.map(function (a) { return ({ playerId: a.playerId, type: "morale", delta: 2, label: "+2 morálka" }); }),
            });
        }
        else {
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
function applyIncidentEffects(db, incidents) {
    return __awaiter(this, void 0, void 0, function () {
        var stmts, affectedIds, _i, incidents_1, inc, _a, _b, ef, placeholders, rows, stateMap, _c, incidents_2, inc, _d, _e, ef, cur, newCond, newMorale, newCond, injType, injDesc, newCond;
        var _f;
        var _g, _h;
        return __generator(this, function (_j) {
            switch (_j.label) {
                case 0:
                    stmts = [];
                    affectedIds = new Set();
                    for (_i = 0, incidents_1 = incidents; _i < incidents_1.length; _i++) {
                        inc = incidents_1[_i];
                        for (_a = 0, _b = inc.effects; _a < _b.length; _a++) {
                            ef = _b[_a];
                            affectedIds.add(ef.playerId);
                        }
                    }
                    if (affectedIds.size === 0)
                        return [2 /*return*/, stmts];
                    placeholders = __spreadArray([], affectedIds, true).map(function () { return "?"; }).join(",");
                    return [4 /*yield*/, (_f = db.prepare("SELECT id, team_id,\n       json_extract(life_context, '$.condition') as cond,\n       json_extract(life_context, '$.morale') as morale\n     FROM players WHERE id IN (".concat(placeholders, ")"))).bind.apply(_f, __spreadArray([], affectedIds, true)).all()
                            .catch(function (e) { logger_1.logger.warn({ module: "pub" }, "load player state for incidents", e); return { results: [] }; })];
                case 1:
                    rows = _j.sent();
                    stateMap = new Map(rows.results.map(function (r) { var _a, _b; return [r.id, { teamId: r.team_id, cond: (_a = r.cond) !== null && _a !== void 0 ? _a : 100, morale: (_b = r.morale) !== null && _b !== void 0 ? _b : 50 }]; }));
                    for (_c = 0, incidents_2 = incidents; _c < incidents_2.length; _c++) {
                        inc = incidents_2[_c];
                        for (_d = 0, _e = inc.effects; _d < _e.length; _d++) {
                            ef = _e[_d];
                            cur = stateMap.get(ef.playerId);
                            if (!cur)
                                continue;
                            if (ef.type === "condition" && ef.delta != null) {
                                newCond = Math.max(15, Math.min(100, cur.cond + ef.delta));
                                if (newCond === cur.cond)
                                    continue;
                                stmts.push(db.prepare("UPDATE players SET life_context = json_set(life_context, '$.condition', ?) WHERE id = ?").bind(newCond, ef.playerId));
                                stmts.push((0, condition_log_1.logConditionStmt)(db, ef.playerId, cur.teamId, cur.cond, newCond, "pub", inc.text.slice(0, 100)));
                                cur.cond = newCond;
                            }
                            else if (ef.type === "morale" && ef.delta != null) {
                                newMorale = Math.max(0, Math.min(100, cur.morale + ef.delta));
                                if (newMorale === cur.morale)
                                    continue;
                                stmts.push(db.prepare("UPDATE players SET life_context = json_set(life_context, '$.morale', ?) WHERE id = ?").bind(newMorale, ef.playerId));
                                cur.morale = newMorale;
                            }
                            else if (ef.type === "hangover") {
                                newCond = Math.max(15, cur.cond - 15);
                                stmts.push(db.prepare("UPDATE players SET life_context = json_set(life_context, '$.condition', ?, '$.hangover', 1) WHERE id = ?").bind(newCond, ef.playerId));
                                stmts.push((0, condition_log_1.logConditionStmt)(db, ef.playerId, cur.teamId, cur.cond, newCond, "hangover", "Ranní kocovina po hospodě"));
                                cur.cond = newCond;
                            }
                            else if (ef.type === "injury" && ef.injuryDays != null) {
                                injType = (_g = ef.injuryType) !== null && _g !== void 0 ? _g : "obecne";
                                injDesc = (_h = ef.injuryDescription) !== null && _h !== void 0 ? _h : "Zranění z hospodské bitky";
                                stmts.push(db.prepare("INSERT INTO injuries (id, player_id, team_id, type, description, severity, days_remaining, days_total) VALUES (?, ?, ?, ?, ?, 'lehke', ?, ?)").bind(crypto.randomUUID(), ef.playerId, cur.teamId, injType, injDesc, ef.injuryDays, ef.injuryDays));
                                newCond = Math.max(20, cur.cond - 8);
                                stmts.push(db.prepare("UPDATE players SET life_context = json_set(life_context, '$.condition', ?) WHERE id = ?").bind(newCond, ef.playerId));
                                stmts.push((0, condition_log_1.logConditionStmt)(db, ef.playerId, cur.teamId, cur.cond, newCond, "pub", "".concat(injDesc, " (").concat(ef.injuryDays, " d)")));
                                cur.cond = newCond;
                            }
                        }
                    }
                    return [2 /*return*/, stmts];
            }
        });
    });
}
/**
 * Coach-led pub session — trenér aktivně rozhodne "Pojedeme na jedno".
 * Volá se z `POST /api/teams/:id/pub-visit`.
 * Vytvoří pub_session pro dnešek (idempotentně přepíše emergent), aplikuje effects.
 *
 * Pro choice="all": všichni active+healthy, +8 morale + −15 cond, vyšší prob hangoveru
 * Pro choice="one": hráč s nejnižší morale, +3 morale, −5 cond, žádné drama
 */
function createCoachLedSession(db, teamId, gameDate, choice) {
    return __awaiter(this, void 0, void 0, function () {
        var players, districtRow, district, attendees, incidents, _i, _a, p, _b, attendees_1, a, prob, target, effectStmts;
        var _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0: return [4 /*yield*/, db.prepare("SELECT p.id, p.first_name, p.last_name,\n       json_extract(p.personality, '$.alcohol') as alcohol,\n       json_extract(p.life_context, '$.morale') as morale\n     FROM players p\n     WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active')\n       AND p.id NOT IN (SELECT player_id FROM injuries WHERE days_remaining > 0)\n       AND COALESCE(p.suspended_matches, 0) = 0").bind(teamId).all()
                        .catch(function (e) { logger_1.logger.warn({ module: "pub" }, "load players for coach-led", e); return { results: [] }; })];
                case 1:
                    players = _f.sent();
                    if (players.results.length === 0)
                        return [2 /*return*/, { ok: false, reason: "Žádní dostupní hráči" }];
                    return [4 /*yield*/, db.prepare("SELECT v.district FROM teams t LEFT JOIN villages v ON t.village_id = v.id WHERE t.id = ?").bind(teamId).first()
                            .catch(function (e) { logger_1.logger.warn({ module: "pub" }, "load district for coach-led", e); return null; })];
                case 2:
                    districtRow = _f.sent();
                    district = (_c = districtRow === null || districtRow === void 0 ? void 0 : districtRow.district) !== null && _c !== void 0 ? _c : undefined;
                    attendees = [];
                    incidents = [];
                    if (choice === "all") {
                        for (_i = 0, _a = players.results; _i < _a.length; _i++) {
                            p = _a[_i];
                            attendees.push({
                                playerId: p.id, firstName: p.first_name, lastName: p.last_name,
                                alcohol: (_d = p.alcohol) !== null && _d !== void 0 ? _d : 30,
                                teamId: teamId,
                                isVisitor: false,
                            });
                        }
                        // Marker incident: trenér vzal celý tým
                        incidents.push({
                            type: "coach_led_visit",
                            playerIds: attendees.map(function (a) { return a.playerId; }),
                            text: "Tren\u00E9r vyhl\u00E1sil \"Pojedeme na jedno!\" Cel\u00FD t\u00FDm v hospod\u011B.",
                            effects: attendees.flatMap(function (a) { return [
                                { playerId: a.playerId, type: "morale", delta: 8, label: "+8 morálka" },
                                { playerId: a.playerId, type: "condition", delta: -15, label: "−15 kondice" },
                            ]; }),
                        });
                        // Vyšší prob hangoveru — týmový binge
                        for (_b = 0, attendees_1 = attendees; _b < attendees_1.length; _b++) {
                            a = attendees_1[_b];
                            if (a.alcohol < 50)
                                continue;
                            prob = 0.25 + ((a.alcohol - 50) / 50) * 0.30;
                            if (Math.random() >= prob)
                                continue;
                            incidents.push({
                                type: "drink_record",
                                playerIds: [a.playerId],
                                text: "".concat(a.firstName, " ").concat(a.lastName, " si dal po\u0159\u00E1dn\u011B v\u00EDc ne\u017E ostatn\u00ED."),
                                effects: [{ playerId: a.playerId, type: "hangover", label: "Ranní kocovina (−15 kondice)" }],
                            });
                        }
                    }
                    else {
                        target = __spreadArray([], players.results, true).sort(function (a, b) { var _a, _b; return ((_a = a.morale) !== null && _a !== void 0 ? _a : 50) - ((_b = b.morale) !== null && _b !== void 0 ? _b : 50); })[0];
                        attendees.push({
                            playerId: target.id, firstName: target.first_name, lastName: target.last_name,
                            alcohol: (_e = target.alcohol) !== null && _e !== void 0 ? _e : 30,
                            teamId: teamId,
                            isVisitor: false,
                        });
                        incidents.push({
                            type: "coach_led_one",
                            playerIds: [target.id],
                            text: "Tren\u00E9r si pozval ".concat(target.first_name, " ").concat(target.last_name, " na pivo, probrali sez\u00F3nu."),
                            effects: [
                                { playerId: target.id, type: "morale", delta: 3, label: "+3 morálka" },
                                { playerId: target.id, type: "condition", delta: -5, label: "−5 kondice" },
                            ],
                        });
                    }
                    // Idempotentně: pokud už dnes existuje (emergent), přepiš ji coach-led variantou.
                    return [4 /*yield*/, db.prepare("DELETE FROM pub_sessions WHERE team_id = ? AND game_date = ?").bind(teamId, gameDate).run().catch(function (e) { return logger_1.logger.warn({ module: "pub" }, "delete existing emergent session", e); })];
                case 3:
                    // Idempotentně: pokud už dnes existuje (emergent), přepiš ji coach-led variantou.
                    _f.sent();
                    return [4 /*yield*/, db.prepare("INSERT INTO pub_sessions (team_id, game_date, attendees, incidents, daily_special) VALUES (?, ?, ?, ?, ?)").bind(teamId, gameDate, JSON.stringify(attendees), JSON.stringify(incidents), pickRandom((0, district_pool_1.districtPoolFor)(DAILY_SPECIALS_POOL, district))).run()
                            .catch(function (e) { return logger_1.logger.warn({ module: "pub" }, "insert coach-led session", e); })];
                case 4:
                    _f.sent();
                    return [4 /*yield*/, applyIncidentEffects(db, incidents)];
                case 5:
                    effectStmts = _f.sent();
                    if (!(effectStmts.length > 0)) return [3 /*break*/, 7];
                    return [4 /*yield*/, db.batch(effectStmts).catch(function (e) { return logger_1.logger.warn({ module: "pub" }, "apply coach-led effects", e); })];
                case 6:
                    _f.sent();
                    _f.label = 7;
                case 7: return [2 /*return*/, { ok: true, attendeesCount: attendees.length, incidentsCount: incidents.length }];
            }
        });
    });
}
/**
 * Backfill — vygeneruje jednu pub_session pro daný tým pro **včerejšek** (game_date - 1 day).
 * Slouží k tomu, aby noví uživatelé / čerstvý deploy neměli prázdnou hospodu.
 * Idempotentní: skipuje pokud session pro daný den už existuje.
 *
 * Volá se z onboarding flow po vytvoření týmu, plus jako one-shot pro existing teams.
 */
function backfillYesterdayPubSession(db, teamId, todayGameDate) {
    return __awaiter(this, void 0, void 0, function () {
        var yesterday, yesterdayStr, all;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    yesterday = new Date(todayGameDate);
                    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
                    yesterdayStr = yesterday.toISOString().slice(0, 10);
                    return [4 /*yield*/, generatePubSessionsForAllTeams(db, yesterdayStr)];
                case 1:
                    all = _a.sent();
                    return [2 /*return*/, { created: all.sessionsCreated > 0 }];
            }
        });
    });
}
function generatePubSessionsForAllTeams(db, gameDate) {
    return __awaiter(this, void 0, void 0, function () {
        var allTeams, humanTeams, dayOfWeek, created, _loop_2, _i, humanTeams_1, team;
        var _a, _b, _c, _d, _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0: return [4 /*yield*/, db.prepare("SELECT t.id, t.name, t.user_id, t.league_id, v.district FROM teams t LEFT JOIN villages v ON t.village_id = v.id").all()
                        .catch(function (e) { logger_1.logger.warn({ module: "pub" }, "load teams", e); return { results: [] }; })];
                case 1:
                    allTeams = _g.sent();
                    humanTeams = allTeams.results.filter(function (t) { return t.user_id !== "ai"; });
                    if (humanTeams.length === 0)
                        return [2 /*return*/, { sessionsCreated: 0 }];
                    dayOfWeek = new Date(gameDate).getDay();
                    created = 0;
                    _loop_2 = function (team) {
                        var existing, players, managerRow, coachName, coachAvatar, lastMatch, lastMatchResult, isHome, ours, theirs, nextMatch, daysToNextMatch, playerIds, placeholders, rels, buddiesMap, rivalsMap, _h, _j, r, map, attendees, ctx, sorted, _loop_3, _k, sorted_1, p, otherTeams, i, otherTeam, visitor, incidents, hasCoach, coachFirstName, coachLastName, effectStmts;
                        var _l;
                        return __generator(this, function (_m) {
                            switch (_m.label) {
                                case 0: return [4 /*yield*/, db.prepare("SELECT id FROM pub_sessions WHERE team_id = ? AND game_date = ?").bind(team.id, gameDate).first().catch(function (e) { logger_1.logger.warn({ module: "pub" }, "check pub_session existence", e); return null; })];
                                case 1:
                                    existing = _m.sent();
                                    if (existing)
                                        return [2 /*return*/, "continue"];
                                    return [4 /*yield*/, db.prepare("SELECT\n         p.id, p.team_id, p.first_name, p.last_name,\n         json_extract(p.personality, '$.alcohol') as alcohol,\n         json_extract(p.personality, '$.patriotism') as patriotism,\n         json_extract(p.personality, '$.temper') as temper,\n         json_extract(p.life_context, '$.condition') as condition,\n         CASE WHEN EXISTS(SELECT 1 FROM injuries WHERE player_id = p.id AND days_remaining > 0) THEN 1 ELSE 0 END as injured,\n         CASE WHEN p.suspended_matches > 0 THEN 1 ELSE 0 END as suspended,\n         (SELECT COUNT(*) FROM pub_sessions ps WHERE ps.team_id = p.team_id AND ps.game_date >= date(?, '-3 days')\n            AND ps.attendees LIKE '%' || p.id || '%') as recent_pub_days\n       FROM players p\n       WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active')").bind(gameDate, team.id).all().catch(function (e) { logger_1.logger.warn({ module: "pub" }, "load players for pub", e); return { results: [] }; })];
                                case 2:
                                    players = _m.sent();
                                    if (players.results.length === 0)
                                        return [2 /*return*/, "continue"];
                                    return [4 /*yield*/, db.prepare("SELECT id, name, avatar FROM managers WHERE team_id = ? LIMIT 1")
                                            .bind(team.id).first()
                                            .catch(function (e) { logger_1.logger.warn({ module: "pub" }, "load manager for pub", e); return null; })];
                                case 3:
                                    managerRow = _m.sent();
                                    coachName = (_a = managerRow === null || managerRow === void 0 ? void 0 : managerRow.name) !== null && _a !== void 0 ? _a : "Trenér";
                                    coachAvatar = void 0;
                                    if (managerRow === null || managerRow === void 0 ? void 0 : managerRow.avatar) {
                                        try {
                                            coachAvatar = JSON.parse(managerRow.avatar);
                                        }
                                        catch (e) {
                                            logger_1.logger.warn({ module: "pub" }, "parse manager avatar for ".concat(team.id), e);
                                        }
                                    }
                                    return [4 /*yield*/, db.prepare("SELECT home_team_id, away_team_id, home_score, away_score FROM matches\n       WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'\n       ORDER BY simulated_at DESC LIMIT 1").bind(team.id, team.id).first().catch(function (e) { logger_1.logger.warn({ module: "pub" }, "load last match", e); return null; })];
                                case 4:
                                    lastMatch = _m.sent();
                                    lastMatchResult = null;
                                    if (lastMatch) {
                                        isHome = lastMatch.home_team_id === team.id;
                                        ours = isHome ? lastMatch.home_score : lastMatch.away_score;
                                        theirs = isHome ? lastMatch.away_score : lastMatch.home_score;
                                        lastMatchResult = ours > theirs ? "win" : ours < theirs ? "loss" : "draw";
                                    }
                                    return [4 /*yield*/, db.prepare("SELECT scheduled_at FROM season_calendar sc JOIN matches m ON m.calendar_id = sc.id\n       WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND sc.status = 'scheduled'\n       ORDER BY sc.scheduled_at ASC LIMIT 1").bind(team.id, team.id).first().catch(function (e) { logger_1.logger.warn({ module: "pub" }, "load next match", e); return null; })];
                                case 5:
                                    nextMatch = _m.sent();
                                    daysToNextMatch = nextMatch ? Math.max(0, Math.ceil((new Date(nextMatch.scheduled_at).getTime() - new Date(gameDate).getTime()) / 86400000)) : null;
                                    playerIds = players.results.map(function (p) { return p.id; });
                                    placeholders = playerIds.map(function () { return "?"; }).join(",");
                                    return [4 /*yield*/, (_l = db.prepare("SELECT player_a_id, player_b_id, type FROM relationships\n       WHERE (player_a_id IN (".concat(placeholders, ") OR player_b_id IN (").concat(placeholders, "))\n         AND type IN ('drinking_buddies', 'rivals')"))).bind.apply(_l, __spreadArray(__spreadArray([], playerIds, false), playerIds, false)).all().catch(function (e) { logger_1.logger.warn({ module: "pub" }, "load relationships for pub", e); return { results: [] }; })];
                                case 6:
                                    rels = _m.sent();
                                    buddiesMap = new Map();
                                    rivalsMap = new Map();
                                    for (_h = 0, _j = rels.results; _h < _j.length; _h++) {
                                        r = _j[_h];
                                        map = r.type === "drinking_buddies" ? buddiesMap : rivalsMap;
                                        if (!map.has(r.player_a_id))
                                            map.set(r.player_a_id, new Set());
                                        if (!map.has(r.player_b_id))
                                            map.set(r.player_b_id, new Set());
                                        map.get(r.player_a_id).add(r.player_b_id);
                                        map.get(r.player_b_id).add(r.player_a_id);
                                    }
                                    attendees = [];
                                    ctx = { dayOfWeek: dayOfWeek, lastMatchResult: lastMatchResult, daysToNextMatch: daysToNextMatch };
                                    sorted = __spreadArray([], players.results, true).sort(function (a, b) { return b.alcohol - a.alcohol; });
                                    _loop_3 = function (p) {
                                        var buddiesIn = ((_b = buddiesMap.get(p.id)) !== null && _b !== void 0 ? _b : new Set()).size > 0
                                            ? attendees.filter(function (a) { return buddiesMap.get(p.id).has(a.playerId); }).length : 0;
                                        var rivalsIn = ((_c = rivalsMap.get(p.id)) !== null && _c !== void 0 ? _c : new Set()).size > 0
                                            ? attendees.filter(function (a) { return rivalsMap.get(p.id).has(a.playerId); }).length : 0;
                                        var prob = attendanceProb(p, __assign(__assign({}, ctx), { buddiesAlreadyIn: buddiesIn, rivalsAlreadyIn: rivalsIn }));
                                        if (Math.random() < prob) {
                                            attendees.push({
                                                playerId: p.id, firstName: p.first_name, lastName: p.last_name,
                                                alcohol: p.alcohol, teamId: team.id, isVisitor: false,
                                            });
                                        }
                                    };
                                    for (_k = 0, sorted_1 = sorted; _k < sorted_1.length; _k++) {
                                        p = sorted_1[_k];
                                        _loop_3(p);
                                    }
                                    if (!(attendees.length > 0 && team.league_id)) return [3 /*break*/, 10];
                                    otherTeams = allTeams.results.filter(function (t) { return t.league_id === team.league_id && t.id !== team.id; });
                                    i = 0;
                                    _m.label = 7;
                                case 7:
                                    if (!(i < attendees.length)) return [3 /*break*/, 10];
                                    if (Math.random() >= 0.05)
                                        return [3 /*break*/, 9];
                                    if (otherTeams.length === 0)
                                        return [3 /*break*/, 10];
                                    otherTeam = pickRandom(otherTeams);
                                    return [4 /*yield*/, db.prepare("SELECT id, first_name, last_name,\n             json_extract(personality, '$.alcohol') as alcohol,\n             json_extract(personality, '$.patriotism') as patriotism\n           FROM players\n           WHERE team_id = ? AND (status IS NULL OR status = 'active')\n             AND json_extract(personality, '$.alcohol') >= 30\n             AND json_extract(personality, '$.patriotism') <= 70\n             AND NOT EXISTS(SELECT 1 FROM injuries WHERE player_id = players.id AND days_remaining > 0)\n           ORDER BY RANDOM() LIMIT 1").bind(otherTeam.id).first().catch(function (e) { logger_1.logger.warn({ module: "pub" }, "load visitor candidate", e); return null; })];
                                case 8:
                                    visitor = _m.sent();
                                    if (visitor) {
                                        attendees.push({
                                            playerId: visitor.id, firstName: visitor.first_name, lastName: visitor.last_name,
                                            alcohol: visitor.alcohol, teamId: otherTeam.id, isVisitor: true, fromTeamName: otherTeam.name,
                                        });
                                    }
                                    _m.label = 9;
                                case 9:
                                    i++;
                                    return [3 /*break*/, 7];
                                case 10:
                                    incidents = generateIncidents(attendees, rivalsMap, buddiesMap, coachName, (_d = team.district) !== null && _d !== void 0 ? _d : undefined);
                                    hasCoach = incidents.some(function (inc) { return inc.type.startsWith("coach_"); });
                                    if (hasCoach && managerRow) {
                                        coachFirstName = (_e = coachName.split(" ")[0]) !== null && _e !== void 0 ? _e : coachName;
                                        coachLastName = coachName.split(" ").slice(1).join(" ") || "(trenér)";
                                        attendees.push({
                                            playerId: "coach-".concat(managerRow.id),
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
                                    return [4 /*yield*/, db.prepare("INSERT INTO pub_sessions (team_id, game_date, attendees, incidents, daily_special) VALUES (?, ?, ?, ?, ?)").bind(team.id, gameDate, JSON.stringify(attendees), JSON.stringify(incidents), pickRandom((0, district_pool_1.districtPoolFor)(DAILY_SPECIALS_POOL, (_f = team.district) !== null && _f !== void 0 ? _f : undefined))).run().catch(function (e) { return logger_1.logger.warn({ module: "pub" }, "insert pub_session", e); })];
                                case 11:
                                    // Persist session
                                    _m.sent();
                                    return [4 /*yield*/, applyIncidentEffects(db, incidents)];
                                case 12:
                                    effectStmts = _m.sent();
                                    if (!(effectStmts.length > 0)) return [3 /*break*/, 14];
                                    return [4 /*yield*/, db.batch(effectStmts).catch(function (e) { return logger_1.logger.warn({ module: "pub" }, "batch incident effects", e); })];
                                case 13:
                                    _m.sent();
                                    _m.label = 14;
                                case 14:
                                    created++;
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, humanTeams_1 = humanTeams;
                    _g.label = 2;
                case 2:
                    if (!(_i < humanTeams_1.length)) return [3 /*break*/, 5];
                    team = humanTeams_1[_i];
                    return [5 /*yield**/, _loop_2(team)];
                case 3:
                    _g.sent();
                    _g.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/, { sessionsCreated: created }];
            }
        });
    });
}
