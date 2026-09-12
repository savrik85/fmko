/**
 * Z čeho se český fotbalový chorál skládá.
 *
 * Tohle NEJSOU opsané texty existujících chorálů. Je to popis toho, jak jsou
 * postavené, sesbíraný ze zpěvníků českých kotlů (Hradec, Jablonec, Slavia)
 * a z článků o tom fenoménu. Slouží jako zadání pro model, aby psal v žánru
 * a ne jako copywriter.
 *
 * Co z těch zdrojů plyne:
 *
 * - Chorál je KRÁTKÝ. Jedna nebo dvě věty, často jen skandování o dvou až
 *   čtyřech slabikách, které se opakuje.
 * - Stojí na OPAKOVÁNÍ. Jméno dvakrát, výzva dvakrát, výplňové slabiky
 *   („hej, hej“, „ale, ale“, „na-na-na“) drží rytmus.
 * - Oslovuje se ROZKAZEM („bojujte“, „do toho“) nebo v první osobě množné
 *   („my jsme“, „my tu budem“), skoro nikdy popisně.
 * - Pracuje s BARVAMI a MÍSTEM. Barvy klubu a jméno vsi či okresu jsou
 *   nejčastější stavební kámen identity.
 * - VĚRNOST se zpívá hlavně v prohře: „jsme tady pořád“, „nikdy se nevzdáme“.
 * - POSMĚCH soupeři je hrubý, ale hloupý a krátký, ne vtipkování.
 * - Melodie jsou lidovky a polky, takže text má spadat do jednoduchého
 *   pravidelného rytmu, ne do volného verše.
 */

/** Kategorie chorálu, stejné klíče jako `ChantKind`. */
export type ChantTema =
  | "oblibenec" | "rival" | "trener_pro" | "trener_proti" | "vyhra" | "vzdor" | "vybaveni";

/** Co má chorál na dané téma dělat. Jde do promptu jako zadání. */
export const ZADANI_TEMATU: Record<ChantTema, string> = {
  oblibenec:
    "Oslava jednoho hráče. Jeho PŘÍJMENÍ musí v chorálu zaznít, ideálně opakovaně "
    + "a velkými písmeny, protože se skanduje. Chválí se za to, co na hřišti dělá, "
    + "ne za statistiky.",
  rival:
    "Proti konkrétnímu soupeři. Hrubé, krátké, hloupé. Žádné vtipkování ani slovní "
    + "hříčky, spíš posměch a nadřazenost. Smí padnout jméno jejich klubu. NIKDY jim "
    + "nefandi: žádné „do toho“, „jedem“ ani „bojujte“ směrem k nim.",
  trener_proti:
    "Volání po odvolání trenéra. Tvrdé a adresné, jeho příjmení zazní. Je to hněv, "
    + "ne argument.",
  trener_pro:
    "Poděkování trenérovi, když se daří. Bere se mezi svoje, jeho příjmení zazní.",
  vyhra:
    "Radost ze série výher. Sebevědomé, vyzývavé vůči zbytku soutěže, bez jmen.",
  vzdor:
    "Věrnost navzdory tomu, že je zle. Nejde o výsledky, jde o to, že tam ti lidé "
    + "budou i zítra. Hrdé, ne ublížené.",
  vybaveni:
    "Stížnost na to, co na stadionu chybí. Posměšná výzva vedení, aby to konečně "
    + "pořídilo. Ta věc musí být v textu jmenovaná.",
};

/**
 * Stavební pravidla, která platí pro všechna témata.
 *
 * Poslední bod je tvrdý: česká příjmení nejde spolehlivě ohnout bez morfologie
 * a patvar typu „Kdo nemá rád Kolman“ je z chorálu vidět na první pohled.
 */
export const STAVBA_CHORALU: readonly string[] = [
  "Nejvýš dvě krátké věty, dohromady do 60 znaků. Chorál se křičí, ne čte.",
  "Stavěj na opakování: zopakuj jméno, výzvu nebo dvojici slov.",
  "Rytmus jednoduchý a pravidelný, jako lidovka nebo polka. Žádný volný verš.",
  "Oslovuj rozkazem („do toho“, „bojujte“) nebo v první osobě množné („my tu budem“).",
  "Smíš použít výplňové slabiky pro rytmus: hej hej, ale ale, na-na-na, ó ó ó.",
  "Žádná statistika, žádná čísla, žádné datum. Kotel nezpívá tabulku.",
  "Hovorová čeština. Klidně tvrdá, ale ne návod k násilí a ne rasismus.",
  "JMÉNA A NÁZVY NECHÁVEJ V PRVNÍM PÁDĚ. Piš „KOLMAN, ty jsi náš“, nikdy "
    + "„nemá rád Kolmana“ ani „z Pralesa“. Postav větu tak, aby se jméno nemuselo ohýbat.",
  "Vrať POUZE text chorálu. Žádné uvozovky, žádné vysvětlení, žádná nabídka variant.",
];

/**
 * Jak se v českých kotlích chorály staví, popsáno pro model.
 *
 * Schválně popis vzorců, ne ukázky. Ukázka by se vrátila skoro doslova zpátky
 * a všechny kluby by zpívaly totéž, což je přesně to, čemu se vyhýbáme.
 */
export const VZORCE_KOTLU: readonly string[] = [
  "Skandované dvouslovné jádro, které se třikrát zopakuje.",
  "Volání a odpověď: první půlka věty se ptá, druhá odpovídá.",
  "Dvojverší, kde druhý řádek rýmuje na poslední slovo prvního.",
  "Věta postavená na protikladu: co jsme my a co jsou oni.",
  "Podmínková věta typu „kdo něco nedělá, ten k nám nepatří“.",
  "Jméno nebo barva zopakovaná na začátku i na konci věty.",
];

/** Sestaví zadání pro model. Fakta jsou hotové věty, model si nic nedomýšlí. */
export function promptChoralu(opts: {
  tema: ChantTema;
  /** Hotová fakta, ze kterých smí model čerpat. Nic jiného nezná. */
  fakta: string[];
  klub: string;
  /** Kolorit okresu, ať Prachatice nezpívají jako Praha. */
  okres?: string | null;
  /**
   * Jeden vzorec z `VZORCE_KOTLU`.
   *
   * Když se jich modelu nabídne všech šest, sáhne pokaždé po tom samém a půlka
   * ligy pak zpívá „my tu budem". Volající vybere vzorec deterministicky podle
   * klubu a druhu chorálu, takže si každý kotel drží svoji stavbu.
   */
  vzorec?: string;
  /** Slovo, které v chorálu MUSÍ padnout (jméno, název rivala, chybějící věc). */
  povinneSlovo?: string | null;
}): string {
  return [
    "Jsi člen kotle amatérského fotbalového klubu v českém okresním přeboru.",
    `Klub se jmenuje ${opts.klub}.`,
    opts.okres ? `Hraje se na ${opts.okres}ku, mluv jako místní.` : "",
    "",
    "Vymysli JEDEN nový chorál, který se bude na stadionu zpívat.",
    "",
    `ZADÁNÍ: ${ZADANI_TEMATU[opts.tema]}`,
    opts.povinneSlovo ? `V textu MUSÍ zaznít: ${opts.povinneSlovo}` : "",
    "",
    "FAKTA, ze kterých smíš čerpat (nic jiného nevíš a nic si nepřidávej):",
    ...opts.fakta.map((f) => `- ${f}`),
    "",
    "JAK SE ČESKÝ CHORÁL STAVÍ:",
    ...STAVBA_CHORALU.map((p) => `- ${p}`),
    "",
    opts.vzorec
      ? `VZOREC, který dnes použiješ (neopisuj existující chorály): ${opts.vzorec}`
      : `OSVĚDČENÉ VZORCE (vyber si jeden, neopisuj existující chorály):\n${VZORCE_KOTLU.map((v) => `- ${v}`).join("\n")}`,
  ].filter(Boolean).join("\n");
}

/** Vzorec pro daný klub a druh chorálu. Stejný vstup = stejný vzorec. */
export function vzorecPro(seed: number): string {
  return VZORCE_KOTLU[Math.abs(Math.trunc(seed)) % VZORCE_KOTLU.length];
}

/** Nejdelší chorál, co se ještě dá skandovat a vejde se do UI. */
export const MAX_DELKA_CHORALU = 70;

export type VysledekKontroly =
  | { ok: true; text: string }
  | { ok: false; duvod: string };

/**
 * Přísná kontrola toho, co model vrátil.
 *
 * Když cokoli nesedí, chorál se ZAHODÍ a použije se šablona. Špatný chorál je
 * horší než obyčejný: visí na stadionu měsíce a hráč ho čte pokaždé.
 */
export function zkontrolujChoral(
  raw: string | null | undefined,
  opts: {
    jmena?: string[];
    /**
     * Slovo, bez kterého chorál nedává smysl.
     *
     * Bez tohohle model klidně na téma zapomene: na stížnost „chybí záchody"
     * vrátil „Hej, Hot Peppers, do toho!", což je fandění, ne stížnost.
     * Porovnává se kmen slova, aby prošel i „záchodů" nebo „Braníku".
     */
    musiObsahovat?: string | null;
    /** Kvůli tématu se hlídá i to, co v textu být NESMÍ. */
    tema?: ChantTema;
  } = {},
): VysledekKontroly {
  if (!raw) return { ok: false, duvod: "model nic nevrátil" };

  // Modely rády přidají uvozovky, odrážku nebo úvodní větu. Vezme se první
  // neprázdný řádek a obalení se sloupne.
  const radek = raw.split("\n").map((r) => r.trim()).find((r) => r.length > 0) ?? "";
  const text = radek
    .replace(/^[-–*•\d.)\s]+/, "")
    .replace(/^["„'»]+|["“'«]+$/g, "")
    .trim();

  if (text.length < 6) return { ok: false, duvod: "moc krátké" };
  if (text.length > MAX_DELKA_CHORALU) return { ok: false, duvod: `přes ${MAX_DELKA_CHORALU} znaků` };
  if (/^(chorál|návrh|text|zde|takhle|možnost)/i.test(text)) {
    return { ok: false, duvod: "model místo chorálu komentuje" };
  }
  // Víc než dvě věty se nedají skandovat.
  if ((text.match(/[.!?]/g) ?? []).length > 2) return { ok: false, duvod: "moc vět" };
  if (/\d{2,}/.test(text)) return { ok: false, duvod: "obsahuje čísla, kotel nezpívá tabulku" };

  // Nedopsaná věta. Model občas dojede na strop tokenů uprostřed a zbyde
  // „Hej, hej, Břevnove, my tu budem,” — na plachtě je ta čárka vidět hned.
  if (/[,;:\-–]$/.test(text)) return { ok: false, duvod: "text končí uprostřed" };
  if (/\s(a|i|ale|nebo|že|když|co|kdo)$/i.test(text.replace(/[.!?]+$/, ""))) {
    return { ok: false, duvod: "text končí spojkou" };
  }

  // Ohnuté jméno je nejčastější a nejviditelnější chyba: „Kdo nemá rád Kolmana”.
  for (const cele of opts.jmena ?? []) {
    const p = cele.trim().split(/\s+/).pop() ?? "";
    if (p.length < 3) continue;
    const ohnute = new RegExp(`\\b${escape(p)}(a|u|e|ovi|em|ovy|ova|ovo|ům|y)\\b`, "i");
    if (ohnute.test(text)) return { ok: false, duvod: `ohnuté příjmení ${p}` };
  }

  if (opts.musiObsahovat && !obsahujeKmen(text, opts.musiObsahovat)) {
    return { ok: false, duvod: `chybí „${opts.musiObsahovat}“, model uhnul od tématu` };
  }

  // Chorál proti soupeři, který soupeři fandí. Model to udělal: na zadání
  // „proti SK Braník“ vrátil „Hej, SK Braník, do toho!“. Do kotle se to pustit
  // nesmí, je to obrácený význam.
  if (opts.tema === "rival" && FANDENI.test(text)) {
    return { ok: false, duvod: "chorál proti soupeři soupeři fandí" };
  }

  return { ok: true, text };
}

/** Povzbuzení. V chorálu proti soupeři nemá co dělat. */
const FANDENI = /\b(do toho|jedem|jedeme|bojuj|bojujte|držíme|hodně štěstí|ať žije)\b/i;

/**
 * Je slovo v textu, i když je ohnuté?
 *
 * Porovnává se kmen bez diakritiky, takže „Braník” projde jako „Braníku”
 * a „záchody” jako „záchodů”. U víceslovného zadání stačí nejdelší slovo:
 * z „SK Braník” se hlídá „Braník”, z „střechu nad hlavou” to „střechu”.
 */
function obsahujeKmen(text: string, slovo: string): boolean {
  const bezDiakritiky = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const nejdelsi = slovo.trim().split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? "";
  if (nejdelsi.length < 3) return true;
  const kmen = bezDiakritiky(nejdelsi).slice(0, Math.max(3, nejdelsi.length - 2));
  return bezDiakritiky(text).includes(kmen);
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
