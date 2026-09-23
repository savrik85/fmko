/**
 * SMS od majitelů firem: šablony zpráv, nabídka odpovědí trenéra a odpověď majitele.
 * Čisté funkce bez DB.
 *
 * Pravidla šablon (viz paměť „generované české texty"):
 * - majitel je odesílatel, ne podmět ve větě, jeho jméno se do textu nevkládá;
 *   majitelé jsou vždy muži (generateSponsorOwner), mužský rod v první osobě sedí,
 * - trenéra texty neoslovují v minulém čase, jeho rod neznáme,
 * - počty lepí helper (`proherTvar`), ne šablona,
 * - žádná dlouhá pomlčka,
 * - fanoušek a patriot tykají, podnikatel a opatrný vykají.
 */
import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import type { OwnerPersonality } from "./owners";

export const OWNER_SMS_OCCASIONS = [
  "match_eve", "after_win", "after_loss", "losing_streak", "riot",
  "main_lost", "main_new", "season_thanks", "season_complaint", "scandal",
] as const;
export type OwnerSmsOccasion = (typeof OWNER_SMS_OCCASIONS)[number];

export function isOwnerSmsOccasion(v: unknown): v is OwnerSmsOccasion {
  return typeof v === "string" && (OWNER_SMS_OCCASIONS as readonly string[]).includes(v);
}

export const REPLY_TONES = ["warm", "neutral", "dismissive"] as const;
export type ReplyTone = (typeof REPLY_TONES)[number];

export function isReplyTone(v: unknown): v is ReplyTone {
  return typeof v === "string" && (REPLY_TONES as readonly string[]).includes(v);
}

/** Proměnné šablon: `{skore}` z pohledu domácích („2:1"), `{serie}` = počet proher v řadě. */
export interface OwnerSmsVars {
  skore?: string;
  serie?: number;
}

type Pools = Partial<Record<OwnerPersonality, readonly string[]>>;

export const OWNER_SMS_TEXTS: Record<OwnerSmsOccasion, Pools> = {
  match_eve: {
    fan: [
      "Zítra jsem na tribuně! Šálu mám vypranou, hlas připravenej. Ať to kluci roztočí.",
      "Nemůžu dospat, zítra domácí zápas. Počítám s výhrou, jinak mě žena nepustí domů.",
      "Zítra fandím od první minuty. Pivo platím já, góly vy.",
    ],
    patriot: [
      "Zítra přijdu na náš plac. Domácí hřiště je svatý, ať to kluci ví.",
      "Těším se na zítřek. Na domácí zápasy chodím od malička a pořád mě to bere.",
      "Zítra se ukážu na tribuně. Ať vidí celá vesnice, že za klubem stojíme.",
    ],
    businessman: [
      "Potvrzuji zítřek. Dorazím před výkopem, po zápase bych rád probral pár věcí.",
      "Zítra jsem na zápase. Vezmu s sebou obchodního partnera, ať je na co koukat.",
      "Zítřek mám v kalendáři. Doufám, že tým předvede, za co firma platí.",
    ],
    cautious: [
      "Zítra přijdu, jak jsem slíbil. Snad bude na tribuně klid.",
      "Na zítřek se chystám. Je tam dobře zajištěné parkování a pořadatelé?",
      "Zítra dorazím. Doufám, že to bude slušné sportovní odpoledne bez průšvihů.",
    ],
  },
  after_win: {
    fan: [
      "{skore}! Ještě teď se mi třesou ruce. Tohle byl zápas, na kterej se nezapomíná.",
      "To bylo něco! {skore} a já řval jak na lesy. Díky za pozvání.",
      "Hlas nemám, ale {skore} za to stálo. Příště beru celou rodinu.",
    ],
    patriot: [
      "{skore}, takhle se hraje doma. Celá vesnice o tom bude mluvit týden.",
      "Krásná výhra {skore}. Na takový kluky může bejt obec hrdá.",
      "{skore} před domácími lidmi. Přesně kvůli tomuhle klub podporuju.",
    ],
    businessman: [
      "Výhra {skore}, dobrá reklama pro firmu i pro klub. Spokojenost.",
      "{skore}. Partner, který šel se mnou, byl nadšený. To se počítá.",
      "Solidní výkon, {skore}. Takhle si představuji návratnost.",
    ],
    cautious: [
      "{skore}, pěkné a hlavně klidné odpoledne. Děkuji za pozvání.",
      "Výhra {skore} a žádné problémy kolem. Tak to má vypadat.",
      "Příjemný zápas, {skore}. Rád jsem se přišel podívat.",
    ],
  },
  after_loss: {
    fan: [
      "{skore}. Bolí to jak kopačka do holeně. Co se to tam dneska dělo?",
      "Prohra {skore}, to jsem teda nečekal. Řekni mi, že příště to bude jinak.",
      "{skore}... Cestou domů jsem nepromluvil ani slovo. Co na to kabina?",
    ],
    patriot: [
      "{skore} doma, to zamrzí. Lidi od nás chtějí vidět bojovat. Co s tím?",
      "Prohra {skore} před vlastníma lidma. Na návsi se o tom už mluví.",
      "{skore}. Domácí hřiště má bejt pevnost. Co se pokazilo?",
    ],
    businessman: [
      "{skore}. Partnera jsem zval na výhru, ne na tohle. Jaký je plán?",
      "Prohra {skore}. Potřebuji vědět, jestli je to výkyv, nebo trend.",
      "{skore} není dobrá vizitka. Jak to chcete napravit?",
    ],
    cautious: [
      "Prohra {skore}. Nechci panikařit, ale jak to vidíte dál?",
      "{skore}. Trochu mě to znejistělo. Je to jen špatný den?",
      "Ta prohra {skore} mi leží v hlavě. Máte to pod kontrolou?",
    ],
  },
  losing_streak: {
    fan: [
      "{serie} v řadě. Já tomu klubu fandím, ale tohle mě ubíjí. Co bude dál?",
      "Už {serie} za sebou. V hospodě se mi smějou. Řekni, že to otočíme.",
      "{serie} v řadě, to je na infarkt. Potřebuju slyšet, že věříte.",
    ],
    patriot: [
      "{serie} v řadě. Obec si nezaslouží koukat se na klub s lítostí.",
      "Lidi se mě ptají, co se děje. {serie} v řadě tu dlouho nebylo.",
      "{serie} za sebou. Klub je srdce vesnice, tak ať zase bije.",
    ],
    businessman: [
      "{serie} v řadě. Jméno mé firmy je na klubu vidět. Chci slyšet plán.",
      "Už {serie} za sebou. Začínám přemýšlet, jestli jsem vsadil dobře.",
      "{serie} v řadě se v kanceláři špatně vysvětluje. Co s tím uděláte?",
    ],
    cautious: [
      "{serie} v řadě. Dělám si starosti. Je v kabině všechno v pořádku?",
      "Už {serie} za sebou. Nerad bych, aby se to táhlo dál. Co plánujete?",
      "{serie} v řadě mě znepokojuje. Můžete mě uklidnit?",
    ],
  },
  riot: {
    fan: [
      "Fandit se má nahlas, ale tohle už bylo moc. Ti blázni kazí jméno nám všem.",
      "Na tribuně to ujelo. Já chci fandit, ne se krčit před lahvema.",
      "Chápu vášeň, sám jsem blázen do fotbalu. Ale výtržnosti? To ne.",
    ],
    patriot: [
      "Výtržnost na našem hřišti. Tohle se o vesnici bude vyprávět ještě dlouho.",
      "Stydím se. Na návsi se mluví jen o tom, co vyváděli fanoušci.",
      "Naše hřiště není místo pro rvačky. Ať si to ti kluci srovnají.",
    ],
    businessman: [
      "Výtržnost na stadionu je pro moji značku problém. Jak to vyřešíte?",
      "Zákazníci se mě ptají na ty výtržnosti. Tohle mi dělá ostudu.",
      "Potřebuji ujištění, že se to nebude opakovat. Jinak to bude těžké.",
    ],
    cautious: [
      "Po té výtržnosti nevím, jestli je bezpečné tam chodit. Co s tím uděláte?",
      "Tohle mě vyděsilo. Nechci, aby moje firma byla spojená s násilím.",
      "Výtržnosti jsou přesně to, čeho jsem se bál. Jak to chcete zajistit?",
    ],
  },
  main_lost: {
    fan: [
      "Tak to je konec, co? Klubu budu fandit dál, ale mrzí mě to.",
      "Nečekal jsem, že skončíme. Srdce mám pořád u vás, jen peníze půjdou jinam.",
      "Konec smlouvy mě zamrzel. Na tribunu chodit nepřestanu.",
    ],
    patriot: [
      "Končíme. Škoda, bral jsem to jako službu vesnici, ne jako obchod.",
      "Že už nejsem hlavní sponzor, mě mrzí. Klub je pořád náš, to si pamatuj.",
      "Naše spolupráce skončila. Doufám, že se klub o sebe postará.",
    ],
    businessman: [
      "Beru na vědomí, že spolupráce končí. Obchod je obchod.",
      "Konec smlouvy. Kdyby se situace změnila, víte, kde mě najdete.",
      "Takže končíme. Věřím, že máte lepší nabídku, jinak bych to nechápal.",
    ],
    cautious: [
      "Takže konec. Asi to tak mělo být, ale trochu mě to zaskočilo.",
      "Spolupráce skončila. Doufám, že jsem vám nic neudělal špatně.",
      "Beru to. Přeji klubu, ať se daří i beze mě.",
    ],
  },
  main_new: {
    fan: [
      "Jsem hlavní sponzor! Splnil se mi klukovskej sen. Jdeme na to!",
      "Moje firma na dresu, to je paráda. Budu na každým zápase.",
      "Tak jsme partneři! Slibuju, že budu řvát nejvíc z celý tribuny.",
    ],
    patriot: [
      "Je mi ctí podporovat náš klub. Pro vesnici udělám, co bude v mých silách.",
      "Hlavní sponzor našeho klubu, to je závazek. Nezklamu vás.",
      "Konečně pomáhám tam, kde jsem vyrostl. Ať se klubu daří.",
    ],
    businessman: [
      "Smlouva je podepsaná. Těším se na spolupráci a na viditelnost.",
      "Vítejte v partnerství. Očekávám slušnou reprezentaci značky.",
      "Tak jsme partneři. Dobré výsledky pomůžou nám oběma.",
    ],
    cautious: [
      "Podepsáno. Snad jsem udělal dobře. Věřím, že klub bude v klidu.",
      "Tak jsme spolu. Doufám, že to bude spolupráce bez nepříjemných překvapení.",
      "Jsem rád za dohodu. Hlavně ať je kolem klubu klid a pořádek.",
    ],
  },
  season_thanks: {
    fan: [
      "Jaká sezóna! Každej zápas stál za to. Díky za všechno.",
      "Tuhle sezónu budu vyprávět vnoučatům. Díky moc.",
      "Sezóna jak z pohádky. Už se nemůžu dočkat další.",
    ],
    patriot: [
      "Díky za sezónu. Vesnice byla na klub zase pyšná.",
      "Tahle sezóna udělala obci radost. Takhle dál.",
      "Poctivá sezóna, na kterou se v obci bude vzpomínat. Díky.",
    ],
    businessman: [
      "Sezóna splnila očekávání. Spolupráce se vyplácí, děkuji.",
      "Dobrá sezóna, dobrá čísla. Rád pokračuji.",
      "Z pohledu firmy povedená sezóna. Děkuji za reprezentaci.",
    ],
    cautious: [
      "Klidná a povedená sezóna. Přesně tak to mám rád. Děkuji.",
      "Žádné velké průšvihy a slušné výsledky. Děkuji za sezónu.",
      "Jsem spokojený. Děkuji, že to celou sezónu drželo pohromadě.",
    ],
  },
  season_complaint: {
    fan: [
      "Sezóna na zapomenutí. Pořád fandím, ale bolí to. Co bude příště?",
      "Tolik proher jsem nečekal. Řekni mi, že se to změní.",
      "Tahle sezóna mě stála nervy. Potřebuju slyšet, že věříte v lepší.",
    ],
    patriot: [
      "Obec si zaslouží víc, než co jsme letos viděli. Co s tím?",
      "Lidi v obci jsou ze sezóny zklamaní. Jak to chceš napravit?",
      "Letos to klubu nešlo. Vesnice čeká, že se zvedne.",
    ],
    businessman: [
      "Sezóna pod očekávání. Potřebuji vidět plán na tu další.",
      "Čísla nejsou dobrá. Zvažuji, jestli pokračovat.",
      "Letos jsem za své peníze neviděl moc. Co se změní?",
    ],
    cautious: [
      "Sezóna mi dělala starosti. Jak to vidíte dál?",
      "Nebyla to dobrá sezóna. Nechci panikařit, ale potřebuji ujištění.",
      "Letos to bylo nejisté. Máte plán, jak to zklidnit?",
    ],
  },
  scandal: {
    cautious: [
      "Slyšel jsem, co se u vás stalo. Tohle mi dělá velké starosti. Jak to řešíte?",
      "Ta aféra v klubu mě znepokojuje. Nechci být spojovaný s průšvihy.",
      "Co se to u vás děje? Potřebuji vědět, že to máte pod kontrolou.",
      "Lidi už o tom mluví. Moje firma si nemůže dovolit ostudu. Co s tím?",
      "Tohle je přesně to, čeho se bojím. Vysvětlíte mi to?",
    ],
  },
};

/** „3 prohry" / „5 proher". Šablona počet neohýbá, jinak vzniká „5 prohry". */
export function proherTvar(n: number): string {
  const k = Math.max(0, Math.round(n));
  return k >= 2 && k <= 4 ? `${k} prohry` : `${k} proher`;
}

function fill(t: string, vars: OwnerSmsVars): string {
  return t.replace(/\{skore\}/g, vars.skore ?? "").replace(/\{serie\}/g, proherTvar(vars.serie ?? 3));
}

/**
 * Text SMS. Deterministicky podle `seedKey` (reference spouštěče), s vynecháním
 * textů, které klub nedávno dostal (`recent` = vyrenderovaná těla). `null` = majitel
 * s touhle povahou k téhle příležitosti nepíše, nebo chybí proměnná šablony.
 */
export function renderOwnerSms(
  occasion: OwnerSmsOccasion, personality: OwnerPersonality, vars: OwnerSmsVars, seedKey: string, recent: readonly string[],
): string | null {
  const pool = OWNER_SMS_TEXTS[occasion][personality];
  if (!pool || pool.length === 0) return null;
  if (pool.some((t) => t.includes("{skore}")) && !vars.skore) return null;
  const rendered = pool.map((t) => fill(t, vars));
  const fresh = rendered.filter((t) => !recent.includes(t));
  return createRng(seedFromString(seedKey)).pick(fresh.length > 0 ? fresh : rendered);
}

type ReplyKind = "positive" | "concern" | "trouble" | "farewell";

const OCCASION_REPLY_KIND: Record<OwnerSmsOccasion, ReplyKind> = {
  match_eve: "positive",
  after_win: "positive",
  main_new: "positive",
  season_thanks: "positive",
  after_loss: "concern",
  losing_streak: "concern",
  season_complaint: "concern",
  riot: "trouble",
  scandal: "trouble",
  main_lost: "farewell",
};

const REPLY_OPTION_TEXTS: Record<ReplyKind, Record<ReplyTone, string>> = {
  positive: {
    warm: "Díky moc, vážíme si vás. Bez vás by to nešlo.",
    neutral: "Díky za zprávu.",
    dismissive: "Jo, jasně.",
  },
  concern: {
    warm: "Chápu vás. Makáme na tom a věřím, že to otočíme.",
    neutral: "Víme o tom a řešíme to.",
    dismissive: "Fotbal je fotbal, to se stává.",
  },
  trouble: {
    warm: "Mrzí mě to. Beru to vážně a zjednám pořádek.",
    neutral: "Situaci řešíme.",
    dismissive: "To se vás netýká.",
  },
  farewell: {
    warm: "Děkujeme za všechno, dveře u nás máte otevřené.",
    neutral: "Beru na vědomí, díky za spolupráci.",
    dismissive: "Tak nic, sbohem.",
  },
};

const TONE_LABELS: Record<ReplyTone, string> = { warm: "Vlídně", neutral: "Věcně", dismissive: "Odbýt" };

export interface ReplyOption {
  id: ReplyTone;
  label: string;
  text: string;
}

/** Tři hotové odpovědi trenéra. Jdou do `messages.metadata.options`, telefon z nich dělá tlačítka. */
export function replyOptions(occasion: OwnerSmsOccasion): ReplyOption[] {
  const kind = OCCASION_REPLY_KIND[occasion];
  return REPLY_TONES.map((id) => ({ id, label: TONE_LABELS[id], text: REPLY_OPTION_TEXTS[kind][id] }));
}

export const OWNER_REPLY_BACK: Record<OwnerPersonality, Record<"up" | "flat" | "down", readonly string[]>> = {
  fan: {
    up: ["To rád slyším! Jdeme dál.", "Paráda, na vás je spoleh.", "Díky, hned je mi líp."],
    flat: ["Dobře.", "Hm, tak jo.", "Beru."],
    down: ["Tak to mě mrzí. Čekal jsem víc.", "Aha. Tak nic.", "To jsem slyšet nechtěl."],
  },
  patriot: {
    up: ["Díky. Pro obec je to důležitý.", "Tak to je řeč. Držím palce.", "To rád slyším, vesnice to ocení."],
    flat: ["Dobře, uvidíme.", "Beru na vědomí.", "Tak jo."],
    down: ["Takhle se o klub nestará. Zapamatuju si to.", "To mě zklamalo.", "Škoda. Čekal jsem víc zájmu."],
  },
  businessman: {
    up: ["Výborně, to je jasná řeč.", "Děkuji, tohle potřebuji vědět.", "Dobře, s tím se dá pracovat."],
    flat: ["Rozumím.", "Beru na vědomí.", "Dobře."],
    down: ["To mi nestačí.", "S takovým přístupem těžko budeme pokračovat.", "Poznamenám si to."],
  },
  cautious: {
    up: ["Děkuji, to mě uklidnilo.", "Jsem rád, že to berete vážně.", "Dobře, věřím vám."],
    flat: ["Dobře. Uvidíme.", "Rozumím.", "Snad to tak bude."],
    down: ["To mě moc neuklidnilo.", "Tak to mám ještě větší obavy.", "Hm. Budu opatrnější."],
  },
};

/** Co majitel odepíše na trenérovu odpověď, podle toho, kam se náklonnost pohnula. */
export function ownerReplyBack(personality: OwnerPersonality, favorDelta: number, seedKey: string): string {
  const mood = favorDelta > 0 ? "up" : favorDelta < 0 ? "down" : "flat";
  return createRng(seedFromString(seedKey)).pick(OWNER_REPLY_BACK[personality][mood]);
}
