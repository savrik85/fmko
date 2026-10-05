/**
 * Heslo na plachtu od modelu, postavené na skutečných nápisech.
 *
 * Dvakrát to dopadlo špatně. Model bez vzorů psal patetické bláboly a patvary
 * („SPŮLE JE NAŠE KRVOU, SRDCEM, DUŠÍ“). Samotný katalog skutečných nápisů zase
 * vyvěsil na půlce stadionů totéž („X. NÁŠ KLUK.“). Teď model dostane pokaždé
 * jiný výběr SKUTEČNÝCH nápisů z rešerše (docs/plachty-inspirace/) jako vzor
 * a napíše nové heslo v jejich duchu. Co v lize už visí, nesmí zopakovat.
 * Výsledek ještě projde korektorem (druhé volání modelu) a kódem hlídanými
 * pravidly. Když cokoli selže, visí heslo z katalogu.
 */

import type { Transparent } from "./fan-banner";

export type BannerTon = Transparent["tone"];

/**
 * Skutečné nápisy podle situace. České doslova, zahraniční v české úpravě
 * z rešerše. Zdroje v docs/plachty-inspirace/. Slouží jako vzor pro model,
 * proto je jich víc než v katalogu a jména v nich zůstávají cizí.
 */
export const VZORY: Record<BannerTon, readonly string[]> = {
  podpora: [
    "Tady jsme doma", "Klub jsme my", "Dinamo, to jsme my", "Nic nechcem. Už teď jsme hrdí!",
    "Známe jen jeden klub a jedny barvy už 50 let!", "My tady žijem", "Tohle hřiště je naše",
    "To je kotel", "Fotbal není divadlo", "Fotbal je živel!", "Klobása, ne kaviár", "Žádný kecy, makat!",
    "Nikdo nás nemá rád. A co.", "Fotbal? Ne, díky. Pivo? Jo, prosím.", "Fandíme ve dne, fandíme v noci",
    "Pýcha celýho okresu", "Bohemians lepší než práce", "Nejlepší v Praze", "Ostrava černá",
    "Vršovickej Ďolíček více než domov", "Sešívaní drží spolu", "Dem rubat", "Náš svět nezničíte",
    "Králové z Hradce", "My jsme Slovan!", "Naše politika je Slovan!", "Až do smrti Slovan Liberec!",
    "Dnes přijela Bohemka", "Tak jsme zase jednou venku, vyřvat plíce za Bohemku", "Kotel vám dá křídla",
    "Vlítněte na ně", "Dejte do toho srdce", "Hajduk žije navždycky", "Půlka vesnice plus jeden",
    "Tady jsme doma. Vy jste turisti.", "Vaňov ultras", "Tribuna Kopec", "Šoporňa Fighters",
    "Make Lužánky Great Again!", "Obyčejný kluby ať jsou obyčejný.",
  ],
  proti_soupefi: [
    "Vítejte v pekle!", "Praha je naše", "Vládci Prahy", "Hra o trůn Vršovic",
    "Dnes hrajeme dříve, takže stihnete Večerníček", "Sparto, přes tohle město cesta k pohárům nevede.",
    "Na Baník si posvítíme", "Jediná jedenáctka z Jablonce, která v Liberci nevykolejí!",
    "Kdysi nedobytná pevnost, dnes charita!", "Blšany = ČFL", "Drnovice = IV. A třída",
    "Zvládli jste přesunout kostel, zvládnete i přesun do 2. ligy!", "nejlepší sparťan je úplně bez hlavy",
    "My jsme historie, vy jen zeměpis", "U vás na hřišti se dá těžit ropa", "A u vás rybník.",
    "Jste jak mraky. Zmizte a bude hezky.", "My máme asfalt, vy pole, sedláci", "To jste to malovali ožralí?",
    "Velký kluby nepadaj.", "Kdyby měli postupovat, narodili by se s křídlama.",
    "Jinde jdou hodiny pozadu. U vás stojej.", "My jsme tu okres, vy jen soused", "Tady vládnem my",
    "Derby je naše", "Stará škola",
  ],
  proti_treneru: [
    "Pelta ven", "Stop lžím", "Radši bez tebe než s tebou nahoře. Čau.",
    "S touhle vizí hrajem za rok III. třídu", "Moc slibů, moc dluhů. Předsedo, běž.",
    "Tak co, Jardo? Kdo je tu větší šašek?", "Problémy si děláte sami", "Dejte aspoň jeden gól!",
    "Kdo lže, ten krade!", "Už toho bylo dost.",
  ],
  pro_trenera: [
    "Věříme ti Zdenku, zabodujem doma i venku", "Liga je naše", "Sakra, my postoupíme!",
    "Jdem si pro postup", "Kotel vám dá křídla", "Šampion", "Derby je naše", "Startujem, my tou ligou proplujem",
  ],
  proti_hraci: [
    "Pelta ven", "Dejte do toho srdce", "Žádný výmluvy. Vyhrát!", "Nechte tam duši!",
    "Legendou v análech", "Problémy si děláte sami", "Dost bylo",
  ],
  vytka: [
    "Věrní, ale nasraní", "V dobrým i ve zlým", "Nikdy to nevzdáme", "Nepolevíme, bojujeme dále!",
    "My jsme tu vždycky. Ať hrajete jak hrajete.", "Boj o záchranu již začal", "Hody, hody, dajte body",
    "Zdravíme všechny neplatiče!", "Kde jste byli, když se platilo?", "Výbor ven!",
    "Před volbami sliby, po volbách výsměch!", "Radši kelímky na trávníku než lemry ve výboru",
    "S klukama v dobrým i zlým. Bez výboru.", "Klub ano, výbor ne", "Primátor je lhář!",
    "Vy zkurvený radnice, neničte nám tradice!", "Kapře, tradici nekoupíš!", "Přestaňte nám ničit klub!",
    "Ne kvůli výboru, ne kvůli hráčům. Kvůli barvám.", "Oni si to koupili. My jsme si to postavili.",
    "Fotbal bez lidí je k ničemu", "Jsme fanoušci, ne zločinci!", "Šikana fanoušků, příště bez nás!",
    "Pyro není zločin", "Dresy máme, čekáme na saka", "Stop modernímu fotbalu", "Dejte aspoň jeden gól!",
  ],
};

/** Vybere `n` vzorů pro tón, pokaždé jiné podle `seed`. Doplní pár z podpory pro rejstřík. */
export function vyberVzory(ton: BannerTon, seed: number, n = 12): string[] {
  const zdroj = [...VZORY[ton], ...(ton === "podpora" ? [] : VZORY.podpora.slice(0, 8))];
  let x = (Math.abs(Math.trunc(seed)) % 2147483646) + 1;
  const rnd = () => { x = (x * 48271) % 2147483647; return x / 2147483647; };
  const kopie = [...zdroj];
  for (let i = kopie.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
  }
  return kopie.slice(0, n);
}

/** Zadání pro model. Fakta jsou hotové věty, model si nic nedomýšlí. */
export function promptPlachty(opts: {
  ton: BannerTon;
  fakta: string[];
  obec: string;
  vzory: string[];
  maxDelka: number;
  povinneSlovo?: string | null;
  /** Hesla, která v lize už visí. Nesmí se zopakovat. */
  obsazene: string[];
}): string {
  return [
    "Jsi člen kotle amatérského fotbalového klubu v českém okresním přeboru.",
    `Klub je z obce ${opts.obec}.`,
    "",
    "Napiš JEDNO heslo na transparent, který kotel vyvěsí na zábradlí.",
    "",
    "Takhle zní SKUTEČNÉ transparenty českých i zahraničních kotlů. Piš v jejich duchu:",
    "hovorově, vtipně nebo naštvaně, s pointou, klidně sprostě. Žádný patos a fráze o srdci a duši.",
    ...opts.vzory.map((v) => `- ${v}`),
    "",
    "SITUACE (nic jiného nevíš a nic si nepřidávej):",
    ...opts.fakta.map((f) => `- ${f}`),
    opts.povinneSlovo ? `V hesle MUSÍ zaznít: ${opts.povinneSlovo}` : "",
    "",
    "PRAVIDLA:",
    `- Nejvýš ${opts.maxDelka} znaků včetně mezer, ideálně dvě až šest slov.`,
    "- Vymysli NOVÉ heslo. Ukázky neopisuj doslova.",
    "- Jména a názvy obcí VŽDY v prvním pádě, nikdy je neohýbej. Skutečné kotle to dělají takhle:",
    "  „PELTA VEN“, „BLŠANY = ČFL“, „X: JEDEN Z NÁS“, „X JE LHÁŘ“.",
    "- Žádný sponzor ani celý název klubu, žádná čísla ani skóre, žádné přísloví.",
    "- Spisovná nebo hovorová čeština se správnými tvary slov. Žádná angličtina.",
    "- Hrubost ano, ale žádný rasismus a žádné výzvy k násilí.",
    opts.obsazene.length > 0 ? `- Tohle už v lize visí, NESMÍ se to opakovat ani podobat: ${opts.obsazene.join(" | ")}` : "",
    "- Vrať POUZE text hesla, bez uvozovek a bez vysvětlení.",
  ].filter((r) => r !== "").join("\n");
}

/**
 * Korektor. Druhé volání modelu, které nic nepíše, jen soudí. Chytá patvary
 * („KRVOU“), nesmysly a slepence slov, které kód sám nepozná.
 */
export function promptKorektor(text: string): string {
  return [
    "Jsi korektor češtiny a znalec fotbalových kotlů.",
    `Fanoušci chtějí vyvěsit transparent: „${text}“`,
    "Splňuje to VŠECHNO? 1) všechna slova jsou správné české tvary (hovorové koncovky jako „jdem“ nebo „dobrým“ jsou v pořádku),",
    "2) dává to smysl jako věta nebo heslo, ne jen slepená slova, 3) zní to jako opravdový fanoušek, ne jako reklama nebo báseň.",
    "Odpověz jediným slovem: ANO nebo NE.",
  ].join("\n");
}

/** Projde odpověď korektoru. Cokoli jiného než jasné ANO je NE. */
export function korektorSchvalil(odpoved: string | null | undefined): boolean {
  return !!odpoved && /^\s*ano\b/i.test(odpoved.trim());
}

/** Obecná slova z názvů klubů. Nejsou sponzor, na plachtě smí být. */
const OBECNA_SLOVA_KLUBU = new Set([
  "fk", "sk", "tj", "afk", "sfk", "fc", "mfk", "sokol", "slavoj", "slavia", "sparta", "spartak",
  "dynamo", "baník", "banik", "rapid", "lokomotiva", "viktoria", "meteor", "union", "jiskra",
  "start", "tatran", "hvězda", "hvezda", "admira", "slovan",
]);

const bezDiakritiky = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Porovnání bez diakritiky, velikosti písmen a interpunkce. */
export function normalizujHeslo(s: string): string {
  return bezDiakritiky(s).replace(/[^\p{L}\s]/gu, "").replace(/\s+/g, " ").trim();
}

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

/** Začátky přísloví, po kterých model sahal. Na plachtu nepatří. */
const PRISLOVI = /(?<!\p{L})(kdo jinému|kam čert|kdo se bojí|jak se do lesa|bez práce|lepší vrabec|tak dlouho se chodí|kdo nic nedělá|ranní ptáče|co se v mládí)(?!\p{L})/iu;

/** Otřepané fráze, kvůli kterým plachty zněly jako přání k narozeninám. */
const PATOS = /(?<!\p{L})(v srdci|srdcem|duší|krvou|navždy věrn)(?!\p{L})/iu;

/**
 * Co navíc hlídá plachta oproti chorálu. Vrací důvod zamítnutí, nebo null.
 * Zákaz v promptu nestačí, musí ho vynutit kód.
 */
export function vadaPlachty(text: string, sponzori: readonly string[], obsazene: readonly string[] = []): string | null {
  if (/\d/.test(text)) return "obsahuje číslo";
  if (/(?<!\p{L})(fk|sk|tj|afk|sfk|fc|mfk)(?!\p{L})/iu.test(text)) return "zkratka klubu";
  if (PRISLOVI.test(text)) return "přísloví";
  if (PATOS.test(text)) return "patos";
  const t = bezDiakritiky(text);
  for (const s of sponzori) {
    const kmen = bezDiakritiky(s).slice(0, Math.max(3, s.length - 2));
    if (new RegExp(`(?<![a-z])${kmen.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(t)) return `sponzor ${s}`;
  }
  const n = normalizujHeslo(text);
  if (obsazene.some((o) => normalizujHeslo(o) === n)) return "v lize už visí";
  return null;
}
