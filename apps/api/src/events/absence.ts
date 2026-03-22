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

export interface AbsenceResult {
  playerIndex: number;
  category: "professional" | "personal" | "absurd" | "health" | "hangover";
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
}

// ═══════════════════════════════════════════════
// OSOBNÍ VÝMLUVY (univerzální, vážené dle atributů)
// ═══════════════════════════════════════════════

const PERSONAL_EXCUSES = [
  // Rodina (vyšší šance pro starší, ženatý věk)
  { text: "Manželka mě nepustila, sorry", emoji: "\u{1F46B}", minAge: 25 },
  { text: "Tchýně má narozeniny, musel jsem slíbit že přijdu", emoji: "\u{1F382}", minAge: 28 },
  { text: "Malej je nemocnej, musím ho hlídat", emoji: "\u{1F476}", minAge: 24 },
  { text: "Musím na rodičák do školky", emoji: "\u{1F3EB}", minAge: 25 },
  { text: "Ženská mi dala ultimátum — buď fotbal nebo ona. Ještě přemýšlím", emoji: "\u{1F494}", minAge: 20 },
  { text: "Dcera má vystoupení ve škole, slíbil jsem že přijdu", emoji: "\u{1F3AD}", minAge: 28 },
  { text: "Rodinnej oběd u rodičů, nemůžu to zrušit", emoji: "\u{1F356}", minAge: 0 },

  // Zdraví
  { text: "Bolí mě záda od včerejška, nemůžu se ohnout", emoji: "\u{1F915}", minAge: 30 },
  { text: "Mám doktora, nemohl jsem to přeobjednat", emoji: "\u{1F3E5}", minAge: 0 },
  { text: "Chytil jsem chřipku, nechci nakazit celej tým", emoji: "\u{1F912}", minAge: 0 },

  // Logistika
  { text: "Nemám odvoz, auto je v servisu od pátku", emoji: "\u{1F697}", minAge: 0 },
  { text: "Ujel mi bus a další jede až za dvě hodiny", emoji: "\u{1F68C}", minAge: 0 },

  // Zapomnětlivost
  { text: "Zapomněl jsem, myslel jsem že hrajeme příští týden", emoji: "\u{1F937}", minAge: 0 },
  { text: "Hele já se omlouvám ale fakt jsem si to nespojil", emoji: "\u{1F644}", minAge: 0 },

  // Vztahy
  { text: "Slíbil jsem ženský že jedeme do IKEA, nemůžu to zrušit", emoji: "\u{1F6D2}", minAge: 22 },
  { text: "Musím pomoct stěhovat kamarádovi, slíbil jsem to už třikrát", emoji: "\u{1F4E6}", minAge: 0 },
];

// ═══════════════════════════════════════════════
// ABSURDNÍ VÝMLUVY (český vesnický humor)
// ═══════════════════════════════════════════════

const ABSURD_EXCUSES = [
  { text: "Zamkl jsem se v garáži a nikdo není doma", emoji: "\u{1F512}" },
  { text: "Musím hlídat kozu, utekla sousedům a žere mi zahradu", emoji: "\u{1F410}" },
  { text: "Přijeli příbuzní z Kanady, neviděl jsem je 15 let, nemůžu odejít", emoji: "\u{2708}" },
  { text: "Slíbil jsem dědovi že mu pomůžu vyčistit studnu", emoji: "\u{1F4A7}" },
  { text: "Našel jsem houby a musím je hned zpracovat, jinak se zkazí", emoji: "\u{1F344}" },
  { text: "Spadl mi strom na plot a utečou slepice", emoji: "\u{1F333}" },
  { text: "Dostal jsem lístky na hokej, sorry ale tohle se neodmítá", emoji: "\u{1F3D2}" },
  { text: "Musím odvézt tchána na houby, hrozil že jinak nepůjčí přívěs", emoji: "\u{1F698}" },
  { text: "Pes sežral klíče od auta, čekám až je... vrátí", emoji: "\u{1F436}" },
  { text: "Montér na parabolu přijede jen dneska mezi 8 a 17", emoji: "\u{1F4E1}" },
  { text: "Svědek na svatbě bratrance, nemůžu odmítnout", emoji: "\u{1F492}" },
  { text: "Musím natřít plot, barva schne jen do patnácti stupňů", emoji: "\u{1F3A8}" },
  { text: "Soused mi vrací vrtačku a slíbil jsem mu za to pomoct se střechou", emoji: "\u{1F527}" },
  { text: "Žena mi vyhodila kopačky z okna. Doslova. Hledám je v křoví", emoji: "\u{1F462}" },
  { text: "Zateklo mi do sklepa, musím to vylejvat kbelíkem", emoji: "\u{1FAA3}" },
  { text: "Musím opravit záchod, ženská řekla že dokud nebude fungovat, nikam nejdu", emoji: "\u{1F6BD}" },
  { text: "Chytil jsem sumce a nemůžu ho nechat v autě", emoji: "\u{1F41F}" },
  { text: "Klíště. Musím k doktorovi. Asi. Pro jistotu", emoji: "\u{1FAB2}" },
  { text: "Babička volala že jí nefunguje televize a neumí přepnout vstup", emoji: "\u{1F4FA}" },
  { text: "Musím vyzvednout traktůrek ze servisu, jinak mi ho prodaj", emoji: "\u{1F69C}" },
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
): AbsenceResult[] {
  const absences: AbsenceResult[] = [];

  for (let i = 0; i < squad.length; i++) {
    const p = squad[i];

    // Celková šance na absenci — discipline je klíčový faktor
    // discipline 100 → 5% šance, discipline 0 → 25% šance
    // patriotism snižuje šanci (loajální hráč chodí vždycky)
    // morale snižuje šanci (spokojený hráč chce hrát)
    const disciplineFactor = (100 - p.discipline) / 100;
    const patriotismFactor = (100 - p.patriotism) / 200; // Menší vliv
    const moraleFactor = (100 - p.morale) / 300; // Ještě menší vliv
    const baseChance = 0.04 + disciplineFactor * 0.16 + patriotismFactor * 0.05 + moraleFactor * 0.03;

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
    };

    const category = rng.weighted(weights) as AbsenceResult["category"];

    let smsText: string;
    let emoji: string;

    switch (category) {
      case "professional": {
        const excuses = occupation?.excuses ?? ["Musím do práce, nemůžu přijít"];
        smsText = rng.pick(excuses);
        emoji = "\u{1F3D7}"; // construction
        break;
      }
      case "personal": {
        const applicable = PERSONAL_EXCUSES.filter((e) => p.age >= e.minAge);
        const pick = rng.pick(applicable.length > 0 ? applicable : PERSONAL_EXCUSES);
        smsText = pick.text;
        emoji = pick.emoji;
        break;
      }
      case "absurd": {
        const pick = rng.pick(ABSURD_EXCUSES);
        smsText = pick.text;
        emoji = pick.emoji;
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
    }

    absences.push({
      playerIndex: i,
      category,
      reason: category === "professional" ? "Práce" : category === "personal" ? "Osobní" : category === "absurd" ? "Jiné" : category === "health" ? "Zdraví" : "Kocovina",
      emoji,
      smsText,
    });
  }

  return absences;
}
