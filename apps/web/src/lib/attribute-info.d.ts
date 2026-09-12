export type AttrKey = "rat" | "spd" | "tec" | "sho" | "pas" | "hea" | "def" | "gk" | "sta" | "str" | "cond" | "mor" | "wage" | "age";
export type Pos = "GK" | "DEF" | "MID" | "FWD";
export interface AttrInfo {
    label: string;
    description: string;
    relevantFor: Pos[];
}
export declare const ATTRIBUTE_INFO: Record<AttrKey, AttrInfo>;
export declare function getTooltip(key: AttrKey): string;
//# sourceMappingURL=attribute-info.d.ts.map