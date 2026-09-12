export type TacticKey = "offensive" | "balanced" | "defensive" | "long_ball" | "possession" | "pressing";
export declare const TACTIC_INFO: Record<TacticKey, {
    label: string;
    description: string;
}>;
export declare const FORMATION_INFO: Record<string, {
    label: string;
    description: string;
    style: "offensive" | "balanced" | "defensive";
}>;
export declare function getTacticTooltip(key: TacticKey): string;
export declare function getFormationTooltip(key: string): string;
export type HardnessKey = "fair" | "normal" | "hard";
export declare const HARDNESS_INFO: Record<HardnessKey, {
    label: string;
    icon: string;
    description: string;
}>;
export declare function getHardnessTooltip(key: HardnessKey): string;
//# sourceMappingURL=tactic-info.d.ts.map