export interface FanLeaderView {
    id: string;
    name: string;
    nickname: string | null;
    age: number;
    occupation: string;
    archetype: string;
    archetypeLabel: string;
    bio: string;
    hlaska: string;
    sentiment: number;
    duvod: string | null;
    charisma: number;
    radikalnost: number;
    vyjednavani: number;
    avatar: Record<string, unknown> | null;
}
export interface FanActionVariant {
    key: string;
    label: string;
    cost: number;
}
export interface FanActionView {
    action: string;
    label: string;
    popis: string;
    cost: number;
    cooldownDnu: number;
    variants: FanActionVariant[];
    available: boolean;
    blockedReason?: string;
}
export interface FanGroupView {
    id: string;
    kind: string;
    kindLabel: string;
    popis: string;
    name: string;
    size: number;
    mood: number;
    moodWord: string;
    heat: number;
    heatWord: string;
    passion: number;
    aggression: number;
    loyalty: number;
    spending: number;
    noise: number;
    sector: string;
    sectorLabel: string;
    sectorClosed: boolean;
    closedMatches: number;
    ticketDiscount: number;
    leader: FanLeaderView | null;
    options: FanActionView[];
}
export interface FanIncidentView {
    id: string;
    matchId: string | null;
    groupId: string | null;
    kind: string;
    severity: number;
    minute: number | null;
    text: string;
    fine: number;
    sectorClosedMatches: number;
    fansLost: number;
    gameDate: string | null;
    createdAt: string;
}
export interface FanClubEventView {
    kind: string;
    label: string;
    detail: string | null;
    severity: number;
    gameDate: string;
}
export interface FanGroupsData {
    groups: FanGroupView[];
    recentIncidents: FanIncidentView[];
    recentEvents: FanClubEventView[];
    securityLevel: number;
    securityLabel: string;
    gameDate: string;
}
export declare function FanGroupsPanel({ data, teamId, onChanged }: {
    data: FanGroupsData;
    teamId: string;
    onChanged: () => Promise<void> | void;
}): import("react").JSX.Element;
//# sourceMappingURL=FanGroupsPanel.d.ts.map