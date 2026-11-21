/**
 * Zavolat zpátky (F9): proč volající volal a co řekne, když model nejede.
 *
 * Trenér v Hovorech zavolá zpátky hráči, sponzorovi nebo vůdci kotle (call-back.ts).
 * Hráč to nezvedne a pošle hlasovku, ve které řekne, proč volal. Důvod se bere ze
 * skutečného stavu hráče, ne z textu zmeškaného hovoru: ten je jen nálada a od té
 * doby se mohlo leccos změnit.
 *
 * Bez DB a bez modelu, ať se dá testovat.
 */

import { seedFromString } from "../lib/seed";
import type { AiScenario, PlayerSnapshot } from "./ai-player-scenarios";
import type { KdePije, Situace } from "./chat-kontext";

/** Proč hráč volal. `chat` = nic vážného, jen chtěl slyšet trenéra. */
export type CallBackReason = "unrest" | "injury" | "wants_to_play" | "pub" | "chat";

/** Komu jde volat zpátky. Starosta, komise a redakce se řeší osobně (Hovory.tsx). */
const CALLABLE_CALLERS = new Set(["hrac", "sponzor", "kotel"]);

export function isCallableCaller(caller: string): boolean {
  return CALLABLE_CALLERS.has(caller);
}

/** Truc po přestupu od téhle úrovně (stejná hranice jako u scénářů o přestupu). */
const UNREST_LEVEL = 40;
/** Nálada pod touhle hranicí je nespokojenost, i když odejít nechce. */
const UNHAPPY_MORALE = 35;
/** Kdo za poslední měsíc odehrál míň, chce hrát. */
const FEW_MINUTES = 90;
/** Od téhle chuti na alkohol volal nejspíš z hospody. */
const PUB_ALCOHOL = 70;

export interface CallBackMoment {
  situation: Situace;
  drinksAt: KdePije | null;
}

/**
 * Proč hráč volal. Pořadí je pořadí vážnosti: kdo chce pryč, neřeší hospodu,
 * a zraněný si nestěžuje na lavičku.
 */
export function pickCallBackReason(p: PlayerSnapshot, now: CallBackMoment): CallBackReason {
  if ((p.transferUnrest ?? 0) >= UNREST_LEVEL || p.morale < UNHAPPY_MORALE) return "unrest";
  const away = !!p.injury && p.injury.daysLeft > 0;
  if (away && !p.injury!.volno) return "injury";
  if (!away) {
    const benched = p.lastMatchSquad === "bench" || p.lastMatchSquad === "out";
    const unknownSquad = p.lastMatchSquad === undefined || p.lastMatchSquad === "absent";
    if (benched || (unknownSquad && p.recentMinutes < FEW_MINUTES)) return "wants_to_play";
  }
  if (now.situation === "pije" || p.alcohol >= PUB_ALCOHOL) return "pub";
  return "chat";
}

/**
 * Úvod všech scénářů. Popis scénáře dostává model i u dalších odpovědí, proto minulý čas:
 * hlasovka je první zpráva vlákna, další už jsou SMS.
 */
const INTRO = "Volal jsi trenérovi a on to nevzal. Pak volal zpátky on tobě, ty jsi to nestihl zvednout, "
  + "a tak jsi mu nahrál hlasovku (tvoje první zpráva), ve které říkáš, proč jsi volal.";

const scenario = (id: string, label: string, category: AiScenario["category"], expectedTurns: 2 | 3, why: string): AiScenario => ({
  id, label, category, expectedTurns, description: `${INTRO} ${why}`, weight: () => 0,
});

/** Scénáře vlákna po zpětném hovoru. `weight` 0: náhodný spawn je nevylosuje. */
export const CALL_BACK_SCENARIOS: readonly AiScenario[] = [
  scenario("call_back_unrest", "Zpětný hovor: nespokojenost", "complaint", 3,
    "Volal jsi, protože nejsi v klubu spokojený. Řekni narovinu, co tě štve, podle toho, co o sobě víš níž "
    + "(nálada, přestup, jak s tebou trenér jedná). Nevymýšlej si nabídky ani kluby, které níž nejsou."),
  scenario("call_back_injury", "Zpětný hovor: zranění", "personal", 2,
    "Volal jsi kvůli svému zranění. Řekni, jak na tom jsi a jestli něco potřebuješ. Drž se toho, co o svém zdraví víš níž, "
    + "nic nepřidávej a čísla neříkej."),
  scenario("call_back_wants_to_play", "Zpětný hovor: chce hrát", "complaint", 2,
    "Volal jsi, protože chceš hrát. Poslední dobou moc nehraješ a chceš vědět, jestli s tebou trenér na další zápas počítá."),
  scenario("call_back_pub", "Zpětný hovor: hospoda", "personal", 2,
    "Volal jsi kvůli hospodě. Jestli zrovna sedíš v hospodě, zveš trenéra, ať se staví na pivo. Jestli ne, přiznáš, "
    + "že jsi mu volal večer z hospody s partou v náladě, a podle povahy to zlehčíš nebo se omluvíš."),
  scenario("call_back_chat", "Zpětný hovor: jen tak", "personal", 2,
    "Nic vážného se neděje. Volal jsi, protože jsi chtěl slyšet, jak trenér vidí tým po posledních zápasech. "
    + "Nevymýšlej si stížnost ani žádost."),
];

const SCENARIO_BY_REASON: Record<CallBackReason, string> = {
  unrest: "call_back_unrest",
  injury: "call_back_injury",
  wants_to_play: "call_back_wants_to_play",
  pub: "call_back_pub",
  chat: "call_back_chat",
};

export function callBackScenario(reason: CallBackReason): AiScenario {
  return CALL_BACK_SCENARIOS.find((s) => s.id === SCENARIO_BY_REASON[reason])!;
}

/** Co o hráči víme pro záložní text bez modelu. */
export interface FallbackFacts {
  injuryDescription: string | null;
  injuryDaysLeft: number;
  /** Klub, kam chtěl při trucu odejít (`life_context.transferUnrest.teamName`). */
  transferTeam: string | null;
  /** Zrovna sedí v hospodě. */
  drinkingNow: boolean;
}

function pick<T>(items: readonly T[], seed: string): T {
  return items[seedFromString(seed) % items.length];
}

/** Doba zranění slovy, v textech pro hráče čísla jen u peněz. */
function healingWords(daysLeft: number): string {
  if (daysLeft <= 3) return "pár dní";
  if (daysLeft <= 10) return "tak týden, možná dva";
  return "dlouho";
}

function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLocaleLowerCase("cs") + text.slice(1) : text;
}

/**
 * Hlasovka bez modelu (AI vypnutá nebo výpadek). Pár hotových vět na důvod, výběr podle
 * seedu, ať stejný hovor vyzní pokaždé stejně.
 */
export function playerFallbackText(reason: CallBackReason, f: FallbackFacts, seed: string): string {
  switch (reason) {
    case "unrest":
      return f.transferTeam
        ? pick([
          `Trenére, to jsem volal já. Pořád mi leží v hlavě ten přestup do ${f.transferTeam}. Tady se teď necítím dobře a chci to s váma vyřešit, ne to dusit v sobě.`,
          `To jsem byl já. Volal jsem kvůli tomu přestupu do ${f.transferTeam}, pořád na to myslím. Ozvěte se mi, ať to nějak uzavřem.`,
        ], seed)
        : pick([
          "Trenére, to jsem volal já. Nejsem tu teď spokojenej a chtěl jsem vám to říct sám, ne přes kluky. Ozvěte se mi, potřebuju to vyřešit.",
          "Zdravím, volal jsem, protože mě to tu přestává bavit. Mám pocit, že se mnou nikdo nepočítá. Napište mi, jak to vidíte vy.",
        ], seed);
    case "injury": {
      const what = f.injuryDescription ? lowerFirst(f.injuryDescription.trim()) : "to zranění";
      const time = healingWords(f.injuryDaysLeft);
      return pick([
        `Trenére, to jsem volal já. Pořád mě trápí ${what}, bude to ještě ${time}. Chtěl jsem, ať víte, že na tom makám a vrátím se co nejdřív.`,
        `Volal jsem kvůli zranění, trápí mě ${what}. Hojí se to pomalu, ještě ${time} to potrvá. Kdybyste chtěl, můžu aspoň chodit fandit.`,
      ], seed);
    }
    case "wants_to_play":
      return pick([
        "Trenére, to jsem volal já. Chci hrát. Koukat na zápasy z lavičky mě ničí a doma se mě ptaj, jestli ještě vůbec kopu. Dejte mi šanci, nezklamu vás.",
        "Zdravím, volal jsem, jestli se mnou na další zápas počítáte. Poslední dobou skoro nehraju a nevím, co dělám špatně. Řekněte mi to narovinu.",
      ], seed);
    case "pub":
      return f.drinkingNow
        ? pick([
          "Trenére, to jsem volal já! Sedíme s klukama v hospodě a je tu veselo. Stavte se na jedno, dneska platím já!",
          "Haló trenére, tady hospoda! Kluci se ptaj, kde jste. Přijďte na pivo, zasloužíme si to.",
        ], seed)
        : pick([
          "Jo, to jsem volal já. Byli jsme večer s klukama v hospodě a chtěl jsem vás vytáhnout na pivo. Asi jsem to trochu přehnal, tak se nezlobte.",
          "To jsem byl já, volal jsem z hospody. Seděli jsme tam s partou a napadlo mě, že byste mohl přijít. Dneska už jsem zase v pohodě.",
        ], seed);
    case "chat":
      return pick([
        "Zdravím trenére, to jsem volal já. Nic hroznýho, jen jsem chtěl slyšet, jak to vidíte s týmem. Po posledních zápasech je to v kabině takový nijaký.",
        "To jsem byl já. Nic se neděje, jen jsem chtěl pokecat, jak to s náma vidíte. Kdyžtak se ozvěte.",
      ], seed);
  }
}

/** Sponzor volá po sérii proher (engine/missed-calls.ts). Při zpětném hovoru řekne, o co šlo. */
export function sponsorCallBackText(s: { losingStreak: number }, seed: string): string {
  if (s.losingStreak >= 3) {
    return pick([
      "Dobrý den, díky, že voláte zpátky. Volal jsem kvůli té sérii proher. U nás ve firmě se začínají ptát, jestli to s klubem má smysl. Napište mi, jak to chcete otočit.",
      "Dobrý den, to jsem volal já. Po těch prohrách mám na stole otázky od kolegů, proč do vás dáváme peníze. Potřebuju od vás slyšet, co s tím uděláte.",
    ], seed);
  }
  return pick([
    "Dobrý den, díky za zavolání. Volal jsem, když se vám nedařilo, ale teď už to vypadá líp. Tak ať vám to vydrží, držíme palce.",
    "Dobrý den, to jsem volal já. Chtěl jsem probrat, jak se vám daří, ale mezitím jste se chytili. Kdybyste něco potřeboval, napište mi.",
  ], seed);
}

/** Vůdce kotle volá při podpisovce nebo když je kotel naštvaný. Tyká, jako všude jinde. */
export function leaderCallBackText(s: { campaign: boolean; heat: number }, seed: string): string {
  if (s.campaign) {
    return pick([
      "Jo, volal jsem kvůli tý podpisovce. Kluci v kotli to myslej vážně. Jestli chceš, ať to stáhnem, budeš nám muset něco nabídnout. Co navrhuješ?",
      "To jsem byl já. Podpisy se sbíraj dál a já je nezastavím, když mi nedáš důvod. Tak mi řekni, proč bysme tě měli nechat.",
    ], seed);
  }
  if (s.heat >= 55) {
    return pick([
      "Volal jsem, protože kotel je naštvanej. Takhle se na to koukat nedá. Co s tím uděláš?",
      "Jo, to jsem byl já. Kluci v hospodě remcaj a já jim nemám co říct. Řekni mi, jak to chceš zlepšit.",
    ], seed);
  }
  return pick([
    "Jo, volal jsem. Mezitím se to uklidnilo, ale kluci chtěj vědět, že to s náma myslíš vážně. Stav se někdy za náma do hospody, jo?",
    "To jsem byl já. Už je to dobrý, jen jsem chtěl, abys věděl, že kotel stojí za týmem. Tak ať to tak zůstane.",
  ], seed);
}
