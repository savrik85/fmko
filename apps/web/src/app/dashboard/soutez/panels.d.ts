import type { BoardData, Election, GrantsData, LedgerEntry, Meeting, SponsorData, State } from "./types";
export declare function PokladnaPanel({ state, ledger }: {
    state: State;
    ledger: {
        entries: LedgerEntry[];
        summary: Array<{
            type: string;
            total: number;
        }>;
    } | null;
}): import("react").JSX.Element;
export declare function VedeniPanel({ state, elections, avatars, board, teamId, onChanged, onPost }: {
    state: State;
    elections: Election[];
    avatars: Record<string, Record<string, unknown> | null>;
    board: BoardData | null;
    teamId: string | null;
    onChanged: () => void;
    onPost: (text: string, scope: "kabinet" | "verejne") => Promise<void>;
}): import("react").JSX.Element;
/**
 * Dotace z pokladny. Rozdat jde jen volné peníze — to, co zbude po dohrání
 * rozehrané sezóny, protože odměny za umístění se platí až po posledním kole.
 */
export declare function GrantsPanel({ data, teamId, myOpen, onChanged }: {
    data: GrantsData;
    teamId: string;
    myOpen: {
        title: string;
    } | null;
    onChanged: () => void;
}): import("react").JSX.Element;
/**
 * Sponzor soutěže. Nabídky chodí v zimní přestávce, přijmout jde jednu — a soutěž
 * se tím přejmenuje, takže je to rozhodnutí na dvě třetiny hlasů.
 */
export declare function SponsorPanel({ data, teamId, onChanged }: {
    data: SponsorData;
    teamId: string | null;
    onChanged: () => void;
}): import("react").JSX.Element;
/**
 * Soukromá schránka odboru — stížnost nebo nápad adresovaný jednomu předsedovi.
 *
 * Zobrazuje se na záložce odboru. Vzkazy jsou už ořezané serverem: obyčejný klub
 * vidí jen svoje, předseda odboru a prezident vidí všechny.
 */
export declare function OdborInbox({ roleKey, roleLabel, roleAkuzativ, messages, maxLength, canPost, teamId, avatars, onPost }: {
    roleKey: string;
    roleLabel: string;
    roleAkuzativ: string;
    messages: BoardData["messages"];
    maxLength: number;
    canPost: boolean;
    teamId: string | null;
    avatars: Record<string, Record<string, unknown> | null>;
    onPost: (text: string) => Promise<void>;
}): import("react").JSX.Element;
export declare function ZapisyPanel({ meetings }: {
    meetings: Meeting[];
}): import("react").JSX.Element;
//# sourceMappingURL=panels.d.ts.map