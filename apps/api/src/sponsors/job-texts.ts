/**
 * Sežeň mu práci (F8): co majitel firmy odpoví, co má říct model a co napíše hráč.
 * Značky: {player} = jméno a příjmení hráče v 1. pádě, {job} = povolání malým písmenem
 * v 1. pádě (za „jako"), {firm} = název firmy v 1. pádě. Majitel vyká (jako u prosby o peníze),
 * žádná dlouhá pomlčka.
 */
import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import type { JobRefusal } from "./player-jobs";

export interface JobTextVars {
  player: string;
  job?: string;
  firm?: string;
}

function fill(t: string, v: JobTextVars): string {
  return t.replaceAll("{player}", v.player).replaceAll("{job}", (v.job ?? "").toLowerCase()).replaceAll("{firm}", v.firm ?? "");
}

function pick(pool: readonly string[], v: JobTextVars, seedKey: string): string {
  return fill(createRng(seedFromString(seedKey)).pick([...pool]), v);
}

const HIRED = [
  "Dobře, {player} může nastoupit od pondělí, bude u nás jako {job}. Jednou si o laskavost řeknu.",
  "Platí. Ať se {player} staví v pondělí v sedm, vezmu ho jako {job}. Kvůli klubu to rád udělám.",
  "Domluveno, {player} u nás může dělat jako {job}. Ale něco za něco, časem se ozvu.",
];

const REFUSED: Record<JobRefusal, readonly string[]> = {
  dislike: [
    "Nezlobte se, ale pro lidi z vašeho klubu teď nic nemám.",
    "Promiňte, ale tohle teď neudělám. Poslední dobou mi klub moc radosti nedělá.",
  ],
  stranger: [
    "Nezlobte se, ale s vaším klubem nemám smlouvu a lidi beru jen přes známé.",
    "Promiňte, s vaším klubem nemám nic společného. Lidi si vybírám sám.",
  ],
  full: [
    "Letos už jsem nabral, koho jsem potřeboval. Víc lidí teď neuživím.",
    "Bohužel, teď je plno. Zkuste to u mě příští sezónu.",
  ],
  too_soon: [
    "O tom jsme se bavili před pár dny a od té doby se nic nezměnilo.",
    "Tohle jsem vám nedávno říkal. Teď to nepůjde.",
  ],
  too_young: [
    "Vždyť je to ještě kluk. Ať se nejdřív vyučí, pak se uvidí.",
    "Takhle mladýho nevezmu, ať dodělá školu.",
  ],
  student: [
    "Ať nejdřív dostuduje. Na brigádu v létě se mi pak může ozvat.",
    "Student mi tu nepomůže, potřebuju někoho na celý den.",
  ],
  retired: [
    "Ten už si zaslouží odpočinek, ne šichty u mě.",
    "V jeho letech už ho do práce nevezmu, ať si užívá.",
  ],
  already_hired: [
    "{player} už u nás přece dělá.",
    "Vždyť {player} u mě už maká. Snad o tom víte.",
  ],
};

const ASK_WHO = [
  "A pro koho přesně? Napište mi jméno.",
  "Koho myslíte? Napište mi jméno a příjmení.",
];

const ASK_WHICH = [
  "Myslíte kterého? Máte jich víc, napište mi i křestní jméno.",
  "Kterého z nich? Napište mi celé jméno.",
];

const DUPLICATE = [
  "O tom jsme se dnes už bavili.",
  "Tohle jsme dnes už probrali.",
];

export function jobHiredText(v: JobTextVars, seedKey: string): string {
  return pick(HIRED, v, seedKey);
}

export function jobRefusedText(refusal: JobRefusal, v: JobTextVars, seedKey: string): string {
  return pick(REFUSED[refusal], v, seedKey);
}

export function jobAskWhoText(ambiguous: boolean, seedKey: string): string {
  return pick(ambiguous ? ASK_WHICH : ASK_WHO, { player: "" }, seedKey);
}

export function jobDuplicateText(seedKey: string): string {
  return pick(DUPLICATE, { player: "" }, seedKey);
}

/** Co má model v odpovědi majitele sdělit (výsledek rozhodla hra). */
export function jobInstruction(
  outcome: { kind: "hired"; job: string } | { kind: "refused"; refusal: JobRefusal } | { kind: "duplicate" },
  playerName: string,
): string {
  if (outcome.kind === "duplicate") return "Odpověz, že o práci pro hráče jste se dnes už bavili. Nic nového neslibuj.";
  if (outcome.kind === "hired") {
    return `Vyhovíš mu: hráč ${playerName} může u tebe ve firmě nastoupit jako ${outcome.job.toLowerCase()}. `
      + `Řekni to a jmenuj ho. Ať se staví v pondělí ráno. Dej najevo, že to děláš kvůli klubu a že si časem řekneš o laskavost. Peníze nezmiňuj.`;
  }
  switch (outcome.refusal) {
    case "dislike": return `Odmítni. S jeho klubem teď nemáš dobrý vztah a hráče ${playerName} do firmy nevezmeš.`;
    case "stranger": return "Odmítni zdvořile. Nejsi sponzor jeho klubu a lidi do firmy bereš jen na doporučení známých.";
    case "full": return "Odmítni. Letos už jsi nabral, koho jsi potřeboval, a víc lidí teď neuživíš.";
    case "too_soon": return `Odmítni. O práci pro hráče ${playerName} jste se bavili před pár dny a od té doby se nic nezměnilo.`;
    case "too_young": return `Odmítni. Hráč ${playerName} je ještě kluk, ať se nejdřív vyučí.`;
    case "student": return `Odmítni. Hráč ${playerName} je student, ať nejdřív dostuduje. Na letní brigádu se ti může ozvat.`;
    case "retired": return `Odmítni. Hráč ${playerName} je na práci u tebe už moc starý, ať si užívá.`;
    case "already_hired": return `Řekni mu, že hráč ${playerName} už u tebe ve firmě dělá.`;
  }
}

const PLAYER_THANKS_UNEMPLOYED = [
  "Trenére, {firm} mě bere! Od pondělí makám. Fakt díky, tohle vám nezapomenu.",
  "Volal mi šéf od firmy {firm}, že můžu nastoupit. Díky moc, trenére, spadl mi kámen ze srdce.",
  "Trenére, mám práci! Nastupuju k firmě {firm}. Díky, bez vás bych doma ještě koukal do zdi.",
];

const PLAYER_THANKS_EMPLOYED = [
  "Trenére, přecházím k firmě {firm}. Šéf říkal, že mě na zápasy vždycky pustí. Díky!",
  "Díky za tu práci u firmy {firm}, trenére. Konečně žádný šichty o víkendu.",
];

/** Poděkování hráče, který díky trenérovi dostal práci. */
export function jobPlayerThanksText(unemployed: boolean, v: JobTextVars, seedKey: string): string {
  return pick(unemployed ? PLAYER_THANKS_UNEMPLOYED : PLAYER_THANKS_EMPLOYED, v, seedKey);
}

/** Všechny šablony (kontrola dlouhých pomlček a zbylých značek v testu). */
export const ALL_JOB_TEMPLATES: readonly string[] = [
  ...HIRED, ...Object.values(REFUSED).flat(), ...ASK_WHO, ...ASK_WHICH, ...DUPLICATE,
  ...PLAYER_THANKS_UNEMPLOYED, ...PLAYER_THANKS_EMPLOYED,
];
