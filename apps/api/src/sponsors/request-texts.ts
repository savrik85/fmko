/**
 * Texty k prosbě o příspěvek: zpráva trenéra a odpovědi majitele firmy.
 * Značky: {castka}, {ucel} (4. pád: „na {ucel}"), {termin} a {kdy} (datum d. m.).
 */
import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import type { OwnerPersonality } from "./owners";
import { PURPOSE_LABELS, type RequestPurpose, type RequestRefusal } from "./requests";

export interface RequestTextVars {
  castka?: number;
  ucel?: RequestPurpose;
  /** Herní den YYYY-MM-DD. */
  termin?: string;
  kdy?: string;
}

function kc(n: number): string {
  return `${Math.round(n).toLocaleString("cs-CZ")} Kč`;
}

function dayMonth(day: string): string {
  const [, m, d] = day.slice(0, 10).split("-").map(Number);
  return `${d}. ${m}.`;
}

function fill(t: string, v: RequestTextVars): string {
  return t
    .replaceAll("{castka}", v.castka !== undefined ? kc(v.castka) : "")
    .replaceAll("{ucel}", v.ucel ? PURPOSE_LABELS[v.ucel] : "")
    .replaceAll("{termin}", v.termin ? dayMonth(v.termin) : "")
    .replaceAll("{kdy}", v.kdy ? dayMonth(v.kdy) : "");
}

function pick(pool: readonly string[], vars: RequestTextVars, seedKey: string): string {
  return fill(createRng(seedFromString(seedKey)).pick([...pool]), vars);
}

/** Zpráva trenéra majiteli. Vlastní poznámka trenéra jde za ni. */
export function coachRequestText(vars: RequestTextVars, note: string | null): string {
  const base = fill("Dobrý den, chtěl bych vás poprosit o příspěvek {castka} na {ucel}.", vars);
  const extra = note?.trim();
  return extra ? `${base} ${extra}` : base;
}

const GRANTED: Record<OwnerPersonality, readonly string[]> = {
  fan: [
    "Na {ucel}? To se nemusíte ptát dvakrát. {castka} vám pošlu ještě dnes. Ať je to vidět na hřišti!",
    "Beru. {castka} máte na účtu, ať z toho něco je. Fandím vám!",
  ],
  patriot: [
    "Pro náš klub rád. {castka} na {ucel} vám posílám, ať se u nás něco hne.",
    "Když je to pro kluky od nás, tak ano. {castka} máte na účtu.",
  ],
  businessman: [
    "Dobře, {castka} na {ucel} dám. Počítám, že to bude vidět ve výsledcích.",
    "Rozumná investice. {castka} vám převedu.",
  ],
  cautious: [
    "Tak dobře. {castka} vám pošlu. Ale žádné vyhazování peněz, ano?",
    "Po zvážení ano. {castka} máte na účtu. Doufám, že to použijete rozumně.",
  ],
};

const PARTIAL: Record<OwnerPersonality, readonly string[]> = {
  fan: [
    "Tolik teď nemám, ale {castka} na {ucel} vám pošlu. Víc to letos nejde.",
    "Celé ne, ale {castka} dám. Ať to na hřišti stojí za to!",
  ],
  patriot: [
    "Všechno ne, ale {castka} pro klub dám. Víc teď opravdu nemůžu.",
    "Pomůžu, jak můžu: {castka} na {ucel}. Na víc to teď není.",
  ],
  businessman: [
    "Tolik ne. Můžu dát {castka}, víc mi to teď nedává smysl.",
    "Za tu částku ne, ale {castka} na {ucel} převedu.",
  ],
  cautious: [
    "To je na mě moc. {castka} vám dát můžu, víc ne.",
    "Opatrně. Pošlu {castka}, zbytek budete muset sehnat jinde.",
  ],
};

const REFUSED: Record<RequestRefusal, readonly string[]> = {
  broken: [
    "Minule jste peníze utratil za něco jiného, než jste slíbil. Letos ode mě nedostanete nic.",
    "Po tom, co se stalo s mými penězi minule? Letos už ne.",
  ],
  too_soon: [
    "Zase vy? Psal jste mi před pár dny. Dejte mi pokoj.",
    "Pane trenére, nejsem bankomat. Ozvěte se až za nějaký čas.",
  ],
  dislike: [
    "Promiňte, ale s vaším klubem si teď nerozumíme. Peníze nedám.",
    "Na to naše vztahy nejsou. Nejdřív se ukažte a pak se uvidí.",
  ],
  stranger: [
    "Nejsem váš sponzor a moc se neznáme. Na to je ještě brzo.",
    "Proč zrovna já? Nemáme spolu ani smlouvu. Zkuste to u svého sponzora.",
  ],
  exhausted: [
    "Poslední dobou jsem vám dal dost. Zkuste to po {kdy}.",
    "Teď už ne, toho bylo poslední dobou hodně. Ozvěte se po {kdy}.",
  ],
};

/** Vyčerpáno, ale bez daru v okně (firma má na klub jen drobné): není kdy „zkusit znovu". */
const EXHAUSTED_NO_DATE: readonly string[] = [
  "Na tohle teď peníze nemám. Zkuste to jindy.",
  "Víc než drobné vám teď dát nemůžu, promiňte.",
];

/** Připomínka lhůty k odpovědi, když peníze přijdou. */
const DEADLINE_NOTE = " Do {termin} chci vidět, že jste je utratil tak, jak říkáte.";

export function requestReplyText(
  kind: "granted" | "partial" | "refused", personality: OwnerPersonality, vars: RequestTextVars,
  refusal: RequestRefusal | null, seedKey: string,
): string {
  if (kind === "refused") {
    if (refusal === "exhausted" && !vars.kdy) return pick(EXHAUSTED_NO_DATE, vars, seedKey);
    return pick(REFUSED[refusal ?? "dislike"], vars, seedKey);
  }
  const pool = kind === "granted" ? GRANTED[personality] : PARTIAL[personality];
  return pick(pool, vars, seedKey) + fill(DEADLINE_NOTE, vars);
}

const KEPT: readonly string[] = [
  "Vidím, že peníze šly na {ucel}. Tak to má být, díky.",
  "Slovo platí, peníze šly na {ucel}. Na vás je spoleh.",
];

const BROKEN: readonly string[] = [
  "Dal jsem vám {castka} na {ucel} a nevidím z toho nic. Tohle si zapamatuju, letos už ode mě nic nečekejte.",
  "Peníze na {ucel} jste utratil jinde. Tak to se nedělá. Letos už na mě nepočítejte.",
];

export function requestCheckText(kept: boolean, vars: RequestTextVars, seedKey: string): string {
  return pick(kept ? KEPT : BROKEN, vars, seedKey);
}
