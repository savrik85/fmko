"use strict";
/**
 * Systém absencí — profesní, osobní, absurdní, zdravotní, kocovina.
 *
 * Pravděpodobnost a typ absence závisí na:
 * - discipline → celková šance na absenci
 * - morale → osobní důvody (nízká = hledá výmluvy)
 * - patriotism → loajalita k týmu (nízký = snáz chybí)
 * - alcohol → kocovina
 * - age + stamina + injuryProneness → zdravotní
 * - occupation.overtimeRisk → profesní
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CELEBRITY_TRAINING_EXCUSES = void 0;
exports.generateAbsences = generateAbsences;
var occupations_1 = require("../generators/occupations");
// ═══════════════════════════════════════════════
// OSOBNÍ VÝMLUVY (univerzální, vážené dle atributů)
// ═══════════════════════════════════════════════
var PERSONAL_EXCUSES = [
    // Rodina — víte den předem
    { text: "Manželka mě nepustila, sorry", emoji: "\uD83D\uDC6B", minAge: 25, timing: "day_before" },
    { text: "Tchýně má narozeniny, musel jsem slíbit že přijdu", emoji: "\uD83C\uDF82", minAge: 28, timing: "day_before" },
    { text: "Malej je nemocnej, musím ho hlídat", emoji: "\uD83D\uDC76", minAge: 24, timing: "day_before" },
    { text: "Musím na rodičák do školky", emoji: "\uD83C\uDFEB", minAge: 25, timing: "day_before" },
    { text: "Ženská mi dala ultimátum — buď fotbal nebo ona. Ještě přemýšlím", emoji: "\uD83D\uDC94", minAge: 20, timing: "day_before" },
    { text: "Dcera má vystoupení ve škole, slíbil jsem že přijdu", emoji: "\uD83C\uDFAD", minAge: 28, timing: "day_before" },
    { text: "Rodinnej oběd u rodičů, nemůžu to zrušit", emoji: "\uD83C\uDF56", minAge: 0, timing: "day_before" },
    { text: "Slíbil jsem ženský že jedeme do IKEA, nemůžu to zrušit", emoji: "\uD83D\uDED2", minAge: 22, timing: "day_before" },
    { text: "Musím pomoct stěhovat kamarádovi, slíbil jsem to už třikrát", emoji: "\uD83D\uDCE6", minAge: 0, timing: "day_before" },
    { text: "Bráchovi se narodilo dítě, jedu do porodnice", emoji: "\uD83C\uDF7C", minAge: 22, timing: "day_before" },
    { text: "Máma má narozeniny, musím být doma", emoji: "\uD83C\uDF82", minAge: 18, timing: "day_before" },
    { text: "Slíbil jsem že pohlídám dceru, ženská jede na hory s kámoškama", emoji: "\uD83C\uDFD4", minAge: 25, timing: "day_before" },
    { text: "Syn má první přijímačky, chci ho podpořit", emoji: "\uD83C\uDF93", minAge: 34, timing: "day_before" },
    { text: "Musím odvézt babičku k doktorovi, nemá jak jinak", emoji: "\uD83D\uDC75", minAge: 20, timing: "day_before" },
    { text: "Jedeme na svatbu sestry, nemůžu to prostě odpustit", emoji: "\uD83D\uDC70", minAge: 20, timing: "day_before" },
    { text: "Máme pohřeb strejdy, musím být s rodinou", emoji: "\uD83D\uDDA4", minAge: 18, timing: "day_before" },
    { text: "Musím s dětma do zoo, slíbil jsem to před měsícem", emoji: "\uD83E\uDD81", minAge: 28, timing: "day_before" },
    { text: "Jedeme do Německa nakoupit Lidl, vrátím se až večer", emoji: "\uD83D\uDED2", minAge: 25, timing: "day_before" },
    { text: "Přítelkyně má výročí s kamarádkami, musím ji odvézt", emoji: "\uD83D\uDC6F", minAge: 20, timing: "day_before" },
    { text: "Máme výročí vztahu, slíbil jsem nikam nejít", emoji: "\uD83D\uDC98", minAge: 22, timing: "day_before" },
    // Zdraví — víte den předem
    { text: "Bolí mě záda od včerejška, nemůžu se ohnout", emoji: "\uD83E\uDD15", minAge: 30, timing: "day_before" },
    { text: "Mám doktora, nemohl jsem to přeobjednat", emoji: "\uD83C\uDFE5", minAge: 0, timing: "day_before" },
    { text: "Chytil jsem chřipku, nechci nakazit celej tým", emoji: "\uD83E\uDD12", minAge: 0, timing: "day_before" },
    { text: "Mám kontrolu u zubaře, nemůžu to zrušit", emoji: "\uD83E\uDDB7", minAge: 0, timing: "day_before" },
    { text: "Naočkovali mě včera, necítím se dobře", emoji: "\uD83D\uDC89", minAge: 0, timing: "day_before" },
    // Logistika — v den zápasu
    { text: "Nemám odvoz, auto je v servisu od pátku", emoji: "\uD83D\uDE97", minAge: 0, timing: "match_day" },
    { text: "Ujel mi bus a další jede až za dvě hodiny", emoji: "\uD83D\uDE8C", minAge: 0, timing: "match_day" },
    // Zapomnětlivost — v den zápasu
    { text: "Zapomněl jsem, myslel jsem že hrajeme příští týden", emoji: "\uD83E\uDD37", minAge: 0, timing: "match_day" },
    { text: "Hele já se omlouvám ale fakt jsem si to nespojil", emoji: "\uD83D\uDE44", minAge: 0, timing: "match_day" },
    { text: "Já fakt nevěděl že dneska, myslel jsem že je volno", emoji: "\uD83D\uDE24", minAge: 0, timing: "match_day" },
    { text: "Spletl jsem si termín. Příště určitě dorazím", emoji: "\uD83D\uDE12", minAge: 0, timing: "match_day" },
    // Další rodina
    { text: "Malá má angínu, musím s ní k doktorovi", emoji: "\uD83C\uDF21", minAge: 26, timing: "match_day" },
    { text: "Tchán padl ze žebříku, jedeme do nemocnice", emoji: "\uD83D\uDE91", minAge: 25, timing: "match_day" },
    { text: "Manželka rodí! Ne teď, ale prý co kdyby", emoji: "\uD83E\uDD30", minAge: 24, timing: "day_before" },
    { text: "Syn má turnaj v šachách, slíbil jsem že přijdu", emoji: "\u265F", minAge: 30, timing: "day_before" },
    { text: "Ženská jede s kamarádkama pryč, musím hlídat", emoji: "\uD83D\uDC76", minAge: 25, timing: "day_before" },
    { text: "Stěhujeme se k rodičům na víkend, nemůžu odjet", emoji: "\uD83C\uDFE0", minAge: 0, timing: "day_before" },
    { text: "Babička slaví osmdesátiny, celá rodina se sjíždí", emoji: "\uD83D\uDC75", minAge: 22, timing: "day_before" },
    { text: "Dceři se rozbila kola, slíbil jsem jí že ji odvezu do školy", emoji: "\uD83D\uDEB2", minAge: 30, timing: "match_day" },
    { text: "Syn má první zápas v žácích, nemůžu to vynechat", emoji: "\u26BD", minAge: 28, timing: "day_before" },
    // Další logistika
    { text: "Kopačky mi zůstaly v práci a nemůžu se tam dostat", emoji: "\uD83D\uDC5F", minAge: 0, timing: "match_day" },
    { text: "Klíče od auta jsou zamčený v autě. Čekám na zámečníka", emoji: "\uD83D\uDD11", minAge: 0, timing: "match_day" },
    { text: "Spadl mi telefon do záchodu a nevím kde hrajeme", emoji: "\uD83D\uDCF1", minAge: 0, timing: "match_day" },
    { text: "Vybil mi telefon a nikdo nevěděl kam má přijet", emoji: "\uD83D\uDD0B", minAge: 0, timing: "match_day" },
    { text: "Zapomněl jsem dresy doma, nemůžu zpátky už", emoji: "\uD83D\uDC55", minAge: 0, timing: "match_day" },
    { text: "Nemám čisté kopačky, zkusím to příště", emoji: "\uD83D\uDC5F", minAge: 0, timing: "match_day" },
];
var ABSURD_EXCUSES = [
    // Vesnické
    { text: "Zamkl jsem se v garáži a nikdo není doma", emoji: "\uD83D\uDD12", timing: "match_day" },
    { text: "Musím hlídat kozu, utekla sousedům a žere mi zahradu", emoji: "\uD83D\uDC10", timing: "match_day", env: "rural" },
    { text: "Přijeli příbuzní z Kanady, neviděl jsem je 15 let, nemůžu odejít", emoji: "\u2708", timing: "day_before" },
    { text: "Slíbil jsem dědovi že mu pomůžu vyčistit studnu", emoji: "\uD83D\uDCA7", timing: "day_before", env: "rural" },
    { text: "Našel jsem houby a musím je hned zpracovat, jinak se zkazí", emoji: "\uD83C\uDF44", timing: "match_day", env: "rural" },
    { text: "Spadl mi strom na plot a utečou slepice", emoji: "\uD83C\uDF33", timing: "match_day", env: "rural" },
    { text: "Dostal jsem lístky na hokej, sorry ale tohle se neodmítá", emoji: "\uD83C\uDFD2", timing: "match_day" },
    { text: "Musím odvézt tchána na houby, hrozil že jinak nepůjčí přívěs", emoji: "\uD83D\uDE98", timing: "day_before", env: "rural" },
    { text: "Pes sežral klíče od auta, čekám až je... vrátí", emoji: "\uD83D\uDC36", timing: "match_day" },
    { text: "Montér na parabolu přijede jen dneska mezi 8 a 17", emoji: "\uD83D\uDCE1", timing: "match_day" },
    { text: "Svědek na svatbě bratrance, nemůžu odmítnout", emoji: "\uD83D\uDC92", timing: "day_before" },
    { text: "Musím natřít plot, barva schne jen do patnácti stupňů", emoji: "\uD83C\uDFA8", timing: "match_day", env: "rural" },
    { text: "Soused mi vrací vrtačku a slíbil jsem mu za to pomoct se střechou", emoji: "\uD83D\uDD27", timing: "match_day", env: "rural" },
    { text: "Žena mi vyhodila kopačky z okna. Doslova. Hledám je v křoví", emoji: "\uD83D\uDC62", timing: "match_day" },
    { text: "Zateklo mi do sklepa, musím to vylejvat kbelíkem", emoji: "\uD83E\uDEA3", timing: "match_day" },
    { text: "Musím opravit záchod, ženská řekla že dokud nebude fungovat, nikam nejdu", emoji: "\uD83D\uDEBD", timing: "match_day" },
    { text: "Chytil jsem sumce a nemůžu ho nechat v autě", emoji: "\uD83D\uDC1F", timing: "match_day", env: "rural" },
    { text: "Klíště. Musím k doktorovi. Asi. Pro jistotu", emoji: "\uD83E\uDEB2", timing: "match_day", env: "rural" },
    { text: "Babička volala že jí nefunguje televize a neumí přepnout vstup", emoji: "\uD83D\uDCFA", timing: "match_day" },
    { text: "Musím vyzvednout traktůrek ze servisu, jinak mi ho prodaj", emoji: "\uD83D\uDE9C", timing: "match_day", env: "rural" },
    { text: "Kočka mi porodila v tašce s vybavením", emoji: "\uD83D\uDC31", timing: "match_day" },
    { text: "Sousedovic pes mi ukradl kopačku, honíme ho po vsi", emoji: "\uD83D\uDC15", timing: "match_day", env: "rural" },
    { text: "Přišla kontrola z hygieny, nemůžu odejít z hospody", emoji: "\uD83D\uDD2C", timing: "match_day" },
    { text: "Vyhrál jsem v tombole prase a musím ho odvézt domů", emoji: "\uD83D\uDC16", timing: "match_day", env: "rural" },
    { text: "Našel jsem v garáži ježka a čekám na záchranku pro zvířata", emoji: "\uD83E\uDD94", timing: "match_day", env: "rural" },
    { text: "Soused topí listím a mně smrdí prádlo na šňůře, musím hlídat", emoji: "\uD83C\uDF42", timing: "match_day", env: "rural" },
    { text: "Dostal jsem pokutu za parkování a musím to jít řešit", emoji: "\uD83D\uDE94", timing: "match_day" },
    { text: "Tchyně mi vaří svíčkovou, to se neodmítá", emoji: "\uD83C\uDF5B", timing: "day_before" },
    { text: "Musím posekat sousedovic zahradu, prý jinak nepohlídá psa", emoji: "\uD83C\uDF3F", timing: "match_day", env: "rural" },
    { text: "Spadla mi včelí budka a musím řešit roj", emoji: "\uD83D\uDC1D", timing: "match_day", env: "rural" },
    { text: "Udělal jsem si zkoušku na rybářský lístek a musím to oslavit", emoji: "\uD83D\uDC1F", timing: "match_day", env: "rural" },
    { text: "Zablokoval mi někdo výjezd z dvorku, čekám na odtahovou", emoji: "\uD83D\uDE98", timing: "match_day" },
    { text: "Právě jsem zjistil, že mi teče střecha. Přesně teď. Přesně dneska", emoji: "\uD83C\uDF27", timing: "match_day" },
    { text: "Jdu na sraz ročníku, víme se dvacet let neviděli", emoji: "\uD83C\uDF7B", timing: "day_before" },
    { text: "Musím odchytit divočáka co mi rozryl zahradu", emoji: "\uD83D\uDC17", timing: "match_day", env: "rural" },
    { text: "Krtek mi zničil záhon, chci ho chytit dřív než se vrátí", emoji: "\uD83D\uDC11", timing: "match_day", env: "rural" },
    { text: "Srna skočila do sklepa, čekám na myslivce", emoji: "\uD83E\uDD8C", timing: "match_day", env: "rural" },
    { text: "Koza porodila v noci, musím hlídat malý", emoji: "\uD83D\uDC10", timing: "match_day", env: "rural" },
    { text: "Nalezl jsem hnízdo sršňů u kůlny, volám hasiče", emoji: "\uD83D\uDC1D", timing: "match_day", env: "rural" },
    { text: "Děda chce pomoct postavit králíkárnu, nemůžu ho nechat", emoji: "\uD83D\uDC30", timing: "day_before", env: "rural" },
    { text: "Kmotr slaví u potoka, už zařízená večeře", emoji: "\uD83C\uDF70", timing: "match_day", env: "rural" },
    { text: "Musím vyvézt hnůj, když je sucho. Zítra prší", emoji: "\uD83D\uDE9C", timing: "match_day", env: "rural" },
    { text: "Mám zasedání hasičů — volby nového velitele", emoji: "\uD83D\uDE92", timing: "day_before", env: "rural" },
    { text: "Zabíjel jsem ráno kance, teď je kuchyně plná masa", emoji: "\uD83D\uDD2A", timing: "match_day", env: "rural" },
    { text: "Tradiční průvod masopustu v sousední vesnici, slíbil jsem", emoji: "\uD83C\uDFAD", timing: "day_before", env: "rural" },
    { text: "Chtěl jsem sekat trávu, spadl mi řetěz z motorovky na nohu", emoji: "\uD83E\uDE9A", timing: "match_day", env: "rural" },
    { text: "Sousedovic slepice přelezly plot, chytám je v naší zahradě", emoji: "\uD83D\uDC14", timing: "match_day", env: "rural" },
    { text: "Spadl nám kaštan na plot, musím to spravit než přijde vítr", emoji: "\uD83C\uDF30", timing: "match_day", env: "rural" },
    { text: "Musím odvézt pivo na pouť, slíbil jsem starostovi", emoji: "\uD83C\uDF7B", timing: "day_before", env: "rural" },
    { text: "Pes utekl do lesa za srnou, honím ho celé ráno", emoji: "\uD83D\uDC15", timing: "match_day", env: "rural" },
    // Pražské / městské
    { text: "Turisti mi zablokovali vchod, nedostal jsem se z domu", emoji: "\uD83D\uDCF7", timing: "match_day", env: "urban" },
    { text: "Demonstrace na Václaváku, nedostal jsem se přes kordon", emoji: "\uD83D\uDCE2", timing: "match_day", env: "urban" },
    { text: "Soused pouští techno od rána, nemohl jsem spát", emoji: "\uD83C\uDFB6", timing: "match_day", env: "urban" },
    { text: "Ztratil jsem Lítačku a bez ní nikam nejedu", emoji: "\uD83D\uDCB3", timing: "match_day", env: "urban" },
    { text: "Spadl jsem do výkopu u metra D", emoji: "\uD83D\uDEA7", timing: "match_day", env: "urban" },
    { text: "Holubi mi posrali dres na balkóně", emoji: "\uD83D\uDD4A", timing: "match_day", env: "urban" },
    { text: "Zabloudil jsem v Holešovickém OC, nenašel jsem východ", emoji: "\uD83D\uDED2", timing: "match_day", env: "urban" },
    { text: "Food festival na náplavce, nedostal jsem se přes davy", emoji: "\uD83C\uDF54", timing: "match_day", env: "urban" },
    { text: "Klíče spadly do šachty od metra", emoji: "\uD83D\uDD11", timing: "match_day", env: "urban" },
    { text: "Pražský městský soud — svědčím proti sousedovi", emoji: "\u2696", timing: "day_before", env: "urban" },
    { text: "Stěhuju se z Žižkova na Vinohrady, nemám čas", emoji: "\uD83D\uDCE6", timing: "day_before", env: "urban" },
    { text: "Sousedka mi zalila byt, řeším pojistku", emoji: "\uD83D\uDCA7", timing: "match_day", env: "urban" },
    { text: "Bytová schůze, musím být jinak mi schválí kokotiny", emoji: "\uD83C\uDFE2", timing: "day_before", env: "urban" },
    { text: "Koloběžka Lime mě vyhodila na Karlově mostě, hledám pomoc", emoji: "\uD83D\uDEF4", timing: "match_day", env: "urban" },
    { text: "Letenská brigáda na úklidu parku, přihlásil jsem se", emoji: "\uD83C\uDF33", timing: "day_before", env: "urban" },
    { text: "Galerijní noc, slíbil jsem Evě že ji doprovodím", emoji: "\uD83C\uDFA8", timing: "day_before", env: "urban" },
    { text: "Čekal jsem 40 minut na kurýra Rohlíku a pořád nic", emoji: "\uD83D\uDEB2", timing: "match_day", env: "urban" },
    { text: "Zavřeli nám kavárnu, kde jsem měl meeting — hledám jinou", emoji: "\u2615", timing: "match_day", env: "urban" },
    { text: "Sraz s klukama na pivo do Prušnaru, to se nesmí vynechat", emoji: "\uD83C\uDF7A", timing: "day_before", env: "urban" },
    { text: "Objednal jsem si dovoz IKEA, dorazí prý kdykoliv mezi 8-18", emoji: "\uD83D\uDCE6", timing: "match_day", env: "urban" },
    { text: "Mám v plánu chodit na trh, musím stihnout než prodají řepu", emoji: "\uD83E\uDD55", timing: "match_day", env: "urban" },
    { text: "Koncert v Rock Café, lístky jsem koupil před měsícem", emoji: "\uD83C\uDFB8", timing: "day_before", env: "urban" },
    { text: "Blázni v Krymské demonstrují proti něčemu, nedostanu se přes", emoji: "\uD83D\uDCE2", timing: "match_day", env: "urban" },
    // Nové vesnické absurdní
    { text: "Dědovi se zasekla protéza v zámku, musím k zámečníkovi", emoji: "\uD83E\uDDB7", timing: "match_day", env: "rural" },
    { text: "Seno mokne venku, musím naházet do stodoly než začne lejt", emoji: "\uD83C\uDF3E", timing: "match_day", env: "rural" },
    { text: "Tchán mě zavolal hrát Karty u piva a já nemám sílu odmítnout", emoji: "\uD83C\uDCCF", timing: "match_day", env: "rural" },
    { text: "Pálenka se destiluje, musím hlídat teplotu v kotli", emoji: "\uD83C\uDF77", timing: "match_day", env: "rural" },
    { text: "Vrátili se Jehovové, tentokrát to chci doposlouchat", emoji: "\uD83D\uDEAA", timing: "match_day", env: "rural" },
    { text: "Dovezli štěrk a musím ho rozházet než přijede kontrola", emoji: "\uD83D\uDE9A", timing: "match_day", env: "rural" },
    { text: "Babička upekla buchty a volala že je musím sníst teď teplý", emoji: "\uD83C\uDF5E", timing: "match_day", env: "rural" },
    { text: "Koupil jsem kombajn v bazoši, musím ho vyzvednout do večera", emoji: "\uD83D\uDE9C", timing: "match_day", env: "rural" },
    { text: "Strejda se vrátil z Rakouska a nesu mu pálenku na oslavu", emoji: "\uD83C\uDF82", timing: "day_before", env: "rural" },
    { text: "Ztratil jsem se v kukuřičném poli cestou ze schůze hasičů", emoji: "\uD83C\uDF3D", timing: "match_day", env: "rural" },
    { text: "Kohout mi ráno napadl souseda, řeším to s policajtama", emoji: "\uD83D\uDC13", timing: "match_day", env: "rural" },
    { text: "Přišlo pozvání na soutěž v pojídání knedlíků, dal jsem čestné slovo", emoji: "\uD83E\uDD5F", timing: "day_before", env: "rural" },
    { text: "Zasekla se mi motorka mezi ploty, stojí tam s kolečkem nad příkopem", emoji: "\uD83C\uDFCD", timing: "match_day", env: "rural" },
    { text: "Myslivci volají že je kanec u školky, nemůžu nechat malý", emoji: "\uD83D\uDC17", timing: "match_day", env: "rural" },
    { text: "V pivním stanu slaví obec, starosta říkal že je povinná účast", emoji: "\uD83C\uDF7B", timing: "day_before", env: "rural" },
    { text: "Dcera má hon na drába na školní zahradě, jsem porotce", emoji: "\uD83E\uDD50", timing: "day_before", env: "rural" },
    { text: "Spadl mi komín při vichřici, hasiči ho oplotili", emoji: "\uD83C\uDFE0", timing: "match_day", env: "rural" },
    { text: "Soused půjčil sekačku a dneska je jediný den kdy ji můžu vrátit", emoji: "\uD83E\uDEB4", timing: "match_day", env: "rural" },
    { text: "Pes mi sebral TV ovladač a hlídá ho jako kost", emoji: "\uD83D\uDC15", timing: "match_day" },
    { text: "Zatopil jsem pod kamny a nemůžu nechat oheň bez dozoru", emoji: "\uD83D\uDD25", timing: "match_day", env: "rural" },
    { text: "Vyhrál jsem v Sportce, musím jít reklamovat tiket", emoji: "\uD83C\uDFB0", timing: "match_day" },
    { text: "Přijela cirkusová karavana a kůň mi stojí na zahradě", emoji: "\uD83C\uDFAA", timing: "match_day", env: "rural" },
    { text: "Slíbil jsem soused že mu pomůžu s moštováním, už má nachystaný stroj", emoji: "\uD83C\uDF4E", timing: "day_before", env: "rural" },
    // Nové pražské/urbánní
    { text: "Uber čeká dole, ale číslo ulice je špatně a řidič zlobí", emoji: "\uD83D\uDE95", timing: "match_day", env: "urban" },
    { text: "Tinder rande, tři týdny psal jsem tam srdíčka, nemůžu zrušit", emoji: "\uD83D\uDC95", timing: "day_before", env: "urban" },
    { text: "Boulder na Smíchově má otevírací event, uvidím tam známé", emoji: "\uD83E\uDDD7", timing: "day_before", env: "urban" },
    { text: "Startup pitch v Node5, je to finální kolo", emoji: "\uD83D\uDCBB", timing: "match_day", env: "urban" },
    { text: "Airbnb hosté nemůžou najít klíče ze schránky, čekám na ně", emoji: "\uD83C\uDFE0", timing: "match_day", env: "urban" },
    { text: "Farmářské trhy na Kubáni, musím stihnout kozí sýr", emoji: "\uD83E\uDDC0", timing: "match_day", env: "urban" },
    { text: "Promo akce Wolt, slevový kód vyprší za 2 hodiny", emoji: "\uD83D\uDEF5", timing: "match_day", env: "urban" },
    { text: "Escape room na Žižkově, tým na mě čeká, už zaplatili", emoji: "\uD83D\uDD11", timing: "day_before", env: "urban" },
    { text: "Holčina z Bumblu chce na brunch, tohle nezkazím", emoji: "\uD83C\uDF73", timing: "match_day", env: "urban" },
    { text: "Rohlík doručuje ledničku, musel jsem být doma celé ráno", emoji: "\uD83D\uDCE6", timing: "match_day", env: "urban" },
    { text: "Blokují nám domovní kanál, stojí tam fekálňák", emoji: "\uD83D\uDEBB", timing: "match_day", env: "urban" },
    { text: "Vernisáž mé bývalky, slíbil jsem že nepřijdu, ale musím vidět kdo přijde", emoji: "\uD83C\uDFA8", timing: "day_before", env: "urban" },
    // Prachaticko — lokální hity
    { text: "V Penny ve Vimperku byla fronta", emoji: "\uD83D\uDED2", timing: "match_day" },
    { text: "Ve Zlešicích zase měřili, mám to za 5000", emoji: "\uD83D\uDE94", timing: "match_day" },
    { text: "Seknul jsem se v boudě ve Spůli", emoji: "\uD83E\uDE93", timing: "match_day", env: "rural" },
    { text: "Usnul jsem ve Votáčce ve Čkyni", emoji: "\uD83C\uDF7A", timing: "match_day", env: "rural" },
    { text: "Čistil jsem ve Spůli rybník", emoji: "\uD83C\uDFA3", timing: "day_before", env: "rural" },
    { text: "Zmlátili mě ve Vimperku cikáni", emoji: "\uD83E\uDD15", timing: "match_day" },
    { text: "Čekal jsem na Cmunďáka, ale nepřijel", emoji: "\uD83D\uDEAD", timing: "match_day" },
    // Prachaticko / Šumava — rozšíření
    { text: "Na Churáňově konečně napadlo, beru běžky a mizím na Zadov", emoji: "\uD83C\uDFBF", timing: "match_day", env: "rural" },
    { text: "Třešně ve Lhenicích přezrály, musím česat než to oklovou ptáci", emoji: "\uD83C\uDF52", timing: "match_day", env: "rural" },
    { text: "Jelen mi skočil pod auto u Zbytin, řeším to s pojišťovnou", emoji: "\uD83E\uDD8C", timing: "match_day", env: "rural" },
    { text: "Na Boubíně taková mlha, že nevidím na kapotu", emoji: "\uD83C\uDF2B", timing: "match_day", env: "rural" },
    { text: "Jedu přes Strážný do Pasova nakoupit, na hranici stojí kolona", emoji: "\uD83D\uDED2", timing: "day_before", env: "rural" },
    { text: "Vlak na Kubovu Huť zase nejel, čekám na náhradní autobus", emoji: "\uD83D\uDE86", timing: "match_day", env: "rural" },
    { text: "Dělám u stánku na Slavnostech Zlaté stezky v Prachaticích", emoji: "\uD83C\uDFAA", timing: "day_before" },
    { text: "Rys mi prošel přes zahradu v Borových Ladech, volám správu parku", emoji: "\uD83D\uDC08", timing: "match_day", env: "rural" },
    { text: "V Husinci vypustili přehradu, jdu si pro candáty než je posbírá soused", emoji: "\uD83C\uDFA3", timing: "match_day", env: "rural" },
    { text: "Na Kvildě bylo ráno minus dvacet, auto ani neškytlo", emoji: "\uD83E\uDD76", timing: "match_day", env: "rural" },
    { text: "Sraz hasičů ve Vacově, soutěž v požárním útoku, jsem v družstvu", emoji: "\uD83D\uDE92", timing: "day_before", env: "rural" },
    { text: "Jedu na pouť do Netolic, děda by mě zaškrtil kdybych nepřišel", emoji: "\uD83C\uDFA1", timing: "day_before", env: "rural" },
    { text: "Ženská chce focení na Kratochvíli, rezervovali jsme to měsíc dopředu", emoji: "\uD83C\uDFF0", timing: "day_before", env: "rural" },
    { text: "Spadl strom přes silnici za Zbytinama, nikdo tudy neprojede", emoji: "\uD83C\uDF32", timing: "match_day", env: "rural" },
    { text: "Ve Volarech je pietní akt k pochodu smrti, slíbil jsem věnec", emoji: "\uD83D\uDD6F", timing: "day_before", env: "rural" },
    { text: "Vyrazili jsme na borůvky k Boubínskýmu jezírku a ztratili se", emoji: "\uD83E\uDED0", timing: "match_day", env: "rural" },
    { text: "Soused ze Zdíkova mi veze dřevo, ale jen dneska má volnou Avii", emoji: "\uD83D\uDE9B", timing: "match_day", env: "rural" },
    { text: "Tetřev hnízdí, NP zavřel cestu přes Stožec a já tudy musím", emoji: "\uD83D\uDC26", timing: "match_day", env: "rural" },
    { text: "Na Stachách je traktoriáda, přihlásil jsem svýho Zetora", emoji: "\uD83D\uDE9C", timing: "day_before", env: "rural" },
    { text: "Šel jsem na houby pod Boubín a narazil na stádo divočáků", emoji: "\uD83D\uDC17", timing: "match_day", env: "rural" },
    { text: "Klíště z Boubína, radši zajedu k doktorovi do Prachatic", emoji: "\uD83E\uDEB2", timing: "match_day", env: "rural" },
    { text: "Pasou se mi krávy až u Lažiště, naháním je celý ráno", emoji: "\uD83D\uDC04", timing: "match_day", env: "rural" },
    { text: "Husinecká přehrada zamrzla, jdu zkusit led než roztaje", emoji: "⛸", timing: "match_day", env: "rural" },
    { text: "Na Libín vylezli turisti, u rozhledny se nedá zaparkovat", emoji: "\uD83D\uDDFC", timing: "match_day", env: "rural" },
    { text: "Soused z Volar mě prosil pomoct s roubenkou, jen dneska má majstra", emoji: "\uD83C\uDFDA", timing: "day_before", env: "rural" },
    { text: "Lenorská sklárna má den otevřených dveří, dcera tam chce na ukázku", emoji: "\uD83C\uDFED", timing: "day_before", env: "rural" },
    { text: "Sjížděli jsme Vltavu od Soumarskýho mostu a vítr nás otočil", emoji: "\uD83D\uDEF6", timing: "match_day", env: "rural" },
    { text: "Na Chalupský slati u Kvildy se ztratil turista, jdu pomáhat hledat", emoji: "\uD83E\uDD7E", timing: "match_day", env: "rural" },
    { text: "Perlorodky v Blanici kontrolujou ekologové, hlídám brod u Strunkovic", emoji: "\uD83E\uDDAA", timing: "match_day", env: "rural" },
    { text: "Schwarzenberským kanálem zase plavili dříví, vzal jsem děti se kouknout", emoji: "\uD83E\uDEB5", timing: "day_before", env: "rural" },
    { text: "Munickej rybník v Netolicích vypouštějí, jdu na výlov", emoji: "\uD83D\uDC1F", timing: "match_day", env: "rural" },
    { text: "V Záblatí mají hon, jsem honec, slíbil jsem myslivcům", emoji: "\uD83E\uDD8A", timing: "day_before", env: "rural" },
    { text: "Husovy slavnosti v Husinci, dělám tam pořadatele", emoji: "\uD83D\uDCDC", timing: "day_before", env: "rural" },
    { text: "V Bavorově je posvícení, tchýně peče a čeká celá rodina", emoji: "\uD83E\uDD67", timing: "day_before", env: "rural" },
    { text: "Ve Vlachově Březí rozkopali náměstí, autem se ven nedostanu", emoji: "\uD83D\uDEA7", timing: "match_day", env: "rural" },
    { text: "Na Zadově je závod psích spřežení, pomáhám u trati", emoji: "\uD83D\uDEF7", timing: "day_before", env: "rural" },
    { text: "Ze Stožecké kaple jde procesí, slíbil jsem nést korouhev", emoji: "\u26EA", timing: "day_before", env: "rural" },
    { text: "Med ze šumavskejch včel se točí, nemůžu nechat medomet bez dozoru", emoji: "\uD83C\uDF6F", timing: "match_day", env: "rural" },
    // Vimperk
    { text: "Na vimperským zámku natáčeli film, zavřeli celej kopec", emoji: "\uD83C\uDFAC", timing: "match_day", env: "rural" },
    { text: "Ve Vimperku berou v tiskárně starej papír, vezu plnej vozík", emoji: "\uD83D\uDCF0", timing: "match_day", env: "rural" },
    { text: "Ve Vimperku zavřeli most přes Volyňku, objížďka přes celý město", emoji: "\uD83D\uDEA7", timing: "match_day", env: "rural" },
    { text: "Správa parku ve Vimperku mě volá značit cesty, jsem dobrovolník", emoji: "\uD83E\uDEA7", timing: "day_before", env: "rural" },
    // Čkyně
    { text: "Ve Čkyni je pouť, kolotoče stojí rovnou u hřiště", emoji: "\uD83C\uDFA0", timing: "day_before", env: "rural" },
    { text: "Na čkyňským koupališti vypouštějí vodu, pomáhám s rybama", emoji: "\uD83C\uDFCA", timing: "match_day", env: "rural" },
    { text: "V čkyňský synagoze je výstava, slíbil jsem dělat průvodce", emoji: "\uD83D\uDD4D", timing: "day_before", env: "rural" },
    // Spůle
    { text: "Ve Spůli praskla hráz u rybníka, naháníme kapry po louce", emoji: "\uD83C\uDF0A", timing: "match_day", env: "rural" },
    { text: "Ve Spůli mi zapadl traktor do bahna u boudy, čekám na souseda", emoji: "\uD83D\uDE9C", timing: "match_day", env: "rural" },
    { text: "Sousedovi ze Spůle ujely ovce, honíme je přes celou ves", emoji: "\uD83D\uDC11", timing: "match_day", env: "rural" },
    // Hradčany
    { text: "Na Mářskej vrch lezou turisti a parkujou mi na dvoře v Hradčanech", emoji: "\uD83E\uDDED", timing: "match_day", env: "rural" },
    { text: "V Hradčanech je hasičská soutěž, dělám časoměřiče", emoji: "\u23F1", timing: "day_before", env: "rural" },
    { text: "Šel jsem z Mářského vrchu zkratkou a zabloudil v lese nad Hradčany", emoji: "\uD83C\uDF32", timing: "match_day", env: "rural" },
];
// ═══════════════════════════════════════════════
// KOCOVINA
// ═══════════════════════════════════════════════
var HANGOVER_EXCUSES = [
    { text: "Sorry trenere, není mi dobře... včera to bylo silný", emoji: "\uD83C\uDF7A" },
    { text: "Nemůžuuu... hlava mi třeští. Příště určitě", emoji: "\uD83D\uDE35" },
    { text: "Neni mi dobře, asi jsem něco špatného snědl (nepil)", emoji: "\uD83E\uDD22" },
    { text: "Včera jsme to s klukama trochu přetáhli... omlouvám se", emoji: "\uD83E\uDD43" },
    { text: "Trenere omlouvám se, mám žaludeční chřipku (pivo)", emoji: "\uD83E\uDD12" },
    { text: "Dneska to fakt nepůjde. Včera byla zabijačka", emoji: "\uD83C\uDF7B" },
    { text: "Ještě se mi točí hlava. Snad do soboty budu v pohodě", emoji: "\uD83D\uDCAB" },
    { text: "Trenere já vím že jsem slíbil... ale opravdu nemůžu", emoji: "\uD83D\uDE2C" },
    { text: "Přísahám že už nikdy. Ale dneska fakt ne", emoji: "\uD83D\uDE4F" },
    { text: "Vím že to vypadá blbě, ale prej jsem včera zpíval hymnu na náměstí", emoji: "\uD83C\uDFA4" },
    { text: "Nevím jak jsem se dostal domů, natož na hřiště", emoji: "\uD83D\uDE35\u200D\uD83D\uDCAB" },
    { text: "Kluci mě včera přemluvili na jednu. Jedna se změnila v devět", emoji: "\uD83C\uDF7A" },
    { text: "Bráchovi byl rozlučka se svobodou, přežiju to za dva dny", emoji: "\uD83C\uDF7E" },
    { text: "Nacpali jsme se do hospody do tří, sám nevím jak", emoji: "\uD83D\uDD50" },
    { text: "Strejda slavil padesát, nejde jít domů brzo", emoji: "\uD83C\uDF89" },
    { text: "Dal jsem si jen jedno po práci. A pak ještě jedno. A pak...", emoji: "\uD83E\uDD64" },
    { text: "Probudil jsem se v cizím bytě na Smíchově, jedu autobusem zpátky", emoji: "\uD83D\uDE32" },
    { text: "Včera byla oslava konce brigády. Pivní matematika selhala", emoji: "\uD83C\uDF7A" },
    { text: "Mám laktobacily — ne ty dobré, ty z piva", emoji: "\uD83E\uDDA0" },
    { text: "Dneska jsem si řekl: dám si hrnek a pak trénink. Hrnek vyhrál", emoji: "\u2615" },
    { text: "Měl jsem poslední narozeniny třicítka. Kocovina trvá dodnes", emoji: "\uD83C\uDF82" },
    { text: "Ven si dneska ani nevyjdu, natož do kopaček", emoji: "\uD83E\uDD27" },
    { text: "Včera jsem řekl: já dneska nepiju. Lhal jsem sám sobě", emoji: "\uD83E\uDD37" },
    { text: "Trenere dám si jen černý čaj a budu ležet. Omlouvám se", emoji: "\uD83C\uDF75" },
    // Nové kocovinové
    { text: "Vyhrál jsem včera flašku Metaxy v tombole a zkoušel každou skleničku", emoji: "\uD83E\uDD43" },
    { text: "Hospoda nás nechtěla pustit, zavírali až v 6 ráno", emoji: "\uD83D\uDD5C" },
    { text: "Zkoušeli jsme vyšší procenta než vodka, vyhrála absinth a já", emoji: "\uD83D\uDC9A" },
    { text: "Včera byl rockový večer v Rock café, hrdlo mi řve víc než já", emoji: "\uD83C\uDFB8" },
    { text: "Dědek nališkal do šlivovice cukr a bylo to podezřele dobrý", emoji: "\uD83C\uDF77" },
    { text: "Sousedovi jsem musel říct pravdu, zapomněl jsem filtr. Celou noc mi odpouštěl", emoji: "\uD83E\uDD10" },
    { text: "Dneska rozhodně ne. Dal jsem si naposledy jen jedno a bylo jich 14", emoji: "\uD83C\uDF71" },
    { text: "Myslel jsem že brčály jsou nealko. Nebyly", emoji: "\uD83C\uDF7A" },
    { text: "Probudil jsem se v Plzni a vůbec nevím jak", emoji: "\uD83D\uDE46" },
    { text: "Oslava povýšení se zvrhla, v práci zítra koukám jak sejra", emoji: "\uD83C\uDF89" },
    // Prachaticko / Šumava
    { text: "Vimperská pouť mě složila, hlava jak škopek", emoji: "\uD83C\uDFA1", env: "rural" },
    { text: "Lhenickej košt slivovice, přežiju to tak do středy", emoji: "\uD83C\uDF51", env: "rural" },
    { text: "Hasičskej bál ve Vacově, pil jsem za celej sbor", emoji: "\uD83D\uDE92", env: "rural" },
    { text: "Po zabijačce ve Zdíkově došla nálada dřív než slivovice", emoji: "\uD83E\uDD43", env: "rural" },
    { text: "Tancovačka ve Čkyni skončila ráno, dneska mě nikam nedostanete", emoji: "\uD83E\uDE97", env: "rural" },
    { text: "Degustace ve vimperským pivovaru se protáhla do rána", emoji: "\uD83C\uDF7A", env: "rural" },
    { text: "Sklářská slavnost v Lenoře, pil jsem s mistrama do rána", emoji: "\uD83C\uDF77", env: "rural" },
    { text: "Výlov v Netolicích, k tomu rybí polívka a slivovice, ležím", emoji: "\uD83C\uDF72", env: "rural" },
    { text: "Masopust ve Vlachově Březí, průvod skončil v hospodě", emoji: "\uD83C\uDFAD", env: "rural" },
    { text: "Myslivecká poslední leč v Záblatí, zvěřina a štamprlata", emoji: "\uD83E\uDD8C", env: "rural" },
    { text: "Posvícení v Bavorově, koláče zapíjený slivovicí, dneska ne", emoji: "\uD83E\uDD67", env: "rural" },
    { text: "Vimperskej pivovar stáčel várku, ochutnávali jsme každou sudou", emoji: "\uD83C\uDF7A", env: "rural" },
    { text: "Pouť ve Čkyni, na Votáčce zavírali až k ránu", emoji: "\uD83C\uDFA0", env: "rural" },
    { text: "Hasičskej táborák v Hradčanech, dopadlo to jak vždycky", emoji: "\uD83D\uDD25", env: "rural" },
    { text: "Zabíjačka ve Spůli, do slivovice nám dali ještě domácí likér", emoji: "\uD83E\uDD43", env: "rural" },
    // Praha / město
    { text: "Bar crawl po Žižkově, obešli jsme sedm hospod a osmou už nepamatuju", emoji: "\uD83C\uDF7A", env: "urban" },
    { text: "Degustace craftů v pivnici na Vinohradech, dvanáct piv, dvanáct chutí", emoji: "\uD83C\uDF7A", env: "urban" },
    { text: "Náplavka do rána, každej stánek jinej drink a já všechny", emoji: "\uD83C\uDF79", env: "urban" },
    { text: "Rozlučka v koktejlovým baru v centru, barman to se mnou přehnal", emoji: "\uD83C\uDF78", env: "urban" },
    { text: "Afterpárty v klubu na Smíchově, domů jsem šel pěšky přes celý město", emoji: "\uD83D\uDD7A", env: "urban" },
    { text: "Firemní večírek v rooftop baru, otevřenej bar byla chyba", emoji: "\uD83C\uDFD9", env: "urban" },
    { text: "Ochutnávka v minipivovaru v Karlíně, každou várku jsme museli zkontrolovat", emoji: "\uD83C\uDF7A", env: "urban" },
    { text: "Techno párty do sedmi ráno, uši mi zvoní a hlava taky", emoji: "\uD83C\uDFA7", env: "urban" },
    { text: "Vinnej festival na Hradě, bílý, červený, růžový a ráno zelený", emoji: "\uD83C\uDF77", env: "urban" },
    { text: "Sešli jsme se na jedno u Anděla, skončili jsme v pěti podnicích", emoji: "\uD83C\uDF7A", env: "urban" },
    { text: "Silvestr v červenci? Ne, jen normální čtvrtek v Praze", emoji: "\uD83C\uDF89", env: "urban" },
];
// ═══════════════════════════════════════════════
// ZDRAVOTNÍ
// ═══════════════════════════════════════════════
var HEALTH_EXCUSES = [
    { text: "Koleno mě zase kleplo, asi ne", emoji: "\uD83E\uDDB5" },
    { text: "Natáhl jsem si sval na tréninku, bolí to jak čert", emoji: "\uD83D\uDCAA" },
    { text: "Záda úplně ztuhlý, nemůžu se ani otočit", emoji: "\uD83D\uDE15" },
    { text: "Kotník mi otekl, asi jsem si ho podvrtl v práci", emoji: "\uD83E\uDD7E" },
    { text: "Mám ten zánět šlach zas, doktor říkal klid", emoji: "\uD83E\uDE7A" },
    { text: "Píchlo mě v třísle, nechci riskovat", emoji: "\uD83E\uDD15" },
    { text: "Lýtko ztuhlý od pondělka, asi jsem to přetáhl", emoji: "\uD83E\uDDB6" },
    { text: "Rameno mi vyskočilo, musím k ortopedovi", emoji: "\uD83D\uDCAA" },
    { text: "Mám migrénu, nevidím na jedno oko", emoji: "\uD83D\uDE35" },
    { text: "Alergická reakce, jsem celej oteklej", emoji: "\uD83E\uDD22" },
    { text: "Doktor mi zakázal sport na týden, něco s tlakem", emoji: "\uD83E\uDE7A" },
    { text: "Mám v kříži takovou bolest, že nemůžu ani sedět", emoji: "\uD83D\uDE23" },
    { text: "Bolí mě hlava od včera, bral jsem prášky a furt nic", emoji: "\uD83E\uDD2F" },
    { text: "Udělala se mi puchýř na patě jako pětikoruna", emoji: "\uD83E\uDE79" },
    { text: "Achilovka mě bolí, nebudu to riskovat", emoji: "\uD83E\uDDB6" },
    { text: "Vyskočil mi herpes, nemůžu do kolektivu", emoji: "\uD83E\uDD8B" },
    { text: "Mám kašel, asi bronchitida. Nebudu nakazit kluky", emoji: "\uD83D\uDE37" },
    { text: "Zvrtl jsem si koleno na schodech, doufám že to bude dobrý", emoji: "\uD83E\uDDB5" },
    { text: "Rýma a bolení v krku, beru paralen a ležím", emoji: "\uD83E\uDD27" },
    { text: "Zvedla se mi teplota, rozhodně ne trénovat", emoji: "\uD83C\uDF21" },
    // Nové zdravotní
    { text: "Vyskočil mi malíček, nemůžu zašněrovat kopačky", emoji: "\uD83E\uDDB6" },
    { text: "Zapíchl jsem si zubní niť, mám natažený krk", emoji: "\uD83E\uDDB7" },
    { text: "Bolí mě v koutku kyčle, říká fyzioterapeut že to může být rok", emoji: "\uD83E\uDE7B" },
    { text: "Přetáhl jsem krk na polštáři, nemůžu otočit hlavou", emoji: "\uD83D\uDE34" },
    { text: "Pálí mě v žaludku od ranních brambůrek, asi to nemám od rána jíst", emoji: "\uD83E\uDD57" },
    { text: "Kleplo mě v uchu, doktor říkal nechodit na chlad", emoji: "\uD83D\uDC42" },
    { text: "Ptělo mě v oku celou noc, nemůžu na světlo", emoji: "\uD83D\uDC41" },
    { text: "Stuhla mi slintavka od zívání, nemůžu otevřít pusu", emoji: "\uD83D\uDE2E" },
    { text: "Otrávil jsem se vlastní guláškou, ženská říká to bylo nedovařený", emoji: "\uD83E\uDD27" },
    { text: "Zaseklo mi krční páteř když jsem kýchl", emoji: "\uD83E\uDD27" },
];
var COMMUTE_EXCUSES = [
    // Univerzální
    { text: "Auto se porouchalo cestou na zápas", emoji: "\uD83D\uDE97" },
    { text: "Nestihl jsem to, na silnici byla nehoda a stálo se", emoji: "\uD83D\uDEA7" },
    { text: "Zmeškal jsem autobus a další jede až za hodinu", emoji: "\uD83D\uDE8C" },
    { text: "Nemám odvoz, nikdo nejede mým směrem", emoji: "\uD83D\uDEB6" },
    { text: "Dneska to nestíhám, je to daleko a mám ještě směnu", emoji: "\u23F0" },
    { text: "Kolega co mě veze onemocněl, nemám jak se dostat", emoji: "\uD83E\uDD12" },
    // Vesnické
    { text: "Musím jet přes dvě vesnice a silnice je rozkopaná", emoji: "\uD83D\uDEA7", env: "rural" },
    // Prachaticko / Šumava
    { text: "Za Husincem mi skočil pod kola srnec, čekám na odtahovku", emoji: "\uD83E\uDD8C", env: "rural" },
    { text: "Mlha na Šumavě, jedu krokem, takhle to nestihnu", emoji: "\uD83C\uDF2B", env: "rural" },
    { text: "Vlak na Kubovu Huť nejel, náhradka má hodinu zpoždění", emoji: "\uD83D\uDE86", env: "rural" },
    { text: "Silnice z Vimperku zavřená, objížďka přes Zdíkov a Stachy", emoji: "\uD83D\uDEA7", env: "rural" },
    { text: "Na Strážném stojím v koloně z Německa, ani se nehne", emoji: "\uD83D\uDE97", env: "rural" },
    { text: "Na Kubově Huti zapadl autobus do závěje, čekáme na pluh", emoji: "\uD83D\uDE8C", env: "rural" },
    { text: "Na Zadově sníh, řetězy nemám a ten kopec prostě nevyjedu", emoji: "\u26C4", env: "rural" },
    { text: "U Soumarskýho mostu zavřeli silnici kvůli závodům", emoji: "\uD83D\uDEA7", env: "rural" },
    { text: "Stádo jelenů u Borových Lad přebíhá silnici, radši stojím", emoji: "\uD83E\uDD8C", env: "rural" },
    // Pražské / městské
    { text: "Nejela tramvaj, výluka na Palackého náměstí", emoji: "\uD83D\uDE8B", env: "urban" },
    { text: "Magistrála byla totálně ucpaná", emoji: "\uD83D\uDE97", env: "urban" },
    { text: "Metro stálo 20 minut, porucha na lince C", emoji: "\uD83D\uDE87", env: "urban" },
    { text: "Zavřeli Nuselák, objížďka přes půl Prahy", emoji: "\uD83D\uDEA7", env: "urban" },
    { text: "Autobus 135 nejel, čekal jsem na dalšího 40 minut", emoji: "\uD83D\uDE8C", env: "urban" },
    { text: "Parkování na Žižkově je peklo, objel jsem to třikrát", emoji: "\uD83D\uDE97", env: "urban" },
    { text: "Kolaps na Barrandovském mostě, stálo se hodinu", emoji: "\uD83D\uDEA7", env: "urban" },
    { text: "Výluka na trati, tramvaj nejede, NAD autobus nepřijel", emoji: "\uD83D\uDE8B", env: "urban" },
    { text: "D1 ucpaná od Chodova po Spořilov, stojím v koloně", emoji: "\uD83D\uDE97", env: "urban" },
    { text: "Koloběžka se mi rozbila u Anděla, pěšky to nestíhám", emoji: "\uD83D\uDEF4", env: "urban" },
    { text: "Lítačka mi nefunguje, turnikety mě nepustily", emoji: "\uD83D\uDCB3", env: "urban" },
];
/**
 * Generate absences for a squad before a match.
 *
 * Pravděpodobnost a typ závisí na charakteru hráče:
 * - discipline → celková šance (nízká = víc absencí)
 * - morale → osobní důvody (nízká = víc výmluv)
 * - patriotism → loajalita (nízký = snáz chybí)
 * - alcohol → kocovina
 * - age + stamina + injuryProneness → zdravotní
 * - occupation → profesní
 */
function generateAbsences(rng, squad, timing, district, friendlyMultiplier, commuteMod) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    if (timing === void 0) { timing = "any"; }
    if (commuteMod === void 0) { commuteMod = 0; }
    var absences = [];
    // District filter: Praha = urban, definovaný non-Praha = rural, undefined = jen univerzální výmluvy
    var isUrban = district === "Praha";
    var isRural = district !== undefined && district !== "Praha";
    var envFilter = function (e) {
        return !e.env || (isUrban && e.env === "urban") || (isRural && e.env === "rural");
    };
    var _loop_1 = function (i) {
        var p = squad[i];
        // Celková šance na absenci — cíl: průměrně 1-2 absence na tým (18 hráčů)
        // discipline 100 → ~3%, discipline 0 → ~15%
        // Průměrný hráč (disc=50, pat=50, morale=50) → ~7% → 1.3 absence na tým
        // Multiplier 0.95 kompenzuje navýšení absencí z hospody (zranění z bitek ~3-5 / sezónu) —
        // celkový počet zůstává přibližně stejný.
        var disciplineFactor = (100 - p.discipline) / 100;
        var patriotismFactor = (100 - p.patriotism) / 200;
        var moraleFactor = (100 - p.morale) / 300;
        var commuteFactor = Math.min(0.04, ((_a = p.commuteKm) !== null && _a !== void 0 ? _a : 0) * 0.002) * (1 - commuteMod);
        var baseChance = (0.02 + disciplineFactor * 0.10 + patriotismFactor * 0.03 + moraleFactor * 0.02 + commuteFactor) * 0.95;
        // Transfer truc — naštvaný hráč si hledá výmluvy častěji
        if (((_b = p.transferUnrest) !== null && _b !== void 0 ? _b : 0) >= 40)
            baseChance += 0.05;
        // ── Celebrity override — much higher absence rates ──
        if (p.isCelebrity) {
            var celebAbsenceRates = {
                legend: { S: 0.67, A: 0.60, B: 0.50, C: 0.40 },
                fallen_star: { _: 0.47 },
                glass_man: { _: 0.42 },
            };
            var typeRates = (_d = celebAbsenceRates[(_c = p.celebrityType) !== null && _c !== void 0 ? _c : "legend"]) !== null && _d !== void 0 ? _d : celebAbsenceRates.legend;
            baseChance = (_g = (_f = typeRates[(_e = p.celebrityTier) !== null && _e !== void 0 ? _e : "_"]) !== null && _f !== void 0 ? _f : typeRates._) !== null && _g !== void 0 ? _g : 0.45;
        }
        // Přátelák = dobrovolný zápas → výrazně více omluvenek (multiplier zvyšuje šanci)
        if (friendlyMultiplier && friendlyMultiplier > 1) {
            baseChance = Math.min(0.9, baseChance * friendlyMultiplier);
        }
        if (rng.random() > baseChance)
            return "continue"; // Přijde!
        // ── Celebrity-specific excuses ──
        if (p.isCelebrity) {
            var celebResult = generateCelebrityExcuse(rng, p, timing);
            if (celebResult) {
                absences.push(__assign({ playerIndex: i }, celebResult));
                return "continue";
            }
        }
        // Vyber kategorii výmluvy — váhy závisí na atributech
        var occupation = (0, occupations_1.getOccupationByName)(p.occupation);
        var weights = {
            // Profesní: vyšší když povolání má vysoký overtimeRisk
            professional: 0.25 + ((_h = occupation === null || occupation === void 0 ? void 0 : occupation.overtimeRisk) !== null && _h !== void 0 ? _h : 0.2) * 0.3,
            // Osobní: vyšší když nízká morálka nebo nízký patriotismus
            personal: 0.30 + (100 - p.morale) / 100 * 0.15,
            // Absurdní: vyšší když nízká disciplína + vyšší alkohol (nespolehlivý typy)
            absurd: 0.08 + (100 - p.discipline) / 100 * 0.08 + p.alcohol / 100 * 0.05,
            // Zdravotní: vyšší u starších, nízká kondice, vysoká injury proneness
            health: 0.05 + (p.age > 35 ? 0.08 : 0) + (p.age > 40 ? 0.08 : 0)
                + (100 - p.stamina) / 100 * 0.06 + p.injuryProneness / 100 * 0.05,
            // Kocovina: závisí hlavně na alcohol atributu
            hangover: p.alcohol > 60 ? 0.15 : p.alcohol > 40 ? 0.08 : 0.02,
            // Doprava: vyšší pro dojíždějící hráče (klubová dodávka tlumí)
            commute: (((_j = p.commuteKm) !== null && _j !== void 0 ? _j : 0) > 5 ? 0.10 + ((_k = p.commuteKm) !== null && _k !== void 0 ? _k : 0) * 0.005 : 0) * (1 - commuteMod),
        };
        var category = rng.weighted(weights);
        var smsText = void 0;
        var emoji = void 0;
        var excuseTiming = timing === "any" ? "day_before" : timing;
        switch (category) {
            case "professional": {
                var excuses = (_l = occupation === null || occupation === void 0 ? void 0 : occupation.excuses) !== null && _l !== void 0 ? _l : ["Musím do práce, nemůžu přijít"];
                smsText = rng.pick(excuses);
                emoji = "\uD83C\uDFD7";
                excuseTiming = "day_before";
                break;
            }
            case "personal": {
                var applicable = PERSONAL_EXCUSES.filter(function (e) { return p.age >= e.minAge && (timing === "any" || e.timing === timing); });
                var fallback = PERSONAL_EXCUSES.filter(function (e) { return p.age >= e.minAge; });
                var pick = rng.pick(applicable.length > 0 ? applicable : fallback.length > 0 ? fallback : PERSONAL_EXCUSES);
                smsText = pick.text;
                emoji = pick.emoji;
                excuseTiming = (_m = pick.timing) !== null && _m !== void 0 ? _m : "any";
                break;
            }
            case "absurd": {
                var applicable = ABSURD_EXCUSES.filter(function (e) { return (timing === "any" || e.timing === timing) && envFilter(e); });
                var pick = rng.pick(applicable.length > 0 ? applicable : ABSURD_EXCUSES.filter(envFilter));
                smsText = pick.text;
                emoji = pick.emoji;
                excuseTiming = (_o = pick.timing) !== null && _o !== void 0 ? _o : "match_day";
                break;
            }
            case "health": {
                var pick = rng.pick(HEALTH_EXCUSES);
                smsText = pick.text;
                emoji = pick.emoji;
                break;
            }
            case "hangover": {
                var hangoverFiltered = HANGOVER_EXCUSES.filter(envFilter);
                var pick = rng.pick(hangoverFiltered.length > 0 ? hangoverFiltered : HANGOVER_EXCUSES);
                smsText = pick.text;
                emoji = pick.emoji;
                break;
            }
            case "commute": {
                var commuteFiltered = COMMUTE_EXCUSES.filter(envFilter);
                var pick = rng.pick(commuteFiltered.length > 0 ? commuteFiltered : COMMUTE_EXCUSES);
                smsText = pick.text;
                emoji = pick.emoji;
                break;
            }
        }
        var CATEGORY_LABELS = {
            professional: "Práce", personal: "Osobní", absurd: "Jiné",
            health: "Zdraví", hangover: "Kocovina", commute: "Doprava",
        };
        // Skip if timing doesn't match (professional = day_before only, commute/hangover = match_day only)
        if (timing !== "any") {
            var categoryTiming = {
                professional: "day_before", health: "day_before", commute: "match_day", hangover: "match_day",
            };
            var catTiming = categoryTiming[category];
            if (catTiming && catTiming !== timing)
                return "continue";
        }
        absences.push({
            playerIndex: i,
            category: category,
            timing: excuseTiming,
            reason: (_p = CATEGORY_LABELS[category]) !== null && _p !== void 0 ? _p : category,
            emoji: emoji,
            smsText: smsText,
        });
    };
    for (var i = 0; i < squad.length; i++) {
        _loop_1(i);
    }
    return absences;
}
// ═══════════════════════════════════════════════
// CELEBRITY EXCUSE GENERATOR
// ═══════════════════════════════════════════════
var LEGEND_EXCUSES = [
    // VIP / Byznys
    "Natáčí reklamu pro regionální pekárnu", "Má autogramiádu v Kauflandu",
    "Má rozhovor pro Deník", "Fotí se pro charitativní kalendář",
    "Dnes podpisuje smlouvu se sponzorem", "Natáčí motivační video pro Instagram",
    "Jede na galavečer Fotbalové asociace", "Točí reklamu na energetický nápoj",
    "Jede na vernisáž — vystavuje vlastní obrazy", "Má schůzku s agentem kvůli knize",
    // Sport / Exhibice
    "Jede na exhibici starých gard", "Hraje charitativní zápas v Edenu",
    "Jede na golfový turnaj celebrit", "Má trenérský kurz (říká to 3. sezónu)",
    "Jede jako expert komentovat zápas na O2 TV", "Hraje futsalovou ligu v Praze",
    "Jede na kemp mládeže jako host", "Trénuje dětský tábor jako celebrita",
    // Zdraví / Fyzio
    "Fyzioterapeut mu zakázal hrát", "Má preventivní prohlídku u sportovního lékaře",
    "Bolí ho koleno (to samé co minulý měsíc)", "Říká že potřebuje regenerační den",
    "Cítí se unavený z včerejšího tréninku (který vynechal)",
    // Životní styl
    "Nestíhá — zůstal na afterparty", "Jede na dovolenou (uprostřed sezóny)",
    "Zaspání — včerejší degustace vín se protáhla", "Říká že auto je v servisu a nechce jet autobusem",
    "Má oběd s kamarádem z reprezentace", "Dnes slaví narozeniny — 'kluci to zvládnou beze mě'",
    "Jede na premiéru do kina", "Natáčí podcast o fotbale",
    "Má event v rooftop baru na Žižkově", "Má meeting s agentem v centru",
];
var FALLEN_STAR_EXCUSES = [
    "Včera to přehnal v hospodě a nemůže vstát", "Prý má 'chřipku' (cítit pivo na 3 metry)",
    "Volal že je na detoxu", "Nemůže — řídil opilý a vzali mu řidičák",
    "Spal u kamaráda a neví kde je", "Říká že je nemocný ale viděli ho v baru",
    "Měl prý alergickou reakci (na střízlivost)", "Leží doma — říká že má migrény",
    "Včera se pohádal s přítelkyní a spal v autě", "Prý ho bolí žaludek (diagnostika: 8 piv)",
    "Říká že mu doktor zakázal sportovat (doktor = barman)",
    "Má schůzku u psychologa (dobrý signál, ale zase chybí)",
    "Volal že zaspání — budík prý nefunguje (3. týden po sobě)",
    "Říká že ztratil kopačky (má je pod postelí)",
];
var GLASS_MAN_EXCUSES = [
    "Zase to koleno — nemůže ani chodit", "Natáhl si sval při rozcvičce",
    "Doktor říká minimálně týden pauza", "Bolí ho záda od včerejšího tréninku",
    "Má otok kotníku — led a klid", "Koleno se mu zase zamklo",
    "Cítí bodnutí v třísle, nechce riskovat", "Fyzioterapeut zakázal kontaktní sport na 3 dny",
    "Noha ho bolí víc než minule", "Preventivně odpočívá — bojí se že se to vrátí",
    "Ráno se probudil a nemohl ohnout koleno", "Říká že cítí něco v lýtku",
    "Má zánět šlach — chronický problém", "Páteř mu zablokovala po cestě autem",
];
var CELEBRITY_TRAINING_EXCUSES = [
    "Dnes má rehabilitaci u svého fyzioterapeuta", "Běhá si sám v parku, má vlastní program",
    "Řekl že tohle cvičení je pod jeho úroveň", "Volal že je na golfu",
    "Prý má natáčení pro ČT Sport", "Zaspání — včerejší charitativní akce se protáhla",
    "Jel na soustředění veteránů", "Má trénink s osobním koučem",
    "Doktor mu doporučil odpočinek", "Řekl: já tohle nepotřebuju, já to umím",
];
exports.CELEBRITY_TRAINING_EXCUSES = CELEBRITY_TRAINING_EXCUSES;
function generateCelebrityExcuse(rng, player, timing) {
    var _a;
    var type = (_a = player.celebrityType) !== null && _a !== void 0 ? _a : "legend";
    var excuses;
    var emoji;
    var category;
    switch (type) {
        case "legend":
            excuses = LEGEND_EXCUSES;
            emoji = "⭐";
            category = "personal";
            break;
        case "fallen_star":
            excuses = FALLEN_STAR_EXCUSES;
            emoji = "🍺";
            category = "hangover";
            break;
        case "glass_man":
            excuses = GLASS_MAN_EXCUSES;
            emoji = "🩹";
            category = "health";
            break;
        default:
            return null;
    }
    return {
        category: category,
        timing: timing === "any" ? (rng.random() < 0.5 ? "day_before" : "match_day") : timing,
        reason: type === "legend" ? "Celebrita" : type === "fallen_star" ? "Alkohol" : "Zranění",
        emoji: emoji,
        smsText: rng.pick(excuses),
    };
}
