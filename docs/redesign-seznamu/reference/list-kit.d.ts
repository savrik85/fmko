import type { ReactNode } from "react";
/**
 * Stavebnice seznamů: karta se záhlavím, řádkový seznam, prázdný stav,
 * „Zobrazit další“ a drobné štítky (výsledek, skóre, hodnocení, částka).
 *
 * Tabulku s porovnáváním čísel dělá `DataTable` (data-table.tsx). Tady jsou
 * položky, na které se kliká: hráči, zápasy, nabídky, pohyby na účtu.
 *
 * Pravidla, která díly hlídají samy:
 * - řádek je vysoký nejmíň 56 px a jeho stavba je vždy stejná
 * - hlavní text se zalomí nejvýš na dva řádky, třemi tečkami končí jen podrobnosti
 * - stav řádku značí 3px proužek vlevo, ne barva podkladu
 */
export declare function ListCard({ title, count, controls, children, className }: {
    /** Nadpis verzálkami vlevo. Bez něj se záhlaví nekreslí. */
    title?: ReactNode;
    /** Počet nebo krátký údaj vedle nadpisu, např. „22 hráčů“. */
    count?: ReactNode;
    /** Přepínače a filtry vpravo. */
    controls?: ReactNode;
    children: ReactNode;
    className?: string;
}): import("react").JSX.Element;
export type RowTone = "new" | "warn" | "danger";
/** Úzký šedý nadpis skupiny řádků: den, kolo, stav. */
export declare function RowGroup({ label, aside }: {
    label: ReactNode;
    aside?: ReactNode;
}): import("react").JSX.Element;
export declare function ListRow({ href, onClick, leading, title, meta, trailing, tone, chevron, dense }: {
    /** Celý řádek je odkaz. Nepoužívat spolu s tlačítkem v `trailing`. */
    href?: string;
    onClick?: () => void;
    /** Vlevo: portrét, znak nebo `RowIcon`. Vždy 36 px. */
    leading?: ReactNode;
    /** Hlavní text. Zalomí se nejvýš na dva řádky. */
    title: ReactNode;
    /** Jeden řádek podrobností pod názvem. Smí skončit třemi tečkami. */
    meta?: ReactNode;
    /** Vpravo: hlavní číslo, štítek nebo tlačítko. */
    trailing?: ReactNode;
    tone?: RowTone;
    /** Šipka vpravo. Výchozí: ano, když je řádek klikací. */
    chevron?: boolean;
    /**
     * Hustý řádek (40 px) pro žebříčky a krátké výčty v dlaždicích: pořadí, jméno, číslo.
     * Bez šipky. Běžné seznamy ho nepoužívají.
     */
    dense?: boolean;
}): import("react").JSX.Element;
/** Ikona v šedé dlaždici pro řádky bez portrétu a znaku (pohyby na účtu, události). */
export declare function RowIcon({ children }: {
    children: ReactNode;
}): import("react").JSX.Element;
/** Hlavní hodnota vpravo s volitelným drobným popiskem pod ní. */
export declare function RowValue({ children, sub, tone }: {
    children: ReactNode;
    sub?: ReactNode;
    tone?: "plus" | "minus";
}): import("react").JSX.Element;
export declare function ListEmpty({ icon, children, action }: {
    icon?: string;
    /** Věta, co prázdný seznam znamená a co s tím. Ne „Žádná data“. */
    children: ReactNode;
    /** Tlačítko nebo odkaz s dalším krokem. */
    action?: ReactNode;
}): import("react").JSX.Element;
export declare function ShowMore({ shown, total, step, onMore }: {
    shown: number;
    total: number;
    step: number;
    onMore: () => void;
}): import("react").JSX.Element | null;
export type MatchOutcome = "W" | "D" | "L";
/** Čtvereček V / R / P do formy. */
export declare function ResultChip({ result }: {
    result: MatchOutcome;
}): import("react").JSX.Element;
/** Skóre zápasu podbarvené výsledkem. */
export declare function ScoreChip({ result, children }: {
    result: MatchOutcome;
    children: ReactNode;
}): import("react").JSX.Element;
export type RatingTone = "top" | "good" | "neutral" | "poor";
/**
 * Hodnocení hráče. Barva se NEURČUJE absolutními prahy (škála není stovková):
 * buď zůstane neutrální, nebo ji volající spočítá proti ostatním v seznamu
 * přes `ratingToneIn`.
 */
export declare function RatingPill({ value, tone }: {
    value: number | string;
    tone?: RatingTone;
}): import("react").JSX.Element;
/** Nejlepší v seznamu zlatě, nad průměrem seznamu zeleně, ostatní neutrálně. */
export declare function ratingToneIn(value: number, all: number[]): RatingTone;
/** Stavový štítek vpravo v řádku. */
export declare function StatusChip({ tone, children }: {
    tone?: "ok" | "warn" | "danger" | "neutral";
    children: ReactNode;
}): import("react").JSX.Element;
//# sourceMappingURL=list-kit.d.ts.map