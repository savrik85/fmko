/**
 * Kontext pozápasového rozhovoru — fakta ze zápasu a klasifikace odpovědí.
 *
 * Klasifikace má vlastní deterministický lexikon, který slouží dvakrát: jako
 * náhrada, když Gemini selže, a jako kontrola proti tomu, aby model odpovědí
 * přesvědčil, že trenér sudího chválil, když text říká opak.
 */

export type TopicKey = "vysledek" | "rozhodci" | "vyrok_soupere";

export type Postoj = "kritika" | "neutral" | "obhajoba";

export interface PostMatchIncident {
  minute: number;
  kind: string;
  severity: "high" | "medium" | "low";
  text: string;
}

export interface PostMatchContext {
  matchId: string;
  teamId: string;
  teamName: string;
  opponentName: string;
  opponentManagerName: string | null;
  /** Trenér, se kterým se mluví — bez něj si model plete redaktora s trenérem. */
  ownManagerName: string | null;
  ownScore: number;
  oppScore: number;
  outcome: "win" | "draw" | "loss";
  ownCards: number;
  oppCards: number;
  /** Vyloučení zvlášť — jedna červená je téma sama o sobě, i když karet bylo málo. */
  ownReds: number;
  oppReds: number;
  ownPenalties: number;
  oppPenalties: number;
  hardness: string;
  refereeName: string | null;
  /** Slovní charakteristika sudího do otázky — nikdy čísla. */
  refereeTrait: string | null;
  /** Sporná situace, která se týkala tohohle týmu (nebo mu naopak nahrála). */
  incident: PostMatchIncident | null;
  opponentStatement: { quote: string; tone: string } | null;
  scorers: string[];
  gameWeek: number | null;
}

// ── Lexikální klasifikace postoje k rozhodčímu ───────────────────────────────

/** Slova, podle kterých se pozná, že řeč je o sudím. */
const REF_WORDS = [
  "sud", "rozhodč", "píšťal", "pisk", "písk", "verdikt", "metr", "pravidl",
];

/**
 * Fráze, které o rozhodčím mluví samy o sobě — nepotřebují, aby ho věta jmenovala.
 * Pozor na české tvary: „okrádá" má háček, „okradl" ne, obojí musí projít.
 */
const CRITICISM_STRONG = [
  "okrad", "okrád", "zloděj", "slep", "kupovan", "jednostran", "zabil nám",
  "vyhodil nás", "domácí pískání", "co nebyla", "co nebyl", "poškodil",
  "nikdy nepískal", "měl si nechat", "proti nám",
];

/**
 * Obecně negativní slova. Počítají se jen tehdy, když je ve větě řeč o sudím —
 * jinak by „hráli jsme jako amatéři, byla to katastrofa" bylo bráno jako urážka
 * rozhodčího, přestože trenér nadává vlastnímu mužstvu.
 */
const CRITICISM_GENERIC = [
  "ostuda", "katastrof", "nesmysl", "skandál", "hanb", "podvod", "tragéd",
  "amatér", "neuměl", "nesahá", "k ničemu", "výsměch",
];

const DEFENCE = [
  "chyba se stane", "taky jen člověk", "měl to těžk", "odpískal to dobře",
  "byl v pohodě", "nemá to lehk", "nemůže za to", "zvládl to", "nezlobím se",
  "rozhodl správně", "viděl to dobře", "nemám mu co vyčítat", "odvedl to",
  "nic mu nevyčítám", "pískal dobře",
];

const BOOSTERS = ["absolutn", "napros", "hnus", "skandál", "vůbec", "nechutn"];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Určí postoj k rozhodčímu z volného textu. Čistá funkce, bez LLM.
 *
 * Vrací `neutral` i tehdy, když text o sudím vůbec není — trenér se prostě
 * vyjádřil k něčemu jinému a nikdo za to nemá být trestán.
 */
export function classifyRefereeStance(raw: string | null | undefined): { postoj: Postoj; sila: number } {
  const text = normalize(raw ?? "");
  if (text.length < 3) return { postoj: "neutral", sila: 0 };

  const mluviOSudim = REF_WORDS.some((w) => text.includes(w));

  const silna = CRITICISM_STRONG.filter((w) => text.includes(w)).length;
  const obecna = mluviOSudim ? CRITICISM_GENERIC.filter((w) => text.includes(w)).length : 0;
  const kritika = silna + obecna;
  const obhajoba = DEFENCE.filter((w) => text.includes(w)).length;

  if (kritika === 0 && obhajoba === 0) return { postoj: "neutral", sila: 0 };

  const boosters = BOOSTERS.filter((w) => text.includes(w)).length
    + (text.includes("!") ? 1 : 0)
    + (/[A-ZÁ-Ž]{3,}/.test(raw ?? "") ? 1 : 0);

  if (kritika > obhajoba) {
    return { postoj: "kritika", sila: Math.max(1, Math.min(3, kritika + boosters)) };
  }
  if (obhajoba > kritika) {
    return { postoj: "obhajoba", sila: Math.max(1, Math.min(3, obhajoba)) };
  }
  return { postoj: "neutral", sila: 0 };
}

/**
 * Sloučí klasifikaci od Gemini s lexikální.
 *
 * Když se rozejdou o dva stupně (model tvrdí obhajobu, text je ostrá kritika
 * nebo naopak), vyhrává lexikon. Model tak nemůže být odpovědí přesvědčen,
 * aby napsal opak toho, co tam stojí — efektonosné číslo zůstává v kódu.
 */
export function mergeStance(
  gemini: { postoj: Postoj; sila: number } | null,
  lexicon: { postoj: Postoj; sila: number },
): { postoj: Postoj; sila: number; source: "gemini" | "lexicon" | "lexicon-override" } {
  if (!gemini) return { ...lexicon, source: "lexicon" };

  const opacny =
    (gemini.postoj === "obhajoba" && lexicon.postoj === "kritika" && lexicon.sila >= 2) ||
    (gemini.postoj === "kritika" && lexicon.postoj === "obhajoba" && lexicon.sila >= 2);

  if (opacny) return { ...lexicon, source: "lexicon-override" };
  return { ...gemini, source: "gemini" };
}

/**
 * Ořeže a odstrojí text, než půjde do promptu.
 *
 * Odpovědi trenéra i citát soupeře můžou být text jiného hráče. Delimitery
 * `<<<DATA>>>` se odstraňují, aby je nešlo v odpovědi zavřít a psát instrukce.
 */
export function sanitizeForPrompt(raw: string, maxLen = 500): string {
  return String(raw ?? "")
    .slice(0, maxLen)
    .replace(/<<<|>>>/g, " ")
    .replace(/`/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Dopady odpovědí ──────────────────────────────────────────────────────────

export interface InterviewEffects {
  /** Posun vztahu rozhodčí–klub. */
  refereeRespect: number;
  /** Šance na pokutu od disciplinární komise (0–1). */
  fineChance: number;
  /** Základ částky; volající k němu přidá náhodnou složku. */
  fineBase: number;
  squadMorale: number;
  fans: number;
  reputation: number;
}

/**
 * Tabulka dopadů. Asymetrie je záměrná — urážka bolí víc, než pochvala pomůže,
 * což odpovídá tomu, jak s reputací zachází zbytek hry.
 *
 * `fineRate` je sazba, kterou si soutěž odhlasovala — částka za středně ostrou
 * kritiku. Mírnější stojí tři čtvrtiny sazby, ta nejostřejší o čtvrtinu víc.
 * Ovlivňuje VÝHRADNĚ `fineBase`, ne šanci: soutěž rozhoduje o výši trestu,
 * ne o tom, co je prohřešek. Výchozích 1 200 Kč dá přesně dosavadních
 * 900 / 1 200 / 1 500 Kč, takže bez samosprávy se nezmění nic.
 *
 * Je to čtvrtý nepovinný parametr schválně: nové pole ve výstupu by rozbilo
 * `toEqual` v post-match-interview.test.ts.
 */
export function effectsFor(
  postoj: Postoj, sila: number, opakovanaKritika: boolean, fineRate = 1_200,
): InterviewEffects {
  const s = Math.max(0, Math.min(3, sila));

  if (postoj === "kritika" && s > 0) {
    // Když tým kritizoval i minule, kabina i fanoušci to berou jako rutinu.
    const half = (n: number) => (opakovanaKritika ? Math.floor(n / 2) : n);
    return {
      refereeRespect: -(4 + 4 * s),
      fineChance: 0.25 * s,
      fineBase: Math.round(fineRate * (0.5 + 0.25 * s)),
      squadMorale: half(2 + s),
      fans: half(2 * s),
      reputation: s >= 2 ? -1 : 0,
    };
  }

  if (postoj === "obhajoba" && s > 0) {
    return {
      refereeRespect: 2 + 2 * s,
      fineChance: 0,
      fineBase: 0,
      squadMorale: 1,
      fans: 0,
      reputation: s >= 2 ? 1 : 0,
    };
  }

  return { refereeRespect: 0, fineChance: 0, fineBase: 0, squadMorale: 0, fans: 0, reputation: 0 };
}
