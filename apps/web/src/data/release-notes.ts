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
    date: "2026-07-05",
    emoji: "📋",
    title: "Sponzorské smlouvy po sezónách a opravené přáteláky",
    items: [
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
