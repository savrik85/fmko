import type { RefereeData, State } from "./types";
export declare function RefereesPanel({ data, state, teamId, myOpen, jeKomisar, onChanged }: {
    data: RefereeData | null;
    state: State;
    teamId: string | null;
    myOpen: {
        title: string;
    } | null;
    jeKomisar: boolean;
    onChanged: () => void;
}): import("react").JSX.Element;
//# sourceMappingURL=referees-panel.d.ts.map