/**
 * Disciplinární rada — návrh pokuty s důkazem a přehled uložených trestů.
 *
 * Formulář nenabídne skutek, který se u daného klubu nedá doložit. Jediná
 * výjimka je nesportovní chování, kde se místo důkazu píše odůvodnění.
 */
import React from "react";
import type { DisciplineData, State } from "./types";
export declare function DisciplinePanel({ data, state, teamId, isChair, myOpen, onChanged }: {
    data: DisciplineData | null;
    state: State;
    teamId: string | null;
    isChair: boolean;
    myOpen: {
        title: string;
    } | null;
    onChanged: () => void;
}): React.JSX.Element;
//# sourceMappingURL=discipline.d.ts.map