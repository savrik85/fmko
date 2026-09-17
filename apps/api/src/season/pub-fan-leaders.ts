/**
 * Vůdci fanoušků v hospodě.
 *
 * Hospoda U Pralesa byla dosud jen mezi hráči. Přitom je to jediné místo, kde
 * se v okresním fotbale potkává kabina s tribunou: hospodský vůdce tam má
 * výčep, pamětník tam chodí od nepaměti a kápo kotle si tam sedne, když chce
 * někomu něco vytknout.
 *
 * Interakce jde oběma směry a obě strany si z ní něco odnesou:
 * - hráči morálku a kondici (běžné `PubEffect`),
 * - parta náladu a naštvanost, vůdce vztah k trenérovi (`FanDopad`).
 *
 * Každá scéna má pool vět, ne jednu šablonu. Do hospody chodí i tři vůdci
 * naráz a stav klubu je pro všechny stejný, takže by jinak všichni řekli
 * doslova totéž. Index varianty dodává volající ze seedovaného RNG, aby
 * opakovaný běh napsal tentýž večer.
 *
 * Bez DB, aby to šlo testovat.
 */

import type { FanGroupKind } from "../engine/fan-groups";
import { type DistrictPool, districtPoolFor } from "../data/flavor/district-pool";

/** Jak často který archetyp v hospodě vůbec sedí. */
const DOCHAZKA: Record<string, number> = {
  hospodsky_vudce: 0.85,
  stary_kapo: 0.45,
  pametnik: 0.5,
  predseda_fanklubu: 0.35,
  mlady_radikal: 0.3,
  organizatorka: 0.1,
};

/** Kolik hráčů v hospodě je večer před zápasem už moc. */
export const HRACU_UZ_MOC = 4;

export interface VudceVHospode {
  leaderId: string;
  groupId: string;
  groupKind: FanGroupKind;
  jmeno: string;
  archetype: string;
  /** Kvůli koncovkám minulého času. Vůdcem party bývá i žena. */
  gender?: "m" | "f";
  /** Radikálnost 0–100. Radikál vytýká, vyjednavač spíš platí rundu. */
  radikalnost: number;
  vyjednavani: number;
  /** Nálada a naštvanost jeho party. */
  mood: number;
  heat: number;
  /** Vztah k trenérovi −100…100. */
  sentiment: number;
}

/** Dopad na partu a vůdce. Hráčské dopady řeší `PubEffect`. */
export interface FanDopad {
  groupId: string;
  leaderId: string;
  mood: number;
  heat: number;
  sentiment: number;
  duvod: string;
}

/** Jak dopadl poslední zápas, pro hospodské řeči. */
export interface PosledniZapas {
  vyhra: boolean;
  remiza: boolean;
  gf: number;
  ga: number;
  souper: string;
  /** Hrálo se doma? */
  doma: boolean;
}

/** Výkon hráče, který sedí v hospodě. Z posledního zápasu. */
export interface VykonHrace {
  playerId: string;
  jmeno: string;
  odehral: boolean;
  goly: number;
  asistence: number;
  /** Známka 0–10 ze `match_player_stats`. */
  znamka: number | null;
  cervena: boolean;
}

export interface HospodskaScena {
  type: string;
  text: string;
  /** Kterých hráčů se to týká. */
  playerIds: string[];
  /** Morálka hráčů: kladné i záporné. */
  moraleDelta: number;
  fan: FanDopad;
}

/** Který text z poolu a s jakým okresním koloritem. */
interface TextOpts {
  /** Index varianty. Volající ho bere ze seedovaného RNG. */
  varianta?: number;
  okres?: string;
}

// ── Texty ───────────────────────────────────────────────────────────────────
// Placeholdery: {v} vůdce, {h} hráč, {jmena} hráči u stolu, {hracu} počet
// v akuzativu, {skore}, {souper}, {co} za co se chválí nebo kárá, {l} koncovka
// minulého času podle pohlaví vůdce.
//
// Dvě tvrdá pravidla, obojí vykoupené chybou v generovaném textu:
//  1. Jméno je vždycky podmět v prvním pádě. Skloňovat neumíme, takže
//     „tvrdil Filip Král" nebo „kousek od Ondřej Janoušek" by z toho lezlo
//     pořád. Klub se zmiňuje přes apozici („s týmem X"), ta první pád unese.
//  2. Sloveso o vůdci končí na {l}. Vůdcem party bývá i žena a „Renata
//     vyprávěl" je vidět na první pohled. Slovesa od „jít" (přišel, odešel)
//     jsou proto zakázaná, ta se na koncovku nelámou.

const VUDCE_SAM: DistrictPool<string> = {
  core: [
    "{v} sedě{l} u výčepu sám a celý večer nadáva{l} na vedení. Hospodský to poslouchal za oba.",
    "{v} čeka{l} do zavíračky, jestli někdo z klubu dorazí. Nedorazil nikdo.",
    "{v} si stěžova{l} hospodskému, že se s ním z klubu nikdo nebaví. Dostal{a} ještě jedno.",
    "{v} obsadi{l} stůl u okna a probíra{l} klub s každým, kdo se zastavil. Většina se nezastavila.",
    "{v} necha{l} na stole vzkaz pro trenéra. Hospodský ho ráno našel pod popelníkem.",
    "{v} zůsta{l} u výčepu do zavíračky. Prý že doma stejně není s kým mluvit.",
  ],
};

const VYTKA_OSTRA: DistrictPool<string> = {
  core: [
    "{v} napočíta{l} u stolu {hracu} den před zápasem a řekl{a} jim nahlas, co si o tom myslí. Hospoda ztichla.",
    "{v} naše{l} u jednoho stolu {hracu} a zepta{l} se, jestli se zítra náhodou nehraje. Odpověď nečeka{l}.",
    "{v} praštil{a} pivem o stůl a připomněl{a} klukům, kolik lidí na ně zítra přijde. Napočíta{l} jich tam {hracu}.",
    "{v} počíta{l} nahlas prázdné sklenice a dopracoval{a} se k číslu, které nikdo neslyšel rád. Napočíta{l} u stolu {hracu}.",
    "{v} řekl{a} před celým lokálem, že den před zápasem viděl{a} u jednoho stolu {hracu}. Do rána to věděla půlka vsi.",
  ],
};

const VYTKA_MIRNA: DistrictPool<string> = {
  core: [
    "{v} naše{l} u stolu {hracu} a poprosil{a} je, ať to zítra nepokazí. Bylo to trapné.",
    "{v} objednal{a} ke stolu kolo minerálky. Beze slova. Napočíta{l} tam {hracu} a rozuměli.",
    "{v} zastihl{a} u piva {hracu} a jen se zepta{l}, kolikátá to je. Nikdo neodpověděl.",
    "{v} připomněl{a} klukům, že zítra se hraje. Řekl{a} to slušně, ale dvakrát. Napočíta{l} jich {hracu}.",
    "{v} poslal{a} {hracu} domů dřív, než si stihli objednat další. Pochopili to jako pokyn.",
  ],
};

const KONFRONTACE: DistrictPool<string> = {
  core: [
    "{h} si u výčepu vyslechl, co si kotel myslí o posledních výkonech. Mluvil{a} {v} a příjemné to nebylo.",
    "{v} si přisedl{a} a bez úvodu vypočítal{a}, co se poslední měsíc nedaří. {h} to poslouchal dlouho.",
    "{h} chtěl zaplatit a jít domů. {v} ho zdržel{a} u dveří a domluvil{a} mu tam.",
    "{v} řekl{a} narovinu, co se na tribuně říká za zády. {h} u toho seděl a mlčel.",
    "{h} se u výčepu dozvěděl, že si kotel o kádru myslí své. {v} nešetřil{a}.",
    "{v} rozebíra{l} poslední zápas tak nahlas, že to bylo slyšet i na terasu. {h} seděl přímo naproti.",
  ],
};

const RUNDA: DistrictPool<string> = {
  core: [
    "{v} zaplatil{a} rundu a {jmena} si s ním připil{i}. Prý že za nima kotel stojí, ať to dopadne jak chce.",
    "{v} objednal{a} kolo a řekl{a}, že tohle je za docházku, ne za výsledky. {jmena} nepohrdl{i}.",
    "{v} dal{a} klukům po pivu a chtěl{a} za to jediné: ať se v neděli nešetří. {jmena} slíbil{i}.",
    "{v} zaplatil{a} útratu celého stolu a zmizel{a} dřív, než mu {jmena} stihl{i} poděkovat.",
    "{v} připil{a} na zdraví a slíbil{a}, že kotel bude řvát i za stavu nula dva. {jmena} zvedl{i} sklenice.",
    "{v} donesl{a} ke stolu plný tácek. {jmena} neprotestoval{i}.",
  ],
  prachatice: [
    "{v} zaplatil{a} rundu a doda{l}, že takhle se to dělalo i za starých časů v Husinci. {jmena} to nezpochybnil{i}.",
  ],
};

const HISTORKY: DistrictPool<string> = {
  core: [
    "{v} vyprávěl{a}, jak se hrálo dřív. {h} to vydržel do konce a ještě přikyvoval.",
    "{v} líčil{a} zápas, o kterém nikdo jiný neslyšel. {h} se tvářil, že si ho pamatuje.",
    "{v} ukazoval{a} na mobilu fotky z pouti před deseti lety. {h} vydržel do vybité baterky.",
    "{v} tvrdil{a}, že tenkrát měli lepší mužstvo. Důkaz žádný, zato posluchače. {h} seděl nejblíž.",
    "{v} vzpomínal{a} na trenéra, co končil před pěti lety. {h} se shodl, že to nebylo tak zlé.",
    "{v} vykládal{a}, jak se kdysi jezdilo na venkovní zápasy. {h} si objednal další a poslouchal.",
  ],
  prachatice: [
    "{v} vyprávěl{a}, jak se v zimě trénovalo na zamrzlém rybníku ve Volarech. {h} u toho vydržel dvě piva.",
    "{v} přesvědčoval{a} celý stůl, že nejtěžší soupeř na okrese není mužstvo, ale kopec za brankou. {h} nesouhlasil.",
  ],
  praha: [
    "{v} líčil{a}, jak se kdysi chodilo na Julisku za stovku a bagetu. {h} ten příběh znal zpaměti.",
  ],
};

const KLID: DistrictPool<string> = {
  core: [
    "{v} sedě{l} u vedlejšího stolu. {jmena} si hleděl{i} svého, pozdravili se a nic víc.",
    "{v} kýv{l} od výčepu a zůstalo u toho. U stolu seděl{i} {jmena}.",
    "{v} si dal{a} jedno pivo a odpoledne skončilo bez řečí. Vedle seděl{i} {jmena}.",
    "{v} a {jmena} se v hospodě minuli ve dveřích. Nic víc se nestalo.",
    "{v} sledoval{a} televizi, {jmena} seděl{i} vzadu. Večer bez jediné hlášky.",
  ],
};

const ZLODEJ_OSTRE: DistrictPool<string> = {
  core: [
    "{v} si stoupl{a} k výčepu a řekl{a} nahlas, co si tribuna myslí o zlodějích v dresu. {h} zíral do piva.",
    "{v} oznámil{a} celé hospodě, že se zlodějem u jednoho stolu pít nebude. {h} zaplatil a zmizel.",
    "{h} si chtěl objednat. {v} hospodskému řekl{a}, ať zlodějům nenalévá, a hospoda ztichla.",
    "{v} vytáhl{a} před celým lokálem, co se v klubu ztratilo. {h} u toho seděl a mlčel.",
    "{h} dlouho snášel pohledy od výčepu. {v} nakonec řekl{a} nahlas, co si všichni mysleli.",
  ],
};

const ZLODEJ_MIRNE: DistrictPool<string> = {
  core: [
    "{v} se zastavil{a} u stolu a jen řekl{a}, že kotel si pamatuje. {h} přikývl.",
    "{v} poslal{a} ke stolu vzkaz přes hospodského, že v dresu se nekrade. {h} ho dostal i s pivem.",
    "{h} se u výčepu dozvěděl, že tribuna o krádeži ví. {v} to řekl{a} klidně, ale jasně.",
    "{v} si přisedl{a} a zeptal{a} se, jestli to stálo za to. {h} neodpověděl.",
    "{v} zavrtěl{a} hlavou, když {h} vešel do hospody. Víc nebylo potřeba.",
  ],
};

const TRENER_HADKA: DistrictPool<string> = {
  core: [
    "{v} potka{l} v hospodě trenéra a hned mu zača{l} vyčítat, jak to v klubu vypadá. Rozloučil{a} se dřív než trenér.",
    "{v} si k trenérovi přisedl{a} nezvaný a půl hodiny mu vysvětloval{a}, co dělá špatně.",
    "{v} řekl{a} trenérovi před celým lokálem, co si kotel myslí. Pivo nedopi{l}.",
    "{v} zača{l} u trenérova stolu klidně a skonči{l} u toho, že takhle se to dál nedá.",
    "{v} trenérovi vypočítal{a} jméno po jménu, kdo podle kotle hrát nemá. Seznam byl dlouhý.",
    "{v} se s trenérem nepohádal{a} nahlas. Bylo to horší, mluvil{a} úplně klidně.",
  ],
};

const TRENER_PIVO: DistrictPool<string> = {
  core: [
    "{v} si přisedl{a} k trenérovi a probrali sestavu. Rozcházeli se po dvou pivech jako staří známí.",
    "{v} trenérovi objednal{a} a řekl{a}, že kotel ví, že se maká. Víc nebylo potřeba.",
    "{v} s trenérem probral{a} celou tabulku a došli k tomu, že to není tak zlé.",
    "{v} nabídl{a} trenérovi, že kotel na venkovní zápas vypraví autobus. Podali si ruce.",
    "{v} s trenérem srovnal{a}, co se povedlo a co ne. Oba byli spokojenější než předtím.",
    "{v} trenérovi u piva prozradil{a}, co se chystá do kotle. Prý ať se nechá překvapit.",
  ],
  praha: [
    "{v} s trenérem u piva počíta{l}, kolik lidí přijde, když se hraje ve stejný čas jako liga.",
  ],
};

const CHVALA_HRACE: DistrictPool<string> = {
  core: [
    "{h} dostal u výčepu pivo {co}. Platil{a} {v} a hospoda tleskala. Soupeřem byl tým {souper}.",
    "{v} nedovolil{a} {co} zaplatit ani jedno pivo. {h} to ani nezkoušel.",
    "{h} to musel vyprávět celkem třikrát. Pokaždé to bylo o něco lepší. Soupeřem byl tým {souper}.",
    "{v} připil{a} {co} a řekl{a}, že takhle si to fanoušci představují. {h} zrudl.",
    "{h} přišel na jedno a odcházel po čtyřech. {v} mu {co} objednával{a} jedno za druhým.",
    "{v} poděkoval{a} {co} nahlas před celým lokálem. {h} byl rudý až za ušima.",
  ],
};

const KARANI_OSTRE: DistrictPool<string> = {
  core: [
    "{h} si {co} vyslechl u výčepu narovinu. Mluvil{a} {v} a slyšel to celý lokál.",
    "{v} se {co} zepta{l}, jestli si někdo myslí, že to lidem stačí. {h} neodpověděl.",
    "{h} chtěl {co} něco vysvětlit. {v} ho nenechal{a} domluvit.",
    "{v} řekl{a} {co} přesně to, co si o tom kotel myslí. {h} to vyslechl a nezůstalo to v hospodě.",
    "{h} dostal {co} kázání u výčepu. {v} skonči{l} až s posledním hostem.",
  ],
};

const KARANI_MIRNE: DistrictPool<string> = {
  core: [
    "{h} {co} neslyšel ani slovo. Jen se na něj {v} celý večer díval{a}. To stačilo.",
    "{v} {co} nevyčetl{a} nic. Jen si k jeho stolu nepřisedl{a}, jako jindy. {h} si toho všiml.",
    "{h} se přišel pozdravit. {v} mu {co} podal{a} ruku bez jediného slova.",
    "{v} {co} jen poklepal{a} po rameni a sedl{a} si jinam. {h} zbytek večera mlčel.",
    "{h} zaplatil a odešel dřív. {v} se za ním {co} díval{a} až ke dveřím.",
  ],
};

const ROZBOR_VYHRA_S_HRACEM: DistrictPool<string> = {
  core: [
    "{v} u výčepu znovu a znovu přehrával{a} ten výsledek {skore}. {h} to musel poslouchat třikrát.",
    "{v} kreslil{a} na ubrousek, jak padl druhý gól. {h} si ten ubrousek nechal.",
    "{v} tvrdil{a}, že {skore} je nejlepší zápas za tři roky. {h} neodporoval.",
    "{v} počíta{l}, kam by je ještě mohla tabulka pustit. {h} si přisadil.",
    "{v} nedal{a} pokoj, dokud celý zápas {skore} neodvyprávěl{a} od začátku. {h} u toho byl.",
  ],
};

const ROZBOR_VYHRA_SAM: DistrictPool<string> = {
  core: [
    "{v} rozebíral{a} výsledek {skore} s každým, kdo se zastavil.",
    "{v} mě{l} po výhře {skore} otevřenou náladu i peněženku.",
    "{v} u výčepu tvrdil{a}, že {skore} je začátek něčeho velkého. Hospodský dolil.",
    "{v} vyprávěl{a} o výhře {skore} i lidem, kteří na zápase nebyli a být nechtěli.",
  ],
};

const ROZBOR_REMIZA: DistrictPool<string> = {
  core: [
    "{v} nad tou remízou {skore} krouti{l} hlavou. Prý dva ztracené body, které budou chybět.",
    "{v} tvrdil{a}, že remíza {skore} je horší než prohra. Nikdo se s ním nehádal.",
    "{v} rozebíral{a} remízu {skore} tak dlouho, až mu vystydlo pivo.",
    "{v} počíta{l} na účtence, kde by klub byl, kdyby z remíz byly výhry. Vyšlo to hezky.",
    "{v} po remíze {skore} opakoval{a} celý večer jednu větu: mělo se to dohrát.",
    "{v} o remíze {skore} mluvit nechtěl{a}. Mluvil{a} o ní stejně, jen o hodinu později.",
  ],
  prachatice: [
    "{v} tvrdil{a}, že za remízu {skore} může hřiště, co se klopí k potoku. Půlka hospody přikývla.",
    "{v} po remíze {skore} vzpomínal{a}, jak se na okrese za jeden bod nikdo neradoval.",
  ],
  praha: [
    "{v} po remíze {skore} počíta{l}, kolik takových bodů dělí klub od postupu. Pokaždé to vyšlo jinak.",
  ],
};

const ROZBOR_PROHRA_S_HRACEM: DistrictPool<string> = {
  core: [
    "{v} u stolu rozebíral{a} tu porážku {skore}. {h} seděl vedle a mlčel.",
    "{v} vysvětloval{a}, kde se {skore} prohrálo. Ukazoval{a} to na sklenicích, {h} přikyvoval.",
    "{v} se zepta{l}, jestli si po {skore} někdo z kabiny vůbec něco řekl. {h} pokrčil rameny.",
    "{v} tvrdil{a}, že {skore} se dalo ubránit. {h} to nekomentoval.",
    "{v} necha{l} {h} domluvit a pak vypočítal{a}, kolik takových proher už letos bylo.",
  ],
};

const ROZBOR_PROHRA_SAM: DistrictPool<string> = {
  core: [
    "{v} probíral{a} porážku {skore} až do zavíračky.",
    "{v} po prohře {skore} nechtěl{a} mluvit o fotbale. Vydržel{a} to do druhého piva.",
    "{v} u výčepu tvrdil{a}, že {skore} je jen začátek, pokud se nic nezmění.",
    "{v} počíta{l}, kolikátá prohra to letos byla. U toho čísla si objednal{a} další.",
  ],
};

/** „4 hráče", „5 hráčů". Akuzativ, do vět v poolech sedí nejlíp. */
export function hracuAkuz(n: number): string {
  if (n === 1) return "jednoho hráče";
  return n < 5 ? `${n} hráče` : `${n} hráčů`;
}

/** Dosadí jména do šablony. */
function dosad(sablona: string, nahrady: Record<string, string>): string {
  let s = sablona;
  for (const [k, v] of Object.entries(nahrady)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

/** Vybere variantu z poolu podle indexu od volajícího a dosadí jména. */
function veta(
  pool: DistrictPool<string>,
  v: VudceVHospode,
  o: TextOpts,
  nahrady: Record<string, string>,
): string {
  const pole = districtPoolFor(pool, o.okres);
  const zena = v.gender === "f";
  return dosad(pole[Math.abs(o.varianta ?? 0) % pole.length], {
    // `{i}` je množné číslo o hráčích u stolu. Default je jednotné: u stolu
    // sedí často jen jeden a „Tomáš Sedlák neprotestovali" je vidět hned.
    i: "",
    ...nahrady,
    // `{l}` je celá koncovka (sedě-l / sedě-la), `{a}` jen přípona za hotovým
    // tvarem (řekl / řekl-a). Dva tvary proto, aby šlo psát obojí přirozeně.
    l: zena ? "la" : "l",
    a: zena ? "a" : "",
  });
}

/** Jde dnes do hospody? Rozhoduje archetyp a nálada, ne náhoda samotná. */
export function dorazilDoHospody(v: VudceVHospode, roll: number): boolean {
  const zaklad = DOCHAZKA[v.archetype] ?? 0.3;
  // Naštvaná parta posílá svého člověka do hospody spíš. Je to místo, kde se
  // v okrese řeší věci, co se jinde neřeknou.
  const tlak = 1 + (v.heat / 100) * 0.5 + ((50 - Math.min(50, v.mood)) / 50) * 0.3;
  return roll < Math.min(0.95, zaklad * tlak);
}

/**
 * Co se v hospodě semele mezi vůdcem a hráči.
 *
 * `hracu` je počet hráčů v podniku, `predZapasem` říká, jestli se zítra hraje.
 * Vrací `null`, když se nic nestane, protože ticho je nejčastější výsledek.
 */
export function scenaSVudcem(
  v: VudceVHospode,
  hraci: Array<{ playerId: string; jmeno: string }>,
  opts: { predZapasem: boolean; roll: number; vyberHrace: number } & TextOpts,
): HospodskaScena | null {
  if (hraci.length === 0) {
    // Vůdce v prázdné hospodě. Nic se nestane, ale postěžuje si.
    if (v.heat < 50) return null;
    return {
      type: "vudce_sam",
      text: veta(VUDCE_SAM, v, opts, { v: v.jmeno }),
      playerIds: [],
      moraleDelta: 0,
      fan: { groupId: v.groupId, leaderId: v.leaderId, mood: -1, heat: 2, sentiment: -2,
        duvod: "Neměl si to v hospodě s kým vyříkat." },
    };
  }

  const hrac = hraci[Math.abs(opts.vyberHrace) % hraci.length];
  // V kádru bývají jmenovci, ale „Ondřej Janoušek a Ondřej Janoušek" ve větě
  // vypadá jako chyba generátoru, i když jsou to dva různí lidé.
  const unikatni = [...new Set(hraci.map((h) => h.jmeno))];
  const jmena = unikatni.length <= 2 ? unikatni.join(" a ") : `${unikatni[0]} a další`;
  const i = unikatni.length > 1 ? "i" : "";

  // 1. Večer před zápasem a plná hospoda. Tohle vůdce nenechá být, ať je
  //    jakkoli smířlivý: zítra se hraje.
  if (opts.predZapasem && hraci.length >= HRACU_UZ_MOC) {
    const ostry = v.radikalnost >= 55;
    return {
      type: "vudce_vytka",
      text: veta(ostry ? VYTKA_OSTRA : VYTKA_MIRNA, v, opts, {
        v: v.jmeno, hracu: hracuAkuz(hraci.length),
      }),
      playerIds: hraci.map((h) => h.playerId),
      moraleDelta: ostry ? -4 : -2,
      fan: { groupId: v.groupId, leaderId: v.leaderId, mood: -4, heat: 6, sentiment: -3,
        duvod: `Našel ${hracuAkuz(hraci.length)} v hospodě den před zápasem.` },
    };
  }

  // 2. Naštvaná parta a hráč po ruce. Vyříkají si to.
  if (v.heat >= 55 && opts.roll < 0.45) {
    return {
      type: "vudce_konfrontace",
      text: veta(KONFRONTACE, v, opts, { v: v.jmeno, h: hrac.jmeno }),
      playerIds: [hrac.playerId],
      moraleDelta: -3,
      fan: { groupId: v.groupId, leaderId: v.leaderId, mood: 0, heat: -3, sentiment: 0,
        duvod: `Vyříkal si to s hráčem ${hrac.jmeno} v hospodě.` },
    };
  }

  // 3. Spokojená parta nebo vyjednavač. Runda a klid.
  if (v.mood >= 55 || v.vyjednavani >= 65) {
    if (opts.roll < 0.5) {
      return {
        type: "vudce_runda",
        text: veta(RUNDA, v, opts, { v: v.jmeno, jmena, i }),
        playerIds: hraci.map((h) => h.playerId),
        moraleDelta: 3,
        fan: { groupId: v.groupId, leaderId: v.leaderId, mood: 2, heat: -2, sentiment: 2,
          duvod: "Zaplatil hráčům rundu a odešel spokojený." },
      };
    }
    return {
      type: "vudce_historky",
      text: veta(HISTORKY, v, opts, { v: v.jmeno, h: hrac.jmeno }),
      playerIds: [hrac.playerId],
      moraleDelta: 1,
      fan: { groupId: v.groupId, leaderId: v.leaderId, mood: 1, heat: 0, sentiment: 1,
        duvod: "V hospodě si padli do noty s hráčem." },
    };
  }

  // 4. Vlažno. Jen se pozdraví.
  if (opts.roll < 0.35) {
    return {
      type: "vudce_klid",
      text: veta(KLID, v, opts, { v: v.jmeno, jmena, i }),
      playerIds: [],
      moraleDelta: 0,
      fan: { groupId: v.groupId, leaderId: v.leaderId, mood: 0, heat: 0, sentiment: 0,
        duvod: "" },
    };
  }
  return null;
}

/**
 * Setkání vůdce s trenérem. Ten do hospody chodí jen na vlastní pozvání
 * (`createCoachLedSession`), takže když se potkají, něco to znamená.
 */
export function scenaSTrenerem(
  v: VudceVHospode,
  roll: number,
  opts: TextOpts = {},
): HospodskaScena | null {
  if (v.heat >= 60) {
    return {
      type: "vudce_trener_hadka",
      text: veta(TRENER_HADKA, v, opts, { v: v.jmeno }),
      playerIds: [],
      moraleDelta: 0,
      fan: { groupId: v.groupId, leaderId: v.leaderId, mood: 0, heat: -5, sentiment: -4,
        duvod: "V hospodě si to s tebou vyříkal osobně." },
    };
  }
  if (roll < 0.6) {
    return {
      type: "vudce_trener_pivo",
      text: veta(TRENER_PIVO, v, opts, { v: v.jmeno }),
      playerIds: [],
      moraleDelta: 0,
      fan: { groupId: v.groupId, leaderId: v.leaderId, mood: 3, heat: -4, sentiment: 6,
        duvod: "Dali jste si spolu v hospodě pivo." },
    };
  }
  return null;
}

/**
 * Odhalený zloděj z kádru u stolu (spec incidentů 17h). Kotel mu to dá sežrat a trochu se mu
 * uleví. Hrdinové, kterým vůdce platí rundu, přibudou s pozitivními incidenty.
 */
export function scenaOIncidentu(
  v: VudceVHospode,
  zlodeji: ReadonlyArray<{ playerId: string; jmeno: string }>,
  opts: { roll: number; vyber: number } & TextOpts,
): HospodskaScena | null {
  if (zlodeji.length === 0 || opts.roll >= 0.6) return null;
  const zlodej = zlodeji[Math.abs(opts.vyber) % zlodeji.length];
  const ostry = v.radikalnost >= 55;
  return {
    type: "vudce_zlodej",
    text: veta(ostry ? ZLODEJ_OSTRE : ZLODEJ_MIRNE, v, opts, { v: v.jmeno, h: zlodej.jmeno }),
    playerIds: [zlodej.playerId],
    moraleDelta: ostry ? -6 : -3,
    fan: { groupId: v.groupId, leaderId: v.leaderId, mood: 0, heat: -2, sentiment: -1,
      duvod: "V hospodě si podal zloděje z kádru." },
  };
}


/**
 * Řeči o posledním zápase a o tom, kdo sedí u vedlejšího stolu.
 *
 * Tohle je ta část hospody, kvůli které tam lidi chodí: rozebrat, co se
 * v neděli stalo, a říct to tomu, koho se to týká. Hráč u stolu si vyslechne
 * pochvalu i výtku, a protože je to od fanoušků, hne to i jeho morálkou.
 *
 * Vrací `null`, když není o čem: bez odehraného zápasu se v hospodě mluví
 * o jiných věcech.
 */
export function scenaOZapase(
  v: VudceVHospode,
  zapas: PosledniZapas | null,
  hraci: readonly VykonHrace[],
  opts: { roll: number; vyber: number } & TextOpts,
): HospodskaScena | null {
  if (!zapas) return null;

  const hraliTam = hraci.filter((h) => h.odehral);

  // 1. Někdo u stolu zazářil. To se v hospodě neopomene.
  const hrdina = hraliTam.find((h) => h.goly >= 2)
    ?? hraliTam.find((h) => h.goly >= 1 && zapas.vyhra)
    ?? hraliTam.find((h) => (h.znamka ?? 0) >= 8);
  if (hrdina && opts.roll < 0.7) {
    const co = hrdina.goly >= 2
      ? `za ty dva góly`
      : hrdina.goly >= 1 ? "za gól" : "za výkon";
    return {
      type: "vudce_chvali_hrace",
      text: veta(CHVALA_HRACE, v, opts, {
        v: v.jmeno, h: hrdina.jmeno, co, souper: zapas.souper,
      }),
      playerIds: [hrdina.playerId],
      moraleDelta: 4,
      fan: { groupId: v.groupId, leaderId: v.leaderId, mood: 2, heat: -1, sentiment: 1,
        duvod: `V hospodě chválili ${hrdina.jmeno} za zápas.` },
    };
  }

  // 2. Někdo to pokazil a je tady. Tohle bolí víc než pískot z tribuny.
  const otloukanek = hraliTam.find((h) => h.cervena)
    ?? hraliTam.find((h) => (h.znamka ?? 10) <= 4.5);
  if (otloukanek && !zapas.vyhra && opts.roll < 0.6) {
    const co = otloukanek.cervena ? "za tu červenou" : "za ten výkon";
    const ostry = v.radikalnost >= 55;
    return {
      type: "vudce_kara_hrace",
      text: veta(ostry ? KARANI_OSTRE : KARANI_MIRNE, v, opts, {
        v: v.jmeno, h: otloukanek.jmeno, co,
      }),
      playerIds: [otloukanek.playerId],
      moraleDelta: ostry ? -5 : -2,
      fan: { groupId: v.groupId, leaderId: v.leaderId, mood: 0, heat: -2, sentiment: 0,
        duvod: `V hospodě si podali ${otloukanek.jmeno} za poslední zápas.` },
    };
  }

  // 3. Rozbor zápasu bez konkrétního viníka.
  if (opts.roll < 0.55) {
    const kdo = hraci.length > 0 ? hraci[Math.abs(opts.vyber) % hraci.length] : null;
    const skore = `${zapas.gf}:${zapas.ga}`;
    const n = { v: v.jmeno, h: kdo?.jmeno ?? "", skore, souper: zapas.souper };
    if (zapas.vyhra) {
      return {
        type: "vudce_rozbor_vyhra",
        text: veta(kdo ? ROZBOR_VYHRA_S_HRACEM : ROZBOR_VYHRA_SAM, v, opts, n),
        playerIds: kdo ? [kdo.playerId] : [],
        moraleDelta: kdo ? 2 : 0,
        fan: { groupId: v.groupId, leaderId: v.leaderId, mood: 2, heat: 0, sentiment: 1,
          duvod: "Vyhráli jste a v hospodě se to probíralo." },
      };
    }
    if (zapas.remiza) {
      return {
        type: "vudce_rozbor_remiza",
        text: veta(ROZBOR_REMIZA, v, opts, n),
        playerIds: [],
        moraleDelta: 0,
        fan: { groupId: v.groupId, leaderId: v.leaderId, mood: -1, heat: 1, sentiment: 0,
          duvod: "Remíza, která se v hospodě počítá jako ztráta." },
      };
    }
    return {
      type: "vudce_rozbor_prohra",
      text: veta(kdo ? ROZBOR_PROHRA_S_HRACEM : ROZBOR_PROHRA_SAM, v, opts, n),
      playerIds: kdo ? [kdo.playerId] : [],
      moraleDelta: kdo ? -2 : 0,
      fan: { groupId: v.groupId, leaderId: v.leaderId, mood: -2, heat: 2, sentiment: -1,
        duvod: `Prohra ${skore} se ${zapas.souper} se v hospodě přetřásala.` },
    };
  }

  return null;
}
