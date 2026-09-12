export type Comparison = "MUCH_WEAKER" | "WEAKER" | "EVEN" | "STRONGER" | "MUCH_STRONGER";
/** Odhad kartové bilance ze zvolené tvrdosti a povahy delegovaného sudího. */
export interface CardRisk {
    fouls: number;
    cards: number;
    reds: number;
    level: "nízké" | "střední" | "vysoké";
    /** Kolik hráčů v sestavě je jednu žlutou od stopky. */
    onEdge: number;
}
interface Props {
    teamId: string;
    matchId?: string;
    formation: string;
    tactic: string;
    hardness: string;
    captainId: string | null;
    players: Array<{
        playerId: string;
        matchPosition: string;
    }>;
    /** Predikci karet zobrazuje sestavovač u volby tvrdosti, ne tady — proto ji posíláme nahoru. */
    onCardRisk?: (risk: CardRisk | null) => void;
}
export declare function LineupPreview({ teamId, matchId, formation, tactic, hardness, captainId, players, onCardRisk }: Props): import("react").JSX.Element | null;
export {};
//# sourceMappingURL=LineupPreview.d.ts.map