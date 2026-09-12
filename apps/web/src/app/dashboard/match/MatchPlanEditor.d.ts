import { type MatchPlanRule } from "@okresni-masina/shared";
/**
 * Pokyny na lavičce — přednastavené scénáře, které engine za běhu zápasu
 * vyhodnotí sám.
 *
 * Podmínka je v UI schválně jeden select, ne dva: rozpad na „typ podmínky"
 * a „stav" by na mobilu zabral dva řádky a nic nepřidal. Rozdíl gólů a hranice
 * kondice se dopočítávají až podle zvolené podmínky.
 */
interface PlayerOption {
    id: string;
    name: string;
}
interface Props {
    plan: MatchPlanRule[];
    onChange: (plan: MatchPlanRule[]) => void;
    /** Základní jedenáctka — odtud se střídá ven. */
    starters: PlayerOption[];
    /** Zbytek kádru — odtud se střídá dovnitř. */
    bench: PlayerOption[];
}
export declare function MatchPlanEditor({ plan, onChange, starters, bench }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=MatchPlanEditor.d.ts.map