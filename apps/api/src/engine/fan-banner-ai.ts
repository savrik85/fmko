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
 * Tohle NEJSOU opsané nápisy. Je to popis toho, jak jsou postavené, vytažený
 * z reportáží o choreu českých kotlů (pražské derby, Baník, protesty proti
 * vedení svazu).
 *
 * Co z těch zdrojů plyne a co jsem měl předtím špatně:
 *
 * - Je to HRUBÉ. Vulgarita směrem k soupeři je běžná a čekaná, ne výjimka.
 *   Psal jsem slušňácká hesla, která v kotli nikdo nevyvěsí.
 * - Častý je POSMĚCH KONKRÉTNÍ OSOBĚ, klidně soupeřovu hráči, jménem.
 *   Pointa bývá sprostá a napůl se rýmuje.
 * - Silný vzorec je JEDNO SOUSLOVÍ jako pojem, bez slovesa. Pojmenuje se jím
 *   celá situace, obrázek dopoví zbytek.
 * - ÚZEMNÍ NÁROK v holé oznamovací větě: tohle místo je naše.
 * - VYLOUČENÍ: ten a ten sem nepatří.
 * - ČESKÉ PŘÍSLOVÍ otočené proti soupeři.
 * - Vykřičník se používá, sarkasmus taky. Zakazovat je byla moje chyba.
 * - Plachta umí být celá věta, klidně přes čtyřicet znaků.
 */

/** Co má heslo na dané téma dělat. */
export const ZADANI_TONU: Record<BannerTon, string> = {
  podpora:
    "Kdo jste a odkud. Územní nárok nebo věrnost, v holé oznamovací větě. "
    + "Ne povzbuzování hráčů, ne přání. Konstatování.",
  proti_soupefi:
    "Proti soupeři, a pořádně. Posměch, sprostota, pohrdání. Smíš si "
    + "vystřelit i z konkrétního jejich hráče jménem. Můžeš být vulgární. "
    + "NIKDY jim nefandi a nevtipkuj jemně, tohle je kotel, ne kabaret.",
  proti_treneru:
    "Vzkaz trenérovi, ať skončí. Jménem a natvrdo, v pátém pádě. Posměch smí, "
    + "prosba ne.",
  pro_trenera:
    "Trenér patří mezi ně. Konstatování, ne děkování.",
  proti_hraci:
    "Vzkaz hráči vlastního týmu, ať jde pryč. Jménem a natvrdo. Posměšné smí "
    + "být, výhrůžka ne.",
  vytka:
    "Vzkaz vedení klubu. Jedovatý a sarkastický. Nejčastěji o tom, že "
    + "fanoušci tu byli dřív a budou i potom.",
};

/** Pravidla stavby hesla. */
export const STAVBA_TRANSPARENTU: readonly string[] = [
  "Jedno sdělení. Klidně celá věta, ale jedna. Čte se z druhé strany hřiště.",
  "Krátké. Čím kratší, tím větší písmo a tím líp je to vidět.",
  "Vykřičník použít smíš. Sarkasmus a sprostota taky.",
  "ŽÁDNÉ roztleskávání. Ne „do toho“, ne „jdeme na to“, ne „díky“, "
    + "ne „zvedněte hlavy“, ne oslovení „kluci“. Tohle není tábor.",
  "Nikdy reklama. Obchodní jméno v názvu klubu ani sponzor na plachtu nepatří.",
  "NEVYMÝŠLEJ SI SLOVA ANI PŘEZDÍVKY. Používej jen jména, která máš ve faktech. "
    + "Když si model vymyslí přezdívku pro obec nebo klub, vznikne patvar, "
    + "kterému nikdo nerozumí.",
  "Velká písmena se doplní sama, neřeš je.",
  "Žádná čísla, žádné datum, žádná statistika.",
  "Piš ČESKY. Ani jedno anglické slovo, tohle je okresní přebor.",
  "Hrubost ano, ale ne návod k násilí a ne rasismus.",
  "JMÉNA A NÁZVY NECHÁVEJ V PRVNÍM PÁDĚ, kromě oslovení v pátém pádě. "
    + "Postav heslo tak, aby se jméno nemuselo ohýbat jinak.",
  "Vrať POUZE text hesla. Žádné uvozovky, žádné vysvětlení, žádné varianty.",
];

/**
 * Vzorce, na kterých české choreo stojí.
 *
 * Schválně popis, ne opsané nápisy. Ukázka by se vrátila skoro doslova zpátky
 * a všechny kluby by měly na plachtě totéž.
 */
export const VZORCE_PLACHET: readonly string[] = [
  "Jedno sousloví jako pojem, bez slovesa. Pojmenuje celou situaci.",
  "Územní nárok v holé oznamovací větě: tohle místo je naše.",
  "Vyloučení: ten a ten sem nepatří.",
  "Posměch konkrétnímu člověku jménem, pointa sprostá a napůl rýmovaná.",
  "České přísloví otočené proti soupeři.",
  "Oslovení jménem a protiklad: dělej tohle, ne tamto.",
  "Oslovení jménem a holý rozsudek jedním slovem.",
  "Věrnost navzdory všemu: my tu byli dřív a budeme i potom.",
];

/** Sestaví zadání. Fakta jsou hotové věty, model si nic nedomýšlí. *//** Sestaví zadání. Fakta jsou hotové věty, model si nic nedomýšlí. */
export function promptTransparentu(opts: {
  ton: BannerTon;
  fakta: string[];
  klub: string;
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
    `Klub se jmenuje ${opts.klub}.`,
    opts.okres ? `Hraje se na ${opts.okres}ku, mluv jako místní.` : "",
    "",
    "Napiš heslo na plachtu, kterou kotel vyvěsí přes celý sektor.",
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
    opts.vzorec
      ? `VZOREC, který dnes použiješ (neopisuj existující hesla): ${opts.vzorec}`
      : `OSVĚDČENÉ VZORCE (vyber si jeden, neopisuj existující hesla):\n${VZORCE_PLACHET.map((v) => `- ${v}`).join("\n")}`,
  ].filter(Boolean).join("\n");
}

/** Vzorec pro daný klub a tón. Stejný vstup = stejný vzorec. */
export function vzorecPlachty(seed: number): string {
  return VZORCE_PLACHET[Math.abs(Math.trunc(seed)) % VZORCE_PLACHET.length];
}
