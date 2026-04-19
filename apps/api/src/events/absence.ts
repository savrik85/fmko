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

import type { Rng } from "../generators/rng";
import { getOccupationByName, type Occupation } from "../generators/occupations";

export type AbsenceTiming = "day_before" | "match_day" | "any";

export interface AbsenceResult {
  playerIndex: number;
  category: "professional" | "personal" | "absurd" | "health" | "hangover" | "commute";
  timing: AbsenceTiming;
  reason: string;
  emoji: string;
  smsText: string;
}

interface PlayerForAbsence {
  firstName: string;
  lastName: string;
  age: number;
  occupation: string;
  discipline: number;    // 0-100
  patriotism: number;    // 0-100
  alcohol: number;       // 0-100
  temper: number;        // 0-100
  morale: number;        // 0-100
  stamina: number;       // 0-100
  injuryProneness: number; // 0-100
  commuteKm?: number;    // distance to ground — 0 = local
  isCelebrity?: boolean;
  celebrityType?: "legend" | "fallen_star" | "glass_man";
  celebrityTier?: "S" | "A" | "B" | "C";
}

// ═══════════════════════════════════════════════
// OSOBNÍ VÝMLUVY (univerzální, vážené dle atributů)
// ═══════════════════════════════════════════════

const PERSONAL_EXCUSES = [
  // Rodina — víte den předem
  { text: "Manželka mě nepustila, sorry", emoji: "\u{1F46B}", minAge: 25, timing: "day_before" as AbsenceTiming },
  { text: "Tchýně má narozeniny, musel jsem slíbit že přijdu", emoji: "\u{1F382}", minAge: 28, timing: "day_before" as AbsenceTiming },
  { text: "Malej je nemocnej, musím ho hlídat", emoji: "\u{1F476}", minAge: 24, timing: "day_before" as AbsenceTiming },
  { text: "Musím na rodičák do školky", emoji: "\u{1F3EB}", minAge: 25, timing: "day_before" as AbsenceTiming },
  { text: "Ženská mi dala ultimátum — buď fotbal nebo ona. Ještě přemýšlím", emoji: "\u{1F494}", minAge: 20, timing: "day_before" as AbsenceTiming },
  { text: "Dcera má vystoupení ve škole, slíbil jsem že přijdu", emoji: "\u{1F3AD}", minAge: 28, timing: "day_before" as AbsenceTiming },
  { text: "Rodinnej oběd u rodičů, nemůžu to zrušit", emoji: "\u{1F356}", minAge: 0, timing: "day_before" as AbsenceTiming },
  { text: "Slíbil jsem ženský že jedeme do IKEA, nemůžu to zrušit", emoji: "\u{1F6D2}", minAge: 22, timing: "day_before" as AbsenceTiming },
  { text: "Musím pomoct stěhovat kamarádovi, slíbil jsem to už třikrát", emoji: "\u{1F4E6}", minAge: 0, timing: "day_before" as AbsenceTiming },
  { text: "Bráchovi se narodilo dítě, jedu do porodnice", emoji: "\u{1F37C}", minAge: 22, timing: "day_before" as AbsenceTiming },
  { text: "Máma má narozeniny, musím být doma", emoji: "\u{1F382}", minAge: 18, timing: "day_before" as AbsenceTiming },
  { text: "Slíbil jsem že pohlídám dceru, ženská jede na hory s kámoškama", emoji: "\u{1F3D4}", minAge: 25, timing: "day_before" as AbsenceTiming },
  { text: "Syn má první přijímačky, chci ho podpořit", emoji: "\u{1F393}", minAge: 34, timing: "day_before" as AbsenceTiming },
  { text: "Musím odvézt babičku k doktorovi, nemá jak jinak", emoji: "\u{1F475}", minAge: 20, timing: "day_before" as AbsenceTiming },
  { text: "Jedeme na svatbu sestry, nemůžu to prostě odpustit", emoji: "\u{1F470}", minAge: 20, timing: "day_before" as AbsenceTiming },
  { text: "Máme pohřeb strejdy, musím být s rodinou", emoji: "\u{1F5A4}", minAge: 18, timing: "day_before" as AbsenceTiming },
  { text: "Musím s dětma do zoo, slíbil jsem to před měsícem", emoji: "\u{1F981}", minAge: 28, timing: "day_before" as AbsenceTiming },
  { text: "Jedeme do Německa nakoupit Lidl, vrátím se až večer", emoji: "\u{1F6D2}", minAge: 25, timing: "day_before" as AbsenceTiming },
  { text: "Přítelkyně má výročí s kamarádkami, musím ji odvézt", emoji: "\u{1F46F}", minAge: 20, timing: "day_before" as AbsenceTiming },
  { text: "Máme výročí vztahu, slíbil jsem nikam nejít", emoji: "\u{1F498}", minAge: 22, timing: "day_before" as AbsenceTiming },

  // Zdraví — víte den předem
  { text: "Bolí mě záda od včerejška, nemůžu se ohnout", emoji: "\u{1F915}", minAge: 30, timing: "day_before" as AbsenceTiming },
  { text: "Mám doktora, nemohl jsem to přeobjednat", emoji: "\u{1F3E5}", minAge: 0, timing: "day_before" as AbsenceTiming },
  { text: "Chytil jsem chřipku, nechci nakazit celej tým", emoji: "\u{1F912}", minAge: 0, timing: "day_before" as AbsenceTiming },
  { text: "Mám kontrolu u zubaře, nemůžu to zrušit", emoji: "\u{1F9B7}", minAge: 0, timing: "day_before" as AbsenceTiming },
  { text: "Naočkovali mě včera, necítím se dobře", emoji: "\u{1F489}", minAge: 0, timing: "day_before" as AbsenceTiming },

  // Logistika — v den zápasu
  { text: "Nemám odvoz, auto je v servisu od pátku", emoji: "\u{1F697}", minAge: 0, timing: "match_day" as AbsenceTiming },
  { text: "Ujel mi bus a další jede až za dvě hodiny", emoji: "\u{1F68C}", minAge: 0, timing: "match_day" as AbsenceTiming },

  // Zapomnětlivost — v den zápasu
  { text: "Zapomněl jsem, myslel jsem že hrajeme příští týden", emoji: "\u{1F937}", minAge: 0, timing: "match_day" as AbsenceTiming },
  { text: "Hele já se omlouvám ale fakt jsem si to nespojil", emoji: "\u{1F644}", minAge: 0, timing: "match_day" as AbsenceTiming },
  { text: "Já fakt nevěděl že dneska, myslel jsem že je volno", emoji: "\u{1F624}", minAge: 0, timing: "match_day" as AbsenceTiming },
  { text: "Spletl jsem si termín. Příště určitě dorazím", emoji: "\u{1F612}", minAge: 0, timing: "match_day" as AbsenceTiming },

  // Další rodina
  { text: "Malá má angínu, musím s ní k doktorovi", emoji: "\u{1F321}", minAge: 26, timing: "match_day" as AbsenceTiming },
  { text: "Tchán padl ze žebříku, jedeme do nemocnice", emoji: "\u{1F691}", minAge: 25, timing: "match_day" as AbsenceTiming },
  { text: "Manželka rodí! Ne teď, ale prý co kdyby", emoji: "\u{1F930}", minAge: 24, timing: "day_before" as AbsenceTiming },
  { text: "Syn má turnaj v šachách, slíbil jsem že přijdu", emoji: "\u265F", minAge: 30, timing: "day_before" as AbsenceTiming },
  { text: "Ženská jede s kamarádkama pryč, musím hlídat", emoji: "\u{1F476}", minAge: 25, timing: "day_before" as AbsenceTiming },
  { text: "Stěhujeme se k rodičům na víkend, nemůžu odjet", emoji: "\u{1F3E0}", minAge: 0, timing: "day_before" as AbsenceTiming },
  { text: "Babička slaví osmdesátiny, celá rodina se sjíždí", emoji: "\u{1F475}", minAge: 22, timing: "day_before" as AbsenceTiming },
  { text: "Dceři se rozbila kola, slíbil jsem jí že ji odvezu do školy", emoji: "\u{1F6B2}", minAge: 30, timing: "match_day" as AbsenceTiming },
  { text: "Syn má první zápas v žácích, nemůžu to vynechat", emoji: "\u26BD", minAge: 28, timing: "day_before" as AbsenceTiming },

  // Další logistika
  { text: "Kopačky mi zůstaly v práci a nemůžu se tam dostat", emoji: "\u{1F45F}", minAge: 0, timing: "match_day" as AbsenceTiming },
  { text: "Klíče od auta jsou zamčený v autě. Čekám na zámečníka", emoji: "\u{1F511}", minAge: 0, timing: "match_day" as AbsenceTiming },
  { text: "Spadl mi telefon do záchodu a nevím kde hrajeme", emoji: "\u{1F4F1}", minAge: 0, timing: "match_day" as AbsenceTiming },
  { text: "Vybil mi telefon a nikdo nevěděl kam má přijet", emoji: "\u{1F50B}", minAge: 0, timing: "match_day" as AbsenceTiming },
  { text: "Zapomněl jsem dresy doma, nemůžu zpátky už", emoji: "\u{1F455}", minAge: 0, timing: "match_day" as AbsenceTiming },
  { text: "Nemám čisté kopačky, zkusím to příště", emoji: "\u{1F45F}", minAge: 0, timing: "match_day" as AbsenceTiming },
];

// ═══════════════════════════════════════════════
// ABSURDNÍ VÝMLUVY (český vesnický humor)
// ═══════════════════════════════════════════════

// env: "rural" = jen vesnice/hamlet, "urban" = jen town/city, undefined = všude
type ExcuseEnv = "rural" | "urban" | undefined;

const ABSURD_EXCUSES: Array<{ text: string; emoji: string; timing: AbsenceTiming; env?: ExcuseEnv }> = [
  // Vesnické
  { text: "Zamkl jsem se v garáži a nikdo není doma", emoji: "\u{1F512}", timing: "match_day" },
  { text: "Musím hlídat kozu, utekla sousedům a žere mi zahradu", emoji: "\u{1F410}", timing: "match_day", env: "rural" },
  { text: "Přijeli příbuzní z Kanady, neviděl jsem je 15 let, nemůžu odejít", emoji: "\u{2708}", timing: "day_before" },
  { text: "Slíbil jsem dědovi že mu pomůžu vyčistit studnu", emoji: "\u{1F4A7}", timing: "day_before", env: "rural" },
  { text: "Našel jsem houby a musím je hned zpracovat, jinak se zkazí", emoji: "\u{1F344}", timing: "match_day", env: "rural" },
  { text: "Spadl mi strom na plot a utečou slepice", emoji: "\u{1F333}", timing: "match_day", env: "rural" },
  { text: "Dostal jsem lístky na hokej, sorry ale tohle se neodmítá", emoji: "\u{1F3D2}", timing: "match_day" },
  { text: "Musím odvézt tchána na houby, hrozil že jinak nepůjčí přívěs", emoji: "\u{1F698}", timing: "day_before", env: "rural" },
  { text: "Pes sežral klíče od auta, čekám až je... vrátí", emoji: "\u{1F436}", timing: "match_day" },
  { text: "Montér na parabolu přijede jen dneska mezi 8 a 17", emoji: "\u{1F4E1}", timing: "match_day" },
  { text: "Svědek na svatbě bratrance, nemůžu odmítnout", emoji: "\u{1F492}", timing: "day_before" },
  { text: "Musím natřít plot, barva schne jen do patnácti stupňů", emoji: "\u{1F3A8}", timing: "match_day", env: "rural" },
  { text: "Soused mi vrací vrtačku a slíbil jsem mu za to pomoct se střechou", emoji: "\u{1F527}", timing: "match_day", env: "rural" },
  { text: "Žena mi vyhodila kopačky z okna. Doslova. Hledám je v křoví", emoji: "\u{1F462}", timing: "match_day" },
  { text: "Zateklo mi do sklepa, musím to vylejvat kbelíkem", emoji: "\u{1FAA3}", timing: "match_day" },
  { text: "Musím opravit záchod, ženská řekla že dokud nebude fungovat, nikam nejdu", emoji: "\u{1F6BD}", timing: "match_day" },
  { text: "Chytil jsem sumce a nemůžu ho nechat v autě", emoji: "\u{1F41F}", timing: "match_day", env: "rural" },
  { text: "Klíště. Musím k doktorovi. Asi. Pro jistotu", emoji: "\u{1FAB2}", timing: "match_day", env: "rural" },
  { text: "Babička volala že jí nefunguje televize a neumí přepnout vstup", emoji: "\u{1F4FA}", timing: "match_day" },
  { text: "Musím vyzvednout traktůrek ze servisu, jinak mi ho prodaj", emoji: "\u{1F69C}", timing: "match_day", env: "rural" },
  { text: "Kočka mi porodila v tašce s vybavením", emoji: "\u{1F431}", timing: "match_day" },
  { text: "Sousedovic pes mi ukradl kopačku, honíme ho po vsi", emoji: "\u{1F415}", timing: "match_day", env: "rural" },
  { text: "Přišla kontrola z hygieny, nemůžu odejít z hospody", emoji: "\u{1F52C}", timing: "match_day" },
  { text: "Vyhrál jsem v tombole prase a musím ho odvézt domů", emoji: "\u{1F416}", timing: "match_day", env: "rural" },
  { text: "Našel jsem v garáži ježka a čekám na záchranku pro zvířata", emoji: "\u{1F994}", timing: "match_day", env: "rural" },
  { text: "Soused topí listím a mně smrdí prádlo na šňůře, musím hlídat", emoji: "\u{1F342}", timing: "match_day", env: "rural" },
  { text: "Dostal jsem pokutu za parkování a musím to jít řešit", emoji: "\u{1F694}", timing: "match_day" },
  { text: "Tchyně mi vaří svíčkovou, to se neodmítá", emoji: "\u{1F35B}", timing: "day_before" },
  { text: "Musím posekat sousedovic zahradu, prý jinak nepohlídá psa", emoji: "\u{1F33F}", timing: "match_day", env: "rural" },
  { text: "Spadla mi včelí budka a musím řešit roj", emoji: "\u{1F41D}", timing: "match_day", env: "rural" },
  { text: "Udělal jsem si zkoušku na rybářský lístek a musím to oslavit", emoji: "\u{1F41F}", timing: "match_day", env: "rural" },
  { text: "Zablokoval mi někdo výjezd z dvorku, čekám na odtahovou", emoji: "\u{1F698}", timing: "match_day" },
  { text: "Právě jsem zjistil, že mi teče střecha. Přesně teď. Přesně dneska", emoji: "\u{1F327}", timing: "match_day" },
  { text: "Jdu na sraz ročníku, víme se dvacet let neviděli", emoji: "\u{1F37B}", timing: "day_before" },
  { text: "Musím odchytit divočáka co mi rozryl zahradu", emoji: "\u{1F417}", timing: "match_day", env: "rural" },
  { text: "Krtek mi zničil záhon, chci ho chytit dřív než se vrátí", emoji: "\u{1F411}", timing: "match_day", env: "rural" },
  { text: "Srna skočila do sklepa, čekám na myslivce", emoji: "\u{1F98C}", timing: "match_day", env: "rural" },
  { text: "Koza porodila v noci, musím hlídat malý", emoji: "\u{1F410}", timing: "match_day", env: "rural" },
  { text: "Nalezl jsem hnízdo sršňů u kůlny, volám hasiče", emoji: "\u{1F41D}", timing: "match_day", env: "rural" },
  { text: "Děda chce pomoct postavit králíkárnu, nemůžu ho nechat", emoji: "\u{1F430}", timing: "day_before", env: "rural" },
  { text: "Kmotr slaví u potoka, už zařízená večeře", emoji: "\u{1F370}", timing: "match_day", env: "rural" },
  { text: "Musím vyvézt hnůj, když je sucho. Zítra prší", emoji: "\u{1F69C}", timing: "match_day", env: "rural" },
  { text: "Mám zasedání hasičů — volby nového velitele", emoji: "\u{1F692}", timing: "day_before", env: "rural" },
  { text: "Zabíjel jsem ráno kance, teď je kuchyně plná masa", emoji: "\u{1F52A}", timing: "match_day", env: "rural" },
  { text: "Tradiční průvod masopustu v sousední vesnici, slíbil jsem", emoji: "\u{1F3AD}", timing: "day_before", env: "rural" },
  { text: "Chtěl jsem sekat trávu, spadl mi řetěz z motorovky na nohu", emoji: "\u{1FA9A}", timing: "match_day", env: "rural" },
  { text: "Sousedovic slepice přelezly plot, chytám je v naší zahradě", emoji: "\u{1F414}", timing: "match_day", env: "rural" },
  { text: "Spadl nám kaštan na plot, musím to spravit než přijde vítr", emoji: "\u{1F330}", timing: "match_day", env: "rural" },
  { text: "Musím odvézt pivo na pouť, slíbil jsem starostovi", emoji: "\u{1F37B}", timing: "day_before", env: "rural" },
  { text: "Pes utekl do lesa za srnou, honím ho celé ráno", emoji: "\u{1F415}", timing: "match_day", env: "rural" },
  // Pražské / městské
  { text: "Turisti mi zablokovali vchod, nedostal jsem se z domu", emoji: "\u{1F4F7}", timing: "match_day", env: "urban" },
  { text: "Demonstrace na Václaváku, nedostal jsem se přes kordon", emoji: "\u{1F4E2}", timing: "match_day", env: "urban" },
  { text: "Soused pouští techno od rána, nemohl jsem spát", emoji: "\u{1F3B6}", timing: "match_day", env: "urban" },
  { text: "Ztratil jsem Lítačku a bez ní nikam nejedu", emoji: "\u{1F4B3}", timing: "match_day", env: "urban" },
  { text: "Spadl jsem do výkopu u metra D", emoji: "\u{1F6A7}", timing: "match_day", env: "urban" },
  { text: "Holubi mi posrali dres na balkóně", emoji: "\u{1F54A}", timing: "match_day", env: "urban" },
  { text: "Zabloudil jsem v Holešovickém OC, nenašel jsem východ", emoji: "\u{1F6D2}", timing: "match_day", env: "urban" },
  { text: "Food festival na náplavce, nedostal jsem se přes davy", emoji: "\u{1F354}", timing: "match_day", env: "urban" },
  { text: "Klíče spadly do šachty od metra", emoji: "\u{1F511}", timing: "match_day", env: "urban" },
  { text: "Pražský městský soud — svědčím proti sousedovi", emoji: "\u{2696}", timing: "day_before", env: "urban" },
  { text: "Stěhuju se z Žižkova na Vinohrady, nemám čas", emoji: "\u{1F4E6}", timing: "day_before", env: "urban" },
  { text: "Sousedka mi zalila byt, řeším pojistku", emoji: "\u{1F4A7}", timing: "match_day", env: "urban" },
  { text: "Bytová schůze, musím být jinak mi schválí kokotiny", emoji: "\u{1F3E2}", timing: "day_before", env: "urban" },
  { text: "Koloběžka Lime mě vyhodila na Karlově mostě, hledám pomoc", emoji: "\u{1F6F4}", timing: "match_day", env: "urban" },
  { text: "Letenská brigáda na úklidu parku, přihlásil jsem se", emoji: "\u{1F333}", timing: "day_before", env: "urban" },
  { text: "Galerijní noc, slíbil jsem Evě že ji doprovodím", emoji: "\u{1F3A8}", timing: "day_before", env: "urban" },
  { text: "Čekal jsem 40 minut na kurýra Rohlíku a pořád nic", emoji: "\u{1F6B2}", timing: "match_day", env: "urban" },
  { text: "Zavřeli nám kavárnu, kde jsem měl meeting — hledám jinou", emoji: "\u2615", timing: "match_day", env: "urban" },
  { text: "Sraz s klukama na pivo do Prušnaru, to se nesmí vynechat", emoji: "\u{1F37A}", timing: "day_before", env: "urban" },
  { text: "Objednal jsem si dovoz IKEA, dorazí prý kdykoliv mezi 8-18", emoji: "\u{1F4E6}", timing: "match_day", env: "urban" },
  { text: "Mám v plánu chodit na trh, musím stihnout než prodají řepu", emoji: "\u{1F955}", timing: "match_day", env: "urban" },
  { text: "Koncert v Rock Café, lístky jsem koupil před měsícem", emoji: "\u{1F3B8}", timing: "day_before", env: "urban" },
  { text: "Blázni v Krymské demonstrují proti něčemu, nedostanu se přes", emoji: "\u{1F4E2}", timing: "match_day", env: "urban" },
];

// ═══════════════════════════════════════════════
// KOCOVINA
// ═══════════════════════════════════════════════

const HANGOVER_EXCUSES = [
  { text: "Sorry trenere, není mi dobře... včera to bylo silný", emoji: "\u{1F37A}" },
  { text: "Nemůžuuu... hlava mi třeští. Příště určitě", emoji: "\u{1F635}" },
  { text: "Neni mi dobře, asi jsem něco špatného snědl (nepil)", emoji: "\u{1F922}" },
  { text: "Včera jsme to s klukama trochu přetáhli... omlouvám se", emoji: "\u{1F943}" },
  { text: "Trenere omlouvám se, mám žaludeční chřipku (pivo)", emoji: "\u{1F912}" },
  { text: "Dneska to fakt nepůjde. Včera byla zabijačka", emoji: "\u{1F37B}" },
  { text: "Ještě se mi točí hlava. Snad do soboty budu v pohodě", emoji: "\u{1F4AB}" },
  { text: "Trenere já vím že jsem slíbil... ale opravdu nemůžu", emoji: "\u{1F62C}" },
  { text: "Přísahám že už nikdy. Ale dneska fakt ne", emoji: "\u{1F64F}" },
  { text: "Vím že to vypadá blbě, ale prej jsem včera zpíval hymnu na náměstí", emoji: "\u{1F3A4}" },
  { text: "Nevím jak jsem se dostal domů, natož na hřiště", emoji: "\u{1F635}\u200D\u{1F4AB}" },
  { text: "Kluci mě včera přemluvili na jednu. Jedna se změnila v devět", emoji: "\u{1F37A}" },
  { text: "Bráchovi byl rozlučka se svobodou, přežiju to za dva dny", emoji: "\u{1F37E}" },
  { text: "Nacpali jsme se do hospody do tří, sám nevím jak", emoji: "\u{1F550}" },
  { text: "Strejda slavil padesát, nejde jít domů brzo", emoji: "\u{1F389}" },
  { text: "Dal jsem si jen jedno po práci. A pak ještě jedno. A pak...", emoji: "\u{1F964}" },
  { text: "Probudil jsem se v cizím bytě na Smíchově, jedu autobusem zpátky", emoji: "\u{1F632}" },
  { text: "Včera byla oslava konce brigády. Pivní matematika selhala", emoji: "\u{1F37A}" },
  { text: "Mám laktobacily — ne ty dobré, ty z piva", emoji: "\u{1F9A0}" },
  { text: "Dneska jsem si řekl: dám si hrnek a pak trénink. Hrnek vyhrál", emoji: "\u2615" },
  { text: "Měl jsem poslední narozeniny třicítka. Kocovina trvá dodnes", emoji: "\u{1F382}" },
  { text: "Ven si dneska ani nevyjdu, natož do kopaček", emoji: "\u{1F927}" },
  { text: "Včera jsem řekl: já dneska nepiju. Lhal jsem sám sobě", emoji: "\u{1F937}" },
  { text: "Trenere dám si jen černý čaj a budu ležet. Omlouvám se", emoji: "\u{1F375}" },
];

// ═══════════════════════════════════════════════
// ZDRAVOTNÍ
// ═══════════════════════════════════════════════

const HEALTH_EXCUSES = [
  { text: "Koleno mě zase kleplo, asi ne", emoji: "\u{1F9B5}" },
  { text: "Natáhl jsem si sval na tréninku, bolí to jak čert", emoji: "\u{1F4AA}" },
  { text: "Záda úplně ztuhlý, nemůžu se ani otočit", emoji: "\u{1F615}" },
  { text: "Kotník mi otekl, asi jsem si ho podvrtl v práci", emoji: "\u{1F97E}" },
  { text: "Mám ten zánět šlach zas, doktor říkal klid", emoji: "\u{1FA7A}" },
  { text: "Píchlo mě v třísle, nechci riskovat", emoji: "\u{1F915}" },
  { text: "Lýtko ztuhlý od pondělka, asi jsem to přetáhl", emoji: "\u{1F9B6}" },
  { text: "Rameno mi vyskočilo, musím k ortopedovi", emoji: "\u{1F4AA}" },
  { text: "Mám migrénu, nevidím na jedno oko", emoji: "\u{1F635}" },
  { text: "Alergická reakce, jsem celej oteklej", emoji: "\u{1F922}" },
  { text: "Doktor mi zakázal sport na týden, něco s tlakem", emoji: "\u{1FA7A}" },
  { text: "Mám v kříži takovou bolest, že nemůžu ani sedět", emoji: "\u{1F623}" },
  { text: "Bolí mě hlava od včera, bral jsem prášky a furt nic", emoji: "\u{1F92F}" },
  { text: "Udělala se mi puchýř na patě jako pětikoruna", emoji: "\u{1FA79}" },
  { text: "Achilovka mě bolí, nebudu to riskovat", emoji: "\u{1F9B6}" },
  { text: "Vyskočil mi herpes, nemůžu do kolektivu", emoji: "\u{1F98B}" },
  { text: "Mám kašel, asi bronchitida. Nebudu nakazit kluky", emoji: "\u{1F637}" },
  { text: "Zvrtl jsem si koleno na schodech, doufám že to bude dobrý", emoji: "\u{1F9B5}" },
  { text: "Rýma a bolení v krku, beru paralen a ležím", emoji: "\u{1F927}" },
  { text: "Zvedla se mi teplota, rozhodně ne trénovat", emoji: "\u{1F321}" },
];

const COMMUTE_EXCUSES: Array<{ text: string; emoji: string; env?: ExcuseEnv }> = [
  // Univerzální
  { text: "Auto se porouchalo cestou na zápas", emoji: "\u{1F697}" },
  { text: "Nestihl jsem to, na silnici byla nehoda a stálo se", emoji: "\u{1F6A7}" },
  { text: "Zmeškal jsem autobus a další jede až za hodinu", emoji: "\u{1F68C}" },
  { text: "Nemám odvoz, nikdo nejede mým směrem", emoji: "\u{1F6B6}" },
  { text: "Dneska to nestíhám, je to daleko a mám ještě směnu", emoji: "\u23F0" },
  { text: "Kolega co mě veze onemocněl, nemám jak se dostat", emoji: "\u{1F912}" },
  // Vesnické
  { text: "Musím jet přes dvě vesnice a silnice je rozkopaná", emoji: "\u{1F6A7}", env: "rural" },
  // Pražské / městské
  { text: "Nejela tramvaj, výluka na Palackého náměstí", emoji: "\u{1F68B}", env: "urban" },
  { text: "Magistrála byla totálně ucpaná", emoji: "\u{1F697}", env: "urban" },
  { text: "Metro stálo 20 minut, porucha na lince C", emoji: "\u{1F687}", env: "urban" },
  { text: "Zavřeli Nuselák, objížďka přes půl Prahy", emoji: "\u{1F6A7}", env: "urban" },
  { text: "Autobus 135 nejel, čekal jsem na dalšího 40 minut", emoji: "\u{1F68C}", env: "urban" },
  { text: "Parkování na Žižkově je peklo, objel jsem to třikrát", emoji: "\u{1F697}", env: "urban" },
  { text: "Kolaps na Barrandovském mostě, stálo se hodinu", emoji: "\u{1F6A7}", env: "urban" },
  { text: "Výluka na trati, tramvaj nejede, NAD autobus nepřijel", emoji: "\u{1F68B}", env: "urban" },
  { text: "D1 ucpaná od Chodova po Spořilov, stojím v koloně", emoji: "\u{1F697}", env: "urban" },
  { text: "Koloběžka se mi rozbila u Anděla, pěšky to nestíhám", emoji: "\u{1F6F4}", env: "urban" },
  { text: "Lítačka mi nefunguje, turnikety mě nepustily", emoji: "\u{1F4B3}", env: "urban" },
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
export function generateAbsences(
  rng: Rng,
  squad: PlayerForAbsence[],
  timing: AbsenceTiming = "any",
  district?: string,
  friendlyMultiplier?: number,
): AbsenceResult[] {
  const absences: AbsenceResult[] = [];
  // District filter: Praha = urban, definovaný non-Praha = rural, undefined = jen univerzální výmluvy
  const isUrban = district === "Praha";
  const isRural = district !== undefined && district !== "Praha";
  const envFilter = (e: { env?: ExcuseEnv }) =>
    !e.env || (isUrban && e.env === "urban") || (isRural && e.env === "rural");

  for (let i = 0; i < squad.length; i++) {
    const p = squad[i];

    // Celková šance na absenci — cíl: průměrně 1-2 absence na tým (18 hráčů)
    // discipline 100 → ~3%, discipline 0 → ~15%
    // Průměrný hráč (disc=50, pat=50, morale=50) → ~7% → 1.3 absence na tým
    const disciplineFactor = (100 - p.discipline) / 100;
    const patriotismFactor = (100 - p.patriotism) / 200;
    const moraleFactor = (100 - p.morale) / 300;
    const commuteFactor = Math.min(0.04, (p.commuteKm ?? 0) * 0.002);
    let baseChance = 0.02 + disciplineFactor * 0.10 + patriotismFactor * 0.03 + moraleFactor * 0.02 + commuteFactor;

    // ── Celebrity override — much higher absence rates ──
    if (p.isCelebrity) {
      const celebAbsenceRates: Record<string, Record<string, number>> = {
        legend: { S: 0.67, A: 0.60, B: 0.50, C: 0.40 },
        fallen_star: { _: 0.47 },
        glass_man: { _: 0.42 },
      };
      const typeRates = celebAbsenceRates[p.celebrityType ?? "legend"] ?? celebAbsenceRates.legend;
      baseChance = typeRates[p.celebrityTier ?? "_"] ?? typeRates._ ?? 0.45;
    }

    // Přátelák = dobrovolný zápas → výrazně více omluvenek (multiplier zvyšuje šanci)
    if (friendlyMultiplier && friendlyMultiplier > 1) {
      baseChance = Math.min(0.9, baseChance * friendlyMultiplier);
    }

    if (rng.random() > baseChance) continue; // Přijde!

    // ── Celebrity-specific excuses ──
    if (p.isCelebrity) {
      const celebResult = generateCelebrityExcuse(rng, p, timing);
      if (celebResult) {
        absences.push({ playerIndex: i, ...celebResult });
        continue;
      }
    }

    // Vyber kategorii výmluvy — váhy závisí na atributech
    const occupation = getOccupationByName(p.occupation);

    const weights: Record<string, number> = {
      // Profesní: vyšší když povolání má vysoký overtimeRisk
      professional: 0.25 + (occupation?.overtimeRisk ?? 0.2) * 0.3,

      // Osobní: vyšší když nízká morálka nebo nízký patriotismus
      personal: 0.30 + (100 - p.morale) / 100 * 0.15,

      // Absurdní: vyšší když nízká disciplína + vyšší alkohol (nespolehlivý typy)
      absurd: 0.08 + (100 - p.discipline) / 100 * 0.08 + p.alcohol / 100 * 0.05,

      // Zdravotní: vyšší u starších, nízká kondice, vysoká injury proneness
      health: 0.05 + (p.age > 35 ? 0.08 : 0) + (p.age > 40 ? 0.08 : 0)
        + (100 - p.stamina) / 100 * 0.06 + p.injuryProneness / 100 * 0.05,

      // Kocovina: závisí hlavně na alcohol atributu
      hangover: p.alcohol > 60 ? 0.15 : p.alcohol > 40 ? 0.08 : 0.02,

      // Doprava: vyšší pro dojíždějící hráče
      commute: (p.commuteKm ?? 0) > 5 ? 0.10 + (p.commuteKm ?? 0) * 0.005 : 0,
    };

    const category = rng.weighted(weights) as AbsenceResult["category"];

    let smsText: string;
    let emoji: string;
    let excuseTiming: AbsenceTiming = timing === "any" ? "day_before" : timing;

    switch (category) {
      case "professional": {
        const excuses = occupation?.excuses ?? ["Musím do práce, nemůžu přijít"];
        smsText = rng.pick(excuses);
        emoji = "\u{1F3D7}";
        excuseTiming = "day_before";
        break;
      }
      case "personal": {
        const applicable = PERSONAL_EXCUSES.filter((e) => p.age >= e.minAge && (timing === "any" || e.timing === timing));
        const fallback = PERSONAL_EXCUSES.filter((e) => p.age >= e.minAge);
        const pick = rng.pick(applicable.length > 0 ? applicable : fallback.length > 0 ? fallback : PERSONAL_EXCUSES);
        smsText = pick.text;
        emoji = pick.emoji;
        excuseTiming = pick.timing ?? "any";
        break;
      }
      case "absurd": {
        const applicable = ABSURD_EXCUSES.filter((e) => (timing === "any" || e.timing === timing) && envFilter(e));
        const pick = rng.pick(applicable.length > 0 ? applicable : ABSURD_EXCUSES.filter(envFilter));
        smsText = pick.text;
        emoji = pick.emoji;
        excuseTiming = pick.timing ?? "match_day";
        break;
      }
      case "health": {
        const pick = rng.pick(HEALTH_EXCUSES);
        smsText = pick.text;
        emoji = pick.emoji;
        break;
      }
      case "hangover": {
        const pick = rng.pick(HANGOVER_EXCUSES);
        smsText = pick.text;
        emoji = pick.emoji;
        break;
      }
      case "commute": {
        const commuteFiltered = COMMUTE_EXCUSES.filter(envFilter);
        const pick = rng.pick(commuteFiltered.length > 0 ? commuteFiltered : COMMUTE_EXCUSES);
        smsText = pick.text;
        emoji = pick.emoji;
        break;
      }
    }

    const CATEGORY_LABELS: Record<string, string> = {
      professional: "Práce", personal: "Osobní", absurd: "Jiné",
      health: "Zdraví", hangover: "Kocovina", commute: "Doprava",
    };

    // Skip if timing doesn't match (professional = day_before only, commute/hangover = match_day only)
    if (timing !== "any") {
      const categoryTiming: Record<string, AbsenceTiming> = {
        professional: "day_before", health: "day_before", commute: "match_day", hangover: "match_day",
      };
      const catTiming = categoryTiming[category];
      if (catTiming && catTiming !== timing) continue;
    }

    absences.push({
      playerIndex: i,
      category,
      timing: excuseTiming,
      reason: CATEGORY_LABELS[category] ?? category,
      emoji,
      smsText,
    });
  }

  return absences;
}

// ═══════════════════════════════════════════════
// CELEBRITY EXCUSE GENERATOR
// ═══════════════════════════════════════════════

const LEGEND_EXCUSES = [
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

const FALLEN_STAR_EXCUSES = [
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

const GLASS_MAN_EXCUSES = [
  "Zase to koleno — nemůže ani chodit", "Natáhl si sval při rozcvičce",
  "Doktor říká minimálně týden pauza", "Bolí ho záda od včerejšího tréninku",
  "Má otok kotníku — led a klid", "Koleno se mu zase zamklo",
  "Cítí bodnutí v třísle, nechce riskovat", "Fyzioterapeut zakázal kontaktní sport na 3 dny",
  "Noha ho bolí víc než minule", "Preventivně odpočívá — bojí se že se to vrátí",
  "Ráno se probudil a nemohl ohnout koleno", "Říká že cítí něco v lýtku",
  "Má zánět šlach — chronický problém", "Páteř mu zablokovala po cestě autem",
];

const CELEBRITY_TRAINING_EXCUSES = [
  "Dnes má rehabilitaci u svého fyzioterapeuta", "Běhá si sám v parku, má vlastní program",
  "Řekl že tohle cvičení je pod jeho úroveň", "Volal že je na golfu",
  "Prý má natáčení pro ČT Sport", "Zaspání — včerejší charitativní akce se protáhla",
  "Jel na soustředění veteránů", "Má trénink s osobním koučem",
  "Doktor mu doporučil odpočinek", "Řekl: já tohle nepotřebuju, já to umím",
];

export { CELEBRITY_TRAINING_EXCUSES };

function generateCelebrityExcuse(
  rng: { pick: <T>(arr: T[]) => T; random: () => number },
  player: PlayerForAbsence,
  timing: AbsenceTiming,
): Omit<AbsenceResult, "playerIndex"> | null {
  const type = player.celebrityType ?? "legend";

  let excuses: string[];
  let emoji: string;
  let category: AbsenceResult["category"];

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
    category,
    timing: timing === "any" ? (rng.random() < 0.5 ? "day_before" : "match_day") : timing,
    reason: type === "legend" ? "Celebrita" : type === "fallen_star" ? "Alkohol" : "Zranění",
    emoji,
    smsText: rng.pick(excuses),
  };
}
