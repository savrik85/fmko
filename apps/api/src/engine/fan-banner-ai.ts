/**
 * Zadání pro model, který píše na plachtu.
 *
 * Plachta není chorál. Chorál se křičí a opakuje, plachta se čte jednou z
 * druhé strany hřiště: musí to být jedno heslo, které je vidět a hned
 * pochopitelné. Proto vlastní prompt, ale stejná kontrolní branka
 * (`zkontrolujChoral`), protože chyby, kterých se model dopouští, jsou tytéž.
 *
 * Šablony v `fan-banner.ts` zůstávají jako záloha. Když model vrátí patvar,
 * na stadionu visí obyčejné, ale správné heslo, ne rozbitý text.
 */

import type { Transparent } from "./fan-banner";

export type BannerTon = Transparent["tone"];

/**
 * Jak vypadá české choreo.
 *
 * Předchozí verze tlačila model na hrubost, posměch, přísloví a napůl rýmované
 * pointy. Výsledek nepřipomínal žádnou skutečnou plachtu: „Kdo jinému jámu
 * kopá, Madeta Volary!“, „Jitono, ty jsi naše, ne cizí!“, „Díky Jun! Rohlík má
 * 5 výher!“. Skutečné choreo v českých kotlích je jiné:
 *
 * - KRÁTKÉ. Dvě až šest slov. Velké písmo, čte se přes celé hřiště.
 * - PATOS, ne vtip. Věrnost, domov, srdce, generace, nepřízeň počasí i výsledků.
 * - Obec jako identita, klidně jen její jméno a jedno silné slovo.
 * - Proti soupeři pohrdání krátce a suše, ne vtipkování ani slovní hříčky.
 * - Sponzor, čísla ani děkování na plachtu nepatří nikdy.
 */

/** Co má heslo na dané téma dělat. */
export const ZADANI_TONU: Record<BannerTon, string> = {
  podpora:
    "Hrdost na obec a věrnost klubu. Patos, ne vtip. Holé konstatování "
    + "nebo heslo bez slovesa. Ne povzbuzování hráčů, ne přání.",
  proti_soupefi:
    "Pohrdání rivalem. Krátce a suše, klidně hrubě. Žádný vtip, žádná "
    + "slovní hříčka, žádné přísloví. NIKDY jim nefandi.",
  proti_treneru:
    "Trenér má skončit. Jeho příjmení a jedno až tři tvrdá slova. Žádná prosba.",
  pro_trenera:
    "Trenér patří k nám. Jeho příjmení a krátké konstatování. Ne děkování.",
  proti_hraci:
    "Hráč vlastního týmu má odejít. Jeho příjmení a jedno až tři tvrdá slova. "
    + "Výhrůžka ne.",
  vytka:
    "Vzkaz vedení klubu. Suše a hořce: klub patří fanouškům, ti tu byli dřív "
    + "a budou i potom.",
};

/** Pravidla stavby hesla. */
export const STAVBA_TRANSPARENTU: readonly string[] = [
  "Dvě až šest slov. Čím kratší, tím větší písmo a tím líp je to vidět.",
  "Jedno sdělení. Žádné souvětí, žádná otázka.",
  "Patos a vážnost. Žádné vtipy, slovní hříčky, přísloví ani rýmovačky.",
  "ŽÁDNÉ roztleskávání ani děkování. Ne „do toho“, ne „díky“, ne „jdeme na to“, "
    + "ne oslovení „kluci“.",
  "NIKDY název sponzora ani celý název klubu. Klub se na plachtě jmenuje podle obce.",
  "Žádná čísla, žádné výsledky, žádná statistika.",
  "NEVYMÝŠLEJ SI SLOVA ANI PŘEZDÍVKY. Jména jen z faktů.",
  "JMÉNA A NÁZEV OBCE NECHÁVEJ V PRVNÍM PÁDĚ. Postav heslo tak, aby se nemusely ohýbat.",
  "Piš česky se správnou diakritikou. Velká písmena se doplní sama.",
  "Hrubost jen proti soupeři, nikdy návod k násilí a nikdy rasismus.",
  "Vrať POUZE text hesla. Žádné uvozovky, žádné vysvětlení, žádné varianty.",
];

/**
 * Vzorce, na kterých české choreo stojí. Jeden se vybere podle klubu, aby dva
 * kluby ve stejné situaci nevyvěsily totéž.
 */
export const VZORCE_PLACHET: readonly string[] = [
  "Název obce a jedno silné slovo nebo krátké sousloví.",
  "Územní nárok: tohle hřiště je náš domov.",
  "Věrnost navzdory všemu: počasí, prohry, léta.",
  "Generace: fandili dědové i otcové, fandíme my.",
  "Srdce a barvy: klub nosíme v srdci.",
  "Heslo bez slovesa, dvě nebo tři slova jako pojem.",
];

/**
 * Jak skutečné plachty znějí. Ukazuje rejstřík, ne předlohu: opsat se nemají,
 * a když přece, s názvem obce to u jiného klubu vypadá jinak.
 */
export const UKAZKY_TONU: readonly string[] = [
  "VĚRNI NAVŽDY",
  "TADY JSME DOMA",
  "V DEŠTI I V BLÁTĚ",
  "DĚDOVÉ, OTCOVÉ, MY",
  "SRDCE NA HŘIŠTI, NE V KAPSE",
  "KLUB JE NÁŠ, NE VÁŠ",
];

/** Sestaví zadání. Fakta jsou hotové věty, model si nic nedomýšlí. */
export function promptTransparentu(opts: {
  ton: BannerTon;
  fakta: string[];
  /** Obec klubu. Název klubu se sponzorem model nedostane, jinak ho píše na plachtu. */
  obec: string;
  okres?: string | null;
  maxDelka: number;
  povinneSlovo?: string | null;
  /**
   * Jeden vzorec z `VZORCE_PLACHET`. Když se jich modelu nabídne všech osm,
   * sáhne pokaždé po tomtéž a dva kluby se stejným rivalem vyvěsí doslova
   * stejnou plachtu. Volající vybírá deterministicky podle klubu.
   */
  vzorec?: string;
}): string {
  return [
    "Jsi člen kotle amatérského fotbalového klubu v českém okresním přeboru.",
    `Klub je z obce ${opts.obec}.`,
    opts.okres ? `Okres ${opts.okres}.` : "",
    "",
    "Napiš heslo na plachtu (choreo), kterou kotel vyvěsí přes celý sektor.",
    `Vejde se nejvýš ${opts.maxDelka} znaků včetně mezer. Delší se nevejde a zahodí se.`,
    "",
    `ZADÁNÍ: ${ZADANI_TONU[opts.ton]}`,
    opts.povinneSlovo ? `V hesle MUSÍ zaznít: ${opts.povinneSlovo}` : "",
    "",
    "FAKTA, ze kterých smíš čerpat (nic jiného nevíš a nic si nepřidávej):",
    ...opts.fakta.map((f) => `- ${f}`),
    "",
    "JAK SE HESLO NA PLACHTU PÍŠE:",
    ...STAVBA_TRANSPARENTU.map((p) => `- ${p}`),
    "",
    "TAKHLE SKUTEČNÉ PLACHTY ZNÍ (rejstřík, ne předloha, neopisuj je):",
    ...UKAZKY_TONU.map((u) => `- ${u}`),
    "",
    opts.vzorec
      ? `VZOREC, který dnes použiješ: ${opts.vzorec}`
      : `OSVĚDČENÉ VZORCE (vyber si jeden):\n${VZORCE_PLACHET.map((v) => `- ${v}`).join("\n")}`,
  ].filter(Boolean).join("\n");
}

/** Vzorec pro daný klub a tón. Stejný vstup = stejný vzorec. */
export function vzorecPlachty(seed: number): string {
  return VZORCE_PLACHET[Math.abs(Math.trunc(seed)) % VZORCE_PLACHET.length];
}

/** Obecná slova z názvů klubů. Nejsou sponzor, na plachtě smí být. */
const OBECNA_SLOVA_KLUBU = new Set([
  "fk", "sk", "tj", "afk", "sfk", "fc", "mfk", "sokol", "slavoj", "slavia", "sparta", "spartak",
  "dynamo", "baník", "banik", "rapid", "lokomotiva", "viktoria", "meteor", "union", "jiskra",
  "start", "tatran", "hvězda", "hvezda", "sokol", "admira", "slovan",
]);

const bezDiakritiky = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Slova, která na plachtě být nesmí: zbytek názvu klubu po odečtení obce,
 * v praxi sponzor („FK Rohlík Podolí“ → „Rohlík“). Kotel sponzora nevyvěšuje.
 */
export function slovaSponzoru(nazvyKlubu: readonly string[], obce: readonly string[]): string[] {
  const obecni = new Set(obce.flatMap((o) => o.split(/\s+/)).map(bezDiakritiky));
  const out = new Set<string>();
  for (const nazev of nazvyKlubu) {
    for (const slovo of nazev.split(/[\s.,-]+/)) {
      const n = bezDiakritiky(slovo);
      if (n.length < 3 || obecni.has(n) || OBECNA_SLOVA_KLUBU.has(n)) continue;
      out.add(slovo);
    }
  }
  return [...out];
}

/**
 * Začátky přísloví, po kterých model sahal („Kdo jinému jámu kopá, Madeta
 * Volary!“, „Kam čert nemůže, tam nastrčí…“). Na plachtu nepatří.
 */
const PRISLOVI = /(?<!\p{L})(kdo jinému|kam čert|kdo se bojí|jak se do lesa|bez práce|lepší vrabec|tak dlouho se chodí|kdo nic nedělá|ranní ptáče|co se v mládí)(?!\p{L})/iu;

/**
 * Co navíc hlídá plachta oproti chorálu. Vrací důvod zamítnutí, nebo null.
 *
 * Model přes zákazy v zadání psal na plachty sponzory, počty výher a děkovačky
 * („DIKY JUN! ROHLIK MA 5 VYHER!“). Zákaz v promptu nestačí, musí ho vynutit kód.
 */
export function vadaPlachty(text: string, sponzori: readonly string[]): string | null {
  if (/\d/.test(text)) return "obsahuje číslo";
  // Zkratka klubu patří do zápisu o utkání, ne na plachtu („FK HVĚZDA VIMPERK“).
  if (/(?<!\p{L})(fk|sk|tj|afk|sfk|fc|mfk)(?!\p{L})/iu.test(text)) return "zkratka klubu";
  if (PRISLOVI.test(text)) return "přísloví";
  if (/(?<!\p{L})(d[ií]ky|děkuj\p{L}*|dekuj\p{L}*)(?!\p{L})/iu.test(text)) return "děkuje";
  const t = bezDiakritiky(text);
  for (const s of sponzori) {
    const kmen = bezDiakritiky(s).slice(0, Math.max(3, s.length - 2));
    if (new RegExp(`(?<![a-z])${kmen.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(t)) return `sponzor ${s}`;
  }
  return null;
}
