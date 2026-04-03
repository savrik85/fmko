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

  // Zdraví — víte den předem
  { text: "Bolí mě záda od včerejška, nemůžu se ohnout", emoji: "\u{1F915}", minAge: 30, timing: "day_before" as AbsenceTiming },
  { text: "Mám doktora, nemohl jsem to přeobjednat", emoji: "\u{1F3E5}", minAge: 0, timing: "day_before" as AbsenceTiming },
  { text: "Chytil jsem chřipku, nechci nakazit celej tým", emoji: "\u{1F912}", minAge: 0, timing: "day_before" as AbsenceTiming },

  // Logistika — v den zápasu
  { text: "Nemám odvoz, auto je v servisu od pátku", emoji: "\u{1F697}", minAge: 0, timing: "match_day" as AbsenceTiming },
  { text: "Ujel mi bus a další jede až za dvě hodiny", emoji: "\u{1F68C}", minAge: 0, timing: "match_day" as AbsenceTiming },

  // Zapomnětlivost — v den zápasu
  { text: "Zapomněl jsem, myslel jsem že hrajeme příští týden", emoji: "\u{1F937}", minAge: 0, timing: "match_day" as AbsenceTiming },
  { text: "Hele já se omlouvám ale fakt jsem si to nespojil", emoji: "\u{1F644}", minAge: 0, timing: "match_day" as AbsenceTiming },

  // Další rodina
  { text: "Malá má angínu, musím s ní k doktorovi", emoji: "\u{1F321}", minAge: 26, timing: "match_day" as AbsenceTiming },
  { text: "Tchán padl ze žebříku, jedeme do nemocnice", emoji: "\u{1F691}", minAge: 25, timing: "match_day" as AbsenceTiming },
  { text: "Manželka rodí! Ne teď, ale prý co kdyby", emoji: "\u{1F930}", minAge: 24, timing: "day_before" as AbsenceTiming },
  { text: "Syn má turnaj v šachách, slíbil jsem že přijdu", emoji: "\u265F", minAge: 30, timing: "day_before" as AbsenceTiming },
  { text: "Ženská jede s kamarádkama pryč, musím hlídat", emoji: "\u{1F476}", minAge: 25, timing: "day_before" as AbsenceTiming },
  { text: "Stěhujeme se k rodičům na víkend, nemůžu odjet", emoji: "\u{1F3E0}", minAge: 0, timing: "day_before" as AbsenceTiming },

  // Další logistika
  { text: "Kopačky mi zůstaly v práci a nemůžu se tam dostat", emoji: "\u{1F45F}", minAge: 0, timing: "match_day" as AbsenceTiming },
  { text: "Klíče od auta jsou zamčený v autě. Čekám na zámečníka", emoji: "\u{1F511}", minAge: 0, timing: "match_day" as AbsenceTiming },
  { text: "Spadl mi telefon do záchodu a nevím kde hrajeme", emoji: "\u{1F4F1}", minAge: 0, timing: "match_day" as AbsenceTiming },
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
): AbsenceResult[] {
  const absences: AbsenceResult[] = [];
  // Filter excuses by district: Praha = urban, vše ostatní = rural
  const isUrban = district === "Praha";
  const envFilter = (e: { env?: ExcuseEnv }) => !e.env || (isUrban ? e.env === "urban" : e.env === "rural");

  for (let i = 0; i < squad.length; i++) {
    const p = squad[i];

    // Celková šance na absenci — discipline je klíčový faktor
    // discipline 100 → 5% šance, discipline 0 → 25% šance
    // patriotism snižuje šanci (loajální hráč chodí vždycky)
    // morale snižuje šanci (spokojený hráč chce hrát)
    const disciplineFactor = (100 - p.discipline) / 100;
    const patriotismFactor = (100 - p.patriotism) / 200; // Menší vliv
    const moraleFactor = (100 - p.morale) / 300; // Ještě menší vliv
    const commuteFactor = Math.min(0.08, (p.commuteKm ?? 0) * 0.003); // 10km → +3%, 25km → +7.5%
    const baseChance = 0.04 + disciplineFactor * 0.16 + patriotismFactor * 0.05 + moraleFactor * 0.03 + commuteFactor;

    if (rng.random() > baseChance) continue; // Přijde!

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
