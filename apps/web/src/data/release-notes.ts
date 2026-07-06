/**
 * Novinky ve hře (release notes) — statický seznam, nejnovější nahoře.
 * Nový záznam = nová položka na začátku pole; badge „Nové" v menu se řídí
 * datem nejnovějšího záznamu vs. localStorage (markNotesSeen na stránce Novinky).
 */
export interface ReleaseNote {
  date: string; // ISO datum vydání
  emoji: string;
  title: string;
  items: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    date: "2026-07-06",
    emoji: "👔",
    title: "Zaměstnanci — realizační tým klubu",
    items: [
      "Nová stránka Zaměstnanci: najmi si realizační tým. Dvanáct rolí (asistent, trenér mládeže/brankářů, kondiční trenér, masér, lékař, psycholog, správce hřiště, skaut, obsluha občerstvení, šéf fanklubu, ekonom), každou obsadíš max jedním člověkem. Nejsou povinní — jsou to bonusy.",
      "V záložce Volní je nabídka lidí z okresu (kdo dřív přijde…). Každý má sedm vlastností a profesi, ve které je nejlepší — ale najmout ho můžeš na jakoukoli roli. Jeho vlastnosti určují, jak dobrý v ní bude.",
      "Masér zvedá regeneraci, lékař hojí zranění rychleji, kondiční trenér šetří síly, asistent a trenér mládeže zrychlují tréninky, trenér brankářů kouše gólmany, psycholog drží náladu, správce se stará o trávník a vybavení, šéf fanklubu přitáhne diváky.",
      "Obsluha občerstvení (klidně i šikovná servírka — rozhoduje šarm) zvýší prodej piva a klobás. Ekonom osekne provozní náklady a vyjedná víc od sponzorů. Skaut jednou týdně tipne talent.",
      "Za peníze můžeš zaměstnance poslat na kurz a vylepšit mu konkrétní vlastnost — třeba maséra přeškolit na lékaře. Během kurzu normálně pracuje.",
      "Platí se podpisné při náboru a týdenní mzda (strhává se s ostatními mzdami). Propuštění je zdarma.",
    ],
  },
  {
    date: "2026-07-05",
    emoji: "🚐",
    title: "Sedm nových kusů vybavení",
    items: [
      "Klubová dodávka — míň omluvenek kvůli dojíždění a lepší docházka na tréninky. Od ojeté Felicie po mikrobus s logem.",
      "Posilovna v kabině (+kondice denně), tréninková zeď (+standardky), klubový gril (nálada kabiny drží výš).",
      "Kotel s bubny a vlajkami (+návštěva doma), zimní výbava lavičky (menší postih počasí), kamera a rozbory (mladíci rostou rychleji).",
      "Lékárnička konečně dělá, co slibovala: od úrovně 2 jsou nová zranění o 1-2 dny kratší.",
      "Chemie z rozlišováků a taktické tabule se nově skutečně počítá do sehranosti formace.",
    ],
  },
  {
    date: "2026-07-05",
    emoji: "🤝",
    title: "Přestupový tlak — o hvězdy se hraje",
    items: [
      "Cizí kluby z okolí nově posílají nabídky na tvoje nejlepší hráče — peníze mají připravené a nabízejí víc, než je tržní cena. Ber, nebo nech být: o ceně nejednají.",
      "U každé nabídky vidíš, jestli hráč o přestup STOJÍ — a u vlastních hráčů i proč (málo hraje, špatná nálada, silnější klub, lákavé peníze…).",
      "Odmítneš nabídku, o kterou hráč stál? Napíše ti naštvanou SMS a můžeš si to s ním vyříkat — vlastními slovy, po pár zprávách se ukáže, jak sis vedl.",
      "Nespokojený hráč chodí míň na tréninky, vymlouvá se ze zápasů a může i „záhadně“ marodit. Fyzioterapeut ti poradí, když mu zranění nesedí.",
      "Když řeči nestačí, nabídni dohodu: místo v sestavě (slib se hlídá!), vyšší odměny, nebo slib prodeje při další nabídce.",
      "Pozor: stejná pravidla platí i pro nabídky lidských soupeřů — dobře mířenou nabídkou jde rozhodit hráče cizí kabiny. A naopak.",
    ],
  },
  {
    date: "2026-07-05",
    emoji: "📋",
    title: "Sponzorské smlouvy po sezónách a opravené přáteláky",
    items: [
      "Sponzorskou smlouvu jde nově PRODLOUŽIT přímo na kartě smlouvy — stejný sponzor, podmínky podle aktuální reputace, bez přejmenování klubu a bez sankce.",
      "Sponzorské smlouvy nově s koncem sezóny ztratí sezónu platnosti — roční smlouvy vyprší a podepíšeš novou za podmínek podle své aktuální reputace. O vypršení přijde SMS.",
      "Opravené zvaní na přátelské zápasy — zápasy z minulé sezóny už neblokují nové výzvy.",
      "V nabídce soupeřů pro přáteláky už nejsou U21 týmy.",
    ],
  },
  {
    date: "2026-07-04",
    emoji: "🌴",
    title: "Volno z tréninku a přehlednější Pohár",
    items: [
      "Tréninky: vybraným hráčům můžeš dát volno z nejbližšího tréninku — neztratí kondici, ale ani se nezlepší. Po tréninku se volno samo zruší.",
      "Pohár: pavouk je konečně čitelný na mobilu a střelci mají vlastní záložku.",
      "Pohár: odměny za kola jsou přehledně srovnané a Pohár najdeš nově i v mobilním menu Více.",
      "Zpravodaj: otevírák sezóny a ohlédnutí za sezónou už z hlavní stránky nevytlačí příval přestupových zpráv.",
    ],
  },
  {
    date: "2026-07-04",
    emoji: "🎺",
    title: "Sezóna 2 odstartovala",
    items: [
      "Herní kalendář jede podle skutečného — liga se hraje v pondělí a ve čtvrtek, pohár v sobotu.",
      "Celorepublikový amatérský pohár: velkokluby z celé země, plnohodnotné zápasy a statistiky střelců.",
      "Hráči přes léto zestárli a někteří veteráni se rozloučili — mrkni na soupisku.",
    ],
  },
];

export const LATEST_NOTE_DATE = RELEASE_NOTES[0]?.date ?? "";

const NOTES_SEEN_KEY = "release_notes_seen";

/** Má hráč neprohlédnuté novinky? (SSR-safe) */
export function hasUnseenNotes(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (localStorage.getItem(NOTES_SEEN_KEY) ?? "") < LATEST_NOTE_DATE;
  } catch (e) {
    console.warn("release notes seen check:", e);
    return false;
  }
}

/** Označit novinky jako prohlédnuté (volá stránka Novinky). */
export function markNotesSeen(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NOTES_SEEN_KEY, LATEST_NOTE_DATE);
  } catch (e) {
    console.warn("release notes seen store:", e);
  }
}
