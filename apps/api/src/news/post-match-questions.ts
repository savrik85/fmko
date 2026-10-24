/**
 * Šablonové otázky pozápasového rozhovoru.
 *
 * Používají se, když Gemini není k dispozici nebo selže. Rozhovor musí vzniknout
 * vždycky — kdyby výpadek v cronu znamenal, že se hráč o funkci vůbec nedozví,
 * byla by celá fáze k ničemu.
 *
 * Deterministické: varianta se vybírá seedem zápasu, ne `Math.random()`, aby
 * opakovaný běh dal tentýž rozhovor.
 */

import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import type { PostMatchContext, TopicKey } from "./post-match-context";

function pick(rng: { int: (a: number, b: number) => number }, arr: readonly string[]): string {
  return arr[rng.int(0, arr.length - 1)];
}

function vysledekQuestions(c: PostMatchContext): string[] {
  const skore = `${c.ownScore}:${c.oppScore}`;
  // Vedle neutrálních otázek i rýpavé, ať redaktor není jen tiskový mluvčí.
  // Rýpou jen do toho, co je ve výsledku vidět, nic si nedomýšlí.
  if (c.outcome === "win") {
    return [
      `Bereš tři body za ${skore} s ${c.opponentName}. Co rozhodlo?`,
      `Vyhráli jste ${skore}. Byl to výkon, na kterém se dá stavět, nebo spíš zápas, co se odehrál sám?`,
      `${skore} nad ${c.opponentName}, čekal jsi to takhle, nebo tě mužstvo překvapilo?`,
      `${skore}. Vyhráli jste vy, nebo spíš prohrál ${c.opponentName}?`,
    ];
  }
  if (c.outcome === "loss") {
    const thrashing = c.oppScore - c.ownScore >= 3;
    return [
      `Prohra ${skore} s ${c.opponentName}. Kde se to zlomilo?`,
      `${skore} doma i venku bolí. Co budeš v kabině říkat?`,
      `Odjíždíte s ${skore}. Byl soupeř lepší, nebo jste si to udělali sami?`,
      `Prohra ${skore}. Kdo za ni nese vinu víc, hráči, nebo trenér?`,
      thrashing
        ? `${skore} je výprask. Dlužíte fanouškům omluvu?`
        : `${skore}. Poslouchá tě ještě kabina?`,
    ];
  }
  return [
    `Remíza ${skore}. Bod dobrý, nebo ztracené dva?`,
    `${skore} s ${c.opponentName}, spokojenost, nebo zklamání?`,
    `Dělíte se o body. Sáhli jste si na víc?`,
    `Zase jen ${skore}. Nestačí ti to málo?`,
  ];
}

function rozhodciQuestions(c: PostMatchContext): string[] {
  const jmeno = c.refereeName ?? "rozhodčí";

  if (c.incident) {
    const minuta = `${c.incident.minute}. minutě`;
    switch (c.incident.kind) {
      case "neuznany_gol":
        return [`V ${minuta} sudí ${jmeno} neuznal gól. Viděl jsi to stejně jako on?`];
      case "vymyslena_penalta":
        return [`Penalta v ${minuta} od ${jmeno} vyvolala dusno. Co na ni říkáš?`];
      case "neodpiskana_penalta":
        return [`V ${minuta} jste chtěli penaltu a ${jmeno} mávl, ať se hraje. Jak jsi to viděl?`];
      case "chybna_cervena":
        return [`Červená v ${minuta} zamávala zápasem. Byla podle tebe na místě?`];
      case "prehlednuta_cervena":
        return [`Zákrok v ${minuta} skončil jen žlutou. Měl ${jmeno} sáhnout hloub do kapsy?`];
      case "sporny_primak":
        return [`Přímý kop v ${minuta} se hodně řešil. Byl to faul?`];
    }
  }

  // Bez sporné situace se ptáme na to, co v zápase objektivně bylo — nikdy
  // nenaznačovat, že se něco stalo.
  const out: string[] = [];
  if (c.ownCards + c.oppCards >= 5) {
    out.push(`${jmeno} rozdal ${c.ownCards + c.oppCards} karet, z toho ${c.ownCards} vám. Kouskoval zápas zbytečně?`);
  }
  if (c.ownCards >= 3) {
    out.push(`Odnesli jste to ${c.ownCards} kartami. Byla to vaše nedisciplinovanost, nebo jeho metr?`);
  }
  out.push(`${jmeno} je známý tím, že ${c.refereeTrait ?? "má svůj metr"}. Jak se s ním hrálo?`);
  out.push(`Pomohl ${jmeno} zápasu, nebo ho spíš zbytečně přerušoval?`);
  return out;
}

function vyrokQuestions(c: PostMatchContext): string[] {
  if (c.opponentStatement) {
    const kdo = c.opponentManagerName ?? `trenér ${c.opponentName}`;
    const uryvek = c.opponentStatement.quote.length > 90
      ? c.opponentStatement.quote.slice(0, 87) + "…"
      : c.opponentStatement.quote;
    return [
      `Před zápasem ${kdo} prohlásil: „${uryvek}" Co na to teď?`,
      `${kdo} si před zápasem neodpustil poznámku — „${uryvek}". Vrátil jsi mu to na hřišti?`,
    ];
  }
  return [
    `Jak se ti hrálo proti ${c.opponentName}? Sedí vám na sebe?`,
    `S ${c.opponentName} se potkáváte pravidelně. Co je na nich nejnepříjemnější?`,
  ];
}

/** Kauza z dat a k ní přímá otázka. Fakt je hotová věta, otázka nic nepřidává. */
function scandalQuestions(fact: string): string[] {
  return [
    `${fact} Co na to říkáš?`,
    `${fact} Jak to vysvětlíš?`,
    `${fact} Je to v pořádku?`,
    `Okres řeší jedno: ${fact} Tvůj komentář?`,
  ];
}

/**
 * Poskládá otázky bez pomoci LLM. Vrací dvojici otázka + téma, aby zůstalo
 * jasné, na co která odpovídá — na tom stojí klasifikace odpovědí i validace.
 *
 * Kauza nahrazuje obecnou otázku na soupeře. Když ale soupeřův trenér před
 * zápasem něco prohlásil, zůstanou obě, protože citát je sám o sobě konfrontace.
 */
export function buildFallbackQuestions(c: PostMatchContext): Array<{ question: string; key: TopicKey; ref?: string }> {
  const rng = createRng(seedFromString(`postmatch|${c.matchId}|${c.teamId}`));
  const out: Array<{ question: string; key: TopicKey; ref?: string }> = [
    { question: pick(rng, vysledekQuestions(c)), key: "vysledek" },
  ];
  // Otázka na rozhodčího odpadá u zápasů odehraných před jeho zavedením.
  if (c.refereeName) out.push({ question: pick(rng, rozhodciQuestions(c)), key: "rozhodci" });
  if (c.scandal) out.push({ question: pick(rng, scandalQuestions(c.scandal.fact)), key: "scandal", ref: c.scandal.ref });
  if (c.opponentStatement || !c.scandal) out.push({ question: pick(rng, vyrokQuestions(c)), key: "vyrok_soupere" });
  return out;
}
